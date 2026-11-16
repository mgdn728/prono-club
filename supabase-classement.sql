-- PronoClub : le classement compte les diamants gagnés, même ceux dépensés en boutique.
-- Score = diamants restants + diamants dépensés (champ "spent" de l'état du joueur).

-- 1) Anciens comptes : on estime une fois ce qu'ils ont déjà dépensé (prix de l'époque)
update public.joueurs j
set etat = jsonb_set(j.etat, '{spent}', to_jsonb(coalesce((
      select sum(case x #>> '{}'
        when 'nx_gold' then 1500 when 'nx_neon' then 2500 when 'nx_fire' then 3000 when 'nx_rainbow' then 4000
        when 'fr_fire' then 1200 when 'fr_ice' then 1200 when 'fr_gold' then 3000 when 'fr_crown' then 6000
        when 't1' then 1000 when 't2' then 3000 when 't3' then 10000 when 't4' then 2000 when 't5' then 5000
        when 'th_gold' then 2500 when 'th_purple' then 2500 when 'th_red' then 2500 else 0 end)
      from jsonb_array_elements(coalesce(j.etat->'owned', '[]'::jsonb)) x), 0)))
where j.etat is not null and not (j.etat ? 'spent');

-- 2) À chaque sauvegarde, la colonne "diamants" (utilisée par le classement) = restants + dépensés
create or replace function public.score_diamants() returns trigger
language plpgsql as $$
begin
  if new.etat is not null then
    new.diamants := coalesce((new.etat->>'diamonds')::numeric, 0)::int
                  + coalesce((new.etat->>'spent')::numeric, 0)::int;
  end if;
  return new;
end $$;

drop trigger if exists score_diamants on public.joueurs;
create trigger score_diamants before insert or update on public.joueurs
for each row execute function public.score_diamants();

-- 3) Recalcule tout de suite pour tout le monde
update public.joueurs set etat = etat where etat is not null;

select pseudo, diamants as score_classement, etat->>'diamonds' as restants, etat->>'spent' as depenses
from public.joueurs order by diamants desc limit 10;
