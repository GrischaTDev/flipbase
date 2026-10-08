-- Globales Marken- und Labellexikon: Rechte, Historie und Referenzverwaltung.
-- Änderungen werden über erzeugte Migrationen integriert.


create function public.label_empty_content()
returns jsonb language sql immutable security invoker set search_path = '' as $$
 select '{"title":"","aliases":[],"brandLineId":null,"brandName":"","brandLineName":null,"kinds":[],"timeSummary":"","evidenceLevel":"undated","intervals":[],"features":[],"checkHints":[],"limitations":[],"relatedReferenceIds":[],"sources":[],"reviewedAt":null}'::jsonb;
$$;

create function public.label_begin_edit(p_action text, p_request_id uuid, p_input jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
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
$$;

create function public.label_finish_edit(p_action text,p_request_id uuid,p_input jsonb,p_result jsonb,
 p_reference_id integer default null,p_revision_id integer default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
begin
  insert into public.label_edit_requests(actor_id,request_id,action,input_hash,result)
    values((select auth.uid()),p_request_id,p_action,encode(sha256(convert_to(p_input::text,'UTF8')),'hex'),p_result);
  insert into public.label_change_events(label_reference_id,label_revision_id,actor_id,action,details)
    values(p_reference_id,p_revision_id,(select auth.uid()),p_action,
      jsonb_build_object('requestId',p_request_id,'resultVersion',p_result->'version'));
  return p_result;
end;
$$;

create function public.label_check_version(p_actual integer,p_expected integer)
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  perform public.label_assert(p_expected between 1 and 2147483646,'invalid-value','expectedVersion');
  if p_actual is distinct from p_expected then
    raise exception 'Der Eintrag wurde inzwischen geändert' using errcode='P0001',detail='label_version_conflict';
  end if;
end;
$$;

create function public.label_draft_result(p_revision_id integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('referenceId',r.label_reference_id,'revisionId',r.id,'version',r.version,'state',r.state,
  'input',jsonb_build_object('content',r.content,'images',coalesce((
   select jsonb_agg(jsonb_build_object('assetId',i.label_image_asset_id,'position',i.position,
    'caption',i.caption,'alt',i.alt,'referenceItem',i.reference_item) order by i.position)
   from public.label_revision_images as i where i.label_revision_id=r.id),'[]'::jsonb)))
 from public.label_revisions as r where r.id=p_revision_id;
$$;

create function public.label_reference_is_published(p_reference_id integer)
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from public.label_references as r
  join public.label_brands as b on b.id=r.label_brand_id
  join public.label_revisions as v on v.id=r.published_revision_id and v.state='published'
  where r.id=p_reference_id and not r.archived and not b.archived
   and exists(select 1 from public.label_revision_images as i where i.label_revision_id=v.id)
   and not exists(select 1 from public.label_revision_images as i
    left join public.label_image_assets as a on a.id=i.label_image_asset_id
    left join public.label_image_permissions as p on p.label_image_asset_id=a.id
    where i.label_revision_id=v.id and (a.processing_status is distinct from 'processed' or p.status is distinct from 'approved')));
$$;

create function public.label_publication_content(p_revision_id integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
$$;

create function public.save_label_brand(p_id integer,p_expected_version integer,p_input jsonb,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
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
$$;

create function public.create_label_draft(p_brand_id integer,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare args jsonb:=jsonb_build_object('brandId',p_brand_id); cached jsonb; ref_id integer; rev_id integer;
begin
 cached:=public.label_begin_edit('create',p_request_id,args); if cached is not null then return cached; end if;
 perform public.label_assert(exists(select 1 from public.label_brands where id=p_brand_id and not archived),'brand-unavailable','brandId');
 insert into public.label_references(label_brand_id) values(p_brand_id) returning id into ref_id;
 insert into public.label_revisions(label_reference_id,content,created_by) values(ref_id,public.label_empty_content(),(select auth.uid())) returning id into rev_id;
 return public.label_finish_edit('create',p_request_id,args,public.label_draft_result(rev_id),ref_id,rev_id);
end;
$$;

create function public.label_make_editable(p_reference_id integer)
returns integer language plpgsql volatile security invoker set search_path = '' as $$
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
$$;

create function public.edit_label_reference(p_reference_id integer,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare args jsonb:=jsonb_build_object('referenceId',p_reference_id); cached jsonb; ref public.label_references; rev_id integer;
begin
 cached:=public.label_begin_edit('edit',p_request_id,args); if cached is not null then return cached; end if;
 select * into ref from public.label_references where id=p_reference_id for update;
 if not found then raise exception 'Eintrag nicht verfügbar' using errcode='P0002'; end if;
 perform public.label_assert(not ref.archived and exists(select 1 from public.label_brands where id=ref.label_brand_id and not archived),'reference-archived','referenceId');
 rev_id:=public.label_make_editable(ref.id);
 return public.label_finish_edit('edit',p_request_id,args,public.label_draft_result(rev_id),ref.id,rev_id);
end;
$$;

create function public.label_change_revision(p_action text,p_revision_id integer,p_expected_version integer,p_input jsonb,p_request_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
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
$$;

create function public.save_label_draft(p_revision_id integer,p_expected_version integer,p_input jsonb,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
 select public.label_change_revision('save',p_revision_id,p_expected_version,p_input,p_request_id);
$$;
create function public.submit_label_draft(p_revision_id integer,p_expected_version integer,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
 select public.label_change_revision('submit',p_revision_id,p_expected_version,null,p_request_id);
$$;
create function public.publish_label_draft(p_revision_id integer,p_expected_version integer,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
 select public.label_change_revision('publish',p_revision_id,p_expected_version,null,p_request_id);
$$;
create function public.discard_label_draft(p_revision_id integer,p_expected_version integer,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
 select public.label_change_revision('discard',p_revision_id,p_expected_version,null,p_request_id);
$$;

create function public.label_change_reference_archive(p_reference_id integer,p_expected_version integer,p_archived boolean,p_request_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
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
$$;
create function public.archive_label_reference(p_reference_id integer,p_expected_version integer,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
 select public.label_change_reference_archive(p_reference_id,p_expected_version,true,p_request_id);
$$;
create function public.restore_label_reference(p_reference_id integer,p_expected_version integer,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
 select public.label_change_reference_archive(p_reference_id,p_expected_version,false,p_request_id);
$$;

-- Ausschließlich explizite RPCs sind aufrufbar. Alle internen Funktionen bleiben gesperrt.
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
