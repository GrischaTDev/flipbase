\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values ('49200000-0000-4000-8000-000000000001','authenticated','authenticated','ka-read@example.test','{}','{}'),('49200000-0000-4000-8000-000000000002','authenticated','authenticated','ka-foreign@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('49200000-0000-4000-8000-000000000001'),('49200000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('49200000-0000-4000-8000-000000000011','KA Read'),('49200000-0000-4000-8000-000000000012','KA Foreign');
insert into public.workspace_members(workspace_id,user_id,role) values ('49200000-0000-4000-8000-000000000011','49200000-0000-4000-8000-000000000001','owner');
insert into public.kleinanzeigen_connections(id,workspace_id,external_account_id,display_name,account_type,created_by,status,last_synced_at,quota_used,quota_observed_at) overriding system value values
(9007199254740993,'49200000-0000-4000-8000-000000000011','123','Privates Testkonto','private','49200000-0000-4000-8000-000000000001','connected','2026-10-16T06:00:00Z',8,'2026-10-16T06:00:00Z'),
(9007199254740994,'49200000-0000-4000-8000-000000000011','124','Zweites Testkonto','commercial','49200000-0000-4000-8000-000000000001','needs_login',null,null,null);
insert into public.kleinanzeigen_local_grants(workspace_id,connection_id,approved_by,installation_id,token_hash,expires_at,can_publish) values ('49200000-0000-4000-8000-000000000011',9007199254740993,'49200000-0000-4000-8000-000000000001','49200000-0000-4000-8000-000000000031',repeat('a',64),clock_timestamp()+interval '1 day',false);
insert into public.kleinanzeigen_publications(workspace_id,connection_id,external_id,title,url,state,available,observed_at) values
('49200000-0000-4000-8000-000000000011',9007199254740993,'101','Gelbe Jacke','https://www.kleinanzeigen.de/s-anzeige/jacke/101-160-1','active',true,'2026-10-16T06:00:00Z'),
('49200000-0000-4000-8000-000000000011',9007199254740993,'102','Blaue Hose','https://www.kleinanzeigen.de/s-anzeige/hose/102-160-1','unknown',true,'2026-10-16T06:00:00Z'),
('49200000-0000-4000-8000-000000000011',9007199254740993,'103','Nicht mehr sichtbar','https://www.kleinanzeigen.de/s-anzeige/alt/103-160-1','active',false,'2026-10-16T06:00:00Z'),
('49200000-0000-4000-8000-000000000011',9007199254740994,'201','Anderes Konto','https://www.kleinanzeigen.de/s-anzeige/anderes/201-160-1','active',true,'2026-10-16T06:00:00Z');
update public.kleinanzeigen_publications set price_cents=1500,currency='EUR',image_url='https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/test?rule=$_2.JPG',published_on='2026-08-21' where external_id='101';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"49200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.ka.accounts',public.kleinanzeigen_read_accounts('49200000-0000-4000-8000-000000000011')::text,true);
select is(current_setting('test.ka.accounts')::jsonb->>'canManage','true','Berechtigter Nutzer darf eigene Konten lesen');
select is(jsonb_array_length(current_setting('test.ka.accounts')::jsonb->'accounts'),2,'Beide Konten werden getrennt gelesen');
select set_config('test.ka.account',(select value::text from jsonb_array_elements(current_setting('test.ka.accounts')::jsonb->'accounts') where value->>'connectionId'='9007199254740993'),true);
select is(jsonb_typeof(current_setting('test.ka.account')::jsonb->'connectionId'),'string','Große Konto-ID bleibt ein exakter Dezimalstring');
select is(current_setting('test.ka.account')::jsonb->>'listingCount','2','Nur bestätigte aktuell verfügbare Anzeigen werden gezählt');
select is(current_setting('test.ka.account')::jsonb->>'activeCount',null,'Unbekannter Anzeigenzustand erfindet keine vollständige Aktivanzahl');
select is(current_setting('test.ka.account')::jsonb#>>'{quota,used}','8','Kontingent kommt aus eigener offizieller Beobachtung, nicht aus zwei Inseraten');
select is(current_setting('test.ka.account')::jsonb#>>'{localGrant,canPublish}','false','Lesefreigabe wird nicht zur Schreibfreigabe');
select ok(current_setting('test.ka.accounts') not like '%'||repeat('a',64)||'%' and current_setting('test.ka.accounts') not like '%token_hash%','Hash und Rohsecret bleiben verborgen');
select is((select value->>'listingCount' from jsonb_array_elements(current_setting('test.ka.accounts')::jsonb->'accounts') where value->>'connectionId'='9007199254740994'),null,'Ohne vollständigen Abgleich bleibt die Gesamtzahl unbekannt');
select is(public.kleinanzeigen_read_accounts('49200000-0000-4000-8000-000000000012')->>'canManage','false','Fremder Workspace liefert keine Verwaltungsfreigabe');
select set_config('test.ka.page',public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,1,'all','',null,null)::text,true);
select is(jsonb_array_length(current_setting('test.ka.page')::jsonb->'items'),1,'Serverseitige erste Seite respektiert Seitengröße');
select is(current_setting('test.ka.page')::jsonb->>'total','2','Gesamtzahl gilt über die ganze gefilterte bestätigte Lesekopie');
select ok(current_setting('test.ka.page')::jsonb->>'nextId' is not null,'Weitere Seite wird ausdrücklich angeboten');
select is(jsonb_array_length(public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,1,'all','',(current_setting('test.ka.page')::jsonb->>'nextId')::bigint,(current_setting('test.ka.page')::jsonb->>'snapshotAt')::timestamptz)->'items'),1,'Zweite Seite bleibt am selben Account und Snapshot');
select is(public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,25,'all','Jacke',null,null)#>>'{items,0,priceCents}','1500','Lesekopie reicht den Preis weiter');
select is(public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,25,'all','Jacke',null,null)#>>'{items,0,currency}','EUR','Lesekopie reicht die Waehrung weiter');
select is(public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,25,'all','Jacke',null,null)#>>'{items,0,imageUrl}','https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/test?rule=$_2.JPG','Lesekopie reicht das Vorschaubild weiter');
select is(public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,25,'all','Jacke',null,null)#>>'{items,0,publishedOn}','2026-08-21','Lesekopie reicht den Kalendertag weiter');
select is(public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,25,'all','jAcKe',null,null)->>'total','1','Titelsuche gilt unabhängig von Großschreibung über alle Anzeigen');
select is(public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,25,'ended','',null,null)->>'total','1','Nicht verfügbare Anzeigen bleiben getrennt abrufbar');
select throws_ok($$select public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000012',9007199254740993,25,'all','',null,null)$$,'42501',null,'Fremder Workspace erhält keine Inserate');
select throws_ok($$select public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,0,'all','',null,null)$$,'22023',null,'Ungültige Seitengröße abgelehnt');
select throws_ok($$select public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,25,'all','',1,null)$$,'22023',null,'Cursor benötigt den zugehörigen Snapshot');
select throws_ok($$select public.kleinanzeigen_read_publications('49200000-0000-4000-8000-000000000011',9007199254740993,25,'all','',1,'2026-10-15T06:00:00Z')$$,'40001',null,'Veralteter Snapshot überschreibt keine neuere Seitenauswahl');
select set_config('request.jwt.claims','{"sub":"49200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(jsonb_array_length(public.kleinanzeigen_read_accounts('49200000-0000-4000-8000-000000000011')->'accounts'),0,'Anderer Nutzer sieht keine Konten');
reset role;
select ok(not has_function_privilege('anon','public.kleinanzeigen_read_accounts(uuid)','execute'),'Anonyme lesen keine Kontoübersicht');
select * from finish();
rollback;
