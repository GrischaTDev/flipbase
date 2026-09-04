-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

CREATE TABLE public.sniper_hits (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  subscription_id  uuid                     NOT NULL,
  listing_id       uuid                     NOT NULL,
  reference_price  numeric(12,2)            NOT NULL,
  discount_percent numeric(5,2)             NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  notified_at      timestamp with time zone
);

COMMENT ON TABLE public.sniper_hits IS 'Ein Fund, der fuer ein bestimmtes Abonnement auffaellig guenstig war. Gehoert zum Abonnement und nicht zum Fund, weil die Schwelle je Abonnent verschieden ist.';

COMMENT ON COLUMN public.sniper_hits.reference_price IS 'Der Gruppenmedian zum Zeitpunkt der Bewertung. Festgehalten statt spaeter neu gerechnet - der Median verschiebt sich mit jedem neuen Fund, und ohne diesen Wert waere spaeter nicht nachvollziehbar, warum gemeldet wurde.';

COMMENT ON COLUMN public.sniper_hits.notified_at IS 'Wann zugestellt wurde. Verhindert Doppelmeldungen ueber Neustarts des Dienstes hinweg.';

ALTER TABLE public.sniper_hits
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sniper_hits
  ADD CONSTRAINT sniper_hits_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.sniper_listings(id) ON DELETE CASCADE;

ALTER TABLE public.sniper_hits
  ADD CONSTRAINT sniper_hits_pkey PRIMARY KEY (id);

ALTER TABLE public.sniper_hits
  ADD CONSTRAINT sniper_hits_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.sniper_query_subscriptions(id) ON DELETE CASCADE;

ALTER TABLE public.sniper_hits
  ADD CONSTRAINT sniper_hits_subscription_id_listing_id_key UNIQUE (subscription_id, listing_id);

GRANT SELECT ON public.sniper_hits TO authenticated;

GRANT ALL ON public.sniper_hits TO service_role;

CREATE INDEX idx_sniper_hits_subscription ON public.sniper_hits (subscription_id, created_at DESC);

CREATE INDEX idx_sniper_hits_pending_notification ON public.sniper_hits (created_at)
  WHERE notified_at IS NULL;

CREATE POLICY "Mitglieder duerfen eigene Treffer lesen" ON public.sniper_hits
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.sniper_query_subscriptions SUBSCRIPTION
  WHERE ((subscription.id = sniper_hits.subscription_id) AND public.is_workspace_member(subscription.workspace_id)))));