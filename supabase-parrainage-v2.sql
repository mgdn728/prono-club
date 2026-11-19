-- PronoClub : nouveau parrainage
--  · l'ami invité reçoit 10 000 pièces dès son inscription
--  · le parrain reçoit 25 000 pièces + 5 000 diamants quand son ami a placé ses 3 premiers paris (fini les faux comptes)
--  · seuls les amis « actifs » comptent pour le Cadre et les Titres Ambassadeur (50 amis maximum)
-- À exécuter une fois dans Supabase > SQL Editor.

alter table public.joueurs add column if not exists parrain_ok boolean not null default false;
alter table public.joueurs add column if not exists bonus_dia integer not null default 0;
-- les filleuls déjà inscrits ont déjà été comptés et payés
update public.joueurs set parrain_ok = true where parrain_id is not null and not parrain_ok;

create or replace function public.inscription(p_pseudo text, p_mdp text, p_parrain text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare j public.joueurs; par_id bigint; par_n integer;
begin
  p_pseudo := trim(p_pseudo);
  if p_pseudo !~ '^[A-Za-z0-9_.-]{3,20}$' then raise exception 'pseudo_invalide'; end if;
  if char_length(coalesce(p_mdp,'')) < 6 then raise exception 'mdp_court'; end if;
  if exists (select 1 from public.joueurs where lower(pseudo) = lower(p_pseudo)) then raise exception 'pseudo_pris'; end if;
  if coalesce(trim(p_parrain), '') <> '' then
    select id, filleuls into par_id, par_n from public.joueurs where lower(pseudo) = lower(trim(p_parrain));
    if par_n >= 50 then par_id := null; end if;
  end if;
  insert into public.joueurs (pseudo, hash, parrain_id, bonus)
    values (p_pseudo, crypt(p_mdp, gen_salt('bf')), par_id, case when par_id is null then 0 else 10000 end)
    returning * into j;
  return json_build_object('token', j.token, 'pseudo', j.pseudo, 'etat', j.etat);
end $$;

create or replace function public.bonus_recuperer(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare b integer; d integer; f integer;
begin
  select bonus, bonus_dia, filleuls into b, d, f from public.joueurs where token = p_token for update;
  if not found then raise exception 'session'; end if;
  if b > 0 or d > 0 then update public.joueurs set bonus = 0, bonus_dia = 0 where token = p_token; end if;
  return json_build_object('bonus', b, 'dia', d, 'filleuls', f);
end $$;

-- quand l'ami a placé 3 paris : on paie le parrain
create or replace function public.trg_filleul_actif() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parrain_id is not null and not new.parrain_ok
     and jsonb_typeof(new.etat->'bets') = 'array' and jsonb_array_length(new.etat->'bets') >= 3 then
    update public.joueurs set parrain_ok = true where id = new.id;
    update public.joueurs set filleuls = filleuls + 1, bonus = bonus + 25000, bonus_dia = bonus_dia + 5000 where id = new.parrain_id;
    perform public.notif_ajouter(new.parrain_id, 'social', '🎁 Parrainage validé !',
      new.pseudo || ' a placé ses 3 premiers paris : +25 000 pièces et +5 000 💎 pour toi. Ouvre PronoClub pour les récupérer.', '?');
  end if;
  return null;
end $$;
drop trigger if exists filleul_actif on public.joueurs;
create trigger filleul_actif after update of etat on public.joueurs
  for each row when (new.parrain_id is not null and not new.parrain_ok)
  execute function public.trg_filleul_actif();

-- message au parrain à l'inscription
create or replace function public.trg_nouveau_joueur() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  for o in select id from public.joueurs where proprio and id <> new.id loop
    perform public.notif_ajouter(o.id, 'proprio_comptes', '👤 Nouveau joueur', new.pseudo || ' vient de créer son compte sur PronoClub.', '?');
  end loop;
  if new.parrain_id is not null then
    perform public.notif_ajouter(new.parrain_id, 'social', '👋 Un ami a rejoint PronoClub',
      new.pseudo || ' s''est inscrit avec ton lien ! Dès qu''il aura placé 3 paris, tu reçois 25 000 pièces et 5 000 💎.', '?');
  end if;
  return new;
end $$;

select 'ok' as resultat;
