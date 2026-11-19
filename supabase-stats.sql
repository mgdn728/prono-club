-- PronoClub : statistiques du site pour l'admin (menu du profil > « Admin · statistiques »)
-- À exécuter une fois dans Supabase > SQL Editor.

-- joueurs actifs jour par jour (à partir d'aujourd'hui)
create table if not exists public.actifs_jour (
  day date not null,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  primary key (day, joueur_id)
);
alter table public.actifs_jour enable row level security;
revoke all on public.actifs_jour from anon, authenticated;

create or replace function public.trg_actif_jour() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.actifs_jour (day, joueur_id) values ((now() at time zone 'Europe/Paris')::date, new.id)
  on conflict do nothing;
  return null;
end $$;
drop trigger if exists actif_jour on public.joueurs;
create trigger actif_jour after update of etat on public.joueurs
  for each row execute function public.trg_actif_jour();

-- on garde un an d'historique
select cron.unschedule('pronoclub-actifs-menage') where exists (select 1 from cron.job where jobname = 'pronoclub-actifs-menage');
select cron.schedule('pronoclub-actifs-menage', '47 4 * * *', $$
  delete from public.actifs_jour where day < (now() at time zone 'Europe/Paris')::date - 366;
$$);

create or replace function public.admin_stats(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; auj date := (now() at time zone 'Europe/Paris')::date; r json;
  t0 bigint := (extract(epoch from (auj::timestamp at time zone 'Europe/Paris')) * 1000)::bigint;
begin
  m := public.ami_moi(p_token);
  if not coalesce(m.admin, false) then raise exception 'pas_admin'; end if;
  with b as (
    select (x->>'placedAt')::bigint as ts
      from public.joueurs j, jsonb_array_elements(case when jsonb_typeof(j.etat->'bets') = 'array' then j.etat->'bets' else '[]'::jsonb end) x
     where j.maj_le > now() - interval '15 days' and (x->>'placedAt') ~ '^\d+$'
  ), jours as (
    select generate_series(auj - 13, auj, interval '1 day')::date as d
  )
  select json_build_object(
    'total', (select count(*) from public.joueurs),
    'new_today', (select count(*) from public.joueurs where (cree_le at time zone 'Europe/Paris')::date = auj),
    'new7', (select count(*) from public.joueurs where cree_le > now() - interval '7 days'),
    'new30', (select count(*) from public.joueurs where cree_le > now() - interval '30 days'),
    'act_today', (select count(*) from public.joueurs where (maj_le at time zone 'Europe/Paris')::date = auj),
    'act7', (select count(*) from public.joueurs where maj_le > now() - interval '7 days'),
    'act30', (select count(*) from public.joueurs where maj_le > now() - interval '30 days'),
    'bets_today', (select count(*) from b where ts >= t0),
    'bets7', (select count(*) from b where ts >= t0 - 6 * 86400000),
    'days', (select json_agg(json_build_object(
        'd', to_char(jr.d, 'YYYY-MM-DD'),
        'nouveaux', (select count(*) from public.joueurs where (cree_le at time zone 'Europe/Paris')::date = jr.d),
        'actifs', (select count(*) from public.actifs_jour a where a.day = jr.d),
        'paris', (select count(*) from b where ts >= (extract(epoch from (jr.d::timestamp at time zone 'Europe/Paris')) * 1000)::bigint
                                       and ts < (extract(epoch from ((jr.d + 1)::timestamp at time zone 'Europe/Paris')) * 1000)::bigint)
      ) order by jr.d) from jours jr)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_stats(uuid) to anon, authenticated;

-- les joueurs déjà actifs aujourd'hui comptent tout de suite
insert into public.actifs_jour (day, joueur_id)
  select (now() at time zone 'Europe/Paris')::date, id from public.joueurs
   where (maj_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date
on conflict do nothing;

select 'ok' as resultat;
