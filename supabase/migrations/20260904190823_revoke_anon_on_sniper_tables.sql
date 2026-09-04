-- zweck: anon saemtliche tabellenrechte auf den sniper-tabellen entziehen.
-- betroffen: public.sniper_queries, public.sniper_listings,
--            public.sniper_query_subscriptions, public.sniper_hits.
--
-- am 04.09.2026 auf der produktionsdatenbank gemessen: anon hielt dort
-- delete, insert, select und update auf sniper_queries und sniper_listings.
-- lokal war nichts davon zu sehen.
--
-- der grund ist lehrreich: die erzeugten rechte-anweisungen einer migration
-- bilden immer den stand der maschine ab, auf der sie entstanden sind. die
-- produktionsdatenbank wurde mit anderen voreinstellungen angelegt als der
-- lokale stapel, also hat das erzeugte revoke dort andere rechte vorgefunden
-- und stehen lassen.
--
-- ausgenutzt werden konnte es nicht: fuer anon existiert auf keiner der vier
-- tabellen eine richtlinie, und row level security verweigert ohne passende
-- richtlinie alles. truncate - das einzige recht, das rls umgeht - hatte anon
-- ebenfalls nicht. es fehlte also die zweite schicht, nicht die erste.
--
-- diese migration ist bewusst von hand geschrieben und nennt jede tabelle
-- ausdruecklich: sie soll auf jeder umgebung dasselbe ergebnis liefern,
-- unabhaengig davon, was dort vorher gesetzt war.

revoke all on table public.sniper_queries from anon;
revoke all on table public.sniper_listings from anon;
revoke all on table public.sniper_query_subscriptions from anon;
revoke all on table public.sniper_hits from anon;
