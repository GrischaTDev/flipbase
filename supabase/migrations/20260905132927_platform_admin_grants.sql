-- Betreiberbereich: Tabellenrechte von Hand nachziehen.
--
-- Betroffen: public.platform_operators, public.beta_applications,
-- public.beta_application_attempts.
--
-- Warum von Hand: Die Rolle postgres traegt in dieser Datenbank einen
-- Standard-ACL-Eintrag (pg_default_acl), der jeder neu angelegten Tabelle im
-- Schema public automatisch alle Rechte fuer authenticated und service_role
-- mitgibt. supabase/schemas/96_platform_admin.sql widerspricht dem zwar mit
-- "revoke all ... from authenticated" vor den engeren "grant"-Zeilen, aber
-- "supabase db diff" bildet Rechte-Anweisungen nicht zuverlaessig ab und hat
-- die revoke-Zeilen nicht in die erzeugte Migration
-- 20260905132539_platform_admin.sql uebernommen. Ohne diese Nachbesserung
-- behaelt authenticated auf allen drei Tabellen saemtliche Rechte
-- (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) statt der
-- vorgesehenen engen Auswahl - zurueckgelesen aus der frisch eingespielten
-- lokalen Datenbank vor dieser Migration.

revoke all on table public.platform_operators from anon, public;
revoke all on table public.platform_operators from authenticated;
revoke all on table public.beta_applications from anon, public;
revoke all on table public.beta_applications from authenticated;
revoke all on table public.beta_application_attempts from anon, public;
revoke all on table public.beta_application_attempts from authenticated;

grant select on table public.platform_operators to authenticated;
grant select, update on table public.beta_applications to authenticated;
