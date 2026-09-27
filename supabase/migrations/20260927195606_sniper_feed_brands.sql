-- Zweck: Markenfilter und Markenliste fuer den Vinted Feed.
-- Betroffen: public.sniper_queries, public.sniper_listings, public.sniper_watchlists (lesende Funktionen).

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.sniper_feed_by_brand (
  p_workspace_id uuid,
  p_watchlist_id uuid,
  p_brand        text,
  p_before_time  timestamp with time zone,
  p_before_id    uuid,
  p_limit        integer
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
    v_watchlist public.sniper_watchlists;
    v_rows jsonb;
    v_covered boolean;
    v_reported_at timestamptz;
begin
    if not public.is_workspace_member(p_workspace_id) then
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
        where listing.first_seen_at >= now() - interval '30 days'
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

comment on function public.sniper_feed_by_brand(uuid,uuid,text,timestamp
  with time zone,uuid,integer) is 'Filtert den Vinted-Feed nach Marke vor der Seitenteilung und behaelt Suchfilter sowie Vergleichsdaten bei.';

revoke all on function public.sniper_feed_by_brand(uuid, uuid, text, timestamp
  with time zone, uuid, integer) from public;

grant all on function public.sniper_feed_by_brand(uuid, uuid, text, timestamp
  with time zone, uuid, integer) to authenticated;

grant all on function public.sniper_feed_by_brand(uuid, uuid, text, timestamp
  with time zone, uuid, integer) to service_role;

create function public.sniper_supported_brands (
  p_workspace_id uuid
)
  returns table (
    brand text
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
    if not public.is_workspace_member(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;

    return query
        select distinct btrim(listing.brand) as brand
        from public.sniper_listings as listing
        join public.sniper_queries as query on query.id = listing.discovered_by_query_id
        where query.marketplace = 'vinted'
            and query.is_active
            and query.brand_id is not null
            and listing.first_seen_at >= now() - interval '30 days'
            and nullif(btrim(listing.brand), '') is not null
        order by 1;
end;
$function$;

comment on function public.sniper_supported_brands(uuid) is
  'Gibt die tatsaechlich gefundenen Marken aktiver Vinted-Sammelauftraege fuer den Feed zurueck.';

revoke all on function public.sniper_supported_brands(uuid) from public;

grant all on function public.sniper_supported_brands(uuid) to authenticated;

grant all on function public.sniper_supported_brands(uuid) to service_role;
