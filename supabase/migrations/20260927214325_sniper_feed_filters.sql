-- Filtert gespeicherte Vinted-Funde nach Größe und Artikelpreis vor der Seitenteilung.
-- Betroffen: public.sniper_listings (lesend), public.sniper_feed_filtered, public.sniper_feed_matches_size.

create or replace function public.sniper_feed_matches_size(p_listing_size text, p_filter_size text)
returns boolean language sql immutable set search_path = '' as $$
    with size_tokens as (
        select string_to_array(
            btrim(regexp_replace(lower(coalesce(p_listing_size, '')), '[^a-z0-9]+', ' ', 'g')),
            ' '
        ) as tokens
    )
    select case
        when p_filter_size is null then true
        when p_listing_size is null then false
        when lower(btrim(p_listing_size)) = p_filter_size then true
        when p_filter_size = 'xs' then tokens && array['xs', '34']
        when p_filter_size = 's' then tokens && array['s', '36'] and not tokens && array['xs']
        when p_filter_size = 'm' then tokens && array['m', '38']
        when p_filter_size = 'l' then tokens && array['l', '40', '42']
            and not tokens && array['xl', 'xxl', '2xl']
        when p_filter_size = 'xl' then tokens && array['xl', '44', '46']
            and not tokens && array['xxl', '2xl', '3xl']
        when p_filter_size = 'xxl' then tokens && array['xxl', '2xl', '48', '50', '52', '54']
        when p_filter_size = '3xl' then tokens && array['3xl', 'xxxl', '4xl', '5xl']
        else false
    end from size_tokens;
$$;
comment on function public.sniper_feed_matches_size(text, text) is
    'Gleicht Vinted-Groessen einschliesslich Zahlenangaben mit den Feed-Filtern ab.';
revoke all on function public.sniper_feed_matches_size(text, text) from public, anon, authenticated;
grant execute on function public.sniper_feed_matches_size(text, text) to service_role;

create or replace function public.sniper_feed_filtered(
    p_workspace_id uuid, p_watchlist_id uuid, p_brand text, p_size text,
    p_min_price numeric, p_max_price numeric,
    p_before_time timestamptz, p_before_id uuid, p_limit integer
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_watchlist public.sniper_watchlists;
    v_rows jsonb;
    v_covered boolean;
    v_reported_at timestamptz;
begin
    if not public.is_workspace_member(p_workspace_id) then
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
        where listing.first_seen_at >= now() - interval '30 days'
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
$$;
comment on function public.sniper_feed_filtered(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer) is
    'Filtert gespeicherte Vinted-Funde nach Suchfilter, Marke, Groesse und Artikelpreis vor der Seitenteilung.';
revoke all on function public.sniper_feed_filtered(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer)
    from public, anon;
grant execute on function public.sniper_feed_filtered(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer)
    to authenticated;
