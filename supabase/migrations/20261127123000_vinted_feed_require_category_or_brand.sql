-- Persönliche Vinted-Feeds verlangen mindestens eine konkrete Unterkategorie oder
-- eine Marke; pauschale Hauptquellen Damen (1904) und Herren (5) entfallen.
-- Zudem prüft complete_sniper_search_filter_run gegen den zentralen Katalog
-- vinted_listing_categories, und die 100-Artikel-Grenze gilt je aktivem Feed statt
-- eines pauschalen 10-/15-Minuten-Zeitfensters.
-- Betroffen:
--   public.sniper_watchlists: aktive Feeds ohne Unterkategorie und ohne Marken-ID werden gestoppt.
--   public.sniper_queries: bestehende Hauptquellen (vinted-source|main|%) werden deaktiviert;
--     fälschlich als invalid_category markierte Quellen mit gültiger Katalog-ID werden reaktiviert.
--   public.complete_sniper_search_filter_run, public.sniper_watchlist_source_keys,
--   public.ensure_sniper_feed_sources, public.set_sniper_watchlist_active,
--   public.save_sniper_watchlist, public.sniper_feed_search,
--   public.sniper_protected_feed_listing_ids, public.sniper_purge_expired_listings,
--   public.sniper_active_feed_sources.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set local check_function_bodies = false;

-- Der Sniper und der Feed greifen im Sekundentakt auf diese Tabellen zu.
-- Sperren vorab ohne Warten holen, damit die Migration nicht mit laufenden Abrufen verklemmt.
do $$
declare
    v_attempt integer := 0;
begin
    loop
        v_attempt := v_attempt + 1;
        begin
            lock table public.sniper_queries, public.sniper_watchlists in access exclusive mode nowait;
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

comment on table public.sniper_watchlists is 'Persönliche Vinted-Feeds je Benutzer und Arbeitsbereich. Aktive Feeds lesen aus gemeinsamen Kategorie- oder Markenquellen.';
comment on view public.sniper_active_feed_sources is 'Kategorie- und Markenquellen mit mindestens einem aktiven und zugangsberechtigten Feed. Nur der Sammeldienst darf sie lesen.';

-- Quellschlüssel eines Feeds. Damen (1904) und Herren (5) sind reine Wurzelkategorien
-- ohne eigene Hauptquelle: Ein Feed benötigt eine Unterkategorie oder eine Marken-ID.
create or replace function public.sniper_watchlist_source_keys(
    p_catalog_id integer, p_audience text, p_brand_id integer
)
returns text[] language sql immutable security invoker set search_path = '' as $$
    select case
        when p_catalog_id is not null and p_catalog_id not in (1904, 5)
            then array['vinted-source|category|' || p_catalog_id::text]
        when p_brand_id is not null
            then array['vinted-source|brand|' || p_brand_id::text]
        else '{}'::text[]
    end;
$$;
revoke all on function public.sniper_watchlist_source_keys(integer, text, integer) from public, anon, authenticated;
grant execute on function public.sniper_watchlist_source_keys(integer, text, integer) to service_role;

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
                when v_kind = 'brand' then 'Vinted-Markenquelle'
                else 'Vinted-Kategoriequelle'
            end,
            case when v_kind = 'brand' then null else v_target_id end,
            case when v_kind = 'brand' then v_target_id end,
            case when v_kind = 'brand' then array[v_target_id] else '{}'::integer[] end,
            case when v_kind = 'brand' then array[v_brand_name] else '{}'::text[] end,
            1,
            coalesce(v_interval, 5000),
            true, now()
        ) on conflict (query_key) do nothing;
        update public.sniper_queries
        set is_active = true, deleted_at = null, next_attempt_at = coalesce(next_attempt_at, now()),
            poll_interval_ms = coalesce(v_interval, 5000),
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

create or replace function public.set_sniper_watchlist_active(p_workspace_id uuid, p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_user uuid := (select auth.uid());
    v_feed public.sniper_watchlists;
    v_keys text[];
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

    if v_feed.catalog_id is not null and not exists (
        select 1 from public.vinted_listing_categories where id = v_feed.catalog_id
    ) then
        raise exception 'Bitte wähle eine verfügbare Vinted-Kategorie.' using errcode = '22023';
    end if;
    v_keys := public.sniper_watchlist_source_keys(v_feed.catalog_id, v_feed.audience, v_feed.brand_id);
    if cardinality(v_keys) = 0 then
        raise exception 'Bitte wähle mindestens eine Unterkategorie oder eine Marke aus.'
            using errcode = '22023';
    end if;
    if (select count(*) from public.sniper_watchlists where user_id = v_user and is_active) >= 12 then
        raise exception 'Du kannst höchstens zwölf Vinted-Feeds gleichzeitig starten.' using errcode = '54000';
    end if;

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
            raise exception 'Diese Kategorie ist gerade ausgelastet. Wähle eine Marke oder versuche es später.'
                using errcode = '54000';
        end if;
    end if;

    perform public.ensure_sniper_feed_sources(v_keys);
    update public.sniper_watchlists set is_active = true, started_at = clock_timestamp() where id = p_id;
end;
$$;
revoke all on function public.set_sniper_watchlist_active(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_sniper_watchlist_active(uuid,uuid,boolean) to authenticated;

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
        if cardinality(public.sniper_watchlist_source_keys(p_catalog_id, p_audience, p_brand_id)) = 0 then
            raise exception 'Bitte wähle mindestens eine Unterkategorie oder eine Marke aus.' using errcode = '22023';
        end if;
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
    if cardinality(public.sniper_watchlist_source_keys(p_catalog_id, p_audience, p_brand_id)) = 0 then
        raise exception 'Bitte wähle mindestens eine Unterkategorie oder eine Marke aus.' using errcode = '22023';
    end if;
    v_restart := v_existing.is_active and
        (v_existing.catalog_id, v_existing.brand, v_existing.brand_id, v_existing.search_text,
         v_existing.price_from, v_existing.price_to, v_existing.condition, v_existing.audience, v_existing.sizes)
        is distinct from (p_catalog_id, p_brand, p_brand_id, p_search_text,
         p_price_from, p_price_to, p_condition, p_audience, p_sizes);
    -- Umstellen und neuer Beginn passieren im selben Commit. Fehler lassen den alten Feed laufen.
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
revoke all on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,text,text[],integer)
    from public, anon, authenticated;
grant execute on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,text,text[],integer)
    to authenticated;

create or replace function public.complete_sniper_search_filter_run(
    p_query_id uuid, p_revision integer, p_cursor integer, p_listings jsonb, p_diagnostics jsonb default '{}'
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_query public.sniper_queries;
    v_count integer;
    v_index integer;
    v_created integer;
    v_seed boolean;
    v_newest bigint;
    v_external_ids text[];
    v_new_matches uuid[];
    v_reset_baseline text;
begin
    select * into v_query from public.sniper_queries where id = p_query_id for update;
    if not found or v_query.deleted_at is not null or not v_query.is_active
       or v_query.filter_revision is distinct from p_revision or v_query.request_cursor is distinct from p_cursor then
        return jsonb_build_object('accepted', false, 'created', 0, 'seeded', false);
    end if;
    if v_query.filter_format_version <> 1 then raise exception 'Ungültiges Suchfilterformat.' using errcode = '22023'; end if;
    if v_query.catalog_id is not null
       and not exists (select 1 from public.vinted_listing_categories where id = v_query.catalog_id)
       and not exists (select 1 from public.vinted_categories where id = v_query.catalog_id) then
        update public.sniper_queries set is_active = false, run_state = 'invalid',
            last_error_kind = 'invalid_category', last_error_message = 'Die Kategorie ist nicht mehr verfügbar.', updated_at = now() where id = p_query_id;
        return jsonb_build_object('accepted', false, 'created', 0, 'seeded', false);
    end if;
    if p_listings is null or jsonb_typeof(p_listings) <> 'array' then raise exception 'Ungültiges Artikelpaket.' using errcode = '22023'; end if;
    if jsonb_array_length(p_listings) > 288 then raise exception 'Zu viele Artikel in einem Abruf.' using errcode = '22023'; end if;
    if p_diagnostics is null or jsonb_typeof(p_diagnostics) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_diagnostics) key where key not in ('coverage','duration_ms','source_pages','shared_filter_count','baseline_external_id'))
       or (p_diagnostics ? 'baseline_external_id' and (jsonb_typeof(p_diagnostics->'baseline_external_id') <> 'string' or p_diagnostics->>'baseline_external_id' !~ '^(0|[1-9][0-9]{0,17})$'))
       or (p_diagnostics ? 'coverage' and (jsonb_typeof(p_diagnostics->'coverage') <> 'string' or p_diagnostics->>'coverage' not in ('unknown','initial','caught_up','limited')))
       or (p_diagnostics ? 'duration_ms' and (jsonb_typeof(p_diagnostics->'duration_ms') <> 'number' or (p_diagnostics->>'duration_ms')::numeric not between 0 and 86400000 or trunc((p_diagnostics->>'duration_ms')::numeric) <> (p_diagnostics->>'duration_ms')::numeric))
       or (p_diagnostics ? 'source_pages' and (jsonb_typeof(p_diagnostics->'source_pages') <> 'number' or (p_diagnostics->>'source_pages')::numeric not between 1 and 3 or trunc((p_diagnostics->>'source_pages')::numeric) <> (p_diagnostics->>'source_pages')::numeric))
       or (p_diagnostics ? 'shared_filter_count' and (jsonb_typeof(p_diagnostics->'shared_filter_count') <> 'number' or (p_diagnostics->>'shared_filter_count')::numeric not between 1 and 10000 or trunc((p_diagnostics->>'shared_filter_count')::numeric) <> (p_diagnostics->>'shared_filter_count')::numeric)) then
        raise exception 'Ungültige Abrufdiagnose.' using errcode = '22023';
    end if;
    v_reset_baseline := p_diagnostics->>'baseline_external_id';
    if v_query.results_reset_at is not null and v_query.reset_baseline_external_id is null then
        if v_reset_baseline is null then
            return jsonb_build_object('accepted', false, 'created', 0, 'seeded', false);
        end if;
        if jsonb_array_length(p_listings) <> 0 then
            raise exception 'Der erste Abruf nach einem Reset speichert nur den Ausgangsstand.' using errcode = '22023';
        end if;
        v_query.reset_baseline_external_id := v_reset_baseline;
    elsif v_reset_baseline is not null then
        raise exception 'Der Suchfilter benötigt keinen neuen Ausgangsstand.' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(item), '[]'::jsonb) into p_listings from (
        select distinct on (item->>'external_id') item
        from jsonb_array_elements(p_listings) item
        where public.sniper_search_filter_matches_title(v_query, item->>'title')
          and public.sniper_listing_after_reset(item->>'external_id', now(), v_query.results_reset_at,
              v_query.reset_baseline_external_id)
          and (v_query.results_reset_at is null or not exists (
              select 1 from public.sniper_listings existing
              where existing.marketplace = v_query.marketplace and existing.external_id = item->>'external_id'
                and existing.first_seen_at < v_query.results_reset_at))
        order by item->>'external_id'
    ) accepted;
    v_count := greatest(cardinality(v_query.brand_ids), 1) * case
        when v_query.search_text is not null or v_query.keyword_mode = 'all' then 1
        else greatest(cardinality(v_query.title_keywords), 1) end;
    if p_cursor < 0 or p_cursor >= 2147483647 then raise exception 'Ungültige Abrufposition.' using errcode = '22023'; end if;
    v_index := p_cursor % v_count;
    v_seed := not v_index = any(v_query.seeded_requests);
    select max((item->>'external_id')::bigint) into v_newest from jsonb_array_elements(p_listings) item
    where item->>'external_id' ~ '^[1-9][0-9]{0,17}$';
    if not v_seed and v_query.newest_external_id is not null then
        select coalesce(jsonb_agg(item), '[]'::jsonb) into p_listings from jsonb_array_elements(p_listings) item
        where item->>'external_id' !~ '^[1-9][0-9]{0,17}$'
           or (item->>'external_id')::bigint >= v_query.newest_external_id - 5000000;
    end if;
    perform set_config('flipbase.sniper_run', v_query.id::text || ':' || v_query.filter_revision::text, true);
    with inserted as (
        insert into public.sniper_listings(marketplace, external_id, title, url, description, image_urls,
            item_price, total_price, currency, brand, size, condition, country_code, seller_name,
            seller_avatar_url, seller_rating, seller_review_count, is_hidden, item_updated_at,
            photo_uploaded_at, discovered_by_query_id, is_initial_stock)
        select v_query.marketplace, item.external_id, item.title, item.url, item.description, coalesce(item.image_urls, '{}'),
            item.item_price, item.total_price, item.currency, item.brand, item.size, item.condition,
            item.country_code, item.seller_name, item.seller_avatar_url, item.seller_rating, item.seller_review_count,
            coalesce(item.is_hidden, false), item.item_updated_at, item.photo_uploaded_at, p_query_id, v_seed
        from jsonb_to_recordset(p_listings) item(external_id text, title text, url text, description text, image_urls text[],
            item_price numeric, total_price numeric, currency text, brand text, size text, condition text,
            country_code text, seller_name text, seller_avatar_url text, seller_rating numeric,
            seller_review_count integer, is_hidden boolean, item_updated_at timestamptz, photo_uploaded_at timestamptz)
        on conflict (marketplace, external_id) do nothing returning 1
    ) select count(*)::integer into v_created from inserted;
    select coalesce(array_agg(item->>'external_id'), '{}') into v_external_ids from jsonb_array_elements(p_listings) item;
    with matched as (
        insert into public.sniper_query_matches(query_id, listing_id, filter_revision, is_seed)
        select p_query_id, listing.id, p_revision, v_seed
        from public.sniper_listings listing
        where listing.marketplace = v_query.marketplace and listing.external_id = any(v_external_ids)
        on conflict (query_id, listing_id) do nothing returning listing_id
    ) select coalesce(array_agg(listing_id), '{}') into v_new_matches from matched;
    if not v_seed then
        update public.sniper_listings listing set is_initial_stock = false
        where listing.id = any(v_new_matches) and listing.is_initial_stock;
    end if;
    if exists (select 1 from public.vinted_listing_categories where id = v_query.catalog_id and is_leaf)
       or exists (select 1 from public.vinted_categories where id = v_query.catalog_id and is_leaf) then
        perform public.record_sniper_listing_category(p_query_id, v_external_ids);
    end if;
    if v_seed then v_query.seeded_requests := array_append(v_query.seeded_requests, v_index); end if;
    update public.sniper_queries set seeded_requests = v_query.seeded_requests,
        reset_baseline_external_id = v_query.reset_baseline_external_id,
        newest_external_id = greatest(v_query.newest_external_id, v_newest),
        is_seeded = cardinality(v_query.seeded_requests) = v_count,
        request_cursor = p_cursor + 1, run_state = 'ready', next_attempt_at = null,
        last_attempt_at = now(), last_success_at = now(), last_polled_at = now(), last_status = 'ok',
        consecutive_failures = 0, coverage_status = coalesce(p_diagnostics->>'coverage', 'unknown'),
        coverage_checked_at = now(), last_request_duration_ms = (p_diagnostics->>'duration_ms')::integer,
        shared_filter_count = coalesce((p_diagnostics->>'shared_filter_count')::integer, 1),
        updated_at = now() where id = p_query_id;
    perform set_config('flipbase.sniper_run', '', true);
    return jsonb_build_object('accepted', true, 'created', v_created, 'seeded', v_seed);
end;
$$;
revoke all on function public.complete_sniper_search_filter_run(uuid,integer,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.complete_sniper_search_filter_run(uuid,integer,integer,jsonb,jsonb) to service_role;

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
    v_window_start := now() - interval '3 days';

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

create or replace function public.sniper_protected_feed_listing_ids()
returns table (listing_id uuid)
language plpgsql stable security invoker set search_path = '' as $$
declare
    v_feed public.sniper_watchlists;
    v_source_ids uuid[];
    v_feed_query tsquery;
    v_saved_audience integer[];
    v_window_start timestamptz := now() - interval '3 days';
begin
    for v_feed in
        select feed.*
        from public.sniper_watchlists as feed
        join public.workspace_members as member
          on member.workspace_id = feed.workspace_id and member.user_id = feed.user_id
        join public.workspaces as workspace on workspace.id = feed.workspace_id
        where feed.is_active
          and workspace.archived_at is null
          and public.workspace_access_is_valid(workspace.id)
    loop
        select array_agg(query.id) into v_source_ids
        from public.sniper_queries as query
        where query.query_key = any(public.sniper_watchlist_source_keys(v_feed.catalog_id, v_feed.audience, v_feed.brand_id))
          and query.deleted_at is null;
        if v_source_ids is null or cardinality(v_source_ids) = 0 then
            continue;
        end if;
        v_feed_query := null;
        if nullif(btrim(v_feed.search_text), '') is not null then
            select string_agg(quote_literal(lexeme) || ':*', ' & ')::tsquery
            into v_feed_query
            from unnest(tsvector_to_array(to_tsvector('simple', v_feed.search_text))) as lexeme;
        end if;
        v_saved_audience := case v_feed.audience when 'women' then array[1904] when 'men' then array[5]
            when 'both' then array[1904, 5] end;

        return query
        with recursive category_tree(root_id, id) as (
            select root, root from unnest(array_remove(
                array[v_feed.catalog_id] || v_saved_audience, null)) as root
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
        )
        select listing.id
        from matched
        join public.sniper_listings as listing on listing.id = matched.listing_id
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
        limit 100;
    end loop;
end;
$$;
revoke all on function public.sniper_protected_feed_listing_ids() from public, anon, authenticated;
grant execute on function public.sniper_protected_feed_listing_ids() to service_role;

create or replace function public.sniper_purge_expired_listings(p_batch_size integer default 1000)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
    v_deleted integer;
    v_protected uuid[];
begin
    if p_batch_size is null or p_batch_size not between 1 and 5000 then
        raise exception 'Die Paketgroesse muss zwischen 1 und 5000 liegen.' using errcode = '22023';
    end if;
    if exists (
        select 1 from (select distinct workspace_id from public.sniper_watchlists where is_active) as active
        where not public.workspace_access_is_valid(active.workspace_id)
    ) and pg_catalog.pg_try_advisory_xact_lock(403, 1) then
        update public.sniper_watchlists as feed
        set is_active = false, started_at = null
        from (
            select workspace_id from (
                select distinct workspace_id from public.sniper_watchlists where is_active
            ) as active_workspaces
            where not public.workspace_access_is_valid(workspace_id)
        ) as expired_workspaces
        where feed.workspace_id = expired_workspaces.workspace_id and feed.is_active;
    end if;
    delete from public.sniper_queries
    where id in (
        select id from public.sniper_queries
        where query_key like 'vinted-source|%'
          and not is_active
          and updated_at < now() - interval '1 day'
        limit 100
    );
    select coalesce(array_agg(distinct listing_id), '{}') into v_protected
    from public.sniper_protected_feed_listing_ids();
    with expired as (
        select id from public.sniper_listings
        where first_seen_at < now() - interval '3 days'
           or (first_seen_at < now() - interval '15 minutes' and not (id = any(v_protected)))
        order by first_seen_at, id
        limit p_batch_size
        for update skip locked
    ), deleted as (
        delete from public.sniper_listings as listing using expired
        where listing.id = expired.id
        returning listing.marketplace, listing.external_id, listing.first_seen_at
    ), remembered as (
        insert into public.sniper_recent_listing_keys(marketplace, external_id, first_seen_at)
        select marketplace, external_id, first_seen_at from deleted
        where first_seen_at >= now() - interval '3 days'
        on conflict (marketplace, external_id) do nothing
    )
    select count(*)::integer into v_deleted from deleted;
    delete from public.sniper_recent_listing_keys as retained
    using (
        select marketplace, external_id from public.sniper_recent_listing_keys
        where first_seen_at < now() - interval '3 days'
        order by first_seen_at limit p_batch_size for update skip locked
    ) as expired_keys
    where retained.marketplace = expired_keys.marketplace and retained.external_id = expired_keys.external_id;
    return v_deleted;
end;
$$;
comment on function public.sniper_purge_expired_listings(integer) is
    'Entfernt nicht geschützte Feed-Karten nach 15 Minuten (und alle Karten nach 3 Tagen), behält pro aktivem Feed bis zu 100 Treffer sowie kompakte Kennungen drei Tage.';

-- Bestehende Feeds ohne Unterkategorie und ohne Marken-ID stoppen; alte Hauptquellen deaktivieren.
update public.sniper_watchlists
set is_active = false, started_at = null
where is_active
  and cardinality(public.sniper_watchlist_source_keys(catalog_id, audience, brand_id)) = 0;

update public.sniper_queries
set is_active = false, updated_at = now()
where is_active and query_key like 'vinted-source|main|%';

-- Fälschlich gegen die alte Tabelle vinted_categories als invalid_category abgeschaltete
-- Kategoriequellen reaktivieren, sofern sie im zentralen Katalog existieren und gebraucht werden.
update public.sniper_queries as query
set is_active = true,
    run_state = 'ready',
    last_error_kind = null,
    last_error_message = null,
    next_attempt_at = now(),
    updated_at = now()
where query.query_key like 'vinted-source|category|%'
  and query.run_state = 'invalid'
  and query.last_error_kind = 'invalid_category'
  and exists (select 1 from public.vinted_listing_categories as cat where cat.id = query.catalog_id)
  and exists (select 1 from public.sniper_needed_feed_sources as needed where needed.key = query.query_key);
