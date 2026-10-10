-- Zweck: geplante Inserataufträge atomar durch eine neue Inhaltsrevision ersetzen.
-- Betroffen: public.marketplace_listing_permissions und marketplace_listing_jobs sowie deren kontrollierte RPCs.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_enqueue_listing_internal (
  p_draft_id          text,
  p_expected_revision bigint,
  p_action            text,
  p_request_id        uuid,
  p_ai_photo          boolean,
  p_scheduled_at      timestamp with time zone default null::timestamp with time zone,
  p_time_zone         text                     default null::text,
  p_late_policy       text                     default 'pause_after_30_minutes'::text,
  p_replaces_job_id   bigint                   default null::bigint,
  p_replaces_version  bigint                   default null::bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts; v_permission public.marketplace_listing_permissions; v_job public.marketplace_listing_jobs; v_previous public.marketplace_listing_jobs; v_images jsonb; v_hash text; v_request jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  if p_expected_revision is null or p_expected_revision not between 1 and 9007199254740991 or p_request_id is null or p_action is null or p_action not in ('publish','vinted_draft') or p_ai_photo is null
    or p_late_policy is null or p_late_policy not in ('pause_after_30_minutes','publish_when_available')
    or (p_scheduled_at is null and p_time_zone is not null) or (p_scheduled_at is not null and (not isfinite(p_scheduled_at) or p_time_zone is null
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone))) then raise exception 'Ungültiger Inseratauftrag.' using errcode='22023'; end if;
  if (p_replaces_job_id is null)<>(p_replaces_version is null) or (p_replaces_job_id is not null and (p_replaces_job_id<=0 or p_replaces_version not between 1 and 9007199254740991 or p_scheduled_at is null)) then
    raise exception 'Ungültiger Planungsersatz.' using errcode='22023';
  end if;
  -- Normale Auftragskennungen behalten ihren bisherigen Hash auch nach dieser Erweiterung.
  v_request:=jsonb_build_array(p_draft_id,p_expected_revision,p_action,p_ai_photo,
    to_char(p_scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),p_time_zone,p_late_policy);
  if p_replaces_job_id is not null then v_request:=v_request||jsonb_build_array(p_replaces_job_id::text,p_replaces_version); end if;
  v_hash:=encode(extensions.digest(convert_to(v_request::text,'utf8'),'sha256'),'hex');
  select * into v_job from public.marketplace_listing_jobs where workspace_id=v_draft.workspace_id and requested_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if v_job.request_hash<>v_hash then raise exception 'Diese Auftragskennung wurde bereits verwendet.' using errcode='23505'; end if;
    return public.marketplace_listing_job_document(v_job);
  end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=v_draft.workspace_id and connection_id=v_draft.connection_id for share;
  if not public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())) then raise exception 'Inserataktionen sind für dieses Konto nicht freigegeben.' using errcode='42501'; end if;
  if p_scheduled_at is not null and p_scheduled_at<=clock_timestamp() then raise exception 'Der Veröffentlichungstermin muss in der Zukunft liegen.' using errcode='22023'; end if;
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint for share;
  if v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.connection_id is distinct from v_permission.connection_id then raise exception 'Das Zielkonto wurde inzwischen geändert.' using errcode='40001'; end if;
  if p_replaces_job_id is not null then
    select * into v_previous from public.marketplace_listing_jobs where id=p_replaces_job_id and workspace_id=v_draft.workspace_id and draft_id=v_draft.id for update;
    if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
    if v_previous.version<>p_replaces_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
    if v_previous.state not in ('queued','paused') or v_previous.scheduled_at is null then raise exception 'Dieser Auftrag kann nicht mehr ersetzt werden.' using errcode='22023'; end if;
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
    external_account_id,execution_mode,action,snapshot,scheduled_at,time_zone,late_policy,replaces_job_id)
    values(v_draft.workspace_id,v_draft.connection_id,v_draft.id,v_permission.id,(select auth.uid()),p_request_id,v_hash,v_draft.revision,v_permission.authorization_version,
      v_permission.external_account_id,v_permission.execution_mode,p_action,jsonb_build_object('content',v_draft.content,'images',v_images,'aiPhoto',p_ai_photo,'bump',false,
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id),p_scheduled_at,p_time_zone,p_late_policy,p_replaces_job_id) returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

revoke all on function public.marketplace_enqueue_listing_internal(text, bigint, text, uuid, boolean, timestamp with time zone, text, text, bigint, bigint) from public;

grant all on function public.marketplace_enqueue_listing_internal(text, bigint, text, uuid, boolean, timestamp with time zone, text, text, bigint, bigint) to service_role;

create or replace function public.marketplace_enqueue_listing (
  p_draft_id          text,
  p_expected_revision bigint,
  p_action            text,
  p_request_id        uuid,
  p_ai_photo          boolean,
  p_scheduled_at      timestamp with time zone default null::timestamp with time zone,
  p_time_zone         text                     default null::text,
  p_late_policy       text                     default 'pause_after_30_minutes'::text
)
  returns jsonb
  language sql
  security definer
  set search_path to ''
  as $function$
  select public.marketplace_enqueue_listing_internal(p_draft_id,p_expected_revision,p_action,p_request_id,p_ai_photo,p_scheduled_at,p_time_zone,p_late_policy);
$function$;

create or replace function public.marketplace_listing_job_document (
  p_job public.marketplace_listing_jobs
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
  select jsonb_build_object('id',p_job.id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id,'draftId',p_job.draft_id::text,
    'draftRevision',p_job.draft_revision,'executionMode',p_job.execution_mode,'externalAccountId',p_job.external_account_id,'action',p_job.action,
    'state',p_job.state,'version',p_job.version,'scheduledAt',p_job.scheduled_at,'timeZone',p_job.time_zone,'latePolicy',p_job.late_policy,
    'errorCode',p_job.error_code,'externalId',p_job.external_id,'providerState',p_job.provider_state,'verifiedAt',p_job.verified_at,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at,'replacesJobId',p_job.replaces_job_id::text);
$function$;

create or replace function public.marketplace_protect_listing_job()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if row(new.id,new.workspace_id,new.draft_id,new.requested_by,new.request_id,new.request_hash,new.draft_revision,
      new.authorization_version,new.external_account_id,new.execution_mode,new.action,new.snapshot,new.scheduled_at,new.time_zone,new.late_policy,new.created_at,new.replaces_job_id)
    is distinct from row(old.id,old.workspace_id,old.draft_id,old.requested_by,old.request_id,old.request_hash,old.draft_revision,
      old.authorization_version,old.external_account_id,old.execution_mode,old.action,old.snapshot,old.scheduled_at,old.time_zone,old.late_policy,old.created_at,old.replaces_job_id)
    or (new.connection_id is distinct from old.connection_id and new.connection_id is not null)
    or (new.permission_id is distinct from old.permission_id and new.permission_id is not null) then
    raise exception 'Ein angenommener Inseratauftrag darf nicht verändert werden.' using errcode='22023';
  end if;
  new.version:=old.version+1;
  new.updated_at:=clock_timestamp();
  return new;
end;
$function$;

create function public.marketplace_replace_planned_listing (
  p_job_id            text,
  p_expected_version  bigint,
  p_expected_revision bigint,
  p_action            text,
  p_request_id        uuid,
  p_ai_photo          boolean,
  p_scheduled_at      timestamp with time zone,
  p_time_zone         text,
  p_late_policy       text                     default 'pause_after_30_minutes'::text
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
  return public.marketplace_enqueue_listing_internal(v_job.draft_id::text,p_expected_revision,p_action,p_request_id,p_ai_photo,p_scheduled_at,p_time_zone,p_late_policy,v_job.id,p_expected_version);
end;
$function$;

revoke all on function public.marketplace_replace_planned_listing(text, bigint, bigint, text, uuid, boolean, timestamp with time zone, text, text) from public;

grant all on function public.marketplace_replace_planned_listing(text, bigint, bigint, text, uuid, boolean, timestamp with time zone, text, text) to authenticated;

grant all on function public.marketplace_replace_planned_listing(text, bigint, bigint, text, uuid, boolean, timestamp with time zone, text, text) to service_role;

alter table public.marketplace_listing_jobs
  add column replaces_job_id bigint;

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_replaces_job_id_fkey foreign key (replaces_job_id) references public.marketplace_listing_jobs(id);

create unique index marketplace_listing_jobs_replacement on public.marketplace_listing_jobs (replaces_job_id)
  where replaces_job_id is not null;

-- Explizite Inseratauftragsrechte aus dem deklarativen Schema.
revoke all on public.marketplace_listing_permissions from public,anon,authenticated;
grant select on public.marketplace_listing_permissions to authenticated;
grant all on public.marketplace_listing_permissions to service_role;
grant usage,select on sequence public.marketplace_listing_permissions_id_seq to service_role;
revoke all on public.marketplace_listing_jobs from public,anon,authenticated;
grant select on public.marketplace_listing_jobs to authenticated;
grant all on public.marketplace_listing_jobs to service_role;
grant usage,select on sequence public.marketplace_listing_jobs_id_seq to service_role;
revoke all on function public.marketplace_protect_listing_job() from public,anon,authenticated;
revoke all on function public.marketplace_listing_permission_valid(bigint,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_listing_permission_valid(bigint,uuid,bigint) to service_role;
revoke all on function public.marketplace_read_listing_permission(uuid,uuid),public.marketplace_approve_listings(uuid,uuid,text),public.marketplace_revoke_listings(uuid,uuid,bigint) from public,anon;
grant execute on function public.marketplace_read_listing_permission(uuid,uuid),public.marketplace_approve_listings(uuid,uuid,text),public.marketplace_revoke_listings(uuid,uuid,bigint) to authenticated;
revoke all on function public.marketplace_listing_job_timing(timestamptz,text,timestamptz) from public,anon;
grant execute on function public.marketplace_listing_job_timing(timestamptz,text,timestamptz) to authenticated,service_role;
revoke all on function public.marketplace_listing_job_document(public.marketplace_listing_jobs) from public,anon,authenticated;
revoke all on function public.marketplace_enqueue_listing_internal(text,bigint,text,uuid,boolean,timestamptz,text,text,bigint,bigint) from public,anon,authenticated;
revoke all on function public.marketplace_replace_planned_listing(text,bigint,bigint,text,uuid,boolean,timestamptz,text,text) from public,anon;
grant execute on function public.marketplace_replace_planned_listing(text,bigint,bigint,text,uuid,boolean,timestamptz,text,text) to authenticated;
revoke all on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) from public,anon;
grant execute on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) to authenticated;
revoke all on function public.marketplace_read_listing_jobs(uuid,text) from public,anon;
grant execute on function public.marketplace_read_listing_jobs(uuid,text) to authenticated;
