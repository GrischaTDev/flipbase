-- Artikelbezogene Vinted-Rabatte bei Entwurf, Veröffentlichung und Favoritennachrichten.
-- Betroffen: marketplace_listing_favorite_discounts und bestehende Inserat- und Versandfunktionen.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set local check_function_bodies = false;

create or replace function public.marketplace_cloud_favorite_begin (
  p_workspace_id         uuid,
  p_connection_id        uuid,
  p_event_id             uuid,
  p_claim_token          uuid,
  p_worker_id            uuid,
  p_worker_epoch         bigint,
  p_phase                text,
  p_original_price_cents bigint default null::bigint,
  p_offer_price_cents    bigint default null::bigint
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_event public.marketplace_favorite_message_events;
begin
  if public.marketplace_cloud_favorite_check(p_workspace_id,p_connection_id,p_event_id,p_claim_token,p_worker_id,p_worker_epoch,p_phase)->>'active'<>'true' then raise exception 'Favoritenclaim ungültig' using errcode='42501'; end if;
  select * into v_event from public.marketplace_favorite_message_events where id=p_event_id;
  if p_phase='message' then
    if v_event.state<>'claimed' then raise exception 'Favoritenclaim ungültig' using errcode='42501'; end if;
    update public.marketplace_favorite_message_events set state='sending',updated_at=clock_timestamp() where id=p_event_id;
  elsif p_phase='offer' then
    if v_event.offer_state<>'claimed' or v_event.external_message_id is null or v_event.external_conversation_id is null or v_event.external_transaction_id is null or v_event.offer_config is null then raise exception 'Angebotsclaim ungültig' using errcode='42501'; end if;
    perform public.marketplace_validate_favorite_offer_price(v_event.offer_config,p_original_price_cents,p_offer_price_cents);
    if v_event.message_offer_base_price_cents is not null and p_original_price_cents<>v_event.message_offer_base_price_cents then
      update public.marketplace_favorite_message_events set offer_state='skipped',offer_error_code='price_changed',lease_expires_at=null,updated_at=clock_timestamp() where id=p_event_id;
      return jsonb_build_object('ok',false);
    end if;
    update public.marketplace_favorite_message_events set offer_state='sending',offer_price_cents=p_offer_price_cents,updated_at=clock_timestamp() where id=p_event_id;
  else raise exception 'Favoritenphase ungültig' using errcode='22023'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.marketplace_cloud_favorite_claim (
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_target_id    uuid   default null::uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_event public.marketplace_favorite_message_events; v_settings public.marketplace_favorite_message_settings; v_permission public.marketplace_cloud_message_permissions; v_session public.marketplace_browser_sessions; v_publication public.marketplace_account_entries; v_phase text; v_message_text text; v_offer_config jsonb; v_error_code text; v_message_offer_base_price_cents bigint; v_next jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  update public.marketplace_favorite_message_events set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed'));
  update public.marketplace_favorite_message_events set offer_state='outcome_unknown',offer_error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and offer_state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed'));
  -- Erst ein bestätigter physischer Stopp gibt einen nicht begonnenen Versuch wieder frei.
  update public.marketplace_favorite_message_events set state=case when state='claimed' then 'queued' else state end,offer_state=case when offer_state='claimed' then 'pending' else offer_state end,claim_token=null,lease_expires_at=null,cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null,cloud_phase=null
    where execution_mode='cloud' and (state='claimed' or offer_state='claimed') and exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed');
  update public.marketplace_favorite_message_events event set state=case when state in ('queued','claimed') then 'cancelled' else state end,offer_state=case when offer_state in ('pending','claimed') then 'skipped' else offer_state end,error_code=case when state in ('queued','claimed') then 'authorization_expired' else error_code end,offer_error_code=case when offer_state in ('pending','claimed') then 'configuration_changed' else offer_error_code end
    where event.execution_mode='cloud' and not public.marketplace_cloud_favorite_settings_valid(event.workspace_id,event.connection_id);
  if p_target_id is null then
    v_next:=public.marketplace_browser_next_work();
    if v_next is null or v_next->>'kind' not in ('favorite_message','favorite_offer') then return null; end if;
    p_target_id:=(v_next->>'jobId')::uuid;
  end if;
  if not public.marketplace_browser_job_eligible('favorite_message',p_target_id::text) and not public.marketplace_browser_job_eligible('favorite_offer',p_target_id::text) then return null; end if;
  select event.* into v_event from public.marketplace_favorite_message_events event
    join public.marketplace_favorite_message_settings settings using(workspace_id,connection_id)
    join public.marketplace_sync_schedules schedule using(workspace_id,connection_id)
    where event.id=p_target_id and public.marketplace_browser_slot_status(event.workspace_id,event.connection_id) is null
      and event.execution_mode='cloud' and settings.execution_mode='cloud' and settings.enabled
      and event.setting_version=settings.version and event.external_account_id=settings.external_account_id and event.cloud_authorization_version=settings.cloud_authorization_version
      and schedule.enabled and schedule.paused_reason is null and (schedule.retry_after is null or schedule.retry_after<=clock_timestamp())
      and public.marketplace_cloud_write_available(event.workspace_id,event.connection_id)
      and public.marketplace_cloud_favorite_settings_valid(event.workspace_id,event.connection_id)
      and ((event.state='sent' and event.offer_state='pending') or (event.state='queued' and event.event_at+make_interval(mins=>(settings.config->>'delayMinutes')::integer)<=clock_timestamp()))
    order by case when event.offer_state='pending' then 0 else 1 end,event.event_at,event.id limit 1 for update of event skip locked;
  if not found then return null; end if;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=v_event.workspace_id and connection_id=v_event.connection_id for update;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=v_event.workspace_id and connection_id=v_event.connection_id for update;
  v_phase:=case when v_event.state='sent' then 'offer' else 'message' end;
  if v_phase='message' then
    select * into v_publication from public.marketplace_account_entries where workspace_id=v_event.workspace_id and connection_id=v_event.connection_id and kind='publication' and external_id=v_event.item_id;
    if not found or v_publication.body->'isClosed' is distinct from 'false'::jsonb or v_publication.body->'isReserved'='true'::jsonb
      or exists(select 1 from public.marketplace_account_entries where workspace_id=v_event.workspace_id and connection_id=v_event.connection_id and kind='conversation' and body->>'partnerId'=v_event.actor_id) then
      update public.marketplace_favorite_message_events set state='skipped',error_code='existing_conversation_or_inactive_item',updated_at=clock_timestamp() where id=v_event.id;
      return null;
    end if;
    select message_text, offer_config, error_code, message_offer_base_price_cents into v_message_text, v_offer_config, v_error_code, v_message_offer_base_price_cents
      from public.marketplace_prepare_favorite_message(v_event, v_settings.config, v_publication.body, clock_timestamp());
    if v_error_code is not null then
      update public.marketplace_favorite_message_events set state=case when v_error_code='invalid_template' then 'failed' else 'skipped' end,error_code=v_error_code,
        message_text=null,offer_config=null,message_offer_base_price_cents=null,updated_at=clock_timestamp() where id=v_event.id;
      return null;
    end if;
  end if;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_event.workspace_id,v_event.connection_id,v_settings.approved_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_favorite_message_events set state=case when v_phase='message' then 'claimed' else state end,offer_state=case when v_phase='offer' then 'claimed' else offer_state end,
    message_text=case when v_phase='message' then v_message_text else message_text end,offer_config=case when v_phase='message' then v_offer_config else offer_config end,
    message_offer_base_price_cents=case when v_phase='message' then v_message_offer_base_price_cents else message_offer_base_price_cents end,
    claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id,cloud_phase=v_phase,updated_at=clock_timestamp()
    where id=v_event.id returning * into v_event;
  return jsonb_build_object('eventId',v_event.id,'claimToken',v_event.claim_token,'workspaceId',v_event.workspace_id,'connectionId',v_event.connection_id,'userId',v_settings.approved_by,
    'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_settings.cloud_authorization_version,'settingsVersion',v_settings.version,'externalAccountId',v_event.external_account_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'phase',v_phase,
    'command',jsonb_build_object('recipientId',v_event.actor_id,'itemId',v_event.item_id,'text',v_event.message_text,'offer',v_event.offer_config,'conversationId',v_event.external_conversation_id,'transactionId',v_event.external_transaction_id,'externalMessageId',v_event.external_message_id));
end;
$function$;

create or replace function public.marketplace_cloud_favorite_finish (
  p_workspace_id    uuid,
  p_connection_id   uuid,
  p_event_id        uuid,
  p_claim_token     uuid,
  p_worker_id       uuid,
  p_worker_epoch    bigint,
  p_phase           text,
  p_outcome         text,
  p_external_id     text   default null::text,
  p_error_code      text   default null::text,
  p_conversation_id text   default null::text,
  p_transaction_id  text   default null::text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_event public.marketplace_favorite_message_events; v_state text; v_saved_id text; v_offer_state text:='not_requested'; v_offer_error text;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_event from public.marketplace_favorite_message_events where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and execution_mode='cloud'
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch and cloud_phase=p_phase for update;
  if not found then raise exception 'Favoritenclaim ungültig' using errcode='42501'; end if;
  if p_outcome is null or p_outcome not in ('sent','failed','outcome_unknown','skipped') or (p_outcome='sent' and (p_external_id is null or p_external_id !~ '^[1-9][0-9]{0,31}$'))
    or (p_outcome<>'sent' and p_external_id is not null) or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Favoritenergebnis ungültig' using errcode='22023'; end if;
  if p_phase='message' and p_outcome='sent' and (p_conversation_id is null or p_conversation_id !~ '^[1-9][0-9]{0,31}$' or (p_transaction_id is not null and p_transaction_id !~ '^[1-9][0-9]{0,31}$')) then raise exception 'Nachrichtenbeleg ungültig' using errcode='22023'; end if;
  v_state:=case when p_phase='message' then v_event.state else v_event.offer_state end;
  v_saved_id:=case when p_phase='message' then v_event.external_message_id else v_event.external_offer_id end;
  if v_state in ('sent','failed','skipped','outcome_unknown','cancelled') then
    if v_state=p_outcome and v_saved_id is not distinct from p_external_id and (p_phase='offer' or p_outcome<>'sent' or (v_event.external_conversation_id is not distinct from p_conversation_id and v_event.external_transaction_id is not distinct from p_transaction_id)) then return jsonb_build_object('ok',true); end if;
    if v_state in ('cancelled','skipped') and p_outcome in ('failed','skipped') then return jsonb_build_object('ok',true); end if;
    if p_phase='offer' and v_state='skipped' and v_event.offer_error_code='price_changed' and p_outcome='outcome_unknown' and p_error_code='begin_unconfirmed' then return jsonb_build_object('ok',true); end if;
    if not(v_state='outcome_unknown' and p_outcome='sent') then raise exception 'Ergebnis bereits erfasst' using errcode='23505'; end if;
  elsif v_state<>'sending' and not(v_state='claimed' and p_outcome in ('failed','skipped','outcome_unknown')) then raise exception 'Versuch nicht gestartet' using errcode='42501'; end if;
  if p_phase='message' then
    if p_outcome='sent' and v_event.offer_config is not null then
      if not public.marketplace_cloud_favorite_settings_valid(p_workspace_id,p_connection_id) or not exists(select 1 from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id and version=v_event.setting_version) then v_offer_state:='skipped'; v_offer_error:='configuration_changed';
      elsif p_transaction_id is null then v_offer_state:='skipped'; v_offer_error:='missing_transaction';
      else v_offer_state:='pending'; end if;
    end if;
    update public.marketplace_favorite_message_events set state=p_outcome,external_message_id=p_external_id,external_conversation_id=p_conversation_id,external_transaction_id=p_transaction_id,error_code=p_error_code,offer_state=v_offer_state,offer_error_code=v_offer_error,lease_expires_at=null,updated_at=clock_timestamp() where id=p_event_id;
  else
    if v_event.state<>'sent' then raise exception 'Nachricht nicht bestätigt' using errcode='42501'; end if;
    update public.marketplace_favorite_message_events set offer_state=p_outcome,external_offer_id=p_external_id,offer_error_code=p_error_code,lease_expires_at=null,updated_at=clock_timestamp() where id=p_event_id;
  end if;
  if p_outcome<>'sent' then
    perform public.marketplace_record_cloud_write_failure(p_workspace_id,p_connection_id,
      (select started_by from public.marketplace_browser_sessions where public_id=v_event.cloud_browser_session_id),
      v_event.cloud_authorization_version,v_event.external_account_id,v_event.cloud_browser_session_id,p_error_code);
  end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.marketplace_cloud_listing_claim (
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_target_id    text   default null::text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_job public.marketplace_listing_jobs; v_permission public.marketplace_listing_permissions; v_session public.marketplace_browser_sessions; v_next jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt.' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  perform public.marketplace_expire_cloud_listing_attempts();
  update public.marketplace_listing_jobs job set state='cancelled',error_code='authorization_revoked',lease_expires_at=null
    where execution_mode='cloud' and state in ('queued','paused','claimed') and not (job.state='paused' and job.error_code='editing') and not public.marketplace_listing_job_valid(job);
  update public.marketplace_listing_jobs job set state='paused',error_code='schedule_late'
    where execution_mode='cloud' and state='queued' and public.marketplace_listing_job_timing(coalesce(job.relist_publish_at,job.scheduled_at),job.late_policy,clock_timestamp())='paused';
  if p_target_id is null then
    v_next:=public.marketplace_browser_next_work();
    if v_next is null or v_next->>'kind'<>'listing' then return null; end if;
    p_target_id:=v_next->>'jobId';
  end if;
  if not public.marketplace_browser_job_eligible('listing',p_target_id) then return null; end if;
  select * into v_job from public.marketplace_listing_jobs job where execution_mode='cloud' and state='queued' and public.marketplace_listing_job_valid(job)
    and job.id=p_target_id::bigint and public.marketplace_browser_slot_status(job.workspace_id,job.connection_id) is null
    and ((job.snapshot ? 'relistExternalId' and job.relist_publish_at is null) or public.marketplace_listing_job_timing(coalesce(job.relist_publish_at,job.scheduled_at),job.late_policy,clock_timestamp())='due')
    order by scheduled_at nulls first,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_permission from public.marketplace_listing_permissions where id=v_job.permission_id for update;
  perform public.marketplace_bind_relisting_entry(v_job);
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_job.workspace_id,v_job.connection_id,v_job.requested_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_listing_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,absolute_expires_at=v_session.absolute_expires_at,
    cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id::text,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'userId',v_job.requested_by,
    'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_job.authorization_version,'externalAccountId',v_job.external_account_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'action',v_job.action,'snapshot',(v_job.snapshot-'favoriteDiscountPercent') || case when v_job.snapshot ? 'relistExternalId' then jsonb_build_object('relistStage',case when v_job.relist_publish_at is null then 'delete' else 'publish' end) else '{}'::jsonb end);
end;
$function$;

create or replace function public.marketplace_enqueue_listing_internal (
  p_draft_id             text,
  p_expected_revision    bigint,
  p_action               text,
  p_request_id           uuid,
  p_ai_photo             boolean,
  p_scheduled_at         timestamp with time zone default null::timestamp with time zone,
  p_time_zone            text                     default null::text,
  p_late_policy          text                     default 'pause_after_30_minutes'::text,
  p_replaces_job_id      bigint                   default null::bigint,
  p_replaces_version     bigint                   default null::bigint,
  p_relist_delay_seconds integer                  default 0
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_draft public.marketplace_listing_drafts; v_permission public.marketplace_listing_permissions; v_job public.marketplace_listing_jobs; v_previous public.marketplace_listing_jobs; v_images jsonb; v_hash text; v_request jsonb; v_relist_entry_id uuid;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint and deleted_at is null;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  if p_expected_revision is null or p_expected_revision not between 1 and 9007199254740991 or p_request_id is null or p_action is null or p_action not in ('publish','vinted_draft') or p_ai_photo is null
    or p_late_policy is null or p_late_policy not in ('pause_after_30_minutes','publish_when_available')
    or (p_scheduled_at is null and p_time_zone is not null) or (p_scheduled_at is not null and (not isfinite(p_scheduled_at) or p_time_zone is null
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone))) then raise exception 'Ungültiger Inseratauftrag.' using errcode='22023'; end if;
  if p_relist_delay_seconds is null or p_relist_delay_seconds not in (0,60,120,180,300,600) or (p_relist_delay_seconds>0 and (v_draft.relist_external_id is null or p_scheduled_at is not null)) then raise exception 'Ungültige Relist-Verzögerung.' using errcode='22023'; end if;
  if (p_replaces_job_id is null)<>(p_replaces_version is null) or (p_replaces_job_id is not null and (p_replaces_job_id<=0 or p_replaces_version not between 1 and 9007199254740991 )) then
    raise exception 'Ungültiger Planungsersatz.' using errcode='22023';
  end if;
  -- Normale Auftragskennungen behalten ihren bisherigen Hash auch nach dieser Erweiterung.
  v_request:=jsonb_build_array(p_draft_id,p_expected_revision,p_action,p_ai_photo,
    to_char(p_scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),p_time_zone,p_late_policy);
  if p_replaces_job_id is not null then v_request:=v_request||jsonb_build_array(p_replaces_job_id::text,p_replaces_version); end if;
  if p_relist_delay_seconds>0 then v_request:=v_request||jsonb_build_array(p_relist_delay_seconds); end if;
  v_hash:=encode(extensions.digest(convert_to(v_request::text,'utf8'),'sha256'),'hex');
  select * into v_job from public.marketplace_listing_jobs where workspace_id=v_draft.workspace_id and requested_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if v_job.request_hash<>v_hash then raise exception 'Diese Auftragskennung wurde bereits verwendet.' using errcode='23505'; end if;
    return public.marketplace_listing_job_document(v_job);
  end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=v_draft.workspace_id and connection_id=v_draft.connection_id for share;
  if not public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())) then raise exception 'Inserataktionen sind für dieses Konto nicht freigegeben.' using errcode='42501'; end if;
  if p_scheduled_at is not null and p_scheduled_at<=clock_timestamp() then raise exception 'Der Veröffentlichungstermin muss in der Zukunft liegen.' using errcode='22023'; end if;
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  if v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.connection_id is distinct from v_permission.connection_id then raise exception 'Das Zielkonto wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.relist_external_id is not null and (p_action<>'publish' or v_permission.execution_mode<>'cloud'
    or (v_draft.relist_deleted_at is not null and v_draft.relist_deleted_account_id<>v_permission.external_account_id)
    or (v_draft.relist_deleted_at is null and not exists(select 1 from public.marketplace_account_entries e where e.workspace_id=v_draft.workspace_id and e.connection_id=v_draft.connection_id
      and e.kind='publication' and e.external_id=v_draft.relist_external_id and e.body->>'publicationState'='active'))) then
    raise exception 'Die Relist-Quelle ist nicht mehr verfügbar.' using errcode='22023';
  end if;
  if v_draft.relist_external_id is not null then
    select id into v_relist_entry_id from public.marketplace_account_entries where workspace_id=v_draft.workspace_id and connection_id=v_draft.connection_id
      and kind='publication' and external_id=v_draft.relist_external_id for update;
    -- Alte gelöschte Quellen ohne erhaltene Cachezeile bleiben wiederaufnehmbar; ihre frühere UUID wird nicht erfunden.
    if v_relist_entry_id is null and v_draft.relist_deleted_at is null then raise exception 'Die Relist-Quelle ist nicht mehr verfügbar.' using errcode='22023'; end if;
  end if;
  if p_replaces_job_id is not null then
    select * into v_previous from public.marketplace_listing_jobs where id=p_replaces_job_id and workspace_id=v_draft.workspace_id and draft_id=v_draft.id for update;
    if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
    if v_previous.version<>p_replaces_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
    if v_previous.state not in ('queued','paused') or (v_previous.scheduled_at is null and v_previous.relist_publish_at is null
      and not (v_previous.state='paused' and v_previous.error_code='editing' and v_previous.editing_previous_state in ('failed','cancelled'))) then raise exception 'Dieser Auftrag kann nicht mehr ersetzt werden.' using errcode='22023'; end if;
    if not public.marketplace_listing_permission_valid(v_previous.permission_id,v_previous.requested_by,v_previous.authorization_version)
      or v_previous.connection_id is distinct from v_draft.connection_id or v_previous.execution_mode<>v_permission.execution_mode or v_previous.external_account_id<>v_permission.external_account_id then
      raise exception 'Die bisherige Planung gehört nicht zur aktuellen Kontofreigabe.' using errcode='42501';
    end if;
    -- Bei jedem späteren Fehler wird auch dieser Abbruch vollständig zurückgerollt.
    update public.marketplace_listing_jobs set state='cancelled',error_code='planning_replaced' where id=v_previous.id;
  end if;
  if exists(select 1 from public.marketplace_listing_jobs where draft_id=v_draft.id and state in ('queued','paused','claimed','writing','outcome_unknown','confirmed')) then raise exception 'Für diesen Entwurf gibt es bereits einen offenen oder bestätigten Auftrag.' using errcode='23505'; end if;
  if v_draft.inventory_item_id is not null then
    perform 1 from public.inventory_items where id=v_draft.inventory_item_id and workspace_id=v_draft.workspace_id and archived_at is null and status in ('ready','listed') for share;
    if not found or not exists(select 1 from public.inventory_item_sale_states where inventory_item_id=v_draft.inventory_item_id and workspace_id=v_draft.workspace_id and sale_state='no_active_sale') then raise exception 'Dieser Artikel kann momentan nicht angeboten werden.' using errcode='22023'; end if;
  end if;
  if not public.marketplace_listing_photo_options_valid(v_draft.photo_options,v_draft.image_ids)
    or not public.marketplace_listing_photo_masks_accessible(v_draft.workspace_id,v_draft.photo_options) then
    raise exception 'Die Bildbearbeitung passt nicht mehr zur Fotoauswahl.' using errcode='22023';
  end if;
  if not public.marketplace_listing_content_valid(v_draft.content) or coalesce(length(btrim(v_draft.content->>'title')),0)=0 or coalesce(length(btrim(v_draft.content->>'description')),0)=0
    or coalesce(v_draft.content->>'currency','')<>'EUR' or coalesce((v_draft.content->>'priceCents')::bigint,0)<=0 or coalesce((v_draft.content->>'categoryId')::bigint,0)<=0
    or coalesce((v_draft.content->>'conditionId')::bigint,0)<=0 or coalesce((v_draft.content->>'packageSizeId')::bigint,0)<=0 or cardinality(v_draft.image_ids) not between 1 and 20 then raise exception 'Bitte Angaben und Fotos vor der Anbieteraktion vervollständigen.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('id',image.id::text,'storagePath',image.storage_path,'fileName',image.file_name,'mimeType',image.mime_type,'byteSize',image.byte_size) order by chosen.position) into v_images
    from unnest(v_draft.image_ids) with ordinality chosen(id,position) join public.marketplace_listing_images image on image.id=chosen.id and image.workspace_id=v_draft.workspace_id and image.draft_id=v_draft.id and image.state='ready'
    where exists(select 1 from storage.objects object where object.bucket_id='marketplace-listing-media' and object.name=image.storage_path and object.metadata->>'size'=image.byte_size::text and object.metadata->>'mimetype'=image.mime_type);
  if coalesce(jsonb_array_length(v_images),0)<>cardinality(v_draft.image_ids) then raise exception 'Die Originalfotos sind noch nicht vollständig gespeichert.' using errcode='22023'; end if;
  insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,permission_id,requested_by,request_id,request_hash,draft_revision,authorization_version,
    external_account_id,execution_mode,action,snapshot,scheduled_at,time_zone,late_policy,replaces_job_id,relist_delay_seconds,relist_publish_at,relist_entry_id)
    values(v_draft.workspace_id,v_draft.connection_id,v_draft.id,v_permission.id,(select auth.uid()),p_request_id,v_hash,v_draft.revision,v_permission.authorization_version,
      v_permission.external_account_id,v_permission.execution_mode,p_action,jsonb_build_object('content',v_draft.content-array['aiPhoto','favoriteDiscountPercent'],'images',v_images,'aiPhoto',p_ai_photo,'bump',false,
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id,'photoOptions',v_draft.photo_options)
      || case when v_draft.relist_external_id is null then '{}'::jsonb else jsonb_build_object('relistExternalId',v_draft.relist_external_id) end
      || case when v_draft.content ? 'favoriteDiscountPercent' then jsonb_build_object('favoriteDiscountPercent',v_draft.content->'favoriteDiscountPercent')
        when v_draft.relist_external_id is not null then coalesce((
          select jsonb_build_object('favoriteDiscountPercent',d.discount_percent)
          from public.marketplace_listing_favorite_discounts d
          where d.workspace_id=v_draft.workspace_id and d.connection_id=v_draft.connection_id
            and d.external_account_id=v_permission.external_account_id and d.item_id=v_draft.relist_external_id
        ),'{}'::jsonb)
        else '{}'::jsonb end,
      p_scheduled_at,p_time_zone,p_late_policy,p_replaces_job_id,p_relist_delay_seconds,case when v_draft.relist_deleted_at is not null then coalesce(p_scheduled_at,clock_timestamp()+make_interval(secs=>p_relist_delay_seconds)) else null end,v_relist_entry_id) returning * into v_job;
  if v_draft.relist_external_id is not null then perform public.marketplace_remember_listing_photo_source(v_job,v_draft.relist_external_id); end if;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

create function public.marketplace_favorite_offer_price (
  p_offer                jsonb,
  p_original_price_cents bigint
)
  returns bigint
  language plpgsql
  immutable
  set search_path to ''
  AS $function$
declare
  v_expected_price numeric;
begin
  if p_original_price_cents is null or p_original_price_cents not between 1 and 100000000
    or jsonb_typeof(p_offer->'value') is distinct from 'number' then return null; end if;
  v_expected_price := case p_offer->>'type'
    when 'amount' then p_original_price_cents - (p_offer->>'value')::numeric * 100
    when 'percentage' then round(p_original_price_cents * (100 - (p_offer->>'value')::numeric) / 100)
  end;
  -- Eigene konservative Grenze: Der Angebotspreis muss mindestens die Hälfte des aktuellen Preises betragen.
  if v_expected_price is null or v_expected_price <> trunc(v_expected_price)
    or v_expected_price >= p_original_price_cents or v_expected_price < ceil(p_original_price_cents::numeric / 2) then return null; end if;
  return v_expected_price::bigint;
end;
$function$;

revoke all on function public.marketplace_favorite_offer_price(jsonb, bigint) from public;

grant all on function public.marketplace_favorite_offer_price(jsonb, bigint) to service_role;

create or replace function public.marketplace_listing_content_valid (
  p_content jsonb
)
  returns boolean
  language plpgsql
  immutable
  set search_path to ''
  AS $function$
declare
  v_key text;
  v_value jsonb;
  v_entry jsonb;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 200000 then return false; end if;
  for v_key, v_value in select key, value from jsonb_each(p_content) loop
    if v_key in ('title', 'description', 'categoryLabel', 'brandLabel', 'sizeLabel', 'conditionLabel') then
      if jsonb_typeof(v_value) <> 'string' or length(v_value #>> '{}') > 20000 or regexp_replace(v_value #>> '{}', E'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]' then return false; end if;
    elsif v_key = 'aiPhoto' then
      if jsonb_typeof(v_value) <> 'boolean' then return false; end if;
    elsif v_key = 'favoriteDiscountPercent' then
      if v_value <> 'null'::jsonb then
        if jsonb_typeof(v_value) <> 'number' then return false; end if;
        if (v_value::text)::numeric not between 1 and 50
          or round((v_value::text)::numeric,2) <> (v_value::text)::numeric then return false; end if;
      end if;
    elsif v_key = 'currency' then
      if v_value <> '"EUR"'::jsonb then return false; end if;
    elsif v_key in ('priceCents', 'categoryId', 'brandId', 'sizeId', 'conditionId', 'packageSizeId') then
      if v_value <> 'null'::jsonb then
        if jsonb_typeof(v_value) <> 'number' then return false; end if;
        if (v_value::text)::numeric <> trunc((v_value::text)::numeric) or (v_value::text)::numeric > 9007199254740991
          or (v_value::text)::numeric < (case when v_key = 'priceCents' then 0 else 1 end) then return false; end if;
      end if;
    elsif v_key in ('colorIds', 'materialIds', 'colorLabels', 'materialLabels') then
      if jsonb_typeof(v_value) <> 'array' or jsonb_array_length(v_value) > 100 then return false; end if;
      for v_entry in select value from jsonb_array_elements(v_value) loop
        if v_key in ('colorIds', 'materialIds') then
          if jsonb_typeof(v_entry) <> 'number' then return false; end if;
          if (v_entry::text)::numeric <> trunc((v_entry::text)::numeric) or (v_entry::text)::numeric not between 1 and 9007199254740991 then return false; end if;
        elsif jsonb_typeof(v_entry) <> 'string' or length(v_entry #>> '{}') > 20000 or regexp_replace(v_entry #>> '{}', E'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]' then return false;
        end if;
      end loop;
      if v_key in ('colorIds', 'materialIds') and (select count(distinct value) from jsonb_array_elements(v_value)) <> jsonb_array_length(v_value) then return false; end if;
    elsif v_key = 'attributes' then
      if jsonb_typeof(v_value) <> 'object' then return false; end if;
      if (select count(*) from jsonb_each(v_value)) > 100 or exists (
        select 1 from jsonb_each(v_value) where key !~ '^[a-zA-Z][a-zA-Z0-9_]{0,99}$'
          or key in ('constructor', 'prototype', '__proto__') or jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 20000 or regexp_replace(value #>> '{}', E'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]'
      ) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$function$;

create or replace function public.marketplace_listing_job_draft_document (
  p_job public.marketplace_listing_jobs
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  AS $function$
  select jsonb_build_object('id',p_job.draft_id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id,'revision',p_job.draft_revision,
    'relistExternalId',p_job.snapshot->>'relistExternalId','inventoryItemId',p_job.snapshot->'inventoryItemId',
    'content',(p_job.snapshot->'content')||jsonb_build_object('aiPhoto',p_job.snapshot->'aiPhoto')
      || case when p_job.snapshot ? 'favoriteDiscountPercent' then jsonb_build_object('favoriteDiscountPercent',p_job.snapshot->'favoriteDiscountPercent') else '{}'::jsonb end,
    'images',p_job.snapshot->'images','photoOptions',p_job.snapshot->'photoOptions','createdAt',p_job.created_at,'updatedAt',p_job.created_at);
$function$;

create or replace function public.marketplace_local_favorite_claim (
  p_workspace_id    uuid,
  p_connection_id   uuid,
  p_token_hash      text,
  p_offer_supported boolean
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_grant public.marketplace_local_extension_grants; v_settings public.marketplace_favorite_message_settings; v_event public.marketplace_favorite_message_events; v_publication public.marketplace_account_entries; v_message record;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  -- Betreiber-Not-Aus: keine neuen Aufträge, solange Vinted abgeschaltet ist.
  if not public.platform_feature_enabled('vinted') then return jsonb_build_object('ok',true,'command',null); end if;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if v_settings.execution_mode is distinct from 'local' or not coalesce(v_settings.enabled,false) or v_settings.grant_generation<>v_grant.grant_generation or v_settings.external_account_id<>v_grant.external_account_id then return jsonb_build_object('ok',true,'command',null); end if;
  update public.marketplace_favorite_message_events set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp() where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_favorite_message_events set state='queued',claim_token=null,lease_expires_at=null where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='claimed' and lease_expires_at<=clock_timestamp();
  update public.marketplace_favorite_message_events set offer_state='outcome_unknown',offer_error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='sent' and offer_state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_favorite_message_events set offer_state='pending',claim_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='sent' and offer_state='claimed' and lease_expires_at<=clock_timestamp();
  if coalesce(p_offer_supported,false) then
    select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id
      and state='sent' and offer_state='pending' and setting_version=v_settings.version order by event_at,id limit 1 for update skip locked;
    if found then
      -- Der bestätigte Text wird bei Wiederaufnahme nie erneut verschickt; sein eigenes Gespräch ist kein Ausschlussgrund.
      update public.marketplace_favorite_message_events set offer_state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_event.id returning * into v_event;
      return jsonb_build_object('ok',true,'command',jsonb_build_object('id',v_event.id,'claimToken',v_event.claim_token,'actorId',v_event.actor_id,'itemId',v_event.item_id,'text',v_event.message_text,
        'offer',v_event.offer_config,'stage','offer','conversationId',v_event.external_conversation_id,'transactionId',v_event.external_transaction_id,'externalMessageId',v_event.external_message_id));
    end if;
  end if;
  select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='queued' and setting_version=v_settings.version
    and (coalesce(p_offer_supported,false) or v_settings.config->'offer' is null or v_settings.config->'offer'='null'::jsonb)
    and event_at+make_interval(mins=>(v_settings.config->>'delayMinutes')::integer)<=clock_timestamp() order by event_at,id limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok',true,'command',null); end if;
  select * into v_publication from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='publication' and external_id=v_event.item_id;
  if not found or v_publication.body->'isClosed' is distinct from 'false'::jsonb or v_publication.body->'isReserved'='true'::jsonb
    or exists(select 1 from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and body->>'partnerId'=v_event.actor_id) then
    update public.marketplace_favorite_message_events set state='skipped',error_code='existing_conversation_or_inactive_item',updated_at=clock_timestamp() where id=v_event.id;
    return jsonb_build_object('ok',true,'command',null);
  end if;
  select * into v_message from public.marketplace_prepare_favorite_message(v_event, v_settings.config, v_publication.body, clock_timestamp());
  if v_message.error_code is not null then
    update public.marketplace_favorite_message_events set state=case when v_message.error_code='invalid_template' then 'failed' else 'skipped' end,error_code=v_message.error_code,
      message_text=null,offer_config=null,message_offer_base_price_cents=null,updated_at=clock_timestamp() where id=v_event.id;
    return jsonb_build_object('ok',true,'command',null);
  end if;
  update public.marketplace_favorite_message_events set state='claimed',message_text=v_message.message_text,offer_config=v_message.offer_config,
    message_offer_base_price_cents=v_message.message_offer_base_price_cents,claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_event.id returning * into v_event;
  return jsonb_build_object('ok',true,'command',jsonb_build_object('id',v_event.id,'claimToken',v_event.claim_token,'actorId',v_event.actor_id,'itemId',v_event.item_id,'text',v_event.message_text,'offer',v_event.offer_config,'stage','message'));
end;
$function$;

create or replace function public.marketplace_local_favorite_offer_start (
  p_workspace_id         uuid,
  p_connection_id        uuid,
  p_token_hash           text,
  p_event_id             uuid,
  p_claim_token          uuid,
  p_original_price_cents bigint,
  p_offer_price_cents    bigint
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_grant public.marketplace_local_extension_grants; v_event public.marketplace_favorite_message_events; v_settings public.marketplace_favorite_message_settings; v_expected_price numeric;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and claim_token=p_claim_token for update;
  if not found or v_event.state<>'sent' or v_event.external_message_id is null or v_event.external_conversation_id is null or v_event.external_transaction_id is null
    or v_event.offer_state not in ('pending','claimed') or v_event.offer_config is null or v_event.lease_expires_at is null or v_event.lease_expires_at<=clock_timestamp()
    or not coalesce(v_settings.enabled,false) or v_event.setting_version<>v_settings.version or v_settings.grant_generation<>v_grant.grant_generation
    or v_settings.external_account_id<>v_grant.external_account_id then raise exception 'Angebotsfreigabe ungültig' using errcode='42501'; end if;
  perform public.marketplace_validate_favorite_offer_price(v_event.offer_config,p_original_price_cents,p_offer_price_cents);
  if v_event.message_offer_base_price_cents is not null and p_original_price_cents<>v_event.message_offer_base_price_cents then
    update public.marketplace_favorite_message_events set offer_state='skipped',offer_error_code='price_changed',lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id;
    return jsonb_build_object('ok',false);
  end if;
  update public.marketplace_favorite_message_events set offer_state='sending',offer_price_cents=p_offer_price_cents,lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.marketplace_local_listing_claim (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_grant public.marketplace_local_extension_grants; v_job public.marketplace_listing_jobs;
begin
  v_grant:=public.marketplace_local_listing_authorized(p_workspace_id,p_connection_id,p_token_hash);
  -- Betreiber-Not-Aus: keine neuen Aufträge, solange Vinted abgeschaltet ist.
  if not public.platform_feature_enabled('vinted') then return null; end if;
  perform public.marketplace_expire_local_listing_attempts(p_workspace_id,p_connection_id);
  update public.marketplace_listing_jobs job set state='cancelled',error_code='authorization_revoked'
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state in ('queued','paused','claimed') and not public.marketplace_listing_job_valid(job);
  update public.marketplace_listing_jobs job set state='paused',error_code='schedule_late'
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued' and public.marketplace_listing_job_timing(job.scheduled_at,job.late_policy,clock_timestamp())='paused';
  if exists(select 1 from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('claimed','writing') and lease_expires_at>clock_timestamp()) then return null; end if;
  select * into v_job from public.marketplace_listing_jobs job where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued'
    and requested_by=v_grant.approved_by and public.marketplace_listing_job_valid(job) and public.marketplace_listing_job_timing(job.scheduled_at,job.late_policy,clock_timestamp())='due'
    order by scheduled_at nulls first,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.marketplace_listing_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),
    absolute_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '10 minutes'),claim_local_token_hash=p_token_hash,claim_local_grant_generation=v_grant.grant_generation where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id::text,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'externalAccountId',v_job.external_account_id,
    'action',v_job.action,'snapshot',v_job.snapshot-'favoriteDiscountPercent','expiresAt',v_job.lease_expires_at,'absoluteExpiresAt',v_job.absolute_expires_at);
end;
$function$;

create function public.marketplace_prepare_favorite_message (
  p_event       public.marketplace_favorite_message_events,
  p_config      jsonb,
  p_publication jsonb,
  p_at          timestamp with time zone
)
  returns table (
    message_text                   text,
    offer_config                   jsonb,
    error_code                     text,
    message_offer_base_price_cents bigint
  )
  language plpgsql
  stable
  set search_path to ''
  AS $function$
declare
  v_default_offer jsonb := nullif(p_config->'offer', 'null'::jsonb);
  v_discount jsonb;
  v_discount_percent numeric;
  v_price numeric;
  v_price_cents bigint;
  v_offer_price_cents bigint;
begin
  select discount_percent into v_discount_percent from public.marketplace_listing_favorite_discounts
    where workspace_id = p_event.workspace_id and connection_id = p_event.connection_id
      and external_account_id = p_event.external_account_id and item_id = p_event.item_id;
  v_discount := case when v_discount_percent is null then v_default_offer else jsonb_build_object('type', 'percentage', 'value', v_discount_percent) end;
  -- Der Inseratsrabatt ändert den Betrag. Nur die Kontoeinstellung gibt das separate Angebot frei.
  offer_config := case when v_default_offer is not null then v_discount end;
  if jsonb_typeof(p_publication->'price') = 'number' then v_price := (p_publication->>'price')::numeric; end if;
  message_text := public.marketplace_favorite_message_text(p_config, v_price, p_at, p_event.id);
  if strpos(message_text, '{discountPercent}') > 0 then
    if v_price between 0.01 and 1000000 and v_price = round(v_price, 2)
      and (v_discount->>'type' <> 'amount' or coalesce(p_publication->>'currency', 'EUR') = 'EUR') then
      v_price_cents := (v_price * 100)::bigint;
      v_offer_price_cents := public.marketplace_favorite_offer_price(v_discount, v_price_cents);
    end if;
    if v_offer_price_cents is not null then
      v_discount_percent := case v_discount->>'type'
        when 'percentage' then (v_discount->>'value')::numeric
        when 'amount' then round((v_price_cents - v_offer_price_cents) * 100::numeric / v_price_cents, 2)
      end;
    end if;
    if v_offer_price_cents is null or v_discount_percent <= 0 then
      message_text := null;
      offer_config := null;
      error_code := 'discount_unavailable';
      return next;
      return;
    end if;
    message_text := replace(message_text, '{discountPercent}', replace(trim_scale(v_discount_percent)::text, '.', ',') || ' %');
    -- Bei einem Euro-Rabatt bleibt der versprochene Prozentsatz nur beim gleichen Artikelpreis gültig.
    if offer_config->>'type' = 'amount' then message_offer_base_price_cents := v_price_cents; end if;
  end if;
  message_text := replace(message_text, '{article}', p_event.title);
  if char_length(message_text) > 2000 then error_code := 'invalid_template'; end if;
  return next;
end;
$function$;

revoke all on function
  public.marketplace_prepare_favorite_message(public.marketplace_favorite_message_events, jsonb, jsonb, timestamp
  with time zone) from public;

grant all on function
  public.marketplace_prepare_favorite_message(public.marketplace_favorite_message_events, jsonb, jsonb, timestamp
  with time zone) to service_role;

create function public.marketplace_read_listing_favorite_discount (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_item_id       text default null::text
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  AS $function$
declare
  v_external_account_id text;
  v_settings public.marketplace_favorite_message_settings;
  v_discount_percent numeric;
begin
  if not public.marketplace_can_manage(p_workspace_id) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  if p_item_id is not null and p_item_id !~ '^[1-9][0-9]{0,31}$' then
    raise exception 'Ungültige Vinted-Artikelnummer' using errcode = '22023';
  end if;
  select external_account_id into v_external_account_id from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted';
  if not found then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  select * into v_settings from public.marketplace_favorite_message_settings
    where workspace_id = p_workspace_id and connection_id = p_connection_id and external_account_id = v_external_account_id;
  select discount_percent into v_discount_percent from public.marketplace_listing_favorite_discounts
    where workspace_id = p_workspace_id and connection_id = p_connection_id and external_account_id = v_external_account_id and item_id = p_item_id;
  return jsonb_build_object('enabled', coalesce(v_settings.enabled, false), 'defaultOffer', v_settings.config->'offer', 'discountPercent', v_discount_percent);
end;
$function$;

revoke all on function public.marketplace_read_listing_favorite_discount(uuid, uuid, text) from public;

grant all on function public.marketplace_read_listing_favorite_discount(uuid, uuid, text) to authenticated;

grant all on function public.marketplace_read_listing_favorite_discount(uuid, uuid, text) to service_role;

create function public.marketplace_remember_listing_favorite_discount()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  if tg_op='UPDATE' and old.state='confirmed' then return new; end if;
  if not exists (
    select 1 from public.marketplace_connections c
    where c.workspace_id=new.workspace_id and c.id=new.connection_id
      and c.marketplace='vinted' and c.external_account_id=new.external_account_id
  ) then return new; end if;

  insert into public.marketplace_listing_favorite_discounts(workspace_id,connection_id,external_account_id,item_id,discount_percent)
  values(new.workspace_id,new.connection_id,new.external_account_id,new.external_id,(new.snapshot->>'favoriteDiscountPercent')::numeric)
  on conflict(workspace_id,connection_id,external_account_id,item_id) do nothing;
  return new;
end;
$function$;

revoke all on function public.marketplace_remember_listing_favorite_discount() from public;

grant all on function public.marketplace_remember_listing_favorite_discount() to service_role;

create function public.marketplace_save_listing_favorite_discount (
  p_workspace_id     uuid,
  p_connection_id    uuid,
  p_item_id          text,
  p_discount_percent numeric default null::numeric
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_external_account_id text;
begin
  perform pg_advisory_xact_lock(91731, 1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_workspace_authorization_valid(p_workspace_id, (select auth.uid())) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  if p_item_id is null or p_item_id !~ '^[1-9][0-9]{0,31}$'
    or (p_discount_percent is not null and (p_discount_percent not between 1 and 50 or p_discount_percent <> round(p_discount_percent, 2))) then
    raise exception 'Ungültiger Favoritenrabatt' using errcode = '22023';
  end if;
  select external_account_id into v_external_account_id from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for share;
  if not found then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  if not exists(select 1 from public.marketplace_favorite_message_settings
    where workspace_id = p_workspace_id and connection_id = p_connection_id and external_account_id = v_external_account_id and enabled) then
    raise exception 'Favoritennachrichten sind deaktiviert' using errcode = '42501';
  end if;
  if not exists(select 1 from public.marketplace_account_entries
    where workspace_id = p_workspace_id and connection_id = p_connection_id and kind = 'publication' and external_id = p_item_id) then
    raise exception 'Vinted-Inserat nicht gefunden' using errcode = '42501';
  end if;
  if p_discount_percent is null then
    delete from public.marketplace_listing_favorite_discounts
      where workspace_id = p_workspace_id and connection_id = p_connection_id and external_account_id = v_external_account_id and item_id = p_item_id;
  else
    insert into public.marketplace_listing_favorite_discounts(workspace_id, connection_id, external_account_id, item_id, discount_percent)
      values (p_workspace_id, p_connection_id, v_external_account_id, p_item_id, p_discount_percent)
      on conflict (workspace_id, connection_id, external_account_id, item_id) do update set discount_percent = excluded.discount_percent;
  end if;
end;
$function$;

revoke all on function public.marketplace_save_listing_favorite_discount(uuid, uuid, text, numeric) from public;

grant all on function public.marketplace_save_listing_favorite_discount(uuid, uuid, text, numeric) to authenticated;

grant all on function public.marketplace_save_listing_favorite_discount(uuid, uuid, text, numeric) to service_role;

create or replace function public.marketplace_validate_favorite_offer_price (
  p_offer                jsonb,
  p_original_price_cents bigint,
  p_offer_price_cents    bigint
)
  returns void
  language plpgsql
  immutable
  set search_path to ''
  AS $function$
declare v_expected_price bigint;
begin
  v_expected_price := public.marketplace_favorite_offer_price(p_offer, p_original_price_cents);
  if v_expected_price is null or p_offer_price_cents is distinct from v_expected_price then
    raise exception 'Ungültiger Angebotspreis' using errcode='22023';
  end if;
end;
$function$;

alter table public.marketplace_favorite_message_events
  add column message_offer_base_price_cents bigint;

alter table public.marketplace_favorite_message_events
  add constraint marketplace_favorite_message_message_offer_base_price_cen_check
    check (message_offer_base_price_cents >= 1 AND message_offer_base_price_cents <= 100000000);

create table public.marketplace_listing_favorite_discounts (
  id                  bigint  generated always as identity not null,
  workspace_id        uuid    not null,
  connection_id       uuid    not null,
  external_account_id text    not null,
  item_id             text    not null,
  discount_percent    numeric not null
);

comment on table public.marketplace_listing_favorite_discounts is 'Individueller Rabatt für Favoritennachrichten zu einem Vinted-Inserat.';

alter table public.marketplace_listing_favorite_discounts
  enable row level security;

alter table public.marketplace_listing_favorite_discounts
  add
    constraint marketplace_listing_favorite__workspace_id_connection_id_ex_key unique
    (workspace_id, connection_id, external_account_id, item_id);

alter table public.marketplace_listing_favorite_discounts
  add constraint marketplace_listing_favorite_di_workspace_id_connection_id_fkey
    foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id)
    on delete cascade;

alter table public.marketplace_listing_favorite_discounts
  add constraint marketplace_listing_favorite_discount_external_account_id_check
    check (external_account_id ~ '^[1-9][0-9]{0,31}$'::text);

alter table public.marketplace_listing_favorite_discounts
  add constraint marketplace_listing_favorite_discounts_discount_percent_check
    check
    (discount_percent >= 1::numeric AND discount_percent <= 50::numeric AND discount_percent = round(discount_percent,
    2));

alter table public.marketplace_listing_favorite_discounts
  add constraint marketplace_listing_favorite_discounts_item_id_check check (item_id ~ '^[1-9][0-9]{0,31}$'::text);

alter table public.marketplace_listing_favorite_discounts
  add constraint marketplace_listing_favorite_discounts_pkey primary key (id);

grant all on public.marketplace_listing_favorite_discounts to service_role;

create policy "Worker deletes listing favorite discounts" on public.marketplace_listing_favorite_discounts
  for delete
  to service_role
  using (true);

create policy "Worker inserts listing favorite discounts" on public.marketplace_listing_favorite_discounts
  for insert
  to service_role
  with check (true);

create policy "Worker reads listing favorite discounts" on public.marketplace_listing_favorite_discounts
  for select
  to service_role
  using (true);

create policy "Worker updates listing favorite discounts" on public.marketplace_listing_favorite_discounts
  for update
  to service_role
  using (true)
  with check (true);

create trigger marketplace_remember_listing_favorite_discount
  after insert or update of state on public.marketplace_listing_jobs
  for each row
  when (new.state = 'confirmed'::text AND new.action = 'publish'::text AND new.external_id IS
    NOT NULL AND jsonb_typeof(new.snapshot -> 'favoriteDiscountPercent'::text) = 'number'::text)
  execute function public.marketplace_remember_listing_favorite_discount();
-- Der Differenzgenerator gibt Standardrechte neuer Objekte und Identity-Sequenzen nicht vollständig aus.
revoke all on public.marketplace_listing_favorite_discounts from public, anon, authenticated;
revoke all on sequence public.marketplace_listing_favorite_discounts_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.marketplace_listing_favorite_discounts_id_seq to service_role;
revoke all on function public.marketplace_read_listing_favorite_discount(uuid, uuid, text) from anon;
revoke all on function public.marketplace_save_listing_favorite_discount(uuid, uuid, text, numeric) from anon;
revoke all on function public.marketplace_favorite_offer_price(jsonb, bigint) from anon, authenticated;
revoke all on function public.marketplace_prepare_favorite_message(public.marketplace_favorite_message_events, jsonb, jsonb, timestamptz) from anon, authenticated;
revoke all on function public.marketplace_remember_listing_favorite_discount() from anon, authenticated;
