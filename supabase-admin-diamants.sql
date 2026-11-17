-- PronoClub : la page admin peut aussi donner des diamants
-- À exécuter une fois dans Supabase > SQL Editor (après supabase-admin-dons.sql).

-- 1) Chaque don indique s'il s'agit de pièces (c) ou de diamants (d)
alter table public.cadeaux_pieces add column if not exists type text not null default 'c';

-- 2) Réception : les pièces et les diamants sont rendus séparément
create or replace function public.pieces_recevoir(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  m := public.ami_moi(p_token);
  with c as (
    update public.cadeaux_pieces set recu = true where a_id = m.id and not recu returning de_id, montant, type
  )
  select json_agg(json_build_object('de', coalesce(j.pseudo, 'PronoClub'), 'montant', t.total, 'dia', t.type = 'd')) into r
    from (select de_id, type, sum(montant)::int as total from c group by de_id, type) t
    left join public.joueurs j on j.id = t.de_id;
  return coalesce(r, '[]'::json);
end $$;

-- 3) Donner des pièces ou des diamants (admin seulement)
drop function if exists public.admin_donner(uuid, text[], integer);
create or replace function public.admin_donner(p_token uuid, p_pseudos text[], p_montant integer, p_type text default 'c')
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; p text; o public.joueurs; ok text[] := '{}'; ko text[] := '{}'; t text := case when p_type = 'd' then 'd' else 'c' end;
begin
  m := public.ami_moi(p_token);
  if not coalesce(m.admin, false) then raise exception 'pas_admin'; end if;
  if p_montant is null or p_montant < 1 or p_montant > 10000000 then raise exception 'montant'; end if;
  if p_pseudos is null or array_length(p_pseudos, 1) is null then raise exception 'aucun'; end if;
  if array_length(p_pseudos, 1) > 50 then raise exception 'trop'; end if;
  foreach p in array p_pseudos loop
    p := btrim(p);
    continue when p = '';
    select * into o from public.joueurs where lower(pseudo) = lower(p);
    if not found then ko := ko || p; continue; end if;
    if o.pseudo = any(ok) then continue; end if;
    insert into public.cadeaux_pieces (de_id, a_id, montant, type) values (null, o.id, p_montant, t);
    perform public.ami_notif(o.id, '🎁 PronoClub vous offre ' || p_montant || case when t = 'd' then ' diamants' else ' pièces' end,
                             'Ouvrez PronoClub pour les recevoir.', '?');
    ok := ok || o.pseudo;
  end loop;
  return json_build_object('ok', to_json(ok), 'inconnus', to_json(ko));
end $$;

grant execute on function public.pieces_recevoir(uuid), public.admin_donner(uuid, text[], integer, text) to anon, authenticated;
select 'ok' as resultat;
