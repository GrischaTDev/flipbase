-- Ein gemeinsamer MVCC-Snapshot für alle fachlichen Archivdateien.
-- SECURITY DEFINER ist nötig, weil business_events absichtlich nicht direkt
-- lesbar ist. Vor jeder Abfrage wird die privilegierte Mitgliedschaft geprüft.
create or replace function public.export_audit_snapshot(
  p_workspace_id uuid,
  p_filter jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

alter function public.export_audit_snapshot(uuid, jsonb) owner to postgres;
comment on function public.export_audit_snapshot(uuid, jsonb) is
  'Vollständige Archivtabellen aus einem gemeinsamen STABLE-Snapshot für Owner/Admin/Accountant; maximal 100000 Zeilen und 50 MiB JSON, sonst expliziter Fehler.';
revoke all on function public.export_audit_snapshot(uuid, jsonb) from public, anon;
grant execute on function public.export_audit_snapshot(uuid, jsonb) to authenticated;
