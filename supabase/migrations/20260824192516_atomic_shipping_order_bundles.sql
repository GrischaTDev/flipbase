-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

REVOKE ALL ON FUNCTION public.bundle_shipping_orders(uuid, uuid[], text, date, text, text, text, text, numeric, jsonb, text, text, text[], text) FROM service_role;

REVOKE ALL ON FUNCTION public.unbundle_shipping_order(uuid, uuid) FROM service_role;