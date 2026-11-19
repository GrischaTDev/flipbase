-- Erweiterte Kriterien für gespeicherte Vinted-Suchfilter im Flipbase-Feed.

ALTER TABLE public.sniper_watchlists
  ADD COLUMN audience text;

ALTER TABLE public.sniper_watchlists
  ADD CONSTRAINT sniper_watchlists_audience_check CHECK (audience = ANY (ARRAY['women'::text, 'men'::text, 'both'::text]));

ALTER TABLE public.sniper_watchlists
  ADD COLUMN sizes text[] DEFAULT '{}'::text[] NOT NULL;

ALTER TABLE public.sniper_watchlists
  ADD CONSTRAINT sniper_watchlists_sizes_check CHECK (cardinality(sizes) <= 7 AND sizes <@ ARRAY['xs'::text, 's'::text, 'm'::text, 'l'::text, 'xl'::text, 'xxl'::text, '3xl'::text]);

CREATE FUNCTION public.save_sniper_watchlist (
  p_workspace_id uuid,
  p_id           uuid,
  p_title        text,
  p_catalog_id   integer,
  p_brand        text,
  p_search_text  text,
  p_price_from   numeric,
  p_price_to     numeric,
  p_condition    text,
  p_audience     text,
  p_sizes        text[]
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.save_sniper_watchlist(uuid, uuid, text, integer, text, text, numeric, numeric, text, text, text[]) FROM public, anon;

GRANT ALL ON FUNCTION public.save_sniper_watchlist(uuid, uuid, text, integer, text, text, numeric, numeric, text, text, text[]) TO authenticated;

GRANT ALL ON FUNCTION public.save_sniper_watchlist(uuid, uuid, text, integer, text, text, numeric, numeric, text, text, text[]) TO service_role;

CREATE FUNCTION public.sniper_listing_has_source (
  p_listing_id    uuid,
  p_discovered_by uuid,
  p_source_ids    uuid[]
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
    select coalesce(p_discovered_by = any(p_source_ids), false) or exists (
        select 1 from public.sniper_query_matches as matched
        where matched.listing_id = p_listing_id and matched.query_id = any(p_source_ids)
    );
$function$;

REVOKE ALL ON FUNCTION public.sniper_listing_has_source(uuid, uuid, uuid[]) FROM public, anon, authenticated;

GRANT ALL ON FUNCTION public.sniper_listing_has_source(uuid, uuid, uuid[]) TO service_role;

CREATE FUNCTION public.sniper_search_feed_brands (
  p_workspace_id uuid,
  p_term         text
)
  RETURNS TABLE (
    brand text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
    v_term text := lower(btrim(coalesce(p_term, '')));
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if length(v_term) > 100 then
        raise exception 'Der Markenname ist zu lang.' using errcode = '22023';
    end if;

    -- Ein begrenzter Ausschnitt hält Vorschläge aus Sammelabrufen günstig.
    -- Ein bekannter Markenname kann auch ohne Vorschlag eingegeben werden.
    return query
        with recent as (
            select btrim(listing.brand) as name
            from public.sniper_listings as listing
            where listing.marketplace = 'vinted' and not listing.is_initial_stock
              and listing.first_seen_at >= now() - interval '3 days'
            order by listing.first_seen_at desc, listing.id desc
            limit 20000
        )
        select min(recent.name)
        from recent
        where length(recent.name) between 1 and 100 and strpos(lower(recent.name), v_term) > 0
        group by lower(recent.name)
        order by (strpos(lower(recent.name), v_term) = 1) desc, count(*) desc, min(recent.name)
        limit 25;
end;
$function$;

REVOKE ALL ON FUNCTION public.sniper_search_feed_brands(uuid, text) FROM public, anon;

GRANT ALL ON FUNCTION public.sniper_search_feed_brands(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.sniper_search_feed_brands(uuid, text) TO service_role;

CREATE FUNCTION public.sniper_watchlist_matches_criteria (
  p_watchlist public.sniper_watchlists,
  p_listing   public.sniper_listings
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
    select (p_watchlist.catalog_id is null or not exists (
           select 1 from public.sniper_queries source
           where source.id = p_listing.catalog_source_query_id and source.results_reset_at is not null
             and not public.sniper_listing_after_reset(p_listing.external_id, p_listing.first_seen_at,
                 source.results_reset_at, source.reset_baseline_external_id)))
       and (p_watchlist.brand is null or lower(btrim(p_watchlist.brand)) = lower(btrim(p_listing.brand)))
       and (p_watchlist.legacy_brand_id is null or exists (
           select 1 from public.sniper_queries query
           where (query.id = p_listing.discovered_by_query_id or exists (
               select 1 from public.sniper_query_matches matched where matched.query_id = query.id and matched.listing_id = p_listing.id))
             and (query.brand_id = p_watchlist.legacy_brand_id or exists (
                 select 1 from unnest(query.brand_ids,query.brand_names) as selected_brand(id,name)
                 where selected_brand.id = p_watchlist.legacy_brand_id
                   and lower(btrim(selected_brand.name)) = lower(btrim(p_listing.brand))))))
       and (p_watchlist.search_text is null or strpos(lower(p_listing.title || ' ' || coalesce(p_listing.description, '')), lower(p_watchlist.search_text)) > 0)
       and (p_watchlist.condition is null or p_watchlist.condition = p_listing.condition)
       and (coalesce(cardinality(p_watchlist.sizes), 0) = 0 or exists (
           select 1 from unnest(p_watchlist.sizes) as size
           where public.sniper_feed_matches_size(p_listing.size, size)))
       and (p_watchlist.price_from is null or p_listing.item_price >= p_watchlist.price_from)
       and (p_watchlist.price_to is null or p_listing.item_price <= p_watchlist.price_to)
       and p_listing.currency = 'EUR';
$function$;

REVOKE ALL ON FUNCTION public.sniper_watchlist_matches_criteria(public.sniper_watchlists, public.sniper_listings) FROM public, anon, authenticated;

GRANT ALL ON FUNCTION public.sniper_watchlist_matches_criteria(public.sniper_watchlists, public.sniper_listings) TO service_role;

CREATE OR REPLACE FUNCTION public.sniper_watchlist_matches (
  p_watchlist public.sniper_watchlists,
  p_listing   public.sniper_listings
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
    select (p_watchlist.catalog_id is null or p_watchlist.catalog_id = p_listing.catalog_id)
       and public.sniper_watchlist_matches_criteria(p_watchlist, p_listing);
$function$;

CREATE OR REPLACE FUNCTION public.sniper_feed_search (
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
    v_audience_roots integer[];
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
    if v_watchlist.catalog_id is not null or v_watchlist.audience is not null then
        -- Die Vinted-Wurzelkennungen gehören zur Taxonomie, unabhängig von der Anzeigesprache.
        v_audience_roots := case v_watchlist.audience
            when 'women' then array[1904] when 'men' then array[5] when 'both' then array[1904, 5]
        end;
        with recursive branches(root_id, id) as (
            select root.id, root.id
            from unnest(array_append(coalesce(v_audience_roots, '{}'), v_watchlist.catalog_id)) as root(id)
            where root.id is not null
            union
            select branch.root_id, child.id
            from branches as branch join public.vinted_categories as child on child.parent_id = branch.id
        )
        select array_agg(id) filter (where root_id = v_watchlist.catalog_id),
            array_agg(distinct id) filter (where root_id = any(v_audience_roots))
        into v_category_ids, v_audience_ids from branches;

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
            and (nullif(btrim(p_title_query), '') is null or to_tsvector('simple', coalesce(listing.title,'')) @@ plainto_tsquery('simple', p_title_query))
            and (p_brand is null or lower(btrim(listing.brand)) = lower(btrim(p_brand)))
            and (p_size is null or public.sniper_feed_matches_size(listing.size, p_size))
            and (p_min_price is null or listing.item_price >= p_min_price)
            and (p_max_price is null or listing.item_price <= p_max_price)
            and ((p_min_price is null and p_max_price is null) or listing.currency = 'EUR')
            and (v_category_ids is null or listing.catalog_id = any(v_category_ids)
                or (listing.catalog_id is null and cardinality(v_category_sources) > 0
                    and public.sniper_listing_has_source(listing.id, listing.discovered_by_query_id, v_category_sources)))
            and (v_audience_ids is null or listing.catalog_id = any(v_audience_ids)
                or (listing.catalog_id is null and cardinality(v_audience_sources) > 0
                    and public.sniper_listing_has_source(listing.id, listing.discovered_by_query_id, v_audience_sources)))
            and (p_watchlist_id is null or public.sniper_watchlist_matches_criteria(v_watchlist, listing))
        order by listing.first_seen_at desc, listing.id desc limit p_limit
    ) as page;
    select exists(select 1 from public.sniper_queries as query where query.is_active
        and (v_category_ids is null or query.catalog_id is null or query.catalog_id = any(v_category_ids))
        and (v_audience_ids is null or query.catalog_id is null or query.catalog_id = any(v_audience_ids)))
    into v_covered;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$function$;
