-- PronoClub : envoyer des pièces à un ami
-- À exécuter une fois dans Supabase > SQL Editor (après supabase-amis.sql).
-- L'envoyeur est débité tout de suite. Le receveur récupère les pièces dès qu'il ouvre l'appli.

create table if not exists public.cadeaux_pieces (
  id bigint generated always as identity primary key,
  de_id bigint not null references public.joueurs(id) on delete cascade,
  a_id bigint not null references public.joueurs(id) on delete cascade,
  montant integer not null check (montant > 0),
  recu boolean not null default false,
  cree_le timestamptz not null default now()
);
create index if not exists cadeaux_a_idx on public.cadeaux_pieces (a_id) where not recu;
create index if not exists cadeaux_de_idx on public.cadeaux_pieces (de_id, cree_le);

alter table public.cadeaux_pieces enable row level security;
revoke all on public.cadeaux_pieces from anon, authenticated;

-- Envoyer des pièces (10 minimum, 5 000 maximum envoyées par jour)
create or replace function public.pieces_envoyer(p_token uuid, p_pseudo text, p_montant integer)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; o public.joueurs; auj text; solde integer; deja integer; plafond constant integer := 5000;
begin
  m := public.ami_moi(p_token); o := public.ami_autre(p_pseudo);
  if m.id = o.id then raise exception 'soi_meme'; end if;
  if not exists (select 1 from public.amis where statut = 'ok'
      and least(demandeur_id, receveur_id) = least(m.id, o.id)
      and greatest(demandeur_id, receveur_id) = greatest(m.id, o.id)) then
    raise exception 'pas_amis';
  end if;
  if p_montant is null or p_montant < 10 then raise exception 'montant_min'; end if;

  select * into m from public.joueurs where id = m.id for update;
  auj := to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD');
  if coalesce(m.etat->>'day', '') <> auj then raise exception 'resync'; end if;
  solde := coalesce((m.etat->>'coins')::int, 0);
  if p_montant > solde then raise exception 'pas_assez'; end if;

  select coalesce(sum(montant), 0) into deja from public.cadeaux_pieces
   where de_id = m.id and (cree_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date;
  if deja + p_montant > plafond then raise exception 'plafond'; end if;

  update public.joueurs
     set etat = jsonb_set(jsonb_set(m.etat, '{coins}', to_jsonb(solde - p_montant)), '{updated}',
                          to_jsonb((extract(epoch from now()) * 1000)::bigint)),
         maj_le = now()
   where id = m.id;
  insert into public.cadeaux_pieces (de_id, a_id, montant) values (m.id, o.id, p_montant);
  perform public.ami_notif(o.id, '🪙 ' || m.pseudo || ' vous envoie ' || p_montant || ' pièces',
                           'Ouvrez PronoClub pour les recevoir.', '?amis');
  return json_build_object('pieces', solde - p_montant, 'reste', plafond - deja - p_montant);
end $$;

-- Récupérer les pièces reçues (une seule fois)
create or replace function public.pieces_recevoir(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m public.joueurs; r json;
begin
  m := public.ami_moi(p_token);
  with c as (
    update public.cadeaux_pieces set recu = true where a_id = m.id and not recu returning de_id, montant
  )
  select json_agg(json_build_object('de', j.pseudo, 'montant', t.total)) into r
    from (select de_id, sum(montant)::int as total from c group by de_id) t
    join public.joueurs j on j.id = t.de_id;
  return coalesce(r, '[]'::json);
end $$;

grant execute on function public.pieces_envoyer(uuid, text, integer), public.pieces_recevoir(uuid) to anon, authenticated;
