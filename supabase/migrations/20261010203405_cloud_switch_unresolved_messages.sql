-- Zweck: Alte ungeklärte oder abgelaufene lokale Nachrichten sperren den Wechsel zur Cloud nicht mehr.
-- Betrifft: Funktionen marketplace_cloud_setup_begin, marketplace_cloud_setup_update und die neue
-- marketplace_local_message_expire_leases; gelesen und bereinigt wird marketplace_local_message_outbox.
-- Aus Supabase db diff erzeugt und auf diese Funktionen begrenzt; explizite Rechte aus dem Schema übernommen.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_local_message_expire_leases (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns void
  language sql
  set search_path to ''
  as $function$
  update public.marketplace_local_message_outbox set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_local_message_outbox set state='queued',claim_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='claimed' and lease_expires_at<=clock_timestamp();
$function$;

revoke all on function public.marketplace_local_message_expire_leases(uuid, uuid) from public, anon, authenticated;

grant execute on function public.marketplace_local_message_expire_leases(uuid, uuid) to service_role;

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

create or replace function public.marketplace_cloud_setup_update (
  p_workspace_id        uuid,
  p_setup_id            uuid,
  p_user_id             uuid,
  p_worker_id           uuid,
  p_worker_epoch        bigint,
  p_action              text,
  p_profile_id          text   default null::text,
  p_external_account_id text   default null::text,
  p_username            text   default null::text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
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
      if p_action='unmap' and exists(select 1 from public.marketplace_operations where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('queued','running','outcome_unknown')) then
        raise exception 'Laufende oder ungeklärte Aktion verhindert den Wechsel' using errcode='55P03'; end if;
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
        perform public.marketplace_local_message_expire_leases(p_workspace_id,v_connection.id);
        if exists(select 1 from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('claimed','sending'))
          or exists(select 1 from public.marketplace_operations where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('queued','running','outcome_unknown')) then
          raise exception 'Laufende oder ungeklärte Aktion verhindert den Wechsel' using errcode='55P03'; end if;
        update public.marketplace_cloud_setups set state='finalizing',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
      end if;
    elsif p_action='complete' then
      if v_setup.state<>'completed' then
        if v_setup.state<>'finalizing' or v_setup.verified_external_account_id is null then raise exception 'Abschluss nicht vorbereitet' using errcode='55000'; end if;
        if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('active','stopping')) then
          raise exception 'Browserstopp nicht bestätigt' using errcode='55P03'; end if;
        if exists(select 1 from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('claimed','sending')) then
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
