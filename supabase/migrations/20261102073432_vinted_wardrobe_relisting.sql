-- Relisten: bindet marketplace_listing_drafts.relist_external_id dauerhaft an das Quellkonto.
-- Erweitert Entwurfs-/Auftragsdokumente und verhindert parallele Relist-Aufträge für dasselbe Original.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.marketplace_create_relisting_draft (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_content       jsonb,
  p_request_id    uuid,
  p_external_id   text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_draft public.marketplace_listing_drafts; v_result jsonb;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if p_external_id is null or p_external_id !~ '^[1-9][0-9]{0,31}$' then
    raise exception 'Ungültige Relist-Quelle.' using errcode='22023';
  end if;
  if not exists(select 1 from public.marketplace_connections c where c.id=p_connection_id and c.workspace_id=p_workspace_id
    and c.marketplace='vinted' and c.execution_mode='cloud' and c.status='connected')
    or not exists(select 1 from public.marketplace_account_entries e where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id
      and e.kind='publication' and e.external_id=p_external_id and e.body->>'publicationState'='active') then
    raise exception 'Wähle ein aktives eigenes Vinted-Inserat.' using errcode='42501';
  end if;
  select * into v_draft from public.marketplace_listing_drafts where workspace_id=p_workspace_id and created_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if v_draft.relist_external_id is distinct from p_external_id or v_draft.connection_id is distinct from p_connection_id then
      raise exception 'Diese Auftragskennung wurde bereits verwendet.' using errcode='23505';
    end if;
    return public.marketplace_listing_draft_document(v_draft);
  end if;
  v_result := public.marketplace_create_listing_draft(p_workspace_id,p_connection_id,p_content,null,p_request_id);
  update public.marketplace_listing_drafts set relist_external_id=p_external_id where id=(v_result->>'id')::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_create_relisting_draft(uuid, uuid, jsonb, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_create_relisting_draft(uuid, uuid, jsonb, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_create_relisting_draft(uuid, uuid, jsonb, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_enqueue_listing_internal (
  p_draft_id          text,
  p_expected_revision bigint,
  p_action            text,
  p_request_id        uuid,
  p_ai_photo          boolean,
  p_scheduled_at      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_time_zone         text                     DEFAULT NULL::text,
  p_late_policy       text                     DEFAULT 'pause_after_30_minutes'::text,
  p_replaces_job_id   bigint                   DEFAULT NULL::bigint,
  p_replaces_version  bigint                   DEFAULT NULL::bigint
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
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  if v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.connection_id is distinct from v_permission.connection_id then raise exception 'Das Zielkonto wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.relist_external_id is not null and (p_action<>'publish' or v_permission.execution_mode<>'cloud'
    or not exists(select 1 from public.marketplace_account_entries e where e.workspace_id=v_draft.workspace_id and e.connection_id=v_draft.connection_id
      and e.kind='publication' and e.external_id=v_draft.relist_external_id and e.body->>'publicationState'='active')) then
    raise exception 'Die Relist-Quelle ist nicht mehr verfügbar.' using errcode='22023';
  end if;
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
      v_permission.external_account_id,v_permission.execution_mode,p_action,jsonb_build_object('content',v_draft.content-'aiPhoto','images',v_images,'aiPhoto',p_ai_photo,'bump',false,
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id)
      || case when v_draft.relist_external_id is null then '{}'::jsonb else jsonb_build_object('relistExternalId',v_draft.relist_external_id) end,
      p_scheduled_at,p_time_zone,p_late_policy,p_replaces_job_id) returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_listing_draft_document (
  p_draft public.marketplace_listing_drafts
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object('id',p_draft.id::text,'workspaceId',p_draft.workspace_id,'connectionId',p_draft.connection_id,
    'content',p_draft.content,'revision',p_draft.revision,'inventoryItemId',p_draft.inventory_item_id,'relistExternalId',p_draft.relist_external_id,
    'createdAt',p_draft.created_at,'updatedAt',p_draft.updated_at,'images',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id::text,'storagePath',i.storage_path,'fileName',i.file_name,
        'mimeType',i.mime_type,'byteSize',i.byte_size) order by selected.position)
      from unnest(p_draft.image_ids) with ordinality selected(id,position)
      join public.marketplace_listing_images i on i.id=selected.id::bigint and i.draft_id=p_draft.id and i.state='ready'
    ),'[]'::jsonb));
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
    'state',p_job.state,'version',p_job.version,'scheduledAt',p_job.scheduled_at,'timeZone',p_job.time_zone,'latePolicy',p_job.late_policy,
    'errorCode',p_job.error_code,'externalId',p_job.external_id,'providerState',p_job.provider_state,'verifiedAt',p_job.verified_at,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at,'replacesJobId',p_job.replaces_job_id::text,
    'relistExternalId',p_job.snapshot->>'relistExternalId','itemTitle',p_job.snapshot->'content'->>'title');
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_save_listing_draft (
  p_id                text,
  p_expected_revision bigint,
  p_content           jsonb,
  p_connection_id     uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_draft public.marketplace_listing_drafts;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_id);
  if p_expected_revision is null or v_draft.revision <> p_expected_revision then raise exception 'Der Entwurf wurde auf einem anderen Gerät geändert. Lade den aktuellen Stand.' using errcode='40001'; end if;
  if not public.marketplace_listing_content_valid(p_content) then raise exception 'Ungültige Inseratangaben.' using errcode='22023'; end if;
  if p_connection_id is not null and not exists (select 1 from public.marketplace_connections where workspace_id=v_draft.workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
  if v_draft.relist_external_id is not null and p_connection_id is distinct from v_draft.connection_id then raise exception 'Relisten ist nur im ursprünglichen Konto möglich.' using errcode='22023'; end if;
  update public.marketplace_listing_drafts set content=p_content, connection_id=p_connection_id, revision=revision+1, updated_at=now() where id=p_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

ALTER TABLE public.marketplace_listing_drafts
  ADD COLUMN relist_external_id text;

ALTER TABLE public.marketplace_listing_drafts
  ADD CONSTRAINT marketplace_listing_drafts_relist_external_id_check CHECK (relist_external_id ~ '^[1-9][0-9]{0,31}$'::text);

CREATE UNIQUE INDEX marketplace_listing_jobs_one_relisting ON public.marketplace_listing_jobs (connection_id, (snapshot ->> 'relistExternalId'::text))
  WHERE snapshot ? 'relistExternalId'::text AND (state = ANY (ARRAY['queued'::text, 'paused'::text, 'claimed'::text, 'writing'::text, 'outcome_unknown'::text, 'confirmed'::text]));