-- Entfernt den nachweislich leeren alten Inseratsentwurfsspeicher.
-- Betroffene Tabelle: public.listing_drafts.
-- Der Schutz bricht vor jeder Änderung ab, falls nach der Produktionsprüfung neue Daten entstanden sind.
-- Der exklusive Lock schließt parallele Altschreibwege bis zur Leerprüfung und Löschung aus.

lock table public.listing_drafts in access exclusive mode;

do $$
begin
  if exists (select 1 from public.listing_drafts) then
    raise exception using
      errcode = '55000',
      message = 'listing_drafts enthält nach der geprüften Leerstandsprüfung wieder Daten; Migration vor dem Löschen abbrechen.';
  end if;
end;
$$;

drop trigger "00_protect_archived_workspace" on public.listing_drafts;

drop policy "Inseratsentwuerfe lesen" on public.listing_drafts;

drop policy "Inseratsentwurf aendern" on public.listing_drafts;

drop policy "Inseratsentwurf anlegen" on public.listing_drafts;

drop policy "Inseratsentwurf loeschen" on public.listing_drafts;

drop table public.listing_drafts;
