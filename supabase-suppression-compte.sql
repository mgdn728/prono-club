-- PronoClub : bouton « Supprimer mon compte » (menu du profil)
-- Le joueur confirme avec son mot de passe ; tout ce qui le concerne est effacé (amis, messages, paris, classements…).
-- À exécuter une fois dans Supabase > SQL Editor.

create or replace function public.compte_supprimer(p_token uuid, p_mdp text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare j public.joueurs;
begin
  select * into j from public.joueurs where token = p_token;
  if not found then raise exception 'session'; end if;
  if j.hash is null or j.hash <> crypt(coalesce(p_mdp, ''), j.hash) then raise exception 'mdp'; end if;
  if coalesce(j.admin, false) then raise exception 'admin'; end if;
  delete from public.joueurs where id = j.id;
  return json_build_object('ok', true);
end $$;
grant execute on function public.compte_supprimer(uuid, text) to anon, authenticated;

select 'ok' as resultat;
