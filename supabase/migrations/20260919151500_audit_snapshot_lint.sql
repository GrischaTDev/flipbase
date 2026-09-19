-- Macht den vollständigen Prüfarchiv-Export auch für den Datenbank-Advisor prüfbar.
-- Betroffen: public.export_audit_snapshot.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

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
  for v_table in
    select table_name
    from (values
      ('suppliers'::text),
      ('catalog_products'::text),
      ('purchases'::text),
      ('purchase_lines'::text),
      ('purchase_costs'::text),
      ('inventory_items'::text),
      ('stock_lots'::text),
      ('stock_movements'::text),
      ('sales'::text),
      ('sale_lines'::text),
      ('sale_cost_entries'::text),
      ('sale_line_lot_allocations'::text),
      ('returns'::text),
      ('inventory_reconciliation_events'::text),
      ('invoices'::text),
      ('invoice_items'::text),
      ('item_costs'::text),
      ('purchase_documents'::text),
      ('expense_categories'::text),
      ('expense_recurring_rules'::text),
      ('expenses'::text),
      ('expense_documents'::text),
      ('business_events'::text)
    ) as audit_tables(table_name)
  loop
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
