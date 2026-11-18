-- PronoClub : formulaire de la page Contact (les messages arrivent dans « Admin · bugs signalés »)
-- À exécuter une fois dans Supabase > SQL Editor.

create or replace function public.contact_envoyer(p_nom text, p_email text, p_texte text)
returns json language plpgsql security definer set search_path = public as $$
declare n integer; t text := btrim(coalesce(p_texte, '')); nm text := left(btrim(coalesce(p_nom, '')), 60); em text := left(btrim(coalesce(p_email, '')), 120); a record;
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email'; end if;
  if length(t) < 5 then raise exception 'trop_court'; end if;
  select count(*) into n from public.bugs where joueur_id is null and cree_le > now() - interval '1 hour';
  if n >= 20 then raise exception 'trop_de_messages'; end if;
  insert into public.bugs (joueur_id, pseudo, texte, info)
  values (null, '✉️ ' || coalesce(nullif(nm, ''), 'Contact'), '✉️ Message de contact — répondre à : ' || em || E'\n\n' || left(t, 1500), json_build_object('page', 'contact', 'email', em)::jsonb);
  for a in select id from public.joueurs where coalesce(admin, false) loop
    perform public.ami_notif(a.id, '✉️ Nouveau message de contact', left(t, 120), '?');
  end loop;
  return json_build_object('ok', true);
end $$;
grant execute on function public.contact_envoyer(text, text, text) to anon, authenticated;

-- les messages de contact (avec email) sont effacés au bout de 12 mois
select cron.unschedule('pronoclub-contact-menage') where exists (select 1 from cron.job where jobname = 'pronoclub-contact-menage');
select cron.schedule('pronoclub-contact-menage', '41 4 * * *', $$
  delete from public.bugs where joueur_id is null and cree_le < now() - interval '12 months';
$$);

select 'ok' as resultat;
