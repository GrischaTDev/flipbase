-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.business_events
  DROP CONSTRAINT business_events_entity_type_check;

CREATE FUNCTION public.archive_workspace (
  p_workspace_id uuid
)
  RETURNS public.workspaces
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$ select public.set_workspace_archive_state(p_workspace_id, true); $function$;

REVOKE ALL ON FUNCTION public.archive_workspace(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.archive_workspace(uuid) TO authenticated;

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
    or exists (select 1 from public.cash_wallet_sessions where workspace_id = old.id) then
    raise exception using
      errcode = 'P0001',
      message = 'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.';
  end if;

  return old;
end;
$function$;

CREATE FUNCTION public.protect_archived_workspace_data()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_row jsonb;
  v_workspace_id uuid;
  v_archived_at timestamptz;
  v_rows jsonb[];
begin
  v_rows := case tg_op when 'INSERT' then array[to_jsonb(new)]
    when 'DELETE' then array[to_jsonb(old)] else array[to_jsonb(old),to_jsonb(new)] end;
  foreach v_row in array v_rows loop
    v_workspace_id := null;
    if tg_nargs = 0 then
      v_workspace_id := (v_row ->> 'workspace_id')::uuid;
    else
      -- TG_ARGV stammt ausschließlich aus der festen Triggerregistrierung.
      -- Eltern sperren verhindert paralleles Umhängen während der Prüfung.
      execute format('select workspace_id from public.%I where id = $1 for share',tg_argv[0])
        into v_workspace_id using (v_row ->> tg_argv[1])::uuid;
    end if;
    if v_workspace_id is not null then
      select archived_at into v_archived_at from public.workspaces
        where id = v_workspace_id for share;
      if v_archived_at is not null then
        raise exception using errcode = '55000',
          message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
      end if;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.protect_archived_workspace_data() FROM PUBLIC;

CREATE FUNCTION public.protect_workspace_archive_state()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  -- Kein Sitzungsflag: nur die privilegierte, autorisierte RPC darf ändern.
  if current_user <> 'postgres' and (
    (tg_op = 'INSERT' and new.archived_at is not null)
    or (tg_op = 'UPDATE' and new.archived_at is distinct from old.archived_at)
  ) then
    raise exception using errcode = '42501',
      message = 'Archivstatus darf nur über die Workspace-Aktionen geändert werden.';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.protect_workspace_archive_state() FROM PUBLIC;

CREATE FUNCTION public.restore_workspace (
  p_workspace_id uuid
)
  RETURNS public.workspaces
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$ select public.set_workspace_archive_state(p_workspace_id, false); $function$;

REVOKE ALL ON FUNCTION public.restore_workspace(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.restore_workspace(uuid) TO authenticated;

CREATE FUNCTION public.set_workspace_archive_state (
  p_workspace_id uuid,
  p_archived     boolean
)
  RETURNS public.workspaces
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_workspace public.workspaces;
  v_before timestamptz;
begin
  -- Mitgliedschaft sperren: parallel entzogene Inhaberrechte dürfen nicht
  -- zwischen Berechtigungsprüfung und Änderung wirksam werden.
  perform 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = (select auth.uid()) and role = 'owner'
    for share;
  if not found then
    raise exception using errcode = '42501',
      message = 'Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.';
  end if;
  -- FOR SHARE der operativen Trigger kollidiert hiermit bis Transaktionsende.
  select * into strict v_workspace from public.workspaces
    where id = p_workspace_id for update;
  if (v_workspace.archived_at is not null) = p_archived then
    return v_workspace;
  end if;
  v_before := v_workspace.archived_at;
  update public.workspaces
    set archived_at = case when p_archived then clock_timestamp() else null end,
        updated_at = clock_timestamp()
    where id = p_workspace_id returning * into v_workspace;
  insert into public.business_events(workspace_id,entity_type,entity_id,event_type,actor_id,changes)
    values(p_workspace_id,'workspace',p_workspace_id,
      case when p_archived then 'workspace_archived' else 'workspace_restored' end,
      (select auth.uid()),
      jsonb_build_object('archived_at',jsonb_build_object('before',v_before,'after',v_workspace.archived_at)));
  return v_workspace;
end;
$function$;

REVOKE ALL ON FUNCTION public.set_workspace_archive_state(uuid, boolean) FROM PUBLIC;

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

ALTER TABLE public.business_events
  ADD CONSTRAINT business_events_entity_type_check
    CHECK (entity_type = ANY (ARRAY['purchase'::text, 'inventory_item'::text, 'sale'::text, 'return'::text, 'export'::text, 'workspace'::text]));

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.cash_wallet_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.catalog_products
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.email_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.inventory_reconciliation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data('invoices', 'invoice_id');

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.item_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data('inventory_items', 'inventory_item_id');

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.item_media
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data('inventory_items', 'inventory_item_id');

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.listing_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data('inventory_items', 'inventory_item_id');

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.market_research
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.offline_purchase_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.purchase_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.purchase_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.research_comparables
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data('market_research', 'research_id');

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.sale_cost_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.sale_line_lot_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.sale_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.shipping_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.stock_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.store_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data('store_orders', 'store_order_id');

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.store_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

ALTER TABLE public.workspaces
  ADD COLUMN archived_at timestamp with time zone;

CREATE TRIGGER protect_workspace_archive_state
  BEFORE INSERT OR UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_workspace_archive_state();