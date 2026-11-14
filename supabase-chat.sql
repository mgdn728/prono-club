-- PronoClub : salon de discussion (à exécuter une fois dans Supabase > SQL Editor)
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  pseudo text not null,
  texte text not null,
  cree_le timestamptz not null default now()
);
create index if not exists messages_joueur_idx on public.messages (joueur_id, cree_le desc);

-- Personne ne lit ni n'écrit la table directement : tout passe par les fonctions ci-dessous.
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;

create or replace function public.chat_envoyer(p_token uuid, p_texte text)
returns json language plpgsql security definer set search_path = public as $$
declare j public.joueurs; m public.messages; dernier timestamptz;
begin
  select * into j from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  p_texte := btrim(regexp_replace(coalesce(p_texte, ''), '\s+', ' ', 'g'));
  if char_length(p_texte) = 0 then raise exception 'vide'; end if;
  if char_length(p_texte) > 300 then raise exception 'trop_long'; end if;
  select max(cree_le) into dernier from public.messages where joueur_id = j.id;
  if dernier is not null and dernier > now() - interval '3 seconds' then raise exception 'trop_vite'; end if;
  insert into public.messages (joueur_id, pseudo, texte) values (j.id, j.pseudo, p_texte) returning * into m;
  return json_build_object('id', m.id, 'pseudo', m.pseudo, 'texte', m.texte, 'cree_le', m.cree_le);
end $$;

create or replace function public.chat_lire(p_apres bigint default 0)
returns table (id bigint, pseudo text, texte text, cree_le timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.pseudo, t.texte, t.cree_le from (
    select m.id, m.pseudo, m.texte, m.cree_le from public.messages m
    where m.id > coalesce(p_apres, 0) order by m.id desc limit 100
  ) t order by t.id asc;
$$;

grant execute on function public.chat_envoyer(uuid, text), public.chat_lire(bigint) to anon, authenticated;
