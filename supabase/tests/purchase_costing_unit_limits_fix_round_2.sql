\set ON_ERROR_STOP on

begin;

select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '99000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'purchase-unit-limit-owner@example.test',
  'unused',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.workspaces (id, name) values (
  '99000000-0000-4000-8000-000000000011',
  'Einkaufsmengengrenze Fixrunde 2'
);

insert into public.workspace_members (workspace_id, user_id, role) values (
  '99000000-0000-4000-8000-000000000011',
  '99000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('99000000-0000-4000-8000-000000000201', '99000000-0000-4000-8000-000000000011', 'Grenzwert-Produkt', 'quantity'),
  ('99000000-0000-4000-8000-000000000202', '99000000-0000-4000-8000-000000000011', 'Wareneingang minus unendlich', 'quantity'),
  ('99000000-0000-4000-8000-000000000203', '99000000-0000-4000-8000-000000000011', 'Wareneingang plus unendlich', 'quantity'),
  ('99000000-0000-4000-8000-000000000204', '99000000-0000-4000-8000-000000000011', 'Endliche Wareneingänge', 'quantity'),
  ('99000000-0000-4000-8000-000000000205', '99000000-0000-4000-8000-000000000011', 'Legacy-Mengengrenze', 'quantity'),
  ('99000000-0000-4000-8000-000000000206', '99000000-0000-4000-8000-000000000011', 'Legacy-Zeitpunkt', 'quantity'),
  ('99000000-0000-4000-8000-000000000207', '99000000-0000-4000-8000-000000000011', 'Korrekturgrenze', 'quantity');

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_definition
    join pg_catalog.pg_class as relation
      on relation.oid = constraint_definition.conrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'purchase_lines'
      and constraint_definition.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_definition.oid)
        ~ 'ordered_quantity <= 100000'
  ),
  'die deklarative Positionsmenge ist auf 100.000 Einheiten begrenzt'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_definition
    join pg_catalog.pg_class as relation
      on relation.oid = constraint_definition.conrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'stock_lots'
      and constraint_definition.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_definition.oid)
        ~ 'isfinite\(received_at\)'
  ),
  'Bestandslose akzeptieren deklarativ nur endliche Empfangszeitpunkte'
);

insert into public.purchases (
  id, workspace_id, type, title, purchase_price
) values (
  '99000000-0000-4000-8000-000000000101',
  '99000000-0000-4000-8000-000000000011',
  'mystery_pack',
  '100.000er-Grenzwert',
  1000.00
);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total
) values (
  '99000000-0000-4000-8000-000000000301',
  '99000000-0000-4000-8000-000000000011',
  '99000000-0000-4000-8000-000000000101',
  '99000000-0000-4000-8000-000000000201',
  '100.000er-Grenzwert',
  'quantity',
  100000,
  0,
  'unpriced_mystery',
  null,
  null
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000101'
  )$$,
  'die gemessene 100.000er-Grenze durchläuft den echten Kostenplan und die Finalisierung'
);

select results_eq(
  $$
    select purchase.entry_status, purchase.total_purchase_cost,
      lot.received_quantity, lot.remaining_quantity,
      pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)
    from public.purchases as purchase
    join public.stock_lots as lot on lot.purchase_id = purchase.id
    where purchase.id = '99000000-0000-4000-8000-000000000101'
  $$,
  $$values ('finalized'::text, 1000.00::numeric, 100000, 100000, 1000.00::numeric)$$,
  'die Obergrenze erzeugt einen exakten und vollständig abgestimmten Loskostenpool'
);

select throws_ok(
  $$select public.create_purchase(
    '99000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"RPC Positionsgrenze","purchase_date":"2026-08-31","purchase_price":1000.01}'::jsonb,
    '[]'::jsonb,
    '[{"title_snapshot":"Zu große Position","line_kind":"individual","ordered_quantity":100001,"unit_purchase_price":0.01,"line_total":1000.01}]'::jsonb
  )$$,
  '22023',
  'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.',
  'create_purchase lehnt die Positionsgrenze plus eins vor dem Schreiben ab'
);

select is(
  (
    select pg_catalog.count(*)
    from public.purchases as purchase
    where purchase.workspace_id = '99000000-0000-4000-8000-000000000011'
      and purchase.title = 'RPC Positionsgrenze'
  ),
  0::bigint,
  'die abgelehnte create_purchase-Anfrage hinterlässt keinen Einkaufskopf'
);

select throws_ok(
  $$select public.create_purchase(
    '99000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"RPC Einkaufsgrenze","purchase_date":"2026-08-31","purchase_price":1000.01}'::jsonb,
    '[]'::jsonb,
    '[{"title_snapshot":"Erste Hälfte","line_kind":"individual","ordered_quantity":50000,"unit_purchase_price":0.01,"line_total":500.00},{"title_snapshot":"Zweite Hälfte plus eins","line_kind":"individual","ordered_quantity":50001,"unit_purchase_price":0.01,"line_total":500.01}]'::jsonb
  )$$,
  '22023',
  'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.',
  'create_purchase lehnt eine positionsübergreifende Summe von 100.001 früh ab'
);

select is(
  (
    select pg_catalog.count(*)
    from public.purchases as purchase
    where purchase.workspace_id = '99000000-0000-4000-8000-000000000011'
      and purchase.title = 'RPC Einkaufsgrenze'
  ),
  0::bigint,
  'auch die abgelehnte Summengrenze hinterlässt keinen Einkaufskopf'
);

reset role;

insert into public.purchases (id, workspace_id, type, title) values
  ('99000000-0000-4000-8000-000000000102', '99000000-0000-4000-8000-000000000011', 'single', 'add_purchase_lines Grenze'),
  ('99000000-0000-4000-8000-000000000103', '99000000-0000-4000-8000-000000000011', 'single', 'Direkte Positionsgrenze'),
  ('99000000-0000-4000-8000-000000000104', '99000000-0000-4000-8000-000000000011', 'single', 'Direkte Einkaufsgrenze');

insert into public.purchase_lines (
  id, workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, price_mode, unit_purchase_price, line_total
) values
  ('99000000-0000-4000-8000-000000000302', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000102', 'Vorhandene 60.000', 'individual', 60000, 'priced', 0.01, 600.00),
  ('99000000-0000-4000-8000-000000000303', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000104', 'Vorhandene direkte 60.000', 'individual', 60000, 'priced', 0.01, 600.00);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.add_purchase_lines(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000102',
    '[{"title_snapshot":"Neue 40.001","line_kind":"individual","ordered_quantity":40001,"unit_purchase_price":0.01,"line_total":400.01}]'::jsonb
  )$$,
  '22023',
  'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.',
  'add_purchase_lines prüft vorhandene und neue Einheiten als gemeinsame Einkaufsgrenze'
);

select is(
  (
    select pg_catalog.sum(line.ordered_quantity)
    from public.purchase_lines as line
    where line.purchase_id = '99000000-0000-4000-8000-000000000102'
  ),
  60000::bigint,
  'die abgelehnte Ergänzung schreibt keine Teilposition'
);

reset role;

select throws_ok(
  $$
    insert into public.purchase_lines (
      workspace_id, purchase_id, title_snapshot, line_kind,
      ordered_quantity, price_mode, unit_purchase_price, line_total
    ) values (
      '99000000-0000-4000-8000-000000000011',
      '99000000-0000-4000-8000-000000000103',
      'Direkt 100.001', 'individual', 100001, 'priced', 0.01, 1000.01
    )
  $$,
  '22023',
  'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.',
  'ein direkter Schreibzugriff kann die Positionsgrenze nicht umgehen'
);

select is(
  (
    select pg_catalog.count(*)
    from public.purchase_lines as line
    where line.purchase_id = '99000000-0000-4000-8000-000000000103'
  ),
  0::bigint,
  'die direkt abgelehnte Position wurde nicht geschrieben'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    insert into public.purchase_lines (
      workspace_id, purchase_id, title_snapshot, line_kind,
      ordered_quantity, price_mode, unit_purchase_price, line_total
    ) values (
      '99000000-0000-4000-8000-000000000011',
      '99000000-0000-4000-8000-000000000104',
      'Direkte 40.001', 'individual', 40001, 'priced', 0.01, 400.01
    )
  $$,
  '42501',
  'permission denied for table purchase_lines',
  'ein direkter Client-Schreibzugriff kann die Einkaufsgrenze nicht umgehen'
);

reset role;

select is(
  (
    select pg_catalog.sum(line.ordered_quantity)
    from public.purchase_lines as line
    where line.purchase_id = '99000000-0000-4000-8000-000000000104'
  ),
  60000::bigint,
  'die direkte Summenablehnung bleibt atomar'
);

insert into public.purchases (id, workspace_id, type, title) values
  ('99000000-0000-4000-8000-000000000105', '99000000-0000-4000-8000-000000000011', 'single', 'Minus unendlich'),
  ('99000000-0000-4000-8000-000000000106', '99000000-0000-4000-8000-000000000011', 'single', 'Plus unendlich'),
  ('99000000-0000-4000-8000-000000000107', '99000000-0000-4000-8000-000000000011', 'single', 'Endliche Zeiten'),
  ('99000000-0000-4000-8000-000000000108', '99000000-0000-4000-8000-000000000011', 'single', 'Direkter Standardzeitpunkt'),
  ('99000000-0000-4000-8000-000000000109', '99000000-0000-4000-8000-000000000011', 'single', 'Direkte Zeitänderung');

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total
) values
  ('99000000-0000-4000-8000-000000000304', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000105', '99000000-0000-4000-8000-000000000202', 'Minus unendlich', 'quantity', 2, 0, 'priced', 1.00, 2.00),
  ('99000000-0000-4000-8000-000000000305', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000106', '99000000-0000-4000-8000-000000000203', 'Plus unendlich', 'quantity', 1, 0, 'priced', 1.00, 1.00),
  ('99000000-0000-4000-8000-000000000306', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000107', '99000000-0000-4000-8000-000000000204', 'Endliche Zeiten', 'quantity', 3, 0, 'priced', 1.00, 3.00),
  ('99000000-0000-4000-8000-000000000307', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000108', '99000000-0000-4000-8000-000000000204', 'Direkter Standardzeitpunkt', 'quantity', 1, 1, 'priced', 1.00, 1.00),
  ('99000000-0000-4000-8000-000000000308', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000109', '99000000-0000-4000-8000-000000000204', 'Direkte Zeitänderung', 'quantity', 1, 1, 'priced', 1.00, 1.00);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.receive_purchase_lines(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000105',
    '[{"purchase_line_id":"99000000-0000-4000-8000-000000000304","received_quantity":1,"received_at":"2026-08-31T12:00:00Z"},{"purchase_line_id":"99000000-0000-4000-8000-000000000304","received_quantity":1,"received_at":"-infinity"}]'::jsonb
  )$$,
  '22023',
  'Der Empfangszeitpunkt muss ein endlicher Zeitpunkt sein.',
  'receive_purchase_lines lehnt minus unendlich vor dem ersten Schreibvorgang ab'
);

select ok(
  (
    select line.received_quantity = 0
    from public.purchase_lines as line
    where line.id = '99000000-0000-4000-8000-000000000304'
  ) and not exists (
    select 1
    from public.stock_lots as lot
    where lot.purchase_line_id = '99000000-0000-4000-8000-000000000304'
  ),
  'der gemischte ungültige Wareneingang bleibt vollständig atomar'
);

select throws_ok(
  $$select public.receive_purchase_lines(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000106',
    '[{"purchase_line_id":"99000000-0000-4000-8000-000000000305","received_quantity":1,"received_at":"+infinity"}]'::jsonb
  )$$,
  '22023',
  'Der Empfangszeitpunkt muss ein endlicher Zeitpunkt sein.',
  'receive_purchase_lines lehnt plus unendlich kontrolliert ab'
);

select ok(
  (
    select line.received_quantity = 0
    from public.purchase_lines as line
    where line.id = '99000000-0000-4000-8000-000000000305'
  ) and not exists (
    select 1
    from public.stock_lots as lot
    where lot.purchase_line_id = '99000000-0000-4000-8000-000000000305'
  ),
  'auch plus unendlich hinterlässt weder Menge noch Bestandslos'
);

select lives_ok(
  $$select public.receive_purchase_lines(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000107',
    '[{"purchase_line_id":"99000000-0000-4000-8000-000000000306","received_quantity":1,"received_at":"2026-08-31T12:00:00Z"},{"purchase_line_id":"99000000-0000-4000-8000-000000000306","received_quantity":1,"received_at":"2099-01-01T00:00:00Z"},{"purchase_line_id":"99000000-0000-4000-8000-000000000306","received_quantity":1,"received_at":"2099-01-01T00:00:00Z"}]'::jsonb
  )$$,
  'normale, zukünftige und gleiche endliche Empfangszeitpunkte bleiben gültig'
);

select ok(
  (
    select pg_catalog.count(*) = 3
      and pg_catalog.bool_and(pg_catalog.isfinite(lot.received_at))
    from public.stock_lots as lot
    where lot.purchase_line_id = '99000000-0000-4000-8000-000000000306'
  ) and (
    select pg_catalog.count(*) = 2
    from public.stock_lots as lot
    where lot.purchase_line_id = '99000000-0000-4000-8000-000000000306'
      and lot.received_at = '2099-01-01 00:00:00+00'::timestamptz
  ),
  'gleiche endliche Zeitpunkte werden unverändert gespeichert'
);

reset role;

insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost
) values (
  '99000000-0000-4000-8000-000000000501',
  '99000000-0000-4000-8000-000000000011',
  '99000000-0000-4000-8000-000000000108',
  '99000000-0000-4000-8000-000000000307',
  '99000000-0000-4000-8000-000000000204',
  1,
  1,
  0
);

select ok(
  (
    select pg_catalog.isfinite(lot.received_at)
      and lot.received_at between pg_catalog.statement_timestamp() - interval '1 minute'
        and pg_catalog.statement_timestamp() + interval '1 minute'
    from public.stock_lots as lot
    where lot.id = '99000000-0000-4000-8000-000000000501'
  ),
  'der deklarative now-Standard erzeugt einen endlichen aktuellen Zeitpunkt'
);

select throws_ok(
  $$
    insert into public.stock_lots (
      workspace_id, purchase_id, purchase_line_id, catalog_product_id,
      received_quantity, remaining_quantity, unit_cost, received_at
    ) values (
      '99000000-0000-4000-8000-000000000011',
      '99000000-0000-4000-8000-000000000109',
      '99000000-0000-4000-8000-000000000308',
      '99000000-0000-4000-8000-000000000204',
      1, 1, 0, '-infinity'
    )
  $$,
  '22023',
  'Der Empfangszeitpunkt muss ein endlicher Zeitpunkt sein.',
  'auch ein direkter Insert kann keinen nicht-endlichen Zeitpunkt schreiben'
);

insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost, received_at
) values (
  '99000000-0000-4000-8000-000000000502',
  '99000000-0000-4000-8000-000000000011',
  '99000000-0000-4000-8000-000000000109',
  '99000000-0000-4000-8000-000000000308',
  '99000000-0000-4000-8000-000000000204',
  1,
  1,
  0,
  '2026-08-31 13:00:00+00'
);

select throws_ok(
  $$
    update public.stock_lots
    set received_at = 'infinity'
    where id = '99000000-0000-4000-8000-000000000502'
  $$,
  '22023',
  'Der Empfangszeitpunkt muss ein endlicher Zeitpunkt sein.',
  'auch ein direkter Update kann keinen nicht-endlichen Zeitpunkt schreiben'
);

select is(
  (
    select lot.received_at
    from public.stock_lots as lot
    where lot.id = '99000000-0000-4000-8000-000000000502'
  ),
  '2026-08-31 13:00:00+00'::timestamptz,
  'die direkte Zeitänderung bleibt bei Ablehnung unverändert'
);

insert into public.purchases (
  id, workspace_id, type, title, purchase_price
) values (
  '99000000-0000-4000-8000-000000000110',
  '99000000-0000-4000-8000-000000000011',
  'mystery_pack',
  'Korrekturgrenze',
  600.00
);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total
) values (
  '99000000-0000-4000-8000-000000000309',
  '99000000-0000-4000-8000-000000000011',
  '99000000-0000-4000-8000-000000000110',
  '99000000-0000-4000-8000-000000000207',
  'Korrekturgrenze 60.000',
  'quantity',
  60000,
  0,
  'unpriced_mystery',
  null,
  null
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000110'
  )$$,
  'die Korrektur-Fixture wird innerhalb der Fachgrenze finalisiert'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000110',
    'Grenzwert plus eins muss atomar scheitern',
    1000.01,
    '[{"id":"99000000-0000-4000-8000-000000000309","catalog_product_id":"99000000-0000-4000-8000-000000000207","title_snapshot":"Korrekturgrenze 60.000","line_kind":"quantity","ordered_quantity":60000,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null},{"id":"99000000-0000-4000-8000-000000000310","catalog_product_id":"99000000-0000-4000-8000-000000000207","title_snapshot":"Korrekturgrenze 40.001","line_kind":"quantity","ordered_quantity":40001,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.',
  'correct_purchase_costing prüft die Ersatzpositionen vor Änderung und Kostenplan'
);

reset role;

select ok(
  not exists (
    select 1
    from public.purchase_lines as line
    where line.id = '99000000-0000-4000-8000-000000000310'
  ) and (
    select purchase.purchase_price = 600.00
      and purchase.entry_status = 'finalized'
    from public.purchases as purchase
    where purchase.id = '99000000-0000-4000-8000-000000000110'
  ) and not exists (
    select 1
    from public.business_events as event
    where event.entity_id = '99000000-0000-4000-8000-000000000110'
      and event.event_type = 'purchase_costing_corrected'
  ),
  'die abgelehnte Korrektur lässt Position, Einkauf und Ereignisjournal unverändert'
);

alter table public.purchase_lines
  disable trigger protect_purchase_line_costing_fields;
alter table public.stock_lots
  disable trigger protect_stock_lot_costing_fields;
alter table public.purchase_lines
  drop constraint if exists purchase_lines_ordered_quantity_check;
alter table public.stock_lots
  drop constraint if exists stock_lots_received_at_finite_check;

insert into public.purchases (
  id, workspace_id, type, title, purchase_price
) values
  ('99000000-0000-4000-8000-000000000111', '99000000-0000-4000-8000-000000000011', 'mystery_pack', 'Legacy über Mengengrenze', 1000.01),
  ('99000000-0000-4000-8000-000000000112', '99000000-0000-4000-8000-000000000011', 'single', 'Legacy Wareneingangsgrenze', null),
  ('99000000-0000-4000-8000-000000000113', '99000000-0000-4000-8000-000000000011', 'mystery_pack', 'Legacy minus unendlich', 0.01);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total
) values
  ('99000000-0000-4000-8000-000000000311', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000111', '99000000-0000-4000-8000-000000000205', 'Legacy 100.001', 'quantity', 100001, 0, 'unpriced_mystery', null, null),
  ('99000000-0000-4000-8000-000000000312', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000112', '99000000-0000-4000-8000-000000000205', 'Legacy Wareneingang 100.001', 'quantity', 100001, 0, 'priced', 0.01, 1000.01),
  ('99000000-0000-4000-8000-000000000313', '99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000113', '99000000-0000-4000-8000-000000000206', 'Legacy minus unendlich', 'quantity', 1, 1, 'unpriced_mystery', null, null);

insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost, received_at
) values (
  '99000000-0000-4000-8000-000000000503',
  '99000000-0000-4000-8000-000000000011',
  '99000000-0000-4000-8000-000000000113',
  '99000000-0000-4000-8000-000000000313',
  '99000000-0000-4000-8000-000000000206',
  1,
  1,
  0,
  '-infinity'
);

insert into public.stock_movements (
  workspace_id, stock_lot_id, direction, quantity, reason
) values (
  '99000000-0000-4000-8000-000000000011',
  '99000000-0000-4000-8000-000000000503',
  'in',
  1,
  'receipt'
);

alter table public.purchase_lines
  add constraint purchase_lines_ordered_quantity_check
  check (
    ordered_quantity > 0
    and ordered_quantity <= 100000
    and ordered_quantity::numeric <> 'NaN'::numeric
  ) not valid;
alter table public.stock_lots
  add constraint stock_lots_received_at_finite_check
  check (pg_catalog.isfinite(received_at)) not valid;
alter table public.purchase_lines
  enable trigger protect_purchase_line_costing_fields;
alter table public.stock_lots
  enable trigger protect_stock_lot_costing_fields;

select throws_ok(
  $$select public.build_purchase_costing_plan(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000111'
  )$$,
  '22023',
  'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.',
  'der Kostenplan lehnt Legacy-Übermengen vor seinen Unit-Arrays ab'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000111'
  )$$,
  '22023',
  'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.',
  'die Finalisierung lehnt eine historische Übermenge explizit und früh ab'
);

reset role;

select ok(
  (
    select purchase.entry_status = 'draft'
      and purchase.total_purchase_cost is null
    from public.purchases as purchase
    where purchase.id = '99000000-0000-4000-8000-000000000111'
  ) and not exists (
    select 1
    from public.stock_lots as lot
    where lot.purchase_id = '99000000-0000-4000-8000-000000000111'
  ) and not exists (
    select 1
    from public.business_events as event
    where event.entity_id = '99000000-0000-4000-8000-000000000111'
  ),
  'die abgelehnte Legacy-Finalisierung schreibt weder Bestand noch Ereignis'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.receive_purchase_lines(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000112',
    '[{"purchase_line_id":"99000000-0000-4000-8000-000000000312","received_quantity":1,"received_at":"2026-08-31T14:00:00Z"}]'::jsonb
  )$$,
  '22023',
  'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.',
  'der Wareneingang lehnt historische Übermengen vor Bestandswrites ab'
);

select ok(
  (
    select line.received_quantity = 0
    from public.purchase_lines as line
    where line.id = '99000000-0000-4000-8000-000000000312'
  ) and not exists (
    select 1
    from public.stock_lots as lot
    where lot.purchase_line_id = '99000000-0000-4000-8000-000000000312'
  ),
  'die abgelehnte Legacy-Annahme bleibt ohne Teilbuchung'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000113'
  )$$,
  '22023',
  'Historische Bestandslose mit nicht-endlichem Empfangszeitpunkt müssen vor der Finalisierung manuell geprüft werden.',
  'ein Legacy-Los mit minus unendlich erhält einen klaren manuellen Prüfpfad'
);

reset role;

select ok(
  (
    select purchase.entry_status = 'draft'
      and purchase.total_purchase_cost is null
    from public.purchases as purchase
    where purchase.id = '99000000-0000-4000-8000-000000000113'
  ) and (
    select lot.received_at = '-infinity'::timestamptz
      and lot.unit_cost = 0
    from public.stock_lots as lot
    where lot.id = '99000000-0000-4000-8000-000000000503'
  ) and not exists (
    select 1
    from public.business_events as event
    where event.entity_id = '99000000-0000-4000-8000-000000000113'
  ),
  'die Legacy-Zeitpunktablehnung lässt Einkauf, Los und Journal unverändert'
);

select * from finish();

rollback;
