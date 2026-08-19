-- ==============================================================================
-- fremdschluessel workspace_members -> profiles
--
-- zweck:
--   das frontend laedt die teammitglieder mit einer verknuepften abfrage:
--       .select('id, workspace_id, user_id, role, profile:profiles(email, full_name)')
--   dafuer muss postgrest eine beziehung zwischen den beiden tabellen kennen.
--   die spalte user_id verweist bisher ausschliesslich auf auth.users, weshalb
--   jede abfrage mit
--       PGRST200 - Could not find a relationship between 'workspace_members'
--                  and 'profiles' in the schema cache
--   abbrach. die mitgliederliste blieb dadurch dauerhaft leer.
--
-- betroffen: public.workspace_members
--
-- hinweis: der bestehende verweis auf auth.users bleibt erhalten. profiles.id
--          ist selbst ein verweis auf auth.users(id), beide bedingungen
--          koennen also nebeneinander bestehen. der registrierungs-trigger
--          handle_new_user() legt das profil an, bevor die mitgliedschaft
--          entsteht - die reihenfolge passt.
-- ==============================================================================

alter table public.workspace_members
  add constraint workspace_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

comment on constraint workspace_members_user_id_profiles_fkey on public.workspace_members is
  'Ermoeglicht die verknuepfte Abfrage der Mitglieder mit ihren Profildaten ueber PostgREST.';
