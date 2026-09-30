-- Zweck: Widerrufbare Vinted-Leseaufträge mit exklusivem Worker und globaler Browserkapazität.
-- Tabellen: marketplace_sync_schedules, marketplace_worker_runtime, marketplace_operations, marketplace_browser_sessions.
-- Automatisch erzeugter db-diff; fremde historische Schemaabweichungen deterministisch ausgeschlossen.

set check_function_bodies = false;

create or replace function public.marketplace_apply_vinted_import (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid,
  p_user_id       uuid,
  p_snapshot      jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_connection public.marketplace_connections;
  v_session public.marketplace_browser_sessions;
  v_observed_at timestamptz;
  v_entry jsonb;
  v_area text;
  v_status text;
  v_failure text;
  v_kind text;
  v_parent_id uuid;
  v_body jsonb;
  v_old_feedback jsonb;
  v_counts jsonb := '{"profile":0,"publication":0,"conversation":0,"message":0,"sale":0}';
begin
  perform pg_advisory_xact_lock(91731, 1);
  -- Gleiche Sperrreihenfolge wie die bestehenden Browser-RPCs: Konto, dann Sitzung.
  select * into v_connection from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found or v_connection.status <> 'connected' then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = p_user_id for update;
  if not found or v_session.state <> 'active' or v_session.expires_at <= clock_timestamp() then
    raise exception 'Sitzungszugriff verweigert' using errcode = '42501';
  end if;
  -- Alte manuelle Sitzungen bleiben während des getrennten Worker-Rollouts nutzbar.
  if v_session.worker_epoch is not null and not exists (
    select 1 from public.marketplace_worker_runtime where worker_id = v_session.worker_id
      and worker_epoch = v_session.worker_epoch and expires_at > clock_timestamp()
  ) then raise exception 'Worker nicht mehr aktiv' using errcode = '42501'; end if;
  if v_session.operation_id is not null and not exists (
    select 1 from public.marketplace_operations o
      left join public.marketplace_sync_schedules s on s.id=o.schedule_id and s.workspace_id=o.workspace_id and s.connection_id=o.connection_id
    where o.id=v_session.operation_id and o.browser_session_id=v_session.public_id and o.state='running'
      and o.workspace_id=p_workspace_id and o.connection_id=p_connection_id and o.requested_by=p_user_id
      and o.worker_epoch=v_session.worker_epoch and o.authorization_version=1 and o.lease_expires_at>clock_timestamp()
      and (o.authorization_kind='manual_read' or (o.authorization_kind='scheduled_read' and s.enabled
        and s.authorization_version=o.schedule_authorization_version and s.activated_by=o.requested_by))
  ) then raise exception 'Auftragsfreigabe widerrufen' using errcode='42501'; end if;
  -- Lesesperren verhindern Rechteentzug zwischen Prüfung und abschließendem Schreiben.
  perform 1 from public.platform_operators where user_id = p_user_id for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin') for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object'
    or p_snapshot->'identity'->>'id' is distinct from v_connection.external_account_id then
    raise exception 'Kontoidentität stimmt nicht überein' using errcode = '42501';
  end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'areas') is distinct from 'object'
    or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or (p_snapshot ? 'rejectedSaleIds' and jsonb_typeof(p_snapshot->'rejectedSaleIds') is distinct from 'array') then
    raise exception 'Ungültiger Import' using errcode = '22023';
  end if;
  begin
    v_observed_at := (p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Ungültige Abrufzeit' using errcode = '22023';
  end;
  if not isfinite(v_observed_at) or v_observed_at <= (
    select max(observed_at) from public.marketplace_account_sync_sources where workspace_id = p_workspace_id and connection_id = p_connection_id
  ) then raise exception 'Veralteter Import' using errcode = '22023'; end if;

  foreach v_area in array array['profile','publications','conversations','messages','sales','feedback'] loop
    v_status := p_snapshot->'areas'->v_area->>'status';
    v_failure := p_snapshot->'areas'->v_area->>'failure';
    if jsonb_typeof(p_snapshot->'areas'->v_area) is distinct from 'object'
      or v_status is null or v_status not in ('complete','partial','failed')
      or (v_failure is not null and v_failure not in ('unauthorized','forbidden','rate_limited','provider_unavailable','invalid_response','timeout','network','browser_context'))
      or (v_status = 'failed' and v_failure is null) or (v_area = 'profile' and v_status <> 'complete') then
      raise exception 'Ungültiger Quellenstatus' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'profile') <> 1
    or exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*) > 1) then
    raise exception 'Profil oder eindeutige Einträge fehlen' using errcode = '22023';
  end if;
  select body->'feedbacks' into v_old_feedback from public.marketplace_account_entries
    where workspace_id = p_workspace_id and connection_id = p_connection_id and kind = 'profile';

  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') order by (value->>'kind' = 'message') loop
    v_kind := v_entry->>'kind';
    v_area := case v_kind when 'profile' then 'profile' when 'publication' then 'publications' when 'conversation' then 'conversations' when 'message' then 'messages' when 'sale' then 'sales' end;
    if v_area is null or jsonb_typeof(v_entry) is distinct from 'object'
      or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or char_length(v_entry->>'externalId') not between 1 and 256
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or p_snapshot->'areas'->v_area->>'status' = 'failed'
      or (v_kind = 'profile' and v_entry->>'externalId' is distinct from v_connection.external_account_id)
      or (v_kind <> 'message' and v_entry ? 'parentExternalId') then
      raise exception 'Ungültiger Kontoeintrag' using errcode = '22023';
    end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode = '22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Ungültige Eintragszeit' using errcode = '22023';
    end;
    v_parent_id := null;
    if v_kind = 'message' then
      select id into v_parent_id from public.marketplace_account_entries
        where workspace_id = p_workspace_id and connection_id = p_connection_id and kind = 'conversation' and external_id = v_entry->>'parentExternalId';
      if v_parent_id is null or (p_snapshot->'areas'->'conversations'->>'status' = 'complete' and not exists (
        select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'conversation' and e->>'externalId' = v_entry->>'parentExternalId'
      )) then raise exception 'Nachricht ohne Kontogespräch' using errcode = '22023'; end if;
    end if;
    v_body := v_entry->'body';
    if v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' <> 'failed' then
      if jsonb_typeof(v_body->'feedbacks') is distinct from 'array' then raise exception 'Ungültige Bewertungen' using errcode = '22023'; end if;
      if exists (select 1 from jsonb_array_elements(v_body->'feedbacks') feedback where jsonb_typeof(feedback) <> 'object'
        or jsonb_typeof(feedback->'id') is distinct from 'string' or char_length(feedback->>'id') not between 1 and 256) then
        raise exception 'Ungültige Bewertungskennung' using errcode = '22023';
      end if;
    end if;
    if v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' = 'failed' then
      v_body := (v_body - 'feedbacks') || case when v_old_feedback is null then '{}'::jsonb else jsonb_build_object('feedbacks',v_old_feedback) end;
    elsif v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' = 'partial' then
      if jsonb_typeof(v_body->'feedbacks') is distinct from 'array' then raise exception 'Ungültige Teilbewertungen' using errcode = '22023'; end if;
      v_body := jsonb_set(v_body,'{feedbacks}',coalesce((
        select jsonb_agg(merged.value order by merged.position) from (
          select distinct on (source.value->>'id') source.value, source.position from (
            select value, ordinality as position from jsonb_array_elements(v_body->'feedbacks') with ordinality
            union all
            select value, ordinality + jsonb_array_length(v_body->'feedbacks') from jsonb_array_elements(coalesce(v_old_feedback,'[]')) with ordinality
          ) source order by source.value->>'id',source.position
        ) merged
      ),'[]'::jsonb));
    end if;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_kind,v_entry->>'externalId',v_parent_id,v_body,(v_entry->>'sortAt')::timestamptz,v_observed_at)
      on conflict (workspace_id,connection_id,kind,external_id) do update
        set parent_id = excluded.parent_id,body = excluded.body,sort_at = excluded.sort_at,observed_at = excluded.observed_at
        where public.marketplace_account_entries.observed_at <= excluded.observed_at;
    if found then v_counts := jsonb_set(v_counts,array[v_kind],to_jsonb((v_counts->>v_kind)::int + 1)); end if;
  end loop;

  -- Nur nachweislich vollständige Listen dürfen fehlende alte Einträge entfernen.
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.observed_at < v_observed_at and a.kind in ('publication','conversation')
    and not exists (select 1 from public.marketplace_account_entries child where child.parent_id = a.id and child.observed_at >= v_observed_at)
    and p_snapshot->'areas'->(case a.kind when 'publication' then 'publications' else 'conversations' end)->>'status' = 'complete'
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = a.kind and e->>'externalId' = a.external_id);
  if exists (select 1 from jsonb_array_elements(coalesce(p_snapshot->'rejectedSaleIds','[]')) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 256)
    or (jsonb_array_length(coalesce(p_snapshot->'rejectedSaleIds','[]')) > 0 and p_snapshot->'areas'->'sales'->>'status' = 'failed') then
    raise exception 'Ungültige Verkaufsbereinigung' using errcode = '22023';
  end if;
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.kind = 'sale' and a.observed_at < v_observed_at and a.external_id in (select jsonb_array_elements_text(coalesce(p_snapshot->'rejectedSaleIds','[]')))
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'sale' and e->>'externalId' = a.external_id);

  foreach v_area in array array['profile','publications','conversations','messages','sales','feedback'] loop
    v_status := p_snapshot->'areas'->v_area->>'status';
    insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,failure,observed_at,last_success_at,last_complete_at)
      values(p_workspace_id,p_connection_id,v_area,v_status,p_snapshot->'areas'->v_area->>'failure',v_observed_at,
        case when v_status <> 'failed' then v_observed_at end,case when v_status = 'complete' then v_observed_at end)
      on conflict (workspace_id,connection_id,area) do update set status = excluded.status,failure = excluded.failure,observed_at = excluded.observed_at,
        last_success_at = coalesce(excluded.last_success_at,public.marketplace_account_sync_sources.last_success_at),
        last_complete_at = coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  end loop;
  if not exists (select 1 from jsonb_each(p_snapshot->'areas') a where a.value->>'status' = 'failed') then
    update public.marketplace_connections set last_synced_at = v_observed_at where id = p_connection_id and (last_synced_at is null or last_synced_at < v_observed_at);
  end if;
  if v_session.expires_at <= clock_timestamp() then raise exception 'Sitzung während des Imports abgelaufen' using errcode = '42501'; end if;
  return v_counts;
end;
$function$;

create function public.marketplace_apply_vinted_sync_import (
  p_operation_id uuid,
  p_runner_id    uuid,
  p_worker_epoch bigint,
  p_session_id   uuid,
  p_snapshot     jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_operation public.marketplace_operations; v_valid jsonb; v_counts jsonb;
begin
  v_valid := public.marketplace_sync_validate(p_operation_id,p_runner_id,p_worker_epoch,false);
  if v_valid->>'active'<>'true' or v_valid->>'sessionId' is distinct from p_session_id::text then raise exception 'Auftragszugriff verweigert' using errcode='42501'; end if;
  select * into v_operation from public.marketplace_operations where id=p_operation_id;
  v_counts := public.marketplace_apply_vinted_import(v_operation.workspace_id,v_operation.connection_id,p_session_id,v_operation.requested_by,p_snapshot);
  -- Der bestätigte Import ist schon vor Browserstopp dauerhaft am Auftrag erkennbar.
  update public.marketplace_operations set observed_at=(p_snapshot->>'observedAt')::timestamptz,counts=v_counts,source_results=p_snapshot->'areas' where id=p_operation_id;
  if v_operation.schedule_id is not null and not exists(select 1 from jsonb_each(p_snapshot->'areas') a where a.value->>'failure' is not null) then
    update public.marketplace_sync_schedules set last_success_at=(p_snapshot->>'observedAt')::timestamptz,updated_at=clock_timestamp()
      where id=v_operation.schedule_id and authorization_version=v_operation.schedule_authorization_version;
  end if;
  return v_counts;
end;
$function$;

revoke all on function public.marketplace_apply_vinted_sync_import(uuid, uuid, bigint, uuid, jsonb) from public;

grant all on function public.marketplace_apply_vinted_sync_import(uuid, uuid, bigint, uuid, jsonb) to service_role;

create function public.marketplace_browser_session_bind_worker (
  p_session_id   uuid,
  p_worker_id    uuid,
  p_worker_epoch bigint
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return false; end if;
  update public.marketplace_browser_sessions set worker_id=p_worker_id,worker_epoch=p_worker_epoch,heartbeat_at=clock_timestamp(),absolute_expires_at=coalesce(absolute_expires_at,expires_at)
    where public_id=p_session_id and state='active' and expires_at>clock_timestamp()
      and (worker_epoch is null or (worker_id=p_worker_id and worker_epoch=p_worker_epoch));
  return found;
end;
$function$;

revoke all on function public.marketplace_browser_session_bind_worker(uuid, uuid, bigint) from public;

grant all on function public.marketplace_browser_session_bind_worker(uuid, uuid, bigint) to service_role;

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
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
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

create function public.marketplace_read_sync_schedule (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare v_schedule public.marketplace_sync_schedules;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists (select 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted') then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  select * into v_schedule from public.marketplace_sync_schedules where workspace_id = p_workspace_id and connection_id = p_connection_id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,
    'enabled',coalesce(v_schedule.enabled,false),'intervalMinutes',coalesce(v_schedule.interval_minutes,15),
    'nextDueAt',v_schedule.next_due_at,'lastAttemptAt',v_schedule.last_attempt_at,'lastSuccessAt',v_schedule.last_success_at,
    'pausedReason',v_schedule.paused_reason,'retryAfter',v_schedule.retry_after,'authorizationVersion',coalesce(v_schedule.authorization_version,0));
end;
$function$;

revoke all on function public.marketplace_read_sync_schedule(uuid, uuid) from public;

grant all on function public.marketplace_read_sync_schedule(uuid, uuid) to authenticated;

grant all on function public.marketplace_read_sync_schedule(uuid, uuid) to service_role;

create function public.marketplace_set_sync_schedule (
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
  if p_enabled is null or p_interval_minutes is distinct from 15 or p_authorization_version is null or p_authorization_version < 0 then
    raise exception 'Ungültiger Zeitplan' using errcode = '22023';
  end if;
  select * into v_schedule from public.marketplace_sync_schedules where workspace_id = p_workspace_id and connection_id = p_connection_id for update;
  if coalesce(v_schedule.authorization_version,0) <> p_authorization_version then raise exception 'Zeitplan wurde zwischenzeitlich geändert' using errcode = '40001'; end if;
  if not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  insert into public.marketplace_sync_schedules(workspace_id,connection_id,enabled,activated_by,interval_minutes,next_due_at)
    values(p_workspace_id,p_connection_id,p_enabled,(select auth.uid()),15,case when p_enabled then clock_timestamp()+interval '15 minutes' end)
    on conflict(workspace_id,connection_id) do update set enabled=excluded.enabled,activated_by=excluded.activated_by,
      authorization_version=public.marketplace_sync_schedules.authorization_version+1,next_due_at=excluded.next_due_at,
      paused_reason=null,retry_after=null,consecutive_failures=0,updated_at=clock_timestamp();
  update public.marketplace_operations set state='failed',error_code='access',finished_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and state='queued' and authorization_kind='scheduled_read'
      and schedule_authorization_version is distinct from (select authorization_version from public.marketplace_sync_schedules where workspace_id=p_workspace_id and connection_id=p_connection_id);
  return public.marketplace_read_sync_schedule(p_workspace_id,p_connection_id);
end;
$function$;

revoke all on function public.marketplace_set_sync_schedule(uuid, uuid, boolean, integer, bigint) from public;

grant all on function public.marketplace_set_sync_schedule(uuid, uuid, boolean, integer, bigint) to authenticated;

grant all on function public.marketplace_set_sync_schedule(uuid, uuid, boolean, integer, bigint) to service_role;

create function public.marketplace_sync_authorization_valid (
  p_workspace_id uuid,
  p_user_id      uuid
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
begin
  perform 1 from public.platform_operators where user_id = p_user_id for share;
  if not found then return false; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner','admin') for share;
  if not found then return false; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  return found;
end;
$function$;

revoke all on function public.marketplace_sync_authorization_valid(uuid, uuid) from public;

grant all on function public.marketplace_sync_authorization_valid(uuid, uuid) to service_role;

create function public.marketplace_sync_check (
  p_operation_id uuid,
  p_runner_id    uuid,
  p_worker_epoch bigint
)
  returns jsonb
  language sql
  set search_path to ''
  as $function$ select public.marketplace_sync_validate(p_operation_id,p_runner_id,p_worker_epoch,false); $function$;

revoke all on function public.marketplace_sync_check(uuid, uuid, bigint) from public;

grant all on function public.marketplace_sync_check(uuid, uuid, bigint) to service_role;

create function public.marketplace_sync_dispatch_claim (
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
      update public.marketplace_sync_schedules set next_due_at=clock_timestamp()+interval '15 minutes',updated_at=clock_timestamp() where id=v_schedule.id;
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

revoke all on function public.marketplace_sync_dispatch_claim(uuid, bigint, uuid, boolean) from public;

grant all on function public.marketplace_sync_dispatch_claim(uuid, bigint, uuid, boolean) to service_role;

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
  if not public.marketplace_can_manage(p_workspace_id) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  perform 1 from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id
      and marketplace = 'vinted' and status = 'connected' for update;
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

create function public.marketplace_sync_finish (
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
      next_due_at=case when v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then null else greatest(clock_timestamp()+interval '15 minutes',v_retry) end,
      updated_at=clock_timestamp() where id=v_schedule.id;
  end if;
  return true;
end;
$function$;

revoke all on function public.marketplace_sync_finish(uuid, uuid, bigint, jsonb) from public;

grant all on function public.marketplace_sync_finish(uuid, uuid, bigint, jsonb) to service_role;

create function public.marketplace_sync_heartbeat (
  p_operation_id uuid,
  p_runner_id    uuid,
  p_worker_epoch bigint
)
  returns jsonb
  language sql
  set search_path to ''
  as $function$ select public.marketplace_sync_validate(p_operation_id,p_runner_id,p_worker_epoch,true); $function$;

revoke all on function public.marketplace_sync_heartbeat(uuid, uuid, bigint) from public;

grant all on function public.marketplace_sync_heartbeat(uuid, uuid, bigint) to service_role;

create function public.marketplace_sync_progress (
  p_operation_id uuid,
  p_runner_id    uuid,
  p_worker_epoch bigint,
  p_stage        text
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
begin
  if public.marketplace_sync_validate(p_operation_id,p_runner_id,p_worker_epoch,false)->>'active'<>'true' then return false; end if;
  update public.marketplace_operations set stage=p_stage where id=p_operation_id;
  return found;
end;
$function$;

revoke all on function public.marketplace_sync_progress(uuid, uuid, bigint, text) from public;

grant all on function public.marketplace_sync_progress(uuid, uuid, bigint, text) to service_role;

create function public.marketplace_sync_recover (
  p_worker_id    uuid,
  p_worker_epoch bigint
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_count integer := 0; v_operation public.marketplace_operations; v_runner uuid; v_imported boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Worker nicht mehr aktiv' using errcode='42501'; end if;
  for v_operation in select o.* from public.marketplace_operations o
    where ((o.state='queued' and o.authorization_version is null) or (o.state='running' and o.worker_epoch is distinct from p_worker_epoch))
      and not exists(select 1 from public.marketplace_browser_sessions s where s.workspace_id=o.workspace_id and s.connection_id=o.connection_id and s.state in ('active','stopping')) loop
    v_imported:=v_operation.observed_at is not null and v_operation.counts is not null and v_operation.source_results is not null;
    v_runner:=gen_random_uuid();
    -- Nur nach bestätigtem Browserstopp übernimmt Recovery den Abschluss mit neuer Besitzerkennung.
    update public.marketplace_operations set state='running',runner_id=v_runner,worker_epoch=p_worker_epoch where id=v_operation.id;
    if public.marketplace_sync_finish(v_operation.id,v_runner,p_worker_epoch,jsonb_build_object(
      'state',case when v_imported then 'succeeded' else 'failed' end,
      'errorCode',case when v_imported then null else 'interrupted' end,
      'pausedReason',case when v_imported then null else 'interrupted' end)) then v_count:=v_count+1; end if;
  end loop;
  return jsonb_build_object('interruptedOperations',v_count);
end;
$function$;

revoke all on function public.marketplace_sync_recover(uuid, bigint) from public;

grant all on function public.marketplace_sync_recover(uuid, bigint) to service_role;

create function public.marketplace_sync_validate (
  p_operation_id uuid,
  p_runner_id    uuid,
  p_worker_epoch bigint,
  p_renew        boolean default false
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_operation public.marketplace_operations; v_connection public.marketplace_connections; v_schedule public.marketplace_sync_schedules; v_session public.marketplace_browser_sessions; v_runtime public.marketplace_worker_runtime;
  v_inactive jsonb := '{"active":false,"sessionId":null,"expiresAt":null,"absoluteExpiresAt":null}';
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_runtime from public.marketplace_worker_runtime where id=1 and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_operation from public.marketplace_operations where id=p_operation_id;
  if not found then return v_inactive; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=v_operation.workspace_id and id=v_operation.connection_id and marketplace='vinted' for update;
  if not found or v_connection.status<>'connected' then return v_inactive; end if;
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

revoke all on function public.marketplace_sync_validate(uuid, uuid, bigint, boolean) from public;

grant all on function public.marketplace_sync_validate(uuid, uuid, bigint, boolean) to service_role;

create function public.marketplace_worker_claim (
  p_worker_id uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_runtime public.marketplace_worker_runtime;
begin
  if p_worker_id is null then raise exception 'Workerkennung fehlt' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_runtime from public.marketplace_worker_runtime where id=1 for update;
  if found and v_runtime.expires_at > clock_timestamp() and v_runtime.worker_id <> p_worker_id then return null; end if;
  if v_runtime.id is null then
    -- Singletonkennung ist absichtlich fest; Sequenzwerte werden bei Rollback nicht zurückgesetzt.
    insert into public.marketplace_worker_runtime(id,worker_id,worker_epoch,heartbeat_at,expires_at) overriding system value
      values(1,p_worker_id,1,clock_timestamp(),clock_timestamp()+interval '90 seconds') returning * into v_runtime;
  elsif v_runtime.expires_at <= clock_timestamp() then
    update public.marketplace_worker_runtime set worker_id=p_worker_id,worker_epoch=worker_epoch+1,
      heartbeat_at=clock_timestamp(),expires_at=clock_timestamp()+interval '90 seconds' where id=1 returning * into v_runtime;
  end if;
  return jsonb_build_object('workerId',v_runtime.worker_id,'workerEpoch',v_runtime.worker_epoch,'expiresAt',v_runtime.expires_at);
end;
$function$;

revoke all on function public.marketplace_worker_claim(uuid) from public;

grant all on function public.marketplace_worker_claim(uuid) to service_role;

create function public.marketplace_worker_heartbeat (
  p_worker_id    uuid,
  p_worker_epoch bigint
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_expiry timestamptz;
begin
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_worker_runtime set heartbeat_at=clock_timestamp(),expires_at=clock_timestamp()+interval '90 seconds'
    where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() returning expires_at into v_expiry;
  return jsonb_build_object('active',found,'expiresAt',v_expiry);
end;
$function$;

revoke all on function public.marketplace_worker_heartbeat(uuid, bigint) from public;

grant all on function public.marketplace_worker_heartbeat(uuid, bigint) to service_role;

create function public.marketplace_worker_release (
  p_worker_id    uuid,
  p_worker_epoch bigint
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if exists(select 1 from public.marketplace_browser_sessions where worker_id=p_worker_id and worker_epoch=p_worker_epoch and state in ('active','stopping')) then return false; end if;
  update public.marketplace_worker_runtime set expires_at=clock_timestamp() where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch;
  return found;
end;
$function$;

revoke all on function public.marketplace_worker_release(uuid, bigint) from public;

grant all on function public.marketplace_worker_release(uuid, bigint) to service_role;

alter table public.marketplace_browser_sessions
  add column worker_id uuid;

alter table public.marketplace_browser_sessions
  add column worker_epoch bigint;

alter table public.marketplace_browser_sessions
  add column operation_id uuid;

alter table public.marketplace_browser_sessions
  add column heartbeat_at timestamp with time zone;

alter table public.marketplace_browser_sessions
  add column absolute_expires_at timestamp with time zone;

alter table public.marketplace_operations
  add column authorization_kind text;

alter table public.marketplace_operations
  add constraint marketplace_operations_authorization_kind_check check (authorization_kind = any (array['manual_read'::text, 'scheduled_read'::text]));

alter table public.marketplace_operations
  add column authorization_version bigint;

alter table public.marketplace_operations
  add constraint marketplace_operations_authorization_version_check check (authorization_version = 1);

alter table public.marketplace_operations
  add column schedule_id bigint;

alter table public.marketplace_operations
  add column schedule_authorization_version bigint;

alter table public.marketplace_operations
  add column worker_epoch bigint;

alter table public.marketplace_operations
  add column heartbeat_at timestamp with time zone;

alter table public.marketplace_operations
  add column lease_expires_at timestamp with time zone;

alter table public.marketplace_operations
  add column browser_session_id uuid;

create table public.marketplace_sync_schedules (
  id                    bigint                   generated always as identity not null,
  workspace_id          uuid                     not null,
  connection_id         uuid                     not null,
  enabled               boolean                  default false not null,
  activated_by          uuid                     not null,
  interval_minutes      integer                  default 15 not null,
  authorization_version bigint                   default 1 not null,
  next_due_at           timestamp with time zone,
  last_attempt_at       timestamp with time zone,
  last_success_at       timestamp with time zone,
  paused_reason         text,
  retry_after           timestamp with time zone,
  consecutive_failures  integer                  default 0 not null,
  created_at            timestamp with time zone default now() not null,
  updated_at            timestamp with time zone default now() not null
);

comment on table public.marketplace_sync_schedules is 'Widerrufbare Freigaben für ausschließlich lesende Kontoabrufe; keine Nutzer-JWT oder Anbieterzugänge.';

alter table public.marketplace_sync_schedules
  enable row level security;

alter table public.marketplace_sync_schedules
  add constraint marketplace_sync_schedules_activated_by_fkey foreign key (activated_by) references auth.users(id);

alter table public.marketplace_sync_schedules
  add constraint marketplace_sync_schedules_authorization_version_check check (authorization_version > 0);

alter table public.marketplace_sync_schedules
  add constraint marketplace_sync_schedules_consecutive_failures_check check (consecutive_failures >= 0);

alter table public.marketplace_sync_schedules
  add constraint marketplace_sync_schedules_interval_minutes_check check (interval_minutes = 15);

alter table public.marketplace_sync_schedules
  add constraint marketplace_sync_schedules_paused_reason_check
    check
    (paused_reason = any (array['needs_login'::text, 'forbidden'::text, 'challenge'::text, 'rate_limited'::text, 'network'::text, 'server'::text, 'retry_limit'::text,
    'access_revoked'::text, 'cleanup'::text, 'interrupted'::text]));

alter table public.marketplace_sync_schedules
  add constraint marketplace_sync_schedules_pkey primary key (id);

alter table public.marketplace_sync_schedules
  add constraint marketplace_sync_schedules_workspace_id_connection_id_fkey foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id)
    on delete cascade;

alter table public.marketplace_sync_schedules
  add constraint marketplace_sync_schedules_workspace_id_connection_id_key unique (workspace_id, connection_id);

grant select on public.marketplace_sync_schedules to authenticated;

grant all on public.marketplace_sync_schedules to service_role;

create index marketplace_sync_schedules_activator on public.marketplace_sync_schedules (activated_by);

create index marketplace_sync_schedules_due on public.marketplace_sync_schedules (next_due_at, id)
  where enabled;

create policy "Administrators read sync schedules" on public.marketplace_sync_schedules
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Worker deletes sync schedules" on public.marketplace_sync_schedules
  for delete
  to service_role
  using (true);

create policy "Worker inserts sync schedules" on public.marketplace_sync_schedules
  for insert
  to service_role
  with check (true);

create policy "Worker reads sync schedules" on public.marketplace_sync_schedules
  for select
  to service_role
  using (true);

create policy "Worker updates sync schedules" on public.marketplace_sync_schedules
  for update
  to service_role
  using (true)
  with check (true);

create table public.marketplace_worker_runtime (
  id           bigint                   generated always as identity not null,
  worker_id    uuid                     not null,
  worker_epoch bigint                   not null,
  heartbeat_at timestamp with time zone not null,
  expires_at   timestamp with time zone not null
);

comment on table public.marketplace_worker_runtime is 'Ein exklusiver Worker mit Besitzerkennung und Sperrversion; Ablauf allein gibt keine Browserprofile frei.';

alter table public.marketplace_worker_runtime
  enable row level security;

alter table public.marketplace_worker_runtime
  add constraint marketplace_worker_runtime_id_check check (id = 1);

alter table public.marketplace_worker_runtime
  add constraint marketplace_worker_runtime_pkey primary key (id);

alter table public.marketplace_worker_runtime
  add constraint marketplace_worker_runtime_worker_epoch_check check (worker_epoch > 0);

grant insert, select, update on public.marketplace_worker_runtime to service_role;

create policy "Worker inserts runtime" on public.marketplace_worker_runtime
  for insert
  to service_role
  with check (true);

create policy "Worker reads runtime" on public.marketplace_worker_runtime
  for select
  to service_role
  using (true);

create policy "Worker updates runtime" on public.marketplace_worker_runtime
  for update
  to service_role
  using (true)
  with check (true);

-- Explizite Rechte aus dem deklarativen Schema; der Diff erfasst ACLs nicht vollständig.
revoke all on public.marketplace_sync_schedules from public, anon, authenticated;
grant select on public.marketplace_sync_schedules to authenticated;
grant all on public.marketplace_sync_schedules to service_role;
revoke all on sequence public.marketplace_sync_schedules_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_sync_schedules_id_seq to service_role;
revoke all on public.marketplace_worker_runtime from public, anon, authenticated;
revoke all on public.marketplace_worker_runtime from service_role;
grant select, insert, update on public.marketplace_worker_runtime to service_role;
revoke all on sequence public.marketplace_worker_runtime_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_worker_runtime_id_seq to service_role;

-- Jede neue Serverfunktion ist explizit von Browserclients und anonymen Rollen getrennt.
do $$
declare v_function regprocedure;
begin
  for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
    'marketplace_sync_authorization_valid','marketplace_worker_claim','marketplace_worker_heartbeat','marketplace_worker_release',
    'marketplace_browser_session_bind_worker','marketplace_sync_dispatch_claim','marketplace_sync_validate','marketplace_sync_check','marketplace_sync_heartbeat',
    'marketplace_sync_progress','marketplace_sync_finish','marketplace_apply_vinted_sync_import','marketplace_sync_recover','marketplace_read_sync_schedule','marketplace_set_sync_schedule') loop
    execute format('revoke all on function %s from public, anon, authenticated',v_function);
    execute format('grant execute on function %s to service_role',v_function);
  end loop;
end;
$$;
grant execute on function public.marketplace_read_sync_schedule(uuid,uuid) to authenticated;
grant execute on function public.marketplace_set_sync_schedule(uuid,uuid,boolean,integer,bigint) to authenticated;
