-- PronoClub : scores et paris en direct (flux publics ESPN)
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS avoir redéployé la fonction « notifier ».

create table if not exists public.live_ev (
  id text primary key,
  sp text not null,
  lp text,
  lg text,
  h text not null,
  a text not null,
  t timestamptz,
  st text not null default 'pre',
  per integer default 0,
  clk text,
  det text,
  s jsonb,
  ls jsonb,
  win integer default 0,
  bo integer default 0,
  o jsonb,
  fin integer default 0,
  chg timestamptz default now(),
  maj timestamptz default now()
);
create index if not exists live_ev_st_idx on public.live_ev (st, maj desc);
create index if not exists live_ev_t_idx on public.live_ev (t);
alter table public.live_ev enable row level security;
revoke all on public.live_ev from anon, authenticated;

-- Liste pour l'onglet Live : matchs en cours, qui commencent bientôt, ou terminés il y a peu
create or replace function public.live_liste()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'now', (extract(epoch from now()) * 1000)::bigint,
    'ev', coalesce((select json_agg(json_build_object(
        'id', id, 'sp', sp, 'lp', lp, 'lg', lg, 'h', h, 'a', a, 't', (extract(epoch from t) * 1000)::bigint,
        'st', st, 'per', per, 'clk', clk, 'det', det, 's', s, 'ls', ls, 'win', win, 'bo', bo, 'o', o, 'fin', fin,
        'chg', (extract(epoch from chg) * 1000)::bigint, 'maj', (extract(epoch from maj) * 1000)::bigint) order by t)
      from public.live_ev
      where (st = 'in' and maj > now() - interval '15 minutes')
         or (st = 'pre' and t between now() - interval '20 minutes' and now() + interval '45 minutes')
         or (st = 'post' and maj > now() - interval '3 hours')), '[]'::json));
$$;

-- Résultats pour régler les paris en direct (même longtemps après le match)
create or replace function public.live_res(p_ids text[])
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
      'id', id, 'sp', sp, 'lp', lp, 'lg', lg, 'h', h, 'a', a, 't', (extract(epoch from t) * 1000)::bigint,
      'st', st, 'per', per, 'clk', clk, 'det', det, 's', s, 'ls', ls, 'win', win, 'bo', bo, 'o', o, 'fin', fin,
      'chg', (extract(epoch from chg) * 1000)::bigint, 'maj', (extract(epoch from maj) * 1000)::bigint)), '[]'::json)
  from public.live_ev where id = any(p_ids[1:100]);
$$;
grant execute on function public.live_liste(), public.live_res(text[]) to anon, authenticated;

-- Mise à jour des scores toutes les 20 secondes (appel de « notifier » avec {"live":1})
select cron.unschedule('pronoclub-live') where exists (select 1 from cron.job where jobname = 'pronoclub-live');
select cron.schedule('pronoclub-live', '20 seconds', $$
  select net.http_post(
    url := 'https://akxsucplmrdrbsmhdmvj.supabase.co/functions/v1/notifier',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron', (select v from public.config where k = 'cron_secret')),
    body := '{"live":1}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);

-- Ménage : on garde 10 jours de résultats
select cron.unschedule('pronoclub-live-menage') where exists (select 1 from cron.job where jobname = 'pronoclub-live-menage');
select cron.schedule('pronoclub-live-menage', '23 4 * * *', $$
  delete from public.live_ev where t < now() - interval '10 days';
$$);

select 'ok' as resultat;
