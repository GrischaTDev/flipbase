-- Zweck: Alten Browser-Schreibweg fuer zentrale Sammelauftraege sperren.
-- Betroffen: Ausfuehrungsrecht von create_sniper_subscription; Bestandsdaten bleiben erhalten.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

revoke all on function public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric) from authenticated;
