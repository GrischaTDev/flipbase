-- Nutzerfilter laufen ausschliesslich auf dem gemeinsamen Artikelbestand.
-- Legacy-Abonnements und deren Treffer bleiben waehrend des Uebergangs erhalten.
-- Der alte Browser-Schreibweg darf keine zentralen Sammelauftraege mehr anlegen.
revoke execute on function public.create_sniper_subscription(uuid,text,integer,numeric,numeric,numeric) from authenticated;
create table public.sniper_watchlists (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    title text not null check (length(btrim(title)) between 1 and 100),
    catalog_id integer,
    brand text,
    search_text text,
    price_from numeric(12, 2),
    price_to numeric(12, 2),
    condition text,
    discount_threshold_percent numeric(5, 2) not null default 40
        check (discount_threshold_percent > 0 and discount_threshold_percent < 100),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    starts_at timestamptz not null default now(),
    legacy_brand_id integer,
    constraint sniper_watchlists_price_range check (
        (price_from is null or (price_from >= 0 and price_from < 'Infinity'::numeric))
        and (price_to is null or (price_to >= 0 and price_to < 'Infinity'::numeric))
        and (price_from is null or price_to is null or price_from <= price_to)
    )
);
comment on table public.sniper_watchlists is 'Persoenliche Suchkriterien eines Arbeitsbereichs; erzeugen keine Marktplatzanfragen.';
create index idx_sniper_watchlists_workspace on public.sniper_watchlists(workspace_id);
create index idx_sniper_watchlists_active_catalog on public.sniper_watchlists(catalog_id) where is_active;
alter table public.sniper_watchlists enable row level security;
revoke all on public.sniper_watchlists from public, anon, authenticated;
grant select on public.sniper_watchlists to authenticated;
grant all on public.sniper_watchlists to service_role;
create policy "Mitglieder lesen Merkzettel" on public.sniper_watchlists
    for select to authenticated using (public.is_workspace_member(workspace_id));

create table public.sniper_watchlist_hits (
    id uuid primary key default gen_random_uuid(),
    watchlist_id uuid not null references public.sniper_watchlists(id) on delete cascade,
    listing_id uuid not null references public.sniper_listings(id) on delete cascade,
    reference_price numeric(12, 2) not null,
    reference_scope text not null check (reference_scope in ('category_brand_condition', 'category_condition', 'legacy_query_condition')),
    discount_percent numeric(5, 2) not null,
    created_at timestamptz not null default now(),
    unique(watchlist_id, listing_id)
);
comment on table public.sniper_watchlist_hits is 'Festgehaltene Deals je Nutzerfilter, unabhaengig vom entdeckenden Sammelauftrag.';
create index idx_sniper_watchlist_hits_listing on public.sniper_watchlist_hits(listing_id);
create index idx_sniper_watchlist_hits_created on public.sniper_watchlist_hits(watchlist_id, created_at desc);
alter table public.sniper_watchlist_hits enable row level security;
revoke all on public.sniper_watchlist_hits from public, anon, authenticated;
grant select on public.sniper_watchlist_hits to authenticated;
grant all on public.sniper_watchlist_hits to service_role;
create policy "Mitglieder lesen Merkzetteltreffer" on public.sniper_watchlist_hits
    for select to authenticated using (exists (
        select 1 from public.sniper_watchlists as watchlist
        where watchlist.id = watchlist_id and public.is_workspace_member(watchlist.workspace_id)
    ));

create index idx_sniper_listings_catalog on public.sniper_listings(catalog_id, first_seen_at desc, id desc);
create index idx_sniper_listings_feed on public.sniper_listings(first_seen_at desc, id desc);
create index idx_sniper_listings_category_source on public.sniper_listings(catalog_source_query_id);
create index idx_sniper_listings_watchlist_pending on public.sniper_listings(discovered_by_query_id)
    where watchlist_evaluated_at is null;
comment on column public.sniper_listings.catalog_id is 'Erste bekannte Blattkategorie, bei spaeterer Entdeckung aus Kategorieauftrag ergaenzt.';
comment on column public.sniper_listings.catalog_source_query_id is 'Auftrag, der die erste bekannte Kategorie geliefert hat; dessen Preislimit gilt fuer den Vergleich.';
comment on column public.sniper_listings.watchlist_evaluated_at is 'Abschluss der unabhaengigen Merkzettelbewertung. Null bleibt bei fehlendem Referenzpreis offen.';

create or replace function public.save_sniper_watchlist(
    p_workspace_id uuid, p_id uuid, p_title text, p_catalog_id integer,
    p_brand text, p_search_text text, p_price_from numeric, p_price_to numeric,
    p_condition text, p_discount_threshold_percent numeric, p_is_active boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_id uuid;
begin
    if not public.is_workspace_member(p_workspace_id) then
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
            price_from, price_to, condition, discount_threshold_percent, is_active)
        values (p_workspace_id, btrim(p_title), p_catalog_id, nullif(btrim(p_brand), ''),
            nullif(btrim(p_search_text), ''), p_price_from, p_price_to,
            nullif(btrim(p_condition), ''), p_discount_threshold_percent, p_is_active)
        returning id into v_id;
    else
        update public.sniper_watchlists set title = btrim(p_title), catalog_id = p_catalog_id,
            brand = nullif(btrim(p_brand), ''), search_text = nullif(btrim(p_search_text), ''),
            price_from = p_price_from, price_to = p_price_to, condition = nullif(btrim(p_condition), ''),
            discount_threshold_percent = p_discount_threshold_percent, is_active = p_is_active,
            starts_at = case when (catalog_id, brand, search_text, price_from, price_to, condition,
                discount_threshold_percent, is_active) is distinct from
                (p_catalog_id, nullif(btrim(p_brand), ''), nullif(btrim(p_search_text), ''),
                 p_price_from, p_price_to, nullif(btrim(p_condition), ''), p_discount_threshold_percent, p_is_active)
                then now() else starts_at end,
            legacy_brand_id = case when nullif(btrim(p_brand), '') is not null then null else legacy_brand_id end
        where id = p_id and workspace_id = p_workspace_id returning id into v_id;
        if v_id is null then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;
    return v_id;
end;
$$;
revoke all on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,numeric,boolean) from public, anon;
grant execute on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,numeric,boolean) to authenticated;

create or replace function public.delete_sniper_watchlist(p_workspace_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.is_workspace_member(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    delete from public.sniper_watchlists where id = p_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.delete_sniper_watchlist(uuid,uuid) from public, anon;
grant execute on function public.delete_sniper_watchlist(uuid,uuid) to authenticated;

-- Auch Duplikate koennen erstmals eine bekannte Kategorie liefern.
create or replace function public.record_sniper_listing_category(p_query_id uuid, p_external_ids text[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
    if cardinality(p_external_ids) > 200 then
        raise exception 'Zu viele Artikel in einem Paket.' using errcode = '22023';
    end if;
    update public.sniper_listings as listing
    set catalog_id = query.catalog_id, catalog_source_query_id = query.id
    from public.sniper_queries as query
    where query.id = p_query_id and query.catalog_id is not null
      and listing.catalog_id is null and listing.marketplace = query.marketplace
      and listing.external_id = any(p_external_ids);
end;
$$;
revoke all on function public.record_sniper_listing_category(uuid,text[]) from public, anon, authenticated;
grant execute on function public.record_sniper_listing_category(uuid,text[]) to service_role;

create or replace function public.sniper_watchlist_matches(p_watchlist public.sniper_watchlists, p_listing public.sniper_listings)
returns boolean language sql stable security invoker set search_path = '' as $$
    select (p_watchlist.catalog_id is null or p_watchlist.catalog_id = p_listing.catalog_id)
       and (p_watchlist.brand is null or lower(btrim(p_watchlist.brand)) = lower(btrim(p_listing.brand)))
       and (p_watchlist.legacy_brand_id is null or p_watchlist.legacy_brand_id = (
           select brand_id from public.sniper_queries where id = p_listing.discovered_by_query_id))
       and (p_watchlist.search_text is null or strpos(lower(p_listing.title || ' ' || coalesce(p_listing.description, '')), lower(p_watchlist.search_text)) > 0)
       and (p_watchlist.condition is null or p_watchlist.condition = p_listing.condition)
       and (p_watchlist.price_from is null or p_listing.item_price >= p_watchlist.price_from)
       and (p_watchlist.price_to is null or p_listing.item_price <= p_watchlist.price_to)
       and p_listing.currency = 'EUR';
$$;
revoke all on function public.sniper_watchlist_matches(public.sniper_watchlists,public.sniper_listings) from public, anon, authenticated;
grant execute on function public.sniper_watchlist_matches(public.sniper_watchlists,public.sniper_listings) to service_role;

create or replace function public.sniper_evaluate_watchlist_hits(p_query_id uuid, p_report_hits boolean default true)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_created integer;
begin
    if not p_report_hits then
        update public.sniper_listings set watchlist_evaluated_at = now()
        where discovered_by_query_id = p_query_id and watchlist_evaluated_at is null;
        return 0;
    end if;
    with pending as materialized (
        select listing.* from public.sniper_listings as listing
        where (listing.discovered_by_query_id = p_query_id or listing.catalog_source_query_id = p_query_id)
          and listing.watchlist_evaluated_at is null
          and listing.currency = 'EUR' and listing.item_price > 0 and listing.item_price < 'Infinity'::numeric
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
    ) select count(*)::integer into v_created from inserted;
    return v_created;
end;
$$;
revoke all on function public.sniper_evaluate_watchlist_hits(uuid,boolean) from public, anon, authenticated;
grant execute on function public.sniper_evaluate_watchlist_hits(uuid,boolean) to service_role;

-- Begrenzte Seiten mit stabilem Zeitpunkt/UUID-Cursor. Keine Auftragdetails
-- offenlegen: Nutzer sehen lediglich, ob fuer eine Kategorie gesammelt wird.
create or replace function public.sniper_feed(
    p_workspace_id uuid, p_watchlist_id uuid default null, p_deals_only boolean default false,
    p_before_time timestamptz default null, p_before_id uuid default null, p_limit integer default 60
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_watchlist public.sniper_watchlists; v_rows jsonb; v_covered boolean; v_reported_at timestamptz;
begin
    if not public.is_workspace_member(p_workspace_id) then
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
        where listing.first_seen_at >= now() - interval '30 days'
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
$$;
revoke all on function public.sniper_feed(uuid,uuid,boolean,timestamptz,uuid,integer) from public, anon;
grant execute on function public.sniper_feed(uuid,uuid,boolean,timestamptz,uuid,integer) to authenticated;
