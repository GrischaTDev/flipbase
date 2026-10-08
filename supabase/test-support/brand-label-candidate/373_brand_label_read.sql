-- SQL-Kandidat für Leserabfragen; keine registrierte Release-Migration.
-- Benötigt 370_brand_labels.sql sowie beide 371-Dateien.
-- Nur aktuelle Veröffentlichungen projizieren. Keine Originalpfade/Nachweise.

create function public.label_validate_read_filter(p_filter jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
$$;

create function public.label_reader_card(p_reference_id integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('referenceId',r.id,'revisionId',v.id,'brandSlug',b.slug,'labelSlug',r.slug,
  'title',v.content->>'title','timeSummary',v.content->>'timeSummary','shortFeature',v.content#>>'{features,0}',
  'coverAssetId',(select i.label_image_asset_id from public.label_revision_images as i
   where i.label_revision_id=v.id order by i.position limit 1))
 from public.label_references as r
 join public.label_revisions as v on v.id=r.published_revision_id
 join public.label_brands as b on b.id=r.label_brand_id
 where r.id=p_reference_id;
$$;

create function public.list_label_references(p_filter jsonb,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

create function public.get_label_reference(p_brand_slug text,p_label_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

create function public.set_label_library_enabled(p_enabled boolean,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare args jsonb:=jsonb_build_object('enabled',p_enabled); cached jsonb;
begin
 cached:=public.label_begin_edit('library-enabled',p_request_id,args);
 if cached is not null then return cached; end if;
 perform public.label_assert(p_enabled is not null,'invalid-value','enabled');
 if p_enabled then
  perform public.label_assert(exists(select 1 from public.label_references as r
   where public.label_reference_is_published(r.id)),'publication-required','enabled');
 end if;
 update public.label_library_settings set reader_enabled=p_enabled,catalog_version=catalog_version+1
 where id=1 and reader_enabled is distinct from p_enabled;
 return public.label_finish_edit('library-enabled',p_request_id,args,public.get_label_library_availability());
end;
$$;

revoke all on function public.label_validate_read_filter(jsonb),public.label_reader_card(integer)
 from public,anon,authenticated,service_role;
revoke all on function public.list_label_references(jsonb,integer),public.get_label_reference(text,text),
 public.set_label_library_enabled(boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_label_references(jsonb,integer),public.get_label_reference(text,text),
 public.set_label_library_enabled(boolean,uuid) to authenticated;
