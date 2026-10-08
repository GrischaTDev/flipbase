-- Marken-/Labelredaktion, private Referenzbilder und quellengebundene Größentabellen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.archive_label_reference (
  p_reference_id     integer,
  p_expected_version integer,
  p_request_id       uuid
)
  returns jsonb
  language sql
  security definer
  set search_path to ''
  as $function$
 select public.label_change_reference_archive(p_reference_id,p_expected_version,true,p_request_id);
$function$;

revoke all on function public.archive_label_reference(integer, integer, uuid) from public;

grant all on function public.archive_label_reference(integer, integer, uuid) to authenticated;

create function public.archive_size_reference (
  p_id               integer,
  p_expected_version integer,
  p_archived         boolean,
  p_request_id       uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb := jsonb_build_object('id',p_id,'version',p_expected_version,'archived',p_archived);
    cached jsonb; reference public.size_references;
begin
    cached := public.label_begin_edit('archive-sizes',p_request_id,args);
    if cached is not null then return cached; end if;
    perform public.label_assert(p_archived is not null,'invalid-value','archived');
    select * into reference from public.size_references where id = p_id for update;
    if not found then raise exception 'Nicht verfügbar' using errcode = 'P0002'; end if;
    perform public.label_check_version(reference.version,p_expected_version);
    update public.size_references set archived = p_archived,version = version + 1 where id = p_id;
    return public.label_finish_edit('archive-sizes',p_request_id,args,jsonb_build_object('version',reference.version + 1));
end;
$function$;

revoke all on function public.archive_size_reference(integer, integer, boolean, uuid) from public;

grant all on function public.archive_size_reference(integer, integer, boolean, uuid) to authenticated;

create function public.can_read_label_image (
  p_path text
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
    select (select auth.uid()) is not null and exists (
        select 1 from public.label_image_assets a
        join public.label_image_permissions p on p.label_image_asset_id = a.id
        where a.detail_path = p_path and a.processing_status = 'processed'
        and (public.is_platform_operator() or (public.can_read_label_library() and p.status = 'approved'
            and exists(select 1 from public.label_revision_images i
                join public.label_references r on r.published_revision_id = i.label_revision_id
                where i.label_image_asset_id = a.id and public.label_reference_is_published(r.id))))
    );
$function$;

revoke all on function public.can_read_label_image(text) from public;

grant all on function public.can_read_label_image(text) to authenticated;

create function public.can_read_label_library()
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
    select (select auth.uid()) is not null and (
        public.is_platform_operator() or (
            exists (select 1 from public.label_library_settings where id = 1 and reader_enabled)
            and exists (
                select 1 from public.workspace_members as member
                where member.user_id = (select auth.uid())
                    and public.workspace_access_is_valid(member.workspace_id)
            )
        )
    );
$function$;

comment on function public.can_read_label_library() is 'Aktuelle Leserberechtigung. Keine übergebene Nutzerkennung und keine user_metadata-Rolle.';

revoke all on function public.can_read_label_library() from public;

grant all on function public.can_read_label_library() to authenticated;

create function public.complete_label_image (
  p_asset_id       integer,
  p_actor_id       uuid,
  p_original_bytes integer,
  p_mime_type      text,
  p_width          integer,
  p_height         integer,
  p_attribution    text,
  p_allowed_use    text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare asset public.label_image_assets; image_path text := p_asset_id::text || '.png';
begin
    perform pg_advisory_xact_lock(70432001::bigint);
    perform public.label_assert(exists(select 1 from public.platform_operators where user_id = p_actor_id),
        'forbidden', 'actor');
    select * into asset from public.label_image_assets where id = p_asset_id for update;
    perform public.label_assert(asset.created_by = p_actor_id,
        'invalid-value', 'asset');
    if asset.processing_status = 'processed' then return jsonb_build_object('assetId',asset.id); end if;
    perform public.label_assert(asset.processing_status = 'pending','invalid-value','asset');
    perform public.label_assert(p_width between 1 and 1200 and p_height between 1 and 1200,
        'invalid-value', 'dimensions');
    perform public.label_assert(p_original_bytes between 1 and 10000000 and
        p_mime_type in ('image/jpeg','image/png','image/webp'), 'invalid-value', 'original');
    perform public.label_assert(public.label_has_text(p_attribution) and char_length(p_attribution) <= 4000
        and public.label_has_text(p_allowed_use) and char_length(p_allowed_use) <= 4000,
        'required-text', 'permission');
    perform public.label_assert(exists(select 1 from storage.objects where bucket_id = 'label-originals'
        and name = asset.original_path) and exists(select 1 from storage.objects where bucket_id = 'label-images'
        and name = image_path), 'image-not-processed', 'objects');
    update public.label_image_assets set processing_status = 'processed', original_bytes = p_original_bytes,
        mime_type = p_mime_type, width = p_width, height = p_height, gallery_path = image_path,
        detail_path = image_path where id = asset.id;
    insert into public.label_image_permissions(label_image_asset_id, status, attribution, allowed_use,
        reviewed_by, reviewed_at) values(asset.id, 'approved', p_attribution, p_allowed_use, p_actor_id, now());
    insert into public.label_change_events(actor_id, action, details)
    values(p_actor_id, 'complete-image', jsonb_build_object('assetId', asset.id));
    return jsonb_build_object('assetId', asset.id);
end;
$function$;

revoke all on function public.complete_label_image(integer, uuid, integer, text, integer, integer, text, text) from public;

grant all on function public.complete_label_image(integer, uuid, integer, text, integer, integer, text, text) to service_role;

create function public.create_label_draft (
  p_brand_id   integer,
  p_request_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb:=jsonb_build_object('brandId',p_brand_id); cached jsonb; ref_id integer; rev_id integer;
begin
 cached:=public.label_begin_edit('create',p_request_id,args); if cached is not null then return cached; end if;
 perform public.label_assert(exists(select 1 from public.label_brands where id=p_brand_id and not archived),'brand-unavailable','brandId');
 insert into public.label_references(label_brand_id) values(p_brand_id) returning id into ref_id;
 insert into public.label_revisions(label_reference_id,content,created_by) values(ref_id,public.label_empty_content(),(select auth.uid())) returning id into rev_id;
 return public.label_finish_edit('create',p_request_id,args,public.label_draft_result(rev_id),ref_id,rev_id);
end;
$function$;

revoke all on function public.create_label_draft(integer, uuid) from public;

grant all on function public.create_label_draft(integer, uuid) to authenticated;

create function public.discard_label_draft (
  p_revision_id      integer,
  p_expected_version integer,
  p_request_id       uuid
)
  returns jsonb
  language sql
  security definer
  set search_path to ''
  as $function$
 select public.label_change_revision('discard',p_revision_id,p_expected_version,null,p_request_id);
$function$;

revoke all on function public.discard_label_draft(integer, integer, uuid) from public;

grant all on function public.discard_label_draft(integer, integer, uuid) to authenticated;

create function public.edit_label_reference (
  p_reference_id integer,
  p_request_id   uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb:=jsonb_build_object('referenceId',p_reference_id); cached jsonb; ref public.label_references; rev_id integer;
begin
 cached:=public.label_begin_edit('edit',p_request_id,args); if cached is not null then return cached; end if;
 select * into ref from public.label_references where id=p_reference_id for update;
 if not found then raise exception 'Eintrag nicht verfügbar' using errcode='P0002'; end if;
 perform public.label_assert(not ref.archived and exists(select 1 from public.label_brands where id=ref.label_brand_id and not archived),'reference-archived','referenceId');
 rev_id:=public.label_make_editable(ref.id);
 return public.label_finish_edit('edit',p_request_id,args,public.label_draft_result(rev_id),ref.id,rev_id);
end;
$function$;

revoke all on function public.edit_label_reference(integer, uuid) from public;

grant all on function public.edit_label_reference(integer, uuid) to authenticated;

create function public.get_label_admin_reference (
  p_reference_id integer
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare result jsonb;
begin
    if (select auth.uid()) is null or public.is_platform_operator() is not true then
        raise exception 'Nur für Plattformbetreiber' using errcode = '42501';
    end if;
    perform public.label_assert(p_reference_id > 0, 'invalid-value', 'referenceId');
    select jsonb_build_object(
        'referenceId', r.id, 'slug', r.slug, 'brandId', r.label_brand_id,
        'brandName', b.name, 'brandSlug', b.slug, 'brandArchived', b.archived,
        'version', r.version, 'archived', r.archived,
        'draft', public.label_draft_result(d.id),
        'publication', public.label_draft_result(r.published_revision_id)
    ) into result
    from public.label_references as r
    join public.label_brands as b on b.id = r.label_brand_id
    left join public.label_revisions as d on d.label_reference_id = r.id
        and d.state in ('draft', 'review')
    where r.id = p_reference_id;
    -- Nur die ausdrückliche Bearbeitungsaktion darf eine neue Revision anlegen.
    return coalesce(result, 'null'::jsonb);
end;
$function$;

comment on function public.get_label_admin_reference(integer) is 'Lädt Entwurf und aktuelle Veröffentlichung getrennt, ohne eine Bearbeitung anzulegen.';

revoke all on function public.get_label_admin_reference(integer) from public;

grant all on function public.get_label_admin_reference(integer) to authenticated;

create function public.get_label_library_availability()
  returns jsonb
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
    select jsonb_build_object(
        'visible', public.can_read_label_library(),
        'operator', (select auth.uid()) is not null and public.is_platform_operator()
    );
$function$;

revoke all on function public.get_label_library_availability() from public;

grant all on function public.get_label_library_availability() to authenticated;

create function public.get_label_reference (
  p_brand_slug text,
  p_label_slug text
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare ref_id integer; rev_id integer; reader_content jsonb; reader_images jsonb;
begin
 if not public.can_read_label_library() then
  raise exception 'Labelbibliothek nicht verfügbar' using errcode='42501';
 end if;
 perform public.label_assert_text(to_jsonb(p_brand_slug),80,'brandSlug');
 perform public.label_assert_text(to_jsonb(p_label_slug),80,'labelSlug');
 select r.id,v.id,v.content into ref_id,rev_id,reader_content
 from public.label_references as r
 join public.label_brands as b on b.id=r.label_brand_id
 join public.label_revisions as v on v.id=r.published_revision_id
 where b.slug=p_brand_slug and r.slug=p_label_slug and public.label_reference_is_published(r.id);
 if not found then return null; end if;
 -- Alte Texte bleiben unveränderlich. Zurückgezogene Verweise werden beim Lesen ausgeblendet.
 reader_content:=jsonb_set(reader_content,'{relatedReferenceIds}',coalesce((
  select jsonb_agg(link.value order by link.ordinality)
  from jsonb_array_elements(reader_content->'relatedReferenceIds') with ordinality as link(value,ordinality)
  where public.label_reference_is_published((link.value#>>'{}')::numeric::integer)),'[]'::jsonb));
 select jsonb_agg(jsonb_build_object('assetId',i.label_image_asset_id,'position',i.position,
  'caption',i.caption,'alt',i.alt,'referenceItem',i.reference_item,'attribution',p.attribution) order by i.position)
 into reader_images from public.label_revision_images as i
 join public.label_image_permissions as p on p.label_image_asset_id=i.label_image_asset_id
 where i.label_revision_id=rev_id;
 return public.label_reader_card(ref_id)||jsonb_build_object('content',reader_content,'images',reader_images);
end;
$function$;

revoke all on function public.get_label_reference(text, text) from public;

grant all on function public.get_label_reference(text, text) to authenticated;

create function public.label_assert_array (
  p_value  jsonb,
  p_max    integer,
  p_path   text,
  p_unique boolean default false
)
  returns void
  language plpgsql
  immutable
  set search_path to ''
  as $function$
begin
  perform public.label_assert(jsonb_typeof(p_value)='array','invalid-array',p_path);
  perform public.label_assert(jsonb_array_length(p_value)<=p_max,'too-many-items',p_path);
  if p_unique then
    perform public.label_assert((select count(*)=count(distinct value) from jsonb_array_elements(p_value)),'duplicate-value',p_path);
  end if;
end;
$function$;

revoke all on function public.label_assert_array(jsonb, integer, text, boolean) from public;

create function public.label_assert_date (
  p_value jsonb,
  p_path  text
)
  returns void
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare v text; d date;
begin
  if p_value='null'::jsonb then return; end if;
  perform public.label_assert(jsonb_typeof(p_value)='string','invalid-date',p_path);
  v:=p_value#>>'{}';
  perform public.label_assert(v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$','invalid-date',p_path);
  begin
    d:=make_date(substring(v,1,4)::integer,substring(v,6,2)::integer,substring(v,9,2)::integer);
    perform public.label_assert(substring(v,1,4)::integer>=1,'invalid-date',p_path);
  exception when datetime_field_overflow or invalid_datetime_format then
    perform public.label_assert(false,'invalid-date',p_path);
  end;
end;
$function$;

revoke all on function public.label_assert_date(jsonb, text) from public;

create function public.label_assert_integer (
  p_value    jsonb,
  p_min      integer,
  p_max      integer,
  p_path     text,
  p_nullable boolean default false
)
  returns void
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare n numeric;
begin
  if p_nullable and p_value='null'::jsonb then return; end if;
  perform public.label_assert(jsonb_typeof(p_value)='number','invalid-value',p_path);
  n:=(p_value#>>'{}')::numeric;
  perform public.label_assert(n=trunc(n) and n between p_min and p_max,'invalid-value',p_path);
end;
$function$;

revoke all on function public.label_assert_integer(jsonb, integer, integer, text, boolean) from public;

create function public.label_assert_object (
  p_value jsonb,
  p_keys  text[],
  p_path  text
)
  returns void
  language plpgsql
  immutable
  set search_path to ''
  as $function$
begin
  perform public.label_assert(jsonb_typeof(p_value)='object','invalid-object',p_path);
  perform public.label_assert(p_value ?& p_keys,'missing-field',p_path);
  perform public.label_assert((select count(*)=cardinality(p_keys) from jsonb_object_keys(p_value)), 'unknown-field',p_path);
end;
$function$;

revoke all on function public.label_assert_object(jsonb, text[], text) from public;

create function public.label_assert_source_url (
  p_value jsonb,
  p_path  text
)
  returns void
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare v text; authority text; host text; port text; code integer;
begin
  perform public.label_assert_text(p_value,2048,p_path);
  v:=p_value#>>'{}';
  if v='' then return; end if; -- Unvollständiger Entwurf, kein veröffentlichbarer Beleg.
  perform public.label_assert(v ~* '^https://' and v !~ '[[:cntrl:]]' and public.label_strip_whitespace(v)=v and position(chr(92) in v)=0,'invalid-url',p_path);
  for code in 127..159 loop
    perform public.label_assert(position(chr(code) in v)=0,'invalid-url',p_path);
  end loop;
  authority:=substring(v from '^.{8}([^/?#]+)');
  perform public.label_assert(authority is not null and authority<>'' and position('@' in authority)=0,'invalid-url',p_path);
  -- IPv6 ist nur in Klammern zulässig; Inet-Cast prüft das tatsächliche Adressformat.
  if left(authority,1)='[' then
    host:=substring(authority from '^\[([^]]+)\]');
    perform public.label_assert(host is not null and authority ~ '^\[[^]]+\](:[0-9]+)?$','invalid-url',p_path);
    begin
      perform public.label_assert(family(host::inet)=6,'invalid-url',p_path);
    exception when invalid_text_representation then
      perform public.label_assert(false,'invalid-url',p_path);
    end;
    port:=substring(authority from '\]:([0-9]+)$');
  else
    perform public.label_assert(authority !~ '[\[\]]' and authority ~ '^[^:]+(:[0-9]+)?$','invalid-url',p_path);
    host:=split_part(authority,':',1);
    perform public.label_assert(host<>'' and host !~ '[%<>"{}|^`]' ,'invalid-url',p_path);
    port:=substring(authority from ':([0-9]+)$');
  end if;
  if port is not null then
    perform public.label_assert(char_length(port)<=5,'invalid-url',p_path);
    perform public.label_assert(port::integer between 0 and 65535,'invalid-url',p_path);
  end if;
end;
$function$;

revoke all on function public.label_assert_source_url(jsonb, text) from public;

create function public.label_assert_text (
  p_value jsonb,
  p_max   integer,
  p_path  text
)
  returns void
  language plpgsql
  immutable
  set search_path to ''
  as $function$
begin
  perform public.label_assert(jsonb_typeof(p_value)='string','invalid-text',p_path);
  perform public.label_assert(char_length(p_value#>>'{}')<=p_max,'text-too-long',p_path);
end;
$function$;

revoke all on function public.label_assert_text(jsonb, integer, text) from public;

create function public.label_assert (
  p_ok   boolean,
  p_code text,
  p_path text
)
  returns void
  language plpgsql
  immutable
  set search_path to ''
  as $function$
begin
  if p_ok is distinct from true then
    raise exception 'Ungültige Labelangaben' using errcode='22023',
      detail=jsonb_build_object('code',p_code,'path',p_path)::text;
  end if;
end;
$function$;

revoke all on function public.label_assert(boolean, text, text) from public;

create function public.label_begin_edit (
  p_action     text,
  p_request_id uuid,
  p_input      jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare cached public.label_edit_requests; input_hash text;
begin
  if (select auth.uid()) is null or not public.is_platform_operator() then
    raise exception 'Nur für Plattformbetreiber' using errcode='42501';
  end if;
  perform public.label_assert(p_request_id is not null and p_input is not null,'invalid-value','request');
  perform public.label_assert(octet_length(p_input::text)<=524288,'payload-too-large','request');
  perform pg_advisory_xact_lock(70432001::bigint);
  -- Nach Wartezeit nicht mit einer inzwischen entzogenen Rolle weiterarbeiten.
  if not public.is_platform_operator() then raise exception 'Nur für Plattformbetreiber' using errcode='42501'; end if;
  input_hash:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  select * into cached from public.label_edit_requests as r
    where r.actor_id=(select auth.uid()) and r.request_id=p_request_id;
  if found then
    perform public.label_assert(cached.action=p_action and cached.input_hash=input_hash,'request-reused','requestId');
    return cached.result;
  end if;
  return null;
end;
$function$;

revoke all on function public.label_begin_edit(text, uuid, jsonb) from public;

create function public.label_change_reference_archive (
  p_reference_id     integer,
  p_expected_version integer,
  p_archived         boolean,
  p_request_id       uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare args jsonb:=jsonb_build_object('referenceId',p_reference_id,'version',p_expected_version,'archived',p_archived);
 action text:=case when p_archived then 'archive' else 'restore' end; cached jsonb; ref public.label_references; rev_id integer;
begin
 cached:=public.label_begin_edit(action,p_request_id,args); if cached is not null then return cached; end if;
 select * into ref from public.label_references where id=p_reference_id for update;
 if not found then raise exception 'Eintrag nicht verfügbar' using errcode='P0002'; end if;
 perform public.label_check_version(ref.version,p_expected_version);
 perform public.label_assert(ref.archived is distinct from p_archived,'invalid-value','archived');
 if not p_archived then
   perform public.label_assert(exists(select 1 from public.label_brands where id=ref.label_brand_id and not archived),'brand-unavailable','brand');
 end if;
 update public.label_references set archived=p_archived,published_revision_id=null,version=version+1 where id=ref.id;
 if not p_archived then
   rev_id:=public.label_make_editable(ref.id);
   update public.label_revisions set state='draft',version=version+1 where id=rev_id and state='review';
 end if;
 update public.label_library_settings set catalog_version=catalog_version+1 where id=1;
 return public.label_finish_edit(action,p_request_id,args,jsonb_build_object('referenceId',ref.id,'version',ref.version+1,'archived',p_archived),ref.id,rev_id);
end;
$function$;

revoke all on function public.label_change_reference_archive(integer, integer, boolean, uuid) from public;

create function public.label_change_revision (
  p_action           text,
  p_revision_id      integer,
  p_expected_version integer,
  p_input            jsonb,
  p_request_id       uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare args jsonb:=jsonb_build_object('revisionId',p_revision_id,'version',p_expected_version,'input',p_input);
 cached jsonb; rev public.label_revisions; ref public.label_references; checked jsonb; snapshot jsonb; result jsonb; item record;
begin
 cached:=public.label_begin_edit(p_action,p_request_id,args); if cached is not null then return cached; end if;
 select * into rev from public.label_revisions where id=p_revision_id for update;
 if not found then raise exception 'Eintrag nicht verfügbar' using errcode='P0002'; end if;
 select * into ref from public.label_references where id=rev.label_reference_id for update;
 perform public.label_check_version(rev.version,p_expected_version);
 perform public.label_assert(rev.state in ('draft','review'),'invalid-revision-transition','state');
 if p_action<>'discard' then
   perform public.label_assert(not ref.archived and exists(select 1 from public.label_brands where id=ref.label_brand_id and not archived),'reference-archived','referenceId');
 end if;
 if p_action='save' then
   checked:=public.label_validate_draft(p_input);
   if checked#>'{content,brandLineId}'<>'null'::jsonb then
     perform public.label_assert(exists(select 1 from public.label_brand_lines where id=(checked#>>'{content,brandLineId}')::numeric::integer
       and label_brand_id=ref.label_brand_id and not archived),'brand-line-unavailable','content.brandLineId');
   end if;
   for item in select value from jsonb_array_elements(checked->'images') loop
     perform public.label_assert(exists(select 1 from public.label_image_assets where id=(item.value->>'assetId')::numeric::integer
       and asset_kind='reference-image' and processing_status='processed'),'image-not-processed','images');
   end loop;
   -- Nur Entwurfszuordnungen ersetzen; verarbeitete Dateien bleiben unverändert.
   delete from public.label_revision_images where label_revision_id=rev.id;
   insert into public.label_revision_images(label_revision_id,label_image_asset_id,position,caption,alt,reference_item)
   select rev.id,(value->>'assetId')::numeric::integer,(value->>'position')::numeric::integer,value->>'caption',value->>'alt',value->>'referenceItem'
     from jsonb_array_elements(checked->'images');
   update public.label_revisions set content=checked->'content',state='draft',version=version+1 where id=rev.id;
   result:=public.label_draft_result(rev.id);
 elsif p_action='submit' then
   snapshot:=public.label_publication_content(rev.id);
   update public.label_revisions set state='review',version=version+1 where id=rev.id;
   result:=public.label_draft_result(rev.id);
 elsif p_action='publish' then
   perform public.label_assert(rev.state='review','review-required','state');
   snapshot:=public.label_publication_content(rev.id);
   update public.label_revisions set content=snapshot,state='published',published_at=now(),version=version+1 where id=rev.id;
   update public.label_references set published_revision_id=rev.id,version=version+1 where id=ref.id;
   update public.label_library_settings set catalog_version=catalog_version+1 where id=1;
   result:=jsonb_build_object('referenceId',ref.id,'revisionId',rev.id,'version',rev.version+1);
 elsif p_action='discard' then
   update public.label_revisions set state='discarded',version=version+1 where id=rev.id;
   result:=jsonb_build_object('referenceId',ref.id,'revisionId',rev.id,'version',rev.version+1,'state','discarded');
 else
   perform public.label_assert(false,'invalid-value','action');
 end if;
 return public.label_finish_edit(p_action,p_request_id,args,result,ref.id,rev.id);
end;
$function$;

revoke all on function public.label_change_revision(text, integer, integer, jsonb, uuid) from public;

create function public.label_check_version (
  p_actual   integer,
  p_expected integer
)
  returns void
  language plpgsql
  immutable
  set search_path to ''
  as $function$
begin
  perform public.label_assert(p_expected between 1 and 2147483646,'invalid-value','expectedVersion');
  if p_actual is distinct from p_expected then
    raise exception 'Der Eintrag wurde inzwischen geändert' using errcode='P0001',detail='label_version_conflict';
  end if;
end;
$function$;

revoke all on function public.label_check_version(integer, integer) from public;

create function public.label_draft_result (
  p_revision_id integer
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
 select jsonb_build_object('referenceId',r.label_reference_id,'revisionId',r.id,'version',r.version,'state',r.state,
  'input',jsonb_build_object('content',r.content,'images',coalesce((
   select jsonb_agg(jsonb_build_object('assetId',i.label_image_asset_id,'position',i.position,
    'caption',i.caption,'alt',i.alt,'referenceItem',i.reference_item) order by i.position)
   from public.label_revision_images as i where i.label_revision_id=r.id),'[]'::jsonb)))
 from public.label_revisions as r where r.id=p_revision_id;
$function$;

revoke all on function public.label_draft_result(integer) from public;

create function public.label_empty_content()
  returns jsonb
  language sql
  immutable
  set search_path to ''
  as $function$
 select '{"title":"","aliases":[],"brandLineId":null,"brandName":"","brandLineName":null,"kinds":[],"timeSummary":"","evidenceLevel":"undated","intervals":[],"features":[],"checkHints":[],"limitations":[],"relatedReferenceIds":[],"sources":[],"reviewedAt":null}'::jsonb;
$function$;

revoke all on function public.label_empty_content() from public;

create function public.label_finish_edit (
  p_action       text,
  p_request_id   uuid,
  p_input        jsonb,
  p_result       jsonb,
  p_reference_id integer default null::integer,
  p_revision_id  integer default null::integer
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
begin
  insert into public.label_edit_requests(actor_id,request_id,action,input_hash,result)
    values((select auth.uid()),p_request_id,p_action,encode(sha256(convert_to(p_input::text,'UTF8')),'hex'),p_result);
  insert into public.label_change_events(label_reference_id,label_revision_id,actor_id,action,details)
    values(p_reference_id,p_revision_id,(select auth.uid()),p_action,
      jsonb_build_object('requestId',p_request_id,'resultVersion',p_result->'version'));
  return p_result;
end;
$function$;

revoke all on function public.label_finish_edit(text, uuid, jsonb, jsonb, integer, integer) from public;

create function public.label_has_text (
  p_text text
)
  returns boolean
  language sql
  immutable
  set search_path to ''
  as $function$
 select coalesce(public.label_strip_whitespace(p_text)<>'',false);
$function$;

revoke all on function public.label_has_text(text) from public;

create function public.label_json_byte_size (
  p_value jsonb
)
  returns bigint
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare total bigint; item record; kind text:=jsonb_typeof(p_value);
begin
  -- jsonb::text enthält zusätzliche Leerzeichen. Nicht als JSON.stringify-Größe ausgeben.
  if kind='object' then
    total:=2;
    for item in select key,value from jsonb_each(p_value) loop
      total:=total+octet_length(to_jsonb(item.key)::text)+1+public.label_json_byte_size(item.value)+1;
    end loop;
    if p_value<>'{}'::jsonb then total:=total-1; end if;
    return total;
  elsif kind='array' then
    select coalesce(sum(public.label_json_byte_size(value)),0)+2+greatest(count(*)-1,0)
      into total from jsonb_array_elements(p_value);
    return total;
  elsif kind='number' then
    return octet_length(trim_scale((p_value#>>'{}')::numeric)::text);
  end if;
  return octet_length(p_value::text);
end;
$function$;

revoke all on function public.label_json_byte_size(jsonb) from public;

create function public.label_library_has_publication()
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
 select exists(select 1 from public.label_references r where public.label_reference_is_published(r.id))
 or exists(select 1 from public.size_references s left join public.label_brands b on b.id=s.label_brand_id
   where s.published_content is not null and not s.archived and coalesce(b.archived,false)=false);
$function$;

revoke all on function public.label_library_has_publication() from public;

create function public.label_make_editable (
  p_reference_id integer
)
  returns integer
  language plpgsql
  set search_path to ''
  as $function$
declare current_revision public.label_revisions; source_revision public.label_revisions; new_id integer;
begin
 select * into current_revision from public.label_revisions where label_reference_id=p_reference_id and state in ('draft','review') for update;
 if found then return current_revision.id; end if;
 -- Nach Archivierung gibt es keinen Live-Zeiger. Historie bleibt als Vorlage erhalten.
 select * into source_revision from public.label_revisions where label_reference_id=p_reference_id and state='published' order by id desc limit 1;
 insert into public.label_revisions(label_reference_id,content,created_by)
 values(p_reference_id,coalesce(source_revision.content,public.label_empty_content()),(select auth.uid())) returning id into new_id;
 if source_revision.id is not null then
   insert into public.label_revision_images(label_revision_id,label_image_asset_id,position,caption,alt,reference_item)
   select new_id,label_image_asset_id,position,caption,alt,reference_item from public.label_revision_images where label_revision_id=source_revision.id;
 end if;
 return new_id;
end;
$function$;

revoke all on function public.label_make_editable(integer) from public;

create function public.label_publication_content (
  p_revision_id integer
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare rev public.label_revisions; ref public.label_references; brand public.label_brands;
 line public.label_brand_lines; v_content jsonb; item record; dated boolean; draft jsonb;
begin
 select * into rev from public.label_revisions where id=p_revision_id;
 if not found then raise exception 'Eintrag nicht verfügbar' using errcode='P0002'; end if;
 select * into ref from public.label_references where id=rev.label_reference_id;
 select * into brand from public.label_brands where id=ref.label_brand_id;
 perform public.label_assert(not ref.archived and brand.id is not null and not brand.archived,'brand-unavailable','brand');
 v_content:=public.label_validate_content(rev.content);
 if v_content->'brandLineId'<>'null'::jsonb then
   select * into line from public.label_brand_lines where id=(v_content->>'brandLineId')::numeric::integer;
   perform public.label_assert(line.id is not null and line.label_brand_id=brand.id and not line.archived,'brand-line-unavailable','content.brandLineId');
 end if;
 v_content:=v_content || jsonb_build_object('brandName',brand.name,'brandLineName',line.name);
 draft:=public.label_draft_result(rev.id)->'input';
 draft:=jsonb_set(draft,'{content}',v_content);
 perform public.label_validate_draft(draft);
 perform public.label_assert(public.label_has_text(v_content->>'title'),'required-text','content.title');
 perform public.label_assert(public.label_has_text(v_content->>'timeSummary'),'required-text','content.timeSummary');
 perform public.label_assert(jsonb_array_length(v_content->'kinds')>0,'kind-required','content.kinds');
 perform public.label_assert(jsonb_array_length(v_content->'features')>0,'feature-required','content.features');
 perform public.label_assert(v_content->'reviewedAt'<>'null'::jsonb,'review-date-required','content.reviewedAt');
 perform public.label_assert((v_content->>'reviewedAt')::date<=current_date,'future-date','content.reviewedAt');
 for item in select value from jsonb_array_elements((v_content->'features')||(v_content->'limitations')) loop
   perform public.label_assert(public.label_has_text(item.value#>>'{}'),'required-text','content.features/limitations');
 end loop;
 select exists(select 1 from jsonb_array_elements(v_content->'intervals') as t(value)
   where value->'startYear'<>'null'::jsonb or value->'endYear'<>'null'::jsonb) into dated;
 perform public.label_assert((v_content->>'evidenceLevel'='undated')=(not dated),'dating-evidence-mismatch','content.evidenceLevel');
 if not dated then
   perform public.label_assert(jsonb_array_length(v_content->'limitations')>0,'dating-explanation-required','content.limitations');
 end if;
 for item in select value,ordinality-1 as i from jsonb_array_elements(v_content->'intervals') with ordinality loop
   if item.value->'startYear'<>'null'::jsonb or item.value->'endYear'<>'null'::jsonb then
     perform public.label_assert(jsonb_array_length(item.value->'sourceIds')>0,'interval-source-required','content.intervals['||item.i||'].sourceIds');
   end if;
 end loop;
 for item in select value,ordinality-1 as i from jsonb_array_elements(v_content->'checkHints') with ordinality loop
   perform public.label_assert(public.label_has_text(item.value->>'text'),'required-text','content.checkHints['||item.i||'].text');
   perform public.label_assert(jsonb_array_length(item.value->'sourceIds')>0,'hint-source-required','content.checkHints['||item.i||'].sourceIds');
 end loop;
 for item in select value,ordinality-1 as i from jsonb_array_elements(v_content->'sources') with ordinality loop
   perform public.label_assert(public.label_has_text(item.value->>'title') and item.value->>'url'<>'' and public.label_has_text(item.value->>'locator')
     and item.value->'accessedAt'<>'null'::jsonb,'source-incomplete','content.sources['||item.i||']');
   perform public.label_assert((item.value->>'accessedAt')::date<=current_date,'future-date','content.sources['||item.i||'].accessedAt');
 end loop;
 perform public.label_assert(jsonb_array_length(draft->'images')>0,'image-required','images');
 for item in select i.*,a.processing_status,p.status as permission_status
  from public.label_revision_images as i left join public.label_image_assets as a on a.id=i.label_image_asset_id
  left join public.label_image_permissions as p on p.label_image_asset_id=i.label_image_asset_id where i.label_revision_id=rev.id order by i.position loop
   perform public.label_assert(item.processing_status='processed','image-not-processed','images['||item.position||']');
   perform public.label_assert(item.permission_status='approved','image-not-approved','images['||item.position||']');
   perform public.label_assert(public.label_has_text(item.caption) and public.label_has_text(item.alt) and public.label_has_text(item.reference_item),'required-text','images['||item.position||']');
 end loop;
 for item in select value from jsonb_array_elements(v_content->'relatedReferenceIds') loop
   perform public.label_assert((item.value#>>'{}')::numeric::integer<>ref.id and public.label_reference_is_published((item.value#>>'{}')::numeric::integer),
    'related-reference-unavailable','content.relatedReferenceIds');
 end loop;
 return v_content;
end;
$function$;

revoke all on function public.label_publication_content(integer) from public;

create function public.label_reader_card (
  p_reference_id integer
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
 select jsonb_build_object('referenceId',r.id,'revisionId',v.id,'brandSlug',b.slug,'labelSlug',r.slug,
  'title',v.content->>'title','timeSummary',v.content->>'timeSummary','shortFeature',v.content#>>'{features,0}',
  'coverAssetId',(select i.label_image_asset_id from public.label_revision_images as i
   where i.label_revision_id=v.id order by i.position limit 1))
 from public.label_references as r
 join public.label_revisions as v on v.id=r.published_revision_id
 join public.label_brands as b on b.id=r.label_brand_id
 where r.id=p_reference_id;
$function$;

revoke all on function public.label_reader_card(integer) from public;

create function public.label_reference_is_published (
  p_reference_id integer
)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
 select exists(select 1 from public.label_references as r
  join public.label_brands as b on b.id=r.label_brand_id
  join public.label_revisions as v on v.id=r.published_revision_id and v.state='published'
  where r.id=p_reference_id and not r.archived and not b.archived
   and exists(select 1 from public.label_revision_images as i where i.label_revision_id=v.id)
   and not exists(select 1 from public.label_revision_images as i
    left join public.label_image_assets as a on a.id=i.label_image_asset_id
    left join public.label_image_permissions as p on p.label_image_asset_id=a.id
    where i.label_revision_id=v.id and (a.processing_status is distinct from 'processed' or p.status is distinct from 'approved')));
$function$;

revoke all on function public.label_reference_is_published(integer) from public;

create function public.label_strip_whitespace (
  p_text text
)
  returns text
  language sql
  immutable
  set search_path to ''
  as $function$
 select translate(p_text,' '||chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(5760)||
  chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||
  chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279),'');
$function$;

revoke all on function public.label_strip_whitespace(text) from public;

create function public.label_validate_content (
  p_content jsonb
)
  returns jsonb
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare k text; item record; sub record; v jsonb; ids jsonb:='[]'; path text; start_year numeric; end_year numeric;
begin
  perform public.label_assert_object(p_content,array['title','aliases','brandLineId','brandName','brandLineName','kinds',
    'timeSummary','evidenceLevel','intervals','features','checkHints','limitations','relatedReferenceIds','sources','reviewedAt'],'content');
  perform public.label_assert_text(p_content->'title',160,'content.title');
  perform public.label_assert_text(p_content->'brandName',160,'content.brandName');
  if p_content->'brandLineName'<>'null'::jsonb then perform public.label_assert_text(p_content->'brandLineName',160,'content.brandLineName'); end if;
  perform public.label_assert_integer(p_content->'brandLineId',1,2147483647,'content.brandLineId',true);
  perform public.label_assert_text(p_content->'timeSummary',4000,'content.timeSummary');
  perform public.label_assert(p_content->>'evidenceLevel' in ('well-supported','partially-supported','undated'),'invalid-value','content.evidenceLevel');
  perform public.label_assert_date(p_content->'reviewedAt','content.reviewedAt');
  foreach k in array array['aliases','features','limitations'] loop
    perform public.label_assert_array(p_content->k,case when k='aliases' then 20 else 50 end,'content.'||k);
    for item in select value,ordinality-1 as i from jsonb_array_elements(p_content->k) with ordinality loop
      perform public.label_assert_text(item.value,case when k='aliases' then 80 else 4000 end,'content.'||k||'['||item.i||']');
    end loop;
  end loop;
  perform public.label_assert_array(p_content->'kinds',2,'content.kinds',true);
  for item in select value from jsonb_array_elements(p_content->'kinds') loop
    perform public.label_assert(item.value in ('"neck-label"'::jsonb,'"care-size-label"'::jsonb),'invalid-value','content.kinds');
  end loop;
  perform public.label_assert_array(p_content->'relatedReferenceIds',50,'content.relatedReferenceIds',true);
  for item in select value from jsonb_array_elements(p_content->'relatedReferenceIds') loop
    perform public.label_assert_integer(item.value,1,2147483647,'content.relatedReferenceIds');
  end loop;
  perform public.label_assert_array(p_content->'sources',100,'content.sources');
  for item in select value,ordinality-1 as i from jsonb_array_elements(p_content->'sources') with ordinality loop
    path:='content.sources['||item.i||']'; v:=item.value;
    perform public.label_assert_object(v,array['id','title','publisher','url','accessedAt','locator'],path);
    perform public.label_assert_text(v->'id',80,path||'.id');
    perform public.label_assert(public.label_has_text(v->>'id'),'invalid-source-id',path||'.id');
    perform public.label_assert(not (ids @> jsonb_build_array(v->'id')),'duplicate-source',path||'.id');
    ids:=ids||jsonb_build_array(v->'id');
    perform public.label_assert_text(v->'title',160,path||'.title');
    perform public.label_assert_text(v->'publisher',160,path||'.publisher');
    perform public.label_assert_source_url(v->'url',path||'.url');
    perform public.label_assert_text(v->'locator',4000,path||'.locator');
    perform public.label_assert_date(v->'accessedAt',path||'.accessedAt');
  end loop;
  foreach k in array array['intervals','checkHints'] loop
    perform public.label_assert_array(p_content->k,case when k='intervals' then 30 else 50 end,'content.'||k);
    for item in select value,ordinality-1 as i from jsonb_array_elements(p_content->k) with ordinality loop
      path:='content.'||k||'['||item.i||']'; v:=item.value;
      if k='intervals' then
        perform public.label_assert_object(v,array['startYear','endYear','sourceIds'],path);
        perform public.label_assert_integer(v->'startYear',1,9999,path||'.startYear',true);
        perform public.label_assert_integer(v->'endYear',1,9999,path||'.endYear',true);
        start_year:=(v->>'startYear')::numeric; end_year:=(v->>'endYear')::numeric;
        perform public.label_assert(start_year is null or end_year is null or start_year<=end_year,'invalid-interval',path);
      else
        perform public.label_assert_object(v,array['text','sourceIds'],path);
        perform public.label_assert_text(v->'text',4000,path||'.text');
      end if;
      perform public.label_assert_array(v->'sourceIds',100,path||'.sourceIds',true);
      for sub in select value from jsonb_array_elements(v->'sourceIds') loop
        perform public.label_assert_text(sub.value,80,path||'.sourceIds');
        perform public.label_assert(ids @> jsonb_build_array(sub.value),'unknown-source',path||'.sourceIds');
      end loop;
    end loop;
  end loop;
  perform public.label_assert(public.label_json_byte_size(p_content)<=262144,'payload-too-large','content');
  return p_content;
end;
$function$;

revoke all on function public.label_validate_content(jsonb) from public;

create function public.label_validate_draft (
  p_input jsonb
)
  returns jsonb
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare item record; seen jsonb:='[]'; path text;
begin
  perform public.label_assert_object(p_input,array['content','images'],'draft');
  perform public.label_validate_content(p_input->'content');
  perform public.label_assert_array(p_input->'images',24,'images');
  for item in select value,ordinality-1 as i from jsonb_array_elements(p_input->'images') with ordinality loop
    path:='images['||item.i||']';
    perform public.label_assert_object(item.value,array['assetId','position','caption','alt','referenceItem'],path);
    perform public.label_assert_integer(item.value->'assetId',1,2147483647,path||'.assetId');
    perform public.label_assert_integer(item.value->'position',0,23,path||'.position');
    perform public.label_assert((item.value->>'position')::numeric=item.i,'invalid-image-order',path||'.position');
    perform public.label_assert(not(seen @> jsonb_build_array(item.value->'assetId')),'duplicate-image',path);
    seen:=seen||jsonb_build_array(item.value->'assetId');
    perform public.label_assert_text(item.value->'caption',4000,path||'.caption');
    perform public.label_assert_text(item.value->'alt',4000,path||'.alt');
    perform public.label_assert_text(item.value->'referenceItem',160,path||'.referenceItem');
  end loop;
  perform public.label_assert(public.label_json_byte_size(p_input)<=262144,'payload-too-large','draft');
  return p_input;
end;
$function$;

revoke all on function public.label_validate_draft(jsonb) from public;

create function public.label_validate_read_filter (
  p_filter jsonb
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare query_text text; brand text; kind text; decade integer;
begin
 perform public.label_assert_object(p_filter,array['brandSlug','query','decade','kind'],'filter');
 perform public.label_assert_text(p_filter->'query',120,'filter.query');
 query_text:=normalize(p_filter->>'query');
 query_text:=btrim(query_text,' '||chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(5760)||
 chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||
 chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
 if p_filter->'brandSlug'<>'null'::jsonb then
  perform public.label_assert_text(p_filter->'brandSlug',80,'filter.brandSlug');
  brand:=p_filter->>'brandSlug';
  perform public.label_assert(brand ~ '^[a-z0-9]+(-[a-z0-9]+)*$','invalid-value','filter.brandSlug');
 end if;
 if p_filter->'kind'<>'null'::jsonb then
  perform public.label_assert_text(p_filter->'kind',30,'filter.kind');
  kind:=p_filter->>'kind';
  perform public.label_assert(kind in ('neck-label','care-size-label'),'invalid-value','filter.kind');
 end if;
 if p_filter->'decade' not in ('null'::jsonb,'"unknown"'::jsonb) then
  perform public.label_assert_integer(p_filter->'decade',1900,(extract(year from current_date)::integer/10)*10,'filter.decade');
  decade:=(p_filter->>'decade')::numeric::integer;
  perform public.label_assert(decade%10=0,'invalid-value','filter.decade');
 end if;
 return jsonb_build_object('brandSlug',brand,'query',query_text,'decade',p_filter->'decade','kind',kind);
end;
$function$;

revoke all on function public.label_validate_read_filter(jsonb) from public;

create function public.list_label_admin_brands()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare result jsonb;
begin
    if (select auth.uid()) is null or public.is_platform_operator() is not true then
        raise exception 'Nur für Plattformbetreiber' using errcode = '42501';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'aliases', b.aliases,
        'version', b.version, 'archived', b.archived,
        'lines', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', l.id, 'brandId', l.label_brand_id, 'name', l.name,
                'version', l.version, 'archived', l.archived
            ) order by lower(l.name) collate "C", l.id)
            from public.label_brand_lines as l where l.label_brand_id = b.id
        ), '[]'::jsonb)
    ) order by lower(b.name) collate "C", b.id), '[]'::jsonb)
    into result from public.label_brands as b;
    return result;
end;
$function$;

comment on function public.list_label_admin_brands() is 'Betreiberansicht der Referenzmarken und Linien einschließlich Archivstatus.';

revoke all on function public.list_label_admin_brands() from public;

grant all on function public.list_label_admin_brands() to authenticated;

create function public.list_label_admin_images()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare result jsonb;
begin
    if (select auth.uid()) is null or public.is_platform_operator() is not true then
        raise exception 'Nur für Plattformbetreiber' using errcode = '42501';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('assetId', a.id, 'attribution', p.attribution,
        'allowedUse', p.allowed_use, 'status', p.status, 'version', p.version) order by a.id desc), '[]')
    into result from public.label_image_assets a join public.label_image_permissions p on p.label_image_asset_id = a.id
    where a.processing_status = 'processed';
    return result;
end;
$function$;

revoke all on function public.list_label_admin_images() from public;

grant all on function public.list_label_admin_images() to authenticated;

create function public.list_label_admin_references (
  p_filter jsonb,
  p_offset integer default 0
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare result jsonb; brand_id integer; requested_state text; search_text text;
begin
    if (select auth.uid()) is null or public.is_platform_operator() is not true then
        raise exception 'Nur für Plattformbetreiber' using errcode = '42501';
    end if;
    perform public.label_assert_object(p_filter, array['brandId', 'state', 'search'], 'filter');
    perform public.label_assert_integer(p_filter->'brandId', 1, 2147483647, 'filter.brandId', true);
    perform public.label_assert_text(p_filter->'state', 16, 'filter.state');
    perform public.label_assert_text(p_filter->'search', 120, 'filter.search');
    requested_state := p_filter->>'state';
    perform public.label_assert(requested_state in
        ('all', 'draft', 'review', 'published', 'unpublished', 'archived'),
        'invalid-value', 'filter.state');
    perform public.label_assert(p_offset between 0 and 2147483600 and p_offset % 24 = 0,
        'invalid-value', 'offset');
    brand_id := (p_filter->>'brandId')::integer;
    search_text := lower(normalize(p_filter->>'search', NFC));

    with reference_rows as (
        select r.id, r.slug, r.label_brand_id, r.archived, r.version,
            b.name as brand_name, b.slug as brand_slug, b.archived as brand_archived,
            r.published_revision_id, d.id as draft_id, d.version as draft_version,
            coalesce(nullif(d.content->>'title', ''), nullif(v.content->>'title', ''),
                (select h.content->>'title' from public.label_revisions as h
                    where h.label_reference_id = r.id order by h.id desc limit 1), '') as title,
            case when r.archived then 'archived'
                when d.id is not null then d.state
                when v.id is not null then 'published'
                else 'unpublished' end as state
        from public.label_references as r
        join public.label_brands as b on b.id = r.label_brand_id
        left join public.label_revisions as d on d.label_reference_id = r.id
            and d.state in ('draft', 'review')
        left join public.label_revisions as v on v.id = r.published_revision_id
            and v.label_reference_id = r.id and v.state = 'published'
        where brand_id is null or r.label_brand_id = brand_id
    ), page as materialized (
        select * from reference_rows as r
        where (requested_state = 'all' or r.state = requested_state)
            and (search_text = '' or strpos(lower(normalize(r.title, NFC)), search_text) > 0
                or strpos(lower(normalize(r.brand_name, NFC)), search_text) > 0)
        order by r.id desc limit 25 offset p_offset
    ), visible_rows as (
        select * from page order by id desc limit 24
    )
    select jsonb_build_object(
        'rows', coalesce((select jsonb_agg(jsonb_build_object(
            'referenceId', r.id, 'slug', r.slug, 'brandId', r.label_brand_id,
            'brandName', r.brand_name, 'brandSlug', r.brand_slug, 'brandArchived', r.brand_archived,
            'archived', r.archived, 'version', r.version, 'title', r.title, 'state', r.state,
            'draftRevisionId', r.draft_id, 'draftVersion', r.draft_version,
            'publishedRevisionId', r.published_revision_id
        ) order by r.id desc) from visible_rows as r), '[]'::jsonb),
        'hasMore', (select count(*) > 24 from page),
        'nextOffset', case when (select count(*) > 24 from page) then p_offset + 24 else null end
    ) into result;
    return result;
end;
$function$;

comment on function public.list_label_admin_references(jsonb,integer) is 'Seitengenaue Betreiberübersicht. Archivstatus, Entwurf und Veröffentlichung bleiben unterscheidbar.';

revoke all on function public.list_label_admin_references(jsonb, integer) from public;

grant all on function public.list_label_admin_references(jsonb, integer) to authenticated;

create function public.list_label_reader_brands()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare result jsonb;
begin
    if public.can_read_label_library() is not true then raise exception 'Nicht verfügbar' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('slug',slug,'name',name) order by name),'[]')
    into result from public.label_brands where not archived;
    return result;
end;
$function$;

revoke all on function public.list_label_reader_brands() from public;

grant all on function public.list_label_reader_brands() to authenticated;

create function public.list_label_references (
  p_filter jsonb,
  p_offset integer
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare f jsonb; result jsonb; filter_decade integer;
begin
 if not public.can_read_label_library() then
  raise exception 'Labelbibliothek nicht verfügbar' using errcode='42501';
 end if;
 f:=public.label_validate_read_filter(p_filter);
 filter_decade:=case when jsonb_typeof(f->'decade')='number' then (f->>'decade')::numeric::integer else null end;
 perform public.label_assert(p_offset is not null and p_offset>=0 and p_offset%24=0,'invalid-value','offset');
 with candidates as (
  select r.id,v.content,dates.has_known,dates.first_start
  from public.label_references as r
  join public.label_brands as b on b.id=r.label_brand_id
  join public.label_revisions as v on v.id=r.published_revision_id
  cross join lateral (
   select coalesce(bool_or(x.value->'startYear'<>'null'::jsonb or x.value->'endYear'<>'null'::jsonb),false) as has_known,
    min((x.value->>'startYear')::numeric::integer) as first_start
   from jsonb_array_elements(v.content->'intervals') as x(value)
  ) as dates
  where public.label_reference_is_published(r.id)
   and (f->>'brandSlug' is null or b.slug=f->>'brandSlug')
   and (f->>'kind' is null or v.content->'kinds' ? (f->>'kind'))
   and (f->'decade'='null'::jsonb
    or (f->'decade'='"unknown"'::jsonb and not dates.has_known)
    or (jsonb_typeof(f->'decade')='number' and exists(
     select 1 from jsonb_array_elements(v.content->'intervals') as x(value)
     where (x.value->'startYear'<>'null'::jsonb or x.value->'endYear'<>'null'::jsonb)
      and (x.value->>'startYear' is null or (x.value->>'startYear')::numeric::integer<=filter_decade+9)
      and (x.value->>'endYear' is null or (x.value->>'endYear')::numeric::integer>=filter_decade))))
   and (f->>'query'='' or exists(
    select 1 from jsonb_array_elements_text(
     jsonb_build_array(v.content->>'title')||(v.content->'aliases')||(v.content->'features')) as text_field(value)
    where strpos(lower(normalize(text_field.value)),lower(f->>'query'))>0))
 ), selected as (
  select * from candidates
  order by has_known desc,first_start asc nulls last,(content->>'title') collate "C",id
  limit 25 offset p_offset
 ), numbered as (
  select id,row_number() over(order by has_known desc,first_start asc nulls last,(content->>'title') collate "C",id) as ordinal
  from selected
 )
 select jsonb_build_object('items',coalesce(jsonb_agg(public.label_reader_card(id) order by ordinal)
   filter(where ordinal<=24),'[]'::jsonb),'hasMore',count(*)>24,
   'catalogVersion',(select catalog_version::text from public.label_library_settings where id=1))
 into result from numbered;
 return result;
end;
$function$;

revoke all on function public.list_label_references(jsonb, integer) from public;

grant all on function public.list_label_references(jsonb, integer) to authenticated;

create function public.list_size_references (
  p_admin boolean default false
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare result jsonb;
begin
    if p_admin is null or (p_admin and public.is_platform_operator() is not true)
        or public.can_read_label_library() is not true then raise exception 'Nicht verfügbar' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'brandId',s.label_brand_id,
        'brandName',b.name,'archived',s.archived,'published',s.published_content is not null,
        'hasDraftChanges',p_admin and s.content is distinct from s.published_content,
        'content',case when p_admin then s.content else s.published_content end) order by s.id desc),'[]')
    into result from public.size_references s left join public.label_brands b on b.id = s.label_brand_id
    where p_admin or (s.published_content is not null and not s.archived and coalesce(b.archived,false) = false);
    return result;
end;
$function$;

revoke all on function public.list_size_references(boolean) from public;

grant all on function public.list_size_references(boolean) to authenticated;

create function public.protect_label_change_events()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
    raise exception 'Labelprotokoll ist unveränderlich' using errcode = '55000';
end;
$function$;

revoke all on function public.protect_label_change_events() from public;

create function public.protect_label_image_assignment_history()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
    revision_id integer;
    revision_state text;
begin
    -- Quelle und Ziel in derselben aufsteigenden Reihenfolge sperren; auch das
    -- Umhängen aus/einer veröffentlichten Revision ist verboten.
    for revision_id in
        select distinct id from unnest(array[
            case when tg_op <> 'INSERT' then old.label_revision_id end,
            case when tg_op <> 'DELETE' then new.label_revision_id end
        ]) as revision_ids(id) where id is not null order by id
    loop
        select state into revision_state from public.label_revisions where id = revision_id for update;
        if revision_state in ('published', 'discarded') then
            raise exception 'Labelbilder einer abgeschlossenen Revision sind unveränderlich' using errcode = '55000';
        end if;
    end loop;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$function$;

revoke all on function public.protect_label_image_assignment_history() from public;

create function public.protect_label_processed_asset()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
    if old.processing_status = 'processed' then
        raise exception 'Verarbeitete Labeldatei ist unveränderlich' using errcode = '55000';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$function$;

revoke all on function public.protect_label_processed_asset() from public;

create function public.protect_label_revision_history()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
    if old.state in ('published', 'discarded') then
        raise exception 'Labelrevision ist unveränderlich' using errcode = '55000';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$function$;

revoke all on function public.protect_label_revision_history() from public;

create function public.publish_label_draft (
  p_revision_id      integer,
  p_expected_version integer,
  p_request_id       uuid
)
  returns jsonb
  language sql
  security definer
  set search_path to ''
  as $function$
 select public.label_change_revision('publish',p_revision_id,p_expected_version,null,p_request_id);
$function$;

revoke all on function public.publish_label_draft(integer, integer, uuid) from public;

grant all on function public.publish_label_draft(integer, integer, uuid) to authenticated;

create function public.reserve_label_image (
  p_request_id uuid,
  p_input      jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb := p_input; cached jsonb; asset public.label_image_assets;
begin
    cached := public.label_begin_edit('reserve-image', p_request_id, args);
    if cached is not null then return cached; end if;
    perform public.label_assert_object(p_input,array['originalHash','imageHash','attribution','allowedUse'],'upload');
    perform public.label_assert(p_input->>'originalHash' ~ '^[0-9a-f]{64}$' and
        p_input->>'imageHash' ~ '^[0-9a-f]{64}$','invalid-value','upload.hash');
    perform public.label_assert_text(p_input->'attribution',4000,'upload.attribution');
    perform public.label_assert_text(p_input->'allowedUse',4000,'upload.allowedUse');
    perform public.label_assert(public.label_has_text(p_input->>'attribution') and
        public.label_has_text(p_input->>'allowedUse'),'required-text','upload.permission');
    insert into public.label_image_assets(asset_kind, original_path, created_by)
    values ('reference-image', p_request_id::text, (select auth.uid())) returning * into asset;
    return public.label_finish_edit('reserve-image', p_request_id, args,
        jsonb_build_object('assetId', asset.id, 'originalPath', asset.original_path));
end;
$function$;

revoke all on function public.reserve_label_image(uuid, jsonb) from public;

grant all on function public.reserve_label_image(uuid, jsonb) to authenticated;

create function public.restore_label_reference (
  p_reference_id     integer,
  p_expected_version integer,
  p_request_id       uuid
)
  returns jsonb
  language sql
  security definer
  set search_path to ''
  as $function$
 select public.label_change_reference_archive(p_reference_id,p_expected_version,false,p_request_id);
$function$;

revoke all on function public.restore_label_reference(integer, integer, uuid) from public;

grant all on function public.restore_label_reference(integer, integer, uuid) to authenticated;

create function public.save_label_brand_line (
  p_id               integer,
  p_expected_version integer,
  p_input            jsonb,
  p_request_id       uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb := jsonb_build_object('id', p_id, 'version', p_expected_version, 'input', p_input);
    cached jsonb; line public.label_brand_lines; brand_id integer;
begin
    -- Prüft die Rolle vor der Eingabe und erneut nach der gemeinsamen Redaktionssperre.
    cached := public.label_begin_edit('save-brand-line', p_request_id, args);
    if cached is not null then return cached; end if;
    perform public.label_assert_object(p_input, array['brandId', 'name'], 'brandLine');
    perform public.label_assert_integer(p_input->'brandId', 1, 2147483647, 'brandLine.brandId');
    perform public.label_assert_text(p_input->'name', 160, 'brandLine.name');
    perform public.label_assert(public.label_has_text(p_input->>'name'), 'required-text', 'brandLine.name');
    brand_id := (p_input->>'brandId')::integer;
    perform public.label_assert(exists(
        select 1 from public.label_brands as b where b.id = brand_id and not b.archived
    ), 'brand-unavailable', 'brandLine.brandId');
    if p_id is null then
        perform public.label_assert(p_expected_version is null, 'invalid-value', 'expectedVersion');
        insert into public.label_brand_lines(label_brand_id, name)
            values(brand_id, p_input->>'name') returning * into line;
    else
        perform public.label_assert(p_id > 0, 'invalid-value', 'brandLine.id');
        select * into line from public.label_brand_lines where id = p_id for update;
        if not found then raise exception 'Eintrag nicht verfügbar' using errcode = 'P0002'; end if;
        perform public.label_check_version(line.version, p_expected_version);
        perform public.label_assert(line.label_brand_id = brand_id, 'brand-line-mismatch', 'brandLine.brandId');
        perform public.label_assert(not line.archived, 'brand-line-archived', 'brandLine.id');
        update public.label_brand_lines set name = p_input->>'name', version = version + 1
            where id = p_id returning * into line;
    end if;
    -- Keine Umschreibung von Revisionsinhalten oder Freischaltung des Leserbereichs.
    return public.label_finish_edit('save-brand-line', p_request_id, args, jsonb_build_object(
        'id', line.id, 'brandId', line.label_brand_id, 'name', line.name,
        'version', line.version, 'archived', line.archived
    ));
end;
$function$;

comment on function public.save_label_brand_line(integer,integer,jsonb,uuid) is 'Betreiberpflege mit Versionsprüfung und Wiederholungsbeleg. Referenzmarke und Historie bleiben erhalten.';

revoke all on function public.save_label_brand_line(integer, integer, jsonb, uuid) from public;

grant all on function public.save_label_brand_line(integer, integer, jsonb, uuid) to authenticated;

create function public.save_label_brand (
  p_id               integer,
  p_expected_version integer,
  p_input            jsonb,
  p_request_id       uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb:=jsonb_build_object('id',p_id,'version',p_expected_version,'input',p_input);
 cached jsonb; brand public.label_brands; alias_values text[]; item record;
begin
 cached:=public.label_begin_edit('save-brand',p_request_id,args); if cached is not null then return cached; end if;
 perform public.label_assert_object(p_input,array['name','slug','aliases'],'brand');
 perform public.label_assert_text(p_input->'name',160,'brand.name');
 perform public.label_assert(public.label_has_text(p_input->>'name'),'required-text','brand.name');
 perform public.label_assert_text(p_input->'slug',80,'brand.slug');
 perform public.label_assert(p_input->>'slug' ~ '^[a-z0-9]+(-[a-z0-9]+)*$','invalid-value','brand.slug');
 perform public.label_assert_array(p_input->'aliases',20,'brand.aliases');
 for item in select value from jsonb_array_elements(p_input->'aliases') loop perform public.label_assert_text(item.value,80,'brand.aliases'); end loop;
 select coalesce(array_agg(value order by ordinality),'{}'::text[]) into alias_values from jsonb_array_elements_text(p_input->'aliases') with ordinality;
 if p_id is null then
   perform public.label_assert(p_expected_version is null,'invalid-value','expectedVersion');
   insert into public.label_brands(name,slug,aliases) values(p_input->>'name',p_input->>'slug',alias_values) returning * into brand;
 else
   select * into brand from public.label_brands where id=p_id for update;
   if not found then raise exception 'Eintrag nicht verfügbar' using errcode='P0002'; end if;
   perform public.label_check_version(brand.version,p_expected_version);
   perform public.label_assert(brand.slug=p_input->>'slug' or not exists(select 1 from public.label_references where label_brand_id=brand.id),'slug-in-use','brand.slug');
   update public.label_brands set name=p_input->>'name',slug=p_input->>'slug',aliases=alias_values,version=version+1 where id=p_id returning * into brand;
 end if;
 return public.label_finish_edit('save-brand',p_request_id,args,jsonb_build_object('id',brand.id,'name',brand.name,'slug',brand.slug,
  'aliases',brand.aliases,'version',brand.version,'archived',brand.archived));
end;
$function$;

revoke all on function public.save_label_brand(integer, integer, jsonb, uuid) from public;

grant all on function public.save_label_brand(integer, integer, jsonb, uuid) to authenticated;

create function public.save_label_draft (
  p_revision_id      integer,
  p_expected_version integer,
  p_input            jsonb,
  p_request_id       uuid
)
  returns jsonb
  language sql
  security definer
  set search_path to ''
  as $function$
 select public.label_change_revision('save',p_revision_id,p_expected_version,p_input,p_request_id);
$function$;

revoke all on function public.save_label_draft(integer, integer, jsonb, uuid) from public;

grant all on function public.save_label_draft(integer, integer, jsonb, uuid) to authenticated;

create function public.save_size_reference (
  p_id               integer,
  p_expected_version integer,
  p_brand_id         integer,
  p_content          jsonb,
  p_publish          boolean,
  p_request_id       uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb := jsonb_build_object('id',p_id,'version',p_expected_version,'brandId',p_brand_id,
    'content',p_content,'publish',p_publish); cached jsonb; reference public.size_references;
begin
    cached := public.label_begin_edit('save-sizes',p_request_id,args);
    if cached is not null then return cached; end if;
    perform public.label_assert(p_publish is not null,'invalid-value','publish');
    perform public.validate_size_reference(p_content,p_publish);
    perform public.label_assert(p_brand_id is null or exists(select 1 from public.label_brands where id = p_brand_id and not archived),
        'brand-unavailable','brandId');
    if p_id is null then
        perform public.label_assert(p_expected_version is null,'invalid-value','version');
        insert into public.size_references(label_brand_id,content,published_content)
        values(p_brand_id,p_content,case when p_publish then p_content end) returning * into reference;
    else
        select * into reference from public.size_references where id = p_id for update;
        if not found then raise exception 'Nicht verfügbar' using errcode = 'P0002'; end if;
        perform public.label_check_version(reference.version,p_expected_version);
        perform public.label_assert(not reference.archived,'reference-archived','id');
        -- Markenbezug einer veröffentlichten Tabelle bleibt auch bei Entwurfsänderungen stabil.
        perform public.label_assert(reference.published_content is null or reference.label_brand_id is not distinct from p_brand_id,
            'invalid-value','brandId');
        update public.size_references set label_brand_id = p_brand_id,content = p_content,
            published_content = case when p_publish then p_content else published_content end,version = version + 1
        where id = p_id returning * into reference;
    end if;
    return public.label_finish_edit('save-sizes',p_request_id,args,
        jsonb_build_object('id',reference.id,'version',reference.version));
end;
$function$;

revoke all on function public.save_size_reference(integer, integer, integer, jsonb, boolean, uuid) from public;

grant all on function public.save_size_reference(integer, integer, integer, jsonb, boolean, uuid) to authenticated;

create function public.set_label_brand_archive (
  p_id               integer,
  p_expected_version integer,
  p_archived         boolean,
  p_line             boolean,
  p_request_id       uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb := jsonb_build_object('id',p_id,'version',p_expected_version,'archived',p_archived,'line',p_line);
    cached jsonb; actual_version integer;
begin
    cached := public.label_begin_edit('brand-archive',p_request_id,args);
    if cached is not null then return cached; end if;
    perform public.label_assert(p_archived is not null and p_line is not null,'invalid-value','archive');
    if p_line then select version into actual_version from public.label_brand_lines where id = p_id for update;
    else select version into actual_version from public.label_brands where id = p_id for update; end if;
    if not found then raise exception 'Eintrag nicht verfügbar' using errcode = 'P0002'; end if;
    perform public.label_check_version(actual_version,p_expected_version);
    if p_line then update public.label_brand_lines set archived = p_archived,version = version + 1 where id = p_id;
    else update public.label_brands set archived = p_archived,version = version + 1 where id = p_id; end if;
    update public.label_library_settings set catalog_version = catalog_version + 1 where id = 1;
    return public.label_finish_edit('brand-archive',p_request_id,args,jsonb_build_object('version',actual_version + 1));
end;
$function$;

revoke all on function public.set_label_brand_archive(integer, integer, boolean, boolean, uuid) from public;

grant all on function public.set_label_brand_archive(integer, integer, boolean, boolean, uuid) to authenticated;

create function public.set_label_image_permission (
  p_asset_id         integer,
  p_expected_version integer,
  p_status           text,
  p_attribution      text,
  p_allowed_use      text,
  p_request_id       uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb := jsonb_build_object('id',p_asset_id,'version',p_expected_version,'status',p_status,
    'attribution',p_attribution,'allowedUse',p_allowed_use); cached jsonb; permission public.label_image_permissions;
begin
    cached := public.label_begin_edit('image-permission',p_request_id,args);
    if cached is not null then return cached; end if;
    perform public.label_assert(p_status in ('approved','revoked') and public.label_has_text(p_attribution)
        and public.label_has_text(p_allowed_use) and char_length(p_attribution) <= 4000
        and char_length(p_allowed_use) <= 4000,'invalid-value','permission');
    select * into permission from public.label_image_permissions where label_image_asset_id = p_asset_id for update;
    if not found then raise exception 'Bild nicht verfügbar' using errcode = 'P0002'; end if;
    perform public.label_check_version(permission.version,p_expected_version);
    update public.label_image_permissions set status = p_status, attribution = p_attribution,
        allowed_use = p_allowed_use, version = version + 1, reviewed_by = (select auth.uid()), reviewed_at = now(),
        revoked_at = case when p_status = 'revoked' then now() else null end
    where id = permission.id;
    update public.label_library_settings set catalog_version = catalog_version + 1 where id = 1;
    return public.label_finish_edit('image-permission',p_request_id,args,jsonb_build_object('version',permission.version + 1));
end;
$function$;

revoke all on function public.set_label_image_permission(integer, integer, text, text, text, uuid) from public;

grant all on function public.set_label_image_permission(integer, integer, text, text, text, uuid) to authenticated;

create function public.set_label_library_enabled (
  p_enabled    boolean,
  p_request_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare args jsonb:=jsonb_build_object('enabled',p_enabled); cached jsonb;
begin
 cached:=public.label_begin_edit('library-enabled',p_request_id,args);
 if cached is not null then return cached; end if;
 perform public.label_assert(p_enabled is not null,'invalid-value','enabled');
 if p_enabled then
  perform public.label_assert(public.label_library_has_publication(),'publication-required','enabled');
 end if;
 update public.label_library_settings set reader_enabled=p_enabled,catalog_version=catalog_version+1
 where id=1 and reader_enabled is distinct from p_enabled;
 return public.label_finish_edit('library-enabled',p_request_id,args,
  public.get_label_library_availability() || jsonb_build_object('readerEnabled',p_enabled));
end;
$function$;

revoke all on function public.set_label_library_enabled(boolean, uuid) from public;

grant all on function public.set_label_library_enabled(boolean, uuid) to authenticated;

create function public.submit_label_draft (
  p_revision_id      integer,
  p_expected_version integer,
  p_request_id       uuid
)
  returns jsonb
  language sql
  security definer
  set search_path to ''
  as $function$
 select public.label_change_revision('submit',p_revision_id,p_expected_version,null,p_request_id);
$function$;

revoke all on function public.submit_label_draft(integer, integer, uuid) from public;

grant all on function public.submit_label_draft(integer, integer, uuid) to authenticated;

create function public.validate_size_reference (
  p_content jsonb,
  p_publish boolean
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare column_value jsonb; row_value jsonb; cell_value jsonb; column_count integer;
begin
    perform public.label_assert_object(p_content,array['title','category','audience','measurement','notes',
        'sourceTitle','sourceUrl','reviewedAt','columns','rows'],'sizes');
    perform public.label_assert_text(p_content->'title',160,'sizes.title');
    perform public.label_assert(public.label_has_text(p_content->>'title'),'required-text','sizes.title');
    perform public.label_assert(p_content->>'category' in ('trousers','tops','shoes','other'), 'invalid-value','sizes.category');
    perform public.label_assert(p_content->>'audience' in ('women','men','unisex','children'), 'invalid-value','sizes.audience');
    perform public.label_assert(p_content->>'measurement' in ('body','garment'), 'invalid-value','sizes.measurement');
    perform public.label_assert_text(p_content->'notes',4000,'sizes.notes');
    perform public.label_assert_text(p_content->'sourceTitle',160,'sizes.sourceTitle');
    perform public.label_assert_source_url(p_content->'sourceUrl','sizes.sourceUrl');
    perform public.label_assert_date(p_content->'reviewedAt','sizes.reviewedAt');
    perform public.label_assert_array(p_content->'columns',12,'sizes.columns');
    column_count := jsonb_array_length(p_content->'columns');
    perform public.label_assert(column_count > 0,'required-text','sizes.columns');
    for column_value in select value from jsonb_array_elements(p_content->'columns') loop
        perform public.label_assert_text(column_value,80,'sizes.columns');
        perform public.label_assert(public.label_has_text(column_value#>>'{}'),'required-text','sizes.columns');
    end loop;
    perform public.label_assert((select count(distinct value) from jsonb_array_elements(p_content->'columns')) = column_count,
        'duplicate-value','sizes.columns');
    perform public.label_assert_array(p_content->'rows',100,'sizes.rows');
    for row_value in select value from jsonb_array_elements(p_content->'rows') loop
        perform public.label_assert_array(row_value,12,'sizes.rows');
        perform public.label_assert(jsonb_array_length(row_value) = column_count,'invalid-value','sizes.rows');
        for cell_value in select value from jsonb_array_elements(row_value) loop
            perform public.label_assert_text(cell_value,160,'sizes.cell');
        end loop;
    end loop;
    if p_publish then
        perform public.label_assert(jsonb_array_length(p_content->'rows') > 0 and public.label_has_text(p_content->>'sourceTitle')
            and p_content->>'sourceUrl' <> '' and p_content->'reviewedAt' <> 'null'::jsonb,'source-incomplete','sizes.source');
        perform public.label_assert((p_content->>'reviewedAt')::date <= current_date,'future-date','sizes.reviewedAt');
    end if;
    return p_content;
end;
$function$;

revoke all on function public.validate_size_reference(jsonb, boolean) from public;

create table public.label_brand_lines (
  id             integer generated always as identity not null,
  label_brand_id integer not null,
  name           text    not null,
  archived       boolean default false not null,
  version        integer default 1 not null
);

comment on table public.label_brand_lines is 'Redaktionelle Markenlinien innerhalb einer Referenzmarke.';

alter table public.label_brand_lines
  enable row level security;

alter table public.label_brand_lines
  add constraint label_brand_lines_label_brand_id_name_key unique (label_brand_id, name);

alter table public.label_brand_lines
  add constraint label_brand_lines_name_check check (char_length(name) >= 1 and char_length(name) <= 160 and name !~ '^[[:space:]]*$'::text);

alter table public.label_brand_lines
  add constraint label_brand_lines_pkey primary key (id);

alter table public.label_brand_lines
  add constraint label_brand_lines_version_check check (version > 0);

grant select on public.label_brand_lines to authenticated;

create index label_brand_lines_brand_idx on public.label_brand_lines (label_brand_id);

create policy "Betreiber lesen label_brand_lines" on public.label_brand_lines
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.label_brands (
  id         integer                  generated always as identity not null,
  name       text                     not null,
  slug       text                     not null,
  aliases    text[]                   default '{}'::text[] not null,
  archived   boolean                  default false not null,
  version    integer                  default 1 not null,
  created_at timestamp with time zone default now() not null
);

comment on table public.label_brands is 'Globale Referenzmarken; unabhängig von Workspace-Stammdaten.';

alter table public.label_brands
  enable row level security;

alter table public.label_brands
  add constraint label_brands_aliases_check check (cardinality(aliases) <= 20 and array_position(aliases, null::text) is null);

alter table public.label_brands
  add constraint label_brands_name_check check (char_length(name) >= 1 and char_length(name) <= 160 and name !~ '^[[:space:]]*$'::text);

alter table public.label_brands
  add constraint label_brands_pkey primary key (id);

alter table public.label_brand_lines
  add constraint label_brand_lines_label_brand_id_fkey foreign key (label_brand_id) references public.label_brands(id);

alter table public.label_brands
  add constraint label_brands_slug_check check (char_length(slug) >= 1 and char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text);

alter table public.label_brands
  add constraint label_brands_slug_key unique (slug);

alter table public.label_brands
  add constraint label_brands_version_check check (version > 0);

grant select on public.label_brands to authenticated;

create policy "Betreiber lesen label_brands" on public.label_brands
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.label_change_events (
  id                 integer                  generated always as identity not null,
  label_reference_id integer,
  label_revision_id  integer,
  actor_id           uuid                     not null,
  action             text                     not null,
  occurred_at        timestamp with time zone default now() not null,
  details            jsonb                    default '{}'::jsonb not null
);

comment on table public.label_change_events is 'Append-only Redaktionsprotokoll. actor_id bleibt als historische Kennung ohne Kontolösch-Kaskade erhalten.';

alter table public.label_change_events
  enable row level security;

alter table public.label_change_events
  add constraint label_change_events_action_check check (action <> ''::text);

alter table public.label_change_events
  add constraint label_change_events_details_check check (jsonb_typeof(details) = 'object'::text);

alter table public.label_change_events
  add constraint label_change_events_pkey primary key (id);

grant select on public.label_change_events to authenticated;

create index label_change_events_reference_idx on public.label_change_events (label_reference_id);

create index label_change_events_actor_idx on public.label_change_events (actor_id);

create index label_change_events_revision_idx on public.label_change_events (label_revision_id);

create trigger protect_label_change_events
  before delete or update on public.label_change_events
  for each row
  execute function public.protect_label_change_events();

create policy "Betreiber lesen label_change_events" on public.label_change_events
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.label_edit_requests (
  id         integer                  generated always as identity not null,
  actor_id   uuid                     not null,
  request_id uuid                     not null,
  action     text                     not null,
  input_hash text                     not null,
  result     jsonb                    not null,
  created_at timestamp with time zone default now() not null
);

comment on table public.label_edit_requests is 'Bestätigte Ergebnisse idempotenter Schreibaktionen; nur gemeinsam mit deren Erfolg einfügen.';

alter table public.label_edit_requests
  enable row level security;

alter table public.label_edit_requests
  add constraint label_edit_requests_action_check check (action <> ''::text);

alter table public.label_edit_requests
  add constraint label_edit_requests_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete cascade;

alter table public.label_edit_requests
  add constraint label_edit_requests_actor_id_request_id_key unique (actor_id, request_id);

alter table public.label_edit_requests
  add constraint label_edit_requests_input_hash_check check (input_hash ~ '^[0-9a-f]{64}$'::text);

alter table public.label_edit_requests
  add constraint label_edit_requests_pkey primary key (id);

grant select on public.label_edit_requests to authenticated;

create policy "Betreiber lesen label_edit_requests" on public.label_edit_requests
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.label_image_assets (
  id                integer                  generated always as identity not null,
  asset_kind        text                     not null,
  processing_status text                     default 'pending'::text not null,
  original_path     text                     not null,
  gallery_path      text,
  detail_path       text,
  mime_type         text,
  original_bytes    integer,
  width             integer,
  height            integer,
  created_by        uuid,
  created_at        timestamp with time zone default now() not null
);

comment on table public.label_image_assets is 'Private unveränderliche Dateiressourcen. Metadaten sind kein Beweis einer erfolgten Dekodierung.';

alter table public.label_image_assets
  enable row level security;

alter table public.label_image_assets
  add constraint label_image_assets_asset_kind_check check (asset_kind = any (array['reference-image'::text, 'rights-evidence'::text]));

alter table public.label_image_assets
  add constraint label_image_assets_check check (asset_kind = 'rights-evidence'::text or mime_type is distinct from 'application/pdf'::text);

alter table public.label_image_assets
  add constraint label_image_assets_check1 check (width is null or height is null or (width::bigint * height::bigint) <= 24000000);

alter table public.label_image_assets
  add constraint label_image_assets_check2 check (processing_status <> 'processed'::text or mime_type is not null and original_bytes is not null);

alter table public.label_image_assets
  add constraint label_image_assets_check3 check (processing_status <> 'processed'::text or asset_kind <> 'reference-image'::text or width is not null and height is
    not null and gallery_path is not null and gallery_path <> ''::text and detail_path is not null and detail_path <> ''::text);

alter table public.label_image_assets
  add constraint label_image_assets_check4 check (asset_kind <> 'rights-evidence'::text or gallery_path is null and detail_path is null);

alter table public.label_image_assets
  add constraint label_image_assets_detail_path_key unique (detail_path);

alter table public.label_image_assets
  add constraint label_image_assets_gallery_path_key unique (gallery_path);

alter table public.label_image_assets
  add constraint label_image_assets_height_check check (height > 0);

alter table public.label_image_assets
  add constraint label_image_assets_id_asset_kind_key unique (id, asset_kind);

alter table public.label_image_assets
  add constraint label_image_assets_mime_type_check
    check (mime_type is null or (mime_type = any (array['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'application/pdf'::text])));

alter table public.label_image_assets
  add constraint label_image_assets_original_bytes_check check (original_bytes >= 1 and original_bytes <= 10000000);

alter table public.label_image_assets
  add constraint label_image_assets_original_path_check check (original_path <> ''::text);

alter table public.label_image_assets
  add constraint label_image_assets_original_path_key unique (original_path);

alter table public.label_image_assets
  add constraint label_image_assets_pkey primary key (id);

alter table public.label_image_assets
  add constraint label_image_assets_processing_status_check check (processing_status = any (array['pending'::text, 'processed'::text, 'failed'::text]));

alter table public.label_image_assets
  add constraint label_image_assets_width_check check (width > 0);

grant select on public.label_image_assets to authenticated;

create index label_image_assets_creator_idx on public.label_image_assets (created_by);

create trigger protect_label_processed_asset
  before delete or update on public.label_image_assets
  for each row
  execute function public.protect_label_processed_asset();

create policy "Betreiber lesen label_image_assets" on public.label_image_assets
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.label_image_permissions (
  id                   integer                  generated always as identity not null,
  label_image_asset_id integer                  not null,
  image_kind           text                     generated always as ('reference-image'::text) stored,
  status               text                     default 'pending'::text not null,
  attribution          text                     default ''::text not null,
  allowed_use          text                     default ''::text not null,
  evidence_asset_id    integer,
  evidence_kind        text                     generated always as ('rights-evidence'::text) stored,
  version              integer                  default 1 not null,
  reviewed_by          uuid,
  reviewed_at          timestamp with time zone,
  revoked_at           timestamp with time zone
);

comment on table public.label_image_permissions is 'Interne Bildfreigaben und Nachweiszuordnungen; niemals Leserinhalt.';

alter table public.label_image_permissions
  enable row level security;

alter table public.label_image_permissions
  add constraint label_image_permissions_allowed_use_check check (char_length(allowed_use) <= 4000);

alter table public.label_image_permissions
  add constraint label_image_permissions_attribution_check check (char_length(attribution) <= 4000);

alter table public.label_image_permissions
  add constraint label_image_permissions_check check (status <> 'approved'::text or reviewed_at is not null and allowed_use !~ '^[[:space:]]*$'::text and allowed_use <> ''::text);

alter table public.label_image_permissions
  add constraint label_image_permissions_check1 check ((status = 'revoked'::text) = (revoked_at is not null));

alter table public.label_image_permissions
  add constraint label_image_permissions_evidence_asset_id_evidence_kind_fkey foreign key (evidence_asset_id, evidence_kind) references public.label_image_assets(id, asset_kind);

alter table public.label_image_permissions
  add constraint label_image_permissions_label_image_asset_id_image_kind_fkey foreign key (label_image_asset_id, image_kind) references public.label_image_assets(id, asset_kind);

alter table public.label_image_permissions
  add constraint label_image_permissions_label_image_asset_id_key unique (label_image_asset_id);

alter table public.label_image_permissions
  add constraint label_image_permissions_pkey primary key (id);

alter table public.label_image_permissions
  add constraint label_image_permissions_reviewed_by_fkey foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table public.label_image_permissions
  add constraint label_image_permissions_status_check check (status = any (array['pending'::text, 'approved'::text, 'revoked'::text]));

alter table public.label_image_permissions
  add constraint label_image_permissions_version_check check (version > 0);

grant select on public.label_image_permissions to authenticated;

create index label_image_permissions_evidence_idx on public.label_image_permissions (evidence_asset_id);

create index label_image_permissions_reviewer_idx on public.label_image_permissions (reviewed_by);

create policy "Betreiber lesen label_image_permissions" on public.label_image_permissions
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.label_library_settings (
  id              integer generated always as identity not null,
  reader_enabled  boolean default false not null,
  catalog_version bigint  default 1 not null
);

comment on table public.label_library_settings is 'Ein globaler Öffnungsschalter, standardmäßig geschlossen. Keine Kopie pro Workspace.';

alter table public.label_library_settings
  enable row level security;

alter table public.label_library_settings
  add constraint label_library_settings_catalog_version_check check (catalog_version > 0);

alter table public.label_library_settings
  add constraint label_library_settings_id_check check (id = 1);

alter table public.label_library_settings
  add constraint label_library_settings_pkey primary key (id);

grant select on public.label_library_settings to authenticated;

create policy "Betreiber lesen label_library_settings" on public.label_library_settings
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.label_references (
  id                    integer                  generated always as identity not null,
  label_brand_id        integer                  not null,
  slug                  text                     generated always as (('label-'::text || (id)::text)) stored,
  archived              boolean                  default false not null,
  version               integer                  default 1 not null,
  published_revision_id integer,
  published_state       text                     generated always as ('published'::text) stored,
  created_at            timestamp with time zone default now() not null
);

comment on table public.label_references is 'Stabile Labelreferenz mit getrenntem veröffentlichtem Revisionszeiger.';

alter table public.label_references
  enable row level security;

alter table public.label_references
  add constraint label_references_label_brand_id_fkey foreign key (label_brand_id) references public.label_brands(id);

alter table public.label_references
  add constraint label_references_label_brand_id_slug_key unique (label_brand_id, slug);

alter table public.label_references
  add constraint label_references_pkey primary key (id);

alter table public.label_change_events
  add constraint label_change_events_label_reference_id_fkey foreign key (label_reference_id) references public.label_references(id);

alter table public.label_references
  add constraint label_references_version_check check (version > 0);

grant select on public.label_references to authenticated;

create index label_references_publication_idx on public.label_references (published_revision_id);

create index label_references_brand_idx on public.label_references (label_brand_id);

create policy "Betreiber lesen label_references" on public.label_references
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.label_revision_images (
  id                   integer generated always as identity not null,
  label_revision_id    integer not null,
  label_image_asset_id integer not null,
  image_kind           text    generated always as ('reference-image'::text) stored,
  "position"           integer not null,
  caption              text    default ''::text not null,
  alt                  text    default ''::text not null,
  reference_item       text    default ''::text not null
);

comment on table public.label_revision_images is 'Nur revisionsbezogene Bildzuordnungen; Position 0 ist das Titelbild.';

alter table public.label_revision_images
  enable row level security;

alter table public.label_revision_images
  add constraint label_revision_images_alt_check check (char_length(alt) <= 4000);

alter table public.label_revision_images
  add constraint label_revision_images_caption_check check (char_length(caption) <= 4000);

alter table public.label_revision_images
  add constraint label_revision_images_label_image_asset_id_image_kind_fkey foreign key (label_image_asset_id, image_kind) references public.label_image_assets(id, asset_kind);

alter table public.label_revision_images
  add constraint label_revision_images_label_revision_id_label_image_asset_i_key unique (label_revision_id, label_image_asset_id);

alter table public.label_revision_images
  add constraint label_revision_images_label_revision_id_position_key unique (label_revision_id, "position") deferrable;

alter table public.label_revision_images
  add constraint label_revision_images_pkey primary key (id);

alter table public.label_revision_images
  add constraint label_revision_images_position_check check ("position" >= 0 and "position" <= 23);

alter table public.label_revision_images
  add constraint label_revision_images_reference_item_check check (char_length(reference_item) <= 160);

grant select on public.label_revision_images to authenticated;

create index label_revision_images_asset_idx on public.label_revision_images (label_image_asset_id);

create trigger protect_label_image_assignment_history
  before insert or delete or update on public.label_revision_images
  for each row
  execute function public.protect_label_image_assignment_history();

create policy "Betreiber lesen label_revision_images" on public.label_revision_images
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.label_revisions (
  id                 integer                  generated always as identity not null,
  label_reference_id integer                  not null,
  state              text                     default 'draft'::text not null,
  version            integer                  default 1 not null,
  content            jsonb                    not null,
  created_by         uuid,
  created_at         timestamp with time zone default now() not null,
  published_at       timestamp with time zone
);

comment on table public.label_revisions is 'Versionierter Inhalt. Schreibzugriff nur über separat geprüfte Inhalts-/Publikations-RPCs.';

alter table public.label_revisions
  enable row level security;

alter table public.label_revisions
  add constraint label_revisions_check check ((state = 'published'::text) = (published_at is not null));

alter table public.label_revisions
  add constraint label_revisions_content_check check (jsonb_typeof(content) = 'object'::text);

alter table public.label_revisions
  add constraint label_revisions_id_label_reference_id_state_key unique (id, label_reference_id, state);

alter table public.label_references
  add constraint label_references_publication_fk foreign key (published_revision_id, id, published_state) references public.label_revisions(id, label_reference_id, state);

alter table public.label_revisions
  add constraint label_revisions_label_reference_id_fkey foreign key (label_reference_id) references public.label_references(id);

alter table public.label_revisions
  add constraint label_revisions_pkey primary key (id);

alter table public.label_change_events
  add constraint label_change_events_label_revision_id_fkey foreign key (label_revision_id) references public.label_revisions(id);

alter table public.label_revision_images
  add constraint label_revision_images_label_revision_id_fkey foreign key (label_revision_id) references public.label_revisions(id);

alter table public.label_revisions
  add constraint label_revisions_state_check check (state = any (array['draft'::text, 'review'::text, 'published'::text, 'discarded'::text]));

alter table public.label_revisions
  add constraint label_revisions_version_check check (version > 0);

grant select on public.label_revisions to authenticated;

create index label_revisions_reference_idx on public.label_revisions (label_reference_id);

create unique index label_revisions_one_editable_idx on public.label_revisions (label_reference_id)
  where state = any (array['draft'::text, 'review'::text]);

create index label_revisions_creator_idx on public.label_revisions (created_by);

create trigger protect_label_revision_history
  before delete or update on public.label_revisions
  for each row
  execute function public.protect_label_revision_history();

create policy "Betreiber lesen label_revisions" on public.label_revisions
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.size_references (
  id                integer                  generated always as identity not null,
  label_brand_id    integer,
  content           jsonb                    not null,
  published_content jsonb,
  archived          boolean                  default false not null,
  version           integer                  default 1 not null,
  created_at        timestamp with time zone default now() not null
);

comment on table public.size_references is 'Globale Größenreferenzen mit getrenntem Entwurf und freigegebenem Inhalt.';

alter table public.size_references
  enable row level security;

alter table public.size_references
  add constraint size_references_label_brand_id_fkey foreign key (label_brand_id) references public.label_brands(id);

alter table public.size_references
  add constraint size_references_pkey primary key (id);

alter table public.size_references
  add constraint size_references_version_check check (version > 0);

grant select on public.size_references to authenticated;

create index size_references_brand_idx on public.size_references (label_brand_id);

create policy "Betreiber lesen Größentabellen" on public.size_references
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));
insert into public.label_library_settings default values;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('label-originals', 'label-originals', false, 10000000, array['image/jpeg','image/png','image/webp']),
       ('label-images', 'label-images', false, 6000000, array['image/png'])
on conflict (id) do nothing;

revoke all on function public.can_read_label_library() from public, anon, authenticated, service_role;
grant execute on function public.can_read_label_library() to authenticated;
revoke all on function public.get_label_library_availability() from public, anon, authenticated, service_role;
grant execute on function public.get_label_library_availability() to authenticated;
revoke all on function public.protect_label_revision_history() from public, anon, authenticated, service_role;
revoke all on function public.protect_label_image_assignment_history() from public, anon, authenticated, service_role;
revoke all on function public.protect_label_processed_asset() from public, anon, authenticated, service_role;
revoke all on function public.protect_label_change_events() from public, anon, authenticated, service_role;
revoke all on table public.label_brands from public, anon, authenticated, service_role;
grant select on table public.label_brands to authenticated;
revoke all on sequence public.label_brands_id_seq from public, anon, authenticated, service_role;
revoke all on table public.label_brand_lines from public, anon, authenticated, service_role;
grant select on table public.label_brand_lines to authenticated;
revoke all on sequence public.label_brand_lines_id_seq from public, anon, authenticated, service_role;
revoke all on table public.label_references from public, anon, authenticated, service_role;
grant select on table public.label_references to authenticated;
revoke all on sequence public.label_references_id_seq from public, anon, authenticated, service_role;
revoke all on table public.label_revisions from public, anon, authenticated, service_role;
grant select on table public.label_revisions to authenticated;
revoke all on sequence public.label_revisions_id_seq from public, anon, authenticated, service_role;
revoke all on table public.label_image_assets from public, anon, authenticated, service_role;
grant select on table public.label_image_assets to authenticated;
revoke all on sequence public.label_image_assets_id_seq from public, anon, authenticated, service_role;
revoke all on table public.label_revision_images from public, anon, authenticated, service_role;
grant select on table public.label_revision_images to authenticated;
revoke all on sequence public.label_revision_images_id_seq from public, anon, authenticated, service_role;
revoke all on table public.label_image_permissions from public, anon, authenticated, service_role;
grant select on table public.label_image_permissions to authenticated;
revoke all on sequence public.label_image_permissions_id_seq from public, anon, authenticated, service_role;
revoke all on table public.label_change_events from public, anon, authenticated, service_role;
grant select on table public.label_change_events to authenticated;
revoke all on sequence public.label_change_events_id_seq from public, anon, authenticated, service_role;
revoke all on table public.label_edit_requests from public, anon, authenticated, service_role;
grant select on table public.label_edit_requests to authenticated;
revoke all on sequence public.label_edit_requests_id_seq from public, anon, authenticated, service_role;
revoke all on table public.label_library_settings from public, anon, authenticated, service_role;
grant select on table public.label_library_settings to authenticated;
revoke all on sequence public.label_library_settings_id_seq from public, anon, authenticated, service_role;

revoke all on function public.label_assert(boolean,text,text),
 public.label_assert_object(jsonb,text[],text), public.label_assert_array(jsonb,integer,text,boolean),
 public.label_assert_text(jsonb,integer,text), public.label_assert_integer(jsonb,integer,integer,text,boolean),
 public.label_assert_date(jsonb,text), public.label_strip_whitespace(text), public.label_has_text(text), public.label_assert_source_url(jsonb,text),
 public.label_json_byte_size(jsonb), public.label_validate_content(jsonb), public.label_validate_draft(jsonb)
 from public,anon,authenticated,service_role;

revoke all on function public.label_empty_content(),public.label_begin_edit(text,uuid,jsonb),
 public.label_finish_edit(text,uuid,jsonb,jsonb,integer,integer),public.label_check_version(integer,integer),
 public.label_draft_result(integer),public.label_reference_is_published(integer),public.label_publication_content(integer),
 public.label_make_editable(integer),public.label_change_revision(text,integer,integer,jsonb,uuid),
 public.label_change_reference_archive(integer,integer,boolean,uuid)
 from public,anon,authenticated,service_role;
revoke all on function public.save_label_brand(integer,integer,jsonb,uuid),public.create_label_draft(integer,uuid),
 public.edit_label_reference(integer,uuid),public.save_label_draft(integer,integer,jsonb,uuid),
 public.submit_label_draft(integer,integer,uuid),public.publish_label_draft(integer,integer,uuid),
 public.discard_label_draft(integer,integer,uuid),public.archive_label_reference(integer,integer,uuid),
 public.restore_label_reference(integer,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_label_brand(integer,integer,jsonb,uuid),public.create_label_draft(integer,uuid),
 public.edit_label_reference(integer,uuid),public.save_label_draft(integer,integer,jsonb,uuid),
 public.submit_label_draft(integer,integer,uuid),public.publish_label_draft(integer,integer,uuid),
 public.discard_label_draft(integer,integer,uuid),public.archive_label_reference(integer,integer,uuid),
 public.restore_label_reference(integer,integer,uuid) to authenticated;

revoke all on function public.label_library_has_publication() from public,anon,authenticated,service_role;
revoke all on function public.label_validate_read_filter(jsonb),public.label_reader_card(integer)
 from public,anon,authenticated,service_role;
revoke all on function public.list_label_references(jsonb,integer),public.get_label_reference(text,text),
 public.set_label_library_enabled(boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_label_references(jsonb,integer),public.get_label_reference(text,text),
 public.set_label_library_enabled(boolean,uuid) to authenticated;

revoke all on function public.list_label_admin_brands() from public, anon, authenticated, service_role;
grant execute on function public.list_label_admin_brands() to authenticated;
revoke all on function public.list_label_admin_references(jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.list_label_admin_references(jsonb, integer) to authenticated;
revoke all on function public.get_label_admin_reference(integer) from public, anon, authenticated, service_role;
grant execute on function public.get_label_admin_reference(integer) to authenticated;
revoke all on function public.save_label_brand_line(integer, integer, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_label_brand_line(integer, integer, jsonb, uuid) to authenticated;

revoke all on function public.reserve_label_image(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.reserve_label_image(uuid,jsonb) to authenticated;
revoke all on function public.complete_label_image(integer, uuid, integer, text, integer, integer, text, text)
    from public, anon, authenticated, service_role;
grant execute on function public.complete_label_image(integer, uuid, integer, text, integer, integer, text, text) to service_role;
revoke all on function public.can_read_label_image(text) from public, anon, authenticated, service_role;
grant execute on function public.can_read_label_image(text) to authenticated;
revoke all on function public.list_label_admin_images() from public, anon, authenticated, service_role;
grant execute on function public.list_label_admin_images() to authenticated;
revoke all on function public.set_label_image_permission(integer,integer,text,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_label_image_permission(integer,integer,text,text,text,uuid) to authenticated;
revoke all on function public.set_label_brand_archive(integer,integer,boolean,boolean,uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_label_brand_archive(integer,integer,boolean,boolean,uuid) to authenticated;
revoke all on function public.list_label_reader_brands() from public, anon, authenticated, service_role;
grant execute on function public.list_label_reader_brands() to authenticated;

revoke all on public.size_references from public,anon,authenticated,service_role;
grant select on public.size_references to authenticated;
revoke all on sequence public.size_references_id_seq from public,anon,authenticated,service_role;
revoke all on function public.validate_size_reference(jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function public.save_size_reference(integer,integer,integer,jsonb,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_size_reference(integer,integer,integer,jsonb,boolean,uuid) to authenticated;
revoke all on function public.list_size_references(boolean) from public,anon,authenticated,service_role;
grant execute on function public.list_size_references(boolean) to authenticated;
revoke all on function public.archive_size_reference(integer,integer,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.archive_size_reference(integer,integer,boolean,uuid) to authenticated;
revoke all on function public.label_library_has_publication() from public,anon,authenticated,service_role;
