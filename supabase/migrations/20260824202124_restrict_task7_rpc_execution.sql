-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

REVOKE ALL ON FUNCTION public.book_bank_transaction(uuid, uuid, timestamp WITH time zone, uuid) FROM service_role;

REVOKE ALL ON FUNCTION public.place_store_order(uuid, uuid, text, jsonb, numeric, numeric, numeric, text, text, text, text, date, text, jsonb) FROM service_role;

REVOKE ALL ON FUNCTION public.replace_bank_transactions(uuid, jsonb) FROM service_role;