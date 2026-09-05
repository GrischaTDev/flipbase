-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

REVOKE ALL ON FUNCTION public.migrate_purchase_costing_legacy(uuid, boolean, uuid, text) FROM service_role;

REVOKE ALL ON FUNCTION public.preview_purchase_cost_repair(uuid, uuid) FROM service_role;