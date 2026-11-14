-- Entfernt die verworfene Deal-Erkennung des Snipers vollständig aus der Datenbank.
-- Betroffen: Tabellen public.sniper_watchlist_hits, public.sniper_hits, public.sniper_query_subscriptions (entfallen);
-- Spalten public.sniper_listings.evaluated_at und .watchlist_evaluated_at sowie
-- public.sniper_watchlists.discount_threshold_percent und .starts_at (entfallen);
-- Funktionen der Bewertung, des Referenzpreises, des alten Abonnements und der abgelösten Feeds (entfallen);
-- public.save_sniper_watchlist, public.complete_sniper_search_filter_run, public.sniper_feed_search und
-- public.sniper_normalize_favorite_item (ohne Deal-Angaben); gespeicherte Favoriten verlieren ihre Deal-Angaben.
-- Suchfilter-Karten, Herz-Favoriten, Feed und Preisvergleich bleiben unverändert nutzbar.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

-- Der Sniper und der Feed greifen im Sekundentakt in wechselnder Reihenfolge auf diese Tabellen zu.
-- Alle Sperren werden deshalb vorab gemeinsam und ohne Warten geholt; ein Fehlversuch gibt sie
-- vollständig wieder frei. So kann die Migration nicht mit laufenden Abrufen verklemmen.
do $$
declare
    v_attempt integer := 0;
begin
    loop
        v_attempt := v_attempt + 1;
        begin
            lock table public.sniper_queries, public.sniper_listings, public.sniper_query_matches,
                public.sniper_watchlists, public.sniper_watchlist_hits, public.sniper_hits,
                public.sniper_query_subscriptions in access exclusive mode nowait;
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

-- Destruktiv: Die Richtlinien gaben Mitgliedern Lesezugriff über Abonnements der ersten Deal-Generation.
-- Die Tabelle der Abonnements ist in Produktion leer; die Administration liest weiter über eigene Richtlinien.
drop policy if exists "Abonnenten duerfen ihre Abfragen lesen" on public.sniper_queries;
drop policy if exists "Abonnenten lesen Filterzuordnungen" on public.sniper_query_matches;

-- Destruktiv: Bewertung, Referenzpreis und altes Abonnement werden seit dem Abschalten nicht mehr aufgerufen.
drop function if exists public.sniper_evaluate_pending_watchlist_hits(integer);
drop function if exists public.sniper_evaluate_watchlist_hits(uuid, boolean);
drop function if exists public.sniper_evaluate_hits(uuid, boolean);
drop function if exists public.sniper_reference_price(integer, text, text);
drop function if exists public.sniper_reference_price(uuid, text);
drop function if exists public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric);

-- Destruktiv: Diese Feed-Fassungen sind durch public.sniper_feed_search abgelöst und werden von der
-- Oberfläche nicht mehr aufgerufen; sie lasen die Deal-Treffer mit.
drop function if exists public.sniper_feed(uuid, uuid, boolean, timestamptz, uuid, integer);
drop function if exists public.sniper_feed_by_brand(uuid, uuid, text, timestamptz, uuid, integer);
drop function if exists public.sniper_feed_filtered(uuid, uuid, text, text, numeric, numeric, timestamptz, uuid, integer);

-- Destruktiv: Die festgehaltenen Deals (zuletzt 35 Zeilen) und die leeren Tabellen der ersten
-- Deal-Generation werden samt Richtlinien, Indizes und Rechten gelöscht. Es gibt keinen Ersatz.
drop table if exists public.sniper_watchlist_hits;
drop table if exists public.sniper_hits;
drop table if exists public.sniper_query_subscriptions;

-- Destruktiv: Die Bewertungsvermerke je Angebot und ihre Teilindizes entfallen.
drop index if exists public.idx_sniper_listings_unevaluated;
drop index if exists public.idx_sniper_listings_watchlist_pending;
drop index if exists public.idx_sniper_listings_watchlist_pending_global;
alter table public.sniper_listings drop column if exists evaluated_at, drop column if exists watchlist_evaluated_at;

-- Destruktiv: Rabattschwelle und Startzeitpunkt der Deal-Bewertung je Suchfilter-Karte entfallen.
drop function if exists public.save_sniper_watchlist(uuid, uuid, text, integer, text, text, numeric, numeric, text, numeric, boolean);
alter table public.sniper_watchlists drop column if exists discount_threshold_percent, drop column if exists starts_at;

create function public.save_sniper_watchlist(p_workspace_id uuid, p_id uuid, p_title text, p_catalog_id integer, p_brand text, p_search_text text, p_price_from numeric, p_price_to numeric, p_condition text, p_is_active boolean)
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
        select 1 from public.vinted_categories where id = p_catalog_id and is_leaf
    ) then raise exception 'Bitte eine vorhandene Blattkategorie waehlen.' using errcode = '22023'; end if;
    if length(coalesce(p_brand, '')) > 100 or length(coalesce(p_search_text, '')) > 200
       or length(coalesce(p_condition, '')) > 100 then
        raise exception 'Suchkriterien sind zu lang.' using errcode = '22023';
    end if;
    if p_id is null then
        insert into public.sniper_watchlists(workspace_id, title, catalog_id, brand, search_text,
            price_from, price_to, condition, is_active)
        values (p_workspace_id, btrim(p_title), p_catalog_id, nullif(btrim(p_brand), ''),
            nullif(btrim(p_search_text), ''), p_price_from, p_price_to,
            nullif(btrim(p_condition), ''), p_is_active)
        returning id into v_id;
    else
        update public.sniper_watchlists set title = btrim(p_title), catalog_id = p_catalog_id,
            brand = nullif(btrim(p_brand), ''), search_text = nullif(btrim(p_search_text), ''),
            price_from = p_price_from, price_to = p_price_to, condition = nullif(btrim(p_condition), ''),
            is_active = p_is_active,
            legacy_brand_id = case when nullif(btrim(p_brand), '') is not null then null else legacy_brand_id end
        where id = p_id and workspace_id = p_workspace_id returning id into v_id;
        if v_id is null then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;
    return v_id;
end;
$function$
;
revoke all on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,boolean) from public, anon;
grant execute on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,boolean) to authenticated;

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
    -- Ein gleichzeitig neu eingelesener Filter darf einen frischen Fund eines
    -- bereits gesäten Filters nicht stumm schalten. Älterer Erstbestand bleibt unverändert.
    if not v_seed then
        -- Frischer Fund eines laufenden Filters: Erstbestand eines anderen Filters wird sichtbar.
        update public.sniper_listings listing set is_initial_stock = false
        where listing.id = any(v_new_matches) and listing.is_initial_stock;
    end if;
    -- Eine Oberkategorie ist keine bekannte Blattkategorie für Preisvergleiche.
    if exists (select 1 from public.vinted_categories where id = v_query.catalog_id and is_leaf) then
        perform public.record_sniper_listing_category(p_query_id, v_external_ids);
    end if;
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
    -- 'hits' bleibt mit 0 erhalten, solange ein älterer Dienst während einer Auslieferung die Antwort prüft.
    return jsonb_build_object('accepted', true, 'created', v_created, 'seeded', v_seed, 'hits', 0);
end;
$$;

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

create or replace function public.sniper_normalize_favorite_item(p_item jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
    foreach v_field in array array['brand','size','condition','category_path'] loop
        if p_item->v_field is not null and p_item->v_field <> 'null'::jsonb and
           (jsonb_typeof(p_item->v_field) <> 'string' or length(p_item->>v_field) > case when v_field='category_path' then 1000 else 200 end) then
            raise exception 'Ungültige Artikelmerkmale.' using errcode = '22023';
        end if;
    end loop;
    if p_item->'catalog_id' is not null and p_item->'catalog_id' <> 'null'::jsonb and jsonb_typeof(p_item->'catalog_id') <> 'number' then
        raise exception 'Ungültige Kategorieangabe.' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(image), '[]'::jsonb) into v_images
    from jsonb_array_elements(p_item->'image_urls') image
    where jsonb_typeof(image)='string' and length(image #>> '{}') <= 2048
      and (image #>> '{}') ~ '^https://[a-zA-Z0-9.-]+\.vinted\.net/';
    return jsonb_build_object(
        'id', v_id, 'title', btrim(p_item->>'title'), 'url', p_item->>'url', 'image_urls', v_images,
        'item_price', v_price, 'total_price', v_total, 'currency', p_item->>'currency',
        'first_seen_at', v_first_seen, 'brand', p_item->'brand', 'size', p_item->'size',
        'condition', p_item->'condition', 'catalog_id', p_item->'catalog_id', 'category_path', p_item->'category_path',
        'is_hidden', coalesce(p_item->'is_hidden' = 'true'::jsonb, false));
end;
$$;

-- Bereits gespeicherte Favoriten verlieren die mitkopierten Deal-Angaben; alle übrigen Angaben bleiben.
update public.sniper_favorites
set snapshot = snapshot - 'reference_price' - 'reference_scope' - 'discount_percent' - 'watchlist_title'
where snapshot ?| array['reference_price', 'reference_scope', 'discount_percent', 'watchlist_title'];
