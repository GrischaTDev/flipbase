\set ON_ERROR_STOP on

begin;

select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '9d000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'individual-market-value@example.test',
  'unused',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.workspaces (id, name)
values ('9d000000-0000-4000-8000-000000000011', 'Marktwert-Persistenz');

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '9d000000-0000-4000-8000-000000000011',
  '9d000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.purchases (
  id, workspace_id, type, title, purchase_date, purchase_price,
  cost_allocation_mode, entry_status
) values (
  '9d000000-0000-4000-8000-000000000101',
  '9d000000-0000-4000-8000-000000000011',
  'mystery_pack',
  'Marktwert-Fundstücke',
  '2026-09-01',
  30,
  'even',
  'draft'
);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, received_quantity, price_mode, unit_purchase_price,
  line_total, condition_snapshot, estimated_market_value
) values
  (
    '9d000000-0000-4000-8000-000000000301',
    '9d000000-0000-4000-8000-000000000011',
    '9d000000-0000-4000-8000-000000000101',
    'Fundstück mit Marktwert',
    'individual',
    3,
    0,
    'unpriced_mystery',
    null,
    null,
    'used',
    45
  ),
  (
    '9d000000-0000-4000-8000-000000000302',
    '9d000000-0000-4000-8000-000000000011',
    '9d000000-0000-4000-8000-000000000101',
    'Fundstück ohne Marktwert',
    'individual',
    1,
    0,
    'unpriced_mystery',
    null,
    null,
    'used',
    null
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '9d000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.receive_individual_purchase_line(
    '9d000000-0000-4000-8000-000000000011',
    '9d000000-0000-4000-8000-000000000101',
    '9d000000-0000-4000-8000-000000000301',
    '{"title":"Bewusst geändert","condition":"used"}'::jsonb
  )$$,
  'das erste Stück mit Marktwert wird erfasst'
);

select lives_ok(
  $$select public.receive_individual_purchase_line(
    '9d000000-0000-4000-8000-000000000011',
    '9d000000-0000-4000-8000-000000000101',
    '9d000000-0000-4000-8000-000000000301',
    '{"title":"Marktwert-Backfill","condition":"used"}'::jsonb
  )$$,
  'das zweite Stück mit Marktwert wird erfasst'
);

select lives_ok(
  $$select public.receive_individual_purchase_line(
    '9d000000-0000-4000-8000-000000000011',
    '9d000000-0000-4000-8000-000000000101',
    '9d000000-0000-4000-8000-000000000302',
    '{"title":"Marktwert unbekannt","condition":"used"}'::jsonb
  )$$,
  'das Stück ohne Marktwert wird erfasst'
);

select is(
  (
    select item.expected_value
    from public.inventory_items as item
    where item.title = 'Bewusst geändert'
  ),
  45::numeric,
  'der Positionsmarktwert wird schon beim Wareneingang persistiert'
);

select is(
  (
    select item.expected_value
    from public.inventory_items as item
    where item.title = 'Marktwert unbekannt'
  ),
  null::numeric,
  'ein unbekannter Positionsmarktwert bleibt beim Wareneingang null'
);

update public.inventory_items
set expected_value = case
  when title = 'Bewusst geändert' then 99
  when title = 'Marktwert-Backfill' then null
  else expected_value
end
where purchase_id = '9d000000-0000-4000-8000-000000000101';

select lives_ok(
  $$select public.finalize_purchase_costing(
    '9d000000-0000-4000-8000-000000000011',
    '9d000000-0000-4000-8000-000000000101'
  )$$,
  'der Einkauf kann mit den erfassten Marktwerten finalisiert werden'
);

select is(
  (
    select item.expected_value
    from public.inventory_items as item
    where item.title = 'Bewusst geändert'
  ),
  99::numeric,
  'die Finalisierung überschreibt keinen bewusst geänderten Marktwert'
);

select is(
  (
    select item.expected_value
    from public.inventory_items as item
    where item.title = 'Marktwert-Backfill'
  ),
  45::numeric,
  'die Finalisierung ergänzt einen noch fehlenden Marktwert aus der Position'
);

select is(
  (
    select item.expected_value
    from public.inventory_items as item
    where item.title = 'Fundstück mit Marktwert'
  ),
  45::numeric,
  'ein erst bei der Finalisierung erzeugtes Stück erhält weiterhin den Positionsmarktwert'
);

select is(
  (
    select item.expected_value
    from public.inventory_items as item
    where item.title = 'Marktwert unbekannt'
  ),
  null::numeric,
  'auch nach der Finalisierung bleibt ein unbekannter Marktwert null'
);

select * from finish();

rollback;
