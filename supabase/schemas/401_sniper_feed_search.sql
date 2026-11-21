-- Die Suche filtert auf dem Server vor der Seitengrenze. Mehrere Wörter gelten gemeinsam.
create index sniper_listings_title_search_idx on public.sniper_listings using gin (to_tsvector('simple', coalesce(title,'')));

create or replace function public.save_sniper_watchlist(
    p_workspace_id uuid, p_id uuid, p_title text, p_catalog_id integer, p_brand text,
    p_search_text text, p_price_from numeric, p_price_to numeric, p_condition text,
    p_audience text, p_sizes text[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_id uuid;
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_catalog_id is not null and not exists (
        select 1 from public.vinted_categories where id = p_catalog_id
    ) then raise exception 'Bitte eine vorhandene Kategorie wählen.' using errcode = '22023'; end if;
    if length(coalesce(p_brand, '')) > 100 or length(coalesce(p_search_text, '')) > 200
       or length(coalesce(p_condition, '')) > 100 then
        raise exception 'Suchkriterien sind zu lang.' using errcode = '22023';
    end if;
    if p_audience not in ('women', 'men', 'both') then
        raise exception 'Ungültige Zielgruppe.' using errcode = '22023';
    end if;
    if p_sizes is null or cardinality(p_sizes) > 7
       or not p_sizes <@ array['xs', 's', 'm', 'l', 'xl', 'xxl', '3xl'] then
        raise exception 'Ungültige Größe.' using errcode = '22023';
    end if;
    if p_id is null then
        insert into public.sniper_watchlists(workspace_id, title, catalog_id, brand, search_text,
            price_from, price_to, condition, audience, sizes)
        values (p_workspace_id, btrim(p_title), p_catalog_id, nullif(btrim(p_brand), ''),
            nullif(btrim(p_search_text), ''), p_price_from, p_price_to,
            nullif(btrim(p_condition), ''), p_audience, p_sizes)
        returning id into v_id;
    else
        update public.sniper_watchlists set title = btrim(p_title), catalog_id = p_catalog_id,
            brand = nullif(btrim(p_brand), ''), search_text = nullif(btrim(p_search_text), ''),
            price_from = p_price_from, price_to = p_price_to, condition = nullif(btrim(p_condition), ''),
            audience = p_audience, sizes = p_sizes,
            legacy_brand_id = case when nullif(btrim(p_brand), '') is not null then null else legacy_brand_id end
        where id = p_id and workspace_id = p_workspace_id returning id into v_id;
        if v_id is null then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;
    return v_id;
end;
$$;
revoke all on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,text,text[]) from public, anon;
grant execute on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,text,text[]) to authenticated;

create or replace function public.sniper_listing_has_source(
    p_listing_id uuid, p_discovered_by uuid, p_source_ids uuid[]
)
returns boolean language sql stable security invoker set search_path = '' as $$
    select coalesce(p_discovered_by = any(p_source_ids), false) or exists (
        select 1 from public.sniper_query_matches as matched
        where matched.listing_id = p_listing_id and matched.query_id = any(p_source_ids)
    );
$$;
revoke all on function public.sniper_listing_has_source(uuid,uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.sniper_listing_has_source(uuid,uuid,uuid[]) to service_role;

create or replace function public.sniper_feed_search(
    p_workspace_id uuid, p_watchlist_id uuid, p_brand text, p_size text, p_min_price numeric,
    p_max_price numeric, p_before_time timestamptz, p_before_id uuid, p_limit integer,
    p_title_query text, p_catalog_id integer, p_audience text, p_sizes text[],
    p_query_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
    v_watchlist public.sniper_watchlists;
    v_query public.sniper_queries;
    v_has_title_query boolean := nullif(btrim(p_title_query), '') is not null;
    v_title_query tsquery;
    v_rows jsonb;
    v_covered boolean;
    v_reported_at timestamptz;
    v_audience_roots integer[];
    v_saved_audience_roots integer[];
    v_category_ids integer[];
    v_audience_ids integer[];
    v_category_sources uuid[];
    v_audience_sources uuid[];
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_limit is null or p_limit not between 1 and 100
        or (p_before_time is null) <> (p_before_id is null) then
        raise exception 'Ungueltige Seitengroesse oder Position.' using errcode = '22023';
    end if;
    if p_title_query is not null and length(p_title_query) > 200 then
        raise exception 'Die Titelsuche darf höchstens 200 Zeichen enthalten.' using errcode = '22023';
    end if;
    if p_brand is not null and length(btrim(p_brand)) not between 1 and 100 then
        raise exception 'Ungueltige Marke.' using errcode = '22023';
    end if;
    if p_size is not null and p_size not in ('xs', 's', 'm', 'l', 'xl', 'xxl', '3xl') then
        raise exception 'Ungueltige Groesse.' using errcode = '22023';
    end if;
    if p_sizes is null or cardinality(p_sizes) > 7
       or not p_sizes <@ array['xs', 's', 'm', 'l', 'xl', 'xxl', '3xl'] then
        raise exception 'Ungültige Größe.' using errcode = '22023';
    end if;
    if p_audience not in ('women', 'men', 'both') then
        raise exception 'Ungültige Zielgruppe.' using errcode = '22023';
    end if;
    if p_min_price::text in ('NaN', 'Infinity', '-Infinity')
        or p_max_price::text in ('NaN', 'Infinity', '-Infinity')
        or p_min_price < 0 or p_max_price < 0 or p_min_price > p_max_price then
        raise exception 'Ungueltige Preisgrenzen.' using errcode = '22023';
    end if;
    if v_has_title_query then
        -- Wortanfang-Suche je Suchwort über den bestehenden GIN-Index (z. B. CARH -> Carhartt).
        select coalesce(
            string_agg(
                '''' || replace(replace(lexeme, '\', '\\'), '''', '''''') || ''':*',
                ' & '
            )::tsquery,
            ''::tsquery
        )
        into v_title_query
        from unnest(tsvector_to_array(to_tsvector('simple', p_title_query))) as lexeme;
    end if;
    if p_query_id is not null then
        select * into v_query from public.sniper_queries
        where id = p_query_id and marketplace = 'vinted' and deleted_at is null;
        if not found then
            raise exception 'Vinted-Bot nicht gefunden.' using errcode = '22023';
        end if;
    end if;
    if p_watchlist_id is not null then
        select * into v_watchlist from public.sniper_watchlists
        where id = p_watchlist_id and workspace_id = p_workspace_id;
        if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;
    if v_watchlist.catalog_id is not null or v_watchlist.audience is not null
        or p_catalog_id is not null or p_audience is not null then
        -- Die Vinted-Wurzelkennungen gehören zur Taxonomie, unabhängig von der Anzeigesprache.
        v_audience_roots := case p_audience
            when 'women' then array[1904] when 'men' then array[5] when 'both' then array[1904, 5]
        end;
        v_saved_audience_roots := case v_watchlist.audience
            when 'women' then array[1904] when 'men' then array[5] when 'both' then array[1904, 5]
        end;
        with recursive branches(root_id, id) as (
            select root.id, root.id
            from unnest(array[p_catalog_id, v_watchlist.catalog_id]
                || v_audience_roots || v_saved_audience_roots) as root(id)
            where root.id is not null
            union
            select branch.root_id, child.id
            from branches as branch join public.vinted_categories as child on child.parent_id = branch.id
        )
        select
            case when p_catalog_id is not null or v_watchlist.catalog_id is not null then array(
                select id from branches group by id
                having (p_catalog_id is null or bool_or(root_id = p_catalog_id))
                    and (v_watchlist.catalog_id is null or bool_or(root_id = v_watchlist.catalog_id))
            ) end,
            case when v_audience_roots is not null or v_saved_audience_roots is not null then array(
                select id from branches group by id
                having (v_audience_roots is null or bool_or(root_id = any(v_audience_roots)))
                    and (v_saved_audience_roots is null or bool_or(root_id = any(v_saved_audience_roots)))
            ) end
        into v_category_ids, v_audience_ids;

        -- Eine Sammelzuordnung belegt den abgefragten Zweig. Eine Blattkategorie
        -- darf nur aus der bestätigten Artikelkategorie stammen.
        select array_agg(query.id) filter (where query.catalog_id = any(v_category_ids)),
            array_agg(query.id) filter (where query.catalog_id = any(v_audience_ids))
        into v_category_sources, v_audience_sources
        from public.sniper_queries as query
        join public.vinted_categories as source_category on source_category.id = query.catalog_id
        where query.marketplace = 'vinted' and not source_category.is_leaf;
    end if;
    select coalesce(jsonb_agg(to_jsonb(page) order by page.first_seen_at desc, page.id desc), '[]'::jsonb)
    into v_rows from (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price, listing.total_price,
            listing.currency, listing.brand, listing.size, listing.condition, listing.is_hidden, listing.first_seen_at,
            listing.catalog_id, category.path as category_path
        from public.sniper_listings as listing
        left join public.vinted_categories as category on category.id = listing.catalog_id
        where listing.first_seen_at >= now() - interval '3 days'
            and not listing.is_initial_stock
            and (p_before_time is null or (listing.first_seen_at, listing.id) < (p_before_time, p_before_id))
            and (not v_has_title_query or to_tsvector('simple', coalesce(listing.title,'')) @@ v_title_query)
            and (p_brand is null or lower(btrim(listing.brand)) = lower(btrim(p_brand)))
            and (p_size is null or public.sniper_feed_matches_size(listing.size, p_size))
            and (cardinality(p_sizes) = 0 or exists (
                select 1 from unnest(p_sizes) as size
                where public.sniper_feed_matches_size(listing.size, size)))
            and (p_min_price is null or listing.item_price >= p_min_price)
            and (p_max_price is null or listing.item_price <= p_max_price)
            and ((p_min_price is null and p_max_price is null) or listing.currency = 'EUR')
            and (p_query_id is null or (
                listing.id in (
                    select matched.listing_id
                    from public.sniper_query_matches as matched
                    where matched.query_id = p_query_id
                      and matched.first_matched_at >= now() - interval '4 days'
                      and (v_query.results_reset_at is null or matched.first_matched_at >= v_query.results_reset_at)
                    union
                    select discovered.id
                    from public.sniper_listings as discovered
                    where discovered.discovered_by_query_id = p_query_id
                      and discovered.first_seen_at >= now() - interval '3 days'
                )
                and (
                    v_query.results_reset_at is null
                    or public.sniper_listing_after_reset(
                        listing.external_id, listing.first_seen_at,
                        v_query.results_reset_at, v_query.reset_baseline_external_id
                    )
                )
            ))
            and (v_category_ids is null or listing.catalog_id = any(v_category_ids)
                or (listing.catalog_id is null and cardinality(v_category_sources) > 0
                    and public.sniper_listing_has_source(listing.id, listing.discovered_by_query_id, v_category_sources)))
            and (v_audience_ids is null or listing.catalog_id = any(v_audience_ids)
                or (listing.catalog_id is null and cardinality(v_audience_sources) > 0
                    and public.sniper_listing_has_source(listing.id, listing.discovered_by_query_id, v_audience_sources)))
            and (p_watchlist_id is null or public.sniper_watchlist_matches_criteria(v_watchlist, listing))
            and (p_catalog_id is null or v_watchlist.catalog_id is not null or not exists (
                select 1 from public.sniper_queries source
                where source.id = listing.catalog_source_query_id and source.results_reset_at is not null
                  and not public.sniper_listing_after_reset(listing.external_id, listing.first_seen_at,
                      source.results_reset_at, source.reset_baseline_external_id)))
        order by listing.first_seen_at desc, listing.id desc limit p_limit
    ) as page;
    select exists(select 1 from public.sniper_queries as query where query.is_active
        and query.deleted_at is null
        and query.run_state <> 'invalid'
        and (p_query_id is null or query.id = p_query_id)
        and (v_category_ids is null or query.catalog_id is null or query.catalog_id = any(v_category_ids))
        and (v_audience_ids is null or query.catalog_id is null or query.catalog_id = any(v_audience_ids)))
    into v_covered;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$function$;
revoke all on function public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer, text, integer, text, text[], uuid) from public, anon;
grant execute on function public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer, text, integer, text, text[], uuid) to authenticated;

create or replace function public.sniper_feed_search(p_workspace_id uuid, p_watchlist_id uuid, p_brand text, p_size text, p_min_price numeric, p_max_price numeric, p_before_time timestamptz, p_before_id uuid, p_limit integer, p_title_query text default '')
returns jsonb language sql stable security definer set search_path = '' as $function$
    select public.sniper_feed_search(p_workspace_id, p_watchlist_id, p_brand, p_size, p_min_price,
        p_max_price, p_before_time, p_before_id, p_limit, p_title_query, null, null, '{}'::text[], null);
$function$;
revoke all on function public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer, text) from public, anon;
grant execute on function public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer, text) to authenticated;
