\set ON_ERROR_STOP on

begin;

select plan(19);

\set main_workspace_id '82000000-0000-4000-8000-000000000001'
\set foreign_workspace_id '82000000-0000-4000-8000-000000000002'
\set main_user_id '82000000-0000-4000-8000-000000000003'
\set foreign_user_id '82000000-0000-4000-8000-000000000004'
\set available_item_id '82000000-0000-4000-8000-000000000005'
\set valid_item_id '82000000-0000-4000-8000-000000000006'
\set orphan_item_id '82000000-0000-4000-8000-000000000007'
\set conflict_item_id '82000000-0000-4000-8000-000000000008'
\set multiple_item_id '82000000-0000-4000-8000-000000000009'
\set foreign_item_id '82000000-0000-4000-8000-000000000010'
\set valid_sale_id '82000000-0000-4000-8000-000000000011'
\set conflict_sale_id '82000000-0000-4000-8000-000000000012'
\set legacy_header_item_id '82000000-0000-4000-8000-000000000018'
\set legacy_header_sale_id '82000000-0000-4000-8000-000000000019'

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    :'main_user_id'::uuid,
    'authenticated',
    'authenticated',
    'inventory-sale-main@example.test',
    'not-used-by-this-test',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    :'foreign_user_id'::uuid,
    'authenticated',
    'authenticated',
    'inventory-sale-foreign@example.test',
    'not-used-by-this-test',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
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
  (:'conflict_item_id'::uuid, :'main_workspace_id'::uuid, 'Sale status conflict', 'ready'),
  (:'multiple_item_id'::uuid, :'main_workspace_id'::uuid, 'Multiple active sales', 'sold'),
  (:'legacy_header_item_id'::uuid, :'main_workspace_id'::uuid, 'Legacy header only', 'sold'),
  (:'foreign_item_id'::uuid, :'foreign_workspace_id'::uuid, 'Foreign item', 'ready');

insert into public.sales (
  id, workspace_id, inventory_item_id, platform, sale_price,
  sale_price_total, sale_date, returned_at, voided_at, voided_by, void_reason
) values
  (
    :'valid_sale_id'::uuid,
    :'main_workspace_id'::uuid,
    :'valid_item_id'::uuid,
    'direct',
    25,
    25,
    current_date,
    null,
    null,
    null,
    null
  ),
  (
    :'conflict_sale_id'::uuid,
    :'main_workspace_id'::uuid,
    :'conflict_item_id'::uuid,
    'direct',
    20,
    20,
    current_date,
    null,
    null,
    null,
    null
  ),
  (
    '82000000-0000-4000-8000-000000000013',
    :'main_workspace_id'::uuid,
    :'multiple_item_id'::uuid,
    'direct',
    30,
    30,
    current_date,
    null,
    null,
    null,
    null
  ),
  (
    '82000000-0000-4000-8000-000000000014',
    :'main_workspace_id'::uuid,
    :'multiple_item_id'::uuid,
    'direct',
    30,
    30,
    current_date,
    null,
    null,
    null,
    null
  ),
  (
    '82000000-0000-4000-8000-000000000015',
    :'main_workspace_id'::uuid,
    :'available_item_id'::uuid,
    'direct',
    15,
    15,
    current_date,
    now(),
    null,
    null,
    null
  ),
  (
    '82000000-0000-4000-8000-000000000016',
    :'main_workspace_id'::uuid,
    :'available_item_id'::uuid,
    'direct',
    15,
    15,
    current_date,
    null,
    now(),
    :'main_user_id'::uuid,
    'Teststorno'
  ),
  (
    '82000000-0000-4000-8000-000000000017',
    :'foreign_workspace_id'::uuid,
    :'foreign_item_id'::uuid,
    'direct',
    10,
    10,
    current_date,
    null,
    null,
    null,
    null
  ),
  (
    :'legacy_header_sale_id'::uuid,
    :'main_workspace_id'::uuid,
    :'legacy_header_item_id'::uuid,
    'direct',
    18,
    18,
    current_date,
    null,
    null,
    null,
    null
  );

insert into public.sale_lines (
  id, workspace_id, sale_id, inventory_item_id, title_snapshot,
  quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode
) values
  (
    '82000000-0000-4000-8000-000000000021',
    :'main_workspace_id'::uuid,
    :'valid_sale_id'::uuid,
    :'valid_item_id'::uuid,
    'Valid sold item',
    1, 25, 25, 10, 'diff_25a'
  ),
  (
    '82000000-0000-4000-8000-000000000022',
    :'main_workspace_id'::uuid,
    :'conflict_sale_id'::uuid,
    :'conflict_item_id'::uuid,
    'Sale status conflict',
    1, 20, 20, 8, 'diff_25a'
  ),
  (
    '82000000-0000-4000-8000-000000000023',
    :'main_workspace_id'::uuid,
    '82000000-0000-4000-8000-000000000013',
    :'multiple_item_id'::uuid,
    'Multiple active sales',
    1, 30, 30, 12, 'diff_25a'
  ),
  (
    '82000000-0000-4000-8000-000000000024',
    :'main_workspace_id'::uuid,
    '82000000-0000-4000-8000-000000000014',
    :'multiple_item_id'::uuid,
    'Multiple active sales',
    1, 30, 30, 12, 'diff_25a'
  ),
  (
    '82000000-0000-4000-8000-000000000025',
    :'main_workspace_id'::uuid,
    '82000000-0000-4000-8000-000000000015',
    :'available_item_id'::uuid,
    'Returned sale',
    1, 15, 15, 6, 'diff_25a'
  ),
  (
    '82000000-0000-4000-8000-000000000026',
    :'main_workspace_id'::uuid,
    '82000000-0000-4000-8000-000000000016',
    :'available_item_id'::uuid,
    'Voided sale',
    1, 15, 15, 6, 'diff_25a'
  ),
  (
    '82000000-0000-4000-8000-000000000027',
    :'foreign_workspace_id'::uuid,
    '82000000-0000-4000-8000-000000000017',
    :'foreign_item_id'::uuid,
    'Foreign item',
    1, 10, 10, 4, 'diff_25a'
  );

select has_column('public', 'sales', 'voided_at', 'sales has a void timestamp');
select has_column('public', 'sales', 'voided_by', 'sales records who voided it');
select has_column('public', 'sales', 'void_reason', 'sales records why it was voided');

select throws_ok(
  $$
    update public.sales
    set voided_at = now(), voided_by = null, void_reason = 'Unvollständig'
    where id = '82000000-0000-4000-8000-000000000011'
  $$,
  '23514',
  null,
  'Stornierung ohne handelnde Person wird abgelehnt'
);

select throws_ok(
  $$
    update public.sales
    set voided_at = null,
        voided_by = '82000000-0000-4000-8000-000000000003',
        void_reason = 'Unvollständig'
    where id = '82000000-0000-4000-8000-000000000011'
  $$,
  '23514',
  null,
  'Stornodaten ohne Zeitpunkt werden abgelehnt'
);

select throws_ok(
  $$
    update public.sales
    set voided_at = now(),
        voided_by = '82000000-0000-4000-8000-000000000003',
        void_reason = '   '
    where id = '82000000-0000-4000-8000-000000000011'
  $$,
  '23514',
  null,
  'Stornierung ohne nichtleeren Grund wird abgelehnt'
);

set local role authenticated;
set local request.jwt.claim.sub = :'main_user_id';

select is(
  (select sale_state from public.inventory_item_sale_states where inventory_item_id = :'orphan_item_id'),
  'legacy_sold_unverified',
  'sold ohne bestandswirksamen Verkauf bleibt ungeklärter Altbestand'
);

select is(
  (select sale_state from public.inventory_item_sale_states where inventory_item_id = :'legacy_header_item_id'),
  'legacy_sale_header_without_line',
  'aktiver Legacy-Verkaufskopf ohne Position bleibt als Integritätsfall sichtbar'
);

select is(
  (select active_sale_count from public.inventory_item_sale_states where inventory_item_id = :'valid_item_id'),
  1::bigint,
  'derselbe bestandswirksame Verkauf über Kopf und Position wird nur einmal gezählt'
);

select is(
  (select active_sale_id from public.inventory_item_sale_states where inventory_item_id = :'valid_item_id'),
  :'valid_sale_id'::uuid,
  'der bestandswirksame Verkauf wird referenziert'
);

select is(
  (select sale_state from public.inventory_item_sale_states where inventory_item_id = :'valid_item_id'),
  'sold',
  'verkauftes Einzelstück mit bestandswirksamem Verkauf ist konsistent'
);

select is(
  (select sale_state from public.inventory_item_sale_states where inventory_item_id = :'available_item_id'),
  'no_active_sale',
  'retournierte und stornierte Verkäufe sind nicht bestandswirksam'
);

select is(
  (select sale_state from public.inventory_item_sale_states where inventory_item_id = :'conflict_item_id'),
  'sale_status_conflict',
  'bestandswirksamer Verkauf ohne sold-Status wird als Konflikt erkannt'
);

select is(
  (select active_sale_count from public.inventory_item_sale_states where inventory_item_id = :'multiple_item_id'),
  2::bigint,
  'mehrere bestandswirksame Verkäufe werden vollständig gezählt'
);

select is(
  (select sale_state from public.inventory_item_sale_states where inventory_item_id = :'multiple_item_id'),
  'multiple_active_sales',
  'mehrere bestandswirksame Verkäufe werden als Konflikt erkannt'
);

set local request.jwt.claim.sub = :'foreign_user_id';

select is(
  (
    select count(*)
    from public.inventory_item_sale_states
    where workspace_id = :'main_workspace_id'::uuid
  ),
  0::bigint,
  'fremdes Mitglied sieht keine Einzelstücke des anderen Workspace'
);

reset role;

select ok(
  not has_table_privilege('anon', 'public.inventory_item_sale_states', 'select'),
  'anon kann die Verkaufszustands-View nicht lesen'
);

select ok(
  has_table_privilege('authenticated', 'public.inventory_item_sale_states', 'select'),
  'authenticated kann die Verkaufszustands-View lesen'
);

select ok(
  not (
    has_table_privilege('authenticated', 'public.inventory_item_sale_states', 'insert')
    or has_table_privilege('authenticated', 'public.inventory_item_sale_states', 'update')
    or has_table_privilege('authenticated', 'public.inventory_item_sale_states', 'delete')
    or has_table_privilege('authenticated', 'public.inventory_item_sale_states', 'truncate')
    or has_table_privilege('authenticated', 'public.inventory_item_sale_states', 'references')
    or has_table_privilege('authenticated', 'public.inventory_item_sale_states', 'trigger')
    or has_table_privilege('authenticated', 'public.inventory_item_sale_states', 'maintain')
  ),
  'authenticated besitzt ausschließlich Leserechte auf der Verkaufszustands-View'
);

select * from finish();

rollback;
