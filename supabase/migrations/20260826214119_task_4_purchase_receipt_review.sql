-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_line_total_check;

ALTER TABLE public.purchase_lines
  ALTER COLUMN line_total TYPE numeric USING line_total::numeric;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_unit_purchase_price_check;

ALTER TABLE public.purchase_lines
  ALTER COLUMN unit_purchase_price TYPE numeric USING unit_purchase_price::numeric;

CREATE FUNCTION public.receive_individual_purchase_line (
  p_workspace_id     uuid,
  p_purchase_id      uuid,
  p_purchase_line_id uuid,
  p_item             jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_purchase public.purchases;
  v_purchase_line public.purchase_lines;
  v_inventory_item public.inventory_items;
  v_title text;
  v_condition text;
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

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
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
    p_workspace_id, p_purchase_id, p_purchase_line_id, v_title, v_condition, 'received', v_purchase_line.line_total
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

REVOKE ALL ON FUNCTION public.receive_individual_purchase_line(uuid, uuid, uuid, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.receive_individual_purchase_line(uuid, uuid, uuid, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.receive_individual_purchase_line(uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.receive_purchase_lines (
  p_workspace_id uuid,
  p_purchase_id  uuid,
  p_lines        jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
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

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
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
      v_purchase_line.unit_purchase_price,
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

CREATE FUNCTION public.refresh_purchase_receiving_status (
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

GRANT ALL ON FUNCTION public.refresh_purchase_receiving_status(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.refresh_purchase_receiving_status(uuid, uuid) TO service_role;

CREATE FUNCTION public.sync_purchase_receiving_status()
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

GRANT ALL ON FUNCTION public.sync_purchase_receiving_status() TO authenticated;

GRANT ALL ON FUNCTION public.sync_purchase_receiving_status() TO service_role;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_check2 CHECK (line_total = round(ordered_quantity::numeric * unit_purchase_price, 2));

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_line_total_check CHECK (line_total >= 0::numeric AND scale(line_total) <= 2);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_unit_purchase_price_check CHECK (unit_purchase_price >= 0::numeric AND scale(unit_purchase_price) <= 2);

CREATE TRIGGER purchase_lines_sync_receiving_status
  AFTER INSERT OR DELETE OR UPDATE OF ordered_quantity, received_quantity ON public.purchase_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_purchase_receiving_status();