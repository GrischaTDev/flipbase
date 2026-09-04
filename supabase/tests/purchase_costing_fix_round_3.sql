\set ON_ERROR_STOP on

begin;

select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '95000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'costing-fix-round-3@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.workspaces (id, name) values
  ('95000000-0000-4000-8000-000000000011', 'Kostenkorrektur Fixrunde 3');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('95000000-0000-4000-8000-000000000011', '95000000-0000-4000-8000-000000000001', 'owner');

insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('95000000-0000-4000-8000-000000000201', '95000000-0000-4000-8000-000000000011', 'Rest-Cent-Pool', 'quantity'),
  ('95000000-0000-4000-8000-000000000202', '95000000-0000-4000-8000-000000000011', 'Retourenvalidierung', 'quantity'),
  ('95000000-0000-4000-8000-000000000203', '95000000-0000-4000-8000-000000000011', 'Mehrdeutige Legacy-Kosten', 'quantity');

insert into public.purchases (
  id, workspace_id, type, title, purchase_price, total_purchase_cost
) values
  ('95000000-0000-4000-8000-000000000101', '95000000-0000-4000-8000-000000000011', 'mystery_pack', 'Rest-Cent-Pool', 0.03, null),
  ('95000000-0000-4000-8000-000000000102', '95000000-0000-4000-8000-000000000011', 'lot', 'Retourenvalidierung', null, null),
  ('95000000-0000-4000-8000-000000000103', '95000000-0000-4000-8000-000000000011', 'lot', 'Mehrdeutige Legacy-Kosten', null, null);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total, created_at
) values
  (
    '95000000-0000-4000-8000-000000000301', '95000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000101', '95000000-0000-4000-8000-000000000201',
    'Rest-Cent-Pool', 'quantity', 3, 0, 'unpriced_mystery', null, null,
    '2026-08-31 14:00:01+00'
  ),
  (
    '95000000-0000-4000-8000-000000000302', '95000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000102', '95000000-0000-4000-8000-000000000202',
    'Retourenvalidierung', 'quantity', 8, 0, 'priced', 10, 80,
    '2026-08-31 14:00:02+00'
  ),
  (
    '95000000-0000-4000-8000-000000000303', '95000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000103', '95000000-0000-4000-8000-000000000203',
    'Mehrdeutige Legacy-Kosten', 'quantity', 3, 0, 'priced', 0.01, 0.03,
    '2026-08-31 14:00:03+00'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '95000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000101'
  )$$,
  'das Rest-Cent-Fixture wird finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '95000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000102'
  )$$,
  'das Retouren-Fixture wird finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '95000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000103'
  )$$,
  'das Legacy-Kosten-Fixture wird finalisiert'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-cent-history"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'eine historische Einheit wird verkauft'
);

select lives_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-cent-history'),
    10, true, 'customer return', 'vollständig wieder eingelagert',
    'restock_ready', 'Testkäufer'
  )$$,
  'die historische Einheit wird vollständig wiedereingelagert'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '95000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000101',
    'Rest-Cent-Pool auf vier Cent korrigiert',
    0.04,
    '[{"id":"95000000-0000-4000-8000-000000000301","catalog_product_id":"95000000-0000-4000-8000-000000000201","title_snapshot":"Rest-Cent-Pool","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'das vollständig wiedereingelagerte Los wird auf vier Cent korrigiert'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '95000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000101',
    'Rest-Cent-Pool deterministisch wiederholt',
    0.04,
    '[{"id":"95000000-0000-4000-8000-000000000301","catalog_product_id":"95000000-0000-4000-8000-000000000201","title_snapshot":"Rest-Cent-Pool","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'die identische Korrektur bleibt wiederholbar'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-cent-resale-1"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'die erste wiedereingelagerte Einheit wird erneut verkauft'
);

select results_eq(
  $$
    select sale_line.cost_of_goods_sold,
      lot.remaining_quantity,
      pg_catalog.sum(allocation.active_allocated_cost) over () as active_cost
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    join public.stock_lots as lot on lot.purchase_id = '95000000-0000-4000-8000-000000000101'
    join public.sale_line_lot_allocations as allocation on allocation.stock_lot_id = lot.id
    where sale.external_order_id = 'task4-r3-cent-resale-1'
    order by allocation.consumption_sequence desc
    limit 1
  $$,
  $$values (0.02::numeric, 2, 0.02::numeric)$$,
  'der erste Wiederverkauf erhält den ersten Rest-Cent und lässt zwei Cent für zwei Einheiten'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-cent-resale-2"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'die zweite wiedereingelagerte Einheit wird erneut verkauft'
);

select results_eq(
  $$
    select sale.external_order_id, sale_line.cost_of_goods_sold
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id in ('task4-r3-cent-resale-1', 'task4-r3-cent-resale-2')
    order by sale.external_order_id
  $$,
  $$values
    ('task4-r3-cent-resale-1'::text, 0.02::numeric),
    ('task4-r3-cent-resale-2'::text, 0.01::numeric)
  $$,
  'zwei einzelne Wiederverkäufe verbrauchen die vier Cent in stabiler Reihenfolge'
);

select ok(
  (
    select lot.remaining_quantity = 1
    from public.stock_lots as lot
    where lot.purchase_id = '95000000-0000-4000-8000-000000000101'
  ) and (
    select pg_catalog.sum(allocation.active_allocated_cost) = 0.03
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot on lot.id = allocation.stock_lot_id
    where lot.purchase_id = '95000000-0000-4000-8000-000000000101'
  ),
  'aktive COGS von drei Cent plus ein Cent Restbestand reconciliieren auf vier Cent'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-cent-resale-3"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'die letzte Einheit wird verkauft'
);

select ok(
  (
    select sale_line.cost_of_goods_sold = 0.01
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-r3-cent-resale-3'
  ) and (
    select lot.remaining_quantity = 0
    from public.stock_lots as lot
    where lot.purchase_id = '95000000-0000-4000-8000-000000000101'
  ) and (
    select pg_catalog.sum(allocation.active_allocated_cost) = 0.04
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot on lot.id = allocation.stock_lot_id
    where lot.purchase_id = '95000000-0000-4000-8000-000000000101'
  ),
  'auch die letzte Einheit schließt den Rest-Cent-Pool exakt ab'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-ambiguous-history"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000203","quantity":2,"unit_sale_price":10}]'::jsonb
  )$$,
  'das Legacy-Kosten-Fixture verkauft zwei Einheiten'
);

select lives_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-ambiguous-history'),
    20, true, 'legacy return', 'wird als unklare Teilretoure simuliert',
    'restock_ready', 'Legacy-Test'
  )$$,
  'das Legacy-Kosten-Fixture erzeugt zunächst eine vollständige Retoure'
);

reset role;
set local session_replication_role = replica;

update public.stock_movements as movement
set quantity = 1
from public.sale_lines as sale_line,
  public.sales as sale
where sale_line.id = movement.sale_line_id
  and sale.id = sale_line.sale_id
  and sale.external_order_id = 'task4-r3-ambiguous-history'
  and movement.reason = 'return';

update public.stock_lots
set remaining_quantity = 2
where purchase_id = '95000000-0000-4000-8000-000000000103';

update public.sale_line_lot_allocations as allocation
set active_allocated_cost = null
from public.sale_lines as sale_line,
  public.sales as sale
where sale_line.id = allocation.sale_line_id
  and sale.id = sale_line.sale_id
  and sale.external_order_id = 'task4-r3-ambiguous-history';

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-ambiguous-attempt"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000203","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  '22023',
  'Die aktiven Kosten einer historischen Teilretoure müssen vor dem Verkauf geprüft werden.',
  'mehrdeutige historische Teilretourenkosten werden abgelehnt statt erfunden'
);

select ok(
  not exists (
    select 1
    from public.sales as sale
    where sale.external_order_id = 'task4-r3-ambiguous-attempt'
  ) and (
    select lot.remaining_quantity = 2
    from public.stock_lots as lot
    where lot.purchase_id = '95000000-0000-4000-8000-000000000103'
  ) and (
    select allocation.active_allocated_cost is null
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-r3-ambiguous-history'
  ),
  'die abgelehnte Legacy-Entnahme lässt Kopf, Bestand und unklaren Kostenfakt unverändert'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-refund"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000202","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'das Erstattungs-Fixture erhält einen Verkauf über zehn Euro'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-refund-exact"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000202","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'das Grenzwert-Fixture erhält einen eigenen Verkauf über zehn Euro'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-conflict-restock"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000202","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'das erste Widerspruchs-Fixture erhält einen eigenen Verkauf'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-conflict-writeoff"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000202","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'das zweite Widerspruchs-Fixture erhält einen eigenen Verkauf'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-fractional-refund"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000202","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'das Teilcent-Fixture erhält einen eigenen Verkauf'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-nan-refund"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000202","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'das NaN-Fixture erhält einen eigenen Verkauf'
);

select lives_ok(
  $$select public.record_sale(
    '95000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-negative-refund"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000202","quantity":1,"unit_sale_price":10}]'::jsonb
  )$$,
  'das negative Erstattungs-Fixture erhält einen eigenen Verkauf'
);

select throws_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-conflict-restock'),
    1, true, 'contradiction', null, 'write_off', null
  )$$,
  '22023',
  'Wiedereinlagerung und Retourenaktion widersprechen sich.',
  'Wiedereinlagerung mit Abschreibung wird abgelehnt'
);

select throws_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-conflict-writeoff'),
    1, false, 'contradiction', null, 'restock_ready', null
  )$$,
  '22023',
  'Wiedereinlagerung und Retourenaktion widersprechen sich.',
  'Nicht-Wiedereinlagerung mit Lagerfreigabe wird abgelehnt'
);

select throws_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-fractional-refund'),
    1.001, false, 'fractional cent', null, 'keep_with_buyer', null
  )$$,
  '22023',
  'Der Erstattungsbetrag muss centgenau und nicht negativ sein.',
  'Erstattungen mit Teilcent werden abgelehnt'
);

select throws_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-nan-refund'),
    'NaN'::numeric, false, 'not a number', null, 'keep_with_buyer', null
  )$$,
  '22023',
  'Der Erstattungsbetrag muss centgenau und nicht negativ sein.',
  'NaN ist kein Erstattungsbetrag'
);

select throws_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-negative-refund'),
    -0.01, false, 'negative refund', null, 'keep_with_buyer', null
  )$$,
  '22023',
  'Der Erstattungsbetrag muss centgenau und nicht negativ sein.',
  'negative Erstattungen werden abgelehnt'
);

select ok(
  not exists (
    select 1
    from public.sales as sale
    where sale.external_order_id in (
      'task4-r3-conflict-restock',
      'task4-r3-conflict-writeoff',
      'task4-r3-fractional-refund',
      'task4-r3-nan-refund',
      'task4-r3-negative-refund'
    )
      and (sale.refund_amount <> 0 or sale.returned_at is not null)
  ) and not exists (
    select 1
    from public.returns as returned_sale
    join public.sales as sale on sale.id = returned_sale.sale_id
    where sale.external_order_id in (
      'task4-r3-conflict-restock',
      'task4-r3-conflict-writeoff',
      'task4-r3-fractional-refund',
      'task4-r3-nan-refund',
      'task4-r3-negative-refund'
    )
  ) and not exists (
    select 1
    from public.stock_movements as movement
    join public.sale_lines as sale_line on sale_line.id = movement.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id in (
      'task4-r3-conflict-restock',
      'task4-r3-conflict-writeoff',
      'task4-r3-fractional-refund',
      'task4-r3-nan-refund',
      'task4-r3-negative-refund'
    )
      and movement.reason in ('return', 'damage')
  ),
  'widersprüchliche und ungültige Retouren hinterlassen keine Teilwrites'
);

select lives_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-refund-exact'),
    0, false, 'zero boundary', null, 'keep_with_buyer', null
  )$$,
  'eine centgenaue Nullerstattung ist als dokumentierter Teilfakt zulässig'
);

select lives_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-refund'),
    8, false, 'partial refund', null, 'keep_with_buyer', null
  )$$,
  'eine erste Teilerstattung über acht Euro wird erfasst'
);

select throws_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-refund'),
    5, false, 'excess refund', null, 'keep_with_buyer', null
  )$$,
  '22023',
  'Der Erstattungsbetrag überschreitet den noch offenen Verkaufsbetrag.',
  'acht plus fünf Euro werden bei einem Zehn-Euro-Verkauf atomar abgelehnt'
);

select ok(
  (
    select sale.refund_amount = 8 and sale.returned_at is null
    from public.sales as sale
    where sale.external_order_id = 'task4-r3-refund'
  ) and (
    select pg_catalog.sum(returned_sale.refund_amount) = 8
      and pg_catalog.count(*) = 1
    from public.returns as returned_sale
    join public.sales as sale on sale.id = returned_sale.sale_id
    where sale.external_order_id = 'task4-r3-refund'
  ) and not exists (
    select 1
    from public.stock_movements as movement
    join public.sale_lines as sale_line on sale_line.id = movement.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-r3-refund'
      and movement.reason in ('return', 'damage')
  ),
  'die abgelehnte Übererstattung lässt Kopf, unveränderliche Retouren und Bestand bei acht Euro'
);

select lives_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-refund-exact'),
    8, false, 'partial refund', null, 'keep_with_buyer', null
  )$$,
  'das Grenzwert-Fixture erhält eine erste Teilerstattung über acht Euro'
);

select lives_ok(
  $$select public.record_sale_return(
    '95000000-0000-4000-8000-000000000011',
    (select id from public.sales where external_order_id = 'task4-r3-refund-exact'),
    2, true, 'exact remaining refund', null, 'restock_repair', null
  )$$,
  'der exakt offene Erstattungsbetrag schließt die Retoure centgenau ab'
);

select ok(
  (
    select sale.refund_amount = 10 and sale.returned_at is not null
    from public.sales as sale
    where sale.external_order_id = 'task4-r3-refund-exact'
  ) and (
    select pg_catalog.sum(returned_sale.refund_amount) = 10
      and pg_catalog.count(*) = 3
    from public.returns as returned_sale
    join public.sales as sale on sale.id = returned_sale.sale_id
    where sale.external_order_id = 'task4-r3-refund-exact'
  ) and (
    select pg_catalog.count(*) filter (where movement.reason = 'return') = 1
      and pg_catalog.count(*) filter (where movement.reason = 'damage') = 0
    from public.stock_movements as movement
    join public.sale_lines as sale_line on sale_line.id = movement.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-r3-refund-exact'
  ),
  'Kopf, unveränderliche Teilretouren und Bestandsbewegung stimmen beim Vollabschluss überein'
);

select * from finish();

rollback;
