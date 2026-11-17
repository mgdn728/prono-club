-- PronoClub : résultats automatiques des matchs d'avant-match (à partir des scores ESPN)
-- À exécuter une fois dans Supabase > SQL Editor, AVANT de redéployer la fonction « notifier ».

alter table public.live_ev add column if not exists buts jsonb;

create table if not exists public.fix_res (
  fid text primary key,          -- jour_id du match, ex. 2026-11-17_den-nor
  s jsonb not null,              -- score final (et buteurs si besoin)
  src text,                      -- match ESPN correspondant
  maj timestamptz default now()
);
alter table public.fix_res enable row level security;
revoke all on public.fix_res from anon, authenticated;

-- Lecture des résultats automatiques pour quelques jours
create or replace function public.fix_res_liste(p_days text[])
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(fid, s), '{}'::json) from public.fix_res
   where split_part(fid, '_', 1) = any(p_days[1:10]);
$$;
grant execute on function public.fix_res_liste(text[]) to anon, authenticated;

select cron.unschedule('pronoclub-fixres-menage') where exists (select 1 from cron.job where jobname = 'pronoclub-fixres-menage');
select cron.schedule('pronoclub-fixres-menage', '29 4 * * *', $$
  delete from public.fix_res where maj < now() - interval '30 days';
$$);

select 'ok' as resultat;
