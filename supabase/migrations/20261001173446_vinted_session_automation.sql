-- Zweck: Standardautomatik nach bestätigter Vinted-Anmeldung und einstellbare Abrufabstände.
-- Betroffen: marketplace_sync_schedules und die Bestätigungs-/Zeitplanfunktionen.
-- Der alte Intervall-Check wird im selben transaktionalen Lauf durch die erweiterte Prüfung ersetzt; keine Kontodaten werden gelöscht.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

alter table public.marketplace_sync_schedules
  drop constraint marketplace_sync_schedules_interval_minutes_check;

create or replace function public.marketplace_browser_confirm_account (
  p_workspace_id        uuid,
  p_connection_id       uuid,
  p_session_id          uuid,
  p_user_id             uuid,
  p_external_account_id text,
  p_username            text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_connection public.marketplace_connections;
  v_session public.marketplace_browser_sessions;
  v_observed_at timestamptz := clock_timestamp();
begin
  -- Gleiche Sperrreihenfolge wie Zeitplanänderungen und Dispatcher.
  perform pg_advisory_xact_lock(91731, 1);
  if p_external_account_id is null or p_external_account_id !~ '^[1-9][0-9]{0,31}$'
    or p_username is null or char_length(btrim(p_username)) not between 1 and 120
    or p_username ~ '[[:cntrl:]]'
  then
    raise exception 'Ungültige Vinted-Identität' using errcode = '22023';
  end if;

  select * into v_connection
    from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted'
    for update;
  if not found or v_connection.status in ('paused', 'blocked') then
    raise exception 'Kontoverbindung nicht verfügbar' using errcode = '42501';
  end if;

  select * into v_session
    from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id
      and connection_id = p_connection_id and started_by = p_user_id
    for update;
  if not found or v_session.state <> 'active' or v_session.expires_at <= v_observed_at then
    raise exception 'Browsersitzung nicht verfügbar' using errcode = '42501';
  end if;

  if not exists (select 1 from public.platform_operators where user_id = p_user_id)
    or not exists (
      select 1 from public.workspace_members
      where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin')
    )
    or not exists (
      select 1 from public.workspaces where id = p_workspace_id and archived_at is null
    )
  then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;

  if v_connection.external_account_id is not null
    and v_connection.external_account_id <> p_external_account_id
  then
    raise exception 'Anderes Vinted-Konto angemeldet' using errcode = '23505';
  end if;

  update public.marketplace_connections
    set external_account_id = p_external_account_id,
      status = 'connected',
      capabilities = jsonb_set(capabilities, '{profile.read}', '"verified"'::jsonb, true),
      updated_at = v_observed_at
    where id = p_connection_id;

  -- Neue bestätigte Konten erhalten die Standardautomatik. Eine vorhandene
  -- Pause oder ein bewusst gewählter Abstand wird niemals überschrieben.
  insert into public.marketplace_sync_schedules
    (workspace_id, connection_id, enabled, activated_by, interval_minutes, next_due_at)
  values (p_workspace_id, p_connection_id, true, p_user_id, 15,
    v_observed_at + interval '15 minutes')
  on conflict (workspace_id, connection_id) do nothing;

  insert into public.marketplace_account_entries
    (workspace_id, connection_id, kind, external_id, body, sort_at, observed_at)
  values (
    p_workspace_id, p_connection_id, 'profile', p_external_account_id,
    jsonb_build_object('username', btrim(p_username), 'displayName', btrim(p_username)),
    v_observed_at, v_observed_at
  )
  on conflict (workspace_id, connection_id, kind, external_id)
  do update set body = public.marketplace_account_entries.body || excluded.body;

  return jsonb_build_object('workspaceId', p_workspace_id,
    'connectionId', p_connection_id, 'externalAccountId', p_external_account_id,
    'username', btrim(p_username));
end;
$function$;

create or replace function public.marketplace_set_sync_schedule (
  p_workspace_id          uuid,
  p_connection_id         uuid,
  p_enabled               boolean,
  p_interval_minutes      integer,
  p_authorization_version bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_schedule public.marketplace_sync_schedules;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted'
    and (not p_enabled or status = 'connected') for update;
  if not found then raise exception 'Konto nicht verbunden' using errcode = '22023'; end if;
  if p_enabled is null or p_interval_minutes is null or p_interval_minutes not in (3,5,10,15,30,60) or p_authorization_version is null or p_authorization_version < 0 then
    raise exception 'Ungültiger Zeitplan' using errcode = '22023';
  end if;
  select * into v_schedule from public.marketplace_sync_schedules where workspace_id = p_workspace_id and connection_id = p_connection_id for update;
  if coalesce(v_schedule.authorization_version,0) <> p_authorization_version then raise exception 'Zeitplan wurde zwischenzeitlich geändert' using errcode = '40001'; end if;
  if not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  insert into public.marketplace_sync_schedules(workspace_id,connection_id,enabled,activated_by,interval_minutes,next_due_at)
    values(p_workspace_id,p_connection_id,p_enabled,(select auth.uid()),p_interval_minutes,case when p_enabled then clock_timestamp()+make_interval(mins=>p_interval_minutes) end)
    on conflict(workspace_id,connection_id) do update set enabled=excluded.enabled,activated_by=excluded.activated_by,
      authorization_version=public.marketplace_sync_schedules.authorization_version+1,interval_minutes=excluded.interval_minutes,next_due_at=excluded.next_due_at,
      paused_reason=null,retry_after=null,consecutive_failures=0,updated_at=clock_timestamp();
  update public.marketplace_operations set state='failed',error_code='access',finished_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and state='queued' and authorization_kind='scheduled_read'
      and schedule_authorization_version is distinct from (select authorization_version from public.marketplace_sync_schedules where workspace_id=p_workspace_id and connection_id=p_connection_id);
  return public.marketplace_read_sync_schedule(p_workspace_id,p_connection_id);
end;
$function$;

create or replace function public.marketplace_sync_dispatch_claim (
  p_worker_id         uuid,
  p_worker_epoch      bigint,
  p_runner_id         uuid,
  p_include_scheduled boolean default false
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
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
      if v_connection.status is distinct from 'connected' or not public.marketplace_sync_authorization_valid(v_schedule.workspace_id,v_schedule.activated_by) then
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
    if v_operation.authorization_kind is null or v_connection.status is distinct from 'connected' or not public.marketplace_sync_authorization_valid(v_operation.workspace_id,v_operation.requested_by)
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

create or replace function public.marketplace_sync_finish (
  p_operation_id uuid,
  p_runner_id    uuid,
  p_worker_epoch bigint,
  p_outcome      jsonb
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
declare v_operation public.marketplace_operations; v_schedule public.marketplace_sync_schedules; v_reason text; v_retry timestamptz; v_failures integer;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return false; end if;
  select * into v_operation from public.marketplace_operations where id=p_operation_id;
  if not found then return false; end if;
  perform 1 from public.marketplace_connections where workspace_id=v_operation.workspace_id and id=v_operation.connection_id for update;
  if v_operation.schedule_id is not null then select * into v_schedule from public.marketplace_sync_schedules where id=v_operation.schedule_id for update; end if;
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
  if v_schedule.id is not null and v_schedule.authorization_version=v_operation.schedule_authorization_version then
    v_failures:=case when v_reason is null then 0 else v_schedule.consecutive_failures+1 end;
    if v_reason in ('network','server','interrupted') then
      if v_failures>=3 then v_reason:='retry_limit'; else v_retry:=clock_timestamp()+make_interval(mins=>15*(2^v_failures)::integer); end if;
    elsif v_reason='rate_limited' then v_retry:=coalesce(v_retry,clock_timestamp()+interval '15 minutes'); end if;
    update public.marketplace_sync_schedules set
      enabled=case when v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then false else enabled end,
      authorization_version=authorization_version+case when v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then 1 else 0 end,
      paused_reason=v_reason,retry_after=v_retry,consecutive_failures=v_failures,
      last_success_at=case when p_outcome->>'state'='succeeded' and v_reason is null then v_operation.observed_at else last_success_at end,
      next_due_at=case when v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then null else greatest(clock_timestamp()+make_interval(mins=>v_schedule.interval_minutes),v_retry) end,
      updated_at=clock_timestamp() where id=v_schedule.id;
  end if;
  return true;
end;
$function$;

alter table public.marketplace_sync_schedules
  add constraint marketplace_sync_schedules_interval_minutes_check check (interval_minutes = any (array[3, 5, 10, 15, 30, 60]));
