\set ON_ERROR_STOP on
begin;
select plan(15);
insert into public.sniper_queries (id, query_key, catalog_id)
values ('89000000-0000-4000-8000-000000000001', 'retention', 89001);
insert into public.workspaces (id, name) values ('89000000-0000-4000-8000-000000000002', 'Aufbewahrung');
insert into public.sniper_query_subscriptions (id, workspace_id, query_id)
values ('89000000-0000-4000-8000-000000000003', '89000000-0000-4000-8000-000000000002', '89000000-0000-4000-8000-000000000001');
insert into public.sniper_listings (external_id, title, url, item_price, total_price, discovered_by_query_id, first_seen_at)
select 'retention-' || i, 'Test', 'https://example.test', 10, 10, '89000000-0000-4000-8000-000000000001',
       now() - interval '30 days' + (i - 3) * interval '1 second'
from generate_series(1, 4) as i;
insert into public.sniper_hits (subscription_id, listing_id, reference_price, discount_percent)
select '89000000-0000-4000-8000-000000000003', id, 20, 50 from public.sniper_listings where external_id like 'retention-%';
select is((select reference_scope from public.sniper_hits limit 1), 'legacy_query_condition', 'Bestehende Treffer behalten historische Kennzeichnung');

set local role service_role;
select is(public.sniper_purge_expired_listings(1), 1, 'Dienst loescht nur das begrenzte Paket');
reset role;
select ok(not exists(select 1 from public.sniper_listings where external_id = 'retention-1'), 'Aeltester Fund zuerst geloescht');
select is((select count(*)::integer from public.sniper_hits), 3, 'Zugehoeriger Treffer wird mitgeloescht');
select is(public.sniper_purge_expired_listings(), 1, 'Naechster Aufruf holt den Rest nach');
select is((select count(*)::integer from public.sniper_listings where external_id in ('retention-3','retention-4')), 2, 'Genau 30 Tage und neuere Funde bleiben erhalten');
select is(public.sniper_purge_expired_listings(), 0, 'Leerer Folgelauf ist folgenlos');
select ok(exists(select 1 from public.sniper_queries where query_key = 'retention') and exists(select 1 from public.sniper_query_subscriptions where id = '89000000-0000-4000-8000-000000000003'), 'Auftrag und Abonnement bleiben erhalten');
select throws_ok('select public.sniper_purge_expired_listings(0)', '22023', null, 'Ungueltige Paketgroesse abgelehnt');
select throws_ok('select public.sniper_purge_expired_listings(5001)', '22023', null, 'Unbegrenztes Loeschen ausgeschlossen');
select ok(not has_function_privilege('anon', 'public.sniper_purge_expired_listings(integer)', 'execute'), 'Anonyme duerfen nicht bereinigen');
select ok(not has_function_privilege('authenticated', 'public.sniper_purge_expired_listings(integer)', 'execute'), 'Nutzer duerfen nicht bereinigen');
select throws_ok('select public.sniper_purge_expired_listings(null)', '22023', null, 'Null darf das Loeschlimit nicht aufheben');
select ok(not has_table_privilege('authenticated', 'public.sniper_runtime_status', 'truncate'), 'Betriebsmeldungen duerfen nicht geleert werden');
select ok(not has_table_privilege('authenticated', 'public.sniper_runtime_status', 'update'), 'Betriebsmeldungen bleiben fuer Nutzer schreibgeschuetzt');
select * from finish();
rollback;
