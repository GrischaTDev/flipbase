-- Zweck: KI-Fotoangabe in public.marketplace_listing_drafts.content speichern.
-- Beim Aufbau von public.marketplace_listing_jobs.snapshot bleiben Entwurfsmetadaten außerhalb des Provider-Inhalts.
-- Vorhandene Konto-, Rechte-, Revisions- und Auftragsprüfungen unverändert erhalten.
set check_function_bodies = off;

create or replace function public.marketplace_enqueue_listing_internal(p_draft_id text, p_expected_revision bigint, p_action text, p_request_id uuid, p_ai_photo boolean, p_scheduled_at timestamp with time zone default null::timestamp with time zone, p_time_zone text default null::text, p_late_policy text default 'pause_after_30_minutes'::text, p_replaces_job_id bigint default null::bigint, p_replaces_version bigint default null::bigint)
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
      v_permission.external_account_id,v_permission.execution_mode,p_action,jsonb_build_object('content',v_draft.content-'aiPhoto','images',v_images,'aiPhoto',p_ai_photo,'bump',false,
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id),p_scheduled_at,p_time_zone,p_late_policy,p_replaces_job_id) returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$function$
;

create or replace function public.marketplace_listing_content_valid(p_content jsonb)
 returns boolean
 language plpgsql
 immutable
 set search_path to ''
as $function$
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
$function$
;
