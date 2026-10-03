-- Lokale Vinted-Lesefreigaben und gegenseitiger Ausschluss von lokalem und Cloudbetrieb.
-- Betroffene Tabellen: marketplace_connections, marketplace_local_extension_grants; Marketplace-Guards.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

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
  AS $function$
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
  if not found or v_connection.execution_mode <> 'cloud' or v_connection.status <> 'connected' then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
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

  -- Gleiche Kontosperre und Einstellungsfassung für Ausgangsbasis und alle
  -- tatsächlich übernommenen Inserate dieses Batches.
  perform public.marketplace_prepare_favorite_import(p_workspace_id,p_connection_id,v_observed_at);

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
  perform public.marketplace_finalize_favorite_import(p_workspace_id,p_connection_id,v_observed_at,p_snapshot->'areas'->'publications'->>'status' <> 'failed');
  return v_counts;
end;
$function$;

create function public.marketplace_approve_local_extension (
  p_workspace_id                 uuid,
  p_connection_id                uuid,
  p_token_hash                   text,
  p_expected_external_account_id text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
  if not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_token_hash,p_expected_external_account_id,clock_timestamp()+interval '24 hours')
    on conflict(workspace_id,connection_id) do update set approved_by=excluded.approved_by,token_hash=excluded.token_hash,external_account_id=excluded.external_account_id,expires_at=excluded.expires_at,last_seen_at=null,revoked_at=null returning * into v_grant;
  update public.marketplace_connections set external_account_id=p_expected_external_account_id,execution_mode='local',status='needs_login',resume_status=null,capabilities='{}'::jsonb,updated_at=clock_timestamp() where id=p_connection_id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at);
end;
$function$;

revoke all on function public.marketplace_approve_local_extension(uuid, uuid, text, text) from public;

grant all on function public.marketplace_approve_local_extension(uuid, uuid, text, text) to authenticated;

grant all on function public.marketplace_approve_local_extension(uuid, uuid, text, text) to service_role;

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
  AS $function$
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
  if not found or v_connection.execution_mode <> 'cloud' or v_connection.status in ('paused', 'blocked') then
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

create or replace function public.marketplace_browser_session_check (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_status text; v_session public.marketplace_browser_sessions; v_active boolean;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' and execution_mode = 'cloud' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid()) for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  if v_session.state = 'active' and (v_session.expires_at <= clock_timestamp() or v_status in ('paused', 'blocked')) then
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
  AS $function$
declare v_status text; v_profile_id text; v_session public.marketplace_browser_sessions;
begin
  -- Alle Browseraktionen teilen den einen konservativen Cloudplatz.
  perform pg_advisory_xact_lock(91731, 1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
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
  AS $function$
declare v_session public.marketplace_browser_sessions;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
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

create function public.marketplace_ingest_local_extension (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text,
  p_snapshot      jsonb default null::jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_observed timestamptz; v_entry jsonb; v_count integer:=0; v_complete boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or (v_connection.external_account_id is not null and v_connection.external_account_id<>v_grant.external_account_id) then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  if p_snapshot is null then
    update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
    return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at);
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>524288
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object' or p_snapshot->'identity'->>'id' is distinct from v_grant.external_account_id then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array' or jsonb_array_length(p_snapshot->'entries')>501
    or jsonb_typeof(p_snapshot->'publicationsComplete') is distinct from 'boolean' or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or jsonb_typeof(p_snapshot->'identity'->'username') is distinct from 'string' or char_length(p_snapshot->'identity'->>'username') not between 1 and 120 then raise exception 'Ungültiger lokaler Import' using errcode='22023'; end if;
  begin v_observed:=(p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Abrufzeit' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id),'-infinity') then raise exception 'Veralteter Import' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind'='profile')<>1
    or exists(select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Ungültige Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or v_entry->>'kind' is null or v_entry->>'kind' not in ('profile','publication')
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^[1-9][0-9]{0,31}$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='profile' then array['username','displayName','location','bio','bioState','imageUrl','feedbackCount','feedbackReputation','positiveFeedbackCount','neutralFeedbackCount','negativeFeedbackCount','itemCount','observedAt'] else array['title','text','textState','occurredAt','price','currency','status','imageUrl','imageUrls','metrics','promoted','brand','size','priceLabel','isClosed','isReserved'] end))
      or (v_entry->>'kind'='profile' and (v_entry->>'externalId'<>v_grant.external_account_id or v_entry->'body'->>'username' is distinct from p_snapshot->'identity'->>'username')) then raise exception 'Ungültiger Kontoeintrag' using errcode='22023'; end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_entry->>'kind',v_entry->>'externalId',v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
      on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    if v_entry->>'kind'='publication' then v_count:=v_count+1; end if;
  end loop;
  v_complete:=(p_snapshot->>'publicationsComplete')::boolean;
  -- Auch vollständige lokale Lesekopien löschen niemals Anzeigen oder interpretieren fehlende Datensätze als Verkauf.
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
    values(p_workspace_id,p_connection_id,'profile','complete',v_observed,v_observed,v_observed),
      (p_workspace_id,p_connection_id,'publications',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,
      last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  update public.marketplace_connections set external_account_id=v_grant.external_account_id,status='connected',capabilities='{"profile.read":"verified","listings.read":"verified"}',last_synced_at=v_observed,updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  -- Der bestehende Connection-Trigger sendet account_imported mit last_synced_at.
  return jsonb_build_object('ok',true,'counts',jsonb_build_object('profile',1,'publication',v_count),'observedAt',v_observed);
end;
$function$;

revoke all on function public.marketplace_ingest_local_extension(uuid, uuid, text, jsonb) from public;

grant all on function public.marketplace_ingest_local_extension(uuid, uuid, text, jsonb) to service_role;

create or replace function public.marketplace_list_connections (
  p_workspace_id uuid
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  AS $function$
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  return jsonb_build_object('canManage', true, 'connections', coalesce((
    select jsonb_agg(jsonb_build_object(
      'workspaceId', c.workspace_id, 'connectionId', c.id, 'marketplace', c.marketplace,
      'displayName', c.display_name, 'externalAccountId', c.external_account_id,
      'status', c.status, 'executionMode', c.execution_mode, 'capabilities', c.capabilities,
      'allowedActions', case when c.execution_mode = 'local' then jsonb_build_array('profile.read', 'listings.read') else jsonb_build_array('profile.read', 'listings.read', 'metrics.read', 'conversations.read', 'messages.sendText', 'listings.update', 'listings.publish', 'sales.read') end,
      'lastSyncedAt', c.last_synced_at
    ) order by c.created_at, c.id) from public.marketplace_connections c
    where c.workspace_id = p_workspace_id and c.marketplace = 'vinted'
  ), '[]'::jsonb));
end;
$function$;

create function public.marketplace_local_extension_user_valid (
  p_user_id uuid
)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
begin
  perform 1 from auth.users where id=p_user_id and not is_anonymous for share;
  return found;
end;
$function$;

revoke all on function public.marketplace_local_extension_user_valid(uuid) from public;

grant all on function public.marketplace_local_extension_user_valid(uuid) to service_role;

create function public.marketplace_read_local_extension (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  AS $function$
declare v_grant public.marketplace_local_extension_grants;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('binding',case when v_grant.id is null then null else jsonb_build_object('externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'lastSeenAt',v_grant.last_seen_at,'revoked',v_grant.revoked_at is not null) end);
end;
$function$;

revoke all on function public.marketplace_read_local_extension(uuid, uuid) from public;

grant all on function public.marketplace_read_local_extension(uuid, uuid) to authenticated;

grant all on function public.marketplace_read_local_extension(uuid, uuid) to service_role;

create function public.marketplace_require_cloud_execution()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_connections where workspace_id=new.workspace_id and id=new.connection_id and execution_mode='cloud' for update;
  if not found then raise exception 'Lokale Verbindung erlaubt keinen Cloudauftrag' using errcode='42501'; end if;
  return new;
end;
$function$;

revoke all on function public.marketplace_require_cloud_execution() from public;

grant all on function public.marketplace_require_cloud_execution() to service_role;

create function public.marketplace_revoke_local_extension (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  perform 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  update public.marketplace_local_extension_grants set revoked_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and revoked_at is null;
  update public.marketplace_connections set status='disconnected',resume_status=null,capabilities='{}',updated_at=clock_timestamp() where id=p_connection_id and execution_mode='local';
  return jsonb_build_object('ok',true);
end;
$function$;

revoke all on function public.marketplace_revoke_local_extension(uuid, uuid) from public;

grant all on function public.marketplace_revoke_local_extension(uuid, uuid) to authenticated;

grant all on function public.marketplace_revoke_local_extension(uuid, uuid) to service_role;

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
  AS $function$
declare v_schedule public.marketplace_sync_schedules;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted'
    and (not p_enabled or (execution_mode = 'cloud' and status = 'connected')) for update;
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
      if v_connection.execution_mode <> 'cloud' or v_connection.status is distinct from 'connected' or not public.marketplace_sync_authorization_valid(v_schedule.workspace_id,v_schedule.activated_by) then
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

create or replace function public.marketplace_sync_enqueue (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_operation public.marketplace_operations;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then
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

create or replace function public.marketplace_sync_validate (
  p_operation_id uuid,
  p_runner_id    uuid,
  p_worker_epoch bigint,
  p_renew        boolean default false
)
  returns jsonb
  language plpgsql
  set search_path to ''
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
  if not found or v_connection.execution_mode <> 'cloud' or v_connection.status<>'connected' then return v_inactive; end if;
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

create trigger marketplace_browser_requires_cloud
  before insert on public.marketplace_browser_sessions
  for each row
  execute function public.marketplace_require_cloud_execution();

alter table public.marketplace_connections
  add column execution_mode text default 'cloud'::text not null;

alter table public.marketplace_connections
  add constraint marketplace_connections_execution_mode_check check (execution_mode = ANY (ARRAY['cloud'::text, 'local'::text]));

create table public.marketplace_local_extension_grants (
  id                  bigint                   generated always as identity not null,
  workspace_id        uuid                     not null,
  connection_id       uuid                     not null,
  approved_by         uuid                     not null,
  token_hash          text                     not null,
  external_account_id text                     not null,
  expires_at          timestamp with time zone not null,
  last_seen_at        timestamp with time zone,
  revoked_at          timestamp with time zone
);

comment on table public.marketplace_local_extension_grants is 'Widerrufbare 24-Stunden-Lesefreigaben für eine lokale Installation; keine Browser- oder Vinted-Geheimnisse.';

alter table public.marketplace_local_extension_grants
  enable row level security;

alter table public.marketplace_local_extension_grants
  add constraint marketplace_local_extension_gra_workspace_id_connection_id_fkey foreign key (workspace_id, connection_id)
    references public.marketplace_connections(workspace_id, id) on delete cascade;

alter table public.marketplace_local_extension_grants
  add constraint marketplace_local_extension_gran_workspace_id_connection_id_key unique (workspace_id, connection_id);

alter table public.marketplace_local_extension_grants
  add constraint marketplace_local_extension_grants_approved_by_fkey foreign key (approved_by) references auth.users(id) on delete cascade;

alter table public.marketplace_local_extension_grants
  add constraint marketplace_local_extension_grants_external_account_id_check check (external_account_id ~ '^[1-9][0-9]{0,31}$'::text);

alter table public.marketplace_local_extension_grants
  add constraint marketplace_local_extension_grants_pkey primary key (id);

alter table public.marketplace_local_extension_grants
  add constraint marketplace_local_extension_grants_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'::text);

alter table public.marketplace_local_extension_grants
  add constraint marketplace_local_extension_grants_token_hash_key unique (token_hash);

grant all on public.marketplace_local_extension_grants to service_role;

create index marketplace_local_extension_grants_approver on public.marketplace_local_extension_grants (approved_by);

create policy "Worker deletes local grants" on public.marketplace_local_extension_grants
  for delete
  to service_role
  using (true);

create policy "Worker inserts local grants" on public.marketplace_local_extension_grants
  for insert
  to service_role
  with check (true);

create policy "Worker reads local grants" on public.marketplace_local_extension_grants
  for select
  to service_role
  using (true);

create policy "Worker updates local grants" on public.marketplace_local_extension_grants
  for update
  to service_role
  using (true)
  with check (true);

create trigger marketplace_operation_requires_cloud
  before insert on public.marketplace_operations
  for each row
  execute function public.marketplace_require_cloud_execution();

create trigger marketplace_schedule_requires_cloud
  before insert or update on public.marketplace_sync_schedules
  for each row
  when (new.enabled)
  execute function public.marketplace_require_cloud_execution();
-- Explizite Schema-ACLs: pg-delta erfasst geerbte Default-Grants neuer Objekte nicht vollständig.
revoke all on public.marketplace_local_extension_grants from public,anon,authenticated;

grant all on public.marketplace_local_extension_grants to service_role;

revoke all on sequence public.marketplace_local_extension_grants_id_seq from public,anon,authenticated;

grant usage,select on sequence public.marketplace_local_extension_grants_id_seq to service_role;

revoke all on function public.marketplace_local_extension_user_valid(uuid) from public,anon,authenticated;

grant execute on function public.marketplace_local_extension_user_valid(uuid) to service_role;

revoke all on function public.marketplace_require_cloud_execution() from public,anon,authenticated;

revoke all on function public.marketplace_approve_local_extension(uuid,uuid,text,text),public.marketplace_read_local_extension(uuid,uuid),public.marketplace_revoke_local_extension(uuid,uuid) from public,anon;

grant execute on function public.marketplace_approve_local_extension(uuid,uuid,text,text),public.marketplace_read_local_extension(uuid,uuid),public.marketplace_revoke_local_extension(uuid,uuid) to authenticated;

revoke all on function public.marketplace_ingest_local_extension(uuid,uuid,text,jsonb) from public,anon,authenticated;

grant execute on function public.marketplace_ingest_local_extension(uuid,uuid,text,jsonb),public.marketplace_require_cloud_execution() to service_role;
