-- Quellengebundene Größentabellen. Entwurfsänderungen überschreiben keine Veröffentlichung.
create table public.size_references (
    id integer generated always as identity primary key,
    label_brand_id integer references public.label_brands(id),
    content jsonb not null,
    published_content jsonb,
    archived boolean not null default false,
    version integer not null default 1,
    created_at timestamptz not null default now(),
    check (version > 0)
);
comment on table public.size_references is 'Globale Größenreferenzen mit getrenntem Entwurf und freigegebenem Inhalt.';
create index size_references_brand_idx on public.size_references(label_brand_id);
alter table public.size_references enable row level security;
revoke all on public.size_references from public,anon,authenticated,service_role;
grant select on public.size_references to authenticated;
revoke all on sequence public.size_references_id_seq from public,anon,authenticated,service_role;
create policy "Betreiber lesen Größentabellen" on public.size_references for select to authenticated
    using ((select public.is_platform_operator()));

create function public.validate_size_reference(p_content jsonb,p_publish boolean)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
$$;
revoke all on function public.validate_size_reference(jsonb,boolean) from public,anon,authenticated,service_role;

create function public.save_size_reference(p_id integer,p_expected_version integer,p_brand_id integer,
    p_content jsonb,p_publish boolean,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
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
$$;
revoke all on function public.save_size_reference(integer,integer,integer,jsonb,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_size_reference(integer,integer,integer,jsonb,boolean,uuid) to authenticated;

create function public.list_size_references(p_admin boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;
revoke all on function public.list_size_references(boolean) from public,anon,authenticated,service_role;
grant execute on function public.list_size_references(boolean) to authenticated;

create function public.archive_size_reference(p_id integer,p_expected_version integer,p_archived boolean,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
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
$$;
revoke all on function public.archive_size_reference(integer,integer,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.archive_size_reference(integer,integer,boolean,uuid) to authenticated;

-- Auch eine eigenständig veröffentlichte Größentabelle kann den Leserzugang eröffnen.
create or replace function public.label_library_has_publication()
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from public.label_references r where public.label_reference_is_published(r.id))
 or exists(select 1 from public.size_references s left join public.label_brands b on b.id=s.label_brand_id
   where s.published_content is not null and not s.archived and coalesce(b.archived,false)=false);
$$;
revoke all on function public.label_library_has_publication() from public,anon,authenticated,service_role;
