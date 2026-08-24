-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

COMMENT ON COLUMN public.sales.returned_at IS NULL;

COMMENT ON COLUMN public.sales.refund_amount IS NULL;

COMMENT ON COLUMN public.suppliers.is_active IS NULL;

DROP INDEX public.idx_sources_is_active;

DROP INDEX public.idx_suppliers_is_active;

CREATE FUNCTION public.bundle_shipping_orders (
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
    min(sale_id)
  into v_found_count, v_snapshot, v_non_null_sale_count, v_distinct_sale_count, v_sale_id
  from source_orders;

  if v_found_count <> cardinality(p_order_ids) then
    raise exception using errcode = 'PGRST116', message = 'Mindestens eine Sendung wurde nicht gefunden.';
  end if;

  if v_non_null_sale_count <> v_found_count or v_distinct_sale_count <> 1 then
    v_sale_id := null;
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

REVOKE ALL ON FUNCTION public.bundle_shipping_orders(uuid, uuid[], text, date, text, text, text, text, numeric, jsonb, text, text, text[], text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.bundle_shipping_orders(uuid, uuid[], text, date, text, text, text, text, numeric, jsonb, text, text, text[], text) TO authenticated;

CREATE FUNCTION public.unbundle_shipping_order (
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
    raise exception using errcode = 'PGRST116', message = 'Das Sammelpaket wurde nicht gefunden.';
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

REVOKE ALL ON FUNCTION public.unbundle_shipping_order(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.unbundle_shipping_order(uuid, uuid) TO authenticated;

ALTER TABLE public.shipping_orders
  ADD COLUMN bundled_orders_snapshot jsonb;

COMMENT ON COLUMN public.shipping_orders.bundled_orders_snapshot IS 'Atomarer Snapshot der ursprünglichen Sendungen eines Sammelpakets für dessen Wiederherstellung.';