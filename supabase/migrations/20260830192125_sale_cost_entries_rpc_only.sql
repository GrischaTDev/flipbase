-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

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
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_order public.store_orders;
  v_inventory_item public.inventory_items;
  v_inventory_item_id uuid;
  v_sale_state text;
  v_item_count integer;
  v_reference_count integer;
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
      or num_nonnulls(
        nullif(item.value ->> 'catalog_product_id', ''),
        nullif(item.value ->> 'inventory_item_id', '')
      ) <> 1
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

  select count(*), count(distinct coalesce(
    'catalog_product:' || item.catalog_product_id::text,
    'inventory_item:' || item.inventory_item_id::text
  ))
  into v_item_count, v_reference_count
  from jsonb_to_recordset(p_items) as item(
    catalog_product_id uuid,
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  );

  if v_reference_count <> v_item_count then
    raise exception using errcode = '22023', message = 'Jeder Artikel darf nur einmal in einer Bestellung vorkommen.';
  end if;

  -- Lock in stable order so concurrent checkout requests cannot sell the same
  -- individual item and cannot deadlock when an order contains several items.
  for v_inventory_item_id in
    select distinct item.inventory_item_id
    from jsonb_to_recordset(p_items) as item(
      catalog_product_id uuid,
      inventory_item_id uuid,
      item_title text,
      quantity integer,
      price numeric,
      payment_fee numeric
    )
    where item.inventory_item_id is not null
    order by item.inventory_item_id
  loop
    select * into v_inventory_item
    from public.inventory_items
    where id = v_inventory_item_id
      and workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Der Einzelartikel wurde nicht gefunden.';
    end if;

    select sale_state into v_sale_state
    from public.inventory_item_sale_states
    where inventory_item_id = v_inventory_item.id
      and workspace_id = p_workspace_id;

    if v_inventory_item.status not in ('ready', 'listed')
      or v_sale_state is distinct from 'no_active_sale' then
      raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
    end if;
  end loop;

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
    catalog_product_id,
    item_title,
    price,
    quantity
  )
  select
    v_order.id,
    item.inventory_item_id,
    item.catalog_product_id,
    item.item_title,
    item.price,
    item.quantity
  from jsonb_to_recordset(p_items) as item(
    catalog_product_id uuid,
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  );

  perform public.record_sale(
    p_workspace_id,
    jsonb_build_object(
      'platform', 'custom_store',
      'sale_date', p_sale_date,
      'shipping_cost', p_shipping_cost,
      'cost_entries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'category', 'payment_fee',
          'amount', item.payment_fee
        ))
        from jsonb_to_recordset(p_items) as item(
          catalog_product_id uuid,
          inventory_item_id uuid,
          item_title text,
          quantity integer,
          price numeric,
          payment_fee numeric
        )
        where coalesce(item.payment_fee, 0) > 0
      ), '[]'::jsonb),
      'external_order_id', p_order_number,
      'buyer_notes', p_buyer_notes
    ),
    (
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'catalog_product_id', item.catalog_product_id,
        'inventory_item_id', item.inventory_item_id,
        'title_snapshot', item.item_title,
        'quantity', item.quantity,
        'unit_sale_price', item.price
      )))
      from jsonb_to_recordset(p_items) as item(
        catalog_product_id uuid,
        inventory_item_id uuid,
        item_title text,
        quantity integer,
        price numeric,
        payment_fee numeric
      )
    )
  );

  return v_order;
end;
$function$;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sale_cost_entries FROM anon;

REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.sale_cost_entries FROM authenticated;