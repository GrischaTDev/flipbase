-- Self-Hosting vergibt historisch direkte Rechte an anon. Ein Entzug von
-- PUBLIC allein entfernt diese nicht. Fachliche Daten sind ausschließlich
-- für angemeldete Benutzer vorgesehen; deren Grants und RLS bleiben bestehen.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all functions in schema public from anon;

-- Neue Objekte des Migrationsbenutzers dürfen diese Altfreigaben nicht erben.
-- Supabase-interne Schemas und Rollen werden nicht verändert.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on functions from anon;
