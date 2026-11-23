-- 5-Sekunden-Standardtakt für Kategorie- und Markenquellen, sofortige Anzeige
-- frischer Artikel der letzten zehn Minuten beim Start und Rückgabe von last_checked_at.
-- Betroffen:
--   public.sniper_feed_settings: Standardtakt 5 s, Bereich 5 bis 3600 s.
--   public.sniper_queries: laufende und ruhende Kategorie-/Markenquellen auf 5 s.
--   public.ensure_sniper_feed_sources, public.sniper_feed_search, public.set_sniper_feed_settings.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set local check_function_bodies = false;

do $$
declare
    v_attempt integer := 0;
begin
    loop
        v_attempt := v_attempt + 1;
        begin
            lock table public.sniper_feed_settings, public.sniper_queries in access exclusive mode nowait;
            exit;
        exception when lock_not_available then
            if v_attempt >= 600 then
                raise exception 'Die Sniper-Tabellen waren 120 Sekunden lang nicht frei.' using errcode = '55P03';
            end if;
            perform pg_catalog.pg_sleep(0.2);
        end;
    end loop;
end;
$$;

alter table public.sniper_feed_settings
    drop constraint if exists sniper_feed_settings_category_poll_interval_seconds_check,
    alter column category_poll_interval_seconds set default 5,
    add constraint sniper_feed_settings_category_poll_interval_seconds_check
        check (category_poll_interval_seconds between 5 and 3600);

update public.sniper_feed_settings
set category_poll_interval_seconds = 5, updated_at = now()
where id = 1 and category_poll_interval_seconds > 5;

update public.sniper_queries
set poll_interval_ms = 5000, updated_at = now()
where (query_key like 'vinted-source|category|%' or query_key like 'vinted-source|brand|%')
  and poll_interval_ms > 5000;

create or replace function public.ensure_sniper_feed_sources(p_keys text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_key text;
    v_kind text;
    v_target_id integer;
    v_brand_name text;
    v_interval integer;
begin
    select category_poll_interval_seconds * 1000 into v_interval
    from public.sniper_feed_settings where id = 1;
    foreach v_key in array p_keys loop
        v_kind := split_part(v_key, '|', 2);
        v_target_id := split_part(v_key, '|', 3)::integer;
        if v_kind = 'brand' then
            select min(btrim(brand)) into v_brand_name
            from public.sniper_watchlists
            where brand_id = v_target_id and nullif(btrim(brand), '') is not null;
            v_brand_name := coalesce(v_brand_name, 'Marke #' || v_target_id::text);
        else
            v_brand_name := null;
        end if;
        insert into public.sniper_queries (
            query_key, title, catalog_id, brand_id, brand_ids, brand_names,
            filter_format_version, poll_interval_ms, is_active, next_attempt_at
        ) values (
            v_key,
            case
                when v_kind = 'main' then 'Vinted-Hauptquelle'
                when v_kind = 'brand' then 'Vinted-Markenquelle'
                else 'Vinted-Kategoriequelle'
            end,
            case when v_kind = 'brand' then null else v_target_id end,
            case when v_kind = 'brand' then v_target_id end,
            case when v_kind = 'brand' then array[v_target_id] else '{}'::integer[] end,
            case when v_kind = 'brand' then array[v_brand_name] else '{}'::text[] end,
            1,
            case when v_kind = 'main' then 5000 else coalesce(v_interval, 5000) end,
            true, now()
        ) on conflict (query_key) do nothing;
        update public.sniper_queries
        set is_active = true, deleted_at = null, next_attempt_at = coalesce(next_attempt_at, now()),
            poll_interval_ms = case when v_kind = 'main' then 5000 else coalesce(v_interval, 5000) end,
            brand_names = case
                when v_kind = 'brand' and cardinality(brand_ids) = 1 then array[v_brand_name]
                else brand_names
            end,
            updated_at = now()
        where query_key = v_key and (not is_active or deleted_at is not null or run_state = 'invalid');
        update public.sniper_queries set run_state = 'ready', next_attempt_at = now()
        where query_key = v_key and run_state = 'invalid';
    end loop;
end;
$$;
revoke all on function public.ensure_sniper_feed_sources(text[]) from public, anon, authenticated;

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

    -- Abgedeckt ist ein Feed nur, wenn jede Quelle läuft, aufholt und kürzlich erfolgreich war.
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
        join public.vinted_categories as child on child.parent_id = tree.id
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
            category.path as category_path,
            coalesce(listing.catalog_id, matched.source_catalog_id) as effective_catalog_id
        from matched
        join public.sniper_listings as listing on listing.id = matched.listing_id
        left join public.vinted_categories as category on category.id = listing.catalog_id
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
revoke all on function public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer, text, integer, text, text[], uuid, timestamptz) from public, anon;
grant execute on function public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer, text, integer, text, text[], uuid, timestamptz) to authenticated;

create or replace function public.set_sniper_feed_settings(
    p_max_category_sources integer, p_category_poll_interval_seconds integer
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    if not (select public.is_platform_operator()) then
        raise exception 'Nur für die Plattform-Administration.' using errcode = '42501';
    end if;
    if p_max_category_sources is null or p_max_category_sources not between 0 and 500
        or p_category_poll_interval_seconds is null
        or p_category_poll_interval_seconds not between 5 and 3600 then
        raise exception 'Ungültige Feed-Einstellungen.' using errcode = '22023';
    end if;
    perform public.lock_sniper_feed_changes();
    update public.sniper_feed_settings
    set max_category_sources = p_max_category_sources,
        category_poll_interval_seconds = p_category_poll_interval_seconds,
        updated_at = now(), updated_by = (select auth.uid())
    where id = 1;
    update public.sniper_queries set poll_interval_ms = p_category_poll_interval_seconds * 1000, updated_at = now()
    where query_key like 'vinted-source|category|%' or query_key like 'vinted-source|brand|%';
end;
$$;
revoke all on function public.set_sniper_feed_settings(integer, integer) from public, anon, authenticated;
grant execute on function public.set_sniper_feed_settings(integer, integer) to authenticated;
