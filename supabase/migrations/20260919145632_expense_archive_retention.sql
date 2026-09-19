-- Archiviert Betriebsausgaben und Belege vollständig und schützt sie im Archiv.
-- Betroffen: Ausgaben, Ausgabenbelege, Einkaufsbelege, Prüfprotokoll, Export und Storage.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.business_events
  DROP CONSTRAINT business_events_entity_type_check;

CREATE FUNCTION public.expense_audit_values (
  p_expense public.expenses
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select pg_catalog.jsonb_build_object(
    'category_id', p_expense.category_id,
    'recurring_rule_id', p_expense.recurring_rule_id,
    'occurrence_date', p_expense.occurrence_date,
    'title', p_expense.title,
    'vendor_name', p_expense.vendor_name,
    'quantity', p_expense.quantity,
    'gross_amount', p_expense.gross_amount,
    'vat_rate', p_expense.vat_rate,
    'expense_date', p_expense.expense_date,
    'due_date', p_expense.due_date,
    'status', p_expense.status,
    'payment_date', p_expense.payment_date,
    'notes', p_expense.notes,
    'deleted_at', p_expense.deleted_at
  );
$function$;

REVOKE ALL ON FUNCTION public.expense_audit_values(public.expenses) FROM PUBLIC;

CREATE FUNCTION public.expense_recurring_rule_audit_values (
  p_rule public.expense_recurring_rules
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select pg_catalog.jsonb_build_object(
    'category_id', p_rule.category_id,
    'title', p_rule.title,
    'vendor_name', p_rule.vendor_name,
    'quantity', p_rule.quantity,
    'gross_amount', p_rule.gross_amount,
    'vat_rate', p_rule.vat_rate,
    'frequency', p_rule.frequency,
    'start_date', p_rule.start_date,
    'end_date', p_rule.end_date,
    'is_active', p_rule.is_active,
    'notes', p_rule.notes
  );
$function$;

REVOKE ALL ON FUNCTION public.expense_recurring_rule_audit_values(public.expense_recurring_rules) FROM PUBLIC;

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
    'item_costs', 'purchase_documents', 'expense_categories',
    'expense_recurring_rules', 'expenses', 'expense_documents', 'business_events'
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

CREATE OR REPLACE FUNCTION public.list_entity_business_events (
  p_workspace_id      uuid,
  p_entity_type       text,
  p_entity_id         uuid,
  p_cursor_created_at timestamp with time zone,
  p_cursor_id         uuid,
  p_page_size         integer
)
  RETURNS TABLE (
    id             uuid,
    workspace_id   uuid,
    entity_type    text,
    entity_id      uuid,
    event_type     text,
    actor_id       uuid,
    reason         text,
    changes        jsonb,
    correlation_id uuid,
    created_at     timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_has_entity_access boolean := false;
  v_privileged_role boolean := false;
begin
  if v_actor_id is null or p_workspace_id is null or p_entity_id is null then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für diesen Datensatzverlauf.';
  end if;

  select member.role in ('owner', 'admin', 'accountant')
  into v_privileged_role
  from public.workspace_members as member
  where member.workspace_id = p_workspace_id
    and member.user_id = v_actor_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für diesen Datensatzverlauf.';
  end if;

  case p_entity_type
    when 'purchase' then
      select exists (
        select 1
        from public.purchases as purchase
        where purchase.workspace_id = p_workspace_id
          and purchase.id = p_entity_id
      ) into v_has_entity_access;
    when 'inventory_item' then
      select exists (
        select 1
        from public.inventory_items as inventory_item
        where inventory_item.workspace_id = p_workspace_id
          and inventory_item.id = p_entity_id
      ) into v_has_entity_access;
    when 'sale' then
      select exists (
        select 1
        from public.sales as sale
        where sale.workspace_id = p_workspace_id
          and sale.id = p_entity_id
      ) into v_has_entity_access;
    when 'return' then
      select exists (
        select 1
        from public.returns as returned_sale
        where returned_sale.workspace_id = p_workspace_id
          and returned_sale.id = p_entity_id
      ) into v_has_entity_access;
    when 'expense' then
      select exists (
        select 1
        from public.expenses as expense
        where expense.workspace_id = p_workspace_id
          and expense.id = p_entity_id
      ) into v_has_entity_access;
    when 'export' then
      if v_privileged_role then
        select exists (
          select 1
          from public.business_events as event
          where event.workspace_id = p_workspace_id
            and event.entity_type = 'export'
            and event.entity_id = p_entity_id
        ) into v_has_entity_access;
      end if;
    else
      raise exception using
        errcode = '22023',
        message = 'Unbekannter fachlicher Datensatztyp.';
  end case;

  if not v_has_entity_access then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für diesen Datensatzverlauf.';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception using
      errcode = '22023',
      message = 'Die Seitengröße muss zwischen 1 und 100 liegen.';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using
      errcode = '22023',
      message = 'Der Ereigniscursor ist unvollständig.';
  end if;

  return query
  select
    event.id,
    event.workspace_id,
    event.entity_type,
    event.entity_id,
    event.event_type,
    event.actor_id,
    event.reason,
    event.changes,
    event.correlation_id,
    event.created_at
  from public.business_events as event
  where event.workspace_id = p_workspace_id
    and event.entity_type = p_entity_type
    and event.entity_id = p_entity_id
    and (
      p_cursor_created_at is null
      or (event.created_at, event.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by event.created_at desc, event.id desc
  limit p_page_size;
end;
$function$;

CREATE FUNCTION public.log_expense_document_event()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_document public.expense_documents := case when tg_op = 'DELETE' then old else new end;
begin
  insert into public.business_events (
    workspace_id, entity_type, entity_id, event_type, actor_id, changes
  ) values (
    v_document.workspace_id,
    'expense',
    v_document.expense_id,
    case when tg_op = 'DELETE' then 'expense_document_removed' else 'expense_document_added' end,
    (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'document_type', v_document.document_type,
      'original_file_name', v_document.original_file_name
    )
  );
  return v_document;
end;
$function$;

REVOKE ALL ON FUNCTION public.log_expense_document_event() FROM PUBLIC;

CREATE FUNCTION public.log_expense_event()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    insert into public.business_events (
      workspace_id, entity_type, entity_id, event_type, actor_id, changes
    ) values (
      new.workspace_id,
      'expense',
      new.id,
      'expense_created',
      (select auth.uid()),
      pg_catalog.jsonb_build_object('after', public.expense_audit_values(new))
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.business_events (
      workspace_id, entity_type, entity_id, event_type, actor_id, changes
    ) values (
      old.workspace_id,
      'expense',
      old.id,
      'expense_removed',
      (select auth.uid()),
      pg_catalog.jsonb_build_object('before', public.expense_audit_values(old))
    );
    return old;
  end if;

  v_before := public.expense_audit_values(old);
  v_after := public.expense_audit_values(new);
  if v_before = v_after then
    return new;
  end if;

  v_event_type := case
    when old.deleted_at is null and new.deleted_at is not null then 'expense_removed'
    when old.deleted_at is not null and new.deleted_at is null then 'expense_restored'
    when old.status is distinct from new.status and new.status = 'paid' then 'expense_marked_paid'
    when old.status is distinct from new.status and new.status = 'open' then 'expense_marked_open'
    else 'expense_updated'
  end;

  insert into public.business_events (
    workspace_id, entity_type, entity_id, event_type, actor_id, changes
  ) values (
    new.workspace_id,
    'expense',
    new.id,
    v_event_type,
    (select auth.uid()),
    pg_catalog.jsonb_build_object('before', v_before, 'after', v_after)
  );
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.log_expense_event() FROM PUBLIC;

CREATE FUNCTION public.log_expense_recurring_rule_event()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.business_events (
      workspace_id, entity_type, entity_id, event_type, actor_id, changes
    ) values (
      new.workspace_id,
      'expense',
      new.id,
      'expense_recurring_rule_created',
      (select auth.uid()),
      pg_catalog.jsonb_build_object('after', public.expense_recurring_rule_audit_values(new))
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.business_events (
      workspace_id, entity_type, entity_id, event_type, actor_id, changes
    ) values (
      old.workspace_id,
      'expense',
      old.id,
      'expense_recurring_rule_removed',
      (select auth.uid()),
      pg_catalog.jsonb_build_object('before', public.expense_recurring_rule_audit_values(old))
    );
    return old;
  end if;

  v_before := public.expense_recurring_rule_audit_values(old);
  v_after := public.expense_recurring_rule_audit_values(new);
  if v_before is distinct from v_after then
    insert into public.business_events (
      workspace_id, entity_type, entity_id, event_type, actor_id, changes
    ) values (
      new.workspace_id,
      'expense',
      new.id,
      'expense_recurring_rule_updated',
      (select auth.uid()),
      pg_catalog.jsonb_build_object('before', v_before, 'after', v_after)
    );
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.log_expense_recurring_rule_event() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.prevent_workspace_with_business_data_deletion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if exists (select 1 from public.purchases where workspace_id = old.id)
    or exists (select 1 from public.inventory_items where workspace_id = old.id)
    or exists (select 1 from public.stock_lots where workspace_id = old.id)
    or exists (select 1 from public.stock_movements where workspace_id = old.id)
    or exists (select 1 from public.sales where workspace_id = old.id)
    or exists (select 1 from public.inventory_reconciliation_events where workspace_id = old.id)
    or exists (select 1 from public.business_events where workspace_id = old.id)
    or exists (select 1 from public.activity_logs where workspace_id = old.id)
    or exists (select 1 from public.returns where workspace_id = old.id)
    or exists (select 1 from public.invoices where workspace_id = old.id)
    or exists (select 1 from public.email_confirmations where workspace_id = old.id)
    or exists (select 1 from public.shipping_orders where workspace_id = old.id)
    or exists (select 1 from public.store_orders where workspace_id = old.id)
    or exists (select 1 from public.bank_transactions where workspace_id = old.id)
    or exists (select 1 from public.offline_purchase_entries where workspace_id = old.id)
    or exists (select 1 from public.cash_wallet_sessions where workspace_id = old.id)
    or exists (select 1 from public.catalog_product_media where workspace_id = old.id)
    or exists (select 1 from public.purchase_receipt_requests where workspace_id = old.id)
    or exists (select 1 from public.purchase_documents where workspace_id = old.id)
    or exists (select 1 from public.expense_recurring_rules where workspace_id = old.id)
    or exists (select 1 from public.expenses where workspace_id = old.id)
    or exists (select 1 from public.expense_documents where workspace_id = old.id) then
    raise exception using errcode = 'P0001',
      message = 'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.';
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_workspace_media_object()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_row jsonb;
  v_rows jsonb[];
  v_path text;
  v_workspace record;
begin
  if tg_op = 'UPDATE' and (
    (old.bucket_id = 'item-media' and split_part(old.name,'/',1) = 'catalog-products')
    or (new.bucket_id = 'item-media' and split_part(new.name,'/',1) = 'catalog-products')
  ) and (old.bucket_id,old.name) is distinct from (new.bucket_id,new.name) then
    raise exception using errcode = '42501',
      message = 'Der Speicherpfad eines Produktmediums darf nicht geändert werden.';
  end if;

  v_rows := case tg_op when 'INSERT' then array[to_jsonb(new)]
    when 'DELETE' then array[to_jsonb(old)] else array[to_jsonb(old),to_jsonb(new)] end;
  foreach v_row in array v_rows loop
    if v_row ->> 'bucket_id' not in ('item-media', 'purchase-documents', 'expense-documents') then
      continue;
    end if;
    v_path := v_row ->> 'name';
    -- UUIDs werden als Text verglichen: ungültige Fremdpfade lösen keinen Castfehler aus.
    for v_workspace in
      select w.id,w.archived_at from public.workspaces w
      where w.id in (
        select p.workspace_id from public.catalog_products p
        where p.workspace_id::text = split_part(v_path,'/',2)
          and p.id::text = split_part(v_path,'/',3)
          and public.is_catalog_product_media_path(v_path,p.workspace_id,p.id)
        union
        select i.workspace_id from public.inventory_items i
        where split_part(v_path,'/',1) <> 'catalog-products'
          and cardinality(storage.foldername(v_path)) = 1
          and i.id::text = (storage.foldername(v_path))[1]
        union
        select p.workspace_id from public.purchases p
        where v_row ->> 'bucket_id' = 'purchase-documents'
          and p.workspace_id::text = (storage.foldername(v_path))[2]
          and p.id::text = (storage.foldername(v_path))[3]
          and public.is_purchase_document_path(v_path, p.workspace_id, p.id)
        union
        select e.workspace_id from public.expenses e
        where v_row ->> 'bucket_id' = 'expense-documents'
          and e.workspace_id::text = (storage.foldername(v_path))[2]
          and e.id::text = (storage.foldername(v_path))[3]
          and public.is_expense_document_path(v_path, e.workspace_id, e.id)
      )
      order by w.id for share of w
    loop
      if v_workspace.archived_at is not null then
        raise exception using errcode = '55000',
          message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
      end if;
    end loop;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

ALTER TABLE public.business_events
  ADD CONSTRAINT business_events_entity_type_check
    CHECK (entity_type = ANY (ARRAY['purchase'::text, 'inventory_item'::text, 'sale'::text, 'return'::text, 'expense'::text, 'export'::text, 'workspace'::text]));

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.expense_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.expense_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER log_expense_document_added
  AFTER INSERT ON public.expense_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.log_expense_document_event();

CREATE TRIGGER log_expense_document_removed
  AFTER DELETE ON public.expense_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.log_expense_document_event();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.expense_recurring_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER log_expense_recurring_rule_event
  AFTER INSERT OR DELETE OR UPDATE ON public.expense_recurring_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.log_expense_recurring_rule_event();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER log_expense_event
  AFTER INSERT OR DELETE OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.log_expense_event();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.purchase_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();
