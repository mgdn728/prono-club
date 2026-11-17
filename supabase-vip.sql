-- PronoClub : couronne 👑 VIP visible par tous (chat, classements, profils)
-- À exécuter une fois dans Supabase > SQL Editor.
create or replace function public.deco_de(e jsonb) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    't', left(e->>'title', 30), 'c', left(e->>'nameFx', 20), 'f', left(e->>'frame', 20),
    'l', case when (e->>'lv') ~ '^[0-9]{1,3}$' then (e->>'lv')::int end,
    'v', case when (e->'vip'->>'until') ~ '^\d{4}-\d{2}-\d{2}$'
               and (e->'vip'->>'until') >= to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD') then 1 end,
    'g', case when jsonb_typeof(e->'badges') = 'array' then (select jsonb_agg(left(x #>> '{}', 14)) from (select x from jsonb_array_elements(e->'badges') x limit 40) s) end))
$$;
select 'ok' as resultat;
