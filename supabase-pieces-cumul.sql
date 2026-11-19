-- PronoClub : les pièces se gardent d'un jour à l'autre (+20 000 par jour, 7 jours rattrapés au maximum)
-- Affichage des pièces sur les profils et dans le menu admin.
-- À exécuter une fois dans Supabase > SQL Editor.

create or replace function public.pieces_calc(p_etat jsonb)
returns integer language sql stable as $$
  select coalesce((p_etat->>'coins')::numeric, 0)::int
       + case when p_etat->>'day' ~ '^\d{4}-\d{2}-\d{2}$'
                   and (p_etat->>'day')::date < (now() at time zone 'Europe/Paris')::date
              then 20000 * least(7, (now() at time zone 'Europe/Paris')::date - (p_etat->>'day')::date)
              when coalesce(p_etat->>'day', '') = '' then 20000
              else 0 end;
$$;

create or replace function public.pieces_de(p_pseudo text)
returns integer language sql stable security definer set search_path = public as $$
  select public.pieces_calc(etat) from public.joueurs where lower(pseudo) = lower(trim(p_pseudo)) limit 1;
$$;
grant execute on function public.pieces_de(text) to anon, authenticated;

create or replace function public.admin_chercher(p_token uuid, p_q text)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  m := public.ami_moi(p_token);
  if not coalesce(m.admin, false) then raise exception 'pas_admin'; end if;
  select json_agg(x) into r from (
    select pseudo, public.pieces_calc(etat) as pieces
      from public.joueurs
     where pseudo ilike replace(replace(coalesce(p_q, ''), '%', ''), '_', '\_') || '%'
     order by maj_le desc nulls last
     limit 8) x;
  return coalesce(r, '[]'::json);
end $$;

select 'ok' as resultat;
