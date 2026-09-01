-- Purpose: append a dedicated audit event for controlled legacy purchase-cost migration.
-- Affected: public.migrate_purchase_costing_legacy(uuid, boolean), public.business_events.
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
  v_lines jsonb;
  v_costs jsonb;
  v_correction_result jsonb;
  v_correction_event_id uuid;
  v_correlation_id uuid;
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

    select public.correct_purchase_costing(
      p_workspace_id,
      v_candidate.purchase_id,
      'Kontrollierte Übernahme historischer Mystery-Einkaufskosten.',
      v_purchase.purchase_price,
      v_lines,
      v_costs
    ) into v_correction_result;

    v_correction_event_id := (v_correction_result ->> 'eventId')::uuid;

    select event.correlation_id
    into strict v_correlation_id
    from public.business_events as event
    where event.workspace_id = p_workspace_id
      and event.id = v_correction_event_id;

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
            'correction_event_id', v_correction_event_id,
            'item_count', v_candidate.item_count
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
