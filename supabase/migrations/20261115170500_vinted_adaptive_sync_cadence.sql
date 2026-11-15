-- Zweck: Adaptive Synchronisierungskadenz für Vinted-Cloud-Konten abhängig von aktueller Kontoaktivität und Tageszeit.
-- Betroffen: marketplace_next_sync_due_at, marketplace_sync_dispatch_claim, marketplace_sync_finish, marketplace_sync_prepare_scheduled.
create or replace function public.marketplace_next_sync_due_at(
  p_workspace_id uuid,
  p_connection_id uuid,
  p_base_interval_minutes integer,
  p_now timestamptz default clock_timestamp()
)
returns timestamptz language plpgsql stable security invoker set search_path = '' as $$
declare
  v_cutoff timestamptz := p_now - interval '2 hours';
  v_local_hour integer;
begin
  if exists (
    select 1 from public.marketplace_connections c
      where c.workspace_id = p_workspace_id and c.id = p_connection_id
        and c.browser_presence_expires_at is not null and c.browser_presence_expires_at >= v_cutoff
  ) or exists (
    select 1 from public.marketplace_operations o
      where o.workspace_id = p_workspace_id and o.connection_id = p_connection_id
        and o.authorization_kind = 'manual_read'
        and coalesce(o.finished_at, o.started_at, o.created_at) >= v_cutoff
  ) or exists (
    select 1 from public.marketplace_account_actions a
      where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
        and coalesce(a.finished_at, a.updated_at, a.created_at) >= v_cutoff
  ) or exists (
    select 1 from public.marketplace_local_message_outbox m
      where m.workspace_id = p_workspace_id and m.connection_id = p_connection_id
        and coalesce(m.updated_at, m.created_at) >= v_cutoff
  ) or exists (
    select 1 from public.marketplace_negotiation_jobs n
      where n.workspace_id = p_workspace_id and n.connection_id = p_connection_id
        and coalesce(n.finished_at, n.updated_at, n.created_at) >= v_cutoff
  ) or exists (
    select 1 from public.marketplace_listing_jobs l
      where l.workspace_id = p_workspace_id and l.connection_id = p_connection_id
        and coalesce(l.verified_at, l.updated_at, l.created_at) >= v_cutoff
  ) or exists (
    select 1 from public.marketplace_favorite_message_events f
      where f.workspace_id = p_workspace_id and f.connection_id = p_connection_id
        and coalesce(f.updated_at, f.event_at) >= v_cutoff
  ) or exists (
    select 1 from public.marketplace_account_entries e
      where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id
        and e.kind in ('conversation', 'message', 'sale')
        and e.sort_at >= v_cutoff
  ) then
    return p_now + make_interval(mins => p_base_interval_minutes);
  end if;
  v_local_hour := extract(hour from (p_now at time zone 'Europe/Berlin'))::integer;
  if v_local_hour >= 0 and v_local_hour < 7 then
    return p_now + make_interval(mins => greatest(p_base_interval_minutes, 60));
  end if;
  return p_now + make_interval(mins => greatest(p_base_interval_minutes, 30));
end;
$$;

create or replace function public.marketplace_sync_dispatch_claim(p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid,p_include_scheduled boolean default false,p_target_id uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_runtime public.marketplace_worker_runtime; v_schedule public.marketplace_sync_schedules; v_operation public.marketplace_operations;
  v_connection public.marketplace_connections; v_session public.marketplace_browser_sessions; v_profile text; v_next jsonb;
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
      update public.marketplace_sync_schedules set next_due_at=public.marketplace_next_sync_due_at(v_schedule.workspace_id,v_schedule.connection_id,v_schedule.interval_minutes),updated_at=clock_timestamp() where id=v_schedule.id;
    end loop;
  end if;
  if p_target_id is null then
    v_next:=public.marketplace_browser_next_work(p_include_scheduled);
    if v_next is null or v_next->>'kind'<>'sync' then return null; end if;
    p_target_id:=(v_next->>'jobId')::uuid;
  end if;
  if not public.marketplace_browser_job_eligible('sync',p_target_id::text) then return null; end if;
  for v_operation in select * from public.marketplace_operations where state='queued' and authorization_version=1
    and id=p_target_id and public.marketplace_browser_slot_status(workspace_id,connection_id) is null
    and (authorization_kind='manual_read' or p_include_scheduled) order by created_at,id loop
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
$$;

create or replace function public.marketplace_sync_finish(p_operation_id uuid,p_runner_id uuid,p_worker_epoch bigint,p_outcome jsonb)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
declare v_operation public.marketplace_operations; v_schedule public.marketplace_sync_schedules; v_reason text; v_retry timestamptz; v_failures integer; v_soft_login boolean := false;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return false; end if;
  select * into v_operation from public.marketplace_operations where id=p_operation_id;
  if not found then return false; end if;
  perform 1 from public.marketplace_connections where workspace_id=v_operation.workspace_id and id=v_operation.connection_id for update;
  if v_operation.schedule_id is not null then
    select * into v_schedule from public.marketplace_sync_schedules where id=v_operation.schedule_id for update;
  elsif v_operation.authorization_kind='manual_read' then
    select * into v_schedule from public.marketplace_sync_schedules
      where workspace_id=v_operation.workspace_id and connection_id=v_operation.connection_id for update;
  end if;
  select * into v_operation from public.marketplace_operations where id=p_operation_id and state='running' and runner_id=p_runner_id and worker_epoch=p_worker_epoch for update;
  if not found then return false; end if;
  if jsonb_typeof(p_outcome) is distinct from 'object' or p_outcome->>'state' is null or p_outcome->>'state' not in ('succeeded','failed') then raise exception 'Ungültiger Auftragsabschluss' using errcode='22023'; end if;
  if p_outcome->>'state'='succeeded' and (v_operation.observed_at is null or v_operation.counts is null or v_operation.source_results is null) then raise exception 'Bestätigter Import fehlt' using errcode='22023'; end if;
  v_reason := p_outcome->>'pausedReason';
  if v_reason is not null and v_reason not in ('needs_login','forbidden','challenge','rate_limited','network','server','retry_limit','access_revoked','cleanup','interrupted') then raise exception 'Ungültiger Pausengrund' using errcode='22023'; end if;
  if p_outcome->>'retryAfter' is not null then
    begin v_retry := (p_outcome->>'retryAfter')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Wartezeit' using errcode='22023'; end;
    if not isfinite(v_retry) then raise exception 'Ungültige Wartezeit' using errcode='22023'; end if;
    v_retry := least(greatest(v_retry,clock_timestamp()+interval '15 minutes'),clock_timestamp()+interval '1 day');
  end if;
  -- Quellenfehler wirken auch bei einer insgesamt erfolgreich übernommenen Teilantwort.
  if v_reason is null and exists(select 1 from jsonb_each(coalesce(v_operation.source_results,'{}')) a where a.value->>'failure'='unauthorized') then v_reason:='needs_login'; end if;
  if v_reason is null and exists(select 1 from jsonb_each(coalesce(v_operation.source_results,'{}')) a where a.value->>'failure'='forbidden') then v_reason:='forbidden'; end if;
  if v_reason is null and exists(select 1 from jsonb_each(coalesce(v_operation.source_results,'{}')) a where a.value->>'failure'='rate_limited') then v_reason:='rate_limited'; end if;
  if v_reason is null and exists(select 1 from jsonb_each(coalesce(v_operation.source_results,'{}')) a where a.value->>'failure' in ('network','timeout','browser_context')) then v_reason:='network'; end if;
  if v_reason is null and exists(select 1 from jsonb_each(coalesce(v_operation.source_results,'{}')) a where a.value->>'failure' in ('provider_unavailable','invalid_response')) then v_reason:='server'; end if;
  if exists(select 1 from public.marketplace_browser_sessions where public_id=v_operation.browser_session_id and state in ('active','stopping')) then v_reason:='cleanup'; end if;
  update public.marketplace_operations set state=p_outcome->>'state',stage='cleanup',error_code=case when v_reason='cleanup' then 'cleanup' else p_outcome->>'errorCode' end,finished_at=clock_timestamp() where id=p_operation_id;
  -- Kein alter Abschluss darf eine inzwischen neu erteilte Freigabe umschreiben.
  if v_operation.authorization_kind='scheduled_read' and v_schedule.id is not null and v_schedule.authorization_version=v_operation.schedule_authorization_version then
    v_failures:=case when v_reason is null then 0 else v_schedule.consecutive_failures+1 end;
    -- Eine beim Abschluss noch nicht beendete Browsersitzung ist meist nach Sekunden zu.
    -- Der Dispatcher startet bis dahin keinen neuen Browser; deshalb begrenzt wiederholen.
    if v_reason in ('network','server','interrupted','cleanup') then
      if v_failures>=3 then v_reason:='retry_limit'; else v_retry:=clock_timestamp()+make_interval(mins=>15*(2^v_failures)::integer); end if;
    elsif v_reason='needs_login' and v_failures<3 then
      -- Vinted bestätigt eine gültige Anmeldung gelegentlich nicht sofort. Erst die dritte
      -- Ablehnung in Folge beendet die Freigabe; bis dahin läuft der nächste reguläre Abruf.
      v_soft_login:=true;
    elsif v_reason='rate_limited' then v_retry:=coalesce(v_retry,clock_timestamp()+interval '15 minutes'); end if;
    update public.marketplace_sync_schedules set
      enabled=case when not v_soft_login and v_reason in ('needs_login','forbidden','challenge','access_revoked','retry_limit') then false else enabled end,
      authorization_version=authorization_version+case when not v_soft_login and v_reason in ('needs_login','forbidden','challenge','access_revoked','retry_limit') then 1 else 0 end,
      paused_reason=v_reason,retry_after=v_retry,consecutive_failures=v_failures,
      last_success_at=case when p_outcome->>'state'='succeeded' and v_reason is null then v_operation.observed_at else last_success_at end,
      next_due_at=case when not v_soft_login and v_reason in ('needs_login','forbidden','challenge','access_revoked','retry_limit') then null else greatest(public.marketplace_next_sync_due_at(v_schedule.workspace_id,v_schedule.connection_id,v_schedule.interval_minutes),v_retry) end,
      updated_at=clock_timestamp() where id=v_schedule.id;
  elsif v_operation.authorization_kind='manual_read' and p_outcome->>'state'='succeeded'
    and p_outcome->>'errorCode' is null and v_reason is null
    and v_operation.source_results->'profile'->>'status'='complete'
    and not exists(select 1 from jsonb_each(v_operation.source_results) a where a.value->>'failure' is not null)
    and public.marketplace_sync_authorization_valid(v_operation.workspace_id,v_operation.requested_by) then
    -- Ein neuer bestätigter Abruf löst die alte Anbieterwarnung. Eine Pause,
    -- Freigabeänderung nach Abrufbeginn oder ungeklärte Bereinigung bleibt erhalten.
    update public.marketplace_sync_schedules set paused_reason=null,retry_after=null,
      consecutive_failures=0,updated_at=clock_timestamp()
      where id=v_schedule.id and paused_reason in ('needs_login','forbidden','challenge')
        and updated_at<=v_operation.started_at;
  end if;
  return true;
end;
$$;

create or replace function public.marketplace_sync_prepare_scheduled()
returns void language plpgsql volatile security invoker set search_path='' as $$
declare v_schedule public.marketplace_sync_schedules; v_connection public.marketplace_connections;
begin
  perform pg_advisory_xact_lock(91731,1);
  for v_schedule in select * from public.marketplace_sync_schedules where enabled and next_due_at<=clock_timestamp()
    and (retry_after is null or retry_after<=clock_timestamp()) order by next_due_at,id loop
    select * into v_connection from public.marketplace_connections where workspace_id=v_schedule.workspace_id and id=v_schedule.connection_id and marketplace='vinted' for update;
    perform 1 from public.marketplace_sync_schedules where id=v_schedule.id for update;
    if v_connection.execution_mode<>'cloud' or v_connection.status is distinct from 'connected' or not public.marketplace_sync_authorization_valid(v_schedule.workspace_id,v_schedule.activated_by)
      or not public.marketplace_cloud_network_valid(v_schedule.workspace_id,v_schedule.connection_id) then
      update public.marketplace_sync_schedules set enabled=false,authorization_version=authorization_version+1,paused_reason='access_revoked',next_due_at=null,updated_at=clock_timestamp() where id=v_schedule.id;
      continue;
    end if;
    insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,schedule_id,schedule_authorization_version)
      values(v_schedule.workspace_id,v_schedule.connection_id,v_schedule.activated_by,'scheduled_read',1,v_schedule.id,v_schedule.authorization_version)
      on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
    update public.marketplace_sync_schedules set next_due_at=public.marketplace_next_sync_due_at(v_schedule.workspace_id,v_schedule.connection_id,v_schedule.interval_minutes),updated_at=clock_timestamp() where id=v_schedule.id;
  end loop;
end;
$$;

revoke all on function public.marketplace_next_sync_due_at(uuid,uuid,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.marketplace_next_sync_due_at(uuid,uuid,integer,timestamptz) to service_role;
