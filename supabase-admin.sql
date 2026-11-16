-- PronoClub : cosmétiques exclusifs « Administrateur »
-- 1) Colonne admin + protection : personne d'autre ne peut porter ces cosmétiques
alter table public.joueurs add column if not exists admin boolean not null default false;

create or replace function public.proteger_admin() returns trigger
language plpgsql as $$
begin
  if not coalesce(new.admin, false) and new.etat is not null then
    if new.etat->>'title' = 'Administrateur' then new.etat := jsonb_set(new.etat, '{title}', 'null'::jsonb); end if;
    if new.etat->>'nameFx' = 'nx-admin' then new.etat := jsonb_set(new.etat, '{nameFx}', 'null'::jsonb); end if;
    if new.etat->>'frame' = 'fr-admin' then new.etat := jsonb_set(new.etat, '{frame}', 'null'::jsonb); end if;
    if new.etat ? 'owned' then
      new.etat := jsonb_set(new.etat, '{owned}', coalesce((
        select jsonb_agg(x) from jsonb_array_elements(new.etat->'owned') x
        where x #>> '{}' not in ('nx_admin', 'fr_admin', 't_admin')), '[]'::jsonb));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists proteger_admin on public.joueurs;
create trigger proteger_admin before insert or update on public.joueurs
for each row execute function public.proteger_admin();

-- 2) Donne les 3 cosmétiques à mgdn367 et les équipe
update public.joueurs
set admin = true,
    etat = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(etat,
      '{owned}', (select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
          select x #>> '{}' v from jsonb_array_elements(coalesce(etat->'owned', '[]'::jsonb)) x
          union select unnest(array['nx_admin', 'fr_admin', 't_admin'])) t)),
      '{nameFx}', '"nx-admin"'),
      '{frame}', '"fr-admin"'),
      '{title}', '"Administrateur"'),
      '{updated}', to_jsonb((extract(epoch from now()) * 1000)::bigint))
where lower(pseudo) = lower('mgdn367')
returning pseudo, admin, etat->>'title' as titre, etat->>'nameFx' as pseudo_couleur, etat->>'frame' as cadre;
