-- Zweck: Begruendete Gegenbuchung losbasierter Bestandsabgaenge.
-- Betroffen: stock_movements sowie remove_article_stock, record_sale und reverse_catalog_stock_removal.
-- Originalbelege bleiben unveraendert; Mengen und Kosten werden netto abgeglichen.

create or replace function public.record_sale (
  p_workspace_id uuid,
  p_sale         jsonb,
  p_lines        jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
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
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
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
    v_line_tax_costs := array[]::numeric[];
    v_tax_unknown := false;

    if v_catalog_product_id is not null then
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

  return jsonb_build_object(
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
end;
$function$;

create or replace function public.remove_article_stock (
  p_workspace_id uuid,
  p_article_kind text,
  p_article_id   uuid,
  p_quantity     integer,
  p_reason       text,
  p_notes        text,
  p_request_id   text
)
  returns public.stock_removals
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor uuid := (select auth.uid());
  v_removal public.stock_removals;
  v_lot public.stock_lots;
  v_item public.inventory_items;
  v_purchase_id uuid;
  v_item_ids uuid[];
  v_remaining integer := p_quantity;
  v_take integer;
  v_costs numeric[];
  v_cost numeric;
  v_cents bigint;
  v_active_quantity integer;
  v_active_cost numeric;
  v_active_cost_known boolean;
  v_removed_quantity integer;
  v_removed_cost numeric;
  v_details jsonb := '[]'::jsonb;
  v_notes text := nullif(btrim(p_notes), '');
begin
  if v_actor is null or p_workspace_id is null or p_article_id is null
    or not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_article_kind is null or p_article_kind not in ('catalog', 'item')
    or p_quantity is null or p_quantity < 1 or p_quantity > 100000
    or (p_article_kind = 'item' and p_quantity <> 1)
    or p_reason is null or p_reason not in ('damage', 'loss', 'correction')
    or p_request_id is null or length(p_request_id) not between 1 and 200
    or length(v_notes) > 1000 then
    raise exception using errcode = '22023', message = 'Bitte eine ganze Stückzahl, einen Grund und höchstens 1000 Zeichen Notiz angeben.';
  end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then raise exception using errcode = '55000', message = 'Dieser Workspace ist archiviert.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_request_id, 0));
  select * into v_removal from public.stock_removals where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if v_removal.article_kind <> p_article_kind or v_removal.article_id <> p_article_id
      or v_removal.quantity <> p_quantity or v_removal.reason <> p_reason
      or v_removal.notes is distinct from v_notes or v_removal.actor_id <> v_actor then
      raise exception using errcode = '22023', message = 'Dieser Buchungsversuch wurde bereits mit anderen Angaben verwendet.';
    end if;
    return v_removal;
  end if;

  -- Dieselbe Sperrreihenfolge wie Verkäufe und Einkaufskorrekturen: Einkauf, Artikel, Stücke, Lose.
  for v_purchase_id in
    select distinct source.purchase_id from (
      select lot.purchase_id from public.stock_lots lot where lot.workspace_id = p_workspace_id
        and p_article_kind = 'catalog' and lot.catalog_product_id = p_article_id
      union
      select coalesce(item.purchase_id, line.purchase_id) from public.inventory_items item
        left join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
        where item.workspace_id = p_workspace_id and ((p_article_kind = 'item' and item.id = p_article_id)
          or (p_article_kind = 'catalog' and line.catalog_product_id = p_article_id))
    ) source where source.purchase_id is not null order by source.purchase_id
  loop
    perform 1 from public.purchases where workspace_id = p_workspace_id and id = v_purchase_id for update;
  end loop;
  if p_article_kind = 'catalog' then
    perform 1 from public.catalog_products where workspace_id = p_workspace_id and id = p_article_id for update;
    if not found then raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.'; end if;
  end if;
  select coalesce(array_agg(item.id order by item.id), array[]::uuid[]) into v_item_ids
    from public.inventory_items item
    left join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
    where item.workspace_id = p_workspace_id and ((p_article_kind = 'item' and item.id = p_article_id)
      or (p_article_kind = 'catalog' and line.catalog_product_id = p_article_id));
  perform 1 from public.inventory_items where workspace_id = p_workspace_id and id = any(v_item_ids) order by id for update;
  if p_article_kind = 'item' and cardinality(v_item_ids) <> 1 then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  -- Ein Inserat oder offener Auftrag darf nicht heimlich einen leeren Artikel anbieten.
  if exists (select 1 from public.listings where workspace_id = p_workspace_id and status <> 'ended'
    and ((p_article_kind = 'catalog' and catalog_product_id = p_article_id) or inventory_item_id = any(v_item_ids))) then
    raise exception using errcode = '22023', message = 'Beende zuerst das Inserat dieses Artikels.';
  end if;
  if exists (select 1 from public.store_order_items oi join public.store_orders o on o.id = oi.store_order_id
    where o.workspace_id = p_workspace_id and o.status not in ('completed', 'cancelled')
      and ((p_article_kind = 'catalog' and oi.catalog_product_id = p_article_id) or oi.inventory_item_id = any(v_item_ids))) then
    raise exception using errcode = '22023', message = 'Klär zuerst den offenen Shopauftrag dieses Artikels.';
  end if;
  if exists (select 1 from public.inventory_items where workspace_id = p_workspace_id and id = any(v_item_ids) and status = 'reserved')
    or exists (select 1 from public.stock_movements m join public.stock_lots lot on lot.id = m.stock_lot_id
      where lot.workspace_id = p_workspace_id and p_article_kind = 'catalog' and lot.catalog_product_id = p_article_id
        and m.reason in ('reservation', 'reservation_release') group by lot.id
        having sum(case when m.reason = 'reservation' then m.quantity else -m.quantity end) > 0) then
    raise exception using errcode = '22023', message = 'Hebe zuerst die Reservierung dieses Artikels auf.';
  end if;
  insert into public.stock_removals(workspace_id, request_id, article_kind, article_id, quantity, reason, notes, actor_id)
    values (p_workspace_id, p_request_id, p_article_kind, p_article_id, p_quantity, p_reason, v_notes, v_actor)
    returning * into v_removal;

  for v_lot in select lot.* from public.stock_lots lot where lot.workspace_id = p_workspace_id
    and p_article_kind = 'catalog' and lot.catalog_product_id = p_article_id and lot.remaining_quantity > 0
    order by lot.received_at, lot.id for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_lot.remaining_quantity);
    v_costs := v_lot.remaining_unit_costs;
    if v_costs is null and v_lot.unit_cost is not null then
      -- Ältere Teilbestände ohne Stückkostenfolge dürfen den belegten Restpool nutzen.
      -- Unklare Teilretouren liefern keinen nachweisbaren Restpool und bleiben gesperrt.
      select coalesce(sum(a.quantity - state.restocked), 0)::integer,
        coalesce(sum(coalesce(a.active_allocated_cost, case when state.restocked = a.quantity then 0
          when state.restocked = 0 then a.allocated_cost else null end)), 0),
        coalesce(bool_and(state.restocked between 0 and a.quantity and
          (a.active_allocated_cost is not null or state.restocked in (0, a.quantity))), true)
      into v_active_quantity, v_active_cost, v_active_cost_known
      from public.sale_line_lot_allocations a
      left join lateral (
        select coalesce(sum(case when m.direction = 'in' and m.reason = 'return' then m.quantity
          when m.direction = 'out' and m.reason = 'damage' then -m.quantity else 0 end), 0)::integer as restocked
        from public.stock_movements m where m.workspace_id = a.workspace_id
          and m.stock_lot_id = a.stock_lot_id and m.sale_line_id = a.sale_line_id
      ) state on true where a.stock_lot_id = v_lot.id;
      select coalesce(sum(case when direction = 'out' then quantity else -quantity end), 0)::integer,
        coalesce(sum(case when direction = 'out' then removed_cost else -removed_cost end), 0)
        into v_removed_quantity, v_removed_cost from public.stock_movements
        where stock_lot_id = v_lot.id and stock_removal_id is not null;
      if not v_active_cost_known
        or v_lot.remaining_quantity + v_active_quantity + v_removed_quantity <> v_lot.received_quantity
        or v_lot.unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception using errcode = '22023', message = 'Die Stückkosten dieses älteren Bestands müssen zuerst geprüft werden.';
      end if;
      v_cost := round(v_lot.unit_cost * v_lot.received_quantity, 2) - v_active_cost - v_removed_cost;
      if v_cost < 0 or v_cost::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception using errcode = '22023', message = 'Die Stückkosten dieses älteren Bestands müssen zuerst geprüft werden.';
      end if;
      v_cents := round(v_cost * 100)::bigint;
      select array_agg((v_cents / v_lot.remaining_quantity + case when n <= mod(v_cents, v_lot.remaining_quantity) then 1 else 0 end)::numeric / 100 order by n)
        into v_costs from pg_catalog.generate_series(1, v_lot.remaining_quantity) n;
    end if;
    if v_costs is not null and cardinality(v_costs) <> v_lot.remaining_quantity then
      raise exception using errcode = '22023', message = 'Die Stückkosten dieses Bestands müssen zuerst geprüft werden.';
    end if;
    select sum(value) into v_cost from pg_catalog.unnest(v_costs[1:v_take]) value;
    v_details := v_details || jsonb_build_array(jsonb_build_object('stock_lot_id', v_lot.id, 'quantity', v_take,
      'unit_costs', v_costs[1:v_take], 'tax_unit_costs', v_lot.remaining_tax_unit_costs[1:v_take], 'cost', v_cost));
    update public.stock_lots set remaining_quantity = remaining_quantity - v_take,
      remaining_unit_costs = v_costs[(v_take + 1):v_lot.remaining_quantity],
      remaining_tax_unit_costs = v_lot.remaining_tax_unit_costs[(v_take + 1):v_lot.remaining_quantity]
      where workspace_id = p_workspace_id and id = v_lot.id;
    insert into public.stock_movements(workspace_id, stock_lot_id, direction, quantity, reason, stock_removal_id, removed_cost)
      values (p_workspace_id, v_lot.id, 'out', v_take, p_reason, v_removal.id, v_cost);
    v_remaining := v_remaining - v_take;
  end loop;
  for v_item in select item.* from public.inventory_items item
    join public.inventory_item_sale_states state on state.inventory_item_id = item.id and state.workspace_id = item.workspace_id
    where item.workspace_id = p_workspace_id and item.id = any(v_item_ids)
      and state.sale_state = 'no_active_sale' and item.status not in ('sold', 'archived', 'reserved') and item.stock_removed_at is null
    order by item.id
  loop
    exit when v_remaining = 0;
    update public.inventory_items set stock_removed_at = v_removal.created_at, status = 'archived'
      where workspace_id = p_workspace_id and id = v_item.id;
    v_details := v_details || jsonb_build_array(jsonb_build_object('inventory_item_id', v_item.id, 'quantity', 1,
      'cost', v_item.allocated_purchase_cost, 'tax_purchase_cost', v_item.tax_purchase_cost));
    insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, reason, changes)
      values (p_workspace_id, 'inventory_item', v_item.id, 'article_stock_removed', v_actor, p_reason,
        jsonb_build_object('quantity', jsonb_build_object('before', 1, 'after', 0), 'stock_removal_id', v_removal.id, 'notes', v_notes));
    v_remaining := v_remaining - 1;
  end loop;
  if v_remaining <> 0 then
    raise exception using errcode = '22023', message = 'Die Stückzahl übersteigt den vorhandenen, eindeutig zugeordneten Bestand. Lade den Artikel neu.';
  end if;
  -- Der unveränderliche Beleg hält die genaue Los-/Stückzuordnung und deren Kosten fest.
  insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, reason, changes)
    values (p_workspace_id, case when p_article_kind = 'catalog' then 'catalog_product' else 'inventory_item' end,
      p_article_id, 'stock_removal_recorded', v_actor, p_reason,
      jsonb_build_object('quantity', p_quantity, 'notes', v_notes, 'stock_removal_id', v_removal.id, 'allocations', v_details));
  return v_removal;
end;
$function$;

create function public.reverse_catalog_stock_removal (
  p_workspace_id     uuid,
  p_stock_removal_id bigint,
  p_reason           text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor uuid := (select auth.uid());
  v_removal public.stock_removals;
  v_event public.business_events;
  v_reversal public.business_events;
  v_movement public.stock_movements;
  v_lot public.stock_lots;
  v_allocation jsonb;
  v_costs numeric[];
  v_tax_costs numeric[];
  v_purchase_id uuid;
  v_count integer := 0;
  v_quantity integer := 0;
  v_active_quantity integer;
  v_active_cost numeric;
  v_active_cost_known boolean;
  v_removed_quantity integer;
  v_removed_cost numeric;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null or p_workspace_id is null or not public.can_access_workspace(p_workspace_id)
  then raise exception 'Kein Zugriff auf diesen Bestandsabgang.' using errcode = '42501'; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then raise exception 'Kein Zugriff auf diesen Bestandsabgang.' using errcode = '42501'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then raise exception 'Kein Zugriff auf diesen Bestandsabgang.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'Begründung für die Gegenbuchung fehlt oder ist zu lang.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':stock-removal-reversal:' || p_stock_removal_id::text, 0));
  select * into v_removal from public.stock_removals where workspace_id = p_workspace_id and id = p_stock_removal_id;
  if not found or v_removal.article_kind <> 'catalog' then
    raise exception 'Kein losbasierter Bestandsabgang vorhanden.' using errcode = '22023';
  end if;
  select * into v_reversal from public.business_events where workspace_id = p_workspace_id
    and entity_type = 'catalog_product' and entity_id = v_removal.article_id
    and event_type = 'stock_removal_reversed' and changes->>'stock_removal_id' = p_stock_removal_id::text;
  if found then
    if v_reversal.reason is distinct from v_reason or v_reversal.actor_id is distinct from v_actor then
      raise exception 'Dieser Abgang wurde bereits mit anderer Begründung gegengebucht.' using errcode = '22023';
    end if;
    return v_reversal.id;
  end if;
  begin
    select * into strict v_event from public.business_events where workspace_id = p_workspace_id
      and entity_type = 'catalog_product' and entity_id = v_removal.article_id
      and event_type = 'stock_removal_recorded' and changes->>'stock_removal_id' = p_stock_removal_id::text;
  exception when no_data_found or too_many_rows then
    raise exception 'Der ursprüngliche Ausbuchungsbeleg ist nicht eindeutig vorhanden.' using errcode = '22023';
  end;
  if jsonb_typeof(v_event.changes->'allocations') is distinct from 'array'
    or jsonb_array_length(v_event.changes->'allocations') = 0
    or exists(select 1 from jsonb_array_elements(v_event.changes->'allocations') a where not (a ? 'stock_lot_id'))
  then raise exception 'Die ursprüngliche Loszuordnung ist unvollständig.' using errcode = '22023'; end if;

  -- Dieselbe Sperrreihenfolge wie Verkauf, Ausbuchung und eBay-Reservierung.
  for v_purchase_id in select distinct l.purchase_id from public.stock_lots l
    join public.stock_movements m on m.stock_lot_id = l.id and m.workspace_id = l.workspace_id
    where m.workspace_id = p_workspace_id and m.stock_removal_id = p_stock_removal_id order by l.purchase_id
  loop
    perform 1 from public.purchases where workspace_id = p_workspace_id and id = v_purchase_id and entry_status = 'finalized' for update;
    if not found then raise exception 'Der Ursprungseinkauf muss zuerst geprüft werden.' using errcode = '22023'; end if;
  end loop;
  perform 1 from public.catalog_products where workspace_id = p_workspace_id and id = v_removal.article_id for update;
  if not found then raise exception 'Der ursprüngliche Artikel fehlt.' using errcode = '22023'; end if;
  perform l.id from public.stock_lots l where l.workspace_id = p_workspace_id and l.id in
    (select stock_lot_id from public.stock_movements where workspace_id = p_workspace_id and stock_removal_id = p_stock_removal_id)
    order by l.received_at, l.id for update;

  for v_movement in select * from public.stock_movements where workspace_id = p_workspace_id
    and stock_removal_id = p_stock_removal_id order by stock_lot_id, id
  loop
    if v_movement.direction <> 'out' or v_movement.reason <> v_removal.reason or v_movement.sale_line_id is not null then
      raise exception 'Die ursprünglichen Abgangsbewegungen sind nicht eindeutig.' using errcode = '22023';
    end if;
    select * into strict v_lot from public.stock_lots where workspace_id = p_workspace_id
      and id = v_movement.stock_lot_id and catalog_product_id = v_removal.article_id;
    select a into strict v_allocation from jsonb_array_elements(v_event.changes->'allocations') a
      where a->>'stock_lot_id' = v_lot.id::text;
    if (v_allocation->>'quantity')::integer is distinct from v_movement.quantity
      or (v_allocation->>'cost')::numeric is distinct from v_movement.removed_cost
      or jsonb_typeof(v_allocation->'unit_costs') is distinct from 'array'
      or jsonb_array_length(v_allocation->'unit_costs') <> v_movement.quantity
      or v_lot.remaining_quantity + v_movement.quantity > v_lot.received_quantity
      or coalesce(cardinality(v_lot.remaining_unit_costs), 0) <> v_lot.remaining_quantity
    then raise exception 'Die belegten Stückkosten oder Mengen müssen zuerst geprüft werden.' using errcode = '22023'; end if;
    select array_agg(value::numeric order by ordinality) into v_costs
      from jsonb_array_elements_text(v_allocation->'unit_costs') with ordinality;
    if (select sum(cost) from unnest(v_costs) cost) is distinct from v_movement.removed_cost
      or exists(select 1 from unnest(v_costs) cost where cost is null or cost < 0 or cost <> round(cost, 2) or cost::text in ('NaN','Infinity','-Infinity'))
    then raise exception 'Die belegten Stückkosten sind unvollständig.' using errcode = '22023'; end if;
    -- Spätere Einkaufskorrekturen oder unklare Teilretouren dürfen einen alten
    -- Kostenbeleg nicht stillschweigend in einen inzwischen anderen Pool einfügen.
    select coalesce(sum(a.quantity - state.restocked), 0)::integer,
      coalesce(sum(coalesce(a.active_allocated_cost, case when state.restocked = a.quantity then 0
        when state.restocked = 0 then a.allocated_cost else null end)), 0),
      coalesce(bool_and(state.restocked between 0 and a.quantity and
        (a.active_allocated_cost is not null or state.restocked in (0, a.quantity))), true)
      into v_active_quantity, v_active_cost, v_active_cost_known
      from public.sale_line_lot_allocations a left join lateral (
        select coalesce(sum(case when m.direction = 'in' and m.reason = 'return' then m.quantity
          when m.direction = 'out' and m.reason = 'damage' then -m.quantity else 0 end), 0)::integer restocked
        from public.stock_movements m where m.workspace_id = a.workspace_id
          and m.stock_lot_id = a.stock_lot_id and m.sale_line_id = a.sale_line_id
      ) state on true where a.stock_lot_id = v_lot.id;
    select coalesce(sum(case when direction = 'out' then quantity else -quantity end), 0)::integer,
      coalesce(sum(case when direction = 'out' then removed_cost else -removed_cost end), 0)
      into v_removed_quantity, v_removed_cost from public.stock_movements
      where stock_lot_id = v_lot.id and stock_removal_id is not null;
    if not v_active_cost_known or v_lot.unit_cost is null or v_lot.unit_cost::text in ('NaN','Infinity','-Infinity')
      or v_lot.remaining_quantity + v_active_quantity + v_removed_quantity <> v_lot.received_quantity
      or round(v_lot.unit_cost * v_lot.received_quantity, 2) is distinct from
        (select coalesce(sum(cost), 0) from unnest(v_lot.remaining_unit_costs) cost) + v_active_cost + v_removed_cost
    then raise exception 'Der aktuelle Mengen- und Kostenpool muss zuerst geprüft werden.' using errcode = '22023'; end if;
    v_tax_costs := null;
    if v_allocation->'tax_unit_costs' is distinct from 'null'::jsonb then
      if jsonb_typeof(v_allocation->'tax_unit_costs') is distinct from 'array'
        or jsonb_array_length(v_allocation->'tax_unit_costs') <> v_movement.quantity
      then raise exception 'Die belegten Steuerkosten sind unvollständig.' using errcode = '22023'; end if;
      select array_agg(value::numeric order by ordinality) into v_tax_costs
        from jsonb_array_elements_text(v_allocation->'tax_unit_costs') with ordinality;
      if exists(select 1 from unnest(v_tax_costs) cost where cost is null or cost < 0 or cost <> round(cost, 2) or cost::text in ('NaN','Infinity','-Infinity')) then
        raise exception 'Die belegten Steuerkosten sind unvollständig.' using errcode = '22023';
      end if;
    end if;
    update public.stock_lots set remaining_quantity = remaining_quantity + v_movement.quantity,
      remaining_unit_costs = v_costs || coalesce(remaining_unit_costs, array[]::numeric[]),
      remaining_tax_unit_costs = case when v_tax_costs is null
        or (v_lot.remaining_quantity > 0 and cardinality(v_lot.remaining_tax_unit_costs) is distinct from v_lot.remaining_quantity)
        then null else v_tax_costs || coalesce(remaining_tax_unit_costs, array[]::numeric[]) end
      where id = v_lot.id;
    insert into public.stock_movements(workspace_id,stock_lot_id,direction,quantity,reason,stock_removal_id,removed_cost)
      values(p_workspace_id,v_lot.id,'in',v_movement.quantity,'correction',p_stock_removal_id,v_movement.removed_cost);
    v_count := v_count + 1;
    v_quantity := v_quantity + v_movement.quantity;
  end loop;
  if v_quantity <> v_removal.quantity or v_count <> jsonb_array_length(v_event.changes->'allocations') then
    raise exception 'Die ursprüngliche Loszuordnung ist unvollständig.' using errcode = '22023';
  end if;
  insert into public.business_events(workspace_id,entity_type,entity_id,event_type,actor_id,reason,changes)
    values(p_workspace_id,'catalog_product',v_removal.article_id,'stock_removal_reversed',v_actor,v_reason,
      jsonb_build_object('stock_removal_id',p_stock_removal_id,'original_event_id',v_event.id,
        'quantity',v_quantity,'allocations',v_event.changes->'allocations')) returning * into v_reversal;
  return v_reversal.id;
end;
$function$;

revoke all on function public.reverse_catalog_stock_removal(uuid,bigint,text) from public,anon,authenticated,service_role;

grant all on function public.reverse_catalog_stock_removal(uuid, bigint, text) to authenticated;

create unique index stock_movements_removal_reversal_idx on public.stock_movements (stock_removal_id, stock_lot_id)
  where stock_removal_id is not null and direction = 'in'::text;
