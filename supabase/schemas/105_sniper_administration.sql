-- Zentrale Sammelauftraege und vom Dienst gemeldeter Betriebsstand.
-- Alte Abonnements bleiben bis zur getrennten Merkzettel-Migration kompatibel.
create policy "Administration liest Sammelauftraege" on public.sniper_queries
    for select to authenticated using ((select public.is_platform_operator()));

create table public.sniper_runtime_status (
    id integer primary key check (id = 1),
    reported_at timestamptz not null,
    requests_last_minute integer not null check (requests_last_minute >= 0),
    rejected_last_minute integer not null check (rejected_last_minute >= 0),
    request_budget integer not null check (request_budget > 0),
    last_cycle_error text
);
comment on table public.sniper_runtime_status is 'Letzte Betriebsmeldung des einzigen Sammlers; fehlende oder alte Meldung ist kein gesunder Betrieb.';
alter table public.sniper_runtime_status enable row level security;
revoke all on public.sniper_runtime_status from public, anon, authenticated;
grant select on public.sniper_runtime_status to authenticated;
grant select, insert, update, delete on public.sniper_runtime_status to service_role;
create policy "Administration liest Botbetrieb" on public.sniper_runtime_status
    for select to authenticated using ((select public.is_platform_operator()));

create or replace function public.upsert_sniper_query(
    p_id uuid,
    p_title text,
    p_brand_id integer,
    p_poll_interval_ms integer,
    p_notes text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_id uuid;
    v_key text;
    v_existing public.sniper_queries;
begin
    if not public.is_platform_operator() then
        raise exception 'Nur die Administration darf Sammelauftraege verwalten' using errcode = '42501';
    end if;
    p_title := nullif(btrim(regexp_replace(p_title, '\s+', ' ', 'g')), '');
    p_notes := nullif(btrim(p_notes), '');
    if p_title is null then raise exception 'Bitte einen Filtername angeben'; end if;
    if length(p_title) > 100 then raise exception 'Der Filtername darf hoechstens 100 Zeichen lang sein'; end if;
    if p_brand_id is null or p_brand_id <= 0 then raise exception 'Ungueltige Markenkennung'; end if;
    if length(p_notes) > 2000 then raise exception 'Die Notiz darf hoechstens 2.000 Zeichen lang sein'; end if;
    if p_poll_interval_ms is null or p_poll_interval_ms < 10000 or p_poll_interval_ms > 86400000 then
        raise exception 'Der Takt muss zwischen 10 Sekunden und 24 Stunden liegen';
    end if;
    v_key := concat_ws('|', 'vinted', 'search=', 'catalog=-', 'brand=' || p_brand_id::text,
        'price_from=-', 'price_to=-');
    if p_id is null then
        insert into public.sniper_queries (query_key, title, search_text, catalog_id, brand_id, price_from, price_to, poll_interval_ms, notes, is_active)
        values (v_key, p_title, null, null, p_brand_id, null, null, p_poll_interval_ms, p_notes, false)
        returning id into v_id;
    else
        select * into v_existing from public.sniper_queries where id = p_id for update;
        if not found then raise exception 'Sammelauftrag nicht gefunden'; end if;
        -- Ein Auftrag bleibt eine reine Markensuche. Alte Sammelauftraege mit
        -- weiteren Filtern bleiben lesbar, koennen hier aber nicht umgedeutet werden.
        if v_existing.marketplace <> 'vinted'
            or v_existing.query_key is distinct from v_key
            or v_existing.brand_id is distinct from p_brand_id
            or v_existing.search_text is not null
            or v_existing.catalog_id is not null
            or v_existing.price_from is not null
            or v_existing.price_to is not null then
            raise exception 'Nur Name, Takt und Notiz eines Markenfilters koennen bearbeitet werden';
        end if;
        update public.sniper_queries set title = p_title, poll_interval_ms = p_poll_interval_ms, notes = p_notes, updated_at = now()
        where id = p_id;
        v_id := p_id;
    end if;
    return v_id;
exception when unique_violation then
    raise exception 'Ein Auftrag mit diesen Filtern besteht bereits';
end;
$$;
revoke all on function public.upsert_sniper_query(uuid, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.upsert_sniper_query(uuid, text, integer, integer, text) to authenticated;

create or replace function public.set_sniper_query_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.is_platform_operator() then
        raise exception 'Nur die Administration darf Sammelauftraege verwalten' using errcode = '42501';
    end if;
    if p_active is null then raise exception 'Bitte den gewuenschten Status angeben'; end if;
    if p_active and not exists (
        select 1 from public.sniper_runtime_status where id = 1 and reported_at >= now() - interval '2 minutes'
    ) then
        raise exception 'Keine aktuelle Betriebsmeldung. Bitte zuerst den Bot starten oder aktualisieren';
    end if;
    update public.sniper_queries set is_active = p_active,
        consecutive_failures = case when p_active then 0 else consecutive_failures end,
        updated_at = now()
    where id = p_id;
    if not found then raise exception 'Sammelauftrag nicht gefunden'; end if;
end;
$$;
revoke all on function public.set_sniper_query_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_sniper_query_active(uuid, boolean) to authenticated;

create or replace function public.sniper_query_listing_counts()
returns table (query_id uuid, listing_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.is_platform_operator() then raise exception 'Nur fuer die Administration' using errcode = '42501'; end if;
    return query select discovered_by_query_id, count(*) from public.sniper_listings
        where first_seen_at >= now() - interval '24 hours' and discovered_by_query_id is not null
        group by discovered_by_query_id;
end;
$$;
revoke all on function public.sniper_query_listing_counts() from public, anon, authenticated;
grant execute on function public.sniper_query_listing_counts() to authenticated;
