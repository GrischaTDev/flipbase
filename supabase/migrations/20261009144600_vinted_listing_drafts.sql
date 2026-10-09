-- Zweck: Vinted-Arbeitskopien, Originalfotos und ausgewählte Vorlagenfelder speichern.
-- Betroffen: public.marketplace_listing_drafts, marketplace_listing_images, marketplace_listing_templates und private Storage-Policies.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_commit_listing_image (
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
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint for update;
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

revoke all on function public.marketplace_commit_listing_image(text, bigint, text, text) from public;

grant all on function public.marketplace_commit_listing_image(text, bigint, text, text) to authenticated;

grant all on function public.marketplace_commit_listing_image(text, bigint, text, text) to service_role;

create function public.marketplace_create_listing_draft (
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
  if found then return public.marketplace_listing_draft_document(v_draft); end if;
  if p_connection_id is not null and not exists (select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
  if p_inventory_item_id is not null and not exists (select 1 from public.inventory_items where workspace_id=p_workspace_id and id=p_inventory_item_id and archived_at is null) then raise exception 'Kein Zugriff auf diesen Artikel.' using errcode='42501'; end if;
  insert into public.marketplace_listing_drafts(workspace_id, connection_id, content, created_by, inventory_item_id, request_id)
  values(p_workspace_id, p_connection_id, p_content, (select auth.uid()), p_inventory_item_id,p_request_id) returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

revoke all on function public.marketplace_create_listing_draft(uuid, uuid, jsonb, uuid, uuid) from public;

grant all on function public.marketplace_create_listing_draft(uuid, uuid, jsonb, uuid, uuid) to authenticated;

grant all on function public.marketplace_create_listing_draft(uuid, uuid, jsonb, uuid, uuid) to service_role;

create function public.marketplace_delete_listing_template (
  p_workspace_id      uuid,
  p_id                text,
  p_expected_revision bigint
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_template public.marketplace_listing_templates;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  select * into v_template from public.marketplace_listing_templates where id=p_id::bigint and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Kein Zugriff auf diese Vorlage.' using errcode='42501'; end if;
  if p_expected_revision is null or v_template.revision <> p_expected_revision then raise exception 'Die Vorlage wurde inzwischen geändert.' using errcode='40001'; end if;
  delete from public.marketplace_listing_templates where id=p_id::bigint;
end;
$function$;

revoke all on function public.marketplace_delete_listing_template(uuid, text, bigint) from public;

grant all on function public.marketplace_delete_listing_template(uuid, text, bigint) to authenticated;

grant all on function public.marketplace_delete_listing_template(uuid, text, bigint) to service_role;

create function public.marketplace_discard_listing_image (
  p_image_id text
)
  returns text
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_image public.marketplace_listing_images;
begin
  select * into v_image from public.marketplace_listing_images where id=p_image_id::bigint;
  if not found or v_image.created_by<>(select auth.uid()) then raise exception 'Kein Zugriff auf diesen Upload.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_image.workspace_id);
  -- Gleiche Sperrreihenfolge wie Commit: erst Entwurf, dann Bild.
  perform 1 from public.marketplace_listing_drafts where id=v_image.draft_id for update;
  select * into v_image from public.marketplace_listing_images where id=p_image_id::bigint for update;
  if v_image.state='ready' then raise exception 'Bestätigte Originalfotos dürfen nicht gelöscht werden.' using errcode='22023'; end if;
  update public.marketplace_listing_images set state='abandoned' where id=p_image_id::bigint;
  return v_image.storage_path;
end;
$function$;

revoke all on function public.marketplace_discard_listing_image(text) from public;

grant all on function public.marketplace_discard_listing_image(text) to authenticated;

grant all on function public.marketplace_discard_listing_image(text) to service_role;

create function public.marketplace_list_listing_drafts (
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
    if jsonb_typeof(p_cursor)<>'object' or coalesce(p_cursor->>'id','') !~ '^[1-9][0-9]{0,18}$' or coalesce(p_cursor->>'updatedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    v_cursor_id:=(p_cursor->>'id')::bigint;v_cursor_at:=(p_cursor->>'updatedAt')::timestamptz;
  end if;
  select coalesce(jsonb_agg(public.marketplace_listing_draft_document(d) order by d.updated_at desc,d.id desc),'[]'::jsonb) into v_rows from (
    select * from public.marketplace_listing_drafts where workspace_id=p_workspace_id
      and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(content->>'title'))>0)
      and (v_cursor_id is null or (updated_at,id)<(v_cursor_at,v_cursor_id))
    order by updated_at desc,id desc limit p_limit+1
  ) d;
  v_more:=jsonb_array_length(v_rows)>p_limit;
  if v_more then
    v_last:=v_rows->(p_limit-1);
    select jsonb_agg(value order by position) into v_rows from jsonb_array_elements(v_rows) with ordinality page(value,position) where position<=p_limit;
  end if;
  return jsonb_build_object('items',v_rows,'nextCursor',case when v_more then jsonb_build_object('id',v_last->>'id','updatedAt',v_last->>'updatedAt') else null end);
end;
$function$;

revoke all on function public.marketplace_list_listing_drafts(uuid, text, jsonb, integer) from public;

grant all on function public.marketplace_list_listing_drafts(uuid, text, jsonb, integer) to authenticated;

grant all on function public.marketplace_list_listing_drafts(uuid, text, jsonb, integer) to service_role;

create function public.marketplace_list_listing_templates (
  p_workspace_id uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.marketplace_listing_template_document(t) order by lower(t.name),t.id)
    from public.marketplace_listing_templates t where t.workspace_id=p_workspace_id),'[]'::jsonb);
end;
$function$;

revoke all on function public.marketplace_list_listing_templates(uuid) from public;

grant all on function public.marketplace_list_listing_templates(uuid) to authenticated;

grant all on function public.marketplace_list_listing_templates(uuid) to service_role;

create function public.marketplace_listing_content_valid (
  p_content jsonb
)
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
      if jsonb_typeof(v_value) <> 'string' or length(v_value #>> '{}') > 20000 or regexp_replace(v_value #>> '{}', e'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]' then return false; end if;
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
        elsif jsonb_typeof(v_entry) <> 'string' or length(v_entry #>> '{}') > 20000 or regexp_replace(v_entry #>> '{}', e'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]' then return false;
        end if;
      end loop;
      if v_key in ('colorIds', 'materialIds') and (select count(distinct value) from jsonb_array_elements(v_value)) <> jsonb_array_length(v_value) then return false; end if;
    elsif v_key = 'attributes' then
      if jsonb_typeof(v_value) <> 'object' then return false; end if;
      if (select count(*) from jsonb_each(v_value)) > 100 or exists (
        select 1 from jsonb_each(v_value) where key !~ '^[a-zA-Z][a-zA-Z0-9_]{0,99}$'
          or key in ('constructor', 'prototype', '__proto__') or jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 20000 or regexp_replace(value #>> '{}', e'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]'
      ) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$function$;

revoke all on function public.marketplace_listing_content_valid(jsonb) from public;

grant all on function public.marketplace_listing_content_valid(jsonb) to authenticated;

grant all on function public.marketplace_listing_content_valid(jsonb) to service_role;

create function public.marketplace_lock_listing_workspace (
  p_workspace_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  perform 1 from public.workspaces where id = p_workspace_id for share;
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501'; end if;
end;
$function$;

revoke all on function public.marketplace_lock_listing_workspace(uuid) from public;

create function public.marketplace_read_listing_draft (
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
  select * into v_draft from public.marketplace_listing_drafts where id=p_id::bigint;
  if not found or not public.marketplace_can_manage(v_draft.workspace_id) then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

revoke all on function public.marketplace_read_listing_draft(text) from public;

grant all on function public.marketplace_read_listing_draft(text) to authenticated;

grant all on function public.marketplace_read_listing_draft(text) to service_role;

create function public.marketplace_reserve_listing_image (
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
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  if p_file_name is null or length(p_file_name) not between 1 and 255 or p_mime_type is null or p_mime_type not in ('image/jpeg','image/png','image/webp') or p_byte_size is null or p_byte_size not between 1 and 52428800 then raise exception 'Bitte ein JPG-, PNG- oder WebP-Foto bis 50 MB auswählen.' using errcode='22023'; end if;
  -- Eigene Uploadgrenze; keine Behauptung über die zulässige Dateigröße bei Vinted.
  v_path:=v_draft.workspace_id::text||'/'||v_draft.id::text||'/'||gen_random_uuid()::text||case p_mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end;
  insert into public.marketplace_listing_images(workspace_id,draft_id,storage_path,file_name,mime_type,byte_size,created_by)
  values(v_draft.workspace_id,v_draft.id,v_path,p_file_name,p_mime_type,p_byte_size,(select auth.uid())) returning * into v_image;
  return jsonb_build_object('id',v_image.id::text,'storagePath',v_path);
end;
$function$;

revoke all on function public.marketplace_reserve_listing_image(text, text, text, bigint) from public;

grant all on function public.marketplace_reserve_listing_image(text, text, text, bigint) to authenticated;

grant all on function public.marketplace_reserve_listing_image(text, text, text, bigint) to service_role;

create function public.marketplace_save_listing_draft (
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
  select * into v_draft from public.marketplace_listing_drafts where id=p_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  select * into v_draft from public.marketplace_listing_drafts where id=p_id::bigint for update;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  if p_expected_revision is null or v_draft.revision <> p_expected_revision then raise exception 'Der Entwurf wurde auf einem anderen Gerät geändert. Lade den aktuellen Stand.' using errcode='40001'; end if;
  if not public.marketplace_listing_content_valid(p_content) then raise exception 'Ungültige Inseratangaben.' using errcode='22023'; end if;
  if p_connection_id is not null and not exists (select 1 from public.marketplace_connections where workspace_id=v_draft.workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
  update public.marketplace_listing_drafts set content=p_content, connection_id=p_connection_id, revision=revision+1, updated_at=now() where id=p_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

revoke all on function public.marketplace_save_listing_draft(text, bigint, jsonb, uuid) from public;

grant all on function public.marketplace_save_listing_draft(text, bigint, jsonb, uuid) to authenticated;

grant all on function public.marketplace_save_listing_draft(text, bigint, jsonb, uuid) to service_role;

create function public.marketplace_save_listing_template (
  p_workspace_id      uuid,
  p_id                text,
  p_expected_revision bigint,
  p_name              text,
  p_fields            jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_template public.marketplace_listing_templates;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if p_name is null or length(btrim(p_name)) not between 1 and 100 or not public.marketplace_listing_content_valid(p_fields) then raise exception 'Ungültige Inseratvorlage.' using errcode='22023'; end if;
  if p_id is null then
    if p_expected_revision is not null then raise exception 'Eine neue Vorlage hat keine Revision.' using errcode='22023'; end if;
    insert into public.marketplace_listing_templates(workspace_id,name,fields,created_by)
    values(p_workspace_id,btrim(p_name),p_fields,(select auth.uid())) returning * into v_template;
  else
    select * into v_template from public.marketplace_listing_templates where id=p_id::bigint and workspace_id=p_workspace_id for update;
    if not found then raise exception 'Kein Zugriff auf diese Vorlage.' using errcode='42501'; end if;
    if p_expected_revision is null or v_template.revision <> p_expected_revision then raise exception 'Die Vorlage wurde inzwischen geändert.' using errcode='40001'; end if;
    update public.marketplace_listing_templates set name=btrim(p_name),fields=p_fields,revision=revision+1,updated_at=now() where id=p_id::bigint returning * into v_template;
  end if;
  return public.marketplace_listing_template_document(v_template);
end;
$function$;

revoke all on function public.marketplace_save_listing_template(uuid, text, bigint, text, jsonb) from public;

grant all on function public.marketplace_save_listing_template(uuid, text, bigint, text, jsonb) to authenticated;

grant all on function public.marketplace_save_listing_template(uuid, text, bigint, text, jsonb) to service_role;

create function public.marketplace_set_listing_image_order (
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
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint for update;
  if p_expected_revision is null or v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if p_image_ids is null or cardinality(p_image_ids)>100 or exists(select 1 from unnest(p_image_ids) id where id is null or id !~ '^[1-9][0-9]{0,18}$') or (select count(distinct id) from unnest(p_image_ids) id)<>cardinality(p_image_ids) then raise exception 'Ungültige Bildauswahl.' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_image_ids) selected(id) where not exists(select 1 from public.marketplace_listing_images i where i.id=selected.id::bigint and i.draft_id=p_draft_id::bigint and i.state='ready')) then raise exception 'Diese Fotos gehören nicht zum Entwurf.' using errcode='42501'; end if;
  update public.marketplace_listing_drafts set image_ids=p_image_ids::bigint[],revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

revoke all on function public.marketplace_set_listing_image_order(text, bigint, text[]) from public;

grant all on function public.marketplace_set_listing_image_order(text, bigint, text[]) to authenticated;

grant all on function public.marketplace_set_listing_image_order(text, bigint, text[]) to service_role;

create table public.marketplace_listing_drafts (
  id                bigint                   generated always as identity not null,
  workspace_id      uuid                     not null,
  connection_id     uuid,
  content           jsonb                    default '{}'::jsonb not null,
  revision          bigint                   default 1 not null,
  created_by        uuid                     not null,
  created_at        timestamp with time zone default now() not null,
  updated_at        timestamp with time zone default now() not null,
  inventory_item_id uuid,
  image_ids         bigint[]                 default array[]::bigint[] not null,
  request_id        uuid                     default gen_random_uuid() not null
);

create function public.marketplace_listing_draft_document (
  p_draft public.marketplace_listing_drafts
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
  select jsonb_build_object('id',p_draft.id::text,'workspaceId',p_draft.workspace_id,'connectionId',p_draft.connection_id,
    'content',p_draft.content,'revision',p_draft.revision,'inventoryItemId',p_draft.inventory_item_id,
    'createdAt',p_draft.created_at,'updatedAt',p_draft.updated_at,'images',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id::text,'storagePath',i.storage_path,'fileName',i.file_name,
        'mimeType',i.mime_type,'byteSize',i.byte_size) order by selected.position)
      from unnest(p_draft.image_ids) with ordinality selected(id,position)
      join public.marketplace_listing_images i on i.id=selected.id::bigint and i.draft_id=p_draft.id and i.state='ready'
    ),'[]'::jsonb));
$function$;

revoke all on function public.marketplace_listing_draft_document(public.marketplace_listing_drafts) from public;

grant all on function public.marketplace_listing_draft_document(public.marketplace_listing_drafts) to service_role;

comment on table public.marketplace_listing_drafts is 'Unvollständige Vinted-Arbeitskopien; jede Inhalts- und Bildänderung benötigt die aktuelle Revision.';

alter table public.marketplace_listing_drafts
  enable row level security;

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_content_check check (public.marketplace_listing_content_valid(content));

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_created_by_fkey foreign key (created_by) references auth.users(id);

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_image_ids_check check (cardinality(image_ids) <= 100);

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_pkey primary key (id);

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_revision_check check (revision >= 1 and revision <= '9007199254740991'::bigint);

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_workspace_id_connection_id_fkey foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id)
    on delete set null (connection_id);

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_workspace_id_created_by_request_id_k unique (workspace_id, created_by, request_id);

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_workspace_id_id_key unique (workspace_id, id);

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_workspace_id_inventory_item_id_fkey foreign key (workspace_id, inventory_item_id) references public.inventory_items(workspace_id, id)
    on delete set null (inventory_item_id);

grant select on public.marketplace_listing_drafts to authenticated;

grant all on public.marketplace_listing_drafts to service_role;

create index marketplace_listing_drafts_connection on public.marketplace_listing_drafts (connection_id);

create index marketplace_listing_drafts_inventory on public.marketplace_listing_drafts (inventory_item_id);

create index marketplace_listing_drafts_workspace on public.marketplace_listing_drafts (workspace_id, updated_at desc, id desc);

create index marketplace_listing_drafts_creator on public.marketplace_listing_drafts (created_by);

create policy "Eigene Inseratentwürfe lesen" on public.marketplace_listing_drafts
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Entwürfe nur per RPC anlegen" on public.marketplace_listing_drafts
  for insert
  to authenticated
  with check (false);

create policy "Entwürfe nur per RPC löschen" on public.marketplace_listing_drafts
  for delete
  to authenticated
  using (false);

create policy "Entwürfe nur per RPC ändern" on public.marketplace_listing_drafts
  for update
  to authenticated
  using (false)
  with check (false);

create table public.marketplace_listing_images (
  id           bigint                   generated always as identity not null,
  workspace_id uuid                     not null,
  draft_id     bigint                   not null,
  storage_path text                     not null,
  file_name    text                     not null,
  mime_type    text                     not null,
  byte_size    bigint                   not null,
  state        text                     default 'pending'::text not null,
  created_by   uuid                     not null,
  created_at   timestamp with time zone default now() not null
);

comment on table public.marketplace_listing_images is 'Privat reservierte Originalfotos; fertige Dateien werden nicht überschrieben oder bei Auswahländerungen gelöscht.';

alter table public.marketplace_listing_images
  enable row level security;

alter table public.marketplace_listing_images
  add constraint marketplace_listing_images_byte_size_check check (byte_size >= 1 and byte_size <= 52428800);

alter table public.marketplace_listing_images
  add constraint marketplace_listing_images_created_by_fkey foreign key (created_by) references auth.users(id);

alter table public.marketplace_listing_images
  add constraint marketplace_listing_images_file_name_check check (length(file_name) >= 1 and length(file_name) <= 255);

alter table public.marketplace_listing_images
  add constraint marketplace_listing_images_mime_type_check check (mime_type = any (array['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]));

alter table public.marketplace_listing_images
  add constraint marketplace_listing_images_pkey primary key (id);

alter table public.marketplace_listing_images
  add constraint marketplace_listing_images_state_check check (state = any (array['pending'::text, 'ready'::text, 'abandoned'::text]));

alter table public.marketplace_listing_images
  add constraint marketplace_listing_images_storage_path_key unique (storage_path);

alter table public.marketplace_listing_images
  add constraint marketplace_listing_images_workspace_id_draft_id_fkey foreign key (workspace_id, draft_id) references public.marketplace_listing_drafts(workspace_id, id)
    on delete cascade;

grant select on public.marketplace_listing_images to authenticated;

grant all on public.marketplace_listing_images to service_role;

create index marketplace_listing_images_workspace on public.marketplace_listing_images (workspace_id);

create index marketplace_listing_images_draft on public.marketplace_listing_images (draft_id);

create index marketplace_listing_images_creator on public.marketplace_listing_images (created_by);

create policy "Bilder nur per RPC anlegen" on public.marketplace_listing_images
  for insert
  to authenticated
  with check (false);

create policy "Bilder nur per RPC löschen" on public.marketplace_listing_images
  for delete
  to authenticated
  using (false);

create policy "Bilder nur per RPC ändern" on public.marketplace_listing_images
  for update
  to authenticated
  using (false)
  with check (false);

create policy "Eigene Inseratbilder lesen" on public.marketplace_listing_images
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create table public.marketplace_listing_templates (
  id           bigint                   generated always as identity not null,
  workspace_id uuid                     not null,
  name         text                     not null,
  fields       jsonb                    not null,
  revision     bigint                   default 1 not null,
  created_by   uuid                     not null,
  created_at   timestamp with time zone default now() not null,
  updated_at   timestamp with time zone default now() not null
);

create function public.marketplace_listing_template_document (
  p_template public.marketplace_listing_templates
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
  select jsonb_build_object('id',p_template.id::text,'workspaceId',p_template.workspace_id,'name',p_template.name,
    'fields',p_template.fields,'revision',p_template.revision,'updatedAt',p_template.updated_at);
$function$;

revoke all on function public.marketplace_listing_template_document(public.marketplace_listing_templates) from public;

grant all on function public.marketplace_listing_template_document(public.marketplace_listing_templates) to service_role;

comment on table public.marketplace_listing_templates is 'Ausgewählte Vinted-Inseratfelder und Platzhalter als Workspace-Vorlagen.';

alter table public.marketplace_listing_templates
  enable row level security;

alter table public.marketplace_listing_templates
  add constraint marketplace_listing_templates_created_by_fkey foreign key (created_by) references auth.users(id);

alter table public.marketplace_listing_templates
  add constraint marketplace_listing_templates_fields_check check (public.marketplace_listing_content_valid(fields));

alter table public.marketplace_listing_templates
  add constraint marketplace_listing_templates_name_check check (length(btrim(name)) >= 1 and length(btrim(name)) <= 100);

alter table public.marketplace_listing_templates
  add constraint marketplace_listing_templates_pkey primary key (id);

alter table public.marketplace_listing_templates
  add constraint marketplace_listing_templates_revision_check check (revision >= 1 and revision <= '9007199254740991'::bigint);

alter table public.marketplace_listing_templates
  add constraint marketplace_listing_templates_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade;

grant select on public.marketplace_listing_templates to authenticated;

grant all on public.marketplace_listing_templates to service_role;

create index marketplace_listing_templates_creator on public.marketplace_listing_templates (created_by);

create unique index marketplace_listing_templates_name on public.marketplace_listing_templates (workspace_id, lower(btrim(name)));

create policy "Eigene Inseratvorlagen lesen" on public.marketplace_listing_templates
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Vorlagen nur per RPC anlegen" on public.marketplace_listing_templates
  for insert
  to authenticated
  with check (false);

create policy "Vorlagen nur per RPC löschen" on public.marketplace_listing_templates
  for delete
  to authenticated
  using (false);

create policy "Vorlagen nur per RPC ändern" on public.marketplace_listing_templates
  for update
  to authenticated
  using (false)
  with check (false);

-- Explizite Inseratrechte und privater Bucket aus dem deklarativen Schema.
revoke all on function public.marketplace_listing_content_valid(jsonb) from public, anon;
grant execute on function public.marketplace_listing_content_valid(jsonb) to authenticated, service_role;
revoke all on public.marketplace_listing_drafts from public, anon, authenticated;
grant select on public.marketplace_listing_drafts to authenticated;
grant all on public.marketplace_listing_drafts to service_role;
grant usage, select on sequence public.marketplace_listing_drafts_id_seq to service_role;
revoke all on function public.marketplace_listing_draft_document(public.marketplace_listing_drafts) from public, anon, authenticated;
revoke all on function public.marketplace_lock_listing_workspace(uuid) from public, anon, authenticated, service_role;
revoke all on function public.marketplace_create_listing_draft(uuid, uuid, jsonb, uuid, uuid), public.marketplace_read_listing_draft(text), public.marketplace_list_listing_drafts(uuid,text,jsonb,integer), public.marketplace_save_listing_draft(text, bigint, jsonb, uuid) from public, anon;
grant execute on function public.marketplace_create_listing_draft(uuid, uuid, jsonb, uuid, uuid), public.marketplace_read_listing_draft(text), public.marketplace_list_listing_drafts(uuid,text,jsonb,integer), public.marketplace_save_listing_draft(text, bigint, jsonb, uuid) to authenticated;
revoke all on public.marketplace_listing_images from public,anon,authenticated;
grant select on public.marketplace_listing_images to authenticated;
grant all on public.marketplace_listing_images to service_role;
grant usage,select on sequence public.marketplace_listing_images_id_seq to service_role;
revoke all on function public.marketplace_reserve_listing_image(text,text,text,bigint),public.marketplace_commit_listing_image(text,bigint,text,text),public.marketplace_set_listing_image_order(text,bigint,text[]),public.marketplace_discard_listing_image(text) from public,anon;
grant execute on function public.marketplace_reserve_listing_image(text,text,text,bigint),public.marketplace_commit_listing_image(text,bigint,text,text),public.marketplace_set_listing_image_order(text,bigint,text[]),public.marketplace_discard_listing_image(text) to authenticated;
revoke all on public.marketplace_listing_templates from public, anon, authenticated;
grant select on public.marketplace_listing_templates to authenticated;
grant all on public.marketplace_listing_templates to service_role;
grant usage, select on sequence public.marketplace_listing_templates_id_seq to service_role;
revoke all on function public.marketplace_listing_template_document(public.marketplace_listing_templates) from public, anon, authenticated;
revoke all on function public.marketplace_save_listing_template(uuid,text,bigint,text,jsonb), public.marketplace_list_listing_templates(uuid), public.marketplace_delete_listing_template(uuid,text,bigint) from public,anon;
grant execute on function public.marketplace_save_listing_template(uuid,text,bigint,text,jsonb), public.marketplace_list_listing_templates(uuid), public.marketplace_delete_listing_template(uuid,text,bigint) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('marketplace-listing-media','marketplace-listing-media',false,52428800,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy "Eigene Inseratfotos hochladen" on storage.objects for insert to authenticated with check (
  bucket_id='marketplace-listing-media' and exists(select 1 from public.marketplace_listing_images i
  where i.storage_path=name and i.state='pending' and i.created_by=(select auth.uid()) and public.marketplace_can_manage(i.workspace_id))
);
create policy "Eigene Inseratfotos lesen" on storage.objects for select to authenticated using (
  bucket_id='marketplace-listing-media' and exists(select 1 from public.marketplace_listing_images i
  where i.storage_path=name and i.state in ('pending','ready','abandoned') and public.marketplace_can_manage(i.workspace_id))
);
create policy "Abgebrochene Inseratfotos bereinigen" on storage.objects for delete to authenticated using (
  bucket_id='marketplace-listing-media' and exists(select 1 from public.marketplace_listing_images i
  where i.storage_path=name and i.state='abandoned' and i.created_by=(select auth.uid()) and public.marketplace_can_manage(i.workspace_id))
);
