-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

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
      ean_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost
    ) values (
      p_workspace_id,
      p_purchase_id,
      nullif(v_line ->> 'catalog_product_id', '')::uuid,
      btrim(v_line ->> 'title_snapshot'),
      nullif(btrim(v_line ->> 'ean_snapshot'), ''),
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

CREATE OR REPLACE FUNCTION public.allocate_integer_cents (
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

CREATE FUNCTION public.assign_record_number()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_type text := case tg_table_name when 'purchases' then 'purchase' else 'sale' end;
  v_series public.number_series;
  v_assignment public.number_assignments;
  v_time timestamptz := statement_timestamp();
  v_timezone text;
  v_year integer;
  v_period integer;
  v_sequence bigint;
  v_number text;
begin
  if tg_op = 'UPDATE' then
    if (new.workspace_id,new.id,new.record_number,new.numbering_series_id,new.numbered_at,new.numbering_version)
      is distinct from (old.workspace_id,old.id,old.record_number,old.numbering_series_id,old.numbered_at,old.numbering_version) then
      raise exception using errcode='22023',message='Vergebene Vorgangsnummern sind unveränderlich.';
    end if;
    return new;
  end if;
  -- Gleiche Sperrreihenfolge wie in der Administration; Zeitzone bleibt während der Vergabe stabil.
  select numbering_timezone into strict v_timezone from public.workspaces where id=new.workspace_id for share;
  insert into public.number_series(workspace_id,entity_type,label,prefix)
    values(new.workspace_id,v_type,case v_type when 'purchase' then 'Einkäufe' else 'Verkäufe' end,case v_type when 'purchase' then 'B' else 'V' end)
    on conflict(workspace_id,entity_type) do nothing;
  select * into strict v_series from public.number_series where workspace_id=new.workspace_id and entity_type=v_type for update;
  select * into v_assignment from public.number_assignments where workspace_id=new.workspace_id and entity_type=v_type and entity_id=new.id;
  if found then
    new.record_number := v_assignment.record_number;
    new.numbering_series_id := v_assignment.series_id;
    new.numbered_at := v_assignment.assigned_at;
    new.numbering_version := v_assignment.series_version;
    return new;
  end if;

  v_year := extract(year from v_time at time zone v_timezone)::integer;
  v_period := case when v_series.reset_yearly then v_year else 0 end;
  insert into public.number_series_counters(series_id,period,last_value) values(v_series.id,v_period,v_series.start_value)
    on conflict(series_id,period) do update set last_value=greatest(public.number_series_counters.last_value+1,v_series.start_value)
    returning last_value into v_sequence;
  v_number := public.format_record_number(v_series.prefix,v_series.separator,case when v_series.include_year then v_year end,v_series.minimum_digits,v_sequence);
  insert into public.number_assignments(workspace_id,entity_type,entity_id,series_id,series_version,record_number,assigned_at,format_snapshot)
    values(new.workspace_id,v_type,new.id,v_series.id,v_series.version,v_number,v_time,to_jsonb(v_series)||jsonb_build_object('timezone',v_timezone));
  new.record_number := v_number;
  new.numbering_series_id := v_series.id;
  new.numbered_at := v_time;
  new.numbering_version := v_series.version;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.assign_record_number() FROM PUBLIC;

GRANT ALL ON FUNCTION public.assign_record_number() TO service_role;

CREATE OR REPLACE FUNCTION public.book_bank_transaction (
  p_workspace_id   uuid,
  p_transaction_id uuid,
  p_booked_at      timestamp with time zone,
  p_store_order_id uuid                     DEFAULT NULL::uuid
)
  RETURNS public.bank_transactions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_transaction public.bank_transactions;
  v_order_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  select * into v_transaction
  from public.bank_transactions
  where id = p_transaction_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Die Banktransaktion wurde nicht gefunden.';
  end if;

  if p_store_order_id is not null then
    update public.store_orders
    set payment_status = 'paid', status = 'confirmed'
    where id = p_store_order_id
      and workspace_id = p_workspace_id
    returning id into v_order_id;

    if v_order_id is null then
      raise no_data_found using message = 'Die zugehörige Shop-Bestellung wurde nicht gefunden.';
    end if;
  end if;

  update public.bank_transactions
  set status = 'booked', booked_at = p_booked_at
  where id = p_transaction_id
    and workspace_id = p_workspace_id
  returning * into v_transaction;

  return v_transaction;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.bundle_shipping_orders (
  p_workspace_id        uuid,
  p_order_ids           uuid[],
  p_order_number        text,
  p_order_date          date,
  p_platform            text,
  p_item_title          text,
  p_item_sku            text,
  p_item_condition      text,
  p_sale_price          numeric,
  p_customer            jsonb,
  p_carrier             text,
  p_package_type        text,
  p_bundled_item_titles text[],
  p_notes               text
)
  RETURNS public.shipping_orders
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_snapshot jsonb;
  v_bundled_order public.shipping_orders;
  v_found_count integer;
  v_non_null_sale_count integer;
  v_distinct_sale_count integer;
  v_sale_id uuid;
  v_sale_ids uuid[];
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if coalesce(cardinality(p_order_ids), 0) < 2
    or cardinality(p_order_ids) <> (select count(distinct id) from unnest(p_order_ids) as id) then
    raise exception using errcode = '22023', message = 'Ein Sammelpaket braucht mindestens zwei unterschiedliche Sendungen.';
  end if;

  with source_orders as (
    select *
    from public.shipping_orders
    where workspace_id = p_workspace_id
      and id = any(p_order_ids)
    for update
  )
  select
    count(*),
    coalesce(jsonb_agg(to_jsonb(source_orders)), '[]'::jsonb),
    count(sale_id),
    count(distinct sale_id),
    array_agg(sale_id)
  into v_found_count, v_snapshot, v_non_null_sale_count, v_distinct_sale_count, v_sale_ids
  from source_orders;

  if v_found_count <> cardinality(p_order_ids) then
    raise no_data_found using message = 'Mindestens eine Sendung wurde nicht gefunden.';
  end if;

  if v_non_null_sale_count <> v_found_count or v_distinct_sale_count <> 1 then
    v_sale_id := null;
  else
    v_sale_id := v_sale_ids[1];
  end if;

  insert into public.shipping_orders (
    workspace_id,
    sale_id,
    order_number,
    order_date,
    platform,
    item_title,
    item_sku,
    item_condition,
    sale_price,
    customer,
    carrier,
    package_type,
    status,
    notes,
    is_bundled,
    bundled_order_ids,
    bundled_item_titles,
    bundled_orders_snapshot
  )
  values (
    p_workspace_id,
    v_sale_id,
    p_order_number,
    p_order_date,
    p_platform,
    p_item_title,
    p_item_sku,
    p_item_condition,
    p_sale_price,
    p_customer,
    p_carrier,
    p_package_type,
    'ready_to_pack',
    p_notes,
    true,
    p_order_ids::text[],
    p_bundled_item_titles,
    v_snapshot
  )
  returning * into v_bundled_order;

  delete from public.shipping_orders
  where workspace_id = p_workspace_id
    and id = any(p_order_ids);

  return v_bundled_order;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_inventory_item_sale_integrity()
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

CREATE OR REPLACE FUNCTION public.check_sale_inventory_integrity()
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

CREATE OR REPLACE FUNCTION public.check_sale_line_inventory_integrity()
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

CREATE OR REPLACE FUNCTION public.check_store_order_item_workspace_integrity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_workspace_mismatch boolean := false;
begin
  if tg_table_name = 'store_order_items' then
    select exists (
      select 1
      from public.store_orders as store_order
      where store_order.id = new.store_order_id
        and (
          new.inventory_item_id is not null
          and not exists (
            select 1
            from public.inventory_items as inventory_item
            where inventory_item.id = new.inventory_item_id
              and inventory_item.workspace_id = store_order.workspace_id
          )
          or new.catalog_product_id is not null
          and not exists (
            select 1
            from public.catalog_products as catalog_product
            where catalog_product.id = new.catalog_product_id
              and catalog_product.workspace_id = store_order.workspace_id
          )
        )
    ) into v_workspace_mismatch;
  elsif tg_table_name = 'store_orders'
    and new.workspace_id is distinct from old.workspace_id then
    select exists (
      select 1
      from public.store_order_items as store_item
      where store_item.store_order_id = new.id
        and (
          store_item.inventory_item_id is not null
          and not exists (
            select 1
            from public.inventory_items as inventory_item
            where inventory_item.id = store_item.inventory_item_id
              and inventory_item.workspace_id = new.workspace_id
          )
          or store_item.catalog_product_id is not null
          and not exists (
            select 1
            from public.catalog_products as catalog_product
            where catalog_product.id = store_item.catalog_product_id
              and catalog_product.workspace_id = new.workspace_id
          )
        )
    ) into v_workspace_mismatch;
  elsif tg_table_name = 'inventory_items'
    and new.workspace_id is distinct from old.workspace_id then
    select exists (
      select 1
      from public.store_order_items as store_item
      join public.store_orders as store_order on store_order.id = store_item.store_order_id
      where store_item.inventory_item_id = new.id
        and store_order.workspace_id <> new.workspace_id
    ) into v_workspace_mismatch;
  elsif tg_table_name = 'catalog_products'
    and new.workspace_id is distinct from old.workspace_id then
    select exists (
      select 1
      from public.store_order_items as store_item
      join public.store_orders as store_order on store_order.id = store_item.store_order_id
      where store_item.catalog_product_id = new.id
        and store_order.workspace_id <> new.workspace_id
    ) into v_workspace_mismatch;
  end if;

  if v_workspace_mismatch then
    raise foreign_key_violation using
      message = 'Workspace der Store-Bestellposition ist inkonsistent.',
      constraint = 'store_order_items_workspace_integrity';
  end if;

  return new;
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
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if (p_sale_id is null) = (p_store_order_id is null) then
    raise exception using errcode = '22023', message = 'Genau eine Rechnungsquelle ist erforderlich.';
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
      and (p_purchase ->> 'supplier_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
      or pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) > 2
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
      allocation_method, target_purchase_line_id
    ) values (
      p_workspace_id,
      v_purchase.id,
      coalesce(nullif(btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(btrim(v_expense ->> 'description'), ''),
      coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted'),
      v_target_line_id
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

CREATE OR REPLACE FUNCTION public.create_workspace (
  p_name text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  new_ws_id uuid;
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Nicht angemeldet';
  end if;

  insert into public.workspaces (name)
  values (coalesce(nullif(trim(p_name), ''), 'Mein Workspace'))
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, caller_id, 'owner');

  return new_ws_id;
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

CREATE FUNCTION public.format_record_number (
  p_prefix         text,
  p_separator      text,
  p_year           integer,
  p_minimum_digits integer,
  p_sequence       bigint
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select pg_catalog.concat_ws(p_separator,nullif(p_prefix,''),p_year::text,
    pg_catalog.lpad(p_sequence::text,greatest(p_minimum_digits,length(p_sequence::text)),'0'));
$function$;

REVOKE ALL ON FUNCTION public.format_record_number(text, text, integer, integer, bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION public.format_record_number(text, text, integer, integer, bigint) TO service_role;

CREATE FUNCTION public.get_number_settings (
  p_workspace_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if (select auth.uid()) is null or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Workspace.';
  end if;
  return jsonb_build_object('can_edit',(select public.is_workspace_admin(p_workspace_id)),
    'timezone',(select numbering_timezone from public.workspaces where id=p_workspace_id),
    'series',coalesce((select jsonb_agg(to_jsonb(s) order by s.entity_type) from public.number_series s where s.workspace_id=p_workspace_id),'[]'::jsonb));
end;
$function$;

REVOKE ALL ON FUNCTION public.get_number_settings(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_number_settings(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.get_number_settings(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_purchase_sale_history_state (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if (select auth.uid()) is null
    or p_workspace_id is null
    or p_purchase_id is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if not exists (
    select 1
    from public.purchases as purchase
    where purchase.workspace_id = p_workspace_id
      and purchase.id = p_purchase_id
  ) then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where item.workspace_id = p_workspace_id
      and (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and item.status = 'sold'
      and not exists (
        select 1
        from public.sale_lines as sale_line
        where sale_line.workspace_id = p_workspace_id
          and sale_line.inventory_item_id = item.id
      )
  ) then
    return 'review_required';
  end if;

  if exists (
    select 1
    from public.sale_lines as sale_line
    join public.inventory_items as item
      on item.workspace_id = sale_line.workspace_id
      and item.id = sale_line.inventory_item_id
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where sale_line.workspace_id = p_workspace_id
      and (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
  ) or exists (
    select 1
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = lot.workspace_id
      and linked_line.id = lot.purchase_line_id
    where allocation.workspace_id = p_workspace_id
      and (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
  ) then
    return 'recorded';
  end if;

  return 'none';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_purchase_sale_history (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_state text;
  v_review_inventory_item_id uuid;
begin
  v_state := public.get_purchase_sale_history_state(p_workspace_id, p_purchase_id);

  if v_state = 'review_required' then
    select item.id
    into v_review_inventory_item_id
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where item.workspace_id = p_workspace_id
      and (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and item.status = 'sold'
      and not exists (
        select 1
        from public.sale_lines as sale_line
        where sale_line.workspace_id = p_workspace_id
          and sale_line.inventory_item_id = item.id
      )
    order by item.created_at, item.id
    limit 1;

    if v_review_inventory_item_id is null then
      raise exception using
        errcode = 'P0001',
        message = 'Der prüfpflichtige Inventarartikel konnte nicht bestimmt werden.';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', v_state,
    'review_inventory_item_id', v_review_inventory_item_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_inventory_item_costing_fields()
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

CREATE OR REPLACE FUNCTION public.guard_purchase_cost_mutation()
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

CREATE OR REPLACE FUNCTION public.guard_purchase_costing_fields()
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

CREATE OR REPLACE FUNCTION public.guard_purchase_line_costing_fields()
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

CREATE OR REPLACE FUNCTION public.guard_sale_line_lot_allocation_sequence()
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

CREATE OR REPLACE FUNCTION public.guard_stock_lot_costing_fields()
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  new_ws_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', 'Reseller'));

  insert into public.workspaces (name, min_roi_percent, min_profit_amount)
  values ('Mein Workspace', 30.0, 15.0)
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, new.id, 'owner');

  insert into public.sources (workspace_id, name, is_default)
  values
    (new_ws_id, 'Kleinanzeigen', true),
    (new_ws_id, 'eBay', false),
    (new_ws_id, 'Vinted', false),
    (new_ws_id, 'Flohmarkt', false),
    (new_ws_id, 'meinePacks', false),
    (new_ws_id, 'B-Stock / Retouren', false),
    (new_ws_id, 'Grosshaendler / Palette', false);

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.has_purchase_recorded_sales (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  return public.get_purchase_sale_history_state(p_workspace_id, p_purchase_id) = 'recorded';
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_valid_gtin (
  p_value text
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  v_length integer;
  v_sum integer := 0;
  v_position integer;
  v_digit integer;
  v_check integer;
begin
  if p_value is null or p_value !~ '^[0-9]+$' then
    return false;
  end if;

  v_length := pg_catalog.length(p_value);
  if v_length not in (8, 12, 13, 14) then
    return false;
  end if;

  v_check := pg_catalog.substr(p_value, v_length, 1)::integer;
  for v_position in 1..(v_length - 1) loop
    v_digit := pg_catalog.substr(p_value, v_length - v_position, 1)::integer;
    v_sum := v_sum + v_digit * case when v_position % 2 = 1 then 3 else 1 end;
  end loop;
  return (10 - (v_sum % 10)) % 10 = v_check;
end;
$function$;

COMMENT ON FUNCTION public.is_valid_gtin(text) IS 'Validiert die Prüfziffer von GTIN-8, GTIN-12, GTIN-13 und GTIN-14.';

CREATE OR REPLACE FUNCTION public.is_workspace_admin (
  ws_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_workspace_member (
  ws_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = (select auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.list_business_events (
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

CREATE OR REPLACE FUNCTION public.list_entity_business_events (
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

CREATE OR REPLACE FUNCTION public.migrate_purchase_costing_legacy (
  p_workspace_id         uuid,
  p_confirm              boolean,
  p_purchase_id          uuid    DEFAULT NULL::uuid,
  p_expected_fingerprint text    DEFAULT NULL::text
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
  v_line_created_at timestamptz;
  v_line_position integer;
  v_lines jsonb;
  v_costs jsonb;
  v_original_item_statuses jsonb;
  v_costing_result jsonb;
  v_costing_event_id uuid;
  v_costing_event_type text;
  v_correlation_id uuid;
  v_has_sales boolean;
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

  if p_purchase_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_purchase_id::text, 0));
    perform 1 from public.purchases
    where workspace_id = p_workspace_id and id = p_purchase_id for update;
    perform 1 from public.inventory_items
    where workspace_id = p_workspace_id and purchase_id = p_purchase_id order by id for update;
    perform 1 from public.purchase_costs
    where workspace_id = p_workspace_id and purchase_id = p_purchase_id order by id for update;
    perform 1 from public.sale_lines l
    join public.inventory_items i on i.id = l.inventory_item_id and i.workspace_id = l.workspace_id
    where i.workspace_id = p_workspace_id and i.purchase_id = p_purchase_id
    order by l.id for update of l;
    perform 1 from public.sales s
    where s.workspace_id = p_workspace_id and exists (
      select 1 from public.sale_lines l
      join public.inventory_items i on i.id = l.inventory_item_id and i.workspace_id = l.workspace_id
      where l.sale_id = s.id and i.workspace_id = p_workspace_id and i.purchase_id = p_purchase_id
    ) order by s.id for update;
    if p_expected_fingerprint is null or
      (public.preview_purchase_cost_repair(p_workspace_id, p_purchase_id) ->> 'fingerprint')
      is distinct from p_expected_fingerprint then
      raise exception using errcode = '40001', message = 'Der Einkauf wurde inzwischen geändert. Bitte erneut prüfen.';
    end if;
  end if;

  select
    pg_catalog.count(*) filter (where preview.classification = 'items_missing'),
    pg_catalog.count(*) filter (where preview.classification = 'manual_review')
  into v_items_missing, v_manual_review
  from public.preview_purchase_costing_legacy(p_workspace_id) as preview
  where p_purchase_id is null or preview.purchase_id = p_purchase_id;

  for v_candidate in
    select preview.*
    from public.preview_purchase_costing_legacy(p_workspace_id) as preview
    where preview.classification = 'auto_repair'
      and (p_purchase_id is null or preview.purchase_id = p_purchase_id)
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

    v_line_created_at := pg_catalog.clock_timestamp();
    v_line_position := 0;

    for v_item in
      select item.*
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = v_candidate.purchase_id
      order by item.created_at, item.id
      for update
    loop
      v_line_position := v_line_position + 1;
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
        allocated_total_cost,
        ean_snapshot
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
        v_line_created_at + (v_line_position * interval '1 microsecond'),
        v_line_created_at + (v_line_position * interval '1 microsecond'),
        'unpriced_mystery',
        v_item.condition,
        v_item.expected_value,
        0,
        v_item.ean
      );

      update public.inventory_items
      set purchase_line_id = v_line_id
      where workspace_id = p_workspace_id
        and id = v_item.id;
    end loop;

    select exists (
      select 1
      from public.sale_lines as sale_line
      join public.inventory_items as item
        on item.workspace_id = sale_line.workspace_id
        and item.id = sale_line.inventory_item_id
      where sale_line.workspace_id = p_workspace_id
        and item.purchase_id = v_candidate.purchase_id
    )
    into v_has_sales;

    if v_has_sales then
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

      select public.correct_purchase_costing(
        p_workspace_id,
        v_candidate.purchase_id,
        'Kontrollierte Übernahme historischer Mystery-Einkaufskosten.',
        v_purchase.purchase_price,
        v_lines,
        v_costs
      ) into v_costing_result;

      v_costing_event_type := 'purchase_corrected';
    else
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', item.id,
          'status', item.status
        ) order by item.created_at, item.id
      )
      into v_original_item_statuses
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = v_candidate.purchase_id;

      select public.finalize_purchase_costing(
        p_workspace_id,
        v_candidate.purchase_id
      ) into v_costing_result;

      update public.inventory_items as item
      set status = original_item.status
      from pg_catalog.jsonb_to_recordset(v_original_item_statuses)
        as original_item(id uuid, status text)
      where item.workspace_id = p_workspace_id
        and item.purchase_id = v_candidate.purchase_id
        and item.id = original_item.id;

      v_costing_event_type := 'purchase_finalized';
    end if;

    v_costing_event_id := (v_costing_result ->> 'eventId')::uuid;

    select event.correlation_id
    into strict v_correlation_id
    from public.business_events as event
    where event.workspace_id = p_workspace_id
      and event.id = v_costing_event_id;

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
      'purchase',
      v_candidate.purchase_id,
      'purchase_costing_legacy_migrated',
      v_actor_id,
      'Kontrollierte Übernahme historischer Mystery-Einkaufskosten.',
      pg_catalog.jsonb_build_object(
        'migration', pg_catalog.jsonb_build_object(
          'before', null,
          'after', pg_catalog.jsonb_build_object(
            'classification', 'auto_repair',
            'costing_event_id', v_costing_event_id,
            'costing_event_type', v_costing_event_type,
            'item_count', v_candidate.item_count,
            'operational_statuses_preserved', true
          )
        )
      ),
      v_correlation_id
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
      or case
        when item.value ? 'payment_fee'
          and jsonb_typeof(item.value -> 'payment_fee') <> 'null' then
          case jsonb_typeof(item.value -> 'payment_fee')
            when 'number' then
              (item.value ->> 'payment_fee')::numeric < 0
              or (item.value ->> 'payment_fee')::numeric <> trunc((item.value ->> 'payment_fee')::numeric, 2)
            else true
          end
        else false
      end
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
      'shipping_revenue', p_shipping_cost,
      'shipping_cost', 0,
      'shipping_mode', case
        when p_customer ->> 'shippingMethod' = 'pickup' then 'pickup'
        else 'seller_arranged'
      end,
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

CREATE OR REPLACE FUNCTION public.prevent_business_event_mutation()
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

CREATE OR REPLACE FUNCTION public.prevent_inventory_reconciliation_event_mutation()
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

CREATE OR REPLACE FUNCTION public.prevent_workspace_with_business_data_deletion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if exists (select 1 from public.purchases where workspace_id = old.id)
    or exists (select 1 from public.inventory_items where workspace_id = old.id)
    or exists (select 1 from public.stock_lots where workspace_id = old.id)
    or exists (select 1 from public.stock_movements where workspace_id = old.id)
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

CREATE OR REPLACE FUNCTION public.preview_purchase_costing_legacy (
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
      coalesce(item_totals.sale_line_count, 0) as sale_line_count,
      coalesce(item_totals.unsupported_finalize_status_count, 0) as unsupported_finalize_status_count,
      coalesce(cost_totals.invalid_cost_count, 0) as invalid_cost_count
    from public.purchases as purchase
    left join lateral (
      select
        pg_catalog.count(*) as item_count,
        pg_catalog.count(*) filter (where item.purchase_line_id is not null) as linked_line_count,
        pg_catalog.count(*) filter (
          where item.status not in ('received', 'needs_review', 'researched', 'ready')
        ) as unsupported_finalize_status_count,
        (
          select pg_catalog.count(*)
          from public.sale_lines as sale_line
          join public.inventory_items as sold_item
            on sold_item.workspace_id = sale_line.workspace_id
            and sold_item.id = sale_line.inventory_item_id
          where sold_item.workspace_id = purchase.workspace_id
            and sold_item.purchase_id = purchase.id
        ) as sale_line_count,
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
      when candidate.sale_line_count = 0
        and candidate.unsupported_finalize_status_count > 0 then 'manual_review'
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
      when candidate.sale_line_count = 0
        and candidate.unsupported_finalize_status_count > 0
        then 'Der aktuelle Artikelstatus erlaubt keine automatische Kostenfinalisierung.'
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

CREATE OR REPLACE FUNCTION public.protect_inventory_item_sold_status()
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
    or jsonb_typeof(p_item -> 'title') <> 'string' then
    raise exception using errcode = '22023', message = 'Die Einzelartikel-Wareneingangsdaten sind ungültig.';
  end if;

  v_title := btrim(p_item ->> 'title');
  if v_title = '' then
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
  if not found
    or v_purchase_line.line_kind <> 'individual'
    or v_purchase_line.received_quantity >= v_purchase_line.ordered_quantity then
    raise exception using errcode = '22023', message = 'Die Einzelartikelposition ist nicht offen.';
  end if;

  v_condition := case
    when v_purchase_line.condition_snapshot in (
      'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
    ) then v_purchase_line.condition_snapshot
    else 'used'
  end;

  insert into public.inventory_items (
    workspace_id, purchase_id, purchase_line_id, title, ean, condition, status,
    allocated_purchase_cost, expected_value
  ) values (
    p_workspace_id, p_purchase_id, p_purchase_line_id, v_title, v_purchase_line.ean_snapshot, v_condition, 'received',
    0, v_purchase_line.estimated_market_value
  ) returning * into v_inventory_item;

  update public.purchase_lines
  set received_quantity = received_quantity + 1, updated_at = now()
  where id = p_purchase_line_id
    and workspace_id = p_workspace_id
    and purchase_id = p_purchase_id
    and received_quantity < ordered_quantity
  returning * into v_purchase_line;

  if not found then
    raise exception using errcode = '22023', message = 'Die Einzelartikelposition ist nicht offen.';
  end if;

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

CREATE OR REPLACE FUNCTION public.refresh_purchase_receiving_status (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  RETURNS public.purchases
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_purchase public.purchases;
begin
  update public.purchases
  set receiving_status = case
        when receiving_status = 'draft' then 'draft'
        when exists (
          select 1 from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity < ordered_quantity
        ) and exists (
          select 1 from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity > 0
        ) then 'partially_received'
        when exists (
          select 1 from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity < ordered_quantity
        ) then 'ordered'
        else 'received'
      end,
      updated_at = now()
  where id = p_purchase_id
    and workspace_id = p_workspace_id
  returning * into v_purchase;

  return v_purchase;
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

CREATE OR REPLACE FUNCTION public.replace_bank_transactions (
  p_workspace_id uuid,
  p_transactions jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_expected_count integer;
  v_saved_count integer;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if jsonb_typeof(p_transactions) <> 'array' then
    raise exception using errcode = '22023', message = 'Banktransaktionen müssen als Liste übergeben werden.';
  end if;

  select count(*), count(distinct transaction.id)
  into v_expected_count, v_saved_count
  from jsonb_to_recordset(p_transactions) as transaction(
    id uuid,
    booking_date date,
    value_date date,
    counterparty_name text,
    counterparty_iban text,
    purpose text,
    amount numeric,
    currency text,
    source_format text,
    status text,
    match_json jsonb,
    booked_at timestamptz
  );

  if v_expected_count <> v_saved_count then
    raise exception using errcode = '22023', message = 'Banktransaktions-IDs müssen eindeutig sein.';
  end if;

  perform 1
  from public.bank_transactions
  where workspace_id = p_workspace_id
  for update;

  insert into public.bank_transactions (
    id,
    workspace_id,
    booking_date,
    value_date,
    counterparty_name,
    counterparty_iban,
    purpose,
    amount,
    currency,
    source_format,
    status,
    match_json,
    booked_at
  )
  select
    transaction.id,
    p_workspace_id,
    transaction.booking_date,
    transaction.value_date,
    transaction.counterparty_name,
    transaction.counterparty_iban,
    transaction.purpose,
    transaction.amount,
    coalesce(transaction.currency, 'EUR'),
    transaction.source_format,
    coalesce(transaction.status, 'pending'),
    transaction.match_json,
    transaction.booked_at
  from jsonb_to_recordset(p_transactions) as transaction(
    id uuid,
    booking_date date,
    value_date date,
    counterparty_name text,
    counterparty_iban text,
    purpose text,
    amount numeric,
    currency text,
    source_format text,
    status text,
    match_json jsonb,
    booked_at timestamptz
  )
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    booking_date = excluded.booking_date,
    value_date = excluded.value_date,
    counterparty_name = excluded.counterparty_name,
    counterparty_iban = excluded.counterparty_iban,
    purpose = excluded.purpose,
    amount = excluded.amount,
    currency = excluded.currency,
    source_format = excluded.source_format,
    status = excluded.status,
    match_json = excluded.match_json,
    booked_at = excluded.booked_at;

  delete from public.bank_transactions as existing
  where existing.workspace_id = p_workspace_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_transactions) as incoming(id uuid)
      where incoming.id = existing.id
    );

  select count(*) into v_saved_count
  from public.bank_transactions
  where workspace_id = p_workspace_id;

  if v_saved_count <> v_expected_count then
    raise exception using errcode = 'P0001', message = 'Die Banktransaktionen wurden nicht vollständig gespeichert.';
  end if;

  return v_saved_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_sold_item (
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

CREATE OR REPLACE FUNCTION public.set_purchase_line_eans (
  p_workspace_id uuid,
  p_lines        jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_line jsonb;
  v_line_id uuid;
  v_ean text;
begin
  if v_actor is null or p_workspace_id is null or jsonb_typeof(p_lines) <> 'array'
    or not exists (
      select 1 from public.workspace_members as member
      where member.workspace_id = p_workspace_id and member.user_id = v_actor
    ) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    if pg_catalog.jsonb_typeof(v_line -> 'id') <> 'string'
      or (v_line ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_line -> 'ean') not in ('null', 'string') then
      raise exception using errcode = '22023', message = 'Die EAN-Zuordnung ist ungültig.';
    end if;
    v_line_id := (v_line ->> 'id')::uuid;
    v_ean := nullif(pg_catalog.btrim(v_line ->> 'ean'), '');
    if v_ean is not null and not public.is_valid_gtin(v_ean) then
      raise exception using errcode = '22023', message = 'Die EAN/GTIN ist ungültig.';
    end if;
    update public.purchase_lines as line
    set ean_snapshot = v_ean,
        updated_at = pg_catalog.clock_timestamp()
    from public.purchases as purchase
    where line.id = v_line_id
      and line.workspace_id = p_workspace_id
      and purchase.id = line.purchase_id
      and purchase.workspace_id = p_workspace_id
      and purchase.entry_status <> 'finalized';
    if not found then
      raise exception using errcode = '22023', message = 'Die Einkaufsposition ist nicht änderbar.';
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_inventory_item_ean()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.ean is null and new.purchase_line_id is not null then
    select line.ean_snapshot into new.ean
    from public.purchase_lines as line
    where line.id = new.purchase_line_id
      and line.workspace_id = new.workspace_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_purchase_receiving_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  perform public.refresh_purchase_receiving_status(
    coalesce(new.workspace_id, old.workspace_id),
    coalesce(new.purchase_id, old.purchase_id)
  );
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.unbundle_shipping_order (
  p_workspace_id     uuid,
  p_bundled_order_id uuid
)
  RETURNS SETOF public.shipping_orders
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_snapshot jsonb;
  v_expected_ids text[];
  v_snapshot_ids text[];
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  select bundled_orders_snapshot, bundled_order_ids
  into v_snapshot, v_expected_ids
  from public.shipping_orders
  where id = p_bundled_order_id
    and workspace_id = p_workspace_id
    and is_bundled = true
  for update;

  if not found then
    raise no_data_found using message = 'Das Sammelpaket wurde nicht gefunden.';
  end if;

  if jsonb_typeof(v_snapshot) <> 'array' or jsonb_array_length(v_snapshot) = 0 then
    raise exception using errcode = '22023', message = 'Das Sammelpaket enthält keinen wiederherstellbaren Snapshot.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_snapshot) as snapshot(order_row)
    where jsonb_typeof(snapshot.order_row) <> 'object'
      or jsonb_typeof(snapshot.order_row -> 'id') <> 'string'
      or jsonb_typeof(snapshot.order_row -> 'workspace_id') <> 'string'
      or snapshot.order_row ->> 'workspace_id' <> p_workspace_id::text
      or not (snapshot.order_row ->> 'id' = any(v_expected_ids))
  ) then
    raise exception using errcode = '22023', message = 'Der Snapshot des Sammelpakets ist ungültig.';
  end if;

  select array_agg(snapshot.order_row ->> 'id' order by snapshot.order_row ->> 'id')
  into v_snapshot_ids
  from jsonb_array_elements(v_snapshot) as snapshot(order_row);

  if v_snapshot_ids is distinct from (
    select array_agg(expected_id order by expected_id)
    from unnest(v_expected_ids) as expected_id
  ) then
    raise exception using errcode = '22023', message = 'Der Snapshot passt nicht zu den gebündelten Sendungen.';
  end if;

  delete from public.shipping_orders
  where id = p_bundled_order_id
    and workspace_id = p_workspace_id;

  return query
  insert into public.shipping_orders
  select (jsonb_populate_record(null::public.shipping_orders, snapshot.order_row)).*
  from jsonb_array_elements(v_snapshot) as snapshot(order_row)
  returning *;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_purchase_draft (
  p_workspace_id uuid,
  p_purchase_id  uuid,
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
      or pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) > 2
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
            and product.tracking_mode = 'quantity'
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
      allocation_method, target_purchase_line_id
    ) values (
      p_workspace_id,
      p_purchase_id,
      coalesce(nullif(pg_catalog.btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(pg_catalog.btrim(v_expense ->> 'description'), ''),
      coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted'),
      v_target_line_id
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

CREATE OR REPLACE FUNCTION public.validate_inventory_item_sale_integrity (
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

CREATE TABLE public.number_assignments (
  id              bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  workspace_id    uuid                     NOT NULL,
  entity_type     text                     NOT NULL,
  entity_id       uuid                     NOT NULL,
  series_id       bigint                   NOT NULL,
  series_version  integer                  NOT NULL,
  record_number   text                     NOT NULL,
  assigned_at     timestamp with time zone NOT NULL,
  format_snapshot jsonb                    NOT NULL
);

COMMENT ON TABLE public.number_assignments IS 'Unveränderliche Vergabehistorie; bleibt bei Archivierung, Stornierung und Vorgangslöschung erhalten.';

ALTER TABLE public.number_assignments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.number_assignments
  ADD CONSTRAINT number_assignments_entity_type_check CHECK (entity_type = ANY (ARRAY['purchase'::text, 'sale'::text]));

ALTER TABLE public.number_assignments
  ADD CONSTRAINT number_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.number_assignments
  ADD CONSTRAINT number_assignments_workspace_id_entity_type_entity_id_key UNIQUE (workspace_id, entity_type, entity_id);

ALTER TABLE public.number_assignments
  ADD CONSTRAINT number_assignments_workspace_id_entity_type_record_number_key UNIQUE (workspace_id, entity_type, record_number);

ALTER TABLE public.number_assignments
  ADD CONSTRAINT number_assignments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT SELECT ON public.number_assignments TO authenticated;

GRANT ALL ON public.number_assignments TO service_role;

CREATE INDEX number_assignments_series_idx ON public.number_assignments (series_id);

CREATE POLICY "Mitglieder lesen Nummernvergaben" ON public.number_assignments
  FOR SELECT
  TO authenticated
  USING (( SELECT public.is_workspace_member(number_assignments.workspace_id) AS is_workspace_member));

CREATE TABLE public.number_series (
  id             bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  workspace_id   uuid                     NOT NULL,
  entity_type    text                     NOT NULL,
  label          text                     NOT NULL,
  prefix         text                     NOT NULL,
  separator      text                     DEFAULT ' '::text NOT NULL,
  include_year   boolean                  DEFAULT true NOT NULL,
  minimum_digits integer                  DEFAULT 2 NOT NULL,
  start_value    bigint                   DEFAULT 1 NOT NULL,
  reset_yearly   boolean                  DEFAULT false NOT NULL,
  version        integer                  DEFAULT 1 NOT NULL,
  updated_at     timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
  updated_by     uuid
);

CREATE FUNCTION public.save_number_series (
  p_workspace_id     uuid,
  p_entity_type      text,
  p_configuration    jsonb,
  p_expected_version integer DEFAULT 0
)
  RETURNS public.number_series
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_series public.number_series;
  v_timezone text := p_configuration->>'timezone';
  v_year integer;
  v_period integer;
  v_next bigint;
  v_leading text;
  v_number text;
begin
  if (select auth.uid()) is null or not (select public.is_workspace_admin(p_workspace_id)) then
    raise exception using errcode='42501',message='Nur Workspace-Administratoren dürfen Nummernkreise ändern.';
  end if;
  perform 1 from public.workspaces where id=p_workspace_id and archived_at is null for update;
  if not found then raise exception using errcode='42501',message='Der Workspace ist archiviert.'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    raise exception using errcode='22023',message='Die Zeitzone ist ungültig.';
  end if;
  insert into public.number_series(workspace_id,entity_type,label,prefix) values(p_workspace_id,p_entity_type,case p_entity_type when 'purchase' then 'Einkäufe' else 'Verkäufe' end,case p_entity_type when 'purchase' then 'B' else 'V' end) on conflict(workspace_id,entity_type) do nothing;
  select * into strict v_series from public.number_series where workspace_id=p_workspace_id and entity_type=p_entity_type for update;
  if p_expected_version <> v_series.version and not(p_expected_version=0 and v_series.version=1) then
    raise exception using errcode='40001',message='Der Nummernkreis wurde inzwischen geändert. Bitte neu laden.';
  end if;
  update public.number_series set label=p_configuration->>'label',prefix=p_configuration->>'prefix',separator=p_configuration->>'separator',include_year=(p_configuration->>'include_year')::boolean,minimum_digits=(p_configuration->>'minimum_digits')::integer,start_value=(p_configuration->>'start_value')::bigint,reset_yearly=(p_configuration->>'reset_yearly')::boolean,version=version+1,updated_at=statement_timestamp(),updated_by=(select auth.uid()) where id=v_series.id returning * into v_series;
  v_year := extract(year from statement_timestamp() at time zone v_timezone)::integer;
  v_period := case when v_series.reset_yearly then v_year else 0 end;
  select greatest(coalesce(last_value+1,v_series.start_value),v_series.start_value) into v_next from public.number_series_counters where series_id=v_series.id and period=v_period;
  v_next := coalesce(v_next,v_series.start_value);
  v_number := public.format_record_number(v_series.prefix,v_series.separator,case when v_series.include_year then v_year end,v_series.minimum_digits,v_next);
  v_leading := pg_catalog.concat_ws(v_series.separator,nullif(v_series.prefix,''),case when v_series.include_year then v_year::text end);
  if v_leading <> '' then v_leading := v_leading || v_series.separator; end if;
  -- Auch spätere Kollisionen prüfen, nicht nur die unmittelbar nächste Nummer.
  if exists(
    select 1 from public.number_assignments a
    cross join lateral (select substring(a.record_number from length(v_leading)+1) as suffix) parts
    where a.workspace_id=p_workspace_id and a.entity_type=p_entity_type
      and left(a.record_number,length(v_leading))=v_leading
      and case when parts.suffix ~ '^[0-9]{1,18}$' then
        parts.suffix::bigint >= v_next and a.record_number=public.format_record_number(v_series.prefix,v_series.separator,case when v_series.include_year then v_year end,v_series.minimum_digits,parts.suffix::bigint)
      else false end
  ) then
    raise exception using errcode='22023',message='Dieses Format würde eine bereits vergebene Nummer erneut erzeugen.';
  end if;
  update public.workspaces set numbering_timezone=v_timezone where id=p_workspace_id;
  insert into public.number_series_changes(workspace_id,series_id,changed_by,configuration) values(p_workspace_id,v_series.id,(select auth.uid()),to_jsonb(v_series)||jsonb_build_object('timezone',v_timezone));
  return v_series;
end;
$function$;

REVOKE ALL ON FUNCTION public.save_number_series(uuid, text, jsonb, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.save_number_series(uuid, text, jsonb, integer) TO authenticated;

GRANT ALL ON FUNCTION public.save_number_series(uuid, text, jsonb, integer) TO service_role;

COMMENT ON TABLE public.number_series IS 'Aktuelle Nummernformate je Workspace und Vorgangsart; Änderungen gelten nur künftig.';

ALTER TABLE public.number_series
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_check CHECK (NOT reset_yearly OR include_year);

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_entity_type_check CHECK (entity_type = ANY (ARRAY['purchase'::text, 'sale'::text]));

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_label_check CHECK (length(btrim(label)) >= 1 AND length(btrim(label)) <= 80);

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_minimum_digits_check CHECK (minimum_digits >= 1 AND minimum_digits <= 12);

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_pkey PRIMARY KEY (id);

ALTER TABLE public.number_assignments
  ADD CONSTRAINT number_assignments_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.number_series(id) ON DELETE CASCADE;

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_prefix_check CHECK (length(prefix) <= 30 AND prefix !~ '[[:cntrl:]]'::text);

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_separator_check CHECK (separator = ANY (ARRAY[''::text, ' '::text, '-'::text, '/'::text, '.'::text]));

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_start_value_check CHECK (start_value >= 1 AND start_value <= '999999999999'::bigint);

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_workspace_id_entity_type_key UNIQUE (workspace_id, entity_type);

ALTER TABLE public.number_series
  ADD CONSTRAINT number_series_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT SELECT ON public.number_series TO authenticated;

GRANT ALL ON public.number_series TO service_role;

CREATE INDEX number_series_updated_by_idx ON public.number_series (updated_by);

CREATE POLICY "Mitglieder lesen Nummernkreise" ON public.number_series
  FOR SELECT
  TO authenticated
  USING (( SELECT public.is_workspace_member(number_series.workspace_id) AS is_workspace_member));

CREATE TABLE public.number_series_changes (
  id            bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  workspace_id  uuid                     NOT NULL,
  series_id     bigint                   NOT NULL,
  changed_at    timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
  changed_by    uuid,
  configuration jsonb                    NOT NULL
);

COMMENT ON TABLE public.number_series_changes IS 'Protokoll jeder Formatänderung mit Person, Zeit und vollständiger Konfiguration.';

ALTER TABLE public.number_series_changes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.number_series_changes
  ADD CONSTRAINT number_series_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.number_series_changes
  ADD CONSTRAINT number_series_changes_pkey PRIMARY KEY (id);

ALTER TABLE public.number_series_changes
  ADD CONSTRAINT number_series_changes_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.number_series(id) ON DELETE CASCADE;

ALTER TABLE public.number_series_changes
  ADD CONSTRAINT number_series_changes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT SELECT ON public.number_series_changes TO authenticated;

GRANT ALL ON public.number_series_changes TO service_role;

CREATE INDEX number_series_changes_workspace_idx ON public.number_series_changes (workspace_id);

CREATE INDEX number_series_changes_series_idx ON public.number_series_changes (series_id);

CREATE INDEX number_series_changes_actor_idx ON public.number_series_changes (changed_by);

CREATE POLICY "Admins lesen Nummernänderungen" ON public.number_series_changes
  FOR SELECT
  TO authenticated
  USING (( SELECT public.is_workspace_admin(number_series_changes.workspace_id) AS is_workspace_admin));

CREATE TABLE public.number_series_counters (
  id         bigint  GENERATED ALWAYS AS IDENTITY NOT NULL,
  series_id  bigint  NOT NULL,
  period     integer NOT NULL,
  last_value bigint  NOT NULL
);

COMMENT ON TABLE public.number_series_counters IS 'Nur serverseitig veränderte Zähler; Sperren verhindern parallele Doppelvergabe.';

ALTER TABLE public.number_series_counters
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.number_series_counters
  ADD CONSTRAINT number_series_counters_pkey PRIMARY KEY (id);

ALTER TABLE public.number_series_counters
  ADD CONSTRAINT number_series_counters_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.number_series(id) ON DELETE CASCADE;

ALTER TABLE public.number_series_counters
  ADD CONSTRAINT number_series_counters_series_id_period_key UNIQUE (series_id, period);

GRANT ALL ON public.number_series_counters TO service_role;

ALTER TABLE public.purchases
  ADD COLUMN content_status text DEFAULT 'known'::text NOT NULL;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_content_status_check CHECK (content_status = ANY (ARRAY['known'::text, 'unknown'::text]));

ALTER TABLE public.purchases
  ADD COLUMN pricing_mode text;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_pricing_mode_check CHECK (pricing_mode = ANY (ARRAY['individual'::text, 'total'::text]));

ALTER TABLE public.purchases
  ADD COLUMN shipment_status text DEFAULT 'not_shipped'::text NOT NULL;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_shipment_status_check CHECK (shipment_status = ANY (ARRAY['not_shipped'::text, 'in_transit'::text, 'arrived'::text]));

ALTER TABLE public.purchases
  ADD COLUMN supplier_reference text;

ALTER TABLE public.purchases
  ADD COLUMN request_id uuid;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_workspace_id_request_id_key UNIQUE (workspace_id, request_id);

ALTER TABLE public.purchases
  ADD COLUMN discount_amount numeric DEFAULT 0 NOT NULL;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_discount_amount_check CHECK (discount_amount >= 0::numeric AND discount_amount <> 'NaN'::numeric AND scale(discount_amount) <= 2);

ALTER TABLE public.purchases
  ADD COLUMN record_number text;

ALTER TABLE public.purchases
  ADD COLUMN numbering_series_id bigint;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_numbering_series_id_fkey FOREIGN KEY (numbering_series_id) REFERENCES public.number_series(id);

ALTER TABLE public.purchases
  ADD COLUMN numbered_at timestamp with time zone;

ALTER TABLE public.purchases
  ADD COLUMN numbering_version integer;

CREATE UNIQUE INDEX purchases_record_number_idx ON public.purchases (workspace_id, record_number);

CREATE INDEX purchases_numbering_series_idx ON public.purchases (numbering_series_id);

CREATE TRIGGER assign_purchase_number
  BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_record_number();

ALTER TABLE public.sales
  ADD COLUMN record_number text;

ALTER TABLE public.sales
  ADD COLUMN numbering_series_id bigint;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_numbering_series_id_fkey FOREIGN KEY (numbering_series_id) REFERENCES public.number_series(id);

ALTER TABLE public.sales
  ADD COLUMN numbered_at timestamp with time zone;

ALTER TABLE public.sales
  ADD COLUMN numbering_version integer;

CREATE UNIQUE INDEX sales_record_number_idx ON public.sales (workspace_id, record_number);

CREATE INDEX sales_numbering_series_idx ON public.sales (numbering_series_id);

CREATE TRIGGER assign_sale_number
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_record_number();

ALTER TABLE public.suppliers
  ADD COLUMN seller_type text;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_seller_type_check CHECK (seller_type = ANY (ARRAY['private'::text, 'business'::text]));

ALTER TABLE public.suppliers
  ADD COLUMN contact_person text;

ALTER TABLE public.suppliers
  ADD COLUMN country text;

ALTER TABLE public.suppliers
  ADD COLUMN street text;

ALTER TABLE public.suppliers
  ADD COLUMN address_extra text;

ALTER TABLE public.suppliers
  ADD COLUMN postal_code text;

ALTER TABLE public.suppliers
  ADD COLUMN city text;

ALTER TABLE public.suppliers
  ADD COLUMN email text;

ALTER TABLE public.suppliers
  ADD COLUMN phone text;

ALTER TABLE public.suppliers
  ADD COLUMN profile_url text;

ALTER TABLE public.suppliers
  ADD COLUMN website text;

ALTER TABLE public.workspaces
  ADD COLUMN numbering_timezone text DEFAULT 'Europe/Berlin'::text NOT NULL;

-- Bestehende Vorgänge erhalten ihre unveränderliche interne Referenz in
-- Erstellungsreihenfolge. Diese Datenänderung kann der deklarative Diff nicht
-- erzeugen und gehört deshalb ausdrücklich in die generierte Migration.
insert into public.number_series (workspace_id, entity_type, label, prefix)
select workspace.id, entity.entity_type, entity.label, entity.prefix
from public.workspaces as workspace
cross join (
  values ('purchase', 'Einkäufe', 'B'), ('sale', 'Verkäufe', 'V')
) as entity(entity_type, label, prefix)
on conflict (workspace_id, entity_type) do nothing;

alter table public.purchases disable trigger assign_purchase_number;
alter table public.sales disable trigger assign_sale_number;

do $$
declare
  v_record record;
  v_series public.number_series;
  v_sequence bigint;
  v_year integer;
  v_number text;
begin
  for v_record in
    select 'purchase'::text as entity_type, purchase.id, purchase.workspace_id,
      purchase.created_at as assigned_at
    from public.purchases as purchase
    union all
    select 'sale'::text, sale.id, sale.workspace_id, sale.created_at
    from public.sales as sale
    order by workspace_id, entity_type, assigned_at, id
  loop
    select * into strict v_series
    from public.number_series as series
    where series.workspace_id = v_record.workspace_id
      and series.entity_type = v_record.entity_type;

    v_year := extract(
      year from v_record.assigned_at at time zone (
        select workspace.numbering_timezone
        from public.workspaces as workspace
        where workspace.id = v_record.workspace_id
      )
    )::integer;

    insert into public.number_series_counters (series_id, period, last_value)
    values (v_series.id, 0, v_series.start_value)
    on conflict (series_id, period)
    do update set last_value = public.number_series_counters.last_value + 1
    returning last_value into v_sequence;

    v_number := public.format_record_number(
      v_series.prefix,
      v_series.separator,
      case when v_series.include_year then v_year end,
      v_series.minimum_digits,
      v_sequence
    );

    insert into public.number_assignments (
      workspace_id, entity_type, entity_id, series_id, series_version,
      record_number, assigned_at, format_snapshot
    ) values (
      v_record.workspace_id, v_record.entity_type, v_record.id, v_series.id,
      v_series.version, v_number, v_record.assigned_at,
      to_jsonb(v_series) || jsonb_build_object(
        'timezone', (
          select workspace.numbering_timezone
          from public.workspaces as workspace
          where workspace.id = v_record.workspace_id
        )
      )
    );

    if v_record.entity_type = 'purchase' then
      update public.purchases
      set record_number = v_number,
          numbering_series_id = v_series.id,
          numbering_version = v_series.version,
          numbered_at = v_record.assigned_at
      where id = v_record.id;
    else
      update public.sales
      set record_number = v_number,
          numbering_series_id = v_series.id,
          numbering_version = v_series.version,
          numbered_at = v_record.assigned_at
      where id = v_record.id;
    end if;
  end loop;
end;
$$;

alter table public.purchases enable trigger assign_purchase_number;
alter table public.sales enable trigger assign_sale_number;

-- pg-delta bildet bestehende Default-Privilegien nicht zuverlässig ab. Die
-- Nummernvergabe bleibt deshalb ausschließlich über Trigger und Verwaltungs-RPCs schreibbar.
revoke all on table public.number_series from public, anon, authenticated;
revoke all on table public.number_series_counters from public, anon, authenticated;
revoke all on table public.number_assignments from public, anon, authenticated;
revoke all on table public.number_series_changes from public, anon, authenticated;
grant select on table public.number_series to authenticated;
grant select on table public.number_assignments to authenticated;
grant select on table public.number_series_changes to authenticated;
revoke all on function public.assign_record_number() from public, anon, authenticated;
revoke all on function public.format_record_number(text, text, integer, integer, bigint)
  from public, anon, authenticated;
