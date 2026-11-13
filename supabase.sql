-- PronoClub : comptes (pseudo + mot de passe), sauvegarde et classement
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.joueurs (
  id bigint generated always as identity primary key,
  pseudo text not null,
  hash text not null,
  token uuid not null default gen_random_uuid(),
  etat jsonb,
  diamants integer not null default 0,
  gagnes integer not null default 0,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
create unique index if not exists joueurs_pseudo_idx on public.joueurs (lower(pseudo));
create unique index if not exists joueurs_token_idx on public.joueurs (token);

-- Personne ne lit ni n'écrit la table directement : tout passe par les fonctions ci-dessous.
alter table public.joueurs enable row level security;
revoke all on public.joueurs from anon, authenticated;

create or replace function public.inscription(p_pseudo text, p_mdp text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare j public.joueurs;
begin
  p_pseudo := trim(p_pseudo);
  if p_pseudo !~ '^[A-Za-z0-9_.-]{3,20}$' then raise exception 'pseudo_invalide'; end if;
  if char_length(coalesce(p_mdp,'')) < 6 then raise exception 'mdp_court'; end if;
  if exists (select 1 from public.joueurs where lower(pseudo) = lower(p_pseudo)) then raise exception 'pseudo_pris'; end if;
  insert into public.joueurs (pseudo, hash) values (p_pseudo, crypt(p_mdp, gen_salt('bf'))) returning * into j;
  return json_build_object('token', j.token, 'pseudo', j.pseudo, 'etat', j.etat);
end $$;

create or replace function public.connexion(p_pseudo text, p_mdp text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare j public.joueurs;
begin
  select * into j from public.joueurs where lower(pseudo) = lower(trim(p_pseudo));
  if not found or j.hash <> crypt(coalesce(p_mdp,''), j.hash) then
    perform pg_sleep(0.5);
    raise exception 'identifiants';
  end if;
  return json_build_object('token', j.token, 'pseudo', j.pseudo, 'etat', j.etat);
end $$;

create or replace function public.charger(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs;
begin
  select * into j from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  return json_build_object('pseudo', j.pseudo, 'etat', j.etat);
end $$;

create or replace function public.sauver(p_token uuid, p_etat jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if octet_length(p_etat::text) > 400000 then raise exception 'trop_gros'; end if;
  update public.joueurs
     set etat = p_etat,
         diamants = coalesce((p_etat->>'diamonds')::int, 0),
         gagnes = coalesce((p_etat->'stats'->>'won')::int, 0),
         maj_le = now()
   where token = p_token;
  if not found then raise exception 'session'; end if;
end $$;

create or replace function public.classement()
returns table (pseudo text, diamants integer, gagnes integer)
language sql security definer set search_path = public as $$
  select pseudo, diamants, gagnes from public.joueurs order by diamants desc, gagnes desc, cree_le asc limit 50;
$$;

grant execute on function public.inscription(text, text), public.connexion(text, text),
  public.charger(uuid), public.sauver(uuid, jsonb), public.classement() to anon, authenticated;
