-- PronoClub : notifications sur téléphone (même appli fermée)
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS supabase-social.sql.
-- ⚠️ Remplacez VOTRE_PSEUDO tout en bas par votre pseudo PronoClub (le compte qui reçoit les alertes du propriétaire).

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.joueurs add column if not exists proprio boolean not null default false;

-- Réglages internes (clés de notification générées automatiquement)
create table if not exists public.config (k text primary key, v text not null);
alter table public.config enable row level security;
revoke all on public.config from anon, authenticated;
insert into public.config (k, v) values ('cron_secret', gen_random_uuid()::text) on conflict (k) do nothing;

-- Téléphones abonnés aux notifications
create table if not exists public.abonnements (
  id bigint generated always as identity primary key,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now()
);
create index if not exists abonnements_joueur_idx on public.abonnements (joueur_id);

-- File d'attente des notifications à envoyer
create table if not exists public.notifs (
  id bigint generated always as identity primary key,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  type text not null,
  titre text not null,
  texte text not null,
  url text,
  cree_le timestamptz not null default now(),
  envoye_le timestamptz
);
create index if not exists notifs_attente_idx on public.notifs (cree_le) where envoye_le is null;

-- Notifications déjà prévues (pour ne jamais envoyer deux fois la même)
create table if not exists public.notif_faits (
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  cle text not null,
  cree_le timestamptz not null default now(),
  primary key (joueur_id, cle)
);

alter table public.abonnements enable row level security;
alter table public.notifs enable row level security;
alter table public.notif_faits enable row level security;
revoke all on public.abonnements, public.notifs, public.notif_faits from anon, authenticated;

-- Clé publique pour s'abonner (créée par la fonction « notifier » à son premier lancement)
create or replace function public.notif_cle()
returns text language sql security definer set search_path = public as $$
  select v from public.config where k = 'vapid_public';
$$;

-- Abonner ce téléphone (ou mettre à jour ses réglages)
create or replace function public.notif_abonner(p_token uuid, p_sub jsonb, p_prefs jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs;
begin
  select * into j from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  if coalesce(p_sub->>'endpoint', '') !~ '^https://' or p_sub->'keys'->>'p256dh' is null or p_sub->'keys'->>'auth' is null then
    raise exception 'abonnement_invalide';
  end if;
  insert into public.abonnements (joueur_id, endpoint, p256dh, auth, prefs)
  values (j.id, p_sub->>'endpoint', p_sub->'keys'->>'p256dh', p_sub->'keys'->>'auth', coalesce(p_prefs, '{}'::jsonb))
  on conflict (endpoint) do update set joueur_id = excluded.joueur_id, p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs;
  delete from public.abonnements where joueur_id = j.id
    and id not in (select id from public.abonnements where joueur_id = j.id order by cree_le desc limit 5);
  return json_build_object('proprio', j.proprio);
end $$;

create or replace function public.notif_desabonner(p_token uuid, p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.abonnements a using public.joueurs j
   where a.joueur_id = j.id and j.token = p_token and a.endpoint = p_endpoint;
end $$;

create or replace function public.notif_etat(p_token uuid, p_endpoint text)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; pr jsonb;
begin
  select * into j from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  select prefs into pr from public.abonnements where joueur_id = j.id and endpoint = p_endpoint;
  return json_build_object('proprio', j.proprio, 'abonne', pr is not null, 'prefs', pr);
end $$;

-- Ajoute une notification dans la file
create or replace function public.notif_ajouter(p_joueur bigint, p_type text, p_titre text, p_texte text, p_url text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifs (joueur_id, type, titre, texte, url)
  select p_joueur, p_type, left(p_titre, 80), left(p_texte, 180), p_url
  where exists (select 1 from public.abonnements where joueur_id = p_joueur);
$$;
revoke all on function public.notif_ajouter(bigint, text, text, text, text) from public, anon, authenticated;

-- Nouveau joueur : alerte au propriétaire, et au parrain
create or replace function public.trg_nouveau_joueur() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  for o in select id from public.joueurs where proprio and id <> new.id loop
    perform public.notif_ajouter(o.id, 'proprio_comptes', '👤 Nouveau joueur', new.pseudo || ' vient de créer son compte sur PronoClub.', '?');
  end loop;
  if new.parrain_id is not null then
    perform public.notif_ajouter(new.parrain_id, 'social', '🎁 Parrainage réussi !', new.pseudo || ' s''est inscrit avec ton lien : +500 pièces pour toi. Ouvre PronoClub pour les récupérer.', '?');
  end if;
  return new;
end $$;
drop trigger if exists nouveau_joueur on public.joueurs;
create trigger nouveau_joueur after insert on public.joueurs for each row execute function public.trg_nouveau_joueur();

-- Nouveau message : alerte au propriétaire, et aux joueurs cités avec @pseudo
create or replace function public.trg_nouveau_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  for o in select id from public.joueurs where proprio and id <> new.joueur_id loop
    perform public.notif_ajouter(o.id, 'proprio_chat', '💬 ' || new.pseudo, new.texte, '?chat');
  end loop;
  for o in select distinct j.id from public.joueurs j
           join lateral regexp_matches(new.texte, '@([A-Za-z0-9_.-]{3,20})', 'g') m(x) on lower(j.pseudo) = lower(m.x[1])
           where j.id <> new.joueur_id and not j.proprio loop
    perform public.notif_ajouter(o.id, 'social', '💬 ' || new.pseudo || ' parle de toi', new.texte, '?chat');
  end loop;
  return new;
end $$;
drop trigger if exists nouveau_message on public.messages;
create trigger nouveau_message after insert on public.messages for each row execute function public.trg_nouveau_message();

-- Quelqu'un rejoint une ligue : alerte aux autres membres
create or replace function public.trg_ligue_membre() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record; p text; n text;
begin
  select pseudo into p from public.joueurs where id = new.joueur_id;
  select nom into n from public.ligues where id = new.ligue_id;
  for o in select joueur_id from public.ligue_membres where ligue_id = new.ligue_id and joueur_id <> new.joueur_id loop
    perform public.notif_ajouter(o.joueur_id, 'social', '👥 ' || n, p || ' a rejoint ta ligue. Que le meilleur gagne !', '?ligues');
  end loop;
  return new;
end $$;
drop trigger if exists ligue_membre on public.ligue_membres;
create trigger ligue_membre after insert on public.ligue_membres for each row execute function public.trg_ligue_membre();

-- Envoi : la fonction « notifier » est appelée toutes les minutes
select cron.unschedule('pronoclub-notifier') where exists (select 1 from cron.job where jobname = 'pronoclub-notifier');
select cron.schedule('pronoclub-notifier', '* * * * *', $$
  select net.http_post(
    url := 'https://akxsucplmrdrbsmhdmvj.supabase.co/functions/v1/notifier',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron', (select v from public.config where k = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$$);

-- Ménage : on garde 7 jours d'historique
select cron.unschedule('pronoclub-menage') where exists (select 1 from cron.job where jobname = 'pronoclub-menage');
select cron.schedule('pronoclub-menage', '17 4 * * *', $$
  delete from public.notifs where cree_le < now() - interval '7 days';
  delete from public.notif_faits where cree_le < now() - interval '30 days';
$$);

grant execute on function public.notif_cle(), public.notif_abonner(uuid, jsonb, jsonb),
  public.notif_desabonner(uuid, text), public.notif_etat(uuid, text) to anon, authenticated;

-- ⚠️ Votre compte de propriétaire : remplacez VOTRE_PSEUDO par votre pseudo PronoClub
update public.joueurs set proprio = true where lower(pseudo) = lower('VOTRE_PSEUDO');
