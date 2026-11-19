-- Nutzerfilter laufen ausschliesslich auf dem gemeinsamen Artikelbestand.
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
    created_at timestamptz not null default now(),
    legacy_brand_id integer,
    audience text check (audience in ('women', 'men', 'both')),
    sizes text[] not null default '{}' check (
        cardinality(sizes) <= 7
        and sizes <@ array['xs', 's', 'm', 'l', 'xl', 'xxl', '3xl']
    ),
    constraint sniper_watchlists_price_range check (
        (price_from is null or (price_from >= 0 and price_from < 'Infinity'::numeric))
        and (price_to is null or (price_to >= 0 and price_to < 'Infinity'::numeric))
        and (price_from is null or price_to is null or price_from <= price_to)
    )
);
comment on table public.sniper_watchlists is 'Persoenliche Suchkriterien eines Arbeitsbereichs; erzeugen keine Marktplatzanfragen.';
create index idx_sniper_watchlists_workspace on public.sniper_watchlists(workspace_id);
alter table public.sniper_watchlists enable row level security;
revoke all on public.sniper_watchlists from public, anon, authenticated;
grant select on public.sniper_watchlists to authenticated;
grant all on public.sniper_watchlists to service_role;
create policy "Mitglieder lesen Merkzettel" on public.sniper_watchlists
    for select to authenticated using (public.is_workspace_member(workspace_id));

-- Feste technische Kontingente begrenzen die Filter je Arbeitsbereich; keine Lizenzstufen.
create function public.enforce_sniper_watchlist_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    perform 1 from public.workspaces where id = new.workspace_id for update;
    if tg_op = 'INSERT' and (select count(*) from public.sniper_watchlists where workspace_id = new.workspace_id) >= 100 then
        raise exception 'Maximal 100 Merkzettel pro Arbeitsbereich.' using errcode = '54000';
    end if;
    return new;
end;
$$;
revoke all on function public.enforce_sniper_watchlist_limit() from public, anon, authenticated;
create trigger enforce_sniper_watchlist_limit before insert or update on public.sniper_watchlists
    for each row execute function public.enforce_sniper_watchlist_limit();

create index idx_sniper_listings_catalog on public.sniper_listings(catalog_id, first_seen_at desc, id desc);
create index idx_sniper_listings_feed on public.sniper_listings(first_seen_at desc, id desc);
create index idx_sniper_listings_category_source on public.sniper_listings(catalog_source_query_id);
comment on column public.sniper_listings.catalog_id is 'Erste bekannte Blattkategorie, bei spaeterer Entdeckung aus Kategorieauftrag ergaenzt.';
comment on column public.sniper_listings.catalog_source_query_id is 'Auftrag, der die erste bekannte Kategorie geliefert hat; dessen Preislimit gilt fuer den Vergleich.';

create or replace function public.save_sniper_watchlist(
    p_workspace_id uuid, p_id uuid, p_title text, p_catalog_id integer,
    p_brand text, p_search_text text, p_price_from numeric, p_price_to numeric,
    p_condition text
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
            price_from, price_to, condition)
        values (p_workspace_id, btrim(p_title), p_catalog_id, nullif(btrim(p_brand), ''),
            nullif(btrim(p_search_text), ''), p_price_from, p_price_to,
            nullif(btrim(p_condition), ''))
        returning id into v_id;
    else
        update public.sniper_watchlists set title = btrim(p_title), catalog_id = p_catalog_id,
            brand = nullif(btrim(p_brand), ''), search_text = nullif(btrim(p_search_text), ''),
            price_from = p_price_from, price_to = p_price_to, condition = nullif(btrim(p_condition), ''),
            legacy_brand_id = case when nullif(btrim(p_brand), '') is not null then null else legacy_brand_id end
        where id = p_id and workspace_id = p_workspace_id returning id into v_id;
        if v_id is null then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;
    return v_id;
end;
$$;
revoke all on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text) from public, anon;
grant execute on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text) to authenticated;

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
