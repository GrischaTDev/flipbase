-- zweck: schreibzugriffe angemeldeter nutzer auf die sniper-tabellen sperren.
-- betroffen: public.sniper_queries, public.sniper_listings.
--
-- beide tabellen werden ausschliesslich vom sammeldienst ueber den
-- service-role-schluessel beschrieben, der rls umgeht. angemeldete nutzer
-- duerfen nur lesen.
--
-- die tabellenrechte stehen zwar in supabase/schemas/50_sniper.sql, aber
-- `supabase db diff` uebertraegt sie nicht in die erzeugte migration - die
-- voreinstellung von supabase vergibt an authenticated alle schreibrechte.
-- deshalb hier von hand, wie schon bei den buchungstabellen in
-- 20260829061000_restrict_inventory_booking_tables.sql.

revoke insert, update, delete on table public.sniper_queries from authenticated;
revoke insert, update, delete on table public.sniper_listings from authenticated;
