-- Globales Marken- und Labellexikon: Rechte, Historie und Referenzverwaltung.
-- Änderungen werden über erzeugte Migrationen integriert.


create function public.list_label_admin_brands()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;
comment on function public.list_label_admin_brands() is
    'Betreiberansicht der Referenzmarken und Linien einschließlich Archivstatus.';
revoke all on function public.list_label_admin_brands() from public, anon, authenticated, service_role;
grant execute on function public.list_label_admin_brands() to authenticated;

create function public.list_label_admin_references(p_filter jsonb, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;
comment on function public.list_label_admin_references(jsonb, integer) is
    'Seitengenaue Betreiberübersicht. Archivstatus, Entwurf und Veröffentlichung bleiben unterscheidbar.';
revoke all on function public.list_label_admin_references(jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.list_label_admin_references(jsonb, integer) to authenticated;

create function public.get_label_admin_reference(p_reference_id integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;
comment on function public.get_label_admin_reference(integer) is
    'Lädt Entwurf und aktuelle Veröffentlichung getrennt, ohne eine Bearbeitung anzulegen.';
revoke all on function public.get_label_admin_reference(integer) from public, anon, authenticated, service_role;
grant execute on function public.get_label_admin_reference(integer) to authenticated;

create function public.save_label_brand_line(
    p_id integer, p_expected_version integer, p_input jsonb, p_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
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
$$;
comment on function public.save_label_brand_line(integer, integer, jsonb, uuid) is
    'Betreiberpflege mit Versionsprüfung und Wiederholungsbeleg. Referenzmarke und Historie bleiben erhalten.';
revoke all on function public.save_label_brand_line(integer, integer, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_label_brand_line(integer, integer, jsonb, uuid) to authenticated;
