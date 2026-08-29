\set ON_ERROR_STOP on

begin;

select plan(32);

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
  ('83000000-0000-4000-8000-000000000011', :'purchase_workspace_id'::uuid, 'single', 'Workspace purchase');

insert into public.inventory_items (id, workspace_id, purchase_id, title, status) values
  ('83000000-0000-4000-8000-000000000020', :'business_workspace_id'::uuid, '83000000-0000-4000-8000-000000000010', 'Purchase child', 'ready'),
  ('83000000-0000-4000-8000-000000000021', :'business_workspace_id'::uuid, null, 'Header child', 'sold'),
  ('83000000-0000-4000-8000-000000000022', :'business_workspace_id'::uuid, null, 'Line child', 'sold'),
  ('83000000-0000-4000-8000-000000000023', :'business_workspace_id'::uuid, null, 'Direct mutation item', 'sold'),
  ('83000000-0000-4000-8000-000000000024', :'event_workspace_id'::uuid, null, 'Reconciled item', 'ready');

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

select ok(has_function_privilege('authenticated', 'public.record_sale(uuid,jsonb,jsonb)', 'execute'), 'authenticated darf record_sale ausführen');
select ok(has_function_privilege('authenticated', 'public.record_sale_return(uuid,uuid,numeric,boolean,text,text,text,text)', 'execute'), 'authenticated darf record_sale_return ausführen');
select ok(has_function_privilege('authenticated', 'public.place_store_order(uuid,uuid,text,jsonb,numeric,numeric,numeric,text,text,text,text,date,text,jsonb)', 'execute'), 'authenticated darf place_store_order ausführen');
select ok(not has_function_privilege('anon', 'public.record_sale(uuid,jsonb,jsonb)', 'execute'), 'anon darf record_sale nicht ausführen');
select ok(not has_function_privilege('anon', 'public.record_sale_return(uuid,uuid,numeric,boolean,text,text,text,text)', 'execute'), 'anon darf record_sale_return nicht ausführen');
select ok(not has_function_privilege('anon', 'public.place_store_order(uuid,uuid,text,jsonb,numeric,numeric,numeric,text,text,text,text,date,text,jsonb)', 'execute'), 'anon darf place_store_order nicht ausführen');
select ok(not has_function_privilege('service_role', 'public.record_sale(uuid,jsonb,jsonb)', 'execute'), 'service_role erhält kein record_sale-Clientrecht');
select ok(not has_function_privilege('service_role', 'public.record_sale_return(uuid,uuid,numeric,boolean,text,text,text,text)', 'execute'), 'service_role erhält kein record_sale_return-Clientrecht');
select ok(not has_function_privilege('service_role', 'public.place_store_order(uuid,uuid,text,jsonb,numeric,numeric,numeric,text,text,text,text,date,text,jsonb)', 'execute'), 'service_role erhält kein place_store_order-Clientrecht');

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

set local role authenticated;
set local request.jwt.claim.sub = :'user_id';

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
