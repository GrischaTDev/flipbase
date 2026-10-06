\set ON_ERROR_STOP on
begin;
select no_plan();

insert into auth.users(id, email) values
 ('e1000000-0000-4000-8000-000000000001', 'search-filter-admin@example.test'),
 ('e1000000-0000-4000-8000-000000000002', 'search-filter-member@example.test');
insert into public.platform_operators(user_id) values ('e1000000-0000-4000-8000-000000000001');
insert into public.vinted_categories(id, parent_id, title, slug, path, is_leaf) values
 (9100001, null, 'Herren', 'test-men', 'Herren', false),
 (9100002, 9100001, 'Jacken', 'test-jackets', 'Herren > Jacken', true),
 (9100003, 9100001, 'Hosen', 'test-trousers', 'Herren > Hosen', true);
insert into public.sniper_runtime_status(id, reported_at, requests_last_minute, rejected_last_minute, request_budget)
 values (1, now(), 0, 0, 30);

set local role anon;
select throws_ok($$select public.save_sniper_search_filter(null,'Test',9100002,'[]','{}','all',20000,null,null)$$, '42501', null, 'Anonyme dürfen keine Suchfilter speichern');
select throws_ok($$select public.complete_sniper_search_filter_run(null,1,0,'[]')$$, '42501', null, 'Anonyme dürfen keine Funde einspielen');
reset role;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.save_sniper_search_filter(null,'Test',9100002,'[]','{}','all',20000,null,null)$$, '42501', null, 'Mitglieder dürfen keine zentralen Filter speichern');
select throws_ok($$select public.complete_sniper_search_filter_run(null,1,0,'[]')$$, '42501', null, 'Auch die Web-App kann den Dienst-Schreibweg nicht aufrufen');
reset role;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok($$select public.save_sniper_search_filter(null,'TEST category',9100002,'[]','{}','all',20000,null,null)$$, 'Kategorie ohne Marke ist möglich');
select lives_ok($$select public.save_sniper_search_filter(null,'TEST parent',9100001,'[]','{}','all',20000,null,null)$$, 'Oberkategorie ist auswählbar');
select lives_ok($$select public.save_sniper_search_filter(null,'TEST title',null,'[]',array['Vintage'],'all',20000,null,null)$$, 'Titelbegriff ohne Marke oder Kategorie ist möglich');
select lives_ok($$select public.save_sniper_search_filter(null,'TEST jackets',9100002,'[{"id":53,"name":"Nike"}]',array['Vintage'],'all',20000,null,null)$$, 'Marke und Kategorie und Titel werden kombiniert');
select lives_ok($$select public.save_sniper_search_filter(null,'TEST trousers',9100003,'[{"id":53,"name":"Nike"}]',array['Vintage'],'all',20000,null,null)$$, 'Dieselbe Marke in einer anderen Kategorie ist erlaubt');
select lives_ok($$select public.save_sniper_search_filter(null,'TEST rotating',9100002,'[{"id":53,"name":"Nike"},{"id":14,"name":"adidas"}]',array['Vintage','Trackpants'],'any',20000,null,null)$$, 'Mehrere alternative Marken und Titelbegriffe sind möglich');
select is((select catalog_id from public.sniper_queries where title='TEST category'),9100002,'Kategorie bleibt gespeichert');
select is((select brand_ids from public.sniper_queries where title='TEST category'),'{}'::integer[],'Keine versteckte Markenbedingung');
select is((select title_keywords from public.sniper_queries where title='TEST title'),array['vintage'],'Titelbegriffe werden normalisiert');
select is((select brand_ids from public.sniper_queries where title='TEST rotating'),array[14,53],'Markenreihenfolge ist stabil');
select is((select title_keywords from public.sniper_queries where title='TEST rotating'),array['trackpants','vintage'],'Titelreihenfolge bleibt für Teilabrufe stabil');
select ok((select bool_and(not is_active) from public.sniper_queries where title like 'TEST %'),'Neue Suchfilter starten pausiert');
select throws_ok($$select public.save_sniper_search_filter(null,'Leer',null,'[]','{}','all',20000,null,null)$$,'22023',null,'Ungefilterter Gesamtbestand wird abgewiesen');
select throws_ok($$select public.save_sniper_search_filter(null,'Fehlt',9199999,'[]','{}','all',20000,null,null)$$,'22023',null,'Fehlende Kategorie wird nicht zu allen Kategorien');
select throws_ok($$select public.save_sniper_search_filter(null,'Kaputt',null,'[{"name":"Nike"}]','{}','all',20000,null,null)$$,'22023',null,'Fehlende Markenkennung wird abgewiesen');
select throws_ok($$select public.save_sniper_search_filter(null,'Kaputt',null,'[{"id":53.2,"name":"Nike"}]','{}','all',20000,null,null)$$,'22023',null,'Bruchzahlen sind keine Markenkennungen');
select throws_ok($$select public.save_sniper_search_filter(null,'Kaputt',null,'[]',array['   '],'all',20000,null,null)$$,'22023',null,'Leere Titelbegriffe sind keine Filterbedingung');
select throws_ok($$select public.save_sniper_search_filter(null,'Kaputt',9100002,'[]',array['Vintage'],'other',20000,null,null)$$,'22023',null,'Unbekannter Titelmodus wird abgewiesen');
select throws_ok($$select public.save_sniper_search_filter(null,'Gleich',9100002,'[{"id":14,"name":"ADIDAS"},{"id":53,"name":"NIKE"}]',array['  VINTAGE  ','TRACKPANTS'],'any',20000,'Andere Notiz',null)$$,'23505',null,'Identische Bedingungen sind trotz Reihenfolge, Namen und Schreibweise ein Duplikat');
select throws_ok($$select public.save_sniper_search_filter(null,'Ein Begriff',null,'[]',array[' VINTAGE '],'any',20000,null,null)$$,'23505',null,'UND und ODER sind bei einem Begriff identisch');
select throws_ok($$select public.save_sniper_search_filter((select id from public.sniper_queries where title='TEST category'),'Fremde Änderung',9100002,'[]','{}','all',20000,null,0)$$,'40001',null,'Veraltete Formularrevision kann nicht überschreiben');
select throws_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where title='TEST category'),true)$$,'55000',null,'Alter Abrufdienst kann neue Suchfilter nicht aktivieren');
select throws_ok($$update public.sniper_queries set title='Direkt'$$,'42501',null,'Direktes Schreiben bleibt für Administratoren gesperrt');
reset role;
update public.sniper_runtime_status set search_filter_version=1, search_filter_reported_at=now();
set local role authenticated;
select lives_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where title='TEST category'),true)$$,'Neue Version kann Kategorie-Filter aktivieren');
select lives_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where title='TEST rotating'),true)$$,'Neue Version kann Mehrfachfilter aktivieren');
select lives_ok($$select public.set_sniper_query_active((select id from public.sniper_queries where title='TEST parent'),true)$$,'Neue Version kann Oberkategorie aktivieren');
select is((select filter_revision from public.sniper_queries where title='TEST category'),2,'Aktivieren invalidiert alte Abrufe');
reset role;

set local role service_role;
select throws_ok($$insert into public.sniper_listings(marketplace,external_id,title,url,item_price,total_price,currency,discovered_by_query_id)
 values ('vinted','unverified','Falscher Titel','https://www.vinted.de/items/unverified',10,11,'EUR',(select id from public.sniper_queries where title='TEST rotating'))$$,
 '55000',null,'Alter Dienst darf neue Filter nicht ungeprüft befüllen');
select throws_ok($$update public.sniper_queries set is_seeded=true,last_status='ok' where title='TEST rotating'$$,'55000',null,'Auch ein leerer alter Abruf darf keinen neuen Filter als eingelesen markieren');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST category'),1,0,'[]')->>'accepted')::boolean,false,'Veraltete Antwort wird verworfen');
select is((select request_cursor from public.sniper_queries where title='TEST category'),0,'Verworfene Antwort bewegt keinen Cursor');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST category'),2,0,
 '[{"external_id":"filter-article-1","title":"Jacke","url":"https://www.vinted.de/items/filter-article-1","item_price":10,"total_price":11,"currency":"EUR"}]')->>'created')::integer,1,'Gültiger Abruf speichert einen Fund atomar');
select is((select filter_revision from public.sniper_queries where title='TEST category'),2,'Betriebsupdate verändert die Formularrevision nicht');
select is((select request_cursor from public.sniper_queries where title='TEST category'),1,'Cursor ist eine fortlaufende Abrufnummer, nicht nur eine wiederholbare Position');
select is((select is_seeded from public.sniper_queries where title='TEST category'),true,'Einziger Teilabruf ist eingelesen');
select ok((select watchlist_evaluated_at is not null from public.sniper_listings where external_id='filter-article-1'),'Erster Einleselauf bleibt stumm');
select is((select catalog_id from public.sniper_listings where external_id='filter-article-1'),9100002,'Blattkategorie wird dem Fund zugeordnet');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST category'),2,0,'[]')->>'accepted')::boolean,false,'Wiederholte Antwort desselben Teilabrufs wird auch bei einer einzigen Marke verworfen');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST rotating'),2,0,
 '[{"external_id":"filter-article-1","title":"Vintage Jacke","url":"https://www.vinted.de/items/filter-article-1","item_price":10,"total_price":11,"currency":"EUR"}]')->>'created')::integer,0,'Überlappende Filter verdoppeln keinen Fund');
select is((select count(*) from public.sniper_listings where external_id='filter-article-1'),1::bigint,'Im gemeinsamen Feed bleibt eine Artikelzeile');
select is((select is_seeded from public.sniper_queries where title='TEST rotating'),false,'Mehrfachfilter ist nach einem Teilabruf noch nicht komplett eingelesen');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST rotating'),2,1,'[]')->>'seeded')::boolean,true,'Zweiter Teilabruf startet stumm');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST rotating'),2,2,'[]')->>'seeded')::boolean,true,'Dritter Teilabruf startet stumm');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST rotating'),2,3,'[]')->>'seeded')::boolean,true,'Vierter Teilabruf startet stumm');
select is((select is_seeded from public.sniper_queries where title='TEST rotating'),true,'Alle vier Teilabrufe sind eingelesen');
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST rotating'),2,4,'[]')->>'seeded')::boolean,false,'Die nächste Runde ist kein erneuter Einleselauf');
select lives_ok($$select public.record_sniper_search_filter_failure((select id from public.sniper_queries where title='TEST rotating'),2,0,'cooldown',now(),'server','Alt',5,'failed')$$,'Verspäteter Fehler kann beantwortet werden');
select is((select last_status from public.sniper_queries where title='TEST rotating'),'ok','Verspäteter Fehler überschreibt keinen neueren Erfolg');
select lives_ok($$select public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST parent'),2,0,
 '[{"external_id":"parent-article","title":"Kleidung","url":"https://www.vinted.de/items/parent-article","item_price":10,"total_price":11,"currency":"EUR"}]')$$,'Oberkategorie sammelt ohne erfundene Blattkategorie');
select is((select catalog_id from public.sniper_listings where external_id='parent-article'),null::integer,'Oberkategorie wird nicht als genaue Preisvergleichsgruppe ausgegeben');
reset role;

set local role authenticated;
select lives_ok($$select public.save_sniper_search_filter((select id from public.sniper_queries where title='TEST category'),'TEST category',9100002,'[]','{}','all',30000,'Nur eine Notiz',2)$$,'Nur Name, Notiz oder Intervall lassen sich ohne Neueinlesen ändern');
select is((select request_cursor from public.sniper_queries where title='TEST category'),1,'Metadatenänderung behält den Fortschritt');
select is((select is_active from public.sniper_queries where title='TEST category'),true,'Metadatenänderung pausiert nicht unnötig');
select lives_ok($$select public.save_sniper_search_filter((select id from public.sniper_queries where title='TEST category'),'TEST category',9100003,'[]','{}','all',30000,null,3)$$,'Kategorie kann mit aktueller Revision geändert werden');
select is((select is_active from public.sniper_queries where title='TEST category'),false,'Inhaltliche Änderung pausiert');
select is((select request_cursor from public.sniper_queries where title='TEST category'),0,'Inhaltliche Änderung setzt den Einlesestand zurück');
select is((select is_seeded from public.sniper_queries where title='TEST category'),false,'Neue Bedingungen brauchen einen neuen stummen Einleselauf');
select is((select catalog_id from public.sniper_listings where external_id='filter-article-1'),9100002,'Historischer Fund wird nicht umkategorisiert');
select lives_ok($$select public.upsert_sniper_query(null,'TEST legacy brand',88,20000,null)$$,'Alter Markenweg bleibt für alte Clients bestehen');
select throws_ok($$select public.save_sniper_search_filter(null,'TEST duplicate brand',null,'[{"id":88,"name":"Ralph Lauren"}]','{}','all',20000,null,null)$$,'23505',null,'Neuer Markenfilter dupliziert keinen vorhandenen alten Markenfilter');
select lives_ok($$select public.save_sniper_search_filter((select id from public.sniper_queries where title='TEST legacy brand'),'TEST legacy brand',null,'[{"id":88,"name":"Ralph Lauren"}]','{}','all',20000,null,1)$$,'Alter Markenfilter wird ohne neue Identität bearbeitet');
select throws_ok($$select public.upsert_sniper_query((select id from public.sniper_queries where title='TEST legacy brand'),'Alter Client',88,20000,null)$$,'P0001',null,'Alter Client kann einen neuen Filter nicht ohne Revision überschreiben');
select lives_ok($$select public.delete_sniper_query((select id from public.sniper_queries where title='TEST rotating'))$$,'Löschen beendet den zentralen Filter');
select is((select count(*) from public.sniper_listings where external_id='filter-article-1'),1::bigint,'Löschen erhält Funde');
reset role;
set local role service_role;
select is((public.complete_sniper_search_filter_run((select id from public.sniper_queries where title='TEST rotating'),2,5,'[]')->>'accepted')::boolean,false,'Gelöschter Filter übernimmt keine verspätete Antwort');
reset role;

select * from finish();
rollback;
