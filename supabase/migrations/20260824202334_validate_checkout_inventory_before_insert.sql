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

  select count(*) into v_inventory_count
  from public.inventory_items as inventory
  join jsonb_to_recordset(p_items) as item(inventory_item_id uuid)
    on item.inventory_item_id = inventory.id
  where inventory.workspace_id = p_workspace_id;

  if v_inventory_count <> v_item_count then
    raise no_data_found using message = 'Mindestens ein bestellter Artikel wurde nicht gefunden.';
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
    and inventory.workspace_id = p_workspace_id;
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