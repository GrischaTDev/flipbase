-- Freie Verkäufe: Positionen, Buchungsbelege, Erstattungen und Korrekturbezüge.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.sale_lines
  DROP CONSTRAINT sale_lines_check;

CREATE OR REPLACE FUNCTION public.create_or_get_invoice (
  p_workspace_id   uuid,
  p_sale_id        uuid,
  p_store_order_id uuid,
  p_invoice        jsonb,
  p_items          jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_invoice public.invoices;
  v_created boolean := false;
  v_items jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if (p_sale_id is null) = (p_store_order_id is null) then
    raise exception using errcode = '22023', message = 'Genau eine Rechnungsquelle ist erforderlich.';
  end if;

  -- Wiederholungen derselben Quelle vor der Prüfung heutiger Unternehmensdaten serialisieren.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_workspace_id::text || coalesce(p_sale_id::text, p_store_order_id::text), 0));
  select * into v_invoice from public.invoices
    where workspace_id = p_workspace_id
      and ((p_sale_id is not null and sale_id = p_sale_id)
        or (p_store_order_id is not null and store_order_id = p_store_order_id));
  if found then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
      into v_items from public.invoice_items as item where item.invoice_id = v_invoice.id;
    return jsonb_build_object('invoice', to_jsonb(v_invoice), 'items', v_items, 'created', false);
  end if;
  if p_sale_id is not null and exists(select 1 from public.sales where workspace_id = p_workspace_id and id = p_sale_id and voided_at is not null) then
    raise exception using errcode = '22023', message = 'Für aufgehobene Verkäufe kann keine neue Rechnung erstellt werden.';
  end if;
  if coalesce(jsonb_typeof(p_invoice), 'null') <> 'object'
    or nullif(btrim(p_invoice ->> 'invoice_number'), '') is null
    or nullif(btrim(p_invoice ->> 'order_number'), '') is null
    or nullif(p_invoice ->> 'invoice_date', '') is null
    or nullif(p_invoice ->> 'delivery_date', '') is null
    or coalesce((p_invoice ->> 'subtotal')::numeric, -1) < 0
    or coalesce((p_invoice ->> 'shipping_cost')::numeric, 0) < 0
    or coalesce((p_invoice ->> 'total')::numeric, -1) < 0 then
    raise exception using errcode = '22023', message = 'Die Rechnungsdaten sind ungültig.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0
    or exists (
      select 1
      from jsonb_array_elements(p_items) as item(value)
      where nullif(btrim(item.value ->> 'title'), '') is null
        or coalesce((item.value ->> 'quantity')::integer, 0) < 1
        or coalesce((item.value ->> 'unit_price')::numeric, -1) < 0
        or coalesce((item.value ->> 'total_price')::numeric, -1) < 0
    ) then
    raise exception using errcode = '22023', message = 'Mindestens eine Rechnungsposition ist ungültig.';
  end if;

  if p_sale_id is not null and not exists (
    select 1 from public.sales
    where id = p_sale_id and workspace_id = p_workspace_id
  ) then
    raise no_data_found using message = 'Der Verkauf wurde nicht gefunden.';
  end if;

  if p_store_order_id is not null and not exists (
    select 1 from public.store_orders
    where id = p_store_order_id and workspace_id = p_workspace_id
  ) then
    raise no_data_found using message = 'Die Shop-Bestellung wurde nicht gefunden.';
  end if;

  insert into public.invoices (
    workspace_id, invoice_number, order_number, invoice_date, delivery_date,
    seller, buyer, subtotal, shipping_cost, total, tax_mode, tax_clause,
    payment_method, payment_status, payment_due_date, notes, sale_id, store_order_id
  ) values (
    p_workspace_id,
    p_invoice ->> 'invoice_number',
    p_invoice ->> 'order_number',
    (p_invoice ->> 'invoice_date')::date,
    (p_invoice ->> 'delivery_date')::date,
    coalesce(p_invoice -> 'seller', '{}'::jsonb),
    coalesce(p_invoice -> 'buyer', '{}'::jsonb),
    coalesce((p_invoice ->> 'subtotal')::numeric, 0),
    coalesce((p_invoice ->> 'shipping_cost')::numeric, 0),
    coalesce((p_invoice ->> 'total')::numeric, 0),
    coalesce(p_invoice ->> 'tax_mode', 'diff_25a'),
    p_invoice ->> 'tax_clause',
    p_invoice ->> 'payment_method',
    coalesce(p_invoice ->> 'payment_status', 'paid'),
    nullif(p_invoice ->> 'payment_due_date', '')::date,
    p_invoice ->> 'notes',
    p_sale_id,
    p_store_order_id
  )
  on conflict do nothing
  returning * into v_invoice;

  if found then
    v_created := true;
    insert into public.invoice_items (
      invoice_id, sku, title, condition, quantity, unit_price, total_price
    )
    select
      v_invoice.id,
      nullif(item.value ->> 'sku', ''),
      item.value ->> 'title',
      nullif(item.value ->> 'condition', ''),
      (item.value ->> 'quantity')::integer,
      (item.value ->> 'unit_price')::numeric,
      (item.value ->> 'total_price')::numeric
    from jsonb_array_elements(p_items) as item(value);
  else
    select * into v_invoice
    from public.invoices
    where workspace_id = p_workspace_id
      and ((p_sale_id is not null and sale_id = p_sale_id)
        or (p_store_order_id is not null and store_order_id = p_store_order_id));
    if not found then
      raise no_data_found using message = 'Die Rechnung konnte nicht gelesen werden.';
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
  into v_items
  from public.invoice_items as item
  where item.invoice_id = v_invoice.id;

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'items', v_items,
    'created', v_created
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_package_sale_cost()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_package boolean;
begin
  if tg_op = 'UPDATE' and new.position_kind is distinct from old.position_kind then
    raise exception using errcode = '22023', message = 'Die Erfassungsart einer Verkaufsposition ist unveränderlich.';
  end if;
  if new.position_kind = 'free' then
    if new.cost_of_goods_sold is not null or new.tax_purchase_cost is not null or new.tax_cost_allocations is not null then
      raise exception using errcode = '22023', message = 'Freie Verkäufe haben noch keinen zugeordneten Wareneinsatz.';
    end if;
    return new;
  end if;
  select source_package_line_id is not null into v_package from public.inventory_items
    where workspace_id = new.workspace_id and id = new.inventory_item_id;
  if coalesce(v_package, false) then
    if new.cost_of_goods_sold is not null or new.tax_purchase_cost is not null or new.tax_cost_allocations is not null then
      raise exception using errcode = '22023', message = 'Unbekannte Paketkosten dürfen im Verkauf nicht durch einen Betrag ersetzt werden.';
    end if;
  elsif new.cost_of_goods_sold is null then
    raise exception using errcode = '23502', message = 'Normale Verkaufspositionen benötigen bekannte Kosten.';
  end if;
  return new;
end;
$function$;

CREATE FUNCTION public.record_sale_refund (
  p_workspace_id uuid,
  p_refund       jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_key uuid := (p_refund ->> 'booking_key')::uuid;
  v_request jsonb := pg_catalog.jsonb_build_object('refund', p_refund);
  v_previous jsonb;
  v_result jsonb;
begin
  if (select auth.uid()) is null or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if v_key is null then
    raise exception using errcode = '22023', message = 'Die Buchungskennung fehlt.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || v_key::text, 0));
  select request, result into v_previous, v_result from public.sale_booking_requests
    where workspace_id = p_workspace_id and booking_key = v_key;
  if found then
    if v_previous is distinct from v_request then
      raise exception using errcode = '22023', message = 'Die Buchungskennung gehört zu anderen Erstattungsdaten.';
    end if;
    return v_result;
  end if;
  v_result := public.record_sale_return(p_workspace_id, (p_refund ->> 'sale_id')::uuid,
    (p_refund ->> 'amount')::numeric, (p_refund ->> 'restock')::boolean,
    p_refund ->> 'reason', coalesce(p_refund ->> 'notes', ''),
    p_refund ->> 'restock_action', coalesce(p_refund ->> 'buyer_name', ''));
  insert into public.sale_booking_requests(workspace_id, booking_key, request, result)
    values (p_workspace_id, v_key, v_request, v_result);
  return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION public.record_sale_refund(uuid, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.record_sale_refund(uuid, jsonb) TO authenticated;

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
  v_source_purchase_id uuid;
  v_locked_purchase_ids uuid[] := array[]::uuid[];
  v_fresh_purchase_ids uuid[] := array[]::uuid[];
  v_restocked_quantity integer := 0;
  v_sale_total numeric;
  v_current_refund numeric;
  v_remaining_refundable numeric;
  v_total_refund numeric;
  v_is_full_refund boolean;
  v_previous_returned_at timestamptz;
  v_correlation_id uuid := gen_random_uuid();
  v_sale_event_id uuid;
  v_return_event_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_sale_id is null
    or p_refund_amount is null
    or p_restock is null
    or nullif(trim(p_reason), '') is null
    or p_restock_action is null
    or p_restock_action not in ('restock_ready', 'restock_repair', 'write_off', 'keep_with_buyer') then
    raise exception using errcode = '22023', message = 'Die Retourendaten sind ungültig.';
  end if;

  if p_refund_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_refund_amount < 0
    or pg_catalog.scale(p_refund_amount) > 2 then
    raise exception using
      errcode = '22023',
      message = 'Der Erstattungsbetrag muss centgenau und nicht negativ sein.';
  end if;

  if (p_restock and p_restock_action not in ('restock_ready', 'restock_repair'))
    or (not p_restock and p_restock_action not in ('write_off', 'keep_with_buyer')) then
    raise exception using
      errcode = '22023',
      message = 'Wiedereinlagerung und Retourenaktion widersprechen sich.';
  end if;

  -- Cost correction and reopen serialize on purchase before touching lots or
  -- sales. Resolve the immutable sale sources first and take the same sorted
  -- advisory/row-lock prefix so neither path can hold sale while waiting lot.
  select coalesce(
    pg_catalog.array_agg(source.purchase_id order by source.purchase_id),
    array[]::uuid[]
  )
  into v_locked_purchase_ids
  from (
    select lot.purchase_id
    from public.sale_lines as sale_line
    join public.sale_line_lot_allocations as allocation
      on allocation.workspace_id = sale_line.workspace_id
      and allocation.sale_line_id = sale_line.id
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    where sale_line.workspace_id = p_workspace_id
      and sale_line.sale_id = p_sale_id

    union

    select coalesce(item.purchase_id, purchase_line.purchase_id) as purchase_id
    from public.sale_lines as sale_line
    join public.inventory_items as item
      on item.workspace_id = sale_line.workspace_id
      and item.id = sale_line.inventory_item_id
    left join public.purchase_lines as purchase_line
      on purchase_line.workspace_id = item.workspace_id
      and purchase_line.id = item.purchase_line_id
    where sale_line.workspace_id = p_workspace_id
      and sale_line.sale_id = p_sale_id
  ) as source
  where source.purchase_id is not null;

  foreach v_source_purchase_id in array v_locked_purchase_ids loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_source_purchase_id::text, 0)
    );

    perform purchase.id
    from public.purchases as purchase
    where purchase.workspace_id = p_workspace_id
      and purchase.id = v_source_purchase_id
    for update;

    if not found then
      raise exception using
        errcode = '40001',
        message = 'Die Einkaufszuordnung der Retoure wurde parallel geändert.';
    end if;
  end loop;

  select * into v_sale
  from public.sales
  where id = p_sale_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Verkauf wurde nicht gefunden.';
  end if;

  select coalesce(
    pg_catalog.array_agg(source.purchase_id order by source.purchase_id),
    array[]::uuid[]
  )
  into v_fresh_purchase_ids
  from (
    select lot.purchase_id
    from public.sale_lines as sale_line
    join public.sale_line_lot_allocations as allocation
      on allocation.workspace_id = sale_line.workspace_id
      and allocation.sale_line_id = sale_line.id
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    where sale_line.workspace_id = p_workspace_id
      and sale_line.sale_id = p_sale_id

    union

    select coalesce(item.purchase_id, purchase_line.purchase_id) as purchase_id
    from public.sale_lines as sale_line
    join public.inventory_items as item
      on item.workspace_id = sale_line.workspace_id
      and item.id = sale_line.inventory_item_id
    left join public.purchase_lines as purchase_line
      on purchase_line.workspace_id = item.workspace_id
      and purchase_line.id = item.purchase_line_id
    where sale_line.workspace_id = p_workspace_id
      and sale_line.sale_id = p_sale_id
  ) as source
  where source.purchase_id is not null;

  if v_fresh_purchase_ids is distinct from v_locked_purchase_ids then
    raise exception using
      errcode = '40001',
      message = 'Die Einkaufszuordnung der Retoure wurde parallel geändert.';
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
  v_current_refund := coalesce(v_sale.refund_amount, 0);
  v_previous_returned_at := v_sale.returned_at;

  if v_sale_total::text in ('NaN', 'Infinity', '-Infinity')
    or v_current_refund::text in ('NaN', 'Infinity', '-Infinity')
    or v_sale_total < 0
    or v_current_refund < 0
    or v_current_refund > v_sale_total then
    raise exception using
      errcode = '22023',
      message = 'Der bisherige Erstattungsstand muss vor der Retoure geprüft werden.';
  end if;

  v_remaining_refundable := v_sale_total - v_current_refund;
  if p_refund_amount > v_remaining_refundable then
    raise exception using
      errcode = '22023',
      message = 'Der Erstattungsbetrag überschreitet den noch offenen Verkaufsbetrag.';
  end if;

  v_total_refund := v_current_refund + p_refund_amount;
  v_is_full_refund := v_total_refund = v_sale_total;

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
    if v_sale_line.position_kind = 'free' then
      continue;
    elsif v_sale_line.catalog_product_id is not null then
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
          set remaining_unit_costs = case
                when v_allocation.active_unit_costs is null
                  or (remaining_quantity > 0 and remaining_unit_costs is null) then null
                else coalesce(remaining_unit_costs, array[]::numeric[]) || v_allocation.active_unit_costs end,
              remaining_tax_unit_costs = case
                when v_allocation.active_tax_unit_costs is null
                  or (remaining_quantity > 0 and remaining_tax_unit_costs is null) then null
                else coalesce(remaining_tax_unit_costs, array[]::numeric[]) || v_allocation.active_tax_unit_costs end,
              remaining_quantity = remaining_quantity + v_allocation.quantity
          where id = v_stock_lot.id
            and workspace_id = p_workspace_id;
          v_restocked_quantity := v_restocked_quantity + v_allocation.quantity;
        end if;

        update public.sale_line_lot_allocations
        set active_tax_unit_costs = case when p_restock then array[]::numeric[] else active_tax_unit_costs end,
            active_unit_costs = case when p_restock then array[]::numeric[] else active_unit_costs end,
            active_allocated_cost = case
          when p_restock then 0
          else allocated_cost
        end
        where workspace_id = p_workspace_id
          and id = v_allocation.id;

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

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    reason,
    changes,
    correlation_id
  ) values (
    p_workspace_id,
    'sale',
    v_sale.id,
    'sale_refund_updated',
    (select auth.uid()),
    p_reason,
    pg_catalog.jsonb_build_object(
      'refund_amount', pg_catalog.jsonb_build_object(
        'before', v_current_refund,
        'after', v_total_refund
      ),
      'returned_at', pg_catalog.jsonb_build_object(
        'before', v_previous_returned_at,
        'after', v_sale.returned_at
      )
    ),
    v_correlation_id
  )
  returning id into v_sale_event_id;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    reason,
    changes,
    correlation_id
  ) values (
    p_workspace_id,
    'return',
    v_return.id,
    'sale_return_recorded',
    (select auth.uid()),
    p_reason,
    pg_catalog.jsonb_build_object(
      'sale_id', pg_catalog.jsonb_build_object('before', null, 'after', v_sale.id),
      'refund_amount', pg_catalog.jsonb_build_object('before', null, 'after', p_refund_amount),
      'is_full_refund', pg_catalog.jsonb_build_object('before', null, 'after', v_is_full_refund),
      'restock_action', pg_catalog.jsonb_build_object('before', null, 'after', p_restock_action),
      'restocked_quantity', pg_catalog.jsonb_build_object('before', null, 'after', v_restocked_quantity)
    ),
    v_correlation_id
  )
  returning id into v_return_event_id;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'return', to_jsonb(v_return),
    'business_event_ids', jsonb_build_array(v_sale_event_id, v_return_event_id),
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
  v_booking_key uuid;
  v_request jsonb;
  v_result jsonb;
  v_previous_request jsonb;
  v_correction_id uuid;
  v_original public.sales;
  v_original_invoice public.invoices;
  v_correction_document jsonb;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_stock_lot public.stock_lots;
  v_catalog_product public.catalog_products;
  v_inventory_item public.inventory_items;
  v_workspace public.workspaces;
  v_catalog_product_id uuid;
  v_inventory_item_id uuid;
  v_header_inventory_item_id uuid;
  v_source_purchase_id uuid;
  v_source_purchase_status text;
  v_locked_purchase_ids uuid[] := array[]::uuid[];
  v_quantity integer;
  v_unit_sale_price numeric(12, 2);
  v_line_total numeric(12, 2);
  v_tax_costs numeric[];
  v_business_unit_costs numeric[];
  v_line_tax_costs numeric[];
  v_tax_unknown boolean;
  v_line_cogs numeric(12, 2);
  v_remaining_quantity integer;
  v_allocated_quantity integer;
  v_allocation_cost numeric(12,2);
  v_previously_allocated_cost numeric(12,2);
  v_lot_total_cost numeric(12,2);
  v_remaining_lot_cost numeric(12,2);
  v_remaining_cost_cents bigint;
  v_previously_active_quantity integer;
  v_consumption_sequence bigint;
  v_ambiguous_active_cost_count integer;
  v_invalid_restocked_quantity_count integer;
  v_sale_total numeric(12, 2) := 0;
  v_shipping_revenue numeric(12,2) := 0;
  v_shipping_mode text;
  v_cost_entries jsonb := '[]'::jsonb;
  v_cost_entry jsonb;
  v_packaging_cost numeric(12,2) := 0;
  v_other_costs numeric(12,2) := 0;
  v_money_key text;
  v_sale_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_sale_state text;
  v_business_event_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  v_booking_key := nullif(p_sale ->> 'booking_key', '')::uuid;
  v_request := pg_catalog.jsonb_build_object('sale', p_sale, 'lines', p_lines);
  if v_booking_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || v_booking_key::text, 0));
    select request, result into v_previous_request, v_result from public.sale_booking_requests
      where workspace_id = p_workspace_id and booking_key = v_booking_key;
    if found then
      if v_previous_request is distinct from v_request then
        raise exception using errcode = '22023', message = 'Die Buchungskennung gehört zu anderen Verkaufsdaten.';
      end if;
      return v_result;
    end if;
  elsif exists (select 1 from pg_catalog.jsonb_array_elements(p_lines) line where line ->> 'position_kind' = 'free') then
    raise exception using errcode = '22023', message = 'Die Buchungskennung fehlt.';
  end if;
  v_correction_id := nullif(p_sale ->> 'correction_sale_id', '')::uuid;
  if v_correction_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || v_correction_id::text, 0));
    select * into v_original from public.sales where workspace_id = p_workspace_id and id = v_correction_id for update;
    if not found or v_original.voided_at is not null or coalesce(v_original.refund_amount, 0) <> 0
      or not exists (select 1 from public.sale_lines where sale_id = v_correction_id)
      or exists (select 1 from public.sale_lines where sale_id = v_correction_id and position_kind <> 'free')
      or exists (select 1 from public.returns where sale_id = v_correction_id)
      or nullif(pg_catalog.btrim(p_sale ->> 'correction_reason'), '') is null then
      raise exception using errcode = '22023', message = 'Dieser Verkauf kann nicht über die freie Korrektur ersetzt werden.';
    end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(p_lines) line where coalesce(line ->> 'position_kind', 'stock') <> 'free') then
      raise exception using errcode = '22023', message = 'Eine freie Korrektur benötigt freie Ersatzpositionen.';
    end if;
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_sale) <> 'object'
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0
    or nullif(trim(p_sale ->> 'platform'), '') is null
    or (p_sale ->> 'sale_date') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungültig.';
  end if;

  foreach v_money_key in array array['platform_fee', 'shipping_cost', 'shipping_revenue', 'packaging_cost', 'other_costs'] loop
    if p_sale ? v_money_key
      and (
        jsonb_typeof(p_sale -> v_money_key) <> 'number'
        or (p_sale ->> v_money_key) !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
        or (p_sale ->> v_money_key)::numeric < 0
      ) then
      raise exception using errcode = '22023', message = 'Die Verkaufsbeträge sind ungültig.';
    end if;
  end loop;

  if p_sale ? 'shipping_mode'
    and jsonb_typeof(p_sale -> 'shipping_mode') <> 'null'
    and (
      jsonb_typeof(p_sale -> 'shipping_mode') <> 'string'
      or p_sale ->> 'shipping_mode' not in ('seller_arranged', 'platform_prepaid', 'pickup')
    ) then
    raise exception using errcode = '22023', message = 'Die Versandabwicklung ist ungültig.';
  end if;

  if p_sale ? 'cost_entries' then
    if jsonb_typeof(p_sale -> 'cost_entries') <> 'array' then
      raise exception using errcode = '22023', message = 'Die zusätzlichen Verkaufskosten sind ungültig.';
    end if;
    v_cost_entries := p_sale -> 'cost_entries';
  else
    v_cost_entries := jsonb_strip_nulls(jsonb_build_array(
      case when coalesce((p_sale ->> 'packaging_cost')::numeric, 0) > 0
        then jsonb_build_object('category', 'packaging', 'amount', (p_sale ->> 'packaging_cost')::numeric)
      end,
      case when coalesce((p_sale ->> 'other_costs')::numeric, 0) > 0
        then jsonb_build_object('category', 'other', 'amount', (p_sale ->> 'other_costs')::numeric)
      end
    ));
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    into v_cost_entries
    from jsonb_array_elements(v_cost_entries) as entry(value)
    where value <> 'null'::jsonb;
  end if;

  if jsonb_array_length(v_cost_entries) > 50 then
    raise exception using errcode = '22023', message = 'Es sind höchstens 50 zusätzliche Verkaufskosten erlaubt.';
  end if;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    if jsonb_typeof(v_cost_entry) <> 'object'
      or jsonb_typeof(v_cost_entry -> 'category') <> 'string'
      or v_cost_entry ->> 'category' not in ('packaging', 'payment_fee', 'promotion', 'other')
      or (v_cost_entry ? 'description' and jsonb_typeof(v_cost_entry -> 'description') not in ('string', 'null'))
      or jsonb_typeof(v_cost_entry -> 'amount') <> 'number'
      or (v_cost_entry ->> 'amount') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_cost_entry ->> 'amount')::numeric < 0 then
      raise exception using errcode = '22023', message = 'Eine zusätzliche Verkaufskostenzeile ist ungültig.';
    end if;

    if v_cost_entry ->> 'category' = 'packaging' then
      v_packaging_cost := v_packaging_cost + (v_cost_entry ->> 'amount')::numeric;
    else
      v_other_costs := v_other_costs + (v_cost_entry ->> 'amount')::numeric;
    end if;
  end loop;

  v_shipping_revenue := coalesce((p_sale ->> 'shipping_revenue')::numeric, 0);
  v_shipping_mode := nullif(p_sale ->> 'shipping_mode', '');

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
      or coalesce(v_input_line ->> 'position_kind', 'stock') not in ('stock', 'free')
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(trim(v_input_line ->> 'catalog_product_id'), ''),
        nullif(trim(v_input_line ->> 'inventory_item_id'), '')
      ) <> (case when v_input_line ->> 'position_kind' = 'free' then 0 else 1 end)
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

  -- Lock every currently relevant source purchase before any item or lot.
  -- Reopen/correction use the same purchase-first order, and UUID sorting
  -- prevents client-controlled deadlocks across mixed multi-line sales.
  select coalesce(
    pg_catalog.array_agg(source.purchase_id order by source.purchase_id),
    array[]::uuid[]
  )
  into v_locked_purchase_ids
  from (
    select coalesce(item.purchase_id, linked_line.purchase_id) as purchase_id
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    join public.inventory_items as item
      on item.workspace_id = p_workspace_id
      and item.id = (element.value ->> 'inventory_item_id')::uuid
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where nullif(pg_catalog.btrim(element.value ->> 'inventory_item_id'), '') is not null

    union

    select lot.purchase_id
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    join public.stock_lots as lot
      on lot.workspace_id = p_workspace_id
      and lot.catalog_product_id = (element.value ->> 'catalog_product_id')::uuid
      and lot.remaining_quantity > 0
    where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
  ) as source
  where source.purchase_id is not null;

  if pg_catalog.cardinality(v_locked_purchase_ids) > 0 then
    for v_purchase_position in 1..pg_catalog.cardinality(v_locked_purchase_ids) loop
      perform purchase.id
      from public.purchases as purchase
      where purchase.workspace_id = p_workspace_id
        and purchase.id = v_locked_purchase_ids[v_purchase_position]
      for update;
    end loop;
  end if;

  -- Nach den Einkäufen und vor den Losen sperren und Archivstatus prüfen.
  for v_catalog_product_id in
    select candidate.catalog_product_id
    from (
      select distinct (element.value ->> 'catalog_product_id')::uuid as catalog_product_id
      from pg_catalog.jsonb_array_elements(p_lines) as element(value)
      where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
    ) as candidate
    order by candidate.catalog_product_id
  loop
    select * into v_catalog_product from public.catalog_products
      where workspace_id = p_workspace_id and id = v_catalog_product_id for update;
    if not found then
      raise exception using errcode = '22023', message = 'Der Mengenartikel ist ungültig.';
    end if;
    if v_catalog_product.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
    end if;
  end loop;

  -- A draft lot can exist while goods are being received, but it must never
  -- close an availability gap for a sale. Keep finalized inventory sellable
  -- even when another draft of the same product exists.
  for v_input_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
  loop
    v_catalog_product_id := (v_input_line ->> 'catalog_product_id')::uuid;
    v_quantity := (v_input_line ->> 'quantity')::integer;

    if coalesce((
      select pg_catalog.sum(lot.remaining_quantity)
      from public.stock_lots as lot
      join public.purchases as purchase
        on purchase.workspace_id = lot.workspace_id
        and purchase.id = lot.purchase_id
      where lot.workspace_id = p_workspace_id
        and lot.catalog_product_id = v_catalog_product_id
        and lot.remaining_quantity > 0
        and purchase.entry_status = 'finalized'
    ), 0) < v_quantity
      and exists (
        select 1
        from public.stock_lots as lot
        join public.purchases as purchase
          on purchase.workspace_id = lot.workspace_id
          and purchase.id = lot.purchase_id
        where lot.workspace_id = p_workspace_id
          and lot.catalog_product_id = v_catalog_product_id
          and lot.remaining_quantity > 0
          and purchase.entry_status is distinct from 'finalized'
      ) then
      raise exception using
        errcode = '22023',
        message = 'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.';
    end if;
  end loop;

  -- Resolve unique UUIDs first and lock the items in one stable order.
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

    if v_inventory_item.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
    end if;

    v_source_purchase_id := v_inventory_item.purchase_id;
    if v_source_purchase_id is null and v_inventory_item.purchase_line_id is not null then
      select line.purchase_id
      into v_source_purchase_id
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.id = v_inventory_item.purchase_line_id;
    end if;

    if v_source_purchase_id is not null then
      if not (v_source_purchase_id = any(v_locked_purchase_ids)) then
        raise exception using
          errcode = '40001',
          message = 'Die Einkaufszuordnung des Einzelartikels wurde parallel geändert.';
      end if;

      select purchase.entry_status
      into v_source_purchase_status
      from public.purchases as purchase
      where purchase.workspace_id = p_workspace_id
        and purchase.id = v_source_purchase_id;

      if v_source_purchase_status is distinct from 'finalized' then
        raise exception using
          errcode = '22023',
          message = 'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.';
      end if;
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
    shipping_revenue,
    shipping_mode,
    external_order_id,
    external_listing_id,
    buyer_notes,
    created_at
  ) values (
    p_workspace_id,
    v_header_inventory_item_id,
    trim(p_sale ->> 'platform'),
    0,
    0,
    (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    v_packaging_cost,
    v_other_costs,
    v_shipping_revenue,
    v_shipping_mode,
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), ''),
    pg_catalog.clock_timestamp()
  )
  returning * into v_sale;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    insert into public.sale_cost_entries (
      workspace_id, sale_id, category, description, amount
    ) values (
      p_workspace_id,
      v_sale.id,
      v_cost_entry ->> 'category',
      nullif(trim(v_cost_entry ->> 'description'), ''),
      (v_cost_entry ->> 'amount')::numeric
    );
  end loop;

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or coalesce(v_input_line ->> 'position_kind', 'stock') not in ('stock', 'free')
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(v_input_line ->> 'catalog_product_id', ''),
        nullif(v_input_line ->> 'inventory_item_id', '')
      ) <> (case when v_input_line ->> 'position_kind' = 'free' then 0 else 1 end) then
      raise exception using errcode = '22023', message = 'Eine Verkaufsposition ist ungültig.';
    end if;

    v_catalog_product_id := nullif(v_input_line ->> 'catalog_product_id', '')::uuid;
    v_inventory_item_id := nullif(v_input_line ->> 'inventory_item_id', '')::uuid;
    v_quantity := (v_input_line ->> 'quantity')::integer;
    v_unit_sale_price := (v_input_line ->> 'unit_sale_price')::numeric(12, 2);
    v_line_total := v_quantity * v_unit_sale_price;
    v_line_cogs := 0;
    v_line_tax_costs := array[]::numeric[];
    v_tax_unknown := false;

    if v_input_line ->> 'position_kind' = 'free' then
      if jsonb_typeof(v_input_line -> 'title_snapshot') is distinct from 'string' or nullif(pg_catalog.btrim(v_input_line ->> 'title_snapshot'), '') is null then
        raise exception using errcode = '22023', message = 'Die Verkaufsbeschreibung fehlt.';
      end if;
      insert into public.sale_lines (workspace_id, sale_id, position_kind, title_snapshot, quantity,
        unit_sale_price, line_total, cost_of_goods_sold, tax_mode)
      values (p_workspace_id, v_sale.id, 'free', pg_catalog.btrim(v_input_line ->> 'title_snapshot'),
        v_quantity, v_unit_sale_price, v_line_total, null, coalesce((select tax_mode from public.sale_lines where sale_id = v_correction_id order by id limit 1), v_workspace.tax_mode))
      returning * into v_sale_line;
    elsif v_catalog_product_id is not null then
      select * into v_catalog_product
      from public.catalog_products
      where id = v_catalog_product_id
        and workspace_id = p_workspace_id;

      if not found then
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
        select lot.*
        from public.stock_lots as lot
        join public.purchases as purchase
          on purchase.workspace_id = lot.workspace_id
          and purchase.id = lot.purchase_id
        where lot.workspace_id = p_workspace_id
          and lot.catalog_product_id = v_catalog_product.id
          and lot.remaining_quantity > 0
          and purchase.id = any(v_locked_purchase_ids)
          and purchase.entry_status = 'finalized'
        order by lot.received_at, lot.id
        for update of lot
      loop
        exit when v_remaining_quantity = 0;

        -- Fremde und manuelle Reservierungen bleiben auch beim allgemeinen FIFO geschützt.
        v_allocated_quantity := least(v_remaining_quantity, greatest(0,
          v_stock_lot.remaining_quantity - public.stock_lot_reserved_quantity(v_stock_lot.id)));
        continue when v_allocated_quantity = 0;

        select
          coalesce(pg_catalog.sum(coalesce(
            allocation.active_allocated_cost,
            case
              when movement_state.restocked_quantity = allocation.quantity then 0
              when movement_state.restocked_quantity = 0 then allocation.allocated_cost
              else null
            end
          )), 0),
          pg_catalog.count(*) filter (
            where allocation.active_allocated_cost is null
              and movement_state.restocked_quantity not in (0, allocation.quantity)
          )::integer,
          coalesce(pg_catalog.sum(
            allocation.quantity - movement_state.restocked_quantity
          ), 0)::integer,
          pg_catalog.count(*) filter (
            where movement_state.restocked_quantity < 0
              or movement_state.restocked_quantity > allocation.quantity
          )::integer
        into
          v_previously_allocated_cost,
          v_ambiguous_active_cost_count,
          v_previously_active_quantity,
          v_invalid_restocked_quantity_count
        from public.sale_line_lot_allocations as allocation
        left join lateral (
          select coalesce(pg_catalog.sum(
            case
              when movement.direction = 'in' and movement.reason = 'return'
                then movement.quantity
              when movement.direction = 'out' and movement.reason = 'damage'
                then -movement.quantity
              else 0
            end
          ), 0)::integer as restocked_quantity
          from public.stock_movements as movement
          where movement.workspace_id = allocation.workspace_id
            and movement.stock_lot_id = allocation.stock_lot_id
            and movement.sale_line_id = allocation.sale_line_id
        ) as movement_state on true
        where allocation.stock_lot_id = v_stock_lot.id;

        if v_ambiguous_active_cost_count <> 0 then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten einer historischen Teilretoure müssen vor dem Verkauf geprüft werden.';
        end if;

        if v_invalid_restocked_quantity_count <> 0
          or v_stock_lot.remaining_quantity + v_previously_active_quantity
            + coalesce((select sum(case when m.direction = 'out' then m.quantity else -m.quantity end) from public.stock_movements m
              where m.stock_lot_id = v_stock_lot.id and m.stock_removal_id is not null), 0)
            <> v_stock_lot.received_quantity then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Mengen eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        if v_stock_lot.unit_cost is null
          or v_stock_lot.unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        -- A purchase-backed lot owns one exact cent pool. Repeated partial
        -- sales consume the leading deterministic cents from the currently
        -- remaining pool instead of rounding the average unit cost anew.
        v_lot_total_cost := pg_catalog.round(
          v_stock_lot.unit_cost * v_stock_lot.received_quantity,
          2
        );
        -- Gebuchte Abgänge tragen ihre Kosten selbst; sie gehören nicht zum nächsten Verkauf.
        v_remaining_lot_cost := v_lot_total_cost - v_previously_allocated_cost
          - coalesce((select sum(case when m.direction = 'out' then m.removed_cost else -m.removed_cost end) from public.stock_movements m
            where m.stock_lot_id = v_stock_lot.id and m.stock_removal_id is not null), 0);

        if v_remaining_lot_cost < 0
          or v_remaining_lot_cost <> pg_catalog.round(v_remaining_lot_cost, 2) then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        v_remaining_cost_cents := pg_catalog.round(v_remaining_lot_cost * 100)::bigint;
        v_allocation_cost := (
          v_allocated_quantity::bigint
            * (v_remaining_cost_cents / v_stock_lot.remaining_quantity::bigint)
          + least(
              v_allocated_quantity::bigint,
              pg_catalog.mod(
                v_remaining_cost_cents,
                v_stock_lot.remaining_quantity::bigint
              )
            )
        )::numeric / 100;

        v_business_unit_costs := v_stock_lot.remaining_unit_costs[1:v_allocated_quantity];
        if v_stock_lot.remaining_unit_costs is not null then
          if pg_catalog.cardinality(v_business_unit_costs) <> v_allocated_quantity then
            raise exception using errcode = '22023', message = 'Die Stückkostenfolge des Loses ist unvollständig.';
          end if;
          select pg_catalog.sum(value) into v_allocation_cost from pg_catalog.unnest(v_business_unit_costs) as value;
        end if;
        v_tax_costs := v_stock_lot.remaining_tax_unit_costs[1:v_allocated_quantity];
        if v_tax_costs is null or pg_catalog.cardinality(v_tax_costs) <> v_allocated_quantity then
          v_tax_unknown := true;
        else
          v_line_tax_costs := v_line_tax_costs || v_tax_costs;
        end if;
        update public.stock_lots
        set remaining_tax_unit_costs = v_stock_lot.remaining_tax_unit_costs[(v_allocated_quantity + 1):v_stock_lot.remaining_quantity],
            remaining_unit_costs = v_stock_lot.remaining_unit_costs[(v_allocated_quantity + 1):v_stock_lot.remaining_quantity],
            remaining_quantity = remaining_quantity - v_allocated_quantity
        where id = v_stock_lot.id
          and workspace_id = p_workspace_id;

        select greatest(
          coalesce(pg_catalog.max(allocation.consumption_sequence), 0),
          pg_catalog.count(*)
        ) + 1
        into v_consumption_sequence
        from public.sale_line_lot_allocations as allocation
        where allocation.workspace_id = p_workspace_id
          and allocation.stock_lot_id = v_stock_lot.id;

        insert into public.sale_line_lot_allocations (
          workspace_id,
          sale_line_id,
          stock_lot_id,
          quantity,
          unit_cost,
          allocated_cost,
          consumption_sequence,
          active_allocated_cost, tax_purchase_cost, tax_cost_allocations, active_tax_unit_costs, active_unit_costs
        ) values (
          p_workspace_id,
          v_sale_line.id,
          v_stock_lot.id,
          v_allocated_quantity,
          v_stock_lot.unit_cost,
          v_allocation_cost,
          v_consumption_sequence,
          v_allocation_cost,
          (select pg_catalog.sum(value) from pg_catalog.unnest(v_tax_costs) as value),
          public.tax_cost_allocations(v_tax_costs),
          v_tax_costs,
          v_business_unit_costs
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
      set tax_purchase_cost = case when v_tax_unknown then null else (select pg_catalog.sum(value) from pg_catalog.unnest(v_line_tax_costs) as value) end,
          tax_cost_allocations = case when v_tax_unknown then null else public.tax_cost_allocations(v_line_tax_costs) end,
          cost_of_goods_sold = v_line_cogs
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

      v_line_cogs := v_inventory_item.allocated_purchase_cost + coalesce((
        select pg_catalog.sum(cost.amount) from public.item_costs as cost
        where cost.inventory_item_id = v_inventory_item.id
      ), 0);

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        inventory_item_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
        tax_purchase_cost, tax_cost_allocations,
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
        v_inventory_item.tax_purchase_cost,
        public.tax_cost_allocations(case when v_inventory_item.tax_purchase_cost is null then null else array[v_inventory_item.tax_purchase_cost] end),
        v_workspace.tax_mode
      )
      returning * into v_sale_line;
    end if;

    v_sale_total := v_sale_total + v_line_total;
    v_sale_line_ids := array_append(v_sale_line_ids, v_sale_line.id);
  end loop;

  update public.sales
  set sale_price = v_sale_total + v_shipping_revenue,
      sale_price_total = v_sale_total + v_shipping_revenue
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    p_workspace_id,
    'sale',
    v_sale.id,
    'sale_recorded',
    (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'financials', pg_catalog.jsonb_build_object(
        'before', null,
        'after', pg_catalog.jsonb_build_object(
          'item_revenue', v_sale_total,
          'buyer_shipping_revenue', v_shipping_revenue,
          'total_revenue', v_sale.sale_price_total,
          'cost_of_goods_sold', (
            select case when pg_catalog.count(*) filter (where sale_line.cost_of_goods_sold is null) > 0 then null else coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0) end
            from public.sale_lines as sale_line
            where sale_line.workspace_id = p_workspace_id
              and sale_line.sale_id = v_sale.id
          ),
          'platform_fee', v_sale.platform_fee,
          'seller_shipping_cost', v_sale.shipping_cost,
          'additional_costs', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'category', cost_entry.category,
                'description', cost_entry.description,
                'amount', cost_entry.amount
              ) order by cost_entry.id
            )
            from public.sale_cost_entries as cost_entry
            where cost_entry.workspace_id = p_workspace_id
              and cost_entry.sale_id = v_sale.id
          ), '[]'::jsonb)
        )
      ),
      'sale', pg_catalog.jsonb_build_object(
        'before', null,
        'after', pg_catalog.jsonb_build_object(
          'platform', v_sale.platform,
          'sale_date', v_sale.sale_date,
          'shipping_mode', v_sale.shipping_mode
        )
      )
    )
  )
  returning id into v_business_event_id;

  v_result := jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'business_event_id', v_business_event_id,
    -- Eingabereihenfolge für unveränderliche externe Positionsnachweise.
    'sale_line_ids', to_jsonb(v_sale_line_ids),
    'cost_entries', coalesce((
      select jsonb_agg(to_jsonb(cost_entry) order by cost_entry.id)
      from public.sale_cost_entries as cost_entry
      where cost_entry.sale_id = v_sale.id
    ), '[]'::jsonb),
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
  if v_correction_id is not null then
    update public.sales set voided_at = pg_catalog.clock_timestamp(), voided_by = (select auth.uid()),
      void_reason = pg_catalog.btrim(p_sale ->> 'correction_reason')
      where workspace_id = p_workspace_id and id = v_correction_id;
    select * into v_original_invoice from public.invoices where workspace_id = p_workspace_id and sale_id = v_correction_id;
    if found then
      v_correction_document := pg_catalog.jsonb_build_object(
        'documentType', 'correction', 'id', v_correction_id, 'invoiceNumber', v_original.record_number || '-K',
        'orderNumber', v_original_invoice.order_number, 'invoiceDate', current_date, 'deliveryDate', current_date,
        'seller', v_original_invoice.seller, 'buyer', v_original_invoice.buyer,
        'subtotal', -v_original_invoice.subtotal, 'shippingCost', -v_original_invoice.shipping_cost,
        'total', -v_original_invoice.total, 'taxMode', v_original_invoice.tax_mode,
        'taxClause', v_original_invoice.tax_clause, 'paymentMethod', 'Erfassungskorrektur', 'paymentStatus', 'paid',
        'notes', 'Korrektur zu Rechnung ' || v_original_invoice.invoice_number || ': ' || (p_sale ->> 'correction_reason'),
        'sourceType', 'sale', 'sourceId', v_correction_id,
        'items', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('title', title, 'sku', sku,
          'quantity', quantity, 'unitPrice', -unit_price, 'totalPrice', -total_price))
          from public.invoice_items where invoice_id = v_original_invoice.id));
    end if;
    insert into public.business_events (workspace_id, entity_type, entity_id, event_type, actor_id, changes)
    values (p_workspace_id, 'sale', v_correction_id, 'sale_corrected', (select auth.uid()),
      pg_catalog.jsonb_build_object('reason', p_sale ->> 'correction_reason', 'replacement_sale_id', v_sale.id, 'before', pg_catalog.to_jsonb(v_original), 'correction_document', v_correction_document));
    insert into public.sale_corrections (workspace_id, original_sale_id, replacement_sale_id, reason, document)
    values (p_workspace_id, v_correction_id, v_sale.id, pg_catalog.btrim(p_sale ->> 'correction_reason'), v_correction_document);
  end if;
  if v_booking_key is not null then
    insert into public.sale_booking_requests (workspace_id, booking_key, request, result)
    values (p_workspace_id, v_booking_key, v_request, v_result);
  end if;
  return v_result;

end;
$function$;

CREATE TABLE public.sale_booking_requests (
  workspace_id uuid                     NOT NULL,
  booking_key  uuid                     NOT NULL,
  request      jsonb                    NOT NULL,
  result       jsonb                    NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.sale_booking_requests IS 'Bestätigte Antworten für wiederholte Verkaufs- und Erstattungsbuchungen.';

ALTER TABLE public.sale_booking_requests
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sale_booking_requests
  ADD CONSTRAINT sale_booking_requests_pkey PRIMARY KEY (workspace_id, booking_key);

ALTER TABLE public.sale_booking_requests
  ADD CONSTRAINT sale_booking_requests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT SELECT ON public.sale_booking_requests TO authenticated;

CREATE POLICY "sale_booking_requests anon delete" ON public.sale_booking_requests
  FOR DELETE
  TO anon
  USING (false);

CREATE POLICY "sale_booking_requests anon insert" ON public.sale_booking_requests
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "sale_booking_requests anon select" ON public.sale_booking_requests
  FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "sale_booking_requests anon update" ON public.sale_booking_requests
  FOR UPDATE
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "sale_booking_requests authenticated delete" ON public.sale_booking_requests
  FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "sale_booking_requests authenticated insert" ON public.sale_booking_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "sale_booking_requests authenticated select" ON public.sale_booking_requests
  FOR SELECT
  TO authenticated
  USING (( SELECT public.can_access_workspace(sale_booking_requests.workspace_id) AS can_access_workspace));

CREATE POLICY "sale_booking_requests authenticated update" ON public.sale_booking_requests
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE TABLE public.sale_corrections (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id        uuid                     NOT NULL,
  original_sale_id    uuid                     NOT NULL,
  replacement_sale_id uuid                     NOT NULL,
  reason              text                     NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  document            jsonb
);

COMMENT ON TABLE public.sale_corrections IS 'Dauerhafte Beziehung zwischen aufgehobenem freien Verkauf und Ersatzverkauf.';

ALTER TABLE public.sale_corrections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sale_corrections
  ADD CONSTRAINT sale_corrections_original_sale_id_fkey FOREIGN KEY (original_sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;

ALTER TABLE public.sale_corrections
  ADD CONSTRAINT sale_corrections_original_sale_id_key UNIQUE (original_sale_id);

ALTER TABLE public.sale_corrections
  ADD CONSTRAINT sale_corrections_pkey PRIMARY KEY (id);

ALTER TABLE public.sale_corrections
  ADD CONSTRAINT sale_corrections_reason_check CHECK (length(btrim(reason)) > 0);

ALTER TABLE public.sale_corrections
  ADD CONSTRAINT sale_corrections_replacement_sale_id_fkey FOREIGN KEY (replacement_sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;

ALTER TABLE public.sale_corrections
  ADD CONSTRAINT sale_corrections_replacement_sale_id_key UNIQUE (replacement_sale_id);

ALTER TABLE public.sale_corrections
  ADD CONSTRAINT sale_corrections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT SELECT ON public.sale_corrections TO authenticated;

CREATE INDEX sale_corrections_workspace_idx ON public.sale_corrections (workspace_id);

CREATE POLICY "sale_corrections anon delete" ON public.sale_corrections
  FOR DELETE
  TO anon
  USING (false);

CREATE POLICY "sale_corrections anon insert" ON public.sale_corrections
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "sale_corrections anon select" ON public.sale_corrections
  FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "sale_corrections anon update" ON public.sale_corrections
  FOR UPDATE
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "sale_corrections authenticated delete" ON public.sale_corrections
  FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "sale_corrections authenticated insert" ON public.sale_corrections
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "sale_corrections authenticated select" ON public.sale_corrections
  FOR SELECT
  TO authenticated
  USING (( SELECT public.can_access_workspace(sale_corrections.workspace_id) AS can_access_workspace));

CREATE POLICY "sale_corrections authenticated update" ON public.sale_corrections
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE public.sale_lines
  ADD COLUMN position_kind text DEFAULT 'stock'::text NOT NULL;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_position_kind_check CHECK (position_kind = ANY (ARRAY['stock'::text, 'free'::text]));

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_check
    CHECK
    (position_kind = 'stock'::text AND num_nonnulls(catalog_product_id, inventory_item_id) = 1 OR position_kind = 'free'::text AND num_nonnulls(catalog_product_id,
    inventory_item_id) = 0 AND length(btrim(title_snapshot)) > 0);
-- Vom tatsächlichen Rollenstand erzeugte Rechte für neue Tabellen und RPC.
revoke all on table sale_booking_requests from public, anon, authenticated, service_role;
revoke all on table sale_corrections from public, anon, authenticated, service_role;
grant select on table sale_booking_requests to authenticated;
grant select on table sale_corrections to authenticated;
revoke all on function public.record_sale_refund(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_sale_refund(uuid,jsonb) to authenticated;
