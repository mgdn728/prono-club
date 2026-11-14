-- PronoClub : parrainage, classement de la semaine, ligues entre amis, décorations (pseudo, cadre, titre)
-- À exécuter une fois dans Supabase > SQL Editor (après supabase.sql et supabase-chat.sql).

alter table public.joueurs add column if not exists parrain_id bigint references public.joueurs(id) on delete set null;
alter table public.joueurs add column if not exists filleuls integer not null default 0;
alter table public.joueurs add column if not exists bonus integer not null default 0;
alter table public.joueurs add column if not exists hebdo integer not null default 0;
alter table public.joueurs add column if not exists semaine text;

create or replace function public.semaine_actuelle() returns text
language sql stable as $$ select to_char(now() at time zone 'Europe/Paris', 'IYYY-"W"IW') $$;

-- Décorations achetées en boutique, visibles par les autres joueurs
create or replace function public.deco_de(e jsonb) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('t', left(e->>'title', 30), 'c', left(e->>'nameFx', 20), 'f', left(e->>'frame', 20)))
$$;

-- Inscription avec parrain facultatif : 500 pièces pour le filleul et pour le parrain (20 filleuls maximum)
drop function if exists public.inscription(text, text);
create or replace function public.inscription(p_pseudo text, p_mdp text, p_parrain text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare j public.joueurs; par_id bigint; par_n integer;
begin
  p_pseudo := trim(p_pseudo);
  if p_pseudo !~ '^[A-Za-z0-9_.-]{3,20}$' then raise exception 'pseudo_invalide'; end if;
  if char_length(coalesce(p_mdp,'')) < 6 then raise exception 'mdp_court'; end if;
  if exists (select 1 from public.joueurs where lower(pseudo) = lower(p_pseudo)) then raise exception 'pseudo_pris'; end if;
  if coalesce(trim(p_parrain), '') <> '' then
    select id, filleuls into par_id, par_n from public.joueurs where lower(pseudo) = lower(trim(p_parrain));
    if par_n >= 20 then par_id := null; end if;
  end if;
  insert into public.joueurs (pseudo, hash, parrain_id, bonus)
    values (p_pseudo, crypt(p_mdp, gen_salt('bf')), par_id, case when par_id is null then 0 else 500 end)
    returning * into j;
  if par_id is not null then
    update public.joueurs set filleuls = filleuls + 1, bonus = bonus + 500 where id = par_id;
  end if;
  return json_build_object('token', j.token, 'pseudo', j.pseudo, 'etat', j.etat);
end $$;

-- Récupère (une seule fois) les pièces bonus de parrainage
create or replace function public.bonus_recuperer(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare b integer; f integer;
begin
  select bonus, filleuls into b, f from public.joueurs where token = p_token for update;
  if not found then raise exception 'session'; end if;
  if b > 0 then update public.joueurs set bonus = 0 where token = p_token; end if;
  return json_build_object('bonus', b, 'filleuls', f);
end $$;

-- Sauvegarde : retient aussi les diamants gagnés cette semaine
create or replace function public.sauver(p_token uuid, p_etat jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s text := public.semaine_actuelle();
begin
  if octet_length(p_etat::text) > 400000 then raise exception 'trop_gros'; end if;
  update public.joueurs
     set etat = p_etat,
         diamants = coalesce((p_etat->>'diamonds')::int, 0),
         gagnes = coalesce((p_etat->'stats'->>'won')::int, 0),
         hebdo = case when p_etat->'week'->>'id' = s then coalesce((p_etat->'week'->>'earned')::int, 0) else 0 end,
         semaine = s,
         maj_le = now()
   where token = p_token;
  if not found then raise exception 'session'; end if;
end $$;

-- Classement général ou de la semaine
drop function if exists public.classement();
create or replace function public.classement(p_semaine boolean default false)
returns table (pseudo text, diamants integer, gagnes integer, hebdo integer, deco jsonb)
language sql security definer set search_path = public as $$
  select j.pseudo, j.diamants, j.gagnes,
         case when j.semaine = public.semaine_actuelle() then j.hebdo else 0 end,
         public.deco_de(j.etat)
  from public.joueurs j
  where not p_semaine or (j.semaine = public.semaine_actuelle() and j.hebdo > 0)
  order by case when p_semaine then j.hebdo else j.diamants end desc, j.gagnes desc, j.cree_le asc
  limit 50;
$$;

-- Ligues entre amis
create table if not exists public.ligues (
  id bigint generated always as identity primary key,
  code text not null unique,
  nom text not null,
  createur_id bigint references public.joueurs(id) on delete set null,
  cree_le timestamptz not null default now()
);
create table if not exists public.ligue_membres (
  ligue_id bigint not null references public.ligues(id) on delete cascade,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  rejoint_le timestamptz not null default now(),
  primary key (ligue_id, joueur_id)
);
create index if not exists ligue_membres_joueur_idx on public.ligue_membres (joueur_id);
alter table public.ligues enable row level security;
alter table public.ligue_membres enable row level security;
revoke all on public.ligues, public.ligue_membres from anon, authenticated;

create or replace function public.ligue_creer(p_token uuid, p_nom text)
returns json language plpgsql security definer set search_path = public as $$
declare jid bigint; c text; lid bigint;
begin
  select id into jid from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  p_nom := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  if char_length(p_nom) < 2 or char_length(p_nom) > 30 then raise exception 'nom_invalide'; end if;
  if (select count(*) from public.ligue_membres where joueur_id = jid) >= 10 then raise exception 'trop_de_ligues'; end if;
  loop
    c := translate(upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)), '01', 'XY');
    exit when not exists (select 1 from public.ligues where code = c);
  end loop;
  insert into public.ligues (code, nom, createur_id) values (c, p_nom, jid) returning id into lid;
  insert into public.ligue_membres (ligue_id, joueur_id) values (lid, jid);
  return json_build_object('code', c, 'nom', p_nom);
end $$;

create or replace function public.ligue_rejoindre(p_token uuid, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare jid bigint; l public.ligues;
begin
  select id into jid from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  select * into l from public.ligues where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'code_inconnu'; end if;
  if not exists (select 1 from public.ligue_membres where ligue_id = l.id and joueur_id = jid) then
    if (select count(*) from public.ligue_membres where ligue_id = l.id) >= 50 then raise exception 'ligue_pleine'; end if;
    if (select count(*) from public.ligue_membres where joueur_id = jid) >= 10 then raise exception 'trop_de_ligues'; end if;
    insert into public.ligue_membres (ligue_id, joueur_id) values (l.id, jid);
  end if;
  return json_build_object('code', l.code, 'nom', l.nom);
end $$;

create or replace function public.ligue_quitter(p_token uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare jid bigint; lid bigint;
begin
  select id into jid from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  select id into lid from public.ligues where code = upper(btrim(coalesce(p_code, '')));
  if lid is null then return; end if;
  delete from public.ligue_membres where ligue_id = lid and joueur_id = jid;
  if not exists (select 1 from public.ligue_membres where ligue_id = lid) then delete from public.ligues where id = lid; end if;
end $$;

create or replace function public.mes_ligues(p_token uuid)
returns table (code text, nom text, membres integer)
language plpgsql security definer set search_path = public as $$
declare jid bigint;
begin
  select id into jid from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  return query
    select l.code, l.nom, (select count(*)::int from public.ligue_membres x where x.ligue_id = l.id)
    from public.ligues l join public.ligue_membres m on m.ligue_id = l.id
    where m.joueur_id = jid order by m.rejoint_le;
end $$;

create or replace function public.ligue_classement(p_token uuid, p_code text)
returns table (pseudo text, diamants integer, gagnes integer, hebdo integer, deco jsonb)
language plpgsql security definer set search_path = public as $$
declare jid bigint; lid bigint;
begin
  select id into jid from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  select l.id into lid from public.ligues l join public.ligue_membres m on m.ligue_id = l.id
   where l.code = upper(btrim(coalesce(p_code, ''))) and m.joueur_id = jid;
  if lid is null then raise exception 'pas_membre'; end if;
  return query
    select j.pseudo, j.diamants, j.gagnes,
           case when j.semaine = public.semaine_actuelle() then j.hebdo else 0 end,
           public.deco_de(j.etat)
    from public.joueurs j join public.ligue_membres m on m.joueur_id = j.id
    where m.ligue_id = lid
    order by 4 desc, j.diamants desc;
end $$;

-- Chat : les messages gardent la décoration du joueur
alter table public.messages add column if not exists deco jsonb;

create or replace function public.chat_envoyer(p_token uuid, p_texte text)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; m public.messages; dernier timestamptz;
begin
  select * into j from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  p_texte := btrim(regexp_replace(coalesce(p_texte, ''), '\s+', ' ', 'g'));
  if char_length(p_texte) = 0 then raise exception 'vide'; end if;
  if char_length(p_texte) > 300 then raise exception 'trop_long'; end if;
  select max(cree_le) into dernier from public.messages where joueur_id = j.id;
  if dernier is not null and dernier > now() - interval '3 seconds' then raise exception 'trop_vite'; end if;
  insert into public.messages (joueur_id, pseudo, texte, deco) values (j.id, j.pseudo, p_texte, public.deco_de(j.etat)) returning * into m;
  return json_build_object('id', m.id, 'pseudo', m.pseudo, 'texte', m.texte, 'cree_le', m.cree_le, 'deco', m.deco);
end $$;

drop function if exists public.chat_lire(bigint);
create or replace function public.chat_lire(p_apres bigint default 0)
returns table (id bigint, pseudo text, texte text, cree_le timestamptz, deco jsonb)
language sql security definer set search_path = public as $$
  select t.id, t.pseudo, t.texte, t.cree_le, t.deco from (
    select m.id, m.pseudo, m.texte, m.cree_le, m.deco from public.messages m
    where m.id > coalesce(p_apres, 0) order by m.id desc limit 100
  ) t order by t.id asc;
$$;

grant execute on function
  public.inscription(text, text, text), public.bonus_recuperer(uuid), public.sauver(uuid, jsonb),
  public.classement(boolean), public.ligue_creer(uuid, text), public.ligue_rejoindre(uuid, text),
  public.ligue_quitter(uuid, text), public.mes_ligues(uuid), public.ligue_classement(uuid, text),
  public.chat_envoyer(uuid, text), public.chat_lire(bigint)
to anon, authenticated;
