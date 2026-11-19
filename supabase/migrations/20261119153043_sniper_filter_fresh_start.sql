-- Adds an opt-in fresh start for a single Sniper filter and preserves existing listing records.

ALTER TABLE public.sniper_queries
  ADD COLUMN results_reset_at timestamp with time zone;

ALTER TABLE public.sniper_queries
  ADD COLUMN reset_baseline_external_id text;

ALTER TABLE public.sniper_queries
  ADD CONSTRAINT sniper_queries_reset_baseline_valid CHECK (reset_baseline_external_id IS NULL OR results_reset_at IS
    NOT NULL AND reset_baseline_external_id ~ '^(0|[1-9][0-9]{0,17})$'::text);

COMMENT ON COLUMN public.sniper_queries.results_reset_at IS 'Vergangene Zuordnungen dieses Filters bleiben gespeichert und werden ab diesem Zeitpunkt ausgeblendet.';

COMMENT ON COLUMN public.sniper_queries.reset_baseline_external_id IS 'Höchste Artikelnummer aus dem ersten Katalogabruf nach einem Reset, als Dezimaltext ohne Rundung.';

CREATE FUNCTION public.sniper_listing_after_reset (
  p_external_id          text,
  p_first_seen_at        timestamp with time zone,
  p_reset_at             timestamp with time zone,
  p_baseline_external_id text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
    select case
        when p_reset_at is null then true
        when p_baseline_external_id is not null and p_external_id ~ '^[1-9][0-9]{0,17}$'
            then p_first_seen_at >= p_reset_at and p_external_id::bigint > p_baseline_external_id::bigint
        else false
    end;
$function$;

revoke all on function public.sniper_listing_after_reset(text,timestamptz,timestamptz,text) from public, anon, authenticated;

grant execute on function public.sniper_listing_after_reset(text,timestamptz,timestamptz,text) to service_role;

CREATE OR REPLACE FUNCTION public.stamp_sniper_filter_revision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
    if old.filter_format_version = 1 and new.filter_format_version <> 1 then
        raise exception 'Ein Suchfilter darf nicht auf das alte Format zurückgesetzt werden.' using errcode = '22023';
    end if;
    if (new.title, new.notes, new.poll_interval_ms, new.search_text, new.catalog_id,
        new.brand_id, new.brand_ids, new.brand_names, new.title_keywords, new.keyword_mode,
        new.excluded_title_keywords, new.price_from, new.price_to, new.is_active, new.deleted_at,
        new.filter_format_version, new.results_reset_at)
       is distinct from
       (old.title, old.notes, old.poll_interval_ms, old.search_text, old.catalog_id,
        old.brand_id, old.brand_ids, old.brand_names, old.title_keywords, old.keyword_mode,
        old.excluded_title_keywords, old.price_from, old.price_to, old.is_active, old.deleted_at,
        old.filter_format_version, old.results_reset_at) then
        new.filter_revision := old.filter_revision + 1;
    else
        if old.filter_format_version = 1
           and (new.is_seeded, new.seeded_requests, new.request_cursor, new.last_polled_at,
                new.last_status, new.run_state, new.next_attempt_at, new.consecutive_failures,
                new.reset_baseline_external_id)
               is distinct from (old.is_seeded, old.seeded_requests, old.request_cursor, old.last_polled_at,
                old.last_status, old.run_state, old.next_attempt_at, old.consecutive_failures,
                old.reset_baseline_external_id)
           and current_setting('flipbase.sniper_run', true) is distinct from old.id::text || ':' || old.filter_revision::text then
            raise exception 'Dieser Suchfilter benötigt den aktualisierten Abrufdienst.' using errcode = '55000';
        end if;
        -- Betriebsstempel und Cursor sind ausdrücklich keine Formularrevision.
        new.filter_revision := old.filter_revision;
    end if;
    return new;
end;
$function$;

CREATE FUNCTION public.reset_sniper_search_filter_results (
  p_query_id          uuid,
  p_expected_revision integer
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
    v_query public.sniper_queries;
    v_revision integer;
begin
    select * into v_query from public.sniper_queries where id = p_query_id for update;
    if not found or not v_query.is_active or v_query.deleted_at is not null
       or v_query.marketplace <> 'vinted' or v_query.filter_format_version <> 1 then
        raise exception 'Der Suchfilter muss aktiv sein.' using errcode = '22023';
    end if;
    if v_query.filter_revision is distinct from p_expected_revision then
        raise exception 'Der Suchfilter wurde inzwischen geändert.' using errcode = '40001';
    end if;
    if cardinality(v_query.brand_ids) > 1
       or (v_query.search_text is null and v_query.keyword_mode = 'any' and cardinality(v_query.title_keywords) > 1)
       or not exists (select 1 from public.vinted_categories where id = v_query.catalog_id and is_leaf) then
        raise exception 'Der Neustart benötigt eine Blattkategorie und einen einzigen Teilabruf.' using errcode = '22023';
    end if;
    update public.sniper_queries
    set results_reset_at = now(), reset_baseline_external_id = null,
        is_seeded = false, seeded_requests = '{}', request_cursor = 0, newest_external_id = null,
        run_state = 'ready', next_attempt_at = null, last_polled_at = null, last_attempt_at = null,
        last_success_at = null, last_status = 'never_polled', consecutive_failures = 0,
        last_error_kind = null, last_error_at = null, last_error_message = null,
        coverage_status = 'initial', coverage_checked_at = null, last_request_duration_ms = null, updated_at = now()
    where id = p_query_id returning filter_revision into v_revision;
    return v_revision;
end;
$function$;

revoke all on function public.reset_sniper_search_filter_results(uuid,integer) from public, anon, authenticated;

grant execute on function public.reset_sniper_search_filter_results(uuid,integer) to service_role;

CREATE OR REPLACE FUNCTION public.complete_sniper_search_filter_run (
  p_query_id    uuid,
  p_revision    integer,
  p_cursor      integer,
  p_listings    jsonb,
  p_diagnostics jsonb   DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
    if v_query.catalog_id is not null and not exists (select 1 from public.vinted_categories where id = v_query.catalog_id) then
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
    -- Titelregeln zusätzlich im geschützten Schreibweg prüfen; Beschreibung zählt nie.
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
$function$;

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
       and (p_watchlist.catalog_id is null or not exists (
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
       and (p_watchlist.price_from is null or p_listing.item_price >= p_watchlist.price_from)
       and (p_watchlist.price_to is null or p_listing.item_price <= p_watchlist.price_to)
       and p_listing.currency = 'EUR';
$function$;

CREATE OR REPLACE FUNCTION public.sniper_query_listing_counts()
  RETURNS TABLE (
    query_id      uuid,
    listing_count bigint
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
    if not public.is_platform_operator() then raise exception 'Nur fuer die Administration' using errcode = '42501'; end if;
    return query with associations as (
        select matched.query_id as filter_id, matched.listing_id
        from public.sniper_query_matches matched
        join public.sniper_listings listing on listing.id = matched.listing_id
        join public.sniper_queries filter on filter.id = matched.query_id
        where matched.first_matched_at >= now() - interval '24 hours'
          and (filter.results_reset_at is null or matched.first_matched_at >= filter.results_reset_at)
          and public.sniper_listing_after_reset(listing.external_id, listing.first_seen_at,
                filter.results_reset_at, filter.reset_baseline_external_id)
        union
        select listing.discovered_by_query_id, listing.id from public.sniper_listings listing
        join public.sniper_queries filter on filter.id = listing.discovered_by_query_id
        where listing.first_seen_at >= now() - interval '24 hours' and listing.discovered_by_query_id is not null
          and public.sniper_listing_after_reset(listing.external_id, listing.first_seen_at,
                filter.results_reset_at, filter.reset_baseline_external_id)
    ) select filter_id, count(*) from associations group by filter_id;
end;
$function$;
