\set ON_ERROR_STOP on

begin;

select plan(81);

\set user_id '83000000-0000-4000-8000-000000000001'
\set business_workspace_id '83000000-0000-4000-8000-000000000002'
\set purchase_workspace_id '83000000-0000-4000-8000-000000000003'
\set sale_workspace_id '83000000-0000-4000-8000-000000000004'
\set invoice_workspace_id '83000000-0000-4000-8000-000000000005'
\set event_workspace_id '83000000-0000-4000-8000-000000000006'
\set empty_workspace_id '83000000-0000-4000-8000-000000000007'

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  :'user_id'::uuid,
  'authenticated',
  'authenticated',
  'business-record-immutability@example.test',
  'not-used-by-this-test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.workspaces (id, name) values
  (:'business_workspace_id'::uuid, 'Business dependencies'),
  (:'purchase_workspace_id'::uuid, 'Purchase only'),
  (:'sale_workspace_id'::uuid, 'Sale only'),
  (:'invoice_workspace_id'::uuid, 'Invoice only'),
  (:'event_workspace_id'::uuid, 'Event only'),
  (:'empty_workspace_id'::uuid, 'Empty workspace');

insert into public.workspace_members (workspace_id, user_id, role)
select id, :'user_id'::uuid, 'owner'
from public.workspaces
where id in (
  :'business_workspace_id'::uuid,
  :'purchase_workspace_id'::uuid,
  :'sale_workspace_id'::uuid,
  :'invoice_workspace_id'::uuid,
  :'event_workspace_id'::uuid,
  :'empty_workspace_id'::uuid
);

-- Separate fixtures keep every parent-link assertion independent. They are
-- created as the database owner because the test is about later client writes.
alter table public.inventory_items disable trigger protect_inventory_item_sold_status;
alter table public.inventory_items disable trigger inventory_item_sale_integrity_on_insert;
alter table public.inventory_items disable trigger inventory_item_sale_integrity_on_status;
alter table public.sale_lines disable trigger inventory_item_sale_integrity_on_sale_line;
alter table public.sales disable trigger inventory_item_sale_integrity_on_sale;

insert into public.purchases (id, workspace_id, type, title) values
  ('83000000-0000-4000-8000-000000000010', :'business_workspace_id'::uuid, 'single', 'Purchase with item'),
  ('83000000-0000-4000-8000-000000000011', :'purchase_workspace_id'::uuid, 'single', 'Workspace purchase'),
  ('83000000-0000-4000-8000-000000000012', :'business_workspace_id'::uuid, 'lot', 'Store stock purchase');

insert into public.inventory_items (id, workspace_id, purchase_id, title, status) values
  ('83000000-0000-4000-8000-000000000020', :'business_workspace_id'::uuid, '83000000-0000-4000-8000-000000000010', 'Purchase child', 'ready'),
  ('83000000-0000-4000-8000-000000000021', :'business_workspace_id'::uuid, null, 'Header child', 'sold'),
  ('83000000-0000-4000-8000-000000000022', :'business_workspace_id'::uuid, null, 'Line child', 'sold'),
  ('83000000-0000-4000-8000-000000000023', :'business_workspace_id'::uuid, null, 'Direct mutation item', 'sold'),
  ('83000000-0000-4000-8000-000000000024', :'event_workspace_id'::uuid, null, 'Reconciled item', 'ready'),
  ('83000000-0000-4000-8000-000000000025', :'business_workspace_id'::uuid, null, 'Store workspace guard item', 'ready');

insert into public.catalog_products (id, workspace_id, title, tracking_mode) values (
  '83000000-0000-4000-8000-000000000100',
  :'business_workspace_id'::uuid,
  'Store quantity product',
  'quantity'
), (
  '83000000-0000-4000-8000-000000000103',
  :'business_workspace_id'::uuid,
  'Store referenced product',
  'quantity'
), (
  '83000000-0000-4000-8000-000000000104',
  :'invoice_workspace_id'::uuid,
  'Foreign store product',
  'quantity'
);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, unit_purchase_price, line_total
) values (
  '83000000-0000-4000-8000-000000000101',
  :'business_workspace_id'::uuid,
  '83000000-0000-4000-8000-000000000012',
  '83000000-0000-4000-8000-000000000100',
  'Store quantity product',
  'quantity',
  5,
  5,
  4.00,
  20.00
);

insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost, received_at
) values (
  '83000000-0000-4000-8000-000000000102',
  :'business_workspace_id'::uuid,
  '83000000-0000-4000-8000-000000000012',
  '83000000-0000-4000-8000-000000000101',
  '83000000-0000-4000-8000-000000000100',
  5,
  5,
  4.00,
  '2026-08-29T08:00:00Z'
);

insert into public.sales (
  id, workspace_id, inventory_item_id, platform, sale_price, sale_price_total, sale_date
) values
  ('83000000-0000-4000-8000-000000000030', :'business_workspace_id'::uuid, '83000000-0000-4000-8000-000000000021', 'direct', 30, 30, current_date),
  ('83000000-0000-4000-8000-000000000031', :'business_workspace_id'::uuid, null, 'direct', 31, 31, current_date),
  ('83000000-0000-4000-8000-000000000032', :'business_workspace_id'::uuid, null, 'direct', 32, 32, current_date),
  ('83000000-0000-4000-8000-000000000033', :'business_workspace_id'::uuid, null, 'direct', 33, 33, current_date),
  ('83000000-0000-4000-8000-000000000034', :'business_workspace_id'::uuid, '83000000-0000-4000-8000-000000000023', 'direct', 34, 34, current_date),
  ('83000000-0000-4000-8000-000000000035', :'sale_workspace_id'::uuid, null, 'direct', 35, 35, current_date);

insert into public.sale_lines (
  id, workspace_id, sale_id, inventory_item_id, title_snapshot,
  quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode
) values (
  '83000000-0000-4000-8000-000000000040',
  :'business_workspace_id'::uuid,
  '83000000-0000-4000-8000-000000000031',
  '83000000-0000-4000-8000-000000000022',
  'Line dependency',
  1,
  31,
  31,
  10,
  'diff_25a'
);

insert into public.returns (
  id, workspace_id, sale_id, inventory_item_id, credit_note_number,
  reason, refund_amount, restock_action
) values
  ('83000000-0000-4000-8000-000000000050', :'business_workspace_id'::uuid, '83000000-0000-4000-8000-000000000032', null, 'GS-TEST-1', 'Test', 32, 'keep_with_buyer'),
  ('83000000-0000-4000-8000-000000000051', :'business_workspace_id'::uuid, '83000000-0000-4000-8000-000000000034', '83000000-0000-4000-8000-000000000023', 'GS-TEST-2', 'Direct mutation', 34, 'keep_with_buyer');

insert into public.invoices (
  id, workspace_id, invoice_number, order_number, seller, buyer,
  subtotal, total, sale_id
) values
  ('83000000-0000-4000-8000-000000000060', :'business_workspace_id'::uuid, 'RE-TEST-1', 'ORDER-TEST-1', '{}'::jsonb, '{}'::jsonb, 33, 33, '83000000-0000-4000-8000-000000000033'),
  ('83000000-0000-4000-8000-000000000061', :'invoice_workspace_id'::uuid, 'RE-TEST-2', 'ORDER-TEST-2', '{}'::jsonb, '{}'::jsonb, 10, 10, null);

insert into public.invoice_items (
  id, invoice_id, sku, title, quantity, unit_price, total_price
) values (
  '83000000-0000-4000-8000-000000000062',
  '83000000-0000-4000-8000-000000000060',
  'INVOICE-ITEM-1',
  'Booked invoice item',
  1,
  33,
  33
);

insert into public.shipping_orders (
  id, workspace_id, sale_id, order_number, platform, item_title,
  sale_price, customer, package_type
) values (
  '83000000-0000-4000-8000-000000000070',
  :'business_workspace_id'::uuid,
  '83000000-0000-4000-8000-000000000034',
  'SHIP-TEST-1',
  'direct',
  'Shipping dependency',
  34,
  '{}'::jsonb,
  'parcel'
);

insert into public.store_orders (
  id, workspace_id, order_number, customer, subtotal, shipping_cost, total,
  payment_method, payment_status, status
) values (
  '83000000-0000-4000-8000-000000000090',
  :'business_workspace_id'::uuid,
  'STORE-BOOKED-1',
  '{"email":"booked@example.test"}'::jsonb,
  10,
  0,
  10,
  'bank_transfer',
  'paid',
  'paid'
), (
  '83000000-0000-4000-8000-000000000092',
  :'business_workspace_id'::uuid,
  'STORE-REFERENCES-1',
  '{"email":"references@example.test"}'::jsonb,
  20,
  0,
  20,
  'bank_transfer',
  'paid',
  'paid'
), (
  '83000000-0000-4000-8000-000000000095',
  :'invoice_workspace_id'::uuid,
  'STORE-FOREIGN-1',
  '{"email":"foreign@example.test"}'::jsonb,
  10,
  0,
  10,
  'bank_transfer',
  'paid',
  'paid'
), (
  '83000000-0000-4000-8000-000000000096',
  :'business_workspace_id'::uuid,
  'STORE-BANK-1',
  '{"email":"bank@example.test"}'::jsonb,
  10,
  0,
  10,
  'bank_transfer',
  'pending',
  'pending'
);

insert into public.store_order_items (
  id, store_order_id, inventory_item_id, item_title, price, quantity
) values (
  '83000000-0000-4000-8000-000000000091',
  '83000000-0000-4000-8000-000000000090',
  '83000000-0000-4000-8000-000000000020',
  'Booked store order item',
  10,
  1
);

insert into public.store_order_items (
  id, store_order_id, inventory_item_id, catalog_product_id, item_title, price, quantity
) values
  (
    '83000000-0000-4000-8000-000000000093',
    '83000000-0000-4000-8000-000000000092',
    '83000000-0000-4000-8000-000000000020',
    null,
    'Store referenced individual item',
    10,
    1
  ),
  (
    '83000000-0000-4000-8000-000000000094',
    '83000000-0000-4000-8000-000000000092',
    null,
    '83000000-0000-4000-8000-000000000103',
    'Store referenced quantity product',
    10,
    1
  ),
  (
    '83000000-0000-4000-8000-000000000108',
    '83000000-0000-4000-8000-000000000092',
    '83000000-0000-4000-8000-000000000025',
    null,
    'Store workspace guard individual item',
    10,
    1
  );

insert into public.bank_transactions (
  id, workspace_id, booking_date, counterparty_name, purpose, amount, status
) values (
  '83000000-0000-4000-8000-000000000120',
  :'business_workspace_id'::uuid,
  current_date,
  'Store customer',
  'STORE-BANK-1',
  10,
  'pending'
);

insert into public.inventory_reconciliation_events (
  id, workspace_id, inventory_item_id, actor_id, event_type,
  previous_status, new_status, reason
) values (
  '83000000-0000-4000-8000-000000000080',
  :'event_workspace_id'::uuid,
  '83000000-0000-4000-8000-000000000024',
  :'user_id'::uuid,
  'restore_stock',
  'sold',
  'ready',
  'Test reconciliation'
);

alter table public.inventory_items enable trigger protect_inventory_item_sold_status;
alter table public.inventory_items enable trigger inventory_item_sale_integrity_on_insert;
alter table public.inventory_items enable trigger inventory_item_sale_integrity_on_status;
alter table public.sale_lines enable trigger inventory_item_sale_integrity_on_sale_line;
alter table public.sales enable trigger inventory_item_sale_integrity_on_sale;

set constraints all immediate;
set constraints all deferred;

select ok(
  not has_table_privilege('authenticated', 'public.sales', 'insert')
  and not has_table_privilege('authenticated', 'public.sales', 'update')
  and not has_table_privilege('authenticated', 'public.sales', 'delete'),
  'authenticated hat keine direkten Schreibrechte auf sales'
);
select ok(
  not has_table_privilege('authenticated', 'public.returns', 'insert')
  and not has_table_privilege('authenticated', 'public.returns', 'update')
  and not has_table_privilege('authenticated', 'public.returns', 'delete'),
  'authenticated hat keine direkten Schreibrechte auf returns'
);
select ok(
  not has_table_privilege('authenticated', 'public.invoices', 'insert')
  and not has_table_privilege('authenticated', 'public.invoices', 'update')
  and not has_table_privilege('authenticated', 'public.invoices', 'delete')
  and not has_table_privilege('authenticated', 'public.invoice_items', 'insert')
  and not has_table_privilege('authenticated', 'public.invoice_items', 'update')
  and not has_table_privilege('authenticated', 'public.invoice_items', 'delete')
  and not has_table_privilege('authenticated', 'public.store_orders', 'insert')
  and not has_table_privilege('authenticated', 'public.store_orders', 'update')
  and not has_table_privilege('authenticated', 'public.store_orders', 'delete')
  and not has_table_privilege('authenticated', 'public.store_order_items', 'insert')
  and not has_table_privilege('authenticated', 'public.store_order_items', 'update')
  and not has_table_privilege('authenticated', 'public.store_order_items', 'delete'),
  'authenticated hat keine direkten Schreibrechte auf gebuchte Rechnungs- und Bestellketten'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'sales' and cmd <> 'SELECT'),
  0::bigint,
  'sales besitzt keine Client-Schreibpolicy'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'returns' and cmd <> 'SELECT'),
  0::bigint,
  'returns besitzt keine Client-Schreibpolicy'
);
select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('invoices', 'invoice_items', 'store_orders', 'store_order_items')
      and cmd <> 'SELECT'
  ),
  0::bigint,
  'gebuchte Rechnungs- und Bestellketten besitzen keine Client-Schreibpolicy'
);

select is(
  (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('place_store_order', 'create_or_get_invoice', 'book_bank_transaction')
      and procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']
  ),
  3::bigint,
  'die drei geprüften Schreib-RPCs laufen als SECURITY DEFINER mit leerem search_path'
);

select is(
  (
    select count(*)
    from pg_constraint
    where conname in (
      'invoices_workspace_sale_fkey',
      'invoices_workspace_store_order_fkey'
    )
      and contype = 'f'
  ),
  2::bigint,
  'zwei zusammengesetzte Fremdschlüssel sichern die Rechnungsquellen'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_order_items'
      and column_name = 'workspace_id'
  ),
  0::bigint,
  'Store-Bestellpositionen erhalten beim Upgrade keine neue Workspace-Spalte'
);

select is(
  (
    select count(*)
    from pg_trigger as trigger
    where trigger.tgname in (
      'store_order_item_workspace_integrity_on_item',
      'store_order_item_workspace_integrity_on_order',
      'store_order_item_workspace_integrity_on_inventory_item',
      'store_order_item_workspace_integrity_on_catalog_product'
    )
      and trigger.tgenabled <> 'D'
      and trigger.tgconstraint <> 0
  ),
  4::bigint,
  'vier aktive Constraint-Trigger sichern Store-Positionen und ihre Workspace-Quellen'
);

select ok(
  exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'check_store_order_item_workspace_integrity'
      and procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']
  ),
  'Workspace-Constraint-Funktion läuft als SECURITY DEFINER mit leerem search_path'
);

select ok(has_function_privilege('authenticated', 'public.record_sale(uuid,jsonb,jsonb)', 'execute'), 'authenticated darf record_sale ausführen');
select ok(has_function_privilege('authenticated', 'public.record_sale_return(uuid,uuid,numeric,boolean,text,text,text,text)', 'execute'), 'authenticated darf record_sale_return ausführen');
select ok(has_function_privilege('authenticated', 'public.place_store_order(uuid,uuid,text,jsonb,numeric,numeric,numeric,text,text,text,text,date,text,jsonb)', 'execute'), 'authenticated darf place_store_order ausführen');
select ok(has_function_privilege('authenticated', 'public.create_or_get_invoice(uuid,uuid,uuid,jsonb,jsonb)', 'execute'), 'authenticated darf create_or_get_invoice ausführen');
select ok(has_function_privilege('authenticated', 'public.book_bank_transaction(uuid,uuid,timestamptz,uuid)', 'execute'), 'authenticated darf book_bank_transaction ausführen');
select ok(not has_function_privilege('anon', 'public.record_sale(uuid,jsonb,jsonb)', 'execute'), 'anon darf record_sale nicht ausführen');
select ok(not has_function_privilege('anon', 'public.record_sale_return(uuid,uuid,numeric,boolean,text,text,text,text)', 'execute'), 'anon darf record_sale_return nicht ausführen');
select ok(not has_function_privilege('anon', 'public.place_store_order(uuid,uuid,text,jsonb,numeric,numeric,numeric,text,text,text,text,date,text,jsonb)', 'execute'), 'anon darf place_store_order nicht ausführen');
select ok(not has_function_privilege('anon', 'public.create_or_get_invoice(uuid,uuid,uuid,jsonb,jsonb)', 'execute'), 'anon darf create_or_get_invoice nicht ausführen');
select ok(not has_function_privilege('anon', 'public.book_bank_transaction(uuid,uuid,timestamptz,uuid)', 'execute'), 'anon darf book_bank_transaction nicht ausführen');
select ok(not has_function_privilege('service_role', 'public.record_sale(uuid,jsonb,jsonb)', 'execute'), 'service_role erhält kein record_sale-Clientrecht');
select ok(not has_function_privilege('service_role', 'public.record_sale_return(uuid,uuid,numeric,boolean,text,text,text,text)', 'execute'), 'service_role erhält kein record_sale_return-Clientrecht');
select ok(not has_function_privilege('service_role', 'public.place_store_order(uuid,uuid,text,jsonb,numeric,numeric,numeric,text,text,text,text,date,text,jsonb)', 'execute'), 'service_role erhält kein place_store_order-Clientrecht');
select ok(not has_function_privilege('service_role', 'public.create_or_get_invoice(uuid,uuid,uuid,jsonb,jsonb)', 'execute'), 'service_role erhält kein create_or_get_invoice-Clientrecht');
select ok(not has_function_privilege('service_role', 'public.book_bank_transaction(uuid,uuid,timestamptz,uuid)', 'execute'), 'service_role erhält kein book_bank_transaction-Clientrecht');

-- These checks bypass client grants on purpose and prove that parent deletion
-- cannot silently cascade booked history away.
select throws_ok(
  $$delete from public.purchases where id = '83000000-0000-4000-8000-000000000010'$$,
  '23503', null, 'Einkauf mit Einzelartikel kann nicht indirekt gelöscht werden'
);
select throws_ok(
  $$delete from public.inventory_items where id = '83000000-0000-4000-8000-000000000021'$$,
  '23503', null, 'Einzelartikel mit Verkaufskopf kann nicht indirekt gelöscht werden'
);
select throws_ok(
  $$delete from public.sales where id = '83000000-0000-4000-8000-000000000031'$$,
  '23503', null, 'Verkauf mit Position kann nicht indirekt gelöscht werden'
);
select throws_ok(
  $$delete from public.sales where id = '83000000-0000-4000-8000-000000000032'$$,
  '23503', null, 'Verkauf mit Retoure kann nicht indirekt gelöscht werden'
);
select throws_ok(
  $$delete from public.sales where id = '83000000-0000-4000-8000-000000000033'$$,
  '23503', null, 'Verkauf mit Rechnung kann nicht indirekt gelöscht werden'
);
select throws_ok(
  $$delete from public.sales where id = '83000000-0000-4000-8000-000000000034'$$,
  '23503', null, 'Verkauf mit Versandreferenz kann nicht indirekt gelöscht werden'
);
select throws_ok(
  $$delete from public.invoices where id = '83000000-0000-4000-8000-000000000060'$$,
  '23503', null, 'Rechnungskopf mit Position kann nicht indirekt gelöscht werden'
);
select throws_ok(
  $$delete from public.inventory_items where id = '83000000-0000-4000-8000-000000000020'$$,
  '23503', null, 'Store-Bestellposition schützt ihre Einzelartikelreferenz'
);
select throws_ok(
  $$delete from public.catalog_products where id = '83000000-0000-4000-8000-000000000103'$$,
  '23503', null, 'Store-Bestellposition schützt ihre Artikelstammreferenz'
);
select throws_ok(
  $$delete from public.store_orders where id = '83000000-0000-4000-8000-000000000090'$$,
  '23503', null, 'Store-Bestellung mit Position kann nicht indirekt gelöscht werden'
);

select throws_ok(
  $$insert into public.invoices (id, workspace_id, invoice_number, order_number, seller, buyer, subtotal, total, sale_id) values ('83000000-0000-4000-8000-000000000063', '83000000-0000-4000-8000-000000000002', 'RE-CROSS-SALE', 'ORDER-CROSS-SALE', '{}'::jsonb, '{}'::jsonb, 1, 1, '83000000-0000-4000-8000-000000000035')$$,
  '23503', null, 'Rechnung kann keinen Verkauf eines anderen Workspace referenzieren'
);
select throws_ok(
  $$insert into public.invoices (id, workspace_id, invoice_number, order_number, seller, buyer, subtotal, total, store_order_id) values ('83000000-0000-4000-8000-000000000064', '83000000-0000-4000-8000-000000000002', 'RE-CROSS-ORDER', 'ORDER-CROSS-ORDER', '{}'::jsonb, '{}'::jsonb, 1, 1, '83000000-0000-4000-8000-000000000095')$$,
  '23503', null, 'Rechnung kann keine Store-Bestellung eines anderen Workspace referenzieren'
);
select throws_ok(
  $$insert into public.store_order_items (id, store_order_id, inventory_item_id, item_title, price, quantity) values ('83000000-0000-4000-8000-000000000105', '83000000-0000-4000-8000-000000000092', '83000000-0000-4000-8000-000000000024', 'Cross inventory', 1, 1)$$,
  '23503', 'Workspace der Store-Bestellposition ist inkonsistent.', 'Store-Position kann keinen Einzelartikel eines anderen Workspace referenzieren'
);
select throws_ok(
  $$insert into public.store_order_items (id, store_order_id, catalog_product_id, item_title, price, quantity) values ('83000000-0000-4000-8000-000000000106', '83000000-0000-4000-8000-000000000092', '83000000-0000-4000-8000-000000000104', 'Cross catalog', 1, 1)$$,
  '23503', 'Workspace der Store-Bestellposition ist inkonsistent.', 'Store-Position kann keinen Artikelstamm eines anderen Workspace referenzieren'
);
select throws_ok(
  $$update public.store_orders set workspace_id = '83000000-0000-4000-8000-000000000005' where id = '83000000-0000-4000-8000-000000000092'$$,
  '23503', 'Workspace der Store-Bestellposition ist inkonsistent.', 'Store-Bestellung kann nicht nachträglich von ihren Positionen getrennt werden'
);
select throws_ok(
  $$update public.inventory_items set workspace_id = '83000000-0000-4000-8000-000000000005' where id = '83000000-0000-4000-8000-000000000025'$$,
  '23503', 'Workspace der Store-Bestellposition ist inkonsistent.', 'Einzelartikel kann nicht nachträglich von seiner Store-Position getrennt werden'
);
select throws_ok(
  $$update public.catalog_products set workspace_id = '83000000-0000-4000-8000-000000000005' where id = '83000000-0000-4000-8000-000000000103'$$,
  '23503', 'Workspace der Store-Bestellposition ist inkonsistent.', 'Artikelstamm kann nicht nachträglich von seiner Store-Position getrennt werden'
);

set local role authenticated;
set local request.jwt.claim.sub = :'user_id';

select throws_ok(
  $$insert into public.invoices (id, workspace_id, invoice_number, order_number, seller, buyer, subtotal, total) values ('83000000-0000-4000-8000-000000000065', '83000000-0000-4000-8000-000000000002', 'RE-DIRECT', 'ORDER-DIRECT', '{}'::jsonb, '{}'::jsonb, 1, 1)$$,
  '42501', null, 'Client kann Rechnungskopf nicht direkt anlegen'
);
select throws_ok(
  $$update public.invoices set notes = 'Direkte Änderung' where id = '83000000-0000-4000-8000-000000000060'$$,
  '42501', null, 'Client kann Rechnungskopf nicht direkt ändern'
);
select throws_ok(
  $$insert into public.invoice_items (id, invoice_id, title, quantity, unit_price, total_price) values ('83000000-0000-4000-8000-000000000066', '83000000-0000-4000-8000-000000000060', 'Direkte Position', 1, 1, 1)$$,
  '42501', null, 'Client kann Rechnungsposition nicht direkt anlegen'
);
select throws_ok(
  $$update public.invoice_items set title = 'Direkte Änderung' where id = '83000000-0000-4000-8000-000000000062'$$,
  '42501', null, 'Client kann Rechnungsposition nicht direkt ändern'
);
select throws_ok(
  $$insert into public.store_orders (id, workspace_id, order_number, customer, subtotal, shipping_cost, total) values ('83000000-0000-4000-8000-000000000097', '83000000-0000-4000-8000-000000000002', 'STORE-DIRECT', '{}'::jsonb, 1, 0, 1)$$,
  '42501', null, 'Client kann Store-Bestellkopf nicht direkt anlegen'
);
select throws_ok(
  $$update public.store_orders set total = 999 where id = '83000000-0000-4000-8000-000000000090'$$,
  '42501', null, 'Client kann Store-Bestellkopf nicht direkt ändern'
);
select throws_ok(
  $$insert into public.store_order_items (id, store_order_id, inventory_item_id, item_title, price, quantity) values ('83000000-0000-4000-8000-000000000098', '83000000-0000-4000-8000-000000000090', '83000000-0000-4000-8000-000000000020', 'Direkte Store-Position', 1, 1)$$,
  '42501', null, 'Client kann Store-Bestellposition nicht direkt anlegen'
);
select throws_ok(
  $$update public.store_order_items set price = 999 where id = '83000000-0000-4000-8000-000000000091'$$,
  '42501', null, 'Client kann Store-Bestellposition nicht direkt ändern'
);

select throws_ok(
  format('insert into public.sales (workspace_id, platform, sale_price, sale_date) values (%L, %L, 1, current_date)', :'business_workspace_id', 'direct'),
  '42501', null, 'Client kann Verkauf ohne Einzelartikel nicht direkt anlegen'
);
select throws_ok(
  format('insert into public.sales (workspace_id, inventory_item_id, platform, sale_price, sale_date) values (%L, %L, %L, 1, current_date)', :'business_workspace_id', '83000000-0000-4000-8000-000000000023', 'direct'),
  '42501', null, 'Client kann Verkauf mit Einzelartikel nicht direkt anlegen'
);
select throws_ok(
  $$update public.sales set buyer_notes = 'Direkte Änderung' where id = '83000000-0000-4000-8000-000000000034'$$,
  '42501', null, 'Client kann gebuchten Verkauf nicht direkt ändern'
);
select throws_ok(
  $$delete from public.sales where id = '83000000-0000-4000-8000-000000000034'$$,
  '42501', null, 'Client kann gebuchten Verkauf nicht direkt löschen'
);
select throws_ok(
  $$insert into public.returns (workspace_id, sale_id, credit_note_number, reason, refund_amount, restock_action) values ('83000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000034', 'GS-DIRECT', 'Direkt', 1, 'keep_with_buyer')$$,
  '42501', null, 'Client kann Retoure nicht direkt anlegen'
);
select throws_ok(
  $$update public.returns set notes = 'Direkte Änderung' where id = '83000000-0000-4000-8000-000000000051'$$,
  '42501', null, 'Client kann Retoure nicht direkt ändern'
);
select throws_ok(
  $$delete from public.returns where id = '83000000-0000-4000-8000-000000000051'$$,
  '42501', null, 'Client kann Retoure nicht direkt löschen'
);
select throws_ok(
  $$delete from public.invoices where id = '83000000-0000-4000-8000-000000000060'$$,
  '42501', null, 'Client kann gebuchten Rechnungskopf nicht direkt löschen'
);
select throws_ok(
  $$delete from public.invoice_items where id = '83000000-0000-4000-8000-000000000062'$$,
  '42501', null, 'Client kann gebuchte Rechnungsposition nicht direkt löschen'
);
select throws_ok(
  $$delete from public.store_orders where id = '83000000-0000-4000-8000-000000000090'$$,
  '42501', null, 'Client kann gebuchten Bestellkopf nicht direkt löschen'
);
select throws_ok(
  $$delete from public.store_order_items where id = '83000000-0000-4000-8000-000000000091'$$,
  '42501', null, 'Client kann gebuchte Bestellposition nicht direkt löschen'
);

select throws_ok(
  $$select public.create_or_get_invoice(
    '83000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000035',
    null,
    '{"invoice_number":"RE-CROSS-RPC","order_number":"ORDER-CROSS-RPC","invoice_date":"2026-08-29","delivery_date":"2026-08-29","subtotal":1,"total":1}'::jsonb,
    '[{"title":"Cross RPC","quantity":1,"unit_price":1,"total_price":1}]'::jsonb
  )$$,
  'P0002', 'Der Verkauf wurde nicht gefunden.', 'Rechnungs-RPC lehnt eine Workspace-fremde Quelle ab'
);
select throws_ok(
  $$select public.place_store_order(
    '83000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000107',
    'STORE-CROSS-RPC',
    '{"email":"cross@example.test"}'::jsonb,
    1, 0, 1, 'bank_transfer', 'paid', null, 'paid', '2026-08-29', null,
    '[{"inventory_item_id":"83000000-0000-4000-8000-000000000024","item_title":"Cross RPC","quantity":1,"price":1,"payment_fee":0}]'::jsonb
  )$$,
  'P0002', 'Der Einzelartikel wurde nicht gefunden.', 'Store-RPC lehnt eine Workspace-fremde Position ab'
);

select lives_ok(
  $$select public.create_or_get_invoice(
    '83000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000030',
    null,
    '{"invoice_number":"RE-RPC-1","order_number":"ORDER-RPC-1","invoice_date":"2026-08-29","delivery_date":"2026-08-29","subtotal":30,"total":30}'::jsonb,
    '[{"title":"RPC invoice item","quantity":1,"unit_price":30,"total_price":30}]'::jsonb
  )$$,
  'authenticated kann Rechnung und Position über create_or_get_invoice schreiben'
);
select is(
  (
    select count(*)
    from public.invoices as invoice
    join public.invoice_items as item on item.invoice_id = invoice.id
    where invoice.workspace_id = :'business_workspace_id'::uuid
      and invoice.sale_id = '83000000-0000-4000-8000-000000000030'
      and invoice.invoice_number = 'RE-RPC-1'
      and item.title = 'RPC invoice item'
  ),
  1::bigint,
  'Rechnungs-RPC persistiert genau einen konsistenten Kopf mit Position'
);

select lives_ok(
  $$select public.book_bank_transaction(
    '83000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000120',
    '2026-08-29T12:00:00Z',
    '83000000-0000-4000-8000-000000000096'
  )$$,
  'authenticated kann den legitimen Zahlungsabgleich per RPC buchen'
);
select ok(
  (
    select status = 'booked' and booked_at = '2026-08-29T12:00:00Z'::timestamptz
    from public.bank_transactions
    where id = '83000000-0000-4000-8000-000000000120'
  ) and (
    select payment_status = 'paid' and status = 'confirmed'
    from public.store_orders
    where id = '83000000-0000-4000-8000-000000000096'
  ),
  'Zahlungs-RPC aktualisiert Transaktion und passende Store-Bestellung atomar'
);

select lives_ok(
  $$select public.place_store_order(
    '83000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000110',
    'STORE-ATOMIC-1',
    '{"email":"atomic@example.test","shippingMethod":"dhl_standard"}'::jsonb,
    19.98,
    4.99,
    24.97,
    'bank_transfer',
    'paid',
    'PAY-ATOMIC-1',
    'paid',
    '2026-08-29',
    'Authenticated pgTAP',
    '[{"catalog_product_id":"83000000-0000-4000-8000-000000000100","item_title":"Store quantity product","quantity":2,"price":9.99,"payment_fee":0.50}]'::jsonb
  )$$,
  'authenticated kann eine Store-Bestellung über den echten atomaren RPC-Pfad buchen'
);
select is(
  (
    select count(*)
    from public.store_orders as store_order
    join public.store_order_items as store_item on store_item.store_order_id = store_order.id
    where store_order.id = '83000000-0000-4000-8000-000000000110'
      and store_order.order_number = 'STORE-ATOMIC-1'
      and store_item.catalog_product_id = '83000000-0000-4000-8000-000000000100'
      and store_item.quantity = 2
  ),
  1::bigint,
  'Store-Bestellung und Bestellposition werden gemeinsam persistiert'
);
select is(
  (
    select count(*)
    from public.sales as sale
    join public.sale_lines as sale_line on sale_line.sale_id = sale.id
    where sale.workspace_id = :'business_workspace_id'::uuid
      and sale.external_order_id = 'STORE-ATOMIC-1'
      and sale.platform = 'custom_store'
      and sale.sale_price_total = 24.97
      and sale.shipping_revenue = 4.99
      and sale.shipping_cost = 0
      and sale.shipping_mode = 'seller_arranged'
      and sale_line.catalog_product_id = '83000000-0000-4000-8000-000000000100'
      and sale_line.quantity = 2
      and sale_line.line_total = 19.98
  ),
  1::bigint,
  'Store-Bestellung erzeugt Verkauf und Verkaufsposition'
);
select ok(
  (
    select remaining_quantity = 3
    from public.stock_lots
    where id = '83000000-0000-4000-8000-000000000102'
  )
  and (
    select count(*) = 1
    from public.stock_movements as movement
    join public.sale_lines as sale_line on sale_line.id = movement.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'STORE-ATOMIC-1'
      and movement.direction = 'out'
      and movement.reason = 'sale'
      and movement.quantity = 2
  ),
  'Store-Bestellung reduziert den FIFO-Bestand genau einmal'
);
select throws_ok(
  $$select public.place_store_order(
    '83000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000111',
    'STORE-ROLLBACK-1',
    '{"email":"rollback@example.test"}'::jsonb,
    39.96,
    0,
    39.96,
    'bank_transfer',
    'paid',
    'PAY-ROLLBACK-1',
    'paid',
    '2026-08-29',
    'Rollback pgTAP',
    '[{"catalog_product_id":"83000000-0000-4000-8000-000000000100","item_title":"Store quantity product","quantity":4,"price":9.99,"payment_fee":0}]'::jsonb
  )$$,
  'P0001',
  'Nicht genügend verfügbarer Bestand',
  'fehlerhafte Verkaufsbuchung bricht die gesamte Store-Bestellung ab'
);
select is(
  (
    select
      (select count(*) from public.store_orders where id = '83000000-0000-4000-8000-000000000111')
      + (select count(*) from public.store_order_items where store_order_id = '83000000-0000-4000-8000-000000000111')
      + (select count(*) from public.sales where external_order_id = 'STORE-ROLLBACK-1')
      + (
        select count(*)
        from public.sale_lines as sale_line
        join public.sales as sale on sale.id = sale_line.sale_id
        where sale.external_order_id = 'STORE-ROLLBACK-1'
      )
  ),
  0::bigint,
  'Rollback hinterlässt weder Bestellung noch Position, Verkauf oder Verkaufsposition'
);
select ok(
  (
    select remaining_quantity = 3
    from public.stock_lots
    where id = '83000000-0000-4000-8000-000000000102'
  )
  and (
    select count(*) = 1
    from public.stock_movements as movement
    join public.sale_lines as sale_line on sale_line.id = movement.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id in ('STORE-ATOMIC-1', 'STORE-ROLLBACK-1')
      and movement.reason = 'sale'
  ),
  'Rollback stellt Bestandsmenge und Bewegungsjournal vollständig wieder her'
);

select throws_ok(
  format('delete from public.workspaces where id = %L', :'purchase_workspace_id'),
  'P0001',
  'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.',
  'Workspace mit Einkauf bleibt erhalten'
);
select throws_ok(
  format('delete from public.workspaces where id = %L', :'sale_workspace_id'),
  'P0001',
  'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.',
  'Workspace mit Verkauf bleibt erhalten'
);
select throws_ok(
  format('delete from public.workspaces where id = %L', :'invoice_workspace_id'),
  'P0001',
  'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.',
  'Workspace mit Rechnung bleibt erhalten'
);
select throws_ok(
  format('delete from public.workspaces where id = %L', :'event_workspace_id'),
  'P0001',
  'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.',
  'Workspace mit fachlichem Ereignis bleibt erhalten'
);
select lives_ok(
  format('delete from public.workspaces where id = %L', :'empty_workspace_id'),
  'Admin kann einen leeren zweiten Workspace löschen'
);
select is(
  (select count(*) from public.workspaces where id = :'empty_workspace_id'::uuid),
  0::bigint,
  'der leere Workspace wurde tatsächlich entfernt'
);

reset role;
select * from finish();
rollback;
