-- PronoClub : programme des matchs automatique (calendriers et cotes ESPN)
-- À exécuter une fois dans Supabase > SQL Editor, AVANT de redéployer la fonction « notifier ».

create table if not exists public.fix_auto (
  day text primary key,          -- jour (heure de Paris), ex. 2026-11-19
  data jsonb not null default '[]'::jsonb,  -- liste des matchs, même format que les fichiers du site
  maj timestamptz default now()
);
alter table public.fix_auto enable row level security;
revoke all on public.fix_auto from anon, authenticated;

create or replace function public.fix_auto_liste(p_days text[])
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(day, data), '{}'::json) from public.fix_auto where day = any(p_days[1:10]);
$$;
grant execute on function public.fix_auto_liste(text[]) to anon, authenticated;

select cron.unschedule('pronoclub-fixauto-menage') where exists (select 1 from cron.job where jobname = 'pronoclub-fixauto-menage');
select cron.schedule('pronoclub-fixauto-menage', '33 4 * * *', $$
  delete from public.fix_auto where maj < now() - interval '30 days';
$$);

select 'ok' as resultat;
