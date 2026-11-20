-- PronoClub : « Mon Club » — adversaires réels et classement des clubs
-- Le club de chaque joueur est enregistré avec sa partie ; ces fonctions lisent seulement son résumé public.
-- À exécuter une fois dans Supabase > SQL Editor.

create or replace function public.club_adversaires(p_token uuid, p_note integer)
returns json language plpgsql stable security definer set search_path = public as $$
declare me bigint; r json;
begin
  select id into me from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  select coalesce(json_agg(x), '[]'::json) into r from (
    select j.pseudo, c->>'n' as n, c->>'e' as e, c->>'c1' as c1, c->>'c2' as c2,
           (c->>'note')::int as note, (c->>'att')::int as att, (c->>'mid')::int as mid, (c->>'def')::int as def, (c->>'gk')::int as gk,
           (c->>'div')::int as div, c->'noms' as noms
      from public.joueurs j, lateral (select j.etat->'club'->'pub' as c) z
     where j.id <> me and c is not null and (c->>'note') ~ '^\d+$'
       and j.maj_le > now() - interval '30 days'
       and abs((c->>'note')::int - coalesce(p_note, 50)) <= 12
     order by random() limit 3) x;
  return r;
end $$;
grant execute on function public.club_adversaires(uuid, integer) to anon, authenticated;

create or replace function public.club_classement()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x), '[]'::json) from (
    select j.pseudo, c->>'n' as n, c->>'e' as e, c->>'c1' as c1, c->>'c2' as c2,
           coalesce((c->>'div')::int, 10) as div, coalesce((c->>'pts')::int, 0) as pts,
           coalesce((c->>'note')::int, 0) as note, coalesce((c->>'tr')::int, 0) as tr
      from public.joueurs j, lateral (select j.etat->'club'->'pub' as c) z
     where c is not null and (c->>'div') ~ '^\d+$'
     order by coalesce((c->>'tr')::int, 0) desc, (c->>'div')::int asc, (c->>'pts')::int desc, (c->>'note')::int desc
     limit 50) x;
$$;
grant execute on function public.club_classement() to anon, authenticated;

select 'ok' as resultat;
