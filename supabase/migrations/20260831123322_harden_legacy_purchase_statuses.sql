-- Purpose: preserve safe legacy item states and make rest-cent allocation deterministic.
-- Affected: legacy purchase-cost preview and migration functions, inventory item costs.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.migrate_purchase_costing_legacy (
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
        v_line_created_at + (v_line_position * interval '1 microsecond'),
        v_line_created_at + (v_line_position * interval '1 microsecond'),
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
