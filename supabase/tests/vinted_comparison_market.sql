\set ON_ERROR_STOP on
\if :{?COMPARISON_SAFEUPDATE}
load 'safeupdate';
\endif
begin;
select no_plan();

\if :{?COMPARISON_SAFEUPDATE}
select throws_ok($$update public.vinted_comparison_scopes set maintenance_at=now()$$,
    null, 'UPDATE requires a WHERE clause', 'Der Produktionsschutz gegen unbedingte Updates bleibt eingeschaltet');
\endif

-- Alle Änderungen bleiben in dieser zurückgerollten Testtransaktion.
update public.sniper_queries set is_active = false where is_active;
insert into auth.users(id, email) values
    ('56000000-0000-4000-8000-000000000101', 'comparison-admin@example.test'),
    ('56000000-0000-4000-8000-000000000102', 'comparison-member@example.test');
insert into public.platform_operators(user_id) values ('56000000-0000-4000-8000-000000000101');
insert into public.vinted_categories(id, parent_id, title, slug, path, is_leaf)
values (5600001, null, 'Fleece', 'comparison-test-fleece', 'Fleece', true);
insert into public.sniper_queries(id, query_key, title, catalog_id, brand_ids, brand_names,
    title_keywords, price_from, price_to, is_active, filter_format_version)
values
    ('56000000-0000-4000-8000-000000000001', 'comparison-test-primary', 'Vergleich A', 5600001,
        array[362], array['Carhartt'], array['fleece'], 15, 50, true, 1),
    ('56000000-0000-4000-8000-000000000002', 'comparison-test-overlap', 'Vergleich B', 5600001,
        array[362], array['Carhartt'], array['sherpa'], 10, 40, true, 1),
    ('56000000-0000-4000-8000-000000000003', 'comparison-test-paused', 'Vergleich pausiert', 5600001,
        array[362], array['Carhartt'], array['jacket'], null, null, false, 1);

create temporary table comparison_test_tasks(name text primary key, task jsonb);
grant select, insert, update, delete on comparison_test_tasks to service_role, authenticated;

create function pg_temp.catalog_result(p_items jsonb, p_page integer default 1)
returns jsonb language sql security invoker set search_path = '' as $$
    select jsonb_build_object('kind', 'catalog', 'observed_at', now(), 'page', p_page,
        'sourceItemCount', jsonb_array_length(p_items), 'items', p_items,
        'pagination', jsonb_build_object('currentPage', p_page, 'perPage', 96,
            'totalPages', p_page, 'totalEntries', jsonb_array_length(p_items)),
        'requestIndex', 0, 'requestCount', 1);
$$;
create function pg_temp.detail_result(p_external_id text, p_status text, p_price numeric default 65,
    p_earliest timestamptz default now() - interval '2 days',
    p_latest timestamptz default now() - interval '2 days')
returns jsonb language sql security invoker set search_path = '' as $$
    select jsonb_build_object('kind', 'detail', 'observed_at', now(), 'item',
        jsonb_build_object('externalId', p_external_id, 'title', 'Carhartt fleece',
            'price', p_price, 'currency', 'EUR', 'brand', 'Carhartt', 'categoryId', '5600001',
            'categoryPath', jsonb_build_array('Fleece'), 'size', 'L', 'condition', 'Sehr gut',
            'color', 'Creme', 'material', 'Polyester', 'model', 'Prentis Liner', 'status', p_status,
            'publication', jsonb_build_object('earliest', p_earliest, 'latest', p_latest, 'label', '2 Tage')));
$$;
grant execute on function pg_temp.catalog_result(jsonb, integer),
    pg_temp.detail_result(text, text, numeric, timestamptz, timestamptz) to service_role;

set local role service_role;
insert into comparison_test_tasks values ('catalog_a', public.claim_vinted_comparison_task(now()));
insert into comparison_test_tasks values ('catalog_b', public.claim_vinted_comparison_task(now()));
select is((select task->>'kind' from comparison_test_tasks where name = 'catalog_a'), 'catalog', 'Der Erstimport beginnt mit einer Katalogseite');
select is((select task->>'kind' from comparison_test_tasks where name = 'catalog_b'), 'catalog', 'Der nächste Claim übernimmt einen anderen freien Bereich');
select isnt((select task->>'id' from comparison_test_tasks where name = 'catalog_a'),
    (select task->>'id' from comparison_test_tasks where name = 'catalog_b'), 'Eine laufende Lease wird nicht doppelt vergeben');
select is(public.claim_vinted_comparison_task(now()), null::jsonb, 'Bei ausschließlich belegten Bereichen wird kein Auftrag doppelt geliefert');
reset role;
update public.vinted_comparison_scopes
set maintenance_at=case when query_id='56000000-0000-4000-8000-000000000001'
    then now()-interval '2 hours' else now()-interval '30 minutes' end
where query_id in ('56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000002');
set local role service_role;
select is(public.claim_vinted_comparison_task(now()), null::jsonb,
    'Die stündliche Pflege läuft mit Produktionsschutz auch bei belegten Leases');
select is((select count(*) from public.vinted_comparison_scopes where maintenance_at=now()),2::bigint,
    'Die gemeinsame Pflege markiert überfällige und frische Bereiche mit demselben Zeitpunkt');
select is((select count(*) from public.vinted_comparison_scopes where query_id = '56000000-0000-4000-8000-000000000003'), 0::bigint, 'Pausierte Filter erzeugen keinen Erstimport');
select is((select task->'query'->'priceFrom' from comparison_test_tasks where name = 'catalog_a'), 'null'::jsonb, 'Vergleichsauftrag enthält keine Preisuntergrenze');
select is((select task->'query'->'priceTo' from comparison_test_tasks where name = 'catalog_a'), 'null'::jsonb, 'Vergleichsauftrag enthält keine Preisobergrenze');
select is((select (task->>'window_start')::timestamptz from comparison_test_tasks where name = 'catalog_a'), now() - interval '7 days', 'Erstimport besitzt ein festes Sieben-Tage-Fenster');
select is((select price_to from public.sniper_queries where id = '56000000-0000-4000-8000-000000000001'), 50::numeric, 'Der ursprüngliche Einkaufsfilter bleibt unverändert');

select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'catalog_a'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'catalog_a'),
    pg_temp.catalog_result('[{"externalId":"56000001","url":"https://www.vinted.de/items/56000001-fleece","title":"Carhartt fleece","brand":"Carhartt","size":"L","condition":"Sehr gut","price":60,"currency":"EUR"}]')),
    true, 'Erste Katalogseite speichert auch einen Preis über der Einkaufsgrenze');
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'catalog_b'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'catalog_b'),
    pg_temp.catalog_result('[{"externalId":"56000001","url":"https://www.vinted.de/items/56000001-fleece","title":"Carhartt fleece","brand":"Carhartt","size":"L","condition":"Sehr gut","price":55,"currency":"EUR"}]')),
    true, 'Überlappende Vergleichssuche aktualisiert denselben Artikel');
select is((select count(*) from public.vinted_comparison_items where external_id = '56000001'), 1::bigint, 'Überlappende Kategorien vervielfachen den Preisbeleg nicht');
select is((select count(*) from public.vinted_comparison_matches where item_id = (select id from public.vinted_comparison_items where external_id = '56000001')), 2::bigint, 'Beide Bereichszuordnungen bleiben erhalten');
select is((select price from public.vinted_comparison_items where external_id = '56000001'), 55::numeric, 'Wiederfunde aktualisieren den sichtbaren Preis');
select is((select status from public.vinted_comparison_items where external_id = '56000001'), 'unknown', 'Katalogsichtbarkeit wird nicht als verifizierte Kaufbarkeit ausgegeben');
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'catalog_a'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'catalog_a'), pg_temp.catalog_result('[]')),
    false, 'Eine bereits abgeschlossene Katalogantwort wird nicht erneut übernommen');

insert into comparison_test_tasks values ('detail_old', public.claim_vinted_comparison_task(now()));
select is((select task->>'kind' from comparison_test_tasks where name = 'detail_old'), 'detail', 'Nach dem Katalog folgt die artikelbezogene Status- und Datumsprüfung');
select is((select task->>'external_id' from comparison_test_tasks where name = 'detail_old'), '56000001', 'Detailauftrag verweist auf die bekannte Artikelkennung');
select throws_ok($$select public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_old'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_old'),
    pg_temp.detail_result('99999999', 'sold'))$$, '22023', null, 'Fremde Artikelkennung kann keinen Verkaufsstatus setzen');
select throws_ok($$select public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_old'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_old'),
    pg_temp.detail_result('56000001', 'active', 65, now() - interval '2 days', now() + interval '1 day'))$$,
    '22023', null, 'Zukünftige Veröffentlichungsgrenze wird abgewiesen');
select throws_ok($$select public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_old'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_old'),
    pg_temp.detail_result('56000001', 'active', 65, null, now() - interval '2 days'))$$,
    '22023', null, 'Einseitige Datumsintervalle werden nicht gespeichert');
reset role;
update public.vinted_comparison_items set lease_until = now() - interval '1 second' where external_id = '56000001';
set local role service_role;
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_old'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_old'), pg_temp.detail_result('56000001', 'sold')),
    false, 'Abgelaufene Detaillease kann keinen Verkauf speichern');
select is(public.fail_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_old'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_old'), now() + interval '1 hour', 'timeout', 'Test'),
    false, 'Abgelaufene Fehlerantwort kann keinen neuen Abruf verzögern');
insert into comparison_test_tasks values ('detail_current', public.claim_vinted_comparison_task(now()));
select isnt((select task->>'lease_token' from comparison_test_tasks where name = 'detail_old'),
    (select task->>'lease_token' from comparison_test_tasks where name = 'detail_current'), 'Wiederaufnahme verwendet einen neuen Leasetoken');
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_old'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_old'), pg_temp.detail_result('56000001', 'sold')),
    false, 'Verspätete alte Antwort überschreibt keine neu vergebene Lease');
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_current'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_current'), pg_temp.detail_result('56000001', 'active')),
    true, 'Gültige aktuelle Detailprüfung wird übernommen');
select is((select status from public.vinted_comparison_items where external_id = '56000001'), 'active', 'Geprüfte Kaufbarkeit ist aktiv');
select is((select price from public.vinted_comparison_items where external_id = '56000001'), 65::numeric, 'Detailprüfung übernimmt den aktuellen Artikelpreis');
select is((select last_active_at from public.vinted_comparison_items where external_id = '56000001'), now(), 'Letzte aktive Beobachtung ist separat gespeichert');
select is((select published_earliest from public.vinted_comparison_items where external_id = '56000001'), now() - interval '2 days', 'Belegte Veröffentlichung wird separat vom Erstfund geführt');

reset role;
update public.vinted_comparison_items set next_attempt_at = now() where external_id = '56000001';
set local role service_role;
insert into comparison_test_tasks values ('detail_reserved', public.claim_vinted_comparison_task(now()));
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_reserved'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_reserved'), pg_temp.detail_result('56000001', 'unknown')),
    true, 'Reservierter oder versteckter Artikel bleibt ohne Verkaufsbeleg unbekannt');
select is((select sold_detected_at from public.vinted_comparison_items where external_id = '56000001'), null::timestamptz, 'Unbekannter Status erzeugt keine Verkaufszeit');
reset role;
update public.vinted_comparison_items set next_attempt_at = now() where external_id = '56000001';
set local role service_role;
insert into comparison_test_tasks values ('detail_sold', public.claim_vinted_comparison_task(now()));
select is((select task->>'external_id' from comparison_test_tasks where name = 'detail_sold'), '56000001', 'Unbekannter Status wird erneut geprüft statt dauerhaft verworfen');
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_sold'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_sold'), pg_temp.detail_result('56000001', 'sold')),
    true, 'Explizite Verkaufsmarkierung wird übernommen');
select is((select sold_detected_at from public.vinted_comparison_items where external_id = '56000001'), now(), 'Gespeichert wird die Erkennungszeit des Verkaufs');
select is(public.claim_vinted_comparison_task(now()), null::jsonb, 'Verkaufte Artikel werden ohne neuen Anlass nicht dauerhaft nachgeprüft');

reset role;
update public.vinted_comparison_scopes set next_attempt_at = now()
where id = split_part((select task->>'id' from comparison_test_tasks where name = 'catalog_a'), ':', 2)::bigint;
set local role service_role;
insert into comparison_test_tasks values ('catalog_missing', public.claim_vinted_comparison_task(now()));
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'catalog_missing'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'catalog_missing'),
    pg_temp.catalog_result('[{"externalId":"56000002","url":"https://www.vinted.de/items/56000002-fleece","title":"Carhartt fleece","brand":"Carhartt","size":"L","condition":"Sehr gut","price":75,"currency":"EUR"}]')),
    true, 'Weitere Katalogrunde ergänzt einen neuen Artikel');
insert into comparison_test_tasks values ('detail_missing', public.claim_vinted_comparison_task(now()));
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'detail_missing'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'detail_missing'),
    pg_temp.detail_result('56000002', 'unavailable', null, null, null)), true, '404 oder 410 wird als fehlende Quelle gespeichert');
select is((select status from public.vinted_comparison_items where external_id = '56000002'), 'unavailable', 'Fehlende Quelle bleibt von verkauft getrennt');
select is((select sold_detected_at from public.vinted_comparison_items where external_id = '56000002'), null::timestamptz, 'Fehlende Quelle erhält keine Verkaufsmarkierung');
select is(public.claim_vinted_comparison_task(now()), null::jsonb, 'Fehlende Quellen werden ohne Wiederfund nicht erneut angefragt');

reset role;
update public.vinted_comparison_scopes set next_attempt_at = now()
where id = split_part((select task->>'id' from comparison_test_tasks where name = 'catalog_a'), ':', 2)::bigint;
set local role service_role;
insert into comparison_test_tasks values ('catalog_revision_old', public.claim_vinted_comparison_task(now()));
reset role;
update public.sniper_queries set title_keywords = array['jacket']
where id = (select (task->>'query_id')::uuid from comparison_test_tasks where name = 'catalog_revision_old');
set local role service_role;
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'catalog_revision_old'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'catalog_revision_old'), pg_temp.catalog_result('[]')),
    false, 'Filteränderung verwirft eine bereits laufende alte Katalogantwort');
insert into comparison_test_tasks values ('catalog_revision_new', public.claim_vinted_comparison_task(now()));
select is((select (task->>'query_revision')::integer from comparison_test_tasks where name = 'catalog_revision_new'),
    (select filter_revision from public.sniper_queries where id = (select (task->>'query_id')::uuid from comparison_test_tasks where name = 'catalog_revision_new')),
    'Neuer Vergleichsauftrag verwendet die aktuelle Filterrevision');
select is((select count(*) from public.vinted_comparison_matches where scope_id = split_part((select task->>'id' from comparison_test_tasks where name = 'catalog_revision_new'), ':', 2)::bigint),
    0::bigint, 'Neue Filterbedingungen übernehmen keine alten Artikelzuordnungen');
reset role;
update public.sniper_queries set is_active = false where id in (
    '56000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000002');
set local role service_role;
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'catalog_revision_new'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'catalog_revision_new'), pg_temp.catalog_result('[]')),
    false, 'Pausieren verhindert die Übernahme einer bereits laufenden Antwort');
select is(public.claim_vinted_comparison_task(now()), null::jsonb, 'Pausierte Filter erhalten keine weiteren Netzwerkaufträge');
reset role;

insert into public.vinted_comparison_items(external_id,url,title,price,status,first_seen_at,checked_at,sold_detected_at)
values
    ('56000011','https://www.vinted.de/items/56000011-old-sale','Alt verkauft',20,'sold',now()-interval '60 days',now()-interval '31 days',now()-interval '31 days'),
    ('56000012','https://www.vinted.de/items/56000012-recent-sale','Aktuell verkauft',20,'sold',now()-interval '60 days',now()-interval '1 day',now()-interval '1 day'),
    ('56000013','https://www.vinted.de/items/56000013-expired','Beobachtung abgelaufen',20,'unknown',now()-interval '91 days',now(),null),
    ('56000014','https://www.vinted.de/items/56000014-missing','Fehlend',20,'unavailable',now()-interval '10 days',now()-interval '8 days',null),
    ('56000015','https://www.vinted.de/items/56000015-active','Noch aktiv',20,'active',now()-interval '80 days',now(),null),
    ('56000016','https://www.vinted.de/items/56000016-late-sale','Spät verkauft',20,'sold',now()-interval '100 days',now()-interval '1 day',now()-interval '1 day');
set local role service_role;
select is(public.claim_vinted_comparison_task(now()), null::jsonb, 'Bereinigung benötigt keinen aktiven Netzwerkauftrag');
select is((select count(*) from public.vinted_comparison_items where external_id in ('56000011','56000013','56000014')), 0::bigint, 'Abgelaufene Verkäufe, fehlende Quellen und überlange Beobachtung werden bereinigt');
select is((select count(*) from public.vinted_comparison_items where external_id in ('56000012','56000015','56000016')), 3::bigint, 'Aktueller Verkauf zählt nach Verkaufsbeobachtung, nicht nach altem Erstfund');
reset role;

-- Der reale Feed-Schreibpfad ergänzt den Bestand, während Marktpreise keine Einkaufsgrenze erben.
insert into public.sniper_queries(id, query_key, title, catalog_id, brand_ids, brand_names,
    price_from, price_to, is_active, filter_format_version)
values ('56000000-0000-4000-8000-000000000004', 'comparison-test-statistics', 'Vergleich Statistik',
    5600001, array[362], array['Carhartt'], 15, 50, true, 1);
set local role service_role;
insert into comparison_test_tasks values ('stats_catalog', public.claim_vinted_comparison_task(now()));
select is((public.complete_sniper_search_filter_run('56000000-0000-4000-8000-000000000004', 1, 0,
    '[{"external_id":"56000100","title":"Carhartt Prentis Liner","url":"https://www.vinted.de/items/56000100-target","item_price":30,"total_price":32.2,"currency":"EUR","brand":"Carhartt","size":"L","condition":"Sehr gut"}]')->>'created')::integer,
    1, 'Ein neuer Feedfund wird über den unveränderten Schreibpfad angelegt');
select is((select count(*) from public.vinted_comparison_items where external_id = '56000100'), 1::bigint, 'Der Feedfund wird automatisch in den Vergleichsbestand übernommen');
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name = 'stats_catalog'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name = 'stats_catalog'),
    pg_temp.catalog_result('[
        {"externalId":"56000101","url":"https://www.vinted.de/items/56000101-low","title":"Carhartt Prentis Liner","brand":"Carhartt","size":"L","condition":"Sehr gut","price":10,"currency":"EUR"},
        {"externalId":"56000102","url":"https://www.vinted.de/items/56000102-middle","title":"Carhartt Prentis Liner","brand":"Carhartt","size":"XL","condition":"Sehr gut","price":20,"currency":"EUR"},
        {"externalId":"56000103","url":"https://www.vinted.de/items/56000103-high","title":"Carhartt Prentis Liner","brand":"Carhartt","size":"L","condition":"Gut","price":1000000,"currency":"EUR"}
    ]')), true, 'Katalogimport umfasst günstige und hohe Preise ohne Einkaufsgrenzen');
select is((select price from public.vinted_comparison_items where external_id = '56000103'), 1000000::numeric, 'Keine versteckte fachliche Preisobergrenze wird angewendet');
reset role;
update public.vinted_comparison_items set status = 'active', checked_at = now(), last_active_at = now(),
    category_id = 5600001, published_earliest = now()-interval '2 days', published_latest = now()-interval '2 days'
where external_id in ('56000100', '56000101', '56000102', '56000103');
set local role service_role;
insert into comparison_test_tasks values ('stats_initial', public.vinted_comparison_market(
    (select id from public.sniper_listings where external_id = '56000100'), 'Carhartt WIP', 5600001, null));
select is((select task->>'initialImportStatus' from comparison_test_tasks where name = 'stats_initial'), 'complete', 'Abgearbeiteter Erstimport mit belegten Artikeln ist vollständig');
select is((select (task->'active'->>'count')::integer from comparison_test_tasks where name = 'stats_initial'), 3, 'Der Zielartikel selbst wird nicht als Vergleich mitgezählt');
select is((select (task->'active'->>'median')::numeric from comparison_test_tasks where name = 'stats_initial'), 20::numeric, 'Median basiert auf allen passenden Angebotspreisen');
select is((select (task->'active'->>'lowerQuartile')::numeric from comparison_test_tasks where name = 'stats_initial'), 15::numeric, 'Unteres Quartil wird korrekt interpoliert');
select is((select (task->'active'->>'upperQuartile')::numeric from comparison_test_tasks where name = 'stats_initial'), 500010::numeric, 'Hoher Preis bleibt sichtbar statt als Ausreißer still gelöscht zu werden');
reset role;

-- Ein nicht mehr vorhandenes Inserat wird aus Statistik und Vollständigkeitsbewertung ignoriert.
insert into public.vinted_comparison_items(external_id,url,title,price,brand,category_id,status,checked_at)
values ('56000104','https://www.vinted.de/items/56000104-missing','Carhartt fleece',80,'Carhartt',5600001,'unavailable',now());
insert into public.vinted_comparison_matches(scope_id,item_id)
select split_part((select task->>'id' from comparison_test_tasks where name = 'stats_catalog'), ':', 2)::bigint, id
from public.vinted_comparison_items where external_id = '56000104';
set local role service_role;
select is(public.vinted_comparison_market((select id from public.sniper_listings where external_id = '56000100'),
    'Carhartt',5600001,null)->>'initialImportStatus', 'complete', 'Geprüft fehlende Quellen machen den Erstimport nicht dauerhaft unvollständig');
reset role;

-- Grenz- und Ausschlussfälle für das feste Importfenster und die laufende Auswertung.
insert into public.vinted_comparison_items(external_id,url,title,price,brand,category_id,size,condition,
    status,checked_at,last_active_at,sold_detected_at,published_earliest,published_latest)
values
    ('56000105','https://www.vinted.de/items/56000105-sale','Carhartt Prentis Liner',30,'Carhartt',5600001,'XL','Sehr gut',
        'sold',now(),now()-interval '3 days',now()-interval '1 day',now()-interval '4 days',now()-interval '4 days'),
    ('56000106','https://www.vinted.de/items/56000106-sale','Carhartt Prentis Liner',50,'Carhartt',5600001,'L','Gut',
        'sold',now(),now()-interval '3 days',now()-interval '1 day',now()-interval '4 days',now()-interval '4 days'),
    ('56000107','https://www.vinted.de/items/56000107-unknown','Carhartt fleece',900,'Carhartt',5600001,'L','Sehr gut',
        'unknown',now(),null,null,now()-interval '2 days',now()-interval '2 days'),
    ('56000108','https://www.vinted.de/items/56000108-stale','Carhartt fleece',900,'Carhartt',5600001,'L','Sehr gut',
        'active',now()-interval '3 days',now()-interval '3 days',null,now()-interval '4 days',now()-interval '4 days'),
    ('56000109','https://www.vinted.de/items/56000109-brand','Adidas fleece',900,'Adidas',5600001,'L','Sehr gut',
        'active',now(),now(),null,now()-interval '2 days',now()-interval '2 days'),
    ('56000110','https://www.vinted.de/items/56000110-category','Carhartt fleece',900,'Carhartt',999999,'L','Sehr gut',
        'active',now(),now(),null,now()-interval '2 days',now()-interval '2 days'),
    ('56000111','https://www.vinted.de/items/56000111-old','Carhartt fleece',900,'Carhartt',5600001,'L','Sehr gut',
        'active',now(),now(),null,now()-interval '8 days',now()-interval '8 days'),
    ('56000112','https://www.vinted.de/items/56000112-boundary','Carhartt fleece',900,'Carhartt',5600001,'L','Sehr gut',
        'active',now(),now(),null,now()-interval '8 days',now()-interval '6 days'),
    ('56000113','https://www.vinted.de/items/56000113-undated','Carhartt fleece',900,'Carhartt',5600001,'L','Sehr gut',
        'active',now(),now(),null,null,null),
    ('56000114','https://www.vinted.de/items/56000114-old-sale','Carhartt fleece',900,'Carhartt',5600001,'L','Sehr gut',
        'sold',now(),now()-interval '32 days',now()-interval '31 days',now()-interval '4 days',now()-interval '4 days');
insert into public.vinted_comparison_matches(scope_id,item_id)
select split_part((select task->>'id' from comparison_test_tasks where name = 'stats_catalog'), ':', 2)::bigint, id
from public.vinted_comparison_items where external_id between '56000105' and '56000114';
set local role service_role;
insert into comparison_test_tasks values ('stats_filtered', public.vinted_comparison_market(
    (select id from public.sniper_listings where external_id = '56000100'), 'Carhartt', 5600001, 'Prentis Liner'));
select is((select (task->'active'->>'count')::integer from comparison_test_tasks where name = 'stats_filtered'), 3, 'Unbekannte, alte, grenzüberschreitende und fachfremde Belege beeinflussen die aktive Statistik nicht');
select is((select (task->'soldMarked'->>'count')::integer from comparison_test_tasks where name = 'stats_filtered'), 2, 'Nur aktuelle ausdrückliche Verkaufsmarkierungen zählen zur Verkaufsgruppe');
select is((select (task->'soldMarked'->>'median')::numeric from comparison_test_tasks where name = 'stats_filtered'), 40::numeric, 'Verkauft markierte Preise werden getrennt von aktiven Preisen berechnet');
select is((select task->>'match' from comparison_test_tasks where name = 'stats_filtered'), 'category', 'Zu wenige passende Größen und Zustände ergeben keinen Modellvergleich');
select is((select task->>'initialImportStatus' from comparison_test_tasks where name = 'stats_filtered'), 'partial', 'Ungeklärte Status- oder Datumsgrenzen bleiben in der Abdeckung sichtbar');
reset role;

-- Vier Modellbelege in gleicher Größe und Zustand; das Modell darf auch im Detailattribut stehen.
insert into public.vinted_comparison_items(external_id,url,title,price,brand,category_id,size,condition,model,
    status,checked_at,last_active_at,published_earliest,published_latest)
values
    ('56000115','https://www.vinted.de/items/56000115-model','Carhartt Fleecejacke',20,'Carhartt',5600001,'L','Sehr gut','Prentis Liner',
        'active',now(),now(),now()-interval '2 days',now()-interval '2 days'),
    ('56000116','https://www.vinted.de/items/56000116-model','Carhartt Prentis Liner',40,'Carhartt',5600001,'L','Sehr gut',null,
        'active',now(),now(),now()-interval '2 days',now()-interval '2 days'),
    ('56000117','https://www.vinted.de/items/56000117-model','Carhartt Prentis Liner',60,'Carhartt',5600001,'L','Sehr gut',null,
        'active',now(),now(),now()-interval '2 days',now()-interval '2 days');
insert into public.vinted_comparison_matches(scope_id,item_id)
select split_part((select task->>'id' from comparison_test_tasks where name = 'stats_catalog'), ':', 2)::bigint, id
from public.vinted_comparison_items where external_id between '56000115' and '56000117';
set local role service_role;
insert into comparison_test_tasks values ('stats_model', public.vinted_comparison_market(
    (select id from public.sniper_listings where external_id = '56000100'), 'Carhartt', 5600001, 'Prentis Liner'));
select is((select task->>'match' from comparison_test_tasks where name = 'stats_model'), 'model', 'Ausreichend passende Modellbelege bilden eine eigene Vergleichsgruppe');
select is((select (task->'active'->>'count')::integer from comparison_test_tasks where name = 'stats_model'), 4, 'Detailmodell zählt mit; abweichende Größe oder Zustand bleiben aus der Modellgruppe');
select is((select (task->'active'->>'median')::numeric from comparison_test_tasks where name = 'stats_model'), 30::numeric, 'Modellmedian basiert nur auf den vier passenden Belegen');
select is((select (task->'active'->>'maximum')::numeric from comparison_test_tasks where name = 'stats_model'), 60::numeric, 'Der hohe Preis einer anderen Zustandsgruppe verzerrt den Modellvergleich nicht');
select is((select task->'soldMarked' from comparison_test_tasks where name = 'stats_model'), 'null'::jsonb, 'Verkäufe abweichender Größe oder Zustand werden nicht in den Modellvergleich gemischt');
reset role;

-- Nach längerer Laufzeit begrenzt das rollierende Fenster aktive Angebote, nicht ihren Abrufzeitpunkt.
insert into public.vinted_categories(id, parent_id, title, slug, path, is_leaf)
values (5600002, null, 'Fleece rollierend', 'comparison-test-rolling', 'Fleece rollierend', true);
insert into public.sniper_queries(id, query_key, title, catalog_id, brand_ids, brand_names, is_active, filter_format_version)
values ('56000000-0000-4000-8000-000000000005', 'comparison-test-rolling', 'Vergleich rollierend',
    5600002, array[362], array['Carhartt'], true, 1);
insert into public.vinted_comparison_scopes(query_id,query_revision,request_cursor,window_start,created_at,initial_finished_at,last_catalog_at,next_attempt_at)
values ('56000000-0000-4000-8000-000000000005',1,0,now()-interval '60 days',now()-interval '60 days',now()-interval '59 days',now(),now()+interval '15 minutes');
set local role service_role;
select is((public.complete_sniper_search_filter_run('56000000-0000-4000-8000-000000000005',1,0,
    '[{"external_id":"56000200","title":"Carhartt rolling target","url":"https://www.vinted.de/items/56000200-target","item_price":30,"total_price":32.2,"currency":"EUR","brand":"Carhartt","size":"L","condition":"Sehr gut"}]')->>'created')::integer,
    1, 'Laufender Vergleichsbereich erhält einen neuen Zielartikel aus dem Feed');
reset role;
insert into public.vinted_comparison_items(external_id,url,title,price,brand,category_id,status,
    checked_at,last_active_at,sold_detected_at,published_earliest,published_latest)
values
    ('56000201','https://www.vinted.de/items/56000201-recent','Carhartt fleece',20,'Carhartt',5600002,'active',
        now(),now(),null,now()-interval '29 days',now()-interval '29 days'),
    ('56000202','https://www.vinted.de/items/56000202-old','Carhartt fleece',900,'Carhartt',5600002,'active',
        now(),now(),null,now()-interval '31 days',now()-interval '31 days'),
    ('56000203','https://www.vinted.de/items/56000203-sold','Carhartt fleece',40,'Carhartt',5600002,'sold',
        now(),now()-interval '3 days',now()-interval '1 day',now()-interval '40 days',now()-interval '40 days'),
    ('56000204','https://www.vinted.de/items/56000204-old-sale','Carhartt fleece',900,'Carhartt',5600002,'sold',
        now(),now()-interval '33 days',now()-interval '31 days',now()-interval '40 days',now()-interval '40 days'),
    ('56000205','https://www.vinted.de/items/56000205-boundary','Carhartt fleece',900,'Carhartt',5600002,'active',
        now(),now(),null,now()-interval '31 days',now()-interval '29 days'),
    ('56000206','https://www.vinted.de/items/56000206-exact-boundary','Carhartt fleece',40,'Carhartt',5600002,'active',
        now(),now(),null,now()-interval '30 days',now()-interval '30 days');
insert into public.vinted_comparison_matches(scope_id,item_id)
select (select id from public.vinted_comparison_scopes where query_id='56000000-0000-4000-8000-000000000005'), id
from public.vinted_comparison_items where external_id between '56000201' and '56000206';
set local role service_role;
insert into comparison_test_tasks values ('stats_rolling', public.vinted_comparison_market(
    (select id from public.sniper_listings where external_id='56000200'), 'Carhartt',5600002,null));
select is((select (task->'active'->>'count')::integer from comparison_test_tasks where name='stats_rolling'),2,
    'Aktive Angebote außerhalb oder über der gerundeten 30-Tage-Grenze bleiben trotz frischer Prüfung ausgeschlossen');
select is((select (task->'active'->>'median')::numeric from comparison_test_tasks where name='stats_rolling'),30::numeric,
    'Aktiver Median umfasst den aktuellen Beleg und die exakt eingeschlossene 30-Tage-Grenze');
select is((select (task->'soldMarked'->>'count')::integer from comparison_test_tasks where name='stats_rolling'),1,
    'Verkäufe werden nach ihrer aktuellen Erkennung und nicht nach dem älteren Upload bewertet');
select is((select (task->'soldMarked'->>'median')::numeric from comparison_test_tasks where name='stats_rolling'),40::numeric,
    'Ein frischer Abruf macht eine 31 Tage alte Verkaufsmarkierung nicht wieder aktuell');
reset role;

-- Viele noch ungelesene Suchbereiche dürfen Detailprüfungen nicht dauerhaft verdrängen.
update public.sniper_queries set is_active=false where is_active;
insert into public.sniper_queries(id,query_key,title,catalog_id,brand_ids,brand_names,title_keywords,keyword_mode,is_active,filter_format_version)
values ('56000000-0000-4000-8000-000000000006','comparison-test-fairness','Vergleich Abrufwechsel',5600001,
    array(select generate_series(362,371)), array(select 'Marke '||n from generate_series(362,371) n),
    array['fleece','sherpa'],'any',true,1);
set local role service_role;
insert into comparison_test_tasks values ('fair_catalog_first',public.claim_vinted_comparison_task(now()));
select is((select count(*) from public.vinted_comparison_scopes where query_id='56000000-0000-4000-8000-000000000006'),20::bigint,
    'Zehn Marken und zwei ODER-Begriffe bilden zwanzig eigenständige Abrufbereiche');
select is((select task->>'kind' from comparison_test_tasks where name='fair_catalog_first'),'catalog',
    'Ohne bekannte Artikel kann der erste Abruf einen Katalogbereich einlesen');
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name='fair_catalog_first'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name='fair_catalog_first'),
    pg_temp.catalog_result('[{"externalId":"56000301","url":"https://www.vinted.de/items/56000301-fleece","title":"Carhartt fleece","brand":"Carhartt","size":"L","condition":"Sehr gut","price":55,"currency":"EUR"}]')),
    true,'Erster Bereich legt einen zu prüfenden Artikel an');
insert into comparison_test_tasks values ('fair_detail_first',public.claim_vinted_comparison_task(now()));
select is((select task->>'kind' from comparison_test_tasks where name='fair_detail_first'),'detail',
    'Detailprüfung erhält sofort einen Abrufslot trotz neunzehn ungelesener Katalogbereiche');
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name='fair_detail_first'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name='fair_detail_first'),
    pg_temp.detail_result('56000301','unknown')),true,'Ungeklärte Detailprüfung wird regulär abgeschlossen');
reset role;
update public.vinted_comparison_items set next_attempt_at=now() where external_id='56000301';
set local role service_role;
insert into comparison_test_tasks values ('fair_catalog_second',public.claim_vinted_comparison_task(now()));
select is((select task->>'kind' from comparison_test_tasks where name='fair_catalog_second'),'catalog',
    'Nach einer Detailprüfung kommt trotz erneut fälligem Artikel ein Katalogbereich zum Zug');
select isnt((select task->>'id' from comparison_test_tasks where name='fair_catalog_first'),
    (select task->>'id' from comparison_test_tasks where name='fair_catalog_second'),
    'Der nächste noch ungelesene Katalogbereich wird abgearbeitet');
select is(public.complete_vinted_comparison_task(
    (select task->>'id' from comparison_test_tasks where name='fair_catalog_second'),
    (select (task->>'lease_token')::uuid from comparison_test_tasks where name='fair_catalog_second'),pg_temp.catalog_result('[]')),
    true,'Zweiter Katalogbereich kann abgeschlossen werden');
insert into comparison_test_tasks values ('fair_detail_second',public.claim_vinted_comparison_task(now()));
select is((select task->>'kind' from comparison_test_tasks where name='fair_detail_second'),'detail',
    'Der gespeicherte Abrufwechsel schützt Detailprüfungen auch beim nächsten Durchgang');
reset role;

-- Die seltene Mengenbegrenzung muss denselben Produktionsschutz erfüllen wie der erste Claim.
-- Der Überhang liegt über 10000, damit ein zu kleiner Löschschritt den Bestand nicht stehen lässt.
insert into public.vinted_comparison_items(external_id,url,title,price,first_seen_at)
select (569000000+n)::text,'https://www.vinted.de/items/'||(569000000+n)::text,
    'Comparison retention fixture',1,now()-interval '1 day'
from generate_series(1,265000) n;
update public.vinted_comparison_scopes set maintenance_at=now()-interval '2 hours'
where maintenance_at is not null;
set local role service_role;
select lives_ok($$select public.claim_vinted_comparison_task(now())$$,
    'Die Mengenbegrenzung läuft bei mehr als 250000 Artikeln mit aktivem Produktionsschutz');
select is((select count(*) from public.vinted_comparison_items),250000::bigint,
    'Die Mengenbegrenzung erhält genau die neuesten 250000 Artikel');
select ok((select bool_and(coverage_limited) from public.vinted_comparison_scopes),
    'Die Mengenbegrenzung markiert alle betroffenen Vergleichsbereiche als unvollständig');
reset role;

set local role anon;
select throws_ok($$select * from public.vinted_comparison_items$$, '42501', null, 'Anonyme können den Vergleichsbestand nicht auslesen');
select throws_ok($$select public.claim_vinted_comparison_task(now())$$, '42501', null, 'Anonyme können keine Sammlung starten');
reset role;
select set_config('request.jwt.claim.sub', '56000000-0000-4000-8000-000000000102', true);
set local role authenticated;
select is((select count(*) from public.vinted_comparison_items), 0::bigint, 'Normale Mitglieder sehen keine internen Vergleichsartikel');
select is((select count(*) from public.vinted_comparison_scopes), 0::bigint, 'Normale Mitglieder sehen keine Sammelbereiche');
select throws_ok($$select public.claim_vinted_comparison_task(now())$$, '42501', null, 'Mitglieder können keine Dienstaufträge übernehmen');
select throws_ok($$update public.vinted_comparison_items set price = 1 where external_id='56000301'$$, '42501', null, 'Mitglieder können Preise nicht manipulieren');
select throws_ok($$select setval('public.vinted_comparison_items_id_seq',1)$$, '42501', null, 'Mitglieder können keine Artikelkennungen manipulieren');
select ok(not has_table_privilege('authenticated', 'public.' || table_name, 'truncate'),
    'Mitglieder haben kein RLS-umgehendes TRUNCATE-Recht auf ' || table_name)
from (values ('vinted_comparison_items'), ('vinted_comparison_matches'), ('vinted_comparison_scopes')) as tables(table_name);
select ok(not has_function_privilege('authenticated',
    'public.vinted_comparison_market(uuid,text,integer,text)', 'execute'),
    'Die interne Marktstatistik kann ausschließlich der Dienst abrufen');
reset role;
select set_config('request.jwt.claim.sub', '56000000-0000-4000-8000-000000000101', true);
set local role authenticated;
select ok((select count(*) > 0 from public.vinted_comparison_items), 'Betreiber können den internen Vergleichsbestand lesen');
select throws_ok($$select public.claim_vinted_comparison_task(now())$$, '42501', null, 'Auch Betreiber dürfen Dienstleases nicht direkt übernehmen');
select throws_ok($$delete from public.vinted_comparison_items where external_id='56000301'$$, '42501', null, 'Auch Betreiber löschen Vergleichsdaten nicht direkt');
reset role;

select * from finish();
rollback;
