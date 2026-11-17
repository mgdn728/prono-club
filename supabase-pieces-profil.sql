-- PronoClub : afficher les pièces actuelles d'un joueur sur son profil
-- À exécuter une fois dans Supabase > SQL Editor.
create or replace function public.pieces_de(p_pseudo text)
returns integer language sql stable security definer set search_path = public as $$
  select case when etat->>'day' = to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD')
              then coalesce((etat->>'coins')::numeric, 0)::int else 20000 end
    from public.joueurs where lower(pseudo) = lower(trim(p_pseudo)) limit 1;
$$;
grant execute on function public.pieces_de(text) to anon, authenticated;
select 'ok' as resultat;
