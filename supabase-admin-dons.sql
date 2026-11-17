-- PronoClub : page admin pour donner des pièces
-- À exécuter une fois dans Supabase > SQL Editor (après supabase-pieces.sql et supabase-admin.sql).
-- Seul un compte avec admin = true peut donner. Les joueurs reçoivent les pièces
-- automatiquement (dans les 30 secondes si l'appli est ouverte), pas besoin de la fermer.

-- 1) Un don de l'admin n'a pas d'envoyeur : il apparaît comme « PronoClub »
alter table public.cadeaux_pieces alter column de_id drop not null;

-- 2) Réception : les dons de l'admin s'affichent « PronoClub »
create or replace function public.pieces_recevoir(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  m := public.ami_moi(p_token);
  with c as (
    update public.cadeaux_pieces set recu = true where a_id = m.id and not recu returning de_id, montant
  )
  select json_agg(json_build_object('de', coalesce(j.pseudo, 'PronoClub'), 'montant', t.total)) into r
    from (select de_id, sum(montant)::int as total from c group by de_id) t
    left join public.joueurs j on j.id = t.de_id;
  return coalesce(r, '[]'::json);
end $$;

-- 3) Donner des pièces à un ou plusieurs joueurs (admin seulement)
create or replace function public.admin_donner(p_token uuid, p_pseudos text[], p_montant integer)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; p text; o public.joueurs; ok text[] := '{}'; ko text[] := '{}';
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
    insert into public.cadeaux_pieces (de_id, a_id, montant) values (null, o.id, p_montant);
    perform public.ami_notif(o.id, '🎁 PronoClub vous offre ' || p_montant || ' pièces',
                             'Ouvrez PronoClub pour les recevoir.', '?');
    ok := ok || o.pseudo;
  end loop;
  return json_build_object('ok', to_json(ok), 'inconnus', to_json(ko));
end $$;

-- 4) Chercher des joueurs par pseudo (admin seulement), pour les suggestions
create or replace function public.admin_chercher(p_token uuid, p_q text)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  m := public.ami_moi(p_token);
  if not coalesce(m.admin, false) then raise exception 'pas_admin'; end if;
  select json_agg(x) into r from (
    select pseudo,
           case when etat->>'day' = to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD')
                then coalesce((etat->>'coins')::int, 0) else 20000 end as pieces
      from public.joueurs
     where pseudo ilike replace(replace(coalesce(p_q, ''), '%', ''), '_', '\_') || '%'
     order by maj_le desc nulls last
     limit 8) x;
  return coalesce(r, '[]'::json);
end $$;

grant execute on function public.pieces_recevoir(uuid), public.admin_donner(uuid, text[], integer),
  public.admin_chercher(uuid, text) to anon, authenticated;
