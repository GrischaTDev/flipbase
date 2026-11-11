-- Korrigiert Pflege und Mengenbegrenzung des Vinted-Vergleichsbestands bei aktivem pg_safeupdate.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

create or replace function public.claim_vinted_comparison_task (
  p_now timestamp with time zone
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare
    v_scope public.vinted_comparison_scopes;
    v_item public.vinted_comparison_items;
    v_query public.sniper_queries;
    v_token uuid := pg_catalog.gen_random_uuid();
    v_kind text;
    v_previous_kind text;
begin
    if p_now is null or abs(extract(epoch from p_now - now())) > 300 then
        raise exception 'Ungueltiger Abrufzeitpunkt.' using errcode = '22023';
    end if;
    if not pg_catalog.pg_try_advisory_xact_lock(560,2) then return null; end if;
    -- Veränderte oder lange pausierte Bereiche beginnen mit einem neuen Sieben-Tage-Fenster.
    delete from public.vinted_comparison_scopes s using public.sniper_queries q
        where q.id=s.query_id and (q.filter_revision <> s.query_revision
            or (q.is_active and s.last_catalog_at < p_now - interval '30 days'));
    -- Bestehende Feedfilter bleiben unverändert; nur diese getrennten Bereiche verlieren Preisgrenzen.
    insert into public.vinted_comparison_scopes(query_id, query_revision, request_cursor, window_start, created_at)
    select q.id, q.filter_revision, cursor, p_now - interval '7 days', p_now
    from public.sniper_queries q
    cross join lateral generate_series(0,
        greatest(coalesce(cardinality(q.brand_ids), 0), 1) *
        case when nullif(btrim(q.search_text), '') is null and q.keyword_mode = 'any'
            then greatest(coalesce(cardinality(q.title_keywords), 0), 1) else 1 end - 1) cursor
    where q.is_active and q.run_state <> 'invalid' and q.filter_format_version = 1
    on conflict (query_id, request_cursor) do update set
        query_revision = excluded.query_revision, window_start = excluded.window_start,
        created_at = excluded.created_at, page = 1, initial_finished_at = null,
        coverage_limited = false, next_attempt_at = p_now, lease_token = null, lease_until = null
    where public.vinted_comparison_scopes.query_revision <> excluded.query_revision;

    -- Datumspflege nutzt den Index; eine aufwendigere Mengenkontrolle höchstens stündlich.
    delete from public.vinted_comparison_items where id in (
        select id from public.vinted_comparison_items
        where (status = 'sold' and sold_detected_at < p_now - interval '30 days')
            or (status = 'unavailable' and checked_at < p_now - interval '7 days')
            or (status <> 'sold' and first_seen_at < p_now - interval '90 days')
        order by first_seen_at limit 1000
    );
    if exists(select 1 from public.vinted_comparison_scopes where maintenance_at is null
        or maintenance_at < p_now-interval '1 hour') and pg_catalog.pg_try_advisory_xact_lock(560,1) then
        if (select count(*) from public.vinted_comparison_items) > 250000 then
            delete from public.vinted_comparison_items where id in (
                select id from public.vinted_comparison_items order by first_seen_at desc, id desc
                offset 250000 limit 10000
            );
            update public.vinted_comparison_scopes set coverage_limited=true
            where not coverage_limited;
        end if;
        -- Der gemeinsame Stundentakt gilt auch für frische Bereiche; unveränderte Werte auslassen.
        update public.vinted_comparison_scopes set maintenance_at=p_now
        where maintenance_at is distinct from p_now;
    end if;

    -- Detailprüfungen wechseln mit Katalogseiten; fehlende Quelle ist niemals ein Verkauf.
    select i.* into v_item from public.vinted_comparison_items i
    where i.next_attempt_at <= p_now and (i.lease_until is null or i.lease_until < p_now)
        and i.status in ('active', 'unknown')
        and exists (select 1 from public.vinted_comparison_matches m
            join public.vinted_comparison_scopes s on s.id = m.scope_id
            join public.sniper_queries q on q.id = s.query_id
            where m.item_id = i.id and q.is_active and q.run_state <> 'invalid'
                and q.filter_revision = s.query_revision)
    order by i.checked_at nulls first, i.next_attempt_at, i.id
    limit 1 for update skip locked;

    select s.* into v_scope from public.vinted_comparison_scopes s
    join public.sniper_queries q on q.id = s.query_id
    where q.is_active and q.run_state <> 'invalid' and q.filter_revision = s.query_revision
        and s.next_attempt_at <= p_now and (s.lease_until is null or s.lease_until < p_now)
    order by s.last_catalog_at nulls first, s.next_attempt_at, s.id
    limit 1 for update of s skip locked;

    select last_claim_kind into v_previous_kind from public.vinted_comparison_scopes order by id limit 1;
    if v_scope.id is not null and (v_item.id is null or v_previous_kind is distinct from 'catalog') then
        v_kind := 'catalog';
        update public.vinted_comparison_scopes set lease_token = v_token, lease_until = p_now + interval '2 minutes' where id = v_scope.id;
    elsif v_item.id is not null then
        v_kind := 'detail';
        select s.* into v_scope from public.vinted_comparison_scopes s
            join public.vinted_comparison_matches m on m.scope_id = s.id
            join public.sniper_queries q on q.id = s.query_id
            where m.item_id = v_item.id and q.is_active and q.filter_revision = s.query_revision
            order by s.id limit 1;
        update public.vinted_comparison_items set lease_token = v_token, lease_until = p_now + interval '2 minutes' where id = v_item.id;
    else return null;
    end if;
    update public.vinted_comparison_scopes set last_claim_kind=v_kind
        where id=(select min(id) from public.vinted_comparison_scopes);
    select * into v_query from public.sniper_queries where id = v_scope.query_id;
    return jsonb_build_object(
        'id', v_kind || ':' || case when v_kind = 'catalog' then v_scope.id else v_item.id end::text,
        'lease_token', v_token, 'kind', v_kind, 'query_id', v_scope.query_id,
        'query_revision', v_scope.query_revision, 'request_cursor', v_scope.request_cursor,
        'page', v_scope.page, 'window_start', v_scope.window_start,
        'consecutive_failures', case when v_kind = 'catalog' then v_scope.consecutive_failures else v_item.consecutive_failures end,
        'query', jsonb_build_object('id',v_query.id,'queryKey',v_query.query_key,'marketplace','vinted',
            'searchText',v_query.search_text,'catalogId',v_query.catalog_id,'brandId',v_query.brand_id,
            'brandIds',coalesce(v_query.brand_ids,'{}'),'priceTo',null,'priceFrom',null,
            'titleKeywords',coalesce(v_query.title_keywords,'{}'),'excludedTitleKeywords',coalesce(v_query.excluded_title_keywords,'{}'),
            'keywordMode',v_query.keyword_mode,'filterRevision',v_query.filter_revision,
            'filterFormatVersion',v_query.filter_format_version,'requestCursor',v_scope.request_cursor,
            'pollIntervalMs',v_query.poll_interval_ms,'isSeeded',true,'isActive',true,'runState',v_query.run_state,
            'nextAttemptAt',null,'lastAttemptAt',null,'lastSuccessAt',null,'lastErrorKind',null,
            'lastErrorAt',null,'lastErrorMessage',null,'lastPolledAt',null,'lastStatus','never_polled','consecutiveFailures',0))
        || case when v_kind='detail' then jsonb_build_object('url',v_item.url,'external_id',v_item.external_id) else '{}'::jsonb end;
end;
$function$;