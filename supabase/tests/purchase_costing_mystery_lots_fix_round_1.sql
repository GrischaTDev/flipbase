\set ON_ERROR_STOP on

begin;

select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '98000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'mystery-lot-fix-owner@example.test',
  'unused',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.workspaces (id, name) values (
  '98000000-0000-4000-8000-000000000011',
  'Mystery-Losgrenzen Fixrunde 1'
);

insert into public.workspace_members (workspace_id, user_id, role) values (
  '98000000-0000-4000-8000-000000000011',
  '98000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('98000000-0000-4000-8000-000000000201', '98000000-0000-4000-8000-000000000011', '15.000er Präzisionsgrenze', 'quantity'),
  ('98000000-0000-4000-8000-000000000202', '98000000-0000-4000-8000-000000000011', 'Fachliche 100.000er-Grenze', 'quantity'),
  ('98000000-0000-4000-8000-000000000203', '98000000-0000-4000-8000-000000000011', 'Zukünftiger vorhandener Präfix', 'quantity'),
  ('98000000-0000-4000-8000-000000000204', '98000000-0000-4000-8000-000000000011', 'Mehrere Suffix-Kohorten', 'quantity'),
  ('98000000-0000-4000-8000-000000000205', '98000000-0000-4000-8000-000000000011', 'Zeitstempel-Obergrenze', 'quantity');

insert into public.purchases (
  id, workspace_id, type, title, purchase_price, total_purchase_cost
) values
  ('98000000-0000-4000-8000-000000000101', '98000000-0000-4000-8000-000000000011', 'mystery_pack', 'Ein Cent auf 15.000', 0.01, null),
  ('98000000-0000-4000-8000-000000000102', '98000000-0000-4000-8000-000000000011', 'mystery_pack', 'Ein Cent auf 100.000', 0.01, null),
  ('98000000-0000-4000-8000-000000000103', '98000000-0000-4000-8000-000000000011', 'mystery_pack', 'Zukünftiger 2er-Präfix', 0.07, null),
  ('98000000-0000-4000-8000-000000000104', '98000000-0000-4000-8000-000000000011', 'mystery_pack', 'Zukünftiger 1er-Präfix', 0.07, null),
  ('98000000-0000-4000-8000-000000000105', '98000000-0000-4000-8000-000000000011', 'mystery_pack', 'Zeitstempel kann nicht erweitert werden', 0.01, null);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total, created_at
) values
  ('98000000-0000-4000-8000-000000000301', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000101', '98000000-0000-4000-8000-000000000201', '15.000er Präzisionsgrenze', 'quantity', 15000, 15000, 'unpriced_mystery', null, null, '2026-08-31 18:00:01+00'),
  ('98000000-0000-4000-8000-000000000302', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000102', '98000000-0000-4000-8000-000000000202', 'Fachliche 100.000er-Grenze', 'quantity', 100000, 100000, 'unpriced_mystery', null, null, '2026-08-31 18:00:02+00'),
  ('98000000-0000-4000-8000-000000000303', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000103', '98000000-0000-4000-8000-000000000203', 'Zukünftiger 2er-Präfix', 'quantity', 5, 2, 'unpriced_mystery', null, null, '2026-08-31 18:00:03+00'),
  ('98000000-0000-4000-8000-000000000304', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000104', '98000000-0000-4000-8000-000000000204', 'Zukünftiger 1er-Präfix', 'quantity', 5, 1, 'unpriced_mystery', null, null, '2026-08-31 18:00:04+00'),
  ('98000000-0000-4000-8000-000000000305', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000105', '98000000-0000-4000-8000-000000000205', 'Zeitstempel-Obergrenze', 'quantity', 2, 1, 'unpriced_mystery', null, null, '2026-08-31 18:00:05+00');

insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost, received_at, created_at
) values
  ('98000000-0000-4000-8000-000000000501', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000101', '98000000-0000-4000-8000-000000000301', '98000000-0000-4000-8000-000000000201', 15000, 15000, 0, '2026-08-31 19:00:01+00', '2026-08-31 19:00:01+00'),
  ('98000000-0000-4000-8000-000000000502', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000102', '98000000-0000-4000-8000-000000000302', '98000000-0000-4000-8000-000000000202', 100000, 100000, 0.01::numeric / 100000, '2026-08-31 19:00:02+00', '2026-08-31 19:00:02+00'),
  ('98000000-0000-4000-8000-000000000503', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000103', '98000000-0000-4000-8000-000000000303', '98000000-0000-4000-8000-000000000203', 2, 2, 0, '2099-01-01 00:00:00+00', '2026-08-31 19:00:03+00'),
  ('98000000-0000-4000-8000-000000000504', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000104', '98000000-0000-4000-8000-000000000304', '98000000-0000-4000-8000-000000000204', 1, 1, 0, '2099-02-01 00:00:00+00', '2026-08-31 19:00:04+00'),
  ('98000000-0000-4000-8000-000000000505', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000105', '98000000-0000-4000-8000-000000000305', '98000000-0000-4000-8000-000000000205', 1, 1, 0, '294276-12-31 23:59:59.999999+00', '2026-08-31 19:00:05+00');

insert into public.stock_movements (
  id, workspace_id, stock_lot_id, sale_line_id, direction, quantity, reason, created_at
) values
  ('98000000-0000-4000-8000-000000000601', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000501', null, 'in', 15000, 'receipt', '2026-08-31 20:00:01+00'),
  ('98000000-0000-4000-8000-000000000602', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000502', null, 'in', 100000, 'receipt', '2026-08-31 20:00:02+00'),
  ('98000000-0000-4000-8000-000000000603', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000503', null, 'in', 2, 'receipt', '2026-08-31 20:00:03+00'),
  ('98000000-0000-4000-8000-000000000604', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000504', null, 'in', 1, 'receipt', '2026-08-31 20:00:04+00'),
  ('98000000-0000-4000-8000-000000000605', '98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000505', null, 'in', 1, 'receipt', '2026-08-31 20:00:05+00');

set local role authenticated;
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);

select ok(
  (
    select pg_catalog.count(*) = 2
      and pg_catalog.bool_and(schema_column.numeric_precision = 24)
      and pg_catalog.bool_and(schema_column.numeric_scale = 12)
    from information_schema.columns as schema_column
    where schema_column.table_schema = 'public'
      and schema_column.table_name in ('stock_lots', 'sale_line_lot_allocations')
      and schema_column.column_name = 'unit_cost'
  ),
  'beide autoritativen Stückkosten-Spalten besitzen 12 Nachkommastellen bei unverändert 12 ganzzahligen Stellen'
);

select is(
  (
    select pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)
    from public.stock_lots as lot
    where lot.id = '98000000-0000-4000-8000-000000000502'
  ),
  0.01::numeric,
  'die Präzision trägt einen Cent über die fachliche 100.000er-Losgrenze'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000101'
  )$$,
  'ein Cent auf einem vorhandenen 15.000er-Los lässt sich finalisieren'
);

select results_eq(
  $$
    select lot.unit_cost, pg_catalog.round(lot.unit_cost * lot.received_quantity, 2),
      lot.received_quantity, lot.remaining_quantity
    from public.stock_lots as lot
    where lot.id = '98000000-0000-4000-8000-000000000501'
  $$,
  $$values (0.000000666667::numeric, 0.01::numeric, 15000, 15000)$$,
  'das 15.000er-Los speichert den hochpräzisen Durchschnitt und exakt einen Cent Kostenpool'
);

select lives_ok(
  $$select public.record_sale(
    '98000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"precision-partial"}'::jsonb,
    '[{"catalog_product_id":"98000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":0.01}]'::jsonb
  )$$,
  'der erste Teilverkauf verbraucht genau den ersten Cent des großen Loses'
);

select results_eq(
  $$
    select sale_line.cost_of_goods_sold, allocation.allocated_cost,
      allocation.active_allocated_cost
    from public.sales as sale
    join public.sale_lines as sale_line on sale_line.sale_id = sale.id
    join public.sale_line_lot_allocations as allocation on allocation.sale_line_id = sale_line.id
    where sale.external_order_id = 'precision-partial'
  $$,
  $$values (0.01::numeric, 0.01::numeric, 0.01::numeric)$$,
  'der partielle Verkauf schreibt exakt einen Cent COGS und aktiven Kostenpool'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000101',
    '15.000er-Los auf vier Cent korrigiert',
    0.04,
    '[{"id":"98000000-0000-4000-8000-000000000301","catalog_product_id":"98000000-0000-4000-8000-000000000201","title_snapshot":"15.000er Präzisionsgrenze","line_kind":"quantity","ordered_quantity":15000,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'die Korrektur verteilt vier Cent hochpräzise über dasselbe 15.000er-Los'
);

select results_eq(
  $$
    select lot.unit_cost, pg_catalog.round(lot.unit_cost * lot.received_quantity, 2),
      allocation.allocated_cost, allocation.active_allocated_cost
    from public.stock_lots as lot
    join public.sale_line_lot_allocations as allocation on allocation.stock_lot_id = lot.id
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where lot.id = '98000000-0000-4000-8000-000000000501'
      and sale.external_order_id = 'precision-partial'
  $$,
  $$values (0.000002666667::numeric, 0.04::numeric, 0.01::numeric, 0.01::numeric)$$,
  'Korrektur und historische Teilentnahme reconciliieren zum exakten Vier-Cent-Lospool'
);

select lives_ok(
  $$select public.record_sale(
    '98000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"precision-final"}'::jsonb,
    '[{"catalog_product_id":"98000000-0000-4000-8000-000000000201","quantity":14999,"unit_sale_price":0.01}]'::jsonb
  )$$,
  'der finale Verkauf verbraucht die restlichen 14.999 Einheiten und drei Cent'
);

select results_eq(
  $$
    select sale.external_order_id, sale_line.quantity,
      sale_line.cost_of_goods_sold, allocation.allocated_cost,
      allocation.unit_cost
    from public.sales as sale
    join public.sale_lines as sale_line on sale_line.sale_id = sale.id
    join public.sale_line_lot_allocations as allocation on allocation.sale_line_id = sale_line.id
    where sale.external_order_id in ('precision-partial', 'precision-final')
    order by sale.external_order_id
  $$,
  $$values
    ('precision-final'::text, 14999, 0.03::numeric, 0.03::numeric, 0.000002666667::numeric),
    ('precision-partial'::text, 1, 0.01::numeric, 0.01::numeric, 0.01::numeric)
  $$,
  'partieller und finaler Verkauf bewahren exakte COGS sowie präzise Allocation-Stückkosten'
);

select ok(
  (
    select lot.remaining_quantity = 0
    from public.stock_lots as lot
    where lot.id = '98000000-0000-4000-8000-000000000501'
  ) and (
    select pg_catalog.sum(allocation.active_allocated_cost) = 0.04
    from public.sale_line_lot_allocations as allocation
    where allocation.stock_lot_id = '98000000-0000-4000-8000-000000000501'
  ),
  'vollständig verkaufter Bestand und aktive Allokationen ergeben exakt vier Cent'
);

select lives_ok(
  $$select public.record_sale_return(
    '98000000-0000-4000-8000-000000000011',
    (select sale.id from public.sales as sale where sale.external_order_id = 'precision-final'),
    149.99, true, 'customer return', 'Großlos-Retoure', 'restock_ready', 'Testkäufer'
  )$$,
  'der finale Großlosverkauf lässt sich vollständig wiedereinlagern'
);

select lives_ok(
  $$select public.record_sale(
    '98000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"precision-resale"}'::jsonb,
    '[{"catalog_product_id":"98000000-0000-4000-8000-000000000201","quantity":14999,"unit_sale_price":0.01}]'::jsonb
  )$$,
  'die 14.999 wiedereingelagerten Einheiten lassen sich aus demselben Centpool erneut verkaufen'
);

select ok(
  (
    select sale_line.cost_of_goods_sold = 0.03
    from public.sales as sale
    join public.sale_lines as sale_line on sale_line.sale_id = sale.id
    where sale.external_order_id = 'precision-resale'
  ) and (
    select pg_catalog.sum(allocation.active_allocated_cost) = 0.04
    from public.sale_line_lot_allocations as allocation
    where allocation.stock_lot_id = '98000000-0000-4000-8000-000000000501'
  ) and (
    select lot.remaining_quantity = 0
    from public.stock_lots as lot
    where lot.id = '98000000-0000-4000-8000-000000000501'
  ),
  'Retoure und Wiederverkauf erhalten den aktiven Vier-Cent-Pool ohne Restbestand'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000103'
  )$$,
  'ein zukünftiger vorhandener 2er-Präfix lässt sich mit fehlendem Suffix finalisieren'
);

select results_eq(
  $$
    select lot.id = '98000000-0000-4000-8000-000000000503'::uuid,
      lot.received_quantity,
      pg_catalog.round(lot.unit_cost * lot.received_quantity, 2),
      lot.received_at
    from public.stock_lots as lot
    where lot.purchase_id = '98000000-0000-4000-8000-000000000103'
    order by lot.received_at, lot.id
  $$,
  $$values
    (true, 2, 0.04::numeric, '2099-01-01 00:00:00+00'::timestamptz),
    (false, 3, 0.03::numeric, '2099-01-01 00:00:00.000001+00'::timestamptz)
  $$,
  'der erzeugte Suffix liegt strikt nach dem zukünftigen Präfix und behält dessen Centfolge'
);

select lives_ok(
  $$select public.reopen_purchase_costing(
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000103'
  )$$,
  'die Zukunftsgrenzen lassen sich vor einem Verkauf sicher wieder öffnen'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000103'
  )$$,
  'erneute Finalisierung verwendet dieselbe Zukunftsreihenfolge'
);

select results_eq(
  $$
    select lot.id = '98000000-0000-4000-8000-000000000503'::uuid,
      lot.received_quantity,
      pg_catalog.round(lot.unit_cost * lot.received_quantity, 2),
      lot.received_at
    from public.stock_lots as lot
    where lot.purchase_id = '98000000-0000-4000-8000-000000000103'
    order by lot.received_at, lot.id
  $$,
  $$values
    (true, 2, 0.04::numeric, '2099-01-01 00:00:00+00'::timestamptz),
    (false, 3, 0.03::numeric, '2099-01-01 00:00:00.000001+00'::timestamptz)
  $$,
  'Reopen und Re-Finalisierung bewahren IDs, Zeitreihenfolge und dieselben Los-Centpools'
);

select lives_ok(
  $$select public.record_sale(
    '98000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"future-prefix-sale"}'::jsonb,
    '[{"catalog_product_id":"98000000-0000-4000-8000-000000000203","quantity":3,"unit_sale_price":1}]'::jsonb
  )$$,
  'FIFO verbraucht erst den vorhandenen Präfix und danach eine Suffix-Einheit'
);

select results_eq(
  $$
    select lot.id = '98000000-0000-4000-8000-000000000503'::uuid,
      allocation.quantity, allocation.allocated_cost
    from public.sales as sale
    join public.sale_lines as sale_line on sale_line.sale_id = sale.id
    join public.sale_line_lot_allocations as allocation on allocation.sale_line_id = sale_line.id
    join public.stock_lots as lot on lot.id = allocation.stock_lot_id
    where sale.external_order_id = 'future-prefix-sale'
    order by lot.received_at, lot.id
  $$,
  $$values
    (true, 2, 0.04::numeric),
    (false, 1, 0.01::numeric)
  $$,
  'die echte FIFO-Allokation beginnt beim ursprünglichen zukünftigen Präfix'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000104'
  )$$,
  'ein fehlender Suffix mit zwei Centkohorten wird stabil erzeugt'
);

select results_eq(
  $$
    select lot.id = '98000000-0000-4000-8000-000000000504'::uuid,
      lot.received_quantity,
      pg_catalog.round(lot.unit_cost * lot.received_quantity, 2),
      lot.received_at
    from public.stock_lots as lot
    where lot.purchase_id = '98000000-0000-4000-8000-000000000104'
    order by lot.received_at, lot.id
  $$,
  $$values
    (true, 1, 0.02::numeric, '2099-02-01 00:00:00+00'::timestamptz),
    (false, 1, 0.02::numeric, '2099-02-01 00:00:00.000001+00'::timestamptz),
    (false, 3, 0.03::numeric, '2099-02-01 00:00:00.000002+00'::timestamptz)
  $$,
  'mehrere erzeugte Suffix-Kohorten folgen streng monoton der Unit-Sequenz'
);

create temporary table mystery_suffix_snapshot on commit drop as
select lot.id, lot.received_quantity,
  pg_catalog.round(lot.unit_cost * lot.received_quantity, 2) as lot_total,
  lot.received_at
from public.stock_lots as lot
where lot.purchase_id = '98000000-0000-4000-8000-000000000104';

select lives_ok(
  $$select public.reopen_purchase_costing(
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000104'
  )$$,
  'mehrere Suffix-Kohorten lassen sich sicher wieder öffnen'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000104'
  )$$,
  'mehrere Suffix-Kohorten lassen sich identisch re-finalisieren'
);

select results_eq(
  $$
    select lot.id, lot.received_quantity,
      pg_catalog.round(lot.unit_cost * lot.received_quantity, 2), lot.received_at
    from public.stock_lots as lot
    where lot.purchase_id = '98000000-0000-4000-8000-000000000104'
    order by lot.id
  $$,
  $$
    select snapshot.id, snapshot.received_quantity, snapshot.lot_total, snapshot.received_at
    from mystery_suffix_snapshot as snapshot
    order by snapshot.id
  $$,
  'Reopen und Re-Finalisierung bewahren alle Suffix-IDs, Zeitpunkte und Centpools'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000105'
  )$$,
  '22023',
  'Für neue Bestandslose ist kein späterer endlicher Empfangszeitpunkt verfügbar.',
  'die Timestamp-Obergrenze wird kontrolliert statt mit Overflow oder falscher FIFO-Reihenfolge abgelehnt'
);

select ok(
  (
    select purchase.entry_status = 'draft'
      and purchase.total_purchase_cost is null
      and purchase.finalized_at is null
    from public.purchases as purchase
    where purchase.id = '98000000-0000-4000-8000-000000000105'
  ) and (
    select pg_catalog.count(*) = 1
      and pg_catalog.bool_and(lot.id = '98000000-0000-4000-8000-000000000505'::uuid)
      and pg_catalog.bool_and(lot.received_at = '294276-12-31 23:59:59.999999+00'::timestamptz)
    from public.stock_lots as lot
    where lot.purchase_id = '98000000-0000-4000-8000-000000000105'
  ) and not exists (
    select 1
    from public.list_entity_business_events(
      '98000000-0000-4000-8000-000000000011',
      'purchase',
      '98000000-0000-4000-8000-000000000105',
      null,
      null,
      25
    )
  ),
  'die kontrollierte Timestamp-Ablehnung hinterlässt Kopf, vorhandenes Los und Ereignisjournal unverändert'
);

select * from finish();

rollback;
