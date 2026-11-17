-- PronoClub : l'administrateur reste toujours en bas des classements
-- et ne gagne jamais les récompenses (semaine, saison, tournoi du dimanche).
-- À exécuter une fois dans Supabase > SQL Editor (après supabase-admin.sql et supabase-pack2.sql).

-- Décoration + marqueur « adm » pour que l'appli sache le mettre en bas
create or replace function public.deco_classement(j public.joueurs) returns jsonb
language sql stable as $$
  select public.deco_de(j.etat) || case when coalesce(j.admin, false) then '{"adm":1}'::jsonb else '{}'::jsonb end
$$;

-- 1) Classement général et de la semaine : 50 meilleurs joueurs + l'admin tout en bas
create or replace function public.classement(p_semaine boolean default false)
returns table (pseudo text, diamants integer, gagnes integer, hebdo integer, deco jsonb)
language sql security definer set search_path = public as $$
  select pseudo, diamants, gagnes, hebdo, deco from (
    (select j.pseudo, j.diamants, j.gagnes,
            case when j.semaine = public.semaine_actuelle() then j.hebdo else 0 end as hebdo,
            public.deco_classement(j) as deco, 0 as a,
            case when p_semaine then j.hebdo else j.diamants end as sc, j.cree_le
       from public.joueurs j
      where not coalesce(j.admin, false)
        and (not p_semaine or (j.semaine = public.semaine_actuelle() and j.hebdo > 0))
      order by case when p_semaine then j.hebdo else j.diamants end desc, j.gagnes desc, j.cree_le asc
      limit 50)
    union all
    (select j.pseudo, j.diamants, j.gagnes,
            case when j.semaine = public.semaine_actuelle() then j.hebdo else 0 end,
            public.deco_classement(j), 1, 0, j.cree_le
       from public.joueurs j
      where coalesce(j.admin, false)
        and (not p_semaine or (j.semaine = public.semaine_actuelle() and j.hebdo > 0)))
  ) t
  order by a, sc desc, gagnes desc, cree_le asc;
$$;

-- 2) Classement de la saison (mois)
create or replace function public.classement_saison()
returns table (pseudo text, mensuel integer, gagnes integer, deco jsonb)
language sql security definer set search_path = public as $$
  select pseudo, mensuel, gagnes, deco from (
    (select j.pseudo, j.mensuel, j.gagnes, public.deco_classement(j) as deco, 0 as a, j.cree_le
       from public.joueurs j
      where not coalesce(j.admin, false) and j.mois = public.mois_actuel() and j.mensuel > 0
      order by j.mensuel desc, j.gagnes desc, j.cree_le asc limit 50)
    union all
    (select j.pseudo, j.mensuel, j.gagnes, public.deco_classement(j), 1, j.cree_le
       from public.joueurs j
      where coalesce(j.admin, false) and j.mois = public.mois_actuel() and j.mensuel > 0)
  ) t
  order by a, mensuel desc, gagnes desc, cree_le asc;
$$;

-- 3) Classement du blackjack
create or replace function public.classement_blackjack()
returns table(pseudo text, parties integer, gagnees integer, taux numeric, deco jsonb)
language sql security definer set search_path = public as $$
  select t.pseudo, t.n, t.w, round(100.0 * t.w / t.n, 1), t.deco
  from (
    select j.pseudo, j.cree_le, coalesce(j.admin, false) as a,
           coalesce((j.etat->'bjt'->>'n')::numeric, 0)::int as n,
           coalesce((j.etat->'bjt'->>'w')::numeric, 0)::int as w,
           jsonb_strip_nulls(jsonb_build_object('t', left(j.etat->>'title', 30), 'c', left(j.etat->>'nameFx', 20), 'f', left(j.etat->>'frame', 20)))
             || case when coalesce(j.admin, false) then '{"adm":1}'::jsonb else '{}'::jsonb end as deco
    from public.joueurs j
  ) t
  where t.n >= 10
  order by t.a, 4 desc, t.n desc, t.cree_le asc
  limit 50;
$$;

-- 4) Tournoi poker du dimanche
create or replace function public.tournoi_classement(p_jour date default null)
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(t order by t.a, t.v desc, t.ts asc), '[]'::json) from (
    select j.pseudo, public.deco_classement(j) deco, count(*)::int v, min(a.cree_le) ts, coalesce(j.admin, false)::int a
      from public.activites a join public.joueurs j on j.id = a.joueur_id
     where a.type = 'poker' and (a.cree_le at time zone 'Europe/Paris')::date = coalesce(p_jour, public.tournoi_jour())
     group by j.id order by coalesce(j.admin, false), count(*) desc, min(a.cree_le) asc limit 30) t;
$$;

-- 5) Récompenses de la semaine : l'admin est ignoré
create or replace function public.regler_semaines() returns void
language plpgsql security definer set search_path = public as $$
declare w text; deb text; cur text := public.semaine_actuelle(); r record; n integer; gains integer[] := array[10000, 5000, 3000];
begin
  perform pg_advisory_xact_lock(474747);
  select semaine into deb from public.recompenses_debut where id = 1;
  for w in
    select distinct s from (
      select semaine as s from public.hebdo_archive
      union select semaine from public.joueurs where semaine is not null and hebdo > 0
    ) t
    where s < cur and s >= coalesce(deb, cur) and s not in (select semaine from public.semaines_reglees)
    order by s
  loop
    n := 0;
    for r in
      select x.joueur_id, max(x.hebdo) as hebdo, j.pseudo
        from (select joueur_id, hebdo from public.hebdo_archive where semaine = w
              union all select id, hebdo from public.joueurs where semaine = w and hebdo > 0) x
        join public.joueurs j on j.id = x.joueur_id
       where not coalesce(j.admin, false)
       group by x.joueur_id, j.pseudo, j.gagnes, j.cree_le
      having max(x.hebdo) > 0
       order by max(x.hebdo) desc, j.gagnes desc, j.cree_le asc
       limit 3
    loop
      n := n + 1;
      insert into public.recompenses_semaine (semaine, rang, joueur_id, hebdo, montant)
      values (w, n, r.joueur_id, r.hebdo, gains[n]) on conflict do nothing;
      begin
        perform public.ami_notif(r.joueur_id, '🏆 Vous finissez ' || case n when 1 then '1er' else n || 'e' end || ' de la semaine !',
          'Vous gagnez ' || gains[n] || ' pièces. Ouvrez PronoClub pour les récupérer.', '?classement');
      exception when others then null;
      end;
    end loop;
    insert into public.semaines_reglees (semaine) values (w) on conflict do nothing;
  end loop;
end $$;

-- 6) Récompenses de la saison : l'admin est ignoré
create or replace function public.regler_saisons() returns void
language plpgsql security definer set search_path = public as $$
declare w text; deb text; cur text := public.mois_actuel(); r record; n integer; gains integer[] := array[20000, 10000, 5000];
begin
  perform pg_advisory_xact_lock(484848);
  select mois into deb from public.saison_debut where id = 1;
  for w in select distinct s from (select mois as s from public.mensuel_archive union select mois from public.joueurs where mois is not null and mensuel > 0) t
           where s < cur and s >= coalesce(deb, cur) and s not in (select mois from public.saisons_reglees) order by s loop
    n := 0;
    for r in select x.joueur_id, max(x.sc) sc from (select joueur_id, mensuel sc from public.mensuel_archive where mois = w
               union all select id, mensuel from public.joueurs where mois = w and mensuel > 0) x
               join public.joueurs j on j.id = x.joueur_id
              where not coalesce(j.admin, false)
              group by x.joueur_id, j.gagnes, j.cree_le
             having max(x.sc) > 0 order by max(x.sc) desc, j.gagnes desc, j.cree_le asc limit 3 loop
      n := n + 1;
      insert into public.saison_recompenses (mois, rang, joueur_id, score, montant) values (w, n, r.joueur_id, r.sc, gains[n]) on conflict do nothing;
      begin perform public.ami_notif(r.joueur_id, '🏆 Saison terminée : tu finis ' || case n when 1 then '1er' else n || 'e' end || ' !',
        'Tu gagnes ' || gains[n] || ' pièces. Ouvre PronoClub pour les récupérer.', '?classement'); exception when others then null; end;
      begin insert into public.activites (joueur_id, type, data) values (r.joueur_id, 'saison', jsonb_build_object('rang', n, 'gain', gains[n], 'mois', w));
      exception when others then null; end;
    end loop;
    insert into public.saisons_reglees (mois) values (w) on conflict do nothing;
  end loop;
end $$;

-- 7) Tournoi du dimanche : l'admin est ignoré
create or replace function public.regler_tournois() returns void
language plpgsql security definer set search_path = public as $$
declare d date; r record; n integer; gains integer[] := array[10000, 5000, 3000];
begin
  perform pg_advisory_xact_lock(494949);
  for d in select distinct (a.cree_le at time zone 'Europe/Paris')::date from public.activites a
           where a.type = 'poker' and extract(isodow from (a.cree_le at time zone 'Europe/Paris')) = 7
             and (a.cree_le at time zone 'Europe/Paris')::date < (now() at time zone 'Europe/Paris')::date
             and (a.cree_le at time zone 'Europe/Paris')::date not in (select jour from public.tournois_regles) loop
    n := 0;
    for r in select a.joueur_id, count(*)::int v from public.activites a
               join public.joueurs j on j.id = a.joueur_id
              where a.type = 'poker' and (a.cree_le at time zone 'Europe/Paris')::date = d
                and not coalesce(j.admin, false)
              group by a.joueur_id order by count(*) desc, min(a.cree_le) asc limit 3 loop
      n := n + 1;
      insert into public.tournoi_recompenses (jour, rang, joueur_id, victoires, montant) values (d, n, r.joueur_id, r.v, gains[n]) on conflict do nothing;
      perform public.ami_notif(r.joueur_id, '♠️ Tournoi du dimanche : tu finis ' || case n when 1 then '1er' else n || 'e' end || ' !', 'Tu gagnes ' || gains[n] || ' pièces.', '?jeux');
    end loop;
    insert into public.tournois_regles (jour) values (d) on conflict do nothing;
  end loop;
end $$;

revoke all on function public.regler_semaines(), public.regler_saisons(), public.regler_tournois() from public, anon, authenticated;
grant execute on function public.classement(boolean), public.classement_saison(), public.classement_blackjack(),
  public.tournoi_classement(date) to anon, authenticated;

-- Vérification : mgdn367 doit apparaître en dernier
select pseudo, diamants from public.classement(false);
