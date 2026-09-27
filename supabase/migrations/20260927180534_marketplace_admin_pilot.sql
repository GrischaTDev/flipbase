-- Admin-Pilot: Marktplatzkonten nur für Plattformbetreiber im eigenen Workspace.
-- Betroffen: public.marketplace_can_manage und public.marketplace_browser_session_reserve.
-- Die interaktive Browsersitzung erhält eine Frist von zehn Minuten.

create or replace function public.marketplace_can_manage(p_workspace_id uuid)
 returns boolean
 language sql
 stable
 set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and (select public.is_platform_operator())
    and public.is_workspace_admin(p_workspace_id)
    and exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.archived_at is null);
$function$
;

create or replace function public.marketplace_browser_session_reserve(p_workspace_id uuid, p_connection_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare v_status text; v_profile_id text; v_session public.marketplace_browser_sessions;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_status in ('paused', 'blocked') then raise exception 'Verbindung ist nicht verfügbar' using errcode = '22023'; end if;
  select provider_profile_id into v_profile_id from public.marketplace_browser_profiles
    where workspace_id = p_workspace_id and connection_id = p_connection_id;
  if not found then raise exception 'Browserprofil fehlt' using errcode = '22023'; end if;
  if exists (select 1 from public.marketplace_browser_sessions
    where workspace_id = p_workspace_id and connection_id = p_connection_id and state in ('active', 'stopping'))
  then raise exception 'Konto wird bereits bedient oder bereinigt' using errcode = '55P03'; end if;
  insert into public.marketplace_browser_sessions (workspace_id, connection_id, started_by, provider_profile_id, expires_at)
    values (p_workspace_id, p_connection_id, (select auth.uid()), v_profile_id, clock_timestamp() + interval '10 minutes')
    returning * into v_session;
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state, 'expiresAt', v_session.expires_at);
end;
$function$
;
