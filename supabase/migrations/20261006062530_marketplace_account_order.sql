-- Persistente Vinted-Kontoreihenfolge und zehn gemeinsame Plätze für lokale und Cloudkonten.
-- Betroffen: marketplace_connections.sort_order, Kontoanlage-Trigger und Metadaten-RPCs.
-- Mit Supabase-Schemaabgleich aus zwei isolierten Datenbankständen erzeugt; explizite Rechte ergänzt.

-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create function public.marketplace_assign_connection_slot()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if new.marketplace <> 'vinted' then return new; end if;
  if tg_op = 'UPDATE' and new.workspace_id = old.workspace_id and new.marketplace = old.marketplace then return new; end if;
  -- Dieselbe Sperre schützt bereits Cloudreservierungen und lokale Freigaben.
  perform pg_catalog.pg_advisory_xact_lock(91731, 1);
  if (select count(*) from public.marketplace_connections c
      where c.workspace_id = new.workspace_id and c.marketplace = 'vinted' and c.id <> new.id) >= 10 then
    raise exception 'Du kannst höchstens zehn Vinted-Konten pro Workspace hinzufügen.' using errcode = '54000';
  end if;
  select coalesce(max(c.sort_order), 0) + 1 into new.sort_order
    from public.marketplace_connections c where c.workspace_id = new.workspace_id and c.marketplace = 'vinted' and c.id <> new.id;
  return new;
end;
$function$;

revoke all on function public.marketplace_assign_connection_slot() from public;

grant all on function public.marketplace_assign_connection_slot() to service_role;

create or replace function public.marketplace_list_connections (
  p_workspace_id uuid
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  return jsonb_build_object('canManage', true, 'connections', coalesce((
    select jsonb_agg(jsonb_build_object(
      'workspaceId', c.workspace_id, 'connectionId', c.id, 'marketplace', c.marketplace,
      'displayName', c.display_name, 'externalAccountId', c.external_account_id,
      'status', c.status, 'executionMode', c.execution_mode, 'capabilities', c.capabilities,
      'allowedActions', case when c.execution_mode = 'local' then
        jsonb_build_array('profile.read', 'listings.read') || case when c.capabilities->>'conversations.read' = 'verified' then jsonb_build_array('conversations.read') else '[]'::jsonb end
        || case when c.capabilities->>'messages.sendText' = 'verified' then jsonb_build_array('messages.sendText') else '[]'::jsonb end
        else jsonb_build_array('profile.read', 'listings.read', 'metrics.read', 'conversations.read', 'messages.sendText', 'listings.update', 'listings.publish', 'sales.read') end,
      'lastSyncedAt', c.last_synced_at
    ) order by c.sort_order, c.created_at, c.id) from public.marketplace_connections c
    where c.workspace_id = p_workspace_id and c.marketplace = 'vinted'
  ), '[]'::jsonb));
end;
$function$;

create function public.marketplace_reorder_connections (
  p_workspace_id   uuid,
  p_connection_ids uuid[]
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(91731, 1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select count(*) into v_count from public.marketplace_connections c where c.workspace_id = p_workspace_id and c.marketplace = 'vinted';
  if p_connection_ids is null or cardinality(p_connection_ids) <> v_count
    or (select count(distinct connection_id) from unnest(p_connection_ids) connection_id) <> v_count
    or exists(select 1 from unnest(p_connection_ids) connection_id where not exists(
      select 1 from public.marketplace_connections c where c.workspace_id = p_workspace_id and c.marketplace = 'vinted' and c.id = connection_id)) then
    raise exception 'Die Kontoliste hat sich geändert. Lade die Ansicht erneut.' using errcode = '22023';
  end if;
  update public.marketplace_connections c set sort_order = ordered.position
    from unnest(p_connection_ids) with ordinality ordered(connection_id, position)
    where c.workspace_id = p_workspace_id and c.marketplace = 'vinted' and c.id = ordered.connection_id;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.marketplace_reorder_connections(uuid, uuid[]) from public;

grant all on function public.marketplace_reorder_connections(uuid, uuid[]) to authenticated;

grant all on function public.marketplace_reorder_connections(uuid, uuid[]) to service_role;

alter table public.marketplace_connections
  add column sort_order bigint default 0 not null;

create index marketplace_connections_order on public.marketplace_connections (workspace_id, marketplace, sort_order, created_at, id);

create trigger marketplace_connection_slot
  before insert or update of workspace_id, marketplace on public.marketplace_connections
  for each row
  execute function public.marketplace_assign_connection_slot();
-- Explizite Rechte aus dem deklarativen Schema, auch bei älteren Standardrechten.
revoke all on function public.marketplace_assign_connection_slot() from public, anon, authenticated;
grant execute on function public.marketplace_assign_connection_slot() to service_role;
revoke all on function public.marketplace_reorder_connections(uuid, uuid[]) from public, anon;
grant execute on function public.marketplace_reorder_connections(uuid, uuid[]) to authenticated;
revoke all on function public.marketplace_list_connections(uuid) from public, anon;
grant execute on function public.marketplace_list_connections(uuid) to authenticated;
