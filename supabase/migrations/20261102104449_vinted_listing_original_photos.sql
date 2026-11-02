-- Unveränderte Inseratbilder und davon getrennte Vinted-Ausgabeparameter sichern.
-- Betroffen: marketplace_listing_drafts, marketplace_listing_photo_sources und Veröffentlichungsfunktionen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create or replace function public.marketplace_commit_listing_image (
  p_draft_id          text,
  p_expected_revision bigint,
  p_image_id          text,
  p_replace_image_id  text   default null::text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts; v_image public.marketplace_listing_images;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  select * into v_image from public.marketplace_listing_images where id=p_image_id::bigint and draft_id=p_draft_id::bigint for update;
  if not found or v_image.created_by<>(select auth.uid()) then raise exception 'Kein Zugriff auf diesen Upload.' using errcode='42501'; end if;
  -- Bereits bestätigte Antwort darf erneut gelesen werden, ohne ein Bild doppelt anzuhängen.
  if v_image.state='ready' and p_image_id::bigint=any(v_draft.image_ids) then return public.marketplace_listing_draft_document(v_draft); end if;
  if p_expected_revision is null or v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_image.state<>'pending' or not exists(select 1 from storage.objects o where o.bucket_id='marketplace-listing-media' and o.name=v_image.storage_path and o.metadata->>'mimetype'=v_image.mime_type and o.metadata->>'size'=v_image.byte_size::text) then raise exception 'Der Upload ist noch nicht vollständig.' using errcode='22023'; end if;
  if p_replace_image_id is not null then
    if not (p_replace_image_id::bigint=any(v_draft.image_ids)) then raise exception 'Das zu ersetzende Foto gehört nicht zur aktuellen Auswahl.' using errcode='42501'; end if;
  elsif cardinality(v_draft.image_ids)>=100 then raise exception 'Dieser Entwurf enthält bereits 100 Fotos.' using errcode='22023'; end if;
  update public.marketplace_listing_images set state='ready' where id=p_image_id::bigint;
  -- Erst das vollständig hochgeladene Original bestätigen, dann seine Auswahlposition atomar ersetzen.
  update public.marketplace_listing_drafts set image_ids=case when p_replace_image_id is null then array_append(image_ids,p_image_id::bigint) else array_replace(image_ids,p_replace_image_id::bigint,p_image_id::bigint) end,
    photo_options=jsonb_set(photo_options,'{crops}',(photo_options->'crops')-coalesce(p_replace_image_id,'')),
    revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
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
  as $function$
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
  if not public.marketplace_listing_photo_options_valid(v_draft.photo_options,v_draft.image_ids) then raise exception 'Die Bildbearbeitung passt nicht mehr zur Fotoauswahl.' using errcode='22023'; end if;
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
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id,'photoOptions',v_draft.photo_options)
      || case when v_draft.relist_external_id is null then '{}'::jsonb else jsonb_build_object('relistExternalId',v_draft.relist_external_id) end,
      p_scheduled_at,p_time_zone,p_late_policy,p_replaces_job_id,p_relist_delay_seconds,case when v_draft.relist_deleted_at is not null then coalesce(p_scheduled_at,clock_timestamp()+make_interval(secs=>p_relist_delay_seconds)) else null end) returning * into v_job;
  if v_draft.relist_external_id is not null then perform public.marketplace_remember_listing_photo_source(v_job,v_draft.relist_external_id); end if;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

create or replace function public.marketplace_listing_draft_document (
  p_draft public.marketplace_listing_drafts
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
  select jsonb_build_object('id',p_draft.id::text,'workspaceId',p_draft.workspace_id,'connectionId',p_draft.connection_id,
    'photoOptions',p_draft.photo_options,'content',p_draft.content,'revision',p_draft.revision,'inventoryItemId',p_draft.inventory_item_id,'relistExternalId',p_draft.relist_external_id,
    'createdAt',p_draft.created_at,'updatedAt',p_draft.updated_at,'images',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id::text,'storagePath',i.storage_path,'fileName',i.file_name,
        'mimeType',i.mime_type,'byteSize',i.byte_size) order by selected.position)
      from unnest(p_draft.image_ids) with ordinality selected(id,position)
      join public.marketplace_listing_images i on i.id=selected.id::bigint and i.draft_id=p_draft.id and i.state='ready'
    ),'[]'::jsonb));
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
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

create function public.marketplace_listing_photo_options_valid (
  p_options   jsonb,
  p_image_ids bigint[]
)
  returns boolean
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare v_key text; v_crop jsonb;
begin
  if p_image_ids is null or p_options is null or octet_length(p_options::text)>20000 or jsonb_typeof(p_options)<>'object' or (select count(*) from jsonb_object_keys(p_options))<>2
    or not (p_options ?& array['resize','crops']) or (p_options->'resize'<>'null'::jsonb and p_options->'resize' not in ('1200'::jsonb,'1600'::jsonb,'2400'::jsonb))
    or jsonb_typeof(p_options->'crops')<>'object' then return false; end if;
  for v_key,v_crop in select key,value from jsonb_each(p_options->'crops') loop
    if v_key !~ '^[1-9][0-9]{0,18}$' or not (v_key::bigint=any(p_image_ids)) or jsonb_typeof(v_crop)<>'object'
      or (select count(*) from jsonb_object_keys(v_crop))<>5 or not (v_crop ?& array['x','y','width','height','rotation'])
      or exists(select 1 from jsonb_each(v_crop) where jsonb_typeof(value)<>'number') then return false; end if;
    if v_crop->'rotation' not in ('0'::jsonb,'90'::jsonb,'180'::jsonb,'270'::jsonb) or (v_crop->>'x')::numeric<0 or (v_crop->>'y')::numeric<0
      or (v_crop->>'width')::numeric<=0 or (v_crop->>'height')::numeric<=0 or (v_crop->>'x')::numeric+(v_crop->>'width')::numeric>1.000000001
      or (v_crop->>'y')::numeric+(v_crop->>'height')::numeric>1.000000001 then return false; end if;
  end loop;
  return true;
end;
$function$;

revoke all on function public.marketplace_listing_photo_options_valid(jsonb, bigint[]) from public;

grant all on function public.marketplace_listing_photo_options_valid(jsonb, bigint[]) to authenticated;

grant all on function public.marketplace_listing_photo_options_valid(jsonb, bigint[]) to service_role;

create function public.marketplace_read_listing_photo_sources (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_external_ids  text[]
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_account text; v_items jsonb;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if p_external_ids is null or cardinality(p_external_ids)>50 or exists(select 1 from unnest(p_external_ids) id where id is null or id !~ '^[1-9][0-9]{0,31}$') then raise exception 'Ungültige Artikelzuordnung.' using errcode='22023'; end if;
  select external_account_id into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id;
  if not found then raise exception 'Kein Zugriff auf dieses Marktplatzkonto.' using errcode='42501'; end if;
  -- Frühere bestätigte Aufträge sind die früheste noch verfügbare Sicherung. Nur einmal zuordnen.
  insert into public.marketplace_listing_photo_sources(workspace_id,connection_id,external_account_id,external_id,draft_id,images)
    select distinct on (external_id) workspace_id,connection_id,external_account_id,external_id,draft_id,snapshot->'images'
    from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=v_account
      and external_id=any(p_external_ids) and action='publish' and state='confirmed'
    order by external_id,created_at,id on conflict(connection_id,external_account_id,external_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object('externalId',source.external_id,'draft',public.marketplace_listing_draft_document(draft)||jsonb_build_object('images',source.images,'photoOptions',null,'connectionId',source.connection_id))),'[]'::jsonb) into v_items
    from public.marketplace_listing_photo_sources source join public.marketplace_listing_drafts draft on draft.id=source.draft_id and draft.workspace_id=source.workspace_id
    where source.workspace_id=p_workspace_id and source.connection_id=p_connection_id and source.external_account_id=v_account and source.external_id=any(p_external_ids);
  return jsonb_build_object('items',v_items);
end;
$function$;

revoke all on function public.marketplace_read_listing_photo_sources(uuid, uuid, text[]) from public;

grant all on function public.marketplace_read_listing_photo_sources(uuid, uuid, text[]) to authenticated;

grant all on function public.marketplace_read_listing_photo_sources(uuid, uuid, text[]) to service_role;

create function public.marketplace_remember_listing_photo_source (
  p_job         public.marketplace_listing_jobs,
  p_external_id text
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
begin
  if p_job.connection_id is null or p_external_id is null or p_external_id !~ '^[1-9][0-9]{0,31}$' then return; end if;
  insert into public.marketplace_listing_photo_sources(workspace_id,connection_id,external_account_id,external_id,draft_id,images)
    values(p_job.workspace_id,p_job.connection_id,p_job.external_account_id,p_external_id,p_job.draft_id,p_job.snapshot->'images')
    on conflict(connection_id,external_account_id,external_id) do nothing;
end;
$function$;

revoke all on function public.marketplace_remember_listing_photo_source(public.marketplace_listing_jobs, text) from public;

grant all on function public.marketplace_remember_listing_photo_source(public.marketplace_listing_jobs, text) to service_role;

create or replace function public.marketplace_set_listing_image_order (
  p_draft_id          text,
  p_expected_revision bigint,
  p_image_ids         text[]
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  if p_expected_revision is null or v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if p_image_ids is null or cardinality(p_image_ids)>100 or exists(select 1 from unnest(p_image_ids) id where id is null or id !~ '^[1-9][0-9]{0,18}$') or (select count(distinct id) from unnest(p_image_ids) id)<>cardinality(p_image_ids) then raise exception 'Ungültige Bildauswahl.' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_image_ids) selected(id) where not exists(select 1 from public.marketplace_listing_images i where i.id=selected.id::bigint and i.draft_id=p_draft_id::bigint and i.state='ready')) then raise exception 'Diese Fotos gehören nicht zum Entwurf.' using errcode='42501'; end if;
  update public.marketplace_listing_drafts set image_ids=p_image_ids::bigint[],
    photo_options=jsonb_set(photo_options,'{crops}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(photo_options->'crops') where key=any(p_image_ids)),'{}'::jsonb)),
    revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

create function public.marketplace_set_listing_photo_options (
  p_draft_id          text,
  p_expected_revision bigint,
  p_options           jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  if p_expected_revision is distinct from v_draft.revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if not public.marketplace_listing_photo_options_valid(p_options,v_draft.image_ids) then raise exception 'Ungültige Bildbearbeitung.' using errcode='22023'; end if;
  if v_draft.photo_options is distinct from p_options then
    update public.marketplace_listing_drafts set photo_options=p_options,revision=revision+1,updated_at=clock_timestamp() where id=v_draft.id returning * into v_draft;
  end if;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

revoke all on function public.marketplace_set_listing_photo_options(text, bigint, jsonb) from public;

grant all on function public.marketplace_set_listing_photo_options(text, bigint, jsonb) to authenticated;

grant all on function public.marketplace_set_listing_photo_options(text, bigint, jsonb) to service_role;

alter table public.marketplace_listing_drafts
  add column photo_options jsonb default '{"crops": {}, "resize": null}'::jsonb not null;

create table public.marketplace_listing_photo_sources (
  id                  bigint                   generated always as identity not null,
  workspace_id        uuid                     not null,
  connection_id       uuid                     not null,
  external_account_id text                     not null,
  external_id         text                     not null,
  draft_id            bigint                   not null,
  images              jsonb                    not null,
  created_at          timestamp with time zone default now() not null
);

comment on table public.marketplace_listing_photo_sources is 'Unveränderliche Zuordnung gesicherter Originalfotos zu einem Vinted-Inserat; Anbieterbilder überschreiben diese Sicherung nicht.';

alter table public.marketplace_listing_photo_sources
  enable row level security;

alter table public.marketplace_listing_photo_sources
  add constraint marketplace_listing_photo_sou_connection_id_external_accoun_key unique (connection_id, external_account_id, external_id);

alter table public.marketplace_listing_photo_sources
  add constraint marketplace_listing_photo_sourc_workspace_id_connection_id_fkey foreign key (workspace_id, connection_id)
    references public.marketplace_connections(workspace_id, id) on delete cascade;

alter table public.marketplace_listing_photo_sources
  add constraint marketplace_listing_photo_sources_external_account_id_check check (external_account_id ~ '^[1-9][0-9]{0,31}$'::text);

alter table public.marketplace_listing_photo_sources
  add constraint marketplace_listing_photo_sources_external_id_check check (external_id ~ '^[1-9][0-9]{0,31}$'::text);

alter table public.marketplace_listing_photo_sources
  add constraint marketplace_listing_photo_sources_images_check
    check (jsonb_typeof(images) = 'array'::text and jsonb_array_length(images) >= 1 and jsonb_array_length(images) <= 20);

alter table public.marketplace_listing_photo_sources
  add constraint marketplace_listing_photo_sources_pkey primary key (id);

alter table public.marketplace_listing_photo_sources
  add constraint marketplace_listing_photo_sources_workspace_id_draft_id_fkey foreign key (workspace_id, draft_id) references public.marketplace_listing_drafts(workspace_id, id)
    on delete cascade;

alter table public.marketplace_listing_photo_sources
  add constraint marketplace_listing_photo_sources_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade;

grant select on public.marketplace_listing_photo_sources to authenticated;

grant all on public.marketplace_listing_photo_sources to service_role;

create index marketplace_listing_photo_sources_draft on public.marketplace_listing_photo_sources (draft_id);

create index marketplace_listing_photo_sources_workspace on public.marketplace_listing_photo_sources (workspace_id);

create policy "Inseratoriginale lesen" on public.marketplace_listing_photo_sources
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Inseratoriginale nicht direkt löschen" on public.marketplace_listing_photo_sources
  for delete
  to authenticated
  using (false);

create policy "Inseratoriginale nur per Auftrag anlegen" on public.marketplace_listing_photo_sources
  for insert
  to authenticated
  with check (false);

create policy "Inseratoriginale unverändert erhalten" on public.marketplace_listing_photo_sources
  for update
  to authenticated
  using (false)
  with check (false);
-- Generierter Rechteabgleich nach Anwendung auf die Ausgangskopie.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

alter table public.marketplace_listing_photo_sources
  drop constraint marketplace_listing_photo_sources_images_check;

revoke all on function public.marketplace_enqueue_listing_internal(text, bigint, text, uuid, boolean, timestamp
  with time zone, text, text, bigint, bigint, integer) from authenticated;

revoke all on function public.marketplace_remember_listing_photo_source(public.marketplace_listing_jobs, text) from authenticated;

alter table public.marketplace_listing_photo_sources
  add constraint marketplace_listing_photo_sources_images_check
    check (jsonb_typeof(images) = 'array'::text and jsonb_array_length(images) >= 1 and jsonb_array_length(images) <= 20);

revoke delete, insert, maintain, references, trigger, truncate, update on public.marketplace_listing_photo_sources from authenticated;