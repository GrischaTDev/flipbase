-- ==============================================================================
-- zugriffsrechte fuer die api-rollen
--
-- zweck:
--   die tabellen im schema public wurden angelegt, ohne den rollen der
--   supabase-api (authenticated, service_role) rechte zu erteilen. dadurch
--   antwortete jede abfrage ueber postgrest mit
--     42501 - permission denied for table <name>
--   also noch bevor row level security ueberhaupt ausgewertet wurde.
--
--   im frontend fiel das nicht auf, weil saemtliche datenbankaufrufe in leeren
--   catch-bloecken enden. die anwendung ist deshalb stillschweigend auf den
--   localStorage zurueckgefallen - die datenbank war nie in benutzung.
--
-- betroffen: alle tabellen, sequenzen und funktionen im schema public
--
-- hinweis zur rolle anon:
--   anon erhaelt bewusst KEINE rechte. es gibt derzeit keine tabelle, die ohne
--   anmeldung lesbar sein soll, und saemtliche policies sind auf
--   "to authenticated" ausgelegt. sollte der oeffentliche shop spaeter lesenden
--   zugriff brauchen, wird das gezielt fuer die betroffenen tabellen ergaenzt -
--   nicht pauschal hier.
-- ==============================================================================

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant all
  on all tables in schema public
  to service_role;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

grant execute
  on all functions in schema public
  to authenticated, service_role;

-- kuenftig angelegte objekte automatisch mitversorgen, damit dieselbe luecke
-- nicht bei der naechsten tabelle erneut entsteht.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to authenticated, service_role;
