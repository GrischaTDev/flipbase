-- Freie Einkaufspositionen, Verkaufsherkunft und optionaler Shop; bestehende Workspaces bleiben aktiv.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

COMMENT ON FUNCTION public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb) IS NULL;

COMMENT ON FUNCTION public.reopen_purchase_costing(uuid,uuid) IS NULL;


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
  v_catalog_product_id uuid;
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
  perform public.lock_workspace_shop(p_workspace_id);
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
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
    if v_line ? 'is_package' and pg_catalog.jsonb_typeof(v_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
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

    insert into public.purchase_lines (
      position_kind,
      is_package,
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      ean_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost
    ) values (
      coalesce(v_line ->> 'position_kind', 'stock'),
      coalesce((v_line ->> 'is_package')::boolean, false),
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

CREATE FUNCTION public.assert_workspace_shop (
  p_workspace_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  perform public.lock_workspace_shop(p_workspace_id);
  if not public.workspace_shop_active(p_workspace_id) then
    raise exception using errcode='42501',message='Die Bestandsführung ist ausgeschaltet oder nicht freigeschaltet. Deine Eingaben bleiben erhalten.';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.assert_workspace_shop(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.assert_workspace_shop(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.assert_workspace_shop(uuid) TO service_role;

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

  if v_purchase.content_status = 'unknown' and not exists(
    select 1 from public.purchase_lines where purchase_id=p_purchase_id group by purchase_id having bool_and(position_kind='free')
  ) then
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
    if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
      raise exception using
        errcode = '22023',
        message = 'Offene Einkaufspreise müssen vor dem Abschluss ergänzt werden.';
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

CREATE OR REPLACE FUNCTION public.capture_purchase_package_contents (
  p_workspace_id     uuid,
  p_purchase_line_id uuid,
  p_items            jsonb,
  p_request_id       uuid
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
  v_previous public.purchase_package_capture_requests;
  v_item jsonb;
  v_inventory public.inventory_items;
  v_items jsonb := '[]'::jsonb;
  v_response jsonb;
  v_purchase_id uuid;
  v_archived_at timestamptz;
begin
  perform public.lock_workspace_shop(p_workspace_id);
  if v_actor_id is null or p_workspace_id is null or not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_purchase_line_id is null or p_request_id is null
    or pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Paketposition, Request-ID und Inhaltsliste sind erforderlich.';
  end if;
  if pg_catalog.jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Bitte zwischen einem und 100 Artikeln erfassen.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'package:' || p_workspace_id::text || ':' || p_request_id::text, 0));
  select * into v_previous from public.purchase_package_capture_requests
    where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if v_previous.purchase_line_id is distinct from p_purchase_line_id or v_previous.request_items is distinct from p_items then
      raise exception using errcode = '22023', message = 'Die Request-ID wurde bereits für eine andere Paketerfassung verwendet.';
    end if;
    return v_previous.response;
  end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then
    raise exception using errcode = '55000', message = 'Der Workspace ist archiviert.';
  end if;
  select purchase_id into v_purchase_id from public.purchase_lines
    where workspace_id = p_workspace_id and id = p_purchase_line_id;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diese Paketposition.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_purchase_id::text, 0));
  select * into v_purchase from public.purchases
    where workspace_id = p_workspace_id and id = v_purchase_id for update;
  select * into v_line from public.purchase_lines
    where workspace_id = p_workspace_id and id = p_purchase_line_id for update;
  if v_line.id is null or not v_line.is_package or v_line.purchase_id is distinct from v_purchase.id then
    raise exception using errcode = '22023', message = 'Die Position ist kein Paket dieses Einkaufs.';
  end if;
  if v_purchase.shipment_status <> 'arrived' or v_purchase.arrived_at is null
    or v_purchase.receiving_status = 'archived' then
    raise exception using errcode = '22023', message = 'Vor der Paketerfassung muss die Ankunft bestätigt sein.';
  end if;
  if public.purchase_has_open_prices(p_workspace_id, v_purchase.id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor der Bestandsübernahme ergänzt werden.';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['title','condition','brand','model','description','expected_value']::text[] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_item -> 'title') is distinct from 'string'
      or nullif(pg_catalog.btrim(v_item ->> 'title'), '') is null
      or pg_catalog.length(v_item ->> 'title') > 300
      or pg_catalog.jsonb_typeof(v_item -> 'condition') is distinct from 'string'
      or v_item ->> 'condition' not in ('new','like_new','very_good','used','heavily_used','defective')
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'brand'),'null') not in ('null','string')
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'model'),'null') not in ('null','string')
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'description'),'null') not in ('null','string')
      or pg_catalog.length(v_item ->> 'description') > 5000
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'expected_value'),'null') not in ('null','number') then
      raise exception using errcode = '22023', message = 'Die Artikeldaten des Paketinhalts sind ungültig.';
    end if;
    if v_item ->> 'expected_value' is not null and (
      (v_item ->> 'expected_value')::numeric < 0
      or (v_item ->> 'expected_value')::numeric >= 'Infinity'::numeric
      or (v_item ->> 'expected_value')::numeric <> pg_catalog.round((v_item ->> 'expected_value')::numeric,2)
    ) then
      raise exception using errcode = '22023', message = 'Der erwartete Verkaufswert muss nichtnegativ und centgenau sein.';
    end if;
    insert into public.inventory_items (
      workspace_id, purchase_id, source_package_line_id, title, condition, brand, model, description,
      status, allocated_purchase_cost, tax_purchase_cost, expected_value, is_public_store
    ) values (
      p_workspace_id, v_purchase.id, v_line.id, pg_catalog.btrim(v_item ->> 'title'), v_item ->> 'condition',
      nullif(pg_catalog.btrim(v_item ->> 'brand'), ''), nullif(pg_catalog.btrim(v_item ->> 'model'), ''),
      nullif(pg_catalog.btrim(v_item ->> 'description'), ''),
      case when v_purchase.entry_status = 'finalized' then 'ready' else 'received' end,
      null, null, (v_item ->> 'expected_value')::numeric, false
    ) returning * into v_inventory;
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(v_inventory));
  end loop;
  update public.purchase_lines set received_quantity = 1, updated_at = statement_timestamp()
    where workspace_id = p_workspace_id and id = v_line.id returning * into v_line;
  v_response := pg_catalog.jsonb_build_object('inventory_items',v_items,'purchase_line',pg_catalog.to_jsonb(v_line));
  insert into public.business_events(workspace_id,entity_type,entity_id,event_type,actor_id,changes)
    values (p_workspace_id,'purchase',v_purchase.id,'purchase_package_contents_captured',v_actor_id,
      pg_catalog.jsonb_build_object('source_package_line_id',v_line.id,'request_id',p_request_id,'inventory_items',v_items));
  insert into public.purchase_package_capture_requests(workspace_id,purchase_line_id,request_id,request_items,response)
    values (p_workspace_id,v_line.id,p_request_id,p_items,v_response);
  return v_response;
end;
$function$;

CREATE FUNCTION public.correct_purchase_costing_with_inventory (
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
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
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
    on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
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
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
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
    union
    select sale_line.id from public.sale_lines as sale_line
    where sale_line.workspace_id=p_workspace_id and sale_line.purchase_id=p_purchase_id
      and sale_line.position_kind='free'
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
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or (item.purchase_line_id is null and item.source_package_line_id is null)
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
    case when pg_catalog.count(*) filter (where sale_line.cost_of_goods_sold is null) > 0 then null else coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0) end
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
    if v_input_line ? 'is_package' and pg_catalog.jsonb_typeof(v_input_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
    end if;
    if pg_catalog.jsonb_typeof(v_input_line) <> 'object'
      or not (v_input_line ?& array[
        'id', 'catalog_product_id', 'title_snapshot', 'line_kind',
        'ordered_quantity', 'price_mode', 'unit_purchase_price', 'line_total',
        'condition_snapshot', 'estimated_market_value'
      ])
      or v_input_line - 'is_package' - array[
        'id', 'catalog_product_id', 'title_snapshot', 'position_kind', 'line_kind',
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
      set is_package = coalesce((v_input_line ->> 'is_package')::boolean, is_package),
          title_snapshot = pg_catalog.btrim(v_input_line ->> 'title_snapshot'),
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
        position_kind,
      is_package,
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
        coalesce(v_input_line ->> 'position_kind', 'stock'),
      coalesce((v_input_line ->> 'is_package')::boolean, false),
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

    if v_line.is_package or v_line.position_kind = 'free' then
      -- Der bezahlte Paketpreis bleibt an der Position, ohne verkäuflichen Platzhalter.
      null;
    elsif v_line.line_kind = 'individual' then
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
        received_quantity = case when position_kind = 'free' then received_quantity else ordered_quantity end,
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
    and sale_line.id = any(v_sale_line_ids)
    and sale_line.position_kind <> 'free';

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
    case when pg_catalog.count(*) filter (where sale_line.cost_of_goods_sold is null) > 0 then null else coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0) end
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

COMMENT ON FUNCTION public.correct_purchase_costing_with_inventory(uuid,uuid,text,numeric,jsonb,jsonb) IS 'Korrigiert Eingaben, Bestandskosten und betroffenen Wareneinsatz atomar mit Begründung.';

REVOKE ALL ON FUNCTION public.correct_purchase_costing_with_inventory(uuid, uuid, text, numeric, jsonb, jsonb) FROM PUBLIC;

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
declare result jsonb;
begin
  if not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Workspace.';
  end if;
  perform public.lock_workspace_shop(p_workspace_id);
  insert into public.shop_history_operations values(pg_catalog.txid_current(),p_workspace_id,'purchase_correction',p_purchase_id);
  result:=public.correct_purchase_costing_with_inventory(p_workspace_id,p_purchase_id,p_reason,p_purchase_price,p_lines,p_costs);
  delete from public.shop_history_operations where transaction_id=pg_catalog.txid_current() and workspace_id=p_workspace_id and operation='purchase_correction' and entity_id=p_purchase_id;
  return result;
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
  v_audit_after jsonb;
  v_catalog_product_id uuid;
  v_seller_details jsonb := public.normalize_purchase_seller_details(p_purchase);
begin
  perform public.lock_workspace_shop(p_workspace_id);
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
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
    if v_line ? 'is_package' and pg_catalog.jsonb_typeof(v_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
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
    elsif not (
      (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'open'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
      )
      or (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'priced'
        and pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price') = 'number'
        and pg_catalog.jsonb_typeof(v_line -> 'line_total') = 'number'
        and (v_line ->> 'unit_purchase_price')::numeric >= 0
        and (v_line ->> 'line_total')::numeric >= 0
        and pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) <= 16
        and pg_catalog.scale((v_line ->> 'line_total')::numeric) <= 2
        and (v_line ->> 'line_total')::numeric = pg_catalog.round(
          (v_line ->> 'ordered_quantity')::integer
          * (v_line ->> 'unit_purchase_price')::numeric,
          2
        )
      )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
    end if;
  end loop;

  if coalesce(
    p_purchase ->> 'pricing_mode',
    case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end
  ) = 'individual'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_lines) as line(value)
      where coalesce(nullif(line.value ->> 'price_mode', ''), 'priced') = 'open'
    )
    and coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null') <> 'null' then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf mit offenen Positionspreisen darf keinen Warenbetrag enthalten.';
  end if;

  insert into public.purchases (
    workspace_id, source_id, supplier_id, type, title, purchase_date,
    purchase_price, cost_allocation_mode, notes, tracking_number,
    tracking_carrier, tracking_status, receiving_status,
    content_status, pricing_mode, supplier_reference, request_id, discount_amount,
    seller_type, seller_name, seller_street, seller_address_extra,
    seller_postal_code, seller_city, seller_country_code, receipt_mode
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
    'draft',
    coalesce(p_purchase ->> 'content_status', 'known'),
    p_purchase ->> 'pricing_mode',
    nullif(btrim(p_purchase ->> 'supplier_reference'), ''),
    nullif(p_purchase ->> 'request_id', '')::uuid,
    coalesce((p_purchase ->> 'discount_amount')::numeric, 0),
    v_seller_details ->> 'seller_type',
    v_seller_details ->> 'seller_name',
    v_seller_details ->> 'seller_street',
    v_seller_details ->> 'seller_address_extra',
    v_seller_details ->> 'seller_postal_code',
    v_seller_details ->> 'seller_city',
    v_seller_details ->> 'seller_country_code',
    coalesce(nullif(p_purchase ->> 'receipt_mode', ''), 'external')
  ) returning * into v_purchase;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_ref := nullif(pg_catalog.btrim(v_line ->> 'client_ref'), '');
    if v_line_ref is not null and v_line_refs ? v_line_ref then
      raise exception using errcode = '22023', message = 'Einkaufspositionen benötigen eindeutige Entwurfskennungen.';
    end if;

    insert into public.purchase_lines (
      position_kind,
      is_package,
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      ean_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost, price_mode, condition_snapshot,
      estimated_market_value
    ) values (
      coalesce(v_line ->> 'position_kind', 'stock'),
      coalesce((v_line ->> 'is_package')::boolean, false),
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

CREATE OR REPLACE FUNCTION public.ebay_import_target (
  p_workspace_id uuid,
  p_target       jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_id uuid;
begin
  if jsonb_typeof(p_target) is distinct from 'object' then raise exception 'Ungültiger Artikel' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(p_target)) <> 1 then raise exception 'Ungültiger Artikel' using errcode = '22023'; end if;
  if p_target->'free'='true'::jsonb then return jsonb_build_object('position_kind','free'); end if;
  if p_target ? 'catalogProductId' then
    v_id := (p_target->>'catalogProductId')::uuid;
    if not exists (select 1 from public.catalog_products where id = v_id and workspace_id = p_workspace_id
      and archived_at is null and tracking_mode = 'quantity') then raise exception 'Ungültiger Artikel' using errcode = '22023'; end if;
    return jsonb_build_object('catalog_product_id', v_id);
  elsif p_target ? 'inventoryItemId' then
    v_id := (p_target->>'inventoryItemId')::uuid;
    if not exists (select 1 from public.inventory_items where id = v_id and workspace_id = p_workspace_id
      and archived_at is null) then raise exception 'Ungültiger Artikel' using errcode = '22023'; end if;
    return jsonb_build_object('inventory_item_id', v_id);
  end if;
  raise exception 'Ungültiger Artikel' using errcode = '22023';
end;
$function$;

CREATE OR REPLACE FUNCTION public.ebay_prepare_sale_draft (
  p_cache_id    bigint,
  p_assignments jsonb   DEFAULT NULL::jsonb,
  p_costs       jsonb   DEFAULT NULL::jsonb,
  p_explicit    boolean DEFAULT false
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_order public.ebay_cached_orders; v_draft public.ebay_sale_drafts; v_assignments jsonb; v_costs jsonb;
  v_a jsonb; v_line jsonb; v_target jsonb; v_group record; v_item public.inventory_items; v_lot public.stock_lots;
  v_remaining integer; v_take integer; v_complete boolean; v_targets_valid boolean:=true; v_state text; v_booking public.ebay_order_bookings;
begin
  select * into strict v_order from public.ebay_cached_orders where id=p_cache_id;
  perform public.lock_workspace_shop(v_order.workspace_id);
  perform pg_advisory_xact_lock(hashtextextended(v_order.workspace_id::text||':'||v_order.environment||':'||v_order.source_key,0));
  select * into v_draft from public.ebay_sale_drafts where workspace_id=v_order.workspace_id and environment=v_order.environment and source_key=v_order.source_key for update;
  select * into v_booking from public.ebay_order_bookings where workspace_id=v_order.workspace_id and environment=v_order.environment and source_key=v_order.source_key;
  -- Ältere Übernahmen können ohne Entwurf entstanden sein. Nur den Klärbezug anlegen, nie reservieren.
  if v_draft.id is null and v_booking.sale_id is not null then
    insert into public.ebay_sale_drafts(workspace_id,environment,external_account_id,source_key,order_id,source,assignments,state,sale_id)
      values(v_order.workspace_id,v_order.environment,v_order.external_account_id,v_order.source_key,v_order.order_id,v_order.source,v_booking.source_lines,
        case when v_booking.status='imported' then 'booked' else 'linked_existing' end,v_booking.sale_id) returning * into v_draft;
  end if;
  -- Nach bewusster Aufhebung bleibt Lesen still; nur Speichern darf neu reservieren.
  if v_draft.requires_explicit_preparation and not p_explicit then
    update public.ebay_sale_drafts set source=v_order.source,updated_at=clock_timestamp() where id=v_draft.id;
    return v_draft.id;
  end if;
  if v_draft.state in ('booked','linked_existing','dismissed') then
    update public.ebay_sale_drafts set source=v_order.source,updated_at=clock_timestamp() where id=v_draft.id;
    return v_draft.id;
  end if;
  if v_draft.id is null and not (p_explicit or v_order.auto_prepare) then return null; end if;
  -- Ein Storno kann Positionen entfernen. Den bestehenden Besitzer deshalb vor
  -- jeder neuen Positionsprüfung klären; eine unklare Quelle behält ihn unverändert.
  if v_order.source->>'paymentStatus' is distinct from 'PAID' or v_order.source->>'cancelStatus' is distinct from 'NONE_REQUESTED'
    or v_order.source->'blockers' is distinct from '[]'::jsonb or v_order.source->>'currency' is distinct from 'EUR'
    or exists(select 1 from jsonb_array_elements(v_order.source->'lines') l where l->'hasRefund' is distinct from 'false'::jsonb)
  then
    if v_draft.id is not null then
      if v_order.source->>'cancelStatus'='CANCELED' then perform public.ebay_release_sale_reservations(v_draft.id); end if;
      update public.ebay_sale_drafts set source=v_order.source,state='blocked',updated_at=clock_timestamp() where id=v_draft.id;
      return v_draft.id;
    elsif not p_explicit then return null;
    end if;
  end if;
  select * into v_booking from public.ebay_order_bookings where workspace_id=v_order.workspace_id and environment=v_order.environment and source_key=v_order.source_key;
  if v_booking.id is not null and v_draft.id is null then return null; end if;
  v_assignments:=p_assignments;
  if v_assignments is null then
    select coalesce(jsonb_agg(a),'[]'::jsonb) into v_assignments from jsonb_array_elements(coalesce(v_draft.assignments,'[]'::jsonb)) a
      where exists(select 1 from jsonb_array_elements(v_order.source->'lines') l where l->>'lineItemId'=a->>'lineItemId');
    if v_assignments is null or v_assignments='[]'::jsonb then
      if not public.workspace_shop_active(v_order.workspace_id) then
        select jsonb_agg(jsonb_build_object('lineItemId',l->>'lineItemId','target',jsonb_build_object('free',true))) into v_assignments from jsonb_array_elements(v_order.source->'lines') l;
      else
      select coalesce(jsonb_agg(jsonb_build_object('lineItemId',l->>'lineItemId','target',case when m.inventory_item_id is not null then jsonb_build_object('inventoryItemId',m.inventory_item_id) else jsonb_build_object('catalogProductId',m.catalog_product_id) end)),'[]'::jsonb)
        into v_assignments from jsonb_array_elements(v_order.source->'lines') l join public.ebay_article_mappings m on m.workspace_id=v_order.workspace_id
        and m.environment=v_order.environment and m.external_account_id=v_order.external_account_id and m.listing_id=l->>'listingId' and m.variation_id is not distinct from l->>'variationId'
        and (m.variation_id is not null or l->'variationAspects'='[]'::jsonb);
      end if;
    end if;
  end if;
  if jsonb_typeof(v_assignments) is distinct from 'array' or jsonb_array_length(v_assignments)>200
    or (select count(distinct a->>'lineItemId') from jsonb_array_elements(v_assignments) a)<>jsonb_array_length(v_assignments)
  then raise exception 'Ungültige Artikelzuordnung' using errcode='22023'; end if;
  for v_a in select value from jsonb_array_elements(v_assignments) loop
    if (select count(*) from jsonb_object_keys(v_a))<>2 or not exists(select 1 from jsonb_array_elements(v_order.source->'lines') l where l->>'lineItemId'=v_a->>'lineItemId')
    then raise exception 'Ungültige Artikelzuordnung' using errcode='22023'; end if;
    begin
      v_target:=public.ebay_import_target(v_order.workspace_id,v_a->'target');
    exception when sqlstate '22023' then
      if p_explicit then raise; end if;
      -- Historische Zuordnungen können inzwischen archivierte Ziele enthalten.
      -- Das darf andere Bestellungen derselben Abgleichseite nicht aufhalten.
      v_targets_valid:=false;
    end;
  end loop;
  if not public.workspace_shop_active(v_order.workspace_id) and exists(select 1 from jsonb_array_elements(v_assignments) a where a#>>'{target,free}' is distinct from 'true') then v_targets_valid:=false; end if;
  v_complete:=jsonb_array_length(v_assignments)=jsonb_array_length(v_order.source->'lines') and jsonb_array_length(v_assignments)>0;
  -- Neu eingelesene Gebühren werden angezeigt; persönlich bestätigte Kosten bleiben erhalten.
  v_costs:=coalesce(p_costs,case when v_draft.costs_origin='personal' then v_draft.costs end,jsonb_build_object('platformFeeCents',v_order.source->'platformFeeCents','shippingCostCents',null,'shippingMode',null,'additionalCosts','[]'::jsonb));
  if jsonb_typeof(v_costs) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_costs))<>4
    or not (v_costs ?& array['platformFeeCents','shippingCostCents','shippingMode','additionalCosts'])
    or (v_costs->'platformFeeCents'<>'null'::jsonb and not public.ebay_valid_cents(v_costs->'platformFeeCents'))
    or (v_costs->'shippingCostCents'<>'null'::jsonb and not public.ebay_valid_cents(v_costs->'shippingCostCents'))
    or (v_costs->'shippingMode'<>'null'::jsonb and v_costs->>'shippingMode' not in ('pickup','seller_arranged','platform_prepaid'))
    or jsonb_typeof(v_costs->'additionalCosts') is distinct from 'array' or jsonb_array_length(v_costs->'additionalCosts')>50
  then raise exception 'Ungültige Kosten' using errcode='22023'; end if;
  for v_a in select value from jsonb_array_elements(v_costs->'additionalCosts') loop
    if not public.ebay_valid_cents(v_a->'amountCents') or coalesce(v_a->>'category','') not in ('packaging','payment_fee','promotion','other')
      or (select count(*) from jsonb_object_keys(v_a))<>3 or not(v_a?'description')
      or jsonb_typeof(v_a->'description') not in ('string','null') or char_length(coalesce(v_a->>'description',''))>500
    then raise exception 'Ungültige Zusatzkosten' using errcode='22023'; end if;
  end loop;
  -- Unzugeordnete neue Aufträge bleiben zunächst nur in der Bestellübersicht.
  if v_draft.id is null and not p_explicit and not v_complete then return null; end if;
  if v_draft.id is null then
    insert into public.ebay_sale_drafts(workspace_id,environment,external_account_id,source_key,order_id,source,assignments,costs,state,costs_origin)
      values(v_order.workspace_id,v_order.environment,v_order.external_account_id,v_order.source_key,v_order.order_id,v_order.source,'[]',v_costs,'needs_mapping',case when p_costs is null then 'automatic' else 'personal' end) returning * into v_draft;
  end if;
  if v_order.source->>'cancelStatus'='CANCELED' then
    perform public.ebay_release_sale_reservations(v_draft.id);
    v_state:='blocked';
  elsif v_order.source->>'paymentStatus' is distinct from 'PAID' or v_order.source->>'cancelStatus' is distinct from 'NONE_REQUESTED'
    or v_order.source->'blockers' is distinct from '[]'::jsonb or v_order.source->>'currency' is distinct from 'EUR'
    or exists(select 1 from jsonb_array_elements(v_order.source->'lines') l where l->'hasRefund' is distinct from 'false'::jsonb)
  then
    -- Unklare Quelle hält die bisherige Reservierung einschließlich ihrer Zuordnung fest.
    update public.ebay_sale_drafts set source=v_order.source,costs=v_costs,costs_origin=case when p_costs is null then costs_origin else 'personal' end,state='blocked',updated_at=clock_timestamp() where id=v_draft.id;
    return v_draft.id;
  else
    perform public.ebay_lock_draft_stock(v_order.workspace_id,v_draft.assignments||v_assignments);
    if v_draft.assignments is distinct from v_assignments or v_draft.source->'lines' is distinct from v_order.source->'lines' then
      perform public.ebay_release_sale_reservations(v_draft.id);
    end if;
    v_state:=case when not v_complete then 'needs_mapping' when not v_targets_valid then 'needs_stock' else 'needs_costs' end;
    if v_complete and v_targets_valid and not exists(select 1 from public.ebay_sale_reservations where draft_id=v_draft.id and released_at is null) then
      -- Untertransaktion: Ein Fehlbestand nimmt sämtliche Paketreservierungen zurück.
      begin
        for v_group in select a->'target' target,sum((l->>'quantity')::integer)::integer quantity from jsonb_array_elements(v_assignments) a
          join jsonb_array_elements(v_order.source->'lines') l on l->>'lineItemId'=a->>'lineItemId' group by a->'target' order by (a->'target')::text loop
          if v_group.target->'free'='true'::jsonb then continue; end if;
          if v_group.quantity is null or v_group.quantity<=0 then raise exception 'Ungültige Menge' using errcode='22023'; end if;
          if v_group.target?'inventoryItemId' then
            select * into strict v_item from public.inventory_items where id=(v_group.target->>'inventoryItemId')::uuid and workspace_id=v_order.workspace_id;
            if v_group.quantity<>1 or v_item.status not in ('ready','listed') or v_item.archived_at is not null
              or exists(select 1 from public.purchases where id=v_item.purchase_id and entry_status<>'finalized')
              or exists(select 1 from public.inventory_item_sale_states where inventory_item_id=v_item.id and sale_state<>'no_active_sale')
            then raise exception 'Bestand fehlt' using errcode='P2001'; end if;
            update public.inventory_items set status='reserved' where id=v_item.id;
            insert into public.ebay_sale_reservations(workspace_id,draft_id,inventory_item_id,quantity,previous_status) values(v_order.workspace_id,v_draft.id,v_item.id,1,v_item.status);
          else
            v_remaining:=v_group.quantity;
            for v_lot in select l.* from public.stock_lots l join public.purchases p on p.id=l.purchase_id and p.workspace_id=l.workspace_id
              where l.workspace_id=v_order.workspace_id and l.catalog_product_id=(v_group.target->>'catalogProductId')::uuid and p.entry_status='finalized' and l.remaining_quantity>0 order by l.received_at,l.id loop
              v_take:=least(v_remaining,greatest(0,v_lot.remaining_quantity-public.stock_lot_reserved_quantity(v_lot.id)));
              if v_take>0 then
                insert into public.ebay_sale_reservations(workspace_id,draft_id,stock_lot_id,quantity) values(v_order.workspace_id,v_draft.id,v_lot.id,v_take);
                insert into public.stock_movements(workspace_id,stock_lot_id,direction,quantity,reason,ebay_sale_draft_id) values(v_order.workspace_id,v_lot.id,'out',v_take,'reservation',v_draft.id);
                v_remaining:=v_remaining-v_take;
              end if;
              exit when v_remaining=0;
            end loop;
            if v_remaining>0 then raise exception 'Bestand fehlt' using errcode='P2001'; end if;
          end if;
        end loop;
      exception when sqlstate 'P2001' then v_state:='needs_stock';
      end;
    end if;
    if v_state='needs_costs' and public.ebay_valid_cents(v_costs->'platformFeeCents') and public.ebay_valid_cents(v_costs->'shippingCostCents') then v_state:='ready_for_review'; end if;
  end if;
  update public.ebay_sale_drafts set source=v_order.source,assignments=v_assignments,costs=v_costs,costs_origin=case when p_costs is null then costs_origin else 'personal' end,state=v_state,requires_explicit_preparation=false,updated_at=clock_timestamp() where id=v_draft.id;
  return v_draft.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ebay_record_order_sale (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_snapshot_id   uuid,
  p_assignments   jsonb,
  p_costs         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_connection public.ebay_connections; v_snapshot public.ebay_order_snapshots; v_booking public.ebay_order_bookings;
  v_source jsonb; v_line jsonb; v_assignment jsonb; v_target jsonb; v_cost jsonb;
  v_lines jsonb := '[]'; v_links jsonb := '[]'; v_costs jsonb := '[]'; v_result jsonb;
  v_quantity integer; v_cents bigint; v_base bigint; v_remainder integer; v_count integer;
  v_draft public.ebay_sale_drafts; v_total bigint := 0; v_id uuid; v_index integer := 0; v_sale_date date;
begin
  perform public.lock_workspace_shop(p_workspace_id);
  v_connection := public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id and workspace_id = p_workspace_id
    and connection_id = p_connection_id and user_id = (select auth.uid())
    and authorization_version = v_connection.authorization_version and external_account_id = v_connection.external_account_id;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  -- Auch eine noch nicht angelegte Quelle wird bis Commit gesperrt.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_connection.environment || ':' || v_snapshot.source_key,0));
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id for update;
  select * into v_booking from public.ebay_order_bookings where workspace_id = p_workspace_id
    and environment = v_connection.environment and source_key = v_snapshot.source_key;
  if found then
    return jsonb_build_object('status',v_booking.status,'saleId',v_booking.sale_id)
      || case when v_booking.status = 'imported' then jsonb_build_object('alreadyRecorded',true) else '{}'::jsonb end;
  end if;
  if not v_snapshot.booking_ready or v_snapshot.expires_at <= clock_timestamp()
  then raise exception 'Bestellung bitte erneut prüfen' using errcode = '22023'; end if;
  v_source := v_snapshot.source;
  if v_source->>'currency' is distinct from 'EUR' or v_source->>'paymentStatus' is distinct from 'PAID'
    or v_source->>'cancelStatus' is distinct from 'NONE_REQUESTED' or v_source->'blockers' is distinct from '[]'::jsonb
    or not public.ebay_valid_cents(v_source->'totalCents') or not public.ebay_valid_cents(v_source->'shippingRevenueCents')
    or jsonb_typeof(v_source->'lines') is distinct from 'array' or jsonb_array_length(v_source->'lines') not between 1 and 200
  then raise exception 'Bestellung ist nicht buchbar' using errcode = '22023'; end if;
  if exists (select 1 from public.sales where workspace_id = p_workspace_id and lower(platform) = 'ebay'
    and external_order_id = v_source->>'orderId')
  then raise exception 'Vorhandenen eBay-Verkauf bitte zuerst prüfen und manuell zuordnen' using errcode = '22023'; end if;
  if jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments) <> jsonb_array_length(v_source->'lines')
    or (select count(distinct value->>'lineItemId') from jsonb_array_elements(p_assignments)) <> jsonb_array_length(p_assignments)
    or (select count(distinct value->>'lineItemId') from jsonb_array_elements(v_source->'lines')) <> jsonb_array_length(v_source->'lines')
  then raise exception 'Ungültige Artikelzuordnung' using errcode = '22023'; end if;
  if jsonb_typeof(p_costs) is distinct from 'object' or not public.ebay_valid_cents(p_costs->'platformFeeCents')
    or not public.ebay_valid_cents(p_costs->'shippingCostCents') or jsonb_typeof(p_costs->'additionalCosts') is distinct from 'array'
    or jsonb_array_length(p_costs->'additionalCosts') > 50
    or not (p_costs ? 'shippingMode') or (p_costs->'shippingMode' <> 'null'::jsonb and p_costs->>'shippingMode' not in ('seller_arranged','platform_prepaid','pickup'))
    or exists (select 1 from jsonb_object_keys(p_costs) k where k not in ('platformFeeCents','shippingCostCents','shippingMode','additionalCosts'))
  then raise exception 'Kosten bitte ausdrücklich bestätigen' using errcode = '22023'; end if;
  for v_cost in select value from jsonb_array_elements(p_costs->'additionalCosts') loop
    if jsonb_typeof(v_cost) is distinct from 'object' or not public.ebay_valid_cents(v_cost->'amountCents')
      or coalesce(v_cost->>'category','') not in ('packaging','payment_fee','promotion','other')
      or jsonb_typeof(v_cost->'description') is distinct from 'null' and jsonb_typeof(v_cost->'description') is distinct from 'string'
      or char_length(coalesce(v_cost->>'description','')) > 500
      or exists (select 1 from jsonb_object_keys(v_cost) k where k not in ('category','description','amountCents'))
    then raise exception 'Ungültige Kosten' using errcode = '22023'; end if;
    v_costs := v_costs || jsonb_build_array(jsonb_build_object('category',v_cost->>'category','description',v_cost->>'description','amount',round((v_cost->>'amountCents')::numeric/100,2)));
  end loop;
  for v_line in select value from jsonb_array_elements(v_source->'lines') loop
    if not public.ebay_valid_cents(v_line->'goodsCents') or v_line->'hasRefund' is distinct from 'false'::jsonb
      or jsonb_typeof(v_line->'quantity') is distinct from 'number' or coalesce(v_line->>'quantity','') !~ '^[1-9][0-9]{0,9}$'
      or (v_line->>'quantity')::numeric > 2147483647
    then raise exception 'Ungültige Quellposition' using errcode = '22023'; end if;
    v_quantity := (v_line->>'quantity')::integer; v_cents := (v_line->>'goodsCents')::bigint;
    if v_cents < v_quantity then raise exception 'Stückpreise müssen positiv sein' using errcode = '22023'; end if;
    select value into v_assignment from jsonb_array_elements(p_assignments) where value->>'lineItemId' = v_line->>'lineItemId';
    if not found or jsonb_typeof(v_assignment) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_assignment)) <> 2
    then raise exception 'Ungültige Artikelzuordnung' using errcode = '22023'; end if;
    v_target := public.ebay_import_target(p_workspace_id,v_assignment->'target');
    if v_target ? 'inventory_item_id' and v_quantity <> 1 then raise exception 'Einzelstückmenge muss eins sein' using errcode = '22023'; end if;
    v_base := v_cents / v_quantity; v_remainder := (v_cents % v_quantity)::integer;
    for v_count in 0..1 loop
      v_index := case when v_count = 0 then v_quantity-v_remainder else v_remainder end;
      if v_index > 0 then
        v_lines := v_lines || jsonb_build_array(v_target || jsonb_build_object('quantity',v_index,'unit_sale_price',round((v_base+v_count)::numeric/100,2),'title_snapshot',v_line->>'title'));
        v_links := v_links || jsonb_build_array(jsonb_build_object('lineItemId',v_line->>'lineItemId','quantity',v_index,'unitPriceCents',v_base+v_count));
      end if;
    end loop;
    v_total := v_total + v_cents;
  end loop;
  if v_total + (v_source->>'shippingRevenueCents')::bigint <> (v_source->>'totalCents')::bigint
    or v_total > 999999999999 then raise exception 'Quellbeträge passen nicht zusammen' using errcode = '22023'; end if;
  v_sale_date := ((v_source->>'createdAt')::timestamptz at time zone 'Europe/Berlin')::date;
  if v_sale_date is null then raise exception 'Verkaufsdatum fehlt' using errcode = '22023'; end if;
  select * into v_draft from public.ebay_sale_drafts where workspace_id=p_workspace_id
    and environment=v_connection.environment and source_key=v_snapshot.source_key for update;
  if v_draft.id is not null then
    if v_draft.requires_explicit_preparation or v_draft.state in ('blocked','dismissed','linked_existing','booked')
      or (select jsonb_agg(a order by a->>'lineItemId') from jsonb_array_elements(v_draft.assignments) a)
        is distinct from (select jsonb_agg(a order by a->>'lineItemId') from jsonb_array_elements(p_assignments) a)
    then raise exception 'Gespeicherten Entwurf bitte erneut prüfen' using errcode='22023'; end if;
    perform public.ebay_release_sale_reservations(v_draft.id);
  end if;
  v_result := public.record_sale(p_workspace_id,jsonb_build_object('booking_key',v_snapshot.id,'platform','ebay','sale_date',v_sale_date,
    'external_order_id',v_source->>'orderId','shipping_revenue',round((v_source->>'shippingRevenueCents')::numeric/100,2),
    'platform_fee',round((p_costs->>'platformFeeCents')::numeric/100,2),'shipping_cost',round((p_costs->>'shippingCostCents')::numeric/100,2),
    'shipping_mode',p_costs->>'shippingMode','cost_entries',v_costs),v_lines);
  v_id := (v_result->'sale'->>'id')::uuid;
  if jsonb_array_length(v_result->'sale_line_ids') is distinct from jsonb_array_length(v_links)
  then raise exception 'Verkaufspositionen konnten nicht bestätigt werden' using errcode = '22023'; end if;
  select jsonb_agg(link.value || jsonb_build_object('saleLineId',v_result->'sale_line_ids'->(link.ordinality::int-1)) order by link.ordinality)
    into v_links from jsonb_array_elements(v_links) with ordinality as link(value,ordinality);
  insert into public.ebay_order_bookings(workspace_id,environment,source_key,status,sale_id,source_lines,recorded_by)
    values (p_workspace_id,v_connection.environment,v_snapshot.source_key,'imported',v_id,v_links,(select auth.uid()));
  update public.ebay_sale_drafts set state='booked',sale_id=v_id,costs=p_costs,source=v_source,updated_at=clock_timestamp() where id=v_draft.id;
  return jsonb_build_object('status','imported','saleId',v_id,'alreadyRecorded',false);
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
  perform public.lock_workspace_shop(p_workspace_id);
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
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

  if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor dem Abschluss ergänzt werden.';
  end if;

  if v_purchase.request_id is not null and v_purchase.shipment_status <> 'arrived'
    and exists(select 1 from public.purchase_lines where purchase_id = p_purchase_id and position_kind = 'stock') then
    raise exception using
      errcode = '22023',
      message = 'Vor dem Abschluss muss die Ankunft bestätigt sein.';
  end if;

  if v_purchase.content_status = 'unknown' and not exists(
    select 1 from public.purchase_lines where purchase_id=p_purchase_id group by purchase_id having bool_and(position_kind='free')
  ) then
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
    on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
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
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or (item.purchase_line_id is null and item.source_package_line_id is null)
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
          line.line_kind = 'individual' and not line.is_package and line.position_kind = 'stock'
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

    if v_line.is_package or v_line.position_kind = 'free' then
      -- Der bezahlte Paketpreis bleibt an der Position, ohne verkäuflichen Platzhalter.
      null;
    elsif v_line.line_kind = 'individual' then
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
        received_quantity = case when position_kind = 'free' then received_quantity else ordered_quantity end,
        updated_at = v_finalized_at
    where workspace_id = p_workspace_id
      and id = v_line.id;
  end loop;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or (item.purchase_line_id is null and item.source_package_line_id is null)
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
        (line.position_kind = 'stock' and line.received_quantity <> line.ordered_quantity)
        or line.allocated_additional_cost > line.allocated_total_cost
        or (
          line.line_kind = 'individual' and not line.is_package and line.position_kind = 'stock'
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
    + coalesce((
      select pg_catalog.sum(line.allocated_total_cost * 100)
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id and (line.is_package or line.position_kind = 'free')
    ), 0)
  )::bigint
  into v_inventory_cents;

  if v_inventory_cents <> v_total_cents then
    raise exception using
      errcode = 'P0001',
      message = 'Der gesamte Einkaufsbestand reconciliiert nicht mit den Einkaufsgesamtkosten.';
  end if;

  update public.inventory_items
  set status = 'ready', updated_at = v_finalized_at
  where workspace_id = p_workspace_id and purchase_id = p_purchase_id
    and source_package_line_id is not null and status in ('received', 'needs_review', 'researched');

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
    or not (select public.can_access_workspace(p_workspace_id)) then
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
  ) or exists (
    select 1 from public.sale_lines as sale_line
    where sale_line.workspace_id=p_workspace_id and sale_line.purchase_id=p_purchase_id
      and sale_line.position_kind='free'
  ) then
    return 'recorded';
  end if;

  return 'none';
end;
$function$;

CREATE FUNCTION public.get_workspace_shop_state (
  p_workspace_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb;
begin
  if (select auth.uid()) is null or not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Arbeitsbereich.';
  end if;
  select pg_catalog.jsonb_build_object('workspace_id',id,'shop_enabled',shop_enabled,
    'shop_entitled',shop_entitled,'shop_version',shop_version) into result
    from public.workspaces where id=p_workspace_id;
  return result;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_workspace_shop_state(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_workspace_shop_state(uuid) TO authenticated;

CREATE FUNCTION public.guard_free_purchase_line()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'UPDATE' and new.position_kind is distinct from old.position_kind
    and (old.received_quantity > 0 or exists(select 1 from public.purchases where id = old.purchase_id and entry_status = 'finalized')) then
    raise exception using errcode = '22023', message = 'Die Erfassungsart einer gebuchten Einkaufsposition bleibt erhalten.';
  end if;
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.guard_free_purchase_line() TO authenticated;

GRANT ALL ON FUNCTION public.guard_free_purchase_line() TO service_role;

CREATE FUNCTION public.guard_sale_purchase_reference()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op='UPDATE' and new.purchase_id is distinct from old.purchase_id then
    raise exception using errcode='22023',message='Die gebuchte Einkaufszuordnung kann nicht direkt überschrieben werden.';
  end if;
  if new.purchase_id is not null and (new.position_kind <> 'free' or not exists (
    select 1 from public.purchases where id = new.purchase_id and workspace_id = new.workspace_id and entry_status = 'finalized'
  )) then
    raise exception using errcode = '22023', message = 'Bitte wähle einen abgeschlossenen Einkauf dieses Arbeitsbereichs.';
  end if;
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.guard_sale_purchase_reference() TO authenticated;

GRANT ALL ON FUNCTION public.guard_sale_purchase_reference() TO service_role;

CREATE FUNCTION public.guard_workspace_shop_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op='INSERT' then
    if current_user not in('postgres','supabase_admin') and (new.shop_enabled or not new.shop_entitled or new.shop_version<>0) then
      raise exception using errcode='42501',message='Shop-Einstellungen können nur über die Einstellungen geändert werden.';
    end if;
    return new;
  end if;
  if (new.shop_enabled,new.shop_entitled,new.shop_version) is distinct from (old.shop_enabled,old.shop_entitled,old.shop_version) then
    if current_user not in('postgres','supabase_admin') then
      raise exception using errcode='42501',message='Shop-Einstellungen können nur über die Einstellungen geändert werden.';
    end if;
    perform public.lock_workspace_shop(old.id);
    if not new.shop_entitled then new.shop_enabled:=false; end if;
    new.shop_version:=old.shop_version+1;
  end if;
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.guard_workspace_shop_fields() TO authenticated;

GRANT ALL ON FUNCTION public.guard_workspace_shop_fields() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_workspace_stock_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare row_value jsonb; workspace uuid; history_allowed boolean:=false;
begin
  row_value:=case when tg_op='DELETE' then pg_catalog.to_jsonb(old) else pg_catalog.to_jsonb(new) end;
  workspace:=(row_value->>'workspace_id')::uuid;
  if workspace is null and tg_table_name='item_media' then
    select workspace_id into workspace from public.inventory_items where id=(row_value->>'inventory_item_id')::uuid;
  end if;
  if workspace is null and tg_table_name='store_order_items' then
    select workspace_id into workspace from public.store_orders where id=coalesce((row_value->>'order_id')::uuid,(row_value->>'store_order_id')::uuid);
  end if;
  -- FK-Kaskaden räumen ausschließlich Kinder einer bereits autorisiert gelöschten Zeile auf.
  if tg_op='DELETE' and pg_catalog.pg_trigger_depth()>1 and (
    (workspace is null and tg_table_name in('item_media','store_order_items'))
    or (workspace is not null and not exists(select 1 from public.workspaces where id=workspace))
  ) then return old; end if;
  if tg_op='INSERT' and tg_table_name in('inventory_items','stock_lots') and exists(
    select 1 from public.purchase_lines where id=coalesce((row_value->>'purchase_line_id')::uuid,(row_value->>'source_package_line_id')::uuid) and position_kind='free'
  ) then raise exception using errcode='22023',message='Freie Einkaufspositionen erzeugen keinen Bestand.'; end if;
  if tg_table_name in('purchase_lines','sale_lines') and row_value->>'position_kind'='free' then
    if tg_table_name='purchase_lines' and tg_op='UPDATE' and old.position_kind='stock' then perform public.assert_workspace_shop(workspace); end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  perform public.lock_workspace_shop(workspace);
  if public.workspace_shop_active(workspace) then return case when tg_op='DELETE' then old else new end; end if;
  if tg_table_name='store_orders' and tg_op='UPDATE' and
    pg_catalog.to_jsonb(new)-array['payment_status','payment_id','updated_at']=pg_catalog.to_jsonb(old)-array['payment_status','payment_id','updated_at'] then return new; end if;
  if current_user in('postgres','supabase_admin') then
    select exists(select 1 from public.shop_history_operations context
      where context.transaction_id=pg_catalog.txid_current() and context.workspace_id=workspace and (
        (context.operation='reservation_release' and tg_table_name in('inventory_items','stock_movements'))
        or (context.operation='purchase_draft_delete' and tg_table_name='purchase_lines' and tg_op='DELETE' and row_value->>'purchase_id'=context.entity_id::text)
        or (context.operation in('purchase_correction','purchase_reopen') and
          (row_value->>'purchase_id'=context.entity_id::text or exists(select 1 from public.stock_lots where id=(row_value->>'stock_lot_id')::uuid and purchase_id=context.entity_id)))
        or (context.operation='purchase_correction' and tg_table_name='sale_lines' and tg_op='UPDATE' and (
          exists(select 1 from public.inventory_items item
            left join public.purchase_lines line on line.id=coalesce(item.purchase_line_id,item.source_package_line_id)
            where item.id=(row_value->>'inventory_item_id')::uuid and item.workspace_id=workspace
              and (item.purchase_id=context.entity_id or line.purchase_id=context.entity_id))
          or exists(select 1 from public.sale_line_lot_allocations allocation
            join public.stock_lots lot on lot.id=allocation.stock_lot_id
            where allocation.sale_line_id=(row_value->>'id')::uuid and allocation.workspace_id=workspace
              and lot.workspace_id=workspace and lot.purchase_id=context.entity_id)
        ))
        or (context.operation='refund' and (
          exists(select 1 from public.sale_lines where sale_id=context.entity_id and inventory_item_id=(row_value->>'id')::uuid)
          or exists(select 1 from public.sale_line_lot_allocations allocation join public.sale_lines line on line.id=allocation.sale_line_id where line.sale_id=context.entity_id and allocation.stock_lot_id=coalesce((row_value->>'stock_lot_id')::uuid,(row_value->>'id')::uuid))
        ))
      )) into history_allowed;
  end if;
  if history_allowed and not(tg_op='INSERT' and tg_table_name in('inventory_items','stock_lots','purchase_lines','sale_lines')) then
    return case when tg_op='DELETE' then old else new end;
  end if;
  perform public.assert_workspace_shop(workspace);
  return case when tg_op='DELETE' then old else new end;
end;
$function$;

GRANT ALL ON FUNCTION public.guard_workspace_stock_write() TO authenticated;

GRANT ALL ON FUNCTION public.guard_workspace_stock_write() TO service_role;

CREATE FUNCTION public.lock_workspace_shop (
  p_workspace_id uuid
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('workspace_shop:'||p_workspace_id::text,0));
$function$;

REVOKE ALL ON FUNCTION public.lock_workspace_shop(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.lock_workspace_shop(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.lock_workspace_shop(uuid) TO service_role;

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
  perform public.lock_workspace_shop(p_workspace_id);
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
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
  if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor dem Wareneingang ergänzt werden.';
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
    or v_purchase_line.is_package
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

CREATE OR REPLACE FUNCTION public.receive_purchase_lines_idempotent (
  p_workspace_id uuid,
  p_purchase_id  uuid,
  p_request_id   uuid,
  p_lines        jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_previous public.purchase_receipt_requests;
  v_response jsonb;
  v_archived_at timestamptz;
begin
  perform public.lock_workspace_shop(p_workspace_id);
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Eine Request-ID ist für den Wareneingang erforderlich.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('receipt:' || p_workspace_id::text || ':' || p_request_id::text, 0)
  );
  select * into v_previous from public.purchase_receipt_requests
    where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if v_previous.purchase_id is distinct from p_purchase_id
      or v_previous.request_lines is distinct from p_lines then
      raise exception using errcode = '22023', message = 'Die Request-ID wurde bereits für einen anderen Wareneingang verwendet.';
    end if;
    return v_previous.response;
  end if;

  -- Archivierung und Buchung werden bis Transaktionsende gegeneinander gesperrt.
  select archived_at into v_archived_at from public.workspaces
    where id = p_workspace_id for share;
  if v_archived_at is not null then
    raise exception using errcode = '55000', message = 'Der Workspace ist archiviert.';
  end if;

  -- Der vorhandene Kern hält Einkaufs-/Positionslocks, Mengenprüfung und Ereignisse atomar.
  v_response := public.receive_purchase_lines(p_workspace_id, p_purchase_id, p_lines);
  insert into public.purchase_receipt_requests(id,workspace_id,purchase_id,request_id,request_lines,response)
    values (gen_random_uuid(),p_workspace_id,p_purchase_id,p_request_id,p_lines,v_response);
  return v_response;
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
  perform public.lock_workspace_shop(p_workspace_id);
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
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
  if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor dem Wareneingang ergänzt werden.';
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

    if v_purchase_line.line_kind <> 'quantity'
      or v_purchase_line.catalog_product_id is null
      or not exists (
        select 1
        from public.catalog_products as product
        where product.workspace_id = p_workspace_id
          and product.id = v_purchase_line.catalog_product_id
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufsposition ist keinem gültigen Mengenprodukt zugeordnet.';
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
      null,
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

CREATE FUNCTION public.record_sale_return_with_inventory (
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

REVOKE ALL ON FUNCTION public.record_sale_return_with_inventory(uuid, uuid, numeric, boolean, text, text, text, text) FROM PUBLIC;

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
declare result jsonb;
begin
  if not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Workspace.';
  end if;
  perform public.lock_workspace_shop(p_workspace_id);
  insert into public.shop_history_operations values(pg_catalog.txid_current(),p_workspace_id,'refund',p_sale_id);
  result:=public.record_sale_return_with_inventory(p_workspace_id,p_sale_id,p_refund_amount,p_restock,p_reason,p_notes,p_restock_action,p_buyer_name);
  delete from public.shop_history_operations where transaction_id=pg_catalog.txid_current() and workspace_id=p_workspace_id and operation='refund' and entity_id=p_sale_id;
  return result;
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
  perform public.lock_workspace_shop(p_workspace_id);
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
      insert into public.sale_lines (workspace_id, sale_id, position_kind, purchase_id, title_snapshot, quantity,
        unit_sale_price, line_total, cost_of_goods_sold, tax_mode)
      values (p_workspace_id, v_sale.id, 'free', nullif(v_input_line ->> 'purchase_id', '')::uuid, pg_catalog.btrim(v_input_line ->> 'title_snapshot'),
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

CREATE FUNCTION public.reopen_purchase_costing_with_inventory (
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
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
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
  set tax_purchase_cost = null, allocated_purchase_cost = case when source_package_line_id is null then 0 else null end,
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

COMMENT ON FUNCTION public.reopen_purchase_costing_with_inventory(uuid,uuid) IS 'Öffnet einen unverkauften finalisierten Einkauf atomar und ohne Identitätsverlust wieder.';

REVOKE ALL ON FUNCTION public.reopen_purchase_costing_with_inventory(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.reopen_purchase_costing (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb;
begin
  if not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Workspace.';
  end if;
  perform public.lock_workspace_shop(p_workspace_id);
  insert into public.shop_history_operations values(pg_catalog.txid_current(),p_workspace_id,'purchase_reopen',p_purchase_id);
  result:=public.reopen_purchase_costing_with_inventory(p_workspace_id,p_purchase_id);
  delete from public.shop_history_operations where transaction_id=pg_catalog.txid_current() and workspace_id=p_workspace_id and operation='purchase_reopen' and entity_id=p_purchase_id;
  return result;
end;
$function$;

CREATE FUNCTION public.set_workspace_shop_enabled (
  p_workspace_id     uuid,
  p_enabled          boolean,
  p_expected_version bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare state public.workspaces;
begin
  if (select auth.uid()) is null or not public.can_access_workspace(p_workspace_id) or not exists(
    select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=(select auth.uid()) and role in('owner','admin')
  ) then raise exception using errcode='42501',message='Nur Owner und Admin können die Bestandsführung ändern.'; end if;
  perform public.lock_workspace_shop(p_workspace_id);
  select * into strict state from public.workspaces where id=p_workspace_id for update;
  if p_expected_version is null or state.shop_version<>p_expected_version then
    raise exception using errcode='40001',message='Die Shop-Einstellung hat sich geändert. Bitte prüfe den aktuellen Stand.';
  end if;
  if p_enabled is null or (p_enabled and not state.shop_entitled) then
    raise exception using errcode='42501',message='Die Shop-Funktion ist für diesen Arbeitsbereich nicht freigeschaltet.';
  end if;
  update public.workspaces set shop_enabled=p_enabled where id=p_workspace_id;
  return public.get_workspace_shop_state(p_workspace_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.set_workspace_shop_enabled(uuid, boolean, bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION public.set_workspace_shop_enabled(uuid, boolean, bigint) TO authenticated;

CREATE FUNCTION public.set_workspace_shop_entitlement (
  p_workspace_id uuid,
  p_entitled     boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not public.is_platform_operator() or p_entitled is null then
    raise exception using errcode='42501',message='Die Shop-Freigabe kann nur die Plattformverwaltung ändern.';
  end if;
  perform public.lock_workspace_shop(p_workspace_id);
  update public.workspaces set shop_entitled=p_entitled where id=p_workspace_id;
  return pg_catalog.jsonb_build_object('workspace_id',p_workspace_id,'shop_entitled',p_entitled);
end;
$function$;

REVOKE ALL ON FUNCTION public.set_workspace_shop_entitlement(uuid, boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION public.set_workspace_shop_entitlement(uuid, boolean) TO authenticated;

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
  v_audit_before jsonb;
  v_audit_after jsonb;
  v_seller_details jsonb := public.normalize_purchase_seller_details(p_purchase);
  v_seller_details_before jsonb;
begin
  perform public.lock_workspace_shop(p_workspace_id);
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
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

  v_seller_details_before := public.purchase_seller_details_snapshot(v_purchase);
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

  if coalesce(
    p_purchase ->> 'pricing_mode',
    case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end
  ) = 'individual'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_lines) as line(value)
      where coalesce(nullif(line.value ->> 'price_mode', ''), 'priced') = 'open'
    ) then
    if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null') <> 'null' then
      raise exception using
        errcode = '22023',
        message = 'Ein Einkauf mit offenen Positionspreisen darf keinen Warenbetrag enthalten.';
    end if;

    if exists (
      select 1
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.purchase_id = p_purchase_id
        and (
          line.received_quantity > 0
          or exists (
            select 1
            from public.inventory_items as item
            where item.workspace_id = p_workspace_id
              and item.purchase_line_id = line.id
          )
          or exists (
            select 1
            from public.stock_lots as lot
            where lot.workspace_id = p_workspace_id
              and lot.purchase_line_id = line.id
          )
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Offene Einkaufspreise können nicht bei bereits übernommenem Bestand gespeichert werden.';
    end if;
  end if;

  for v_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  loop
    if v_line ? 'is_package' and pg_catalog.jsonb_typeof(v_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
    end if;
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
        not in ('priced', 'open', 'unpriced_mystery')
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
    elsif not (
      (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'open'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
      )
      or (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'priced'
        and pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price') = 'number'
        and pg_catalog.jsonb_typeof(v_line -> 'line_total') = 'number'
        and (v_line ->> 'unit_purchase_price')::numeric >= 0
        and (v_line ->> 'line_total')::numeric >= 0
        and pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) <= 16
        and pg_catalog.scale((v_line ->> 'line_total')::numeric) <= 2
        and (v_line ->> 'line_total')::numeric = pg_catalog.round(
          (v_line ->> 'ordered_quantity')::integer
          * (v_line ->> 'unit_purchase_price')::numeric,
          2
        )
      )
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
      set is_package = coalesce((v_line ->> 'is_package')::boolean, is_package),
          catalog_product_id = v_catalog_product_id,
          title_snapshot = pg_catalog.btrim(v_line ->> 'title_snapshot'),
          ean_snapshot = case
            when v_line ? 'ean_snapshot'
              then nullif(pg_catalog.btrim(v_line ->> 'ean_snapshot'), '')
            else v_existing_line.ean_snapshot
          end,
          position_kind = coalesce(v_line ->> 'position_kind', 'stock'),
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
        position_kind,
      is_package,
        workspace_id, purchase_id, catalog_product_id, title_snapshot,
        ean_snapshot,
        line_kind, ordered_quantity, received_quantity, unit_purchase_price,
        line_total, allocated_additional_cost, price_mode, condition_snapshot,
        estimated_market_value
      ) values (
        coalesce(v_line ->> 'position_kind', 'stock'),
      coalesce((v_line ->> 'is_package')::boolean, false),
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
      seller_type = v_seller_details ->> 'seller_type',
      seller_name = v_seller_details ->> 'seller_name',
      seller_street = v_seller_details ->> 'seller_street',
      seller_address_extra = v_seller_details ->> 'seller_address_extra',
      seller_postal_code = v_seller_details ->> 'seller_postal_code',
      seller_city = v_seller_details ->> 'seller_city',
      seller_country_code = v_seller_details ->> 'seller_country_code',
      receipt_mode = coalesce(nullif(p_purchase ->> 'receipt_mode', ''), 'external'),
      updated_at = pg_catalog.clock_timestamp()
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning * into v_purchase;

  -- Ein offener Nachtragsdialog soll einen zwischenzeitlich gespeicherten Entwurf
  -- nicht überschreiben; deshalb zählt auch dieser Weg die Version hoch.
  if public.purchase_seller_details_snapshot(v_purchase) is distinct from v_seller_details_before then
    update public.purchases
    set seller_details_version = seller_details_version + 1
    where workspace_id = p_workspace_id
      and id = p_purchase_id
    returning * into v_purchase;
  end if;

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

CREATE FUNCTION public.workspace_shop_active (
  p_workspace_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (((select auth.uid()) is not null and public.can_access_workspace(p_workspace_id))
      or ((select auth.uid()) is null and ((select auth.jwt())->>'role'='service_role' or session_user in('postgres','supabase_admin'))))
    and exists(select 1 from public.workspaces where id=p_workspace_id and shop_enabled and shop_entitled)
    and (not exists(select 1 from public.workspace_licenses where workspace_id=p_workspace_id)
      or public.workspace_access_is_valid(p_workspace_id));
$function$;

REVOKE ALL ON FUNCTION public.workspace_shop_active(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.workspace_shop_active(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.workspace_shop_active(uuid) TO service_role;

CREATE FUNCTION public.workspace_shop_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare draft record;
begin
  if (new.shop_enabled,new.shop_entitled) is not distinct from (old.shop_enabled,old.shop_entitled) then return new; end if;
  if old.shop_enabled and not new.shop_enabled then
    insert into public.shop_history_operations values(pg_catalog.txid_current(),new.id,'reservation_release',new.id);
    for draft in select id from public.ebay_sale_drafts where workspace_id=new.id and state not in('booked','linked_existing','dismissed') order by id loop
      perform public.ebay_release_sale_reservations(draft.id);
      update public.ebay_sale_drafts set requires_explicit_preparation=true,updated_at=pg_catalog.clock_timestamp() where id=draft.id;
    end loop;
    delete from public.shop_history_operations where transaction_id=pg_catalog.txid_current() and workspace_id=new.id and operation='reservation_release';
  end if;
  insert into public.business_events(workspace_id,entity_type,entity_id,event_type,actor_id,changes)
  values(new.id,'workspace',new.id,'workspace_shop_changed',(select auth.uid()),pg_catalog.jsonb_build_object(
    'shop_enabled',pg_catalog.jsonb_build_object('before',old.shop_enabled,'after',new.shop_enabled),
    'shop_entitled',pg_catalog.jsonb_build_object('before',old.shop_entitled,'after',new.shop_entitled),'version',new.shop_version));
  perform realtime.send(pg_catalog.jsonb_build_object('version',new.shop_version),'workspace_shop_changed','workspace:'||new.id::text||':shop',true);
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.workspace_shop_changed() TO authenticated;

GRANT ALL ON FUNCTION public.workspace_shop_changed() TO service_role;

CREATE TRIGGER protect_shop_catalog_media
  BEFORE INSERT OR DELETE OR UPDATE ON public.catalog_product_media
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

CREATE TRIGGER protect_shop_catalog
  BEFORE INSERT OR DELETE OR UPDATE ON public.catalog_products
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

CREATE TRIGGER protect_shop_inventory
  BEFORE INSERT OR DELETE OR UPDATE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

CREATE TRIGGER protect_shop_item_media
  BEFORE INSERT OR DELETE OR UPDATE ON public.item_media
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

ALTER TABLE public.purchase_lines
  ADD COLUMN position_kind text DEFAULT 'stock'::text NOT NULL;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT free_purchase_line_target CHECK (position_kind <> 'free'::text OR catalog_product_id IS NULL AND line_kind = 'individual'::text AND NOT is_package);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_position_kind_check CHECK (position_kind = ANY (ARRAY['stock'::text, 'free'::text]));

CREATE TRIGGER protect_free_purchase_line
  BEFORE UPDATE ON public.purchase_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_free_purchase_line();

CREATE TRIGGER protect_shop_purchase_lines
  BEFORE INSERT OR DELETE OR UPDATE ON public.purchase_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

ALTER TABLE public.sale_lines
  ADD COLUMN purchase_id uuid;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE RESTRICT;

CREATE INDEX sale_lines_purchase_idx ON public.sale_lines (purchase_id);

CREATE TRIGGER protect_sale_purchase_reference
  BEFORE INSERT OR UPDATE ON public.sale_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sale_purchase_reference();

CREATE TRIGGER protect_shop_sale_lines
  BEFORE INSERT OR DELETE OR UPDATE ON public.sale_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

CREATE TABLE public.shop_history_operations (
  transaction_id bigint NOT NULL,
  workspace_id   uuid   NOT NULL,
  operation      text   NOT NULL,
  entity_id      uuid   NOT NULL
);

COMMENT ON TABLE public.shop_history_operations IS 'Interne Transaktionsfreigabe für die Abwicklung bereits bestehender Lagerbuchungen bei pausiertem Shop.';

ALTER TABLE public.shop_history_operations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shop_history_operations
  ADD CONSTRAINT shop_history_operations_operation_check
    CHECK (operation = ANY (ARRAY['refund'::text, 'purchase_correction'::text, 'purchase_reopen'::text, 'purchase_draft_delete'::text, 'reservation_release'::text]));

ALTER TABLE public.shop_history_operations
  ADD CONSTRAINT shop_history_operations_pkey PRIMARY KEY (transaction_id, workspace_id, operation, entity_id);

ALTER TABLE public.shop_history_operations
  ADD CONSTRAINT shop_history_operations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE POLICY "shop history anon delete" ON public.shop_history_operations
  FOR DELETE
  TO anon
  USING (false);

CREATE POLICY "shop history anon insert" ON public.shop_history_operations
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "shop history anon select" ON public.shop_history_operations
  FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "shop history anon update" ON public.shop_history_operations
  FOR UPDATE
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "shop history member delete" ON public.shop_history_operations
  FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "shop history member insert" ON public.shop_history_operations
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "shop history member select" ON public.shop_history_operations
  FOR SELECT
  TO authenticated
  USING (false);

CREATE POLICY "shop history member update" ON public.shop_history_operations
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE TRIGGER protect_shop_lots
  BEFORE INSERT OR DELETE OR UPDATE ON public.stock_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

CREATE TRIGGER protect_shop_movements
  BEFORE INSERT OR DELETE OR UPDATE ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

CREATE TRIGGER protect_shop_order_items
  BEFORE INSERT OR DELETE OR UPDATE ON public.store_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

CREATE TRIGGER protect_shop_orders
  BEFORE INSERT OR DELETE OR UPDATE ON public.store_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_stock_write();

ALTER TABLE public.workspaces
  ADD COLUMN shop_enabled boolean DEFAULT false NOT NULL;

ALTER TABLE public.workspaces
  ADD COLUMN shop_entitled boolean DEFAULT true NOT NULL;

ALTER TABLE public.workspaces
  ADD COLUMN shop_version bigint DEFAULT 0 NOT NULL;

update public.workspaces set shop_enabled = true;

CREATE TRIGGER broadcast_workspace_shop_changed
  AFTER UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_shop_changed();

CREATE TRIGGER protect_workspace_shop_fields
  BEFORE INSERT OR UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_shop_fields();

CREATE OR REPLACE FUNCTION public.delete_purchase_draft(p_workspace_id uuid, p_purchase_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_purchase public.purchases;
  v_audit_before jsonb;
begin
  perform public.lock_workspace_shop(p_workspace_id);
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_purchase_id is null then
    raise exception using errcode = '22023', message = 'Der Einkauf ist ungültig.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.* into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status <> 'draft' then
    raise exception using errcode = '22023',
      message = 'Nur ein Einkaufsentwurf kann gelöscht werden.';
  end if;

  if exists (
    select 1 from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and line.received_quantity > 0
  ) or exists (
    select 1 from public.inventory_items as item
    where item.workspace_id = p_workspace_id and item.purchase_id = p_purchase_id
  ) or exists (
    select 1 from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id and lot.purchase_id = p_purchase_id
  ) or exists (
    select 1 from public.purchase_receipt_requests as request
    where request.workspace_id = p_workspace_id and request.purchase_id = p_purchase_id
  ) or exists (
    select 1 from public.purchase_package_capture_requests as request
    join public.purchase_lines as line
      on line.workspace_id = request.workspace_id and line.id = request.purchase_line_id
    where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id
  ) then
    raise exception using errcode = '22023',
      message = 'Ein Einkauf mit erfasstem Bestand kann nicht gelöscht werden.';
  end if;

  if exists (
    select 1 from public.purchase_documents as document
    where document.workspace_id = p_workspace_id and document.purchase_id = p_purchase_id
  ) then
    raise exception using errcode = '22023',
      message = 'Bitte entferne zuerst die Belege dieses Einkaufs.';
  end if;

  if exists (
    select 1 from public.record_comments as comment
    where comment.workspace_id = p_workspace_id and comment.purchase_id = p_purchase_id
  ) then
    raise exception using errcode = '22023',
      message = 'Ein Einkauf mit Kommentaren kann nicht gelöscht werden.';
  end if;

  v_audit_before := public.purchase_draft_audit_snapshot(p_workspace_id, p_purchase_id);

  insert into public.shop_history_operations values(pg_catalog.txid_current(),p_workspace_id,'purchase_draft_delete',p_purchase_id);

  delete from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id and cost.purchase_id = p_purchase_id;

  delete from public.purchase_lines as line
  where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id;

  delete from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id and purchase.id = p_purchase_id;

  insert into public.business_events (
    workspace_id, entity_type, entity_id, event_type, actor_id, changes
  ) values (
    p_workspace_id, 'purchase', p_purchase_id, 'purchase_draft_deleted', (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object('before', v_audit_before -> 'purchase', 'after', null),
      'lines', pg_catalog.jsonb_build_object('before', v_audit_before -> 'lines', 'after', null),
      'costs', pg_catalog.jsonb_build_object('before', v_audit_before -> 'costs', 'after', null)
    )
  );
  delete from public.shop_history_operations where transaction_id=pg_catalog.txid_current() and workspace_id=p_workspace_id and operation='purchase_draft_delete' and entity_id=p_purchase_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ebay_set_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_listing_id text, p_variation_id text, p_target jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_connection public.ebay_connections; v_target jsonb; v_mapping public.ebay_article_mappings;
begin
  perform public.assert_workspace_shop(p_workspace_id);
  v_connection := public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if p_listing_id is null or char_length(trim(p_listing_id)) not between 1 and 256
    or (p_variation_id is not null and char_length(trim(p_variation_id)) not between 1 and 256)
  then raise exception 'Ungültiges Inserat' using errcode = '22023'; end if;
  v_target := public.ebay_import_target(p_workspace_id,p_target);
  if v_target ? 'position_kind' then raise exception 'Dauerhafte Artikelzuordnungen benötigen einen Bestandsartikel' using errcode='22023'; end if;
  insert into public.ebay_article_mappings(workspace_id,environment,external_account_id,listing_id,variation_id,inventory_item_id,catalog_product_id,updated_by)
    values (p_workspace_id,v_connection.environment,v_connection.external_account_id,p_listing_id,p_variation_id,
      (v_target->>'inventory_item_id')::uuid,(v_target->>'catalog_product_id')::uuid,(select auth.uid()))
    on conflict (workspace_id,environment,external_account_id,listing_id,variation_id) do update
      set inventory_item_id = excluded.inventory_item_id, catalog_product_id = excluded.catalog_product_id,
        updated_by = excluded.updated_by, updated_at = clock_timestamp() returning * into v_mapping;
  return jsonb_build_object('id',v_mapping.id,'listingId',v_mapping.listing_id,'variationId',v_mapping.variation_id,'target',p_target);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ebay_remove_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_mapping_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_connection public.ebay_connections;
begin
  perform public.assert_workspace_shop(p_workspace_id);
  v_connection := public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  delete from public.ebay_article_mappings where id = p_mapping_id and workspace_id = p_workspace_id
    and environment = v_connection.environment and external_account_id = v_connection.external_account_id;
  return found;
end;
$function$;

-- Aus Schemaquelle ergänzte Medien- und Broadcast-Policies.
create policy "Mitglieder empfangen Shopänderungen" on realtime.messages for select to authenticated
using(extension='broadcast' and topic like 'workspace:%:shop' and exists(
  select 1 from public.workspace_members where user_id=(select auth.uid()) and topic='workspace:'||workspace_id::text||':shop'));
alter policy "Produktmedien aendern" on storage.objects using (((bucket_id = 'item-media'::text) AND (EXISTS ( SELECT 1
   FROM catalog_products p
  WHERE (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) AND ((p.id)::text = (storage.foldername(objects.name))[3]) AND is_catalog_product_media_path(objects.name, p.workspace_id, p.id) AND ( SELECT public.can_access_workspace(p.workspace_id) and public.workspace_shop_active(p.workspace_id) AS is_workspace_member)))))) with check (((bucket_id = 'item-media'::text) AND (EXISTS ( SELECT 1
   FROM catalog_products p
  WHERE (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) AND ((p.id)::text = (storage.foldername(objects.name))[3]) AND is_catalog_product_media_path(objects.name, p.workspace_id, p.id) AND ( SELECT public.can_access_workspace(p.workspace_id) and public.workspace_shop_active(p.workspace_id) AS is_workspace_member))))));
alter policy "Artikelmedien hochladen" on storage.objects with check (((bucket_id = 'item-media'::text) AND (split_part(name, '/'::text, 1) <> 'catalog-products'::text) AND (cardinality(storage.foldername(name)) = 1) AND (storage.filename(name) <> ''::text) AND (EXISTS ( SELECT 1
   FROM inventory_items i
  WHERE (((i.id)::text = (storage.foldername(objects.name))[1]) AND ( SELECT public.can_access_workspace(i.workspace_id) and public.workspace_shop_active(i.workspace_id) AS is_workspace_member))))));
alter policy "Produktmedien hochladen" on storage.objects with check (((bucket_id = 'item-media'::text) AND (EXISTS ( SELECT 1
   FROM catalog_products p
  WHERE (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) AND ((p.id)::text = (storage.foldername(objects.name))[3]) AND is_catalog_product_media_path(objects.name, p.workspace_id, p.id) AND ( SELECT public.can_access_workspace(p.workspace_id) and public.workspace_shop_active(p.workspace_id) AS is_workspace_member))))));
alter policy "Artikelmedien aendern" on storage.objects using (((bucket_id = 'item-media'::text) AND (split_part(name, '/'::text, 1) <> 'catalog-products'::text) AND (cardinality(storage.foldername(name)) = 1) AND (storage.filename(name) <> ''::text) AND (EXISTS ( SELECT 1
   FROM (item_media m
     JOIN inventory_items i ON ((i.id = m.inventory_item_id)))
  WHERE ((m.storage_path = objects.name) AND ((i.id)::text = (storage.foldername(objects.name))[1]) AND ( SELECT public.can_access_workspace(i.workspace_id) and public.workspace_shop_active(i.workspace_id) AS is_workspace_member)))))) with check (((bucket_id = 'item-media'::text) AND (split_part(name, '/'::text, 1) <> 'catalog-products'::text) AND (cardinality(storage.foldername(name)) = 1) AND (storage.filename(name) <> ''::text) AND (EXISTS ( SELECT 1
   FROM (item_media m
     JOIN inventory_items i ON ((i.id = m.inventory_item_id)))
  WHERE ((m.storage_path = objects.name) AND ((i.id)::text = (storage.foldername(objects.name))[1]) AND ( SELECT public.can_access_workspace(i.workspace_id) and public.workspace_shop_active(i.workspace_id) AS is_workspace_member))))));
alter policy "Artikelmedien loeschen" on storage.objects using (((bucket_id = 'item-media'::text) AND (split_part(name, '/'::text, 1) <> 'catalog-products'::text) AND (cardinality(storage.foldername(name)) = 1) AND (storage.filename(name) <> ''::text) AND (EXISTS ( SELECT 1
   FROM (item_media m
     JOIN inventory_items i ON ((i.id = m.inventory_item_id)))
  WHERE ((m.storage_path = objects.name) AND ((i.id)::text = (storage.foldername(objects.name))[1]) AND ( SELECT public.can_access_workspace(i.workspace_id) and public.workspace_shop_active(i.workspace_id) AS is_workspace_member))))));
alter policy "Produktmedien loeschen" on storage.objects using (((bucket_id = 'item-media'::text) AND (EXISTS ( SELECT 1
   FROM catalog_products p
  WHERE (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) AND ((p.id)::text = (storage.foldername(objects.name))[3]) AND is_catalog_product_media_path(objects.name, p.workspace_id, p.id) AND ( SELECT public.can_access_workspace(p.workspace_id) and public.workspace_shop_active(p.workspace_id) AS is_workspace_member))))));
-- Aus lokalem Katalog erzeugte endgültige Funktionsrechte.
revoke all on function public.add_purchase_lines(p_workspace_id uuid, p_purchase_id uuid, p_lines jsonb) from public,anon,authenticated,service_role;
revoke all on function public.assert_workspace_shop(p_workspace_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.build_purchase_costing_plan(p_workspace_id uuid, p_purchase_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.capture_purchase_package_contents(p_workspace_id uuid, p_purchase_line_id uuid, p_items jsonb, p_request_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.correct_purchase_costing(p_workspace_id uuid, p_purchase_id uuid, p_reason text, p_purchase_price numeric, p_lines jsonb, p_costs jsonb) from public,anon,authenticated,service_role;
revoke all on function public.correct_purchase_costing_with_inventory(p_workspace_id uuid, p_purchase_id uuid, p_reason text, p_purchase_price numeric, p_lines jsonb, p_costs jsonb) from public,anon,authenticated,service_role;
revoke all on function public.create_purchase(p_workspace_id uuid, p_purchase jsonb, p_expenses jsonb, p_lines jsonb) from public,anon,authenticated,service_role;
revoke all on function public.delete_purchase_draft(p_workspace_id uuid, p_purchase_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.ebay_import_target(p_workspace_id uuid, p_target jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ebay_prepare_sale_draft(p_cache_id bigint, p_assignments jsonb, p_costs jsonb, p_explicit boolean) from public,anon,authenticated,service_role;
revoke all on function public.ebay_record_order_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ebay_remove_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_mapping_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.ebay_set_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_listing_id text, p_variation_id text, p_target jsonb) from public,anon,authenticated,service_role;
revoke all on function public.finalize_purchase_costing(p_workspace_id uuid, p_purchase_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_purchase_sale_history_state(p_workspace_id uuid, p_purchase_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_workspace_shop_state(p_workspace_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.guard_free_purchase_line() from public,anon,authenticated,service_role;
revoke all on function public.guard_sale_purchase_reference() from public,anon,authenticated,service_role;
revoke all on function public.guard_workspace_shop_fields() from public,anon,authenticated,service_role;
revoke all on function public.guard_workspace_stock_write() from public,anon,authenticated,service_role;
revoke all on function public.lock_workspace_shop(p_workspace_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.receive_individual_purchase_line(p_workspace_id uuid, p_purchase_id uuid, p_purchase_line_id uuid, p_item jsonb) from public,anon,authenticated,service_role;
revoke all on function public.receive_purchase_lines(p_workspace_id uuid, p_purchase_id uuid, p_lines jsonb) from public,anon,authenticated,service_role;
revoke all on function public.receive_purchase_lines_idempotent(p_workspace_id uuid, p_purchase_id uuid, p_request_id uuid, p_lines jsonb) from public,anon,authenticated,service_role;
revoke all on function public.record_sale(p_workspace_id uuid, p_sale jsonb, p_lines jsonb) from public,anon,authenticated,service_role;
revoke all on function public.record_sale_return(p_workspace_id uuid, p_sale_id uuid, p_refund_amount numeric, p_restock boolean, p_reason text, p_notes text, p_restock_action text, p_buyer_name text) from public,anon,authenticated,service_role;
revoke all on function public.record_sale_return_with_inventory(p_workspace_id uuid, p_sale_id uuid, p_refund_amount numeric, p_restock boolean, p_reason text, p_notes text, p_restock_action text, p_buyer_name text) from public,anon,authenticated,service_role;
revoke all on function public.reopen_purchase_costing(p_workspace_id uuid, p_purchase_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.reopen_purchase_costing_with_inventory(p_workspace_id uuid, p_purchase_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.set_workspace_shop_enabled(p_workspace_id uuid, p_enabled boolean, p_expected_version bigint) from public,anon,authenticated,service_role;
revoke all on function public.set_workspace_shop_entitlement(p_workspace_id uuid, p_entitled boolean) from public,anon,authenticated,service_role;
revoke all on function public.update_purchase_draft(p_workspace_id uuid, p_purchase_id uuid, p_purchase jsonb, p_expenses jsonb, p_lines jsonb) from public,anon,authenticated,service_role;
revoke all on function public.workspace_shop_active(p_workspace_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.workspace_shop_changed() from public,anon,authenticated,service_role;
grant EXECUTE on function public.add_purchase_lines(p_workspace_id uuid, p_purchase_id uuid, p_lines jsonb) to authenticated;
grant EXECUTE on function public.assert_workspace_shop(p_workspace_id uuid) to authenticated;
grant EXECUTE on function public.assert_workspace_shop(p_workspace_id uuid) to service_role;
grant EXECUTE on function public.capture_purchase_package_contents(p_workspace_id uuid, p_purchase_line_id uuid, p_items jsonb, p_request_id uuid) to authenticated;
grant EXECUTE on function public.capture_purchase_package_contents(p_workspace_id uuid, p_purchase_line_id uuid, p_items jsonb, p_request_id uuid) to service_role;
grant EXECUTE on function public.correct_purchase_costing(p_workspace_id uuid, p_purchase_id uuid, p_reason text, p_purchase_price numeric, p_lines jsonb, p_costs jsonb) to authenticated;
grant EXECUTE on function public.create_purchase(p_workspace_id uuid, p_purchase jsonb, p_expenses jsonb, p_lines jsonb) to authenticated;
grant EXECUTE on function public.delete_purchase_draft(p_workspace_id uuid, p_purchase_id uuid) to authenticated;
grant EXECUTE on function public.ebay_import_target(p_workspace_id uuid, p_target jsonb) to service_role;
grant EXECUTE on function public.ebay_prepare_sale_draft(p_cache_id bigint, p_assignments jsonb, p_costs jsonb, p_explicit boolean) to service_role;
grant EXECUTE on function public.ebay_record_order_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb) to authenticated;
grant EXECUTE on function public.ebay_remove_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_mapping_id uuid) to authenticated;
grant EXECUTE on function public.ebay_set_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_listing_id text, p_variation_id text, p_target jsonb) to authenticated;
grant EXECUTE on function public.finalize_purchase_costing(p_workspace_id uuid, p_purchase_id uuid) to authenticated;
grant EXECUTE on function public.get_purchase_sale_history_state(p_workspace_id uuid, p_purchase_id uuid) to authenticated;
grant EXECUTE on function public.get_workspace_shop_state(p_workspace_id uuid) to authenticated;
grant EXECUTE on function public.lock_workspace_shop(p_workspace_id uuid) to authenticated;
grant EXECUTE on function public.lock_workspace_shop(p_workspace_id uuid) to service_role;
grant EXECUTE on function public.receive_individual_purchase_line(p_workspace_id uuid, p_purchase_id uuid, p_purchase_line_id uuid, p_item jsonb) to authenticated;
grant EXECUTE on function public.receive_purchase_lines(p_workspace_id uuid, p_purchase_id uuid, p_lines jsonb) to authenticated;
grant EXECUTE on function public.receive_purchase_lines_idempotent(p_workspace_id uuid, p_purchase_id uuid, p_request_id uuid, p_lines jsonb) to authenticated;
grant EXECUTE on function public.record_sale(p_workspace_id uuid, p_sale jsonb, p_lines jsonb) to authenticated;
grant EXECUTE on function public.record_sale_return(p_workspace_id uuid, p_sale_id uuid, p_refund_amount numeric, p_restock boolean, p_reason text, p_notes text, p_restock_action text, p_buyer_name text) to authenticated;
grant EXECUTE on function public.reopen_purchase_costing(p_workspace_id uuid, p_purchase_id uuid) to authenticated;
grant EXECUTE on function public.set_workspace_shop_enabled(p_workspace_id uuid, p_enabled boolean, p_expected_version bigint) to authenticated;
grant EXECUTE on function public.set_workspace_shop_entitlement(p_workspace_id uuid, p_entitled boolean) to authenticated;
grant EXECUTE on function public.update_purchase_draft(p_workspace_id uuid, p_purchase_id uuid, p_purchase jsonb, p_expenses jsonb, p_lines jsonb) to authenticated;
grant EXECUTE on function public.workspace_shop_active(p_workspace_id uuid) to authenticated;
grant EXECUTE on function public.workspace_shop_active(p_workspace_id uuid) to service_role;

revoke all on public.shop_history_operations from public,anon,authenticated,service_role;
