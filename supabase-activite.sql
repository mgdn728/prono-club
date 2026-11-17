-- PronoClub : fil d'activité des amis
-- À exécuter une fois dans Supabase > SQL Editor (après supabase-amis.sql).
-- Les événements sont créés automatiquement par le serveur : paris gagnés, objets rares débloqués,
-- jackpot du coffre, victoires au poker, podium de la semaine.

create table if not exists public.activites (
  id bigint generated always as identity primary key,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now()
);
create index if not exists activites_joueur_idx on public.activites (joueur_id, cree_le desc);
alter table public.activites enable row level security;
revoke all on public.activites from anon, authenticated;

-- Objets de la boutique assez rares pour apparaître dans le fil
create or replace function public.act_objet(p_id text) returns text
language sql immutable as $$
  select case p_id
    when 'nx_rainbow' then 'le Pseudo arc-en-ciel 🌈' when 'fr_crown' then 'le Cadre Couronne 👑' when 't3' then 'le titre « Légende »'
    when 't5' then 'le titre « Roi du combiné »' when 'fr_rgb' then 'l''Avatar RGB 🌈' when 'fr_pulse' then 'l''Avatar Néon 💠'
    when 'fr_comet' then 'l''Avatar Comète ☄️' when 'fr_flame' then 'l''Avatar Brasier 🔥' when 'fr_galaxy' then 'l''Avatar Galaxie 🌌'
    when 'fx_diamond' then 'l''effet Pluie de diamants 💎' when 'fx_trophy' then 'l''effet Trophées 🏆'
    when 'lx_galaxy' then 'le Pseudo Galaxie (édition limitée)' when 'lx_ice' then 'le Pseudo Givré (édition limitée)' when 'lx_lava' then 'le Pseudo Lave (édition limitée)'
    when 'lf_diamond' then 'l''Avatar Diamant (édition limitée)' when 'lf_love' then 'l''Avatar Cœur (édition limitée)' when 'lt_goat' then 'le titre « GOAT » (édition limitée)'
    when 'lt_ballon' then 'le titre « Ballon d''or » (édition limitée)' when 'lt_lucky' then 'le titre « Chanceux » (édition limitée)' when 'lfx_gold' then 'l''effet Pluie d''or (édition limitée)'
    when 'fr_amb' then 'le Cadre Ambassadeur 🤝 en invitant 3 amis' when 't_amb' then 'le titre « Ambassadeur » en invitant 10 amis'
    else null end
$$;

-- Repère les nouveautés à chaque sauvegarde d'un joueur
create or replace function public.act_joueur() returns trigger
language plpgsql security definer set search_path = public as $$
declare b jsonb; o text; n integer := 0;
begin
  if new.etat is null or new.etat = old.etat then return new; end if;
  -- paris gagnés
  for b in select x from jsonb_array_elements(coalesce(new.etat->'bets', '[]'::jsonb)) x
           where x->>'status' = 'won'
             and not exists (select 1 from jsonb_array_elements(coalesce(old.etat->'bets', '[]'::jsonb)) y
                             where y->>'id' = x->>'id' and y->>'status' = 'won')
  loop
    n := n + 1; exit when n > 10;
    insert into public.activites (joueur_id, type, data) values (new.id, 'pari', jsonb_build_object(
      'type', left(b->>'type', 20), 'cote', (b->>'odds')::numeric, 'gain', (b->>'payout')::numeric,
      'n', jsonb_array_length(coalesce(b->'sels', '[]'::jsonb)),
      'choix', left(b->'sels'->0->>'pick', 60), 'match', left(b->'sels'->0->>'match', 80)));
  end loop;
  -- objets rares
  for o in select x #>> '{}' from jsonb_array_elements(coalesce(new.etat->'owned', '[]'::jsonb)) x
           where not coalesce(old.etat->'owned', '[]'::jsonb) @> jsonb_build_array(x #>> '{}')
  loop
    if public.act_objet(o) is not null then
      insert into public.activites (joueur_id, type, data) values (new.id, 'objet', jsonb_build_object('id', o, 'nom', public.act_objet(o)));
    end if;
  end loop;
  -- jackpot du coffre
  if new.etat->'chest'->>'i' = '9' and new.etat->'chest'->>'day' is distinct from old.etat->'chest'->>'day' then
    insert into public.activites (joueur_id, type, data) values (new.id, 'jackpot', '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists act_joueur on public.joueurs;
create trigger act_joueur after update of etat on public.joueurs for each row execute function public.act_joueur();

-- Victoires au poker et podium de la semaine (si ces parties sont installées)
create or replace function public.act_poker() returns trigger
language plpgsql security definer set search_path = public as $$
declare w bigint; l bigint;
begin
  if new.statut = 'finie' and old.statut is distinct from 'finie' and new.gagnant in ('a', 'b') then
    w := case when new.gagnant = 'a' then new.a_id else new.b_id end;
    l := case when new.gagnant = 'a' then new.b_id else new.a_id end;
    insert into public.activites (joueur_id, type, data)
    values (w, 'poker', jsonb_build_object('adv', (select pseudo from public.joueurs where id = l), 'gain', new.mise * 2));
  end if;
  return new;
end $$;
create or replace function public.act_podium() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.activites (joueur_id, type, data) values (new.joueur_id, 'podium', jsonb_build_object('rang', new.rang, 'gain', new.montant));
  return new;
end $$;
do $$ begin
  if to_regclass('public.poker_parties') is not null then
    drop trigger if exists act_poker on public.poker_parties;
    create trigger act_poker after update on public.poker_parties for each row execute function public.act_poker();
  end if;
  if to_regclass('public.recompenses_semaine') is not null then
    drop trigger if exists act_podium on public.recompenses_semaine;
    create trigger act_podium after insert on public.recompenses_semaine for each row execute function public.act_podium();
  end if;
end $$;
revoke all on function public.act_joueur(), public.act_poker(), public.act_podium() from public, anon, authenticated;

-- Le fil : mes activités et celles de mes amis (7 derniers jours)
create or replace function public.activites_fil(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  select * into m from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  select coalesce(json_agg(t order by t.ts desc), '[]'::json) into r from (
    select a.id, j.pseudo, public.deco_de(j.etat) as deco, a.type, a.data, (extract(epoch from a.cree_le) * 1000)::bigint as ts, j.id = m.id as moi
      from public.activites a join public.joueurs j on j.id = a.joueur_id
     where a.cree_le > now() - interval '7 days'
       and (a.joueur_id = m.id or exists (select 1 from public.amis x where x.statut = 'ok'
             and ((x.demandeur_id = m.id and x.receveur_id = a.joueur_id) or (x.receveur_id = m.id and x.demandeur_id = a.joueur_id))))
     order by a.cree_le desc limit 60) t;
  return r;
end $$;
grant execute on function public.activites_fil(uuid) to anon, authenticated;
