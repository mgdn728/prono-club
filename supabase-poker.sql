-- PronoClub : poker en face à face (Texas Hold'em, le gagnant prend tout)
-- À exécuter une fois dans Supabase > SQL Editor (après supabase-amis.sql).
-- Les cartes sont distribuées et gardées par le serveur : un joueur ne voit jamais celles de l'autre avant l'abattage.

create table if not exists public.poker_parties (
  id bigint generated always as identity primary key,
  a_id bigint not null references public.joueurs(id) on delete cascade,  -- celui qui invite
  b_id bigint not null references public.joueurs(id) on delete cascade,
  mise integer not null check (mise > 0),
  statut text not null default 'invite' check (statut in ('invite','refusee','annulee','expiree','en_cours','finie')),
  cree_le timestamptz not null default now(),
  ja integer not null default 0, jb integer not null default 0,          -- jetons (hors mises du tour)
  ba integer not null default 0, bb integer not null default 0,          -- mises du tour en cours
  ca text[], cb text[], tapis text[],                                    -- cartes des joueurs, 5 cartes du milieu
  phase text not null default 'attente',                                 -- preflop, flop, turn, river, fin
  pot integer not null default 0,
  tour text, bouton text not null default 'b',
  main integer not null default 0, blind integer not null default 2, relance integer not null default 2,
  parle_a boolean not null default false, parle_b boolean not null default false,
  to_a integer not null default 0, to_b integer not null default 0,     -- temps dépassés de suite
  action_le timestamptz not null default now(), fin_main_le timestamptz,
  res jsonb, seq integer not null default 0,
  gagnant text, gain_a integer not null default 0, gain_b integer not null default 0,
  paye_a boolean not null default false, paye_b boolean not null default false
);
create index if not exists poker_a_idx on public.poker_parties (a_id, statut);
create index if not exists poker_b_idx on public.poker_parties (b_id, statut);
alter table public.poker_parties enable row level security;
revoke all on public.poker_parties from anon, authenticated;

-- ---------- Valeur d'une main ----------
create or replace function public.pk_eval5(c text[]) returns bigint
language plpgsql immutable as $$
declare r int[]; i int; fl boolean; st boolean := false; hi int; g int[]; cat int; s bigint; x int;
begin
  select array_agg(q.rg order by q.rg desc) into r from (select position(substr(v, 1, 1) in '23456789TJQKA') + 1 as rg from unnest(c) v) q;
  fl := (select count(distinct substr(v, 2, 1)) from unnest(c) v) = 1;
  if (select count(distinct v) from unnest(r) v) = 5 then
    if r[1] - r[5] = 4 then st := true; hi := r[1];
    elsif r = array[14, 5, 4, 3, 2] then st := true; hi := 5; end if;
  end if;
  -- cartes triées par (nombre d'exemplaires, valeur)
  select array_agg(v order by n desc, v desc), array_agg(n order by n desc, v desc) into r, g
    from (select v, count(*)::int n from unnest(r) v group by v) t;
  cat := case when st and fl then 8 when g[1] = 4 then 7 when g[1] = 3 and g[2] = 2 then 6 when fl then 5 when st then 4
              when g[1] = 3 then 3 when g[1] = 2 and g[2] = 2 then 2 when g[1] = 2 then 1 else 0 end;
  s := cat;
  if st then return s * 759375 + hi * 50625; end if;
  for i in 1..5 loop x := coalesce(r[i], 0); s := s * 15 + x; end loop;
  return s;
end $$;

create or replace function public.pk_eval7(c text[]) returns bigint
language plpgsql immutable as $$
declare i int; j int; best bigint := -1; v bigint; h text[]; k int;
begin
  for i in 1..6 loop for j in (i + 1)..7 loop
    h := '{}';
    for k in 1..7 loop if k <> i and k <> j then h := h || c[k]; end if; end loop;
    v := public.pk_eval5(h);
    if v > best then best := v; end if;
  end loop; end loop;
  return best;
end $$;

-- ---------- Outils internes ----------
-- Retire des pièces à un joueur (son appli doit avoir sauvegardé juste avant)
create or replace function public.pk_debiter(p_id bigint, p_montant integer) returns integer
language plpgsql security definer set search_path = public as $$
declare m public.joueurs; auj text; solde integer;
begin
  select * into m from public.joueurs where id = p_id for update;
  auj := to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD');
  if coalesce(m.etat->>'day', '') <> auj then raise exception 'resync'; end if;
  solde := coalesce((m.etat->>'coins')::int, 0);
  if p_montant > solde then raise exception 'pas_assez'; end if;
  update public.joueurs
     set etat = jsonb_set(jsonb_set(m.etat, '{coins}', to_jsonb(solde - p_montant)), '{updated}',
                          to_jsonb((extract(epoch from now()) * 1000)::bigint)), maj_le = now()
   where id = p_id;
  return solde - p_montant;
end $$;

-- Fin de partie : g = 'a' ou 'b'
create or replace function public.pk_finir(p_id bigint, g text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.poker_parties
     set statut = 'finie', gagnant = g, phase = 'fin', seq = seq + 1,
         gain_a = case when g = 'a' then mise * 2 else 0 end,
         gain_b = case when g = 'b' then mise * 2 else 0 end
   where id = p_id;
end $$;

-- Nouvelle main
create or replace function public.pk_main(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p public.poker_parties; d text[]; bt text; gb integer; pb integer; n integer; sa integer; sb integer;
begin
  select * into p from public.poker_parties where id = p_id for update;
  if p.ja <= 0 then perform public.pk_finir(p_id, 'b'); return; end if;
  if p.jb <= 0 then perform public.pk_finir(p_id, 'a'); return; end if;
  n := p.main + 1;
  bt := case when p.bouton = 'a' then 'b' else 'a' end;
  -- grosse blind : mise/25 au départ, doublée toutes les 5 mains
  gb := greatest(2, (p.mise / 50) * 2) * (2 ^ least((n - 1) / 5, 12))::int;
  pb := gb / 2;
  select array_agg(v order by random()) into d from (
    select r || s as v from unnest(string_to_array('2,3,4,5,6,7,8,9,T,J,Q,K,A', ',')) r, unnest(array['s','h','d','c']) s) t;
  -- le bouton paie la petite blind et parle en premier avant le flop
  if bt = 'a' then sa := least(pb, p.ja); sb := least(gb, p.jb); else sb := least(pb, p.jb); sa := least(gb, p.ja); end if;
  update public.poker_parties
     set main = n, bouton = bt, blind = gb, relance = gb,
         ca = d[1:2], cb = d[3:4], tapis = d[5:9],
         phase = 'preflop', pot = 0, ba = sa, bb = sb, ja = p.ja - sa, jb = p.jb - sb,
         tour = bt, parle_a = false, parle_b = false, action_le = now(), fin_main_le = null, res = null, seq = seq + 1
   where id = p_id;
  perform public.pk_suite(p_id);
end $$;

-- Abattage ou fin de main
create or replace function public.pk_fin_main(p_id bigint, p_couche text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.poker_parties; va bigint; vb bigint; g text; tot integer; nb integer;
begin
  select * into p from public.poker_parties where id = p_id for update;
  tot := p.pot + p.ba + p.bb;
  if p_couche is not null then
    g := case when p_couche = 'a' then 'b' else 'a' end;
    nb := case p.phase when 'preflop' then 0 when 'flop' then 3 when 'turn' then 4 else 5 end;
  else
    va := public.pk_eval7(p.ca || p.tapis); vb := public.pk_eval7(p.cb || p.tapis);
    g := case when va > vb then 'a' when vb > va then 'b' else 'x' end;
    nb := 5;
  end if;
  update public.poker_parties
     set ja = ja + case when g = 'a' then tot when g = 'x' then tot / 2 + tot % 2 else 0 end,
         jb = jb + case when g = 'b' then tot when g = 'x' then tot / 2 else 0 end,
         pot = 0, ba = 0, bb = 0, phase = 'fin', tour = null, fin_main_le = now(), seq = seq + 1,
         res = jsonb_build_object('g', g, 'pot', tot, 'couche', p_couche, 'nb', nb)
   where id = p_id;
end $$;

-- Après une action : le tour de mises est-il fini ?
create or replace function public.pk_suite(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p public.poker_parties; clos boolean; x integer; nph text;
begin
  select * into p from public.poker_parties where id = p_id for update;
  clos := (p.ba = p.bb and p.parle_a and p.parle_b)
       or (p.ba < p.bb and p.ja = 0) or (p.bb < p.ba and p.jb = 0)
       or (p.ba = p.bb and (p.ja = 0 or p.jb = 0) and (p.parle_a or p.parle_b))
       or (p.ja = 0 and p.jb = 0);
  if not clos then return; end if;
  -- on rend le surplus à celui qui a misé plus que le tapis de l'autre
  if p.ba > p.bb then x := p.ba - p.bb; p.ja := p.ja + x; p.ba := p.bb;
  elsif p.bb > p.ba then x := p.bb - p.ba; p.jb := p.jb + x; p.bb := p.ba; end if;
  p.pot := p.pot + p.ba + p.bb;
  if p.ja = 0 or p.jb = 0 or p.phase = 'river' then
    update public.poker_parties set ja = p.ja, jb = p.jb, ba = 0, bb = 0, pot = p.pot where id = p_id;
    perform public.pk_fin_main(p_id, null);
    return;
  end if;
  nph := case p.phase when 'preflop' then 'flop' when 'flop' then 'turn' else 'river' end;
  update public.poker_parties
     set ja = p.ja, jb = p.jb, ba = 0, bb = 0, pot = p.pot, phase = nph, relance = blind,
         parle_a = false, parle_b = false, action_le = now(), seq = seq + 1,
         tour = case when bouton = 'a' then 'b' else 'a' end   -- après le flop, le bouton parle en dernier
   where id = p_id;
end $$;

-- Joue une action pour le joueur w ('a' ou 'b')
create or replace function public.pk_jouer(p_id bigint, w text, p_act text, p_montant integer) returns void
language plpgsql security definer set search_path = public as $$
declare p public.poker_parties; me integer; ms integer; ob integer; os integer; x integer; act text := p_act; cible integer;
begin
  select * into p from public.poker_parties where id = p_id for update;
  if p.statut <> 'en_cours' or p.phase = 'fin' or p.tour is distinct from w then raise exception 'pas_ton_tour'; end if;
  if w = 'a' then me := p.ba; ms := p.ja; ob := p.bb; os := p.jb; else me := p.bb; ms := p.jb; ob := p.ba; os := p.ja; end if;
  if act = 'fold' then perform public.pk_fin_main(p_id, w); return; end if;
  if act = 'allin' then act := 'raise'; cible := me + ms; else cible := p_montant; end if;
  if act = 'raise' and (cible is null or cible <= ob or os = 0) then act := case when ob > me then 'call' else 'check' end; end if;
  if act = 'check' then
    if ob > me then raise exception 'action_invalide'; end if;
    x := 0;
  elsif act = 'call' then
    if ob <= me then raise exception 'action_invalide'; end if;
    x := least(ob - me, ms);
  elsif act = 'raise' then
    cible := least(cible, me + ms);
    if cible - ob < p.relance and cible < me + ms then raise exception 'relance_min'; end if;
    x := cible - me;
    p.relance := greatest(p.relance, cible - ob);
    if w = 'a' then p.parle_b := false; else p.parle_a := false; end if;
  else raise exception 'action_invalide'; end if;
  if w = 'a' then
    update public.poker_parties set ba = ba + x, ja = ja - x, parle_a = true, parle_b = p.parle_b, relance = p.relance,
           tour = 'b', action_le = now(), seq = seq + 1 where id = p_id;
  else
    update public.poker_parties set bb = bb + x, jb = jb - x, parle_b = true, parle_a = p.parle_a, relance = p.relance,
           tour = 'a', action_le = now(), seq = seq + 1 where id = p_id;
  end if;
  perform public.pk_suite(p_id);
end $$;

-- Fait avancer la partie toute seule : temps dépassé, main suivante, invitation expirée
create or replace function public.pk_avancer(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p public.poker_parties; n integer; d interval;
begin
  select * into p from public.poker_parties where id = p_id for update;
  if not found then return; end if;
  if p.statut = 'invite' and now() > p.cree_le + interval '2 minutes' then
    update public.poker_parties set statut = 'expiree', gain_a = mise, seq = seq + 1 where id = p_id; return;
  end if;
  if p.statut <> 'en_cours' then return; end if;
  if p.phase = 'fin' then
    d := case when p.res->>'couche' is null then interval '6 seconds' else interval '3 seconds' end;
    if now() > p.fin_main_le + d then
      perform public.pk_main(p_id);
    end if;
    return;
  end if;
  if now() > p.action_le + interval '30 seconds' then
    n := case when p.tour = 'a' then p.to_a else p.to_b end + 1;
    if n >= 3 then perform public.pk_finir(p_id, case when p.tour = 'a' then 'b' else 'a' end); return; end if;
    if p.tour = 'a' then update public.poker_parties set to_a = n where id = p_id;
    else update public.poker_parties set to_b = n where id = p_id; end if;
    perform public.pk_jouer(p_id, p.tour, case when (p.tour = 'a' and p.bb > p.ba) or (p.tour = 'b' and p.ba > p.bb) then 'fold' else 'check' end, null);
  end if;
end $$;

-- Ce que voit un joueur
create or replace function public.pk_vue(p_id bigint, p_moi bigint) returns json
language plpgsql security definer set search_path = public as $$
declare p public.poker_parties; w text; o public.joueurs; nb integer; montre boolean;
begin
  select * into p from public.poker_parties where id = p_id;
  w := case when p.a_id = p_moi then 'a' else 'b' end;
  select * into o from public.joueurs where id = case when w = 'a' then p.b_id else p.a_id end;
  nb := case p.phase when 'preflop' then 0 when 'flop' then 3 when 'turn' then 4 when 'river' then 5
        when 'fin' then coalesce((p.res->>'nb')::int, 0) else 0 end;
  montre := p.phase = 'fin' and p.res is not null and p.res->>'couche' is null;
  return json_build_object(
    'id', p.id, 'seq', p.seq, 'statut', p.statut, 'mise', p.mise, 'adv', o.pseudo,
    'deco', json_build_object('c', o.etat->>'nameFx', 'f', o.etat->>'frame', 't', o.etat->>'title'),
    'invite_par_moi', w = 'a', 'main', p.main, 'blind', p.blind, 'phase', p.phase, 'pot', p.pot,
    'bouton', p.bouton = w, 'tour', case when p.tour is null then null when p.tour = w then 'moi' else 'adv' end,
    'jetons', case when w = 'a' then p.ja else p.jb end, 'jetons_adv', case when w = 'a' then p.jb else p.ja end,
    'mise_tour', case when w = 'a' then p.ba else p.bb end, 'mise_adv', case when w = 'a' then p.bb else p.ba end,
    'cartes', case when w = 'a' then p.ca else p.cb end,
    'cartes_adv', case when montre then case when w = 'a' then p.cb else p.ca end else null end,
    'tapis', case when nb > 0 then p.tapis[1:nb] else '{}'::text[] end,
    'relance', p.relance,
    'reste', greatest(0, 30 - extract(epoch from now() - p.action_le))::int,
    'res', case when p.res is null then null else json_build_object(
        'g', case when p.res->>'g' = 'x' then 'x' when p.res->>'g' = w then 'moi' else 'adv' end,
        'pot', (p.res->>'pot')::int, 'couche', case when p.res->>'couche' is null then null when p.res->>'couche' = w then 'moi' else 'adv' end) end,
    'gagnant', case when p.gagnant is null then null when p.gagnant = w then 'moi' else 'adv' end);
end $$;

revoke all on function public.pk_debiter(bigint, integer), public.pk_finir(bigint, text), public.pk_main(bigint),
  public.pk_fin_main(bigint, text), public.pk_suite(bigint), public.pk_jouer(bigint, text, text, integer),
  public.pk_avancer(bigint), public.pk_vue(bigint, bigint) from public, anon, authenticated;

-- ---------- Fonctions appelées par l'appli ----------
-- Inviter un joueur (la mise est retirée tout de suite, rendue si refus ou sans réponse)
create or replace function public.poker_inviter(p_token uuid, p_pseudo text, p_mise integer)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; o public.joueurs; r record; reste integer; nid bigint;
begin
  m := public.ami_moi(p_token); o := public.ami_autre(p_pseudo);
  if m.id = o.id then raise exception 'soi_meme'; end if;
  if p_mise is null or p_mise < 50 or p_mise > 100000 then raise exception 'mise_invalide'; end if;
  for r in select id from public.poker_parties where statut in ('invite', 'en_cours') and (a_id in (m.id, o.id) or b_id in (m.id, o.id)) loop
    perform public.pk_avancer(r.id);
  end loop;
  if exists (select 1 from public.poker_parties where statut in ('invite', 'en_cours') and (a_id = m.id or b_id = m.id)) then raise exception 'deja_en_jeu'; end if;
  if exists (select 1 from public.poker_parties where statut in ('invite', 'en_cours') and (a_id = o.id or b_id = o.id)) then raise exception 'adv_occupe'; end if;
  reste := public.pk_debiter(m.id, p_mise);
  insert into public.poker_parties (a_id, b_id, mise) values (m.id, o.id, p_mise) returning id into nid;
  perform public.ami_notif(o.id, '🃏 ' || m.pseudo || ' vous défie au poker', 'Mise : ' || p_mise || ' pièces chacun. Répondez vite, le défi expire dans 2 minutes !', '?poker');
  return json_build_object('id', nid, 'pieces', reste);
end $$;

-- Accepter ou refuser
create or replace function public.poker_repondre(p_token uuid, p_id bigint, p_ok boolean)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; p public.poker_parties; reste integer;
begin
  m := public.ami_moi(p_token);
  perform public.pk_avancer(p_id);
  select * into p from public.poker_parties where id = p_id and b_id = m.id for update;
  if not found or p.statut <> 'invite' then raise exception 'plus_dispo'; end if;
  if not p_ok then
    update public.poker_parties set statut = 'refusee', gain_a = mise, seq = seq + 1 where id = p_id;
    return json_build_object('id', p_id, 'pieces', null);
  end if;
  reste := public.pk_debiter(m.id, p.mise);
  update public.poker_parties set statut = 'en_cours', ja = mise, jb = mise, seq = seq + 1 where id = p_id;
  perform public.pk_main(p_id);
  return json_build_object('id', p_id, 'pieces', reste);
end $$;

-- Annuler mon invitation
create or replace function public.poker_annuler(p_token uuid, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.joueurs;
begin
  m := public.ami_moi(p_token);
  update public.poker_parties set statut = 'annulee', gain_a = mise, seq = seq + 1 where id = p_id and a_id = m.id and statut = 'invite';
end $$;

-- Où j'en suis : défis reçus, défi envoyé, partie en cours
create or replace function public.poker_moi(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r record; res json;
begin
  m := public.ami_moi(p_token);
  for r in select id from public.poker_parties where statut in ('invite', 'en_cours') and (a_id = m.id or b_id = m.id) loop
    perform public.pk_avancer(r.id);
  end loop;
  select json_build_object(
    'recus', coalesce((select json_agg(json_build_object('id', p.id, 'de', j.pseudo, 'mise', p.mise,
               'reste', greatest(0, 120 - extract(epoch from now() - p.cree_le))::int) order by p.id)
             from public.poker_parties p join public.joueurs j on j.id = p.a_id where p.b_id = m.id and p.statut = 'invite'), '[]'::json),
    'envoye', (select json_build_object('id', p.id, 'a', j.pseudo, 'mise', p.mise)
             from public.poker_parties p join public.joueurs j on j.id = p.b_id where p.a_id = m.id and p.statut = 'invite' limit 1),
    'partie', (select p.id from public.poker_parties p where p.statut = 'en_cours' and (p.a_id = m.id or p.b_id = m.id) limit 1),
    'a_encaisser', exists (select 1 from public.poker_parties p where (p.a_id = m.id and p.gain_a > 0 and not p.paye_a) or (p.b_id = m.id and p.gain_b > 0 and not p.paye_b))
  ) into res;
  return res;
end $$;

-- État de la partie (null si rien n'a changé depuis p_seq)
create or replace function public.poker_etat(p_token uuid, p_id bigint, p_seq integer default -1)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; p public.poker_parties;
begin
  m := public.ami_moi(p_token);
  perform public.pk_avancer(p_id);
  select * into p from public.poker_parties where id = p_id and (a_id = m.id or b_id = m.id);
  if not found then raise exception 'partie_inconnue'; end if;
  if p.seq = p_seq then return json_build_object('seq', p.seq, 'reste', greatest(0, 30 - extract(epoch from now() - p.action_le))::int, 'pareil', true); end if;
  return public.pk_vue(p_id, m.id);
end $$;

-- Jouer : fold, check, call, raise (p_montant = mise totale du tour), allin
create or replace function public.poker_action(p_token uuid, p_id bigint, p_act text, p_montant integer default null)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; p public.poker_parties; w text;
begin
  m := public.ami_moi(p_token);
  perform public.pk_avancer(p_id);
  select * into p from public.poker_parties where id = p_id and (a_id = m.id or b_id = m.id) for update;
  if not found then raise exception 'partie_inconnue'; end if;
  w := case when p.a_id = m.id then 'a' else 'b' end;
  if w = 'a' then update public.poker_parties set to_a = 0 where id = p_id; else update public.poker_parties set to_b = 0 where id = p_id; end if;
  perform public.pk_jouer(p_id, w, p_act, p_montant);
  return public.pk_vue(p_id, m.id);
end $$;

-- Abandonner : l'autre gagne tout
create or replace function public.poker_quitter(p_token uuid, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.joueurs; p public.poker_parties;
begin
  m := public.ami_moi(p_token);
  select * into p from public.poker_parties where id = p_id and (a_id = m.id or b_id = m.id) and statut = 'en_cours' for update;
  if not found then return; end if;
  perform public.pk_finir(p_id, case when p.a_id = m.id then 'b' else 'a' end);
end $$;

-- Récupérer mes pièces (gains, mises rendues) : une seule fois
create or replace function public.poker_encaisser(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  m := public.ami_moi(p_token);
  with x as (
    update public.poker_parties set paye_a = true where a_id = m.id and gain_a > 0 and not paye_a returning id, gain_a as gain, statut, b_id as adv
  ), y as (
    update public.poker_parties set paye_b = true where b_id = m.id and gain_b > 0 and not paye_b returning id, gain_b as gain, statut, a_id as adv
  )
  select json_agg(json_build_object('gain', t.gain, 'statut', t.statut, 'adv', j.pseudo)) into r
    from (select * from x union all select * from y) t join public.joueurs j on j.id = t.adv;
  return coalesce(r, '[]'::json);
end $$;

grant execute on function public.poker_inviter(uuid, text, integer), public.poker_repondre(uuid, bigint, boolean),
  public.poker_annuler(uuid, bigint), public.poker_moi(uuid), public.poker_etat(uuid, bigint, integer),
  public.poker_action(uuid, bigint, text, integer), public.poker_quitter(uuid, bigint), public.poker_encaisser(uuid) to anon, authenticated;
