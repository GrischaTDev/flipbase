-- Preisunbegrenzte Vergleichsbereiche, kompakte Artikel und Zuordnungen mit sieben Tagen Erstimport.
-- Betrifft vinted_comparison_scopes/items/matches und die Erfassung neuer sniper_listings.
-- Mit Supabase db diff erzeugt; unzitierte SQL-Schreibweise mechanisch vereinheitlicht.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.capture_vinted_comparison_feed()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare v_item_id bigint;
begin
    perform pg_catalog.pg_advisory_xact_lock(560,1);
    if new.marketplace <> 'vinted' or new.currency <> 'EUR' or new.item_price <= 0
        or new.url !~ '^https://www[.]vinted[.]de/items/[1-9][0-9]*(-[^?#[:space:]]+)?$'
        or length(new.url)>4096
        or not exists(select 1 from public.vinted_comparison_scopes s
            join public.sniper_queries q on q.id=s.query_id
            where s.query_id=new.discovered_by_query_id and q.is_active and q.filter_revision=s.query_revision) then return new; end if;
    insert into public.vinted_comparison_items(external_id,url,title,brand,size,condition,price)
    values(new.external_id,new.url,left(new.title,300),left(new.brand,100),left(new.size,100),left(new.condition,100),new.item_price)
    on conflict(external_id) do update set last_seen_at=now()
    returning id into v_item_id;
    insert into public.vinted_comparison_matches(scope_id,item_id)
        select s.id,v_item_id from public.vinted_comparison_scopes s
        join public.sniper_queries q on q.id=s.query_id
        where s.query_id=new.discovered_by_query_id and q.is_active and q.filter_revision=s.query_revision
    on conflict(scope_id,item_id) do update set last_seen_at=now();
    return new;
end;
$function$;

revoke all on function public.capture_vinted_comparison_feed() from public;

grant all on function public.capture_vinted_comparison_feed() to service_role;

create function public.claim_vinted_comparison_task (
  p_now timestamp with time zone
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
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
            update public.vinted_comparison_scopes set coverage_limited=true;
        end if;
        update public.vinted_comparison_scopes set maintenance_at=p_now;
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

revoke all on function public.claim_vinted_comparison_task(timestamp with time zone) from public;

grant all on function public.claim_vinted_comparison_task(timestamp with time zone) to service_role;

create function public.complete_vinted_comparison_task (
  p_task_id     text,
  p_lease_token uuid,
  p_result      jsonb
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
declare
    v_scope public.vinted_comparison_scopes;
    v_item public.vinted_comparison_items;
    v_row jsonb;
    v_observed timestamptz := (p_result->>'observed_at')::timestamptz;
    v_id bigint;
    v_price numeric;
    v_status text;
    v_earliest timestamptz;
    v_latest timestamptz;
    v_more boolean;
    v_count bigint;
    v_new boolean;
begin
    if p_task_id is null or p_task_id !~ '^(catalog|detail):[1-9][0-9]*$' or p_lease_token is null
        or v_observed is null or abs(extract(epoch from v_observed - now())) > 300 then
        raise exception 'Ungueltige Vergleichsbeobachtung.' using errcode = '22023';
    end if;
    v_id := split_part(p_task_id, ':', 2)::bigint;
    if split_part(p_task_id, ':', 1) = 'catalog' then
        select s.* into v_scope from public.vinted_comparison_scopes s
            join public.sniper_queries q on q.id = s.query_id
            where s.id = v_id and s.lease_token = p_lease_token and s.lease_until > now()
                and q.is_active and q.filter_revision = s.query_revision for update of s;
        if not found then return false; end if;
        if p_result->>'kind' is distinct from 'catalog' or (p_result->>'page')::integer is distinct from v_scope.page
            or jsonb_typeof(p_result->'items') is distinct from 'array' or jsonb_array_length(p_result->'items') > 96 then
            raise exception 'Ungueltige Katalogseite.' using errcode = '22023';
        end if;
        perform pg_catalog.pg_advisory_xact_lock(560,1);
        select count(*) into v_count from public.vinted_comparison_items;
        for v_row in select value from jsonb_array_elements(p_result->'items') loop
            v_new := not exists(select 1 from public.vinted_comparison_items where external_id=v_row->>'externalId');
            -- Globales Sicherheitslimit mit ausdrücklicher unvollständiger Abdeckung.
            if v_count >= 250000
                and v_new then
                update public.vinted_comparison_scopes set coverage_limited = true where id = v_id;
                continue;
            end if;
            insert into public.vinted_comparison_items(external_id, url, title, brand, size, condition, price, first_seen_at, last_seen_at)
            values(v_row->>'externalId', v_row->>'url', left(v_row->>'title',300), left(v_row->>'brand',100),
                left(v_row->>'size',100), left(v_row->>'condition',100), (v_row->>'price')::numeric, v_observed, v_observed)
            on conflict(external_id) do update set
                last_seen_at = greatest(public.vinted_comparison_items.last_seen_at, excluded.last_seen_at),
                title = excluded.title, price = excluded.price,
                next_attempt_at = case when public.vinted_comparison_items.status in ('unavailable','sold') then now()
                    else public.vinted_comparison_items.next_attempt_at end,
                status = case when public.vinted_comparison_items.status in ('unavailable','sold') then 'unknown'
                    else public.vinted_comparison_items.status end
            returning * into v_item;
            if v_new then v_count := v_count + 1; end if;
            insert into public.vinted_comparison_matches(scope_id,item_id,first_seen_at,last_seen_at)
            values(v_id,v_item.id,v_observed,v_observed)
            on conflict(scope_id,item_id) do update set last_seen_at = excluded.last_seen_at;
        end loop;
        v_more := coalesce((p_result->>'sourceItemCount')::integer,0) >= 96
            and (p_result->'pagination'->>'totalPages' is null or v_scope.page < (p_result->'pagination'->>'totalPages')::integer);
        update public.vinted_comparison_scopes set
            page = case when v_more and v_scope.page < 10 then v_scope.page + 1 else 1 end,
            initial_finished_at = case when not v_more or v_scope.page = 10 then coalesce(initial_finished_at,v_observed) else initial_finished_at end,
            coverage_limited = coverage_limited or (v_scope.page = 10 and coalesce((p_result->>'sourceItemCount')::integer,0) >= 96),
            next_attempt_at = v_observed + case when v_more and v_scope.page < 10 then interval '0 seconds' else interval '15 minutes' end,
            last_catalog_at = v_observed, lease_token = null, lease_until = null, consecutive_failures = 0, error_kind = null
        where id = v_id;
    else
        select * into v_item from public.vinted_comparison_items
            where id = v_id and lease_token = p_lease_token and lease_until > now() for update;
        if not found then return false; end if;
        if not exists (select 1 from public.vinted_comparison_matches m
            join public.vinted_comparison_scopes s on s.id=m.scope_id
            join public.sniper_queries q on q.id=s.query_id
            where m.item_id=v_id and q.is_active and q.filter_revision=s.query_revision) then return false; end if;
        v_row := p_result->'item';
        v_status := v_row->>'status';
        if p_result->>'kind' is distinct from 'detail' or v_row->>'externalId' is distinct from v_item.external_id
            or v_status is null or v_status not in ('active','sold','unavailable','unknown') then
            raise exception 'Ungueltiger Artikelstatus.' using errcode = '22023';
        end if;
        v_price := case when v_row->>'currency' = 'EUR' then (v_row->>'price')::numeric end;
        v_earliest := (v_row->'publication'->>'earliest')::timestamptz;
        v_latest := (v_row->'publication'->>'latest')::timestamptz;
        if (v_earliest is null) <> (v_latest is null) or v_latest > v_observed or v_earliest > v_latest then
            raise exception 'Ungueltige Datierung.' using errcode = '22023';
        end if;
        update public.vinted_comparison_items set status=v_status,
            price=coalesce(v_price,price), title=coalesce(nullif(left(v_row->>'title',300),''),title),
            brand=coalesce(left(v_row->>'brand',100),brand), category_id=coalesce((v_row->>'categoryId')::integer,category_id),
            size=coalesce(left(v_row->>'size',100),size), condition=coalesce(left(v_row->>'condition',100),condition),
            color=coalesce(left(v_row->>'color',100),color), material=coalesce(left(v_row->>'material',100),material),
            model=coalesce(left(v_row->>'model',150),model), checked_at=v_observed,
            last_active_at=case when v_status='active' then v_observed else last_active_at end,
            sold_detected_at=case when v_status='sold' then coalesce(sold_detected_at,v_observed)
                when v_status='active' then null else sold_detected_at end,
            published_earliest=coalesce(v_earliest,published_earliest), published_latest=coalesce(v_latest,published_latest),
            next_attempt_at=v_observed + case when v_status='unknown' then interval '6 hours' else interval '12 hours' end,
            lease_token=null,lease_until=null,consecutive_failures=0,error_kind=null
        where id=v_id;
        -- Nachweislich vor dem Erstimportfenster eingestellte Artikel nicht weiter abfragen.
        if v_latest is not null and not exists (
            select 1 from public.vinted_comparison_matches m
            join public.vinted_comparison_scopes s on s.id=m.scope_id
            where m.item_id=v_id and v_latest >= s.window_start
        ) then
            update public.vinted_comparison_items set next_attempt_at='infinity'::timestamptz where id=v_id;
        end if;
    end if;
    return true;
end;
$function$;

revoke all on function public.complete_vinted_comparison_task(text, uuid, jsonb) from public;

grant all on function public.complete_vinted_comparison_task(text, uuid, jsonb) to service_role;

create function public.fail_vinted_comparison_task (
  p_task_id       text,
  p_lease_token   uuid,
  p_retry_at      timestamp with time zone,
  p_error_kind    text,
  p_error_message text
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
declare v_changed integer;
begin
    if p_task_id is null or p_task_id !~ '^(catalog|detail):[1-9][0-9]*$' or p_retry_at is null or p_retry_at < now() then
        raise exception 'Ungueltiger Wiederholungsauftrag.' using errcode='22023';
    end if;
    if split_part(p_task_id,':',1)='catalog' then
        update public.vinted_comparison_scopes set lease_token=null,lease_until=null,next_attempt_at=p_retry_at,
            consecutive_failures=consecutive_failures+1,error_kind=left(p_error_kind,80)
            where id=split_part(p_task_id,':',2)::bigint and lease_token=p_lease_token and lease_until > now();
    else
        update public.vinted_comparison_items set lease_token=null,lease_until=null,next_attempt_at=p_retry_at,
            consecutive_failures=consecutive_failures+1,error_kind=left(p_error_kind,80)
            where id=split_part(p_task_id,':',2)::bigint and lease_token=p_lease_token and lease_until > now();
    end if;
    get diagnostics v_changed=row_count;
    return v_changed=1;
end;
$function$;

revoke all on function public.fail_vinted_comparison_task(text, uuid, timestamp with time zone, text, text) from public;

grant all on function public.fail_vinted_comparison_task(text, uuid, timestamp with time zone, text, text) to service_role;

create function public.vinted_comparison_market (
  p_listing_id  uuid,
  p_brand       text,
  p_category_id integer,
  p_model       text
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
    with target as (
        select * from public.sniper_listings where id=p_listing_id and marketplace='vinted'
    ), scopes as (
        select s.* from public.vinted_comparison_scopes s
        join public.sniper_queries q on q.id=s.query_id
        where q.is_active and s.query_revision=q.filter_revision and exists (
            select 1 from target t where t.discovered_by_query_id=s.query_id
                or exists(select 1 from public.sniper_query_matches m where m.listing_id=t.id and m.query_id=s.query_id)
        )
    ), words as (
        select word from regexp_split_to_table(lower(coalesce(p_model,'')), '[^[:alnum:]]+') word
        where length(word)>=3 and word not in ('wip','jacket','jacke','fleece','fleecejacke')
            and word not in (select regexp_split_to_table(lower(coalesce(p_brand,'')), '[^[:alnum:]]+'))
    ), eligible as (
        select distinct i.* from public.vinted_comparison_items i
        join public.vinted_comparison_matches m on m.item_id=i.id
        join scopes s on s.id=m.scope_id
        where i.external_id not in (select external_id from target)
            and i.published_earliest >= s.window_start
            and i.checked_at >= now()-interval '30 days'
            and ((i.status='active' and i.last_active_at>=now()-interval '2 days'
                and i.published_earliest>=greatest(s.window_start,now()-interval '30 days'))
                or (i.status='sold' and i.sold_detected_at>=now()-interval '30 days'))
            and regexp_replace(regexp_replace(lower(coalesce(i.brand,'')), '\mwip\M','','g'), '[^[:alnum:]]','','g')
                =regexp_replace(regexp_replace(lower(coalesce(p_brand,'')), '\mwip\M','','g'), '[^[:alnum:]]','','g')
            and (p_category_id is null or i.category_id=p_category_id)
    ), classified as (
        select e.*, exists(select 1 from words)
            and not exists(select 1 from target t where (t.size is not null and e.size is distinct from t.size)
                or (t.condition is not null and e.condition is distinct from t.condition))
            and not exists (
            select 1 from words where (' '||regexp_replace(lower(e.title||' '||coalesce(e.model,'')),'[^[:alnum:]]+',' ','g')||' ')
                not like '% '||word||' %'
        ) as model_match from eligible e
    ), chosen as (
        select * from classified where (select count(*) from classified where model_match)>=3 and model_match
            or (select count(*) from classified where model_match)<3
    ), distributions as (
        select status,jsonb_build_object('count',count(*),'median',round(percentile_cont(0.5) within group(order by price)::numeric,2),
            'lowerQuartile',round(percentile_cont(0.25) within group(order by price)::numeric,2),
            'upperQuartile',round(percentile_cont(0.75) within group(order by price)::numeric,2),
            'minimum',min(price),'maximum',max(price)) as value from chosen group by status
    )
    select jsonb_build_object('windowDays',30,'initialImportDays',7,'asOf',now(),
        'observedSince',(select min(created_at) from scopes),
        'initialImportStatus',case
            when not exists(select 1 from scopes) then 'pending'
            when exists(select 1 from scopes where initial_finished_at is null) then 'running'
            when exists(select 1 from public.vinted_comparison_matches m join scopes s on s.id=m.scope_id
                join public.vinted_comparison_items i on i.id=m.item_id where i.checked_at is null) then 'running'
            when exists(select 1 from scopes where coverage_limited or error_kind is not null)
                or exists(select 1 from public.vinted_comparison_matches m join scopes s on s.id=m.scope_id
                    join public.vinted_comparison_items i on i.id=m.item_id
                    where i.status <> 'unavailable' and (i.published_latest is null or i.published_latest >= s.window_start)
                        and (i.status='unknown' or i.published_earliest is null
                        or (i.published_earliest<s.window_start and i.published_latest>=s.window_start))) then 'partial'
            else 'complete' end,
        'match',case when (select count(*) from classified where model_match)>=3 then 'model' else 'category' end,
        'active',(select value from distributions where status='active'),
        'soldMarked',(select value from distributions where status='sold'));
$function$;

revoke all on function public.vinted_comparison_market(uuid, text, integer, text) from public;

grant all on function public.vinted_comparison_market(uuid, text, integer, text) to service_role;

create trigger capture_vinted_comparison_feed
  after insert on public.sniper_listings
  for each row
  execute function public.capture_vinted_comparison_feed();

create table public.vinted_comparison_items (
  id                   bigint                   generated always as identity not null,
  external_id          text                     not null,
  url                  text                     not null,
  title                text                     not null,
  brand                text,
  category_id          integer,
  size                 text,
  condition            text,
  color                text,
  material             text,
  model                text,
  price                numeric(16,2)            not null,
  currency             text                     default 'EUR'::text not null,
  status               text                     default 'unknown'::text not null,
  first_seen_at        timestamp with time zone default now() not null,
  last_seen_at         timestamp with time zone default now() not null,
  checked_at           timestamp with time zone,
  last_active_at       timestamp with time zone,
  sold_detected_at     timestamp with time zone,
  published_earliest   timestamp with time zone,
  published_latest     timestamp with time zone,
  next_attempt_at      timestamp with time zone default now() not null,
  lease_token          uuid,
  lease_until          timestamp with time zone,
  consecutive_failures integer                  default 0 not null,
  error_kind           text
);

comment on table public.vinted_comparison_items is 'Ein kompakter Zustand je öffentlichem Inserat ohne Bilder oder Verkäuferdaten; Preise sind geforderte Preise, auch bei Verkaufsmarkierung.';

alter table public.vinted_comparison_items
  enable row level security;

alter table public.vinted_comparison_items
  add constraint vinted_comparison_items_check check (published_earliest is null and published_latest is null or published_earliest is not null and published_latest is
    not null and published_latest >= published_earliest);

alter table public.vinted_comparison_items
  add constraint vinted_comparison_items_currency_check check (currency = 'EUR'::text);

alter table public.vinted_comparison_items
  add constraint vinted_comparison_items_external_id_check check (external_id ~ '^[1-9][0-9]{0,19}$'::text);

alter table public.vinted_comparison_items
  add constraint vinted_comparison_items_external_id_key unique (external_id);

alter table public.vinted_comparison_items
  add constraint vinted_comparison_items_pkey primary key (id);

alter table public.vinted_comparison_items
  add constraint vinted_comparison_items_price_check check (price > 0::numeric and (price * 100::numeric) <= '9007199254740991'::bigint::numeric);

alter table public.vinted_comparison_items
  add constraint vinted_comparison_items_status_check check (status = any (array['active'::text, 'sold'::text, 'unavailable'::text, 'unknown'::text]));

alter table public.vinted_comparison_items
  add constraint vinted_comparison_items_title_check check (length(title) >= 1 and length(title) <= 300);

alter table public.vinted_comparison_items
  add constraint vinted_comparison_items_url_check check (url ~ '^https://www[.]vinted[.]de/items/[1-9][0-9]*(-[^?#[:space:]]+)?$'::text and length(url) <= 4096);

grant select on public.vinted_comparison_items to authenticated;

grant all on public.vinted_comparison_items to service_role;

create index vinted_comparison_items_retention_idx on public.vinted_comparison_items (first_seen_at);

create index vinted_comparison_items_due_idx on public.vinted_comparison_items (next_attempt_at)
  where status = any (array['active'::text, 'unknown'::text]);

create index vinted_comparison_items_market_idx on public.vinted_comparison_items (brand, category_id, checked_at);

create policy "Betreiber lesen Vergleichsartikel" on public.vinted_comparison_items
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.vinted_comparison_matches (
  id            bigint                   generated always as identity not null,
  scope_id      bigint                   not null,
  item_id       bigint                   not null,
  first_seen_at timestamp with time zone default now() not null,
  last_seen_at  timestamp with time zone default now() not null
);

comment on table public.vinted_comparison_matches is 'Doppelfreie Zuordnung öffentlicher Vergleichsartikel zu den begrenzten Suchbereichen.';

alter table public.vinted_comparison_matches
  enable row level security;

alter table public.vinted_comparison_matches
  add constraint vinted_comparison_matches_item_id_fkey foreign key (item_id) references public.vinted_comparison_items(id) on delete cascade;

alter table public.vinted_comparison_matches
  add constraint vinted_comparison_matches_pkey primary key (id);

alter table public.vinted_comparison_matches
  add constraint vinted_comparison_matches_scope_id_item_id_key unique (scope_id, item_id);

grant select on public.vinted_comparison_matches to authenticated;

grant all on public.vinted_comparison_matches to service_role;

create index vinted_comparison_matches_item_idx on public.vinted_comparison_matches (item_id);

create policy "Betreiber lesen Vergleichszuordnungen" on public.vinted_comparison_matches
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.vinted_comparison_scopes (
  id                   bigint                   generated always as identity not null,
  query_id             uuid                     not null,
  query_revision       integer                  not null,
  request_cursor       integer                  not null,
  window_start         timestamp with time zone default (now() - '7 days'::interval) not null,
  created_at           timestamp with time zone default now() not null,
  page                 integer                  default 1 not null,
  initial_finished_at  timestamp with time zone,
  coverage_limited     boolean                  default false not null,
  last_catalog_at      timestamp with time zone,
  next_attempt_at      timestamp with time zone default now() not null,
  lease_token          uuid,
  lease_until          timestamp with time zone,
  consecutive_failures integer                  default 0 not null,
  error_kind           text,
  maintenance_at       timestamp with time zone,
  last_claim_kind      text
);

comment on table public.vinted_comparison_scopes is 'Fortsetzbare Vergleichssuche je Feedfilter und Marken-/Begriffskombination; alle Preisgrenzen entfallen.';

alter table public.vinted_comparison_scopes
  enable row level security;

alter table public.vinted_comparison_scopes
  add constraint vinted_comparison_scopes_last_claim_kind_check check (last_claim_kind = any (array['catalog'::text, 'detail'::text]));

alter table public.vinted_comparison_scopes
  add constraint vinted_comparison_scopes_page_check check (page >= 1 and page <= 10);

alter table public.vinted_comparison_scopes
  add constraint vinted_comparison_scopes_pkey primary key (id);

alter table public.vinted_comparison_matches
  add constraint vinted_comparison_matches_scope_id_fkey foreign key (scope_id) references public.vinted_comparison_scopes(id) on delete cascade;

alter table public.vinted_comparison_scopes
  add constraint vinted_comparison_scopes_query_id_fkey foreign key (query_id) references public.sniper_queries(id) on delete cascade;

alter table public.vinted_comparison_scopes
  add constraint vinted_comparison_scopes_query_id_request_cursor_key unique (query_id, request_cursor);

alter table public.vinted_comparison_scopes
  add constraint vinted_comparison_scopes_request_cursor_check check (request_cursor >= 0);

grant select on public.vinted_comparison_scopes to authenticated;

grant all on public.vinted_comparison_scopes to service_role;

create index vinted_comparison_scopes_due_idx on public.vinted_comparison_scopes (next_attempt_at);

create policy "Betreiber lesen Vergleichsbereiche" on public.vinted_comparison_scopes
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

-- Explizite Rechte aus dem deklarativen Schema, automatisch übernommen.
-- Der CLI-Abgleich erfasst vererbte Rechte und Identity-Sequenzen nicht vollständig.
revoke all on public.vinted_comparison_scopes, public.vinted_comparison_items, public.vinted_comparison_matches from public, anon, authenticated;
grant select on public.vinted_comparison_scopes, public.vinted_comparison_items, public.vinted_comparison_matches to authenticated;
grant all on public.vinted_comparison_scopes, public.vinted_comparison_items, public.vinted_comparison_matches to service_role;
revoke all on sequence public.vinted_comparison_scopes_id_seq, public.vinted_comparison_items_id_seq, public.vinted_comparison_matches_id_seq from public, anon, authenticated;
grant usage, select on sequence public.vinted_comparison_scopes_id_seq, public.vinted_comparison_items_id_seq, public.vinted_comparison_matches_id_seq to service_role;
revoke all on function public.claim_vinted_comparison_task(timestamptz), public.complete_vinted_comparison_task(text,uuid,jsonb), public.fail_vinted_comparison_task(text,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.claim_vinted_comparison_task(timestamptz), public.complete_vinted_comparison_task(text,uuid,jsonb), public.fail_vinted_comparison_task(text,uuid,timestamptz,text,text) to service_role;
revoke all on function public.capture_vinted_comparison_feed() from public,anon,authenticated;
grant execute on function public.capture_vinted_comparison_feed() to service_role;
revoke all on function public.vinted_comparison_market(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.vinted_comparison_market(uuid,text,integer,text) to service_role;
