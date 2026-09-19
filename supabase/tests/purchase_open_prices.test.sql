\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_function(
  'public',
  'purchase_has_open_prices',
  array['uuid', 'uuid'],
  'Offene Einkaufspreise werden unabhängig von der Einkaufsart erkannt'
);

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (
  '22000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'open-prices@example.test',
  '{}',
  '{}'
);
insert into public.workspaces(id, name)
values ('22000000-0000-4000-8000-000000000011', 'Offene Einkaufspreise');
insert into public.workspace_members(workspace_id, user_id, role)
values (
  '22000000-0000-4000-8000-000000000011',
  '22000000-0000-4000-8000-000000000001',
  'owner'
);
insert into public.catalog_products(id, workspace_id, title, tracking_mode)
values (
  '22000000-0000-4000-8000-000000000021',
  '22000000-0000-4000-8000-000000000011',
  'Offenes Mengenprodukt',
  'quantity'
);

create temporary table open_price_results (
  name text primary key,
  purchase_id uuid not null,
  purchase_line_id uuid not null
);
grant all on open_price_results to authenticated;

create function pg_temp.open_line(
  p_client_ref text,
  p_price_mode text,
  p_unit_purchase_price numeric,
  p_line_total numeric
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'client_ref', p_client_ref,
    'catalog_product_id', '22000000-0000-4000-8000-000000000021',
    'title_snapshot', 'Offenes Mengenprodukt',
    'line_kind', 'quantity',
    'ordered_quantity', 2,
    'price_mode', p_price_mode,
    'unit_purchase_price', p_unit_purchase_price,
    'line_total', p_line_total,
    'condition_snapshot', 'used',
    'estimated_market_value', null,
    'allocated_additional_cost', 0
  );
$$;

create function pg_temp.open_purchase(
  p_request_id uuid,
  p_purchase_price numeric
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'request_id', p_request_id,
    'source_id', null,
    'supplier_id', null,
    'type', 'lot',
    'title', 'Preis noch offen',
    'purchase_date', '2026-09-20',
    'purchase_price', p_purchase_price,
    'discount_amount', 0,
    'content_status', 'known',
    'pricing_mode', 'individual',
    'cost_allocation_mode', 'even',
    'supplier_reference', null,
    'notes', null,
    'tracking_number', null,
    'tracking_carrier', null,
    'tracking_status', 'pending',
    'original_url', null
  );
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);

insert into open_price_results(name, purchase_id, purchase_line_id)
select
  'open',
  (result #>> '{purchase,id}')::uuid,
  (result #>> '{purchase_lines,0,id}')::uuid
from (
  select public.create_purchase(
    '22000000-0000-4000-8000-000000000011',
    pg_temp.open_purchase('22000000-0000-4000-8000-000000000031', null),
    '[]'::jsonb,
    jsonb_build_array(pg_temp.open_line('open-line', 'open', null, null))
  ) as result
) as created;

select is(
  (select price_mode from public.purchase_lines where id = (select purchase_line_id from open_price_results where name = 'open')),
  'open',
  'Ein normaler Einkauf kann mit offenem Positionspreis als Entwurf gespeichert werden'
);
select is(
  (select purchase_price from public.purchases where id = (select purchase_id from open_price_results where name = 'open')),
  null::numeric,
  'Ein offener Positionspreis speichert keinen erfundenen Warenbetrag'
);
select ok(
  public.purchase_has_open_prices(
    '22000000-0000-4000-8000-000000000011',
    (select purchase_id from open_price_results where name = 'open')
  ),
  'Der offene Preisstatus wird fachlich unabhängig von Mystery erkannt'
);

select lives_ok(
  $$select public.update_purchase_draft(
    '22000000-0000-4000-8000-000000000011',
    (select purchase_id from open_price_results where name = 'open'),
    pg_temp.open_purchase('22000000-0000-4000-8000-000000000031', null),
    '[]'::jsonb,
    jsonb_build_array(pg_temp.open_line(
      (select purchase_line_id::text from open_price_results where name = 'open'),
      'open',
      null,
      null
    ))
  )$$,
  'Ein Entwurf mit offenem Preis kann wieder geöffnet und gespeichert werden'
);
select is(
  (select price_mode from public.purchase_lines where id = (select purchase_line_id from open_price_results where name = 'open')),
  'open',
  'Das Wiederöffnen erhält den offenen Preisstatus'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '22000000-0000-4000-8000-000000000011',
    (select purchase_id from open_price_results where name = 'open')
  )$$,
  '22023',
  'Offene Einkaufspreise müssen vor dem Abschluss ergänzt werden.',
  'Ein offener Preis sperrt die Finalisierung und damit Korrekturen nach Abschluss'
);
select lives_ok(
  $$select public.update_purchase_workflow(
    (select purchase_id from open_price_results where name = 'open'),
    'ordered'
  )$$,
  'Ein offener Entwurf darf als bestellt markiert werden'
);
select throws_ok(
  $$select public.update_purchase_workflow(
    (select purchase_id from open_price_results where name = 'open'),
    'arrived'
  )$$,
  '22023',
  'Offene Einkaufspreise müssen vor der Ankunft ergänzt werden.',
  'Ein offener Preis sperrt die Ankunft'
);
select throws_ok(
  $$select public.receive_purchase_lines(
    '22000000-0000-4000-8000-000000000011',
    (select purchase_id from open_price_results where name = 'open'),
    jsonb_build_array(jsonb_build_object(
      'purchase_line_id', (select purchase_line_id from open_price_results where name = 'open'),
      'received_quantity', 1,
      'received_at', '2026-09-20T12:00:00Z'
    ))
  )$$,
  '22023',
  'Offene Einkaufspreise müssen vor dem Wareneingang ergänzt werden.',
  'Ein offener Preis sperrt den Mengenwareneingang'
);

reset role;
select throws_ok(
  $$insert into public.stock_lots(
    workspace_id, purchase_id, purchase_line_id, catalog_product_id,
    received_quantity, remaining_quantity, unit_cost
  ) values (
    '22000000-0000-4000-8000-000000000011',
    (select purchase_id from open_price_results where name = 'open'),
    (select purchase_line_id from open_price_results where name = 'open'),
    '22000000-0000-4000-8000-000000000021',
    1, 1, null
  )$$,
  '22023',
  'Offene Einkaufspreise müssen vor der Bestandsübernahme ergänzt werden.',
  'Der Bestandslos-Trigger sperrt offene Preise auch außerhalb des Wareneingangs-RPCs'
);
select is(
  (select count(*)::integer from public.stock_lots where purchase_id = (select purchase_id from open_price_results where name = 'open')),
  0,
  'Ein gesperrter offener Preis erzeugt kein Bestandslos'
);
select throws_ok(
  $$insert into public.inventory_items(workspace_id, purchase_id, title, condition)
  values (
    '22000000-0000-4000-8000-000000000011',
    (select purchase_id from open_price_results where name = 'open'),
    'Direkter offener Inventarartikel',
    'used'
  )$$,
  '22023',
  'Offene Einkaufspreise müssen vor der Bestandsübernahme ergänzt werden.',
  'Der Inventar-Trigger sperrt offene Preise auch außerhalb der Oberfläche'
);
select is(
  (select count(*)::integer from public.inventory_items where purchase_id = (select purchase_id from open_price_results where name = 'open')),
  0,
  'Ein gesperrter offener Preis erzeugt keinen Inventarartikel'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);
insert into open_price_results(name, purchase_id, purchase_line_id)
select
  'open-individual',
  (result #>> '{purchase,id}')::uuid,
  (result #>> '{purchase_lines,0,id}')::uuid
from (
  select public.create_purchase(
    '22000000-0000-4000-8000-000000000011',
    pg_temp.open_purchase('22000000-0000-4000-8000-000000000033', null),
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'client_ref', 'open-individual-line',
      'catalog_product_id', null,
      'title_snapshot', 'Offener Einzelartikel',
      'line_kind', 'individual',
      'ordered_quantity', 1,
      'price_mode', 'open',
      'unit_purchase_price', null,
      'line_total', null,
      'condition_snapshot', 'used',
      'estimated_market_value', null,
      'allocated_additional_cost', 0
    ))
  ) as result
) as created;
select throws_ok(
  $$select public.receive_individual_purchase_line(
    '22000000-0000-4000-8000-000000000011',
    (select purchase_id from open_price_results where name = 'open-individual'),
    (select purchase_line_id from open_price_results where name = 'open-individual'),
    '{"title":"Direkt erfasster Artikel"}'::jsonb
  )$$,
  '22023',
  'Offene Einkaufspreise müssen vor dem Wareneingang ergänzt werden.',
  'Ein offener Preis sperrt den Einzelartikel-Wareneingang'
);
insert into open_price_results(name, purchase_id, purchase_line_id)
select
  'zero',
  (result #>> '{purchase,id}')::uuid,
  (result #>> '{purchase_lines,0,id}')::uuid
from (
  select public.create_purchase(
    '22000000-0000-4000-8000-000000000011',
    pg_temp.open_purchase('22000000-0000-4000-8000-000000000032', 0),
    '[]'::jsonb,
    jsonb_build_array(pg_temp.open_line('zero-line', 'priced', 0, 0))
  ) as result
) as created;

select is(
  (select purchase_price from public.purchases where id = (select purchase_id from open_price_results where name = 'zero')),
  0::numeric,
  'Ein ausdrücklicher Warenbetrag von 0,00 € bleibt gespeichert'
);
select ok(
  not public.purchase_has_open_prices(
    '22000000-0000-4000-8000-000000000011',
    (select purchase_id from open_price_results where name = 'zero')
  ),
  'Ein Preis von 0,00 € ist kein offener Preis'
);
select lives_ok(
  $$select public.update_purchase_workflow(
    (select purchase_id from open_price_results where name = 'zero'),
    'ordered'
  )$$,
  'Ein Preis von 0,00 € darf bestellt werden'
);
select lives_ok(
  $$select public.update_purchase_workflow(
    (select purchase_id from open_price_results where name = 'zero'),
    'arrived'
  )$$,
  'Ein Preis von 0,00 € darf als angekommen markiert werden'
);
select lives_ok(
  $$select public.finalize_purchase_costing(
    '22000000-0000-4000-8000-000000000011',
    (select purchase_id from open_price_results where name = 'zero')
  )$$,
  'Ein Preis von 0,00 € darf finalisiert werden'
);

reset role;
insert into public.purchases(
  id, workspace_id, type, title, purchase_date, purchase_price, pricing_mode
)
values (
  '22000000-0000-4000-8000-000000000041',
  '22000000-0000-4000-8000-000000000011',
  'lot',
  'Alter offener Preisstatus',
  '2026-09-20',
  null,
  'individual'
);
insert into public.purchase_lines(
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, price_mode, unit_purchase_price, line_total
)
values (
  '22000000-0000-4000-8000-000000000042',
  '22000000-0000-4000-8000-000000000011',
  '22000000-0000-4000-8000-000000000041',
  '22000000-0000-4000-8000-000000000021',
  'Historische offene Position',
  'quantity',
  1,
  'unpriced_mystery',
  null,
  null
);
select ok(
  public.purchase_has_open_prices(
    '22000000-0000-4000-8000-000000000011',
    '22000000-0000-4000-8000-000000000041'
  ),
  'Historische unpriced_mystery-Daten eines normalen Einkaufs bleiben als offen geschützt'
);

select * from finish();
rollback;
