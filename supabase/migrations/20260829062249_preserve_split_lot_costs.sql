-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.add_purchase_lines (
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
  v_purchase public.purchases;
  v_line jsonb;
  v_line_id uuid;
  v_inserted_ids uuid[] := array[]::uuid[];
  v_all_line_ids uuid[];
  v_total_expense_cents bigint;
  v_manual_cents bigint;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_purchase_id is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if exists (
    select 1 from public.purchase_lines
    where purchase_id = p_purchase_id and workspace_id = p_workspace_id
      and received_quantity > 0
  ) then
    raise exception using errcode = '22023', message = 'Nach dem ersten Wareneingang können keine Positionen ergänzt werden.';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.purchase_lines (
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost
    ) values (
      p_workspace_id,
      p_purchase_id,
      nullif(v_line ->> 'catalog_product_id', '')::uuid,
      btrim(v_line ->> 'title_snapshot'),
      v_line ->> 'line_kind',
      (v_line ->> 'ordered_quantity')::integer,
      0,
      (v_line ->> 'unit_purchase_price')::numeric,
      (v_line ->> 'line_total')::numeric,
      case when v_purchase.cost_allocation_mode = 'manual'
        then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
        else 0
      end
    ) returning id into v_line_id;
    v_inserted_ids := array_append(v_inserted_ids, v_line_id);
  end loop;

  select array_agg(line.id order by line.created_at, line.id)
  into v_all_line_ids
  from public.purchase_lines as line
  where line.purchase_id = p_purchase_id and line.workspace_id = p_workspace_id;
  select coalesce(round(sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.purchase_id = p_purchase_id;

  if v_purchase.cost_allocation_mode = 'manual' then
    select coalesce(round(sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_all_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using errcode = '22023', message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
    end if;
  else
    update public.purchase_lines
    set allocated_additional_cost = 0
    where id = any(v_all_line_ids);

    if v_total_expense_cents > 0 then
      with weights as (
        select
          line.id,
          ids.ordinality,
          case
            when v_purchase.cost_allocation_mode = 'value_weighted'
              and totals.value_total > 0 then line.line_total
            else line.ordered_quantity::numeric
          end as weight
        from unnest(v_all_line_ids) with ordinality as ids(id, ordinality)
        join public.purchase_lines as line on line.id = ids.id
        cross join (
          select sum(candidate.line_total) as value_total
          from public.purchase_lines as candidate
          where candidate.id = any(v_all_line_ids)
        ) as totals
      ), shares as (
        select weights.*,
          v_total_expense_cents::numeric * weight / nullif(sum(weight) over (), 0) as exact_cents
        from weights
      ), ranked as (
        select shares.*,
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
  end if;

  return jsonb_build_object(
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(line) order by line.created_at, line.id)
      from public.purchase_lines as line
      where line.id = any(v_inserted_ids)
    ), '[]'::jsonb)
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.add_purchase_lines(uuid, uuid, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.add_purchase_lines(uuid, uuid, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.add_purchase_lines(uuid, uuid, jsonb) TO service_role;

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

      if v_inventory_item.status in ('sold', 'archived') then
        raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
      end if;

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

ALTER TABLE public.sale_line_lot_allocations
  ADD COLUMN allocated_cost numeric(12,2) DEFAULT 0 NOT NULL;

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_allocated_cost_check CHECK (allocated_cost >= 0::numeric);