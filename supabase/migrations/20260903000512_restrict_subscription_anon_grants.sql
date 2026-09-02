-- zweck: die restrechte auf der abonnement-tabelle entziehen.
-- betroffen: public.sniper_query_subscriptions.
--
-- die voreinstellung von supabase vergibt maintain, references, trigger und
-- truncate. truncate umgeht row level security vollstaendig - weder anon noch
-- authenticated duerfen das behalten. 20260902213821 hat nur insert, update
-- und delete entzogen, der rest blieb unbemerkt stehen.
--
-- endzustand wie bei sniper_queries und sniper_listings: anon gar nichts,
-- authenticated genau select. von hand, weil `supabase db diff`
-- tabellenrechte nicht aus dem deklarativen schema uebernimmt.

revoke all on table public.sniper_query_subscriptions from anon, public;
revoke all on table public.sniper_query_subscriptions from authenticated;

grant select on table public.sniper_query_subscriptions to authenticated;
