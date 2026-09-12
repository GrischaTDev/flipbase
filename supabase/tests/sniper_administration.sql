\set ON_ERROR_STOP on
begin;
select plan(25);

insert into auth.users (id, email) values
 ('a0000000-0000-4000-8000-000000000001', 'sniper-admin@example.test'),
 ('a0000000-0000-4000-8000-000000000002', 'sniper-member@example.test');
insert into public.platform_operators (user_id) values ('a0000000-0000-4000-8000-000000000001');
insert into public.vinted_categories (id, title, slug, path, is_leaf) values
 (2000000001, 'Test Schuhe', 'test-schuhe', 'Test > Schuhe', true),
 (2000000002, 'Test Oberkategorie', 'test-oben', 'Test', false);
insert into public.sniper_runtime_status values (1, now(), 3, 1, 30, null);

set local role anon;
select throws_ok('select public.set_sniper_query_active(null, true)', '42501', null, 'anon darf keine Auftraege schalten');
select throws_ok('select * from public.sniper_runtime_status', '42501', null, 'anon darf den Betrieb nicht lesen');
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.upsert_sniper_query(null, 'test', null, null, null, 50, 60000, null)$$, '42501', null, 'normale Nutzer duerfen keine zentralen Auftraege erstellen');
select throws_ok('select public.set_sniper_query_active(null, true)', '42501', null, 'normale Nutzer duerfen keine Auftraege aktivieren');
select is((select count(*) from public.sniper_runtime_status), 0::bigint, 'Betriebsmeldung nur fuer Administration');
select throws_ok('select * from public.sniper_query_listing_counts()', '42501', null, 'Zentrale Fundzahlen nur fuer Administration');
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok($$select public.upsert_sniper_query(null, null, 2000000001, 53, null, 50, 60000, 'test')$$, 'Kategorie ohne Suchtext wird angenommen');
select is((select is_active from public.sniper_queries where catalog_id = 2000000001), false, 'Neuer Auftrag bleibt pausiert');
select is((select query_key from public.sniper_queries where catalog_id = 2000000001), 'vinted|search=|catalog=2000000001|brand=53|price_from=-|price_to=50', 'Kategorie-Schluessel passt zum Dienst');
select throws_ok($$select public.upsert_sniper_query(null, '', 2000000001, 53, null, 50.00, 60000, null)$$, 'P0001', 'Ein Auftrag mit diesen Filtern besteht bereits', 'Gleiche normalisierte Filter werden nicht doppelt angelegt');
select throws_ok($$select public.upsert_sniper_query(null, null, null, null, null, 50, 60000, null)$$, 'P0001', null, 'Leere Suche wird abgelehnt');
select throws_ok($$select public.upsert_sniper_query(null, null, 2000000002, null, null, 50, 60000, null)$$, 'P0001', null, 'Breite Oberkategorie wird abgelehnt');
select throws_ok($$select public.upsert_sniper_query(null, 'preis', null, null, 51, 50, 60000, null)$$, '23514', null, 'Umgekehrte Preisspanne wird abgelehnt');
select throws_ok($$select public.upsert_sniper_query(null, 'takt', null, null, null, 50, 1000, null)$$, 'P0001', null, 'Zu kurzer Takt wird abgelehnt');
select lives_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where catalog_id = 2000000001), true)$$, 'Administration kann aktivieren');
select is((select is_active from public.sniper_queries where catalog_id = 2000000001), true, 'Auftrag ist aktiv');
select throws_ok($$select public.upsert_sniper_query((select id from public.sniper_queries where catalog_id = 2000000001), 'anderer filter', 2000000001, 53, null, 50, 60000, null)$$, 'P0001', 'Fuer andere Filter bitte einen neuen Auftrag anlegen', 'Suchbereich gespeicherter Funde bleibt unveraenderlich');
select lives_ok($$select public.upsert_sniper_query((select id from public.sniper_queries where catalog_id = 2000000001), null, 2000000001, 53, null, 50, 120000, 'neu')$$, 'Takt und Notiz lassen sich bearbeiten');
select throws_ok($$update public.sniper_queries set is_active = false$$, '42501', null, 'Direktes Schreiben bleibt auch der Administration verboten');
select is((select count(*) from public.sniper_runtime_status), 1::bigint, 'Administration sieht echte Betriebsmeldung');
select lives_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where catalog_id = 2000000001), false)$$, 'Administration kann pausieren');
select is((select is_active from public.sniper_queries where catalog_id = 2000000001), false, 'Auftrag ist wieder pausiert');
reset role;
update public.sniper_queries set consecutive_failures = 3 where catalog_id = 2000000001;
update public.sniper_runtime_status set reported_at = now() - interval '5 minutes';
set local role authenticated;
select throws_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where catalog_id = 2000000001), true)$$, 'P0001', 'Keine aktuelle Betriebsmeldung. Bitte zuerst den Bot starten oder aktualisieren', 'Alte oder fehlende Botversion darf keine neuen Auftraege erhalten');
reset role;
update public.sniper_runtime_status set reported_at = now();
set local role authenticated;
select lives_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where catalog_id = 2000000001), true)$$, 'Neustart nach Fehlern ist moeglich');
select is((select consecutive_failures from public.sniper_queries where catalog_id = 2000000001), 0, 'Neustart setzt Fehlerzaehler zurueck');
select * from finish();
rollback;
