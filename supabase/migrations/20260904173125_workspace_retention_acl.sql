-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

REVOKE ALL ON FUNCTION public.archive_workspace(uuid) FROM service_role;

REVOKE ALL ON FUNCTION public.protect_archived_workspace_data() FROM authenticated;

REVOKE ALL ON FUNCTION public.protect_archived_workspace_data() FROM service_role;

REVOKE ALL ON FUNCTION public.protect_workspace_archive_state() FROM authenticated;

REVOKE ALL ON FUNCTION public.protect_workspace_archive_state() FROM service_role;

REVOKE ALL ON FUNCTION public.restore_workspace(uuid) FROM service_role;

REVOKE ALL ON FUNCTION public.set_workspace_archive_state(uuid, boolean) FROM authenticated;

REVOKE ALL ON FUNCTION public.set_workspace_archive_state(uuid, boolean) FROM service_role;