\set ON_ERROR_STOP on
begin;
select no_plan();

insert into auth.users(id,email) values
 ('e2000000-0000-4000-8000-000000000001','filter-match-admin@example.test'),
 ('e2000000-0000-4000-8000-000000000002','filter-match-member@example.test'),
 ('e2000000-0000-4000-8000-000000000003','filter-match-stranger@example.test');
insert into public.platform_operators(user_id) values ('e2000000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values
 ('e2000000-0000-4000-8000-000000000004','Filterzuordnungen'),
 ('e2000000-0000-4000-8000-000000000005','Fremder Feed');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('e2000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000002','owner'),
 ('e2000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000003','owner');
insert into public.vinted_categories(id,title,slug,path,is_leaf) values (9200001,'Jacken','match-jackets','Jacken',true);
insert into public.sniper_runtime_status(id,reported_at,requests_last_minute,rejected_last_minute,request_budget,search_filter_version,search_filter_reported_at)
 values (1,now(),0,0,24,1,now());

select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.save_sniper_search_filter(null,'MATCH broad',9200001,'[]','{}','all',1000,null,null)$$,'Ein Sekundenwunsch ist zulässig, ohne Abrufleistung zu versprechen');
select lives_ok($$select public.save_sniper_search_filter(null,'MATCH narrow',9200001,'[]',array['Pufferjacke'],'all',1000,null,null,null,null,null,array['Weste','Defekt'])$$,'Titelbegriffe und Ausschlüsse lassen sich kombinieren');
select is((select excluded_title_keywords from public.sniper_queries where title='MATCH narrow'),array['defekt','weste'],'Ausschlüsse sind normalisiert und sortiert');
select throws_ok($$select public.save_sniper_search_filter(null,'Kaputt',9200001,'[]','{}','all',1000,null,null,null,null,null,array[null]::text[])$$,'22023',null,'Leere Ausschlüsse werden abgewiesen');
select throws_ok($$select public.save_sniper_search_filter(null,'Kaputt',9200001,'[]','{}','all',1000,null,null,null,null,null,array[' '])$$,'22023',null,'Leerzeichen sind kein Ausschluss');
select throws_ok($$select public.save_sniper_search_filter(null,'Doppelt',9200001,'[]',array['Pufferjacke'],'any',1000,null,null,null,null,null,array[' WESTE ','defekt','weste'])$$,'23505',null,'Reihenfolge und Duplikate ändern die Filteridentität nicht');
select throws_ok($$select public.save_sniper_search_filter(null,'Tempo',9200001,'[]','{}','all',999,null,null)$$,'22023',null,'Unter einer Sekunde wird der Wunsch abgewiesen');
select public.set_sniper_query_active((select id from public.sniper_queries where title='MATCH broad'),true);
select public.set_sniper_query_active((select id from public.sniper_queries where title='MATCH narrow'),true);
reset role;

set local role service_role;
select is(public.sniper_title_contains_keyword(null,'weste'),false,'Fehlender Titel ist kein Treffer');
select is(public.sniper_title_contains_keyword('Jacke',''),false,'Leerer Begriff ist kein Treffer');
select is(public.sniper_title_contains_keyword('weste pufferjacke','weste'),true,'Wort am Anfang zählt');
select is(public.sniper_title_contains_keyword('pufferweste pufferjacke','weste'),false,'Teilwörter lösen keinen Ausschluss aus');
select is(public.sniper_title_contains_keyword('a+b (jacke)','a+b'),true,'Sonderzeichen werden wörtlich geprüft');
select is(public.sniper_title_contains_keyword('jacké','jacke'),false,'Ein kombinierendes Zeichen ist keine Wortgrenze');
select is(public.sniper_title_contains_keyword('jackeा','jacke'),false,'Indische kombinierende Zeichen bleiben Wortbestandteile');
select is(public.sniper_title_contains_keyword('jackeَ','jacke'),false,'Arabische kombinierende Zeichen bleiben Wortbestandteile');
select is(public.sniper_title_contains_keyword('jacke፩','jacke'),false,'Unicode-Zahlzeichen bleiben Wortbestandteile');
select is(public.sniper_title_contains_keyword('jacke𐐀','jacke'),false,'Buchstaben außerhalb der ersten Unicode-Ebene bleiben Wortbestandteile');
select is((select public.sniper_search_filter_matches_title(query,'Pufferjacke – Weste') from public.sniper_queries query where title='MATCH narrow'),false,'Ausschluss nach Bindestrich greift');
select is((select public.sniper_search_filter_matches_title(query,'Pufferjacke pufferweste') from public.sniper_queries query where title='MATCH narrow'),true,'Pufferweste wird nicht mit Weste gleichgesetzt');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH broad'),2,0,
 '[{"external_id":"multi-match","title":"Pufferjacke","url":"https://www.vinted.de/items/multi-match","item_price":10,"total_price":11,"currency":"EUR","brand":"Testbrand"}]',
 '{"coverage":"initial","duration_ms":2300,"source_pages":1,"shared_filter_count":2}')->>'created')::integer,1,'Erster Filter speichert den Artikel');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH narrow'),2,0,
 '[{"external_id":"multi-match","title":"Pufferjacke","url":"https://www.vinted.de/items/multi-match","item_price":10,"total_price":11,"currency":"EUR","brand":"Testbrand"}]',
 '{"coverage":"initial","duration_ms":2300,"source_pages":1,"shared_filter_count":2}')->>'created')::integer,0,'Zweiter Filter speichert keine zweite Artikelzeile');
select is((select count(*) from public.sniper_query_matches),2::bigint,'Beide Filter erhalten eine Zuordnung');
select is((select count(*) from public.sniper_listings where external_id='multi-match'),1::bigint,'Artikel bleibt einmalig');
select ok((select bool_and(is_seed) from public.sniper_query_matches),'Beide Erstbestände bleiben stumm');
select ok((select watchlist_evaluated_at is not null from public.sniper_listings where external_id='multi-match'),'Stummer Erstbestand bleibt auch für spätere Hintergrundbewertung stumm');
select is((select coverage_status from public.sniper_queries where title='MATCH narrow'),'initial','Abdeckung wird gespeichert');
select is((select last_request_duration_ms from public.sniper_queries where title='MATCH narrow'),2300,'Dauer wird gespeichert');
select is((select shared_filter_count from public.sniper_queries where title='MATCH narrow'),2,'Gemeinsam genutzter Abruf wird sichtbar');
select ok((select coverage_checked_at is not null from public.sniper_queries where title='MATCH narrow'),'Abdeckung erhält Prüfzeitpunkt');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH narrow'),2,0,'[]')->>'accepted')::boolean,false,'Alte Cursor werden zurückgewiesen');
select throws_ok($$select public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH narrow'),2,1,'[]','{"coverage":"complete"}')$$,'22023',null,'Keine erfundene Vollständigkeit');
select throws_ok($$select public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH narrow'),2,1,'[]','{"source_pages":4}')$$,'22023',null,'Nachladen ist auf drei Seiten begrenzt');
select throws_ok($$select public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH narrow'),2,1,'[]','{"duration_ms":null}')$$,'22023',null,'Null ist keine beobachtete Dauer');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH narrow'),2,1,
 '[{"external_id":"excluded-match","title":"Pufferjacke Weste","url":"https://www.vinted.de/items/excluded-match","item_price":10,"total_price":11,"currency":"EUR"},
 {"external_id":"wrong-title","title":"Pullover","description":"Pufferjacke","url":"https://www.vinted.de/items/wrong-title","item_price":10,"total_price":11,"currency":"EUR"}]')->>'created')::integer,0,'Datenbank prüft Titel und Ausschluss unabhängig vom Dienst');
select is((select count(*) from public.sniper_query_matches),2::bigint,'Abgewiesene Titel erhalten keine Zuordnung');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH broad'),2,1,
 (select jsonb_agg(jsonb_build_object('external_id','catchup-'||i,'title','Jacke','url','https://www.vinted.de/items/'||i,'item_price',10,'total_price',11,'currency','EUR')) from generate_series(1,288) i),
 '{"coverage":"limited","duration_ms":7800,"source_pages":3,"shared_filter_count":2}')->>'created')::integer,288,'Drei Seiten mit 288 Artikeln werden atomar übernommen');
select throws_ok($$select public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH broad'),2,2,
 (select jsonb_agg(jsonb_build_object('external_id','too-many-'||i,'title','Jacke')) from generate_series(1,289) i))$$,'22023',null,'Mehr als drei volle Seiten werden abgewiesen');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH broad'),2,2,
 '[{"external_id":"packet-duplicate","title":"Jacke","url":"https://www.vinted.de/items/duplicate","item_price":10,"total_price":11,"currency":"EUR"},
 {"external_id":"packet-duplicate","title":"Jacke","url":"https://www.vinted.de/items/duplicate","item_price":10,"total_price":11,"currency":"EUR"}]')->>'created')::integer,1,'Doppelte Rohartikel werden dedupliziert');
reset role;

set local role authenticated;
select is((select listing_count from public.sniper_query_listing_counts() where query_id=(select id from public.sniper_queries where title='MATCH narrow')),1::bigint,'Zähler berücksichtigt den zweiten passenden Filter');
select lives_ok($$select public.save_sniper_search_filter(null,'MATCH seed-only',null,'[]',array['Pufferjacke'],'all',1000,null,null)$$,'Zusätzlicher Titel-Filter ist unabhängig');
select public.set_sniper_query_active((select id from public.sniper_queries where title='MATCH seed-only'),true);
reset role;
-- Ein bereits existierender, noch unbewerteter Artikel darf durch den Erstbestand
-- eines weiteren Filters nicht nachträglich stumm werden.
update public.sniper_listings set watchlist_evaluated_at=null where external_id='multi-match';
set local role service_role;
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH seed-only'),2,0,
 '[{"external_id":"multi-match","title":"Pufferjacke","url":"https://www.vinted.de/items/multi-match","item_price":10,"total_price":11,"currency":"EUR","brand":"Testbrand"}]')->>'seeded')::boolean,true,'Zusätzlicher Filter startet mit stillem Bestand');
select ok((select watchlist_evaluated_at is null from public.sniper_listings where external_id='multi-match'),'Späterer stiller Filter unterdrückt keine offene Bewertung des bestehenden Artikels');
reset role;
set local role authenticated;
select lives_ok($$select public.save_sniper_search_filter((select id from public.sniper_queries where title='MATCH narrow'),'MATCH narrow',9200001,'[]',array['Pufferjacke'],'all',1000,null,2,null,null,null,array['Weste','Kaputt'])$$,'Ausschlüsse lassen sich revidieren');
select is((select filter_revision from public.sniper_queries where title='MATCH narrow'),3,'Ausschlussänderung invalidiert alte Revision');
select is((select is_active from public.sniper_queries where title='MATCH narrow'),false,'Ausschlussänderung pausiert den Filter');
select is((select request_cursor from public.sniper_queries where title='MATCH narrow'),0,'Ausschlussänderung setzt den Cursor zurück');
select is((select coverage_status from public.sniper_queries where title='MATCH narrow'),'unknown','Neue Bedingungen haben keine alte Abdeckungszusage');
select is((select count(*) from public.sniper_query_matches where query_id=(select id from public.sniper_queries where title='MATCH narrow')),1::bigint,'Historische Zuordnung bleibt erhalten');
select public.set_sniper_query_active((select id from public.sniper_queries where title='MATCH narrow'),true);
reset role;
set local role service_role;
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH narrow'),2,2,'[]')->>'accepted')::boolean,false,'Vor Bearbeitung gestartete Antwort wird verworfen');
reset role;
set local role authenticated;
select public.set_sniper_query_active((select id from public.sniper_queries where title='MATCH narrow'),false);
reset role;
set local role service_role;
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH narrow'),5,0,'[]')->>'accepted')::boolean,false,'Pausierter Filter übernimmt keine Antwort');
reset role;
set local role authenticated;
select public.delete_sniper_query((select id from public.sniper_queries where title='MATCH narrow'));
reset role;
set local role service_role;
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='MATCH narrow'),6,0,'[]')->>'accepted')::boolean,false,'Gelöschter Filter übernimmt keine Antwort');
reset role;

insert into public.sniper_query_subscriptions(workspace_id,query_id)
 select 'e2000000-0000-4000-8000-000000000004',id from public.sniper_queries where title='MATCH narrow';
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.sniper_query_matches),1::bigint,'Mitglied sieht ausschließlich eigene abonnierte Zuordnungen');
select throws_ok($$insert into public.sniper_query_matches(query_id,listing_id,filter_revision,is_seed) values (null,null,1,false)$$,'42501',null,'Web-App darf keine Zuordnungen schreiben');
select throws_ok($$select public.sniper_notify_feed_updates()$$,'42501',null,'Web-App darf Feed-Hinweise nicht auslösen');
reset role;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from public.sniper_query_matches),0::bigint,'Fremde Filterzuordnungen bleiben unsichtbar');
reset role;
set local role anon;
select throws_ok($$select * from public.sniper_query_matches$$,'42501',null,'Anonyme lesen keine Zuordnungen');
select throws_ok($$select public.sniper_notify_feed_updates()$$,'42501',null,'Anonyme dürfen keine Hinweise senden');
reset role;

set local role service_role;
select lives_ok($$select public.sniper_notify_feed_updates()$$,'Dienst sendet gebündelte Hinweise');
reset role;
select is((select count(*) from realtime.messages where event='feed_updated' and topic='workspace:e2000000-0000-4000-8000-000000000004:sniper_feed'),1::bigint,'Genau ein Hinweis je Workspace');
select ok((select bool_and(private and payload - 'id'=jsonb_build_object('refresh',true)) from realtime.messages where event='feed_updated'),'Hinweise sind privat und enthalten keine Artikel');
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000002',true);
select set_config('realtime.topic','workspace:e2000000-0000-4000-8000-000000000004:sniper_feed',true);
set local role authenticated;
select is((select count(*) from realtime.messages where event='feed_updated'),1::bigint,'Mitglied empfängt den eigenen Hinweis');
reset role;
select set_config('realtime.topic','workspace:e2000000-0000-4000-8000-000000000005:sniper_feed',true);
set local role authenticated;
select is((select count(*) from realtime.messages where event='feed_updated'),0::bigint,'Fremder privater Kanal bleibt gesperrt');
select throws_ok($$insert into realtime.messages(topic,extension,event,payload,private) values ('workspace:e2000000-0000-4000-8000-000000000005:sniper_feed','broadcast','feed_updated','{}',true)$$,'42501',null,'Mitglieder dürfen keine Feed-Hinweise vortäuschen');
reset role;

select ok(not has_function_privilege('authenticated','public.complete_sniper_search_filter_run(uuid,integer,integer,jsonb,jsonb)','execute'),'Defaultrechte öffnen keinen Dienst-Schreibweg');
select ok(not has_function_privilege('authenticated','public.sniper_notify_feed_updates()','execute'),'Defaultrechte öffnen keinen Broadcast-Schreibweg');
select ok(not has_table_privilege('authenticated','public.sniper_query_matches','insert'),'Defaultrechte erlauben keine direkte Zuordnung');
select ok(not has_table_privilege('authenticated','public.sniper_query_matches','update'),'Defaultrechte erlauben keine Zuordnungsänderung');
select ok(not has_table_privilege('authenticated','public.sniper_query_matches','delete'),'Defaultrechte erlauben keine Zuordnungslöschung');
select ok(not has_sequence_privilege('authenticated','public.sniper_query_matches_id_seq','usage'),'Interne Zuordnungssequenz bleibt dem Dienst vorbehalten');
select is((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='complete_sniper_search_filter_run'),1::bigint,'Genau eine vollständige Übernahmesignatur');
select is((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='save_sniper_search_filter'),1::bigint,'Genau eine Speichersignatur ohne mehrdeutige Defaults');
-- Historische numerische Markenfilter dürfen bei einem Mehrmarkenfilter
-- nicht automatisch alle anderen Marken desselben Rohabrufs übernehmen.
insert into public.sniper_queries(query_key,title,brand_ids,brand_names,title_keywords)
 values ('multi-brand-watchlist-contract','MATCH multi-brand',array[53,14],array['Nike','Adidas'],array['Pufferjacke']);
insert into public.sniper_query_matches(query_id,listing_id,filter_revision,is_seed)
 select query.id,listing.id,query.filter_revision,false
 from public.sniper_queries query cross join public.sniper_listings listing
 where query.title='MATCH multi-brand' and listing.external_id='multi-match';
update public.sniper_listings set brand='Adidas' where external_id='multi-match';
select is((select public.sniper_watchlist_matches(
 jsonb_populate_record(null::public.sniper_watchlists,'{"legacy_brand_id":53}'),listing)
 from public.sniper_listings listing where external_id='multi-match'),false,'Nike-Merkzettel übernimmt kein Adidas aus gemeinsamem Mehrmarkenabruf');
select is((select public.sniper_watchlist_matches(
 jsonb_populate_record(null::public.sniper_watchlists,'{"legacy_brand_id":14}'),listing)
 from public.sniper_listings listing where external_id='multi-match'),true,'Adidas-Merkzettel erkennt passende Marke im gemeinsamen Mehrmarkenabruf');

-- Dieselbe frische Antwort muss unabhängig von der Reihenfolge eines neuen
-- Seed-Filters und eines bereits gesäten Empfängers genau einen Treffer melden.
insert into public.vinted_categories(id,title,slug,path,is_leaf) values (9200002,'Seed-Reihenfolge','seed-order','Seed-Reihenfolge',true);
insert into public.sniper_queries(id,query_key,title,catalog_id,filter_format_version,is_active,title_keywords,
    seeded_requests,is_seeded,last_success_at,created_at)
select ('e2000000-0000-4000-8000-0000000000'||lpad(i::text,2,'0'))::uuid,
    'seed-order-'||i,'Seed Order '||i,9200002,case when i=10 then 0 else 1 end,true,
    case when i=10 then '{}'::text[] else array['jacke'] end,
    case when i in (12,14,16) then array[0] else '{}'::integer[] end,
    i in (12,14,16),case when i in (12,14,16) then now()-interval '1 hour' end,
    now()-interval '1 day' from generate_series(10,16) i;
insert into public.sniper_listings(external_id,title,url,item_price,total_price,currency,brand,condition,
    catalog_id,catalog_source_query_id,discovered_by_query_id,watchlist_evaluated_at)
select 'seed-order-reference-'||i,'Referenz','https://www.vinted.de/items/reference-'||i,100,101,'EUR','Seedorder','good',
    9200002,'e2000000-0000-4000-8000-000000000010','e2000000-0000-4000-8000-000000000010',now()
from generate_series(1,20) i;
insert into public.sniper_watchlists(workspace_id,title,catalog_id,brand,discount_threshold_percent,starts_at)
 values ('e2000000-0000-4000-8000-000000000004','Seed-Reihenfolge',9200002,'Seedorder',40,now()-interval '1 day');
set local role service_role;
select is((public.complete_sniper_search_filter_run('e2000000-0000-4000-8000-000000000011',1,0,
 '[{"external_id":"seed-first-order","title":"Jacke","url":"https://www.vinted.de/items/seed-first-order","item_price":10,"total_price":11,"currency":"EUR","brand":"Seedorder","condition":"good"}]')->>'hits')::integer,0,'Neuer Seed-Empfänger beginnt ohne Meldung');
select is((public.complete_sniper_search_filter_run('e2000000-0000-4000-8000-000000000012',1,0,
 '[{"external_id":"seed-first-order","title":"Jacke","url":"https://www.vinted.de/items/seed-first-order","item_price":10,"total_price":11,"currency":"EUR","brand":"Seedorder","condition":"good"}]')->>'hits')::integer,1,'Bereits gesäter Empfänger meldet frischen Fund trotz vorangegangenem Seed');
select is((public.complete_sniper_search_filter_run('e2000000-0000-4000-8000-000000000014',1,0,
 '[{"external_id":"ready-first-order","title":"Jacke","url":"https://www.vinted.de/items/ready-first-order","item_price":10,"total_price":11,"currency":"EUR","brand":"Seedorder","condition":"good"}]')->>'hits')::integer,1,'Bereits gesäter Empfänger meldet auch als erster');
select is((public.complete_sniper_search_filter_run('e2000000-0000-4000-8000-000000000013',1,0,
 '[{"external_id":"ready-first-order","title":"Jacke","url":"https://www.vinted.de/items/ready-first-order","item_price":10,"total_price":11,"currency":"EUR","brand":"Seedorder","condition":"good"}]')->>'hits')::integer,0,'Nachfolgender Seed-Empfänger erzeugt keine Doppelmeldung');
select is((select count(*) from public.sniper_watchlist_hits hit join public.sniper_listings listing on listing.id=hit.listing_id
    where listing.external_id in ('seed-first-order','ready-first-order')),2::bigint,'Beide Reihenfolgen liefern genau einen gleichen Treffer');
select public.complete_sniper_search_filter_run('e2000000-0000-4000-8000-000000000015',1,0,
 '[{"external_id":"historic-seed-order","title":"Jacke","url":"https://www.vinted.de/items/historic-seed-order","item_price":10,"total_price":11,"currency":"EUR","brand":"Seedorder","condition":"good"}]');
reset role;
update public.sniper_listings set first_seen_at=now()-interval '2 hours' where external_id='historic-seed-order';
set local role service_role;
select is((public.complete_sniper_search_filter_run('e2000000-0000-4000-8000-000000000016',1,0,
 '[{"external_id":"historic-seed-order","title":"Jacke","url":"https://www.vinted.de/items/historic-seed-order","item_price":10,"total_price":11,"currency":"EUR","brand":"Seedorder","condition":"good"}]')->>'hits')::integer,0,'Historischer Seed-Bestand vor dem letzten Erfolg bleibt stumm');
select ok((select watchlist_evaluated_at is not null from public.sniper_listings where external_id='historic-seed-order'),'Historische stille Bewertung bleibt erhalten');
select is((public.complete_sniper_search_filter_run('e2000000-0000-4000-8000-000000000012',1,1,
 '[{"external_id":"seed-first-order","title":"Jacke","url":"https://www.vinted.de/items/seed-first-order","item_price":10,"total_price":11,"currency":"EUR","brand":"Seedorder","condition":"good"}]')->>'hits')::integer,0,'Bereits echte Bewertung wird bei Wiederholung nicht neu geöffnet');
reset role;

select * from finish();
rollback;
