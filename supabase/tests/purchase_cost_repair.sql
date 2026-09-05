\set ON_ERROR_STOP on
begin;
select plan(8);
select has_function('public', 'preview_purchase_cost_repair', array['uuid', 'uuid'], 'Einzelkauf-Vorschau ist vorhanden');
select to_regprocedure('public.preview_purchase_cost_repair(uuid,uuid)') is not null as available \gset
\if :available
\set purchase_costing_legacy_fixture 1
\ir .generated/purchase_costing_legacy.sql.inc
\unset purchase_costing_legacy_fixture
set local role authenticated;
set local request.jwt.claim.sub = :'legacy_owner_id';

select public.preview_purchase_cost_repair(:'legacy_workspace_id', :'safe_purchase_id') as preview \gset
select is((:'preview'::jsonb ->> 'classification'), 'auto_repair', 'Einzelvorschau erkennt belegbaren Mystery-Einkauf');
select throws_ok(format(
  'select public.migrate_purchase_costing_legacy(%L, true, %L, %L)',
  :'legacy_workspace_id', :'safe_purchase_id', 'outdated'
), '40001', 'Der Einkauf wurde inzwischen geändert. Bitte erneut prüfen.', 'Veraltete Bestätigung verändert keine Kosten');
select lives_ok(format(
  'select public.migrate_purchase_costing_legacy(%L, true, %L, %L)',
  :'legacy_workspace_id', :'safe_purchase_id', (:'preview'::jsonb ->> 'fingerprint')
), 'Bestätigter einzelner Einkauf wird übernommen');
select is((select entry_status from public.purchases where id = :'safe_purchase_id'), 'finalized', 'Gewählter Einkauf ist abgeschlossen');
select isnt((select entry_status from public.purchases where id = :'unsold_purchase_id'), 'finalized', 'Anderer geeigneter Einkauf bleibt unverändert');
select ok(
  has_function_privilege('authenticated', 'public.preview_purchase_cost_repair(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.preview_purchase_cost_repair(uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.preview_purchase_cost_repair(uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.migrate_purchase_costing_legacy(uuid,boolean,uuid,text)', 'execute'),
  'Geerbte Ausführungsrechte bleiben auf authentifizierte Benutzer beschränkt'
);
select throws_ok(format(
  'select public.preview_purchase_cost_repair(%L, %L)',
  :'legacy_workspace_id', '00000000-0000-0000-0000-000000000000'
), '42501', 'Der Einkauf ist nicht zugänglich.', 'Fremde oder unbekannte IDs werden abgewiesen');
\else
select * from skip('Einzelkauf-Vorschau fehlt noch', 7);
\endif
select * from finish();
rollback;
