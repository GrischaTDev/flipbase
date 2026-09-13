-- Trennt steuerlichen Einkaufspreis von Vollkosten; historische Werte bleiben null.
-- Betroffen: purchase_costs, inventory_items, stock_lots, sale_lines, sale_line_lot_allocations
-- sowie Abschluss-, Korrektur-, Verkaufs- und Retourenfunktionen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

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
  v_line_tax_shares bigint[];
  v_unit_tax_shares bigint[];
  v_global_tax_shares bigint[];
  v_tax_additional_cents bigint := 0;
  v_tax_unknown boolean := false;
  v_line public.purchase_lines;
  v_cost record;
  v_line_ids uuid[];
  v_line_weights numeric[];
  v_line_goods_shares bigint[];
  v_discount_shares bigint[];
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
  v_discount_cents bigint := 0;
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

  if v_purchase.content_status = 'unknown' then
    raise exception using
      errcode = '22023',
      message = 'Der Inhalt muss vor dem Abschluss vollständig erfasst sein.';
  end if;

  v_discount_cents := (coalesce(v_purchase.discount_amount, 0) * 100)::bigint;
  if v_purchase.purchase_price is not null
    and v_discount_cents > (v_purchase.purchase_price * 100)::bigint then
    raise exception using
      errcode = '22023',
      message = 'Der Rabatt darf den Warenbetrag nicht übersteigen.';
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

  if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
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

    v_goods_cents := (v_purchase.purchase_price * 100)::bigint - v_discount_cents;
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

    v_discount_shares := public.allocate_integer_cents(v_discount_cents, v_line_goods_shares);
    for v_line_position in 1..v_line_count loop
      v_line_goods_shares[v_line_position] :=
        v_line_goods_shares[v_line_position] - v_discount_shares[v_line_position];
    end loop;
    v_goods_cents := v_goods_cents - v_discount_cents;

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

  -- Unbekannte Belegzuordnung bleibt unbekannt; keine automatische Altklassifizierung.
  select coalesce(pg_catalog.bool_or(cost.tax_treatment is null), false),
    coalesce(pg_catalog.sum(case when cost.tax_treatment = 'purchase_price'
      then (cost.amount * 100)::bigint else 0 end), 0)
  into v_tax_unknown, v_tax_additional_cents
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id and cost.purchase_id = p_purchase_id;
  v_line_tax_shares := v_line_goods_shares;
  if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
    v_global_tax_shares := public.allocate_integer_cents(v_goods_cents + v_tax_additional_cents,
      pg_catalog.array_fill(1::numeric, array[v_total_units::integer]));
  else
    for v_cost in select cost.* from public.purchase_costs as cost
      where cost.workspace_id = p_workspace_id and cost.purchase_id = p_purchase_id
        and cost.tax_treatment = 'purchase_price'
      order by cost.created_at, cost.id
    loop
      if v_cost.allocation_method = 'direct' then
        v_cost_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);
        v_cost_shares[pg_catalog.array_position(v_line_ids, v_cost.target_purchase_line_id)] := (v_cost.amount * 100)::bigint;
      elsif v_cost.allocation_method = 'quantity' then
        v_cost_shares := public.allocate_integer_cents((v_cost.amount * 100)::bigint, v_line_weights);
      else
        select pg_catalog.array_agg(line.line_total order by line.created_at, line.id)
        into v_cost_weights from public.purchase_lines as line
        where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id;
        v_cost_shares := public.allocate_integer_cents((v_cost.amount * 100)::bigint, v_cost_weights);
      end if;
      for v_line_position in 1..v_line_count loop
        v_line_tax_shares[v_line_position] := v_line_tax_shares[v_line_position] + v_cost_shares[v_line_position];
      end loop;
    end loop;
  end if;

  v_global_unit_position := 0;
  for v_line_position in 1..v_line_count loop
    select line.*
    into v_line
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.id = v_line_ids[v_line_position];

    if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
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

    if v_tax_unknown then
      v_unit_tax_shares := null;
    elsif v_global_tax_shares is not null then
      v_unit_tax_shares := v_global_tax_shares[(v_global_unit_position - v_line.ordered_quantity + 1):v_global_unit_position];
    else
      -- Dieselben Waren-/Zusatzkostenanteile wie beim betrieblichen Wareneinsatz:
      -- Zusammenrunden würde einzelne steuerliche Stückkosten verschieben.
      v_unit_tax_shares := public.allocate_integer_cents(
        v_line_tax_shares[v_line_position] - v_line_goods_shares[v_line_position],
        pg_catalog.array_fill(1::numeric, array[v_line.ordered_quantity]));
      for v_item_position in 1..v_line.ordered_quantity loop
        v_unit_tax_shares[v_item_position] := v_unit_goods_shares[v_item_position] + v_unit_tax_shares[v_item_position];
      end loop;
    end if;

    v_lines := v_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'lineId', v_line.id,
        'goodsCents', v_line_goods_shares[v_line_position],
        'additionalCents', v_line_additional_shares[v_line_position],
        'totalCents', v_line_total_shares[v_line_position],
        'unitTotalCents', pg_catalog.to_jsonb(v_unit_total_shares),
        'unitTaxPurchaseCents', pg_catalog.to_jsonb(v_unit_tax_shares)
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

CREATE OR REPLACE FUNCTION public.correct_purchase_costing (
  p_workspace_id   uuid,
  p_purchase_id    uuid,
  p_reason         text,
  p_purchase_price numeric,
  p_lines          jsonb,
  p_costs          jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_purchase public.purchases;
  v_existing_line public.purchase_lines;
  v_line public.purchase_lines;
  v_existing_cost public.purchase_costs;
  v_lot public.stock_lots;
  v_allocation public.sale_line_lot_allocations;
  v_cohort record;
  v_input_line jsonb;
  v_input_cost jsonb;
  v_costing_plan jsonb;
  v_line_plan jsonb;
  v_existing_line_ids uuid[] := array[]::uuid[];
  v_input_line_ids uuid[] := array[]::uuid[];
  v_input_cost_ids uuid[] := array[]::uuid[];
  v_item_ids uuid[];
  v_lot_ids uuid[];
  v_sale_line_ids uuid[];
  v_unit_shares bigint[];
  v_tax_unit_costs numeric[];
  v_lot_unit_shares bigint[];
  v_line_id uuid;
  v_cost_id uuid;
  v_catalog_product_id uuid;
  v_target_line_id uuid;
  v_goods_cents bigint;
  v_total_cents bigint;
  v_allocated_cents bigint;
  v_lot_total_cents bigint;
  v_allocation_cost_cents bigint;
  v_active_allocation_cost_cents bigint;
  v_unit_offset integer;
  v_active_unit_offset integer;
  v_restocked_quantity integer;
  v_active_quantity integer;
  v_existing_count integer;
  v_stock_lot_id uuid;
  v_before_purchase jsonb;
  v_after_purchase jsonb;
  v_before_lines jsonb;
  v_after_lines jsonb;
  v_before_costs jsonb;
  v_after_costs jsonb;
  v_before_items jsonb;
  v_after_items jsonb;
  v_before_lots jsonb;
  v_after_lots jsonb;
  v_before_sale_lines jsonb;
  v_after_sale_lines jsonb;
  v_before_allocations jsonb;
  v_after_allocations jsonb;
  v_before_cogs numeric(18,2) := 0;
  v_after_cogs numeric(18,2) := 0;
  v_event_id uuid;
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_persisted_line_count integer := 0;
  v_persisted_unit_total bigint := 0;
  v_persisted_unit_max integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_sale_history_state text;
begin
  if v_actor_id is null
    or p_workspace_id is null
    or p_purchase_id is null
    or not exists (
      select 1
      from public.workspace_members as member
      where member.workspace_id = p_workspace_id
        and member.user_id = v_actor_id
    ) then
    raise exception using
      errcode = '42501',
      message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if nullif(pg_catalog.btrim(p_reason), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Ein verständlicher Grund der Korrektur ist erforderlich.';
  end if;

  if pg_catalog.length(pg_catalog.btrim(p_reason)) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Der Grund der Korrektur ist zu lang.';
  end if;

  if p_lines is null
    or pg_catalog.jsonb_typeof(p_lines) <> 'array'
    or pg_catalog.jsonb_array_length(p_lines) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
  end if;

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  select
    coalesce(pg_catalog.max(candidate.quantity), 0),
    coalesce(pg_catalog.sum(candidate.quantity), 0)
  into v_requested_unit_max, v_requested_unit_total
  from (
    select case
      when pg_catalog.jsonb_typeof(element.value) = 'object'
        and pg_catalog.jsonb_typeof(element.value -> 'ordered_quantity') = 'number'
        and element.value ->> 'ordered_quantity' ~ '^[1-9][0-9]*$'
      then (element.value ->> 'ordered_quantity')::numeric
      else null
    end as quantity
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  ) as candidate;

  if v_requested_unit_max > v_max_purchase_units
    or v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  if p_costs is null
    or pg_catalog.jsonb_typeof(p_costs) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'Die Ersatz-Zusatzkosten sind ungültig.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status <> 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Nur ein finalisierter Einkauf kann korrigiert werden.';
  end if;

  v_sale_history_state := public.get_purchase_sale_history_state(
    p_workspace_id,
    p_purchase_id
  );
  if v_sale_history_state = 'review_required' then
    raise exception using
      errcode = '22023',
      message = 'Der Verkaufsstatus ist unvollständig. Bitte Verkaufsdaten prüfen und nachpflegen.';
  elsif v_sale_history_state = 'none' then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ohne Verkauf muss wieder geöffnet werden.';
  elsif v_sale_history_state <> 'recorded' then
    raise exception using
      errcode = '22023',
      message = 'Der Verkaufsverlauf konnte nicht sicher geprüft werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_persisted_line_count, v_persisted_unit_total, v_persisted_unit_max
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_persisted_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_persisted_unit_max > v_max_purchase_units
    or v_persisted_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
    if p_purchase_price is null
      or p_purchase_price = 'NaN'::numeric
      or p_purchase_price < 0
      or pg_catalog.scale(p_purchase_price) > 2 then
      raise exception using
        errcode = '22023',
        message = 'Der korrigierte Mystery-Kaufpreis ist ungültig.';
    end if;
  elsif p_purchase_price is not null then
    raise exception using
      errcode = '22023',
      message = 'Normale Einkäufe leiten den Kaufpreis ausschließlich aus den Positionen ab.';
  end if;

  perform line.id
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
  order by line.created_at, line.id
  for update;

  perform cost.id
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id
  order by cost.created_at, cost.id
  for update;

  perform item.id
  from public.inventory_items as item
  left join public.purchase_lines as linked_line
    on linked_line.id = item.purchase_line_id
  where item.workspace_id = p_workspace_id
    and (
      item.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by item.created_at, item.id
  for update of item;

  perform lot.id
  from public.stock_lots as lot
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.workspace_id = p_workspace_id
    and (
      lot.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by lot.received_at, lot.id
  for update of lot;

  perform allocation.id
  from public.sale_line_lot_allocations as allocation
  join public.stock_lots as lot
    on lot.workspace_id = allocation.workspace_id
    and lot.id = allocation.stock_lot_id
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where allocation.workspace_id = p_workspace_id
    and (
      lot.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by allocation.created_at, allocation.id
  for update of allocation;

  select pg_catalog.array_agg(affected.sale_line_id order by affected.sale_line_id)
  into v_sale_line_ids
  from (
    select sale_line.id as sale_line_id
    from public.sale_lines as sale_line
    join public.inventory_items as item
      on item.workspace_id = sale_line.workspace_id
      and item.id = sale_line.inventory_item_id
    left join public.purchase_lines as linked_line
      on linked_line.id = item.purchase_line_id
    where sale_line.workspace_id = p_workspace_id
      and (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
    union
    select allocation.sale_line_id
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where allocation.workspace_id = p_workspace_id
      and (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
  ) as affected;

  if coalesce(pg_catalog.cardinality(v_sale_line_ids), 0) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ohne Verkauf muss wieder geöffnet werden.';
  end if;

  perform sale_line.id
  from public.sale_lines as sale_line
  where sale_line.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids)
  order by sale_line.created_at, sale_line.id
  for update;

  perform sale.id
  from public.sales as sale
  join public.sale_lines as sale_line
    on sale_line.workspace_id = sale.workspace_id
    and sale_line.sale_id = sale.id
  where sale.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids)
  order by sale.created_at, sale.id
  for update of sale;

  if exists (
    select 1
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line
      on sale_line.workspace_id = allocation.workspace_id
      and sale_line.id = allocation.sale_line_id
    join public.sales as sale
      on sale.workspace_id = sale_line.workspace_id
      and sale.id = sale_line.sale_id
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    where allocation.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and allocation.consumption_sequence is null
    group by allocation.stock_lot_id, sale.created_at, allocation.created_at
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die historische Losentnahmereihenfolge ist nicht eindeutig. Bitte vor der Korrektur manuell prüfen.';
  end if;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = item.purchase_line_id
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or item.purchase_line_id is null
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'individual'
      )
  ) or exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        lot.workspace_id <> p_workspace_id
        or lot.purchase_id <> p_purchase_id
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'quantity'
        or lot.catalog_product_id <> linked_line.catalog_product_id
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.';
  end if;

  select coalesce(pg_catalog.array_agg(line.id order by line.created_at, line.id), array[]::uuid[])
  into v_existing_line_ids
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  v_before_purchase := pg_catalog.jsonb_build_object(
    'purchase_price', v_purchase.purchase_price,
    'total_purchase_cost', v_purchase.total_purchase_cost,
    'entry_status', v_purchase.entry_status,
    'finalized_at', v_purchase.finalized_at,
    'finalized_by', v_purchase.finalized_by
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', line.id,
    'title_snapshot', line.title_snapshot,
    'line_kind', line.line_kind,
    'ordered_quantity', line.ordered_quantity,
    'price_mode', line.price_mode,
    'unit_purchase_price', line.unit_purchase_price,
    'line_total', line.line_total,
    'condition_snapshot', line.condition_snapshot,
    'estimated_market_value', line.estimated_market_value,
    'allocated_additional_cost', line.allocated_additional_cost,
    'allocated_total_cost', line.allocated_total_cost
  ) order by line.created_at, line.id), '[]'::jsonb)
  into v_before_lines
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', cost.id,
    'type', cost.type,
    'amount', cost.amount,
    'tax_treatment', cost.tax_treatment,
    'description', cost.description,
    'allocation_method', cost.allocation_method,
    'target_purchase_line_id', cost.target_purchase_line_id
  ) order by cost.created_at, cost.id), '[]'::jsonb)
  into v_before_costs
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', item.id,
    'purchase_line_id', item.purchase_line_id,
    'status', item.status,
    'tax_purchase_cost', item.tax_purchase_cost,
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_before_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
    'purchase_line_id', lot.purchase_line_id,
    'received_quantity', lot.received_quantity,
    'remaining_quantity', lot.remaining_quantity,
    'unit_tax_purchase_cost', lot.unit_tax_purchase_cost,
    'remaining_tax_unit_costs', lot.remaining_tax_unit_costs,
    'remaining_unit_costs', lot.remaining_unit_costs,
    'unit_cost', lot.unit_cost
  ) order by lot.received_at, lot.id), '[]'::jsonb)
  into v_before_lots
  from public.stock_lots as lot
  where lot.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', sale_line.id,
    'sale_id', sale_line.sale_id,
    'cost_of_goods_sold', sale_line.cost_of_goods_sold
  ) order by sale_line.created_at, sale_line.id), '[]'::jsonb),
    coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0)
  into v_before_sale_lines, v_before_cogs
  from public.sale_lines as sale_line
  where sale_line.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', allocation.id,
    'sale_line_id', allocation.sale_line_id,
    'stock_lot_id', allocation.stock_lot_id,
    'quantity', allocation.quantity,
    'unit_cost', allocation.unit_cost,
    'allocated_cost', allocation.allocated_cost,
    'tax_purchase_cost', allocation.tax_purchase_cost,
    'tax_cost_allocations', allocation.tax_cost_allocations,
    'active_tax_unit_costs', allocation.active_tax_unit_costs,
    'active_unit_costs', allocation.active_unit_costs,
    'active_allocated_cost', allocation.active_allocated_cost,
    'consumption_sequence', allocation.consumption_sequence
  ) order by allocation.created_at, allocation.id), '[]'::jsonb)
  into v_before_allocations
  from public.sale_line_lot_allocations as allocation
  join public.stock_lots as lot
    on lot.workspace_id = allocation.workspace_id
    and lot.id = allocation.stock_lot_id
  where allocation.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  for v_input_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_input_line) <> 'object'
      or not (v_input_line ?& array[
        'id', 'catalog_product_id', 'title_snapshot', 'line_kind',
        'ordered_quantity', 'price_mode', 'unit_purchase_price', 'line_total',
        'condition_snapshot', 'estimated_market_value'
      ])
      or v_input_line - array[
        'id', 'catalog_product_id', 'title_snapshot', 'line_kind',
        'ordered_quantity', 'price_mode', 'unit_purchase_price', 'line_total',
        'condition_snapshot', 'estimated_market_value'
      ]::text[] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_input_line -> 'id') <> 'string'
      or (v_input_line ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_input_line -> 'title_snapshot') <> 'string'
      or nullif(pg_catalog.btrim(v_input_line ->> 'title_snapshot'), '') is null
      or pg_catalog.jsonb_typeof(v_input_line -> 'line_kind') <> 'string'
      or v_input_line ->> 'line_kind' not in ('quantity', 'individual')
      or pg_catalog.jsonb_typeof(v_input_line -> 'ordered_quantity') <> 'number'
      or (v_input_line ->> 'ordered_quantity') !~ '^[1-9][0-9]*$'
      or pg_catalog.jsonb_typeof(v_input_line -> 'price_mode') <> 'string'
      or v_input_line ->> 'price_mode' not in ('priced', 'unpriced_mystery')
      or pg_catalog.jsonb_typeof(v_input_line -> 'catalog_product_id') not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(v_input_line -> 'catalog_product_id') = 'string'
        and (v_input_line ->> 'catalog_product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      or pg_catalog.jsonb_typeof(v_input_line -> 'condition_snapshot') not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(v_input_line -> 'condition_snapshot') = 'string'
        and v_input_line ->> 'condition_snapshot' not in (
          'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
        )
      )
      or pg_catalog.jsonb_typeof(v_input_line -> 'estimated_market_value') not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_input_line -> 'estimated_market_value') = 'number'
        and (
          (v_input_line ->> 'estimated_market_value')::numeric < 0
          or pg_catalog.scale((v_input_line ->> 'estimated_market_value')::numeric) > 2
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
    end if;

    v_line_id := (v_input_line ->> 'id')::uuid;
    if v_line_id = any(v_input_line_ids) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
    end if;
    v_input_line_ids := pg_catalog.array_append(v_input_line_ids, v_line_id);

    v_catalog_product_id := case
      when pg_catalog.jsonb_typeof(v_input_line -> 'catalog_product_id') = 'null'
        then null
      else (v_input_line ->> 'catalog_product_id')::uuid
    end;

    if (v_input_line ->> 'line_kind' = 'quantity' and v_catalog_product_id is null)
      or (v_input_line ->> 'line_kind' = 'individual' and v_catalog_product_id is not null)
      or (
        v_catalog_product_id is not null
        and not exists (
          select 1
          from public.catalog_products as product
          where product.workspace_id = p_workspace_id
            and product.id = v_catalog_product_id
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
    end if;

    if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
      if v_input_line ->> 'price_mode' <> 'unpriced_mystery'
        or pg_catalog.jsonb_typeof(v_input_line -> 'unit_purchase_price') <> 'null'
        or pg_catalog.jsonb_typeof(v_input_line -> 'line_total') <> 'null' then
        raise exception using
          errcode = '22023',
          message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
      end if;
    elsif v_input_line ->> 'price_mode' <> 'priced'
      or pg_catalog.jsonb_typeof(v_input_line -> 'unit_purchase_price') <> 'number'
      or pg_catalog.jsonb_typeof(v_input_line -> 'line_total') <> 'number'
      or (v_input_line ->> 'unit_purchase_price')::numeric < 0
      or (v_input_line ->> 'line_total')::numeric < 0
      or pg_catalog.scale((v_input_line ->> 'unit_purchase_price')::numeric) > 16
      or pg_catalog.scale((v_input_line ->> 'line_total')::numeric) > 2
      or (v_input_line ->> 'line_total')::numeric <>
        pg_catalog.round(
          (v_input_line ->> 'ordered_quantity')::integer
          * (v_input_line ->> 'unit_purchase_price')::numeric,
          2
        ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
    end if;

    select line.*
    into v_existing_line
    from public.purchase_lines as line
    where line.id = v_line_id
    for update;

    if found then
      if v_existing_line.workspace_id <> p_workspace_id
        or v_existing_line.purchase_id <> p_purchase_id
        or v_existing_line.line_kind <> v_input_line ->> 'line_kind'
        or v_existing_line.ordered_quantity <> (v_input_line ->> 'ordered_quantity')::integer
        or v_existing_line.catalog_product_id is distinct from v_catalog_product_id then
        raise exception using
          errcode = '22023',
          message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
      end if;

      update public.purchase_lines
      set title_snapshot = pg_catalog.btrim(v_input_line ->> 'title_snapshot'),
          ean_snapshot = case
            when v_input_line ? 'ean_snapshot'
              then nullif(pg_catalog.btrim(v_input_line ->> 'ean_snapshot'), '')
            else ean_snapshot
          end,
          price_mode = v_input_line ->> 'price_mode',
          unit_purchase_price = case
            when pg_catalog.jsonb_typeof(v_input_line -> 'unit_purchase_price') = 'null'
              then null
            else (v_input_line ->> 'unit_purchase_price')::numeric
          end,
          line_total = case
            when pg_catalog.jsonb_typeof(v_input_line -> 'line_total') = 'null'
              then null
            else (v_input_line ->> 'line_total')::numeric
          end,
          condition_snapshot = case
            when pg_catalog.jsonb_typeof(v_input_line -> 'condition_snapshot') = 'null'
              then null
            else v_input_line ->> 'condition_snapshot'
          end,
          estimated_market_value = case
            when pg_catalog.jsonb_typeof(v_input_line -> 'estimated_market_value') = 'null'
              then null
            else (v_input_line ->> 'estimated_market_value')::numeric
          end,
          updated_at = v_changed_at
      where workspace_id = p_workspace_id
        and id = v_line_id;
    else
      insert into public.purchase_lines (
        id,
        workspace_id,
        purchase_id,
        catalog_product_id,
        title_snapshot,
        ean_snapshot,
        line_kind,
        ordered_quantity,
        received_quantity,
        unit_purchase_price,
        line_total,
        price_mode,
        condition_snapshot,
        estimated_market_value,
        allocated_additional_cost,
        allocated_total_cost,
        created_at,
        updated_at
      ) values (
        v_line_id,
        p_workspace_id,
        p_purchase_id,
        v_catalog_product_id,
        pg_catalog.btrim(v_input_line ->> 'title_snapshot'),
        nullif(pg_catalog.btrim(v_input_line ->> 'ean_snapshot'), ''),
        v_input_line ->> 'line_kind',
        (v_input_line ->> 'ordered_quantity')::integer,
        0,
        case
          when pg_catalog.jsonb_typeof(v_input_line -> 'unit_purchase_price') = 'null'
            then null
          else (v_input_line ->> 'unit_purchase_price')::numeric
        end,
        case
          when pg_catalog.jsonb_typeof(v_input_line -> 'line_total') = 'null'
            then null
          else (v_input_line ->> 'line_total')::numeric
        end,
        v_input_line ->> 'price_mode',
        case
          when pg_catalog.jsonb_typeof(v_input_line -> 'condition_snapshot') = 'null'
            then null
          else v_input_line ->> 'condition_snapshot'
        end,
        case
          when pg_catalog.jsonb_typeof(v_input_line -> 'estimated_market_value') = 'null'
            then null
          else (v_input_line ->> 'estimated_market_value')::numeric
        end,
        0,
        0,
        v_changed_at,
        v_changed_at
      );
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.unnest(v_existing_line_ids) as existing_line(id)
    where not (existing_line.id = any(v_input_line_ids))
  ) then
    raise exception using
      errcode = '22023',
      message = 'Bestehende Einkaufspositionen dürfen bei einer Korrektur nicht entfernt werden.';
  end if;

  for v_input_cost in
    select element.value
    from pg_catalog.jsonb_array_elements(p_costs) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_input_cost) <> 'object'
      or not (v_input_cost ?& array[
        'id', 'type', 'amount', 'description', 'allocation_method',
        'target_purchase_line_id'
      ])
      or v_input_cost - 'tax_treatment' - array[
        'id', 'type', 'amount', 'description', 'allocation_method',
        'target_purchase_line_id'
      ]::text[] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_input_cost -> 'id') <> 'string'
      or (v_input_cost ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_input_cost -> 'type') <> 'string'
      or nullif(pg_catalog.btrim(v_input_cost ->> 'type'), '') is null
      or pg_catalog.jsonb_typeof(v_input_cost -> 'amount') <> 'number'
      or (v_input_cost ->> 'amount')::numeric < 0
      or pg_catalog.scale((v_input_cost ->> 'amount')::numeric) > 2
      or pg_catalog.jsonb_typeof(v_input_cost -> 'description') not in ('null', 'string')
      or pg_catalog.jsonb_typeof(v_input_cost -> 'allocation_method') <> 'string'
      or v_input_cost ->> 'allocation_method' not in ('value_weighted', 'quantity', 'direct')
      or pg_catalog.jsonb_typeof(v_input_cost -> 'target_purchase_line_id') not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(v_input_cost -> 'target_purchase_line_id') = 'string'
        and (v_input_cost ->> 'target_purchase_line_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Zusatzkosten sind ungültig.';
    end if;

    v_cost_id := (v_input_cost ->> 'id')::uuid;
    if v_cost_id = any(v_input_cost_ids) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Zusatzkosten sind ungültig.';
    end if;
    v_input_cost_ids := pg_catalog.array_append(v_input_cost_ids, v_cost_id);

    v_target_line_id := case
      when pg_catalog.jsonb_typeof(v_input_cost -> 'target_purchase_line_id') = 'null'
        then null
      else (v_input_cost ->> 'target_purchase_line_id')::uuid
    end;

    if (
        v_input_cost ->> 'allocation_method' = 'direct'
        and (
          v_target_line_id is null
          or not (v_target_line_id = any(v_input_line_ids))
        )
      ) or (
        v_input_cost ->> 'allocation_method' <> 'direct'
        and v_target_line_id is not null
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Zusatzkosten sind ungültig.';
    end if;

    select cost.*
    into v_existing_cost
    from public.purchase_costs as cost
    where cost.id = v_cost_id
    for update;

    if found then
      if v_existing_cost.workspace_id <> p_workspace_id
        or v_existing_cost.purchase_id <> p_purchase_id then
        raise exception using
          errcode = '22023',
          message = 'Die Ersatz-Zusatzkosten sind ungültig.';
      end if;

      update public.purchase_costs
      set type = pg_catalog.btrim(v_input_cost ->> 'type'),
          amount = (v_input_cost ->> 'amount')::numeric,
          description = case
            when pg_catalog.jsonb_typeof(v_input_cost -> 'description') = 'null'
              then null
            else nullif(pg_catalog.btrim(v_input_cost ->> 'description'), '')
          end,
          allocation_method = v_input_cost ->> 'allocation_method',
          target_purchase_line_id = v_target_line_id,
          tax_treatment = v_input_cost ->> 'tax_treatment'
      where workspace_id = p_workspace_id
        and id = v_cost_id;
    else
      insert into public.purchase_costs (
        id,
        workspace_id,
        purchase_id,
        type,
        amount,
        description,
        allocation_method,
        target_purchase_line_id,
        tax_treatment,
        created_at
      ) values (
        v_cost_id,
        p_workspace_id,
        p_purchase_id,
        pg_catalog.btrim(v_input_cost ->> 'type'),
        (v_input_cost ->> 'amount')::numeric,
        case
          when pg_catalog.jsonb_typeof(v_input_cost -> 'description') = 'null'
            then null
          else nullif(pg_catalog.btrim(v_input_cost ->> 'description'), '')
        end,
        v_input_cost ->> 'allocation_method',
        v_target_line_id,
        v_input_cost ->> 'tax_treatment',
        v_changed_at
      );
    end if;
  end loop;

  delete from public.purchase_costs
  where workspace_id = p_workspace_id
    and purchase_id = p_purchase_id
    and not (id = any(v_input_cost_ids));

  update public.purchases
  set purchase_price = case
        when coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then p_purchase_price
        else null
      end
  where workspace_id = p_workspace_id
    and id = p_purchase_id;

  v_costing_plan := public.build_purchase_costing_plan(
    p_workspace_id,
    p_purchase_id
  );
  v_goods_cents := (v_costing_plan ->> 'goodsCents')::bigint;
  v_total_cents := (v_costing_plan ->> 'totalCents')::bigint;
  v_allocated_cents := (v_costing_plan ->> 'allocatedCents')::bigint;

  for v_line_position in 1..pg_catalog.jsonb_array_length(v_costing_plan -> 'lines') loop
    v_line_plan := v_costing_plan -> 'lines' -> (v_line_position - 1);
    v_line_id := (v_line_plan ->> 'lineId')::uuid;

    select line.*
    into v_line
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.id = v_line_id;

    select pg_catalog.array_agg(unit_share.value::bigint order by unit_share.ordinality)
    into v_unit_shares
    from pg_catalog.jsonb_array_elements_text(v_line_plan -> 'unitTotalCents')
      with ordinality as unit_share(value, ordinality);
    select pg_catalog.array_agg(pg_catalog.round(unit_share.value::numeric / 100, 2) order by unit_share.ordinality)
    into v_tax_unit_costs
    from pg_catalog.jsonb_array_elements_text(nullif(v_line_plan -> 'unitTaxPurchaseCents', 'null'::jsonb))
      with ordinality as unit_share(value, ordinality);

    if v_line.line_kind = 'individual' then
      select pg_catalog.array_agg(item.id order by item.created_at, item.id)
      into v_item_ids
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = p_purchase_id
        and item.purchase_line_id = v_line.id;

      v_existing_count := coalesce(pg_catalog.cardinality(v_item_ids), 0);
      if v_line.id = any(v_existing_line_ids)
        and v_existing_count <> v_line.ordered_quantity then
        raise exception using
          errcode = '22023',
          message = 'Bestehende Einzelartikel passen nicht vollständig zur korrigierten Position.';
      end if;

      if not (v_line.id = any(v_existing_line_ids)) and v_existing_count <> 0 then
        raise exception using
          errcode = '22023',
          message = 'Neue Einkaufspositionen dürfen keinen fremden Bestand übernehmen.';
      end if;

      for v_item_position in 1..v_line.ordered_quantity loop
        if v_item_position <= v_existing_count then
          update public.inventory_items
          set allocated_purchase_cost = v_unit_shares[v_item_position]::numeric / 100,
              tax_purchase_cost = v_tax_unit_costs[v_item_position],
              ean = coalesce(v_line.ean_snapshot, ean),
              updated_at = v_changed_at
          where workspace_id = p_workspace_id
            and id = v_item_ids[v_item_position];
        else
          insert into public.inventory_items (
            workspace_id,
            purchase_id,
            purchase_line_id,
            title,
            ean,
            condition,
            status,
            allocated_purchase_cost,
            tax_purchase_cost,
            expected_value,
            created_at,
            updated_at
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.title_snapshot,
            v_line.ean_snapshot,
            case
              when v_line.condition_snapshot in (
                'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
              ) then v_line.condition_snapshot
              else 'used'
            end,
            'ready',
            v_unit_shares[v_item_position]::numeric / 100,
            v_tax_unit_costs[v_item_position],
            v_line.estimated_market_value,
            v_changed_at,
            v_changed_at
          );
        end if;
      end loop;
    else
      select pg_catalog.array_agg(lot.id order by lot.received_at, lot.id)
      into v_lot_ids
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_id = p_purchase_id
        and lot.purchase_line_id = v_line.id;

      v_existing_count := coalesce(pg_catalog.cardinality(v_lot_ids), 0);
      if v_line.id = any(v_existing_line_ids) then
        if (
          select coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
          from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_id = p_purchase_id
            and lot.purchase_line_id = v_line.id
        ) <> v_line.ordered_quantity then
          raise exception using
            errcode = '22023',
            message = 'Bestehende Bestandslose passen nicht vollständig zur korrigierten Position.';
        end if;

        v_unit_offset := 0;
        for v_lot in
          select lot.*
          from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_id = p_purchase_id
            and lot.purchase_line_id = v_line.id
          order by lot.received_at, lot.id
          for update
        loop
          select
            pg_catalog.array_agg(v_unit_shares[unit_position] order by unit_position),
            pg_catalog.sum(v_unit_shares[unit_position])
          into v_lot_unit_shares, v_lot_total_cents
          from pg_catalog.generate_series(
            v_unit_offset + 1,
            v_unit_offset + v_lot.received_quantity
          ) as unit_position;
          v_unit_offset := v_unit_offset + v_lot.received_quantity;

          update public.stock_lots
          set unit_cost = (
            v_lot_total_cents::numeric
            / v_lot.received_quantity
            / 100
          )
          where workspace_id = p_workspace_id
            and id = v_lot.id;

          if (
            select pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)
            from public.stock_lots as lot
            where lot.workspace_id = p_workspace_id
              and lot.id = v_lot.id
          ) <> v_lot_total_cents::numeric / 100 then
            raise exception using
              errcode = '22023',
              message = 'Die korrigierten Loskosten lassen sich nicht centgenau speichern.';
          end if;

          -- Historische COGS bleiben als vollständiger Snapshot erhalten. Für
          -- die aktive Kostenfolge zählen dagegen nur Einheiten, die nicht
          -- tatsächlich wieder in den Bestand gelangt sind. Eine vollständige
          -- Wiedereinlagerung verbraucht deshalb keinen Rundungscent dauerhaft.
          v_active_unit_offset := 0;
          for v_allocation in
            select allocation.*
            from public.sale_line_lot_allocations as allocation
            join public.sale_lines as allocated_sale_line
              on allocated_sale_line.workspace_id = allocation.workspace_id
              and allocated_sale_line.id = allocation.sale_line_id
            join public.sales as allocated_sale
              on allocated_sale.workspace_id = allocated_sale_line.workspace_id
              and allocated_sale.id = allocated_sale_line.sale_id
            where allocation.workspace_id = p_workspace_id
              and allocation.stock_lot_id = v_lot.id
            order by
              case when allocation.consumption_sequence is null then 0 else 1 end,
              case when allocation.consumption_sequence is null then allocated_sale.created_at end,
              case when allocation.consumption_sequence is null then allocation.created_at end,
              allocation.consumption_sequence
            for update of allocation
          loop
            if v_allocation.quantity > v_lot.received_quantity then
              raise exception using
                errcode = '22023',
                message = 'Eine historische Loszuordnung überschreitet die ursprüngliche Losmenge.';
            end if;

            select coalesce(pg_catalog.sum(
              case
                when movement.direction = 'in' and movement.reason = 'return'
                  then movement.quantity
                when movement.direction = 'out' and movement.reason = 'damage'
                  then -movement.quantity
                else 0
              end
            ), 0)::integer
            into v_restocked_quantity
            from public.stock_movements as movement
            where movement.workspace_id = v_allocation.workspace_id
              and movement.stock_lot_id = v_allocation.stock_lot_id
              and movement.sale_line_id = v_allocation.sale_line_id;

            if v_restocked_quantity < 0
              or v_restocked_quantity > v_allocation.quantity then
              raise exception using
                errcode = '22023',
                message = 'Die historische Retourenmenge des Lagerloses ist nicht konsistent.';
            end if;

            v_active_quantity := v_allocation.quantity - v_restocked_quantity;

            if v_active_unit_offset + v_active_quantity > v_lot.received_quantity then
              raise exception using
                errcode = '22023',
                message = 'Die aktive Losentnahmemenge überschreitet die ursprüngliche Losmenge.';
            end if;

            select pg_catalog.sum(
              v_lot_unit_shares[
                ((v_active_unit_offset + unit_position - 1) % v_lot.received_quantity) + 1
              ]
            )
            into v_allocation_cost_cents
            from pg_catalog.generate_series(1, v_allocation.quantity) as unit_position;

            if v_active_quantity = 0 then
              v_active_allocation_cost_cents := 0;
            else
              select pg_catalog.sum(
                v_lot_unit_shares[v_active_unit_offset + unit_position]
              )
              into v_active_allocation_cost_cents
              from pg_catalog.generate_series(1, v_active_quantity) as unit_position;
            end if;

            update public.sale_line_lot_allocations
            set unit_cost = (
                  v_allocation_cost_cents::numeric
                  / quantity
                  / 100
                ),
                allocated_cost = v_allocation_cost_cents::numeric / 100,
                active_allocated_cost = v_active_allocation_cost_cents::numeric / 100,
                active_tax_unit_costs = v_tax_unit_costs[(v_unit_offset - v_lot.received_quantity + v_active_unit_offset + 1):(v_unit_offset - v_lot.received_quantity + v_active_unit_offset + v_active_quantity)],
                active_unit_costs = (select coalesce(pg_catalog.array_agg(pg_catalog.round(value::numeric / 100, 2) order by ordinality), array[]::numeric[])
                  from pg_catalog.unnest(v_lot_unit_shares[(v_active_unit_offset + 1):(v_active_unit_offset + v_active_quantity)]) with ordinality as unit(value, ordinality))
            where workspace_id = p_workspace_id
              and id = v_allocation.id;

            v_active_unit_offset := v_active_unit_offset + v_active_quantity;
          end loop;

          update public.stock_lots
          set unit_tax_purchase_cost = (select pg_catalog.avg(value) from pg_catalog.unnest(v_tax_unit_costs[(v_unit_offset - v_lot.received_quantity + 1):v_unit_offset]) as value),
              remaining_tax_unit_costs = v_tax_unit_costs[(v_unit_offset - v_lot.remaining_quantity + 1):v_unit_offset],
              remaining_unit_costs = (select coalesce(pg_catalog.array_agg(pg_catalog.round(value::numeric / 100, 2) order by ordinality), array[]::numeric[])
                from pg_catalog.unnest(v_unit_shares[(v_unit_offset - v_lot.remaining_quantity + 1):v_unit_offset]) with ordinality as unit(value, ordinality))
          where workspace_id = p_workspace_id and id = v_lot.id;

          if v_active_unit_offset + v_lot.remaining_quantity <> v_lot.received_quantity then
            raise exception using
              errcode = '22023',
              message = 'Aktive Losentnahmen und aktueller Bestand sind nicht konsistent.';
          end if;
        end loop;
      else
        if v_existing_count <> 0 then
          raise exception using
            errcode = '22023',
            message = 'Neue Einkaufspositionen dürfen keinen fremden Bestand übernehmen.';
        end if;

        for v_cohort in
          select share.value as unit_cost_cents, v_tax_unit_costs[share.ordinality] as tax_unit_cost, pg_catalog.count(*)::integer as quantity
          from pg_catalog.unnest(v_unit_shares) with ordinality as share(value, ordinality)
          group by share.value, v_tax_unit_costs[share.ordinality]
          order by share.value desc
        loop
          insert into public.stock_lots (
            workspace_id,
            purchase_id,
            purchase_line_id,
            catalog_product_id,
            received_quantity,
            remaining_quantity,
            unit_cost,
            unit_tax_purchase_cost,
            remaining_tax_unit_costs,
            remaining_unit_costs,
            received_at,
            created_at
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.catalog_product_id,
            v_cohort.quantity,
            v_cohort.quantity,
            v_cohort.unit_cost_cents::numeric / 100,
            v_cohort.tax_unit_cost,
            case when v_cohort.tax_unit_cost is null then null else pg_catalog.array_fill(v_cohort.tax_unit_cost, array[v_cohort.quantity]) end,
            pg_catalog.array_fill(pg_catalog.round(v_cohort.unit_cost_cents::numeric / 100, 2), array[v_cohort.quantity]),
            v_changed_at,
            v_changed_at
          ) returning id into v_stock_lot_id;

          insert into public.stock_movements (
            workspace_id,
            stock_lot_id,
            direction,
            quantity,
            reason,
            created_at
          ) values (
            p_workspace_id,
            v_stock_lot_id,
            'in',
            v_cohort.quantity,
            'receipt',
            v_changed_at
          );
        end loop;
      end if;
    end if;

    update public.purchase_lines
    set allocated_additional_cost = (v_line_plan ->> 'additionalCents')::bigint::numeric / 100,
        allocated_total_cost = (v_line_plan ->> 'totalCents')::bigint::numeric / 100,
        received_quantity = ordered_quantity,
        updated_at = v_changed_at
    where workspace_id = p_workspace_id
      and id = v_line.id;
  end loop;

  update public.sale_lines as sale_line
  set cost_of_goods_sold = case
        when sale_line.inventory_item_id is not null then (
          select item.allocated_purchase_cost + coalesce((
            select pg_catalog.sum(cost.amount) from public.item_costs as cost
            where cost.inventory_item_id = item.id
          ), 0)
          from public.inventory_items as item
          where item.workspace_id = sale_line.workspace_id
            and item.id = sale_line.inventory_item_id
        )
        else (
          select coalesce(pg_catalog.sum(allocation.allocated_cost), 0)
          from public.sale_line_lot_allocations as allocation
          where allocation.workspace_id = sale_line.workspace_id
            and allocation.sale_line_id = sale_line.id
        )
      end
  where sale_line.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids);

  update public.purchases
  set purchase_price = pg_catalog.round(v_goods_cents::numeric / 100, 2),
      total_purchase_cost = v_total_cents::numeric / 100,
      updated_at = v_changed_at
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning * into v_purchase;

  v_after_purchase := pg_catalog.jsonb_build_object(
    'purchase_price', v_purchase.purchase_price,
    'total_purchase_cost', v_purchase.total_purchase_cost,
    'entry_status', v_purchase.entry_status,
    'finalized_at', v_purchase.finalized_at,
    'finalized_by', v_purchase.finalized_by
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', line.id,
    'title_snapshot', line.title_snapshot,
    'line_kind', line.line_kind,
    'ordered_quantity', line.ordered_quantity,
    'price_mode', line.price_mode,
    'unit_purchase_price', line.unit_purchase_price,
    'line_total', line.line_total,
    'condition_snapshot', line.condition_snapshot,
    'estimated_market_value', line.estimated_market_value,
    'allocated_additional_cost', line.allocated_additional_cost,
    'allocated_total_cost', line.allocated_total_cost
  ) order by line.created_at, line.id), '[]'::jsonb)
  into v_after_lines
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', cost.id,
    'type', cost.type,
    'amount', cost.amount,
    'tax_treatment', cost.tax_treatment,
    'description', cost.description,
    'allocation_method', cost.allocation_method,
    'target_purchase_line_id', cost.target_purchase_line_id
  ) order by cost.created_at, cost.id), '[]'::jsonb)
  into v_after_costs
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', item.id,
    'purchase_line_id', item.purchase_line_id,
    'status', item.status,
    'tax_purchase_cost', item.tax_purchase_cost,
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_after_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
    'purchase_line_id', lot.purchase_line_id,
    'received_quantity', lot.received_quantity,
    'remaining_quantity', lot.remaining_quantity,
    'unit_tax_purchase_cost', lot.unit_tax_purchase_cost,
    'remaining_tax_unit_costs', lot.remaining_tax_unit_costs,
    'remaining_unit_costs', lot.remaining_unit_costs,
    'unit_cost', lot.unit_cost
  ) order by lot.received_at, lot.id), '[]'::jsonb)
  into v_after_lots
  from public.stock_lots as lot
  where lot.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', sale_line.id,
    'sale_id', sale_line.sale_id,
    'cost_of_goods_sold', sale_line.cost_of_goods_sold
  ) order by sale_line.created_at, sale_line.id), '[]'::jsonb),
    coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0)
  into v_after_sale_lines, v_after_cogs
  from public.sale_lines as sale_line
  where sale_line.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', allocation.id,
    'sale_line_id', allocation.sale_line_id,
    'stock_lot_id', allocation.stock_lot_id,
    'quantity', allocation.quantity,
    'unit_cost', allocation.unit_cost,
    'allocated_cost', allocation.allocated_cost,
    'tax_purchase_cost', allocation.tax_purchase_cost,
    'tax_cost_allocations', allocation.tax_cost_allocations,
    'active_tax_unit_costs', allocation.active_tax_unit_costs,
    'active_unit_costs', allocation.active_unit_costs,
    'active_allocated_cost', allocation.active_allocated_cost,
    'consumption_sequence', allocation.consumption_sequence
  ) order by allocation.created_at, allocation.id), '[]'::jsonb)
  into v_after_allocations
  from public.sale_line_lot_allocations as allocation
  join public.stock_lots as lot
    on lot.workspace_id = allocation.workspace_id
    and lot.id = allocation.stock_lot_id
  where allocation.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    reason,
    changes
  ) values (
    p_workspace_id,
    'purchase',
    p_purchase_id,
    'purchase_corrected',
    v_actor_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object(
        'before', v_before_purchase,
        'after', v_after_purchase
      ),
      'lines', pg_catalog.jsonb_build_object(
        'before', v_before_lines,
        'after', v_after_lines
      ),
      'costs', pg_catalog.jsonb_build_object(
        'before', v_before_costs,
        'after', v_after_costs
      ),
      'inventory_items', pg_catalog.jsonb_build_object(
        'before', v_before_items,
        'after', v_after_items
      ),
      'stock_lots', pg_catalog.jsonb_build_object(
        'before', v_before_lots,
        'after', v_after_lots
      ),
      'sale_lines', pg_catalog.jsonb_build_object(
        'before', v_before_sale_lines,
        'after', v_after_sale_lines
      ),
      'lot_allocations', pg_catalog.jsonb_build_object(
        'before', v_before_allocations,
        'after', v_after_allocations
      ),
      'downstream_cogs', pg_catalog.jsonb_build_object(
        'before', v_before_cogs,
        'after', v_after_cogs
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'purchaseId', p_purchase_id,
    'totalPurchaseCost', v_total_cents::numeric / 100,
    'allocatedTotalCost', v_allocated_cents::numeric / 100,
    'entryStatus', 'finalized',
    'eventId', v_event_id
  );
end;
$function$;

create or replace function public.create_purchase (
  p_workspace_id uuid,
  p_purchase     jsonb,
  p_expenses     jsonb default '[]'::jsonb,
  p_lines        jsonb default '[]'::jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_purchase public.purchases;
  v_expense jsonb;
  v_line jsonb;
  v_line_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_refs jsonb := '{}'::jsonb;
  v_line_ref text;
  v_target_line_id uuid;
  v_source_id uuid;
  v_supplier_id uuid;
  v_purchase_type text;
  v_total_expense_cents bigint;
  v_manual_cents bigint;
  v_mode text;
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_audit_after jsonb;
  v_catalog_product_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_purchase) <> 'object'
    or jsonb_typeof(p_expenses) <> 'array'
    or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if nullif(p_purchase ->> 'request_id', '') is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':' || (p_purchase ->> 'request_id'), 0));
    select * into v_purchase from public.purchases
    where workspace_id = p_workspace_id and request_id = (p_purchase ->> 'request_id')::uuid;
    if found then
      return jsonb_build_object(
        'purchase', to_jsonb(v_purchase),
        'purchase_lines', coalesce((select jsonb_agg(line order by line.created_at, line.id) from public.purchase_lines line where line.purchase_id = v_purchase.id), '[]'::jsonb),
        'purchase_costs', coalesce((select jsonb_agg(cost) from public.purchase_costs cost where cost.purchase_id = v_purchase.id), '[]'::jsonb)
      );
    end if;
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null')
      not in ('null', 'number')
    or (
      pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price') = 'number'
      and (
        (p_purchase ->> 'purchase_price')::numeric < 0
        or pg_catalog.scale((p_purchase ->> 'purchase_price')::numeric) > 2
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Kaufpreis muss centgenau und darf nicht negativ sein.';
  end if;

  for v_expense in
    select element.value
    from pg_catalog.jsonb_array_elements(p_expenses) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_expense) <> 'object'
      or pg_catalog.jsonb_typeof(v_expense -> 'amount') <> 'number'
      or (v_expense ->> 'amount')::numeric <= 0
      or pg_catalog.scale((v_expense ->> 'amount')::numeric) > 2 then
      raise exception using
        errcode = '22023',
        message = 'Zusatzkosten müssen positive centgenaue Zahlen sein.';
    end if;
  end loop;

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  select
    coalesce(pg_catalog.max(candidate.quantity), 0),
    coalesce(pg_catalog.sum(candidate.quantity), 0)
  into v_requested_unit_max, v_requested_unit_total
  from (
    select case
      when pg_catalog.jsonb_typeof(element.value) = 'object'
        and pg_catalog.jsonb_typeof(element.value -> 'ordered_quantity') = 'number'
        and element.value ->> 'ordered_quantity' ~ '^[1-9][0-9]*$'
      then (element.value ->> 'ordered_quantity')::numeric
      else null
    end as quantity
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  ) as candidate;

  if v_requested_unit_max > v_max_purchase_units
    or v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  v_mode := coalesce(nullif(p_purchase ->> 'cost_allocation_mode', ''), 'even');
  if v_mode not in ('manual', 'even', 'value_weighted') then
    raise exception using errcode = '22023', message = 'Die Kostenverteilung ist ungültig.';
  end if;

  v_purchase_type := nullif(p_purchase ->> 'type', '');
  if v_purchase_type not in ('single', 'mystery_pack', 'lot', 'pallet') then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'source_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '') is not null
      and (p_purchase ->> 'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;
  v_source_id := nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '')::uuid;
  if v_source_id is not null and not exists (
    select 1
    from public.sources as source
    where source.workspace_id = p_workspace_id
      and source.id = v_source_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'supplier_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '') is not null
      and (p_purchase ->> 'supplier_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;
  v_supplier_id := nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '')::uuid;
  if v_supplier_id is not null and not exists (
    select 1
    from public.suppliers as supplier
    where supplier.workspace_id = p_workspace_id
      and supplier.id = v_supplier_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;

  -- Validate the purchase-type contract before the purchase header is written.
  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    v_catalog_product_id := case
      when coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null') = 'null'
        then null
      else (v_line ->> 'catalog_product_id')::uuid
    end;
    if (v_line ->> 'line_kind' = 'quantity' and v_catalog_product_id is null)
      or (v_line ->> 'line_kind' = 'individual' and v_catalog_product_id is not null)
      or (
        v_catalog_product_id is not null
        and not exists (
          select 1
          from public.catalog_products as product
          where product.workspace_id = p_workspace_id
            and product.id = v_catalog_product_id
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    if v_line ? 'condition_snapshot'
      and coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null') <> 'null'
      and (
        pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot') <> 'string'
        or v_line ->> 'condition_snapshot' not in (
          'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Der Zustand einer Einkaufsposition ist ungültig.';
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value') = 'number'
        and (
          (v_line ->> 'estimated_market_value')::numeric < 0
          or pg_catalog.scale((v_line ->> 'estimated_market_value')::numeric) > 2
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Der geschätzte Marktwert muss centgenau und darf nicht negativ sein.';
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost') = 'number'
        and (
          (v_line ->> 'allocated_additional_cost')::numeric < 0
          or pg_catalog.scale((v_line ->> 'allocated_additional_cost')::numeric) > 2
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.';
    end if;

    if coalesce(p_purchase ->> 'pricing_mode', case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
      if coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') <> 'unpriced_mystery'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') <> 'null'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') <> 'null' then
        raise exception using
          errcode = '22023',
          message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
      end if;
    elsif coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') <> 'priced'
      or pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_line -> 'line_total') is distinct from 'number'
      or (v_line ->> 'unit_purchase_price')::numeric < 0
      or (v_line ->> 'line_total')::numeric < 0
      or pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) > 16
      or pg_catalog.scale((v_line ->> 'line_total')::numeric) > 2
      or (v_line ->> 'line_total')::numeric <>
        pg_catalog.round(
          (v_line ->> 'ordered_quantity')::integer
          * (v_line ->> 'unit_purchase_price')::numeric,
          2
        ) then
      raise exception using
        errcode = '22023',
        message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
    end if;
  end loop;

  insert into public.purchases (
    workspace_id, source_id, supplier_id, type, title, purchase_date,
    purchase_price, cost_allocation_mode, notes, tracking_number,
    tracking_carrier, tracking_status, original_url, receiving_status,
    content_status, pricing_mode, supplier_reference, request_id, discount_amount
  ) values (
    p_workspace_id,
    v_source_id,
    v_supplier_id,
    v_purchase_type,
    coalesce(btrim(p_purchase ->> 'title'), ''),
    (p_purchase ->> 'purchase_date')::date,
    (p_purchase ->> 'purchase_price')::numeric,
    v_mode,
    nullif(btrim(p_purchase ->> 'notes'), ''),
    nullif(btrim(p_purchase ->> 'tracking_number'), ''),
    nullif(p_purchase ->> 'tracking_carrier', ''),
    coalesce(nullif(p_purchase ->> 'tracking_status', ''), 'pending'),
    nullif(p_purchase ->> 'original_url', ''),
    'draft',
    coalesce(p_purchase ->> 'content_status', 'known'),
    p_purchase ->> 'pricing_mode',
    nullif(btrim(p_purchase ->> 'supplier_reference'), ''),
    nullif(p_purchase ->> 'request_id', '')::uuid,
    coalesce((p_purchase ->> 'discount_amount')::numeric, 0)
  ) returning * into v_purchase;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_ref := nullif(pg_catalog.btrim(v_line ->> 'client_ref'), '');
    if v_line_ref is not null and v_line_refs ? v_line_ref then
      raise exception using errcode = '22023', message = 'Einkaufspositionen benötigen eindeutige Entwurfskennungen.';
    end if;

    insert into public.purchase_lines (
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      ean_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost, price_mode, condition_snapshot,
      estimated_market_value
    ) values (
      p_workspace_id,
      v_purchase.id,
      nullif(v_line ->> 'catalog_product_id', '')::uuid,
      btrim(v_line ->> 'title_snapshot'),
      nullif(btrim(v_line ->> 'ean_snapshot'), ''),
      v_line ->> 'line_kind',
      (v_line ->> 'ordered_quantity')::integer,
      0,
      (v_line ->> 'unit_purchase_price')::numeric,
      (v_line ->> 'line_total')::numeric,
      case when v_mode = 'manual'
        then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
        else 0
      end,
      coalesce(nullif(v_line ->> 'price_mode', ''), 'priced'),
      nullif(v_line ->> 'condition_snapshot', ''),
      (v_line ->> 'estimated_market_value')::numeric
    ) returning id into v_line_id;
    v_line_ids := array_append(v_line_ids, v_line_id);
    if v_line_ref is not null then
      v_line_refs := pg_catalog.jsonb_set(
        v_line_refs,
        array[v_line_ref],
        pg_catalog.to_jsonb(v_line_id::text),
        true
      );
    end if;
  end loop;

  for v_expense in select value from jsonb_array_elements(p_expenses) loop
    if coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted') = 'direct' then
      v_line_ref := nullif(pg_catalog.btrim(v_expense ->> 'target_purchase_line_ref'), '');
      if v_line_ref is null or not (v_line_refs ? v_line_ref) then
        raise exception using errcode = '22023', message = 'Die direkte Kostenzuordnung verweist auf keine Einkaufsposition.';
      end if;
      v_target_line_id := (v_line_refs ->> v_line_ref)::uuid;
    else
      v_target_line_id := null;
    end if;

    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, description,
      allocation_method, target_purchase_line_id, tax_treatment
    ) values (
      p_workspace_id,
      v_purchase.id,
      coalesce(nullif(btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(btrim(v_expense ->> 'description'), ''),
      coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted'),
      v_target_line_id,
      v_expense ->> 'tax_treatment'
    );
  end loop;

  select coalesce(round(sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.purchase_id = v_purchase.id;

  if cardinality(v_line_ids) = 0 or v_purchase.content_status = 'unknown' then
    null;
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

  v_audit_after := public.purchase_draft_audit_snapshot(p_workspace_id, v_purchase.id);
  insert into public.business_events (
    workspace_id, entity_type, entity_id, event_type, actor_id, changes
  ) values (
    p_workspace_id, 'purchase', v_purchase.id, 'purchase_draft_created', (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object('before', null, 'after', v_audit_after -> 'purchase'),
      'lines', pg_catalog.jsonb_build_object('before', null, 'after', v_audit_after -> 'lines'),
      'costs', pg_catalog.jsonb_build_object('before', null, 'after', v_audit_after -> 'costs')
    )
  );

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

CREATE OR REPLACE FUNCTION public.finalize_purchase_costing (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_purchase public.purchases;
  v_line public.purchase_lines;
  v_existing_lot public.stock_lots;
  v_cohort record;
  v_costing_plan jsonb;
  v_line_plan jsonb;
  v_line_ids uuid[];
  v_line_total_shares bigint[];
  v_line_additional_shares bigint[];
  v_unit_shares bigint[];
  v_tax_unit_costs numeric[];
  v_existing_item_ids uuid[];
  v_goods_cents bigint := 0;
  v_total_cents bigint := 0;
  v_allocated_cents bigint := 0;
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_existing_count integer := 0;
  v_existing_lot_quantity integer := 0;
  v_movement_count integer := 0;
  v_inventory_cents bigint := 0;
  v_lot_total_cents bigint := 0;
  v_unit_offset integer := 0;
  v_suffix_position integer := 0;
  v_stock_lot_id uuid;
  v_event_id uuid;
  v_finalized_at timestamptz := pg_catalog.clock_timestamp();
  v_latest_received_at timestamptz;
  v_next_received_at timestamptz;
begin
  if v_actor_id is null
    or p_workspace_id is null
    or p_purchase_id is null
    or not exists (
      select 1
      from public.workspace_members as member
      where member.workspace_id = p_workspace_id
        and member.user_id = v_actor_id
    ) then
    raise exception using
      errcode = '42501',
      message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status = 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Der Einkauf ist bereits finalisiert.';
  end if;

  if v_purchase.request_id is not null and v_purchase.shipment_status <> 'arrived' then
    raise exception using
      errcode = '22023',
      message = 'Vor dem Abschluss muss die Ankunft bestätigt sein.';
  end if;

  if v_purchase.content_status = 'unknown' then
    raise exception using
      errcode = '22023',
      message = 'Der Inhalt muss vor dem Abschluss vollständig erfasst sein.';
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

  perform line.id
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
  order by line.created_at, line.id
  for update;

  perform cost.id
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id
  order by cost.created_at, cost.id
  for update;

  select pg_catalog.array_agg(line.id order by line.created_at, line.id)
  into v_line_ids
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  perform item.id
  from public.inventory_items as item
  left join public.purchase_lines as linked_line
    on linked_line.id = item.purchase_line_id
  where item.purchase_id = p_purchase_id
    or linked_line.purchase_id = p_purchase_id
  order by item.created_at, item.id
  for update of item;

  perform lot.id
  from public.stock_lots as lot
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.purchase_id = p_purchase_id
    or linked_line.purchase_id = p_purchase_id
  order by lot.received_at, lot.id
  for update of lot;

  if exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where lot.workspace_id = p_workspace_id
      and (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and not pg_catalog.isfinite(lot.received_at)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Historische Bestandslose mit nicht-endlichem Empfangszeitpunkt müssen vor der Finalisierung manuell geprüft werden.';
  end if;

  perform movement.id
  from public.stock_movements as movement
  join public.stock_lots as lot on lot.id = movement.stock_lot_id
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.purchase_id = p_purchase_id
    or linked_line.purchase_id = p_purchase_id
  order by movement.created_at, movement.id
  for update of movement;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = item.purchase_line_id
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or item.purchase_line_id is null
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'individual'
      )
  ) or exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        lot.workspace_id <> p_workspace_id
        or lot.purchase_id <> p_purchase_id
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'quantity'
        or lot.catalog_product_id <> linked_line.catalog_product_id
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.';
  end if;

  if exists (
    select 1
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = p_purchase_id
      and (
        movement.workspace_id <> p_workspace_id
        or movement.direction <> 'in'
        or movement.reason <> 'receipt'
        or movement.sale_line_id is not null
        or movement.quantity <> lot.received_quantity
      )
  ) or exists (
    select 1
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = p_purchase_id
    group by movement.stock_lot_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'Vorhandene Receipt-Bewegungen müssen exakt zum Bestandslos passen.';
  end if;

  if exists (
    select 1
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and (
        (
          line.line_kind = 'individual'
          and line.received_quantity <> (
            select pg_catalog.count(*)::integer
            from public.inventory_items as item
            where item.workspace_id = p_workspace_id
              and item.purchase_id = p_purchase_id
              and item.purchase_line_id = line.id
          )
        )
        or (
          line.line_kind = 'quantity'
          and line.received_quantity <> (
            select coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
            from public.stock_lots as lot
            where lot.workspace_id = p_workspace_id
              and lot.purchase_id = p_purchase_id
              and lot.purchase_line_id = line.id
          )
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Empfangsmengen und vorhandener Bestand stimmen vor der Finalisierung nicht überein.';
  end if;

  if exists (
    select 1
    from public.inventory_items as item
    where item.workspace_id = p_workspace_id
      and item.purchase_id = p_purchase_id
      and item.status not in ('received', 'needs_review', 'researched', 'ready')
  ) then
    raise exception using
      errcode = '22023',
      message = 'Nur unbearbeitete Einzelstücke können finalisiert werden.';
  end if;

  if exists (
    select 1
    from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and (
        lot.remaining_quantity <> lot.received_quantity
        or exists (
          select 1
          from public.sale_line_lot_allocations as allocation
          where allocation.workspace_id = p_workspace_id
            and allocation.stock_lot_id = lot.id
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Bereits verwendete Bestandslose verhindern die Finalisierung.';
  end if;

  v_costing_plan := public.build_purchase_costing_plan(
    p_workspace_id,
    p_purchase_id
  );
  v_goods_cents := (v_costing_plan ->> 'goodsCents')::bigint;
  v_total_cents := (v_costing_plan ->> 'totalCents')::bigint;
  v_allocated_cents := (v_costing_plan ->> 'allocatedCents')::bigint;

  select
    pg_catalog.array_agg((line_plan.value ->> 'additionalCents')::bigint order by line_plan.ordinality),
    pg_catalog.array_agg((line_plan.value ->> 'totalCents')::bigint order by line_plan.ordinality)
  into v_line_additional_shares, v_line_total_shares
  from pg_catalog.jsonb_array_elements(v_costing_plan -> 'lines')
    with ordinality as line_plan(value, ordinality);

  for v_line_position in 1..v_line_count loop
    v_line_plan := v_costing_plan -> 'lines' -> (v_line_position - 1);

    select line.*
    into v_line
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.id = v_line_ids[v_line_position];

    select pg_catalog.array_agg(unit_share.value::bigint order by unit_share.ordinality)
    into v_unit_shares
    from pg_catalog.jsonb_array_elements_text(v_line_plan -> 'unitTotalCents')
      with ordinality as unit_share(value, ordinality);
    select pg_catalog.array_agg(pg_catalog.round(unit_share.value::numeric / 100, 2) order by unit_share.ordinality)
    into v_tax_unit_costs
    from pg_catalog.jsonb_array_elements_text(nullif(v_line_plan -> 'unitTaxPurchaseCents', 'null'::jsonb))
      with ordinality as unit_share(value, ordinality);

    if v_line.line_kind = 'individual' then
      perform item.id
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_line_id = v_line.id
      order by item.created_at, item.id
      for update;

      if exists (
        select 1
        from public.inventory_items as item
        where item.workspace_id = p_workspace_id
          and item.purchase_line_id = v_line.id
          and (
            item.purchase_id is distinct from p_purchase_id
            or item.status not in ('received', 'needs_review', 'researched', 'ready')
          )
      ) then
        raise exception using
          errcode = '22023',
          message = 'Nur unbearbeitete Einzelstücke können finalisiert werden.';
      end if;

      select pg_catalog.array_agg(item.id order by item.created_at, item.id)
      into v_existing_item_ids
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_line_id = v_line.id;

      v_existing_count := coalesce(pg_catalog.cardinality(v_existing_item_ids), 0);
      if v_existing_count > v_line.ordered_quantity then
        raise exception using
          errcode = '22023',
          message = 'Die Zahl erfasster Einzelstücke überschreitet die Positionsmenge.';
      end if;

      for v_item_position in 1..v_line.ordered_quantity loop
        if v_item_position <= v_existing_count then
          update public.inventory_items
          set allocated_purchase_cost = v_unit_shares[v_item_position]::numeric / 100,
              tax_purchase_cost = v_tax_unit_costs[v_item_position],
              ean = coalesce(v_line.ean_snapshot, ean),
              expected_value = coalesce(expected_value, v_line.estimated_market_value),
              status = 'ready',
              updated_at = v_finalized_at
          where id = v_existing_item_ids[v_item_position]
            and workspace_id = p_workspace_id;
        else
          insert into public.inventory_items (
            workspace_id,
            purchase_id,
            purchase_line_id,
            title,
            ean,
            condition,
            status,
            allocated_purchase_cost,
            tax_purchase_cost,
            expected_value
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.title_snapshot,
            v_line.ean_snapshot,
            case
              when v_line.condition_snapshot in (
                'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
              ) then v_line.condition_snapshot
              else 'used'
            end,
            'ready',
            v_unit_shares[v_item_position]::numeric / 100,
            v_tax_unit_costs[v_item_position],
            v_line.estimated_market_value
          );
        end if;
      end loop;
    else
      perform lot.id
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_line_id = v_line.id
      order by lot.received_at, lot.id
      for update;

      if exists (
        select 1
        from public.stock_lots as lot
        where lot.workspace_id = p_workspace_id
          and lot.purchase_line_id = v_line.id
          and (
            lot.purchase_id <> p_purchase_id
            or lot.catalog_product_id <> v_line.catalog_product_id
            or lot.remaining_quantity <> lot.received_quantity
            or exists (
              select 1
              from public.stock_movements as movement
              where movement.workspace_id = p_workspace_id
                and movement.stock_lot_id = lot.id
                and (
                  movement.direction <> 'in'
                  or movement.reason <> 'receipt'
                )
            )
            or exists (
              select 1
              from public.sale_line_lot_allocations as allocation
              where allocation.workspace_id = p_workspace_id
                and allocation.stock_lot_id = lot.id
            )
          )
      ) then
        raise exception using
          errcode = '22023',
          message = 'Bereits verwendete Bestandslose verhindern die Finalisierung.';
      end if;

      select
        pg_catalog.count(*)::integer,
        coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
      into v_existing_count, v_existing_lot_quantity
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_line_id = v_line.id;

      if v_existing_lot_quantity > v_line.ordered_quantity then
        raise exception using
          errcode = '22023',
          message = 'Die vorhandene Losmenge überschreitet die Positionsmenge.';
      end if;

      v_unit_offset := 0;
      for v_existing_lot in
        select lot.*
        from public.stock_lots as lot
        where lot.workspace_id = p_workspace_id
          and lot.purchase_line_id = v_line.id
        order by lot.received_at, lot.id
        for update
      loop
        select coalesce(pg_catalog.sum(v_unit_shares[unit_position]), 0)::bigint
        into v_lot_total_cents
        from pg_catalog.generate_series(
          v_unit_offset + 1,
          v_unit_offset + v_existing_lot.received_quantity
        ) as unit_position;

        v_unit_offset := v_unit_offset + v_existing_lot.received_quantity;

        update public.stock_lots
        set unit_cost = (
          v_lot_total_cents::numeric
          / v_existing_lot.received_quantity
          / 100
        )
        , unit_tax_purchase_cost = (select pg_catalog.avg(value) from pg_catalog.unnest(v_tax_unit_costs[(v_unit_offset - v_existing_lot.received_quantity + 1):v_unit_offset]) as value),
          remaining_tax_unit_costs = v_tax_unit_costs[(v_unit_offset - v_existing_lot.received_quantity + 1):v_unit_offset],
          remaining_unit_costs = (select pg_catalog.array_agg(pg_catalog.round(value::numeric / 100, 2) order by ordinality)
            from pg_catalog.unnest(v_unit_shares[(v_unit_offset - v_existing_lot.received_quantity + 1):v_unit_offset]) with ordinality as unit(value, ordinality))
        where id = v_existing_lot.id
          and workspace_id = p_workspace_id;

        if (
          select pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)
          from public.stock_lots as lot
          where lot.id = v_existing_lot.id
            and lot.workspace_id = p_workspace_id
        ) <> v_lot_total_cents::numeric / 100 then
          raise exception using
            errcode = '22023',
            message = 'Die Loskosten lassen sich nicht centgenau speichern.';
        end if;

        select pg_catalog.count(*)::integer
        into v_movement_count
        from public.stock_movements as movement
        where movement.workspace_id = p_workspace_id
          and movement.stock_lot_id = v_existing_lot.id;

        if v_movement_count > 1 then
          raise exception using
            errcode = '22023',
            message = 'Ein Bestandslos besitzt mehrere Eingangsbewegungen und kann nicht automatisch umgebaut werden.';
        end if;

        if v_movement_count = 0 then
          insert into public.stock_movements (
            workspace_id,
            stock_lot_id,
            direction,
            quantity,
            reason
          ) values (
            p_workspace_id,
            v_existing_lot.id,
            'in',
            v_existing_lot.received_quantity,
            'receipt'
          );
        end if;
      end loop;

      if v_unit_offset < pg_catalog.cardinality(v_unit_shares) then
        select pg_catalog.max(lot.received_at)
        into v_latest_received_at
        from public.stock_lots as lot
        where lot.workspace_id = p_workspace_id
          and lot.purchase_line_id = v_line.id;

        if v_latest_received_at is null then
          v_next_received_at := v_finalized_at;
        elsif not pg_catalog.isfinite(v_latest_received_at)
          or v_latest_received_at >= '294276-12-31 23:59:59.999999+00'::timestamptz then
          raise exception using
            errcode = '22023',
            message = 'Für neue Bestandslose ist kein späterer endlicher Empfangszeitpunkt verfügbar.';
        else
          v_next_received_at := greatest(
            v_finalized_at,
            v_latest_received_at + interval '1 microsecond'
          );
        end if;
      end if;

      v_suffix_position := 0;

      for v_cohort in
        select
          share.value as unit_cost_cents,
          v_tax_unit_costs[share.ordinality] as tax_unit_cost,
          pg_catalog.count(*)::integer as quantity,
          pg_catalog.min(share.ordinality) as first_position
        from pg_catalog.unnest(v_unit_shares)
          with ordinality as share(value, ordinality)
        where share.ordinality > v_unit_offset
        group by share.value, v_tax_unit_costs[share.ordinality]
        order by pg_catalog.min(share.ordinality)
      loop
        if v_suffix_position > 0 then
          if not pg_catalog.isfinite(v_next_received_at)
            or v_next_received_at >= '294276-12-31 23:59:59.999999+00'::timestamptz then
            raise exception using
              errcode = '22023',
              message = 'Für neue Bestandslose ist kein späterer endlicher Empfangszeitpunkt verfügbar.';
          end if;

          v_next_received_at := v_next_received_at + interval '1 microsecond';
        end if;

        v_suffix_position := v_suffix_position + 1;

        insert into public.stock_lots (
          workspace_id,
          purchase_id,
          purchase_line_id,
          catalog_product_id,
          received_quantity,
          remaining_quantity,
          unit_cost,
          unit_tax_purchase_cost,
          remaining_tax_unit_costs,
          remaining_unit_costs,
          received_at
        ) values (
          p_workspace_id,
          p_purchase_id,
          v_line.id,
          v_line.catalog_product_id,
          v_cohort.quantity,
          v_cohort.quantity,
          v_cohort.unit_cost_cents::numeric / 100,
          v_cohort.tax_unit_cost,
          case when v_cohort.tax_unit_cost is null then null else pg_catalog.array_fill(v_cohort.tax_unit_cost, array[v_cohort.quantity]) end,
          pg_catalog.array_fill(pg_catalog.round(v_cohort.unit_cost_cents::numeric / 100, 2), array[v_cohort.quantity]),
          v_next_received_at
        ) returning id into v_stock_lot_id;

        insert into public.stock_movements (
          workspace_id,
          stock_lot_id,
          direction,
          quantity,
          reason
        ) values (
          p_workspace_id,
          v_stock_lot_id,
          'in',
          v_cohort.quantity,
          'receipt'
        );
      end loop;
    end if;

    update public.purchase_lines
    set allocated_additional_cost =
          v_line_additional_shares[v_line_position]::numeric / 100,
        allocated_total_cost = v_line_total_shares[v_line_position]::numeric / 100,
        received_quantity = ordered_quantity,
        updated_at = v_finalized_at
    where workspace_id = p_workspace_id
      and id = v_line.id;
  end loop;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = item.purchase_line_id
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or item.purchase_line_id is null
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'individual'
      )
  ) or exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        lot.workspace_id <> p_workspace_id
        or lot.purchase_id <> p_purchase_id
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'quantity'
        or lot.catalog_product_id <> linked_line.catalog_product_id
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Der Bestand ist nach der Finalisierung strukturell inkonsistent.';
  end if;

  if exists (
    select 1
    from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and lot.unit_cost is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Nach der Finalisierung müssen alle Bestandslose bekannte Kosten besitzen.';
  end if;

  if exists (
    select 1
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and (
        line.received_quantity <> line.ordered_quantity
        or line.allocated_additional_cost > line.allocated_total_cost
        or (
          line.line_kind = 'individual'
          and (
            line.ordered_quantity <> (
              select pg_catalog.count(*)::integer
              from public.inventory_items as item
              where item.workspace_id = p_workspace_id
                and item.purchase_id = p_purchase_id
                and item.purchase_line_id = line.id
            )
            or line.allocated_total_cost * 100 <> (
              select coalesce(
                pg_catalog.sum(item.allocated_purchase_cost * 100),
                0
              )
              from public.inventory_items as item
              where item.workspace_id = p_workspace_id
                and item.purchase_id = p_purchase_id
                and item.purchase_line_id = line.id
            )
          )
        )
        or (
          line.line_kind = 'quantity'
          and (
            line.ordered_quantity <> (
              select coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
              from public.stock_lots as lot
              where lot.workspace_id = p_workspace_id
                and lot.purchase_id = p_purchase_id
                and lot.purchase_line_id = line.id
            )
            or line.ordered_quantity <> (
              select coalesce(pg_catalog.sum(lot.remaining_quantity), 0)::integer
              from public.stock_lots as lot
              where lot.workspace_id = p_workspace_id
                and lot.purchase_id = p_purchase_id
                and lot.purchase_line_id = line.id
            )
            or line.allocated_total_cost * 100 <> (
              select coalesce(
                pg_catalog.sum(
                  (pg_catalog.round(lot.received_quantity * lot.unit_cost, 2) * 100)::bigint
                ),
                0
              )
              from public.stock_lots as lot
              where lot.workspace_id = p_workspace_id
                and lot.purchase_id = p_purchase_id
                and lot.purchase_line_id = line.id
            )
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Positionskosten und Bestand reconciliieren nach der Finalisierung nicht exakt.';
  end if;

  if exists (
    select 1
    from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and (
        select pg_catalog.count(*)
        from public.stock_movements as movement
        where movement.workspace_id = p_workspace_id
          and movement.stock_lot_id = lot.id
          and movement.direction = 'in'
          and movement.reason = 'receipt'
          and movement.quantity = lot.received_quantity
      ) <> 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Bestandslose und Receipt-Bewegungen reconciliieren nach der Finalisierung nicht exakt.';
  end if;

  select (
    coalesce((
      select pg_catalog.sum(item.allocated_purchase_cost * 100)
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = p_purchase_id
    ), 0)
    + coalesce((
      select pg_catalog.sum(
        (pg_catalog.round(lot.received_quantity * lot.unit_cost, 2) * 100)::bigint
      )
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_id = p_purchase_id
    ), 0)
  )::bigint
  into v_inventory_cents;

  if v_inventory_cents <> v_total_cents then
    raise exception using
      errcode = 'P0001',
      message = 'Der gesamte Einkaufsbestand reconciliiert nicht mit den Einkaufsgesamtkosten.';
  end if;

  update public.purchases
  set purchase_price = pg_catalog.round(v_goods_cents::numeric / 100, 2),
      total_purchase_cost = v_total_cents::numeric / 100,
      entry_status = 'finalized',
      finalized_at = v_finalized_at,
      finalized_by = v_actor_id,
      updated_at = v_finalized_at
  where workspace_id = p_workspace_id
    and id = p_purchase_id;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    p_workspace_id,
    'purchase',
    p_purchase_id,
    'purchase_finalized',
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'purchase_price', pg_catalog.jsonb_build_object(
        'before', v_purchase.purchase_price,
        'after', v_goods_cents::numeric / 100
      ),
      'total_purchase_cost', pg_catalog.jsonb_build_object(
        'before', v_purchase.total_purchase_cost,
        'after', v_total_cents::numeric / 100
      ),
      'allocated_total_cost', pg_catalog.jsonb_build_object(
        'before', 0,
        'after', v_allocated_cents::numeric / 100
      ),
      'entry_status', pg_catalog.jsonb_build_object(
        'before', v_purchase.entry_status,
        'after', 'finalized'
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'purchaseId', p_purchase_id,
    'totalPurchaseCost', v_total_cents::numeric / 100,
    'allocatedTotalCost', v_allocated_cents::numeric / 100,
    'entryStatus', 'finalized',
    'eventId', v_event_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_tax_cost_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_table_name = 'inventory_items' then
    if current_user <> 'postgres' and (
      (tg_op = 'INSERT' and new.tax_purchase_cost is not null)
      or (tg_op = 'UPDATE' and old.tax_purchase_cost is distinct from new.tax_purchase_cost)
    ) then
      raise exception using errcode = '42501', message = 'Steuerliche Einkaufspreise werden ausschließlich über die Kostenfreigabe geändert.';
    end if;
  elsif tg_table_name = 'stock_lots' then
    if new.remaining_unit_costs is not null and (
      pg_catalog.cardinality(new.remaining_unit_costs) <> new.remaining_quantity
      or exists (select 1 from pg_catalog.unnest(new.remaining_unit_costs) as value
        where value is null or value < 0 or value >= 'Infinity'::numeric or value <> pg_catalog.round(value, 2))
    ) then
      raise exception using errcode = '22023', message = 'Die betriebliche Stückkostenfolge passt nicht zum verfügbaren Bestand.';
    end if;
    if current_user <> 'postgres' and (
      (tg_op = 'INSERT' and new.remaining_unit_costs is not null)
      or (tg_op = 'UPDATE' and old.remaining_unit_costs is distinct from new.remaining_unit_costs)
    ) then
      raise exception using errcode = '42501', message = 'Stückkostenfolgen werden ausschließlich über geprüfte Geschäftsvorgänge geändert.';
    end if;
    if new.remaining_tax_unit_costs is not null and (
      pg_catalog.cardinality(new.remaining_tax_unit_costs) <> new.remaining_quantity
      or exists (select 1 from pg_catalog.unnest(new.remaining_tax_unit_costs) as value
        where value is null or value < 0 or value >= 'Infinity'::numeric or value <> pg_catalog.round(value, 2))
    ) then
      raise exception using errcode = '22023', message = 'Die steuerliche Stückkostenfolge passt nicht zum verfügbaren Bestand.';
    end if;
    if current_user <> 'postgres' and (
      (tg_op = 'INSERT' and (new.unit_tax_purchase_cost is not null or new.remaining_tax_unit_costs is not null))
      or (tg_op = 'UPDATE' and (old.unit_tax_purchase_cost is distinct from new.unit_tax_purchase_cost
        or old.remaining_tax_unit_costs is distinct from new.remaining_tax_unit_costs))
    ) then
      raise exception using errcode = '42501', message = 'Steuerliche Loskosten werden ausschließlich über geprüfte Geschäftsvorgänge geändert.';
    end if;
  else
    if tg_op = 'UPDATE' and (
      old.tax_purchase_cost is distinct from new.tax_purchase_cost
      or old.tax_cost_allocations is distinct from new.tax_cost_allocations
    ) and (
      current_user <> 'postgres'
      or old.tax_purchase_cost is not null or old.tax_cost_allocations is not null
      or old.created_at < pg_catalog.transaction_timestamp()
    ) then
      raise exception using errcode = '42501', message = 'Gebuchte steuerliche Kostensnapshots sind unveränderlich.';
    end if;
    if tg_op = 'INSERT' and current_user <> 'postgres'
      and (new.tax_purchase_cost is not null or new.tax_cost_allocations is not null) then
      raise exception using errcode = '42501', message = 'Steuerliche Kostensnapshots entstehen ausschließlich bei der Verkaufsbuchung.';
    end if;
    if (new.tax_purchase_cost is null) <> (new.tax_cost_allocations is null) then
      raise exception using errcode = '22023', message = 'Steuerlicher Einkaufspreis und Stückaufschlüsselung müssen zusammen vorliegen.';
    end if;
    if new.tax_cost_allocations is not null then
      if pg_catalog.jsonb_typeof(new.tax_cost_allocations) <> 'array' then
        raise exception using errcode = '22023', message = 'Die steuerliche Stückaufschlüsselung ist ungültig.';
      end if;
      if exists (select 1 from pg_catalog.jsonb_array_elements(new.tax_cost_allocations) as entry
        where pg_catalog.jsonb_typeof(entry -> 'quantity') is distinct from 'number'
          or coalesce(entry ->> 'quantity', '') !~ '^[1-9][0-9]*$'
          or pg_catalog.jsonb_typeof(entry -> 'tax_purchase_cost') is distinct from 'number'
          or (entry ->> 'tax_purchase_cost')::numeric < 0
          or (entry ->> 'tax_purchase_cost')::numeric <> pg_catalog.round((entry ->> 'tax_purchase_cost')::numeric, 2)
          or pg_catalog.round((entry ->> 'tax_purchase_cost')::numeric / (entry ->> 'quantity')::numeric, 2)
            <> (entry ->> 'tax_purchase_cost')::numeric / (entry ->> 'quantity')::numeric
      ) or (select coalesce(pg_catalog.sum((entry ->> 'quantity')::numeric), 0)
        from pg_catalog.jsonb_array_elements(new.tax_cost_allocations) as entry) <> new.quantity
        or (select coalesce(pg_catalog.sum((entry ->> 'tax_purchase_cost')::numeric), 0)
        from pg_catalog.jsonb_array_elements(new.tax_cost_allocations) as entry) <> new.tax_purchase_cost then
        raise exception using errcode = '22023', message = 'Die steuerliche Stückaufschlüsselung stimmt nicht mit Menge und Einkaufspreis überein.';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_tax_cost_fields() from public, anon, authenticated, service_role;

create or replace function public.purchase_draft_audit_snapshot (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
  with line_values as (
    select line.id, pg_catalog.jsonb_build_object(
      'catalog_product_id', line.catalog_product_id,
      'title_snapshot', line.title_snapshot,
      'ean_snapshot', line.ean_snapshot,
      'line_kind', line.line_kind,
      'ordered_quantity', line.ordered_quantity,
      'unit_purchase_price', line.unit_purchase_price,
      'line_total', line.line_total,
      'allocated_additional_cost', line.allocated_additional_cost,
      'price_mode', line.price_mode,
      'condition_snapshot', line.condition_snapshot,
      'estimated_market_value', line.estimated_market_value
    ) as value
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id
  ), cost_values as (
    select cost.target_purchase_line_id, pg_catalog.jsonb_build_object(
      'type', cost.type,
      'amount', cost.amount,
      'tax_treatment', cost.tax_treatment,
      'description', cost.description,
      'allocation_method', cost.allocation_method
    ) as value
    from public.purchase_costs as cost
    where cost.workspace_id = p_workspace_id and cost.purchase_id = p_purchase_id
  ), lines as (
    -- Die Gruppierung bewahrt auch bei zwei fachlich gleichen Positionen die
    -- Verteilung direkter Kosten, ohne deren zufällige IDs zu veröffentlichen.
    select line.value || pg_catalog.jsonb_build_object('direct_costs', coalesce((
      select pg_catalog.jsonb_agg(cost.value order by cost.value)
      from cost_values as cost where cost.target_purchase_line_id = line.id
    ), '[]'::jsonb)) as value
    from line_values as line
  ), costs as (
    select cost.value || pg_catalog.jsonb_build_object('target_line', line.value) as value
    from cost_values as cost
    left join line_values as line on line.id = cost.target_purchase_line_id
  )
  select pg_catalog.jsonb_build_object(
    'purchase', (
      select pg_catalog.jsonb_object_agg(field.key, field.value)
      from public.purchases as purchase,
        lateral pg_catalog.jsonb_each(pg_catalog.to_jsonb(purchase)) as field
      where purchase.workspace_id = p_workspace_id and purchase.id = p_purchase_id
        and field.key = any(array[
          'source_id', 'supplier_id', 'type', 'title', 'purchase_date',
          'purchase_price', 'cost_allocation_mode', 'notes', 'tracking_number',
          'tracking_carrier', 'tracking_status', 'original_url', 'content_status',
          'pricing_mode', 'supplier_reference', 'discount_amount'
        ])
    ),
    'lines', coalesce((select pg_catalog.jsonb_agg(value order by value) from lines), '[]'::jsonb),
    'costs', coalesce((select pg_catalog.jsonb_agg(value order by value) from costs), '[]'::jsonb)
  );
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
    or not (select public.is_workspace_member(p_workspace_id)) then
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

CREATE OR REPLACE FUNCTION public.reopen_purchase_costing (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_purchase public.purchases;
  v_before_purchase jsonb;
  v_after_purchase jsonb;
  v_before_lines jsonb;
  v_after_lines jsonb;
  v_before_items jsonb;
  v_after_items jsonb;
  v_before_lots jsonb;
  v_after_lots jsonb;
  v_event_id uuid;
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_sale_history_state text;
begin
  if v_actor_id is null
    or p_workspace_id is null
    or p_purchase_id is null
    or not exists (
      select 1
      from public.workspace_members as member
      where member.workspace_id = p_workspace_id
        and member.user_id = v_actor_id
    ) then
    raise exception using
      errcode = '42501',
      message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status <> 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Nur ein finalisierter Einkauf kann wieder geöffnet werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

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

  perform line.id
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
  order by line.created_at, line.id
  for update;

  perform cost.id
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id
  order by cost.created_at, cost.id
  for update;

  perform item.id
  from public.inventory_items as item
  left join public.purchase_lines as linked_line
    on linked_line.id = item.purchase_line_id
  where item.workspace_id = p_workspace_id
    and (
      item.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by item.created_at, item.id
  for update of item;

  perform lot.id
  from public.stock_lots as lot
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.workspace_id = p_workspace_id
    and (
      lot.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by lot.received_at, lot.id
  for update of lot;

  perform sale_line.id
  from public.sale_lines as sale_line
  join public.inventory_items as item
    on item.workspace_id = sale_line.workspace_id
    and item.id = sale_line.inventory_item_id
  left join public.purchase_lines as linked_line
    on linked_line.id = item.purchase_line_id
  where sale_line.workspace_id = p_workspace_id
    and (
      item.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by sale_line.created_at, sale_line.id
  for update of sale_line;

  perform allocation.id
  from public.sale_line_lot_allocations as allocation
  join public.stock_lots as lot
    on lot.workspace_id = allocation.workspace_id
    and lot.id = allocation.stock_lot_id
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where allocation.workspace_id = p_workspace_id
    and (
      lot.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by allocation.created_at, allocation.id
  for update of allocation;

  v_sale_history_state := public.get_purchase_sale_history_state(
    p_workspace_id,
    p_purchase_id
  );

  if v_sale_history_state = 'review_required' then
    raise exception using
      errcode = '22023',
      message = 'Der Verkaufsstatus ist unvollständig. Bitte Verkaufsdaten prüfen und nachpflegen.';
  elsif v_sale_history_state = 'recorded' then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf mit Verkäufen kann nicht wieder geöffnet werden.';
  elsif v_sale_history_state <> 'none' then
    raise exception using
      errcode = '22023',
      message = 'Der Verkaufsverlauf konnte nicht sicher geprüft werden.';
  end if;

  v_before_purchase := pg_catalog.jsonb_build_object(
    'purchase_price', v_purchase.purchase_price,
    'total_purchase_cost', v_purchase.total_purchase_cost,
    'entry_status', v_purchase.entry_status,
    'finalized_at', v_purchase.finalized_at,
    'finalized_by', v_purchase.finalized_by
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', line.id,
    'allocated_additional_cost', line.allocated_additional_cost,
    'allocated_total_cost', line.allocated_total_cost
  ) order by line.created_at, line.id), '[]'::jsonb)
  into v_before_lines
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', item.id,
    'status', item.status,
    'tax_purchase_cost', item.tax_purchase_cost,
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_before_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
    'unit_tax_purchase_cost', lot.unit_tax_purchase_cost,
    'remaining_tax_unit_costs', lot.remaining_tax_unit_costs,
    'remaining_unit_costs', lot.remaining_unit_costs,
    'unit_cost', lot.unit_cost,
    'received_quantity', lot.received_quantity,
    'remaining_quantity', lot.remaining_quantity
  ) order by lot.received_at, lot.id), '[]'::jsonb)
  into v_before_lots
  from public.stock_lots as lot
  where lot.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  update public.purchase_lines
  set allocated_additional_cost = 0,
      allocated_total_cost = 0,
      updated_at = v_changed_at
  where workspace_id = p_workspace_id
    and purchase_id = p_purchase_id;

  update public.inventory_items
  set tax_purchase_cost = null, allocated_purchase_cost = 0,
      status = case
        when status in ('ready', 'listed') then 'received'
        else status
      end,
      updated_at = v_changed_at
  where workspace_id = p_workspace_id
    and purchase_id = p_purchase_id;

  update public.stock_lots
  set unit_tax_purchase_cost = null, remaining_tax_unit_costs = null, remaining_unit_costs = null, unit_cost = null
  where workspace_id = p_workspace_id
    and purchase_id = p_purchase_id;

  update public.purchases
  set purchase_price = case
        when type = 'mystery_pack' then purchase_price
        else null
      end,
      total_purchase_cost = null,
      entry_status = 'capturing',
      finalized_at = null,
      finalized_by = null,
      updated_at = v_changed_at
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning * into v_purchase;

  v_after_purchase := pg_catalog.jsonb_build_object(
    'purchase_price', v_purchase.purchase_price,
    'total_purchase_cost', v_purchase.total_purchase_cost,
    'entry_status', v_purchase.entry_status,
    'finalized_at', v_purchase.finalized_at,
    'finalized_by', v_purchase.finalized_by
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', line.id,
    'allocated_additional_cost', line.allocated_additional_cost,
    'allocated_total_cost', line.allocated_total_cost
  ) order by line.created_at, line.id), '[]'::jsonb)
  into v_after_lines
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', item.id,
    'status', item.status,
    'tax_purchase_cost', item.tax_purchase_cost,
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_after_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
    'unit_tax_purchase_cost', lot.unit_tax_purchase_cost,
    'remaining_tax_unit_costs', lot.remaining_tax_unit_costs,
    'remaining_unit_costs', lot.remaining_unit_costs,
    'unit_cost', lot.unit_cost,
    'received_quantity', lot.received_quantity,
    'remaining_quantity', lot.remaining_quantity
  ) order by lot.received_at, lot.id), '[]'::jsonb)
  into v_after_lots
  from public.stock_lots as lot
  where lot.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    p_workspace_id,
    'purchase',
    p_purchase_id,
    'purchase_reopened',
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object(
        'before', v_before_purchase,
        'after', v_after_purchase
      ),
      'lines', pg_catalog.jsonb_build_object(
        'before', v_before_lines,
        'after', v_after_lines
      ),
      'inventory_items', pg_catalog.jsonb_build_object(
        'before', v_before_items,
        'after', v_after_items
      ),
      'stock_lots', pg_catalog.jsonb_build_object(
        'before', v_before_lots,
        'after', v_after_lots
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'purchaseId', p_purchase_id,
    'totalPurchaseCost', null,
    'allocatedTotalCost', 0,
    'entryStatus', 'capturing',
    'eventId', v_event_id
  );
end;
$function$;

create function public.tax_cost_allocations (
  p_unit_costs numeric[]
)
  returns jsonb
  language sql
  immutable
  strict
  set search_path to ''
  as $function$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'quantity', grouped.quantity,
    'tax_purchase_cost', grouped.unit_cost * grouped.quantity
  ) order by grouped.first_position), '[]'::jsonb)
  from (
    select value as unit_cost, pg_catalog.count(*) as quantity, pg_catalog.min(ordinality) as first_position
    from pg_catalog.unnest(p_unit_costs) with ordinality as unit(value, ordinality)
    group by value
  ) as grouped;
$function$;

revoke all on function public.tax_cost_allocations(numeric[]) from public, anon, authenticated, service_role;

create or replace function public.update_purchase_draft (
  p_workspace_id uuid,
  p_purchase_id  uuid,
  p_purchase     jsonb,
  p_expenses     jsonb default '[]'::jsonb,
  p_lines        jsonb default '[]'::jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_purchase public.purchases;
  v_existing_line public.purchase_lines;
  v_line jsonb;
  v_expense jsonb;
  v_line_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_refs jsonb := '{}'::jsonb;
  v_line_ref text;
  v_catalog_product_id uuid;
  v_target_line_id uuid;
  v_source_id uuid;
  v_supplier_id uuid;
  v_purchase_type text;
  v_mode text;
  v_total_expense_cents bigint;
  v_manual_cents bigint;
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_audit_before jsonb;
  v_audit_after jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or pg_catalog.jsonb_typeof(p_purchase) <> 'object'
    or pg_catalog.jsonb_typeof(p_expenses) <> 'array'
    or pg_catalog.jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null')
      not in ('null', 'number')
    or (
      pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price') = 'number'
      and (
        (p_purchase ->> 'purchase_price')::numeric < 0
        or pg_catalog.scale((p_purchase ->> 'purchase_price')::numeric) > 2
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Kaufpreis muss centgenau und darf nicht negativ sein.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status = 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Nur ein nicht finalisierter Einkaufsentwurf kann bearbeitet werden.';
  end if;

  v_audit_before := public.purchase_draft_audit_snapshot(p_workspace_id, p_purchase_id);

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  select
    coalesce(pg_catalog.max(candidate.quantity), 0),
    coalesce(pg_catalog.sum(candidate.quantity), 0)
  into v_requested_unit_max, v_requested_unit_total
  from (
    select case
      when pg_catalog.jsonb_typeof(element.value) = 'object'
        and pg_catalog.jsonb_typeof(element.value -> 'ordered_quantity') = 'number'
        and element.value ->> 'ordered_quantity' ~ '^[1-9][0-9]*$'
      then (element.value ->> 'ordered_quantity')::numeric
      else null
    end as quantity
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  ) as candidate;

  if v_requested_unit_max > v_max_purchase_units
    or v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  v_purchase_type := nullif(p_purchase ->> 'type', '');
  v_mode := coalesce(nullif(p_purchase ->> 'cost_allocation_mode', ''), 'even');
  if v_purchase_type not in ('single', 'mystery_pack', 'lot', 'pallet')
    or v_mode not in ('manual', 'even', 'value_weighted') then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'source_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '') is not null
      and (p_purchase ->> 'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;
  v_source_id := nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '')::uuid;
  if v_source_id is not null and not exists (
    select 1
    from public.sources as source
    where source.workspace_id = p_workspace_id
      and source.id = v_source_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'supplier_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '') is not null
      and (p_purchase ->> 'supplier_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;
  v_supplier_id := nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '')::uuid;
  if v_supplier_id is not null and not exists (
    select 1
    from public.suppliers as supplier
    where supplier.workspace_id = p_workspace_id
      and supplier.id = v_supplier_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;

  for v_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  loop
    v_line_ref := nullif(pg_catalog.btrim(v_line ->> 'client_ref'), '');
    if pg_catalog.jsonb_typeof(v_line) <> 'object'
      or v_line_ref is null
      or v_line_refs ? v_line_ref
      or pg_catalog.jsonb_typeof(v_line -> 'title_snapshot') <> 'string'
      or nullif(pg_catalog.btrim(v_line ->> 'title_snapshot'), '') is null
      or pg_catalog.jsonb_typeof(v_line -> 'line_kind') <> 'string'
      or v_line ->> 'line_kind' not in ('quantity', 'individual')
      or pg_catalog.jsonb_typeof(v_line -> 'ordered_quantity') <> 'number'
      or (v_line ->> 'ordered_quantity') !~ '^[1-9][0-9]*$'
      or coalesce(nullif(v_line ->> 'price_mode', ''), 'priced')
        not in ('priced', 'unpriced_mystery')
      or coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null')
        not in ('null', 'string')
      or coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null')
        not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot') = 'string'
        and v_line ->> 'condition_snapshot' not in (
          'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
        )
      )
      or coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value') = 'number'
        and (
          (v_line ->> 'estimated_market_value')::numeric < 0
          or pg_catalog.scale((v_line ->> 'estimated_market_value')::numeric) > 2
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    if v_mode = 'manual' and (
      coalesce(pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost') = 'number'
        and (
          (v_line ->> 'allocated_additional_cost')::numeric < 0
          or pg_catalog.scale((v_line ->> 'allocated_additional_cost')::numeric) > 2
        )
      )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.';
    end if;

    if coalesce(p_purchase ->> 'pricing_mode', case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
      if coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') <> 'unpriced_mystery'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') <> 'null'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') <> 'null' then
        raise exception using
          errcode = '22023',
          message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
      end if;
    elsif coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') <> 'priced'
      or pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_line -> 'line_total') is distinct from 'number'
      or (v_line ->> 'unit_purchase_price')::numeric < 0
      or (v_line ->> 'line_total')::numeric < 0
      or pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) > 16
      or pg_catalog.scale((v_line ->> 'line_total')::numeric) > 2
      or (v_line ->> 'line_total')::numeric <>
        pg_catalog.round(
          (v_line ->> 'ordered_quantity')::integer
          * (v_line ->> 'unit_purchase_price')::numeric,
          2
        ) then
      raise exception using
        errcode = '22023',
        message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
    end if;

    v_catalog_product_id := case
      when coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null') = 'null'
        then null
      else (v_line ->> 'catalog_product_id')::uuid
    end;
    if (v_line ->> 'line_kind' = 'quantity' and v_catalog_product_id is null)
      or (v_line ->> 'line_kind' = 'individual' and v_catalog_product_id is not null)
      or (
        v_catalog_product_id is not null
        and not exists (
          select 1
          from public.catalog_products as product
          where product.workspace_id = p_workspace_id
            and product.id = v_catalog_product_id
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    v_existing_line := null;
    if v_line_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select line.*
      into v_existing_line
      from public.purchase_lines as line
      where line.id = v_line_ref::uuid
      for update;

      if found and (
        v_existing_line.workspace_id <> p_workspace_id
        or v_existing_line.purchase_id <> p_purchase_id
      ) then
        raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
      end if;
    end if;

    if v_existing_line.id is not null then
      if (
        v_existing_line.received_quantity > 0
        or exists (
          select 1
          from public.inventory_items as item
          where item.workspace_id = p_workspace_id
            and item.purchase_line_id = v_existing_line.id
        )
        or exists (
          select 1
          from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_line_id = v_existing_line.id
        )
      ) and (
        v_existing_line.line_kind <> v_line ->> 'line_kind'
        or v_existing_line.ordered_quantity <> (v_line ->> 'ordered_quantity')::integer
        or v_existing_line.catalog_product_id is distinct from v_catalog_product_id
      ) then
        raise exception using
          errcode = '22023',
          message = 'Bereits erfasste Einkaufspositionen dürfen strukturell nicht verändert werden.';
      end if;

      update public.purchase_lines
      set catalog_product_id = v_catalog_product_id,
          title_snapshot = pg_catalog.btrim(v_line ->> 'title_snapshot'),
          ean_snapshot = case
            when v_line ? 'ean_snapshot'
              then nullif(pg_catalog.btrim(v_line ->> 'ean_snapshot'), '')
            else v_existing_line.ean_snapshot
          end,
          line_kind = v_line ->> 'line_kind',
          ordered_quantity = (v_line ->> 'ordered_quantity')::integer,
          price_mode = coalesce(nullif(v_line ->> 'price_mode', ''), 'priced'),
          unit_purchase_price = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
              then null
            else (v_line ->> 'unit_purchase_price')::numeric
          end,
          line_total = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
              then null
            else (v_line ->> 'line_total')::numeric
          end,
          allocated_additional_cost = case
            when v_mode = 'manual'
              then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
            else 0
          end,
          condition_snapshot = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null') = 'null'
              then null
            else v_line ->> 'condition_snapshot'
          end,
          estimated_market_value = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null') = 'null'
              then null
            else (v_line ->> 'estimated_market_value')::numeric
          end,
          updated_at = pg_catalog.clock_timestamp()
      where id = v_existing_line.id
      returning id into v_line_id;
    else
      insert into public.purchase_lines (
        workspace_id, purchase_id, catalog_product_id, title_snapshot,
        ean_snapshot,
        line_kind, ordered_quantity, received_quantity, unit_purchase_price,
        line_total, allocated_additional_cost, price_mode, condition_snapshot,
        estimated_market_value
      ) values (
        p_workspace_id,
        p_purchase_id,
        v_catalog_product_id,
        pg_catalog.btrim(v_line ->> 'title_snapshot'),
        nullif(pg_catalog.btrim(v_line ->> 'ean_snapshot'), ''),
        v_line ->> 'line_kind',
        (v_line ->> 'ordered_quantity')::integer,
        0,
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
            then null
          else (v_line ->> 'unit_purchase_price')::numeric
        end,
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
            then null
          else (v_line ->> 'line_total')::numeric
        end,
        case when v_mode = 'manual'
          then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
          else 0
        end,
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced'),
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null') = 'null'
            then null
          else v_line ->> 'condition_snapshot'
        end,
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null') = 'null'
            then null
          else (v_line ->> 'estimated_market_value')::numeric
        end
      ) returning id into v_line_id;
    end if;

    v_line_ids := pg_catalog.array_append(v_line_ids, v_line_id);
    v_line_refs := pg_catalog.jsonb_set(
      v_line_refs,
      array[v_line_ref],
      pg_catalog.to_jsonb(v_line_id::text),
      true
    );
  end loop;

  if exists (
    select 1
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and line.id <> all(v_line_ids)
      and (
        line.received_quantity > 0
        or exists (
          select 1 from public.inventory_items as item
          where item.workspace_id = p_workspace_id
            and item.purchase_line_id = line.id
        )
        or exists (
          select 1 from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_line_id = line.id
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Bereits erfasste Einkaufspositionen dürfen nicht entfernt werden.';
  end if;

  delete from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  delete from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
    and line.id <> all(v_line_ids);

  for v_expense in
    select element.value
    from pg_catalog.jsonb_array_elements(p_expenses) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_expense) <> 'object'
      or pg_catalog.jsonb_typeof(v_expense -> 'amount') <> 'number'
      or (v_expense ->> 'amount')::numeric <= 0
      or pg_catalog.scale((v_expense ->> 'amount')::numeric) > 2
      or coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted')
        not in ('direct', 'quantity', 'value_weighted') then
      raise exception using errcode = '22023', message = 'Zusatzkosten sind ungültig.';
    end if;

    if coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted') = 'direct' then
      v_line_ref := nullif(pg_catalog.btrim(v_expense ->> 'target_purchase_line_ref'), '');
      if v_line_ref is null or not (v_line_refs ? v_line_ref) then
        raise exception using
          errcode = '22023',
          message = 'Die direkte Kostenzuordnung verweist auf keine Einkaufsposition.';
      end if;
      v_target_line_id := (v_line_refs ->> v_line_ref)::uuid;
    else
      v_target_line_id := null;
    end if;

    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, description,
      allocation_method, target_purchase_line_id, tax_treatment
    ) values (
      p_workspace_id,
      p_purchase_id,
      coalesce(nullif(pg_catalog.btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(pg_catalog.btrim(v_expense ->> 'description'), ''),
      coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted'),
      v_target_line_id,
      v_expense ->> 'tax_treatment'
    );
  end loop;

  select coalesce(pg_catalog.round(pg_catalog.sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  if pg_catalog.cardinality(v_line_ids) = 0 then
    null;
  elsif v_mode = 'manual' then
    select coalesce(pg_catalog.round(pg_catalog.sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using
        errcode = '22023',
        message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
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
      from pg_catalog.unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
      cross join (
        select pg_catalog.sum(candidate.line_total) as value_total
        from public.purchase_lines as candidate
        where candidate.id = any(v_line_ids)
      ) as totals
    ), shares as (
      select
        weights.*,
        v_total_expense_cents::numeric * weight
          / nullif(pg_catalog.sum(weight) over (), 0) as exact_cents
      from weights
    ), ranked as (
      select
        shares.*,
        pg_catalog.floor(exact_cents)::bigint as floor_cents,
        pg_catalog.row_number() over (
          order by exact_cents - pg_catalog.floor(exact_cents) desc, ordinality
        ) as remainder_rank,
        v_total_expense_cents
          - pg_catalog.sum(pg_catalog.floor(exact_cents)::bigint) over () as remainder_cents
      from shares
    )
    update public.purchase_lines as line
    set allocated_additional_cost = (
      ranked.floor_cents
        + case when ranked.remainder_rank <= ranked.remainder_cents then 1 else 0 end
    )::numeric / 100
    from ranked
    where line.id = ranked.id;
  end if;

  update public.purchases
  set source_id = v_source_id,
      supplier_id = v_supplier_id,
      content_status = coalesce(p_purchase ->> 'content_status', v_purchase.content_status),
      pricing_mode = coalesce(p_purchase ->> 'pricing_mode', v_purchase.pricing_mode),
      supplier_reference = nullif(btrim(p_purchase ->> 'supplier_reference'), ''),
      discount_amount = coalesce((p_purchase ->> 'discount_amount')::numeric, 0),
      type = v_purchase_type,
      title = coalesce(pg_catalog.btrim(p_purchase ->> 'title'), ''),
      purchase_date = (p_purchase ->> 'purchase_date')::date,
      purchase_price = (p_purchase ->> 'purchase_price')::numeric,
      cost_allocation_mode = v_mode,
      notes = nullif(pg_catalog.btrim(p_purchase ->> 'notes'), ''),
      tracking_number = nullif(pg_catalog.btrim(p_purchase ->> 'tracking_number'), ''),
      tracking_carrier = nullif(p_purchase ->> 'tracking_carrier', ''),
      tracking_status = coalesce(nullif(p_purchase ->> 'tracking_status', ''), 'pending'),
      original_url = nullif(p_purchase ->> 'original_url', ''),
      updated_at = pg_catalog.clock_timestamp()
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning * into v_purchase;

  v_audit_after := public.purchase_draft_audit_snapshot(p_workspace_id, p_purchase_id);
  if v_audit_before is distinct from v_audit_after then
    insert into public.business_events (
      workspace_id, entity_type, entity_id, event_type, actor_id, changes
    ) values (
      p_workspace_id, 'purchase', p_purchase_id, 'purchase_draft_updated', (select auth.uid()),
      pg_catalog.jsonb_build_object(
        'purchase', pg_catalog.jsonb_build_object('before', v_audit_before -> 'purchase', 'after', v_audit_after -> 'purchase'),
        'lines', pg_catalog.jsonb_build_object('before', v_audit_before -> 'lines', 'after', v_audit_after -> 'lines'),
        'costs', pg_catalog.jsonb_build_object('before', v_audit_before -> 'costs', 'after', v_audit_after -> 'costs')
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'purchase', pg_catalog.to_jsonb(v_purchase),
    'purchase_costs', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cost) order by cost.created_at, cost.id)
      from public.purchase_costs as cost
      where cost.workspace_id = p_workspace_id
        and cost.purchase_id = p_purchase_id
    ), '[]'::jsonb),
    'purchase_lines', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) order by ids.ordinality)
      from pg_catalog.unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
    ), '[]'::jsonb)
  );
end;
$function$;


alter table public.inventory_items
  add column tax_purchase_cost numeric(12,2);

comment on column public.inventory_items.tax_purchase_cost is 'Einkaufspreis für §25a ohne sonstige Kosten; null bedeutet ungeklärt.';

alter table public.inventory_items
  add constraint inventory_items_tax_purchase_cost_check check (tax_purchase_cost >= 0::numeric and tax_purchase_cost < 'Infinity'::numeric);

create trigger protect_inventory_tax_cost
  before insert or update on public.inventory_items
  for each row
  execute function public.guard_tax_cost_fields();

alter table public.purchase_costs
  add column tax_treatment text;

comment on column public.purchase_costs.tax_treatment is 'purchase_price: Gegenleistung an Warenverkäufer; expense: sonstige Kosten; null: ungeklärt.';

alter table public.purchase_costs
  add constraint purchase_costs_tax_treatment_check check (tax_treatment = any (array['purchase_price'::text, 'expense'::text]));

alter table public.sale_line_lot_allocations
  add column tax_purchase_cost numeric(12,2);

alter table public.sale_line_lot_allocations
  add constraint sale_line_lot_allocations_tax_purchase_cost_check check (tax_purchase_cost >= 0::numeric and tax_purchase_cost < 'Infinity'::numeric);

alter table public.sale_line_lot_allocations
  add column tax_cost_allocations jsonb;

alter table public.sale_line_lot_allocations
  add column active_tax_unit_costs numeric[];

create trigger protect_sale_lot_tax_cost
  before insert or update on public.sale_line_lot_allocations
  for each row
  execute function public.guard_tax_cost_fields();

alter table public.sale_lines
  add column tax_purchase_cost numeric(12,2);

alter table public.sale_lines
  add constraint sale_lines_tax_purchase_cost_check check (tax_purchase_cost >= 0::numeric and tax_purchase_cost < 'Infinity'::numeric);

alter table public.sale_lines
  add column tax_cost_allocations jsonb;

comment on column public.sale_lines.tax_cost_allocations is 'Unveränderlicher Buchungssnapshot: quantity und tax_purchase_cost (Gruppensumme) je gleichem Stückpreis.';

create trigger protect_sale_tax_cost
  before insert or update on public.sale_lines
  for each row
  execute function public.guard_tax_cost_fields();

alter table public.stock_lots
  add column unit_tax_purchase_cost numeric(24,12);

alter table public.stock_lots
  add constraint stock_lots_unit_tax_purchase_cost_check check (unit_tax_purchase_cost >= 0::numeric and unit_tax_purchase_cost < 'Infinity'::numeric);

alter table public.stock_lots
  add column remaining_tax_unit_costs numeric[];

comment on column public.stock_lots.remaining_tax_unit_costs is 'Centgenaue steuerliche Kosten der noch verfügbaren Einheiten in Entnahmereihenfolge; null: ungeklärt.';

create trigger protect_lot_tax_cost
  before insert or update on public.stock_lots
  for each row
  execute function public.guard_tax_cost_fields();
ALTER TABLE public.sale_line_lot_allocations
  ADD COLUMN active_unit_costs numeric[];

ALTER TABLE public.stock_lots
  ADD COLUMN remaining_unit_costs numeric[];
