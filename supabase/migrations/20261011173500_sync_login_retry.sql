-- Zweck: Eine einzelne nicht bestätigte Vinted-Anmeldung hält die Automatik nicht mehr an.
-- Erst die dritte Ablehnung in Folge beendet die Freigabe; bis dahin bleibt der Zeitplan aktiv
-- und der nächste reguläre Abruf versucht es erneut.
-- Betrifft: Funktion public.marketplace_sync_finish (Tabelle public.marketplace_sync_schedules:
-- enabled, authorization_version, paused_reason, next_due_at, consecutive_failures).
-- Von Hand aus supabase/schemas/310_marketplace_sync_scheduling.sql übernommen, weil lokal keine
-- Datenbank für supabase db diff lief; der Funktionstext ist identisch mit der Schemadatei.
-- Rechte bleiben unverändert, da die Funktion mit gleicher Signatur ersetzt wird.

set check_function_bodies = false;

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
    if v_reason in ('network','server','interrupted') then
      if v_failures>=3 then v_reason:='retry_limit'; else v_retry:=clock_timestamp()+make_interval(mins=>15*(2^v_failures)::integer); end if;
    elsif v_reason='needs_login' and v_failures<3 then
      -- Vinted bestätigt eine gültige Anmeldung gelegentlich nicht sofort. Erst die dritte
      -- Ablehnung in Folge beendet die Freigabe; bis dahin läuft der nächste reguläre Abruf.
      v_soft_login:=true;
    elsif v_reason='rate_limited' then v_retry:=coalesce(v_retry,clock_timestamp()+interval '15 minutes'); end if;
    update public.marketplace_sync_schedules set
      enabled=case when not v_soft_login and v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then false else enabled end,
      authorization_version=authorization_version+case when not v_soft_login and v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then 1 else 0 end,
      paused_reason=v_reason,retry_after=v_retry,consecutive_failures=v_failures,
      last_success_at=case when p_outcome->>'state'='succeeded' and v_reason is null then v_operation.observed_at else last_success_at end,
      next_due_at=case when not v_soft_login and v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then null else greatest(clock_timestamp()+make_interval(mins=>v_schedule.interval_minutes),v_retry) end,
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
