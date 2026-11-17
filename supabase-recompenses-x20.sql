-- PronoClub : récompenses des classements ×20
-- Semaine : 200 000 / 100 000 / 60 000 pièces · Saison : 400 000 / 200 000 / 100 000 · Tournoi du dimanche : 200 000 / 100 000 / 60 000
-- À exécuter une fois dans Supabase > SQL Editor (après supabase-admin-classement.sql). L'admin reste exclu des récompenses.

-- 5) Récompenses de la semaine : l'admin est ignoré
create or replace function public.regler_semaines() returns void
language plpgsql security definer set search_path = public as $$
declare w text; deb text; cur text := public.semaine_actuelle(); r record; n integer; gains integer[] := array[200000, 100000, 60000];
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
declare w text; deb text; cur text := public.mois_actuel(); r record; n integer; gains integer[] := array[400000, 200000, 100000];
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
declare d date; r record; n integer; gains integer[] := array[200000, 100000, 60000];
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
select 'ok' as resultat;
