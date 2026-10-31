-- Vinted-Feed: nur frisch eingestellte Artikel, kein Erstbestand im Feed, drei Tage Aufbewahrung.
-- Betroffen: sniper_queries (neue Spalte newest_external_id), sniper_listings (neue Spalte
-- is_initial_stock), complete_sniper_search_filter_run, die Feed-RPCs sniper_feed,
-- sniper_feed_by_brand, sniper_feed_filtered, sniper_feed_search und sniper_supported_brands,
-- sniper_reference_price, sniper_evaluate_pending_watchlist_hits und sniper_purge_expired_listings.
-- Signaturen bleiben unverändert, Rechte bleiben erhalten. Destruktiver Folgeeffekt: Die
-- Bereinigung löscht danach Funde, die älter als drei statt sieben Tage sind; Favoriten
-- haben eigene Kopien und bleiben erhalten. Zusammengestellt aus den Schemadateien.

alter table public.sniper_queries
    add column newest_external_id bigint,
    add constraint sniper_queries_newest_external_id_valid check (newest_external_id > 0);
comment on column public.sniper_queries.newest_external_id is 'Höchste Vinted-Artikelnummer, die dieser Filter gesehen hat. Deutlich ältere Nummern gelten nicht als neuer Fund.';
alter table public.sniper_listings add column is_initial_stock boolean not null default false;
comment on column public.sniper_listings.is_initial_stock is 'Beim ersten Abruf eines Filters vorgefundener Bestand. Bleibt für die Doppelerkennung gespeichert, erscheint aber nicht im Feed.';

-- Quelle: supabase/schemas/106_sniper_watchlists.sql
create or replace function public.sniper_evaluate_pending_watchlist_hits(p_batch_size integer default 100)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_processed integer := 0;
    v_created integer := 0;
begin
    if p_batch_size is null or p_batch_size not between 1 and 1000 then
        raise exception 'Die Paketgroesse muss zwischen 1 und 1000 liegen.' using errcode = '22023';
    end if;

    -- Unbrauchbare Angebote (ungueltige Waehrung, kein/negativer Preis oder aelter als 14 Tage)
    -- koennen keinen Referenzpreis mehr erhalten und duerfen die Warteschlange nicht blockieren.
    with invalid_or_expired as (
        select id from public.sniper_listings
        where watchlist_evaluated_at is null
          and (
            currency != 'EUR'
            or item_price is null
            or item_price <= 0
            or item_price >= 'Infinity'::numeric
            or first_seen_at < now() - interval '3 days'
          )
        limit p_batch_size
        for update skip locked
    ), marked_invalid as (
        update public.sniper_listings set watchlist_evaluated_at = now()
        where id in (select id from invalid_or_expired)
        returning 1
    )
    select count(*)::integer into v_processed from marked_invalid;

    -- Bewertungsauswahl: Neueste unbewertete Angebote mit bekannter Kategorie
    with target_listings as (
        select id
        from public.sniper_listings
        where watchlist_evaluated_at is null
          and currency = 'EUR'
          and item_price > 0
          and item_price < 'Infinity'::numeric
          and catalog_id is not null
        order by first_seen_at desc, id desc
        limit (p_batch_size - v_processed)
        for update skip locked
    ), pending as materialized (
        select listing.*
        from public.sniper_listings as listing
        join target_listings on target_listings.id = listing.id
    ), groups as (
        select distinct catalog_id, lower(btrim(brand)) as brand, condition from pending
    ), benchmarks as materialized (
        select groups.*, reference.reference_price, reference.reference_scope
        from groups cross join lateral public.sniper_reference_price(groups.catalog_id, groups.brand, groups.condition) as reference
        where reference.reference_price > 0
    ), evaluated as materialized (
        select pending.*, benchmarks.reference_price, benchmarks.reference_scope
        from pending join benchmarks on benchmarks.catalog_id = pending.catalog_id
            and benchmarks.brand is not distinct from lower(btrim(pending.brand))
            and benchmarks.condition is not distinct from pending.condition
    ), inserted as (
        insert into public.sniper_watchlist_hits(watchlist_id, listing_id, reference_price, reference_scope, discount_percent)
        select watchlist.id, listing.id, evaluated.reference_price, evaluated.reference_scope,
            round((1 - listing.item_price / evaluated.reference_price) * 100, 2)
        from evaluated join public.sniper_listings as listing on listing.id = evaluated.id
        join public.sniper_watchlists as watchlist on watchlist.is_active
            and listing.first_seen_at >= watchlist.starts_at
            and public.sniper_watchlist_matches(watchlist, listing)
        where listing.item_price <= evaluated.reference_price * (1 - watchlist.discount_threshold_percent / 100)
        on conflict (watchlist_id, listing_id) do nothing returning 1
    ), marked as (
        update public.sniper_listings set watchlist_evaluated_at = now()
        where id in (select id from evaluated) returning 1
    )
    select
        v_processed + coalesce((select count(*)::integer from marked), 0),
        coalesce((select count(*)::integer from inserted), 0)
    into v_processed, v_created;

    return jsonb_build_object('processed', v_processed, 'hits', v_created);
end;
$$;

-- Quelle: supabase/schemas/360_beta_business_access.sql
create or replace function public.sniper_feed(p_workspace_id uuid, p_watchlist_id uuid DEFAULT NULL::uuid, p_deals_only boolean DEFAULT false, p_before_time timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_watchlist public.sniper_watchlists; v_rows jsonb; v_covered boolean; v_reported_at timestamptz;
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_limit is null or p_limit not between 1 and 100 or (p_before_time is null) <> (p_before_id is null) then
        raise exception 'Ungueltige Seitengroesse oder Position.' using errcode = '22023';
    end if;
    if p_watchlist_id is not null then
        select * into v_watchlist from public.sniper_watchlists where id = p_watchlist_id and workspace_id = p_workspace_id;
        if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;
    select coalesce(jsonb_agg(to_jsonb(page) order by page.first_seen_at desc, page.id desc), '[]'::jsonb) into v_rows from (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price, listing.total_price,
            listing.currency, listing.brand, listing.size, listing.condition, listing.is_hidden, listing.first_seen_at,
            listing.catalog_id, category.path as category_path,
            hit.reference_price, hit.reference_scope, hit.discount_percent, hit.watchlist_title
        from public.sniper_listings as listing
        left join public.vinted_categories as category on category.id = listing.catalog_id
        left join lateral (
            select found.reference_price, found.reference_scope, found.discount_percent, watchlist.title as watchlist_title
            from public.sniper_watchlist_hits as found join public.sniper_watchlists as watchlist on watchlist.id = found.watchlist_id
            where found.listing_id = listing.id and watchlist.workspace_id = p_workspace_id
                and (p_watchlist_id is null or watchlist.id = p_watchlist_id)
            order by found.created_at desc, found.id desc limit 1
        ) as hit on true
        where listing.first_seen_at >= now() - interval '3 days'
            and not listing.is_initial_stock
            and (p_before_time is null or (listing.first_seen_at, listing.id) < (p_before_time, p_before_id))
            and (not p_deals_only or hit.reference_price is not null)
            and (p_watchlist_id is null or p_deals_only or public.sniper_watchlist_matches(v_watchlist, listing))
        order by listing.first_seen_at desc, listing.id desc limit p_limit
    ) as page;
    select exists(select 1 from public.sniper_queries where is_active
        and (v_watchlist.catalog_id is null or catalog_id = v_watchlist.catalog_id)) into v_covered;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$function$
;

-- Quelle: supabase/schemas/402_sniper_filter_feed_updates.sql
create or replace function public.sniper_supported_brands(p_workspace_id uuid)
returns table (brand text) language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;

    return query
        select distinct btrim(listing.brand) as brand
        from public.sniper_listings as listing
        join public.sniper_queries as query on query.id = listing.discovered_by_query_id
            or exists (select 1 from public.sniper_query_matches matched where matched.query_id = query.id and matched.listing_id = listing.id)
        where query.marketplace = 'vinted'
            and query.is_active
            and query.deleted_at is null
            and listing.first_seen_at >= now() - interval '3 days'
            and not listing.is_initial_stock
            and nullif(btrim(listing.brand), '') is not null
        order by 1;
end;
$$;

-- Quelle: supabase/schemas/360_beta_business_access.sql
create or replace function public.sniper_feed_by_brand(p_workspace_id uuid, p_watchlist_id uuid, p_brand text, p_before_time timestamp with time zone, p_before_id uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_watchlist public.sniper_watchlists;
    v_rows jsonb;
    v_covered boolean;
    v_reported_at timestamptz;
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_limit is null or p_limit not between 1 and 100 or (p_before_time is null) <> (p_before_id is null) then
        raise exception 'Ungueltige Seitengroesse oder Position.' using errcode = '22023';
    end if;
    if p_brand is not null and (length(btrim(p_brand)) not between 1 and 100) then
        raise exception 'Ungueltige Marke.' using errcode = '22023';
    end if;
    if p_watchlist_id is not null then
        select * into v_watchlist from public.sniper_watchlists
        where id = p_watchlist_id and workspace_id = p_workspace_id;
        if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;

    select coalesce(jsonb_agg(to_jsonb(page) order by page.first_seen_at desc, page.id desc), '[]'::jsonb)
    into v_rows from (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price, listing.total_price,
            listing.currency, listing.brand, listing.size, listing.condition, listing.is_hidden, listing.first_seen_at,
            listing.catalog_id, category.path as category_path,
            hit.reference_price, hit.reference_scope, hit.discount_percent, hit.watchlist_title
        from public.sniper_listings as listing
        left join public.vinted_categories as category on category.id = listing.catalog_id
        left join lateral (
            select found.reference_price, found.reference_scope, found.discount_percent,
                watchlist.title as watchlist_title
            from public.sniper_watchlist_hits as found
            join public.sniper_watchlists as watchlist on watchlist.id = found.watchlist_id
            where found.listing_id = listing.id and watchlist.workspace_id = p_workspace_id
                and (p_watchlist_id is null or watchlist.id = p_watchlist_id)
            order by found.created_at desc, found.id desc limit 1
        ) as hit on true
        where listing.first_seen_at >= now() - interval '3 days'
            and not listing.is_initial_stock
            and (p_before_time is null or (listing.first_seen_at, listing.id) < (p_before_time, p_before_id))
            and (p_brand is null or lower(btrim(listing.brand)) = lower(btrim(p_brand)))
            and (p_watchlist_id is null or public.sniper_watchlist_matches(v_watchlist, listing))
        order by listing.first_seen_at desc, listing.id desc limit p_limit
    ) as page;

    select exists(select 1 from public.sniper_queries as query where query.is_active
        and (v_watchlist.catalog_id is null or query.catalog_id is null or query.catalog_id = v_watchlist.catalog_id))
    into v_covered;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$function$
;

-- Quelle: supabase/schemas/360_beta_business_access.sql
create or replace function public.sniper_feed_filtered(p_workspace_id uuid, p_watchlist_id uuid, p_brand text, p_size text, p_min_price numeric, p_max_price numeric, p_before_time timestamp with time zone, p_before_id uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_watchlist public.sniper_watchlists;
    v_rows jsonb;
    v_covered boolean;
    v_reported_at timestamptz;
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_limit is null or p_limit not between 1 and 100
        or (p_before_time is null) <> (p_before_id is null) then
        raise exception 'Ungueltige Seitengroesse oder Position.' using errcode = '22023';
    end if;
    if p_brand is not null and length(btrim(p_brand)) not between 1 and 100 then
        raise exception 'Ungueltige Marke.' using errcode = '22023';
    end if;
    if p_size is not null and p_size not in ('xs', 's', 'm', 'l', 'xl', 'xxl', '3xl') then
        raise exception 'Ungueltige Groesse.' using errcode = '22023';
    end if;
    if p_min_price::text in ('NaN', 'Infinity', '-Infinity')
        or p_max_price::text in ('NaN', 'Infinity', '-Infinity')
        or p_min_price < 0 or p_max_price < 0 or p_min_price > p_max_price then
        raise exception 'Ungueltige Preisgrenzen.' using errcode = '22023';
    end if;
    if p_watchlist_id is not null then
        select * into v_watchlist from public.sniper_watchlists
        where id = p_watchlist_id and workspace_id = p_workspace_id;
        if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;

    select coalesce(jsonb_agg(to_jsonb(page) order by page.first_seen_at desc, page.id desc), '[]'::jsonb)
    into v_rows from (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price, listing.total_price,
            listing.currency, listing.brand, listing.size, listing.condition, listing.is_hidden, listing.first_seen_at,
            listing.catalog_id, category.path as category_path,
            hit.reference_price, hit.reference_scope, hit.discount_percent, hit.watchlist_title
        from public.sniper_listings as listing
        left join public.vinted_categories as category on category.id = listing.catalog_id
        left join lateral (
            select found.reference_price, found.reference_scope, found.discount_percent,
                watchlist.title as watchlist_title
            from public.sniper_watchlist_hits as found
            join public.sniper_watchlists as watchlist on watchlist.id = found.watchlist_id
            where found.listing_id = listing.id and watchlist.workspace_id = p_workspace_id
                and (p_watchlist_id is null or watchlist.id = p_watchlist_id)
            order by found.created_at desc, found.id desc limit 1
        ) as hit on true
        where listing.first_seen_at >= now() - interval '3 days'
            and not listing.is_initial_stock
            and (p_before_time is null or (listing.first_seen_at, listing.id) < (p_before_time, p_before_id))
            and (p_brand is null or lower(btrim(listing.brand)) = lower(btrim(p_brand)))
            and (p_size is null or public.sniper_feed_matches_size(listing.size, p_size))
            and (p_min_price is null or listing.item_price >= p_min_price)
            and (p_max_price is null or listing.item_price <= p_max_price)
            and ((p_min_price is null and p_max_price is null) or listing.currency = 'EUR')
            and (p_watchlist_id is null or public.sniper_watchlist_matches(v_watchlist, listing))
        order by listing.first_seen_at desc, listing.id desc limit p_limit
    ) as page;

    select exists(select 1 from public.sniper_queries as query where query.is_active
        and (v_watchlist.catalog_id is null or query.catalog_id is null or query.catalog_id = v_watchlist.catalog_id))
    into v_covered;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$function$
;

-- Quelle: supabase/schemas/108_sniper_search_filters.sql
create or replace function public.complete_sniper_search_filter_run(
    p_query_id uuid, p_revision integer, p_cursor integer, p_listings jsonb, p_diagnostics jsonb default '{}'
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_query public.sniper_queries;
    v_count integer;
    v_index integer;
    v_created integer;
    v_hits integer;
    v_seed boolean;
    v_newest bigint;
    v_external_ids text[];
    v_new_matches uuid[];
begin
    select * into v_query from public.sniper_queries where id = p_query_id for update;
    if not found or v_query.deleted_at is not null or not v_query.is_active
       or v_query.filter_revision is distinct from p_revision or v_query.request_cursor is distinct from p_cursor then
        return jsonb_build_object('accepted', false, 'created', 0, 'seeded', false, 'hits', 0);
    end if;
    if v_query.filter_format_version <> 1 then raise exception 'Ungültiges Suchfilterformat.' using errcode = '22023'; end if;
    if v_query.catalog_id is not null and not exists (select 1 from public.vinted_categories where id = v_query.catalog_id) then
        update public.sniper_queries set is_active = false, run_state = 'invalid',
            last_error_kind = 'invalid_category', last_error_message = 'Die Kategorie ist nicht mehr verfügbar.', updated_at = now() where id = p_query_id;
        return jsonb_build_object('accepted', false, 'created', 0, 'seeded', false, 'hits', 0);
    end if;
    if p_listings is null or jsonb_typeof(p_listings) <> 'array' then raise exception 'Ungültiges Artikelpaket.' using errcode = '22023'; end if;
    if jsonb_array_length(p_listings) > 288 then raise exception 'Zu viele Artikel in einem Abruf.' using errcode = '22023'; end if;
    if p_diagnostics is null or jsonb_typeof(p_diagnostics) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_diagnostics) key where key not in ('coverage','duration_ms','source_pages','shared_filter_count'))
       or (p_diagnostics ? 'coverage' and (jsonb_typeof(p_diagnostics->'coverage') <> 'string' or p_diagnostics->>'coverage' not in ('unknown','initial','caught_up','limited')))
       or (p_diagnostics ? 'duration_ms' and (jsonb_typeof(p_diagnostics->'duration_ms') <> 'number' or (p_diagnostics->>'duration_ms')::numeric not between 0 and 86400000 or trunc((p_diagnostics->>'duration_ms')::numeric) <> (p_diagnostics->>'duration_ms')::numeric))
       or (p_diagnostics ? 'source_pages' and (jsonb_typeof(p_diagnostics->'source_pages') <> 'number' or (p_diagnostics->>'source_pages')::numeric not between 1 and 3 or trunc((p_diagnostics->>'source_pages')::numeric) <> (p_diagnostics->>'source_pages')::numeric))
       or (p_diagnostics ? 'shared_filter_count' and (jsonb_typeof(p_diagnostics->'shared_filter_count') <> 'number' or (p_diagnostics->>'shared_filter_count')::numeric not between 1 and 10000 or trunc((p_diagnostics->>'shared_filter_count')::numeric) <> (p_diagnostics->>'shared_filter_count')::numeric)) then
        raise exception 'Ungültige Abrufdiagnose.' using errcode = '22023';
    end if;
    -- Titelregeln zusätzlich im geschützten Schreibweg prüfen; Beschreibung zählt nie.
    select coalesce(jsonb_agg(item), '[]'::jsonb) into p_listings from (
        select distinct on (item->>'external_id') item
        from jsonb_array_elements(p_listings) item
        where public.sniper_search_filter_matches_title(v_query, item->>'title')
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
    -- Vinted vergibt rund vier Millionen Nummern pro Stunde. Liegt eine Nummer mehr
    -- als etwa eine Stunde unter dem bekannten Stand, wurde der Artikel nur
    -- hochgeschoben oder verbilligt und ist kein neuer Fund.
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
            photo_uploaded_at, discovered_by_query_id, watchlist_evaluated_at, is_initial_stock)
        select v_query.marketplace, item.external_id, item.title, item.url, item.description, coalesce(item.image_urls, '{}'),
            item.item_price, item.total_price, item.currency, item.brand, item.size, item.condition,
            item.country_code, item.seller_name, item.seller_avatar_url, item.seller_rating, item.seller_review_count,
            coalesce(item.is_hidden, false), item.item_updated_at, item.photo_uploaded_at, p_query_id, case when v_seed then now() end, v_seed
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
    -- Ein gleichzeitig neu eingelesener Filter darf einen frischen Fund eines
    -- bereits gesäten Filters nicht stumm schalten. Älterer Erstbestand und
    -- bereits über echte Abrufe bewertete Artikel bleiben dagegen unverändert.
    if not v_seed then
        -- Frischer Fund eines laufenden Filters: Erstbestand eines anderen Filters wird sichtbar.
        update public.sniper_listings listing set is_initial_stock = false
        where listing.id = any(v_new_matches) and listing.is_initial_stock;
        update public.sniper_listings listing set watchlist_evaluated_at = null
        where listing.id = any(v_new_matches) and listing.watchlist_evaluated_at is not null
          and listing.first_seen_at > coalesce(v_query.last_success_at, v_query.created_at)
          and exists (select 1 from public.sniper_query_matches matched
              where matched.listing_id = listing.id and matched.is_seed)
          and not exists (select 1 from public.sniper_query_matches matched
              where matched.listing_id = listing.id and not matched.is_seed and matched.query_id <> p_query_id);
    end if;
    -- Eine Oberkategorie ist keine bekannte Blattkategorie für Preisvergleiche.
    if exists (select 1 from public.vinted_categories where id = v_query.catalog_id and is_leaf) then
        perform public.record_sniper_listing_category(p_query_id, v_external_ids);
    end if;
    v_hits := public.sniper_evaluate_watchlist_hits(p_query_id, not v_seed);
    if v_seed then v_query.seeded_requests := array_append(v_query.seeded_requests, v_index); end if;
    update public.sniper_queries set seeded_requests = v_query.seeded_requests,
        newest_external_id = greatest(v_query.newest_external_id, v_newest),
        is_seeded = cardinality(v_query.seeded_requests) = v_count,
        request_cursor = p_cursor + 1, run_state = 'ready', next_attempt_at = null,
        last_attempt_at = now(), last_success_at = now(), last_polled_at = now(), last_status = 'ok',
        consecutive_failures = 0, coverage_status = coalesce(p_diagnostics->>'coverage', 'unknown'),
        coverage_checked_at = now(), last_request_duration_ms = (p_diagnostics->>'duration_ms')::integer,
        shared_filter_count = coalesce((p_diagnostics->>'shared_filter_count')::integer, 1),
        updated_at = now() where id = p_query_id;
    perform set_config('flipbase.sniper_run', '', true);
    return jsonb_build_object('accepted', true, 'created', v_created, 'seeded', v_seed, 'hits', v_hits);
end;
$$;

-- Quelle: supabase/schemas/401_sniper_feed_search.sql
create or replace function public.sniper_feed_search(p_workspace_id uuid, p_watchlist_id uuid, p_brand text, p_size text, p_min_price numeric, p_max_price numeric, p_before_time timestamp with time zone, p_before_id uuid, p_limit integer, p_title_query text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
    v_watchlist public.sniper_watchlists;
    v_rows jsonb;
    v_covered boolean;
    v_reported_at timestamptz;
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
    if p_min_price::text in ('NaN', 'Infinity', '-Infinity')
        or p_max_price::text in ('NaN', 'Infinity', '-Infinity')
        or p_min_price < 0 or p_max_price < 0 or p_min_price > p_max_price then
        raise exception 'Ungueltige Preisgrenzen.' using errcode = '22023';
    end if;
    if p_watchlist_id is not null then
        select * into v_watchlist from public.sniper_watchlists
        where id = p_watchlist_id and workspace_id = p_workspace_id;
        if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;
    select coalesce(jsonb_agg(to_jsonb(page) order by page.first_seen_at desc, page.id desc), '[]'::jsonb)
    into v_rows from (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price, listing.total_price,
            listing.currency, listing.brand, listing.size, listing.condition, listing.is_hidden, listing.first_seen_at,
            listing.catalog_id, category.path as category_path,
            hit.reference_price, hit.reference_scope, hit.discount_percent, hit.watchlist_title
        from public.sniper_listings as listing
        left join public.vinted_categories as category on category.id = listing.catalog_id
        left join lateral (
            select found.reference_price, found.reference_scope, found.discount_percent,
                watchlist.title as watchlist_title
            from public.sniper_watchlist_hits as found
            join public.sniper_watchlists as watchlist on watchlist.id = found.watchlist_id
            where found.listing_id = listing.id and watchlist.workspace_id = p_workspace_id
                and (p_watchlist_id is null or watchlist.id = p_watchlist_id)
            order by found.created_at desc, found.id desc limit 1
        ) as hit on true
        where listing.first_seen_at >= now() - interval '3 days'
            and not listing.is_initial_stock
            and (p_before_time is null or (listing.first_seen_at, listing.id) < (p_before_time, p_before_id))
            and (nullif(btrim(p_title_query), '') is null or to_tsvector('simple', coalesce(listing.title,'')) @@ plainto_tsquery('simple', p_title_query))
            and (p_brand is null or lower(btrim(listing.brand)) = lower(btrim(p_brand)))
            and (p_size is null or public.sniper_feed_matches_size(listing.size, p_size))
            and (p_min_price is null or listing.item_price >= p_min_price)
            and (p_max_price is null or listing.item_price <= p_max_price)
            and ((p_min_price is null and p_max_price is null) or listing.currency = 'EUR')
            and (p_watchlist_id is null or public.sniper_watchlist_matches(v_watchlist, listing))
        order by listing.first_seen_at desc, listing.id desc limit p_limit
    ) as page;
    select exists(select 1 from public.sniper_queries as query where query.is_active
        and (v_watchlist.catalog_id is null or query.catalog_id is null or query.catalog_id = v_watchlist.catalog_id))
    into v_covered;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$function$;

-- Quelle: supabase/schemas/50_sniper.sql
create or replace function public.sniper_reference_price(
    p_query_id uuid,
    p_condition text
)
returns table (reference_price numeric, sample_size integer, unusable_reason text)
language sql
stable
security invoker
set search_path = ''
as $$
    with fenster as (
        select listing.item_price
        from public.sniper_listings as listing
        where listing.discovered_by_query_id = p_query_id
          and listing.condition is not distinct from p_condition
          and listing.first_seen_at >= now() - interval '3 days'
    ),
    grenze as (
        select price_to from public.sniper_queries where id = p_query_id
    ),
    kennzahlen as (
        select
            count(*)::integer as n,
            percentile_cont(0.5) within group (order by item_price)::numeric(12, 2) as median,
            count(*) filter (
                where (select price_to from grenze) is not null
                  and item_price >= (select price_to from grenze)
            )::integer as am_limit
        from fenster
    )
    select
        case
            when n < 8 then null
            when am_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then null
            else median
        end,
        n,
        case
            when n < 8 then 'too_few'
            when am_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then 'at_price_ceiling'
            else null
        end
    from kennzahlen;
$$;

-- Quelle: supabase/schemas/50_sniper.sql
create or replace function public.sniper_reference_price(
    p_catalog_id integer,
    p_brand text,
    p_condition text
)
returns table (reference_price numeric, sample_size integer, unusable_reason text, reference_scope text)
language sql
stable
security invoker
set search_path = ''
as $$
    with samples as materialized (
        select listing.item_price, query.price_to,
               nullif(lower(btrim(listing.brand)), '') as brand
        from public.sniper_listings as listing
        join public.sniper_queries as query on query.id = coalesce(listing.catalog_source_query_id, listing.discovered_by_query_id)
        where query.catalog_id = p_catalog_id
          and query.marketplace = 'vinted'
          and listing.marketplace = 'vinted'
          and listing.condition is not distinct from p_condition
          and listing.first_seen_at >= now() - interval '3 days'
          and listing.currency = 'EUR'
          and listing.item_price > 0
          and listing.item_price < 'Infinity'::numeric
    ),
    selection as (
        select nullif(lower(btrim(p_brand)), '') is not null
           and count(*) filter (where brand = nullif(lower(btrim(p_brand)), '')) >= 8
           as use_brand
        from samples
    ),
    statistics as (
        select count(*)::integer as n,
               percentile_cont(0.5) within group (order by item_price)::numeric(12, 2) as median,
               count(*) filter (where price_to is not null and item_price >= price_to) as at_limit
        from samples
        where not (select use_brand from selection)
           or brand = nullif(lower(btrim(p_brand)), '')
    ),
    result as (
        select *, case
            when p_catalog_id is null then 'unknown_category'
            when n < 8 then 'too_few'
            when at_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then 'at_price_ceiling'
            else null
        end as reason
        from statistics
    )
    select case when reason is null then median else null end, n, reason,
           case when (select use_brand from selection)
                then 'category_brand_condition' else 'category_condition' end
    from result;
$$;

-- Quelle: supabase/schemas/50_sniper.sql
create or replace function public.sniper_purge_expired_listings(p_batch_size integer default 1000)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_deleted integer;
begin
    if p_batch_size is null or p_batch_size not between 1 and 5000 then
        raise exception 'Die Paketgroesse muss zwischen 1 und 5000 liegen.' using errcode = '22023';
    end if;

    with expired as (
        select id from public.sniper_listings
        where first_seen_at < now() - interval '3 days'
        order by first_seen_at, id
        limit p_batch_size
        for update skip locked
    ), deleted as (
        delete from public.sniper_listings as listing
        using expired
        where listing.id = expired.id
        returning listing.id
    )
    select count(*)::integer into v_deleted from deleted;
    return v_deleted;
end;
$$;

