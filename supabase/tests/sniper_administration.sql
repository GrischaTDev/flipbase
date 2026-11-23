\set ON_ERROR_STOP on
begin;
select no_plan();

insert into auth.users (id, email) values
 ('a0000000-0000-4000-8000-000000000001', 'sniper-admin@example.test'),
 ('a0000000-0000-4000-8000-000000000002', 'sniper-member@example.test');
insert into public.platform_operators (user_id) values ('a0000000-0000-4000-8000-000000000001');
insert into public.sniper_runtime_status (
    id,
    reported_at,
    requests_last_minute,
    rejected_last_minute,
    request_budget,
    last_cycle_error,
    vinted_connected_since,
    vinted_last_success_at
)
values (1, now(), 3, 1, 30, null, now() - interval '1 minute', now() - interval '10 seconds');

set local role anon;
select throws_ok('select public.set_sniper_query_active(null, true)', '42501', null, 'Anonyme dürfen keine Sammelaufträge schalten');
select throws_ok('select * from public.sniper_runtime_status', '42501', null, 'Anonyme dürfen den Betriebsstatus nicht lesen');
reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.sniper_runtime_status), 0::bigint, 'Mitglieder sehen keine technischen Betriebsmeldungen');
select throws_ok('select * from public.sniper_query_listing_counts()', '42501', null, 'Mitglieder dürfen keine zentralen Fundzahlen abrufen');
reset role;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok($$select public.upsert_sniper_query(null, 'Nike', 53, 60000, null)$$, '42501', null, 'Der frühere Markenweg ist auch für Betreiber gesperrt');
select throws_ok($$select public.upsert_sniper_query(null, null, 1049, 53, null, null, 60000, null)$$, '42501', null, 'Die ältere Schreibsignatur ist ebenfalls gesperrt');
select throws_ok($$select public.save_sniper_search_filter(null,'Test',1049,'[]','{}','all',20000,null,null)$$, '42501', null, 'Betreiber können keine zentralen Filter speichern');
select throws_ok($$select public.set_sniper_query_active(null, true)$$, '42501', null, 'Betreiber können keine zentralen Filter starten');
select throws_ok($$select public.reset_sniper_search_filter_results(null, 1)$$, '42501', null, 'Betreiber können den Fundbestand eines Filters nicht zurücksetzen');
select throws_ok($$select public.delete_sniper_query(null)$$, '42501', null, 'Betreiber können keine zentralen Filter löschen');
select throws_ok('select * from public.sniper_query_listing_counts()', '42501', null, 'Die früheren zentralen Fundzahlen sind auch für Betreiber gesperrt');
select throws_ok($$update public.sniper_queries set is_active = false$$, '42501', null, 'Direktes Schreiben bleibt gesperrt');
select is((select count(*) from public.sniper_runtime_status), 1::bigint, 'Betreiber sehen die technische Betriebsmeldung');
select ok((select vinted_connected_since is not null and vinted_last_success_at is not null
           from public.sniper_runtime_status), 'Die Betriebsmeldung enthält die Laufzeitdaten für Vinted');
reset role;

select throws_ok($$insert into public.sniper_queries(query_key) values ('empty-direct-test')$$, '23514', null, 'Tabellenregel verbietet ungefilterte Sammelaufträge');
select throws_ok($$insert into public.sniper_queries(query_key, brand_id) values ('invalid-brand-direct-test', 0)$$, '23514', null, 'Die einzige Markenbedingung braucht eine gültige Kennung');

select * from finish();
rollback;
