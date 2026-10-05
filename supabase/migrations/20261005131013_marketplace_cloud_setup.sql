-- Fester ISP-IP-Bestand, Cloud-Einrichtung und atomare lokale Übergabe.
SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.marketplace_browser_session_check(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text; v_session public.marketplace_browser_sessions; v_active boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
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
CREATE FUNCTION public.marketplace_cloud_network_valid(p_workspace_id uuid, p_connection_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists(select 1 from public.marketplace_cloud_setups where workspace_id=p_workspace_id and connection_id=p_connection_id)
    or exists(select 1 from public.marketplace_cloud_setups setup join public.marketplace_cloud_ips ip on ip.id=setup.cloud_ip_id
      where setup.workspace_id=p_workspace_id and setup.connection_id=p_connection_id and setup.state='completed'
        and ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>now());
$function$;
REVOKE ALL ON FUNCTION public.marketplace_cloud_network_valid(uuid, uuid) FROM authenticated;
CREATE FUNCTION public.marketplace_cloud_setup_begin(p_workspace_id uuid, p_connection_id uuid, p_request_id uuid, p_display_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_setup public.marketplace_cloud_setups; v_connection public.marketplace_connections; v_ip_id bigint; v_generation bigint; v_revoked_at timestamptz;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_local_extension_user_valid((select auth.uid())) then
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
    if v_connection.execution_mode<>'local' and v_connection.external_account_id is not null then raise exception 'Cloudkonto ist bereits verbunden' using errcode='22023'; end if;
    if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping')) then
      raise exception 'Browsersitzung muss zuerst beendet werden' using errcode='55P03'; end if;
    select grant_generation,revoked_at into v_generation,v_revoked_at from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  end if;
  select ip.id into v_ip_id from public.marketplace_cloud_ips ip
    where ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>clock_timestamp()
      and not exists(select 1 from public.marketplace_cloud_setups setup where setup.cloud_ip_id=ip.id and setup.state<>'cancelled')
    order by ip.created_at,ip.id limit 1 for update of ip skip locked;
  if not found then return jsonb_build_object('status','no_capacity'); end if;
  if p_connection_id is null then
    insert into public.marketplace_connections(workspace_id,display_name) values(p_workspace_id,btrim(p_display_name)) returning * into v_connection;
  end if;
  insert into public.marketplace_cloud_setups(workspace_id,connection_id,requested_by,request_id,requested_name,is_new_connection,cloud_ip_id,expected_external_account_id,expected_grant_generation,expected_grant_revoked_at)
    values(p_workspace_id,v_connection.id,(select auth.uid()),p_request_id,case when p_connection_id is null then btrim(p_display_name) end,p_connection_id is null,v_ip_id,v_connection.external_account_id,v_generation,v_revoked_at)
    returning * into v_setup;
  return jsonb_build_object('status','ready','setup',public.marketplace_cloud_setup_public(v_setup));
end;
$function$;
CREATE FUNCTION public.marketplace_cloud_setup_cancel(p_workspace_id uuid, p_setup_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_setup public.marketplace_cloud_setups;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_cloud_setup_read(p_workspace_id,p_setup_id);
  select * into v_setup from public.marketplace_cloud_setups where public_id=p_setup_id for update;
  if v_setup.state not in ('completed','cancelled') then
    update public.marketplace_cloud_setups set state='cleanup_pending',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
  end if;
  return public.marketplace_cloud_setup_public(v_setup);
end;
$function$;
CREATE FUNCTION public.marketplace_cloud_setup_read(p_workspace_id uuid, p_setup_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_setup public.marketplace_cloud_setups;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_setup from public.marketplace_cloud_setups where workspace_id=p_workspace_id and public_id=p_setup_id and requested_by=(select auth.uid());
  if not found then raise exception 'Einrichtungszugriff verweigert' using errcode='42501'; end if;
  return public.marketplace_cloud_setup_public(v_setup);
end;
$function$;
CREATE FUNCTION public.marketplace_cloud_setup_session_check(p_workspace_id uuid, p_setup_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_setup public.marketplace_cloud_setups; v_session public.marketplace_browser_sessions; v_active boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_cloud_setup_read(p_workspace_id,p_setup_id);
  select * into v_setup from public.marketplace_cloud_setups where public_id=p_setup_id;
  select * into v_session from public.marketplace_browser_sessions where cloud_setup_id=p_setup_id and public_id=p_session_id and started_by=(select auth.uid()) for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode='42501'; end if;
  v_active:=v_session.state='active' and v_session.expires_at>clock_timestamp() and v_setup.expires_at>clock_timestamp()
    and v_setup.state in ('login','verified') and exists(select 1 from public.marketplace_cloud_ips where id=v_setup.cloud_ip_id and enabled and country_code='DE' and is_dedicated_isp and verified_at is not null and expires_at>clock_timestamp())
    and exists(select 1 from public.marketplace_worker_runtime where id=1 and worker_id=v_session.worker_id and worker_epoch=v_session.worker_epoch and expires_at>clock_timestamp());
  return jsonb_build_object('id',v_session.public_id,'workspaceId',v_session.workspace_id,'connectionId',v_session.connection_id,'active',v_active);
end;
$function$;
CREATE FUNCTION public.marketplace_cloud_setup_session_reserve(p_workspace_id uuid, p_setup_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_setup public.marketplace_cloud_setups; v_session public.marketplace_browser_sessions;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_cloud_setup_read(p_workspace_id,p_setup_id);
  select * into v_setup from public.marketplace_cloud_setups where public_id=p_setup_id for update;
  if v_setup.state not in ('login','verified') or v_setup.provider_profile_id is null or v_setup.expires_at<=clock_timestamp() then raise exception 'Einrichtung nicht verfügbar' using errcode='55000'; end if;
  if exists(select 1 from public.marketplace_browser_sessions where state in ('active','stopping')) then raise exception 'Browser wird bereits bedient oder bereinigt' using errcode='55P03'; end if;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,cloud_setup_id)
    values(p_workspace_id,v_setup.connection_id,(select auth.uid()),v_setup.provider_profile_id,least(v_setup.expires_at,clock_timestamp()+interval '10 minutes'),p_setup_id) returning * into v_session;
  return jsonb_build_object('id',v_session.public_id,'workspaceId',v_session.workspace_id,'connectionId',v_session.connection_id,'state',v_session.state,'expiresAt',v_session.expires_at);
end;
$function$;
CREATE FUNCTION public.marketplace_cloud_setup_update(p_workspace_id uuid, p_setup_id uuid, p_user_id uuid, p_worker_id uuid, p_worker_epoch bigint, p_action text, p_profile_id text DEFAULT NULL::text, p_external_account_id text DEFAULT NULL::text, p_username text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_setup public.marketplace_cloud_setups; v_connection public.marketplace_connections; v_ip public.marketplace_cloud_ips; v_generation bigint; v_revoked_at timestamptz;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_action is null or p_action not in ('claim','bind','verify','finalize','complete','release','cleanup','recover','detach','unmap') then raise exception 'Ungültiger Einrichtungsschritt' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Workerfreigabe abgelaufen' using errcode='42501'; end if;
  select * into v_setup from public.marketplace_cloud_setups where workspace_id=p_workspace_id and public_id=p_setup_id and requested_by=p_user_id;
  if not found then raise exception 'Einrichtungszugriff verweigert' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=v_setup.connection_id for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_setup from public.marketplace_cloud_setups where id=v_setup.id for update;
  select * into v_ip from public.marketplace_cloud_ips where id=v_setup.cloud_ip_id for update;
  -- Bereinigung darf auch nach Rechteentzug stattfinden; sie erteilt keine neuen Kontorechte.
  if p_action not in ('cleanup','release','recover','detach') and
    (not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id)) then
    raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_action not in ('cleanup','release','recover','detach') and
    (not v_ip.enabled or v_ip.country_code<>'DE' or not v_ip.is_dedicated_isp or v_ip.verified_at is null or v_ip.expires_at<=clock_timestamp()) then
    raise exception 'Cloud-IP nicht verfügbar' using errcode='55000'; end if;
  if p_action in ('claim','recover') then
    if v_setup.state='cancelled' and p_action='claim' then raise exception 'Einrichtung beendet' using errcode='55000'; end if;
    if v_setup.worker_epoch is distinct from p_worker_epoch or v_setup.worker_id is distinct from p_worker_id then
      if exists(select 1 from public.marketplace_browser_sessions where cloud_setup_id=p_setup_id and state in ('active','stopping')) then
        raise exception 'Browserbereinigung ausstehend' using errcode='55P03'; end if;
      update public.marketplace_cloud_setups set worker_id=p_worker_id,worker_epoch=p_worker_epoch,updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
    end if;
    if p_action='recover' and v_setup.state not in ('completed','cancelled') then
      update public.marketplace_cloud_setups set state='cleanup_pending',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
    end if;
  else
    if v_setup.worker_id is distinct from p_worker_id or v_setup.worker_epoch is distinct from p_worker_epoch then raise exception 'Veraltete Workerfreigabe' using errcode='42501'; end if;
    if p_action in ('bind','verify','finalize','complete') and v_setup.state<>'completed' then
      if v_setup.expires_at<=clock_timestamp() or v_connection.status in ('paused','blocked') then raise exception 'Einrichtung nicht verfügbar' using errcode='55000'; end if;
      select grant_generation,revoked_at into v_generation,v_revoked_at from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=v_connection.id;
      if v_generation is distinct from v_setup.expected_grant_generation or v_revoked_at is distinct from v_setup.expected_grant_revoked_at
        or v_connection.external_account_id is distinct from v_setup.expected_external_account_id then
        raise exception 'Kontofreigabe wurde geändert' using errcode='42501'; end if;
    end if;
    if p_action in ('unmap','detach') then
      if (p_action='unmap' and v_setup.state<>'reserved') or (p_action='detach' and v_setup.state<>'cleanup_pending') then
        raise exception 'Profilbereinigung nicht angefordert' using errcode='55000'; end if;
      if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('active','stopping')) then
        raise exception 'Browserstopp nicht bestätigt' using errcode='55P03'; end if;
      if p_action='detach' and p_profile_id is distinct from v_setup.provider_profile_id then
        raise exception 'Profilzuordnung wurde geändert' using errcode='42501'; end if;
      if p_action='unmap' and p_profile_id is not null then
        if v_setup.previous_provider_profile_id is not null and v_setup.previous_provider_profile_id<>p_profile_id then
          raise exception 'Profilzuordnung wurde geändert' using errcode='42501'; end if;
        update public.marketplace_cloud_setups set previous_provider_profile_id=p_profile_id where id=v_setup.id returning * into v_setup;
      end if;
      delete from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=v_connection.id and provider_profile_id=p_profile_id;
      if exists(select 1 from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=v_connection.id) then
        raise exception 'Profilzuordnung wurde geändert' using errcode='42501'; end if;
    elsif p_action='bind' then
      if v_setup.state not in ('reserved','login') or p_profile_id is null or p_profile_id !~ '^chromium_[0-9a-f-]{36}$'
        or (v_setup.provider_profile_id is not null and v_setup.provider_profile_id<>p_profile_id) then raise exception 'Profilzuordnung ungültig' using errcode='42501'; end if;
      insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id)
        values(p_workspace_id,v_connection.id,p_profile_id) on conflict(workspace_id,connection_id) do nothing;
      if not exists(select 1 from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=v_connection.id and provider_profile_id=p_profile_id) then
        raise exception 'Profilzuordnung wurde geändert' using errcode='42501'; end if;
      update public.marketplace_cloud_setups set provider_profile_id=p_profile_id,state='login',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
    elsif p_action='verify' then
      if v_setup.state not in ('login','verified') or p_external_account_id is null or p_external_account_id !~ '^[1-9][0-9]{0,31}$'
        or p_username is null or char_length(btrim(p_username)) not between 1 and 120 or p_username ~ '[[:cntrl:]]' then raise exception 'Ungültige Vinted-Identität' using errcode='22023'; end if;
      if v_setup.expected_external_account_id is not null and v_setup.expected_external_account_id<>p_external_account_id then raise exception 'Anderes Vinted-Konto angemeldet' using errcode='23505'; end if;
      if not exists(select 1 from public.marketplace_browser_sessions where cloud_setup_id=p_setup_id and state='active' and started_by=p_user_id
        and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() and provider_profile_id=v_setup.provider_profile_id) then
        raise exception 'Bestätigte Browsersitzung fehlt' using errcode='42501'; end if;
      update public.marketplace_cloud_setups set verified_external_account_id=p_external_account_id,verified_username=btrim(p_username),state='verified',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
    elsif p_action='finalize' then
      if v_setup.state not in ('verified','finalizing','completed') then raise exception 'Identitätsprüfung fehlt' using errcode='55000'; end if;
      if v_setup.state<>'completed' then
        if exists(select 1 from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('claimed','sending','outcome_unknown'))
          or exists(select 1 from public.marketplace_operations where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('queued','running','outcome_unknown')) then
          raise exception 'Laufende oder ungeklärte Aktion verhindert den Wechsel' using errcode='55P03'; end if;
        update public.marketplace_cloud_setups set state='finalizing',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
      end if;
    elsif p_action='complete' then
      if v_setup.state<>'completed' then
        if v_setup.state<>'finalizing' or v_setup.verified_external_account_id is null then raise exception 'Abschluss nicht vorbereitet' using errcode='55000'; end if;
        if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('active','stopping')) then
          raise exception 'Browserstopp nicht bestätigt' using errcode='55P03'; end if;
        if exists(select 1 from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('claimed','sending','outcome_unknown')) then
          raise exception 'Lokale Aktion nicht abgeschlossen' using errcode='55P03'; end if;
        update public.marketplace_local_message_outbox set state='cancelled',error_code='execution_changed',updated_at=clock_timestamp()
          where workspace_id=p_workspace_id and connection_id=v_connection.id and state='queued';
        update public.marketplace_local_extension_grants set revoked_at=clock_timestamp(),grant_generation=grant_generation+1
          where workspace_id=p_workspace_id and connection_id=v_connection.id;
        update public.marketplace_cloud_setups set state='completed',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
        update public.marketplace_connections set execution_mode='cloud',external_account_id=v_setup.verified_external_account_id,
          status='connected',resume_status=null,capabilities='{"profile.read":"verified"}'::jsonb,updated_at=clock_timestamp() where id=v_connection.id;
      end if;
    elsif p_action='release' then
      if v_setup.state='completed' then
        if v_connection.execution_mode<>'local' and v_connection.status<>'paused' then raise exception 'Cloudbetrieb muss zuerst beendet werden' using errcode='55P03'; end if;
        if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('active','stopping')) then
          raise exception 'Browserstopp nicht bestätigt' using errcode='55P03'; end if;
        update public.marketplace_cloud_setups set state='cleanup_pending',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
      end if;
    elsif p_action='cleanup' then
      if v_setup.state<>'cancelled' then
        if v_setup.state<>'cleanup_pending' then raise exception 'Bereinigung nicht angefordert' using errcode='55000'; end if;
        if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('active','stopping'))
          or exists(select 1 from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=v_connection.id and provider_profile_id=v_setup.provider_profile_id) then
          raise exception 'Profilbereinigung nicht bestätigt' using errcode='55P03'; end if;
        update public.marketplace_cloud_setups set state='cancelled',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
      end if;
    end if;
  end if;
  return jsonb_build_object('setup',public.marketplace_cloud_setup_public(v_setup),'networkId',v_ip.network_id,
    'profileId',v_setup.provider_profile_id,'previousProfileId',v_setup.previous_provider_profile_id,'expiresAt',v_setup.expires_at,'ipExpiresAt',v_ip.expires_at);
end;
$function$;
REVOKE ALL ON FUNCTION public.marketplace_cloud_setup_update(uuid, uuid, uuid, uuid, bigint, text, text, text, text) FROM authenticated;
CREATE FUNCTION public.marketplace_guard_cloud_finalizing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if exists(select 1 from public.marketplace_cloud_setups where workspace_id=new.workspace_id and connection_id=new.connection_id and state='finalizing') then
    if tg_table_name='marketplace_local_message_outbox' then
      if new.state in ('queued','claimed','sending') then raise exception 'Cloudwechsel wird abgeschlossen' using errcode='55P03'; end if;
    elsif new.revoked_at is null then
      raise exception 'Cloudwechsel wird abgeschlossen' using errcode='55P03';
    end if;
  end if;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.marketplace_guard_cloud_finalizing() FROM authenticated;
CREATE FUNCTION public.marketplace_prevent_cloud_setup_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if exists(select 1 from public.marketplace_cloud_setups where workspace_id=old.workspace_id and connection_id=old.id and state<>'cancelled') then
    raise exception 'Cloud-IP muss zuerst bereinigt werden' using errcode='23503'; end if;
  return old;
end;
$function$;
REVOKE ALL ON FUNCTION public.marketplace_prevent_cloud_setup_delete() FROM authenticated;
CREATE OR REPLACE FUNCTION public.marketplace_require_cloud_execution()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_setup_id uuid;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_connections where workspace_id=new.workspace_id and id=new.connection_id for update;
  if tg_table_name='marketplace_browser_sessions' then v_setup_id:=new.cloud_setup_id; end if;
  if v_setup_id is not null then
    if not exists(select 1 from public.marketplace_cloud_setups setup join public.marketplace_cloud_ips ip on ip.id=setup.cloud_ip_id
      where setup.public_id=v_setup_id and setup.workspace_id=new.workspace_id and setup.connection_id=new.connection_id
        and setup.requested_by=new.started_by and setup.provider_profile_id=new.provider_profile_id and setup.state in ('login','verified')
        and setup.expires_at>clock_timestamp() and ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>clock_timestamp()) then
      raise exception 'Ungültige Cloud-Einrichtungssitzung' using errcode='42501'; end if;
  elsif not exists(select 1 from public.marketplace_connections where workspace_id=new.workspace_id and id=new.connection_id and execution_mode='cloud')
    or not public.marketplace_cloud_network_valid(new.workspace_id,new.connection_id) then
    raise exception 'Keine aktive Cloudfreigabe' using errcode='42501';
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.marketplace_sync_dispatch_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid, p_include_scheduled boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_runtime public.marketplace_worker_runtime; v_schedule public.marketplace_sync_schedules; v_operation public.marketplace_operations;
  v_connection public.marketplace_connections; v_session public.marketplace_browser_sessions; v_profile text;
begin
  if p_runner_id is null then raise exception 'Auftragskennung fehlt' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_runtime from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  if p_include_scheduled then
    for v_schedule in select * from public.marketplace_sync_schedules where enabled and next_due_at<=clock_timestamp()
      and (retry_after is null or retry_after<=clock_timestamp()) order by next_due_at,id loop
      select * into v_connection from public.marketplace_connections where workspace_id=v_schedule.workspace_id and id=v_schedule.connection_id and marketplace='vinted' for update;
      perform 1 from public.marketplace_sync_schedules where id=v_schedule.id for update;
      if v_connection.execution_mode <> 'cloud' or v_connection.status is distinct from 'connected' or not public.marketplace_sync_authorization_valid(v_schedule.workspace_id,v_schedule.activated_by)
        or not public.marketplace_cloud_network_valid(v_schedule.workspace_id,v_schedule.connection_id) then
        update public.marketplace_sync_schedules set enabled=false,authorization_version=authorization_version+1,paused_reason='access_revoked',next_due_at=null,updated_at=clock_timestamp() where id=v_schedule.id;
        continue;
      end if;
      insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,schedule_id,schedule_authorization_version)
        values(v_schedule.workspace_id,v_schedule.connection_id,v_schedule.activated_by,'scheduled_read',1,v_schedule.id,v_schedule.authorization_version)
        on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
      -- Verpasste Zyklen werden zusammengefasst, auch wenn das Konto noch beschäftigt ist.
      update public.marketplace_sync_schedules set next_due_at=clock_timestamp()+make_interval(mins=>v_schedule.interval_minutes),updated_at=clock_timestamp() where id=v_schedule.id;
    end loop;
  end if;
  if exists(select 1 from public.marketplace_browser_sessions where state in ('active','stopping')) then return null; end if;
  for v_operation in select * from public.marketplace_operations where state='queued' and authorization_version=1
    and (authorization_kind='manual_read' or p_include_scheduled) order by (authorization_kind='manual_read') desc,created_at,id loop
    select * into v_connection from public.marketplace_connections where workspace_id=v_operation.workspace_id and id=v_operation.connection_id and marketplace='vinted' for update;
    v_schedule := null;
    if v_operation.authorization_kind='scheduled_read' then
      select * into v_schedule from public.marketplace_sync_schedules where id=v_operation.schedule_id and workspace_id=v_operation.workspace_id and connection_id=v_operation.connection_id for update;
    end if;
    perform 1 from public.marketplace_operations where id=v_operation.id and state='queued' for update;
    if not found then continue; end if;
    if v_operation.authorization_kind is null or v_connection.execution_mode <> 'cloud' or v_connection.status is distinct from 'connected' or not public.marketplace_sync_authorization_valid(v_operation.workspace_id,v_operation.requested_by)
      or not public.marketplace_cloud_network_valid(v_operation.workspace_id,v_operation.connection_id)
      or (v_operation.authorization_kind='scheduled_read' and (v_schedule.id is null or not v_schedule.enabled or v_schedule.authorization_version is distinct from v_operation.schedule_authorization_version or v_schedule.activated_by<>v_operation.requested_by)) then
      update public.marketplace_operations set state='failed',error_code='access',finished_at=clock_timestamp() where id=v_operation.id;
      continue;
    end if;
    select provider_profile_id into v_profile from public.marketplace_browser_profiles where workspace_id=v_operation.workspace_id and connection_id=v_operation.connection_id;
    if v_profile is null then
      update public.marketplace_operations set state='failed',error_code='browser',finished_at=clock_timestamp() where id=v_operation.id;
      continue;
    end if;
    insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,operation_id,heartbeat_at,absolute_expires_at)
      values(v_operation.workspace_id,v_operation.connection_id,v_operation.requested_by,v_profile,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,v_operation.id,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
    update public.marketplace_operations set state='running',stage='browser',runner_id=p_runner_id,worker_epoch=p_worker_epoch,
      started_at=clock_timestamp(),heartbeat_at=clock_timestamp(),lease_expires_at=v_session.expires_at,browser_session_id=v_session.public_id where id=v_operation.id;
    if v_schedule.id is not null then update public.marketplace_sync_schedules set last_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_schedule.id; end if;
    return jsonb_build_object('operationId',v_operation.id,'workspaceId',v_operation.workspace_id,'connectionId',v_operation.connection_id,'userId',v_operation.requested_by,
      'runnerId',p_runner_id,'workerEpoch',p_worker_epoch,'authorizationKind',v_operation.authorization_kind,'authorizationVersion',v_operation.authorization_version,
      'scheduleAuthorizationVersion',v_operation.schedule_authorization_version,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at);
  end loop;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.marketplace_sync_validate(p_operation_id uuid, p_runner_id uuid, p_worker_epoch bigint, p_renew boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_operation public.marketplace_operations; v_connection public.marketplace_connections; v_schedule public.marketplace_sync_schedules; v_session public.marketplace_browser_sessions; v_runtime public.marketplace_worker_runtime;
  v_inactive jsonb := '{"active":false,"sessionId":null,"expiresAt":null,"absoluteExpiresAt":null}';
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_runtime from public.marketplace_worker_runtime where id=1 and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_operation from public.marketplace_operations where id=p_operation_id;
  if not found then return v_inactive; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=v_operation.workspace_id and id=v_operation.connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode <> 'cloud' or v_connection.status<>'connected'
    or not public.marketplace_cloud_network_valid(v_operation.workspace_id,v_operation.connection_id) then return v_inactive; end if;
  if v_operation.authorization_kind='scheduled_read' then
    select * into v_schedule from public.marketplace_sync_schedules where id=v_operation.schedule_id and workspace_id=v_operation.workspace_id and connection_id=v_operation.connection_id for update;
    if not found or not v_schedule.enabled or v_schedule.authorization_version is distinct from v_operation.schedule_authorization_version or v_schedule.activated_by<>v_operation.requested_by then return v_inactive; end if;
  end if;
  select * into v_operation from public.marketplace_operations where id=p_operation_id and state='running' and runner_id=p_runner_id and worker_epoch=p_worker_epoch and authorization_version=1 and lease_expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_session from public.marketplace_browser_sessions where public_id=v_operation.browser_session_id and operation_id=p_operation_id and workspace_id=v_operation.workspace_id
    and connection_id=v_operation.connection_id and started_by=v_operation.requested_by and worker_id=v_runtime.worker_id and worker_epoch=p_worker_epoch and state='active'
    and expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp() for update;
  if not found or not public.marketplace_sync_authorization_valid(v_operation.workspace_id,v_operation.requested_by) then return v_inactive; end if;
  if p_renew then
    update public.marketplace_browser_sessions set heartbeat_at=clock_timestamp(),expires_at=least(clock_timestamp()+interval '90 seconds',absolute_expires_at) where id=v_session.id returning * into v_session;
    update public.marketplace_operations set heartbeat_at=clock_timestamp(),lease_expires_at=v_session.expires_at where id=p_operation_id;
  end if;
  return jsonb_build_object('active',true,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at);
end;
$function$;
ALTER TABLE public.marketplace_browser_sessions ADD COLUMN cloud_setup_id uuid;
CREATE INDEX marketplace_browser_cloud_setup ON public.marketplace_browser_sessions (cloud_setup_id);
CREATE TABLE public.marketplace_cloud_ips (id bigint GENERATED ALWAYS AS IDENTITY NOT NULL, network_id text NOT NULL, provider text DEFAULT 'iproyal'::text NOT NULL, order_reference text NOT NULL, country_code text NOT NULL, is_dedicated_isp boolean DEFAULT true NOT NULL, expires_at timestamp with time zone NOT NULL, enabled boolean DEFAULT false NOT NULL, verified_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL);
COMMENT ON TABLE public.marketplace_cloud_ips IS 'Administrativ geprüfte gekaufte ISP-IPs; nur Netzwerkreferenzen, keine Proxyzugangsdaten.';
ALTER TABLE public.marketplace_cloud_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_cloud_ips ADD CONSTRAINT marketplace_cloud_ips_country_code_check CHECK (country_code ~ '^[A-Z]{2}$'::text);
ALTER TABLE public.marketplace_cloud_ips ADD CONSTRAINT marketplace_cloud_ips_expires_at_check CHECK (isfinite(expires_at));
ALTER TABLE public.marketplace_cloud_ips ADD CONSTRAINT marketplace_cloud_ips_network_id_check CHECK (network_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'::text AND network_id <> 'direct'::text);
ALTER TABLE public.marketplace_cloud_ips ADD CONSTRAINT marketplace_cloud_ips_network_id_key UNIQUE (network_id);
ALTER TABLE public.marketplace_cloud_ips ADD CONSTRAINT marketplace_cloud_ips_order_reference_check CHECK (char_length(order_reference) >= 1 AND char_length(order_reference) <= 128);
ALTER TABLE public.marketplace_cloud_ips ADD CONSTRAINT marketplace_cloud_ips_pkey PRIMARY KEY (id);
ALTER TABLE public.marketplace_cloud_ips ADD CONSTRAINT marketplace_cloud_ips_provider_check CHECK (provider = 'iproyal'::text);
REVOKE ALL ON public.marketplace_cloud_ips FROM authenticated;
CREATE POLICY "Worker deletes cloud IPs" ON public.marketplace_cloud_ips FOR DELETE TO service_role USING (true);
CREATE POLICY "Worker inserts cloud IPs" ON public.marketplace_cloud_ips FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Worker reads cloud IPs" ON public.marketplace_cloud_ips FOR SELECT TO service_role USING (true);
CREATE POLICY "Worker updates cloud IPs" ON public.marketplace_cloud_ips FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE TABLE public.marketplace_cloud_setups (id bigint GENERATED ALWAYS AS IDENTITY NOT NULL, public_id uuid DEFAULT gen_random_uuid() NOT NULL, workspace_id uuid NOT NULL, connection_id uuid NOT NULL, requested_by uuid NOT NULL, request_id uuid NOT NULL, requested_name text, is_new_connection boolean NOT NULL, cloud_ip_id bigint NOT NULL, state text DEFAULT 'reserved'::text NOT NULL, expected_external_account_id text, expected_grant_generation bigint, verified_external_account_id text, verified_username text, provider_profile_id text, worker_id uuid, worker_epoch bigint, expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, expected_grant_revoked_at timestamp with time zone, previous_provider_profile_id text);
CREATE FUNCTION public.marketplace_cloud_setup_public(p_setup public.marketplace_cloud_setups)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('workspaceId',p_setup.workspace_id,'connectionId',p_setup.connection_id,
    'setupId',p_setup.public_id,'state',p_setup.state,'sessionId',(
      select public_id from public.marketplace_browser_sessions where cloud_setup_id=p_setup.public_id
        and state in ('active','stopping') order by created_at desc limit 1));
$function$;
REVOKE ALL ON FUNCTION public.marketplace_cloud_setup_public(public.marketplace_cloud_setups) FROM authenticated;
COMMENT ON TABLE public.marketplace_cloud_setups IS 'Dauerhafte IP-Reservierung und Zustandswechsel; Freigabe erst nach bestätigter Browserbereinigung.';
ALTER TABLE public.marketplace_cloud_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_cloud_setups ADD CONSTRAINT marketplace_cloud_setups_cloud_ip_id_fkey FOREIGN KEY (cloud_ip_id) REFERENCES public.marketplace_cloud_ips(id);
ALTER TABLE public.marketplace_cloud_setups ADD CONSTRAINT marketplace_cloud_setups_pkey PRIMARY KEY (id);
ALTER TABLE public.marketplace_cloud_setups ADD CONSTRAINT marketplace_cloud_setups_previous_provider_profile_id_check CHECK (previous_provider_profile_id ~ '^[a-zA-Z0-9_-]{1,128}$'::text);
ALTER TABLE public.marketplace_cloud_setups ADD CONSTRAINT marketplace_cloud_setups_provider_profile_id_check CHECK (provider_profile_id ~ '^chromium_[0-9a-f-]{36}$'::text);
ALTER TABLE public.marketplace_cloud_setups ADD CONSTRAINT marketplace_cloud_setups_public_id_key UNIQUE (public_id);
ALTER TABLE public.marketplace_browser_sessions ADD CONSTRAINT marketplace_browser_sessions_cloud_setup_id_fkey FOREIGN KEY (cloud_setup_id) REFERENCES public.marketplace_cloud_setups(public_id);
ALTER TABLE public.marketplace_cloud_setups ADD CONSTRAINT marketplace_cloud_setups_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);
ALTER TABLE public.marketplace_cloud_setups ADD CONSTRAINT marketplace_cloud_setups_state_check CHECK (state = ANY (ARRAY['reserved'::text, 'login'::text, 'verified'::text, 'finalizing'::text, 'completed'::text, 'cleanup_pending'::text, 'cancelled'::text]));
ALTER TABLE public.marketplace_cloud_setups ADD CONSTRAINT marketplace_cloud_setups_workspace_id_connection_id_fkey FOREIGN KEY (workspace_id, connection_id) REFERENCES public.marketplace_connections(workspace_id, id) ON DELETE CASCADE;
ALTER TABLE public.marketplace_cloud_setups ADD CONSTRAINT marketplace_cloud_setups_workspace_id_requested_by_request__key UNIQUE (workspace_id, requested_by, request_id);
REVOKE ALL ON public.marketplace_cloud_setups FROM authenticated;
CREATE INDEX marketplace_cloud_setup_requester ON public.marketplace_cloud_setups (requested_by, workspace_id);
CREATE UNIQUE INDEX marketplace_cloud_ip_reserved ON public.marketplace_cloud_setups (cloud_ip_id) WHERE state <> 'cancelled'::text;
CREATE UNIQUE INDEX marketplace_cloud_connection_reserved ON public.marketplace_cloud_setups (workspace_id, connection_id) WHERE state <> 'cancelled'::text;
CREATE POLICY "Worker deletes cloud setups" ON public.marketplace_cloud_setups FOR DELETE TO service_role USING (true);
CREATE POLICY "Worker inserts cloud setups" ON public.marketplace_cloud_setups FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Worker reads cloud setups" ON public.marketplace_cloud_setups FOR SELECT TO service_role USING (true);
CREATE POLICY "Worker updates cloud setups" ON public.marketplace_cloud_setups FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER marketplace_prevent_cloud_setup_delete BEFORE DELETE ON public.marketplace_connections FOR EACH ROW EXECUTE FUNCTION public.marketplace_prevent_cloud_setup_delete();
CREATE TRIGGER marketplace_local_grant_cloud_fence BEFORE INSERT OR UPDATE ON public.marketplace_local_extension_grants FOR EACH ROW EXECUTE FUNCTION public.marketplace_guard_cloud_finalizing();
CREATE TRIGGER marketplace_local_outbox_cloud_fence BEFORE INSERT OR UPDATE ON public.marketplace_local_message_outbox FOR EACH ROW EXECUTE FUNCTION public.marketplace_guard_cloud_finalizing();

-- Aus dem deklarativen Schema erzeugte vollständige Objektberechtigungen.
revoke all on public.marketplace_cloud_ips from public,anon,authenticated;
grant all on public.marketplace_cloud_ips to service_role;
revoke all on sequence public.marketplace_cloud_ips_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_ips_id_seq to service_role;
revoke all on public.marketplace_cloud_setups from public,anon,authenticated;
grant all on public.marketplace_cloud_setups to service_role;
revoke all on sequence public.marketplace_cloud_setups_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_setups_id_seq to service_role;
revoke all on function public.marketplace_cloud_setup_public(public.marketplace_cloud_setups) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_setup_public(public.marketplace_cloud_setups) to service_role;
revoke all on function public.marketplace_cloud_network_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_network_valid(uuid,uuid) to service_role;
revoke all on function public.marketplace_cloud_setup_begin(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.marketplace_cloud_setup_begin(uuid,uuid,uuid,text) to authenticated;
revoke all on function public.marketplace_cloud_setup_read(uuid,uuid) from public,anon;
grant execute on function public.marketplace_cloud_setup_read(uuid,uuid) to authenticated;
revoke all on function public.marketplace_cloud_setup_cancel(uuid,uuid) from public,anon;
grant execute on function public.marketplace_cloud_setup_cancel(uuid,uuid) to authenticated;
revoke all on function public.marketplace_cloud_setup_update(uuid,uuid,uuid,uuid,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_setup_update(uuid,uuid,uuid,uuid,bigint,text,text,text,text) to service_role;
revoke all on function public.marketplace_cloud_setup_session_reserve(uuid,uuid) from public,anon;
grant execute on function public.marketplace_cloud_setup_session_reserve(uuid,uuid) to authenticated;
revoke all on function public.marketplace_cloud_setup_session_check(uuid,uuid,uuid) from public,anon;
grant execute on function public.marketplace_cloud_setup_session_check(uuid,uuid,uuid) to authenticated;
revoke all on function public.marketplace_prevent_cloud_setup_delete() from public,anon,authenticated;
revoke all on function public.marketplace_guard_cloud_finalizing() from public,anon,authenticated;
