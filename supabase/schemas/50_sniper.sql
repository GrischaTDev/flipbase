-- ==============================================================================
-- VINTED DEAL MONITOR (Sniper)
-- ==============================================================================
--
-- Eigene Schemadatei statt eines Anhangs an database.sql: Der Sniper ist ein
-- eigenstaendiger Dienst unter services/sniper/, und database.sql wird parallel
-- an anderer Stelle umgebaut. Getrennte Dateien halten die Unterschiede lesbar
-- und verhindern, dass zwei Beitragende dieselbe 4600-Zeilen-Datei anfassen.
--
-- Zur Reihenfolge: Die Richtlinien nutzen Funktionen aus database.sql
-- (public.is_platform_operator) - diese Datei muss
-- also nach database.sql geladen werden. Das ist kein Zufall der lexikografischen
-- Sortierung mehr, sondern steht als feste Liste in schema_paths in
-- supabase/config.toml. Wer eine neue Schemadatei anlegt, muss sie dort mit
-- der richtigen Position eintragen - sonst wird sie beim db reset entweder
-- gar nicht geladen oder in falscher Reihenfolge.

create table if not exists public.sniper_queries (
    id uuid primary key default gen_random_uuid(),
    query_key text not null unique,
    marketplace text not null default 'vinted',
    search_text text,
    catalog_id integer,
    brand_id integer,
    price_to numeric(12, 2) check (price_to is null or price_to >= 0),
    price_from numeric(12, 2) check (price_from is null or price_from >= 0),
    is_standard boolean not null default false,
    poll_interval_ms integer not null default 60000,
    is_seeded boolean not null default false,
    is_active boolean not null default true,
    run_state text not null default 'ready'
        check (run_state in ('ready', 'cooldown', 'blocked', 'invalid')),
    next_attempt_at timestamptz,
    last_attempt_at timestamptz,
    last_success_at timestamptz,
    last_error_kind text,
    last_error_at timestamptz,
    last_error_message text,
    last_polled_at timestamptz,
    last_status text not null default 'never_polled'
        check (last_status in ('never_polled', 'ok', 'rate_limited', 'forbidden', 'failed')),
    consecutive_failures integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    notes text,
    title text not null default 'Markenfilter',
    deleted_at timestamptz,
    brand_ids integer[] not null default '{}',
    brand_names text[] not null default '{}',
    title_keywords text[] not null default '{}',
    keyword_mode text not null default 'all' check (keyword_mode in ('all', 'any')),
    filter_revision integer not null default 1 check (filter_revision > 0),
    filter_format_version integer not null default 0 check (filter_format_version in (0, 1)),
    request_cursor integer not null default 0 check (request_cursor >= 0),
    seeded_requests integer[] not null default '{}',
    constraint sniper_queries_brand_list_valid check (
        cardinality(brand_ids) <= 10 and cardinality(brand_ids) = cardinality(brand_names)
        and coalesce(array_ndims(brand_ids), 1) = 1 and array_position(brand_ids, null) is null
        and 0 < all(brand_ids)
    ),
    constraint sniper_queries_keywords_valid check (
        cardinality(title_keywords) <= 10 and coalesce(array_ndims(title_keywords), 1) = 1
        and array_position(title_keywords, null) is null
    ),
    constraint sniper_queries_filter_required check (
        nullif(btrim(search_text), '') is not null or catalog_id is not null
        or (brand_id is not null and brand_id > 0)
        or cardinality(brand_ids) > 0 or cardinality(title_keywords) > 0
    ),
    constraint sniper_queries_interval_valid check (poll_interval_ms between 10000 and 86400000),
    constraint sniper_queries_price_range_valid check (price_from is null or price_to is null or price_from <= price_to),
    constraint sniper_queries_title_valid check (length(btrim(title)) between 1 and 100),
    constraint sniper_queries_deleted_inactive check (deleted_at is null or not is_active)
);

create table if not exists public.sniper_origin_state (
    origin text primary key,
    state text not null default 'ready' check (state in ('ready', 'cooldown', 'blocked')),
    blocked_until timestamptz,
    reason text,
    probe_in_flight boolean not null default false,
    updated_at timestamptz not null default now()
);

comment on table public.sniper_origin_state is
    'Zentraler Zugangs- und Sperrzustand fuer externe Marktplatz-Origins.';

alter table public.sniper_origin_state enable row level security;
revoke all on public.sniper_origin_state from public, anon, authenticated;
grant select on public.sniper_origin_state to authenticated;
grant select, insert, update, delete on public.sniper_origin_state to service_role;
create policy "sniper_origin_state_operator_select" on public.sniper_origin_state
    for select to authenticated using ((select public.is_platform_operator()));

comment on table public.sniper_queries is
    'Eine Abfrage ist die Einheit, die tatsaechlich bei Vinted gepollt wird. Gleiche Filter mehrerer Arbeitsbereiche teilen sich ueber query_key eine Zeile.';

comment on column public.sniper_queries.title is
    'Anzeigename des zentralen Markenfilters in der Administration.';

create table if not exists public.sniper_listings (
    id uuid primary key default gen_random_uuid(),
    marketplace text not null default 'vinted',
    external_id text not null,
    title text not null,
    url text not null,
    description text,
    image_urls text[] not null default '{}',
    item_price numeric(12, 2) not null,
    total_price numeric(12, 2) not null,
    currency text not null default 'EUR',
    brand text,
    size text,
    condition text,
    country_code text check (country_code ~ '^[A-Z]{2}$'),
    seller_name text,
    seller_avatar_url text,
    seller_rating numeric(3, 2) check (seller_rating between 0 and 5),
    seller_review_count integer check (seller_review_count >= 0),
    is_hidden boolean not null default false,
    item_updated_at timestamptz,
    photo_uploaded_at timestamptz,
    discovered_by_query_id uuid references public.sniper_queries (id) on delete set null,
    first_seen_at timestamptz not null default now(),
    catalog_id integer,
    catalog_source_query_id uuid references public.sniper_queries (id) on delete set null,
    unique (marketplace, external_id)
);

comment on table public.sniper_listings is
    'Gefundene Angebote, geteilt ueber alle Arbeitsbereiche. Enthaelt Verkaeuferangaben (Name, Profilbild, Bewertung) - deshalb ist die Aufbewahrungsfrist auf first_seen_at kein Aufraeumen, sondern Pflicht.';

comment on column public.sniper_listings.item_price is
    'Reiner Artikelpreis. Basis fuer die Margenrechnung.';

comment on column public.sniper_listings.total_price is
    'Gesamtpreis inklusive Kaeuferschutz - der Betrag, der tatsaechlich abgebucht wird.';

comment on column public.sniper_listings.item_updated_at is
    'Wann Vinted den Artikel zuletzt aktualisiert hat. Daran haengt, wie frisch ein Fund wirklich ist; photo_uploaded_at ist nur eine Naeherung ueber das Bildalter.';

comment on column public.sniper_listings.is_hidden is
    'Vinted zeigt Artikel im Katalog, bevor sie kaufbar sind. Solange wahr, ist Zuschlagen sinnlos.';

comment on column public.sniper_listings.image_urls is
    'Alle Bilder in der Reihenfolge des Katalogs. Ein einzelnes Foto zeigt Maengel oft nicht.';

-- Beide Tabellen sind arbeitsbereichsuebergreifend: Angemeldete Nutzer duerfen
-- ausschliesslich lesen. Geschrieben wird nur vom Dienst ueber den
-- Service-Role-Schluessel, der RLS umgeht - deshalb gibt es hier bewusst keine
-- insert-, update- oder delete-Richtlinie.
alter table public.sniper_queries enable row level security;
alter table public.sniper_listings enable row level security;

create policy "Angemeldete duerfen Angebote lesen" on public.sniper_listings
    for select to authenticated
    using (true);

-- Tabellenrechte eng ziehen. Die Voreinstellung von Supabase vergibt an
-- authenticated saemtliche Schreibrechte; ohne diesen Block stuende in der
-- erzeugten Migration ein GRANT ALL, das der Leseabsicht widerspricht. RLS
-- wuerde die Schreibversuche zwar abfangen, aber die uebrigen Tabellen dieses
-- Projekts ziehen die Rechte ebenfalls eng - sales gibt authenticated genau
-- SELECT. Zwei Schichten statt einer.
--
-- service_role bleibt unberuehrt: Der Dienst schreibt darueber und umgeht RLS.
revoke all on table public.sniper_queries from anon, public;
revoke all on table public.sniper_queries from authenticated;
revoke all on table public.sniper_listings from anon, public;
revoke all on table public.sniper_listings from authenticated;

grant select on table public.sniper_queries, public.sniper_listings to authenticated;

create index if not exists idx_sniper_queries_due
    on public.sniper_queries (is_active, last_polled_at);

create index if not exists idx_sniper_listings_first_seen_at
    on public.sniper_listings (first_seen_at);

create index if not exists idx_sniper_listings_discovered_by_query_id
    on public.sniper_listings (discovered_by_query_id);

-- Die Aufbewahrung beginnt beim ersten Fund; Auftraege bleiben bestehen.
-- Kleine Pakete begrenzen Sperren und erlauben unterbrechbares Nachholen.
create or replace function public.sniper_purge_expired_listings(p_batch_size integer default 1000)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_deleted integer;
begin
    if p_batch_size is null or p_batch_size not between 1 and 5000 then
        raise exception 'Die Paketgroesse muss zwischen 1 und 5000 liegen.' using errcode = '22023';
    end if;

    with expired as (
        select id from public.sniper_listings
        where first_seen_at < now() - interval '3 days'
        order by first_seen_at, id
        limit p_batch_size
        for update skip locked
    ), deleted as (
        delete from public.sniper_listings as listing
        using expired
        where listing.id = expired.id
        returning listing.id
    )
    select count(*)::integer into v_deleted from deleted;
    return v_deleted;
end;
$$;

comment on function public.sniper_purge_expired_listings(integer) is
    'Loescht paketweise Angebote nach Ablauf der Aufbewahrungsfrist seit Erstfund. Nur der Dienst darf die Bereinigung ausloesen.';
revoke all on function public.sniper_purge_expired_listings(integer) from public, anon, authenticated;
grant execute on function public.sniper_purge_expired_listings(integer) to service_role;
