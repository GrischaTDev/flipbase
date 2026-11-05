\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'marketplace_account_sync_sources', 'Quellen haben eigene Abrufstände');
select has_function('public', 'marketplace_apply_vinted_import', array['uuid','uuid','uuid','uuid','jsonb'], 'Import wird atomar gespeichert');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('30000000-0000-4000-8000-000000000001','authenticated','authenticated','import-owner@example.test','{}','{}'),
 ('30000000-0000-4000-8000-000000000002','authenticated','authenticated','import-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('30000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('30000000-0000-4000-8000-000000000011','Importtest');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000001','owner'),
 ('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000002','admin');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id)
 values ('30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000011','Test','connected','owner-300');
insert into public.marketplace_browser_sessions(public_id,workspace_id,connection_id,started_by,provider_profile_id,expires_at)
 values ('30000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000001','test-profile',now()+interval '1 hour');

create function pg_temp.snapshot(p_minute int, p_entries jsonb default '[]', p_areas jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('identity',jsonb_build_object('id','owner-300','username','owner'),
 'observedAt','2026-09-30T12:00:00Z'::timestamptz + p_minute * interval '1 minute',
 'entries',jsonb_build_array(jsonb_build_object('kind','profile','externalId','owner-300','sortAt','2026-09-30T12:00:00Z','body',jsonb_build_object('feedbacks',jsonb_build_array(jsonb_build_object('id','good'))))) || p_entries,
 'areas','{"profile":{"status":"complete"},"publications":{"status":"complete"},"conversations":{"status":"complete"},"messages":{"status":"complete"},"sales":{"status":"complete"},"feedback":{"status":"complete"}}'::jsonb || p_areas);
$$;
create function pg_temp.apply(p_snapshot jsonb) returns jsonb language sql as $$
 select public.marketplace_apply_vinted_import('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000031',coalesce((current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid,'30000000-0000-4000-8000-000000000001'),p_snapshot);
$$;

set local role service_role;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.apply(pg_temp.snapshot(0))->>'profile','1','Profil ist atomar importiert');
select is((select count(*)::int from public.marketplace_account_sync_sources),6,'Alle Quellenstände gespeichert');
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(0))$$,'22023',null,'Gleiche Abrufzeit abgelehnt');
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(-1))$$,'22023',null,'Alter Abruf abgelehnt');
select throws_ok($$select pg_temp.apply(jsonb_set(pg_temp.snapshot(1),'{identity,id}','"foreign"'))$$,'42501',null,'Fremde Identität abgelehnt');
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(1)-'areas')$$,'22023',null,'Quellenstatus erforderlich');
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(1,'[{"kind":"publication","externalId":"valid","sortAt":"2026-09-30T12:00:00Z","body":{}},{"kind":"unknown","externalId":"late","sortAt":"2026-09-30T12:00:00Z","body":{}}]'))$$,'22023',null,'Später Fehler verwirft gesamten Import');
select is((select count(*)::int from public.marketplace_account_entries where external_id='valid'),0,'Kein Teilimport nach späterem Fehler');
select is((select max(observed_at) from public.marketplace_account_sync_sources),'2026-09-30T12:00:00Z'::timestamptz,'Kein Checkpoint nach fehlgeschlagenem Import');
select lives_ok($$select pg_temp.apply(pg_temp.snapshot(1,'[{"kind":"publication","externalId":"kept","sortAt":"2026-09-30T12:00:00Z","body":{}}]'))$$,'Inserat importiert');
select lives_ok($$select pg_temp.apply(pg_temp.snapshot(2,'[]','{"publications":{"status":"partial","failure":"invalid_response"},"feedback":{"status":"failed","failure":"timeout"}}'))$$,'Teilfehler speichert erfolgreiche Quellen');
select is((select count(*)::int from public.marketplace_account_entries where external_id='kept'),1,'Unvollständige Liste löscht keine Inserate');
select is((select body->'feedbacks' from public.marketplace_account_entries where kind='profile'),'[{"id":"good"}]'::jsonb,'Fehlgeschlagene Bewertungen behalten letzten guten Stand');
select is((select last_synced_at from public.marketplace_connections where id='30000000-0000-4000-8000-000000000021'),'2026-09-30T12:01:00Z'::timestamptz,'Teilfehler gibt kein falsches Gesamtdatum');
select is((select last_success_at from public.marketplace_account_sync_sources where area='feedback'),'2026-09-30T12:01:00Z'::timestamptz,'Bewertungsfehler gibt kein Erfolgsdatum');
select lives_ok($$select pg_temp.apply(jsonb_set(pg_temp.snapshot(3),'{entries,0,body,feedbacks}','[]'))$$,'Vollständige leere Bewertungen sind erfolgreich');
select is((select body->'feedbacks' from public.marketplace_account_entries where kind='profile'),'[]'::jsonb,'Vollständig leere Bewertungen entfernen alte Bewertungen');
select is((select count(*)::int from public.marketplace_account_entries where external_id='kept'),0,'Vollständig leere Liste entfernt alte Inserate');
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(4,'[{"kind":"publication","externalId":"bad","sortAt":"2026-09-30T12:00:00Z","body":{}}]','{"publications":{"status":"failed","failure":"timeout"}}'))$$,'22023',null,'Fehlgeschlagene Quelle darf keine Daten liefern');
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(4,'[{"kind":"message","externalId":"orphan","parentExternalId":"missing","sortAt":"2026-09-30T12:00:00Z","body":{}}]'))$$,'22023',null,'Nachricht braucht Gespräch im selben Konto');
select lives_ok($$select pg_temp.apply(jsonb_set(pg_temp.snapshot(4),'{entries,0,body,feedbacks}','[{"id":"good","text":"neu"},{"id":"other","text":"alt"}]'))$$,'Bekannte Bewertungen speichern');
select lives_ok($$select pg_temp.apply(jsonb_set(pg_temp.snapshot(5,'[]','{"feedback":{"status":"partial","failure":"timeout"}}'),'{entries,0,body,feedbacks}','[{"id":"good","text":"aktuell"}]'))$$,'Teilbewertungen ergänzen bekannten Stand');
select is((select jsonb_array_length(body->'feedbacks') from public.marketplace_account_entries where kind='profile'),2,'Teilbewertungen behalten fehlende bekannte IDs');
select is((select item->>'text' from public.marketplace_account_entries e, jsonb_array_elements(e.body->'feedbacks') item where e.kind='profile' and item->>'id'='good'),'aktuell','Neue Bewertung ersetzt gleiche bekannte ID');
select lives_ok($$select pg_temp.apply(pg_temp.snapshot(6,'[{"kind":"sale","externalId":"invalid-order","sortAt":"2026-09-30T12:00:00Z","body":{}},{"kind":"sale","externalId":"confirmed","sortAt":"2026-09-30T12:00:00Z","body":{}}]'))$$,'Historische Verkäufe anlegen');
select lives_ok($$select pg_temp.apply(pg_temp.snapshot(7))$$,'Leere Verkaufsliste lässt Historie bestehen');
select is((select count(*)::int from public.marketplace_account_entries where kind='sale'),2,'Historische Verkäufe nicht pauschal entfernen');
select lives_ok($$select pg_temp.apply(pg_temp.snapshot(8,'[{"kind":"sale","externalId":"confirmed","sortAt":"2026-09-30T12:00:00Z","body":{}}]') || '{"rejectedSaleIds":["invalid-order","confirmed"]}'::jsonb)$$,'Nur ausdrücklich widerlegte Verkäufe entfernen');
select is((select count(*)::int from public.marketplace_account_entries where kind='sale'),1,'Bestätigte gleichnamige Verkäufe bleiben trotz Bereinigung erhalten');
select lives_ok($$select pg_temp.apply(pg_temp.snapshot(9,'[{"kind":"publication","externalId":"edited","sortAt":"2026-09-30T12:00:00Z","body":{"text":"alt","textState":"loaded"}}]'))$$,'Bearbeitbares Inserat anlegen');
select ok(public.marketplace_cache_listing_text('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000021',(select id from public.marketplace_account_entries where external_id='edited'),'edited','bestätigt',true,'Neu',25),'Spätere bestätigte Änderung speichern');
select lives_ok($$select pg_temp.apply(pg_temp.snapshot(10,'[{"kind":"publication","externalId":"edited","sortAt":"2026-09-30T12:00:00Z","body":{"text":"veraltet","textState":"loaded"}}]'))$$,'Verspäteter Abruf darf andere Quellen speichern');
select is((select body->>'text' from public.marketplace_account_entries where external_id='edited'),'bestätigt','Spätere bestätigte Änderung überlebt verzögerten Abruf');
select lives_ok($$select pg_temp.apply(pg_temp.snapshot(11))$$,'Verspätete vollständige Liste akzeptiert');
select is((select count(*)::int from public.marketplace_account_entries where external_id='edited'),1,'Neuere Einträge werden auch bei vollständiger leerer Liste nicht gelöscht');
select lives_ok($$select pg_temp.apply(jsonb_set(pg_temp.snapshot(12,
 '[{"kind":"conversation","externalId":"456","sortAt":"2026-09-30T12:12:00Z","body":{"itemId":"81","itemTitle":"Gesprächsartikel","itemImageUrl":"https://images.example.test/article.jpg","itemPrice":24,"itemCurrency":"EUR"}}]',
 '{"publications":{"status":"partial"},"messages":{"status":"partial"},"sales":{"status":"partial"},"feedback":{"status":"partial"}}'),
 '{entries,0,body,feedbacks}','[]'))$$,'Gezielter Gesprächsabruf speichert Artikeldaten ohne andere Bereiche vollständig zu melden');
select is((select body->>'itemTitle' from public.marketplace_account_entries where kind='conversation' and external_id='456'),'Gesprächsartikel','Gesprächsartikel ist im gespeicherten Stand verfügbar');
select is((select count(*)::int from public.marketplace_account_entries where external_id='edited'),1,'Gesprächsabruf erhält gespeicherte Inserate');
select is((select body->'feedbacks' from public.marketplace_account_entries where kind='profile'),'[{"id":"good"}]'::jsonb,'Nicht abgerufene Bewertungen bleiben erhalten');
select is((select last_complete_at from public.marketplace_account_sync_sources where area='feedback'),'2026-09-30T12:11:00Z'::timestamptz,'Gesprächsabruf behauptet keine neue vollständige Bewertungsliste');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(4))$$,'42501',null,'Auch anderer Admin darf fremde Sitzung nicht verwenden');
reset role;
select ok(not has_function_privilege('anon','public.marketplace_apply_vinted_import(uuid,uuid,uuid,uuid,jsonb)','execute'),'Anonyme Importe gesperrt');
select ok(not has_function_privilege('authenticated','public.marketplace_apply_vinted_import(uuid,uuid,uuid,uuid,jsonb)','execute'),'Browserclients dürfen keine Importdaten erfinden');
delete from public.platform_operators where user_id='30000000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(12))$$,'42501',null,'Entzogene Betreiberrechte verhindern Schreibabschluss');
reset role;
insert into public.platform_operators(user_id) values('30000000-0000-4000-8000-000000000001');
update public.marketplace_browser_sessions set expires_at=now()-interval '1 second' where public_id='30000000-0000-4000-8000-000000000031';
set local role service_role;
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(12))$$,'42501',null,'Abgelaufene Sitzung verhindert Import');
reset role;
-- Vollständige Artikeldetails gehören zur aktuellen Lesekopie, nicht zur Fotosicherung.
create function pg_temp.listing_content() returns jsonb language sql as $$
 select '{"title":"Schuhe","description":"Sehr gut erhalten","priceCents":2050,"currency":"EUR","categoryId":2738,"categoryLabel":"Fußballschuhe","brandId":254956,"brandLabel":"Jako","sizeId":607,"sizeLabel":"38","conditionId":2,"conditionLabel":"Sehr gut","colorIds":[1,2],"colorLabels":["Blau","Gelb"],"materialIds":[149],"materialLabels":["Acryl"],"packageSizeId":2,"attributes":{}}'::jsonb;
$$;
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
 values('30000000-0000-4000-8000-000000000051','30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000021','publication','details',
 '{"title":"Schuhe","imageUrls":["https://images.example.test/original.jpg"]}','2026-11-05T10:00:00Z','2026-11-05T10:00:00Z');
select ok(not has_function_privilege('anon','public.marketplace_cache_listing_content(uuid,uuid,uuid,text,jsonb)','execute'),'Anonyme dürfen keine Artikeldetails speichern');
select ok(not has_function_privilege('authenticated','public.marketplace_cache_listing_content(uuid,uuid,uuid,text,jsonb)','execute'),'Clients dürfen keine Anbieterbestätigung erfinden');
select ok(has_function_privilege('service_role','public.marketplace_cache_listing_content(uuid,uuid,uuid,text,jsonb)','execute'),'Worker darf bestätigte Artikeldetails speichern');
select is(public.marketplace_cache_listing_content('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000051','other',pg_temp.listing_content()),false,'Fremde Inseratkennung wird abgelehnt');
select is(public.marketplace_cache_listing_content('30000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000051','details',pg_temp.listing_content()),false,'Fremder Arbeitsbereich wird abgelehnt');
select is(public.marketplace_cache_listing_content('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000022','30000000-0000-4000-8000-000000000051','details',pg_temp.listing_content()),false,'Fremdes Konto wird abgelehnt');
select is(public.marketplace_cache_listing_content('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000051','details','{"priceCents":"ungueltig"}'),false,'Beschädigte Artikeldetails werden abgelehnt');
select ok(public.marketplace_cache_listing_content('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000051','details',pg_temp.listing_content()),'Bestätigte vollständige Artikeldetails speichern');
select is((select body->'listingContent' from public.marketplace_account_entries where external_id='details'),pg_temp.listing_content(),'Alle Merkmale sind in der Datenbank vorhanden');
select is((select body->'imageUrls' from public.marketplace_account_entries where external_id='details'),'["https://images.example.test/original.jpg"]'::jsonb,'Fotosicherung bleibt unverändert');
update public.marketplace_account_entries set body='{"title":"Schuhe","textState":"not_loaded"}' where external_id='details';
select is((select body->'listingContent' from public.marketplace_account_entries where external_id='details'),pg_temp.listing_content(),'Teilimporte erhalten die vollständigen Artikeldetails');
select ok((select body ? 'listingDetailsReadAt' from public.marketplace_account_entries where external_id='details'),'Teilimporte erhalten die Abrufzeit der Artikeldetails');
update public.marketplace_account_entries set body=jsonb_build_object('listingContent',pg_temp.listing_content()||'{"sizeLabel":"37","sizeId":606}'::jsonb,'listingDetailsReadAt','2000-01-01T00:00:00Z') where external_id='details';
select is((select body->'listingContent' from public.marketplace_account_entries where external_id='details'),pg_temp.listing_content(),'Alter Detailcache überschreibt keine neuere bestätigte Bearbeitung');
update public.marketplace_account_entries set body=jsonb_build_object('listingContent',pg_temp.listing_content()||'{"sizeLabel":"39","sizeId":608}'::jsonb,'listingDetailsReadAt',clock_timestamp()+interval '1 second') where external_id='details';
select is((select body->'listingContent'->>'sizeLabel' from public.marketplace_account_entries where external_id='details'),'39','Aktualisierte Artikelmerkmale ersetzen den vorherigen Stand');
update public.marketplace_account_entries set external_id='details-other',body='{"title":"Anderes Inserat"}' where external_id='details';
select ok(not (select body ? 'listingContent' from public.marketplace_account_entries where external_id='details-other'),'Geänderte Inseratbindung übernimmt keine fremden Artikeldetails');
select * from finish();
rollback;
