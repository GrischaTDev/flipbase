-- Purpose: allocate Mystery purchase cents globally, complete audit snapshots,
-- and reject fractional-cent sale prices in both authoritative sale RPCs.
-- Affected functions: build_purchase_costing_plan, export_audit_snapshot,
-- record_legacy_inventory_sale, record_sale.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.build_purchase_costing_plan (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_purchase public.purchases;
  v_line public.purchase_lines;
  v_cost record;
  v_line_ids uuid[];
  v_line_weights numeric[];
  v_line_goods_shares bigint[];
  v_line_additional_shares bigint[];
  v_line_total_shares bigint[];
  v_cost_shares bigint[];
  v_cost_weights numeric[];
  v_unit_goods_shares bigint[];
  v_unit_additional_shares bigint[];
  v_unit_total_shares bigint[];
  v_global_unit_goods_shares bigint[];
  v_global_unit_total_shares bigint[];
  v_goods_cents bigint := 0;
  v_additional_cents bigint := 0;
  v_total_cents bigint := 0;
  v_allocated_cents bigint := 0;
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_target_position integer := 0;
  v_global_unit_position integer := 0;
  v_lines jsonb := '[]'::jsonb;
begin
  if p_workspace_id is null or p_purchase_id is null then
    raise exception using
      errcode = '22023',
      message = 'Workspace und Einkauf sind für die Kostenberechnung erforderlich.';
  end if;

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_line_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ohne Positionen kann nicht finalisiert werden.';
  end if;

  if v_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_max_line_units > v_max_purchase_units
    or v_total_units > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  select
    pg_catalog.array_agg(line.id order by line.created_at, line.id),
    pg_catalog.array_agg(line.ordered_quantity::numeric order by line.created_at, line.id)
  into v_line_ids, v_line_weights
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_purchase.purchase_price is not null and (
    v_purchase.purchase_price::text in ('NaN', 'Infinity', '-Infinity')
    or v_purchase.purchase_price < 0
    or v_purchase.purchase_price <> pg_catalog.round(v_purchase.purchase_price, 2)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der Warenbetrag ist ungültig.';
  end if;

  if exists (
    select 1
    from public.purchase_costs as cost
    where cost.workspace_id = p_workspace_id
      and cost.purchase_id = p_purchase_id
      and (
        cost.amount::text in ('NaN', 'Infinity', '-Infinity')
        or cost.amount < 0
        or pg_catalog.scale(cost.amount) > 2
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Zusatzkosten müssen als nichtnegative ganze Cent erfasst sein.';
  end if;

  if exists (
    select 1
    from public.purchase_costs as cost
    where cost.workspace_id = p_workspace_id
      and cost.purchase_id = p_purchase_id
      and cost.allocation_method = 'direct'
      and not (cost.target_purchase_line_id = any(v_line_ids))
  ) then
    raise exception using
      errcode = '22023',
      message = 'Direkte Zusatzkosten müssen eine Position desselben Einkaufs referenzieren.';
  end if;

  select coalesce(pg_catalog.sum((cost.amount * 100)::bigint), 0)
  into v_additional_cents
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  v_line_goods_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);
  v_line_additional_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);

  if v_purchase.type = 'mystery_pack' then
    if exists (
      select 1
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.purchase_id = p_purchase_id
        and (
          line.price_mode <> 'unpriced_mystery'
          or line.unit_purchase_price is not null
          or line.line_total is not null
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Mystery-Einkaufspositionen müssen vollständig unbepreist sein.';
    end if;

    if v_purchase.purchase_price is null then
      raise exception using
        errcode = '22023',
        message = 'Mystery-Einkäufe benötigen einen ausdrücklich erfassten Warenbetrag.';
    end if;

    v_goods_cents := (v_purchase.purchase_price * 100)::bigint;
    v_total_cents := v_goods_cents + v_additional_cents;
    v_global_unit_goods_shares := public.allocate_integer_cents(
      v_goods_cents,
      pg_catalog.array_fill(1::numeric, array[v_total_units::integer])
    );
    v_global_unit_total_shares := public.allocate_integer_cents(
      v_total_cents,
      pg_catalog.array_fill(1::numeric, array[v_total_units::integer])
    );

    -- Mystery-Kosten bilden eine einzige stabile Einheitenfolge. Würden
    -- Warenwert und jede Zusatzkostenzeile separat gerundet, könnten einzelne
    -- Einheiten trotz gleicher Ausgangslage um mehrere Cent auseinanderliegen.
    for v_line_position in 1..v_line_count loop
      select line.*
      into v_line
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.id = v_line_ids[v_line_position];

      for v_item_position in 1..v_line.ordered_quantity loop
        v_global_unit_position := v_global_unit_position + 1;
        v_line_goods_shares[v_line_position] :=
          v_line_goods_shares[v_line_position]
          + v_global_unit_goods_shares[v_global_unit_position];
        v_line_additional_shares[v_line_position] :=
          v_line_additional_shares[v_line_position]
          + v_global_unit_total_shares[v_global_unit_position]
          - v_global_unit_goods_shares[v_global_unit_position];
      end loop;
    end loop;
  else
    if exists (
      select 1
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.purchase_id = p_purchase_id
        and (
          line.price_mode <> 'priced'
          or line.unit_purchase_price is null
          or line.line_total is null
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Normale Einkaufspositionen müssen vollständig bepreist sein.';
    end if;

    select pg_catalog.sum((line.line_total * 100)::bigint)
    into v_goods_cents
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id;

    if v_purchase.purchase_price is not null
      and (v_purchase.purchase_price * 100)::bigint <> v_goods_cents then
      raise exception using
        errcode = '22023',
        message = 'Der vorhandene Warenbetrag widerspricht der Summe der Einkaufspositionen.';
    end if;

    select pg_catalog.array_agg(
      (line.line_total * 100)::bigint order by line.created_at, line.id
    )
    into v_line_goods_shares
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id;

    for v_cost in
      select cost.*
      from public.purchase_costs as cost
      where cost.workspace_id = p_workspace_id
        and cost.purchase_id = p_purchase_id
      order by cost.created_at, cost.id
    loop
      if v_cost.allocation_method = 'direct' then
        v_cost_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);
        v_target_position := pg_catalog.array_position(
          v_line_ids,
          v_cost.target_purchase_line_id
        );
        v_cost_shares[v_target_position] := (v_cost.amount * 100)::bigint;
      elsif v_cost.allocation_method = 'quantity' then
        v_cost_shares := public.allocate_integer_cents(
          (v_cost.amount * 100)::bigint,
          v_line_weights
        );
      else
        select pg_catalog.array_agg(
          line.line_total order by line.created_at, line.id
        )
        into v_cost_weights
        from public.purchase_lines as line
        where line.workspace_id = p_workspace_id
          and line.purchase_id = p_purchase_id;
        v_cost_shares := public.allocate_integer_cents(
          (v_cost.amount * 100)::bigint,
          v_cost_weights
        );
      end if;

      for v_line_position in 1..v_line_count loop
        v_line_additional_shares[v_line_position] :=
          v_line_additional_shares[v_line_position] + v_cost_shares[v_line_position];
      end loop;
    end loop;
  end if;

  v_total_cents := v_goods_cents + v_additional_cents;
  v_line_total_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);

  for v_line_position in 1..v_line_count loop
    v_line_total_shares[v_line_position] :=
      v_line_goods_shares[v_line_position]
      + v_line_additional_shares[v_line_position];
  end loop;

  select pg_catalog.sum(share.value)
  into v_allocated_cents
  from pg_catalog.unnest(v_line_total_shares) as share(value);

  if v_allocated_cents <> v_total_cents then
    raise exception using
      errcode = 'P0001',
      message = 'Die Kostenverteilung stimmt nicht mit den Einkaufsgesamtkosten überein.';
  end if;

  v_global_unit_position := 0;
  for v_line_position in 1..v_line_count loop
    select line.*
    into v_line
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.id = v_line_ids[v_line_position];

    if v_purchase.type = 'mystery_pack' then
      v_unit_total_shares := pg_catalog.array_fill(
        0::bigint,
        array[v_line.ordered_quantity]
      );
      for v_item_position in 1..v_line.ordered_quantity loop
        v_global_unit_position := v_global_unit_position + 1;
        v_unit_total_shares[v_item_position] :=
          v_global_unit_total_shares[v_global_unit_position];
      end loop;
    else
      v_unit_goods_shares := public.allocate_integer_cents(
        v_line_goods_shares[v_line_position],
        pg_catalog.array_fill(1::numeric, array[v_line.ordered_quantity])
      );
      v_unit_additional_shares := public.allocate_integer_cents(
        v_line_additional_shares[v_line_position],
        pg_catalog.array_fill(1::numeric, array[v_line.ordered_quantity])
      );
      v_unit_total_shares := pg_catalog.array_fill(
        0::bigint,
        array[v_line.ordered_quantity]
      );
      for v_item_position in 1..v_line.ordered_quantity loop
        v_unit_total_shares[v_item_position] :=
          v_unit_goods_shares[v_item_position]
          + v_unit_additional_shares[v_item_position];
      end loop;
    end if;

    v_lines := v_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'lineId', v_line.id,
        'goodsCents', v_line_goods_shares[v_line_position],
        'additionalCents', v_line_additional_shares[v_line_position],
        'totalCents', v_line_total_shares[v_line_position],
        'unitTotalCents', pg_catalog.to_jsonb(v_unit_total_shares)
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'goodsCents', v_goods_cents,
    'additionalCents', v_additional_cents,
    'totalCents', v_total_cents,
    'allocatedCents', v_allocated_cents,
    'lines', v_lines
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_audit_snapshot (
  p_workspace_id uuid,
  p_filter       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_table text;
  v_rows jsonb;
  v_count bigint;
  v_total bigint := 0;
  v_result jsonb := jsonb_build_object(
    'captured_at', statement_timestamp(),
    'snapshot', pg_current_snapshot()::text
  );
begin
  if v_actor_id is null or not exists (
    select 1 from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.user_id = v_actor_id
      and member.role in ('owner', 'admin', 'accountant')
  ) then
    raise exception using errcode = '42501', message = 'Keine Berechtigung für das Prüfarchiv.';
  end if;
  if p_filter is null or jsonb_typeof(p_filter) <> 'object' then
    raise exception using errcode = '22023', message = 'Der Archivfilter muss ein JSON-Objekt sein.';
  end if;

  -- STABLE hält auch diese einzelnen SELECTs im Snapshot des RPC-Aufrufs.
  -- Die Tabellenliste ist geschlossen; keine Bezeichner aus Client-Eingaben.
  foreach v_table in array array[
    'sources', 'suppliers', 'catalog_products',
    'purchases', 'purchase_lines', 'purchase_costs', 'inventory_items',
    'stock_lots', 'stock_movements', 'sales', 'sale_lines',
    'sale_cost_entries', 'sale_line_lot_allocations', 'returns',
    'inventory_reconciliation_events', 'invoices', 'invoice_items',
    'item_costs', 'business_events'
  ] loop
    if v_table = 'item_costs' then
      select count(*) into v_count from public.item_costs as cost
        join public.inventory_items as item on item.id = cost.inventory_item_id
        where item.workspace_id = p_workspace_id;
    elsif v_table = 'invoice_items' then
      select count(*) into v_count from public.invoice_items as item
        join public.invoices as invoice on invoice.id = item.invoice_id
        where invoice.workspace_id = p_workspace_id;
    else
      execute format('select count(*) from public.%I where workspace_id = $1', v_table)
        into v_count using p_workspace_id;
    end if;
    v_total := v_total + v_count;
    if v_total > 100000 then
      raise exception using errcode = '54000', message = 'Das Prüfarchiv überschreitet 100000 Datensätze. Es wurde kein Teilarchiv erstellt.';
    end if;

    if v_table = 'item_costs' then
      select coalesce(jsonb_agg(to_jsonb(cost) order by cost.id), '[]'::jsonb)
        into v_rows from public.item_costs as cost
        join public.inventory_items as item on item.id = cost.inventory_item_id
        where item.workspace_id = p_workspace_id;
    elsif v_table = 'invoice_items' then
      select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
        into v_rows from public.invoice_items as item
        join public.invoices as invoice on invoice.id = item.invoice_id
        where invoice.workspace_id = p_workspace_id;
    elsif v_table = 'business_events' then
      select coalesce(jsonb_agg(to_jsonb(event) order by event.created_at, event.id), '[]'::jsonb)
        into v_rows from public.business_events as event
        where event.workspace_id = p_workspace_id
          and (p_filter ->> 'entity_type' is null or event.entity_type = p_filter ->> 'entity_type')
          and (p_filter ->> 'entity_id' is null or event.entity_id = (p_filter ->> 'entity_id')::uuid)
          and (p_filter ->> 'event_type' is null or event.event_type = p_filter ->> 'event_type')
          and (p_filter ->> 'actor_id' is null or event.actor_id = (p_filter ->> 'actor_id')::uuid)
          and (p_filter ->> 'from' is null or event.created_at >= (p_filter ->> 'from')::timestamptz)
          and (p_filter ->> 'to' is null or event.created_at <= (p_filter ->> 'to')::timestamptz);
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(entry) order by entry.id), ''[]''::jsonb) from public.%I as entry where workspace_id = $1', v_table)
        into v_rows using p_workspace_id;
    end if;
    v_result := v_result || jsonb_build_object(v_table, v_rows);
    if octet_length(v_result::text) > 52428800 then
      raise exception using errcode = '54000', message = 'Das Prüfarchiv überschreitet 50 MiB. Es wurde kein Teilarchiv erstellt.';
    end if;
  end loop;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_legacy_inventory_sale (
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
  v_shipping_revenue numeric(12,2) := 0;
  v_shipping_mode text;
  v_cost_entries jsonb := '[]'::jsonb;
  v_cost_entry jsonb;
  v_packaging_cost numeric(12,2) := 0;
  v_other_costs numeric(12,2) := 0;
  v_money_key text;
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
    or (p_sale ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
    or (p_sale ->> 'unit_sale_price')::numeric <= 0 then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungueltig.';
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
    platform_fee, shipping_cost, packaging_cost, other_costs, shipping_revenue, shipping_mode,
    external_order_id, external_listing_id, buyer_notes
  ) values (
    p_workspace_id, null, trim(p_sale ->> 'platform'),
    v_unit_sale_price + v_shipping_revenue, v_unit_sale_price + v_shipping_revenue, (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    v_packaging_cost,
    v_other_costs,
    v_shipping_revenue,
    v_shipping_mode,
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), '')
  ) returning * into v_sale;

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
    'cost_entries', coalesce((
      select jsonb_agg(to_jsonb(cost_entry) order by cost_entry.id)
      from public.sale_cost_entries as cost_entry
      where cost_entry.sale_id = v_sale.id
    ), '[]'::jsonb),
    'sale_lines', jsonb_build_array(to_jsonb(v_sale_line)),
    'lot_allocations', '[]'::jsonb,
    'stock_movements', '[]'::jsonb,
    'event', to_jsonb(v_event)
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
  v_source_purchase_id uuid;
  v_source_purchase_status text;
  v_locked_purchase_ids uuid[] := array[]::uuid[];
  v_quantity integer;
  v_unit_sale_price numeric(12, 2);
  v_line_total numeric(12, 2);
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

        v_allocated_quantity := least(v_remaining_quantity, v_stock_lot.remaining_quantity);

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
            <> v_stock_lot.received_quantity then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Mengen eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        if v_stock_lot.unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
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
        v_remaining_lot_cost := v_lot_total_cost - v_previously_allocated_cost;

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

        update public.stock_lots
        set remaining_quantity = remaining_quantity - v_allocated_quantity
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
          active_allocated_cost
        ) values (
          p_workspace_id,
          v_sale_line.id,
          v_stock_lot.id,
          v_allocated_quantity,
          v_stock_lot.unit_cost,
          v_allocation_cost,
          v_consumption_sequence,
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
            select coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0)
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
