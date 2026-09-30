\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select ok(not has_function_privilege('authenticated', 'public.company_document_party(uuid)', 'execute'), 'Interner Absenderhelfer ist kein Client-Endpunkt');
select ok(not has_function_privilege('anon', 'public.capture_invoice_company()', 'execute'), 'Rechnungstrigger bleibt intern');
select ok(not has_function_privilege('service_role', 'public.capture_return_company()', 'execute'), 'Gutschrifttrigger bleibt intern');

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('c2900000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'documents@example.test', 'unused', '{}', '{}', now(), now());
insert into public.workspaces(id, name, tax_mode) values
  ('c2900000-0000-4000-8000-000000000011', 'Interner Name', 'regular_19'),
  ('c2900000-0000-4000-8000-000000000012', 'Fremder Workspace', 'diff_25a');
insert into public.workspace_members(workspace_id, user_id, role)
values ('c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000001', 'owner');
insert into public.workspace_company_profiles(workspace_id)
values ('c2900000-0000-4000-8000-000000000011'), ('c2900000-0000-4000-8000-000000000012');
insert into public.inventory_items(id, workspace_id, title, status) values
  ('c2900000-0000-4000-8000-000000000021', 'c2900000-0000-4000-8000-000000000011', 'Artikel', 'ready'),
  ('c2900000-0000-4000-8000-000000000022', 'c2900000-0000-4000-8000-000000000011', 'Artikel 2', 'ready');
insert into public.sales(id, workspace_id, inventory_item_id, sale_price, platform, sale_date) values
  ('c2900000-0000-4000-8000-000000000031', 'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000021', 25, 'cash', '2026-09-30'),
  ('c2900000-0000-4000-8000-000000000032', 'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000022', 25, 'cash', '2026-09-30');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2900000-0000-4000-8000-000000000001', true);
select throws_ok($$select public.create_or_get_invoice(
  'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000031', null,
  '{"invoice_number":"RE-DOC-1","order_number":"ORD-1","invoice_date":"2026-09-30","delivery_date":"2026-09-30","subtotal":25,"total":25}',
  '[{"title":"Artikel","quantity":1,"unit_price":25,"total_price":25}]')$$,
  'P0001', 'company_profile_incomplete', 'Unvollständige Unternehmensdaten blockieren neue Rechnungen');
select is((select count(*) from public.invoices where workspace_id = 'c2900000-0000-4000-8000-000000000011'), 0::bigint, 'Fehler erzeugt keinen Rechnungskopf');
reset role;
update public.workspace_company_profiles set legal_name = 'Alter Inhaber', company_name = 'Laden',
  street = 'Altweg', house_number = '1', postal_code = '12345', city = 'Bonn', country_code = 'DE',
  tax_number = '123/456/789', logo_path = 'c2900000-0000-4000-8000-000000000011/logos/c2900000-0000-4000-8000-000000000091.png'
where workspace_id = 'c2900000-0000-4000-8000-000000000011';
set local role authenticated;
select lives_ok($$select public.create_or_get_invoice(
  'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000031', null,
  '{"invoice_number":"RE-DOC-1","order_number":"ORD-1","invoice_date":"2026-09-30","delivery_date":"2026-09-30","subtotal":25,"total":25,"seller":{"name":"Gefälscht"},"tax_mode":"regular_19","tax_clause":"Alter Steuerhinweis"}',
  '[{"title":"Artikel","quantity":1,"unit_price":25,"total_price":25}]')$$, 'Vollständige Unternehmensdaten erlauben Rechnung');
select is((select seller ->> 'name' from public.invoices where sale_id = 'c2900000-0000-4000-8000-000000000031'), 'Alter Inhaber', 'Client kann den Absender nicht fälschen');
select is((select seller ->> 'street' from public.invoices where sale_id = 'c2900000-0000-4000-8000-000000000031'), 'Altweg 1', 'Geschäftsanschrift wird verbunden');
select ok((select seller ? 'logoPath' and not (seller ? 'signedUrl') from public.invoices where sale_id = 'c2900000-0000-4000-8000-000000000031'), 'Snapshot speichert nur den Logo-Dateipfad');
select throws_ok($$select public.create_or_get_invoice('c2900000-0000-4000-8000-000000000012', 'c2900000-0000-4000-8000-000000000031', null, '{}', '[]')$$,
  '42501', 'Kein Zugriff auf diesen Workspace.', 'Fremder Workspace wird vor Datenzugriff abgelehnt');
reset role;
update public.workspace_company_profiles set legal_name = null where workspace_id = 'c2900000-0000-4000-8000-000000000011';
set local role authenticated;
select is(public.create_or_get_invoice('c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000031', null, '{}', '[]') #>> '{invoice,seller,name}', 'Alter Inhaber', 'Vorhandene Rechnung bleibt trotz unvollständigem Profil unverändert lesbar');
reset role;
insert into public.returns(id, workspace_id, sale_id, credit_note_number, reason, refund_amount, restock_action) values
  ('c2900000-0000-4000-8000-000000000041', 'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000031', 'GS-DOC-1', 'other', 25, 'keep_with_buyer'),
  ('c2900000-0000-4000-8000-000000000042', 'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000032', 'GS-DOC-2', 'other', 25, 'keep_with_buyer');
select is((select credit_note_snapshot #>> '{seller,name}' from public.returns where id = 'c2900000-0000-4000-8000-000000000041'), 'Alter Inhaber', 'Gutschrift übernimmt Originalabsender trotz leerem aktuellen Profil');
select is((select credit_note_snapshot ->> 'originalInvoiceNumber' from public.returns where id = 'c2900000-0000-4000-8000-000000000041'), 'RE-DOC-1', 'Gutschrift übernimmt echte Originalnummer');
select is((select credit_note_snapshot ->> 'taxMode' from public.returns where id = 'c2900000-0000-4000-8000-000000000041'), 'regular_19', 'Gutschrift übernimmt ursprüngliche Steuerart');
select is((select credit_note_snapshot from public.returns where id = 'c2900000-0000-4000-8000-000000000042'), null::jsonb, 'Erstattung ohne vollständiges Profil bleibt möglich und hat keinen erfundenen Beleg');
select throws_ok($$update public.invoices set seller = '{"name":"Neu"}' where sale_id = 'c2900000-0000-4000-8000-000000000031'$$, 'P0001', 'Der gespeicherte Rechnungsabsender darf nicht geändert werden.', 'Originalabsender ist geschützt');
select throws_ok($$update public.returns set credit_note_snapshot = '{}' where id = 'c2900000-0000-4000-8000-000000000041'$$, 'P0001', 'Die gespeicherten Gutschriftdaten dürfen nicht geändert werden.', 'Gutschrift-Snapshot ist geschützt');

update public.workspace_company_profiles set legal_name = 'Neuer Inhaber' where workspace_id = 'c2900000-0000-4000-8000-000000000011';
insert into public.purchases(id, workspace_id, type, title, purchase_date, purchase_price, receipt_mode, entry_status, finalized_at, finalized_by)
values ('c2900000-0000-4000-8000-000000000051', 'c2900000-0000-4000-8000-000000000011', 'single', 'Jacke', '2026-09-30', 25, 'self', 'finalized', '2026-09-30T10:00:00Z', 'c2900000-0000-4000-8000-000000000001');
select throws_ok($$insert into public.purchase_documents(id, workspace_id, purchase_id, document_type, source_finalized_at, original_file_name, storage_path, mime_type, file_size, company_snapshot)
values ('c2900000-0000-4000-8000-000000000061', 'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000051', 'self_receipt', '2026-09-30T10:00:00Z', 'Eigenbeleg.pdf', 'purchase-documents/c2900000-0000-4000-8000-000000000011/c2900000-0000-4000-8000-000000000051/c2900000-0000-4000-8000-000000000061.pdf', 'application/pdf', 100, '{}')$$,
  'P0001', 'Die Unternehmensdaten wurden geändert. Bitte erstelle den Eigenbeleg erneut.', 'Eigenbeleg mit abweichenden PDF-Absenderdaten wird abgelehnt');
insert into public.purchase_documents(id, workspace_id, purchase_id, document_type, source_finalized_at, original_file_name, storage_path, mime_type, file_size, company_snapshot)
values ('c2900000-0000-4000-8000-000000000061', 'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000051', 'self_receipt', '2026-09-30T10:00:00Z', 'Eigenbeleg.pdf', 'purchase-documents/c2900000-0000-4000-8000-000000000011/c2900000-0000-4000-8000-000000000051/c2900000-0000-4000-8000-000000000061.pdf', 'application/pdf', 100, public.company_document_party('c2900000-0000-4000-8000-000000000011'));
select is((select company_snapshot ->> 'name' from public.purchase_documents where id = 'c2900000-0000-4000-8000-000000000061'), 'Neuer Inhaber', 'Eigenbeleg speichert denselben Absender wie sein PDF');
update public.workspace_company_profiles set legal_name = 'Dritter Inhaber' where workspace_id = 'c2900000-0000-4000-8000-000000000011';
select is((select company_snapshot ->> 'name' from public.purchase_documents where id = 'c2900000-0000-4000-8000-000000000061'), 'Neuer Inhaber', 'Spätere Profiländerung verändert Eigenbeleg nicht');
-- Verkauf mit gespeicherter Steuerart, danach Retoure ohne Originalrechnung.
insert into public.inventory_items(id, workspace_id, title, status, allocated_purchase_cost)
values ('c2900000-0000-4000-8000-000000000023', 'c2900000-0000-4000-8000-000000000011', 'Artikel 3', 'ready', 10);
insert into public.sales(id, workspace_id, sale_price, platform, sale_date)
values ('c2900000-0000-4000-8000-000000000033', 'c2900000-0000-4000-8000-000000000011', 25, 'cash', '2026-09-30');
insert into public.sale_lines(id, workspace_id, sale_id, inventory_item_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode)
values ('c2900000-0000-4000-8000-000000000071', 'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000033', 'c2900000-0000-4000-8000-000000000023', 'Artikel', 1, 25, 25, 10, 'diff_25a');
insert into public.returns(id, workspace_id, sale_id, credit_note_number, reason, refund_amount, restock_action)
values ('c2900000-0000-4000-8000-000000000043', 'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000033', 'GS-DOC-3', 'other', 25, 'keep_with_buyer');
select is((select credit_note_snapshot ->> 'taxMode' from public.returns where id = 'c2900000-0000-4000-8000-000000000043'), 'diff_25a', 'Gutschrift ohne Rechnung bewahrt Verkaufs-Steuerart trotz inzwischen regular_19');
select ok((select credit_note_snapshot ->> 'taxClause' like '%25a%' from public.returns where id = 'c2900000-0000-4000-8000-000000000043'), 'Steuerhinweis passt zur gespeicherten Verkaufs-Steuerart');

insert into public.store_orders(id, workspace_id, order_number)
values ('c2900000-0000-4000-8000-000000000081', 'c2900000-0000-4000-8000-000000000011', 'ORDER-SHOP');
set local role authenticated;
select is(public.create_or_get_invoice('c2900000-0000-4000-8000-000000000011', null, 'c2900000-0000-4000-8000-000000000081',
  '{"invoice_number":"RE-SHOP","order_number":"ORDER-SHOP","invoice_date":"2026-09-30","delivery_date":"2026-09-30","subtotal":25,"total":25,"tax_mode":"diff_25a","tax_clause":"Veraltet"}',
  '[{"title":"Artikel","quantity":1,"unit_price":25,"total_price":25}]') #>> '{invoice,tax_mode}', 'regular_19', 'Neue Shop-Rechnung liest verbindlich die aktuelle gespeicherte Unternehmens-Steuerart');
select ok((select position('19%' in tax_clause) > 0 from public.invoices where store_order_id = 'c2900000-0000-4000-8000-000000000081'), 'Shop-Steuerhinweis passt zum aktuellen Modus');
reset role;
insert into public.sales(id, workspace_id, sale_price, platform, sale_date)
values ('c2900000-0000-4000-8000-000000000034', 'c2900000-0000-4000-8000-000000000011', 25, 'cash', '2026-09-30');
insert into public.returns(id, workspace_id, sale_id, credit_note_number, reason, refund_amount, restock_action)
values ('c2900000-0000-4000-8000-000000000044', 'c2900000-0000-4000-8000-000000000011', 'c2900000-0000-4000-8000-000000000034', 'GS-DOC-4', 'other', 25, 'keep_with_buyer');
select is((select credit_note_snapshot from public.returns where id = 'c2900000-0000-4000-8000-000000000044'), null::jsonb, 'Auch vollständige heutige Profile ersetzen keine fehlende historische Verkaufs-Steuerart');
select * from finish();
rollback;
