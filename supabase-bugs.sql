-- PronoClub : bouton « Signaler un bug »
-- À exécuter une fois dans Supabase > SQL Editor.

create table if not exists public.bugs (
  id bigint generated always as identity primary key,
  joueur_id bigint references public.joueurs(id) on delete set null,
  pseudo text,
  texte text not null,
  info jsonb,
  lu boolean not null default false,
  cree_le timestamptz not null default now()
);
create index if not exists bugs_date_idx on public.bugs (cree_le desc);
alter table public.bugs enable row level security;
revoke all on public.bugs from anon, authenticated;

-- Un joueur signale un bug (10 par jour maximum)
create or replace function public.bug_signaler(p_token uuid, p_texte text, p_info jsonb default null)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; n integer; t text := btrim(coalesce(p_texte, '')); a record;
begin
  m := public.ami_moi(p_token);
  if length(t) < 5 then raise exception 'trop_court'; end if;
  t := left(t, 1500);
  select count(*) into n from public.bugs where joueur_id = m.id and cree_le > now() - interval '1 day';
  if n >= 10 then raise exception 'trop_de_bugs'; end if;
  insert into public.bugs (joueur_id, pseudo, texte, info)
  values (m.id, m.pseudo, t, case when octet_length(coalesce(p_info::text, '')) <= 3000 then p_info end);
  for a in select id from public.joueurs where coalesce(admin, false) and id <> m.id loop
    perform public.ami_notif(a.id, '🐞 Bug signalé par ' || m.pseudo, left(t, 120), '?');
  end loop;
  return json_build_object('ok', true);
end $$;

-- L'admin lit les bugs (les 50 derniers)
create or replace function public.admin_bugs(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  m := public.ami_moi(p_token);
  if not coalesce(m.admin, false) then raise exception 'pas_admin'; end if;
  select coalesce(json_agg(x order by x.id desc), '[]'::json) into r from (
    select id, pseudo, texte, info, lu, (extract(epoch from cree_le) * 1000)::bigint as ts
      from public.bugs order by id desc limit 50) x;
  update public.bugs set lu = true where not lu;
  return r;
end $$;

-- L'admin supprime un bug réglé
create or replace function public.admin_bug_suppr(p_token uuid, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.joueurs;
begin
  m := public.ami_moi(p_token);
  if not coalesce(m.admin, false) then raise exception 'pas_admin'; end if;
  delete from public.bugs where id = p_id;
end $$;

grant execute on function public.bug_signaler(uuid, text, jsonb), public.admin_bugs(uuid), public.admin_bug_suppr(uuid, bigint) to anon, authenticated;
select 'ok' as resultat;
