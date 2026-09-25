-- Löscht ausschließlich unverarbeitete Einkaufsentwürfe atomar.
-- Betroffen: public.delete_purchase_draft, purchases, purchase_lines, purchase_costs, business_events.

revoke delete on public.purchases from authenticated;
drop policy "Einkauf loeschen" on public.purchases;

create function public.delete_purchase_draft (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_purchase public.purchases;
  v_audit_before jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_purchase_id is null then
    raise exception using errcode = '22023', message = 'Der Einkauf ist ungültig.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.* into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status <> 'draft' then
    raise exception using errcode = '22023',
      message = 'Nur ein Einkaufsentwurf kann gelöscht werden.';
  end if;

  if exists (
    select 1 from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and line.received_quantity > 0
  ) or exists (
    select 1 from public.inventory_items as item
    where item.workspace_id = p_workspace_id and item.purchase_id = p_purchase_id
  ) or exists (
    select 1 from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id and lot.purchase_id = p_purchase_id
  ) or exists (
    select 1 from public.purchase_receipt_requests as request
    where request.workspace_id = p_workspace_id and request.purchase_id = p_purchase_id
  ) or exists (
    select 1 from public.purchase_package_capture_requests as request
    join public.purchase_lines as line
      on line.workspace_id = request.workspace_id and line.id = request.purchase_line_id
    where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id
  ) then
    raise exception using errcode = '22023',
      message = 'Ein Einkauf mit erfasstem Bestand kann nicht gelöscht werden.';
  end if;

  if exists (
    select 1 from public.purchase_documents as document
    where document.workspace_id = p_workspace_id and document.purchase_id = p_purchase_id
  ) then
    raise exception using errcode = '22023',
      message = 'Bitte entferne zuerst die Belege dieses Einkaufs.';
  end if;

  if exists (
    select 1 from public.record_comments as comment
    where comment.workspace_id = p_workspace_id and comment.purchase_id = p_purchase_id
  ) then
    raise exception using errcode = '22023',
      message = 'Ein Einkauf mit Kommentaren kann nicht gelöscht werden.';
  end if;

  v_audit_before := public.purchase_draft_audit_snapshot(p_workspace_id, p_purchase_id);

  delete from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id and cost.purchase_id = p_purchase_id;

  delete from public.purchase_lines as line
  where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id;

  delete from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id and purchase.id = p_purchase_id;

  insert into public.business_events (
    workspace_id, entity_type, entity_id, event_type, actor_id, changes
  ) values (
    p_workspace_id, 'purchase', p_purchase_id, 'purchase_draft_deleted', (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object('before', v_audit_before -> 'purchase', 'after', null),
      'lines', pg_catalog.jsonb_build_object('before', v_audit_before -> 'lines', 'after', null),
      'costs', pg_catalog.jsonb_build_object('before', v_audit_before -> 'costs', 'after', null)
    )
  );
end;
$function$;

revoke all on function public.delete_purchase_draft(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.delete_purchase_draft(uuid, uuid) to authenticated;
