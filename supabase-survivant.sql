-- PronoClub : le Survivant
-- Chaque jour, chaque survivant choisit UNE équipe de foot qui doit gagner. Nul ou défaite = éliminé.
-- Pas de choix un jour où il y a des matchs = éliminé. Une équipe ne peut servir qu'une fois par saison.
-- Une saison dure du lundi au dimanche ; les survivants se partagent la cagnotte.
-- À exécuter une fois dans Supabase > SQL Editor (New query > coller > Run)

create table if not exists public.surv_saison (
  id text primary key,                      -- lundi de la semaine (heure de Paris), ex. 2026-11-23
  statut text not null default 'ouvert',    -- ouvert / fini
  cagnotte integer not null default 200000,
  ferme_le timestamptz
);
create table if not exists public.surv_joueur (
  saison text not null references public.surv_saison(id) on delete cascade,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  pseudo text not null,
  inscrit_le date not null,
  vivant boolean not null default true,
  elimine_le date,
  raison text,
  gain integer not null default 0,
  primary key (saison, joueur_id)
);
create table if not exists public.surv_choix (
  saison text not null,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  jour date not null,
  fid text not null,                        -- jour_id du match
  equipe text not null,                     -- nom de l'équipe (comme dans le programme)
  adversaire text not null,
  ko timestamptz not null,
  res text,                                 -- v = gagné, x = perdu/nul, a = annulé (sauvé)
  primary key (saison, joueur_id, jour)
);
alter table public.surv_saison enable row level security;
alter table public.surv_joueur enable row level security;
alter table public.surv_choix enable row level security;
revoke all on public.surv_saison, public.surv_joueur, public.surv_choix from anon, authenticated;

create or replace function public.surv_auj() returns date language sql stable as $$
  select (now() at time zone 'Europe/Paris')::date $$;
create or replace function public.surv_id(d date) returns text language sql immutable as $$
  select to_char(d - ((extract(isodow from d)::int) - 1), 'YYYY-MM-DD') $$;

-- Saison en cours (créée au besoin)
create or replace function public.surv_saison_cour() returns public.surv_saison
language plpgsql security definer set search_path = public as $$
declare s public.surv_saison; sid text := public.surv_id(public.surv_auj());
begin
  insert into public.surv_saison (id) values (sid) on conflict do nothing;
  select * into s from public.surv_saison where id = sid;
  return s;
end $$;

-- Résultat d'un match : [buts domicile, buts extérieur] ou {x:...} si annulé
create or replace function public.surv_res(p_fid text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s from public.fix_res where fid = p_fid),
    (select case when m ? 's' then m->'s' when m ? 'x' then jsonb_build_object('x', m->'x') end
       from public.fix_auto f, jsonb_array_elements(f.data) m
      where f.day = split_part(p_fid, '_', 1) and m->>'id' = substr(p_fid, length(split_part(p_fid, '_', 1)) + 2) limit 1))
$$;

-- Tout l'écran du Survivant
create or replace function public.surv_get(p_token uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare s public.surv_saison; me bigint; mj public.surv_joueur; n int; v int; r json;
begin
  s := public.surv_saison_cour();
  if p_token is not null then select id into me from public.joueurs where token = p_token; end if;
  select count(*), count(*) filter (where vivant) into n, v from public.surv_joueur where saison = s.id;
  select * into mj from public.surv_joueur where saison = s.id and joueur_id = me;
  select json_build_object(
    'saison', s.id, 'statut', s.statut, 'cagnotte', s.cagnotte + 20000 * n, 'inscrits', n, 'vivants', v,
    'auj', public.surv_auj(), 'peut_rejoindre', s.statut = 'ouvert' and extract(isodow from public.surv_auj()) <= 3,
    'moi', case when mj.joueur_id is null then null else json_build_object('vivant', mj.vivant, 'elimine_le', mj.elimine_le, 'raison', mj.raison, 'gain', mj.gain) end,
    'choix', coalesce((select json_agg(json_build_object('jour', c.jour, 'fid', c.fid, 'equipe', c.equipe, 'adv', c.adversaire, 'ko', c.ko, 'res', c.res) order by c.jour)
                         from public.surv_choix c where c.saison = s.id and c.joueur_id = me), '[]'::json),
    'survivants', coalesce((select json_agg(x.pseudo) from (select pseudo from public.surv_joueur where saison = s.id and vivant order by inscrit_le, pseudo limit 40) x), '[]'::json),
    'derniers', coalesce((select json_agg(json_build_object('saison', z.saison, 'pseudo', z.pseudo, 'gain', z.gain)) from
                  (select saison, pseudo, gain from public.surv_joueur where gain > 0 order by saison desc, gain desc limit 5) z), '[]'::json)
  ) into r;
  return r;
end $$;

-- Participer (gratuit) : du lundi au mercredi
create or replace function public.surv_rejoindre(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; s public.surv_saison;
begin
  j := public.ami_moi(p_token);
  s := public.surv_saison_cour();
  if s.statut <> 'ouvert' then raise exception 'fini'; end if;
  if extract(isodow from public.surv_auj()) > 3 then raise exception 'trop_tard'; end if;
  insert into public.surv_joueur (saison, joueur_id, pseudo, inscrit_le) values (s.id, j.id, j.pseudo, public.surv_auj()) on conflict do nothing;
  return public.surv_get(p_token);
end $$;

-- Choisir (ou changer avant le coup d'envoi) l'équipe du jour
create or replace function public.surv_choisir(p_token uuid, p_fid text, p_equipe text)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; s public.surv_saison; mj public.surv_joueur; d date := public.surv_auj(); m jsonb; ko timestamptz; adv text; old public.surv_choix;
begin
  j := public.ami_moi(p_token);
  s := public.surv_saison_cour();
  select * into mj from public.surv_joueur where saison = s.id and joueur_id = j.id;
  if mj.joueur_id is null then raise exception 'pas_inscrit'; end if;
  if not mj.vivant or s.statut <> 'ouvert' then raise exception 'elimine'; end if;
  if split_part(p_fid, '_', 1) <> to_char(d, 'YYYY-MM-DD') then raise exception 'pas_aujourdhui'; end if;
  select x into m from public.fix_auto f, jsonb_array_elements(f.data) x
   where f.day = to_char(d, 'YYYY-MM-DD') and x->>'id' = substr(p_fid, 12) limit 1;
  if m is null or coalesce(m->>'sp', 'foot') <> 'foot' then raise exception 'match'; end if;
  ko := (m->>'t')::timestamptz;
  if ko <= now() then raise exception 'commence'; end if;
  if p_equipe = m->>'h' then adv := m->>'a'; elsif p_equipe = m->>'a' then adv := m->>'h'; else raise exception 'equipe'; end if;
  if exists (select 1 from public.surv_choix where saison = s.id and joueur_id = j.id and equipe = p_equipe and jour <> d) then raise exception 'deja_prise'; end if;
  select * into old from public.surv_choix where saison = s.id and joueur_id = j.id and jour = d;
  if old.fid is not null and old.ko <= now() then raise exception 'verrouille'; end if;
  insert into public.surv_choix (saison, joueur_id, jour, fid, equipe, adversaire, ko)
  values (s.id, j.id, d, p_fid, p_equipe, adv, ko)
  on conflict (saison, joueur_id, jour) do update set fid = excluded.fid, equipe = excluded.equipe, adversaire = excluded.adversaire, ko = excluded.ko, res = null;
  return public.surv_get(p_token);
end $$;

-- Règlement (appelé par le notifier toutes les 5 minutes) : renvoie les joueurs à prévenir
create or replace function public.surv_regler()
returns json language plpgsql security definer set search_path = public as $$
declare s public.surv_saison; ss public.surv_saison; rc record; r jsonb; h int; a int; gagne bool; d date; vivants_avant int; morts int;
        out jsonb := '[]'::jsonb; n int; pot int; part int; w record; jours_matchs date[];
begin
  s := public.surv_saison_cour();
  -- 1) résultats des choix
  for rc in select * from public.surv_choix where res is null and ko < now() - interval '100 minutes' loop
    r := public.surv_res(rc.fid);
    if r is null then
      if rc.ko < now() - interval '12 hours' then update public.surv_choix set res = 'a' where saison = rc.saison and joueur_id = rc.joueur_id and jour = rc.jour; end if;
      continue;
    end if;
    if jsonb_typeof(r) = 'object' then
      update public.surv_choix set res = 'a' where saison = rc.saison and joueur_id = rc.joueur_id and jour = rc.jour; continue;
    end if;
    h := (r->>0)::int; a := (r->>1)::int;
    select (m->>'h') = rc.equipe into gagne from public.fix_auto f, jsonb_array_elements(f.data) m
     where f.day = split_part(rc.fid, '_', 1) and m->>'id' = substr(rc.fid, 12) limit 1;
    gagne := case when gagne then h > a else a > h end;
    update public.surv_choix set res = case when gagne then 'v' else 'x' end where saison = rc.saison and joueur_id = rc.joueur_id and jour = rc.jour;
    out := out || jsonb_build_object('j', rc.joueur_id, 'ok', gagne, 'eq', rc.equipe);
  end loop;
  -- 2) éliminations, jour par jour, une fois tous les choix du jour réglés (et le jour terminé)
  for ss in select * from public.surv_saison where statut = 'ouvert' order by id loop
    for d in select gs::date from generate_series(ss.id::date, least(public.surv_auj() - 1, ss.id::date + 6), interval '1 day') gs loop
      if exists (select 1 from public.surv_choix where saison = ss.id and jour = d and res is null) then exit; end if;
      if not exists (select 1 from public.fix_auto f, jsonb_array_elements(f.data) m where f.day = to_char(d, 'YYYY-MM-DD') and coalesce(m->>'sp','foot') = 'foot') then continue; end if;
      select count(*) into vivants_avant from public.surv_joueur sj where sj.saison = ss.id and sj.vivant and sj.inscrit_le <= d;
      if vivants_avant = 0 then continue; end if;
      create temp table if not exists _morts (joueur_id bigint, raison text) on commit drop;
      delete from _morts;
      insert into _morts select sj.joueur_id, case when c.joueur_id is null then 'oubli' else c.equipe end
        from public.surv_joueur sj left join public.surv_choix c on c.saison = sj.saison and c.joueur_id = sj.joueur_id and c.jour = d
       where sj.saison = ss.id and sj.vivant and sj.inscrit_le <= d and (c.joueur_id is null or c.res = 'x');
      select count(*) into morts from _morts;
      if morts = 0 then continue; end if;
      if morts >= vivants_avant then
        -- tout le monde tombe le même jour : ils gagnent tous ensemble, fin de saison
        update public.surv_saison set statut = 'fini' where id = ss.id;
        exit;
      end if;
      update public.surv_joueur sj set vivant = false, elimine_le = d, raison = m.raison from _morts m where sj.saison = ss.id and sj.joueur_id = m.joueur_id;
      out := out || coalesce((select jsonb_agg(jsonb_build_object('j', joueur_id, 'elim', true, 'r', raison)) from _morts), '[]'::jsonb);
    end loop;
  end loop;
  -- 3) fin de saison : il ne reste qu'un survivant (sur au moins 2 inscrits), ou la semaine est finie et réglée
  for ss in select * from public.surv_saison where statut <> 'clos' order by id loop
    select count(*) filter (where vivant), count(*) into n, pot from public.surv_joueur where saison = ss.id;
    if ss.statut = 'ouvert' and not (n = 1 and pot >= 2) then
      if ss.id::date + 7 > public.surv_auj() then continue; end if;          -- semaine pas finie
      if exists (select 1 from public.surv_choix where saison = ss.id and res is null) then continue; end if;
    end if;
    pot := ss.cagnotte + 20000 * pot;
    select count(*) into n from public.surv_joueur sj join public.joueurs jj on jj.id = sj.joueur_id
     where sj.saison = ss.id and sj.vivant and not coalesce(jj.admin, false) and lower(jj.pseudo) <> 'mgdn367';
    if n > 0 then
      part := pot / n;
      for w in select sj.joueur_id from public.surv_joueur sj join public.joueurs jj on jj.id = sj.joueur_id
                where sj.saison = ss.id and sj.vivant and not coalesce(jj.admin, false) and lower(jj.pseudo) <> 'mgdn367' loop
        update public.surv_joueur set gain = part where saison = ss.id and joueur_id = w.joueur_id;
        update public.joueurs set bonus = bonus + part where id = w.joueur_id;
        out := out || jsonb_build_object('j', w.joueur_id, 'win', part);
      end loop;
    end if;
    update public.surv_saison set statut = 'clos', ferme_le = now() where id = ss.id;
  end loop;
  return out;
end $$;

-- Rappel du soir : survivants sans choix aujourd'hui alors qu'il reste des matchs
create or replace function public.surv_rappel()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(sj.joueur_id), '[]'::json) from public.surv_joueur sj
   where sj.saison = public.surv_id(public.surv_auj()) and sj.vivant and sj.inscrit_le <= public.surv_auj()
     and not exists (select 1 from public.surv_choix c where c.saison = sj.saison and c.joueur_id = sj.joueur_id and c.jour = public.surv_auj())
     and exists (select 1 from public.fix_auto f, jsonb_array_elements(f.data) m
                  where f.day = to_char(public.surv_auj(), 'YYYY-MM-DD') and coalesce(m->>'sp','foot') = 'foot' and (m->>'t')::timestamptz > now() + interval '30 minutes')
$$;

grant execute on function public.surv_get(uuid), public.surv_rejoindre(uuid), public.surv_choisir(uuid, text, text) to anon, authenticated;
revoke execute on function public.surv_regler(), public.surv_rappel() from anon, authenticated;

select 'ok' as resultat;
