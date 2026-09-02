-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

CREATE TABLE public.sniper_listings (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  marketplace            text                     DEFAULT 'vinted'::text NOT NULL,
  external_id            text                     NOT NULL,
  title                  text                     NOT NULL,
  url                    text                     NOT NULL,
  description            text,
  image_urls             text[]                   DEFAULT '{}'::text[] NOT NULL,
  item_price             numeric(12,2)            NOT NULL,
  total_price            numeric(12,2)            NOT NULL,
  currency               text                     DEFAULT 'EUR'::text NOT NULL,
  brand                  text,
  size                   text,
  condition              text,
  country_code           text,
  seller_name            text,
  seller_avatar_url      text,
  seller_rating          numeric(3,2),
  seller_review_count    integer,
  is_hidden              boolean                  DEFAULT false NOT NULL,
  item_updated_at        timestamp with time zone,
  photo_uploaded_at      timestamp with time zone,
  discovered_by_query_id uuid,
  first_seen_at          timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.sniper_listings IS 'Gefundene Angebote, geteilt ueber alle Arbeitsbereiche. Enthaelt Verkaeuferangaben (Name, Profilbild, Bewertung) - deshalb ist die Aufbewahrungsfrist auf first_seen_at kein Aufraeumen, sondern Pflicht.';

COMMENT ON COLUMN public.sniper_listings.image_urls IS 'Alle Bilder in der Reihenfolge des Katalogs. Ein einzelnes Foto zeigt Maengel oft nicht.';

COMMENT ON COLUMN public.sniper_listings.item_price IS 'Reiner Artikelpreis. Basis fuer die Margenrechnung.';

COMMENT ON COLUMN public.sniper_listings.total_price IS 'Gesamtpreis inklusive Kaeuferschutz - der Betrag, der tatsaechlich abgebucht wird.';

COMMENT ON COLUMN public.sniper_listings.is_hidden IS 'Vinted zeigt Artikel im Katalog, bevor sie kaufbar sind. Solange wahr, ist Zuschlagen sinnlos.';

COMMENT ON COLUMN public.sniper_listings.item_updated_at IS 'Wann Vinted den Artikel zuletzt aktualisiert hat. Daran haengt, wie frisch ein Fund wirklich ist; photo_uploaded_at ist nur eine Naeherung ueber das Bildalter.';

ALTER TABLE public.sniper_listings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sniper_listings
  ADD CONSTRAINT sniper_listings_country_code_check CHECK (country_code ~ '^[A-Z]{2}$'::text);

ALTER TABLE public.sniper_listings
  ADD CONSTRAINT sniper_listings_marketplace_external_id_key UNIQUE (marketplace, external_id);

ALTER TABLE public.sniper_listings
  ADD CONSTRAINT sniper_listings_pkey PRIMARY KEY (id);

ALTER TABLE public.sniper_listings
  ADD CONSTRAINT sniper_listings_seller_rating_check CHECK (seller_rating >= 0::numeric AND seller_rating <= 5::numeric);

ALTER TABLE public.sniper_listings
  ADD CONSTRAINT sniper_listings_seller_review_count_check CHECK (seller_review_count >= 0);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sniper_listings TO authenticated;

GRANT ALL ON public.sniper_listings TO service_role;

CREATE INDEX idx_sniper_listings_first_seen_at ON public.sniper_listings (first_seen_at);

CREATE INDEX idx_sniper_listings_discovered_by_query_id ON public.sniper_listings (discovered_by_query_id);

CREATE POLICY "Angemeldete duerfen Angebote lesen" ON public.sniper_listings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.sniper_queries (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  query_key            text                     NOT NULL,
  marketplace          text                     DEFAULT 'vinted'::text NOT NULL,
  search_text          text                     NOT NULL,
  catalog_id           integer,
  brand_id             integer,
  price_to             numeric(12,2),
  is_standard          boolean                  DEFAULT false NOT NULL,
  poll_interval_ms     integer                  DEFAULT 60000 NOT NULL,
  is_seeded            boolean                  DEFAULT false NOT NULL,
  is_active            boolean                  DEFAULT true NOT NULL,
  last_polled_at       timestamp with time zone,
  last_status          text                     DEFAULT 'never_polled'::text NOT NULL,
  consecutive_failures integer                  DEFAULT 0 NOT NULL,
  created_at           timestamp with time zone DEFAULT now() NOT NULL,
  updated_at           timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.sniper_queries IS 'Eine Abfrage ist die Einheit, die tatsaechlich bei Vinted gepollt wird. Gleiche Filter mehrerer Arbeitsbereiche teilen sich ueber query_key eine Zeile.';

ALTER TABLE public.sniper_queries
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sniper_queries
  ADD CONSTRAINT sniper_queries_last_status_check CHECK (last_status = ANY (ARRAY['never_polled'::text, 'ok'::text, 'rate_limited'::text, 'forbidden'::text, 'failed'::text]));

ALTER TABLE public.sniper_queries
  ADD CONSTRAINT sniper_queries_pkey PRIMARY KEY (id);

ALTER TABLE public.sniper_listings
  ADD CONSTRAINT sniper_listings_discovered_by_query_id_fkey FOREIGN KEY (discovered_by_query_id) REFERENCES public.sniper_queries(id) ON DELETE SET NULL;

ALTER TABLE public.sniper_queries
  ADD CONSTRAINT sniper_queries_query_key_key UNIQUE (query_key);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sniper_queries TO authenticated;

GRANT ALL ON public.sniper_queries TO service_role;

CREATE INDEX idx_sniper_queries_due ON public.sniper_queries (is_active, last_polled_at);

CREATE POLICY "Angemeldete duerfen Abfragen lesen" ON public.sniper_queries
  FOR SELECT
  TO authenticated
  USING (true);