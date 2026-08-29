-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.sale_line_lot_allocations
  ALTER COLUMN unit_cost TYPE numeric(18,6) USING unit_cost::numeric(18,6);

ALTER TABLE public.stock_lots
  ALTER COLUMN unit_cost TYPE numeric(18,6) USING unit_cost::numeric(18,6);

DROP POLICY "Loszuordnungen anlegen" ON public.sale_line_lot_allocations;

DROP POLICY "Verkaufspositionen aendern" ON public.sale_lines;

DROP POLICY "Verkaufspositionen anlegen" ON public.sale_lines;

DROP POLICY "Verkaufspositionen loeschen" ON public.sale_lines;

DROP POLICY "Bestandslose aendern" ON public.stock_lots;

DROP POLICY "Bestandslose anlegen" ON public.stock_lots;

DROP POLICY "Bestandslose loeschen" ON public.stock_lots;

DROP POLICY "Bestandsbewegungen anlegen" ON public.stock_movements;

CREATE FUNCTION public.create_purchase (
  p_workspace_id uuid,
  p_purchase     jsonb,
  p_expenses     jsonb DEFAULT '[]'::jsonb,
  p_lines        jsonb DEFAULT '[]'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_purchase public.purchases;
  v_expense jsonb;
  v_line jsonb;
  v_line_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_total_expense_cents bigint;
  v_manual_cents bigint;
  v_mode text;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_purchase) <> 'object'
    or jsonb_typeof(p_expenses) <> 'array'
    or jsonb_typeof(p_lines) <> 'array'
    or nullif(btrim(p_purchase ->> 'title'), '') is null then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  v_mode := coalesce(nullif(p_purchase ->> 'cost_allocation_mode', ''), 'even');
  if v_mode not in ('manual', 'even', 'value_weighted') then
    raise exception using errcode = '22023', message = 'Die Kostenverteilung ist ungültig.';
  end if;

  insert into public.purchases (
    workspace_id, source_id, supplier_id, type, title, purchase_date,
    purchase_price, cost_allocation_mode, notes, tracking_number,
    tracking_carrier, tracking_status, original_url, receiving_status,
    total_purchase_cost
  ) values (
    p_workspace_id,
    nullif(p_purchase ->> 'source_id', '')::uuid,
    nullif(p_purchase ->> 'supplier_id', '')::uuid,
    p_purchase ->> 'type',
    btrim(p_purchase ->> 'title'),
    (p_purchase ->> 'purchase_date')::date,
    coalesce((p_purchase ->> 'purchase_price')::numeric, 0),
    v_mode,
    nullif(btrim(p_purchase ->> 'notes'), ''),
    nullif(btrim(p_purchase ->> 'tracking_number'), ''),
    nullif(p_purchase ->> 'tracking_carrier', ''),
    coalesce(nullif(p_purchase ->> 'tracking_status', ''), 'pending'),
    nullif(p_purchase ->> 'original_url', ''),
    case when jsonb_array_length(p_lines) > 0 then 'ordered' else 'received' end,
    coalesce((p_purchase ->> 'total_purchase_cost')::numeric,
      coalesce((p_purchase ->> 'purchase_price')::numeric, 0))
  ) returning * into v_purchase;

  for v_expense in select value from jsonb_array_elements(p_expenses) loop
    if coalesce((v_expense ->> 'amount')::numeric, 0) <= 0 then
      raise exception using errcode = '22023', message = 'Zusatzkosten müssen positiv sein.';
    end if;
    insert into public.purchase_costs (purchase_id, type, amount, description)
    values (
      v_purchase.id,
      coalesce(nullif(btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(btrim(v_expense ->> 'description'), '')
    );
  end loop;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.purchase_lines (
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost
    ) values (
      p_workspace_id,
      v_purchase.id,
      nullif(v_line ->> 'catalog_product_id', '')::uuid,
      btrim(v_line ->> 'title_snapshot'),
      v_line ->> 'line_kind',
      (v_line ->> 'ordered_quantity')::integer,
      0,
      (v_line ->> 'unit_purchase_price')::numeric,
      (v_line ->> 'line_total')::numeric,
      case when v_mode = 'manual'
        then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
        else 0
      end
    ) returning id into v_line_id;
    v_line_ids := array_append(v_line_ids, v_line_id);
  end loop;

  select coalesce(round(sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.purchase_id = v_purchase.id;

  if cardinality(v_line_ids) = 0 and v_total_expense_cents > 0 then
    raise exception using errcode = '22023', message = 'Zusatzkosten benötigen mindestens eine Einkaufsposition.';
  elsif v_mode = 'manual' then
    select coalesce(round(sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using errcode = '22023', message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
    end if;
  elsif v_total_expense_cents > 0 then
    with weights as (
      select
        line.id,
        ids.ordinality,
        case
          when v_mode = 'value_weighted' and totals.value_total > 0 then line.line_total
          else line.ordered_quantity::numeric
        end as weight
      from unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
      cross join (
        select sum(candidate.line_total) as value_total
        from public.purchase_lines as candidate
        where candidate.id = any(v_line_ids)
      ) as totals
    ), shares as (
      select
        weights.*,
        v_total_expense_cents::numeric * weight / nullif(sum(weight) over (), 0) as exact_cents
      from weights
    ), ranked as (
      select
        shares.*,
        floor(exact_cents)::bigint as floor_cents,
        row_number() over (order by exact_cents - floor(exact_cents) desc, ordinality) as remainder_rank,
        v_total_expense_cents - sum(floor(exact_cents)::bigint) over () as remainder_cents
      from shares
    )
    update public.purchase_lines as line
    set allocated_additional_cost = (
      ranked.floor_cents + case when ranked.remainder_rank <= ranked.remainder_cents then 1 else 0 end
    )::numeric / 100
    from ranked
    where line.id = ranked.id;
  end if;

  return jsonb_build_object(
    'purchase', to_jsonb(v_purchase),
    'purchase_costs', coalesce((
      select jsonb_agg(to_jsonb(cost) order by cost.created_at, cost.id)
      from public.purchase_costs as cost where cost.purchase_id = v_purchase.id
    ), '[]'::jsonb),
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(line) order by ids.ordinality)
      from unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
    ), '[]'::jsonb)
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.create_purchase(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_purchase(uuid, jsonb, jsonb, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.create_purchase(uuid, jsonb, jsonb, jsonb) TO service_role;

ALTER FUNCTION public.receive_individual_purchase_line(uuid, uuid, uuid, jsonb) SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.receive_purchase_lines (
  p_workspace_id uuid,
  p_purchase_id  uuid,
  p_lines        jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_input_line jsonb;
  v_purchase public.purchases;
  v_purchase_line public.purchase_lines;
  v_stock_lot public.stock_lots;
  v_purchase_line_id uuid;
  v_received_quantity integer;
  v_received_at timestamptz;
  v_purchase_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'Die Wareneingangsdaten sind ungültig.';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'purchase_line_id') <> 'string'
      or jsonb_typeof(v_input_line -> 'received_quantity') <> 'number'
      or (v_input_line ->> 'received_quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'received_at') <> 'string' then
      raise exception using errcode = '22023', message = 'Eine Wareneingangsposition ist ungültig.';
    end if;

    v_purchase_line_id := (v_input_line ->> 'purchase_line_id')::uuid;
    v_received_quantity := (v_input_line ->> 'received_quantity')::integer;
    v_received_at := (v_input_line ->> 'received_at')::timestamptz;

    select * into v_purchase_line
    from public.purchase_lines
    where id = v_purchase_line_id
      and workspace_id = p_workspace_id
      and purchase_id = p_purchase_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Die Einkaufsposition wurde nicht gefunden.';
    end if;

    if v_purchase_line.line_kind = 'individual' then
      raise exception using errcode = '22023', message = 'Einzelartikel werden über den expliziten Einzelartikelpfad eingebucht.';
    end if;

    if v_purchase_line.received_quantity + v_received_quantity > v_purchase_line.ordered_quantity then
      raise exception using errcode = '22023', message = 'Die empfangene Menge überschreitet die bestellte Menge.';
    end if;

    update public.purchase_lines
    set received_quantity = received_quantity + v_received_quantity,
        updated_at = now()
    where id = v_purchase_line.id
      and workspace_id = p_workspace_id
    returning * into v_purchase_line;

    insert into public.stock_lots (
      workspace_id,
      purchase_id,
      purchase_line_id,
      catalog_product_id,
      received_quantity,
      remaining_quantity,
      unit_cost,
      received_at
    ) values (
      p_workspace_id,
      p_purchase_id,
      v_purchase_line.id,
      v_purchase_line.catalog_product_id,
      v_received_quantity,
      v_received_quantity,
      (v_purchase_line.line_total + v_purchase_line.allocated_additional_cost)
        / v_purchase_line.ordered_quantity,
      v_received_at
    )
    returning * into v_stock_lot;

    insert into public.stock_movements (
      workspace_id,
      stock_lot_id,
      direction,
      quantity,
      reason
    ) values (
      p_workspace_id,
      v_stock_lot.id,
      'in',
      v_received_quantity,
      'receipt'
    );

    v_purchase_line_ids := array_append(v_purchase_line_ids, v_purchase_line.id);
    v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);
  end loop;

  perform public.refresh_purchase_receiving_status(p_workspace_id, p_purchase_id);

  return jsonb_build_object(
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(purchase_line) order by purchase_line.id)
      from public.purchase_lines as purchase_line
      where purchase_line.id = any(v_purchase_line_ids)
    ), '[]'::jsonb),
    'stock_lots', coalesce((
      select jsonb_agg(to_jsonb(stock_lot) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb)
  );
end;
$function$;

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

ALTER FUNCTION public.record_sale(uuid, jsonb, jsonb) SECURITY DEFINER;

ALTER TABLE public.purchase_lines
  ADD COLUMN allocated_additional_cost numeric(12,2) DEFAULT 0 NOT NULL;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_allocated_additional_cost_check CHECK (allocated_additional_cost >= 0::numeric);