\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select has_column('public', 'purchase_lines', 'ean_snapshot', 'Einkaufspositionen speichern optionale EAN');
select has_function('public', 'is_valid_gtin', array['text'], 'GTIN-Prüfung ist serverseitig vorhanden');
select ok(public.is_valid_gtin('036000291452'), 'Gültige GTIN-13 wird angenommen');
select ok(public.is_valid_gtin('00012348'), 'Gültige GTIN-8 mit führenden Nullen wird angenommen');
select ok(not public.is_valid_gtin('036000291453'), 'Falsche Prüfziffer wird abgelehnt');
select ok(not public.is_valid_gtin('03600029145A'), 'Nichtnumerische GTIN wird abgelehnt');
select has_function('public', 'set_purchase_line_eans', array['uuid', 'jsonb'], 'EAN-Zuordnungs-RPC ist vorhanden');
select ok(not has_function_privilege('anon', 'public.set_purchase_line_eans(uuid,jsonb)', 'execute'), 'Anonym keine EAN-RPC');
select * from finish();
rollback;
