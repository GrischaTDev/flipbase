-- Zweck: Vereinheitlicht Inventar- und Verkaufsintegrität mit einem prüfbaren
-- Legacy-Klärungsjournal, atomaren Buchungsfunktionen und unveränderlichen
-- Geschäftsbelegen.
-- Betroffen: inventory_items, inventory_reconciliation_events, sales,
-- sale_lines, returns, purchases, invoices, shipping_orders, store_orders,
-- zugehörige Funktionen, Trigger, Fremdschlüssel, RLS-Policies und Rechte.
-- Erzeugt aus supabase/schemas/database.sql; destruktive FK-/Policy-Schritte
-- werden in derselben Transaktion durch restriktive Definitionen ersetzt oder
-- entfernen bewusst direkte Client-Mutationen.

SET check_function_bodies = false;

ALTER TABLE public.inventory_items
  DROP CONSTRAINT inventory_items_purchase_id_fkey;

ALTER TABLE public.invoice_items
  DROP CONSTRAINT invoice_items_invoice_id_fkey;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_purchase_id_fkey;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_workspace_purchase_fkey;

ALTER TABLE public.returns
  DROP CONSTRAINT returns_inventory_item_id_fkey;

ALTER TABLE public.returns
  DROP CONSTRAINT returns_sale_id_fkey;

ALTER TABLE public.sale_lines
  DROP CONSTRAINT sale_lines_sale_id_fkey;

ALTER TABLE public.sale_lines
  DROP CONSTRAINT sale_lines_workspace_sale_fkey;

ALTER TABLE public.sales
  DROP CONSTRAINT sales_inventory_item_id_fkey;

ALTER TABLE public.shipping_orders
  DROP CONSTRAINT shipping_orders_sale_id_fkey;

ALTER TABLE public.store_order_items
  DROP CONSTRAINT store_order_items_catalog_product_id_fkey;

ALTER TABLE public.store_order_items
  DROP CONSTRAINT store_order_items_inventory_item_id_fkey;

ALTER TABLE public.store_order_items
  DROP CONSTRAINT store_order_items_store_order_id_fkey;

DROP POLICY invoice_items_delete ON public.invoice_items;

DROP POLICY invoices_delete ON public.invoices;

DROP POLICY returns_delete ON public.returns;

DROP POLICY returns_insert ON public.returns;

DROP POLICY returns_update ON public.returns;

DROP POLICY "Verkauf aendern" ON public.sales;

DROP POLICY "Verkauf anlegen" ON public.sales;

DROP POLICY "Verkauf loeschen" ON public.sales;

DROP POLICY store_order_items_delete ON public.store_order_items;

DROP POLICY store_orders_delete ON public.store_orders;

CREATE FUNCTION public.check_inventory_item_sale_integrity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform public.validate_inventory_item_sale_integrity(new.id);
  return new;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_inventory_item_sale_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.check_sale_inventory_integrity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_inventory_item_id uuid;
  v_old_sale_id uuid;
  v_new_sale_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_sale_id := old.id;
    perform public.validate_inventory_item_sale_integrity(old.inventory_item_id);
  end if;
  if tg_op <> 'DELETE' then
    v_new_sale_id := new.id;
    if tg_op = 'INSERT' or new.inventory_item_id is distinct from old.inventory_item_id then
      perform public.validate_inventory_item_sale_integrity(new.inventory_item_id);
    end if;
  end if;

  for v_inventory_item_id in
    select distinct sale_line.inventory_item_id
    from public.sale_lines as sale_line
    where sale_line.inventory_item_id is not null
      and sale_line.sale_id in (v_old_sale_id, v_new_sale_id)
  loop
    perform public.validate_inventory_item_sale_integrity(v_inventory_item_id);
  end loop;

  return coalesce(new, old);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_sale_inventory_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.check_sale_line_inventory_integrity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op <> 'INSERT' then
    perform public.validate_inventory_item_sale_integrity(old.inventory_item_id);
  end if;
  if tg_op <> 'DELETE'
    and (tg_op = 'INSERT' or new.inventory_item_id is distinct from old.inventory_item_id) then
    perform public.validate_inventory_item_sale_integrity(new.inventory_item_id);
  end if;
  return coalesce(new, old);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_sale_line_inventory_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

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
      'other_costs', coalesce((
        select sum(coalesce((item.value ->> 'payment_fee')::numeric, 0))
        from jsonb_array_elements(p_items) as item(value)
      ), 0),
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

CREATE FUNCTION public.prevent_inventory_reconciliation_event_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  raise exception using
    errcode = '42501',
    message = 'Inventarklaerungsereignisse sind unveraenderlich.';
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.prevent_inventory_reconciliation_event_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.prevent_workspace_with_business_data_deletion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if exists (select 1 from public.purchases where workspace_id = old.id)
    or exists (select 1 from public.inventory_items where workspace_id = old.id)
    or exists (select 1 from public.sales where workspace_id = old.id)
    or exists (select 1 from public.inventory_reconciliation_events where workspace_id = old.id)
    or exists (select 1 from public.activity_logs where workspace_id = old.id)
    or exists (select 1 from public.returns where workspace_id = old.id)
    or exists (select 1 from public.invoices where workspace_id = old.id)
    or exists (select 1 from public.email_confirmations where workspace_id = old.id)
    or exists (select 1 from public.shipping_orders where workspace_id = old.id)
    or exists (select 1 from public.store_orders where workspace_id = old.id)
    or exists (select 1 from public.bank_transactions where workspace_id = old.id)
    or exists (select 1 from public.offline_purchase_entries where workspace_id = old.id)
    or exists (select 1 from public.cash_wallet_sessions where workspace_id = old.id) then
    raise exception using
      errcode = 'P0001',
      message = 'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.';
  end if;

  return old;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.prevent_workspace_with_business_data_deletion()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.protect_inventory_item_sold_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if (
      (tg_op = 'INSERT' and new.status = 'sold')
      or (tg_op = 'UPDATE' and old.status is distinct from new.status
        and (old.status = 'sold' or new.status = 'sold'))
    ) and not (
      current_user = 'postgres'
      and coalesce(current_setting('flipbase.allow_inventory_sold_transition', true), '') = 'on'
    ) then
    raise exception using
      errcode = '42501',
      message = 'Der Verkaufsstatus darf nur ueber eine gepruefte Buchungsfunktion geaendert werden.';
  end if;

  return new;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.protect_inventory_item_sold_status()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_legacy_inventory_sale (
  p_workspace_id      uuid,
  p_inventory_item_id uuid,
  p_sale              jsonb,
  p_reason            text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_inventory_item public.inventory_items;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_event public.inventory_reconciliation_events;
  v_sale_state text;
  v_unit_sale_price numeric(12, 2);
  v_workspace_tax_mode text;
begin
  if v_actor_id is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Ein dokumentierter Klaerungsgrund ist erforderlich.';
  end if;

  if jsonb_typeof(p_sale) <> 'object'
    or nullif(trim(p_sale ->> 'platform'), '') is null
    or (p_sale ->> 'sale_date') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_sale -> 'unit_sale_price') <> 'number'
    or (p_sale ->> 'unit_sale_price')::numeric <= 0 then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungueltig.';
  end if;

  select *
  into v_inventory_item
  from public.inventory_items
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Der Inventarartikel wurde nicht gefunden.';
  end if;

  select sale_state
  into v_sale_state
  from public.inventory_item_sale_states
  where inventory_item_id = p_inventory_item_id
    and workspace_id = p_workspace_id;

  if v_sale_state <> 'legacy_sold_unverified' then
    raise exception using errcode = '22023', message = 'Legacy-Verkaufsnachtrag ist nur fuer ungepruefte sold-Altdaten zulaessig.';
  end if;

  select tax_mode into v_workspace_tax_mode
  from public.workspaces
  where id = p_workspace_id;
  v_unit_sale_price := (p_sale ->> 'unit_sale_price')::numeric(12, 2);

  insert into public.sales (
    workspace_id, inventory_item_id, platform, sale_price, sale_price_total, sale_date,
    platform_fee, shipping_cost, packaging_cost, other_costs,
    external_order_id, external_listing_id, buyer_notes
  ) values (
    p_workspace_id, null, trim(p_sale ->> 'platform'),
    v_unit_sale_price, v_unit_sale_price, (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    coalesce((p_sale ->> 'packaging_cost')::numeric, 0),
    coalesce((p_sale ->> 'other_costs')::numeric, 0),
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), '')
  ) returning * into v_sale;

  insert into public.sale_lines (
    workspace_id, sale_id, inventory_item_id, title_snapshot, quantity,
    unit_sale_price, line_total, cost_of_goods_sold, tax_mode
  ) values (
    p_workspace_id, v_sale.id, p_inventory_item_id,
    coalesce(nullif(trim(p_sale ->> 'title_snapshot'), ''), v_inventory_item.title),
    1, v_unit_sale_price, v_unit_sale_price,
    v_inventory_item.allocated_purchase_cost, v_workspace_tax_mode
  ) returning * into v_sale_line;

  update public.sales
  set inventory_item_id = p_inventory_item_id
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.inventory_reconciliation_events (
    workspace_id, inventory_item_id, actor_id, event_type,
    previous_status, new_status, reason
  ) values (
    p_workspace_id, p_inventory_item_id, v_actor_id, 'record_legacy_sale',
    'sold', 'sold', trim(p_reason)
  ) returning * into v_event;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'sale_lines', jsonb_build_array(to_jsonb(v_sale_line)),
    'lot_allocations', '[]'::jsonb,
    'stock_movements', '[]'::jsonb,
    'event', to_jsonb(v_event)
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_legacy_inventory_sale(uuid, uuid, jsonb, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.record_legacy_inventory_sale(uuid, uuid, jsonb, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.record_sale_return (
  p_workspace_id   uuid,
  p_sale_id        uuid,
  p_refund_amount  numeric,
  p_restock        boolean,
  p_reason         text,
  p_notes          text,
  p_restock_action text,
  p_buyer_name     text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_allocation public.sale_line_lot_allocations;
  v_stock_lot public.stock_lots;
  v_inventory_item public.inventory_items;
  v_return_movement_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_movement_id uuid;
  v_return public.returns;
  v_return_inventory_item_id uuid;
  v_restocked_quantity integer := 0;
  v_sale_total numeric;
  v_total_refund numeric;
  v_is_full_refund boolean;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_sale_id is null
    or p_refund_amount is null
    or p_refund_amount < 0
    or p_restock is null
    or nullif(trim(p_reason), '') is null
    or p_restock_action is null
    or p_restock_action not in ('restock_ready', 'restock_repair', 'write_off', 'keep_with_buyer') then
    raise exception using errcode = '22023', message = 'Die Retourendaten sind ungültig.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Verkauf wurde nicht gefunden.';
  end if;

  if v_sale.returned_at is not null then
    raise exception using errcode = '22023', message = 'Der Verkauf wurde bereits retourniert.';
  end if;

  if v_sale.voided_at is not null
    or v_sale.voided_by is not null
    or v_sale.void_reason is not null then
    raise exception using errcode = '22023', message = 'Ein aufgehobener Verkauf kann nicht retourniert werden.';
  end if;

  v_sale_total := coalesce(v_sale.sale_price_total, v_sale.sale_price, 0);
  v_total_refund := least(v_sale_total, coalesce(v_sale.refund_amount, 0) + p_refund_amount);
  v_is_full_refund := v_total_refund >= v_sale_total;

  if v_is_full_refund then
    select sale_line.inventory_item_id into v_return_inventory_item_id
  from public.sale_lines as sale_line
  where sale_line.workspace_id = p_workspace_id
    and sale_line.sale_id = p_sale_id
    and sale_line.inventory_item_id is not null
  order by sale_line.id
  limit 1;

    for v_sale_line in
      select *
      from public.sale_lines
      where workspace_id = p_workspace_id
        and sale_id = p_sale_id
    loop
    if v_sale_line.catalog_product_id is not null then
      for v_allocation in
        select *
        from public.sale_line_lot_allocations
        where workspace_id = p_workspace_id
          and sale_line_id = v_sale_line.id
      loop
        select * into v_stock_lot
        from public.stock_lots
        where id = v_allocation.stock_lot_id
          and workspace_id = p_workspace_id
        for update;

        if not found then
          raise exception using errcode = 'P0002', message = 'Das zugeordnete Bestandslos wurde nicht gefunden.';
        end if;

        if p_restock then
          update public.stock_lots
          set remaining_quantity = remaining_quantity + v_allocation.quantity
          where id = v_stock_lot.id
            and workspace_id = p_workspace_id;
          v_restocked_quantity := v_restocked_quantity + v_allocation.quantity;
        end if;

        insert into public.stock_movements (
          workspace_id,
          stock_lot_id,
          sale_line_id,
          direction,
          quantity,
          reason
        ) values (
          p_workspace_id,
          v_stock_lot.id,
          v_sale_line.id,
          'in',
          v_allocation.quantity,
          'return'
        )
        returning id into v_movement_id;

        v_return_movement_ids := array_append(v_return_movement_ids, v_movement_id);
        v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);

        if not p_restock then
          insert into public.stock_movements (
            workspace_id,
            stock_lot_id,
            sale_line_id,
            direction,
            quantity,
            reason
          ) values (
            p_workspace_id,
            v_stock_lot.id,
            v_sale_line.id,
            'out',
            v_allocation.quantity,
            'damage'
          )
          returning id into v_movement_id;

          v_return_movement_ids := array_append(v_return_movement_ids, v_movement_id);
        end if;
      end loop;
    else
      select * into v_inventory_item
      from public.inventory_items
      where id = v_sale_line.inventory_item_id
        and workspace_id = p_workspace_id
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'Der retournierte Einzelartikel wurde nicht gefunden.';
      end if;

      perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

      update public.inventory_items
      set status = case when p_restock then 'ready' else 'returned' end,
          updated_at = now()
      where id = v_inventory_item.id
        and workspace_id = p_workspace_id;
      if p_restock then
        v_restocked_quantity := v_restocked_quantity + 1;
      end if;
    end if;
    end loop;
  end if;

  update public.sales
  set returned_at = case when v_is_full_refund then now() else null end,
      refund_amount = v_total_refund
  where id = p_sale_id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.returns (
    workspace_id,
    sale_id,
    inventory_item_id,
    credit_note_number,
    return_date,
    reason,
    refund_amount,
    is_full_refund,
    restock_action,
    buyer_name,
    notes
  ) values (
    p_workspace_id,
    p_sale_id,
    v_return_inventory_item_id,
    'GS-' || to_char(current_date, 'YYYY') || '-' || upper(substr(gen_random_uuid()::text, 1, 8)),
    current_date,
    p_reason,
    p_refund_amount,
    v_is_full_refund,
    p_restock_action,
    nullif(trim(p_buyer_name), ''),
    nullif(trim(p_notes), '')
  )
  returning * into v_return;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'return', to_jsonb(v_return),
    'sale_lines', coalesce((
      select jsonb_agg(to_jsonb(sale_line) order by sale_line.id)
      from public.sale_lines as sale_line
      where sale_line.workspace_id = p_workspace_id
        and sale_line.sale_id = p_sale_id
    ), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(movement) order by movement.id)
      from public.stock_movements as movement
      where movement.id = any(v_return_movement_ids)
    ), '[]'::jsonb),
    'lot_allocations', coalesce((
      select jsonb_agg(to_jsonb(allocation) order by allocation.id)
      from public.sale_line_lot_allocations as allocation
      join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
      where sale_line.workspace_id = p_workspace_id
        and sale_line.sale_id = p_sale_id
    ), '[]'::jsonb),
    'stock_quantities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stock_lot_id', stock_lot.id,
        'remaining_quantity', stock_lot.remaining_quantity
      ) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb),
    'reason', p_reason,
    'notes', p_notes,
    'restocked', p_restock,
    'restocked_quantity', v_restocked_quantity
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_sale (
  p_workspace_id uuid,
  p_sale         jsonb,
  p_lines        jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_input_line jsonb;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_stock_lot public.stock_lots;
  v_catalog_product public.catalog_products;
  v_inventory_item public.inventory_items;
  v_workspace public.workspaces;
  v_catalog_product_id uuid;
  v_inventory_item_id uuid;
  v_header_inventory_item_id uuid;
  v_quantity integer;
  v_unit_sale_price numeric(12, 2);
  v_line_total numeric(12, 2);
  v_line_cogs numeric(12, 2);
  v_remaining_quantity integer;
  v_allocated_quantity integer;
  v_allocation_cost numeric(12,2);
  v_previously_allocated_cost numeric(12,2);
  v_sale_total numeric(12, 2) := 0;
  v_sale_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_sale_state text;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_sale) <> 'object'
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0
    or nullif(trim(p_sale ->> 'platform'), '') is null
    or (p_sale ->> 'sale_date') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungültig.';
  end if;

  select * into v_workspace
  from public.workspaces
  where id = p_workspace_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Workspace wurde nicht gefunden.';
  end if;

  -- Validate every line before taking locks or writing the sale header.
  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(trim(v_input_line ->> 'catalog_product_id'), ''),
        nullif(trim(v_input_line ->> 'inventory_item_id'), '')
      ) <> 1
      or (
        nullif(trim(v_input_line ->> 'catalog_product_id'), '') is not null
        and jsonb_typeof(v_input_line -> 'catalog_product_id') <> 'string'
      )
      or (
        nullif(trim(v_input_line ->> 'inventory_item_id'), '') is not null
        and jsonb_typeof(v_input_line -> 'inventory_item_id') <> 'string'
      ) then
      raise exception using errcode = '22023', message = 'Eine Verkaufsposition ist ungültig.';
    end if;
  end loop;

  -- Resolve unique UUIDs first and lock them in one stable order. This avoids
  -- client-controlled lock ordering for multi-item sales.
  for v_inventory_item_id in
    select candidate.inventory_item_id
    from (
      select distinct (element.value ->> 'inventory_item_id')::uuid as inventory_item_id
      from jsonb_array_elements(p_lines) as element(value)
      where nullif(trim(element.value ->> 'inventory_item_id'), '') is not null
    ) as candidate
    order by candidate.inventory_item_id
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

  if jsonb_array_length(p_lines) = 1
    and jsonb_typeof(p_lines -> 0 -> 'inventory_item_id') = 'string' then
    v_header_inventory_item_id := (p_lines -> 0 ->> 'inventory_item_id')::uuid;
  end if;

  insert into public.sales (
    workspace_id,
    inventory_item_id,
    platform,
    sale_price,
    sale_price_total,
    sale_date,
    platform_fee,
    shipping_cost,
    packaging_cost,
    other_costs,
    external_order_id,
    external_listing_id,
    buyer_notes
  ) values (
    p_workspace_id,
    v_header_inventory_item_id,
    trim(p_sale ->> 'platform'),
    0,
    0,
    (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    coalesce((p_sale ->> 'packaging_cost')::numeric, 0),
    coalesce((p_sale ->> 'other_costs')::numeric, 0),
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), '')
  )
  returning * into v_sale;

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(v_input_line ->> 'catalog_product_id', ''),
        nullif(v_input_line ->> 'inventory_item_id', '')
      ) <> 1 then
      raise exception using errcode = '22023', message = 'Eine Verkaufsposition ist ungültig.';
    end if;

    v_catalog_product_id := nullif(v_input_line ->> 'catalog_product_id', '')::uuid;
    v_inventory_item_id := nullif(v_input_line ->> 'inventory_item_id', '')::uuid;
    v_quantity := (v_input_line ->> 'quantity')::integer;
    v_unit_sale_price := (v_input_line ->> 'unit_sale_price')::numeric(12, 2);
    v_line_total := v_quantity * v_unit_sale_price;
    v_line_cogs := 0;

    if v_catalog_product_id is not null then
      select * into v_catalog_product
      from public.catalog_products
      where id = v_catalog_product_id
        and workspace_id = p_workspace_id;

      if not found or v_catalog_product.tracking_mode <> 'quantity' then
        raise exception using errcode = '22023', message = 'Der Mengenartikel ist ungültig.';
      end if;

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        catalog_product_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
        tax_mode
      ) values (
        p_workspace_id,
        v_sale.id,
        v_catalog_product.id,
        coalesce(nullif(trim(v_input_line ->> 'title_snapshot'), ''), v_catalog_product.title),
        v_quantity,
        v_unit_sale_price,
        v_line_total,
        0,
        v_workspace.tax_mode
      )
      returning * into v_sale_line;

      v_remaining_quantity := v_quantity;
      for v_stock_lot in
        select *
        from public.stock_lots
        where workspace_id = p_workspace_id
          and catalog_product_id = v_catalog_product.id
          and remaining_quantity > 0
        order by received_at, id
        for update
      loop
        exit when v_remaining_quantity = 0;

        v_allocated_quantity := least(v_remaining_quantity, v_stock_lot.remaining_quantity);

        select coalesce(sum(allocation.allocated_cost), 0)
        into v_previously_allocated_cost
        from public.sale_line_lot_allocations as allocation
        where allocation.stock_lot_id = v_stock_lot.id;

        v_allocation_cost := case
          when v_allocated_quantity = v_stock_lot.remaining_quantity then
            round(v_stock_lot.unit_cost * v_stock_lot.received_quantity, 2)
              - v_previously_allocated_cost
          else round(v_allocated_quantity * v_stock_lot.unit_cost, 2)
        end;

        update public.stock_lots
        set remaining_quantity = remaining_quantity - v_allocated_quantity
        where id = v_stock_lot.id
          and workspace_id = p_workspace_id;

        insert into public.sale_line_lot_allocations (
          workspace_id,
          sale_line_id,
          stock_lot_id,
          quantity,
          unit_cost,
          allocated_cost
        ) values (
          p_workspace_id,
          v_sale_line.id,
          v_stock_lot.id,
          v_allocated_quantity,
          v_stock_lot.unit_cost,
          v_allocation_cost
        );

        insert into public.stock_movements (
          workspace_id,
          stock_lot_id,
          sale_line_id,
          direction,
          quantity,
          reason
        ) values (
          p_workspace_id,
          v_stock_lot.id,
          v_sale_line.id,
          'out',
          v_allocated_quantity,
          'sale'
        );

        v_line_cogs := v_line_cogs + v_allocation_cost;
        v_remaining_quantity := v_remaining_quantity - v_allocated_quantity;
        v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);
      end loop;

      if v_remaining_quantity <> 0 then
        raise exception using errcode = 'P0001', message = 'Nicht genügend verfügbarer Bestand';
      end if;

      update public.sale_lines
      set cost_of_goods_sold = v_line_cogs
      where id = v_sale_line.id
        and workspace_id = p_workspace_id
      returning * into v_sale_line;
    else
      if v_quantity <> 1 then
        raise exception using errcode = '22023', message = 'Einzelartikel können nur einmal verkauft werden.';
      end if;

      select * into v_inventory_item
      from public.inventory_items
      where id = v_inventory_item_id
        and workspace_id = p_workspace_id
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'Der Einzelartikel wurde nicht gefunden.';
      end if;

      if v_inventory_item.status not in ('ready', 'listed')
        or exists (
          select 1
          from public.sales as existing_sale
          left join public.sale_lines as existing_line
            on existing_line.workspace_id = existing_sale.workspace_id
           and existing_line.sale_id = existing_sale.id
          where existing_sale.workspace_id = p_workspace_id
            and existing_sale.id <> v_sale.id
            and existing_sale.returned_at is null
            and existing_sale.voided_at is null
            and (
              existing_sale.inventory_item_id = v_inventory_item.id
              or existing_line.inventory_item_id = v_inventory_item.id
            )
        ) then
        raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
      end if;

      perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

      update public.inventory_items
      set status = 'sold',
          updated_at = now()
      where id = v_inventory_item.id
        and workspace_id = p_workspace_id;

      v_line_cogs := v_inventory_item.allocated_purchase_cost;

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        inventory_item_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
        tax_mode
      ) values (
        p_workspace_id,
        v_sale.id,
        v_inventory_item.id,
        coalesce(nullif(trim(v_input_line ->> 'title_snapshot'), ''), v_inventory_item.title),
        1,
        v_unit_sale_price,
        v_line_total,
        v_line_cogs,
        v_workspace.tax_mode
      )
      returning * into v_sale_line;
    end if;

    v_sale_total := v_sale_total + v_line_total;
    v_sale_line_ids := array_append(v_sale_line_ids, v_sale_line.id);
  end loop;

  update public.sales
  set sale_price = v_sale_total,
      sale_price_total = v_sale_total
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'sale_lines', coalesce((
      select jsonb_agg(to_jsonb(sale_line) order by sale_line.id)
      from public.sale_lines as sale_line
      where sale_line.id = any(v_sale_line_ids)
    ), '[]'::jsonb),
    'lot_allocations', coalesce((
      select jsonb_agg(to_jsonb(allocation) order by allocation.id)
      from public.sale_line_lot_allocations as allocation
      where allocation.sale_line_id = any(v_sale_line_ids)
    ), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(movement) order by movement.id)
      from public.stock_movements as movement
      where movement.sale_line_id = any(v_sale_line_ids)
        and movement.reason = 'sale'
    ), '[]'::jsonb),
    'stock_quantities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stock_lot_id', stock_lot.id,
        'remaining_quantity', stock_lot.remaining_quantity
      ) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb)
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_sale(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.record_sale_return(uuid, uuid, numeric, boolean, text, text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_sale(uuid, jsonb, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sale_return(uuid, uuid, numeric, boolean, text, text, text, text)
  TO authenticated;

CREATE FUNCTION public.resolve_legacy_sold_item (
  p_workspace_id      uuid,
  p_inventory_item_id uuid,
  p_action            text,
  p_reason            text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_inventory_item public.inventory_items;
  v_event public.inventory_reconciliation_events;
  v_sale_state text;
begin
  if v_actor_id is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_action <> 'restore_stock'
    or nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Aktion und Begruendung sind erforderlich.';
  end if;

  select *
  into v_inventory_item
  from public.inventory_items
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Der Inventarartikel wurde nicht gefunden.';
  end if;

  select sale_state
  into v_sale_state
  from public.inventory_item_sale_states
  where inventory_item_id = p_inventory_item_id
    and workspace_id = p_workspace_id;

  if v_sale_state = 'legacy_sale_header_without_line' then
    raise exception using errcode = '22023', message = 'Korrektur erforderlich: Der Verkaufskopf besitzt keine passende Position.';
  end if;

  if v_sale_state <> 'legacy_sold_unverified' then
    raise exception using errcode = '22023', message = 'Nur ungepruefter verkaufter Altbestand kann zurueckgesetzt werden.';
  end if;

  perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

  update public.inventory_items
  set status = 'ready', updated_at = now()
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  returning * into v_inventory_item;

  insert into public.inventory_reconciliation_events (
    workspace_id, inventory_item_id, actor_id, event_type,
    previous_status, new_status, reason
  ) values (
    p_workspace_id, p_inventory_item_id, v_actor_id, 'restore_stock',
    'sold', 'ready', trim(p_reason)
  )
  returning * into v_event;

  return jsonb_build_object(
    'inventory_item', to_jsonb(v_inventory_item),
    'event', to_jsonb(v_event)
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_legacy_sold_item(uuid, uuid, text, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.resolve_legacy_sold_item(uuid, uuid, text, text)
  TO authenticated;

CREATE FUNCTION public.validate_inventory_item_sale_integrity (
  p_inventory_item_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_status text;
  v_active_line_sale_count bigint;
  v_active_legacy_header_count bigint;
begin
  if p_inventory_item_id is null then
    return;
  end if;

  select inventory_item.status
  into v_status
  from public.inventory_items as inventory_item
  where inventory_item.id = p_inventory_item_id
  for update;

  if not found then
    return;
  end if;

  select count(distinct sale.id)
  into v_active_line_sale_count
  from public.sale_lines as sale_line
  join public.sales as sale
    on sale.id = sale_line.sale_id
   and sale.workspace_id = sale_line.workspace_id
  where sale_line.inventory_item_id = p_inventory_item_id
    and sale.returned_at is null
    and sale.voided_at is null;

  select count(*)
  into v_active_legacy_header_count
  from public.sales as sale
  where sale.inventory_item_id = p_inventory_item_id
    and sale.returned_at is null
    and sale.voided_at is null
    and not exists (
      select 1
      from public.sale_lines as sale_line
      where sale_line.workspace_id = sale.workspace_id
        and sale_line.sale_id = sale.id
        and sale_line.inventory_item_id = p_inventory_item_id
    );

  if v_active_legacy_header_count > 0 then
    raise exception using
      errcode = '23514',
      message = 'Ein bestandswirksamer Verkaufskopf benoetigt eine passende Verkaufsposition.';
  end if;

  if v_active_line_sale_count > 1 then
    raise exception using
      errcode = '23514',
      message = 'Ein Einzelstueck darf nur einen bestandswirksamen Verkauf haben.';
  end if;

  if (v_status = 'sold' and v_active_line_sale_count <> 1)
    or (v_status <> 'sold' and v_active_line_sale_count <> 0) then
    raise exception using
      errcode = '23514',
      message = 'Inventarstatus und bestandswirksame Verkaufsposition stimmen nicht ueberein.';
  end if;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_inventory_item_sale_integrity(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE RESTRICT;

CREATE CONSTRAINT TRIGGER inventory_item_sale_integrity_on_insert
  AFTER INSERT ON public.inventory_items DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_inventory_item_sale_integrity();

CREATE CONSTRAINT TRIGGER inventory_item_sale_integrity_on_status
  AFTER UPDATE OF status ON public.inventory_items DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_inventory_item_sale_integrity();

CREATE TRIGGER protect_inventory_item_sold_status
  BEFORE INSERT OR UPDATE OF status ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_inventory_item_sold_status();

CREATE TABLE public.inventory_reconciliation_events (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id      uuid                     NOT NULL,
  inventory_item_id uuid                     NOT NULL,
  actor_id          uuid                     NOT NULL,
  event_type        text                     NOT NULL,
  previous_status   text                     NOT NULL,
  new_status        text                     NOT NULL,
  reason            text                     NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.inventory_reconciliation_events IS 'Unveraenderliches Journal fuer ausdrueckliche Klaerungen historischer Inventarzustaende.';

ALTER TABLE public.inventory_reconciliation_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_reconciliation_events
  ADD CONSTRAINT inventory_reconciliation_even_workspace_id_inventory_item__fkey FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES public.inventory_items(workspace_id, id)
    ON DELETE RESTRICT;

ALTER TABLE public.inventory_reconciliation_events
  ADD CONSTRAINT inventory_reconciliation_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_reconciliation_events
  ADD CONSTRAINT inventory_reconciliation_events_event_type_check CHECK (event_type = ANY (ARRAY['restore_stock'::text, 'record_legacy_sale'::text]));

ALTER TABLE public.inventory_reconciliation_events
  ADD CONSTRAINT inventory_reconciliation_events_pkey PRIMARY KEY (id);

ALTER TABLE public.inventory_reconciliation_events
  ADD CONSTRAINT inventory_reconciliation_events_reason_check CHECK (NULLIF(TRIM(BOTH FROM reason), ''::text) IS NOT NULL);

ALTER TABLE public.inventory_reconciliation_events
  ADD CONSTRAINT inventory_reconciliation_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT;

REVOKE ALL ON public.inventory_reconciliation_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.inventory_reconciliation_events TO authenticated;

GRANT ALL ON public.inventory_reconciliation_events TO service_role;

CREATE INDEX inventory_reconciliation_events_inventory_item_id_idx ON public.inventory_reconciliation_events (inventory_item_id);

CREATE INDEX inventory_reconciliation_events_workspace_id_idx ON public.inventory_reconciliation_events (workspace_id);

CREATE TRIGGER prevent_inventory_reconciliation_event_mutation
  BEFORE DELETE OR UPDATE ON public.inventory_reconciliation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_inventory_reconciliation_event_mutation();

CREATE POLICY "Inventarklaerungen lesen" ON public.inventory_reconciliation_events
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT;

REVOKE DELETE ON public.invoice_items FROM authenticated;

REVOKE DELETE ON public.invoices FROM authenticated;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_workspace_purchase_fkey FOREIGN KEY (workspace_id, purchase_id) REFERENCES public.purchases(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.returns
  ADD CONSTRAINT returns_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT;

ALTER TABLE public.returns
  ADD CONSTRAINT returns_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;

REVOKE DELETE, INSERT, UPDATE ON public.returns FROM authenticated;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_workspace_sale_fkey FOREIGN KEY (workspace_id, sale_id) REFERENCES public.sales(workspace_id, id) ON DELETE RESTRICT;

CREATE CONSTRAINT TRIGGER inventory_item_sale_integrity_on_sale_line
  AFTER INSERT OR DELETE OR UPDATE ON public.sale_lines DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_sale_line_inventory_integrity();

ALTER TABLE public.sales
  ADD CONSTRAINT sales_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT;

ALTER TABLE public.sales
  ADD COLUMN voided_at timestamp with time zone;

ALTER TABLE public.sales
  ADD COLUMN voided_by uuid;

ALTER TABLE public.sales
  ADD COLUMN void_reason text;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_void_reason_when_voided CHECK (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL OR voided_at IS NOT NULL AND voided_by IS
    NOT NULL AND NULLIF(TRIM(BOTH FROM void_reason), ''::text) IS NOT NULL);

REVOKE DELETE, INSERT, UPDATE ON public.sales FROM authenticated;

CREATE CONSTRAINT TRIGGER inventory_item_sale_integrity_on_sale
  AFTER INSERT OR DELETE OR UPDATE OF workspace_id, inventory_item_id, returned_at, voided_at ON public.sales DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_sale_inventory_integrity();

ALTER TABLE public.shipping_orders
  ADD CONSTRAINT shipping_orders_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;

ALTER TABLE public.store_order_items
  ADD CONSTRAINT store_order_items_catalog_product_id_fkey FOREIGN KEY (catalog_product_id) REFERENCES public.catalog_products(id) ON DELETE RESTRICT;

ALTER TABLE public.store_order_items
  ADD CONSTRAINT store_order_items_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT;

ALTER TABLE public.store_order_items
  ADD CONSTRAINT store_order_items_store_order_id_fkey FOREIGN KEY (store_order_id) REFERENCES public.store_orders(id) ON DELETE RESTRICT;

REVOKE DELETE ON public.store_order_items FROM authenticated;

REVOKE DELETE ON public.store_orders FROM authenticated;

CREATE TRIGGER prevent_workspace_with_business_data_deletion
  BEFORE DELETE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_workspace_with_business_data_deletion();

CREATE VIEW public.inventory_item_sale_states WITH (security_invoker=true) AS WITH active_line_sales AS (
         SELECT sale_line.workspace_id,
            sale_line.inventory_item_id,
            sale.id AS sale_id
           FROM (public.sale_lines sale_line
             JOIN public.sales sale ON (((sale.workspace_id = sale_line.workspace_id) AND (sale.id = sale_line.sale_id))))
          WHERE ((sale_line.inventory_item_id IS NOT NULL) AND (sale.returned_at IS NULL) AND (sale.voided_at IS NULL))
        ), active_legacy_header_sales AS (
         SELECT sale.workspace_id,
            sale.inventory_item_id,
            sale.id AS sale_id
           FROM public.sales sale
          WHERE ((sale.inventory_item_id IS NOT NULL) AND (sale.returned_at IS NULL) AND (sale.voided_at IS NULL))
        ), active_item_sales AS (
         SELECT active_line_sales.workspace_id,
            active_line_sales.inventory_item_id,
            active_line_sales.sale_id
           FROM active_line_sales
        UNION
         SELECT active_legacy_header_sales.workspace_id,
            active_legacy_header_sales.inventory_item_id,
            active_legacy_header_sales.sale_id
           FROM active_legacy_header_sales
        ), active_item_sale_summaries AS (
         SELECT active_item_sale.workspace_id,
            active_item_sale.inventory_item_id,
            count(*) AS active_sale_count,
                CASE
                    WHEN (count(*) = 1) THEN (array_agg(active_item_sale.sale_id))[1]
                    ELSE NULL::uuid
                END AS active_sale_id
           FROM active_item_sales active_item_sale
          GROUP BY active_item_sale.workspace_id, active_item_sale.inventory_item_id
        ), legacy_headers_without_line AS (
         SELECT DISTINCT active_legacy_header_sale.workspace_id,
            active_legacy_header_sale.inventory_item_id
           FROM active_legacy_header_sales active_legacy_header_sale
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM public.sale_lines sale_line
                  WHERE ((sale_line.workspace_id = active_legacy_header_sale.workspace_id) AND (sale_line.sale_id = active_legacy_header_sale.sale_id) AND (sale_line.inventory_item_id = active_legacy_header_sale.inventory_item_id)))))
        )
 SELECT inventory_item.id AS inventory_item_id,
    inventory_item.workspace_id,
    COALESCE(active_item_sale_summary.active_sale_count, (0)::bigint) AS active_sale_count,
    active_item_sale_summary.active_sale_id,
        CASE
            WHEN (COALESCE(active_item_sale_summary.active_sale_count, (0)::bigint) > 1) THEN 'multiple_active_sales'::text
            WHEN (legacy_header_without_line.inventory_item_id IS NOT NULL) THEN 'legacy_sale_header_without_line'::text
            WHEN ((inventory_item.status = 'sold'::text) AND (COALESCE(active_item_sale_summary.active_sale_count, (0)::bigint) = 0)) THEN 'legacy_sold_unverified'::text
            WHEN ((inventory_item.status <> 'sold'::text) AND (COALESCE(active_item_sale_summary.active_sale_count, (0)::bigint) > 0)) THEN 'sale_status_conflict'::text
            WHEN (active_item_sale_summary.active_sale_count = 1) THEN 'sold'::text
            ELSE 'no_active_sale'::text
        END AS sale_state
   FROM ((public.inventory_items inventory_item
     LEFT JOIN active_item_sale_summaries active_item_sale_summary ON (((active_item_sale_summary.workspace_id = inventory_item.workspace_id) AND (active_item_sale_summary.inventory_item_id = inventory_item.id))))
     LEFT JOIN legacy_headers_without_line legacy_header_without_line ON (((legacy_header_without_line.workspace_id = inventory_item.workspace_id) AND (legacy_header_without_line.inventory_item_id = inventory_item.id))));

COMMENT ON VIEW public.inventory_item_sale_states IS 'Klassifiziert den bestandswirksamen Verkaufszustand sichtbarer Einzelartikel.';

REVOKE ALL ON public.inventory_item_sale_states FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.inventory_item_sale_states TO authenticated;

GRANT ALL ON public.inventory_item_sale_states TO service_role;
