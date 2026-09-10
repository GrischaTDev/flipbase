\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_column('public', 'suppliers', 'country_code', 'Verkäufer speichern ISO-Ländercodes');
select has_column('public', 'purchases', 'arrived_at', 'Einkäufe speichern den Ankunftszeitpunkt');
select has_column(
  'public',
  'catalog_products',
  'image_storage_path',
  'Katalogartikel speichern den optionalen Bildpfad'
);
select has_function(
  'public',
  'create_purchase_with_position_prices',
  array['uuid', 'jsonb', 'jsonb', 'jsonb'],
  'Paketpreise werden mit präzisem Stückdurchschnitt angelegt'
);
select has_function(
  'public',
  'update_purchase_workflow',
  array['uuid', 'text'],
  'Der Einkaufsstatus wird atomar geändert'
);
select has_function(
  'public',
  'update_purchase_tracking',
  array['uuid', 'text', 'text', 'text'],
  'Tracking wird unabhängig vom Einkaufsstatus geändert'
);
select has_function(
  'public',
  'update_purchase_draft_with_event',
  array['uuid', 'uuid', 'jsonb', 'jsonb', 'jsonb'],
  'Entwurfsänderungen und Chronik werden atomar gespeichert'
);

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (
  '12000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'purchase-redesign@example.test',
  '{}',
  '{}'
);
insert into public.workspaces(id, name)
values ('12000000-0000-4000-8000-000000000010', 'Neue Einkaufserfassung');
insert into public.workspace_members(workspace_id, user_id, role)
values (
  '12000000-0000-4000-8000-000000000010',
  '12000000-0000-4000-8000-000000000001',
  'owner'
);
insert into public.suppliers(
  id,
  workspace_id,
  name,
  seller_type,
  country_code,
  phone
)
values (
  '12000000-0000-4000-8000-000000000020',
  '12000000-0000-4000-8000-000000000010',
  'Close Vintage',
  'business',
  'DE',
  '+491701234567'
);
insert into public.catalog_products(id, workspace_id, title, tracking_mode)
values (
  '12000000-0000-4000-8000-000000000025',
  '12000000-0000-4000-8000-000000000010',
  'Paketposition',
  'quantity'
);
insert into public.purchases(
  id,
  workspace_id,
  type,
  title,
  supplier_id,
  receiving_status,
  purchase_price,
  pricing_mode
)
values (
  '12000000-0000-4000-8000-000000000030',
  '12000000-0000-4000-8000-000000000010',
  'lot',
  'Bekanntes Paket',
  '12000000-0000-4000-8000-000000000020',
  'draft',
  10,
  'total'
);
insert into public.purchase_lines(
  id,
  workspace_id,
  purchase_id,
  catalog_product_id,
  title_snapshot,
  line_kind,
  ordered_quantity,
  unit_purchase_price,
  line_total,
  price_mode
)
values
  (
    '12000000-0000-4000-8000-000000000031',
    '12000000-0000-4000-8000-000000000010',
    '12000000-0000-4000-8000-000000000030',
    '12000000-0000-4000-8000-000000000025',
    'Position A',
    'quantity',
    3,
    1.1133333333333333,
    3.34,
    'priced'
  ),
  (
    '12000000-0000-4000-8000-000000000032',
    '12000000-0000-4000-8000-000000000010',
    '12000000-0000-4000-8000-000000000030',
    '12000000-0000-4000-8000-000000000025',
    'Position B',
    'quantity',
    1,
    3.33,
    3.33,
    'priced'
  ),
  (
    '12000000-0000-4000-8000-000000000033',
    '12000000-0000-4000-8000-000000000010',
    '12000000-0000-4000-8000-000000000030',
    '12000000-0000-4000-8000-000000000025',
    'Position C',
    'quantity',
    1,
    3.33,
    3.33,
    'priced'
  );

select is(
  (select sum(line_total) from public.purchase_lines where purchase_id = '12000000-0000-4000-8000-000000000030'),
  10.00::numeric,
  'Paketanteile bleiben centgenau'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_purchase_with_position_prices(
    '12000000-0000-4000-8000-000000000010',
    jsonb_build_object(
      'request_id', '12000000-0000-4000-8000-000000000040',
      'source_id', null,
      'supplier_id', '12000000-0000-4000-8000-000000000020',
      'type', 'lot',
      'title', 'Neues Paket',
      'purchase_date', current_date,
      'purchase_price', 10,
      'discount_amount', 0,
      'content_status', 'known',
      'pricing_mode', 'individual',
      'cost_allocation_mode', 'even'
    ),
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'client_ref', 'new-a',
        'catalog_product_id', '12000000-0000-4000-8000-000000000025',
        'title_snapshot', 'Neue Position A',
        'line_kind', 'quantity',
        'ordered_quantity', 3,
        'price_mode', 'priced',
        'unit_purchase_price', 1.1133333333333333,
        'line_total', 3.34,
        'condition_snapshot', 'used',
        'estimated_market_value', null,
        'allocated_additional_cost', 0
      ),
      jsonb_build_object(
        'client_ref', 'new-b',
        'catalog_product_id', '12000000-0000-4000-8000-000000000025',
        'title_snapshot', 'Neue Position B',
        'line_kind', 'quantity',
        'ordered_quantity', 1,
        'price_mode', 'priced',
        'unit_purchase_price', 6.66,
        'line_total', 6.66,
        'condition_snapshot', 'used',
        'estimated_market_value', null,
        'allocated_additional_cost', 0
      )
    )
  )$$,
  'Ein neuer Paketpreis mit präzisem Stückdurchschnitt wird gespeichert'
);
select lives_ok(
  $$select public.update_purchase_draft_with_event(
    '12000000-0000-4000-8000-000000000010',
    '12000000-0000-4000-8000-000000000030',
    jsonb_build_object(
      'source_id', null,
      'supplier_id', '12000000-0000-4000-8000-000000000020',
      'type', 'lot',
      'title', 'Bekanntes Paket',
      'purchase_date', current_date,
      'purchase_price', 10,
      'discount_amount', 0,
      'content_status', 'known',
      'pricing_mode', 'individual',
      'supplier_reference', null,
      'cost_allocation_mode', 'even',
      'notes', null,
      'tracking_number', null,
      'tracking_carrier', null,
      'tracking_status', 'pending',
      'original_url', null
    ),
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'client_ref', '12000000-0000-4000-8000-000000000031',
        'catalog_product_id', '12000000-0000-4000-8000-000000000025',
        'title_snapshot', 'Position A',
        'line_kind', 'quantity',
        'ordered_quantity', 3,
        'price_mode', 'priced',
        'unit_purchase_price', 1.1133333333333333,
        'line_total', 3.34,
        'condition_snapshot', 'used',
        'estimated_market_value', null,
        'allocated_additional_cost', 0
      ),
      jsonb_build_object(
        'client_ref', '12000000-0000-4000-8000-000000000032',
        'catalog_product_id', '12000000-0000-4000-8000-000000000025',
        'title_snapshot', 'Position B',
        'line_kind', 'quantity',
        'ordered_quantity', 1,
        'price_mode', 'priced',
        'unit_purchase_price', 3.33,
        'line_total', 3.33,
        'condition_snapshot', 'used',
        'estimated_market_value', null,
        'allocated_additional_cost', 0
      ),
      jsonb_build_object(
        'client_ref', '12000000-0000-4000-8000-000000000033',
        'catalog_product_id', '12000000-0000-4000-8000-000000000025',
        'title_snapshot', 'Position C',
        'line_kind', 'quantity',
        'ordered_quantity', 1,
        'price_mode', 'priced',
        'unit_purchase_price', 3.33,
        'line_total', 3.33,
        'condition_snapshot', 'used',
        'estimated_market_value', null,
        'allocated_additional_cost', 0
      )
    )
  )$$,
  'Der Paketpreis bleibt beim Bearbeiten positionsgenau'
);
select lives_ok(
  $$select public.update_purchase_workflow('12000000-0000-4000-8000-000000000030', 'ordered')$$,
  'Bestellt benötigt kein Tracking'
);
select lives_ok(
  $$select public.update_purchase_workflow('12000000-0000-4000-8000-000000000030', 'arrived')$$,
  'Angekommen folgt direkt auf Bestellt'
);
select lives_ok(
  $$select public.update_purchase_tracking('12000000-0000-4000-8000-000000000030', '+123456789', 'dhl', 'pending')$$,
  'Tracking lässt sich freiwillig ergänzen'
);
reset role;

select is(
  (
    select sum(line.line_total)
    from public.purchase_lines as line
    join public.purchases as purchase on purchase.id = line.purchase_id
    where purchase.request_id = '12000000-0000-4000-8000-000000000040'
  ),
  10.00::numeric,
  'Auch neu angelegte Paketanteile bleiben centgenau'
);
select is(
  (
    select purchase.supplier_id
    from public.purchases as purchase
    where purchase.request_id = '12000000-0000-4000-8000-000000000040'
  ),
  '12000000-0000-4000-8000-000000000020'::uuid,
  'Der gewählte Verkäufer wird beim Anlegen gespeichert'
);
select is(
  (select count(*)::integer from public.business_events where entity_id = '12000000-0000-4000-8000-000000000030' and event_type = 'purchase_updated'),
  1,
  'Bearbeiten erzeugt genau ein Ereignis'
);
select is(
  (select count(*)::integer from public.business_events where entity_id = '12000000-0000-4000-8000-000000000030' and event_type = 'purchase_ordered'),
  1,
  'Bestellt erzeugt genau ein Ereignis'
);
select is(
  (select count(*)::integer from public.business_events where entity_id = '12000000-0000-4000-8000-000000000030' and event_type = 'purchase_arrived'),
  1,
  'Angekommen erzeugt genau ein Ereignis'
);
select is(
  (select count(*)::integer from public.business_events where entity_id = '12000000-0000-4000-8000-000000000030' and event_type = 'purchase_tracking_added'),
  1,
  'Tracking erzeugt genau ein Ereignis'
);
select isnt(
  (select arrived_at from public.purchases where id = '12000000-0000-4000-8000-000000000030'),
  null::timestamptz,
  'Ankunft erhält einen Zeitstempel'
);

select * from finish();
rollback;
