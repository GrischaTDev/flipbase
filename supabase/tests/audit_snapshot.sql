\set ON_ERROR_STOP on
begin;
select plan(24);
select has_function('public', 'export_audit_snapshot', array['uuid', 'jsonb'], 'Prüfarchiv besitzt eine gemeinsame Snapshot-RPC');
select is((select provolatile::text from pg_proc where oid = 'public.export_audit_snapshot(uuid,jsonb)'::regprocedure), 's', 'Alle Abfragen benutzen den aufrufenden STABLE-Snapshot');
select ok(not has_function_privilege('anon', 'public.export_audit_snapshot(uuid,jsonb)', 'execute'), 'Anonyme dürfen das Archiv nicht aufrufen');
select ok(not has_table_privilege('authenticated', 'public.business_events', 'select'), 'Journal bleibt ohne direkten Tabellenzugriff');
select ok(not has_table_privilege('authenticated', 'public.sniper_queries', 'insert'), 'Sniper bleibt für Clients schreibgeschützt');
select ok(not has_table_privilege('authenticated', 'public.sniper_listings', 'delete'), 'Sniper-Angebote bleiben für Clients schreibgeschützt');

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('84000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'audit-snapshot@example.test', 'unused', '{}', '{}', now(), now());
insert into public.workspaces (id, name) values
  ('84000000-0000-4000-8000-000000000002', 'Audit owner'),
  ('84000000-0000-4000-8000-000000000003', 'Fremder Workspace');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('84000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000001', 'owner');
insert into public.inventory_items (id, workspace_id, title, status) values
  ('84000000-0000-4000-8000-000000000004', '84000000-0000-4000-8000-000000000002', 'Eigener Artikel', 'ready'),
  ('84000000-0000-4000-8000-000000000005', '84000000-0000-4000-8000-000000000003', 'Fremder Artikel', 'ready');
insert into public.item_costs (id, inventory_item_id, type, amount) values
  ('84000000-0000-4000-8000-000000000006', '84000000-0000-4000-8000-000000000004', 'repair', 12),
  ('84000000-0000-4000-8000-000000000007', '84000000-0000-4000-8000-000000000005', 'repair', 99);
insert into public.sources (id, workspace_id, name) values
  ('84000000-0000-4000-8000-000000000008', '84000000-0000-4000-8000-000000000002', 'Eigene Quelle'),
  ('84000000-0000-4000-8000-000000000009', '84000000-0000-4000-8000-000000000003', 'Fremde Quelle');
insert into public.suppliers (id, workspace_id, name) values
  ('84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000002', 'Eigener Lieferant'),
  ('84000000-0000-4000-8000-000000000011', '84000000-0000-4000-8000-000000000003', 'Fremder Lieferant');
insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('84000000-0000-4000-8000-000000000012', '84000000-0000-4000-8000-000000000002', 'Eigener Stammartikel', 'quantity'),
  ('84000000-0000-4000-8000-000000000013', '84000000-0000-4000-8000-000000000003', 'Fremder Stammartikel', 'quantity');
insert into public.sales (id, workspace_id, platform, sale_price, sale_date) values
  ('84000000-0000-4000-8000-000000000014', '84000000-0000-4000-8000-000000000002', 'direct', 20, '2026-09-01'),
  ('84000000-0000-4000-8000-000000000015', '84000000-0000-4000-8000-000000000003', 'direct', 30, '2026-09-01');
insert into public.returns (id, workspace_id, sale_id, credit_note_number, reason) values
  ('84000000-0000-4000-8000-000000000016', '84000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000014', 'GS-AUDIT-1', 'other'),
  ('84000000-0000-4000-8000-000000000017', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000015', 'GS-AUDIT-2', 'other');
insert into public.inventory_reconciliation_events (
  id, workspace_id, inventory_item_id, actor_id, event_type, previous_status, new_status, reason
) values
  ('84000000-0000-4000-8000-000000000018', '84000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000004', '84000000-0000-4000-8000-000000000001', 'restore_stock', 'sold', 'ready', 'Eigene Korrektur'),
  ('84000000-0000-4000-8000-000000000019', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000005', '84000000-0000-4000-8000-000000000001', 'restore_stock', 'sold', 'ready', 'Fremde Korrektur');
insert into public.invoices (id, workspace_id, invoice_number, order_number, sale_id) values
  ('84000000-0000-4000-8000-000000000020', '84000000-0000-4000-8000-000000000002', 'RE-AUDIT-1', 'ORDER-AUDIT-1', '84000000-0000-4000-8000-000000000014'),
  ('84000000-0000-4000-8000-000000000021', '84000000-0000-4000-8000-000000000003', 'RE-AUDIT-2', 'ORDER-AUDIT-2', '84000000-0000-4000-8000-000000000015');
insert into public.invoice_items (id, invoice_id, title, quantity, unit_price, total_price) values
  ('84000000-0000-4000-8000-000000000022', '84000000-0000-4000-8000-000000000020', 'Eigene Rechnungsposition', 1, 20, 20),
  ('84000000-0000-4000-8000-000000000023', '84000000-0000-4000-8000-000000000021', 'Fremde Rechnungsposition', 1, 30, 30);

set local role authenticated;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')$$, 'Owner darf exportieren');
select throws_ok($$select public.export_audit_snapshot('84000000-0000-4000-8000-000000000003', '{}')$$, '42501', 'Keine Berechtigung für das Prüfarchiv.', 'Fremder Workspace bleibt gesperrt');
select throws_ok($$select public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '[]')$$, '22023', 'Der Archivfilter muss ein JSON-Objekt sein.', 'Ungültiger Filter wird abgelehnt');
select is(jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'item_costs'), 1, 'Artikelkosten werden über den Workspace des Artikels eingeschlossen');
select is((public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'item_costs'->0->>'amount')::numeric, 12::numeric, 'Kostenbetrag bleibt unverändert');
select ok(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}') ?& array['business_events', 'sources', 'suppliers', 'catalog_products', 'purchases', 'purchase_lines', 'purchase_costs', 'inventory_items', 'item_costs', 'stock_lots', 'stock_movements', 'sales', 'sale_lines', 'sale_cost_entries', 'sale_line_lot_allocations', 'returns', 'inventory_reconciliation_events', 'invoices', 'invoice_items'], 'Alle für die Rekonstruktion erforderlichen Datenmengen sind vorhanden');
select is(
  jsonb_build_array(
    jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'sources'),
    jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'suppliers'),
    jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'catalog_products'),
    jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'returns'),
    jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'inventory_reconciliation_events'),
    jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'invoices'),
    jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'invoice_items')
  )::text,
  '[1, 1, 1, 1, 1, 1, 1]',
  'jede ergänzte Datenmenge bleibt auf den angeforderten Workspace begrenzt'
);
select is(
  jsonb_build_array(
    public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'sources'->0->>'id',
    public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'suppliers'->0->>'id',
    public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'catalog_products'->0->>'id',
    public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'returns'->0->>'sale_id',
    public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'inventory_reconciliation_events'->0->>'inventory_item_id',
    public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'invoices'->0->>'sale_id',
    public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'invoice_items'->0->>'invoice_id'
  )::text,
  '["84000000-0000-4000-8000-000000000008", "84000000-0000-4000-8000-000000000010", "84000000-0000-4000-8000-000000000012", "84000000-0000-4000-8000-000000000014", "84000000-0000-4000-8000-000000000004", "84000000-0000-4000-8000-000000000014", "84000000-0000-4000-8000-000000000020"]',
  'stabile IDs und Fremdschlüssel bleiben für die Rekonstruktion erhalten'
);
select is(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->>'snapshot', pg_current_snapshot()::text, 'Archiv nennt den tatsächlich gemeinsamen Snapshot');
reset role;
update public.workspace_members set role = 'admin' where workspace_id = '84000000-0000-4000-8000-000000000002';
insert into public.business_events (workspace_id, entity_type, entity_id, event_type, actor_id, changes, created_at) values
  ('84000000-0000-4000-8000-000000000002', 'inventory_item', '84000000-0000-4000-8000-000000000004', 'inventory_corrected', '84000000-0000-4000-8000-000000000001', '{"after":{"amount":12}}', '2026-09-01T12:00:00Z'),
  ('84000000-0000-4000-8000-000000000002', 'inventory_item', '84000000-0000-4000-8000-000000000004', 'inventory_received', '84000000-0000-4000-8000-000000000001', '{}', '2026-08-31T12:00:00Z');
set local role authenticated;
select lives_ok($$select public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')$$, 'Admin darf exportieren');
select is(jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{"event_type":"inventory_corrected","from":"2026-09-01","to":"2026-09-02"}')->'business_events'), 1, 'Journalfilter wirken innerhalb desselben Snapshots');
select is(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{"event_type":"inventory_corrected"}')->'business_events'->0->'changes'->'after'->>'amount', '12', 'Vorher-Nachher-Werte bleiben unverändert erhalten');
reset role;
update public.workspace_members set role = 'accountant' where workspace_id = '84000000-0000-4000-8000-000000000002';
set local role authenticated;
select lives_ok($$select public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')$$, 'Buchhalter behalten die bestehenden Exportrechte');
reset role;
update public.workspace_members set role = 'viewer' where workspace_id = '84000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok($$select public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')$$, '42501', 'Keine Berechtigung für das Prüfarchiv.', 'Viewer dürfen kein Vollarchiv abrufen');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')$$, '42501', 'Keine Berechtigung für das Prüfarchiv.', 'Fehlende Anmeldung wird abgewiesen');
reset role;
select is((select count(*)::integer from pg_policies where schemaname = 'realtime' and policyname in ('Eigenen Sitzungskanal hoeren', 'Auf dem eigenen Sitzungskanal senden')), 2, 'Beide vorhandenen Sitzungskanal-Policies bleiben erhalten');
update public.workspace_members set role = 'owner' where workspace_id = '84000000-0000-4000-8000-000000000002';
insert into public.item_costs (inventory_item_id, type, amount)
select '84000000-0000-4000-8000-000000000004', 'repair', 1 from generate_series(1, 1001);
set local role authenticated;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
select is(jsonb_array_length(public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')->'item_costs'), 1002, 'Archiv kürzt nicht am Data-API-Seitenlimit von 1000');
reset role;
insert into public.item_costs (inventory_item_id, type, amount)
select '84000000-0000-4000-8000-000000000004', 'repair', 1 from generate_series(1, 99000);
set local role authenticated;
select throws_ok($$select public.export_audit_snapshot('84000000-0000-4000-8000-000000000002', '{}')$$, '54000', 'Das Prüfarchiv überschreitet 100000 Datensätze. Es wurde kein Teilarchiv erstellt.', 'Zu große Archive scheitern ausdrücklich ohne stilles Abschneiden');
select * from finish();
rollback;
