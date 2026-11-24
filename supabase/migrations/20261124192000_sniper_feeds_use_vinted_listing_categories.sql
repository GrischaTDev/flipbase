-- Zweck: Persönliche Vinted-Feeds und ihre Quellenkapazität lesen ausschließlich
-- aus dem zentralen Vinted-Katalog (`public.vinted_listing_categories`), sodass
-- die gesamte Anwendung denselben Kategoriebaum verwendet.
-- Betroffene Funktionen: set_sniper_watchlist_active, save_sniper_watchlist,
-- sniper_feed_search, sniper_feed_capacity.

create or replace function public.set_sniper_watchlist_active(p_workspace_id uuid, p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_user uuid := (select auth.uid());
    v_feed public.sniper_watchlists;
    v_keys text[];
    v_search text;
    v_new_categories integer;
    v_running_categories integer;
    v_limit integer;
begin
    if v_user is null or not public.sniper_can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_active is null then
        raise exception 'Feed-Status fehlt.' using errcode = '22023';
    end if;
    perform public.lock_sniper_feed_changes();
    select * into v_feed from public.sniper_watchlists
    where id = p_id and workspace_id = p_workspace_id and user_id = v_user for update;
    if not found then
        raise exception 'Feed nicht gefunden.' using errcode = '42501';
    end if;
    if v_feed.is_active = p_active then return; end if;
    if not p_active then
        update public.sniper_watchlists set is_active = false, started_at = null where id = p_id;
        return;
    end if;

    v_search := nullif(btrim(regexp_replace(lower(v_feed.search_text), '[[:space:]]+', ' ', 'g')), '');
    if v_feed.catalog_id is not null and not exists (
        select 1 from public.vinted_listing_categories where id = v_feed.catalog_id
    ) then
        raise exception 'Bitte wähle eine verfügbare Vinted-Kategorie.' using errcode = '22023';
    end if;
    if v_feed.catalog_id is null and v_feed.brand is null and (v_search is null or length(v_search) < 3) then
        raise exception 'Bitte wähle eine Marke, eine Kategorie oder einen Suchbegriff mit mindestens drei Zeichen.'
            using errcode = '22023';
    end if;
    if (select count(*) from public.sniper_watchlists where user_id = v_user and is_active) >= 12 then
        raise exception 'Du kannst höchstens zwölf Vinted-Feeds gleichzeitig starten.' using errcode = '54000';
    end if;

    v_keys := public.sniper_watchlist_source_keys(v_feed.catalog_id, v_feed.audience, v_feed.brand_id);
    select count(*) into v_new_categories from unnest(v_keys) as wanted(source_key)
    where wanted.source_key like 'vinted-source|category|%'
      and not exists (
          select 1 from public.sniper_needed_feed_sources as needed where needed.key = wanted.source_key
      );
    if v_new_categories > 0 then
        select max_category_sources into v_limit from public.sniper_feed_settings where id = 1;
        select count(*) into v_running_categories from public.sniper_needed_feed_sources
        where key like 'vinted-source|category|%';
        if v_running_categories + v_new_categories > coalesce(v_limit, 10) then
            raise exception 'Diese Kategorie ist gerade ausgelastet. Starte einen Feed ohne Kategorie oder versuche es später.'
                using errcode = '54000';
        end if;
    end if;

    perform public.ensure_sniper_feed_sources(v_keys);
    update public.sniper_watchlists set is_active = true, started_at = clock_timestamp() where id = p_id;
end;
$$;

create or replace function public.save_sniper_watchlist(
    p_workspace_id uuid, p_id uuid, p_title text, p_catalog_id integer, p_brand text,
    p_search_text text, p_price_from numeric, p_price_to numeric, p_condition text,
    p_audience text, p_sizes text[], p_brand_id integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_user uuid := (select auth.uid());
    v_existing public.sniper_watchlists;
    v_id uuid;
    v_restart boolean;
begin
    if v_user is null or not public.sniper_can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    p_title := btrim(p_title);
    p_brand := nullif(btrim(p_brand), '');
    p_search_text := nullif(btrim(p_search_text), '');
    p_condition := nullif(btrim(p_condition), '');
    if coalesce(length(p_title), 0) not between 1 and 100
        or length(p_brand) > 100 or length(p_search_text) > 200 or length(p_condition) > 100
        or p_brand_id <= 0 then
        raise exception 'Name oder Suchkriterien sind ungültig.' using errcode = '22023';
    end if;
    if p_brand_id is not null and p_brand is null then
        raise exception 'Bitte wähle die Marke aus.' using errcode = '22023';
    end if;
    if p_catalog_id is not null and not exists (select 1 from public.vinted_listing_categories where id = p_catalog_id) then
        raise exception 'Bitte wähle eine verfügbare Vinted-Kategorie.' using errcode = '22023';
    end if;
    if p_audience not in ('women', 'men', 'both') or p_sizes is null or cardinality(p_sizes) > 7
        or not p_sizes <@ array['xs', 's', 'm', 'l', 'xl', 'xxl', '3xl'] then
        raise exception 'Zielgruppe oder Größe sind ungültig.' using errcode = '22023';
    end if;
    if (p_price_from is not null and (p_price_from not between 0 and 9999999999.99 or round(p_price_from, 2) <> p_price_from))
        or (p_price_to is not null and (p_price_to not between 0 and 9999999999.99 or round(p_price_to, 2) <> p_price_to))
        or p_price_from > p_price_to then
        raise exception 'Bitte gib gültige Preisgrenzen an.' using errcode = '22023';
    end if;
    select coalesce(array_agg(size order by size), '{}') into p_sizes
    from (select distinct unnest(p_sizes) as size) as normalized;
    perform public.lock_sniper_feed_changes();
    if p_id is null then
        insert into public.sniper_watchlists(workspace_id, user_id, title, catalog_id, brand, brand_id,
            search_text, price_from, price_to, condition, audience, sizes)
        values (p_workspace_id, v_user, p_title, p_catalog_id, p_brand, p_brand_id,
            p_search_text, p_price_from, p_price_to, p_condition, p_audience, p_sizes)
        returning id into v_id;
        return v_id;
    end if;
    select * into v_existing from public.sniper_watchlists
    where id = p_id and workspace_id = p_workspace_id and user_id = v_user for update;
    if not found then
        raise exception 'Feed nicht gefunden.' using errcode = '42501';
    end if;
    if p_brand_id is null and p_brand is not distinct from v_existing.brand then
        p_brand_id := v_existing.brand_id;
    end if;
    v_restart := v_existing.is_active and
        (v_existing.catalog_id, v_existing.brand, v_existing.brand_id, v_existing.search_text,
         v_existing.price_from, v_existing.price_to, v_existing.condition, v_existing.audience, v_existing.sizes)
        is distinct from (p_catalog_id, p_brand, p_brand_id, p_search_text,
         p_price_from, p_price_to, p_condition, p_audience, p_sizes);
    if v_restart then perform public.set_sniper_watchlist_active(p_workspace_id, p_id, false); end if;
    update public.sniper_watchlists set title = p_title, catalog_id = p_catalog_id, brand = p_brand,
        brand_id = p_brand_id, search_text = p_search_text, price_from = p_price_from, price_to = p_price_to,
        condition = p_condition, audience = p_audience, sizes = p_sizes,
        legacy_brand_id = case when p_brand is not distinct from v_existing.brand and p_brand_id is null then legacy_brand_id end
    where id = p_id;
    if v_restart then perform public.set_sniper_watchlist_active(p_workspace_id, p_id, true); end if;
    return p_id;
end;
$$;

create or replace function public.sniper_feed_search(
    p_workspace_id uuid, p_watchlist_id uuid, p_brand text, p_size text, p_min_price numeric,
    p_max_price numeric, p_before_time timestamptz, p_before_id uuid, p_limit integer,
    p_title_query text, p_catalog_id integer, p_audience text, p_sizes text[],
    p_query_id uuid, p_after_time timestamptz
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_user uuid := (select auth.uid());
    v_feed public.sniper_watchlists;
    v_source_ids uuid[];
    v_source_count integer;
    v_covered boolean;
    v_title_query tsquery;
    v_feed_query tsquery;
    v_audience integer[];
    v_saved_audience integer[];
    v_window_start timestamptz;
    v_last_checked_at timestamptz;
    v_rows jsonb := '[]';
    v_reported_at timestamptz;
begin
    if v_user is null or not public.sniper_can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_query_id is not null then
        raise exception 'Wähle Deinen persönlichen Feed.' using errcode = '22023';
    end if;
    if p_limit is null or p_limit not between 1 and 100
        or (p_before_time is null) <> (p_before_id is null)
        or (p_before_time is not null and p_after_time is not null)
        or length(p_title_query) > 200 or length(p_brand) > 100
        or p_audience not in ('women','men','both')
        or p_size not in ('xs','s','m','l','xl','xxl','3xl')
        or p_sizes is null or cardinality(p_sizes) > 7
        or not p_sizes <@ array['xs','s','m','l','xl','xxl','3xl']
        or (p_min_price is not null and p_min_price not between 0 and 9999999999.99)
        or (p_max_price is not null and p_max_price not between 0 and 9999999999.99)
        or p_min_price > p_max_price then
        raise exception 'Ungültige Suchanfrage.' using errcode = '22023';
    end if;
    if p_watchlist_id is null then
        return jsonb_build_object('items', v_rows, 'covered', false, 'reported_at', null, 'last_checked_at', null);
    end if;
    select * into v_feed from public.sniper_watchlists
    where id = p_watchlist_id and workspace_id = p_workspace_id and user_id = v_user;
    if not found then raise exception 'Feed nicht gefunden.' using errcode = '42501'; end if;
    if not v_feed.is_active then
        return jsonb_build_object('items', v_rows, 'covered', false, 'reported_at', null, 'last_checked_at', null);
    end if;

    select array_agg(query.id), count(*), max(query.last_success_at),
        coalesce(bool_and(query.is_active and query.deleted_at is null and query.run_state <> 'invalid'
            and query.coverage_status <> 'limited'
            and query.last_success_at >= now() - make_interval(secs => greatest(60, query.poll_interval_ms * 2 / 1000) + 30)
        ), false)
    into v_source_ids, v_source_count, v_last_checked_at, v_covered
    from public.sniper_queries as query
    where query.query_key = any(public.sniper_watchlist_source_keys(v_feed.catalog_id, v_feed.audience, v_feed.brand_id));
    if v_source_count = 0 then
        return jsonb_build_object('items', v_rows, 'covered', false, 'reported_at', null, 'last_checked_at', null);
    end if;

    if nullif(btrim(p_title_query), '') is not null then
        select string_agg(quote_literal(lexeme) || ':*', ' & ')::tsquery
        into v_title_query
        from unnest(tsvector_to_array(to_tsvector('simple', p_title_query))) as lexeme;
    end if;
    if nullif(btrim(v_feed.search_text), '') is not null then
        select string_agg(quote_literal(lexeme) || ':*', ' & ')::tsquery
        into v_feed_query
        from unnest(tsvector_to_array(to_tsvector('simple', v_feed.search_text))) as lexeme;
    end if;
    v_audience := case p_audience when 'women' then array[1904] when 'men' then array[5]
        when 'both' then array[1904, 5] end;
    v_saved_audience := case v_feed.audience when 'women' then array[1904] when 'men' then array[5]
        when 'both' then array[1904, 5] end;
    v_window_start := now() - interval '10 minutes';

    with recursive category_tree(root_id, id) as (
        select root, root from unnest(array_remove(
            array[p_catalog_id, v_feed.catalog_id] || v_audience || v_saved_audience, null)) as root
        union
        select tree.root_id, child.id from category_tree as tree
        join public.vinted_listing_categories as child on child.parent_id = tree.id
    ), matched as (
        select matched.listing_id, min(source.catalog_id) as source_catalog_id
        from public.sniper_query_matches as matched
        join public.sniper_queries as source on source.id = matched.query_id
        where matched.query_id = any(v_source_ids)
          and matched.first_matched_at >= v_window_start
          and not matched.is_seed
        group by matched.listing_id
    ), live as materialized (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price,
            listing.total_price, listing.currency, listing.brand, listing.size, listing.condition,
            listing.is_hidden, listing.first_seen_at, listing.catalog_id, listing.country_code,
            case
                when category.id is null then null
                when category.path = '' then category.title
                else category.path || ' > ' || category.title
            end as category_path,
            coalesce(listing.catalog_id, matched.source_catalog_id) as effective_catalog_id
        from matched
        join public.sniper_listings as listing on listing.id = matched.listing_id
        left join public.vinted_listing_categories as category on category.id = listing.catalog_id
        where listing.first_seen_at >= v_window_start
          and not listing.is_initial_stock
          and (v_feed.brand is null or lower(btrim(listing.brand)) = lower(btrim(v_feed.brand)))
          and (v_feed_query is null or to_tsvector('simple', listing.title) @@ v_feed_query)
          and (v_feed.condition is null or lower(replace(v_feed.condition, ',', '')) = lower(replace(listing.condition, ',', '')))
          and (cardinality(v_feed.sizes) = 0 or exists (
              select 1 from unnest(v_feed.sizes) as size where public.sniper_feed_matches_size(listing.size, size)
          ))
          and (v_feed.price_from is null or listing.item_price >= v_feed.price_from)
          and (v_feed.price_to is null or listing.item_price <= v_feed.price_to)
          and ((v_feed.price_from is null and v_feed.price_to is null) or listing.currency = 'EUR')
          and (
              (v_feed.catalog_id is not null and v_feed.catalog_id not in (1904, 5))
              or (v_feed.catalog_id is null and v_saved_audience is null)
              or coalesce(listing.catalog_id, matched.source_catalog_id) is null
              or exists (
                  select 1 from category_tree
                  where root_id = any(coalesce(v_saved_audience, array[v_feed.catalog_id]))
                    and id = coalesce(listing.catalog_id, matched.source_catalog_id)
              )
          )
        order by listing.first_seen_at desc, listing.id desc
        limit 100
    ), page as (
        select id, title, url, image_urls, item_price, total_price, currency, brand, size, condition,
            is_hidden, first_seen_at, catalog_id, country_code, category_path
        from live
        where (p_after_time is null or first_seen_at >= p_after_time)
          and (p_before_time is null or (first_seen_at, id) < (p_before_time, p_before_id))
          and (nullif(btrim(p_title_query), '') is null or to_tsvector('simple', title) @@ v_title_query)
          and (p_brand is null or lower(btrim(brand)) = lower(btrim(p_brand)))
          and (p_size is null or public.sniper_feed_matches_size(size, p_size))
          and (cardinality(p_sizes) = 0 or exists (
              select 1 from unnest(p_sizes) as requested_size where public.sniper_feed_matches_size(size, requested_size)
          ))
          and (p_min_price is null or item_price >= p_min_price)
          and (p_max_price is null or item_price <= p_max_price)
          and ((p_min_price is null and p_max_price is null) or currency = 'EUR')
          and (p_catalog_id is null or exists (
              select 1 from category_tree where root_id = p_catalog_id and id = live.effective_catalog_id
          ))
          and (v_audience is null or exists (
              select 1 from category_tree where root_id = any(v_audience) and id = live.effective_catalog_id
          ))
        order by first_seen_at desc, id desc
        limit p_limit
    )
    select coalesce(jsonb_agg(to_jsonb(page) order by first_seen_at desc, id desc), '[]'::jsonb) into v_rows from page;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at, 'last_checked_at', v_last_checked_at);
end;
$$;

create or replace function public.sniper_feed_capacity()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
    if not (select public.is_platform_operator()) then
        raise exception 'Nur für die Plattform-Administration.' using errcode = '42501';
    end if;
    select jsonb_build_object(
        'max_category_sources', settings.max_category_sources,
        'category_poll_interval_seconds', settings.category_poll_interval_seconds,
        'active_category_sources', (select count(*) from public.sniper_needed_feed_sources
            where key like 'vinted-source|category|%'),
        'active_brand_sources', (select count(*) from public.sniper_needed_feed_sources
            where key like 'vinted-source|brand|%'),
        'active_feeds', (select count(*) from public.sniper_watchlists where is_active),
        'requests_last_minute', status.requests_last_minute,
        'request_budget', status.request_budget,
        'reported_at', status.reported_at,
        'sources', coalesce((
            select jsonb_agg(jsonb_build_object(
                'key', query.query_key,
                'kind', split_part(query.query_key, '|', 2),
                'catalog_id', query.catalog_id,
                'brand_id', query.brand_id,
                'category_path', coalesce(
                    case
                        when category.id is null then null
                        when category.path = '' then category.title
                        else category.path || ' > ' || category.title
                    end,
                    query.brand_names[1]
                ),
                'feed_count', needed.feed_count,
                'last_success_at', query.last_success_at,
                'coverage_status', query.coverage_status,
                'run_state', query.run_state,
                'last_status', query.last_status
            ) order by split_part(query.query_key, '|', 2), coalesce(
                case
                    when category.id is null then null
                    when category.path = '' then category.title
                    else category.path || ' > ' || category.title
                end,
                query.brand_names[1]
            ))
            from public.sniper_queries as query
            join public.sniper_needed_feed_sources as needed on needed.key = query.query_key
            left join public.vinted_listing_categories as category on category.id = query.catalog_id
            where query.is_active and query.deleted_at is null
        ), '[]'::jsonb)
    ) into v_result
    from public.sniper_feed_settings as settings
    left join public.sniper_runtime_status as status on status.id = 1
    where settings.id = 1;
    return v_result;
end;
$$;
