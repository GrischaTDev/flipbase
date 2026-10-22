-- Zweck: Entwürfe nach Erstellung stabil blättern und Arbeitskopien kontrolliert ausblenden.
-- Betroffen: public.marketplace_listing_drafts, zugehörige Lese-/Schreib-/Bild-/Auftragsfunktionen und Lesepolicy.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

-- Der bisherige Bearbeitungsindex wird im selben Migrationslauf durch den aktiven Erstellungsindex ersetzt.
drop index public.marketplace_listing_drafts_workspace;

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
  update public.marketplace_listing_drafts set image_ids=case when p_replace_image_id is null then array_append(image_ids,p_image_id::bigint) else array_replace(image_ids,p_replace_image_id::bigint,p_image_id::bigint) end,revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

create or replace function public.marketplace_create_listing_draft (
  p_workspace_id      uuid,
  p_connection_id     uuid,
  p_content           jsonb,
  p_inventory_item_id uuid  default null::uuid,
  p_request_id        uuid  default gen_random_uuid()
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if not public.marketplace_listing_content_valid(p_content) then raise exception 'Ungültige Inseratangaben.' using errcode = '22023'; end if;
  if p_request_id is null then raise exception 'Die Anfragekennung fehlt.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||(select auth.uid())::text||':'||p_request_id::text,460));
  select * into v_draft from public.marketplace_listing_drafts where workspace_id=p_workspace_id and created_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if v_draft.deleted_at is not null then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
    return public.marketplace_listing_draft_document(v_draft);
  end if;
  if p_connection_id is not null and not exists (select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
  if p_inventory_item_id is not null and not exists (select 1 from public.inventory_items where workspace_id=p_workspace_id and id=p_inventory_item_id and archived_at is null) then raise exception 'Kein Zugriff auf diesen Artikel.' using errcode='42501'; end if;
  insert into public.marketplace_listing_drafts(workspace_id, connection_id, content, created_by, inventory_item_id, request_id)
  values(p_workspace_id, p_connection_id, p_content, (select auth.uid()), p_inventory_item_id,p_request_id) returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

create function public.marketplace_delete_listing_draft (
  p_workspace_id      uuid,
  p_id                text,
  p_expected_revision bigint
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_id);
  if p_workspace_id is null or v_draft.workspace_id<>p_workspace_id then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  if p_expected_revision is null or v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if exists(select 1 from public.marketplace_listing_jobs where workspace_id=p_workspace_id and draft_id=v_draft.id
    and state in ('queued','paused','claimed','writing','outcome_unknown')) then
    raise exception 'Dieser Entwurf hat noch eine geplante, laufende oder ungeklärte Veröffentlichung.' using errcode='55000';
  end if;
  update public.marketplace_listing_drafts set deleted_at=now(),revision=revision+1,updated_at=now() where workspace_id=p_workspace_id and id=v_draft.id;
end;
$function$;

revoke all on function public.marketplace_delete_listing_draft(uuid, text, bigint) from public;

grant all on function public.marketplace_delete_listing_draft(uuid, text, bigint) to authenticated;

grant all on function public.marketplace_delete_listing_draft(uuid, text, bigint) to service_role;

create or replace function public.marketplace_enqueue_listing_internal (
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
$function$;

create or replace function public.marketplace_list_listing_drafts (
  p_workspace_id uuid,
  p_query        text    default ''::text,
  p_cursor       jsonb   default null::jsonb,
  p_limit        integer default 50
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare v_rows jsonb; v_last jsonb; v_cursor_id bigint; v_cursor_at timestamptz; v_more boolean;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode='42501'; end if;
  if p_query is null or length(p_query)>160 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Ungültige Entwurfssuche.' using errcode='22023'; end if;
  if p_cursor is not null and p_cursor<>'null'::jsonb then
    if jsonb_typeof(p_cursor)<>'object' or jsonb_typeof(p_cursor->'id') is distinct from 'string'
      or coalesce(p_cursor->>'id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    v_cursor_id:=(p_cursor->>'id')::bigint;
    if p_cursor ? 'createdAt' then
      if jsonb_typeof(p_cursor->'createdAt') is distinct from 'string'
        or coalesce(p_cursor->>'createdAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
      v_cursor_at:=(p_cursor->>'createdAt')::timestamptz;
    else
      -- Bereits geöffnete ältere Clients senden nur updatedAt. Ihr Datum bestimmt niemals die Sortierung.
      -- Auch gelöschte Arbeitskopien bleiben als eindeutig zugeordnete Cursor-Anker erhalten.
      if jsonb_typeof(p_cursor->'updatedAt') is distinct from 'string'
        or coalesce(p_cursor->>'updatedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
      perform (p_cursor->>'updatedAt')::timestamptz;
      select created_at into v_cursor_at from public.marketplace_listing_drafts where workspace_id=p_workspace_id and id=v_cursor_id;
      if not found then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    end if;
  end if;
  select coalesce(jsonb_agg(public.marketplace_listing_draft_document(d) order by d.created_at desc,d.id desc),'[]'::jsonb) into v_rows from (
    select * from public.marketplace_listing_drafts where workspace_id=p_workspace_id and deleted_at is null
      and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(content->>'title'))>0)
      and (v_cursor_id is null or (created_at,id)<(v_cursor_at,v_cursor_id))
    order by created_at desc,id desc limit p_limit+1
  ) d;
  v_more:=jsonb_array_length(v_rows)>p_limit;
  if v_more then
    v_last:=v_rows->(p_limit-1);
    select jsonb_agg(value order by position) into v_rows from jsonb_array_elements(v_rows) with ordinality page(value,position) where position<=p_limit;
  end if;
  return jsonb_build_object('items',v_rows,'nextCursor',case when v_more then jsonb_build_object('id',v_last->>'id','createdAt',v_last->>'createdAt','updatedAt',v_last->>'updatedAt') else null end);
end;
$function$;

create function public.marketplace_lock_listing_draft (
  p_id text
)
  returns public.marketplace_listing_drafts
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts;
begin
  select * into v_draft from public.marketplace_listing_drafts where id=p_id::bigint and deleted_at is null;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  select * into v_draft from public.marketplace_listing_drafts where id=p_id::bigint and deleted_at is null for update;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  return v_draft;
end;
$function$;

revoke all on function public.marketplace_lock_listing_draft(text) from public;

create or replace function public.marketplace_read_listing_draft (
  p_id text
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts;
begin
  select * into v_draft from public.marketplace_listing_drafts where id=p_id::bigint and deleted_at is null;
  if not found or not public.marketplace_can_manage(v_draft.workspace_id) then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

create or replace function public.marketplace_reserve_listing_image (
  p_draft_id  text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts; v_image public.marketplace_listing_images; v_path text;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  if p_file_name is null or length(p_file_name) not between 1 and 255 or p_mime_type is null or p_mime_type not in ('image/jpeg','image/png','image/webp') or p_byte_size is null or p_byte_size not between 1 and 52428800 then raise exception 'Bitte ein JPG-, PNG- oder WebP-Foto bis 50 MB auswählen.' using errcode='22023'; end if;
  -- Eigene Uploadgrenze; keine Behauptung über die zulässige Dateigröße bei Vinted.
  v_path:=v_draft.workspace_id::text||'/'||v_draft.id::text||'/'||gen_random_uuid()::text||case p_mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end;
  insert into public.marketplace_listing_images(workspace_id,draft_id,storage_path,file_name,mime_type,byte_size,created_by)
  values(v_draft.workspace_id,v_draft.id,v_path,p_file_name,p_mime_type,p_byte_size,(select auth.uid())) returning * into v_image;
  return jsonb_build_object('id',v_image.id::text,'storagePath',v_path);
end;
$function$;

create or replace function public.marketplace_save_listing_draft (
  p_id                text,
  p_expected_revision bigint,
  p_content           jsonb,
  p_connection_id     uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_id);
  if p_expected_revision is null or v_draft.revision <> p_expected_revision then raise exception 'Der Entwurf wurde auf einem anderen Gerät geändert. Lade den aktuellen Stand.' using errcode='40001'; end if;
  if not public.marketplace_listing_content_valid(p_content) then raise exception 'Ungültige Inseratangaben.' using errcode='22023'; end if;
  if p_connection_id is not null and not exists (select 1 from public.marketplace_connections where workspace_id=v_draft.workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
  update public.marketplace_listing_drafts set content=p_content, connection_id=p_connection_id, revision=revision+1, updated_at=now() where id=p_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

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
  update public.marketplace_listing_drafts set image_ids=p_image_ids::bigint[],revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

alter table public.marketplace_listing_drafts
  add column deleted_at timestamp with time zone;

comment on column public.marketplace_listing_drafts.deleted_at is 'Gelöschte Arbeitskopien bleiben für abgeschlossene Aufträge und Originalfotos erhalten, sind aber nicht mehr lesbar oder bearbeitbar.';

create index marketplace_listing_drafts_workspace on public.marketplace_listing_drafts (workspace_id, created_at desc, id desc)
  where deleted_at is null;

alter policy "Eigene Inseratentwürfe lesen" on public.marketplace_listing_drafts using (((deleted_at is null) and public.marketplace_can_manage(workspace_id)));

-- Explizite deklarative RPC-Rechte schließen auch vorhandene Default-Grants.
revoke all on function public.marketplace_lock_listing_draft(text) from public, anon, authenticated, service_role;
revoke all on function public.marketplace_delete_listing_draft(uuid, text, bigint) from public, anon;
grant execute on function public.marketplace_delete_listing_draft(uuid, text, bigint) to authenticated;
