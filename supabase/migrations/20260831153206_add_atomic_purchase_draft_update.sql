-- Add the atomic update boundary for non-finalized purchase drafts.
-- Preserves received inventory identities and replaces header, lines and costs transactionally.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.update_purchase_draft (
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
    or pg_catalog.jsonb_typeof(p_lines) <> 'array'
    or nullif(pg_catalog.btrim(p_purchase ->> 'title'), '') is null then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
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

    if v_purchase_type = 'mystery_pack' then
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
        line_kind, ordered_quantity, received_quantity, unit_purchase_price,
        line_total, allocated_additional_cost, price_mode, condition_snapshot,
        estimated_market_value
      ) values (
        p_workspace_id,
        p_purchase_id,
        v_catalog_product_id,
        pg_catalog.btrim(v_line ->> 'title_snapshot'),
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
  set source_id = nullif(p_purchase ->> 'source_id', '')::uuid,
      supplier_id = nullif(p_purchase ->> 'supplier_id', '')::uuid,
      type = v_purchase_type,
      title = pg_catalog.btrim(p_purchase ->> 'title'),
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

revoke execute on function public.update_purchase_draft(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_purchase_draft(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated;
