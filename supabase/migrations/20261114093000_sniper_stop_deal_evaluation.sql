-- Beendet die verworfene Deal-Erkennung im Sniper-Abruf: complete_sniper_search_filter_run
-- stößt keine Merkzettelbewertung mehr an und öffnet keine Bewertung erneut.
-- Betroffen: Funktion public.complete_sniper_search_filter_run. Tabellen und Spalten bleiben unverändert.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

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
    return jsonb_build_object('accepted', true, 'created', v_created, 'seeded', v_seed, 'hits', 0);
end;
$$;
