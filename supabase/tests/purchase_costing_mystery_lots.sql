\set ON_ERROR_STOP on

begin;

select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '97000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'mystery-lot-owner@example.test',
  'unused',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.workspaces (id, name) values (
  '97000000-0000-4000-8000-000000000011',
  'Mystery-Losgrenzen'
);

insert into public.workspace_members (workspace_id, user_id, role) values (
  '97000000-0000-4000-8000-000000000011',
  '97000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('97000000-0000-4000-8000-000000000201', '97000000-0000-4000-8000-000000000011', 'Grenzen 1-2-2', 'quantity'),
  ('97000000-0000-4000-8000-000000000202', '97000000-0000-4000-8000-000000000011', 'Grenzen 3-1-2', 'quantity'),
  ('97000000-0000-4000-8000-000000000203', '97000000-0000-4000-8000-000000000011', 'Teilweise erfasst', 'quantity'),
  ('97000000-0000-4000-8000-000000000204', '97000000-0000-4000-8000-000000000011', 'Kostenlos', 'quantity'),
  ('97000000-0000-4000-8000-000000000205', '97000000-0000-4000-8000-000000000011', 'Unbekannt', 'quantity'),
  ('97000000-0000-4000-8000-000000000206', '97000000-0000-4000-8000-000000000011', 'Benutztes Los', 'quantity'),
  ('97000000-0000-4000-8000-000000000207', '97000000-0000-4000-8000-000000000011', 'Zu viele Lose', 'quantity'),
  ('97000000-0000-4000-8000-000000000208', '97000000-0000-4000-8000-000000000011', 'Falsches Produkt', 'quantity'),
  ('97000000-0000-4000-8000-000000000209', '97000000-0000-4000-8000-000000000011', 'Falsche Position', 'quantity'),
  ('97000000-0000-4000-8000-000000000210', '97000000-0000-4000-8000-000000000011', 'Falsche Receipt-Menge', 'quantity');

insert into public.purchases (
  id, workspace_id, type, title, purchase_price, total_purchase_cost
) values
  ('97000000-0000-4000-8000-000000000101', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Sieben Cent auf fünf', 0.07, null),
  ('97000000-0000-4000-8000-000000000102', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Zehn Cent auf sechs', 0.10, null),
  ('97000000-0000-4000-8000-000000000103', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Ein Cent teilweise erfasst', 0.01, null),
  ('97000000-0000-4000-8000-000000000104', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Ausdrücklich kostenlos', 0, null),
  ('97000000-0000-4000-8000-000000000105', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Preis noch unbekannt', null, null),
  ('97000000-0000-4000-8000-000000000106', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Teilweise benutztes Los', 0.03, null),
  ('97000000-0000-4000-8000-000000000107', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Losmenge über Position', 0.03, null),
  ('97000000-0000-4000-8000-000000000108', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Los mit falschem Produkt', 0.01, null),
  ('97000000-0000-4000-8000-000000000109', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Los mit fremder Position', 0.01, null),
  ('97000000-0000-4000-8000-000000000110', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Inkonsistente Receipt-Menge', 0.02, null),
  ('97000000-0000-4000-8000-000000000111', '97000000-0000-4000-8000-000000000011', 'mystery_pack', 'Fremde Zielposition', 0.01, null);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total, created_at
) values
  ('97000000-0000-4000-8000-000000000301', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000101', '97000000-0000-4000-8000-000000000201', 'Grenzen 1-2-2', 'quantity', 5, 5, 'unpriced_mystery', null, null, '2026-08-31 15:00:01+00'),
  ('97000000-0000-4000-8000-000000000302', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000102', '97000000-0000-4000-8000-000000000202', 'Grenzen 3-1-2', 'quantity', 6, 6, 'unpriced_mystery', null, null, '2026-08-31 15:00:02+00'),
  ('97000000-0000-4000-8000-000000000303', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000103', '97000000-0000-4000-8000-000000000203', 'Teilweise erfasst', 'quantity', 4, 2, 'unpriced_mystery', null, null, '2026-08-31 15:00:03+00'),
  ('97000000-0000-4000-8000-000000000304', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000104', '97000000-0000-4000-8000-000000000204', 'Kostenlos', 'quantity', 3, 3, 'unpriced_mystery', null, null, '2026-08-31 15:00:04+00'),
  ('97000000-0000-4000-8000-000000000305', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000105', '97000000-0000-4000-8000-000000000205', 'Unbekannt', 'quantity', 2, 2, 'unpriced_mystery', null, null, '2026-08-31 15:00:05+00'),
  ('97000000-0000-4000-8000-000000000306', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000106', '97000000-0000-4000-8000-000000000206', 'Benutztes Los', 'quantity', 2, 2, 'unpriced_mystery', null, null, '2026-08-31 15:00:06+00'),
  ('97000000-0000-4000-8000-000000000307', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000107', '97000000-0000-4000-8000-000000000207', 'Zu viele Lose', 'quantity', 3, 3, 'unpriced_mystery', null, null, '2026-08-31 15:00:07+00'),
  ('97000000-0000-4000-8000-000000000308', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000108', '97000000-0000-4000-8000-000000000208', 'Falsches Produkt', 'quantity', 1, 1, 'unpriced_mystery', null, null, '2026-08-31 15:00:08+00'),
  ('97000000-0000-4000-8000-000000000309', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000109', '97000000-0000-4000-8000-000000000209', 'Falsche Position', 'quantity', 1, 0, 'unpriced_mystery', null, null, '2026-08-31 15:00:09+00'),
  ('97000000-0000-4000-8000-000000000310', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000110', '97000000-0000-4000-8000-000000000210', 'Falsche Receipt-Menge', 'quantity', 2, 2, 'unpriced_mystery', null, null, '2026-08-31 15:00:10+00'),
  ('97000000-0000-4000-8000-000000000311', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000111', '97000000-0000-4000-8000-000000000209', 'Fremde Zielposition', 'quantity', 1, 1, 'unpriced_mystery', null, null, '2026-08-31 15:00:11+00');

insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost, received_at, created_at
) values
  ('97000000-0000-4000-8000-000000000501', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000101', '97000000-0000-4000-8000-000000000301', '97000000-0000-4000-8000-000000000201', 1, 1, 0, '2026-08-31 16:00:01+00', '2026-08-31 16:00:01+00'),
  ('97000000-0000-4000-8000-000000000502', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000101', '97000000-0000-4000-8000-000000000301', '97000000-0000-4000-8000-000000000201', 2, 2, 0, '2026-08-31 16:00:02+00', '2026-08-31 16:00:02+00'),
  ('97000000-0000-4000-8000-000000000503', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000101', '97000000-0000-4000-8000-000000000301', '97000000-0000-4000-8000-000000000201', 2, 2, 0, '2026-08-31 16:00:03+00', '2026-08-31 16:00:03+00'),
  ('97000000-0000-4000-8000-000000000511', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000102', '97000000-0000-4000-8000-000000000302', '97000000-0000-4000-8000-000000000202', 3, 3, 0, '2026-08-31 16:01:01+00', '2026-08-31 16:01:01+00'),
  ('97000000-0000-4000-8000-000000000512', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000102', '97000000-0000-4000-8000-000000000302', '97000000-0000-4000-8000-000000000202', 1, 1, 0, '2026-08-31 16:01:02+00', '2026-08-31 16:01:02+00'),
  ('97000000-0000-4000-8000-000000000513', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000102', '97000000-0000-4000-8000-000000000302', '97000000-0000-4000-8000-000000000202', 2, 2, 0, '2026-08-31 16:01:03+00', '2026-08-31 16:01:03+00'),
  ('97000000-0000-4000-8000-000000000521', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000103', '97000000-0000-4000-8000-000000000303', '97000000-0000-4000-8000-000000000203', 2, 2, 0, '2026-08-31 16:02:01+00', '2026-08-31 16:02:01+00'),
  ('97000000-0000-4000-8000-000000000531', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000104', '97000000-0000-4000-8000-000000000304', '97000000-0000-4000-8000-000000000204', 1, 1, 7, '2026-08-31 16:03:01+00', '2026-08-31 16:03:01+00'),
  ('97000000-0000-4000-8000-000000000532', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000104', '97000000-0000-4000-8000-000000000304', '97000000-0000-4000-8000-000000000204', 2, 2, 9, '2026-08-31 16:03:02+00', '2026-08-31 16:03:02+00'),
  ('97000000-0000-4000-8000-000000000541', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000105', '97000000-0000-4000-8000-000000000305', '97000000-0000-4000-8000-000000000205', 2, 2, 0, '2026-08-31 16:04:01+00', '2026-08-31 16:04:01+00'),
  ('97000000-0000-4000-8000-000000000551', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000106', '97000000-0000-4000-8000-000000000306', '97000000-0000-4000-8000-000000000206', 2, 1, 0.015, '2026-08-31 16:05:01+00', '2026-08-31 16:05:01+00'),
  ('97000000-0000-4000-8000-000000000561', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000107', '97000000-0000-4000-8000-000000000307', '97000000-0000-4000-8000-000000000207', 2, 2, 0, '2026-08-31 16:06:01+00', '2026-08-31 16:06:01+00'),
  ('97000000-0000-4000-8000-000000000562', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000107', '97000000-0000-4000-8000-000000000307', '97000000-0000-4000-8000-000000000207', 2, 2, 0, '2026-08-31 16:06:02+00', '2026-08-31 16:06:02+00'),
  ('97000000-0000-4000-8000-000000000571', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000108', '97000000-0000-4000-8000-000000000308', '97000000-0000-4000-8000-000000000209', 1, 1, 0, '2026-08-31 16:07:01+00', '2026-08-31 16:07:01+00'),
  ('97000000-0000-4000-8000-000000000572', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000109', '97000000-0000-4000-8000-000000000311', '97000000-0000-4000-8000-000000000209', 1, 1, 0, '2026-08-31 16:08:01+00', '2026-08-31 16:08:01+00'),
  ('97000000-0000-4000-8000-000000000581', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000110', '97000000-0000-4000-8000-000000000310', '97000000-0000-4000-8000-000000000210', 2, 2, 0, '2026-08-31 16:09:01+00', '2026-08-31 16:09:01+00');

insert into public.stock_movements (
  id, workspace_id, stock_lot_id, sale_line_id, direction, quantity, reason, created_at
) values
  ('97000000-0000-4000-8000-000000000601', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000501', null, 'in', 1, 'receipt', '2026-08-31 17:00:01+00'),
  ('97000000-0000-4000-8000-000000000603', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000503', null, 'in', 2, 'receipt', '2026-08-31 17:00:03+00'),
  ('97000000-0000-4000-8000-000000000611', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000511', null, 'in', 3, 'receipt', '2026-08-31 17:01:01+00'),
  ('97000000-0000-4000-8000-000000000612', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000512', null, 'in', 1, 'receipt', '2026-08-31 17:01:02+00'),
  ('97000000-0000-4000-8000-000000000613', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000513', null, 'in', 2, 'receipt', '2026-08-31 17:01:03+00'),
  ('97000000-0000-4000-8000-000000000621', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000521', null, 'in', 2, 'receipt', '2026-08-31 17:02:01+00'),
  ('97000000-0000-4000-8000-000000000641', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000541', null, 'in', 2, 'receipt', '2026-08-31 17:04:01+00'),
  ('97000000-0000-4000-8000-000000000651', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000551', null, 'in', 2, 'receipt', '2026-08-31 17:05:01+00'),
  ('97000000-0000-4000-8000-000000000661', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000561', null, 'in', 2, 'receipt', '2026-08-31 17:06:01+00'),
  ('97000000-0000-4000-8000-000000000662', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000562', null, 'in', 2, 'receipt', '2026-08-31 17:06:02+00'),
  ('97000000-0000-4000-8000-000000000671', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000571', null, 'in', 1, 'receipt', '2026-08-31 17:07:01+00'),
  ('97000000-0000-4000-8000-000000000672', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000572', null, 'in', 1, 'receipt', '2026-08-31 17:08:01+00'),
  ('97000000-0000-4000-8000-000000000681', '97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000581', null, 'in', 1, 'receipt', '2026-08-31 17:09:01+00');

set local role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000101'
  )$$,
  '0,07 Euro auf fünf Einheiten lassen sich über vorhandene Losgrenzen 1+2+2 finalisieren'
);

select results_eq(
  $$
    select lot.id, lot.received_quantity, lot.remaining_quantity,
      pg_catalog.round(lot.unit_cost * lot.received_quantity, 2) as lot_total,
      lot.received_at
    from public.stock_lots as lot
    where lot.purchase_id = '97000000-0000-4000-8000-000000000101'
    order by lot.received_at, lot.id
  $$,
  $$values
    ('97000000-0000-4000-8000-000000000501'::uuid, 1, 1, 0.02::numeric, '2026-08-31 16:00:01+00'::timestamptz),
    ('97000000-0000-4000-8000-000000000502'::uuid, 2, 2, 0.03::numeric, '2026-08-31 16:00:02+00'::timestamptz),
    ('97000000-0000-4000-8000-000000000503'::uuid, 2, 2, 0.02::numeric, '2026-08-31 16:00:03+00'::timestamptz)
  $$,
  'jedes vorhandene Los erhält seinen zusammenhängenden autoritativen Cent-Slice'
);

select results_eq(
  $$
    select movement.id, movement.stock_lot_id, movement.sale_line_id,
      movement.direction, movement.quantity, movement.reason, movement.created_at
    from public.stock_movements as movement
    where movement.stock_lot_id in (
      '97000000-0000-4000-8000-000000000501',
      '97000000-0000-4000-8000-000000000503'
    )
    order by movement.id
  $$,
  $$values
    ('97000000-0000-4000-8000-000000000601'::uuid, '97000000-0000-4000-8000-000000000501'::uuid, null::uuid, 'in'::text, 1, 'receipt'::text, '2026-08-31 17:00:01+00'::timestamptz),
    ('97000000-0000-4000-8000-000000000603'::uuid, '97000000-0000-4000-8000-000000000503'::uuid, null::uuid, 'in'::text, 2, 'receipt'::text, '2026-08-31 17:00:03+00'::timestamptz)
  $$,
  'bestehende Receipt-IDs und sämtliche Receipt-Fakten bleiben unverändert'
);

select is(
  (
    select pg_catalog.count(*)
    from public.stock_movements as movement
    where movement.stock_lot_id = '97000000-0000-4000-8000-000000000502'
      and movement.direction = 'in'
      and movement.reason = 'receipt'
      and movement.quantity = 2
  ),
  1::bigint,
  'nur dem Los ohne Receipt wird genau eine passende Eingangsbewegung hinzugefügt'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000102'
  )$$,
  'die versetzten Losgrenzen 3+1+2 schneiden die 2-Cent- und 1-Cent-Kohorten verlustfrei'
);

select results_eq(
  $$
    select lot.id, pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)
    from public.stock_lots as lot
    where lot.purchase_id = '97000000-0000-4000-8000-000000000102'
    order by lot.received_at, lot.id
  $$,
  $$values
    ('97000000-0000-4000-8000-000000000511'::uuid, 0.06::numeric),
    ('97000000-0000-4000-8000-000000000512'::uuid, 0.02::numeric),
    ('97000000-0000-4000-8000-000000000513'::uuid, 0.02::numeric)
  $$,
  'die Matrixvariante 0,10/6 nutzt dieselbe stabile zusammenhängende Sequenz'
);

select lives_ok(
  $$select public.reopen_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000102'
  )$$,
  'die Matrixvariante lässt sich vor dem ersten Verkauf sicher wieder öffnen'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000102'
  )$$,
  'erneutes Finalisieren verwendet dieselben Losgrenzen'
);

select results_eq(
  $$
    select lot.id, lot.received_quantity, lot.remaining_quantity,
      pg_catalog.round(lot.unit_cost * lot.received_quantity, 2), lot.received_at,
      movement.id, movement.quantity, movement.created_at
    from public.stock_lots as lot
    join public.stock_movements as movement
      on movement.workspace_id = lot.workspace_id
      and movement.stock_lot_id = lot.id
      and movement.direction = 'in'
      and movement.reason = 'receipt'
    where lot.purchase_id = '97000000-0000-4000-8000-000000000102'
    order by lot.received_at, lot.id
  $$,
  $$values
    ('97000000-0000-4000-8000-000000000511'::uuid, 3, 3, 0.06::numeric, '2026-08-31 16:01:01+00'::timestamptz, '97000000-0000-4000-8000-000000000611'::uuid, 3, '2026-08-31 17:01:01+00'::timestamptz),
    ('97000000-0000-4000-8000-000000000512'::uuid, 1, 1, 0.02::numeric, '2026-08-31 16:01:02+00'::timestamptz, '97000000-0000-4000-8000-000000000612'::uuid, 1, '2026-08-31 17:01:02+00'::timestamptz),
    ('97000000-0000-4000-8000-000000000513'::uuid, 2, 2, 0.02::numeric, '2026-08-31 16:01:03+00'::timestamptz, '97000000-0000-4000-8000-000000000613'::uuid, 2, '2026-08-31 17:01:03+00'::timestamptz)
  $$,
  'Wiederöffnen und erneutes Finalisieren bewahren Los- und Receipt-Identitäten sowie Cent-Slices'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000103'
  )$$,
  'teilweise vorerfasster Bestand wird nur um die fehlenden Einheiten ergänzt'
);

select ok(
  (
    select pg_catalog.count(*) = 2
      and pg_catalog.sum(lot.received_quantity) = 4
      and pg_catalog.sum(pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)) = 0.01
    from public.stock_lots as lot
    where lot.purchase_id = '97000000-0000-4000-8000-000000000103'
  ) and (
    select lot.received_quantity = 2
      and lot.remaining_quantity = 2
      and pg_catalog.round(lot.unit_cost * lot.received_quantity, 2) = 0.01
      and lot.received_at = '2026-08-31 16:02:01+00'::timestamptz
    from public.stock_lots as lot
    where lot.id = '97000000-0000-4000-8000-000000000521'
  ) and (
    select pg_catalog.count(*) = 1
      and pg_catalog.sum(lot.received_quantity) = 2
      and pg_catalog.sum(pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)) = 0
    from public.stock_lots as lot
    where lot.purchase_id = '97000000-0000-4000-8000-000000000103'
      and lot.id <> '97000000-0000-4000-8000-000000000521'
  ),
  'die bestehende 2er-Grenze erhält den ersten Cent und nur das fehlende 2er-Suffix wird erzeugt'
);

select is(
  (
    select pg_catalog.count(*)
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = '97000000-0000-4000-8000-000000000103'
      and movement.direction = 'in'
      and movement.reason = 'receipt'
  ),
  2::bigint,
  'Teilabdeckung erzeugt genau ein zusätzliches Los mit genau einem neuen Receipt'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000104'
  )$$,
  'ein ausdrücklich kostenloser Mystery-Einkauf akzeptiert beliebige gültige Losgrenzen'
);

select ok(
  (
    select purchase.purchase_price = 0
      and purchase.total_purchase_cost = 0
      and purchase.entry_status = 'finalized'
    from public.purchases as purchase
    where purchase.id = '97000000-0000-4000-8000-000000000104'
  ) and not exists (
    select 1
    from public.stock_lots as lot
    where lot.purchase_id = '97000000-0000-4000-8000-000000000104'
      and lot.unit_cost <> 0
  ),
  'numeric 0 bleibt von unbekannt unterscheidbar und setzt alle Los-Cent-Pools auf null'
);

select ok(
  (
    select purchase.purchase_price is null
      and purchase.total_purchase_cost is null
      and purchase.entry_status = 'draft'
    from public.purchases as purchase
    where purchase.id = '97000000-0000-4000-8000-000000000105'
  ),
  'ein unbekannter Mystery-Preis bleibt vor der Finalisierung null'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000105'
  )$$,
  '22023',
  'Mystery-Einkäufe benötigen einen ausdrücklich erfassten Warenbetrag.',
  'ein unbekannter Mystery-Preis wird nicht als kostenlose Beschaffung finalisiert'
);

select ok(
  (
    select purchase.purchase_price is null
      and purchase.total_purchase_cost is null
      and purchase.entry_status = 'draft'
    from public.purchases as purchase
    where purchase.id = '97000000-0000-4000-8000-000000000105'
  ) and (
    select lot.unit_cost = 0
    from public.stock_lots as lot
    where lot.id = '97000000-0000-4000-8000-000000000541'
  ),
  'die abgelehnte unbekannte Finalisierung hinterlässt Kopf und Los unverändert'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000106'
  )$$,
  '22023',
  'Bereits verwendete Bestandslose verhindern die Finalisierung.',
  'ein bereits teilweise verwendetes Los wird atomar abgelehnt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000107'
  )$$,
  '22023',
  'Empfangsmengen und vorhandener Bestand stimmen vor der Finalisierung nicht überein.',
  'Bestandslose über der Positionsmenge werden atomar abgelehnt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000108'
  )$$,
  '22023',
  'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.',
  'ein Los mit falschem Produkt wird atomar abgelehnt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000109'
  )$$,
  '22023',
  'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.',
  'ein Los mit einer Position eines anderen Einkaufs wird atomar abgelehnt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000110'
  )$$,
  '22023',
  'Vorhandene Receipt-Bewegungen müssen exakt zum Bestandslos passen.',
  'eine Receipt-Menge ungleich der unveränderten Losmenge wird atomar abgelehnt'
);

select ok(
  not exists (
    select 1
    from public.purchases as purchase
    where purchase.id in (
      '97000000-0000-4000-8000-000000000106',
      '97000000-0000-4000-8000-000000000107',
      '97000000-0000-4000-8000-000000000108',
      '97000000-0000-4000-8000-000000000109',
      '97000000-0000-4000-8000-000000000110'
    )
      and (
        purchase.entry_status <> 'draft'
        or purchase.total_purchase_cost is not null
        or purchase.finalized_at is not null
        or purchase.finalized_by is not null
      )
  ) and not exists (
    select 1
    from public.purchase_lines as line
    where line.purchase_id in (
      '97000000-0000-4000-8000-000000000106',
      '97000000-0000-4000-8000-000000000107',
      '97000000-0000-4000-8000-000000000108',
      '97000000-0000-4000-8000-000000000109',
      '97000000-0000-4000-8000-000000000110'
    )
      and (line.allocated_total_cost <> 0 or line.allocated_additional_cost <> 0)
  ) and not exists (
    select 1
    from (values
      ('97000000-0000-4000-8000-000000000106'::uuid),
      ('97000000-0000-4000-8000-000000000107'::uuid),
      ('97000000-0000-4000-8000-000000000108'::uuid),
      ('97000000-0000-4000-8000-000000000109'::uuid),
      ('97000000-0000-4000-8000-000000000110'::uuid)
    ) as invalid_purchase(id)
    cross join lateral public.list_entity_business_events(
      '97000000-0000-4000-8000-000000000011',
      'purchase',
      invalid_purchase.id,
      null,
      null,
      25
    ) as event
  ),
  'alle ungültigen Losfälle bleiben ohne Kopf-, Positions- oder Ereignis-Teilwrite'
);

select lives_ok(
  $$select public.record_sale(
    '97000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"mystery-lot-sale-1"}'::jsonb,
    '[{"catalog_product_id":"97000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'die erste Einheit des 1+2+2-Falls wird verkauft'
);

select lives_ok(
  $$select public.record_sale(
    '97000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"mystery-lot-sale-2"}'::jsonb,
    '[{"catalog_product_id":"97000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'die erste Einheit des über eine Cent-Kohorte geschnittenen 2er-Loses wird verkauft'
);

select lives_ok(
  $$select public.record_sale(
    '97000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"mystery-lot-sale-3"}'::jsonb,
    '[{"catalog_product_id":"97000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'die zweite Einheit desselben 2er-Loses verbraucht dessen exakten Rest-Cent-Pool'
);

select lives_ok(
  $$select public.record_sale(
    '97000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"mystery-lot-sale-4"}'::jsonb,
    '[{"catalog_product_id":"97000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'auch das letzte vorhandene Los lässt sich teilweise verkaufen'
);

select results_eq(
  $$
    select sale.external_order_id, allocation.stock_lot_id,
      allocation.quantity, allocation.allocated_cost, sale_line.cost_of_goods_sold,
      sale.sale_price
    from public.sales as sale
    join public.sale_lines as sale_line on sale_line.sale_id = sale.id
    join public.sale_line_lot_allocations as allocation on allocation.sale_line_id = sale_line.id
    where sale.external_order_id like 'mystery-lot-sale-%'
    order by sale.external_order_id
  $$,
  $$values
    ('mystery-lot-sale-1'::text, '97000000-0000-4000-8000-000000000501'::uuid, 1, 0.02::numeric, 0.02::numeric, 10.00::numeric),
    ('mystery-lot-sale-2'::text, '97000000-0000-4000-8000-000000000502'::uuid, 1, 0.02::numeric, 0.02::numeric, 10.00::numeric),
    ('mystery-lot-sale-3'::text, '97000000-0000-4000-8000-000000000502'::uuid, 1, 0.01::numeric, 0.01::numeric, 10.00::numeric),
    ('mystery-lot-sale-4'::text, '97000000-0000-4000-8000-000000000503'::uuid, 1, 0.01::numeric, 0.01::numeric, 10.00::numeric)
  $$,
  'Verkäufe nutzen pro Los denselben autoritativen Cent-Pool und ändern keine Erlöswerte'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000101',
    'Mystery-Losgrenzen auf acht Cent korrigiert',
    0.08,
    '[{"id":"97000000-0000-4000-8000-000000000301","catalog_product_id":"97000000-0000-4000-8000-000000000201","title_snapshot":"Grenzen 1-2-2","line_kind":"quantity","ordered_quantity":5,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'eine Korrektur verteilt die neue autoritative Cent-Sequenz über dieselben Losgrenzen'
);

select results_eq(
  $$
    select lot.id, pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)
    from public.stock_lots as lot
    where lot.purchase_id = '97000000-0000-4000-8000-000000000101'
    order by lot.received_at, lot.id
  $$,
  $$values
    ('97000000-0000-4000-8000-000000000501'::uuid, 0.02::numeric),
    ('97000000-0000-4000-8000-000000000502'::uuid, 0.04::numeric),
    ('97000000-0000-4000-8000-000000000503'::uuid, 0.02::numeric)
  $$,
  'die Korrektur reconciliiert 0,08 Euro als exakte Los-Cent-Pools 2+4+2'
);

select lives_ok(
  $$select public.record_sale_return(
    '97000000-0000-4000-8000-000000000011',
    (select sale.id from public.sales as sale where sale.external_order_id = 'mystery-lot-sale-4'),
    10, true, 'customer return', 'Losgrenzen-Retoure', 'restock_ready', 'Testkäufer'
  )$$,
  'eine Einheit des letzten Loses wird vollständig wiedereingelagert'
);

select lives_ok(
  $$select public.record_sale(
    '97000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"mystery-lot-resale"}'::jsonb,
    '[{"catalog_product_id":"97000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'die wiedereingelagerte Einheit wird erneut aus demselben Los-Cent-Pool verkauft'
);

select ok(
  (
    select allocation.allocated_cost = 0.01
      and allocation.active_allocated_cost = 0.01
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'mystery-lot-resale'
  ) and (
    select (
      select coalesce(pg_catalog.sum(allocation.active_allocated_cost), 0)
      from public.sale_line_lot_allocations as allocation
      join public.stock_lots as lot on lot.id = allocation.stock_lot_id
      where lot.purchase_id = '97000000-0000-4000-8000-000000000101'
    ) + (
      select coalesce(pg_catalog.sum(
        pg_catalog.round(lot.unit_cost * lot.remaining_quantity, 2)
      ), 0)
      from public.stock_lots as lot
      where lot.purchase_id = '97000000-0000-4000-8000-000000000101'
        and lot.remaining_quantity > 0
    ) = 0.08
  ),
  'Korrektur, Retoure, Wiederverkauf und aktueller Bestand ergeben gemeinsam exakt acht Cent'
);

select * from finish();

rollback;
