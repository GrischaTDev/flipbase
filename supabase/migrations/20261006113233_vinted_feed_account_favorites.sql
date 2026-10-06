-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.clear_sniper_favorites (
  p_workspace_id     uuid,
  p_expected_user_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid;
begin
    v_user := public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    update public.sniper_favorites set snapshot=null, removed_at=now()
    where user_id=v_user and workspace_id=p_workspace_id and removed_at is null;
    return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.clear_sniper_favorites(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.clear_sniper_favorites(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.clear_sniper_favorites(uuid, uuid) TO service_role;

CREATE FUNCTION public.import_sniper_favorites (
  p_workspace_id     uuid,
  p_expected_user_id uuid,
  p_items            jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_item jsonb; v_count integer := 0;
begin
    perform public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'Ungültige Importliste.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_items) not between 1 and 50 then
        raise exception 'Ein Importpaket darf 1 bis 50 Favoriten enthalten.' using errcode = '22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_items) loop
        perform public.save_sniper_favorite(p_workspace_id, p_expected_user_id, v_item, true);
        v_count := v_count + 1;
    end loop;
    return v_count;
end;
$function$;

REVOKE ALL ON FUNCTION public.import_sniper_favorites(uuid, uuid, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.import_sniper_favorites(uuid, uuid, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.import_sniper_favorites(uuid, uuid, jsonb) TO service_role;

CREATE FUNCTION public.remove_sniper_favorite (
  p_workspace_id     uuid,
  p_expected_user_id uuid,
  p_external_id      text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid;
begin
    v_user := public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    if p_external_id is null or p_external_id !~ '^[0-9]{1,30}$' then
        raise exception 'Ungültige Artikelkennung.' using errcode = '22023';
    end if;
    insert into public.sniper_favorites(user_id, workspace_id, external_id, snapshot, removed_at)
    values (v_user, p_workspace_id, p_external_id, null, now())
    on conflict (user_id, workspace_id, external_id) do update set snapshot=null, removed_at=now();
    return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.remove_sniper_favorite(uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.remove_sniper_favorite(uuid, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.remove_sniper_favorite(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.save_sniper_favorite (
  p_workspace_id     uuid,
  p_expected_user_id uuid,
  p_item             jsonb,
  p_import_only      boolean DEFAULT false
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid; v_item jsonb; v_external text;
begin
    v_user := public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    v_item := public.sniper_normalize_favorite_item(p_item);
    v_external := substring(v_item->>'url' from '^https://www\.vinted\.de/items/([0-9]{1,30})(?:-|/|\?|#|$)');
    if p_import_only then
        -- Auch entfernte Einträge kollidieren: Ein altes Tablet darf sie nicht wiederherstellen.
        insert into public.sniper_favorites(user_id, workspace_id, external_id, snapshot)
        values (v_user, p_workspace_id, v_external, v_item)
        on conflict (user_id, workspace_id, external_id) do nothing;
    else
        insert into public.sniper_favorites(user_id, workspace_id, external_id, snapshot)
        values (v_user, p_workspace_id, v_external, v_item)
        on conflict (user_id, workspace_id, external_id) do update set
            snapshot = case when sniper_favorites.removed_at is null then sniper_favorites.snapshot else excluded.snapshot end,
            saved_at = case when sniper_favorites.removed_at is null then sniper_favorites.saved_at else excluded.saved_at end,
            removed_at = null;
    end if;
    return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.save_sniper_favorite(uuid, uuid, jsonb, boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION public.save_sniper_favorite(uuid, uuid, jsonb, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.save_sniper_favorite(uuid, uuid, jsonb, boolean) TO service_role;

CREATE FUNCTION public.sniper_check_favorite_scope (
  p_workspace_id     uuid,
  p_expected_user_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
    if v_user is null or v_user is distinct from p_expected_user_id
       or not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diese persönlichen Favoriten.' using errcode = '42501';
    end if;
    return v_user;
end;
$function$;

REVOKE ALL ON FUNCTION public.sniper_check_favorite_scope(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.sniper_check_favorite_scope(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.sniper_check_favorite_scope(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sniper_evaluate_pending_watchlist_hits (
  p_batch_size integer DEFAULT 100
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
            or first_seen_at < now() - interval '7 days'
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
$function$;

CREATE FUNCTION public.sniper_favorites_page (
  p_workspace_id     uuid,
  p_expected_user_id uuid,
  p_before_time      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id        uuid                     DEFAULT NULL::uuid,
  p_limit            integer                  DEFAULT 100
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare v_user uuid; v_result jsonb;
begin
    v_user := public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    if p_limit is null or p_limit not between 1 and 200 or (p_before_time is null) <> (p_before_id is null) then
        raise exception 'Ungültige Seitengröße oder Position.' using errcode = '22023';
    end if;
    with candidates as materialized (
        select id, snapshot, saved_at from public.sniper_favorites
        where user_id=v_user and workspace_id=p_workspace_id and removed_at is null
          and (p_before_time is null or (saved_at,id) < (p_before_time,p_before_id))
        order by saved_at desc,id desc limit p_limit+1
    ), page as materialized (
        select * from candidates order by saved_at desc,id desc limit p_limit
    )
    select jsonb_build_object('items',coalesce((select jsonb_agg(snapshot order by saved_at desc,id desc) from page),'[]'::jsonb),
        'next_cursor',case when (select count(*) from candidates)>p_limit
            then (select jsonb_build_object('time',saved_at,'id',id) from page order by saved_at,id limit 1) else null end)
    into v_result;
    return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION public.sniper_favorites_page(uuid, uuid, timestamp WITH time zone, uuid, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.sniper_favorites_page(uuid, uuid, timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.sniper_favorites_page(uuid, uuid, timestamp WITH time zone, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.sniper_feed_by_brand (
  p_workspace_id uuid,
  p_watchlist_id uuid,
  p_brand        text,
  p_before_time  timestamp with time zone,
  p_before_id    uuid,
  p_limit        integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
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
        where listing.first_seen_at >= now() - interval '7 days'
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
$function$;

CREATE OR REPLACE FUNCTION public.sniper_feed_filtered (
  p_workspace_id uuid,
  p_watchlist_id uuid,
  p_brand        text,
  p_size         text,
  p_min_price    numeric,
  p_max_price    numeric,
  p_before_time  timestamp with time zone,
  p_before_id    uuid,
  p_limit        integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
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
        where listing.first_seen_at >= now() - interval '7 days'
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
$function$;

CREATE FUNCTION public.sniper_feed_search (
  p_workspace_id uuid,
  p_watchlist_id uuid,
  p_brand        text,
  p_size         text,
  p_min_price    numeric,
  p_max_price    numeric,
  p_before_time  timestamp with time zone,
  p_before_id    uuid,
  p_limit        integer,
  p_title_query  text                     DEFAULT ''::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
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
        where listing.first_seen_at >= now() - interval '7 days'
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

REVOKE ALL ON FUNCTION public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamp WITH time zone, uuid, integer, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamp WITH time zone, uuid, integer, text) TO authenticated;

GRANT ALL ON FUNCTION public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamp WITH time zone, uuid, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sniper_feed (
  p_workspace_id uuid,
  p_watchlist_id uuid                     DEFAULT NULL::uuid,
  p_deals_only   boolean                  DEFAULT false,
  p_before_time  timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id    uuid                     DEFAULT NULL::uuid,
  p_limit        integer                  DEFAULT 60
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
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
        where listing.first_seen_at >= now() - interval '7 days'
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
$function$;

CREATE FUNCTION public.sniper_normalize_favorite_item (
  p_item jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
    v_external text;
    v_id uuid;
    v_first_seen timestamptz;
    v_price numeric;
    v_total numeric;
    v_images jsonb;
    v_field text;
begin
    if p_item is null or jsonb_typeof(p_item) <> 'object' or pg_column_size(p_item) > 65536
       or jsonb_typeof(p_item->'id') is distinct from 'string'
       or jsonb_typeof(p_item->'title') is distinct from 'string'
       or length(btrim(p_item->>'title')) not between 1 and 500
       or jsonb_typeof(p_item->'url') is distinct from 'string'
       or length(p_item->>'url') > 2048
       or jsonb_typeof(p_item->'currency') is distinct from 'string'
       or (p_item->>'currency') !~ '^[A-Z]{3}$'
       or jsonb_typeof(p_item->'item_price') is distinct from 'number'
       or jsonb_typeof(p_item->'total_price') is distinct from 'number'
       or jsonb_typeof(p_item->'first_seen_at') is distinct from 'string'
       or jsonb_typeof(p_item->'image_urls') is distinct from 'array' then
        raise exception 'Ungültige Artikeldaten für den Favoriten.' using errcode = '22023';
    end if;
    v_external := substring(p_item->>'url' from '^https://www\.vinted\.de/items/([0-9]{1,30})(?:-|/|\?|#|$)');
    if v_external is null or jsonb_array_length(p_item->'image_urls') > 20 then
        raise exception 'Ungültiger Vinted-Link oder zu viele Bilder.' using errcode = '22023';
    end if;
    begin
        v_id := (p_item->>'id')::uuid;
        v_first_seen := (p_item->>'first_seen_at')::timestamptz;
        v_price := (p_item->>'item_price')::numeric;
        v_total := (p_item->>'total_price')::numeric;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
        raise exception 'Ungültige Kennung, Zeit oder Preisangabe.' using errcode = '22023';
    end;
    if not isfinite(v_first_seen) or v_price not between 0 and 10000000 or v_total not between 0 and 10000000 then
        raise exception 'Ungültiger Fundzeitpunkt oder Preis.' using errcode = '22023';
    end if;
    foreach v_field in array array['brand','size','condition','reference_scope','watchlist_title','category_path'] loop
        if p_item->v_field is not null and p_item->v_field <> 'null'::jsonb and
           (jsonb_typeof(p_item->v_field) <> 'string' or length(p_item->>v_field) > case when v_field='category_path' then 1000 else 200 end) then
            raise exception 'Ungültige Artikelmerkmale.' using errcode = '22023';
        end if;
    end loop;
    foreach v_field in array array['reference_price','discount_percent','catalog_id'] loop
        if p_item->v_field is not null and p_item->v_field <> 'null'::jsonb and jsonb_typeof(p_item->v_field) <> 'number' then
            raise exception 'Ungültige Vergleichsangabe.' using errcode = '22023';
        end if;
    end loop;
    select coalesce(jsonb_agg(image), '[]'::jsonb) into v_images
    from jsonb_array_elements(p_item->'image_urls') image
    where jsonb_typeof(image)='string' and length(image #>> '{}') <= 2048
      and (image #>> '{}') ~ '^https://[a-zA-Z0-9.-]+\.vinted\.net/';
    return jsonb_build_object(
        'id', v_id, 'title', btrim(p_item->>'title'), 'url', p_item->>'url', 'image_urls', v_images,
        'item_price', v_price, 'total_price', v_total, 'currency', p_item->>'currency',
        'first_seen_at', v_first_seen, 'brand', p_item->'brand', 'size', p_item->'size',
        'condition', p_item->'condition', 'catalog_id', p_item->'catalog_id', 'category_path', p_item->'category_path',
        'reference_price', p_item->'reference_price', 'reference_scope', p_item->'reference_scope',
        'discount_percent', p_item->'discount_percent', 'watchlist_title', p_item->'watchlist_title',
        'is_hidden', coalesce(p_item->'is_hidden' = 'true'::jsonb, false));
end;
$function$;

REVOKE ALL ON FUNCTION public.sniper_normalize_favorite_item(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.sniper_normalize_favorite_item(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.sniper_purge_expired_listings (
  p_batch_size integer DEFAULT 1000
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
    v_deleted integer;
begin
    if p_batch_size is null or p_batch_size not between 1 and 5000 then
        raise exception 'Die Paketgroesse muss zwischen 1 und 5000 liegen.' using errcode = '22023';
    end if;

    with expired as (
        select id from public.sniper_listings
        where first_seen_at < now() - interval '7 days'
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
$function$;

COMMENT ON FUNCTION public.sniper_purge_expired_listings(integer) IS 'Loescht paketweise Angebote nach 7 Tagen seit Erstfund samt zugehoerigen Treffern. Nur der Dienst darf die Bereinigung ausloesen.';

CREATE OR REPLACE FUNCTION public.sniper_reference_price (
  p_catalog_id integer,
  p_brand      text,
  p_condition  text
)
  RETURNS TABLE (
    reference_price numeric,
    sample_size     integer,
    unusable_reason text,
    reference_scope text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
    with samples as materialized (
        select listing.item_price, query.price_to,
               nullif(lower(btrim(listing.brand)), '') as brand
        from public.sniper_listings as listing
        join public.sniper_queries as query on query.id = coalesce(listing.catalog_source_query_id, listing.discovered_by_query_id)
        where query.catalog_id = p_catalog_id
          and query.marketplace = 'vinted'
          and listing.marketplace = 'vinted'
          and listing.condition is not distinct from p_condition
          and listing.first_seen_at >= now() - interval '7 days'
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
$function$;

COMMENT ON FUNCTION public.sniper_reference_price(integer,text,text) IS '7-Tage-Median aus mindestens acht EUR-Angeboten derselben Kategorie, Marke und desselben Zustands. Bei zu kleiner Markengruppe Rueckfall auf Kategorie/Zustand. Preislimit jedes Entdeckungsauftrags beachten.';

CREATE OR REPLACE FUNCTION public.sniper_reference_price (
  p_query_id  uuid,
  p_condition text
)
  RETURNS TABLE (
    reference_price numeric,
    sample_size     integer,
    unusable_reason text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
    with fenster as (
        select listing.item_price
        from public.sniper_listings as listing
        where listing.discovered_by_query_id = p_query_id
          and listing.condition is not distinct from p_condition
          and listing.first_seen_at >= now() - interval '7 days'
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
$function$;

COMMENT ON FUNCTION public.sniper_reference_price(uuid,text) IS 'Median der Artikelpreise einer Abfrage im selben Zustand ueber 7 Tage. Liefert null mit Begruendung, wenn die Gruppe zu klein ist oder am Preislimit klebt.';

CREATE OR REPLACE FUNCTION public.sniper_supported_brands (
  p_workspace_id uuid
)
  RETURNS TABLE (
    brand text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;

    return query
        select distinct btrim(listing.brand) as brand
        from public.sniper_listings as listing
        join public.sniper_queries as query on query.id = listing.discovered_by_query_id
        where query.marketplace = 'vinted'
            and query.is_active
            and query.brand_id is not null
            and listing.first_seen_at >= now() - interval '7 days'
            and nullif(btrim(listing.brand), '') is not null
        order by 1;
end;
$function$;

CREATE TABLE public.sniper_favorites (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  workspace_id uuid                     NOT NULL,
  external_id  text                     NOT NULL,
  snapshot     jsonb,
  saved_at     timestamp with time zone DEFAULT now() NOT NULL,
  removed_at   timestamp with time zone
);

COMMENT ON TABLE public.sniper_favorites IS 'Persönliche Account-Favoriten je Workspace. Eigenständige Artikelkopie ohne Ablaufdatum. Nach manuellem Entfernen bleibt nur die Kennung als Schutz vor erneuten Altimporten.';

ALTER TABLE public.sniper_favorites
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sniper_favorites
  ADD CONSTRAINT sniper_favorites_check CHECK (removed_at IS NULL AND snapshot IS NOT NULL OR removed_at IS NOT NULL AND snapshot IS NULL);

ALTER TABLE public.sniper_favorites
  ADD CONSTRAINT sniper_favorites_external_id_check CHECK (external_id ~ '^[0-9]{1,30}$'::text);

ALTER TABLE public.sniper_favorites
  ADD CONSTRAINT sniper_favorites_pkey PRIMARY KEY (id);

ALTER TABLE public.sniper_favorites
  ADD CONSTRAINT sniper_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.sniper_favorites
  ADD CONSTRAINT sniper_favorites_user_id_workspace_id_external_id_key UNIQUE (user_id, workspace_id, external_id);

ALTER TABLE public.sniper_favorites
  ADD CONSTRAINT sniper_favorites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT SELECT ON public.sniper_favorites TO authenticated;

GRANT ALL ON public.sniper_favorites TO service_role;

CREATE INDEX sniper_favorites_workspace_idx ON public.sniper_favorites (workspace_id);

CREATE INDEX sniper_favorites_page_idx ON public.sniper_favorites (user_id, workspace_id, saved_at DESC, id DESC)
  WHERE removed_at IS NULL;

CREATE POLICY "Eigene Favoriten lesen" ON public.sniper_favorites
  FOR SELECT
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND public.can_access_workspace(workspace_id)));

CREATE INDEX sniper_listings_title_search_idx ON public.sniper_listings USING gin (to_tsvector('simple'::regconfig, COALESCE(title, ''::text)));
-- Explizite deklarative Rechte auch nach einem Neuaufbau sicherstellen.
revoke all on public.sniper_favorites from public, anon, authenticated;
grant select on public.sniper_favorites to authenticated;
grant all on public.sniper_favorites to service_role;
revoke all on function public.sniper_check_favorite_scope(uuid, uuid) from public, anon;
grant execute on function public.sniper_check_favorite_scope(uuid, uuid) to authenticated;
revoke all on function public.sniper_normalize_favorite_item(jsonb) from public, anon, authenticated;
revoke all on function public.save_sniper_favorite(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_sniper_favorite(uuid, uuid, jsonb, boolean) to authenticated;
revoke all on function public.remove_sniper_favorite(uuid, uuid, text) from public, anon;
grant execute on function public.remove_sniper_favorite(uuid, uuid, text) to authenticated;
revoke all on function public.clear_sniper_favorites(uuid, uuid) from public, anon;
grant execute on function public.clear_sniper_favorites(uuid, uuid) to authenticated;
revoke all on function public.import_sniper_favorites(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_sniper_favorites(uuid, uuid, jsonb) to authenticated;
revoke all on function public.sniper_favorites_page(uuid, uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.sniper_favorites_page(uuid, uuid, timestamptz, uuid, integer) to authenticated;
revoke all on function public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer, text) from public, anon;
grant execute on function public.sniper_feed_search(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer, text) to authenticated;
