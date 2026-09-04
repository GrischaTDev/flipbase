\if :{?purchase_costing_legacy_fixture}

\set legacy_workspace_id '94000000-0000-4000-8000-000000000001'
\set foreign_workspace_id '94000000-0000-4000-8000-000000000002'
\set legacy_owner_id '94000000-0000-4000-8000-000000000003'
\set foreign_owner_id '94000000-0000-4000-8000-000000000004'
\set legacy_accountant_id '94000000-0000-4000-8000-000000000005'
\set legacy_viewer_id '94000000-0000-4000-8000-000000000006'
\set safe_purchase_id '94000000-0000-4000-8000-000000000010'
\set empty_purchase_id '94000000-0000-4000-8000-000000000011'
\set normal_purchase_id '94000000-0000-4000-8000-000000000012'
\set foreign_purchase_id '94000000-0000-4000-8000-000000000013'
\set unsold_purchase_id '94000000-0000-4000-8000-000000000014'
\set unsupported_status_purchase_id '94000000-0000-4000-8000-000000000015'

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    :'legacy_owner_id'::uuid, 'authenticated', 'authenticated',
    'legacy-costing-owner@example.test', 'unused', '{}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    :'foreign_owner_id'::uuid, 'authenticated', 'authenticated',
    'legacy-costing-foreign@example.test', 'unused', '{}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    :'legacy_accountant_id'::uuid, 'authenticated', 'authenticated',
    'legacy-costing-accountant@example.test', 'unused', '{}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    :'legacy_viewer_id'::uuid, 'authenticated', 'authenticated',
    'legacy-costing-viewer@example.test', 'unused', '{}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.workspaces (id, name)
values
  (:'legacy_workspace_id'::uuid, 'legacy costing main'),
  (:'foreign_workspace_id'::uuid, 'legacy costing foreign');

insert into public.workspace_members (workspace_id, user_id, role)
values
  (:'legacy_workspace_id'::uuid, :'legacy_owner_id'::uuid, 'owner'),
  (:'legacy_workspace_id'::uuid, :'legacy_accountant_id'::uuid, 'accountant'),
  (:'legacy_workspace_id'::uuid, :'legacy_viewer_id'::uuid, 'member'),
  (:'foreign_workspace_id'::uuid, :'foreign_owner_id'::uuid, 'owner');

insert into public.purchases (
  id, workspace_id, type, title, purchase_price, entry_status
) values
  (:'safe_purchase_id'::uuid, :'legacy_workspace_id'::uuid, 'mystery_pack', 'Safe legacy Mystery Box', 100.01, 'draft'),
  (:'empty_purchase_id'::uuid, :'legacy_workspace_id'::uuid, 'mystery_pack', 'Empty legacy Mystery Box', 50, 'draft'),
  (:'normal_purchase_id'::uuid, :'legacy_workspace_id'::uuid, 'single', 'Normal legacy purchase', 20, 'draft'),
  (:'foreign_purchase_id'::uuid, :'foreign_workspace_id'::uuid, 'mystery_pack', 'Foreign legacy Mystery Box', 30, 'draft'),
  (:'unsold_purchase_id'::uuid, :'legacy_workspace_id'::uuid, 'mystery_pack', 'Unsold legacy Mystery Box', 40, 'draft'),
  (:'unsupported_status_purchase_id'::uuid, :'legacy_workspace_id'::uuid, 'mystery_pack', 'Listed legacy Mystery Box', 25, 'draft');

insert into public.purchase_costs (
  id, workspace_id, purchase_id, type, amount, description, allocation_method
) values (
  '94000000-0000-4000-8000-000000000020',
  :'legacy_workspace_id'::uuid,
  :'safe_purchase_id'::uuid,
  'shipping',
  10,
  'Legacy shipping',
  'quantity'
);

select pg_catalog.set_config('flipbase.allow_inventory_sold_transition', 'on', true);

insert into public.inventory_items (
  id, workspace_id, purchase_id, title, condition, status,
  allocated_purchase_cost, expected_value, created_at
) values
  ('94000000-0000-4000-8000-000000000101', :'legacy_workspace_id'::uuid, :'safe_purchase_id'::uuid, 'Legacy shoe 1', 'used', 'sold', 0, 60, '2026-08-01T10:00:01Z'),
  ('94000000-0000-4000-8000-000000000102', :'legacy_workspace_id'::uuid, :'safe_purchase_id'::uuid, 'Legacy shoe 2', 'very_good', 'sold', 0, 70, '2026-08-01T10:00:01Z'),
  ('94000000-0000-4000-8000-000000000103', :'legacy_workspace_id'::uuid, :'safe_purchase_id'::uuid, 'Legacy shoe 3', 'like_new', 'ready', 0, null, '2026-08-01T10:00:01Z'),
  ('94000000-0000-4000-8000-000000000104', :'legacy_workspace_id'::uuid, :'safe_purchase_id'::uuid, 'Legacy shoe 4', 'new', 'ready', 0, 90, '2026-08-01T10:00:01Z'),
  ('94000000-0000-4000-8000-000000000105', :'foreign_workspace_id'::uuid, :'foreign_purchase_id'::uuid, 'Foreign item', 'used', 'ready', 0, null, '2026-08-01T10:00:05Z'),
  ('94000000-0000-4000-8000-000000000106', :'legacy_workspace_id'::uuid, :'unsold_purchase_id'::uuid, 'Unsold legacy item 1', 'used', 'needs_review', 0, null, '2026-08-01T10:00:06Z'),
  ('94000000-0000-4000-8000-000000000107', :'legacy_workspace_id'::uuid, :'unsold_purchase_id'::uuid, 'Unsold legacy item 2', 'very_good', 'ready', 0, null, '2026-08-01T10:00:07Z'),
  ('94000000-0000-4000-8000-000000000108', :'legacy_workspace_id'::uuid, :'unsupported_status_purchase_id'::uuid, 'Listed legacy item', 'used', 'listed', 0, null, '2026-08-01T10:00:08Z');

select pg_catalog.set_config('flipbase.allow_inventory_sold_transition', '', true);

insert into public.sales (
  id, workspace_id, inventory_item_id, platform, sale_price, sale_price_total,
  sale_date, platform_fee, shipping_cost, packaging_cost, other_costs, created_at
) values
  ('94000000-0000-4000-8000-000000000201', :'legacy_workspace_id'::uuid, '94000000-0000-4000-8000-000000000101', 'ebay', 42.98, 42.98, '2026-08-20', 7.70, 5.19, 0.50, 1.25, '2026-08-20T12:00:00Z'),
  ('94000000-0000-4000-8000-000000000202', :'legacy_workspace_id'::uuid, '94000000-0000-4000-8000-000000000102', 'vinted', 35, 35, '2026-08-21', 0, 0, 0, 0, '2026-08-21T12:00:00Z');

insert into public.sale_lines (
  id, workspace_id, sale_id, inventory_item_id, title_snapshot, quantity,
  unit_sale_price, line_total, cost_of_goods_sold, tax_mode, created_at
) values
  ('94000000-0000-4000-8000-000000000211', :'legacy_workspace_id'::uuid, '94000000-0000-4000-8000-000000000201', '94000000-0000-4000-8000-000000000101', 'Legacy shoe 1', 1, 42.98, 42.98, 99, 'diff_25a', '2026-08-20T12:00:00Z'),
  ('94000000-0000-4000-8000-000000000212', :'legacy_workspace_id'::uuid, '94000000-0000-4000-8000-000000000202', '94000000-0000-4000-8000-000000000102', 'Legacy shoe 2', 1, 35, 35, 88, 'diff_25a', '2026-08-21T12:00:00Z');

\else

begin;
select plan(1);
select pass('purchase costing legacy fixture is include-only');
select * from finish();
rollback;

\endif
