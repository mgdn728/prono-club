-- PronoClub : niveaux et badges visibles, saisons mensuelles, tendances des joueurs,
-- réactions dans le fil, duels sur un match, tournoi poker du dimanche, alertes de classement.
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS : supabase-amis.sql, supabase-poker.sql,
-- supabase-semaine.sql et supabase-activite.sql.

-- ---------- 1. Niveau et badges visibles par les autres ----------
create or replace function public.deco_de(e jsonb) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    't', left(e->>'title', 30), 'c', left(e->>'nameFx', 20), 'f', left(e->>'frame', 20),
    'l', case when (e->>'lv') ~ '^[0-9]{1,3}$' then (e->>'lv')::int end,
    'g', case when jsonb_typeof(e->'badges') = 'array' then (select jsonb_agg(left(x #>> '{}', 14)) from (select x from jsonb_array_elements(e->'badges') x limit 40) s) end))
$$;

-- ---------- 2. Saisons (classement du mois) ----------
alter table public.joueurs add column if not exists mois text;
alter table public.joueurs add column if not exists mensuel integer not null default 0;
alter table public.joueurs add column if not exists rang_sem integer;
create or replace function public.mois_actuel() returns text
language sql stable as $$ select to_char(now() at time zone 'Europe/Paris', 'YYYY-MM') $$;

create or replace function public.score_mois() returns trigger
language plpgsql as $$
declare m text := public.mois_actuel();
begin
  if new.etat is not null then
    if new.etat->'month'->>'id' = m then
      if new.mois is distinct from m then
        if new.mois is not null and coalesce(old.mensuel, 0) > 0 then
          insert into public.mensuel_archive (mois, joueur_id, mensuel) values (old.mois, old.id, old.mensuel)
          on conflict (mois, joueur_id) do update set mensuel = greatest(public.mensuel_archive.mensuel, excluded.mensuel);
        end if;
      end if;
      new.mois := m; new.mensuel := coalesce((new.etat->'month'->>'earned')::numeric, 0)::int;
    elsif new.mois is distinct from m and new.mois is not null then
      if coalesce(old.mensuel, 0) > 0 then
        insert into public.mensuel_archive (mois, joueur_id, mensuel) values (old.mois, old.id, old.mensuel)
        on conflict (mois, joueur_id) do update set mensuel = greatest(public.mensuel_archive.mensuel, excluded.mensuel);
      end if;
      new.mois := m; new.mensuel := 0;
    end if;
  end if;
  return new;
end $$;
create table if not exists public.mensuel_archive (mois text not null, joueur_id bigint not null references public.joueurs(id) on delete cascade, mensuel integer not null, primary key (mois, joueur_id));
create table if not exists public.saison_recompenses (mois text not null, rang integer not null, joueur_id bigint not null references public.joueurs(id) on delete cascade,
  score integer not null, montant integer not null, recu boolean not null default false, primary key (mois, rang));
create table if not exists public.saisons_reglees (mois text primary key, regle_le timestamptz not null default now());
create table if not exists public.saison_debut (id integer primary key default 1 check (id = 1), mois text not null);
insert into public.saison_debut (mois) values (public.mois_actuel()) on conflict (id) do nothing;
alter table public.mensuel_archive enable row level security; alter table public.saison_recompenses enable row level security;
alter table public.saisons_reglees enable row level security; alter table public.saison_debut enable row level security;
revoke all on public.mensuel_archive, public.saison_recompenses, public.saisons_reglees, public.saison_debut from anon, authenticated;
drop trigger if exists score_mois on public.joueurs;
create trigger score_mois before update on public.joueurs for each row execute function public.score_mois();

create or replace function public.classement_saison()
returns table (pseudo text, mensuel integer, gagnes integer, deco jsonb)
language sql security definer set search_path = public as $$
  select j.pseudo, j.mensuel, j.gagnes, public.deco_de(j.etat) from public.joueurs j
   where j.mois = public.mois_actuel() and j.mensuel > 0
   order by j.mensuel desc, j.gagnes desc, j.cree_le asc limit 50;
$$;

create or replace function public.regler_saisons() returns void
language plpgsql security definer set search_path = public as $$
declare w text; deb text; cur text := public.mois_actuel(); r record; n integer; gains integer[] := array[20000, 10000, 5000];
begin
  perform pg_advisory_xact_lock(484848);
  select mois into deb from public.saison_debut where id = 1;
  for w in select distinct s from (select mois as s from public.mensuel_archive union select mois from public.joueurs where mois is not null and mensuel > 0) t
           where s < cur and s >= coalesce(deb, cur) and s not in (select mois from public.saisons_reglees) order by s loop
    n := 0;
    for r in select x.joueur_id, max(x.sc) sc from (select joueur_id, mensuel sc from public.mensuel_archive where mois = w
               union all select id, mensuel from public.joueurs where mois = w and mensuel > 0) x
               join public.joueurs j on j.id = x.joueur_id group by x.joueur_id, j.gagnes, j.cree_le
             having max(x.sc) > 0 order by max(x.sc) desc, j.gagnes desc, j.cree_le asc limit 3 loop
      n := n + 1;
      insert into public.saison_recompenses (mois, rang, joueur_id, score, montant) values (w, n, r.joueur_id, r.sc, gains[n]) on conflict do nothing;
      begin perform public.ami_notif(r.joueur_id, '🏆 Saison terminée : tu finis ' || case n when 1 then '1er' else n || 'e' end || ' !',
        'Tu gagnes ' || gains[n] || ' pièces. Ouvre PronoClub pour les récupérer.', '?classement'); exception when others then null; end;
      begin insert into public.activites (joueur_id, type, data) values (r.joueur_id, 'saison', jsonb_build_object('rang', n, 'gain', gains[n], 'mois', w));
      exception when others then null; end;
    end loop;
    insert into public.saisons_reglees (mois) values (w) on conflict do nothing;
  end loop;
end $$;
create or replace function public.saison_recevoir(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs := public.ami_moi(p_token); r json;
begin
  perform public.regler_saisons();
  with c as (update public.saison_recompenses set recu = true where joueur_id = m.id and not recu returning mois, rang, montant)
  select json_agg(json_build_object('mois', mois, 'rang', rang, 'montant', montant)) into r from c;
  return coalesce(r, '[]'::json);
end $$;
revoke all on function public.regler_saisons() from public, anon, authenticated;

-- ---------- 3. Tendances : ce que les joueurs ont choisi ----------
create or replace function public.tendances(p_ids text[])
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('m', m, 'k', k, 'o', o, 'n', n)), '[]'::json) from (
    select s->>'matchId' m, s->>'mk' k, s->>'opt' o, count(distinct j.id)::int n
      from public.joueurs j, jsonb_array_elements(coalesce(j.etat->'bets', '[]'::jsonb)) b, jsonb_array_elements(coalesce(b->'sels', '[]'::jsonb)) s
     where j.maj_le > now() - interval '4 days' and s->>'matchId' = any(p_ids) and coalesce(array_length(p_ids, 1), 0) <= 80
     group by 1, 2, 3) t;
$$;

-- ---------- 4. Réactions dans le fil ----------
create table if not exists public.reactions (
  activite_id bigint not null references public.activites(id) on delete cascade,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '👏', '😂')),
  primary key (activite_id, joueur_id));
alter table public.reactions enable row level security;
revoke all on public.reactions from anon, authenticated;

create or replace function public.reagir(p_token uuid, p_act bigint, p_emoji text)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs := public.ami_moi(p_token); a public.activites; old text;
begin
  select * into a from public.activites where id = p_act;
  if not found then raise exception 'introuvable'; end if;
  select emoji into old from public.reactions where activite_id = p_act and joueur_id = m.id;
  if old = p_emoji then delete from public.reactions where activite_id = p_act and joueur_id = m.id;
  else
    insert into public.reactions (activite_id, joueur_id, emoji) values (p_act, m.id, p_emoji)
    on conflict (activite_id, joueur_id) do update set emoji = excluded.emoji;
    if old is null and a.joueur_id <> m.id then
      perform public.ami_notif(a.joueur_id, p_emoji || ' ' || m.pseudo || ' a réagi à ton exploit', 'Ouvre le fil d''activité pour voir.', '?fil');
    end if;
  end if;
  return (select json_build_object('r', coalesce(json_object_agg(emoji, n), '{}'::json)) from (select emoji, count(*) n from public.reactions where activite_id = p_act group by emoji) t);
end $$;

create or replace function public.activites_fil(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  select * into m from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  select coalesce(json_agg(t order by t.ts desc), '[]'::json) into r from (
    select a.id, j.pseudo, public.deco_de(j.etat) as deco, a.type, a.data, (extract(epoch from a.cree_le) * 1000)::bigint as ts, j.id = m.id as moi,
           (select coalesce(json_object_agg(emoji, n), '{}'::json) from (select emoji, count(*) n from public.reactions x where x.activite_id = a.id group by emoji) q) as r,
           (select emoji from public.reactions x where x.activite_id = a.id and x.joueur_id = m.id) as mr
      from public.activites a join public.joueurs j on j.id = a.joueur_id
     where a.cree_le > now() - interval '7 days'
       and (a.joueur_id = m.id or exists (select 1 from public.amis x where x.statut = 'ok'
             and ((x.demandeur_id = m.id and x.receveur_id = a.joueur_id) or (x.receveur_id = m.id and x.demandeur_id = a.joueur_id))))
     order by a.cree_le desc limit 60) t;
  return r;
end $$;

-- ---------- 5. Duels sur un match ----------
create table if not exists public.duels (
  id bigint generated always as identity primary key,
  a_id bigint not null references public.joueurs(id) on delete cascade,
  b_id bigint not null references public.joueurs(id) on delete cascade,
  match_id text not null, match_label text not null, ko timestamptz not null,
  choix text not null check (choix in ('1', 'N', '2')), choix_label text not null,
  mise integer not null check (mise > 0),
  statut text not null default 'invite' check (statut in ('invite', 'refuse', 'annule', 'expire', 'accepte', 'gagne_a', 'gagne_b', 'rembourse')),
  score text, cree_le timestamptz not null default now(),
  gain_a integer not null default 0, gain_b integer not null default 0,
  paye_a boolean not null default false, paye_b boolean not null default false);
create index if not exists duels_a_idx on public.duels (a_id, statut);
create index if not exists duels_b_idx on public.duels (b_id, statut);
alter table public.duels enable row level security;
revoke all on public.duels from anon, authenticated;

create or replace function public.duel_debiter(p_id bigint, p_montant integer) returns integer
language plpgsql security definer set search_path = public as $$
declare m public.joueurs; auj text; solde integer;
begin
  select * into m from public.joueurs where id = p_id for update;
  auj := to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD');
  if coalesce(m.etat->>'day', '') <> auj then raise exception 'resync'; end if;
  solde := coalesce((m.etat->>'coins')::int, 0);
  if p_montant > solde then raise exception 'pas_assez'; end if;
  update public.joueurs set etat = jsonb_set(jsonb_set(m.etat, '{coins}', to_jsonb(solde - p_montant)), '{updated}',
         to_jsonb((extract(epoch from now()) * 1000)::bigint)), maj_le = now() where id = p_id;
  return solde - p_montant;
end $$;
revoke all on function public.duel_debiter(bigint, integer) from public, anon, authenticated;

create or replace function public.duel_expirer() returns void
language sql security definer set search_path = public as $$
  update public.duels set statut = 'expire', gain_a = mise where statut = 'invite' and ko < now();
$$;

create or replace function public.duel_proposer(p_token uuid, p_pseudo text, p_match text, p_label text, p_ko timestamptz, p_choix text, p_choix_label text, p_mise integer)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs := public.ami_moi(p_token); o public.joueurs := public.ami_autre(p_pseudo); reste integer; nid bigint;
begin
  if m.id = o.id then raise exception 'soi_meme'; end if;
  if not exists (select 1 from public.amis where statut = 'ok' and least(demandeur_id, receveur_id) = least(m.id, o.id)
                 and greatest(demandeur_id, receveur_id) = greatest(m.id, o.id)) then raise exception 'pas_amis'; end if;
  if p_mise is null or p_mise < 50 or p_mise > 5000 then raise exception 'mise_invalide'; end if;
  if p_choix not in ('1', 'N', '2') then raise exception 'choix_invalide'; end if;
  if p_ko is null or p_ko < now() + interval '5 minutes' or p_ko > now() + interval '3 days' then raise exception 'match_commence'; end if;
  if (select count(*) from public.duels where a_id = m.id and statut = 'invite') >= 5 then raise exception 'trop_de_duels'; end if;
  reste := public.duel_debiter(m.id, p_mise);
  insert into public.duels (a_id, b_id, match_id, match_label, ko, choix, choix_label, mise)
  values (m.id, o.id, left(p_match, 60), left(p_label, 80), p_ko, p_choix, left(p_choix_label, 60), p_mise) returning id into nid;
  perform public.ami_notif(o.id, '⚔️ ' || m.pseudo || ' te défie sur ' || left(p_label, 50), 'Mise : ' || p_mise || ' pièces chacun. Accepte avant le coup d''envoi !', '?duels');
  return json_build_object('id', nid, 'pieces', reste);
end $$;

create or replace function public.duel_repondre(p_token uuid, p_id bigint, p_ok boolean)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs := public.ami_moi(p_token); d public.duels; reste integer;
begin
  perform public.duel_expirer();
  select * into d from public.duels where id = p_id and b_id = m.id for update;
  if not found or d.statut <> 'invite' then raise exception 'plus_dispo'; end if;
  if not p_ok then update public.duels set statut = 'refuse', gain_a = mise where id = p_id; return json_build_object('pieces', null); end if;
  reste := public.duel_debiter(m.id, d.mise);
  update public.duels set statut = 'accepte' where id = p_id;
  perform public.ami_notif(d.a_id, '⚔️ ' || m.pseudo || ' a accepté ton duel', d.match_label || ' : que le meilleur gagne !', '?duels');
  return json_build_object('pieces', reste);
end $$;

create or replace function public.duel_annuler(p_token uuid, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare m public.joueurs := public.ami_moi(p_token);
begin
  update public.duels set statut = 'annule', gain_a = mise where id = p_id and a_id = m.id and statut = 'invite';
end $$;

create or replace function public.duel_liste(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs := public.ami_moi(p_token); r json;
begin
  perform public.duel_expirer();
  select coalesce(json_agg(json_build_object('id', d.id, 'moi_a', d.a_id = m.id, 'adv', j.pseudo, 'match', d.match_id, 'label', d.match_label,
           'ko', (extract(epoch from d.ko) * 1000)::bigint, 'choix', d.choix, 'choix_label', d.choix_label, 'mise', d.mise, 'statut', d.statut, 'score', d.score) order by d.id desc), '[]'::json) into r
    from (select * from public.duels where (a_id = m.id or b_id = m.id) and (statut in ('invite', 'accepte') or cree_le > now() - interval '7 days') order by id desc limit 30) d
    join public.joueurs j on j.id = case when d.a_id = m.id then d.b_id else d.a_id end;
  return r;
end $$;

-- Règlement : appelé par la fonction « notifier » (serveur) quand le match est terminé
create or replace function public.duel_regler(p_id bigint, p_h integer, p_a integer, p_annule boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d public.duels; res text; g text;
begin
  select * into d from public.duels where id = p_id and statut = 'accepte' for update;
  if not found then return; end if;
  if p_annule then
    update public.duels set statut = 'rembourse', gain_a = mise, gain_b = mise, score = 'annulé' where id = p_id; return;
  end if;
  res := case when p_h > p_a then '1' when p_h < p_a then '2' else 'N' end;
  g := case when res = d.choix then 'a' else 'b' end;
  update public.duels set statut = 'gagne_' || g, score = p_h || '-' || p_a,
         gain_a = case when g = 'a' then mise * 2 else 0 end, gain_b = case when g = 'b' then mise * 2 else 0 end where id = p_id;
  perform public.ami_notif(case when g = 'a' then d.a_id else d.b_id end, '⚔️ Duel gagné !', d.match_label || ' (' || p_h || '-' || p_a || ') : +' || (d.mise * 2) || ' pièces', '?duels');
  perform public.ami_notif(case when g = 'a' then d.b_id else d.a_id end, '⚔️ Duel perdu…', d.match_label || ' (' || p_h || '-' || p_a || '). Prends ta revanche !', '?duels');
  begin insert into public.activites (joueur_id, type, data) values (case when g = 'a' then d.a_id else d.b_id end, 'duel',
    jsonb_build_object('adv', (select pseudo from public.joueurs where id = case when g = 'a' then d.b_id else d.a_id end), 'gain', d.mise * 2, 'match', d.match_label));
  exception when others then null; end;
end $$;
revoke all on function public.duel_regler(bigint, integer, integer, boolean), public.duel_expirer() from public, anon, authenticated;

create or replace function public.duel_encaisser(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs := public.ami_moi(p_token); r json;
begin
  perform public.duel_expirer();
  with x as (update public.duels set paye_a = true where a_id = m.id and gain_a > 0 and not paye_a returning gain_a g, statut, b_id adv),
       y as (update public.duels set paye_b = true where b_id = m.id and gain_b > 0 and not paye_b returning gain_b g, statut, a_id adv)
  select json_agg(json_build_object('gain', t.g, 'statut', t.statut, 'adv', j.pseudo)) into r
    from (select * from x union all select * from y) t join public.joueurs j on j.id = t.adv;
  return coalesce(r, '[]'::json);
end $$;

-- ---------- 6. Tournoi poker du dimanche ----------
create table if not exists public.tournoi_recompenses (jour date not null, rang integer not null, joueur_id bigint not null references public.joueurs(id) on delete cascade,
  victoires integer not null, montant integer not null, recu boolean not null default false, primary key (jour, rang));
create table if not exists public.tournois_regles (jour date primary key, regle_le timestamptz not null default now());
alter table public.tournoi_recompenses enable row level security; alter table public.tournois_regles enable row level security;
revoke all on public.tournoi_recompenses, public.tournois_regles from anon, authenticated;

create or replace function public.tournoi_jour() returns date
language sql stable as $$
  -- dimanche en cours (si on est dimanche) sinon le prochain
  select ((now() at time zone 'Europe/Paris')::date + ((7 - extract(isodow from (now() at time zone 'Europe/Paris'))::int) % 7))
$$;

create or replace function public.tournoi_classement(p_jour date default null)
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(t order by t.v desc, t.ts asc), '[]'::json) from (
    select j.pseudo, public.deco_de(j.etat) deco, count(*)::int v, min(a.cree_le) ts
      from public.activites a join public.joueurs j on j.id = a.joueur_id
     where a.type = 'poker' and (a.cree_le at time zone 'Europe/Paris')::date = coalesce(p_jour, public.tournoi_jour())
     group by j.id, j.pseudo, j.etat order by count(*) desc, min(a.cree_le) asc limit 30) t;
$$;

create or replace function public.regler_tournois() returns void
language plpgsql security definer set search_path = public as $$
declare d date; r record; n integer; gains integer[] := array[10000, 5000, 3000];
begin
  perform pg_advisory_xact_lock(494949);
  for d in select distinct (a.cree_le at time zone 'Europe/Paris')::date from public.activites a
           where a.type = 'poker' and extract(isodow from (a.cree_le at time zone 'Europe/Paris')) = 7
             and (a.cree_le at time zone 'Europe/Paris')::date < (now() at time zone 'Europe/Paris')::date
             and (a.cree_le at time zone 'Europe/Paris')::date not in (select jour from public.tournois_regles) loop
    n := 0;
    for r in select a.joueur_id, count(*)::int v from public.activites a
              where a.type = 'poker' and (a.cree_le at time zone 'Europe/Paris')::date = d
              group by a.joueur_id order by count(*) desc, min(a.cree_le) asc limit 3 loop
      n := n + 1;
      insert into public.tournoi_recompenses (jour, rang, joueur_id, victoires, montant) values (d, n, r.joueur_id, r.v, gains[n]) on conflict do nothing;
      perform public.ami_notif(r.joueur_id, '♠️ Tournoi du dimanche : tu finis ' || case n when 1 then '1er' else n || 'e' end || ' !', 'Tu gagnes ' || gains[n] || ' pièces.', '?jeux');
    end loop;
    insert into public.tournois_regles (jour) values (d) on conflict do nothing;
  end loop;
end $$;
revoke all on function public.regler_tournois() from public, anon, authenticated;

create or replace function public.tournoi_recevoir(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs := public.ami_moi(p_token); r json;
begin
  perform public.regler_tournois();
  with c as (update public.tournoi_recompenses set recu = true where joueur_id = m.id and not recu returning jour, rang, montant)
  select json_agg(json_build_object('jour', jour, 'rang', rang, 'montant', montant)) into r from c;
  return coalesce(r, '[]'::json);
end $$;

grant execute on function public.classement_saison(), public.saison_recevoir(uuid), public.tendances(text[]), public.reagir(uuid, bigint, text),
  public.activites_fil(uuid), public.duel_proposer(uuid, text, text, text, timestamptz, text, text, integer), public.duel_repondre(uuid, bigint, boolean),
  public.duel_annuler(uuid, bigint), public.duel_liste(uuid), public.duel_encaisser(uuid), public.tournoi_jour(), public.tournoi_classement(date),
  public.tournoi_recevoir(uuid) to anon, authenticated;
