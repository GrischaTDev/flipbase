-- Zwei Relist-Phasen mit bestätigter Löschung, Wartezeit und bearbeitbaren Planungen.
-- Betrifft marketplace_listing_drafts und marketplace_listing_jobs.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION
  public.marketplace_enqueue_listing_internal(p_draft_id text, p_expected_revision bigint, p_action text, p_request_id uuid, p_ai_photo boolean, p_scheduled_at timestamp
  WITH time zone, p_time_zone text, p_late_policy text, p_replaces_job_id bigint, p_replaces_version bigint);

CREATE OR REPLACE FUNCTION public.marketplace_approve_listings (
  p_workspace_id                 uuid,
  p_connection_id                uuid,
  p_expected_external_account_id text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_connection public.marketplace_connections; v_profile public.marketplace_browser_profiles; v_generation bigint; v_permission public.marketplace_listing_permissions;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if not public.marketplace_local_extension_user_valid((select auth.uid())) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.status<>'connected' or p_expected_external_account_id is null or v_connection.external_account_id is distinct from p_expected_external_account_id then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
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

CREATE OR REPLACE FUNCTION public.marketplace_cancel_listing_job (
  p_job_id           text,
  p_expected_version bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_job.workspace_id);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint for update;
  if p_expected_version is null or v_job.version<>p_expected_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_job.state not in ('queued','paused') then raise exception 'Dieser Auftrag kann nicht mehr sicher abgebrochen werden.' using errcode='22023'; end if;
  update public.marketplace_listing_jobs set state='cancelled',version=version+1,updated_at=clock_timestamp() where id=v_job.id returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_listing_begin (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_job_id        text,
  p_claim_token   uuid,
  p_worker_id     uuid,
  p_worker_epoch  bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if public.marketplace_cloud_listing_check(p_workspace_id,p_connection_id,p_job_id,p_claim_token,p_worker_id,p_worker_epoch)->>'active'<>'true' then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  update public.marketplace_listing_jobs set state='writing',started_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id::bigint and claim_token=p_claim_token and state='claimed' and started_at is null;
  if not found then raise exception 'Inseratversuch wurde bereits begonnen oder beendet.' using errcode='42501'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_listing_check (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_job_id        text,
  p_claim_token   uuid,
  p_worker_id     uuid,
  p_worker_epoch  bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_job public.marketplace_listing_jobs; v_session public.marketplace_browser_sessions; v_inactive jsonb:='{"active":false,"sessionId":null,"expiresAt":null,"absoluteExpiresAt":null}';
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_job from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id::bigint and execution_mode='cloud'
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch and state in ('claimed','writing')
    and lease_expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp() for update;
  if not found or not public.marketplace_listing_job_valid(v_job) then return v_inactive; end if;
  if v_job.state='claimed' and not (v_job.snapshot ? 'relistExternalId' and v_job.relist_publish_at is null) and public.marketplace_listing_job_timing(coalesce(v_job.relist_publish_at,v_job.scheduled_at),v_job.late_policy,clock_timestamp())<>'due' then
    update public.marketplace_listing_jobs set state='paused',error_code='schedule_late',lease_expires_at=null where id=v_job.id;
    return v_inactive;
  end if;
  select * into v_session from public.marketplace_browser_sessions where public_id=v_job.cloud_browser_session_id and workspace_id=p_workspace_id and connection_id=p_connection_id
    and started_by=v_job.requested_by and worker_id=p_worker_id and worker_epoch=p_worker_epoch and state='active' and expires_at>clock_timestamp()
    and absolute_expires_at=v_job.absolute_expires_at and absolute_expires_at>clock_timestamp()
    and provider_profile_id=(select provider_profile_id from public.marketplace_listing_permissions where id=v_job.permission_id) for update;
  if not found then return v_inactive; end if;
  update public.marketplace_browser_sessions set heartbeat_at=clock_timestamp(),expires_at=least(clock_timestamp()+interval '90 seconds',absolute_expires_at) where id=v_session.id returning * into v_session;
  update public.marketplace_listing_jobs set lease_expires_at=v_session.expires_at where id=v_job.id;
  return jsonb_build_object('active',true,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_listing_claim (
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_job public.marketplace_listing_jobs; v_permission public.marketplace_listing_permissions; v_session public.marketplace_browser_sessions;
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
  if exists(select 1 from public.marketplace_browser_sessions where state in ('active','stopping')) then return null; end if;
  select * into v_job from public.marketplace_listing_jobs job where execution_mode='cloud' and state='queued' and public.marketplace_listing_job_valid(job)
    and ((job.snapshot ? 'relistExternalId' and job.relist_publish_at is null) or public.marketplace_listing_job_timing(coalesce(job.relist_publish_at,job.scheduled_at),job.late_policy,clock_timestamp())='due')
    order by scheduled_at nulls first,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_permission from public.marketplace_listing_permissions where id=v_job.permission_id for update;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_job.workspace_id,v_job.connection_id,v_job.requested_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_listing_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,absolute_expires_at=v_session.absolute_expires_at,
    cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id::text,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'userId',v_job.requested_by,
    'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_job.authorization_version,'externalAccountId',v_job.external_account_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'action',v_job.action,'snapshot',v_job.snapshot || case when v_job.snapshot ? 'relistExternalId' then jsonb_build_object('relistStage',case when v_job.relist_publish_at is null then 'delete' else 'publish' end) else '{}'::jsonb end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_listing_finish (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_job_id        text,
  p_claim_token   uuid,
  p_worker_id     uuid,
  p_worker_epoch  bigint,
  p_result        jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  -- Späte Belege benötigen die ursprüngliche Kennung; neue Schreibaktionen bleiben gesperrt.
  select * into v_job from public.marketplace_listing_jobs where workspace_id=p_workspace_id and id=p_job_id::bigint and execution_mode='cloud'
    and (connection_id=p_connection_id or (connection_id is null and snapshot->>'connectionId'=p_connection_id::text))
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch for update;
  if not found then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  if p_result->>'outcome'='relisting_deleted' then
    if v_job.provider_result=p_result then return public.marketplace_listing_job_document(v_job); end if;
    if (select count(*) from jsonb_object_keys(p_result))<>4 or p_result->>'externalId' is distinct from v_job.snapshot->>'relistExternalId'
      or p_result->>'externalAccountId' is distinct from v_job.external_account_id or p_result->>'verifiedAt' is null
      or (p_result->>'verifiedAt')::timestamptz > clock_timestamp()+interval '1 minute' or (p_result->>'verifiedAt')::timestamptz < v_job.started_at-interval '1 minute'
      or v_job.started_at is null or v_job.state not in ('writing','outcome_unknown') or v_job.relist_publish_at is not null then
      raise exception 'Ungültiger Löschbeleg.' using errcode='22023';
    end if;
    update public.marketplace_account_entries set body=jsonb_set(body,'{publicationState}',to_jsonb('ended'::text)) where workspace_id=v_job.workspace_id and connection_id=v_job.connection_id and kind='publication' and external_id=v_job.snapshot->>'relistExternalId';
    update public.marketplace_listing_drafts set relist_deleted_at=(p_result->>'verifiedAt')::timestamptz,relist_deleted_account_id=v_job.external_account_id where id=v_job.draft_id;
    update public.marketplace_listing_jobs set state='queued',error_code=null,started_at=null,lease_expires_at=null,
      relist_publish_at=coalesce(scheduled_at,clock_timestamp()+make_interval(secs=>relist_delay_seconds)),provider_result=p_result
      where id=v_job.id returning * into v_job;
    return public.marketplace_listing_job_document(v_job);
  end if;
  return public.marketplace_listing_finish_job(v_job,p_result);
end;
$function$;

CREATE FUNCTION public.marketplace_edit_relisting_plan (
  p_job_id           text,
  p_expected_version bigint,
  p_editing          boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_job.workspace_id);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint for update;
  if v_job.version is distinct from p_expected_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
  if p_editing is null or not (v_job.snapshot ? 'relistExternalId') or v_job.state not in ('queued','paused','failed') or v_job.relist_publish_at is null then raise exception 'Die Veröffentlichung hat bereits begonnen.' using errcode='22023'; end if;
  if not p_editing and (v_job.error_code is distinct from 'editing' or not public.marketplace_listing_job_valid(v_job)) then raise exception 'Die ursprüngliche Planung kann nicht fortgesetzt werden.' using errcode='22023'; end if;
  update public.marketplace_listing_jobs set state=case when p_editing then 'paused' else 'queued' end,error_code=case when p_editing then 'editing' else null end where id=v_job.id returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_edit_relisting_plan(text, bigint, boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_edit_relisting_plan(text, bigint, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_edit_relisting_plan(text, bigint, boolean) TO service_role;

CREATE FUNCTION public.marketplace_enqueue_listing_internal (
  p_draft_id             text,
  p_expected_revision    bigint,
  p_action               text,
  p_request_id           uuid,
  p_ai_photo             boolean,
  p_scheduled_at         timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_time_zone            text                     DEFAULT NULL::text,
  p_late_policy          text                     DEFAULT 'pause_after_30_minutes'::text,
  p_replaces_job_id      bigint                   DEFAULT NULL::bigint,
  p_replaces_version     bigint                   DEFAULT NULL::bigint,
  p_relist_delay_seconds integer                  DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_draft public.marketplace_listing_drafts; v_permission public.marketplace_listing_permissions; v_job public.marketplace_listing_jobs; v_previous public.marketplace_listing_jobs; v_images jsonb; v_hash text; v_request jsonb;
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
  if p_replaces_job_id is not null then
    select * into v_previous from public.marketplace_listing_jobs where id=p_replaces_job_id and workspace_id=v_draft.workspace_id and draft_id=v_draft.id for update;
    if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
    if v_previous.version<>p_replaces_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
    if v_previous.state not in ('queued','paused') or (v_previous.scheduled_at is null and v_previous.relist_publish_at is null) then raise exception 'Dieser Auftrag kann nicht mehr ersetzt werden.' using errcode='22023'; end if;
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
  if not public.marketplace_listing_content_valid(v_draft.content) or coalesce(length(btrim(v_draft.content->>'title')),0)=0 or coalesce(length(btrim(v_draft.content->>'description')),0)=0
    or coalesce(v_draft.content->>'currency','')<>'EUR' or coalesce((v_draft.content->>'priceCents')::bigint,0)<=0 or coalesce((v_draft.content->>'categoryId')::bigint,0)<=0
    or coalesce((v_draft.content->>'conditionId')::bigint,0)<=0 or coalesce((v_draft.content->>'packageSizeId')::bigint,0)<=0 or cardinality(v_draft.image_ids) not between 1 and 20 then raise exception 'Bitte Angaben und Fotos vor der Anbieteraktion vervollständigen.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('id',image.id::text,'storagePath',image.storage_path,'fileName',image.file_name,'mimeType',image.mime_type,'byteSize',image.byte_size) order by chosen.position) into v_images
    from unnest(v_draft.image_ids) with ordinality chosen(id,position) join public.marketplace_listing_images image on image.id=chosen.id and image.workspace_id=v_draft.workspace_id and image.draft_id=v_draft.id and image.state='ready'
    where exists(select 1 from storage.objects object where object.bucket_id='marketplace-listing-media' and object.name=image.storage_path and object.metadata->>'size'=image.byte_size::text and object.metadata->>'mimetype'=image.mime_type);
  if coalesce(jsonb_array_length(v_images),0)<>cardinality(v_draft.image_ids) then raise exception 'Die Originalfotos sind noch nicht vollständig gespeichert.' using errcode='22023'; end if;
  insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,permission_id,requested_by,request_id,request_hash,draft_revision,authorization_version,
    external_account_id,execution_mode,action,snapshot,scheduled_at,time_zone,late_policy,replaces_job_id,relist_delay_seconds,relist_publish_at)
    values(v_draft.workspace_id,v_draft.connection_id,v_draft.id,v_permission.id,(select auth.uid()),p_request_id,v_hash,v_draft.revision,v_permission.authorization_version,
      v_permission.external_account_id,v_permission.execution_mode,p_action,jsonb_build_object('content',v_draft.content-'aiPhoto','images',v_images,'aiPhoto',p_ai_photo,'bump',false,
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id)
      || case when v_draft.relist_external_id is null then '{}'::jsonb else jsonb_build_object('relistExternalId',v_draft.relist_external_id) end,
      p_scheduled_at,p_time_zone,p_late_policy,p_replaces_job_id,p_relist_delay_seconds,case when v_draft.relist_deleted_at is not null then coalesce(p_scheduled_at,clock_timestamp()+make_interval(secs=>p_relist_delay_seconds)) else null end) returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_enqueue_listing_internal(text, bigint, text, uuid, boolean, timestamp WITH time zone, text, text, bigint, bigint, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_enqueue_listing_internal(text, bigint, text, uuid, boolean, timestamp WITH time zone, text, text, bigint, bigint, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_enqueue_listing (
  p_draft_id          text,
  p_expected_revision bigint,
  p_action            text,
  p_request_id        uuid,
  p_ai_photo          boolean,
  p_scheduled_at      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_time_zone         text                     DEFAULT NULL::text,
  p_late_policy       text                     DEFAULT 'pause_after_30_minutes'::text
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select public.marketplace_enqueue_listing_internal(p_draft_id,p_expected_revision,p_action,p_request_id,p_ai_photo,p_scheduled_at,p_time_zone,p_late_policy);
$function$;

CREATE FUNCTION public.marketplace_enqueue_relisting (
  p_draft_id          text,
  p_expected_revision bigint,
  p_request_id        uuid,
  p_ai_photo          boolean,
  p_scheduled_at      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_time_zone         text                     DEFAULT NULL::text,
  p_delay_seconds     integer                  DEFAULT 0,
  p_replaces_job_id   text                     DEFAULT NULL::text,
  p_replaces_version  bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not exists(select 1 from public.marketplace_listing_drafts where id=p_draft_id::bigint and relist_external_id is not null) then raise exception 'Keine Relist-Planung.' using errcode='22023'; end if;
  return public.marketplace_enqueue_listing_internal(p_draft_id,p_expected_revision,'publish',p_request_id,p_ai_photo,p_scheduled_at,p_time_zone,'pause_after_30_minutes',p_replaces_job_id::bigint,p_replaces_version,p_delay_seconds);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_enqueue_relisting(text, bigint, uuid, boolean, timestamp WITH time zone, text, integer, text, bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_enqueue_relisting(text, bigint, uuid, boolean, timestamp WITH time zone, text, integer, text, bigint) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_enqueue_relisting(text, bigint, uuid, boolean, timestamp WITH time zone, text, integer, text, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_expire_cloud_listing_attempts (
  p_workspace_id uuid DEFAULT NULL::uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_listing_jobs job set state='outcome_unknown',error_code='timeout',lease_expires_at=null
    where (p_workspace_id is null or workspace_id=p_workspace_id) and execution_mode='cloud' and state in ('claimed','writing') and started_at is not null
      and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=job.cloud_browser_session_id and state='closed'));
  -- Eine abgelaufene Lease allein beweist keinen physischen Browserstopp.
  update public.marketplace_listing_jobs job set state='queued',claim_token=null,lease_expires_at=null,absolute_expires_at=null,
    cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null
    where (p_workspace_id is null or workspace_id=p_workspace_id) and execution_mode='cloud' and state='claimed' and started_at is null
      and exists(select 1 from public.marketplace_browser_sessions where public_id=job.cloud_browser_session_id and state='closed');
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_listing_job_document (
  p_job public.marketplace_listing_jobs
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object('id',p_job.id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id,'draftId',p_job.draft_id::text,
    'draftRevision',p_job.draft_revision,'executionMode',p_job.execution_mode,'externalAccountId',p_job.external_account_id,'action',p_job.action,
    'state',p_job.state,'version',p_job.version,'scheduledAt',coalesce(p_job.relist_publish_at,p_job.scheduled_at),'timeZone',case when coalesce(p_job.relist_publish_at,p_job.scheduled_at) is not null then coalesce(p_job.time_zone,'Europe/Berlin') else null end,'latePolicy',p_job.late_policy,
    'errorCode',p_job.error_code,'externalId',p_job.external_id,'providerState',p_job.provider_state,'verifiedAt',p_job.verified_at,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at,'replacesJobId',p_job.replaces_job_id::text,
    'relistDeletedAt',(select relist_deleted_at from public.marketplace_listing_drafts where id=p_job.draft_id),'relistDelaySeconds',p_job.relist_delay_seconds,'relistExternalId',p_job.snapshot->>'relistExternalId','itemTitle',p_job.snapshot->'content'->>'title');
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_listing_job_timing (
  p_scheduled_at timestamp with time zone,
  p_late_policy  text,
  p_now          timestamp with time zone
)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
begin
  if p_now is null or not isfinite(p_now) or p_late_policy is null or p_late_policy not in ('pause_after_30_minutes','publish_when_available')
    or (p_scheduled_at is not null and not isfinite(p_scheduled_at)) then raise exception 'Ungültiger Veröffentlichungstermin.' using errcode='22023'; end if;
  if p_scheduled_at is null then return 'due'; end if;
  if p_scheduled_at>p_now then return 'not_due'; end if;
  if p_late_policy='pause_after_30_minutes' and p_now>p_scheduled_at+interval '30 minutes' then return 'paused'; end if;
  return 'due';
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_listing_permission_valid (
  p_permission_id bigint,
  p_user_id       uuid,
  p_version       bigint DEFAULT NULL::bigint
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_permission public.marketplace_listing_permissions; v_connection public.marketplace_connections;
begin
  select * into v_permission from public.marketplace_listing_permissions where id=p_permission_id and approved_by=p_user_id and revoked_at is null;
  if not found or (p_version is not null and v_permission.authorization_version<>p_version)
    or not public.marketplace_local_extension_user_valid(p_user_id)
    or not public.marketplace_sync_authorization_valid(v_permission.workspace_id,p_user_id) then return false; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=v_permission.workspace_id and id=v_permission.connection_id
    and marketplace='vinted' and status='connected' and execution_mode=v_permission.execution_mode and external_account_id=v_permission.external_account_id;
  if not found then return false; end if;
  if v_permission.execution_mode='local' then
    return exists(select 1 from public.marketplace_local_extension_grants where workspace_id=v_permission.workspace_id and connection_id=v_permission.connection_id
      and approved_by=p_user_id and external_account_id=v_permission.external_account_id and grant_generation=v_permission.local_grant_generation
      and revoked_at is null and expires_at>clock_timestamp());
  end if;
  return exists(select 1 from public.marketplace_browser_profiles where id=v_permission.browser_profile_id and workspace_id=v_permission.workspace_id
    and connection_id=v_permission.connection_id and provider_profile_id=v_permission.provider_profile_id)
    and public.marketplace_cloud_network_valid(v_permission.workspace_id,v_permission.connection_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_protect_listing_job()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if row(new.id,new.workspace_id,new.draft_id,new.requested_by,new.request_id,new.request_hash,new.draft_revision,
      new.authorization_version,new.external_account_id,new.execution_mode,new.action,new.snapshot,new.relist_delay_seconds,new.scheduled_at,new.time_zone,new.late_policy,new.created_at,new.replaces_job_id)
    is distinct from row(old.id,old.workspace_id,old.draft_id,old.requested_by,old.request_id,old.request_hash,old.draft_revision,
      old.authorization_version,old.external_account_id,old.execution_mode,old.action,old.snapshot,old.relist_delay_seconds,old.scheduled_at,old.time_zone,old.late_policy,old.created_at,old.replaces_job_id)
    or (new.connection_id is distinct from old.connection_id and new.connection_id is not null)
    or (new.permission_id is distinct from old.permission_id and new.permission_id is not null) then
    raise exception 'Ein angenommener Inseratauftrag darf nicht verändert werden.' using errcode='22023';
  end if;
  new.version:=old.version+1;
  new.updated_at:=clock_timestamp();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_read_listing_jobs (
  p_workspace_id uuid,
  p_draft_id     text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_items jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  perform public.marketplace_expire_local_listing_attempts(p_workspace_id);
  perform public.marketplace_expire_cloud_listing_attempts(p_workspace_id);
  if p_draft_id is not null and (p_draft_id !~ '^[1-9][0-9]{0,18}$' or not exists(
    select 1 from public.marketplace_listing_drafts where workspace_id=p_workspace_id and id=p_draft_id::bigint)) then
    raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501';
  end if;
  update public.marketplace_listing_jobs job set
    state=case when job.state='writing' then 'outcome_unknown' else 'cancelled' end,
    error_code='authorization_revoked'
    where job.workspace_id=p_workspace_id and job.state in ('queued','paused','claimed','writing')
      and not public.marketplace_listing_permission_valid(job.permission_id,job.requested_by,job.authorization_version);
  update public.marketplace_listing_jobs job set state='paused',error_code='schedule_late'
    where job.workspace_id=p_workspace_id and job.state='queued'
      and public.marketplace_listing_job_timing(coalesce(job.relist_publish_at,job.scheduled_at),job.late_policy,clock_timestamp())='paused';
  select coalesce(jsonb_agg(public.marketplace_listing_job_document(job) order by job.created_at desc,job.id desc),'[]'::jsonb)
    into v_items from (select * from public.marketplace_listing_jobs where workspace_id=p_workspace_id
      and (p_draft_id is null or draft_id=p_draft_id::bigint) order by created_at desc,id desc limit 50) job;
  return jsonb_build_object('items',v_items);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_read_listing_permission (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_permission public.marketplace_listing_permissions; v_connection public.marketplace_connections;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted';
  if not found then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('allowed',public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())),
    'authorizationVersion',coalesce(v_permission.authorization_version,0),'executionMode',v_connection.execution_mode);
end;
$function$;

CREATE FUNCTION public.marketplace_read_relisting_plans (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_items jsonb;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  select coalesce(jsonb_agg(public.marketplace_listing_job_document(job) order by job.created_at desc),'[]'::jsonb) into v_items
    from public.marketplace_listing_jobs job where workspace_id=p_workspace_id and connection_id=p_connection_id and snapshot ? 'relistExternalId'
    and state in ('queued','paused','claimed','writing','outcome_unknown','failed')
    and exists(select 1 from public.marketplace_listing_drafts where id=job.draft_id and relist_deleted_at is not null);
  return jsonb_build_object('items',v_items);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_read_relisting_plans(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_read_relisting_plans(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_read_relisting_plans(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_replace_planned_listing (
  p_job_id            text,
  p_expected_version  bigint,
  p_expected_revision bigint,
  p_action            text,
  p_request_id        uuid,
  p_ai_photo          boolean,
  p_scheduled_at      timestamp with time zone,
  p_time_zone         text,
  p_late_policy       text                     DEFAULT 'pause_after_30_minutes'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  return public.marketplace_enqueue_listing_internal(v_job.draft_id::text,p_expected_revision,p_action,p_request_id,p_ai_photo,p_scheduled_at,p_time_zone,p_late_policy,v_job.id,p_expected_version);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_reschedule_listing (
  p_job_id            text,
  p_expected_version  bigint,
  p_expected_revision bigint,
  p_request_id        uuid,
  p_scheduled_at      timestamp with time zone,
  p_time_zone         text,
  p_late_policy       text                     DEFAULT 'pause_after_30_minutes'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_job.workspace_id);
  return public.marketplace_enqueue_listing_internal(v_job.draft_id::text,p_expected_revision,v_job.action,p_request_id,
    (v_job.snapshot->>'aiPhoto')::boolean,p_scheduled_at,p_time_zone,p_late_policy,v_job.id,p_expected_version);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_revoke_listings (
  p_workspace_id          uuid,
  p_connection_id         uuid,
  p_authorization_version bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  update public.marketplace_listing_permissions set revoked_at=clock_timestamp(),authorization_version=authorization_version+1,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and authorization_version=p_authorization_version;
  if not found then raise exception 'Die Freigabe wurde inzwischen geändert.' using errcode='40001'; end if;
  -- Begonnene Schreibversuche werden nicht als sicher abgebrochen ausgegeben.
  update public.marketplace_listing_jobs set state='cancelled',version=version+1,error_code='authorization_revoked',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','paused','claimed');
  update public.marketplace_listing_jobs set state='outcome_unknown',version=version+1,error_code='authorization_revoked',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and state='writing';
  return public.marketplace_read_listing_permission(p_workspace_id,p_connection_id);
end;
$function$;

ALTER TABLE public.marketplace_listing_drafts
  ADD COLUMN relist_deleted_at timestamp with time zone;

ALTER TABLE public.marketplace_listing_drafts
  ADD COLUMN relist_deleted_account_id text;

ALTER TABLE public.marketplace_listing_drafts
  ADD CONSTRAINT marketplace_listing_drafts_check CHECK ((relist_deleted_at IS NULL) = (relist_deleted_account_id IS NULL));

ALTER TABLE public.marketplace_listing_jobs
  ADD COLUMN relist_delay_seconds integer DEFAULT 0 NOT NULL;

ALTER TABLE public.marketplace_listing_jobs
  ADD CONSTRAINT marketplace_listing_jobs_relist_delay_seconds_check CHECK (relist_delay_seconds = ANY (ARRAY[0, 60, 120, 180, 300, 600]));

ALTER TABLE public.marketplace_listing_jobs
  ADD COLUMN relist_publish_at timestamp with time zone;