-- Exposes immutable purchase sale history for authoritative lifecycle actions.
-- Keeps reopening decisions aligned between the database and purchase detail UI.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.has_purchase_recorded_sales (
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

  return exists (
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
      on linked_line.workspace_id = lot.workspace_id
      and linked_line.id = lot.purchase_line_id
    where allocation.workspace_id = p_workspace_id
      and (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
  );
end;
$function$;

COMMENT ON FUNCTION public.has_purchase_recorded_sales(uuid,uuid) IS 'Prüft unveränderliche Einzel- und Mengenverkaufsbelege eines Einkaufs.';

revoke execute on function public.has_purchase_recorded_sales(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.has_purchase_recorded_sales(uuid, uuid)
  to authenticated;

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

  if public.has_purchase_recorded_sales(p_workspace_id, p_purchase_id) then
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

revoke execute on function public.update_purchase_draft(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_purchase_draft(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated;
