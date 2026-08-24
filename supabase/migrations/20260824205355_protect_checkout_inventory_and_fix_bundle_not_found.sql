-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.bundle_shipping_orders (
  p_workspace_id        uuid,
  p_order_ids           uuid[],
  p_order_number        text,
  p_order_date          date,
  p_platform            text,
  p_item_title          text,
  p_item_sku            text,
  p_item_condition      text,
  p_sale_price          numeric,
  p_customer            jsonb,
  p_carrier             text,
  p_package_type        text,
  p_bundled_item_titles text[],
  p_notes               text
)
  RETURNS public.shipping_orders
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_snapshot jsonb;
  v_bundled_order public.shipping_orders;
  v_found_count integer;
  v_non_null_sale_count integer;
  v_distinct_sale_count integer;
  v_sale_id uuid;
  v_sale_ids uuid[];
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if coalesce(cardinality(p_order_ids), 0) < 2
    or cardinality(p_order_ids) <> (select count(distinct id) from unnest(p_order_ids) as id) then
    raise exception using errcode = '22023', message = 'Ein Sammelpaket braucht mindestens zwei unterschiedliche Sendungen.';
  end if;

  with source_orders as (
    select *
    from public.shipping_orders
    where workspace_id = p_workspace_id
      and id = any(p_order_ids)
    for update
  )
  select
    count(*),
    coalesce(jsonb_agg(to_jsonb(source_orders)), '[]'::jsonb),
    count(sale_id),
    count(distinct sale_id),
    array_agg(sale_id)
  into v_found_count, v_snapshot, v_non_null_sale_count, v_distinct_sale_count, v_sale_ids
  from source_orders;

  if v_found_count <> cardinality(p_order_ids) then
    raise no_data_found using message = 'Mindestens eine Sendung wurde nicht gefunden.';
  end if;

  if v_non_null_sale_count <> v_found_count or v_distinct_sale_count <> 1 then
    v_sale_id := null;
  else
    v_sale_id := v_sale_ids[1];
  end if;

  insert into public.shipping_orders (
    workspace_id,
    sale_id,
    order_number,
    order_date,
    platform,
    item_title,
    item_sku,
    item_condition,
    sale_price,
    customer,
    carrier,
    package_type,
    status,
    notes,
    is_bundled,
    bundled_order_ids,
    bundled_item_titles,
    bundled_orders_snapshot
  )
  values (
    p_workspace_id,
    v_sale_id,
    p_order_number,
    p_order_date,
    p_platform,
    p_item_title,
    p_item_sku,
    p_item_condition,
    p_sale_price,
    p_customer,
    p_carrier,
    p_package_type,
    'ready_to_pack',
    p_notes,
    true,
    p_order_ids::text[],
    p_bundled_item_titles,
    v_snapshot
  )
  returning * into v_bundled_order;

  delete from public.shipping_orders
  where workspace_id = p_workspace_id
    and id = any(p_order_ids);

  return v_bundled_order;
end;
$function$;

CREATE OR REPLACE FUNCTION public.place_store_order (
  p_workspace_id   uuid,
  p_order_id       uuid,
  p_order_number   text,
  p_customer       jsonb,
  p_subtotal       numeric,
  p_shipping_cost  numeric,
  p_total          numeric,
  p_payment_method text,
  p_payment_status text,
  p_payment_id     text,
  p_status         text,
  p_sale_date      date,
  p_buyer_notes    text,
  p_items          jsonb
)
  RETURNS public.store_orders
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_order public.store_orders;
  v_item_count integer;
  v_inventory_count integer;
  v_sale_count integer;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_order_id is null
    or nullif(trim(p_order_number), '') is null
    or jsonb_typeof(p_customer) <> 'object'
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or p_subtotal < 0
    or p_shipping_cost < 0
    or p_total < 0 then
    raise exception using errcode = '22023', message = 'Die Bestelldaten sind ungültig.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or nullif(trim(item.value ->> 'item_title'), '') is null
      or coalesce((item.value ->> 'quantity')::integer, 0) < 1
      or coalesce((item.value ->> 'price')::numeric, -1) < 0
      or nullif(item.value ->> 'inventory_item_id', '') is null
  ) then
    raise exception using errcode = '22023', message = 'Mindestens eine Bestellposition ist ungültig.';
  end if;

  select * into v_order
  from public.store_orders
  where id = p_order_id
  for update;

  if found then
    if v_order.workspace_id <> p_workspace_id
      or v_order.order_number <> p_order_number then
      raise exception using errcode = '22023', message = 'Die Bestellkennung gehört zu einer anderen Bestellung.';
    end if;
    return v_order;
  end if;

  select count(*), count(distinct item.inventory_item_id)
  into v_item_count, v_inventory_count
  from jsonb_to_recordset(p_items) as item(
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  );

  if v_inventory_count <> v_item_count then
    raise exception using errcode = '22023', message = 'Jeder Artikel darf nur einmal in einer Bestellung vorkommen.';
  end if;

  perform inventory.id
  from public.inventory_items as inventory
  join jsonb_to_recordset(p_items) as item(inventory_item_id uuid)
    on item.inventory_item_id = inventory.id
  where inventory.workspace_id = p_workspace_id
  order by inventory.id
  for update of inventory;
  get diagnostics v_inventory_count = row_count;

  if v_inventory_count <> v_item_count then
    raise no_data_found using message = 'Mindestens ein bestellter Artikel wurde nicht gefunden.';
  end if;

  select count(*) into v_inventory_count
  from public.inventory_items as inventory
  join jsonb_to_recordset(p_items) as item(inventory_item_id uuid)
    on item.inventory_item_id = inventory.id
  where inventory.workspace_id = p_workspace_id
    and inventory.status in ('ready', 'listed');

  if v_inventory_count <> v_item_count then
    raise no_data_found using message = 'Mindestens ein bestellter Artikel ist nicht mehr verkaufbar.';
  end if;

  insert into public.store_orders (
    id,
    workspace_id,
    order_number,
    customer,
    subtotal,
    shipping_cost,
    total,
    payment_method,
    payment_status,
    payment_id,
    status
  )
  values (
    p_order_id,
    p_workspace_id,
    p_order_number,
    p_customer,
    p_subtotal,
    p_shipping_cost,
    p_total,
    p_payment_method,
    p_payment_status,
    p_payment_id,
    p_status
  )
  returning * into v_order;

  insert into public.store_order_items (
    store_order_id,
    inventory_item_id,
    item_title,
    price,
    quantity
  )
  select
    v_order.id,
    item.inventory_item_id,
    item.item_title,
    item.price,
    item.quantity
  from jsonb_to_recordset(p_items) as item(
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  );

  update public.inventory_items as inventory
  set status = 'sold', updated_at = now()
  from jsonb_to_recordset(p_items) as item(
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  )
  where inventory.id = item.inventory_item_id
    and inventory.workspace_id = p_workspace_id
    and inventory.status in ('ready', 'listed');
  get diagnostics v_inventory_count = row_count;

  if v_inventory_count <> v_item_count then
    raise no_data_found using message = 'Mindestens ein bestellter Artikel wurde nicht gefunden.';
  end if;

  insert into public.sales (
    workspace_id,
    inventory_item_id,
    platform,
    sale_price,
    sale_date,
    platform_fee,
    shipping_cost,
    packaging_cost,
    other_costs,
    external_order_id,
    buyer_notes
  )
  select
    p_workspace_id,
    item.inventory_item_id,
    'custom_store',
    item.price * item.quantity,
    p_sale_date,
    0,
    p_shipping_cost / v_item_count,
    0,
    coalesce(item.payment_fee, 0),
    p_order_number,
    p_buyer_notes
  from jsonb_to_recordset(p_items) as item(
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  )
  on conflict (workspace_id, external_order_id, inventory_item_id, platform)
    where external_order_id is not null
    do nothing;
  get diagnostics v_sale_count = row_count;

  if v_sale_count <> v_item_count then
    raise exception using errcode = '23505', message = 'Mindestens ein bestellter Artikel wurde bereits verkauft.';
  end if;

  return v_order;
end;
$function$;

CREATE OR REPLACE FUNCTION public.unbundle_shipping_order (
  p_workspace_id     uuid,
  p_bundled_order_id uuid
)
  RETURNS SETOF public.shipping_orders
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_snapshot jsonb;
  v_expected_ids text[];
  v_snapshot_ids text[];
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  select bundled_orders_snapshot, bundled_order_ids
  into v_snapshot, v_expected_ids
  from public.shipping_orders
  where id = p_bundled_order_id
    and workspace_id = p_workspace_id
    and is_bundled = true
  for update;

  if not found then
    raise no_data_found using message = 'Das Sammelpaket wurde nicht gefunden.';
  end if;

  if jsonb_typeof(v_snapshot) <> 'array' or jsonb_array_length(v_snapshot) = 0 then
    raise exception using errcode = '22023', message = 'Das Sammelpaket enthält keinen wiederherstellbaren Snapshot.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_snapshot) as snapshot(order_row)
    where jsonb_typeof(snapshot.order_row) <> 'object'
      or jsonb_typeof(snapshot.order_row -> 'id') <> 'string'
      or jsonb_typeof(snapshot.order_row -> 'workspace_id') <> 'string'
      or snapshot.order_row ->> 'workspace_id' <> p_workspace_id::text
      or not (snapshot.order_row ->> 'id' = any(v_expected_ids))
  ) then
    raise exception using errcode = '22023', message = 'Der Snapshot des Sammelpakets ist ungültig.';
  end if;

  select array_agg(snapshot.order_row ->> 'id' order by snapshot.order_row ->> 'id')
  into v_snapshot_ids
  from jsonb_array_elements(v_snapshot) as snapshot(order_row);

  if v_snapshot_ids is distinct from (
    select array_agg(expected_id order by expected_id)
    from unnest(v_expected_ids) as expected_id
  ) then
    raise exception using errcode = '22023', message = 'Der Snapshot passt nicht zu den gebündelten Sendungen.';
  end if;

  delete from public.shipping_orders
  where id = p_bundled_order_id
    and workspace_id = p_workspace_id;

  return query
  insert into public.shipping_orders
  select (jsonb_populate_record(null::public.shipping_orders, snapshot.order_row)).*
  from jsonb_array_elements(v_snapshot) as snapshot(order_row)
  returning *;
end;
$function$;