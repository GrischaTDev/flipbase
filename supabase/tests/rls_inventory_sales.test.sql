\set ON_ERROR_STOP on

begin;

select plan(61);

\set owner_user_id '84000000-0000-4000-8000-000000000001'
\set foreign_user_id '84000000-0000-4000-8000-000000000002'
\set owner_workspace_id '84000000-0000-4000-8000-000000000003'
\set foreign_workspace_id '84000000-0000-4000-8000-000000000004'

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    :'owner_user_id'::uuid, 'authenticated', 'authenticated',
    'rls-owner@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    :'foreign_user_id'::uuid, 'authenticated', 'authenticated',
    'rls-foreign@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now()
  );

insert into public.workspaces (id, name) values
  (:'owner_workspace_id'::uuid, 'RLS owner workspace'),
  (:'foreign_workspace_id'::uuid, 'RLS foreign workspace');

insert into public.workspace_members (workspace_id, user_id, role) values
  (:'owner_workspace_id'::uuid, :'owner_user_id'::uuid, 'owner'),
  (:'foreign_workspace_id'::uuid, :'foreign_user_id'::uuid, 'owner');

insert into public.purchases (id, workspace_id, type, title) values
  ('84000000-0000-4000-8000-000000000010', :'owner_workspace_id'::uuid, 'lot', 'RLS owner purchase'),
  ('84000000-0000-4000-8000-000000000011', :'foreign_workspace_id'::uuid, 'lot', 'RLS foreign purchase');

insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('84000000-0000-4000-8000-000000000020', :'owner_workspace_id'::uuid, 'RLS owner product', 'quantity'),
  ('84000000-0000-4000-8000-000000000021', :'foreign_workspace_id'::uuid, 'RLS foreign product', 'quantity');

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, unit_purchase_price, line_total
) values
  (
    '84000000-0000-4000-8000-000000000030', :'owner_workspace_id'::uuid,
    '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000020',
    'RLS owner product', 'quantity', 2, 2, 5, 10
  ),
  (
    '84000000-0000-4000-8000-000000000031', :'foreign_workspace_id'::uuid,
    '84000000-0000-4000-8000-000000000011', '84000000-0000-4000-8000-000000000021',
    'RLS foreign product', 'quantity', 2, 2, 5, 10
  );

insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost
) values
  (
    '84000000-0000-4000-8000-000000000040', :'owner_workspace_id'::uuid,
    '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000030',
    '84000000-0000-4000-8000-000000000020', 2, 2, 5
  ),
  (
    '84000000-0000-4000-8000-000000000041', :'foreign_workspace_id'::uuid,
    '84000000-0000-4000-8000-000000000011', '84000000-0000-4000-8000-000000000031',
    '84000000-0000-4000-8000-000000000021', 2, 2, 5
  );

insert into public.inventory_items (id, workspace_id, title, status) values
  ('84000000-0000-4000-8000-000000000050', :'owner_workspace_id'::uuid, 'RLS owner item', 'ready'),
  ('84000000-0000-4000-8000-000000000051', :'foreign_workspace_id'::uuid, 'RLS foreign item', 'ready');

insert into public.sales (
  id, workspace_id, platform, sale_price, sale_price_total, sale_date
) values
  ('84000000-0000-4000-8000-000000000060', :'owner_workspace_id'::uuid, 'direct', 10, 10, current_date),
  ('84000000-0000-4000-8000-000000000061', :'foreign_workspace_id'::uuid, 'direct', 10, 10, current_date);

insert into public.sale_lines (
  id, workspace_id, sale_id, catalog_product_id, title_snapshot,
  quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode
) values
  (
    '84000000-0000-4000-8000-000000000070', :'owner_workspace_id'::uuid,
    '84000000-0000-4000-8000-000000000060', '84000000-0000-4000-8000-000000000020',
    'RLS owner sale line', 1, 10, 10, 5, 'diff_25a'
  ),
  (
    '84000000-0000-4000-8000-000000000071', :'foreign_workspace_id'::uuid,
    '84000000-0000-4000-8000-000000000061', '84000000-0000-4000-8000-000000000021',
    'RLS foreign sale line', 1, 10, 10, 5, 'diff_25a'
  );

insert into public.stock_movements (
  id, workspace_id, stock_lot_id, direction, quantity, reason
) values
  (
    '84000000-0000-4000-8000-000000000080', :'owner_workspace_id'::uuid,
    '84000000-0000-4000-8000-000000000040', 'in', 2, 'receipt'
  ),
  (
    '84000000-0000-4000-8000-000000000081', :'foreign_workspace_id'::uuid,
    '84000000-0000-4000-8000-000000000041', 'in', 2, 'receipt'
  );

set constraints all immediate;
set constraints all deferred;

select is(
  (
    select count(*)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'inventory_items'
      and relation.relrowsecurity
  ),
  1::bigint,
  'inventory_items hat RLS aktiviert'
);

set local role authenticated;
set local request.jwt.claim.sub = :'owner_user_id';
select is((select count(*) from public.inventory_items where id = '84000000-0000-4000-8000-000000000050'), 1::bigint, 'Mitglied liest das eigene Inventar');
select lives_ok(
  $$insert into public.inventory_items (id, workspace_id, title, status) values ('84000000-0000-4000-8000-000000000052', '84000000-0000-4000-8000-000000000003', 'RLS client item', 'ready')$$,
  'Mitglied darf einen fachlich zulässigen eigenen Inventarartikel anlegen'
);
update public.inventory_items set title = 'RLS client item updated' where id = '84000000-0000-4000-8000-000000000052';
select is((select title from public.inventory_items where id = '84000000-0000-4000-8000-000000000052'), 'RLS client item updated', 'Mitglied darf den eigenen Inventarartikel ändern');
delete from public.inventory_items where id = '84000000-0000-4000-8000-000000000052';
select is((select count(*) from public.inventory_items where id = '84000000-0000-4000-8000-000000000052'), 0::bigint, 'Mitglied darf den eigenen Inventarartikel löschen');

set local request.jwt.claim.sub = :'foreign_user_id';
select is((select count(*) from public.inventory_items where id = '84000000-0000-4000-8000-000000000050'), 0::bigint, 'Fremdes Mitglied sieht den Inventarartikel nicht');
select throws_ok(
  $$insert into public.inventory_items (id, workspace_id, title, status) values ('84000000-0000-4000-8000-000000000053', '84000000-0000-4000-8000-000000000003', 'Foreign insert', 'ready')$$,
  '42501', null, 'Fremdes Mitglied darf keinen Inventarartikel anlegen'
);
update public.inventory_items set title = 'Foreign update' where id = '84000000-0000-4000-8000-000000000050';
reset role;
select is((select title from public.inventory_items where id = '84000000-0000-4000-8000-000000000050'), 'RLS owner item', 'Leises fremdes Update verändert den Inventarartikel nicht');
set local role authenticated;
set local request.jwt.claim.sub = :'foreign_user_id';
delete from public.inventory_items where id = '84000000-0000-4000-8000-000000000050';
reset role;
select is((select count(*) from public.inventory_items where id = '84000000-0000-4000-8000-000000000050'), 1::bigint, 'Leises fremdes Delete entfernt den Inventarartikel nicht');

set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.inventory_items where id = '84000000-0000-4000-8000-000000000050'$$, '42501', null, 'anon kann keine Inventarzeile lesen');
select throws_ok($$insert into public.inventory_items (id, workspace_id, title) values ('84000000-0000-4000-8000-000000000054', '84000000-0000-4000-8000-000000000003', 'Anon insert')$$, '42501', null, 'anon darf keinen Inventarartikel anlegen');
select throws_ok($$update public.inventory_items set title = 'Anon update' where id = '84000000-0000-4000-8000-000000000050'$$, '42501', null, 'anon darf keinen Inventarartikel ändern');
select throws_ok($$delete from public.inventory_items where id = '84000000-0000-4000-8000-000000000050'$$, '42501', null, 'anon darf keinen Inventarartikel löschen');
reset role;

select is((select count(*) from pg_class where oid = 'public.stock_lots'::regclass and relrowsecurity), 1::bigint, 'stock_lots hat RLS aktiviert');
set local role authenticated;
set local request.jwt.claim.sub = :'owner_user_id';
select is((select count(*) from public.stock_lots where id = '84000000-0000-4000-8000-000000000040'), 1::bigint, 'Mitglied liest das eigene Bestandslos');
select ok(not has_table_privilege('authenticated', 'public.stock_lots', 'insert') and not has_table_privilege('authenticated', 'public.stock_lots', 'update') and not has_table_privilege('authenticated', 'public.stock_lots', 'delete'), 'Bestandslose sind nur über Fach-RPCs schreibbar');
select throws_ok($$insert into public.stock_lots (id, workspace_id, purchase_id, purchase_line_id, catalog_product_id, received_quantity, remaining_quantity, unit_cost) values ('84000000-0000-4000-8000-000000000042', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000030', '84000000-0000-4000-8000-000000000020', 1, 1, 5)$$, '42501', null, 'Mitglied kann das eigene Bestandslos nicht direkt anlegen');
set local request.jwt.claim.sub = :'foreign_user_id';
select is((select count(*) from public.stock_lots where id = '84000000-0000-4000-8000-000000000040'), 0::bigint, 'Fremdes Mitglied sieht das Bestandslos nicht');
select throws_ok($$insert into public.stock_lots (id, workspace_id, purchase_id, purchase_line_id, catalog_product_id, received_quantity, remaining_quantity, unit_cost) values ('84000000-0000-4000-8000-000000000043', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000030', '84000000-0000-4000-8000-000000000020', 1, 1, 5)$$, '42501', null, 'Fremdes Mitglied darf kein Bestandslos anlegen');
select throws_ok($$update public.stock_lots set remaining_quantity = 1 where id = '84000000-0000-4000-8000-000000000040'$$, '42501', null, 'Fremdes Mitglied darf kein Bestandslos ändern');
select throws_ok($$delete from public.stock_lots where id = '84000000-0000-4000-8000-000000000040'$$, '42501', null, 'Fremdes Mitglied darf kein Bestandslos löschen');
set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.stock_lots where id = '84000000-0000-4000-8000-000000000040'$$, '42501', null, 'anon kann kein Bestandslos lesen');
select throws_ok($$insert into public.stock_lots (id, workspace_id, purchase_id, purchase_line_id, catalog_product_id, received_quantity, remaining_quantity, unit_cost) values ('84000000-0000-4000-8000-000000000044', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000030', '84000000-0000-4000-8000-000000000020', 1, 1, 5)$$, '42501', null, 'anon darf kein Bestandslos anlegen');
select throws_ok($$update public.stock_lots set remaining_quantity = 1 where id = '84000000-0000-4000-8000-000000000040'$$, '42501', null, 'anon darf kein Bestandslos ändern');
select throws_ok($$delete from public.stock_lots where id = '84000000-0000-4000-8000-000000000040'$$, '42501', null, 'anon darf kein Bestandslos löschen');
reset role;

select is((select count(*) from pg_class where oid = 'public.stock_movements'::regclass and relrowsecurity), 1::bigint, 'stock_movements hat RLS aktiviert');
set local role authenticated;
set local request.jwt.claim.sub = :'owner_user_id';
select is((select count(*) from public.stock_movements where id = '84000000-0000-4000-8000-000000000080'), 1::bigint, 'Mitglied liest die eigene Bestandsbewegung');
select ok(not has_table_privilege('authenticated', 'public.stock_movements', 'insert') and not has_table_privilege('authenticated', 'public.stock_movements', 'update') and not has_table_privilege('authenticated', 'public.stock_movements', 'delete'), 'Bestandsbewegungen sind nur über Fach-RPCs schreibbar');
select throws_ok($$insert into public.stock_movements (id, workspace_id, stock_lot_id, direction, quantity, reason) values ('84000000-0000-4000-8000-000000000082', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000040', 'in', 1, 'receipt')$$, '42501', null, 'Mitglied kann die eigene Bestandsbewegung nicht direkt anlegen');
set local request.jwt.claim.sub = :'foreign_user_id';
select is((select count(*) from public.stock_movements where id = '84000000-0000-4000-8000-000000000080'), 0::bigint, 'Fremdes Mitglied sieht die Bestandsbewegung nicht');
select throws_ok($$insert into public.stock_movements (id, workspace_id, stock_lot_id, direction, quantity, reason) values ('84000000-0000-4000-8000-000000000083', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000040', 'in', 1, 'receipt')$$, '42501', null, 'Fremdes Mitglied darf keine Bestandsbewegung anlegen');
select throws_ok($$update public.stock_movements set quantity = 1 where id = '84000000-0000-4000-8000-000000000080'$$, '42501', null, 'Fremdes Mitglied darf keine Bestandsbewegung ändern');
select throws_ok($$delete from public.stock_movements where id = '84000000-0000-4000-8000-000000000080'$$, '42501', null, 'Fremdes Mitglied darf keine Bestandsbewegung löschen');
set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.stock_movements where id = '84000000-0000-4000-8000-000000000080'$$, '42501', null, 'anon kann keine Bestandsbewegung lesen');
select throws_ok($$insert into public.stock_movements (id, workspace_id, stock_lot_id, direction, quantity, reason) values ('84000000-0000-4000-8000-000000000084', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000040', 'in', 1, 'receipt')$$, '42501', null, 'anon darf keine Bestandsbewegung anlegen');
select throws_ok($$update public.stock_movements set quantity = 1 where id = '84000000-0000-4000-8000-000000000080'$$, '42501', null, 'anon darf keine Bestandsbewegung ändern');
select throws_ok($$delete from public.stock_movements where id = '84000000-0000-4000-8000-000000000080'$$, '42501', null, 'anon darf keine Bestandsbewegung löschen');
reset role;

select is((select count(*) from pg_class where oid = 'public.sales'::regclass and relrowsecurity), 1::bigint, 'sales hat RLS aktiviert');
set local role authenticated;
set local request.jwt.claim.sub = :'owner_user_id';
select is((select count(*) from public.sales where id = '84000000-0000-4000-8000-000000000060'), 1::bigint, 'Mitglied liest den eigenen Verkauf');
select ok(not has_table_privilege('authenticated', 'public.sales', 'insert') and not has_table_privilege('authenticated', 'public.sales', 'update') and not has_table_privilege('authenticated', 'public.sales', 'delete'), 'Verkäufe sind nur über Fach-RPCs schreibbar');
select throws_ok($$insert into public.sales (id, workspace_id, platform, sale_price, sale_price_total) values ('84000000-0000-4000-8000-000000000062', '84000000-0000-4000-8000-000000000003', 'direct', 10, 10)$$, '42501', null, 'Mitglied kann den eigenen Verkauf nicht direkt anlegen');
set local request.jwt.claim.sub = :'foreign_user_id';
select is((select count(*) from public.sales where id = '84000000-0000-4000-8000-000000000060'), 0::bigint, 'Fremdes Mitglied sieht den Verkauf nicht');
select throws_ok($$insert into public.sales (id, workspace_id, platform, sale_price, sale_price_total) values ('84000000-0000-4000-8000-000000000063', '84000000-0000-4000-8000-000000000003', 'direct', 10, 10)$$, '42501', null, 'Fremdes Mitglied darf keinen Verkauf anlegen');
select throws_ok($$update public.sales set buyer_notes = 'Foreign update' where id = '84000000-0000-4000-8000-000000000060'$$, '42501', null, 'Fremdes Mitglied darf keinen Verkauf ändern');
select throws_ok($$delete from public.sales where id = '84000000-0000-4000-8000-000000000060'$$, '42501', null, 'Fremdes Mitglied darf keinen Verkauf löschen');
set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.sales where id = '84000000-0000-4000-8000-000000000060'$$, '42501', null, 'anon kann keinen Verkauf lesen');
select throws_ok($$insert into public.sales (id, workspace_id, platform, sale_price, sale_price_total) values ('84000000-0000-4000-8000-000000000064', '84000000-0000-4000-8000-000000000003', 'direct', 10, 10)$$, '42501', null, 'anon darf keinen Verkauf anlegen');
select throws_ok($$update public.sales set buyer_notes = 'Anon update' where id = '84000000-0000-4000-8000-000000000060'$$, '42501', null, 'anon darf keinen Verkauf ändern');
select throws_ok($$delete from public.sales where id = '84000000-0000-4000-8000-000000000060'$$, '42501', null, 'anon darf keinen Verkauf löschen');
reset role;

select is((select count(*) from pg_class where oid = 'public.sale_lines'::regclass and relrowsecurity), 1::bigint, 'sale_lines hat RLS aktiviert');
set local role authenticated;
set local request.jwt.claim.sub = :'owner_user_id';
select is((select count(*) from public.sale_lines where id = '84000000-0000-4000-8000-000000000070'), 1::bigint, 'Mitglied liest die eigene Verkaufsposition');
select ok(not has_table_privilege('authenticated', 'public.sale_lines', 'insert') and not has_table_privilege('authenticated', 'public.sale_lines', 'update') and not has_table_privilege('authenticated', 'public.sale_lines', 'delete'), 'Verkaufspositionen sind nur über Fach-RPCs schreibbar');
select throws_ok($$insert into public.sale_lines (id, workspace_id, sale_id, catalog_product_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode) values ('84000000-0000-4000-8000-000000000072', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000060', '84000000-0000-4000-8000-000000000020', 'Owner direct line', 1, 10, 10, 5, 'diff_25a')$$, '42501', null, 'Mitglied kann die eigene Verkaufsposition nicht direkt anlegen');
set local request.jwt.claim.sub = :'foreign_user_id';
select is((select count(*) from public.sale_lines where id = '84000000-0000-4000-8000-000000000070'), 0::bigint, 'Fremdes Mitglied sieht die Verkaufsposition nicht');
select throws_ok($$insert into public.sale_lines (id, workspace_id, sale_id, catalog_product_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode) values ('84000000-0000-4000-8000-000000000073', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000060', '84000000-0000-4000-8000-000000000020', 'Foreign direct line', 1, 10, 10, 5, 'diff_25a')$$, '42501', null, 'Fremdes Mitglied darf keine Verkaufsposition anlegen');
select throws_ok($$update public.sale_lines set title_snapshot = 'Foreign update' where id = '84000000-0000-4000-8000-000000000070'$$, '42501', null, 'Fremdes Mitglied darf keine Verkaufsposition ändern');
select throws_ok($$delete from public.sale_lines where id = '84000000-0000-4000-8000-000000000070'$$, '42501', null, 'Fremdes Mitglied darf keine Verkaufsposition löschen');
set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.sale_lines where id = '84000000-0000-4000-8000-000000000070'$$, '42501', null, 'anon kann keine Verkaufsposition lesen');
select throws_ok($$insert into public.sale_lines (id, workspace_id, sale_id, catalog_product_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode) values ('84000000-0000-4000-8000-000000000074', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000060', '84000000-0000-4000-8000-000000000020', 'Anon direct line', 1, 10, 10, 5, 'diff_25a')$$, '42501', null, 'anon darf keine Verkaufsposition anlegen');
select throws_ok($$update public.sale_lines set title_snapshot = 'Anon update' where id = '84000000-0000-4000-8000-000000000070'$$, '42501', null, 'anon darf keine Verkaufsposition ändern');
select throws_ok($$delete from public.sale_lines where id = '84000000-0000-4000-8000-000000000070'$$, '42501', null, 'anon darf keine Verkaufsposition löschen');
reset role;

select * from finish();
rollback;
