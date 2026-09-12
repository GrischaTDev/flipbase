-- Zweck: Sammelauftraege administrieren, Kategorie ohne Suchtext erlauben und Botbetrieb melden.
-- Betroffen: sniper_queries (notes, Suchtext, Grenzen, Lesepolicy), sniper_runtime_status und Administrationsfunktionen.
-- Generiert mit Supabase 2.114.0; SQL-Schreibweise nach der Pruefung vereinheitlicht.
-- DROP NOT NULL entfernt nur die Pflicht zum Suchtext; keine gespeicherten Werte werden geloescht.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.set_sniper_query_active (
  p_id     uuid,
  p_active boolean
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.set_sniper_query_active(uuid, boolean) from public;

grant all on function public.set_sniper_query_active(uuid, boolean) to authenticated;

grant all on function public.set_sniper_query_active(uuid, boolean) to service_role;

create function public.sniper_query_listing_counts()
  returns table (
    query_id      uuid,
    listing_count bigint
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
    if not public.is_platform_operator() then raise exception 'Nur fuer die Administration' using errcode = '42501'; end if;
    return query select discovered_by_query_id, count(*) from public.sniper_listings
        where first_seen_at >= now() - interval '24 hours' and discovered_by_query_id is not null
        group by discovered_by_query_id;
end;
$function$;

revoke all on function public.sniper_query_listing_counts() from public;

grant all on function public.sniper_query_listing_counts() to authenticated;

grant all on function public.sniper_query_listing_counts() to service_role;

create function public.upsert_sniper_query (
  p_id               uuid,
  p_search_text      text,
  p_catalog_id       integer,
  p_brand_id         integer,
  p_price_from       numeric,
  p_price_to         numeric,
  p_poll_interval_ms integer,
  p_notes            text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
    v_id uuid;
    v_key text;
    v_existing public.sniper_queries;
begin
    if not public.is_platform_operator() then
        raise exception 'Nur die Administration darf Sammelauftraege verwalten' using errcode = '42501';
    end if;
    p_search_text := nullif(lower(btrim(regexp_replace(p_search_text, '\s+', ' ', 'g'))), '');
    p_notes := nullif(btrim(p_notes), '');
    p_price_from := round(p_price_from, 2);
    p_price_to := round(p_price_to, 2);
    if p_search_text is null and p_catalog_id is null then
        raise exception 'Bitte Kategorie oder Suchbegriff angeben';
    end if;
    if p_catalog_id is not null and not exists (
        select 1 from public.vinted_categories where id = p_catalog_id and is_leaf
    ) then raise exception 'Bitte eine gespeicherte Unterkategorie waehlen'; end if;
    if p_brand_id is not null and p_brand_id <= 0 then raise exception 'Ungueltige Markenkennung'; end if;
    if length(p_search_text) > 200 or length(p_notes) > 2000 then raise exception 'Suchbegriff oder Notiz ist zu lang'; end if;
    if p_price_from::text in ('NaN', 'Infinity', '-Infinity') or p_price_to::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception 'Ungueltiger Preis';
    end if;
    if p_poll_interval_ms is null or p_poll_interval_ms < 10000 or p_poll_interval_ms > 86400000 then
        raise exception 'Der Takt muss zwischen 10 Sekunden und 24 Stunden liegen';
    end if;
    v_key := concat_ws('|', 'vinted', 'search=' || coalesce(p_search_text, ''),
        'catalog=' || coalesce(p_catalog_id::text, '-'), 'brand=' || coalesce(p_brand_id::text, '-'),
        'price_from=' || coalesce(trim_scale(p_price_from)::text, '-'),
        'price_to=' || coalesce(trim_scale(p_price_to)::text, '-'));
    if p_id is null then
        insert into public.sniper_queries (query_key, search_text, catalog_id, brand_id, price_from, price_to, poll_interval_ms, notes, is_active)
        values (v_key, p_search_text, p_catalog_id, p_brand_id, p_price_from, p_price_to, p_poll_interval_ms, p_notes, false)
        returning id into v_id;
    else
        select * into v_existing from public.sniper_queries where id = p_id for update;
        if not found then raise exception 'Sammelauftrag nicht gefunden'; end if;
        -- Filter bleiben unveraenderlich: Sonst wuerden alte Funde und ihre
        -- Preisvergleiche nachtraeglich einem anderen Zuschnitt zugeordnet.
        if v_existing.query_key <> v_key then
            raise exception 'Fuer andere Filter bitte einen neuen Auftrag anlegen';
        end if;
        update public.sniper_queries set poll_interval_ms = p_poll_interval_ms, notes = p_notes, updated_at = now()
        where id = p_id;
        v_id := p_id;
    end if;
    return v_id;
exception when unique_violation then
    raise exception 'Ein Auftrag mit diesen Filtern besteht bereits';
end;
$function$;

revoke all on function public.upsert_sniper_query(uuid, text, integer, integer, numeric, numeric, integer, text) from public;

grant all on function public.upsert_sniper_query(uuid, text, integer, integer, numeric, numeric, integer, text) to authenticated;

grant all on function public.upsert_sniper_query(uuid, text, integer, integer, numeric, numeric, integer, text) to service_role;

alter table public.sniper_queries
  alter column search_text drop not null;

alter table public.sniper_queries
  add constraint sniper_queries_filter_required check (nullif(btrim(search_text), ''::text) is not null or catalog_id is not null);

alter table public.sniper_queries
  add constraint sniper_queries_interval_valid check (poll_interval_ms >= 10000 and poll_interval_ms <= 86400000);

alter table public.sniper_queries
  add constraint sniper_queries_price_range_valid check (price_from is null or price_to is null or price_from <= price_to);

alter table public.sniper_queries
  add column notes text;

create policy "Administration liest Sammelauftraege" on public.sniper_queries
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create table public.sniper_runtime_status (
  id                   integer                  not null,
  reported_at          timestamp with time zone not null,
  requests_last_minute integer                  not null,
  rejected_last_minute integer                  not null,
  request_budget       integer                  not null,
  last_cycle_error     text
);

comment on table public.sniper_runtime_status is 'Letzte Betriebsmeldung des einzigen Sammlers; fehlende oder alte Meldung ist kein gesunder Betrieb.';

alter table public.sniper_runtime_status
  enable row level security;

alter table public.sniper_runtime_status
  add constraint sniper_runtime_status_id_check check (id = 1);

alter table public.sniper_runtime_status
  add constraint sniper_runtime_status_pkey primary key (id);

alter table public.sniper_runtime_status
  add constraint sniper_runtime_status_rejected_last_minute_check check (rejected_last_minute >= 0);

alter table public.sniper_runtime_status
  add constraint sniper_runtime_status_request_budget_check check (request_budget > 0);

alter table public.sniper_runtime_status
  add constraint sniper_runtime_status_requests_last_minute_check check (requests_last_minute >= 0);

grant select on public.sniper_runtime_status to authenticated;

grant all on public.sniper_runtime_status to service_role;

create policy "Administration liest Botbetrieb" on public.sniper_runtime_status
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));