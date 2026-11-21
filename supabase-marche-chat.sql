-- PronoClub : marché des transferts (Mon Club) + chat des matchs
-- À exécuter une fois dans Supabase > SQL Editor (New query > coller > Run)

/* ================= Marché des transferts ================= */
create table if not exists public.club_marche (
  id bigint generated always as identity primary key,
  vendeur_id bigint not null references public.joueurs(id) on delete cascade,
  vendeur text not null,
  joueur jsonb not null,
  prix integer not null check (prix > 0),
  cree_le timestamptz not null default now(),
  acheteur_id bigint references public.joueurs(id) on delete set null,
  vendu_le timestamptz
);
create index if not exists club_marche_actif_idx on public.club_marche (vendu_le, cree_le desc);
alter table public.club_marche enable row level security;
revoke all on public.club_marche from anon, authenticated;

-- Liste des joueurs en vente (les 150 meilleurs) + mes ventes en cours
create or replace function public.marche_lister(p_token uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me bigint; r json;
begin
  if p_token is not null then select id into me from public.joueurs where token = p_token; end if;
  select coalesce(json_agg(x order by x.note desc, x.id desc), '[]'::json) into r from (
    select m.id, m.vendeur, m.joueur, m.prix, (m.vendeur_id = me) as mine, coalesce((m.joueur->>'r')::int, 0) as note
      from public.club_marche m
     where m.vendu_le is null
     order by (m.vendeur_id = me) desc, coalesce((m.joueur->>'r')::int, 0) desc, m.id desc
     limit 150) x;
  return r;
end $$;

-- Mettre un joueur en vente (5 maximum en même temps)
create or replace function public.marche_vendre(p_token uuid, p_joueur jsonb, p_prix integer)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; n integer; nid bigint; note integer;
begin
  j := public.ami_moi(p_token);
  if p_joueur is null or coalesce(p_joueur->>'n', '') = '' or coalesce(p_joueur->>'p', '') not in ('G','D','M','A')
     or coalesce(p_joueur->>'k', '') not in ('b','a','o','l','i') then raise exception 'joueur'; end if;
  note := coalesce((p_joueur->>'r')::int, 0);
  if note < 40 or note > 99 or char_length(p_joueur->>'n') > 40 then raise exception 'joueur'; end if;
  if p_prix is null or p_prix < 100 or p_prix > 100000000 then raise exception 'prix'; end if;
  select count(*) into n from public.club_marche where vendeur_id = j.id and vendu_le is null;
  if n >= 5 then raise exception 'trop'; end if;
  insert into public.club_marche (vendeur_id, vendeur, joueur, prix)
  values (j.id, j.pseudo, jsonb_build_object('n', p_joueur->>'n', 'f', left(coalesce(p_joueur->>'f', ''), 16), 'p', p_joueur->>'p',
          'k', p_joueur->>'k', 'r', note, 't', coalesce((p_joueur->>'t')::int, 0), 'real', 1), p_prix)
  returning id into nid;
  return json_build_object('id', nid);
end $$;

-- Retirer un joueur de la vente (il revient dans l'effectif)
create or replace function public.marche_retirer(p_token uuid, p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; m public.club_marche;
begin
  j := public.ami_moi(p_token);
  select * into m from public.club_marche where id = p_id and vendeur_id = j.id for update;
  if not found then raise exception 'introuvable'; end if;
  if m.vendu_le is not null then raise exception 'vendu'; end if;
  delete from public.club_marche where id = p_id;
  return json_build_object('joueur', m.joueur);
end $$;

-- Acheter : le vendeur reçoit 95 % du prix (récupéré automatiquement à sa prochaine visite)
create or replace function public.marche_acheter(p_token uuid, p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; m public.club_marche;
begin
  j := public.ami_moi(p_token);
  select * into m from public.club_marche where id = p_id for update;
  if not found or m.vendu_le is not null then raise exception 'vendu'; end if;
  if m.vendeur_id = j.id then raise exception 'toi'; end if;
  update public.club_marche set acheteur_id = j.id, vendu_le = now() where id = p_id;
  update public.joueurs set bonus = bonus + floor(m.prix * 0.95)::int where id = m.vendeur_id;
  perform public.ami_notif(m.vendeur_id, '💱 Transfert réussi !',
    j.pseudo || ' a acheté ' || (m.joueur->>'n') || ' pour ' || m.prix || ' pièces. Tu reçois ' || floor(m.prix * 0.95)::int || ' pièces.', '?tab=club');
  delete from public.club_marche where vendu_le < now() - interval '30 days';
  return json_build_object('joueur', m.joueur, 'prix', m.prix);
end $$;

grant execute on function public.marche_lister(uuid), public.marche_vendre(uuid, jsonb, integer),
  public.marche_retirer(uuid, bigint), public.marche_acheter(uuid, bigint) to anon, authenticated;

/* ================= Chat des matchs ================= */
create table if not exists public.chat_match (
  id bigint generated always as identity primary key,
  match_id text not null,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  pseudo text not null,
  texte text not null,
  signal integer not null default 0,
  masque boolean not null default false,
  cree_le timestamptz not null default now()
);
create index if not exists chat_match_idx on public.chat_match (match_id, id);
create index if not exists chat_match_joueur_idx on public.chat_match (joueur_id, cree_le desc);
create table if not exists public.chat_match_signal (
  msg_id bigint not null references public.chat_match(id) on delete cascade,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  primary key (msg_id, joueur_id)
);
alter table public.chat_match enable row level security;
alter table public.chat_match_signal enable row level security;
revoke all on public.chat_match, public.chat_match_signal from anon, authenticated;

-- Envoyer un message (filtres : liens, réseaux sociaux, numéros, insultes)
create or replace function public.chatm_envoyer(p_token uuid, p_match text, p_texte text)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; dernier timestamptz; m public.chat_match; t text;
begin
  j := public.ami_moi(p_token);
  if p_match is null or char_length(p_match) > 40 then raise exception 'match'; end if;
  t := btrim(regexp_replace(coalesce(p_texte, ''), '\s+', ' ', 'g'));
  if char_length(t) = 0 then raise exception 'vide'; end if;
  if char_length(t) > 200 then raise exception 'trop_long'; end if;
  if t ~* '(https?:|www\.|[a-z0-9-]+\.(com|fr|net|org|io|gg|be|me|co|ly|app|xyz)\M|\msnap(chat)?\M|\minsta(gram)?\M|tik ?tok|whats ?app|telegram|discord|t\.me|wa\.me|@[a-z0-9_.]{3,}|(\d[\s.-]?){8,})' then
    raise exception 'interdit'; end if;
  if t ~* '(connard|connasse|salope|pute\M|putain de ta|encul|\mfdp\M|\mntm\M|nique ta|niquer ta|batard|bâtard|\mpd\M|tafiole|negro|nègre|bougnoul)' then
    raise exception 'insulte'; end if;
  select max(cree_le) into dernier from public.chat_match where joueur_id = j.id;
  if dernier is not null and dernier > now() - interval '3 seconds' then raise exception 'trop_vite'; end if;
  delete from public.chat_match where cree_le < now() - interval '3 days';
  insert into public.chat_match (match_id, joueur_id, pseudo, texte) values (p_match, j.id, j.pseudo, t) returning * into m;
  return json_build_object('id', m.id, 'pseudo', m.pseudo, 'texte', m.texte, 'ts', (extract(epoch from m.cree_le) * 1000)::bigint);
end $$;

-- Lire les messages d'un match (60 derniers, après p_apres)
create or replace function public.chatm_lire(p_match text, p_apres bigint default 0)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.id), '[]'::json) from (
    select id, pseudo, texte, (extract(epoch from cree_le) * 1000)::bigint as ts
      from public.chat_match where match_id = p_match and not masque and id > coalesce(p_apres, 0)
     order by id desc limit 60) x;
$$;

-- Nombre de messages récents par match (pour afficher 💬 3 sur les cartes)
create or replace function public.chatm_comptes(p_ids text[])
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(match_id, n), '{}'::json) from (
    select match_id, count(*) as n from public.chat_match
     where match_id = any(p_ids) and not masque and cree_le > now() - interval '1 day' group by match_id) x;
$$;

-- Signaler un message : masqué automatiquement après 3 signalements, l'admin est prévenu
create or replace function public.chatm_signaler(p_token uuid, p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; m public.chat_match; a record;
begin
  j := public.ami_moi(p_token);
  select * into m from public.chat_match where id = p_id;
  if not found then return json_build_object('ok', true); end if;
  insert into public.chat_match_signal (msg_id, joueur_id) values (p_id, j.id) on conflict do nothing;
  if found then
    update public.chat_match set signal = signal + 1, masque = (signal + 1 >= 3) or masque where id = p_id;
    for a in select id from public.joueurs where coalesce(admin, false) loop
      perform public.ami_notif(a.id, '⚠️ Message signalé (chat match)', m.pseudo || ' : ' || left(m.texte, 100), '?');
    end loop;
  end if;
  return json_build_object('ok', true);
end $$;

-- L'admin supprime un message
create or replace function public.chatm_suppr(p_token uuid, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare j public.joueurs;
begin
  j := public.ami_moi(p_token);
  if not coalesce(j.admin, false) then raise exception 'pas_admin'; end if;
  update public.chat_match set masque = true where id = p_id;
end $$;

grant execute on function public.chatm_envoyer(uuid, text, text), public.chatm_lire(text, bigint), public.chatm_comptes(text[]),
  public.chatm_signaler(uuid, bigint), public.chatm_suppr(uuid, bigint) to anon, authenticated;

select 'ok' as resultat;
