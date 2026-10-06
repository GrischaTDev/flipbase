-- Zentrale Suchfilter: vollständige Bedingungen, optimistische Bearbeitung und
-- atomare Übernahme eines einzelnen budgetierten Teilabrufs. Keine Produktivdatenänderung.
create or replace function public.normalize_sniper_keyword(p_value text)
returns text language sql immutable security invoker set search_path = '' as $$
    select btrim(regexp_replace(
        regexp_replace(lower(normalize(p_value, NFKC)), '[-֊־᐀᠆‐‑‒–—―⸗⸚⸺⸻⹀⹝〜〰゠︱︲﹘﹣－𐺭]', ' ', 'g'),
        '[[:space:]]+', ' ', 'g'));
$$;
revoke all on function public.normalize_sniper_keyword(text) from public, anon, authenticated;
grant execute on function public.normalize_sniper_keyword(text) to service_role;

create or replace function public.stamp_sniper_filter_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
    if old.filter_format_version = 1 and new.filter_format_version <> 1 then
        raise exception 'Ein Suchfilter darf nicht auf das alte Format zurückgesetzt werden.' using errcode = '22023';
    end if;
    if (new.title, new.notes, new.poll_interval_ms, new.search_text, new.catalog_id,
        new.brand_id, new.brand_ids, new.brand_names, new.title_keywords, new.keyword_mode,
        new.price_from, new.price_to, new.is_active, new.deleted_at, new.filter_format_version)
       is distinct from
       (old.title, old.notes, old.poll_interval_ms, old.search_text, old.catalog_id,
        old.brand_id, old.brand_ids, old.brand_names, old.title_keywords, old.keyword_mode,
        old.price_from, old.price_to, old.is_active, old.deleted_at, old.filter_format_version) then
        new.filter_revision := old.filter_revision + 1;
    else
        if old.filter_format_version = 1
           and (new.is_seeded, new.seeded_requests, new.request_cursor, new.last_polled_at,
                new.last_status, new.run_state, new.next_attempt_at, new.consecutive_failures)
               is distinct from (old.is_seeded, old.seeded_requests, old.request_cursor, old.last_polled_at,
                old.last_status, old.run_state, old.next_attempt_at, old.consecutive_failures)
           and current_setting('flipbase.sniper_run', true) is distinct from old.id::text || ':' || old.filter_revision::text then
            raise exception 'Dieser Suchfilter benötigt den aktualisierten Abrufdienst.' using errcode = '55000';
        end if;
        -- Betriebsstempel und Cursor sind ausdrücklich keine Formularrevision.
        new.filter_revision := old.filter_revision;
    end if;
    return new;
end;
$$;
revoke all on function public.stamp_sniper_filter_revision() from public, anon, authenticated;
create trigger stamp_sniper_filter_revision before update on public.sniper_queries
    for each row execute function public.stamp_sniper_filter_revision();

create or replace function public.save_sniper_search_filter(
    p_id uuid, p_title text, p_catalog_id integer, p_brands jsonb,
    p_title_keywords text[], p_keyword_mode text, p_poll_interval_ms integer,
    p_notes text, p_expected_revision integer,
    p_search_text text default null, p_price_from numeric default null, p_price_to numeric default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_existing public.sniper_queries;
    v_id uuid;
    v_key text;
    v_brand_ids integer[] := '{}';
    v_brand_names text[] := '{}';
    v_keywords text[] := '{}';
    v_brand jsonb;
    v_brand_id integer;
    v_brand_name text;
    v_keyword text;
    v_changed boolean;
begin
    if not public.is_platform_operator() then
        raise exception 'Nur die Administration darf Suchfilter verwalten.' using errcode = '42501';
    end if;
    p_title := nullif(btrim(regexp_replace(p_title, '[[:space:]]+', ' ', 'g')), '');
    p_notes := nullif(btrim(p_notes), '');
    p_search_text := nullif(btrim(p_search_text), '');
    if p_title is null or length(p_title) > 100 then
        raise exception 'Bitte einen Filternamen mit 1 bis 100 Zeichen angeben.' using errcode = '22023';
    end if;
    if length(p_notes) > 2000 or length(p_search_text) > 200 then
        raise exception 'Notiz oder bestehender Suchtext ist zu lang.' using errcode = '22023';
    end if;
    if p_poll_interval_ms is null or p_poll_interval_ms not between 10000 and 86400000 then
        raise exception 'Der Takt muss zwischen 10 Sekunden und 24 Stunden liegen.' using errcode = '22023';
    end if;
    if p_catalog_id is not null and (p_catalog_id <= 0 or not exists (select 1 from public.vinted_categories where id = p_catalog_id)) then
        raise exception 'Die ausgewählte Vinted-Kategorie ist nicht mehr verfügbar. Bitte neu auswählen.' using errcode = '22023';
    end if;
    if p_brands is null or jsonb_typeof(p_brands) <> 'array' then
        raise exception 'Marken müssen als Liste vorliegen.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_brands) > 10 then
        raise exception 'Bitte höchstens zehn Marken auswählen.' using errcode = '22023';
    end if;
    for v_brand in select value from jsonb_array_elements(p_brands) loop
        if jsonb_typeof(v_brand) is distinct from 'object' or jsonb_typeof(v_brand->'id') is distinct from 'number'
           or jsonb_typeof(v_brand->'name') is distinct from 'string' then
            raise exception 'Eine ausgewählte Marke ist ungültig.' using errcode = '22023';
        end if;
        if (v_brand->>'id')::numeric not between 1 and 2147483647
           or trunc((v_brand->>'id')::numeric) <> (v_brand->>'id')::numeric then
            raise exception 'Eine ausgewählte Markenkennung ist ungültig.' using errcode = '22023';
        end if;
        v_brand_id := (v_brand->>'id')::integer;
        v_brand_name := nullif(btrim(v_brand->>'name'), '');
        if v_brand_name is null or length(v_brand_name) > 100 then
            raise exception 'Eine ausgewählte Marke hat keinen gültigen Namen.' using errcode = '22023';
        end if;
        if not v_brand_id = any(v_brand_ids) then
            v_brand_ids := array_append(v_brand_ids, v_brand_id);
            v_brand_names := array_append(v_brand_names, v_brand_name);
        end if;
    end loop;
    select coalesce(array_agg(id order by id), '{}'), coalesce(array_agg(name order by id), '{}')
        into v_brand_ids, v_brand_names from unnest(v_brand_ids, v_brand_names) as brand(id, name);
    if p_title_keywords is null or cardinality(p_title_keywords) > 10
       or coalesce(array_ndims(p_title_keywords), 1) <> 1 then
        raise exception 'Bitte höchstens zehn Titelbegriffe angeben.' using errcode = '22023';
    end if;
    foreach v_keyword in array p_title_keywords loop
        v_keyword := public.normalize_sniper_keyword(v_keyword);
        if v_keyword is null or length(v_keyword) not between 1 and 80 or v_keyword !~ '[[:alnum:]]' then
            raise exception 'Jeder Titelbegriff braucht 1 bis 80 Zeichen und Buchstaben oder Zahlen.' using errcode = '22023';
        end if;
        if not v_keyword = any(v_keywords) then v_keywords := array_append(v_keywords, v_keyword); end if;
    end loop;
    select coalesce(array_agg(term order by term collate "C"), '{}') into v_keywords from unnest(v_keywords) term;
    if p_keyword_mode is null or p_keyword_mode not in ('all', 'any') then
        raise exception 'Bitte die Verknüpfung der Titelbegriffe auswählen.' using errcode = '22023';
    end if;
    if cardinality(v_keywords) <= 1 then p_keyword_mode := 'all'; end if;
    if p_catalog_id is null and cardinality(v_brand_ids) = 0 and cardinality(v_keywords) = 0 and p_search_text is null then
        raise exception 'Bitte mindestens eine Kategorie, Marke oder einen Titelbegriff auswählen.' using errcode = '22023';
    end if;
    if (p_price_from is not null and (p_price_from < 0 or p_price_from > 9999999999.99 or round(p_price_from, 2) <> p_price_from))
       or (p_price_to is not null and (p_price_to < 0 or p_price_to > 9999999999.99 or round(p_price_to, 2) <> p_price_to))
       or (p_price_from is not null and p_price_to is not null and p_price_from > p_price_to) then
        raise exception 'Bitte gültige Preisgrenzen angeben.' using errcode = '22023';
    end if;
    -- Alte reine Markenfilter behalten exakt ihre bisherige fachliche Identität.
    if cardinality(v_keywords) = 0 and cardinality(v_brand_ids) <= 1 then
        v_key := concat_ws('|', 'vinted', 'search=' || coalesce(lower(regexp_replace(p_search_text, '[[:space:]]+', ' ', 'g')), ''),
            'catalog=' || coalesce(p_catalog_id::text, '-'), 'brand=' || coalesce(v_brand_ids[1]::text, '-'),
            'price_from=' || coalesce(trim_scale(p_price_from)::text, '-'), 'price_to=' || coalesce(trim_scale(p_price_to)::text, '-'));
    else
        v_key := 'vinted|filter=' || jsonb_build_array(
            1, lower(regexp_replace(p_search_text, '[[:space:]]+', ' ', 'g')), p_catalog_id,
            v_brand_ids, (select array_agg(term order by term collate "C") from unnest(v_keywords) term),
            p_keyword_mode, p_price_from, p_price_to)::text;
    end if;
    if p_id is null then
        select * into v_existing from public.sniper_queries where query_key = v_key for update;
        if found and v_existing.deleted_at is null then
            raise exception 'Ein Suchfilter mit diesen Bedingungen besteht bereits.' using errcode = '23505';
        end if;
        v_id := v_existing.id;
    else
        select * into v_existing from public.sniper_queries where id = p_id and deleted_at is null for update;
        if not found then raise exception 'Suchfilter nicht gefunden.' using errcode = '22023'; end if;
        if p_expected_revision is distinct from v_existing.filter_revision then
            raise exception 'Der Suchfilter wurde inzwischen geändert. Bitte neu öffnen und Deine Änderungen erneut prüfen.' using errcode = '40001';
        end if;
        if v_existing.marketplace <> 'vinted' then raise exception 'Dieser Marktplatz wird hier nicht unterstützt.' using errcode = '22023'; end if;
        v_id := p_id;
    end if;
    if v_id is null then
        insert into public.sniper_queries(query_key, title, catalog_id, brand_id, brand_ids, brand_names,
            title_keywords, keyword_mode, filter_format_version, search_text, price_from, price_to,
            poll_interval_ms, notes, is_active)
        values (v_key, p_title, p_catalog_id, case when cardinality(v_brand_ids) = 1 then v_brand_ids[1] end,
            v_brand_ids, v_brand_names, v_keywords, p_keyword_mode, 1, p_search_text, p_price_from, p_price_to,
            p_poll_interval_ms, p_notes, false) returning id into v_id;
    else
        v_changed := v_existing.query_key is distinct from v_key or v_existing.filter_format_version <> 1 or v_existing.deleted_at is not null;
        update public.sniper_queries set query_key = v_key, title = p_title, catalog_id = p_catalog_id,
            brand_id = case when cardinality(v_brand_ids) = 1 then v_brand_ids[1] end,
            brand_ids = v_brand_ids, brand_names = v_brand_names, title_keywords = v_keywords,
            keyword_mode = p_keyword_mode, search_text = p_search_text, price_from = p_price_from, price_to = p_price_to,
            poll_interval_ms = p_poll_interval_ms, notes = p_notes, deleted_at = null, filter_format_version = 1,
            is_active = case when v_changed then false else is_active end,
            is_seeded = case when v_changed then false else is_seeded end,
            seeded_requests = case when v_changed then '{}'::integer[] else seeded_requests end,
            request_cursor = case when v_changed then 0 else request_cursor end,
            run_state = case when v_changed then 'ready' else run_state end,
            next_attempt_at = case when v_changed then null else next_attempt_at end,
            last_polled_at = case when v_changed then null else last_polled_at end,
            last_status = case when v_changed then 'never_polled' else last_status end,
            updated_at = now()
        where id = v_id;
    end if;
    return v_id;
exception when unique_violation then
    raise exception 'Ein Suchfilter mit diesen Bedingungen besteht bereits.' using errcode = '23505';
end;
$$;
revoke all on function public.save_sniper_search_filter(uuid,text,integer,jsonb,text[],text,integer,text,integer,text,numeric,numeric) from public, anon, authenticated;
grant execute on function public.save_sniper_search_filter(uuid,text,integer,jsonb,text[],text,integer,text,integer,text,numeric,numeric) to authenticated;

-- Ein alter Dienst darf einen neuen Titel-/Mehrmarkenfilter nicht ungeprüft schreiben.
create or replace function public.guard_sniper_search_filter_ingestion()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_query public.sniper_queries;
begin
    if new.discovered_by_query_id is null then return new; end if;
    select * into v_query from public.sniper_queries where id = new.discovered_by_query_id;
    if v_query.filter_format_version = 1 and current_setting('flipbase.sniper_run', true)
       is distinct from v_query.id::text || ':' || v_query.filter_revision::text then
        raise exception 'Dieser Suchfilter benötigt den aktualisierten Abrufdienst.' using errcode = '55000';
    end if;
    return new;
end;
$$;
revoke all on function public.guard_sniper_search_filter_ingestion() from public, anon, authenticated;
create trigger guard_sniper_search_filter_ingestion before insert on public.sniper_listings
    for each row execute function public.guard_sniper_search_filter_ingestion();

create or replace function public.complete_sniper_search_filter_run(
    p_query_id uuid, p_revision integer, p_cursor integer, p_listings jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_query public.sniper_queries;
    v_count integer;
    v_index integer;
    v_created integer;
    v_hits integer;
    v_seed boolean;
    v_external_ids text[];
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
    if jsonb_array_length(p_listings) > 96 then raise exception 'Zu viele Artikel in einem Abruf.' using errcode = '22023'; end if;
    v_count := greatest(cardinality(v_query.brand_ids), 1) * case
        when v_query.search_text is not null or v_query.keyword_mode = 'all' then 1
        else greatest(cardinality(v_query.title_keywords), 1) end;
    if p_cursor < 0 or p_cursor >= 2147483647 then raise exception 'Ungültige Abrufposition.' using errcode = '22023'; end if;
    v_index := p_cursor % v_count;
    v_seed := not v_index = any(v_query.seeded_requests);
    perform set_config('flipbase.sniper_run', v_query.id::text || ':' || v_query.filter_revision::text, true);
    with inserted as (
        insert into public.sniper_listings(marketplace, external_id, title, url, description, image_urls,
            item_price, total_price, currency, brand, size, condition, country_code, seller_name,
            seller_avatar_url, seller_rating, seller_review_count, is_hidden, item_updated_at,
            photo_uploaded_at, discovered_by_query_id)
        select v_query.marketplace, item.external_id, item.title, item.url, item.description, coalesce(item.image_urls, '{}'),
            item.item_price, item.total_price, item.currency, item.brand, item.size, item.condition,
            item.country_code, item.seller_name, item.seller_avatar_url, item.seller_rating, item.seller_review_count,
            coalesce(item.is_hidden, false), item.item_updated_at, item.photo_uploaded_at, p_query_id
        from jsonb_to_recordset(p_listings) item(external_id text, title text, url text, description text, image_urls text[],
            item_price numeric, total_price numeric, currency text, brand text, size text, condition text,
            country_code text, seller_name text, seller_avatar_url text, seller_rating numeric,
            seller_review_count integer, is_hidden boolean, item_updated_at timestamptz, photo_uploaded_at timestamptz)
        on conflict (marketplace, external_id) do nothing returning 1
    ) select count(*)::integer into v_created from inserted;
    select coalesce(array_agg(item->>'external_id'), '{}') into v_external_ids from jsonb_array_elements(p_listings) item;
    -- Eine Oberkategorie ist keine bekannte Blattkategorie für Preisvergleiche.
    if exists (select 1 from public.vinted_categories where id = v_query.catalog_id and is_leaf) then
        perform public.record_sniper_listing_category(p_query_id, v_external_ids);
    end if;
    v_hits := public.sniper_evaluate_watchlist_hits(p_query_id, not v_seed);
    if v_seed then v_query.seeded_requests := array_append(v_query.seeded_requests, v_index); end if;
    update public.sniper_queries set seeded_requests = v_query.seeded_requests,
        is_seeded = cardinality(v_query.seeded_requests) = v_count,
        request_cursor = p_cursor + 1, run_state = 'ready', next_attempt_at = null,
        last_attempt_at = now(), last_success_at = now(), last_polled_at = now(), last_status = 'ok',
        consecutive_failures = 0, updated_at = now() where id = p_query_id;
    perform set_config('flipbase.sniper_run', '', true);
    return jsonb_build_object('accepted', true, 'created', v_created, 'seeded', v_seed, 'hits', v_hits);
end;
$$;
revoke all on function public.complete_sniper_search_filter_run(uuid,integer,integer,jsonb) from public, anon, authenticated;
grant execute on function public.complete_sniper_search_filter_run(uuid,integer,integer,jsonb) to service_role;

create or replace function public.record_sniper_search_filter_failure(
    p_query_id uuid, p_revision integer, p_cursor integer, p_run_state text, p_next_attempt_at timestamptz,
    p_error_kind text, p_error_message text, p_failure_count integer, p_status text
)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_query public.sniper_queries;
begin
    select * into v_query from public.sniper_queries where id = p_query_id for update;
    if not found or not v_query.is_active or v_query.deleted_at is not null
       or v_query.filter_revision is distinct from p_revision or v_query.request_cursor is distinct from p_cursor then return; end if;
    if v_query.filter_format_version <> 1 then raise exception 'Ungültiges Suchfilterformat.' using errcode = '22023'; end if;
    perform set_config('flipbase.sniper_run', v_query.id::text || ':' || v_query.filter_revision::text, true);
    update public.sniper_queries set run_state = p_run_state, next_attempt_at = p_next_attempt_at,
        last_attempt_at = now(), last_error_kind = p_error_kind, last_error_at = now(),
        last_error_message = left(p_error_message, 500), last_polled_at = now(), last_status = p_status,
        consecutive_failures = p_failure_count, updated_at = now() where id = p_query_id;
    perform set_config('flipbase.sniper_run', '', true);
end;
$$;
revoke all on function public.record_sniper_search_filter_failure(uuid,integer,integer,text,timestamptz,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.record_sniper_search_filter_failure(uuid,integer,integer,text,timestamptz,text,text,integer,text) to service_role;
