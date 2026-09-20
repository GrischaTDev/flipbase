-- Zweck: gespeicherte Kleinanzeigen-Inserate mit RLS und begrenzter Inhaltsbearbeitung anlegen.
-- Betroffene Tabelle: public.listings.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.touch_listing_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.touch_listing_updated_at() FROM PUBLIC;

CREATE TABLE public.listings (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id      uuid                     NOT NULL,
  inventory_item_id uuid                     NOT NULL,
  platform          text                     DEFAULT 'kleinanzeigen'::text NOT NULL,
  status            text                     DEFAULT 'prepared'::text NOT NULL,
  end_reason        text,
  title             text                     NOT NULL,
  description       text                     NOT NULL,
  price             numeric(12,2)            NOT NULL,
  price_type        text                     NOT NULL,
  shipping_type     text                     NOT NULL,
  shipping_price    numeric(12,2),
  postal_code       text,
  listed_count      integer                  DEFAULT 0 NOT NULL,
  last_listed_at    timestamp with time zone,
  online_since      timestamp with time zone,
  ended_at          timestamp with time zone,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.listings IS 'Gespeicherte und statusgeführte Verkaufsinserate eines Workspace.';

ALTER TABLE public.listings
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.listings FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_description_check CHECK (char_length(description) <= 4000);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_end_reason_check CHECK (end_reason = ANY (ARRAY['sold'::text, 'manual'::text]));

ALTER TABLE public.listings
  ADD CONSTRAINT listings_end_state_check CHECK (status = 'ended'::text AND end_reason IS NOT NULL AND ended_at IS
    NOT NULL OR status <> 'ended'::text AND end_reason IS NULL AND ended_at IS NULL);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_item_workspace_fkey FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES public.inventory_items(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_listed_count_check CHECK (listed_count >= 0);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_pkey PRIMARY KEY (id);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_platform_check CHECK (platform = 'kleinanzeigen'::text);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_postal_code_check CHECK (postal_code ~ '^[0-9]{5}$'::text);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_price_check CHECK (price >= 0::numeric AND price <= 99999999::numeric);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_price_type_check CHECK (price_type = ANY (ARRAY['FIXED'::text, 'NEGOTIABLE'::text]));

ALTER TABLE public.listings
  ADD CONSTRAINT listings_shipping_price_check CHECK (shipping_type = 'pickup'::text AND shipping_price IS NULL OR (shipping_type = ANY (ARRAY['shipping'::text, 'both'::text])));

ALTER TABLE public.listings
  ADD CONSTRAINT listings_shipping_price_nonnegative_check CHECK (shipping_price >= 0::numeric);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_shipping_type_check CHECK (shipping_type = ANY (ARRAY['pickup'::text, 'shipping'::text, 'both'::text]));

ALTER TABLE public.listings
  ADD CONSTRAINT listings_status_check CHECK (status = ANY (ARRAY['prepared'::text, 'online'::text, 'ended'::text]));

ALTER TABLE public.listings
  ADD CONSTRAINT listings_title_check CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 65);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_workspace_id_id_key UNIQUE (workspace_id, id);

GRANT SELECT ON public.listings TO authenticated;

GRANT UPDATE (description, postal_code, price, price_type, shipping_price, shipping_type, title) ON public.listings TO authenticated;

CREATE UNIQUE INDEX listings_one_open_per_item ON public.listings (inventory_item_id, platform)
  WHERE status <> 'ended'::text;

CREATE INDEX listings_inventory_item_id_idx ON public.listings (inventory_item_id);

CREATE INDEX listings_workspace_status_updated_idx ON public.listings (workspace_id, status, updated_at DESC, id DESC);

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER listings_touch_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_listing_updated_at();

CREATE POLICY "Inserate lesen" ON public.listings
  FOR SELECT
  TO authenticated
  USING (( SELECT public.is_workspace_member(listings.workspace_id) AS is_workspace_member));

CREATE POLICY "Inseratsinhalt ändern" ON public.listings
  FOR UPDATE
  TO authenticated
  USING (( SELECT public.is_workspace_member(listings.workspace_id) AS is_workspace_member))
  WITH CHECK (( SELECT public.is_workspace_member(listings.workspace_id) AS is_workspace_member));
