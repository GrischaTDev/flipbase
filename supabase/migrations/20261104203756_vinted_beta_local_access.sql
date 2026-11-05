-- Zweck: Lokalen Vinted-Zugriff für aktive Beta-Workspaces freigeben; Cloud und Proxy-Käufe bleiben dem Betreiberpilot vorbehalten.
-- Betroffen: Kontozugriff, lokale Freigaben, Inserat-/Nachrichtenberechtigungen und Cloud-Sitzungseinstiege.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

drop policy "Operators read their browser tests" on public.marketplace_browser_test_sessions;

drop policy "Administrators read account operations" on public.marketplace_operations;

create or replace function public.marketplace_approve_listings (
  p_workspace_id                 uuid,
  p_connection_id                uuid,
  p_expected_external_account_id text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_profile public.marketplace_browser_profiles; v_generation bigint; v_permission public.marketplace_listing_permissions;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if not public.marketplace_local_extension_user_valid((select auth.uid())) or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.status<>'connected' or p_expected_external_account_id is null or v_connection.external_account_id is distinct from p_expected_external_account_id then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
  if v_connection.execution_mode='cloud' and not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
  if v_connection.execution_mode='local' then
    select grant_generation into v_generation from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id
      and approved_by=(select auth.uid()) and external_account_id=p_expected_external_account_id and revoked_at is null and expires_at>clock_timestamp() for share;
    if not found then raise exception 'Lokale Verbindung nicht freigegeben.' using errcode='42501'; end if;
  else
    select * into v_profile from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=p_connection_id for share;
    if not found or not public.marketplace_cloud_network_valid(p_workspace_id,p_connection_id) then raise exception 'Cloud-Verbindung nicht verfügbar.' using errcode='42501'; end if;
  end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())) then return public.marketplace_read_listing_permission(p_workspace_id,p_connection_id); end if;
  insert into public.marketplace_listing_permissions(workspace_id,connection_id,approved_by,external_account_id,execution_mode,local_grant_generation,browser_profile_id,provider_profile_id)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_expected_external_account_id,v_connection.execution_mode,v_generation,v_profile.id,v_profile.provider_profile_id)
    on conflict (workspace_id,connection_id) do update set approved_by=excluded.approved_by,external_account_id=excluded.external_account_id,execution_mode=excluded.execution_mode,
      local_grant_generation=excluded.local_grant_generation,browser_profile_id=excluded.browser_profile_id,provider_profile_id=excluded.provider_profile_id,
      authorization_version=public.marketplace_listing_permissions.authorization_version+1,revoked_at=null,updated_at=clock_timestamp();
  return public.marketplace_read_listing_permission(p_workspace_id,p_connection_id);
end;
$function$;

create or replace function public.marketplace_approve_local_extension (
  p_workspace_id                 uuid,
  p_connection_id                uuid,
  p_token_hash                   text,
  p_expected_external_account_id text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expected_external_account_id is null or p_expected_external_account_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Ungültige lokale Freigabe' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.status in ('paused','blocked') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if v_connection.external_account_id is not null and v_connection.external_account_id<>p_expected_external_account_id then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping'))
    or exists(select 1 from public.marketplace_operations where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','running','outcome_unknown'))
    or exists(select 1 from public.marketplace_sync_schedules where workspace_id=p_workspace_id and connection_id=p_connection_id and enabled) then raise exception 'Cloudbetrieb muss zuerst beendet werden' using errcode='55P03'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if found and v_grant.revoked_at is null and v_grant.expires_at>clock_timestamp() then
    if v_connection.execution_mode='local' and v_grant.token_hash=p_token_hash and v_grant.approved_by=(select auth.uid()) and v_grant.external_account_id=p_expected_external_account_id then
      return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at);
    end if;
    raise exception 'Lokale Installation bereits verbunden' using errcode='55P03';
  end if;
  if not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_token_hash,p_expected_external_account_id,clock_timestamp()+interval '24 hours')
    on conflict(workspace_id,connection_id) do update set approved_by=excluded.approved_by,token_hash=excluded.token_hash,external_account_id=excluded.external_account_id,expires_at=excluded.expires_at,last_seen_at=null,revoked_at=null,messages_read=false,messages_send=false,grant_generation=public.marketplace_local_extension_grants.grant_generation+1,inbox_next_page=1 returning * into v_grant;
  update public.marketplace_connections set external_account_id=p_expected_external_account_id,execution_mode='local',status='needs_login',resume_status=null,capabilities='{}'::jsonb,updated_at=clock_timestamp() where id=p_connection_id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at);
end;
$function$;

create or replace function public.marketplace_approve_local_inbox (
  p_workspace_id                 uuid,
  p_connection_id                uuid,
  p_token_hash                   text,
  p_expected_external_account_id text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expected_external_account_id is null or p_expected_external_account_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Ungültige Freigabe' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') or v_connection.external_account_id is distinct from p_expected_external_account_id then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if not found or v_grant.token_hash<>p_token_hash or v_grant.approved_by<>(select auth.uid()) or v_grant.external_account_id<>p_expected_external_account_id or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp() then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  update public.marketplace_local_extension_grants set messages_read=true where id=v_grant.id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',true);
end;
$function$;

create or replace function public.marketplace_approve_local_messaging (
  p_workspace_id                 uuid,
  p_connection_id                uuid,
  p_token_hash                   text,
  p_expected_external_account_id text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expected_external_account_id is null or p_expected_external_account_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Ungültige Freigabe' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status<>'connected' or v_connection.external_account_id is distinct from p_expected_external_account_id then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if not found or v_grant.token_hash<>p_token_hash or v_grant.approved_by<>(select auth.uid()) or v_grant.external_account_id<>p_expected_external_account_id or not v_grant.messages_read or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp() then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  update public.marketplace_local_extension_grants set messages_send=true where id=v_grant.id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',true,'messagesSend',true);
end;
$function$;

create or replace function public.marketplace_browser_session_check (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_status text; v_session public.marketplace_browser_sessions; v_active boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' and execution_mode = 'cloud' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid()) and cloud_setup_id is null for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  if v_session.state = 'active' and (v_session.expires_at <= clock_timestamp() or v_status in ('paused', 'blocked')
    or not public.marketplace_cloud_network_valid(p_workspace_id,p_connection_id)) then
    update public.marketplace_browser_sessions set state = 'stopping',
      stop_reason = case when v_status in ('paused', 'blocked') then 'paused' else 'expired' end
      where id = v_session.id returning * into v_session;
  end if;
  v_active := v_session.state = 'active' and v_session.expires_at > clock_timestamp();
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state,
    'expiresAt', v_session.expires_at, 'active', v_active);
end;
$function$;

create or replace function public.marketplace_browser_session_reserve (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_status text; v_profile_id text; v_session public.marketplace_browser_sessions;
begin
  -- Alle Browseraktionen teilen den einen konservativen Cloudplatz.
  perform pg_advisory_xact_lock(91731, 1);
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' and execution_mode = 'cloud' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_status in ('paused', 'blocked') then raise exception 'Verbindung ist nicht verfügbar' using errcode = '22023'; end if;
  select provider_profile_id into v_profile_id from public.marketplace_browser_profiles
    where workspace_id = p_workspace_id and connection_id = p_connection_id;
  if not found then raise exception 'Browserprofil fehlt' using errcode = '22023'; end if;
  if exists (select 1 from public.marketplace_browser_sessions
    where state in ('active', 'stopping'))
  then raise exception 'Konto wird bereits bedient oder bereinigt' using errcode = '55P03'; end if;
  insert into public.marketplace_browser_sessions (workspace_id, connection_id, started_by, provider_profile_id, expires_at)
    values (p_workspace_id, p_connection_id, (select auth.uid()), v_profile_id, clock_timestamp() + interval '10 minutes')
    returning * into v_session;
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state, 'expiresAt', v_session.expires_at);
end;
$function$;

create or replace function public.marketplace_browser_session_revoke (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_session public.marketplace_browser_sessions;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' and execution_mode = 'cloud' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid()) for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  if v_session.state = 'active' then
    update public.marketplace_browser_sessions set state = 'stopping', stop_reason = 'requested'
      where id = v_session.id returning * into v_session;
  end if;
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state, 'active', false);
end;
$function$;

create function public.marketplace_can_manage_cloud (
  p_workspace_id uuid
)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
  select public.marketplace_can_manage(p_workspace_id) and (select public.is_platform_operator());
$function$;

revoke all on function public.marketplace_can_manage_cloud(uuid) from public;

grant all on function public.marketplace_can_manage_cloud(uuid) to authenticated;

grant all on function public.marketplace_can_manage_cloud(uuid) to service_role;

create or replace function public.marketplace_can_manage (
  p_workspace_id uuid
)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false'
    and public.can_administer_workspace(p_workspace_id)
    and exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.archived_at is null);
$function$;

create or replace function public.marketplace_cloud_setup_begin (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_request_id    uuid,
  p_display_name  text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setup public.marketplace_cloud_setups; v_connection public.marketplace_connections; v_ip_id bigint; v_generation bigint; v_revoked_at timestamptz;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage_cloud(p_workspace_id) or not public.marketplace_local_extension_user_valid((select auth.uid())) then
    raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_request_id is null or (p_connection_id is null and
    (p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[[:cntrl:]]')) then
    raise exception 'Ungültige Kontoeinrichtung' using errcode='22023'; end if;
  select * into v_setup from public.marketplace_cloud_setups where workspace_id=p_workspace_id and requested_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if (v_setup.is_new_connection and (p_connection_id is not null or v_setup.requested_name is distinct from btrim(p_display_name)))
      or (not v_setup.is_new_connection and v_setup.connection_id is distinct from p_connection_id) then
      raise exception 'Einrichtungskennung bereits verwendet' using errcode='23505'; end if;
    return jsonb_build_object('status','ready','setup',public.marketplace_cloud_setup_public(v_setup));
  end if;
  if p_connection_id is not null then
    select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
    if not found or v_connection.status in ('paused','blocked') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
    select * into v_setup from public.marketplace_cloud_setups where workspace_id=p_workspace_id and connection_id=p_connection_id and state<>'cancelled';
    if found then
      if v_setup.requested_by<>(select auth.uid()) then raise exception 'Einrichtung wird bereits bedient' using errcode='55P03'; end if;
      return jsonb_build_object('status','ready','setup',public.marketplace_cloud_setup_public(v_setup));
    end if;
    if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping')) then
      raise exception 'Browsersitzung muss zuerst beendet werden' using errcode='55P03'; end if;
    -- Nur ein gerade laufender Versand sperrt; alte ungeklärte Nachrichten bleiben unverändert im Verlauf.
    perform public.marketplace_local_message_expire_leases(p_workspace_id,p_connection_id);
    if exists(select 1 from public.marketplace_operations where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','running','outcome_unknown'))
      or exists(select 1 from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('claimed','sending')) then
      raise exception 'Laufende oder ungeklärte Aktion verhindert den Wechsel' using errcode='55P03'; end if;
    select grant_generation,revoked_at into v_generation,v_revoked_at from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  end if;
  if public.marketplace_cloud_ip_limit_reached(p_workspace_id) then return jsonb_build_object('status','limit_reached'); end if;
  select ip.id into v_ip_id from public.marketplace_cloud_ips ip
    where ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>clock_timestamp()
      and not exists(select 1 from public.marketplace_cloud_setups setup where setup.cloud_ip_id=ip.id and setup.state<>'cancelled')
      and not exists(select 1 from public.marketplace_cloud_ip_purchases purchase where purchase.provider_order_id=ip.order_reference and purchase.state='ordered'
        and (purchase.workspace_id<>p_workspace_id or purchase.requested_by<>(select auth.uid()) or purchase.request_id<>p_request_id))
    order by ip.created_at,ip.id limit 1 for update of ip skip locked;
  if not found then return jsonb_build_object('status','no_capacity'); end if;
  if p_connection_id is null then
    insert into public.marketplace_connections(workspace_id,display_name) values(p_workspace_id,btrim(p_display_name)) returning * into v_connection;
  end if;
  -- Ein alter Cloudzeitplan darf während der Profilumstellung nicht wieder starten.
  update public.marketplace_sync_schedules set enabled=false,next_due_at=null,
    authorization_version=authorization_version+1,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=v_connection.id;
  insert into public.marketplace_cloud_setups(workspace_id,connection_id,requested_by,request_id,requested_name,is_new_connection,cloud_ip_id,expected_external_account_id,expected_grant_generation,expected_grant_revoked_at)
    values(p_workspace_id,v_connection.id,(select auth.uid()),p_request_id,case when p_connection_id is null then btrim(p_display_name) end,p_connection_id is null,v_ip_id,v_connection.external_account_id,v_generation,v_revoked_at)
    returning * into v_setup;
  return jsonb_build_object('status','ready','setup',public.marketplace_cloud_setup_public(v_setup));
end;
$function$;

create or replace function public.marketplace_cloud_setup_read (
  p_workspace_id uuid,
  p_setup_id     uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setup public.marketplace_cloud_setups;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_setup from public.marketplace_cloud_setups where workspace_id=p_workspace_id and public_id=p_setup_id and requested_by=(select auth.uid());
  if not found then raise exception 'Einrichtungszugriff verweigert' using errcode='42501'; end if;
  return public.marketplace_cloud_setup_public(v_setup);
end;
$function$;

create or replace function public.marketplace_create_connection (
  p_workspace_id uuid,
  p_display_name text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_id uuid; v_result jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[[:cntrl:]]' then raise exception 'Ungültiger Kontoname' using errcode = '22023'; end if;
  -- Die allgemeine Kontoanlage reserviert ausschließlich einen lokalen Anschluss.
  -- Cloudkonten entstehen nur über die gesondert berechtigte Cloud-Einrichtung.
  insert into public.marketplace_connections(workspace_id, display_name, execution_mode) values(p_workspace_id, btrim(p_display_name), 'local') returning id into v_id;
  select value into v_result from jsonb_array_elements(public.marketplace_list_connections(p_workspace_id)->'connections') where value->>'connectionId' = v_id::text;
  return v_result;
end;
$function$;

create or replace function public.marketplace_enqueue_local_message (
  p_workspace_id    uuid,
  p_connection_id   uuid,
  p_conversation_id uuid,
  p_request_id      uuid,
  p_text            text,
  p_attachment      jsonb default null::jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_conversation public.marketplace_account_entries; v_message public.marketplace_local_message_outbox; v_bytes bytea; v_hash text; v_name text; v_mime text; v_base64 text;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status<>'connected' then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if not found or v_grant.approved_by<>(select auth.uid()) or not v_grant.messages_send or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  select * into v_conversation from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_conversation_id and kind='conversation' for share;
  if not found or v_conversation.external_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Gespräch nicht verfügbar' using errcode='42501'; end if;
  if p_request_id is null or p_text is null or char_length(p_text)>5000 or p_text ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]' then raise exception 'Ungültige Nachricht' using errcode='22023'; end if;
  if p_attachment is not null then
    if jsonb_typeof(p_attachment)<>'object' or (select count(*) from jsonb_object_keys(p_attachment))<>3
      or exists(select 1 from jsonb_object_keys(p_attachment) field where field<>all(array['name','mimeType','base64']))
      or jsonb_typeof(p_attachment->'name')<>'string' or jsonb_typeof(p_attachment->'mimeType')<>'string' or jsonb_typeof(p_attachment->'base64')<>'string' then raise exception 'Ungültiger Anhang' using errcode='22023'; end if;
    v_name:=p_attachment->>'name'; v_mime:=p_attachment->>'mimeType'; v_base64:=p_attachment->>'base64';
    if char_length(v_name) not between 1 and 120 or v_name ~ '[[:cntrl:]/\\]' or v_mime not in ('image/png','image/jpeg')
      or char_length(v_base64)>349528 or v_base64 !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then raise exception 'Ungültiger Anhang' using errcode='22023'; end if;
    begin v_bytes:=decode(v_base64,'base64'); exception when others then raise exception 'Ungültiger Anhang' using errcode='22023'; end;
    if octet_length(v_bytes)>262144 or octet_length(v_bytes)<4
      or (v_mime='image/png' and encode(substring(v_bytes from 1 for 8),'hex')<>'89504e470d0a1a0a')
      or (v_mime='image/jpeg' and (encode(substring(v_bytes from 1 for 3),'hex')<>'ffd8ff' or encode(substring(v_bytes from octet_length(v_bytes)-1 for 2),'hex')<>'ffd9'))
      then raise exception 'Ungültiger Anhang' using errcode='22023'; end if;
  end if;
  if char_length(btrim(p_text))=0 and v_bytes is null then raise exception 'Leere Nachricht' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_conversation_id,p_text,v_name,v_mime,case when v_bytes is null then null else encode(extensions.digest(v_bytes,'sha256'),'hex') end)::text,'utf8'),'sha256'),'hex');
  insert into public.marketplace_local_message_outbox(workspace_id,connection_id,conversation_id,external_conversation_id,external_account_id,grant_generation,requested_by,request_id,payload_hash,message_text,attachment_name,attachment_mime_type,attachment_base64)
    values(p_workspace_id,p_connection_id,p_conversation_id,v_conversation.external_id,v_grant.external_account_id,v_grant.grant_generation,(select auth.uid()),p_request_id,v_hash,p_text,v_name,v_mime,v_base64)
    on conflict(workspace_id,connection_id,request_id) do nothing returning * into v_message;
  if not found then
    select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and request_id=p_request_id;
    if v_message.execution_mode<>'local' or v_message.payload_hash<>v_hash or v_message.requested_by<>(select auth.uid()) or v_message.grant_generation is distinct from v_grant.grant_generation then raise exception 'Nachrichtenkennung bereits verwendet' using errcode='23505'; end if;
  end if;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'message',public.marketplace_local_message_public(v_message));
end;
$function$;

create or replace function public.marketplace_import_local_inbox (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text,
  p_batch         jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_observed timestamptz; v_entry jsonb; v_parent uuid; v_existing public.marketplace_account_entries; v_conversations integer:=0; v_messages integer:=0; v_page integer; v_next_page integer; v_complete boolean; v_mode text; v_detail_external text;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or not v_grant.messages_read or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_batch)) not between 6 and 9
    or exists(select 1 from jsonb_object_keys(p_batch) field where field<>all(array['identity','observedAt','page','nextPage','conversationsComplete','entries','mode','detailConversationId','inboxEvents']))
    or octet_length(p_batch::text)>524288 or jsonb_typeof(p_batch->'identity') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_batch->'identity'))<>1 or p_batch->'identity'->>'id' is distinct from v_grant.external_account_id
    or jsonb_typeof(p_batch->'entries') is distinct from 'array' or jsonb_array_length(p_batch->'entries')>220
    or jsonb_typeof(p_batch->'conversationsComplete') is distinct from 'boolean'
    or jsonb_typeof(p_batch->'page') is distinct from 'number' or jsonb_typeof(p_batch->'nextPage') is distinct from 'number'
    or jsonb_typeof(p_batch->'observedAt') is distinct from 'string' then raise exception 'Ungültiger Inboximport' using errcode='22023'; end if;
  v_mode:=coalesce(p_batch->>'mode','backfill');
  if v_mode not in ('backfill','latest','detail') or (v_mode='detail') is distinct from (p_batch ? 'detailConversationId') then raise exception 'Ungültiger Inboxmodus' using errcode='22023'; end if;
  if v_mode='detail' then
    if jsonb_typeof(p_batch->'detailConversationId') is distinct from 'string' or p_batch->>'detailConversationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Ungültiges Gespräch' using errcode='22023'; end if;
    select external_id into v_detail_external from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and id=(p_batch->>'detailConversationId')::uuid;
    if not found then raise exception 'Gespräch nicht verfügbar' using errcode='42501'; end if;
  end if;
  begin v_observed:=(p_batch->>'observedAt')::timestamptz; v_page:=(p_batch->>'page')::integer; v_next_page:=(p_batch->>'nextPage')::integer;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then raise exception 'Ungültiger Inboximport' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('conversations','messages')),'-infinity')
    or (v_mode='backfill' and v_page<>v_grant.inbox_next_page)
    or (v_mode in ('latest','detail') and v_page<>1)
    or (v_mode='detail' and v_next_page<>v_grant.inbox_next_page)
    or v_page not between 1 and 20 or v_next_page not between 1 and 20
    or (v_mode='backfill' and v_next_page<>1 and v_next_page<>v_page+1)
    or (v_mode='latest' and v_next_page<>1 and v_next_page<>2 and v_next_page<>v_grant.inbox_next_page) then raise exception 'Veralteter Inboximport' using errcode='22023'; end if;
  v_complete:=(p_batch->>'conversationsComplete')::boolean;
  if v_mode='detail' and (v_complete or (select count(*) from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation')<>1
    or not exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation' and e->>'externalId'=v_detail_external)
    or exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='message' and e->>'parentExternalId'<>v_detail_external)) then raise exception 'Ungültiger Detailimport' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_batch->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Doppelte Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_batch->'entries') order by (value->>'kind'='message') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or jsonb_typeof(v_entry->'body') is distinct from 'object'
      or v_entry->>'kind' not in ('conversation','message') or v_entry->>'kind' is null
      or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^(?:[1-9][0-9]{0,31}|event:[0-9a-f]{64})$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry) field where field<>all(array['kind','externalId','parentExternalId','sortAt','body']))
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='conversation' then array['title','text','occurredAt','sourceUpdatedAt','detailCheckedAt','unread','imageUrl','itemId','itemTitle','itemImageUrl','itemPrice','itemCurrency','partnerId','lastActiveAt','transactionStatus'] else array['title','text','occurredAt','direction','messageType','priceLabel','imageUrls','eventType','eventGroup','offerStatus'] end))
      or jsonb_typeof(v_entry->'body'->'title') is distinct from 'string' or char_length(v_entry->'body'->>'title') not between 1 and 500
      or jsonb_typeof(v_entry->'body'->'text') is distinct from 'string' and jsonb_typeof(v_entry->'body'->'text') is distinct from 'null'
      or char_length(v_entry->'body'->>'text')>10000
      or jsonb_typeof(v_entry->'body'->'occurredAt') is distinct from 'string' then raise exception 'Ungültiger Kontoeintrag' using errcode='22023'; end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) or not isfinite((v_entry->'body'->>'occurredAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end;
    if v_entry->>'kind'='conversation' then
      v_conversations:=v_conversations+1;
      if v_conversations>20 or v_entry ? 'parentExternalId' or v_entry->>'externalId' !~ '^[1-9][0-9]{0,31}$'
        or (select count(*) from jsonb_object_keys(v_entry->'body')) not between 7 and 15
        or jsonb_typeof(v_entry->'body'->'sourceUpdatedAt') is distinct from 'string'
        or jsonb_typeof(v_entry->'body'->'detailCheckedAt') not in ('string','null')
        or jsonb_typeof(v_entry->'body'->'unread') not in ('boolean','null')
        or jsonb_typeof(v_entry->'body'->'imageUrl') not in ('string','null')
        or exists(select 1 from jsonb_each(v_entry->'body') field where
          (field.key in ('itemId','partnerId') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or field.value#>>'{}' !~ '^[1-9][0-9]{0,31}$'))
          or (field.key in ('itemTitle','transactionStatus') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or char_length(field.value#>>'{}')>500))
          or (field.key in ('itemImageUrl','imageUrl') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or field.value#>>'{}' !~ '^https://'))
          or (field.key='itemCurrency' and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or field.value#>>'{}' !~ '^[A-Z]{3}$'))
          or (field.key='itemPrice' and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'number' or (field.value#>>'{}')::numeric<0 or (field.value#>>'{}')::numeric>1000000000000))
          or (field.key='lastActiveAt' and field.value <> 'null'::jsonb and jsonb_typeof(field.value)<>'string')
        ) then raise exception 'Ungültiges Gespräch' using errcode='22023'; end if;
      begin
        if not isfinite((v_entry->'body'->>'sourceUpdatedAt')::timestamptz)
          or (v_entry->'body'->>'lastActiveAt' is not null and not isfinite((v_entry->'body'->>'lastActiveAt')::timestamptz))
          or (v_entry->'body'->>'detailCheckedAt' is not null and not isfinite((v_entry->'body'->>'detailCheckedAt')::timestamptz)) then raise exception 'Ungültige Gesprächszeit' using errcode='22023'; end if;
      exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Gesprächszeit' using errcode='22023'; end;
      select * into v_existing from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and external_id=v_entry->>'externalId' for update;
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
        values(p_workspace_id,p_connection_id,'conversation',v_entry->>'externalId',
          v_entry->'body' || coalesce((
              select jsonb_object_agg(field.key,field.value) from jsonb_each(v_existing.body) field
              where field.key=any(array['itemId','itemTitle','itemImageUrl','itemPrice','itemCurrency','partnerId','lastActiveAt','transactionStatus'])
                and (v_entry->'body'->field.key is null or v_entry->'body'->field.key='null'::jsonb)
            ),'{}'::jsonb) || case when v_existing.id is not null and v_existing.body->>'sourceUpdatedAt'=v_entry->'body'->>'sourceUpdatedAt' and v_entry->'body'->>'detailCheckedAt' is null
            -- Ein mitgelieferter Nachrichtenausschnitt belegt Vorschau und Zeit auch
            -- bei gekürztem Verlauf. Reine Listenbeschreibungen bleiben geschützt.
            and not exists (select 1 from jsonb_array_elements(p_batch->'entries') evidence
              where evidence->>'kind'='message' and evidence->>'parentExternalId'=v_entry->>'externalId'
                and evidence->'body'->>'text'=v_entry->'body'->>'text'
                and evidence->'body'->>'occurredAt'=v_entry->'body'->>'occurredAt')
            then jsonb_build_object('text',v_existing.body->'text','occurredAt',v_existing.body->'occurredAt','detailCheckedAt',v_existing.body->'detailCheckedAt') else '{}'::jsonb end,
          (v_entry->>'sortAt')::timestamptz,v_observed)
        on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    else
      v_messages:=v_messages+1;
      if v_messages>200 or jsonb_typeof(v_entry->'parentExternalId') is distinct from 'string' or v_entry->>'parentExternalId' !~ '^[1-9][0-9]{0,31}$'
        or (select count(*) from jsonb_object_keys(v_entry->'body')) not between 6 and 10
        or not exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation' and e->>'externalId'=v_entry->>'parentExternalId')
        or v_entry->'body'->>'direction' not in ('inbound','outbound','unknown')
        or jsonb_typeof(v_entry->'body'->'messageType') not in ('string','null')
        or jsonb_typeof(v_entry->'body'->'priceLabel') not in ('string','null')
        or exists(select 1 from jsonb_each(v_entry->'body') field where field.key in ('eventType','eventGroup','offerStatus') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or char_length(field.value#>>'{}')>500))
        or (v_entry->'body' ? 'imageUrls' and (jsonb_typeof(v_entry->'body'->'imageUrls')<>'array' or jsonb_array_length(v_entry->'body'->'imageUrls')>10))
        or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(v_entry->'body'->'imageUrls')='array' then v_entry->'body'->'imageUrls' else '[]'::jsonb end) image where jsonb_typeof(image)<>'string' or image#>>'{}' !~ '^https://') then raise exception 'Ungültige Nachricht' using errcode='22023'; end if;
      select id into v_parent from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and external_id=v_entry->>'parentExternalId';
      if v_parent is null then raise exception 'Nachricht ohne Gespräch' using errcode='22023'; end if;
      select * into v_existing from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='message' and external_id=v_entry->>'externalId' for update;
      if v_existing.id is not null and v_existing.parent_id<>v_parent then raise exception 'Nachricht mit anderem Gespräch' using errcode='22023'; end if;
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
        values(p_workspace_id,p_connection_id,'message',v_entry->>'externalId',v_parent,v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
        on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at where public.marketplace_account_entries.parent_id=excluded.parent_id;
    end if;
  end loop;
  if v_mode<>'detail' then
    insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
      values(p_workspace_id,p_connection_id,'conversations',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end)
      on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  end if;
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at)
    values(p_workspace_id,p_connection_id,'messages','partial',v_observed,v_observed)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at;
  update public.marketplace_connections set capabilities=capabilities || '{"conversations.read":"verified"}'::jsonb,last_synced_at=greatest(last_synced_at,v_observed),updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set inbox_next_page=case when v_mode='backfill' or (v_mode='latest' and inbox_next_page=1) then v_next_page else inbox_next_page end,last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  if p_batch ? 'inboxEvents' then
    if p_batch->'inboxEvents'->>'observedAt' is distinct from p_batch->>'observedAt' then raise exception 'Ungültiger Eingangsstand' using errcode='22023'; end if;
    perform public.marketplace_record_message_event_batch(p_workspace_id,p_connection_id,v_grant.external_account_id,p_batch->'inboxEvents');
  end if;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'observedAt',v_observed,'counts',jsonb_build_object('conversation',v_conversations,'message',v_messages),'conversationsComplete',v_complete,'nextPage',case when v_mode='detail' then v_grant.inbox_next_page else v_next_page end);
end;
$function$;

create or replace function public.marketplace_ingest_local_extension (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text,
  p_snapshot      jsonb default null::jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_observed timestamptz; v_entry jsonb; v_count integer:=0; v_complete boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or (v_connection.external_account_id is not null and v_connection.external_account_id<>v_grant.external_account_id) then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  if p_snapshot is null then
    update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
    return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',v_grant.messages_read,'messagesSend',v_grant.messages_send,'inboxSyncedAt',(
      select max(last_success_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('conversations','messages')));
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>524288
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object' or p_snapshot->'identity'->>'id' is distinct from v_grant.external_account_id then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array' or jsonb_array_length(p_snapshot->'entries')>501
    or jsonb_typeof(p_snapshot->'publicationsComplete') is distinct from 'boolean' or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or jsonb_typeof(p_snapshot->'identity'->'username') is distinct from 'string' or char_length(p_snapshot->'identity'->>'username') not between 1 and 120 then raise exception 'Ungültiger lokaler Import' using errcode='22023'; end if;
  begin v_observed:=(p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Abrufzeit' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('profile','publications')),'-infinity') then raise exception 'Veralteter Import' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind'='profile')<>1
    or exists(select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Ungültige Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or v_entry->>'kind' is null or v_entry->>'kind' not in ('profile','publication')
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^[1-9][0-9]{0,31}$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='profile' then array['username','displayName','location','bio','bioState','imageUrl','feedbackCount','feedbackReputation','positiveFeedbackCount','neutralFeedbackCount','negativeFeedbackCount','itemCount','observedAt'] else array['title','text','textState','occurredAt','createdAt','publicationState','publicationAge','price','currency','status','imageUrl','imageUrls','metrics','promoted','brand','size','priceLabel','isClosed','isReserved'] end))
      or (v_entry->>'kind'='profile' and (v_entry->>'externalId'<>v_grant.external_account_id or v_entry->'body'->>'username' is distinct from p_snapshot->'identity'->>'username')) then raise exception 'Ungültiger Kontoeintrag' using errcode='22023'; end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end;
    if v_entry->>'kind'='publication' then
      if (v_entry->'body' ? 'publicationState' and (
          jsonb_typeof(v_entry->'body'->'publicationState') is distinct from 'string'
          or v_entry->'body'->>'publicationState' not in ('active','reserved','draft','hidden','ended','unknown')))
        or (coalesce(v_entry->'body'->'createdAt','null'::jsonb)<>'null'::jsonb and (
          jsonb_typeof(v_entry->'body'->'createdAt') is distinct from 'string'
          or not public.marketplace_publication_time_valid(v_entry->'body'->>'createdAt',v_observed)))
        or (coalesce(v_entry->'body'->'occurredAt','null'::jsonb)<>'null'::jsonb and (
          jsonb_typeof(v_entry->'body'->'occurredAt') is distinct from 'string'
          or not public.marketplace_publication_time_valid(v_entry->'body'->>'occurredAt',v_observed)))
        or (coalesce(v_entry->'body'->'publicationAge','null'::jsonb)<>'null'::jsonb
          and public.marketplace_publication_age_sort_at(v_entry->'body'->'publicationAge',v_observed) is null)
      then raise exception 'Ungültige Inseratquelle' using errcode='22023'; end if;
    end if;
    if v_entry->>'kind'='publication' and not public.marketplace_relisting_import_allowed(p_workspace_id,p_connection_id,v_entry->>'externalId') then continue; end if;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_entry->>'kind',v_entry->>'externalId',v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
      on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    if v_entry->>'kind'='publication' then
      v_count:=v_count+1;
      perform public.marketplace_accept_relisting_import(p_workspace_id,p_connection_id,v_entry->>'externalId',v_observed);
    end if;
  end loop;
  v_complete:=(p_snapshot->>'publicationsComplete')::boolean;
  -- Auch vollständige lokale Lesekopien löschen niemals Anzeigen oder interpretieren fehlende Datensätze als Verkauf.
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
    values(p_workspace_id,p_connection_id,'profile','complete',v_observed,v_observed,v_observed),
      (p_workspace_id,p_connection_id,'publications',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,
      last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  update public.marketplace_connections set external_account_id=v_grant.external_account_id,status='connected',capabilities=capabilities || '{"profile.read":"verified","listings.read":"verified"}'::jsonb,last_synced_at=greatest(last_synced_at,v_observed),updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  -- Der bestehende Connection-Trigger sendet account_imported mit last_synced_at.
  return jsonb_build_object('ok',true,'counts',jsonb_build_object('profile',1,'publication',v_count),'observedAt',v_observed);
end;
$function$;

create or replace function public.marketplace_listing_permission_valid (
  p_permission_id bigint,
  p_user_id       uuid,
  p_version       bigint default null::bigint
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
declare v_permission public.marketplace_listing_permissions; v_connection public.marketplace_connections;
begin
  select * into v_permission from public.marketplace_listing_permissions where id=p_permission_id and approved_by=p_user_id and revoked_at is null;
  if not found or (p_version is not null and v_permission.authorization_version<>p_version)
    or not public.marketplace_local_extension_user_valid(p_user_id)
    or not public.marketplace_workspace_authorization_valid(v_permission.workspace_id,p_user_id) then return false; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=v_permission.workspace_id and id=v_permission.connection_id
    and marketplace='vinted' and status='connected' and execution_mode=v_permission.execution_mode and external_account_id=v_permission.external_account_id;
  if not found then return false; end if;
  if v_permission.execution_mode='local' then
    return exists(select 1 from public.marketplace_local_extension_grants where workspace_id=v_permission.workspace_id and connection_id=v_permission.connection_id
      and approved_by=p_user_id and external_account_id=v_permission.external_account_id and grant_generation=v_permission.local_grant_generation
      and revoked_at is null and expires_at>clock_timestamp());
  end if;
  return public.marketplace_sync_authorization_valid(v_permission.workspace_id,p_user_id)
    and exists(select 1 from public.marketplace_browser_profiles where id=v_permission.browser_profile_id and workspace_id=v_permission.workspace_id
    and connection_id=v_permission.connection_id and provider_profile_id=v_permission.provider_profile_id)
    and public.marketplace_cloud_network_valid(v_permission.workspace_id,v_permission.connection_id);
end;
$function$;

create or replace function public.marketplace_local_inbox_state (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_versions jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or not v_grant.messages_read or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('externalId',e.external_id,'sourceUpdatedAt',e.body->>'sourceUpdatedAt',
    'detailCheckedAt',e.body->>'detailCheckedAt','text',e.body->>'text','occurredAt',e.body->>'occurredAt') order by e.sort_at desc,e.id desc),'[]'::jsonb)
    into v_versions from (select * from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' order by sort_at desc,id desc limit 400) e;
  update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',true,'nextPage',v_grant.inbox_next_page,'versions',v_versions);
end;
$function$;

create or replace function public.marketplace_local_message_authorized (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text
)
  returns public.marketplace_local_extension_grants
  language plpgsql
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status<>'connected' then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or not v_grant.messages_send or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  return v_grant;
end;
$function$;

create or replace function public.marketplace_mark_conversation_read (
  p_workspace_id    uuid,
  p_connection_id   uuid,
  p_conversation_id uuid,
  p_read_version    text,
  p_observed_at     timestamp with time zone
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_entry public.marketplace_account_entries; v_version text; v_account text;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_read_version is null or p_read_version !~ '^[a-f0-9]{32}$' or p_observed_at is null or not isfinite(p_observed_at) or p_observed_at>clock_timestamp() then raise exception 'Ungültiger Lesebeleg' using errcode='22023'; end if;
  select e.* into v_entry from public.marketplace_account_entries e join public.marketplace_connections c on c.workspace_id=e.workspace_id and c.id=e.connection_id and c.marketplace='vinted' and c.status='connected'
    where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id and e.id=p_conversation_id and e.kind='conversation' for update of e;
  if not found then raise exception 'Gespräch nicht verfügbar' using errcode='42501'; end if;
  v_version:=public.marketplace_conversation_read_version(p_workspace_id,p_connection_id,p_conversation_id);
  -- Ein neuer Eingang während des Ladens wird nicht durch einen verspäteten Abschluss als gelesen markiert.
  if p_read_version is distinct from v_version or v_entry.body->>'detailCheckedAt' is null or (v_entry.body->>'detailCheckedAt')::timestamptz<p_observed_at then
    return jsonb_build_object('ok',true,'marked',false);
  end if;
  update public.marketplace_account_entries set conversation_read_version=v_version where id=v_entry.id;
  select external_account_id into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id;
  update public.marketplace_message_notifications n set read=true where n.workspace_id=p_workspace_id and n.connection_id=p_connection_id and n.conversation_id=p_conversation_id
    and n.external_account_id=v_account and not n.read and n.observed_at<=p_observed_at and n.notified_at is not null and n.cleared_at is null;
  if found then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return jsonb_build_object('ok',true,'marked',true);
end;
$function$;

create or replace function public.marketplace_mark_favorite_notifications (
  p_workspace_id    uuid,
  p_notification_id text    default null::text,
  p_clear           boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id)
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_clear is null then raise exception 'Ungültige Meldungsaktion' using errcode = '22023'; end if;
  if p_clear then
    delete from public.marketplace_favorite_notifications where workspace_id = p_workspace_id and (p_notification_id is null or id::text = p_notification_id);
  else
    update public.marketplace_favorite_notifications set read = true where workspace_id = p_workspace_id and not read and (p_notification_id is null or id::text = p_notification_id);
  end if;
  if found then perform realtime.send('{}'::jsonb,'favorite_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_notifications',true); end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.marketplace_mark_feedback_notifications (
  p_workspace_id    uuid,
  p_notification_id text    default null::text,
  p_clear           boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id)
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_clear is null then raise exception 'Ungültige Meldungsaktion' using errcode = '22023'; end if;
  -- Kennungen aufbewahren, damit geleerte Meldungen beim nächsten Abruf nicht zurückkehren.
  update public.marketplace_feedback_notifications set read = true,cleared_at = case when p_clear then clock_timestamp() else cleared_at end
  where workspace_id = p_workspace_id and notified_at is not null and cleared_at is null
    and (p_clear or not read) and (p_notification_id is null or id::text = p_notification_id);
  if found then perform realtime.send('{}'::jsonb,'feedback_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_feedback_notifications',true); end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.marketplace_mark_message_notifications (
  p_workspace_id    uuid,
  p_notification_id text    default null::text,
  p_clear           boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_clear is null or (p_notification_id is not null and p_notification_id !~ '^[1-9][0-9]{0,18}$') then raise exception 'Ungültige Meldungsaktion' using errcode='22023'; end if;
  update public.marketplace_message_notifications n set read=true,cleared_at=case when p_clear then clock_timestamp() else cleared_at end where n.workspace_id=p_workspace_id and n.notified_at is not null and n.cleared_at is null and (p_clear or not n.read) and (p_notification_id is null or n.id::text=p_notification_id)
    and exists(select 1 from public.marketplace_connections c where c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id);
  if found then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.marketplace_negotiation_authorized (
  p_workspace_id          uuid,
  p_connection_id         uuid,
  p_user_id               uuid,
  p_mode                  text,
  p_account_id            text,
  p_grant_generation      bigint,
  p_authorization_version bigint
)
  returns boolean
  language sql
  set search_path to ''
  as $function$
  select public.marketplace_workspace_authorization_valid(p_workspace_id,p_user_id)
    and public.marketplace_local_extension_user_valid(p_user_id)
    and exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' and status='connected' and execution_mode=p_mode and external_account_id=p_account_id)
    and case p_mode when 'cloud' then public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,p_user_id,p_authorization_version)
      and public.marketplace_cloud_write_available(p_workspace_id,p_connection_id)
    when 'local' then exists(select 1 from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and approved_by=p_user_id and external_account_id=p_account_id
      and grant_generation=p_grant_generation and messages_read and messages_send and revoked_at is null and expires_at>clock_timestamp()) else false end;
$function$;

create or replace function public.marketplace_request_relisting_import (
  p_job public.marketplace_listing_jobs
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
begin
  if p_job.state<>'confirmed' or p_job.action<>'publish' or p_job.execution_mode<>'cloud' or not (p_job.snapshot ? 'relistExternalId')
    or not public.marketplace_relisting_job_is_latest(p_job)
    or p_job.relist_imported_at is not null or not public.marketplace_workspace_authorization_valid(p_job.workspace_id,p_job.requested_by)
    or not exists(select 1 from public.marketplace_connections where id=p_job.connection_id and workspace_id=p_job.workspace_id
      and external_account_id=p_job.external_account_id and execution_mode='cloud' and status='connected') then return; end if;
  if exists(select 1 from public.marketplace_operations where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id
    and created_at>=p_job.finished_at and (state in ('queued','running') or finished_at>clock_timestamp()-interval '1 minute')) then return; end if;
  insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,created_at)
    values(p_job.workspace_id,p_job.connection_id,p_job.requested_by,'manual_read',1,clock_timestamp())
    on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
end;
$function$;

create or replace function public.marketplace_retry_local_message (
  p_workspace_id      uuid,
  p_connection_id     uuid,
  p_conversation_id   uuid,
  p_message_id        uuid,
  p_confirmed_unknown boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_message public.marketplace_local_message_outbox; v_attachment jsonb; v_result jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_message from public.marketplace_local_message_outbox
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and conversation_id=p_conversation_id and id=p_message_id for update;
  if not found or v_message.requested_by<>(select auth.uid()) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if not exists(select 1 from public.marketplace_local_extension_grants g join public.marketplace_connections c on c.workspace_id=g.workspace_id and c.id=g.connection_id
    where g.workspace_id=p_workspace_id and g.connection_id=p_connection_id and g.approved_by=(select auth.uid()) and g.messages_send
      and g.revoked_at is null and g.expires_at>clock_timestamp() and g.external_account_id=v_message.external_account_id
      and c.external_account_id=v_message.external_account_id and c.execution_mode='local' and c.status='connected')
    then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  if v_message.state='outcome_unknown' and p_confirmed_unknown is distinct from true then raise exception 'Unklaren Versand zuerst prüfen' using errcode='22023'; end if;
  if v_message.state not in ('failed','outcome_unknown') and not (v_message.state='cancelled' and v_message.error_code='retried')
    then raise exception 'Nachricht kann nicht wiederholt werden' using errcode='22023'; end if;
  if v_message.state='outcome_unknown' and v_message.attachment_name is null and exists(select 1 from public.marketplace_account_entries
    where workspace_id=p_workspace_id and connection_id=p_connection_id and parent_id=p_conversation_id and kind='message'
      and body->>'direction'='outbound' and body->>'text'=v_message.message_text and sort_at>=v_message.created_at)
    then raise exception 'Nachricht bereits im Verlauf vorhanden' using errcode='22023'; end if;
  if v_message.attachment_name is not null then
    v_attachment:=jsonb_build_object('name',v_message.attachment_name,'mimeType',v_message.attachment_mime_type,'base64',v_message.attachment_base64);
  end if;
  -- Die ursprüngliche Nachrichten-ID ist die dauerhafte Kennung genau dieser Wiederholung.
  v_result:=public.marketplace_enqueue_local_message(p_workspace_id,p_connection_id,p_conversation_id,v_message.id,v_message.message_text,v_attachment);
  update public.marketplace_local_message_outbox set state='cancelled',error_code='retried',lease_expires_at=null,updated_at=clock_timestamp() where id=v_message.id;
  return v_result;
end;
$function$;

create or replace function public.marketplace_save_favorite_messages (
  p_workspace_id     uuid,
  p_connection_id    uuid,
  p_enabled          boolean,
  p_config           jsonb,
  p_expected_version bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_settings public.marketplace_favorite_message_settings; v_grant public.marketplace_local_extension_grants; v_connection public.marketplace_connections; v_permission public.marketplace_cloud_message_permissions;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid()))
    or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_enabled is null or p_expected_version is null or not public.marketplace_favorite_message_config_valid(p_config) then raise exception 'Ungültige Favoriteneinstellung' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if coalesce(v_settings.version,0)<>p_expected_version then raise exception 'Einstellung inzwischen geändert' using errcode='40001'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if p_enabled and v_connection.execution_mode='local' and (v_connection.status<>'connected' or v_grant.id is null or v_grant.approved_by<>(select auth.uid())
    or not v_grant.messages_read or not v_grant.messages_send or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or v_connection.external_account_id is distinct from v_grant.external_account_id) then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  if p_enabled and v_connection.execution_mode='cloud' and not public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,(select auth.uid())) then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id;
  insert into public.marketplace_favorite_message_settings(workspace_id,connection_id,enabled,config,version,activated_at,external_account_id,grant_generation,execution_mode,approved_by,cloud_authorization_version)
    values(p_workspace_id,p_connection_id,p_enabled,p_config,1,case when p_enabled then clock_timestamp() end,v_connection.external_account_id,case when v_connection.execution_mode='local' then v_grant.grant_generation end,v_connection.execution_mode,(select auth.uid()),case when v_connection.execution_mode='cloud' then v_permission.authorization_version end)
    on conflict(workspace_id,connection_id) do update set enabled=excluded.enabled,config=excluded.config,version=public.marketplace_favorite_message_settings.version+1,
      activated_at=case when excluded.enabled and (not public.marketplace_favorite_message_settings.enabled or public.marketplace_favorite_message_settings.execution_mode is distinct from excluded.execution_mode or public.marketplace_favorite_message_settings.cloud_authorization_version is distinct from excluded.cloud_authorization_version or public.marketplace_favorite_message_settings.grant_generation is distinct from excluded.grant_generation or public.marketplace_favorite_message_settings.external_account_id is distinct from excluded.external_account_id) then clock_timestamp() else public.marketplace_favorite_message_settings.activated_at end,
      external_account_id=excluded.external_account_id,grant_generation=excluded.grant_generation,execution_mode=excluded.execution_mode,approved_by=excluded.approved_by,cloud_authorization_version=excluded.cloud_authorization_version;
  -- Neue Regeln ändern keinen bereits begonnenen Versuch. Noch wartende Texte werden verworfen.
  update public.marketplace_favorite_message_events set state='cancelled',error_code='settings_changed',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','claimed');
  update public.marketplace_favorite_message_events set offer_state='skipped',offer_error_code='configuration_changed',lease_expires_at=null,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and offer_state in ('pending','claimed');
  return public.marketplace_read_favorite_messages(p_workspace_id,p_connection_id);
end;
$function$;

create or replace function public.marketplace_save_negotiation (
  p_workspace_id     uuid,
  p_connection_id    uuid,
  p_expected_version bigint,
  p_enabled          boolean,
  p_config           jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_settings public.marketplace_negotiation_settings; v_grant public.marketplace_local_extension_grants; v_permission public.marketplace_cloud_message_permissions;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<0 or p_enabled is null or not public.marketplace_negotiation_config_valid(p_config) then raise exception 'Ungültige Verhandlungseinstellung' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_settings from public.marketplace_negotiation_settings where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if coalesce(v_settings.version,0)<>p_expected_version then raise exception 'Einstellung inzwischen geändert' using errcode='40001'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if (p_enabled or (p_config->>'purchaseEnabled')::boolean) and not public.marketplace_negotiation_authorized(p_workspace_id,p_connection_id,(select auth.uid()),v_connection.execution_mode,v_connection.external_account_id,v_grant.grant_generation,v_permission.authorization_version) then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  insert into public.marketplace_negotiation_settings(workspace_id,connection_id,enabled,config,approved_by,execution_mode,external_account_id,grant_generation,cloud_authorization_version)
    values(p_workspace_id,p_connection_id,p_enabled,p_config,(select auth.uid()),v_connection.execution_mode,v_connection.external_account_id,case when v_connection.execution_mode='local' then v_grant.grant_generation end,case when v_connection.execution_mode='cloud' then v_permission.authorization_version end)
    on conflict(workspace_id,connection_id) do update set enabled=excluded.enabled,config=excluded.config,version=public.marketplace_negotiation_settings.version+1,activated_at=clock_timestamp(),approved_by=excluded.approved_by,execution_mode=excluded.execution_mode,external_account_id=excluded.external_account_id,grant_generation=excluded.grant_generation,cloud_authorization_version=excluded.cloud_authorization_version,updated_at=clock_timestamp();
  update public.marketplace_negotiation_jobs set state='cancelled',error_code='settings_changed',updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and automated and state in ('queued','claimed');
  return public.marketplace_read_negotiation(p_workspace_id,p_connection_id);
end;
$function$;

create or replace function public.marketplace_set_favorite_notification_settings (
  p_workspace_id     uuid,
  p_connection_id    uuid,
  p_enabled          boolean,
  p_expected_version bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setting public.marketplace_favorite_notification_settings;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_enabled is null or p_expected_version is null or p_expected_version < 0 then raise exception 'Ungültige Meldungseinstellung' using errcode = '22023'; end if;
  select * into v_setting from public.marketplace_favorite_notification_settings where workspace_id = p_workspace_id and connection_id = p_connection_id for update;
  if coalesce(v_setting.version,0) <> p_expected_version then raise exception 'Meldungseinstellung wurde zwischenzeitlich geändert' using errcode = '40001'; end if;
  if not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_setting.id is null then
    insert into public.marketplace_favorite_notification_settings(workspace_id,connection_id,enabled) values(p_workspace_id,p_connection_id,p_enabled);
  elsif v_setting.enabled <> p_enabled then
    update public.marketplace_favorite_notification_settings set enabled = p_enabled, version = version + 1, baseline_pending = true where id = v_setting.id;
  end if;
  return public.marketplace_read_favorite_notification_settings(p_workspace_id,p_connection_id);
end;
$function$;

create or replace function public.marketplace_set_message_notification_settings (
  p_workspace_id     uuid,
  p_connection_id    uuid,
  p_enabled          boolean,
  p_expected_version bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setting public.marketplace_message_notification_settings;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then
    raise exception 'Kontozugriff verweigert' using errcode='42501';
  end if;
  perform 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_enabled is null or p_expected_version is null or p_expected_version<0 then raise exception 'Ungültige Meldungseinstellung' using errcode='22023'; end if;
  select * into v_setting from public.marketplace_message_notification_settings where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if coalesce(v_setting.version,0)<>p_expected_version then raise exception 'Meldungseinstellung wurde zwischenzeitlich geändert' using errcode='40001'; end if;
  if v_setting.id is null then
    insert into public.marketplace_message_notification_settings(workspace_id,connection_id,enabled,enabled_since) values(p_workspace_id,p_connection_id,p_enabled,clock_timestamp());
  elsif exists(select 1 from jsonb_each(public.marketplace_notification_categories(v_setting.enabled,v_setting.categories)) c where c.key<>'feedback' and c.value<>to_jsonb(p_enabled)) then
    -- Alte Clients behalten ihren Gesamtschalter; die eigenständige Bewertungswahl bleibt erhalten.
    update public.marketplace_message_notification_settings set enabled=p_enabled,version=version+1,enabled_since=clock_timestamp(),
      categories=jsonb_build_object('messages',p_enabled,'offers',p_enabled,'orders',p_enabled,'shipping',p_enabled,'payments',p_enabled,
        'feedback',(public.marketplace_notification_categories(v_setting.enabled,v_setting.categories)->>'feedback')::boolean,'other',p_enabled),
      category_enabled_since=jsonb_build_object('messages',extract(epoch from date_trunc('second',clock_timestamp())),'offers',extract(epoch from date_trunc('second',clock_timestamp())),
        'orders',extract(epoch from date_trunc('second',clock_timestamp())),'shipping',extract(epoch from date_trunc('second',clock_timestamp())),'payments',extract(epoch from date_trunc('second',clock_timestamp())),
        'other',extract(epoch from date_trunc('second',clock_timestamp()))) || case when v_setting.category_enabled_since ? 'feedback'
          then jsonb_build_object('feedback',v_setting.category_enabled_since->'feedback') else '{}'::jsonb end
    where id=v_setting.id;
  end if;
  return public.marketplace_read_message_notification_settings(p_workspace_id,p_connection_id);
end;
$function$;

create or replace function public.marketplace_set_notification_category_settings (
  p_workspace_id     uuid,
  p_connection_id    uuid,
  p_category         text,
  p_enabled          boolean,
  p_expected_version bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setting public.marketplace_message_notification_settings; v_categories jsonb; v_since jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then
    raise exception 'Kontozugriff verweigert' using errcode='42501';
  end if;
  perform 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_category is null or p_category<>all(array['messages','offers','orders','shipping','payments','feedback','other'])
    or p_enabled is null or p_expected_version is null or p_expected_version<0 then
    raise exception 'Ungültige Meldungseinstellung' using errcode='22023';
  end if;
  select * into v_setting from public.marketplace_message_notification_settings where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if coalesce(v_setting.version,0)<>p_expected_version then raise exception 'Meldungseinstellung wurde zwischenzeitlich geändert' using errcode='40001'; end if;
  v_categories:=public.marketplace_notification_categories(v_setting.enabled,v_setting.categories);
  -- Die bisherige Zeitgrenze materialisieren, damit eine Einzelwahl andere Kategorien nicht beeinflusst.
  select coalesce(jsonb_object_agg(c.key,coalesce(v_setting.category_enabled_since->c.key,
    to_jsonb(case when c.key<>'feedback' then coalesce(extract(epoch from v_setting.enabled_since),0) else 0 end))),'{}'::jsonb)
    into v_since from jsonb_each(v_categories) c;
  if v_setting.id is null or (v_categories->>p_category)::boolean<>p_enabled then
    v_categories:=jsonb_set(v_categories,array[p_category],to_jsonb(p_enabled));
    -- Anbieterzeiten besitzen teils nur Sekunden. Die gleiche Quellsekunde bleibt zulässig,
    -- damit unmittelbar nach Aktivierung entstandene Ereignisse nicht dauerhaft verloren gehen.
    v_since:=jsonb_set(v_since,array[p_category],to_jsonb(extract(epoch from date_trunc('second',clock_timestamp()))));
    if v_setting.id is null then
      insert into public.marketplace_message_notification_settings(workspace_id,connection_id,enabled,categories,category_enabled_since)
      values(p_workspace_id,p_connection_id,(v_categories->>'messages')::boolean,v_categories,v_since);
    else
      update public.marketplace_message_notification_settings set enabled=(v_categories->>'messages')::boolean,
        categories=v_categories,category_enabled_since=v_since,version=version+1 where id=v_setting.id;
    end if;
  end if;
  return public.marketplace_read_message_notification_settings(p_workspace_id,p_connection_id);
end;
$function$;

create or replace function public.marketplace_sync_enqueue (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_operation public.marketplace_operations;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage_cloud(p_workspace_id) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  perform 1 from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id
      and marketplace = 'vinted' and execution_mode = 'cloud' and status = 'connected' for update;
  if not found then raise exception 'Konto nicht verbunden' using errcode = '22023'; end if;
  insert into public.marketplace_operations (workspace_id, connection_id, requested_by, authorization_kind, authorization_version)
    values (p_workspace_id, p_connection_id, (select auth.uid()), 'manual_read', 1)
    on conflict (workspace_id, connection_id) where state in ('queued', 'running') do nothing
    returning * into v_operation;
  if v_operation.id is null then
    select * into v_operation from public.marketplace_operations
      where workspace_id = p_workspace_id and connection_id = p_connection_id
        and state in ('queued', 'running');
  end if;
  if v_operation.id is null then raise exception 'Auftrag konnte nicht angelegt werden'; end if;
  -- Der ausdrückliche Klick erteilt eine neue einmalige Freigabe; laufende Aufträge bleiben unverändert.
  if v_operation.state='queued' and v_operation.authorization_kind='scheduled_read' and v_operation.authorization_version=1 then
    update public.marketplace_operations set requested_by=(select auth.uid()),authorization_kind='manual_read',schedule_id=null,schedule_authorization_version=null
      where id=v_operation.id and state='queued' and authorization_kind='scheduled_read' returning * into v_operation;
  end if;
  return jsonb_build_object('id', v_operation.id, 'requestedBy', v_operation.requested_by,
    'state', v_operation.state, 'stage', v_operation.stage);
end;
$function$;

create or replace function public.marketplace_test_session_action (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid,
  p_action        text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_session public.marketplace_browser_test_sessions; v_status text; v_accepted boolean := false;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('ping', 'interrupt', 'revoke') then
    raise exception 'Unbekannte Testaktion' using errcode = '22023'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_test_sessions
    where id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid()) for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  if v_session.state = 'active' and v_session.expires_at <= clock_timestamp() then
    update public.marketplace_browser_test_sessions set state = 'expired', ended_at = clock_timestamp()
      where id = p_session_id returning * into v_session;
  elsif v_session.state = 'active' and v_status not in ('paused', 'blocked') then
    v_accepted := true;
    if p_action = 'ping' then
      update public.marketplace_browser_test_sessions
        set interaction_count = interaction_count + 1, last_seen_at = clock_timestamp()
        where id = p_session_id returning * into v_session;
    else
      update public.marketplace_browser_test_sessions
        set state = case when p_action = 'interrupt' then 'interrupted' else 'revoked' end,
            ended_at = clock_timestamp()
        where id = p_session_id returning * into v_session;
    end if;
  end if;
  return jsonb_build_object('id', v_session.id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state,
    'expiresAt', v_session.expires_at, 'interactionCount', v_session.interaction_count,
    'accepted', v_accepted);
end;
$function$;

create or replace function public.marketplace_test_session_start (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_status text; v_session public.marketplace_browser_test_sessions;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  -- Die Verbindungssperre serialisiert konkurrierende Starts desselben Kontos.
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_status in ('paused', 'blocked') then raise exception 'Verbindung ist nicht verfügbar' using errcode = '22023'; end if;
  update public.marketplace_browser_test_sessions set state = 'expired', ended_at = clock_timestamp()
    where workspace_id = p_workspace_id and connection_id = p_connection_id and state = 'active' and expires_at <= clock_timestamp();
  if exists (select 1 from public.marketplace_browser_test_sessions
    where workspace_id = p_workspace_id and connection_id = p_connection_id and state = 'active')
  then raise exception 'Konto wird bereits bedient' using errcode = '55P03'; end if;
  insert into public.marketplace_browser_test_sessions (workspace_id, connection_id, started_by, expires_at)
    values (p_workspace_id, p_connection_id, (select auth.uid()), clock_timestamp() + interval '2 minutes')
    returning * into v_session;
  return jsonb_build_object('id', v_session.id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state,
    'expiresAt', v_session.expires_at, 'interactionCount', v_session.interaction_count);
end;
$function$;

create or replace function public.marketplace_test_session_status (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare v_session public.marketplace_browser_test_sessions; v_state text;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_test_sessions
    where id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid());
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  v_state := case when v_session.state = 'active' and v_session.expires_at <= statement_timestamp()
    then 'expired' else v_session.state end;
  return jsonb_build_object('id', v_session.id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_state,
    'expiresAt', v_session.expires_at, 'interactionCount', v_session.interaction_count);
end;
$function$;

create function public.marketplace_workspace_authorization_valid (
  p_workspace_id uuid,
  p_user_id      uuid
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
begin
  if not public.workspace_access_is_valid(p_workspace_id)
    or not public.marketplace_local_extension_user_valid(p_user_id) then return false; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin') for share;
  if not found then return false; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  return found;
end;
$function$;

revoke all on function public.marketplace_workspace_authorization_valid(uuid, uuid) from public;

grant all on function public.marketplace_workspace_authorization_valid(uuid, uuid) to service_role;

create policy "Operators read their browser tests" on public.marketplace_browser_test_sessions
  for select
  to authenticated
  using (((started_by = ( select auth.uid() as uid)) and public.marketplace_can_manage_cloud(workspace_id)));

create policy "Administrators read account operations" on public.marketplace_operations
  for select
  to authenticated
  using (public.marketplace_can_manage_cloud(workspace_id));

-- Explizite Rechte der beiden neuen Prüffunktionen aus dem deklarativen Schema.
revoke all on function public.marketplace_can_manage_cloud(uuid) from public, anon;
grant execute on function public.marketplace_can_manage_cloud(uuid) to authenticated;
revoke all on function public.marketplace_workspace_authorization_valid(uuid, uuid) from public, anon, authenticated;
grant execute on function public.marketplace_workspace_authorization_valid(uuid, uuid) to service_role;
