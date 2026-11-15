-- PronoClub : amis (demande + acceptation) et messages privés entre amis
-- À exécuter une fois dans Supabase > SQL Editor (après supabase.sql, supabase-chat.sql, supabase-social.sql et supabase-notifs.sql).

create table if not exists public.amis (
  id bigint generated always as identity primary key,
  demandeur_id bigint not null references public.joueurs(id) on delete cascade,
  receveur_id bigint not null references public.joueurs(id) on delete cascade,
  statut text not null default 'attente' check (statut in ('attente', 'ok')),
  cree_le timestamptz not null default now(),
  accepte_le timestamptz,
  check (demandeur_id <> receveur_id)
);
-- une seule relation par paire de joueurs, dans un sens ou dans l'autre
create unique index if not exists amis_paire_idx on public.amis (least(demandeur_id, receveur_id), greatest(demandeur_id, receveur_id));
create index if not exists amis_receveur_idx on public.amis (receveur_id);

create table if not exists public.messages_prives (
  id bigint generated always as identity primary key,
  de_id bigint not null references public.joueurs(id) on delete cascade,
  a_id bigint not null references public.joueurs(id) on delete cascade,
  texte text not null,
  lu boolean not null default false,
  cree_le timestamptz not null default now()
);
create index if not exists mp_conv_idx on public.messages_prives (least(de_id, a_id), greatest(de_id, a_id), id desc);
create index if not exists mp_non_lus_idx on public.messages_prives (a_id) where not lu;

-- Personne ne lit ni n'écrit ces tables directement : tout passe par les fonctions ci-dessous.
alter table public.amis enable row level security;
alter table public.messages_prives enable row level security;
revoke all on public.amis from anon, authenticated;
revoke all on public.messages_prives from anon, authenticated;

-- Outils internes
create or replace function public.ami_moi(p_token uuid) returns public.joueurs
language plpgsql security definer set search_path = public as $$
declare j public.joueurs;
begin
  select * into j from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  return j;
end $$;

create or replace function public.ami_autre(p_pseudo text) returns public.joueurs
language plpgsql security definer set search_path = public as $$
declare j public.joueurs;
begin
  select * into j from public.joueurs where lower(pseudo) = lower(trim(p_pseudo));
  if not found then raise exception 'joueur_inconnu'; end if;
  return j;
end $$;

create or replace function public.ami_notif(p_joueur bigint, p_titre text, p_texte text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.notif_ajouter(p_joueur, 'social', p_titre, p_texte, p_url);
exception when undefined_function then null;  -- notifications pas installées : on ignore
end $$;
revoke all on function public.ami_moi(uuid), public.ami_autre(text), public.ami_notif(bigint, text, text, text) from public, anon, authenticated;

-- Où j'en suis avec ce joueur : moi, aucun, envoyee, recue, amis
create or replace function public.ami_etat(p_token uuid, p_pseudo text)
returns text language plpgsql security definer set search_path = public as $$
declare m public.joueurs; o public.joueurs; a public.amis;
begin
  m := public.ami_moi(p_token); o := public.ami_autre(p_pseudo);
  if m.id = o.id then return 'moi'; end if;
  select * into a from public.amis where least(demandeur_id, receveur_id) = least(m.id, o.id) and greatest(demandeur_id, receveur_id) = greatest(m.id, o.id);
  if not found then return 'aucun'; end if;
  if a.statut = 'ok' then return 'amis'; end if;
  return case when a.demandeur_id = m.id then 'envoyee' else 'recue' end;
end $$;

-- Envoyer une demande (si l'autre m'en a déjà envoyé une, on devient amis directement)
create or replace function public.ami_demander(p_token uuid, p_pseudo text)
returns text language plpgsql security definer set search_path = public as $$
declare m public.joueurs; o public.joueurs; a public.amis;
begin
  m := public.ami_moi(p_token); o := public.ami_autre(p_pseudo);
  if m.id = o.id then raise exception 'soi_meme'; end if;
  select * into a from public.amis where least(demandeur_id, receveur_id) = least(m.id, o.id) and greatest(demandeur_id, receveur_id) = greatest(m.id, o.id);
  if found then
    if a.statut = 'ok' then return 'amis'; end if;
    if a.demandeur_id = m.id then return 'envoyee'; end if;
    update public.amis set statut = 'ok', accepte_le = now() where id = a.id;
    perform public.ami_notif(o.id, '🤝 Nouvel ami', m.pseudo || ' a accepté ta demande d''ami.', '?amis');
    return 'amis';
  end if;
  if (select count(*) from public.amis where demandeur_id = m.id and statut = 'attente') >= 30 then raise exception 'trop_demandes'; end if;
  if (select count(*) from public.amis where (demandeur_id = m.id or receveur_id = m.id) and statut = 'ok') >= 200 then raise exception 'trop_amis'; end if;
  insert into public.amis (demandeur_id, receveur_id) values (m.id, o.id);
  perform public.ami_notif(o.id, '🤝 Demande d''ami', m.pseudo || ' veut être ton ami sur PronoClub.', '?amis');
  return 'envoyee';
end $$;

-- Accepter (p_ok = true) ou refuser (p_ok = false) une demande reçue
create or replace function public.ami_repondre(p_token uuid, p_pseudo text, p_ok boolean)
returns text language plpgsql security definer set search_path = public as $$
declare m public.joueurs; o public.joueurs; a public.amis;
begin
  m := public.ami_moi(p_token); o := public.ami_autre(p_pseudo);
  select * into a from public.amis where demandeur_id = o.id and receveur_id = m.id and statut = 'attente';
  if not found then raise exception 'pas_de_demande'; end if;
  if p_ok then
    update public.amis set statut = 'ok', accepte_le = now() where id = a.id;
    perform public.ami_notif(o.id, '🤝 Nouvel ami', m.pseudo || ' a accepté ta demande d''ami.', '?amis');
    return 'amis';
  end if;
  delete from public.amis where id = a.id;
  return 'aucun';
end $$;

-- Annuler une demande envoyée ou retirer un ami
create or replace function public.ami_retirer(p_token uuid, p_pseudo text)
returns text language plpgsql security definer set search_path = public as $$
declare m public.joueurs; o public.joueurs;
begin
  m := public.ami_moi(p_token); o := public.ami_autre(p_pseudo);
  delete from public.amis where least(demandeur_id, receveur_id) = least(m.id, o.id) and greatest(demandeur_id, receveur_id) = greatest(m.id, o.id);
  return 'aucun';
end $$;

-- Ma liste : amis, demandes reçues, demandes envoyées, avec messages non lus
create or replace function public.mes_amis(p_token uuid)
returns table (pseudo text, statut text, deco jsonb, diamants integer, non_lus integer, dernier timestamptz)
language plpgsql security definer set search_path = public as $$
declare m public.joueurs;
begin
  m := public.ami_moi(p_token);
  return query
    select o.pseudo,
           case when a.statut = 'ok' then 'amis' when a.demandeur_id = m.id then 'envoyee' else 'recue' end,
           public.deco_de(o.etat), o.diamants,
           (select count(*)::int from public.messages_prives p where p.de_id = o.id and p.a_id = m.id and not p.lu),
           (select max(p.cree_le) from public.messages_prives p where least(p.de_id, p.a_id) = least(m.id, o.id) and greatest(p.de_id, p.a_id) = greatest(m.id, o.id))
    from public.amis a
    join public.joueurs o on o.id = case when a.demandeur_id = m.id then a.receveur_id else a.demandeur_id end
    where a.demandeur_id = m.id or a.receveur_id = m.id
    order by 6 desc nulls last, a.cree_le desc;
end $$;

-- Messages privés (uniquement entre amis)
create or replace function public.mp_envoyer(p_token uuid, p_pseudo text, p_texte text)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; o public.joueurs; r public.messages_prives; dernier timestamptz;
begin
  m := public.ami_moi(p_token); o := public.ami_autre(p_pseudo);
  if not exists (select 1 from public.amis where statut = 'ok' and least(demandeur_id, receveur_id) = least(m.id, o.id) and greatest(demandeur_id, receveur_id) = greatest(m.id, o.id)) then
    raise exception 'pas_amis';
  end if;
  p_texte := btrim(regexp_replace(coalesce(p_texte, ''), '\s+', ' ', 'g'));
  if char_length(p_texte) = 0 then raise exception 'vide'; end if;
  if char_length(p_texte) > 500 then raise exception 'trop_long'; end if;
  select max(cree_le) into dernier from public.messages_prives where de_id = m.id;
  if dernier is not null and dernier > now() - interval '1 second' then raise exception 'trop_vite'; end if;
  insert into public.messages_prives (de_id, a_id, texte) values (m.id, o.id, p_texte) returning * into r;
  perform public.ami_notif(o.id, '💬 ' || m.pseudo, p_texte, '?amis=' || m.pseudo);
  return json_build_object('id', r.id, 'moi', true, 'texte', r.texte, 'cree_le', r.cree_le);
end $$;

create or replace function public.mp_lire(p_token uuid, p_pseudo text, p_apres bigint default 0)
returns table (id bigint, moi boolean, texte text, cree_le timestamptz)
language plpgsql security definer set search_path = public as $$
declare m public.joueurs; o public.joueurs;
begin
  m := public.ami_moi(p_token); o := public.ami_autre(p_pseudo);
  if not exists (select 1 from public.amis where statut = 'ok' and least(demandeur_id, receveur_id) = least(m.id, o.id) and greatest(demandeur_id, receveur_id) = greatest(m.id, o.id)) then
    raise exception 'pas_amis';
  end if;
  update public.messages_prives set lu = true where de_id = o.id and a_id = m.id and not lu;
  return query
    select t.id, t.moi, t.texte, t.cree_le from (
      select p.id, p.de_id = m.id as moi, p.texte, p.cree_le from public.messages_prives p
      where least(p.de_id, p.a_id) = least(m.id, o.id) and greatest(p.de_id, p.a_id) = greatest(m.id, o.id)
        and p.id > coalesce(p_apres, 0)
      order by p.id desc limit 100
    ) t order by t.id asc;
end $$;

grant execute on function public.ami_etat(uuid, text), public.ami_demander(uuid, text), public.ami_repondre(uuid, text, boolean),
  public.ami_retirer(uuid, text), public.mes_amis(uuid), public.mp_envoyer(uuid, text, text), public.mp_lire(uuid, text, bigint)
  to anon, authenticated;
