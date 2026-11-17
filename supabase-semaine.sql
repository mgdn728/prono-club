-- PronoClub : récompenses du classement de la semaine
-- 1er : 10 000 pièces · 2e : 5 000 pièces · 3e : 3 000 pièces, versées dès que la semaine est finie (lundi).
-- À exécuter une fois dans Supabase > SQL Editor (après supabase-social.sql).

-- Score final de chaque joueur, gardé quand sa semaine change
create table if not exists public.hebdo_archive (
  semaine text not null,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  hebdo integer not null,
  primary key (semaine, joueur_id)
);

-- Récompenses à verser
create table if not exists public.recompenses_semaine (
  semaine text not null,
  rang integer not null,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  hebdo integer not null,
  montant integer not null,
  recu boolean not null default false,
  primary key (semaine, rang)
);
create index if not exists recompenses_joueur_idx on public.recompenses_semaine (joueur_id) where not recu;

-- Semaines déjà réglées (et semaine de départ des récompenses)
create table if not exists public.semaines_reglees (semaine text primary key, regle_le timestamptz not null default now());
create table if not exists public.recompenses_debut (id integer primary key default 1 check (id = 1), semaine text not null);
insert into public.recompenses_debut (semaine) values (public.semaine_actuelle()) on conflict (id) do nothing;

alter table public.hebdo_archive enable row level security;
alter table public.recompenses_semaine enable row level security;
alter table public.semaines_reglees enable row level security;
alter table public.recompenses_debut enable row level security;
revoke all on public.hebdo_archive, public.recompenses_semaine, public.semaines_reglees, public.recompenses_debut from anon, authenticated;

create or replace function public.archiver_hebdo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.semaine is not null and new.semaine is distinct from old.semaine and old.hebdo > 0 then
    insert into public.hebdo_archive (semaine, joueur_id, hebdo) values (old.semaine, old.id, old.hebdo)
    on conflict (semaine, joueur_id) do update set hebdo = greatest(public.hebdo_archive.hebdo, excluded.hebdo);
  end if;
  return new;
end $$;
drop trigger if exists archiver_hebdo on public.joueurs;
create trigger archiver_hebdo before update on public.joueurs for each row execute function public.archiver_hebdo();

-- Règle les semaines terminées (appelée automatiquement, plusieurs appels sans risque)
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
revoke all on function public.regler_semaines(), public.archiver_hebdo() from public, anon, authenticated;

-- Récupérer mes récompenses (une seule fois)
create or replace function public.recompenses_recevoir(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  select * into m from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  perform public.regler_semaines();
  with c as (
    update public.recompenses_semaine set recu = true where joueur_id = m.id and not recu returning semaine, rang, montant
  )
  select json_agg(json_build_object('semaine', semaine, 'rang', rang, 'montant', montant) order by semaine) into r from c;
  return coalesce(r, '[]'::json);
end $$;

-- Podium de la semaine dernière (affiché dans le classement)
create or replace function public.podium_semaine()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform public.regler_semaines();
  select json_agg(json_build_object('rang', s.rang, 'pseudo', j.pseudo, 'montant', s.montant, 'hebdo', s.hebdo) order by s.rang) into r
    from public.recompenses_semaine s join public.joueurs j on j.id = s.joueur_id
   where s.semaine = (select max(semaine) from public.recompenses_semaine);
  return coalesce(r, '[]'::json);
end $$;

grant execute on function public.recompenses_recevoir(uuid), public.podium_semaine() to anon, authenticated;
