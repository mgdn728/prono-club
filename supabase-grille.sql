-- PronoClub : « La Grille du jour » avec cagnotte
-- Chaque matin, Supabase choisit 5 à 7 gros matchs du jour. Chaque joueur remplit gratuitement sa grille (1, N ou 2).
-- Grille parfaite : la cagnotte est partagée entre les gagnants. Personne ? La cagnotte grimpe de 250 000 💎 le lendemain.
-- Une erreur : 150 000 💎 à partager (20 000 💎 maximum chacun). Deux erreurs (grille de 6 ou 7 matchs) : 2 000 💎.
-- À exécuter une fois dans Supabase > SQL Editor.

alter table public.joueurs add column if not exists bonus_dia integer not null default 0;

create table if not exists public.grille (
  day date primary key,
  matchs jsonb not null,
  cagnotte bigint not null,
  limite timestamptz not null,
  statut text not null default 'ouverte',
  res jsonb,
  gagnants jsonb,
  cree_le timestamptz not null default now()
);
create table if not exists public.grille_jeu (
  day date not null references public.grille(day) on delete cascade,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  choix text not null,
  bons integer,
  gain integer not null default 0,
  maj timestamptz not null default now(),
  primary key (day, joueur_id)
);
alter table public.grille enable row level security;
alter table public.grille_jeu enable row level security;
revoke all on public.grille, public.grille_jeu from anon, authenticated;

-- récupérer les bonus (parrainage, grille…) : pièces et diamants
create or replace function public.bonus_recuperer(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare b integer; d integer; f integer;
begin
  select bonus, bonus_dia, filleuls into b, d, f from public.joueurs where token = p_token for update;
  if not found then raise exception 'session'; end if;
  if b > 0 or d > 0 then update public.joueurs set bonus = 0, bonus_dia = 0 where token = p_token; end if;
  return json_build_object('bonus', b, 'dia', d, 'filleuls', f);
end $$;

-- résumé d'une grille pour l'appli
create or replace function public.grille_resume(g public.grille, p_joueur bigint)
returns json language plpgsql stable security definer set search_path = public as $$
declare n integer := jsonb_array_length(g.matchs); r json; mj public.grille_jeu; st json := null;
begin
  if p_joueur is not null then select * into mj from public.grille_jeu where day = g.day and joueur_id = p_joueur; end if;
  if now() >= g.limite then -- les choix des joueurs ne sont montrés qu'après la fermeture
    select json_agg(json_build_array(
      (select count(*) from public.grille_jeu j where j.day = g.day and substr(j.choix, i + 1, 1) = '1'),
      (select count(*) from public.grille_jeu j where j.day = g.day and substr(j.choix, i + 1, 1) = 'N'),
      (select count(*) from public.grille_jeu j where j.day = g.day and substr(j.choix, i + 1, 1) = '2')) order by i)
      into st from generate_series(0, n - 1) i;
  end if;
  select json_build_object(
    'day', to_char(g.day, 'YYYY-MM-DD'), 'matchs', g.matchs, 'cagnotte', g.cagnotte,
    'limite', (extract(epoch from g.limite) * 1000)::bigint, 'statut', g.statut, 'res', g.res, 'gagnants', g.gagnants,
    'joueurs', (select count(*) from public.grille_jeu j where j.day = g.day),
    'stats', st,
    'moi', case when mj.joueur_id is null then null else json_build_object('choix', mj.choix, 'bons', mj.bons, 'gain', mj.gain) end
  ) into r;
  return r;
end $$;

create or replace function public.grille_get(p_token uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare jid bigint; g public.grille; h public.grille; auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if p_token is not null then select id into jid from public.joueurs where token = p_token; end if;
  select * into g from public.grille where day = auj;
  select * into h from public.grille where day < auj order by day desc limit 1;
  return json_build_object(
    'auj', case when g.day is null then null else public.grille_resume(g, jid) end,
    'hier', case when h.day is null then null else public.grille_resume(h, jid) end);
end $$;
grant execute on function public.grille_get(uuid) to anon, authenticated;

create or replace function public.grille_jouer(p_token uuid, p_choix text)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; g public.grille; auj date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into j from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  select * into g from public.grille where day = auj;
  if not found then raise exception 'pas_de_grille'; end if;
  if now() >= g.limite or g.statut <> 'ouverte' then raise exception 'grille_fermee'; end if;
  if p_choix !~ '^[1N2]+$' or char_length(p_choix) <> jsonb_array_length(g.matchs) then raise exception 'grille_incomplete'; end if;
  insert into public.grille_jeu (day, joueur_id, choix) values (auj, j.id, p_choix)
    on conflict (day, joueur_id) do update set choix = excluded.choix, maj = now();
  return json_build_object('ok', true);
end $$;
grant execute on function public.grille_jouer(uuid, text) to anon, authenticated;

-- création de la grille du jour (appelée par la fonction notifier)
create or replace function public.grille_creer(p_day date, p_matchs jsonb, p_limite timestamptz)
returns json language plpgsql security definer set search_path = public as $$
declare prev public.grille; cag bigint;
begin
  if exists (select 1 from public.grille where day = p_day) then return json_build_object('ok', false); end if;
  select * into prev from public.grille where day < p_day order by day desc limit 1;
  if prev.day is not null and prev.statut <> 'finie' and prev.day >= p_day - 2 then return json_build_object('ok', false, 'attente', true); end if;
  cag := case when prev.day is null or prev.statut <> 'finie' then 500000
              when coalesce((prev.gagnants->>'w7')::int, 0) > 0 then 500000
              else least(prev.cagnotte + 250000, 10000000) end;
  insert into public.grille (day, matchs, cagnotte, limite) values (p_day, p_matchs, cag, p_limite);
  insert into public.notifs (joueur_id, type, titre, texte, url)
    select distinct a.joueur_id, 'defi', '🎰 La grille du jour est ouverte !',
      'Cagnotte : ' || to_char(cag, 'FM999G999G999') || ' 💎. Trouve les ' || jsonb_array_length(p_matchs) || ' résultats pour la remporter. C''est gratuit !', '?grille'
      from public.abonnements a;
  return json_build_object('ok', true, 'cagnotte', cag);
end $$;

-- règlement quand tous les résultats sont connus (appelé par la fonction notifier)
create or replace function public.grille_regler(p_day date, p_res jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare g public.grille; n integer; w7 integer; w6 integer; part7 bigint; part6 bigint; nj integer;
begin
  select * into g from public.grille where day = p_day for update;
  if not found or g.statut = 'finie' then return json_build_object('ok', false); end if;
  n := jsonb_array_length(g.matchs);
  update public.grille_jeu jj set bons = (select count(*) from generate_series(0, n - 1) i
      where jsonb_typeof(p_res->i) = 'null' or substr(jj.choix, i + 1, 1) = (p_res->>i))
    where jj.day = p_day;
  select count(*) into w7 from public.grille_jeu jj join public.joueurs p on p.id = jj.joueur_id where jj.day = p_day and jj.bons = n and not coalesce(p.admin, false);
  select count(*) into w6 from public.grille_jeu jj join public.joueurs p on p.id = jj.joueur_id where jj.day = p_day and jj.bons = n - 1 and not coalesce(p.admin, false);
  select count(*) into nj from public.grille_jeu where day = p_day;
  part7 := case when w7 > 0 then g.cagnotte / w7 else 0 end;
  part6 := case when w6 > 0 then least(20000, 150000 / w6) else 0 end;
  update public.grille_jeu jj set gain = case when jj.bons = n then part7 when jj.bons = n - 1 then part6 when jj.bons = n - 2 and n >= 6 then 2000 else 0 end
    from public.joueurs p where p.id = jj.joueur_id and jj.day = p_day and not coalesce(p.admin, false);
  update public.joueurs p set bonus_dia = p.bonus_dia + jj.gain from public.grille_jeu jj where jj.day = p_day and jj.joueur_id = p.id and jj.gain > 0;
  insert into public.notifs (joueur_id, type, titre, texte, url)
    select jj.joueur_id, 'defi',
      case when jj.bons = n then '🎰 JACKPOT ! Grille parfaite !' when jj.gain > 0 then '🎰 Grille du jour : ' || jj.bons || '/' || n else '🎰 Grille du jour : ' || jj.bons || '/' || n end,
      case when jj.gain > 0 then 'Tu gagnes ' || to_char(jj.gain, 'FM999G999G999') || ' 💎 ! Ouvre PronoClub pour les récupérer.'
           when w7 = 0 then 'Personne n''a trouvé la grille parfaite : la cagnotte grimpe demain !'
           else 'Retente ta chance demain, une nouvelle grille t''attend.' end, '?grille'
      from public.grille_jeu jj where jj.day = p_day;
  update public.grille set statut = 'finie', res = p_res,
    gagnants = json_build_object('n', n, 'w7', w7, 'part7', part7, 'w6', w6, 'part6', part6, 'joueurs', nj)::jsonb
    where day = p_day;
  return json_build_object('ok', true, 'w7', w7, 'w6', w6);
end $$;
revoke all on function public.grille_creer(date, jsonb, timestamptz), public.grille_regler(date, jsonb) from public, anon, authenticated;
grant execute on function public.grille_creer(date, jsonb, timestamptz), public.grille_regler(date, jsonb) to service_role;

select 'ok' as resultat;
