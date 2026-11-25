-- Méga-jackpot commun des mini-jeux (à lancer une fois dans Supabase > SQL Editor)
create table if not exists public.jackpot (
  id int primary key default 1,
  pot bigint not null default 1000000,
  gagnant text,
  gagne_le timestamptz,
  montant bigint
);
insert into public.jackpot (id) values (1) on conflict do nothing;

create table if not exists public.jackpot_coup (
  joueur_id bigint primary key,
  t timestamptz not null default now()
);
alter table public.jackpot enable row level security;
alter table public.jackpot_coup enable row level security;

create or replace function public.jp_etat()
returns json language sql security definer set search_path = public as $$
  select json_build_object('pot', pot, 'gagnant', gagnant, 'gagne_le', gagne_le, 'montant', montant, 'gain', 0)
  from public.jackpot where id = 1;
$$;

create or replace function public.jp_jouer(p_token uuid, p_mise bigint)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; jp public.jackpot; last timestamptz; g bigint := 0; m bigint;
begin
  j := public.ami_moi(p_token);
  m := least(greatest(coalesce(p_mise, 0), 100), 5000000);
  select t into last from public.jackpot_coup where joueur_id = j.id;
  if last is not null and now() - last < interval '1200 milliseconds' then
    return public.jp_etat();
  end if;
  insert into public.jackpot_coup (joueur_id, t) values (j.id, now())
    on conflict (joueur_id) do update set t = now();
  select * into jp from public.jackpot where id = 1 for update;
  update public.jackpot set pot = pot + greatest(1, round(m * 0.02)) where id = 1 returning * into jp;
  -- 1 chance sur 3000, plus de chances avec une grosse mise ; jamais pour l'administrateur
  if not coalesce(j.admin, false) and lower(j.pseudo) <> 'mgdn367'
     and random() < (1.0 / 3000) * least(3.0, greatest(0.5, m / 100000.0)) then
    g := jp.pot;
    update public.jackpot set pot = 1000000, gagnant = j.pseudo, gagne_le = now(), montant = g where id = 1 returning * into jp;
  end if;
  return json_build_object('pot', jp.pot, 'gagnant', jp.gagnant, 'gagne_le', jp.gagne_le, 'montant', jp.montant, 'gain', g);
end $$;

grant execute on function public.jp_etat(), public.jp_jouer(uuid, bigint) to anon, authenticated;

select 'ok' as resultat;
