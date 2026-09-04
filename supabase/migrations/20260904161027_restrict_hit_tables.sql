-- zweck: schreibzugriffe angemeldeter nutzer auf die trefferliste sperren.
-- betroffen: public.sniper_hits.
--
-- treffer entstehen ausschliesslich im dienst ueber den service-role-schluessel.
-- angemeldete nutzer duerfen nur lesen.
--
-- endzustand wie bei sniper_queries, sniper_listings und
-- sniper_query_subscriptions: anon gar nichts, authenticated genau select.
-- `revoke insert, update, delete` allein reicht nicht - die voreinstellung
-- vergibt zusaetzlich maintain, references, trigger und truncate, und
-- truncate umgeht row level security vollstaendig. genau das ist bei
-- 20260902213821_restrict_subscription_tables.sql zuerst schiefgegangen und
-- musste mit 20260903000512_restrict_subscription_anon_grants.sql
-- nachgebessert werden - deshalb hier direkt `revoke all` statt der
-- einzelnen rechte. von hand, weil `supabase db diff` tabellenrechte nicht
-- aus dem deklarativen schema uebernimmt.

revoke all on table public.sniper_hits from anon, public;
revoke all on table public.sniper_hits from authenticated;

grant select on table public.sniper_hits to authenticated;
