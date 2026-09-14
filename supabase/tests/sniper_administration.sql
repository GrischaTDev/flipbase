\set ON_ERROR_STOP on
begin;
select no_plan();

insert into auth.users (id, email) values
 ('a0000000-0000-4000-8000-000000000001', 'sniper-admin@example.test'),
 ('a0000000-0000-4000-8000-000000000002', 'sniper-member@example.test');
insert into public.platform_operators (user_id) values ('a0000000-0000-4000-8000-000000000001');
insert into public.sniper_runtime_status values (1, now(), 3, 1, 30, null);

set local role anon;
select throws_ok('select public.set_sniper_query_active(null, true)', '42501', null, 'anon darf keine Auftraege schalten');
select throws_ok('select * from public.sniper_runtime_status', '42501', null, 'anon darf den Betrieb nicht lesen');
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.upsert_sniper_query(null, 'Test', 53, 60000, null)$$, '42501', null, 'normale Nutzer duerfen keine zentralen Markenfilter erstellen');
select throws_ok('select public.set_sniper_query_active(null, true)', '42501', null, 'normale Nutzer duerfen keine Markenfilter aktivieren');
select is((select count(*) from public.sniper_runtime_status), 0::bigint, 'Betriebsmeldung nur fuer Administration');
select throws_ok('select * from public.sniper_query_listing_counts()', '42501', null, 'Zentrale Fundzahlen nur fuer Administration');
reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok($$select public.upsert_sniper_query(null, 'Nike', 53, 60000, 'Sportmarke')$$, 'Administration kann einen Markenfilter anlegen');
select is((select title from public.sniper_queries where brand_id = 53), 'Nike', 'Der Filtername wird gespeichert');
select is((select is_active from public.sniper_queries where brand_id = 53), false, 'Neuer Markenfilter bleibt pausiert');
select is((select query_key from public.sniper_queries where brand_id = 53), 'vinted|search=|catalog=-|brand=53|price_from=-|price_to=-', 'Marken-Schluessel passt zum Sammler');
select is((select count(*) from pg_proc where oid = to_regprocedure('public.upsert_sniper_query(uuid,text,integer,integer,numeric,numeric,integer,text)')), 0::bigint, 'Die alte Schreibsignatur ist entfernt');
select throws_ok($$select public.upsert_sniper_query(null, 'Nike erneut', 53, 60000, null)$$, 'P0001', 'Ein Markenfilter fuer diese Marke besteht bereits', 'Gleiche Marke wird nicht doppelt angelegt');
select throws_ok($$select public.upsert_sniper_query(null, '  ', 14, 60000, null)$$, 'P0001', 'Bitte einen Filtername angeben', 'Leerer Filtername wird abgelehnt');
select throws_ok($$select public.upsert_sniper_query(null, 'Adidas', 0, 60000, null)$$, 'P0001', 'Ungueltige Markenkennung', 'Ungueltige Markenkennung wird abgelehnt');
select throws_ok($$select public.upsert_sniper_query(null, 'Adidas', 14, 1000, null)$$, 'P0001', 'Der Takt muss zwischen 10 Sekunden und 24 Stunden liegen', 'Zu kurzer Takt wird abgelehnt');
select throws_ok($$select public.upsert_sniper_query(null, repeat('x', 101), 14, 60000, null)$$, 'P0001', 'Der Filtername darf hoechstens 100 Zeichen lang sein', 'Zu langer Filtername wird abgelehnt');
select throws_ok($$select public.upsert_sniper_query(null, 'Adidas', 14, 60000, repeat('x', 2001))$$, 'P0001', 'Die Notiz darf hoechstens 2.000 Zeichen lang sein', 'Zu lange Notiz wird abgelehnt');
select lives_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where brand_id = 53), true)$$, 'Administration kann einen Markenfilter aktivieren');
select is((select is_active from public.sniper_queries where brand_id = 53), true, 'Markenfilter ist aktiv');
select lives_ok($$select public.upsert_sniper_query((select id from public.sniper_queries where brand_id = 53), 'Nike Premium', 53, 120000, 'Neue Notiz')$$, 'Name, Takt und Notiz lassen sich bearbeiten');
select is((select title from public.sniper_queries where brand_id = 53), 'Nike Premium', 'Bearbeiteter Filtername wird gespeichert');
select is((select poll_interval_ms from public.sniper_queries where brand_id = 53), 120000, 'Bearbeiteter Takt wird gespeichert');
select is((select notes from public.sniper_queries where brand_id = 53), 'Neue Notiz', 'Bearbeitete Notiz wird gespeichert');
select throws_ok($$select public.upsert_sniper_query((select id from public.sniper_queries where brand_id = 53), 'Andere Marke', 14, 60000, null)$$, 'P0001', 'Nur reine Markenfilter koennen bearbeitet werden', 'Marke eines vorhandenen Filters bleibt fest');
select throws_ok($$update public.sniper_queries set is_active = false$$, '42501', null, 'Direktes Schreiben bleibt auch der Administration verboten');
select is((select count(*) from public.sniper_runtime_status), 1::bigint, 'Administration sieht echte Betriebsmeldung');
select lives_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where brand_id = 53), false)$$, 'Administration kann pausieren');
select is((select is_active from public.sniper_queries where brand_id = 53), false, 'Markenfilter ist wieder pausiert');
reset role;
update public.sniper_queries set consecutive_failures = 3 where brand_id = 53;
update public.sniper_runtime_status set reported_at = now() - interval '5 minutes';
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where brand_id = 53), true)$$, 'P0001', 'Keine aktuelle Betriebsmeldung. Bitte zuerst den Bot starten oder aktualisieren', 'Alte Betriebsmeldung darf keinen Filter starten');
reset role;
update public.sniper_runtime_status set reported_at = now();
set local role authenticated;
select lives_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where brand_id = 53), true)$$, 'Neustart nach Fehlern ist moeglich');
select is((select consecutive_failures from public.sniper_queries where brand_id = 53), 0, 'Neustart setzt Fehlerzaehler zurueck');
select lives_ok($$select public.upsert_sniper_query(null, 'adidas', 14, 10000, null)$$, 'Ein weiterer Markenfilter kann ergaenzt werden');
select lives_ok($$select public.upsert_sniper_query(null, 'Ralph Lauren', 88, 10000, null)$$, 'Ein dritter Markenfilter kann ergaenzt werden');
select is((select count(*) from public.sniper_queries where brand_id in (53, 14, 88)), 3::bigint, 'Je Marke genau ein zentraler Filter besteht');
select ok((select bool_and(search_text is null and catalog_id is null and price_from is null and price_to is null and not is_active)
           from public.sniper_queries where brand_id in (14, 88)), 'Neue Filter enthalten keine weiteren Suchkriterien und bleiben pausiert');
select is((select count(*) from public.sniper_queries where brand_id is null), 0::bigint, 'Der zentrale Markenbestand enthält keine ungefilterte Suche');
reset role;
select throws_ok($$insert into public.sniper_queries(query_key) values ('empty-direct-test')$$, '23514', null, 'Tabellenregel verbietet vollstaendig ungefilterte Auftraege');
select throws_ok($$insert into public.sniper_queries(query_key, brand_id) values ('invalid-brand-direct-test', 0)$$, '23514', null, 'Tabellenregel akzeptiert keine ungueltige Marke als einzigen Filter');
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.upsert_sniper_query(null, 'Puma', 99, 10000, null)$$, '42501', null, 'Markenfilter bleiben auf die Administration beschraenkt');
select * from finish();
rollback;
