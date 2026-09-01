-- Purpose: add authoritative purchase costing, immutable business events,
-- controlled legacy repair, and hardened RPC-only write boundaries.
-- Affected: purchases, purchase_lines, purchase_costs, inventory_items,
-- stock_lots, sale_lines, sale_line_lot_allocations, business_events.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.purchases
  ALTER COLUMN purchase_price DROP DEFAULT;

ALTER TABLE public.purchases
  ALTER COLUMN total_purchase_cost DROP DEFAULT;

ALTER TABLE public.sale_line_lot_allocations
  ALTER COLUMN unit_cost TYPE numeric(24,12) USING unit_cost::numeric(24,12);

ALTER TABLE public.stock_lots
  ALTER COLUMN unit_cost TYPE numeric(24,12) USING unit_cost::numeric(24,12);

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_check2;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_line_total_check;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_ordered_quantity_check;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_unit_purchase_price_check;

CREATE OR REPLACE FUNCTION public.add_purchase_lines (
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
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_existing_line_count integer := 0;
  v_existing_unit_total bigint := 0;
  v_existing_unit_max integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if v_purchase.entry_status = 'finalized' then
    raise exception using errcode = '22023', message = 'Finalisierte Einkäufe können nicht erweitert werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_existing_line_count, v_existing_unit_total, v_existing_unit_max
  from public.purchase_lines as line
  where line.purchase_id = p_purchase_id
    and line.workspace_id = p_workspace_id;

  if v_existing_line_count + pg_catalog.jsonb_array_length(p_lines)
      > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_existing_unit_max > v_max_purchase_units
    or v_existing_unit_total + v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
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

CREATE FUNCTION public.allocate_integer_cents (
  p_total_cents bigint,
  p_weights     numeric[]
)
  RETURNS bigint[]
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  v_weight_count integer;
  v_weight_total numeric := 0;
  v_floor_total bigint := 0;
  v_remainder_count bigint := 0;
  v_result bigint[];
  v_weight numeric;
  v_position integer;
begin
  if p_total_cents is null then
    raise exception using
      errcode = '22023',
      message = 'Der Gesamtbetrag in Cent ist erforderlich.';
  end if;

  if p_total_cents < 0 then
    raise exception using
      errcode = '22023',
      message = 'Der Gesamtbetrag in Cent darf nicht negativ sein.';
  end if;

  v_weight_count := pg_catalog.cardinality(p_weights);
  if p_weights is null or v_weight_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'Mindestens ein Verteilungsgewicht ist erforderlich.';
  end if;

  for v_weight in
    select weight.value
    from pg_catalog.unnest(p_weights) as weight(value)
  loop
    if v_weight is null
      or v_weight::text in ('NaN', 'Infinity', '-Infinity')
      or v_weight < 0 then
      raise exception using
        errcode = '22023',
        message = 'Verteilungsgewichte dürfen nicht negativ sein.';
    end if;
    v_weight_total := v_weight_total + v_weight;
  end loop;

  if p_total_cents > 0 and v_weight_total = 0 then
    raise exception using
      errcode = '22023',
      message = 'Die Summe der Verteilungsgewichte muss positiv sein.';
  end if;

  v_result := pg_catalog.array_fill(0::bigint, array[v_weight_count]);
  if p_total_cents = 0 then
    return v_result;
  end if;

  with exact_shares as (
    select
      weight.ordinality::integer as position,
      p_total_cents::numeric * weight.value / v_weight_total as exact_cents
    from pg_catalog.unnest(p_weights) with ordinality as weight(value, ordinality)
  )
  select
    pg_catalog.array_agg(pg_catalog.floor(share.exact_cents)::bigint order by share.position),
    pg_catalog.sum(pg_catalog.floor(share.exact_cents)::bigint)
  into v_result, v_floor_total
  from exact_shares as share;

  v_remainder_count := p_total_cents - v_floor_total;
  for v_position in
    select share.position
    from (
      select
        weight.ordinality::integer as position,
        p_total_cents::numeric * weight.value / v_weight_total as exact_cents
      from pg_catalog.unnest(p_weights) with ordinality as weight(value, ordinality)
    ) as share
    order by
      share.exact_cents - pg_catalog.floor(share.exact_cents) desc,
      share.position
    limit v_remainder_count
  loop
    v_result[v_position] := v_result[v_position] + 1;
  end loop;

  return v_result;
end;
$function$;

COMMENT ON FUNCTION public.allocate_integer_cents(bigint,numeric[]) IS 'Verteilt ganze Cent per Largest Remainder; Gleichstände folgen stabil der Arrayposition.';

REVOKE ALL ON FUNCTION public.allocate_integer_cents(bigint, numeric[]) FROM PUBLIC;

CREATE FUNCTION public.build_purchase_costing_plan (
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
  v_unit_component_shares bigint[];
  v_unit_total_shares bigint[];
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
    v_line_goods_shares := public.allocate_integer_cents(v_goods_cents, v_line_weights);

    for v_cost in
      select cost.*
      from public.purchase_costs as cost
      where cost.workspace_id = p_workspace_id
        and cost.purchase_id = p_purchase_id
      order by cost.created_at, cost.id
    loop
      v_cost_shares := public.allocate_integer_cents(
        (v_cost.amount * 100)::bigint,
        v_line_weights
      );
      for v_line_position in 1..v_line_count loop
        v_line_additional_shares[v_line_position] :=
          v_line_additional_shares[v_line_position] + v_cost_shares[v_line_position];
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

  for v_line_position in 1..v_line_count loop
    select line.*
    into v_line
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.id = v_line_ids[v_line_position];

    v_unit_goods_shares := public.allocate_integer_cents(
      v_line_goods_shares[v_line_position],
      pg_catalog.array_fill(1::numeric, array[v_line.ordered_quantity])
    );
    v_unit_additional_shares := pg_catalog.array_fill(
      0::bigint,
      array[v_line.ordered_quantity]
    );

    if v_purchase.type = 'mystery_pack' then
      for v_cost in
        select cost.*
        from public.purchase_costs as cost
        where cost.workspace_id = p_workspace_id
          and cost.purchase_id = p_purchase_id
        order by cost.created_at, cost.id
      loop
        v_cost_shares := public.allocate_integer_cents(
          (v_cost.amount * 100)::bigint,
          v_line_weights
        );
        v_unit_component_shares := public.allocate_integer_cents(
          v_cost_shares[v_line_position],
          pg_catalog.array_fill(1::numeric, array[v_line.ordered_quantity])
        );
        for v_item_position in 1..v_line.ordered_quantity loop
          v_unit_additional_shares[v_item_position] :=
            v_unit_additional_shares[v_item_position]
            + v_unit_component_shares[v_item_position];
        end loop;
      end loop;
    else
      v_unit_additional_shares := public.allocate_integer_cents(
        v_line_additional_shares[v_line_position],
        pg_catalog.array_fill(1::numeric, array[v_line.ordered_quantity])
      );
    end if;

    v_unit_total_shares := pg_catalog.array_fill(
      0::bigint,
      array[v_line.ordered_quantity]
    );
    for v_item_position in 1..v_line.ordered_quantity loop
      v_unit_total_shares[v_item_position] :=
        v_unit_goods_shares[v_item_position]
        + v_unit_additional_shares[v_item_position];
    end loop;

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

COMMENT ON FUNCTION public.build_purchase_costing_plan(uuid,uuid) IS 'Interner centgenauer Kostenplan für Finalisierung und Korrektur.';

REVOKE ALL ON FUNCTION public.build_purchase_costing_plan(uuid, uuid) FROM PUBLIC;

CREATE FUNCTION public.correct_purchase_costing (
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

  if v_purchase.type = 'mystery_pack' then
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
            and product.tracking_mode = 'quantity'
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
    end if;

    if v_purchase.type = 'mystery_pack' then
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
      or pg_catalog.scale((v_input_line ->> 'unit_purchase_price')::numeric) > 2
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
      or v_input_cost - array[
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
          target_purchase_line_id = v_target_line_id
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
        when v_purchase.type = 'mystery_pack' then p_purchase_price
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
              updated_at = v_changed_at
          where workspace_id = p_workspace_id
            and id = v_item_ids[v_item_position];
        else
          insert into public.inventory_items (
            workspace_id,
            purchase_id,
            purchase_line_id,
            title,
            condition,
            status,
            allocated_purchase_cost,
            expected_value,
            created_at,
            updated_at
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.title_snapshot,
            case
              when v_line.condition_snapshot in (
                'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
              ) then v_line.condition_snapshot
              else 'used'
            end,
            'ready',
            v_unit_shares[v_item_position]::numeric / 100,
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
                active_allocated_cost = v_active_allocation_cost_cents::numeric / 100
            where workspace_id = p_workspace_id
              and id = v_allocation.id;

            v_active_unit_offset := v_active_unit_offset + v_active_quantity;
          end loop;

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
          select share.value as unit_cost_cents, pg_catalog.count(*)::integer as quantity
          from pg_catalog.unnest(v_unit_shares) as share(value)
          group by share.value
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
          select item.allocated_purchase_cost
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
  set purchase_price = v_goods_cents::numeric / 100,
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

COMMENT ON FUNCTION public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb) IS 'Korrigiert Eingaben, Bestandskosten und betroffenen Wareneinsatz atomar mit Begründung.';

REVOKE ALL ON FUNCTION public.correct_purchase_costing(uuid, uuid, text, numeric, jsonb, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.correct_purchase_costing(uuid, uuid, text, numeric, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_purchase (
  p_workspace_id uuid,
  p_purchase     jsonb,
  p_expenses     jsonb DEFAULT '[]'::jsonb,
  p_lines        jsonb DEFAULT '[]'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
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
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
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

  insert into public.purchases (
    workspace_id, source_id, supplier_id, type, title, purchase_date,
    purchase_price, cost_allocation_mode, notes, tracking_number,
    tracking_carrier, tracking_status, original_url, receiving_status
  ) values (
    p_workspace_id,
    nullif(p_purchase ->> 'source_id', '')::uuid,
    nullif(p_purchase ->> 'supplier_id', '')::uuid,
    p_purchase ->> 'type',
    btrim(p_purchase ->> 'title'),
    (p_purchase ->> 'purchase_date')::date,
    (p_purchase ->> 'purchase_price')::numeric,
    v_mode,
    nullif(btrim(p_purchase ->> 'notes'), ''),
    nullif(btrim(p_purchase ->> 'tracking_number'), ''),
    nullif(p_purchase ->> 'tracking_carrier', ''),
    coalesce(nullif(p_purchase ->> 'tracking_status', ''), 'pending'),
    nullif(p_purchase ->> 'original_url', ''),
    case when jsonb_array_length(p_lines) > 0 then 'ordered' else 'received' end
  ) returning * into v_purchase;

  for v_expense in select value from jsonb_array_elements(p_expenses) loop
    if coalesce((v_expense ->> 'amount')::numeric, 0) <= 0 then
      raise exception using errcode = '22023', message = 'Zusatzkosten müssen positiv sein.';
    end if;
    insert into public.purchase_costs (workspace_id, purchase_id, type, amount, description)
    values (
      p_workspace_id,
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

  if cardinality(v_line_ids) = 0 then
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

CREATE FUNCTION public.finalize_purchase_costing (
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
            condition,
            status,
            allocated_purchase_cost,
            expected_value
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.title_snapshot,
            case
              when v_line.condition_snapshot in (
                'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
              ) then v_line.condition_snapshot
              else 'used'
            end,
            'ready',
            v_unit_shares[v_item_position]::numeric / 100,
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
          pg_catalog.count(*)::integer as quantity,
          pg_catalog.min(share.ordinality) as first_position
        from pg_catalog.unnest(v_unit_shares)
          with ordinality as share(value, ordinality)
        where share.ordinality > v_unit_offset
        group by share.value
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
          received_at
        ) values (
          p_workspace_id,
          p_purchase_id,
          v_line.id,
          v_line.catalog_product_id,
          v_cohort.quantity,
          v_cohort.quantity,
          v_cohort.unit_cost_cents::numeric / 100,
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
  set purchase_price = v_goods_cents::numeric / 100,
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

COMMENT ON FUNCTION public.finalize_purchase_costing(uuid,uuid) IS 'Finalisiert Kosten, Bestand und fachliches Ereignis eines Einkaufs atomar und centgenau.';

REVOKE ALL ON FUNCTION public.finalize_purchase_costing(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.finalize_purchase_costing(uuid, uuid) TO authenticated;

CREATE FUNCTION public.guard_inventory_item_costing_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_purchase_status text;
  v_old_purchase_capturing boolean := false;
  v_new_purchase_capturing boolean := false;
begin
  if current_user = 'postgres' then
    return coalesce(new, old);
  end if;

  if tg_op <> 'INSERT' and old.purchase_id is not null then
    select purchase.entry_status
    into v_purchase_status
    from public.purchases as purchase
    where purchase.id = old.purchase_id
      and purchase.workspace_id = old.workspace_id
    for key share;

    if v_purchase_status = 'finalized' then
      raise exception using
        errcode = '42501',
        message = 'Bestandsdaten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.';
    end if;
    v_old_purchase_capturing := v_old_purchase_capturing
      or v_purchase_status = 'capturing';
  end if;

  if tg_op <> 'INSERT' and old.purchase_line_id is not null then
    select purchase.entry_status
    into v_purchase_status
    from public.purchase_lines as line
    join public.purchases as purchase
      on purchase.id = line.purchase_id
      and purchase.workspace_id = line.workspace_id
    where line.id = old.purchase_line_id
      and line.workspace_id = old.workspace_id
    for key share of purchase;

    if v_purchase_status = 'finalized' then
      raise exception using
        errcode = '42501',
        message = 'Bestandsdaten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.';
    end if;
    v_old_purchase_capturing := v_old_purchase_capturing
      or v_purchase_status = 'capturing';
  end if;

  if tg_op <> 'DELETE' and new.purchase_id is not null then
    select purchase.entry_status
    into v_purchase_status
    from public.purchases as purchase
    where purchase.id = new.purchase_id
      and purchase.workspace_id = new.workspace_id
    for key share;

    if v_purchase_status = 'finalized' then
      raise exception using
        errcode = '42501',
        message = 'Bestandsdaten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.';
    end if;
    v_new_purchase_capturing := v_new_purchase_capturing
      or v_purchase_status = 'capturing';
  end if;

  if tg_op <> 'DELETE' and new.purchase_line_id is not null then
    select purchase.entry_status
    into v_purchase_status
    from public.purchase_lines as line
    join public.purchases as purchase
      on purchase.id = line.purchase_id
      and purchase.workspace_id = line.workspace_id
    where line.id = new.purchase_line_id
      and line.workspace_id = new.workspace_id
    for key share of purchase;

    if v_purchase_status = 'finalized' then
      raise exception using
        errcode = '42501',
        message = 'Bestandsdaten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.';
    end if;
    v_new_purchase_capturing := v_new_purchase_capturing
      or v_purchase_status = 'capturing';
  end if;

  if tg_op <> 'DELETE'
    and (v_old_purchase_capturing or v_new_purchase_capturing)
    and (
      new.status in ('ready', 'listed')
      or (
        tg_op = 'UPDATE'
        and (
          old.purchase_id is distinct from new.purchase_id
          or old.purchase_line_id is distinct from new.purchase_line_id
        )
      )
    ) then
    raise exception using
      errcode = '42501',
      message = 'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.';
  end if;

  if tg_op = 'INSERT'
    and (new.purchase_id is not null or new.purchase_line_id is not null)
    and new.allocated_purchase_cost <> 0 then
    raise exception using
      errcode = '42501',
      message = 'Bestandskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.';
  elsif tg_op = 'UPDATE'
    and (
      (
        old.allocated_purchase_cost is distinct from new.allocated_purchase_cost
        and (
          old.purchase_id is not null
          or old.purchase_line_id is not null
          or new.purchase_id is not null
          or new.purchase_line_id is not null
        )
      )
      or (
        (
          old.purchase_id is distinct from new.purchase_id
          or old.purchase_line_id is distinct from new.purchase_line_id
        )
        and (new.purchase_id is not null or new.purchase_line_id is not null)
        and new.allocated_purchase_cost <> 0
      )
    ) then
    raise exception using
      errcode = '42501',
      message = 'Bestandskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.';
  end if;

  return coalesce(new, old);
end;
$function$;

REVOKE ALL ON FUNCTION public.guard_inventory_item_costing_fields() FROM PUBLIC;

CREATE FUNCTION public.guard_purchase_cost_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_old_purchase_status text;
  v_new_purchase_status text;
begin
  if current_user = 'postgres' then
    return coalesce(new, old);
  end if;

  if tg_op <> 'INSERT' then
    select purchase.entry_status
    into v_old_purchase_status
    from public.purchases as purchase
    where purchase.id = old.purchase_id
      and purchase.workspace_id = old.workspace_id
    for key share;

    if v_old_purchase_status = 'finalized' then
      raise exception using
        errcode = '42501',
        message = 'Kosten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.';
    end if;
  end if;

  if tg_op <> 'DELETE' then
    select purchase.entry_status
    into v_new_purchase_status
    from public.purchases as purchase
    where purchase.id = new.purchase_id
      and purchase.workspace_id = new.workspace_id
    for key share;

    if v_new_purchase_status = 'finalized' then
      raise exception using
        errcode = '42501',
        message = 'Kosten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    old.workspace_id is distinct from new.workspace_id
    or old.purchase_id is distinct from new.purchase_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Kostenzeilen dürfen nicht auf einen anderen Einkauf verschoben werden.';
  end if;

  return coalesce(new, old);
end;
$function$;

REVOKE ALL ON FUNCTION public.guard_purchase_cost_mutation() FROM PUBLIC;

CREATE FUNCTION public.guard_purchase_costing_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if current_user = 'postgres' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.entry_status <> 'draft'
      or new.finalized_at is not null
      or new.finalized_by is not null
      or new.total_purchase_cost is not null then
      raise exception using
        errcode = '42501',
        message = 'Finalisierungsstatus und abgeleitete Einkaufskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.';
    end if;
    return new;
  end if;

  if old.entry_status = 'finalized' then
    raise exception using
      errcode = '42501',
      message = 'Finalisierte Einkaufsdaten dürfen nur über eine geprüfte Business-Funktion geändert werden.';
  end if;

  if old.entry_status is distinct from new.entry_status
    or old.finalized_at is distinct from new.finalized_at
    or old.finalized_by is distinct from new.finalized_by
    or old.total_purchase_cost is distinct from new.total_purchase_cost then
    raise exception using
      errcode = '42501',
      message = 'Finalisierungsstatus und abgeleitete Einkaufskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.';
  end if;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.guard_purchase_costing_fields() FROM PUBLIC;

CREATE FUNCTION public.guard_purchase_line_costing_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_old_status text;
  v_new_status text;
  v_other_line_count integer := 0;
  v_other_units bigint := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
begin
  if tg_op <> 'DELETE' and new.ordered_quantity > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  -- Trusted business RPCs validate the complete purchase once while holding its
  -- advisory and row locks. Skipping their per-row trigger scans avoids O(n²).
  if current_user = 'postgres' then
    return coalesce(new, old);
  end if;

  if tg_op <> 'DELETE' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.purchase_id::text, 0)
    );

    select
      pg_catalog.count(*)::integer,
      coalesce(pg_catalog.sum(line.ordered_quantity), 0)
    into v_other_line_count, v_other_units
    from public.purchase_lines as line
    where line.workspace_id = new.workspace_id
      and line.purchase_id = new.purchase_id
      and (new.id is null or line.id <> new.id);

    if v_other_line_count + 1 > v_max_purchase_lines then
      raise exception using
        errcode = '22023',
        message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
    end if;

    if v_other_units + new.ordered_quantity > v_max_purchase_units then
      raise exception using
        errcode = '22023',
        message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
    end if;
  end if;

  if tg_op <> 'INSERT' then
    select purchase.entry_status
    into v_old_status
    from public.purchases as purchase
    where purchase.id = old.purchase_id
      and purchase.workspace_id = old.workspace_id
    for key share;
  end if;

  if tg_op <> 'DELETE' then
    select purchase.entry_status
    into v_new_status
    from public.purchases as purchase
    where purchase.id = new.purchase_id
      and purchase.workspace_id = new.workspace_id
    for key share;
  end if;

  if v_old_status = 'finalized' or v_new_status = 'finalized' then
    raise exception using
      errcode = '42501',
      message = 'Finalisierte Einkaufspositionen dürfen nur über eine geprüfte Business-Funktion geändert werden.';
  end if;

  if tg_op = 'INSERT' then
    if new.allocated_additional_cost <> 0 or new.allocated_total_cost <> 0 then
      raise exception using
        errcode = '42501',
        message = 'Abgeleitete Positionskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.';
    end if;
  elsif tg_op = 'UPDATE' and (
    old.allocated_additional_cost is distinct from new.allocated_additional_cost
    or old.allocated_total_cost is distinct from new.allocated_total_cost
  ) then
    raise exception using
      errcode = '42501',
      message = 'Abgeleitete Positionskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.';
  end if;

  return coalesce(new, old);
end;
$function$;

REVOKE ALL ON FUNCTION public.guard_purchase_line_costing_fields() FROM PUBLIC;

CREATE FUNCTION public.guard_sale_line_lot_allocation_sequence()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if old.consumption_sequence is not null and (
    old.consumption_sequence is distinct from new.consumption_sequence
    or old.stock_lot_id is distinct from new.stock_lot_id
    or old.sale_line_id is distinct from new.sale_line_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Eine vergebene Losentnahmereihenfolge ist unveränderlich.';
  end if;

  if old.consumption_sequence is null
    and new.consumption_sequence is not null
    and coalesce(
      pg_catalog.current_setting('flipbase.allow_consumption_sequence_backfill', true),
      'off'
    ) <> 'on' then
    raise exception using
      errcode = '42501',
      message = 'Eine historische Losentnahmereihenfolge darf nur kontrolliert nachgetragen werden.';
  end if;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.guard_sale_line_lot_allocation_sequence() FROM PUBLIC;

CREATE FUNCTION public.guard_stock_lot_costing_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if not pg_catalog.isfinite(new.received_at) then
    raise exception using
      errcode = '22023',
      message = 'Der Empfangszeitpunkt muss ein endlicher Zeitpunkt sein.';
  end if;

  if current_user = 'postgres' then
    return new;
  end if;

  if (tg_op = 'INSERT' and new.unit_cost <> 0)
    or (tg_op = 'UPDATE' and old.unit_cost is distinct from new.unit_cost) then
    raise exception using
      errcode = '42501',
      message = 'Bestandskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.';
  end if;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.guard_stock_lot_costing_fields() FROM PUBLIC;

CREATE FUNCTION public.list_business_events (
  p_workspace_id      uuid,
  p_filter            jsonb,
  p_cursor_created_at timestamp with time zone,
  p_cursor_id         uuid,
  p_page_size         integer
)
  RETURNS TABLE (
    id             uuid,
    workspace_id   uuid,
    entity_type    text,
    entity_id      uuid,
    event_type     text,
    actor_id       uuid,
    reason         text,
    changes        jsonb,
    correlation_id uuid,
    created_at     timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null or p_workspace_id is null then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für den globalen Ereignisverlauf.';
  end if;

  if not exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.user_id = v_actor_id
      and member.role in ('owner', 'admin', 'accountant')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für den globalen Ereignisverlauf.';
  end if;

  if p_filter is null or jsonb_typeof(p_filter) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Der Ereignisfilter muss ein JSON-Objekt sein.';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception using
      errcode = '22023',
      message = 'Die Seitengröße muss zwischen 1 und 100 liegen.';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using
      errcode = '22023',
      message = 'Der Ereigniscursor ist unvollständig.';
  end if;

  return query
  select
    event.id,
    event.workspace_id,
    event.entity_type,
    event.entity_id,
    event.event_type,
    event.actor_id,
    event.reason,
    event.changes,
    event.correlation_id,
    event.created_at
  from public.business_events as event
  where event.workspace_id = p_workspace_id
    and (
      not (p_filter ? 'entity_type')
      or event.entity_type = p_filter ->> 'entity_type'
    )
    and (
      not (p_filter ? 'entity_id')
      or event.entity_id = (p_filter ->> 'entity_id')::uuid
    )
    and (
      not (p_filter ? 'event_type')
      or event.event_type = p_filter ->> 'event_type'
    )
    and (
      not (p_filter ? 'actor_id')
      or event.actor_id = (p_filter ->> 'actor_id')::uuid
    )
    and (
      not (p_filter ? 'from')
      or event.created_at >= (p_filter ->> 'from')::timestamptz
    )
    and (
      not (p_filter ? 'to')
      or event.created_at <= (p_filter ->> 'to')::timestamptz
    )
    and (
      p_cursor_created_at is null
      or (event.created_at, event.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by event.created_at desc, event.id desc
  limit p_page_size;
end;
$function$;

COMMENT ON FUNCTION public.list_business_events(uuid,jsonb,timestamp with time zone,uuid,integer) IS 'Liefert den globalen Ereignisverlauf fuer privilegierte Workspace-Rollen per Keyset-Paginierung.';

REVOKE ALL ON FUNCTION public.list_business_events(uuid, jsonb, timestamp WITH time zone, uuid, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.list_business_events(uuid, jsonb, timestamp WITH time zone, uuid, integer) TO authenticated;

CREATE FUNCTION public.list_entity_business_events (
  p_workspace_id      uuid,
  p_entity_type       text,
  p_entity_id         uuid,
  p_cursor_created_at timestamp with time zone,
  p_cursor_id         uuid,
  p_page_size         integer
)
  RETURNS TABLE (
    id             uuid,
    workspace_id   uuid,
    entity_type    text,
    entity_id      uuid,
    event_type     text,
    actor_id       uuid,
    reason         text,
    changes        jsonb,
    correlation_id uuid,
    created_at     timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_has_entity_access boolean := false;
  v_privileged_role boolean := false;
begin
  if v_actor_id is null or p_workspace_id is null or p_entity_id is null then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für diesen Datensatzverlauf.';
  end if;

  select member.role in ('owner', 'admin', 'accountant')
  into v_privileged_role
  from public.workspace_members as member
  where member.workspace_id = p_workspace_id
    and member.user_id = v_actor_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für diesen Datensatzverlauf.';
  end if;

  case p_entity_type
    when 'purchase' then
      select exists (
        select 1
        from public.purchases as purchase
        where purchase.workspace_id = p_workspace_id
          and purchase.id = p_entity_id
      ) into v_has_entity_access;
    when 'inventory_item' then
      select exists (
        select 1
        from public.inventory_items as inventory_item
        where inventory_item.workspace_id = p_workspace_id
          and inventory_item.id = p_entity_id
      ) into v_has_entity_access;
    when 'sale' then
      select exists (
        select 1
        from public.sales as sale
        where sale.workspace_id = p_workspace_id
          and sale.id = p_entity_id
      ) into v_has_entity_access;
    when 'return' then
      select exists (
        select 1
        from public.returns as returned_sale
        where returned_sale.workspace_id = p_workspace_id
          and returned_sale.id = p_entity_id
      ) into v_has_entity_access;
    when 'export' then
      if v_privileged_role then
        select exists (
          select 1
          from public.business_events as event
          where event.workspace_id = p_workspace_id
            and event.entity_type = 'export'
            and event.entity_id = p_entity_id
        ) into v_has_entity_access;
      end if;
    else
      raise exception using
        errcode = '22023',
        message = 'Unbekannter fachlicher Datensatztyp.';
  end case;

  if not v_has_entity_access then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für diesen Datensatzverlauf.';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception using
      errcode = '22023',
      message = 'Die Seitengröße muss zwischen 1 und 100 liegen.';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using
      errcode = '22023',
      message = 'Der Ereigniscursor ist unvollständig.';
  end if;

  return query
  select
    event.id,
    event.workspace_id,
    event.entity_type,
    event.entity_id,
    event.event_type,
    event.actor_id,
    event.reason,
    event.changes,
    event.correlation_id,
    event.created_at
  from public.business_events as event
  where event.workspace_id = p_workspace_id
    and event.entity_type = p_entity_type
    and event.entity_id = p_entity_id
    and (
      p_cursor_created_at is null
      or (event.created_at, event.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by event.created_at desc, event.id desc
  limit p_page_size;
end;
$function$;

COMMENT ON FUNCTION public.list_entity_business_events(uuid,text,uuid,timestamp with time zone,uuid,integer) IS 'Liefert nach einer typbezogenen Zugriffspruefung den Ereignisverlauf eines Datensatzes.';

REVOKE ALL ON FUNCTION public.list_entity_business_events(uuid, text, uuid, timestamp WITH time zone, uuid, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.list_entity_business_events(uuid, text, uuid, timestamp WITH time zone, uuid, integer) TO authenticated;

CREATE FUNCTION public.migrate_purchase_costing_legacy (
  p_workspace_id uuid,
  p_confirm      boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_privileged boolean := false;
  v_candidate record;
  v_item public.inventory_items;
  v_purchase public.purchases;
  v_line_id uuid;
  v_lines jsonb;
  v_costs jsonb;
  v_repaired bigint := 0;
  v_items_missing bigint := 0;
  v_manual_review bigint := 0;
begin
  if v_actor_id is null or p_workspace_id is null then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für die Altdatenmigration.';
  end if;

  select member.role in ('owner', 'admin', 'accountant')
  into v_privileged
  from public.workspace_members as member
  where member.workspace_id = p_workspace_id
    and member.user_id = v_actor_id;

  if not found or not v_privileged then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für die Altdatenmigration.';
  end if;

  if p_confirm is distinct from true then
    raise exception using
      errcode = '22023',
      message = 'Die Altdatenmigration benötigt eine ausdrückliche Bestätigung.';
  end if;

  select
    pg_catalog.count(*) filter (where preview.classification = 'items_missing'),
    pg_catalog.count(*) filter (where preview.classification = 'manual_review')
  into v_items_missing, v_manual_review
  from public.preview_purchase_costing_legacy(p_workspace_id) as preview;

  for v_candidate in
    select preview.*
    from public.preview_purchase_costing_legacy(p_workspace_id) as preview
    where preview.classification = 'auto_repair'
    order by preview.purchase_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_candidate.purchase_id::text, 0)
    );

    select purchase.*
    into v_purchase
    from public.purchases as purchase
    where purchase.workspace_id = p_workspace_id
      and purchase.id = v_candidate.purchase_id
    for update;

    if not found or v_purchase.entry_status = 'finalized' then
      continue;
    end if;

    if not exists (
      select 1
      from public.preview_purchase_costing_legacy(p_workspace_id) as preview
      where preview.purchase_id = v_candidate.purchase_id
        and preview.classification = 'auto_repair'
    ) then
      continue;
    end if;

    for v_item in
      select item.*
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = v_candidate.purchase_id
      order by item.created_at, item.id
      for update
    loop
      v_line_id := pg_catalog.gen_random_uuid();

      insert into public.purchase_lines (
        id,
        workspace_id,
        purchase_id,
        catalog_product_id,
        title_snapshot,
        line_kind,
        ordered_quantity,
        received_quantity,
        unit_purchase_price,
        line_total,
        allocated_additional_cost,
        created_at,
        updated_at,
        price_mode,
        condition_snapshot,
        estimated_market_value,
        allocated_total_cost
      ) values (
        v_line_id,
        p_workspace_id,
        v_candidate.purchase_id,
        null,
        v_item.title,
        'individual',
        1,
        1,
        null,
        null,
        0,
        v_item.created_at,
        v_item.updated_at,
        'unpriced_mystery',
        v_item.condition,
        v_item.expected_value,
        0
      );

      update public.inventory_items
      set purchase_line_id = v_line_id
      where workspace_id = p_workspace_id
        and id = v_item.id;
    end loop;

    update public.purchases
    set entry_status = 'finalized',
        finalized_at = pg_catalog.clock_timestamp(),
        finalized_by = v_actor_id,
        total_purchase_cost = v_purchase.purchase_price + coalesce((
          select pg_catalog.sum(cost.amount)
          from public.purchase_costs as cost
          where cost.workspace_id = p_workspace_id
            and cost.purchase_id = v_candidate.purchase_id
        ), 0),
        updated_at = pg_catalog.clock_timestamp()
    where workspace_id = p_workspace_id
      and id = v_candidate.purchase_id;

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', line.id,
        'catalog_product_id', line.catalog_product_id,
        'title_snapshot', line.title_snapshot,
        'line_kind', line.line_kind,
        'ordered_quantity', line.ordered_quantity,
        'price_mode', line.price_mode,
        'unit_purchase_price', line.unit_purchase_price,
        'line_total', line.line_total,
        'condition_snapshot', line.condition_snapshot,
        'estimated_market_value', line.estimated_market_value
      ) order by line.created_at, line.id
    )
    into v_lines
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = v_candidate.purchase_id;

    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', cost.id,
        'type', cost.type,
        'amount', cost.amount,
        'description', cost.description,
        'allocation_method', cost.allocation_method,
        'target_purchase_line_id', cost.target_purchase_line_id
      ) order by cost.created_at, cost.id
    ), '[]'::jsonb)
    into v_costs
    from public.purchase_costs as cost
    where cost.workspace_id = p_workspace_id
      and cost.purchase_id = v_candidate.purchase_id;

    perform public.correct_purchase_costing(
      p_workspace_id,
      v_candidate.purchase_id,
      'Kontrollierte Übernahme historischer Mystery-Einkaufskosten.',
      v_purchase.purchase_price,
      v_lines,
      v_costs
    );

    v_repaired := v_repaired + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'repaired', v_repaired,
    'itemsMissing', v_items_missing,
    'manualReview', v_manual_review
  );
end;
$function$;

COMMENT ON FUNCTION public.migrate_purchase_costing_legacy(uuid,boolean) IS 'Repariert nur eindeutig klassifizierte Mystery-Altdaten nach ausdrücklicher Bestätigung.';

REVOKE ALL ON FUNCTION public.migrate_purchase_costing_legacy(uuid, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.migrate_purchase_costing_legacy(uuid, boolean) FROM anon, service_role;

GRANT ALL ON FUNCTION public.migrate_purchase_costing_legacy(uuid, boolean) TO authenticated;

CREATE FUNCTION public.prevent_business_event_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Fachliche Ereignisse sind unveränderbar.';
end;
$function$;

REVOKE ALL ON FUNCTION public.prevent_business_event_mutation() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.prevent_workspace_with_business_data_deletion()
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
    or exists (select 1 from public.business_events where workspace_id = old.id)
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

CREATE FUNCTION public.preview_purchase_costing_legacy (
  p_workspace_id uuid
)
  RETURNS TABLE (
    purchase_id    uuid,
    classification text,
    reason         text,
    item_count     bigint,
    line_count     bigint
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_privileged boolean := false;
begin
  if v_actor_id is null or p_workspace_id is null then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für die Altdatenprüfung.';
  end if;

  select member.role in ('owner', 'admin', 'accountant')
  into v_privileged
  from public.workspace_members as member
  where member.workspace_id = p_workspace_id
    and member.user_id = v_actor_id;

  if not found or not v_privileged then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für die Altdatenprüfung.';
  end if;

  return query
  with candidates as (
    select
      purchase.id,
      purchase.type,
      purchase.purchase_price,
      coalesce(item_totals.item_count, 0) as item_count,
      coalesce(line_totals.line_count, 0) as line_count,
      coalesce(line_totals.unit_count, 0) as unit_count,
      coalesce(line_totals.max_line_quantity, 0) as max_line_quantity,
      coalesce(lot_totals.lot_count, 0) as lot_count,
      coalesce(lot_totals.invalid_timestamp_count, 0) as invalid_timestamp_count,
      coalesce(lot_totals.ambiguous_allocation_count, 0) as ambiguous_allocation_count,
      coalesce(item_totals.linked_line_count, 0) as linked_line_count,
      coalesce(item_totals.sale_conflict_count, 0) as sale_conflict_count,
      coalesce(cost_totals.invalid_cost_count, 0) as invalid_cost_count
    from public.purchases as purchase
    left join lateral (
      select
        pg_catalog.count(*) as item_count,
        pg_catalog.count(*) filter (where item.purchase_line_id is not null) as linked_line_count,
        pg_catalog.count(*) filter (
          where (
            item.status = 'sold'
            and (
              select pg_catalog.count(*)
              from public.sale_lines as sale_line
              join public.sales as sale
                on sale.workspace_id = sale_line.workspace_id
                and sale.id = sale_line.sale_id
              where sale_line.workspace_id = item.workspace_id
                and sale_line.inventory_item_id = item.id
                and sale.voided_at is null
                and sale.returned_at is null
            ) <> 1
          ) or (
            item.status <> 'sold'
            and exists (
              select 1
              from public.sale_lines as sale_line
              join public.sales as sale
                on sale.workspace_id = sale_line.workspace_id
                and sale.id = sale_line.sale_id
              where sale_line.workspace_id = item.workspace_id
                and sale_line.inventory_item_id = item.id
                and sale.voided_at is null
                and sale.returned_at is null
            )
          )
        ) as sale_conflict_count
      from public.inventory_items as item
      where item.workspace_id = purchase.workspace_id
        and item.purchase_id = purchase.id
    ) as item_totals on true
    left join lateral (
      select
        pg_catalog.count(*) as line_count,
        coalesce(pg_catalog.sum(line.ordered_quantity), 0) as unit_count,
        coalesce(pg_catalog.max(line.ordered_quantity), 0) as max_line_quantity
      from public.purchase_lines as line
      where line.workspace_id = purchase.workspace_id
        and line.purchase_id = purchase.id
    ) as line_totals on true
    left join lateral (
      select
        pg_catalog.count(*) as lot_count,
        pg_catalog.count(*) filter (
          where not pg_catalog.isfinite(lot.received_at)
        ) as invalid_timestamp_count,
        (
          select pg_catalog.count(*)
          from public.sale_line_lot_allocations as allocation
          join public.stock_lots as allocation_lot
            on allocation_lot.workspace_id = allocation.workspace_id
            and allocation_lot.id = allocation.stock_lot_id
          where allocation.workspace_id = purchase.workspace_id
            and allocation_lot.purchase_id = purchase.id
            and (
              allocation.consumption_sequence is null
              or allocation.active_allocated_cost is null
              or exists (
                select 1
                from public.sale_line_lot_allocations as tied_allocation
                where tied_allocation.workspace_id = allocation.workspace_id
                  and tied_allocation.stock_lot_id = allocation.stock_lot_id
                  and tied_allocation.id <> allocation.id
                  and tied_allocation.created_at = allocation.created_at
              )
            )
        ) as ambiguous_allocation_count
      from public.stock_lots as lot
      where lot.workspace_id = purchase.workspace_id
        and lot.purchase_id = purchase.id
    ) as lot_totals on true
    left join lateral (
      select pg_catalog.count(*) filter (
        where cost.amount::text in ('NaN', 'Infinity', '-Infinity')
          or cost.amount < 0
          or pg_catalog.scale(cost.amount) > 2
      ) as invalid_cost_count
      from public.purchase_costs as cost
      where cost.workspace_id = purchase.workspace_id
        and cost.purchase_id = purchase.id
    ) as cost_totals on true
    where purchase.workspace_id = p_workspace_id
      and purchase.entry_status <> 'finalized'
  )
  select
    candidate.id,
    case
      when candidate.type <> 'mystery_pack' then 'manual_review'
      when candidate.purchase_price is null
        or candidate.purchase_price::text in ('NaN', 'Infinity', '-Infinity')
        or candidate.purchase_price < 0
        or pg_catalog.scale(candidate.purchase_price) > 2 then 'manual_review'
      when candidate.line_count > 1000
        or candidate.unit_count > 100000
        or candidate.max_line_quantity > 100000 then 'manual_review'
      when candidate.line_count > 0 then 'manual_review'
      when candidate.item_count = 0 then 'items_missing'
      when candidate.item_count > 1000 then 'manual_review'
      when candidate.invalid_timestamp_count > 0 then 'manual_review'
      when candidate.ambiguous_allocation_count > 0 then 'manual_review'
      when candidate.lot_count > 0 then 'manual_review'
      when candidate.linked_line_count > 0 then 'manual_review'
      when candidate.sale_conflict_count > 0 then 'manual_review'
      when candidate.invalid_cost_count > 0 then 'manual_review'
      else 'auto_repair'
    end,
    case
      when candidate.type <> 'mystery_pack'
        then 'Normaler Einkauf ohne verlässliche Einkaufspositionen.'
      when candidate.purchase_price is null
        or candidate.purchase_price::text in ('NaN', 'Infinity', '-Infinity')
        or candidate.purchase_price < 0
        or pg_catalog.scale(candidate.purchase_price) > 2
        then 'Der Warenbetrag fehlt oder ist ungültig.'
      when candidate.line_count > 1000
        or candidate.unit_count > 100000
        or candidate.max_line_quantity > 100000
        then 'Der Einkauf überschreitet die sichere Positions- oder Mengengrenze.'
      when candidate.line_count > 0
        then 'Vorhandene Einkaufspositionen müssen manuell abgeglichen werden.'
      when candidate.item_count = 0
        then 'Für die Mystery Box sind noch keine Artikel erfasst.'
      when candidate.item_count > 1000
        then 'Der Einkauf überschreitet die sichere Grenze von 1.000 Positionen.'
      when candidate.invalid_timestamp_count > 0
        then 'Mindestens ein Empfangszeitpunkt ist ungültig.'
      when candidate.ambiguous_allocation_count > 0
        then 'Die historische Losentnahmereihenfolge ist nicht eindeutig.'
      when candidate.lot_count > 0
        then 'Historische Mengenlose benötigen eine manuelle Reihenfolgeprüfung.'
      when candidate.linked_line_count > 0
        then 'Vorhandene Artikelverknüpfungen sind unvollständig.'
      when candidate.sale_conflict_count > 0
        then 'Verkaufsstatus und Verkaufspositionen sind nicht eindeutig.'
      when candidate.invalid_cost_count > 0
        then 'Mindestens eine Zusatzkostenzeile ist ungültig.'
      else 'Bekannte Mystery-Artikel können gleichmäßig und centgenau verteilt werden.'
    end,
    candidate.item_count,
    candidate.line_count
  from candidates as candidate
  order by candidate.id;
end;
$function$;

COMMENT ON FUNCTION public.preview_purchase_costing_legacy(uuid) IS 'Prüft historische Einkaufskosten workspacebezogen und ohne Schreibzugriff.';

REVOKE ALL ON FUNCTION public.preview_purchase_costing_legacy(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.preview_purchase_costing_legacy(uuid) FROM anon, service_role;

GRANT ALL ON FUNCTION public.preview_purchase_costing_legacy(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_individual_purchase_line (
  p_workspace_id     uuid,
  p_purchase_id      uuid,
  p_purchase_line_id uuid,
  p_item             jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_purchase public.purchases;
  v_purchase_line public.purchase_lines;
  v_inventory_item public.inventory_items;
  v_title text;
  v_condition text;
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or p_purchase_line_id is null
    or jsonb_typeof(p_item) <> 'object'
    or jsonb_typeof(p_item -> 'title') <> 'string'
    or jsonb_typeof(p_item -> 'condition') <> 'string' then
    raise exception using errcode = '22023', message = 'Die Einzelartikel-Wareneingangsdaten sind ungültig.';
  end if;

  v_title := btrim(p_item ->> 'title');
  v_condition := p_item ->> 'condition';
  if v_title = '' or v_condition not in ('new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective') then
    raise exception using errcode = '22023', message = 'Die Einzelartikel-Wareneingangsdaten sind ungültig.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if v_purchase.entry_status = 'finalized' then
    raise exception using errcode = '22023', message = 'Finalisierte Einkäufe können keinen weiteren Wareneingang erhalten.';
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

  select * into v_purchase_line
  from public.purchase_lines
  where id = p_purchase_line_id
    and workspace_id = p_workspace_id
    and purchase_id = p_purchase_id
  for update;
  if not found or v_purchase_line.line_kind <> 'individual' or v_purchase_line.received_quantity <> 0 then
    raise exception using errcode = '22023', message = 'Die Einzelartikelposition ist nicht offen.';
  end if;

  insert into public.inventory_items (
    workspace_id, purchase_id, purchase_line_id, title, condition, status, allocated_purchase_cost
  ) values (
    p_workspace_id, p_purchase_id, p_purchase_line_id, v_title, v_condition, 'received', 0
  ) returning * into v_inventory_item;

  update public.purchase_lines
  set received_quantity = 1, updated_at = now()
  where id = p_purchase_line_id and workspace_id = p_workspace_id
  returning * into v_purchase_line;

  v_purchase := public.refresh_purchase_receiving_status(p_workspace_id, p_purchase_id);
  return jsonb_build_object(
    'purchase_line', to_jsonb(v_purchase_line),
    'inventory_item', to_jsonb(v_inventory_item),
    'purchase', to_jsonb(v_purchase)
  );
end;
$function$;

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
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
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

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  for v_input_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_input_line) <> 'object'
      or pg_catalog.jsonb_typeof(v_input_line -> 'purchase_line_id') <> 'string'
      or pg_catalog.jsonb_typeof(v_input_line -> 'received_quantity') <> 'number'
      or (v_input_line ->> 'received_quantity') !~ '^[1-9][0-9]*$'
      or pg_catalog.jsonb_typeof(v_input_line -> 'received_at') <> 'string' then
      raise exception using errcode = '22023', message = 'Eine Wareneingangsposition ist ungültig.';
    end if;

    begin
      v_received_at := (v_input_line ->> 'received_at')::timestamptz;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'Eine Wareneingangsposition ist ungültig.';
    end;

    if not pg_catalog.isfinite(v_received_at) then
      raise exception using
        errcode = '22023',
        message = 'Der Empfangszeitpunkt muss ein endlicher Zeitpunkt sein.';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if v_purchase.entry_status = 'finalized' then
    raise exception using errcode = '22023', message = 'Finalisierte Einkäufe können keinen weiteren Wareneingang erhalten.';
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
      0,
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
  v_source_purchase_id uuid;
  v_locked_purchase_ids uuid[] := array[]::uuid[];
  v_fresh_purchase_ids uuid[] := array[]::uuid[];
  v_restocked_quantity integer := 0;
  v_sale_total numeric;
  v_current_refund numeric;
  v_remaining_refundable numeric;
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
          set remaining_quantity = remaining_quantity + v_allocation.quantity
          where id = v_stock_lot.id
            and workspace_id = p_workspace_id;
          v_restocked_quantity := v_restocked_quantity + v_allocation.quantity;
        end if;

        update public.sale_line_lot_allocations
        set active_allocated_cost = case
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

      if v_source_purchase_status = 'capturing' then
        raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
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
    coalesce((p_sale ->> 'packaging_cost')::numeric, 0),
    coalesce((p_sale ->> 'other_costs')::numeric, 0),
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), ''),
    pg_catalog.clock_timestamp()
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
        select lot.*
        from public.stock_lots as lot
        join public.purchases as purchase
          on purchase.workspace_id = lot.workspace_id
          and purchase.id = lot.purchase_id
        where lot.workspace_id = p_workspace_id
          and lot.catalog_product_id = v_catalog_product.id
          and lot.remaining_quantity > 0
          and purchase.id = any(v_locked_purchase_ids)
          and purchase.entry_status <> 'capturing'
          and (
            purchase.entry_status = 'finalized'
            or not exists (
              select 1
              from public.business_events as event
              where event.workspace_id = p_workspace_id
                and event.entity_type = 'purchase'
                and event.entity_id = purchase.id
                and event.event_type = 'purchase_reopened'
            )
          )
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

CREATE FUNCTION public.reopen_purchase_costing (
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

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = item.purchase_line_id
    where item.workspace_id = p_workspace_id
      and (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.status = 'sold'
        or exists (
          select 1
          from public.sale_lines as sale_line
          where sale_line.workspace_id = p_workspace_id
            and sale_line.inventory_item_id = item.id
        )
      )
  ) or exists (
    select 1
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
  ) then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf mit Verkäufen kann nicht wieder geöffnet werden.';
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
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_before_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
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
  set allocated_purchase_cost = 0,
      status = case
        when status in ('ready', 'listed') then 'received'
        else status
      end,
      updated_at = v_changed_at
  where workspace_id = p_workspace_id
    and purchase_id = p_purchase_id;

  update public.stock_lots
  set unit_cost = 0
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
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_after_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
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

COMMENT ON FUNCTION public.reopen_purchase_costing(uuid,uuid) IS 'Öffnet einen unverkauften finalisierten Einkauf atomar und ohne Identitätsverlust wieder.';

REVOKE ALL ON FUNCTION public.reopen_purchase_costing(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.reopen_purchase_costing(uuid, uuid) TO authenticated;

ALTER TABLE public.purchase_lines
  ALTER COLUMN line_total DROP NOT NULL;

ALTER TABLE public.purchase_lines
  ALTER COLUMN unit_purchase_price DROP NOT NULL;

ALTER TABLE public.purchases
  ALTER COLUMN purchase_price DROP NOT NULL;

ALTER TABLE public.purchases
  ALTER COLUMN total_purchase_cost DROP NOT NULL;

CREATE TABLE public.business_events (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id   uuid                     NOT NULL,
  entity_type    text                     NOT NULL,
  entity_id      uuid                     NOT NULL,
  event_type     text                     NOT NULL,
  actor_id       uuid,
  reason         text,
  changes        jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  correlation_id uuid                     DEFAULT gen_random_uuid() NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.business_events IS 'Unveraenderliches fachliches Journal fuer wirtschaftlich und steuerlich relevante Aenderungen.';

COMMENT ON COLUMN public.business_events.changes IS 'Enthaelt die fachlichen Vorher- und Nachherwerte eines Ereignisses.';

COMMENT ON COLUMN public.business_events.correlation_id IS 'Verbindet automatisch zusammengehoerende Ereignisse desselben Geschaeftsvorgangs.';

ALTER TABLE public.business_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_events
  ADD CONSTRAINT business_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.business_events
  ADD CONSTRAINT business_events_entity_type_check CHECK (entity_type = ANY (ARRAY['purchase'::text, 'inventory_item'::text, 'sale'::text, 'return'::text, 'export'::text]));

ALTER TABLE public.business_events
  ADD CONSTRAINT business_events_pkey PRIMARY KEY (id);

ALTER TABLE public.business_events
  ADD CONSTRAINT business_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT;

CREATE INDEX business_events_workspace_created_id_idx ON public.business_events (workspace_id, created_at DESC, id DESC);

CREATE INDEX business_events_entity_created_id_idx ON public.business_events (workspace_id, entity_type, entity_id, created_at DESC, id DESC);

CREATE TRIGGER prevent_business_event_truncate
  BEFORE TRUNCATE ON public.business_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_business_event_mutation();

CREATE TRIGGER prevent_business_event_update_or_delete
  BEFORE DELETE OR UPDATE ON public.business_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_business_event_mutation();

CREATE TRIGGER protect_inventory_item_costing_fields
  BEFORE INSERT OR DELETE OR UPDATE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_inventory_item_costing_fields();

ALTER TABLE public.purchase_costs
  ADD COLUMN workspace_id uuid;

UPDATE public.purchase_costs AS cost
SET workspace_id = purchase.workspace_id
FROM public.purchases AS purchase
WHERE purchase.id = cost.purchase_id
  AND cost.workspace_id IS NULL;

ALTER TABLE public.purchase_costs
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.purchase_costs
  ADD CONSTRAINT purchase_costs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_costs
  ADD CONSTRAINT purchase_costs_workspace_purchase_fkey FOREIGN KEY (workspace_id, purchase_id) REFERENCES public.purchases(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE public.purchase_costs
  ADD COLUMN allocation_method text DEFAULT 'value_weighted'::text NOT NULL;

ALTER TABLE public.purchase_costs
  ADD CONSTRAINT purchase_costs_allocation_method_check CHECK (allocation_method = ANY (ARRAY['value_weighted'::text, 'quantity'::text, 'direct'::text]));

ALTER TABLE public.purchase_costs
  ADD COLUMN target_purchase_line_id uuid;

ALTER TABLE public.purchase_costs
  ADD CONSTRAINT purchase_costs_check CHECK (allocation_method = 'direct'::text AND target_purchase_line_id IS
    NOT NULL OR allocation_method <> 'direct'::text AND target_purchase_line_id IS NULL);

ALTER TABLE public.purchase_costs
  ADD CONSTRAINT purchase_costs_workspace_target_purchase_line_fkey FOREIGN KEY (workspace_id, target_purchase_line_id) REFERENCES public.purchase_lines(workspace_id, id)
    ON DELETE RESTRICT;

CREATE INDEX idx_purchase_costs_workspace_target_purchase_line ON public.purchase_costs (workspace_id, target_purchase_line_id);

CREATE TRIGGER protect_purchase_cost_mutation
  BEFORE INSERT OR DELETE OR UPDATE ON public.purchase_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_purchase_cost_mutation();

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_line_total_check CHECK (line_total IS NULL OR line_total <> 'NaN'::numeric AND line_total >= 0::numeric AND scale(line_total) <= 2);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_ordered_quantity_check CHECK (ordered_quantity > 0 AND ordered_quantity <= 100000 AND ordered_quantity::numeric <> 'NaN'::numeric) NOT VALID;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_unit_purchase_price_check
    CHECK (unit_purchase_price IS NULL OR unit_purchase_price <> 'NaN'::numeric AND unit_purchase_price >= 0::numeric AND scale(unit_purchase_price) <= 2);

ALTER TABLE public.purchase_lines
  ADD COLUMN price_mode text DEFAULT 'priced'::text NOT NULL;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_price_mode_check CHECK (price_mode = ANY (ARRAY['priced'::text, 'unpriced_mystery'::text]));

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_check2 CHECK (price_mode = 'priced'::text AND unit_purchase_price IS NOT NULL AND line_total IS
    NOT NULL AND line_total = round(ordered_quantity::numeric * unit_purchase_price, 2) OR price_mode = 'unpriced_mystery'::text AND unit_purchase_price IS NULL AND line_total IS
    NULL);

ALTER TABLE public.purchase_lines
  ADD COLUMN condition_snapshot text;

ALTER TABLE public.purchase_lines
  ADD COLUMN estimated_market_value numeric(12,2);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_estimated_market_value_check CHECK (estimated_market_value IS NULL OR estimated_market_value >= 0::numeric);

ALTER TABLE public.purchase_lines
  ADD COLUMN allocated_total_cost numeric(12,2) DEFAULT 0 NOT NULL;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_allocated_total_cost_check CHECK (allocated_total_cost >= 0::numeric);

REVOKE DELETE, INSERT, UPDATE ON public.purchase_lines FROM authenticated;

REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.purchase_lines FROM service_role;

CREATE TRIGGER protect_purchase_line_costing_fields
  BEFORE INSERT OR DELETE OR UPDATE ON public.purchase_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_purchase_line_costing_fields();

ALTER TABLE public.purchases
  ADD COLUMN entry_status text DEFAULT 'draft'::text NOT NULL;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_entry_status_check CHECK (entry_status = ANY (ARRAY['draft'::text, 'capturing'::text, 'finalized'::text]));

ALTER TABLE public.purchases
  ADD COLUMN finalized_at timestamp with time zone;

ALTER TABLE public.purchases
  ADD COLUMN finalized_by uuid;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_check CHECK (entry_status = 'finalized'::text AND finalized_at IS NOT NULL AND finalized_by IS
    NOT NULL OR entry_status <> 'finalized'::text AND finalized_at IS NULL AND finalized_by IS NULL);

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

CREATE TRIGGER protect_purchase_costing_fields
  BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_purchase_costing_fields();

ALTER TABLE public.sale_line_lot_allocations
  ADD COLUMN consumption_sequence bigint;

COMMENT ON COLUMN public.sale_line_lot_allocations.consumption_sequence IS 'Unveränderliche fachliche Entnahmereihenfolge innerhalb eines Lagerloses; nullable für kontrolliert zu prüfende Altdaten.';

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_consumption_sequence_check CHECK (consumption_sequence IS NULL OR consumption_sequence > 0);

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_lot_consumption_sequence_key UNIQUE (stock_lot_id, consumption_sequence);

ALTER TABLE public.sale_line_lot_allocations
  ADD COLUMN active_allocated_cost numeric(12,2);

COMMENT ON COLUMN public.sale_line_lot_allocations.active_allocated_cost IS 'Kosten der fachlich nicht wieder eingelagerten Menge; historische COGS bleiben separat in allocated_cost erhalten.';

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_active_allocated_cost_check
    CHECK (active_allocated_cost IS NULL OR active_allocated_cost >= 0::numeric AND active_allocated_cost <= allocated_cost);

CREATE TRIGGER protect_sale_line_lot_allocation_sequence
  BEFORE UPDATE ON public.sale_line_lot_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sale_line_lot_allocation_sequence();

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_received_at_finite_check CHECK (isfinite(received_at)) NOT VALID;

CREATE TRIGGER protect_stock_lot_costing_fields
  BEFORE INSERT OR UPDATE ON public.stock_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_stock_lot_costing_fields();

-- The declarative diff engine preserves broad legacy default privileges. These
-- final revokes make the generated migration match the explicit RPC boundary.
REVOKE ALL ON TABLE public.business_events
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.allocate_integer_cents(bigint, numeric[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.build_purchase_costing_plan(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_purchase_costing(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_purchase_costing(uuid, uuid)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_purchase_costing(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_purchase_costing(uuid, uuid)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.correct_purchase_costing(uuid, uuid, text, numeric, jsonb, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.correct_purchase_costing(uuid, uuid, text, numeric, jsonb, jsonb)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_purchase(uuid, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.add_purchase_lines(uuid, uuid, jsonb)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.receive_purchase_lines(uuid, uuid, jsonb)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.receive_individual_purchase_line(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, service_role;

REVOKE EXECUTE ON FUNCTION public.guard_purchase_costing_fields()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_purchase_line_costing_fields()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_purchase_cost_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_inventory_item_costing_fields()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_stock_lot_costing_fields()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_sale_line_lot_allocation_sequence()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_business_event_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.list_business_events(uuid, jsonb, timestamptz, uuid, integer)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.list_entity_business_events(uuid, text, uuid, timestamptz, uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_business_events(uuid, jsonb, timestamptz, uuid, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_entity_business_events(uuid, text, uuid, timestamptz, uuid, integer)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.preview_purchase_costing_legacy(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_purchase_costing_legacy(uuid)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.migrate_purchase_costing_legacy(uuid, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.migrate_purchase_costing_legacy(uuid, boolean)
  TO authenticated;
