\set ON_ERROR_STOP on

begin;

select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '9a000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'purchase-line-limit-owner@example.test',
  'unused',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.workspaces (id, name) values (
  '9a000000-0000-4000-8000-000000000011',
  'Einkaufspositionsgrenze Fixrunde 3'
);

insert into public.workspace_members (workspace_id, user_id, role) values (
  '9a000000-0000-4000-8000-000000000011',
  '9a000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.catalog_products (
  id, workspace_id, title, tracking_mode
) values (
  '9a000000-0000-4000-8000-000000000301',
  '9a000000-0000-4000-8000-000000000011',
  'Legacy Mengenprodukt',
  'quantity'
);

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.purchase_lines', 'select'),
  'angemeldete Clients dürfen Einkaufspositionen weiterhin lesen'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.purchase_lines', 'insert')
    and not pg_catalog.has_table_privilege('authenticated', 'public.purchase_lines', 'update')
    and not pg_catalog.has_table_privilege('authenticated', 'public.purchase_lines', 'delete'),
  'angemeldete Clients dürfen Einkaufspositionen nur über Business-RPCs schreiben'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.purchase_lines', 'select')
    and not pg_catalog.has_table_privilege('anon', 'public.purchase_lines', 'insert')
    and not pg_catalog.has_table_privilege('anon', 'public.purchase_lines', 'update')
    and not pg_catalog.has_table_privilege('anon', 'public.purchase_lines', 'delete'),
  'anonyme Clients haben keine direkten Schreibrechte auf Einkaufspositionen'
);

select ok(
  pg_catalog.has_table_privilege('service_role', 'public.purchase_lines', 'select')
    and not pg_catalog.has_table_privilege('service_role', 'public.purchase_lines', 'insert')
    and not pg_catalog.has_table_privilege('service_role', 'public.purchase_lines', 'update')
    and not pg_catalog.has_table_privilege('service_role', 'public.purchase_lines', 'delete'),
  'auch service_role bleibt für Einkaufspositionen auf Lesen und Business-RPCs begrenzt'
);

insert into public.purchases (id, workspace_id, type, title) values
  ('9a000000-0000-4000-8000-000000000101', '9a000000-0000-4000-8000-000000000011', 'single', 'ACL Einkauf A'),
  ('9a000000-0000-4000-8000-000000000102', '9a000000-0000-4000-8000-000000000011', 'single', 'ACL Einkauf B');

insert into public.purchase_lines (
  id, workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, price_mode, unit_purchase_price, line_total
) values
  ('9a000000-0000-4000-8000-000000000201', '9a000000-0000-4000-8000-000000000011', '9a000000-0000-4000-8000-000000000101', 'ACL Position A', 'individual', 1, 'priced', 1.00, 1.00),
  ('9a000000-0000-4000-8000-000000000202', '9a000000-0000-4000-8000-000000000011', '9a000000-0000-4000-8000-000000000102', 'ACL Position B', 'individual', 1, 'priced', 1.00, 1.00);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$
    select pg_catalog.count(*)
    from public.purchase_lines
    where workspace_id = '9a000000-0000-4000-8000-000000000011'
      and id in (
        '9a000000-0000-4000-8000-000000000201',
        '9a000000-0000-4000-8000-000000000202'
      )
  $$,
  $$values (2::bigint)$$,
  'der direkte SELECT-Regressionspfad bleibt für den Angular-Service verfügbar'
);

select throws_ok(
  $$
    insert into public.purchase_lines (
      workspace_id, purchase_id, title_snapshot, line_kind,
      ordered_quantity, price_mode, unit_purchase_price, line_total
    ) values (
      '9a000000-0000-4000-8000-000000000011',
      '9a000000-0000-4000-8000-000000000101',
      'Verbotener Direktinsert', 'individual', 1, 'priced', 1.00, 1.00
    )
  $$,
  '42501',
  'permission denied for table purchase_lines',
  'ein Client-Insert scheitert an der Tabellenberechtigung vor jedem Trigger'
);

select throws_ok(
  $$
    update public.purchase_lines
    set title_snapshot = 'Verbotenes Direktupdate'
    where id = '9a000000-0000-4000-8000-000000000201'
  $$,
  '42501',
  'permission denied for table purchase_lines',
  'ein Client-Update scheitert an der Tabellenberechtigung vor jedem Trigger'
);

select throws_ok(
  $$
    delete from public.purchase_lines
    where id = '9a000000-0000-4000-8000-000000000202'
  $$,
  '42501',
  'permission denied for table purchase_lines',
  'ein Client-Delete scheitert an der Tabellenberechtigung vor jedem Trigger'
);

select throws_ok(
  $$
    update public.purchase_lines
    set purchase_id = case id
      when '9a000000-0000-4000-8000-000000000201'::uuid
        then '9a000000-0000-4000-8000-000000000102'::uuid
      else '9a000000-0000-4000-8000-000000000101'::uuid
    end
    where id in (
      '9a000000-0000-4000-8000-000000000201',
      '9a000000-0000-4000-8000-000000000202'
    )
  $$,
  '42501',
  'permission denied for table purchase_lines',
  'ein unsortiertes Mehr-Einkaufs-Update erreicht keine Zeilen- oder Advisory-Sperre'
);

reset role;

select results_eq(
  $$
    select id, purchase_id
    from public.purchase_lines
    where id in (
      '9a000000-0000-4000-8000-000000000201',
      '9a000000-0000-4000-8000-000000000202'
    )
    order by id
  $$,
  $$values
    ('9a000000-0000-4000-8000-000000000201'::uuid, '9a000000-0000-4000-8000-000000000101'::uuid),
    ('9a000000-0000-4000-8000-000000000202'::uuid, '9a000000-0000-4000-8000-000000000102'::uuid)
  $$,
  'die verbotenen direkten Mutationen hinterlassen keine Teiländerung'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);

select throws_ok(
  pg_catalog.format(
    $statement$
      select public.create_purchase(
        '9a000000-0000-4000-8000-000000000011',
        '{"type":"single","title":"1.001 Positionen","purchase_date":"2026-08-31","purchase_price":10.01}'::jsonb,
        '[]'::jsonb,
        %L::jsonb
      )
    $statement$,
    (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'title_snapshot', pg_catalog.format('Create Position %s', number),
        'line_kind', 'individual',
        'ordered_quantity', 1,
        'unit_purchase_price', 0.01,
        'line_total', 0.01
      ) order by number)
      from pg_catalog.generate_series(1, 1001) as number
    )
  ),
  '22023',
  'Ein Einkauf ist auf 1.000 Positionen begrenzt.',
  'create_purchase lehnt 1.001 kleine Positionen vor dem Einkaufskopf ab'
);

select is(
  (
    select pg_catalog.count(*)
    from public.purchases
    where workspace_id = '9a000000-0000-4000-8000-000000000011'
      and title = '1.001 Positionen'
  ),
  0::bigint,
  'die abgelehnte 1.001er-Anfrage hinterlässt keinen Einkaufskopf'
);

select is(
  pg_catalog.jsonb_array_length(public.create_purchase(
    '9a000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"1.000 Positionen","purchase_date":"2026-08-31","purchase_price":10.00}'::jsonb,
    '[]'::jsonb,
    (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'title_snapshot', pg_catalog.format('Grenzposition %s', number),
        'line_kind', 'individual',
        'ordered_quantity', 1,
        'unit_purchase_price', 0.01,
        'line_total', 0.01
      ) order by number)
      from pg_catalog.generate_series(1, 1000) as number
    )
  ) -> 'purchase_lines'),
  1000,
  'create_purchase akzeptiert die gemessene Grenze von 1.000 Positionen'
);

reset role;

select is(
  pg_catalog.jsonb_array_length(public.build_purchase_costing_plan(
    '9a000000-0000-4000-8000-000000000011',
    (
      select id
      from public.purchases
      where workspace_id = '9a000000-0000-4000-8000-000000000011'
        and title = '1.000 Positionen'
    )
  ) -> 'lines'),
  1000,
  'der echte Kostenplan verarbeitet die 1.000er-Grenze vollständig'
);

insert into public.purchases (id, workspace_id, type, title) values
  ('9a000000-0000-4000-8000-000000000103', '9a000000-0000-4000-8000-000000000011', 'single', 'Add-Grenze'),
  ('9a000000-0000-4000-8000-000000000104', '9a000000-0000-4000-8000-000000000011', 'mystery_pack', 'Legacy Plan und Finalisierung'),
  ('9a000000-0000-4000-8000-000000000105', '9a000000-0000-4000-8000-000000000011', 'single', 'Legacy Wareneingang'),
  ('9a000000-0000-4000-8000-000000000106', '9a000000-0000-4000-8000-000000000011', 'mystery_pack', 'Legacy Wiederöffnung'),
  ('9a000000-0000-4000-8000-000000000107', '9a000000-0000-4000-8000-000000000011', 'single', 'Legacy Einzelstück-Wareneingang');

update public.purchases
set purchase_price = 10.01
where id = '9a000000-0000-4000-8000-000000000104';

update public.purchases
set entry_status = 'finalized',
    purchase_price = 10.01,
    total_purchase_cost = 10.01,
    finalized_at = now(),
    finalized_by = '9a000000-0000-4000-8000-000000000001'
where id = '9a000000-0000-4000-8000-000000000106';

insert into public.purchase_lines (
  workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, price_mode, unit_purchase_price, line_total
)
select
  '9a000000-0000-4000-8000-000000000011',
  '9a000000-0000-4000-8000-000000000103',
  pg_catalog.format('Vorhandene Add-Position %s', number),
  'individual', 1, 'priced', 0.01, 0.01
from pg_catalog.generate_series(1, 999) as number;

insert into public.purchase_lines (
  workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind,
  ordered_quantity, price_mode, unit_purchase_price, line_total
)
select
  '9a000000-0000-4000-8000-000000000011',
  purchase_id,
  case when purchase_id = '9a000000-0000-4000-8000-000000000105'::uuid
    then '9a000000-0000-4000-8000-000000000301'::uuid
    else null
  end,
  pg_catalog.format('Legacy Position %s', number),
  case when purchase_id = '9a000000-0000-4000-8000-000000000105'::uuid
    then 'quantity'
    else 'individual'
  end,
  1,
  case when purchase_id in (
      '9a000000-0000-4000-8000-000000000104'::uuid,
      '9a000000-0000-4000-8000-000000000106'::uuid
    )
    then 'unpriced_mystery'
    else 'priced'
  end,
  case when purchase_id in (
      '9a000000-0000-4000-8000-000000000104'::uuid,
      '9a000000-0000-4000-8000-000000000106'::uuid
    )
    then null
    else 0.01
  end,
  case when purchase_id in (
      '9a000000-0000-4000-8000-000000000104'::uuid,
      '9a000000-0000-4000-8000-000000000106'::uuid
    )
    then null
    else 0.01
  end
from (
  select purchase_id, number
  from unnest(array[
    '9a000000-0000-4000-8000-000000000104'::uuid,
    '9a000000-0000-4000-8000-000000000105'::uuid,
    '9a000000-0000-4000-8000-000000000106'::uuid,
    '9a000000-0000-4000-8000-000000000107'::uuid
  ]) as purchase_id
  cross join pg_catalog.generate_series(1, 1001) as number
) as legacy_lines;

set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    select public.add_purchase_lines(
      '9a000000-0000-4000-8000-000000000011',
      '9a000000-0000-4000-8000-000000000103',
      '[{"title_snapshot":"Neue Position A","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":0.01,"line_total":0.01},{"title_snapshot":"Neue Position B","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":0.01,"line_total":0.01}]'::jsonb
    )
  $$,
  '22023',
  'Ein Einkauf ist auf 1.000 Positionen begrenzt.',
  'add_purchase_lines prüft persistierte und neue Positionen gemeinsam'
);

reset role;

select is(
  (
    select pg_catalog.count(*)
    from public.purchase_lines
    where purchase_id = '9a000000-0000-4000-8000-000000000103'
  ),
  999::bigint,
  'eine abgelehnte Ergänzung schreibt keine Teilposition'
);

select throws_ok(
  $$
    select public.build_purchase_costing_plan(
      '9a000000-0000-4000-8000-000000000011',
      '9a000000-0000-4000-8000-000000000104'
    )
  $$,
  '22023',
  'Ein Einkauf ist auf 1.000 Positionen begrenzt.',
  'der Kostenplan lehnt 1.001 Legacy-Positionen vor Array- und JSON-Aufbau ab'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    select public.finalize_purchase_costing(
      '9a000000-0000-4000-8000-000000000011',
      '9a000000-0000-4000-8000-000000000104'
    )
  $$,
  '22023',
  'Ein Einkauf ist auf 1.000 Positionen begrenzt.',
  'die Finalisierung lehnt 1.001 Legacy-Positionen vor Bestandswrites ab'
);

select throws_ok(
  pg_catalog.format(
    $statement$
      select public.receive_purchase_lines(
        '9a000000-0000-4000-8000-000000000011',
        '9a000000-0000-4000-8000-000000000105',
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'purchase_line_id', %L::uuid,
          'received_quantity', 1,
          'received_at', '2026-08-31T12:00:00Z'
        ))
      )
    $statement$,
    (
      select id::text
      from public.purchase_lines
      where purchase_id = '9a000000-0000-4000-8000-000000000105'
      order by created_at, id
      limit 1
    )
  ),
  '22023',
  'Ein Einkauf ist auf 1.000 Positionen begrenzt.',
  'der mengenbasierte Wareneingang lehnt 1.001 Legacy-Positionen vor Bestandswrites ab'
);

select throws_ok(
  pg_catalog.format(
    $statement$
      select public.receive_individual_purchase_line(
        '9a000000-0000-4000-8000-000000000011',
        '9a000000-0000-4000-8000-000000000107',
        %L::uuid,
        '{"title":"Legacy Einzelstück","condition":"new","notes":null}'::jsonb
      )
    $statement$,
    (
      select id::text
      from public.purchase_lines
      where purchase_id = '9a000000-0000-4000-8000-000000000107'
      order by created_at, id
      offset 1
      limit 1
    )
  ),
  '22023',
  'Ein Einkauf ist auf 1.000 Positionen begrenzt.',
  'der Einzelstück-Wareneingang lehnt 1.001 Legacy-Positionen vor Bestandswrites ab'
);

select throws_ok(
  $$
    select public.reopen_purchase_costing(
      '9a000000-0000-4000-8000-000000000011',
      '9a000000-0000-4000-8000-000000000106'
    )
  $$,
  '22023',
  'Ein Einkauf ist auf 1.000 Positionen begrenzt.',
  'die Wiederöffnung lehnt 1.001 Legacy-Positionen vor Snapshot- und Massenwrites ab'
);

reset role;

update public.purchases
set entry_status = 'finalized',
    purchase_price = 10.01,
    total_purchase_cost = 10.01,
    finalized_at = now(),
    finalized_by = '9a000000-0000-4000-8000-000000000001'
where id = '9a000000-0000-4000-8000-000000000106';

set local role authenticated;
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);

select throws_ok(
  pg_catalog.format(
    $statement$
      select public.correct_purchase_costing(
        '9a000000-0000-4000-8000-000000000011',
        '9a000000-0000-4000-8000-000000000106',
        'Legacy-Positionsgrenze vor Korrektur prüfen',
        10.01,
        %L::jsonb,
        '[]'::jsonb
      )
    $statement$,
    (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', line.id,
        'catalog_product_id', line.catalog_product_id,
        'title_snapshot', line.title_snapshot,
        'line_kind', line.line_kind,
        'ordered_quantity', line.ordered_quantity,
        'price_mode', line.price_mode,
        'unit_purchase_price', line.unit_purchase_price,
        'line_total', line.line_total,
        'condition_snapshot', line.condition_snapshot,
        'estimated_market_value', line.estimated_market_value
      ) order by line.created_at, line.id)
      from public.purchase_lines as line
      where line.purchase_id = '9a000000-0000-4000-8000-000000000106'
    )
  ),
  '22023',
  'Ein Einkauf ist auf 1.000 Positionen begrenzt.',
  'die Korrektur lehnt 1.001 Ersatzpositionen vor Snapshot- und Bestandsarbeit ab'
);

reset role;

select ok(
  (
    select pg_catalog.count(*) = 1001
    from public.purchase_lines
    where purchase_id = '9a000000-0000-4000-8000-000000000105'
  ) and not exists (
    select 1
    from public.inventory_items
    where purchase_id = '9a000000-0000-4000-8000-000000000105'
  ) and not exists (
    select 1
    from public.stock_lots
    where purchase_id = '9a000000-0000-4000-8000-000000000105'
  ) and not exists (
    select 1
    from public.inventory_items
    where purchase_id = '9a000000-0000-4000-8000-000000000107'
  ) and not exists (
    select 1
    from public.stock_lots
    where purchase_id = '9a000000-0000-4000-8000-000000000107'
  ),
  'die abgelehnten Legacy-Wareneingänge bleiben vollständig atomar'
);

select * from finish();

rollback;
