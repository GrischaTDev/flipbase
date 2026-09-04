-- ==============================================================================
-- VINTED DEAL MONITOR (Sniper)
-- ==============================================================================
--
-- Eigene Schemadatei statt eines Anhangs an database.sql: Der Sniper ist ein
-- eigenstaendiger Dienst unter services/sniper/, und database.sql wird parallel
-- an anderer Stelle umgebaut. Getrennte Dateien halten die Unterschiede lesbar
-- und verhindern, dass zwei Beitragende dieselbe 4600-Zeilen-Datei anfassen.
--
-- Zur Reihenfolge: sniper_query_subscriptions verweist auf public.workspaces
-- und nutzt public.is_workspace_member aus database.sql - diese Datei muss
-- also nach database.sql geladen werden. Das ist kein Zufall der lexikografischen
-- Sortierung mehr, sondern steht als feste Liste in schema_paths in
-- supabase/config.toml. Wer eine neue Schemadatei anlegt, muss sie dort mit
-- der richtigen Position eintragen - sonst wird sie beim db reset entweder
-- gar nicht geladen oder in falscher Reihenfolge.

create table if not exists public.sniper_queries (
    id uuid primary key default gen_random_uuid(),
    query_key text not null unique,
    marketplace text not null default 'vinted',
    search_text text not null,
    catalog_id integer,
    brand_id integer,
    price_to numeric(12, 2),
    price_from numeric(12, 2),
    is_standard boolean not null default false,
    poll_interval_ms integer not null default 60000,
    is_seeded boolean not null default false,
    is_active boolean not null default true,
    last_polled_at timestamptz,
    last_status text not null default 'never_polled'
        check (last_status in ('never_polled', 'ok', 'rate_limited', 'forbidden', 'failed')),
    consecutive_failures integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.sniper_queries is
    'Eine Abfrage ist die Einheit, die tatsaechlich bei Vinted gepollt wird. Gleiche Filter mehrerer Arbeitsbereiche teilen sich ueber query_key eine Zeile.';

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

create table if not exists public.sniper_query_subscriptions (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces (id) on delete cascade,
    query_id uuid not null references public.sniper_queries (id) on delete cascade,
    discount_threshold_percent numeric(5, 2) not null default 30
        check (discount_threshold_percent > 0 and discount_threshold_percent < 100),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    unique (workspace_id, query_id)
);

comment on table public.sniper_query_subscriptions is
    'Verbindet einen Arbeitsbereich mit einer geteilten Abfrage. Die Abfrage bleibt eine Zeile und wird einmal gepollt; sichtbar ist sie nur ihren Abonnenten.';

comment on column public.sniper_query_subscriptions.discount_threshold_percent is
    'Ab wie viel Prozent unter dem Gruppenmedian ein Fund zum Treffer wird. Gehoert an das Abonnement, nicht an die Abfrage: Zwei Arbeitsbereiche mit demselben Filter duerfen unterschiedlich streng sein.';

alter table public.sniper_query_subscriptions enable row level security;

create policy "Mitglieder duerfen eigene Abonnements lesen" on public.sniper_query_subscriptions
    for select to authenticated
    using (public.is_workspace_member(workspace_id));

create index if not exists idx_sniper_query_subscriptions_workspace
    on public.sniper_query_subscriptions (workspace_id);

create index if not exists idx_sniper_query_subscriptions_query
    on public.sniper_query_subscriptions (query_id);

-- Beide Tabellen sind arbeitsbereichsuebergreifend: Angemeldete Nutzer duerfen
-- ausschliesslich lesen. Geschrieben wird nur vom Dienst ueber den
-- Service-Role-Schluessel, der RLS umgeht - deshalb gibt es hier bewusst keine
-- insert-, update- oder delete-Richtlinie.
alter table public.sniper_queries enable row level security;
alter table public.sniper_listings enable row level security;

-- Eine Abfrage ist nur fuer die Arbeitsbereiche sichtbar, die sie abonniert
-- haben. Welche Filter jemand beobachtet, ist seine Einkaufsstrategie.
create policy "Abonnenten duerfen ihre Abfragen lesen" on public.sniper_queries
    for select to authenticated
    using (
        exists (
            select 1
            from public.sniper_query_subscriptions as subscription
            where subscription.query_id = public.sniper_queries.id
              and public.is_workspace_member(subscription.workspace_id)
        )
    );

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
revoke all on table public.sniper_query_subscriptions from anon, public;
revoke all on table public.sniper_query_subscriptions from authenticated;

grant select on table public.sniper_queries, public.sniper_listings to authenticated;
grant select on table public.sniper_query_subscriptions to authenticated;

create index if not exists idx_sniper_queries_due
    on public.sniper_queries (is_active, last_polled_at);

create index if not exists idx_sniper_listings_first_seen_at
    on public.sniper_listings (first_seen_at);

create index if not exists idx_sniper_listings_discovered_by_query_id
    on public.sniper_listings (discovered_by_query_id);
