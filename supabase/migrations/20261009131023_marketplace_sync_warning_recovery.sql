-- Alte Anbieterwarnungen nach bestätigtem manuellem Vinted-Abruf bereinigen.
-- Betroffen: marketplace_sync_finish und marketplace_sync_schedules; keine neue Freigabe.
-- Funktionsänderung per Supabase-Diff erzeugt; Bestandsbereinigung anschließend ergänzt.

set check_function_bodies = false;
create or replace function public.marketplace_sync_finish(p_operation_id uuid, p_runner_id uuid, p_worker_epoch bigint, p_outcome jsonb)
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
  if v_operation.schedule_id is not null then
    select * into v_schedule from public.marketplace_sync_schedules where id=v_operation.schedule_id for update;
  elsif v_operation.authorization_kind='manual_read' then
    select * into v_schedule from public.marketplace_sync_schedules
      where workspace_id=v_operation.workspace_id and connection_id=v_operation.connection_id for update;
  end if;
  select * into v_operation from public.marketplace_operations where id=p_operation_id and state='running' and runner_id=p_runner_id and worker_epoch=p_worker_epoch for update;
  if not found then return false; end if;
  if jsonb_typeof(p_outcome) is distinct from 'object' or p_outcome->>'state' is null or p_outcome->>'state' not in ('succeeded','failed') then raise exception 'UngÃ¼ltiger Auftragsabschluss' using errcode='22023'; end if;
  if p_outcome->>'state'='succeeded' and (v_operation.observed_at is null or v_operation.counts is null or v_operation.source_results is null) then raise exception 'BestÃ¤tigter Import fehlt' using errcode='22023'; end if;
  v_reason := p_outcome->>'pausedReason';
  if v_reason is not null and v_reason not in ('needs_login','forbidden','challenge','rate_limited','network','server','retry_limit','access_revoked','cleanup','interrupted') then raise exception 'UngÃ¼ltiger Pausengrund' using errcode='22023'; end if;
  if p_outcome->>'retryAfter' is not null then
    begin v_retry := (p_outcome->>'retryAfter')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'UngÃ¼ltige Wartezeit' using errcode='22023'; end;
    if not isfinite(v_retry) then raise exception 'UngÃ¼ltige Wartezeit' using errcode='22023'; end if;
    v_retry := least(greatest(v_retry,clock_timestamp()+interval '15 minutes'),clock_timestamp()+interval '1 day');
  end if;
  -- Quellenfehler wirken auch bei einer insgesamt erfolgreich Ã¼bernommenen Teilantwort.
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
    elsif v_reason='rate_limited' then v_retry:=coalesce(v_retry,clock_timestamp()+interval '15 minutes'); end if;
    update public.marketplace_sync_schedules set
      enabled=case when v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then false else enabled end,
      authorization_version=authorization_version+case when v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then 1 else 0 end,
      paused_reason=v_reason,retry_after=v_retry,consecutive_failures=v_failures,
      last_success_at=case when p_outcome->>'state'='succeeded' and v_reason is null then v_operation.observed_at else last_success_at end,
      next_due_at=case when v_reason in ('needs_login','forbidden','challenge','access_revoked','cleanup','retry_limit') then null else greatest(clock_timestamp()+make_interval(mins=>v_schedule.interval_minutes),v_retry) end,
      updated_at=clock_timestamp() where id=v_schedule.id;
  elsif v_operation.authorization_kind='manual_read' and p_outcome->>'state'='succeeded'
    and p_outcome->>'errorCode' is null and v_reason is null
    and v_operation.source_results->'profile'->>'status'='complete'
    and not exists(select 1 from jsonb_each(v_operation.source_results) a where a.value->>'failure' is not null)
    and public.marketplace_sync_authorization_valid(v_operation.workspace_id,v_operation.requested_by) then
    -- Ein neuer bestÃ¤tigter Abruf lÃ¶st die alte Anbieterwarnung. Eine Pause,
    -- FreigabeÃ¤nderung nach Abrufbeginn oder ungeklÃ¤rte Bereinigung bleibt erhalten.
    update public.marketplace_sync_schedules set paused_reason=null,retry_after=null,
      consecutive_failures=0,updated_at=clock_timestamp()
      where id=v_schedule.id and paused_reason in ('needs_login','forbidden','challenge')
        and updated_at<=v_operation.started_at;
  end if;
  return true;
end;
$function$;

-- Bereits bestätigte manuelle Abrufe lösen auch vor diesem Update gespeicherte Warnungen.
-- Pausen und Freigabeversionen bleiben unverändert; der neueste Auftrag muss fehlerfrei sein.
update public.marketplace_sync_schedules s
set paused_reason=null,retry_after=null,consecutive_failures=0,updated_at=clock_timestamp()
from public.marketplace_connections c, public.marketplace_operations o
where c.workspace_id=s.workspace_id and c.id=s.connection_id
  and c.marketplace='vinted' and c.execution_mode='cloud' and c.status='connected'
  and s.paused_reason in ('needs_login','forbidden','challenge')
  and o.workspace_id=s.workspace_id and o.connection_id=s.connection_id
  and o.authorization_kind='manual_read' and o.schedule_id is null
  and o.state='succeeded' and o.error_code is null
  and o.started_at>=s.updated_at and o.observed_at>=o.started_at and o.finished_at>=o.observed_at
  and o.source_results->'profile'->>'status'='complete'
  and not exists(select 1 from jsonb_each(o.source_results) a where a.value->>'failure' is not null)
  and not exists(select 1 from public.marketplace_operations newer
    where newer.workspace_id=s.workspace_id and newer.connection_id=s.connection_id
      and newer.id<>o.id and newer.created_at>=o.created_at)
  and not exists(select 1 from public.marketplace_browser_sessions b
    where b.workspace_id=s.workspace_id and b.connection_id=s.connection_id and b.state in ('active','stopping'))
  and public.marketplace_sync_authorization_valid(o.workspace_id,o.requested_by);
