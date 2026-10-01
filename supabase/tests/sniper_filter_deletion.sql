\set ON_ERROR_STOP on
begin;
select no_plan();

insert into auth.users (id, email) values
 ('a1000000-0000-4000-8000-000000000001', 'filter-delete-admin@example.test'),
 ('a1000000-0000-4000-8000-000000000002', 'filter-delete-member@example.test');
insert into public.platform_operators (user_id) values ('a1000000-0000-4000-8000-000000000001');
insert into public.sniper_queries (id, query_key, title, brand_id, is_active, is_seeded)
values ('a1000000-0000-4000-8000-000000000003', 'vinted|search=|catalog=-|brand=53|price_from=-|price_to=-', 'Nike', 53, true, true);
insert into public.sniper_listings (id, external_id, title, url, item_price, total_price, discovered_by_query_id)
values ('a1000000-0000-4000-8000-000000000004', 'delete-test-listing', 'Vorhandener Fund', 'https://example.test/1', 10, 12, 'a1000000-0000-4000-8000-000000000003');
insert into public.sniper_runtime_status (id, reported_at, requests_last_minute, rejected_last_minute, request_budget)
values (1, now(), 0, 0, 30);

set local role anon;
select throws_ok($$select public.delete_sniper_query('a1000000-0000-4000-8000-000000000003')$$, '42501', null, 'anon darf keine Filter entfernen');
reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.delete_sniper_query('a1000000-0000-4000-8000-000000000003')$$, '42501', null, 'normale Nutzer duerfen keine zentralen Filter entfernen');
reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok($$select public.delete_sniper_query('a1000000-0000-4000-8000-000000000003')$$, 'Administration entfernt einen aktiven Filter');
select ok((select deleted_at is not null and not is_active from public.sniper_queries where id = 'a1000000-0000-4000-8000-000000000003'), 'entfernter Filter ist gespeichert und inaktiv');
select throws_ok($$select public.set_sniper_query_active('a1000000-0000-4000-8000-000000000003', true)$$, 'P0001', 'Sammelauftrag nicht gefunden', 'entfernter Filter kann nicht direkt aktiviert werden');
select throws_ok($$select public.upsert_sniper_query('a1000000-0000-4000-8000-000000000003', 'Nike', 53, 20000, null)$$, 'P0001', 'Sammelauftrag nicht gefunden', 'entfernter Filter kann nicht ueber eine alte Maske bearbeitet werden');
select throws_ok($$select public.delete_sniper_query('a1000000-0000-4000-8000-000000000003')$$, 'P0001', 'Sammelauftrag nicht gefunden', 'doppeltes Entfernen meldet keinen falschen Erfolg');
reset role;
select is((select discovered_by_query_id from public.sniper_listings where id = 'a1000000-0000-4000-8000-000000000004'), 'a1000000-0000-4000-8000-000000000003'::uuid, 'vorhandener Fund und seine Herkunft bleiben erhalten');
select lives_ok($$insert into public.sniper_listings (external_id, title, url, item_price, total_price, discovered_by_query_id) values ('delete-in-flight', 'Laufender Fund', 'https://example.test/2', 10, 12, 'a1000000-0000-4000-8000-000000000003')$$, 'bereits laufende Abfrage kann noch sicher abschliessen');
select throws_ok($$update public.sniper_queries set is_active = true where id = 'a1000000-0000-4000-8000-000000000003'$$, '23514', null, 'Tabellenregel verhindert Aktivieren eines entfernten Filters');
set local role authenticated;
select is(public.upsert_sniper_query(null, 'Nike neu', 53, 30000, 'Neue Auswahl'), 'a1000000-0000-4000-8000-000000000003'::uuid, 'erneute Auswahl verwendet dieselbe Herkunft');
select ok((select deleted_at is null and not is_active and is_seeded and title = 'Nike neu' and poll_interval_ms = 30000 from public.sniper_queries where id = 'a1000000-0000-4000-8000-000000000003'), 'erneute Auswahl startet pausiert und erhaelt den Einlesestand');
select lives_ok($$select public.set_sniper_query_active('a1000000-0000-4000-8000-000000000003', true)$$, 'erneut angelegter Filter kann aktiviert werden');
select throws_ok($$update public.sniper_queries set deleted_at = now()$$, '42501', null, 'direktes Loeschen bleibt der Administration verboten');
select * from finish();
rollback;
