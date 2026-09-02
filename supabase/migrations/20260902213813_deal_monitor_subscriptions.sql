-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sniper_listings FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sniper_listings FROM authenticated;

ALTER TABLE public.sniper_queries
  ADD COLUMN price_from numeric(12,2);

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sniper_queries FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sniper_queries FROM authenticated;

CREATE TABLE public.sniper_query_subscriptions (
  id                         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id               uuid                     NOT NULL,
  query_id                   uuid                     NOT NULL,
  discount_threshold_percent numeric(5,2)             DEFAULT 30 NOT NULL,
  is_active                  boolean                  DEFAULT true NOT NULL,
  created_at                 timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.sniper_query_subscriptions IS 'Verbindet einen Arbeitsbereich mit einer geteilten Abfrage. Die Abfrage bleibt eine Zeile und wird einmal gepollt; sichtbar ist sie nur ihren Abonnenten.';

COMMENT ON COLUMN public.sniper_query_subscriptions.discount_threshold_percent IS 'Ab wie viel Prozent unter dem Gruppenmedian ein Fund zum Treffer wird. Gehoert an das Abonnement, nicht an die Abfrage: Zwei Arbeitsbereiche mit demselben Filter duerfen unterschiedlich streng sein.';

ALTER TABLE public.sniper_query_subscriptions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sniper_query_subscriptions
  ADD CONSTRAINT sniper_query_subscriptions_discount_threshold_percent_check CHECK (discount_threshold_percent > 0::numeric AND discount_threshold_percent < 100::numeric);

ALTER TABLE public.sniper_query_subscriptions
  ADD CONSTRAINT sniper_query_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE public.sniper_query_subscriptions
  ADD CONSTRAINT sniper_query_subscriptions_query_id_fkey FOREIGN KEY (query_id) REFERENCES public.sniper_queries(id) ON DELETE CASCADE;

ALTER TABLE public.sniper_query_subscriptions
  ADD CONSTRAINT sniper_query_subscriptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.sniper_query_subscriptions
  ADD CONSTRAINT sniper_query_subscriptions_workspace_id_query_id_key UNIQUE (workspace_id, query_id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sniper_query_subscriptions TO anon;

GRANT ALL ON public.sniper_query_subscriptions TO authenticated;

GRANT ALL ON public.sniper_query_subscriptions TO service_role;

CREATE INDEX idx_sniper_query_subscriptions_query ON public.sniper_query_subscriptions (query_id);

CREATE INDEX idx_sniper_query_subscriptions_workspace ON public.sniper_query_subscriptions (workspace_id);

CREATE POLICY "Mitglieder duerfen eigene Abonnements lesen" ON public.sniper_query_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));