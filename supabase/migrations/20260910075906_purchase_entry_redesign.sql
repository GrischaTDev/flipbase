-- Vereinfacht Verkäuferkontakte, Paketpreise, Einkaufsstatus und Chronik.
-- Betroffen: suppliers, catalog_products, purchases, purchase_lines,
-- business_events sowie die zugehörigen RPC-Funktionen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_unit_purchase_price_check;

CREATE FUNCTION public.create_purchase_with_position_prices (
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
  v_requires_restore boolean;
  v_legacy_lines jsonb;
  v_base_purchase jsonb;
  v_result jsonb;
  v_purchase_id uuid;
  v_restored_lines jsonb;
  v_purchase jsonb;
  v_supplier_id uuid;
begin
  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'supplier_id'), 'null')
      not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '') is not null
      and (p_purchase ->> 'supplier_id') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Verkäufer gehört nicht zu diesem Workspace.';
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
      message = 'Der Verkäufer gehört nicht zu diesem Workspace.';
  end if;

  -- Die bestehende Erstellfunktion enthält für supplier_id noch eine zu kurze
  -- UUID-Prüfung. Der Wrapper prüft den Verkäufer korrekt und setzt ihn nach
  -- dem atomaren Basisschritt, bis die Alt-Funktion vollständig abgelöst wird.
  v_base_purchase := p_purchase || pg_catalog.jsonb_build_object('supplier_id', null);

  select coalesce(pg_catalog.bool_or(
    element.value ->> 'price_mode' = 'priced'
      and pg_catalog.jsonb_typeof(element.value -> 'unit_purchase_price') = 'number'
      and pg_catalog.scale((element.value ->> 'unit_purchase_price')::numeric) > 2
  ), false)
  into v_requires_restore
  from pg_catalog.jsonb_array_elements(p_lines) as element(value);

  if v_requires_restore then
    select coalesce(pg_catalog.jsonb_agg(
      element.value || pg_catalog.jsonb_build_object(
        'price_mode', 'unpriced_mystery',
        'unit_purchase_price', null,
        'line_total', null
      ) order by element.ordinality
    ), '[]'::jsonb)
    into v_legacy_lines
    from pg_catalog.jsonb_array_elements(p_lines)
      with ordinality as element(value, ordinality);

    v_result := public.create_purchase(
      p_workspace_id,
      v_base_purchase || pg_catalog.jsonb_build_object('pricing_mode', 'total'),
      p_expenses,
      v_legacy_lines
    );
    v_purchase_id := (v_result -> 'purchase' ->> 'id')::uuid;
    v_restored_lines := public.restore_purchase_position_prices(
      p_workspace_id,
      v_purchase_id,
      p_lines,
      v_result -> 'purchase_lines'
    );
    v_result := v_result
      || pg_catalog.jsonb_build_object('purchase_lines', v_restored_lines);
  else
    v_result := public.create_purchase(
      p_workspace_id,
      v_base_purchase,
      p_expenses,
      p_lines
    );
    v_purchase_id := (v_result -> 'purchase' ->> 'id')::uuid;
  end if;

  -- Bei einer Wiederholung mit derselben request_id bleibt der ursprünglich
  -- gespeicherte Verkäufer unverändert.
  update public.purchases
  set supplier_id = v_supplier_id,
      updated_at = statement_timestamp()
  where id = v_purchase_id
    and supplier_id is null
    and v_supplier_id is not null;

  select pg_catalog.to_jsonb(purchase)
  into v_purchase
  from public.purchases as purchase
  where purchase.id = v_purchase_id;

  return v_result
    || pg_catalog.jsonb_build_object('purchase', v_purchase);
end;
$function$;

COMMENT ON FUNCTION public.create_purchase_with_position_prices(uuid,jsonb,jsonb,jsonb) IS 'Erstellt Einkäufe und bewahrt centgenaue Positionssummen mit präzisem Stückdurchschnitt.';

REVOKE ALL ON FUNCTION public.create_purchase_with_position_prices(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_purchase_with_position_prices(uuid, jsonb, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.export_audit_snapshot (
  p_workspace_id uuid,
  p_filter       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_table text;
  v_rows jsonb;
  v_count bigint;
  v_total bigint := 0;
  v_result jsonb := jsonb_build_object(
    'captured_at', statement_timestamp(),
    'snapshot', pg_current_snapshot()::text
  );
begin
  if v_actor_id is null or not exists (
    select 1 from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.user_id = v_actor_id
      and member.role in ('owner', 'admin', 'accountant')
  ) then
    raise exception using errcode = '42501', message = 'Keine Berechtigung für das Prüfarchiv.';
  end if;
  if p_filter is null or jsonb_typeof(p_filter) <> 'object' then
    raise exception using errcode = '22023', message = 'Der Archivfilter muss ein JSON-Objekt sein.';
  end if;

  -- STABLE hält auch diese einzelnen SELECTs im Snapshot des RPC-Aufrufs.
  -- Die Tabellenliste ist geschlossen; keine Bezeichner aus Client-Eingaben.
  foreach v_table in array array[
    'suppliers', 'catalog_products',
    'purchases', 'purchase_lines', 'purchase_costs', 'inventory_items',
    'stock_lots', 'stock_movements', 'sales', 'sale_lines',
    'sale_cost_entries', 'sale_line_lot_allocations', 'returns',
    'inventory_reconciliation_events', 'invoices', 'invoice_items',
    'item_costs', 'business_events'
  ] loop
    if v_table = 'item_costs' then
      select count(*) into v_count from public.item_costs as cost
        join public.inventory_items as item on item.id = cost.inventory_item_id
        where item.workspace_id = p_workspace_id;
    elsif v_table = 'invoice_items' then
      select count(*) into v_count from public.invoice_items as item
        join public.invoices as invoice on invoice.id = item.invoice_id
        where invoice.workspace_id = p_workspace_id;
    else
      execute format('select count(*) from public.%I where workspace_id = $1', v_table)
        into v_count using p_workspace_id;
    end if;
    v_total := v_total + v_count;
    if v_total > 100000 then
      raise exception using errcode = '54000', message = 'Das Prüfarchiv überschreitet 100000 Datensätze. Es wurde kein Teilarchiv erstellt.';
    end if;

    if v_table = 'item_costs' then
      select coalesce(jsonb_agg(to_jsonb(cost) order by cost.id), '[]'::jsonb)
        into v_rows from public.item_costs as cost
        join public.inventory_items as item on item.id = cost.inventory_item_id
        where item.workspace_id = p_workspace_id;
    elsif v_table = 'invoice_items' then
      select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
        into v_rows from public.invoice_items as item
        join public.invoices as invoice on invoice.id = item.invoice_id
        where invoice.workspace_id = p_workspace_id;
    elsif v_table = 'business_events' then
      select coalesce(jsonb_agg(to_jsonb(event) order by event.created_at, event.id), '[]'::jsonb)
        into v_rows from public.business_events as event
        where event.workspace_id = p_workspace_id
          and (p_filter ->> 'entity_type' is null or event.entity_type = p_filter ->> 'entity_type')
          and (p_filter ->> 'entity_id' is null or event.entity_id = (p_filter ->> 'entity_id')::uuid)
          and (p_filter ->> 'event_type' is null or event.event_type = p_filter ->> 'event_type')
          and (p_filter ->> 'actor_id' is null or event.actor_id = (p_filter ->> 'actor_id')::uuid)
          and (p_filter ->> 'from' is null or event.created_at >= (p_filter ->> 'from')::timestamptz)
          and (p_filter ->> 'to' is null or event.created_at <= (p_filter ->> 'to')::timestamptz);
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(entry) order by entry.id), ''[]''::jsonb) from public.%I as entry where workspace_id = $1', v_table)
        into v_rows using p_workspace_id;
    end if;
    v_result := v_result || jsonb_build_object(v_table, v_rows);
    if octet_length(v_result::text) > 52428800 then
      raise exception using errcode = '54000', message = 'Das Prüfarchiv überschreitet 50 MiB. Es wurde kein Teilarchiv erstellt.';
    end if;
  end loop;
  return v_result;
end;
$function$;

CREATE FUNCTION public.restore_purchase_position_prices (
  p_workspace_id    uuid,
  p_purchase_id     uuid,
  p_original_lines  jsonb,
  p_persisted_lines jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_index integer;
  v_original jsonb;
  v_persisted jsonb;
  v_line_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_line_total numeric;
  v_mode text;
  v_total_expense_cents bigint;
begin
  if pg_catalog.jsonb_typeof(p_original_lines) <> 'array'
    or pg_catalog.jsonb_typeof(p_persisted_lines) <> 'array'
    or pg_catalog.jsonb_array_length(p_original_lines)
      <> pg_catalog.jsonb_array_length(p_persisted_lines) then
    raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind unvollständig.';
  end if;

  for v_index in 0..pg_catalog.jsonb_array_length(p_original_lines) - 1 loop
    v_original := p_original_lines -> v_index;
    v_persisted := p_persisted_lines -> v_index;
    if coalesce(v_original ->> 'price_mode', 'priced') <> 'priced' then
      continue;
    end if;
    if pg_catalog.jsonb_typeof(v_original -> 'ordered_quantity') <> 'number'
      or pg_catalog.jsonb_typeof(v_original -> 'unit_purchase_price') <> 'number'
      or pg_catalog.jsonb_typeof(v_original -> 'line_total') <> 'number' then
      raise exception using errcode = '22023', message = 'Die Positionspreise sind ungültig.';
    end if;

    v_line_id := (v_persisted ->> 'id')::uuid;
    v_quantity := (v_original ->> 'ordered_quantity')::integer;
    v_unit_price := (v_original ->> 'unit_purchase_price')::numeric;
    v_line_total := (v_original ->> 'line_total')::numeric;
    if v_quantity < 1
      or v_unit_price < 0
      or v_line_total < 0
      or pg_catalog.scale(v_unit_price) > 16
      or pg_catalog.scale(v_line_total) > 2
      or pg_catalog.abs(v_unit_price * v_quantity - v_line_total) > 0.00000001 then
      raise exception using errcode = '22023', message = 'Die Positionspreise sind ungültig.';
    end if;

    update public.purchase_lines
    set price_mode = 'priced',
        unit_purchase_price = v_unit_price,
        line_total = v_line_total,
        updated_at = pg_catalog.clock_timestamp()
    where id = v_line_id
      and workspace_id = p_workspace_id
      and purchase_id = p_purchase_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Die Einkaufsposition wurde nicht gefunden.';
    end if;
  end loop;

  update public.purchases
  set pricing_mode = 'individual'
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning cost_allocation_mode into v_mode;

  select coalesce(pg_catalog.round(pg_catalog.sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  if v_mode <> 'manual' and v_total_expense_cents > 0 then
    with positions as (
      select
        line.id,
        persisted.ordinality,
        case
          when v_mode = 'value_weighted' and totals.value_total > 0 then line.line_total
          else line.ordered_quantity::numeric
        end as weight
      from pg_catalog.jsonb_array_elements(p_persisted_lines)
        with ordinality as persisted(value, ordinality)
      join public.purchase_lines as line
        on line.id = (persisted.value ->> 'id')::uuid
      cross join (
        select pg_catalog.sum(candidate.line_total) as value_total
        from public.purchase_lines as candidate
        where candidate.workspace_id = p_workspace_id
          and candidate.purchase_id = p_purchase_id
      ) as totals
    ), shares as (
      select
        positions.*,
        v_total_expense_cents::numeric * weight
          / nullif(pg_catalog.sum(weight) over (), 0) as exact_cents
      from positions
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

  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) order by persisted.ordinality)
    from pg_catalog.jsonb_array_elements(p_persisted_lines)
      with ordinality as persisted(value, ordinality)
    join public.purchase_lines as line
      on line.id = (persisted.value ->> 'id')::uuid
  ), '[]'::jsonb);
end;
$function$;

REVOKE ALL ON FUNCTION public.restore_purchase_position_prices(uuid, uuid, jsonb, jsonb) FROM PUBLIC;

CREATE FUNCTION public.update_purchase_draft_with_event (
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
  v_actor_id uuid := (select auth.uid());
  v_before public.purchases%rowtype;
  v_result jsonb;
  v_after jsonb;
  v_event_id uuid;
  v_before_line_count bigint;
  v_before_expense_count bigint;
  v_requires_restore boolean;
  v_legacy_lines jsonb;
  v_restored_lines jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich.';
  end if;

  select purchase.*
  into v_before
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found or not public.is_workspace_member(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Einkauf.';
  end if;

  select pg_catalog.count(*)
  into v_before_line_count
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select pg_catalog.count(*)
  into v_before_expense_count
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.bool_or(
    element.value ->> 'price_mode' = 'priced'
      and pg_catalog.jsonb_typeof(element.value -> 'unit_purchase_price') = 'number'
      and pg_catalog.scale((element.value ->> 'unit_purchase_price')::numeric) > 2
  ), false)
  into v_requires_restore
  from pg_catalog.jsonb_array_elements(p_lines) as element(value);

  if v_requires_restore then
    select coalesce(pg_catalog.jsonb_agg(
      element.value || pg_catalog.jsonb_build_object(
        'price_mode', 'unpriced_mystery',
        'unit_purchase_price', null,
        'line_total', null
      ) order by element.ordinality
    ), '[]'::jsonb)
    into v_legacy_lines
    from pg_catalog.jsonb_array_elements(p_lines) with ordinality as element(value, ordinality);
    v_result := public.update_purchase_draft(
      p_workspace_id,
      p_purchase_id,
      p_purchase || pg_catalog.jsonb_build_object('pricing_mode', 'total'),
      p_expenses,
      v_legacy_lines
    );
    v_restored_lines := public.restore_purchase_position_prices(
      p_workspace_id,
      p_purchase_id,
      p_lines,
      v_result -> 'purchase_lines'
    );
    select pg_catalog.to_jsonb(purchase)
    into v_after
    from public.purchases as purchase
    where purchase.id = p_purchase_id;
    v_result := v_result
      || pg_catalog.jsonb_build_object('purchase', v_after)
      || pg_catalog.jsonb_build_object('purchase_lines', v_restored_lines);
  else
    v_result := public.update_purchase_draft(
      p_workspace_id,
      p_purchase_id,
      p_purchase,
      p_expenses,
      p_lines
    );
  end if;
  v_after := v_result -> 'purchase';

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
    'purchase_updated',
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'title', pg_catalog.jsonb_build_object(
        'before', v_before.title,
        'after', v_after ->> 'title'
      ),
      'supplier_id', pg_catalog.jsonb_build_object(
        'before', v_before.supplier_id,
        'after', v_after ->> 'supplier_id'
      ),
      'purchase_date', pg_catalog.jsonb_build_object(
        'before', v_before.purchase_date,
        'after', v_after ->> 'purchase_date'
      ),
      'purchase_price', pg_catalog.jsonb_build_object(
        'before', v_before.purchase_price,
        'after', v_after -> 'purchase_price'
      ),
      'line_count', pg_catalog.jsonb_build_object(
        'before', v_before_line_count,
        'after', pg_catalog.jsonb_array_length(p_lines)
      ),
      'expense_count', pg_catalog.jsonb_build_object(
        'before', v_before_expense_count,
        'after', pg_catalog.jsonb_array_length(p_expenses)
      )
    )
  ) returning id into v_event_id;

  return v_result || pg_catalog.jsonb_build_object('eventId', v_event_id);
end;
$function$;

COMMENT ON FUNCTION public.update_purchase_draft_with_event(uuid,uuid,jsonb,jsonb,jsonb) IS 'Speichert einen Einkaufsentwurf und dessen Fachereignis atomar.';

REVOKE ALL ON FUNCTION public.update_purchase_draft_with_event(uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.update_purchase_draft_with_event(uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;

CREATE FUNCTION public.update_purchase_tracking (
  p_purchase_id      uuid,
  p_tracking_number  text,
  p_tracking_carrier text,
  p_tracking_status  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_before public.purchases%rowtype;
  v_after public.purchases%rowtype;
  v_number text := nullif(pg_catalog.btrim(p_tracking_number), '');
  v_carrier text := nullif(pg_catalog.btrim(p_tracking_carrier), '');
  v_status text := coalesce(nullif(pg_catalog.btrim(p_tracking_status), ''), 'pending');
  v_event_id uuid;
  v_event_type text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich.';
  end if;
  if v_status not in ('pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception') then
    raise exception using errcode = '22023', message = 'Unbekannter Trackingstatus.';
  end if;
  if v_number is not null and v_carrier is null then
    raise exception using errcode = '22023', message = 'Zum Tracking wird ein Dienstleister benötigt.';
  end if;

  select purchase.*
  into v_before
  from public.purchases as purchase
  where purchase.id = p_purchase_id
  for update;

  if not found or not public.is_workspace_member(v_before.workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Einkauf.';
  end if;

  if v_number is null then
    v_carrier := null;
    v_status := 'pending';
  end if;

  if v_before.tracking_number is not distinct from v_number
    and v_before.tracking_carrier is not distinct from v_carrier
    and v_before.tracking_status is not distinct from v_status then
    return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_before), 'eventId', null);
  end if;

  v_event_type := case
    when v_before.tracking_number is null and v_number is not null then 'purchase_tracking_added'
    when v_before.tracking_number is not null and v_number is null then 'purchase_tracking_removed'
    else 'purchase_tracking_updated'
  end;

  update public.purchases
  set tracking_number = v_number,
      tracking_carrier = v_carrier,
      tracking_status = v_status,
      updated_at = statement_timestamp()
  where id = p_purchase_id
  returning * into v_after;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    v_before.workspace_id,
    'purchase',
    p_purchase_id,
    v_event_type,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'tracking_number', pg_catalog.jsonb_build_object(
        'before', v_before.tracking_number,
        'after', v_after.tracking_number
      ),
      'tracking_carrier', pg_catalog.jsonb_build_object(
        'before', v_before.tracking_carrier,
        'after', v_after.tracking_carrier
      ),
      'tracking_status', pg_catalog.jsonb_build_object(
        'before', v_before.tracking_status,
        'after', v_after.tracking_status
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_after), 'eventId', v_event_id);
end;
$function$;

COMMENT ON FUNCTION public.update_purchase_tracking(uuid,text,text,text) IS 'Ändert freiwilliges Tracking samt unveränderlichem Fachereignis atomar.';

REVOKE ALL ON FUNCTION public.update_purchase_tracking(uuid, text, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.update_purchase_tracking(uuid, text, text, text) TO authenticated;

CREATE FUNCTION public.update_purchase_workflow (
  p_purchase_id uuid,
  p_status      text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_before public.purchases%rowtype;
  v_after public.purchases%rowtype;
  v_event_id uuid;
  v_event_type text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich.';
  end if;
  if p_status not in ('ordered', 'arrived') then
    raise exception using errcode = '22023', message = 'Unbekannter Einkaufsstatus.';
  end if;

  select purchase.*
  into v_before
  from public.purchases as purchase
  where purchase.id = p_purchase_id
  for update;

  if not found or not public.is_workspace_member(v_before.workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Einkauf.';
  end if;

  if p_status = 'ordered' then
    if v_before.receiving_status = 'ordered' and v_before.shipment_status = 'not_shipped' then
      return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_before), 'eventId', null);
    end if;
    if v_before.receiving_status <> 'draft' then
      raise exception using errcode = '22023', message = 'Nur ein Entwurf kann bestellt werden.';
    end if;
    update public.purchases
    set receiving_status = 'ordered',
        shipment_status = 'not_shipped',
        arrived_at = null,
        updated_at = statement_timestamp()
    where id = p_purchase_id
    returning * into v_after;
    v_event_type := 'purchase_ordered';
  else
    if v_before.receiving_status = 'received' and v_before.arrived_at is not null then
      return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_before), 'eventId', null);
    end if;
    if v_before.receiving_status <> 'ordered' then
      raise exception using errcode = '22023', message = 'Nur ein bestellter Einkauf kann ankommen.';
    end if;
    update public.purchases
    set receiving_status = 'received',
        shipment_status = 'arrived',
        arrived_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where id = p_purchase_id
    returning * into v_after;
    v_event_type := 'purchase_arrived';
  end if;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    v_before.workspace_id,
    'purchase',
    p_purchase_id,
    v_event_type,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'receiving_status', pg_catalog.jsonb_build_object(
        'before', v_before.receiving_status,
        'after', v_after.receiving_status
      ),
      'arrived_at', pg_catalog.jsonb_build_object(
        'before', v_before.arrived_at,
        'after', v_after.arrived_at
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_after), 'eventId', v_event_id);
end;
$function$;

COMMENT ON FUNCTION public.update_purchase_workflow(uuid,text) IS 'Ändert Bestellt oder Angekommen samt unveränderlichem Fachereignis atomar.';

REVOKE ALL ON FUNCTION public.update_purchase_workflow(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.update_purchase_workflow(uuid, text) TO authenticated;

ALTER TABLE public.catalog_products
  ADD COLUMN image_storage_path text;

COMMENT ON COLUMN public.catalog_products.image_storage_path IS 'Pfad des optionalen Produktbilds im privaten item-media-Bucket.';

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_unit_purchase_price_check
    CHECK (unit_purchase_price IS NULL OR unit_purchase_price <> 'NaN'::numeric AND unit_purchase_price >= 0::numeric AND scale(unit_purchase_price) <= 16);

ALTER TABLE public.purchases
  ADD COLUMN arrived_at timestamp with time zone;

COMMENT ON COLUMN public.purchases.arrived_at IS 'Fachlicher Zeitpunkt, zu dem der Einkauf als angekommen bestätigt wurde.';

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_phone_e164_check CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'::text) NOT VALID;

ALTER TABLE public.suppliers
  ADD COLUMN country_code text;

COMMENT ON COLUMN public.suppliers.country_code IS 'ISO-3166-1-Alpha-2-Ländercode der Verkäuferadresse.';

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_country_code_check CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'::text) NOT VALID;
