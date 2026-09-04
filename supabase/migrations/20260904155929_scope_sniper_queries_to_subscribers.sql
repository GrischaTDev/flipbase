-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP POLICY "Angemeldete duerfen Abfragen lesen" ON public.sniper_queries;

CREATE POLICY "Abonnenten duerfen ihre Abfragen lesen" ON public.sniper_queries
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.sniper_query_subscriptions SUBSCRIPTION
  WHERE ((subscription.query_id = sniper_queries.id) AND public.is_workspace_member(subscription.workspace_id)))));