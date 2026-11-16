-- PronoClub : classement du blackjack, par pourcentage de parties gagnées (10 parties minimum)
create or replace function public.classement_blackjack()
returns table(pseudo text, parties integer, gagnees integer, taux numeric, deco jsonb)
language sql security definer set search_path = public as $$
  select t.pseudo, t.n, t.w, round(100.0 * t.w / t.n, 1), t.deco
  from (
    select j.pseudo, j.cree_le,
           coalesce((j.etat->'bjt'->>'n')::numeric, 0)::int as n,
           coalesce((j.etat->'bjt'->>'w')::numeric, 0)::int as w,
           jsonb_strip_nulls(jsonb_build_object('t', left(j.etat->>'title', 30), 'c', left(j.etat->>'nameFx', 20), 'f', left(j.etat->>'frame', 20))) as deco
    from public.joueurs j
  ) t
  where t.n >= 10
  order by 4 desc, t.n desc, t.cree_le asc
  limit 50;
$$;
grant execute on function public.classement_blackjack() to anon, authenticated;

select * from public.classement_blackjack();
