-- zweck: schreibzugriffe angemeldeter nutzer auf die abonnement-tabelle sperren.
-- betroffen: public.sniper_query_subscriptions.
--
-- geschrieben wird ausschliesslich ueber public.create_sniper_subscription,
-- eine security-definer-funktion. angemeldete nutzer duerfen nur lesen.
--
-- von hand, weil `supabase db diff` tabellenrechte nicht aus dem deklarativen
-- schema uebernimmt - wie schon bei 20260902194744_restrict_sniper_tables.sql.

revoke insert, update, delete on table public.sniper_query_subscriptions from authenticated;
