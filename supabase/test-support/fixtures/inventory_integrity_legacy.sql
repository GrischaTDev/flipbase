\if :{?inventory_integrity_fixture}

\set main_workspace_id '82000000-0000-4000-8000-000000000001'
\set foreign_workspace_id '82000000-0000-4000-8000-000000000002'
\set main_user_id '82000000-0000-4000-8000-000000000003'
\set foreign_user_id '82000000-0000-4000-8000-000000000004'
\set available_item_id '82000000-0000-4000-8000-000000000005'
\set valid_item_id '82000000-0000-4000-8000-000000000006'
\set orphan_item_id '82000000-0000-4000-8000-000000000007'
\set legacy_record_item_id '82000000-0000-4000-8000-000000000017'
\set conflict_item_id '82000000-0000-4000-8000-000000000008'
\set multiple_item_id '82000000-0000-4000-8000-000000000009'
\set foreign_item_id '82000000-0000-4000-8000-000000000010'
\set valid_sale_id '82000000-0000-4000-8000-000000000011'
\set conflict_sale_id '82000000-0000-4000-8000-000000000012'
\set legacy_header_item_id '82000000-0000-4000-8000-000000000018'
\set legacy_header_sale_id '82000000-0000-4000-8000-000000000019'
\set legacy_store_order_id '82000000-0000-4000-8000-000000000026'
\set legacy_store_order_item_id '82000000-0000-4000-8000-000000000027'
insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    :'main_user_id'::uuid, 'authenticated', 'authenticated',
    'inventory-sale-main@example.test', 'not-used-by-this-test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    :'foreign_user_id'::uuid, 'authenticated', 'authenticated',
    'inventory-sale-foreign@example.test', 'not-used-by-this-test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.workspaces (id, name)
values
  (:'main_workspace_id'::uuid, 'inventory sale integrity main'),
  (:'foreign_workspace_id'::uuid, 'inventory sale integrity foreign');

insert into public.workspace_members (workspace_id, user_id, role)
values
  (:'main_workspace_id'::uuid, :'main_user_id'::uuid, 'owner'),
  (:'foreign_workspace_id'::uuid, :'foreign_user_id'::uuid, 'owner');

insert into public.inventory_items (id, workspace_id, title, status)
values
  (:'available_item_id'::uuid, :'main_workspace_id'::uuid, 'Available item', 'ready'),
  (:'valid_item_id'::uuid, :'main_workspace_id'::uuid, 'Valid sold item', 'sold'),
  (:'orphan_item_id'::uuid, :'main_workspace_id'::uuid, 'Legacy orphan item', 'sold'),
  (:'legacy_record_item_id'::uuid, :'main_workspace_id'::uuid, 'Legacy sale to record', 'sold'),
  (:'conflict_item_id'::uuid, :'main_workspace_id'::uuid, 'Sale status conflict', 'ready'),
  (:'multiple_item_id'::uuid, :'main_workspace_id'::uuid, 'Multiple active sales', 'sold'),
  (:'legacy_header_item_id'::uuid, :'main_workspace_id'::uuid, 'Legacy header only', 'sold'),
  (:'foreign_item_id'::uuid, :'foreign_workspace_id'::uuid, 'Foreign orphan', 'sold');

insert into public.store_orders (
  id, workspace_id, order_number, customer, subtotal, shipping_cost, total,
  payment_method, payment_status, payment_id, status, created_at
) values (
  :'legacy_store_order_id'::uuid,
  :'main_workspace_id'::uuid,
  'LEGACY-STORE-ORDER-1',
  '{"email":"legacy-store@example.test","name":"Legacy Store Customer"}'::jsonb,
  19.90,
  4.99,
  24.89,
  'bank_transfer',
  'paid',
  'legacy-payment-1',
  'confirmed',
  '2026-08-29T08:00:00Z'::timestamptz
);

insert into public.store_order_items (
  id, store_order_id, inventory_item_id, catalog_product_id,
  item_title, price, quantity
) values (
  :'legacy_store_order_item_id'::uuid,
  :'legacy_store_order_id'::uuid,
  :'available_item_id'::uuid,
  null,
  'Legacy store order item',
  19.90,
  1
);

insert into public.sales (
  id, workspace_id, inventory_item_id, platform, sale_price,
  sale_price_total, sale_date, returned_at
) values
  (:'valid_sale_id'::uuid, :'main_workspace_id'::uuid, :'valid_item_id'::uuid, 'direct', 25, 25, current_date, null),
  (:'conflict_sale_id'::uuid, :'main_workspace_id'::uuid, :'conflict_item_id'::uuid, 'direct', 20, 20, current_date, null),
  ('82000000-0000-4000-8000-000000000013', :'main_workspace_id'::uuid, :'multiple_item_id'::uuid, 'direct', 30, 30, current_date, null),
  ('82000000-0000-4000-8000-000000000014', :'main_workspace_id'::uuid, :'multiple_item_id'::uuid, 'direct', 30, 30, current_date, null),
  ('82000000-0000-4000-8000-000000000015', :'main_workspace_id'::uuid, :'available_item_id'::uuid, 'direct', 15, 15, current_date, now()),
  (:'legacy_header_sale_id'::uuid, :'main_workspace_id'::uuid, :'legacy_header_item_id'::uuid, 'direct', 18, 18, current_date, null);

insert into public.sale_lines (
  id, workspace_id, sale_id, inventory_item_id, title_snapshot,
  quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode
) values
  ('82000000-0000-4000-8000-000000000021', :'main_workspace_id'::uuid, :'valid_sale_id'::uuid, :'valid_item_id'::uuid, 'Valid sold item', 1, 25, 25, 10, 'diff_25a'),
  ('82000000-0000-4000-8000-000000000022', :'main_workspace_id'::uuid, :'conflict_sale_id'::uuid, :'conflict_item_id'::uuid, 'Sale status conflict', 1, 20, 20, 8, 'diff_25a'),
  ('82000000-0000-4000-8000-000000000023', :'main_workspace_id'::uuid, '82000000-0000-4000-8000-000000000013', :'multiple_item_id'::uuid, 'Multiple active sales', 1, 30, 30, 12, 'diff_25a'),
  ('82000000-0000-4000-8000-000000000024', :'main_workspace_id'::uuid, '82000000-0000-4000-8000-000000000014', :'multiple_item_id'::uuid, 'Multiple active sales', 1, 30, 30, 12, 'diff_25a'),
  ('82000000-0000-4000-8000-000000000025', :'main_workspace_id'::uuid, '82000000-0000-4000-8000-000000000015', :'available_item_id'::uuid, 'Returned sale', 1, 15, 15, 6, 'diff_25a');

\else

begin;
select plan(1);
select pass('inventory integrity legacy fixture is include-only');
select * from finish();
rollback;

\endif
