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
    price_to numeric(12, 2) check (price_to is null or price_to >= 0),
    price_from numeric(12, 2) check (price_from is null or price_from >= 0),
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

create table if not exists public.sniper_hits (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid not null
        references public.sniper_query_subscriptions (id) on delete cascade,
    listing_id uuid not null references public.sniper_listings (id) on delete cascade,
    reference_price numeric(12, 2) not null,
    discount_percent numeric(5, 2) not null,
    created_at timestamptz not null default now(),
    notified_at timestamptz,
    unique (subscription_id, listing_id)
);

comment on table public.sniper_hits is
    'Ein Fund, der fuer ein bestimmtes Abonnement auffaellig guenstig war. Gehoert zum Abonnement und nicht zum Fund, weil die Schwelle je Abonnent verschieden ist.';

comment on column public.sniper_hits.reference_price is
    'Der Gruppenmedian zum Zeitpunkt der Bewertung. Festgehalten statt spaeter neu gerechnet - der Median verschiebt sich mit jedem neuen Fund, und ohne diesen Wert waere spaeter nicht nachvollziehbar, warum gemeldet wurde.';

comment on column public.sniper_hits.notified_at is
    'Wann zugestellt wurde. Verhindert Doppelmeldungen ueber Neustarts des Dienstes hinweg.';

alter table public.sniper_hits enable row level security;

create policy "Mitglieder duerfen eigene Treffer lesen" on public.sniper_hits
    for select to authenticated
    using (
        exists (
            select 1
            from public.sniper_query_subscriptions as subscription
            where subscription.id = public.sniper_hits.subscription_id
              and public.is_workspace_member(subscription.workspace_id)
        )
    );

create index if not exists idx_sniper_hits_subscription
    on public.sniper_hits (subscription_id, created_at desc);

create index if not exists idx_sniper_hits_pending_notification
    on public.sniper_hits (created_at)
    where notified_at is null;

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
revoke all on table public.sniper_hits from anon, public;
revoke all on table public.sniper_hits from authenticated;

grant select on table public.sniper_queries, public.sniper_listings to authenticated;
grant select on table public.sniper_query_subscriptions to authenticated;
grant select on table public.sniper_hits to authenticated;

create index if not exists idx_sniper_queries_due
    on public.sniper_queries (is_active, last_polled_at);

create index if not exists idx_sniper_listings_first_seen_at
    on public.sniper_listings (first_seen_at);

create index if not exists idx_sniper_listings_discovered_by_query_id
    on public.sniper_listings (discovered_by_query_id);

-- Angemeldete duerfen sniper_queries nicht beschreiben. Diese Funktion legt die
-- geteilte Abfrage an oder verwendet die vorhandene wieder und erzeugt das
-- Abonnement. Der Schluessel muss zeichengenau dem entsprechen, was
-- services/sniper/src/domain/query.ts bildet - sonst zerfaellt die Zusammenfassung
-- und derselbe Filter wuerde zweimal gepollt.
create or replace function public.create_sniper_subscription(
    p_workspace_id uuid,
    p_search_text text,
    p_brand_id integer,
    p_price_from numeric,
    p_price_to numeric,
    p_threshold numeric default 30
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search_text text;
  v_query_key text;
  v_query_id uuid;
  v_subscription_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Kein Mitglied dieses Arbeitsbereichs';
  end if;

  v_search_text := lower(btrim(regexp_replace(p_search_text, '\s+', ' ', 'g')));

  if v_search_text is null or v_search_text = '' then
    raise exception 'Der Suchbegriff darf nicht leer sein';
  end if;

  -- Auf zwei Nachkommastellen runden, bevor der Schluessel gebildet wird: die
  -- Spalten sind numeric(12,2), die Parameter aber unbeschraenkt. 50.567 und
  -- 50.566 speichern beide 50.57 - ohne diese Rundung vor der Schluesselbildung
  -- erzeugen sie zwei Abfragezeilen und damit zwei Vinted-Anfragen fuer
  -- denselben gespeicherten Filter.
  p_price_from := round(p_price_from, 2);
  p_price_to := round(p_price_to, 2);

  if p_price_from is not null and p_price_to is not null and p_price_from > p_price_to then
    raise exception 'Die Preisuntergrenze darf nicht ueber der Preisobergrenze liegen';
  end if;

  -- trim_scale streicht nachlaufende Nullen: 50.00 und 50 muessen denselben
  -- Schluessel ergeben, sonst legt derselbe Filter zwei Abfragen an und wird
  -- zweimal gepollt - genau der Sparmechanismus, um den es hier geht.
  v_query_key := concat_ws('|',
    'vinted',
    'search=' || v_search_text,
    'catalog=-',
    'brand=' || coalesce(p_brand_id::text, '-'),
    'price_from=' || coalesce(trim_scale(p_price_from)::text, '-'),
    'price_to=' || coalesce(trim_scale(p_price_to)::text, '-')
  );

  -- Eine stillgelegte Abfrage (drei Fehlschlaege in Folge, is_active = false)
  -- kommt ohne diesen Zweig nie zurueck - do nothing liesse sie stillgelegt.
  -- Wer den Filter neu anlegt, will ihn offensichtlich wieder laufen sehen.
  insert into public.sniper_queries (query_key, search_text, brand_id, price_from, price_to)
  values (v_query_key, v_search_text, p_brand_id, p_price_from, p_price_to)
  on conflict (query_key) do update
    set is_active = true,
        consecutive_failures = 0;

  select id into v_query_id from public.sniper_queries where query_key = v_query_key;

  -- 30 Prozent ist ein Startwert, kein Naturgesetz: do update uebernimmt die
  -- neue Schwelle und setzt das Abonnement wieder aktiv. Ohne diesen Zweig
  -- gaebe es keinen Weg, eine einmal gesetzte Schwelle je zu aendern -
  -- authenticated hat kein UPDATE-Recht auf der Tabelle.
  insert into public.sniper_query_subscriptions
    (workspace_id, query_id, discount_threshold_percent)
  values (p_workspace_id, v_query_id, p_threshold)
  on conflict (workspace_id, query_id) do update
    set discount_threshold_percent = excluded.discount_threshold_percent,
        is_active = true;

  select id into v_subscription_id
  from public.sniper_query_subscriptions
  where workspace_id = p_workspace_id and query_id = v_query_id;

  return v_subscription_id;
end;
$$;

revoke all on function public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric) from public, anon;
grant execute on function public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric) to authenticated;

-- Der Vergleichsmassstab einer Gruppe: der Median der Artikelpreise derselben
-- Abfrage im selben Zustand, ueber ein gleitendes Fenster.
--
-- Zwei Schutzregeln, beide aus echten Daten hergeleitet (04.09.2026, 96 Funde):
--
-- Mindestzahl: Unter acht Vergleichswerten ist ein Median Zufall - ein
-- einzelner Ausreisser verschiebt ihn stark.
--
-- Anschlagserkennung: Klebt mehr als ein Drittel der Gruppe an der
-- Preisobergrenze der Abfrage, schneidet die Grenze in die Verteilung und der
-- Median ist wertlos. Gemessen lag die abgeschnittene Gruppe bei 67 Prozent,
-- die naechsthoechste gesunde bei 16 - ein Drittel trifft die Luecke.
--
-- Ohne die zweite Regel bliebe das Werkzeug genau in der Kategorie stumm, in
-- der die echten Schnaeppchen stecken.
create or replace function public.sniper_reference_price(
    p_query_id uuid,
    p_condition text
)
returns table (reference_price numeric, sample_size integer, unusable_reason text)
language sql
stable
security invoker
set search_path = ''
as $$
    with fenster as (
        select listing.item_price
        from public.sniper_listings as listing
        where listing.discovered_by_query_id = p_query_id
          and listing.condition is not distinct from p_condition
          and listing.first_seen_at >= now() - interval '14 days'
    ),
    grenze as (
        select price_to from public.sniper_queries where id = p_query_id
    ),
    kennzahlen as (
        select
            count(*)::integer as n,
            percentile_cont(0.5) within group (order by item_price)::numeric(12, 2) as median,
            count(*) filter (
                where (select price_to from grenze) is not null
                  and item_price >= (select price_to from grenze)
            )::integer as am_limit
        from fenster
    )
    select
        case
            when n < 8 then null
            when am_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then null
            else median
        end,
        n,
        case
            when n < 8 then 'too_few'
            when am_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then 'at_price_ceiling'
            else null
        end
    from kennzahlen;
$$;

comment on function public.sniper_reference_price(uuid, text) is
    'Median der Artikelpreise einer Abfrage im selben Zustand ueber 14 Tage. Liefert null mit Begruendung, wenn die Gruppe zu klein ist oder am Preislimit klebt.';

-- Postgres macht Funktionen standardmaessig fuer PUBLIC ausfuehrbar, womit auch
-- anon sie aufrufen koennte. Gefaehrlich waere das hier nicht - die Funktion
-- laeuft als Aufrufer, und anon hat keine Leserechte auf sniper_listings -
-- aber die uebrigen Funktionen dieses Projekts ziehen die Rechte ausdruecklich
-- eng, und eine soll nicht ausscheren.
revoke all on function public.sniper_reference_price(uuid, text) from public, anon;
grant execute on function public.sniper_reference_price(uuid, text) to authenticated;
