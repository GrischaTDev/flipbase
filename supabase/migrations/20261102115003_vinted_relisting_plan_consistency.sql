-- Relist-Bearbeitungszustand und angenommene Inhalte erhalten; bestätigte Veröffentlichung mit dem Import abgleichen.
-- Betroffen: marketplace_listing_jobs sowie der kontogebundene Leseauftrag in marketplace_operations.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create or replace function public.marketplace_edit_relisting_plan (
  p_job_id           text,
  p_expected_version bigint,
  p_editing          boolean
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_job.workspace_id);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint for update;
  if v_job.version is distinct from p_expected_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
  if p_editing is null or not (v_job.snapshot ? 'relistExternalId') or v_job.state not in ('queued','paused','failed') or v_job.relist_publish_at is null then raise exception 'Die Veröffentlichung hat bereits begonnen.' using errcode='22023'; end if;
  if not p_editing and (v_job.error_code is distinct from 'editing' or (v_job.editing_previous_state='queued' and not public.marketplace_listing_job_valid(v_job))) then raise exception 'Die ursprüngliche Planung kann nicht fortgesetzt werden.' using errcode='22023'; end if;
  if p_editing then
    if v_job.state='paused' and v_job.error_code='editing' then return public.marketplace_listing_job_document(v_job); end if;
    update public.marketplace_listing_jobs set editing_previous_state=state,editing_previous_error_code=error_code,state='paused',error_code='editing' where id=v_job.id returning * into v_job;
  else
    -- Ältere unterbrochene Bearbeitungen ohne gesicherten Zustand bleiben angehalten.
    update public.marketplace_listing_jobs set state=coalesce(editing_previous_state,'paused'),error_code=editing_previous_error_code,
      editing_previous_state=null,editing_previous_error_code=null where id=v_job.id returning * into v_job;
  end if;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

create or replace function public.marketplace_listing_finish_job (
  p_job    public.marketplace_listing_jobs,
  p_result jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_outcome text; v_external_id text; v_provider_state text; v_verified_at timestamptz; v_error text; v_job public.marketplace_listing_jobs;
begin
  if p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'Ungültiges Inseratergebnis.' using errcode='22023'; end if;
  v_outcome:=p_result->>'outcome';
  if v_outcome='confirmed' then
    if (select count(*) from jsonb_object_keys(p_result))<>6 or p_result->>'action' is distinct from p_job.action or p_result->>'externalAccountId' is distinct from p_job.external_account_id or jsonb_typeof(p_result->'externalAccountId') is distinct from 'string'
      or jsonb_typeof(p_result->'externalId') is distinct from 'string' or coalesce(p_result->>'externalId','') !~ '^[1-9][0-9]{0,31}$'
      or (p_job.action='vinted_draft' and p_result->>'providerState' is distinct from 'draft')
      or (p_job.action='publish' and coalesce(p_result->>'providerState','') not in ('active','processing'))
      or coalesce(p_result->>'verifiedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then raise exception 'Ungültige Anbieterbestätigung.' using errcode='22023'; end if;
    begin v_verified_at:=(p_result->>'verifiedAt')::timestamptz; exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Bestätigungszeit.' using errcode='22023'; end;
    if to_char(v_verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') is distinct from p_result->>'verifiedAt'
      or v_verified_at>clock_timestamp()+interval '5 minutes' or (p_job.started_at is not null and v_verified_at<p_job.started_at-interval '5 minutes') then raise exception 'Bestätigungszeit gehört nicht zum Versuch.' using errcode='22023'; end if;
    v_external_id:=p_result->>'externalId'; v_provider_state:=p_result->>'providerState';
  elsif v_outcome in ('failed','outcome_unknown') then
    if (select count(*) from jsonb_object_keys(p_result))<>2 or jsonb_typeof(p_result->'errorCode') is distinct from 'string' or coalesce(p_result->>'errorCode','') !~ '^[a-z_]{1,80}$' then raise exception 'Ungültiges Inseratergebnis.' using errcode='22023'; end if;
    v_error:=p_result->>'errorCode';
  else raise exception 'Ungültiges Inseratergebnis.' using errcode='22023'; end if;
  if p_job.provider_result=p_result then return public.marketplace_listing_job_document(p_job); end if;
  if p_job.state='cancelled' and v_outcome='failed' and p_job.started_at is null then return public.marketplace_listing_job_document(p_job); end if;
  if p_job.state in ('confirmed','failed','cancelled') then raise exception 'Inseratergebnis bereits erfasst.' using errcode='23505'; end if;
  if v_outcome='confirmed' and (p_job.started_at is null or p_job.state not in ('writing','outcome_unknown')) then raise exception 'Inseratversuch wurde nicht begonnen.' using errcode='42501'; end if;
  if v_outcome<>'confirmed' and p_job.state not in ('claimed','writing','outcome_unknown') then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  update public.marketplace_listing_jobs set state=v_outcome,external_id=v_external_id,provider_state=v_provider_state,verified_at=v_verified_at,error_code=v_error,
    provider_result=p_result,finished_at=clock_timestamp(),lease_expires_at=null where id=p_job.id returning * into v_job;
  if v_outcome='confirmed' and v_job.action='publish' then perform public.marketplace_remember_listing_photo_source(v_job,v_external_id); end if;
  if v_outcome='confirmed' then perform public.marketplace_request_relisting_import(v_job); end if;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

create function public.marketplace_listing_job_draft_document (
  p_job public.marketplace_listing_jobs
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
  select jsonb_build_object('id',p_job.draft_id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id,'revision',p_job.draft_revision,
    'relistExternalId',p_job.snapshot->>'relistExternalId','inventoryItemId',p_job.snapshot->'inventoryItemId',
    'content',(p_job.snapshot->'content')||jsonb_build_object('aiPhoto',p_job.snapshot->'aiPhoto'),
    'images',p_job.snapshot->'images','photoOptions',p_job.snapshot->'photoOptions','createdAt',p_job.created_at,'updatedAt',p_job.created_at);
$function$;

revoke all on function public.marketplace_listing_job_draft_document(public.marketplace_listing_jobs) from public;

grant all on function public.marketplace_listing_job_draft_document(public.marketplace_listing_jobs) to service_role;

create or replace function public.marketplace_read_relisting_plans (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_items jsonb; v_account text; v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  select external_account_id into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id;
  if not found then raise exception 'Kein Zugriff auf dieses Marktplatzkonto.' using errcode='42501'; end if;
  update public.marketplace_listing_jobs job set relist_imported_at=clock_timestamp()
    where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.external_account_id=v_account
      and job.state='confirmed' and job.snapshot ? 'relistExternalId' and job.relist_imported_at is null
      and exists(select 1 from public.marketplace_account_entries entry where entry.workspace_id=p_workspace_id and entry.connection_id=p_connection_id and entry.kind='publication' and entry.external_id=job.external_id)
      and not exists(select 1 from public.marketplace_account_entries entry where entry.workspace_id=p_workspace_id and entry.connection_id=p_connection_id and entry.kind='publication' and entry.external_id=job.snapshot->>'relistExternalId');
  for v_job in select * from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=v_account
      and state='confirmed' and snapshot ? 'relistExternalId' and relist_imported_at is null loop
    perform public.marketplace_request_relisting_import(v_job);
  end loop;
  select coalesce(jsonb_agg(public.marketplace_listing_job_document(job)||jsonb_build_object('job',public.marketplace_listing_job_document(job),'draft',public.marketplace_listing_job_draft_document(job)) order by job.created_at desc),'[]'::jsonb) into v_items
    from public.marketplace_listing_jobs job where workspace_id=p_workspace_id and connection_id=p_connection_id and snapshot ? 'relistExternalId'
    and external_account_id=v_account and (state in ('queued','paused','claimed','writing','outcome_unknown','failed') or (state='confirmed' and relist_imported_at is null))
    and exists(select 1 from public.marketplace_listing_drafts where id=job.draft_id and relist_deleted_at is not null);
  return jsonb_build_object('items',v_items);
end;
$function$;

create function public.marketplace_request_relisting_import (
  p_job public.marketplace_listing_jobs
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
begin
  if p_job.state<>'confirmed' or p_job.action<>'publish' or p_job.execution_mode<>'cloud' or not (p_job.snapshot ? 'relistExternalId')
    or p_job.relist_imported_at is not null or not public.marketplace_sync_authorization_valid(p_job.workspace_id,p_job.requested_by)
    or not exists(select 1 from public.marketplace_connections where id=p_job.connection_id and workspace_id=p_job.workspace_id
      and external_account_id=p_job.external_account_id and execution_mode='cloud' and status='connected') then return; end if;
  if exists(select 1 from public.marketplace_operations where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id
    and created_at>=p_job.finished_at and (state in ('queued','running') or finished_at>clock_timestamp()-interval '1 minute')) then return; end if;
  insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,created_at)
    values(p_job.workspace_id,p_job.connection_id,p_job.requested_by,'manual_read',1,clock_timestamp())
    on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
end;
$function$;

revoke all on function public.marketplace_request_relisting_import(public.marketplace_listing_jobs) from public;

grant all on function public.marketplace_request_relisting_import(public.marketplace_listing_jobs) to service_role;

alter table public.marketplace_listing_jobs
  add column editing_previous_state text;

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_editing_previous_state_check check (editing_previous_state = any (array['queued'::text, 'paused'::text, 'failed'::text]));

alter table public.marketplace_listing_jobs
  add column editing_previous_error_code text;

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_editing_previous_error_code_check check (editing_previous_error_code ~ '^[a-z_]{1,80}$'::text);

alter table public.marketplace_listing_jobs
  add column relist_imported_at timestamp with time zone;
-- Generierter Rechteabgleich für interne Auftragsfunktionen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

revoke all on function public.marketplace_listing_job_draft_document(public.marketplace_listing_jobs) from authenticated;

revoke all on function public.marketplace_request_relisting_import(public.marketplace_listing_jobs) from authenticated;