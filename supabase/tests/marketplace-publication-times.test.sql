\set on_error_stop on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('46700000-0000-4000-8000-000000000001','authenticated','authenticated','publication-times@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('46700000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values ('46700000-0000-4000-8000-000000000011','Publikationszeit'),('46700000-0000-4000-8000-000000000012','Anderer Workspace');
insert into public.workspace_members(workspace_id,user_id,role) values ('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('46700000-0000-4000-8000-000000000021','46700000-0000-4000-8000-000000000011','Eigenes Konto','connected','46701'),
 ('46700000-0000-4000-8000-000000000022','46700000-0000-4000-8000-000000000011','Anderes Konto','connected','46702'),
 ('46700000-0000-4000-8000-000000000023','46700000-0000-4000-8000-000000000012','Anderer Workspace','connected','46703');
insert into public.marketplace_browser_sessions(public_id,workspace_id,connection_id,started_by,provider_profile_id,expires_at) values
 ('46700000-0000-4000-8000-000000000031','46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021','46700000-0000-4000-8000-000000000001','publication-times',now()+interval '1 hour');
create function pg_temp.job(p_external_id text,p_action text default 'publish',p_state text default 'confirmed',p_provider_state text default 'active',p_account text default '46701',p_verified_at timestamptz default '2026-10-15T12:34:56.789Z') returns bigint language plpgsql as $$
declare v_draft bigint; v_job bigint;
begin
 insert into public.marketplace_listing_drafts(workspace_id,created_by) values ('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000001') returning id into v_draft;
 insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,requested_by,request_id,request_hash,draft_revision,authorization_version,external_account_id,execution_mode,action,snapshot,state,external_id,provider_state,verified_at)
 values ('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021',v_draft,'46700000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),1,1,p_account,'cloud',p_action,'{"secret":"private job contents"}',p_state,p_external_id,p_provider_state,p_verified_at) returning id into v_job;
 return v_job;
end;
$$;
create function pg_temp.cache(p_external_id text,p_body jsonb) returns void language sql as $$
 insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at) values
 ('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021','publication',p_external_id,p_body,'2026-01-01Z')
 on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body;
$$;
create function pg_temp.versions(p_session uuid default '46700000-0000-4000-8000-000000000031') returns table(external_id text,body jsonb,flipbase_published_at timestamptz) language plpgsql as $$
begin
 return query
 select * from public.marketplace_publication_versions('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021',p_session);
end;
$$;
select pg_temp.cache('46710','{"publicationState":"active","occurredAt":null,"publicationAge":{"value":2,"unit":"day"},"text":"geladen","textState":"loaded","detailCheckedAt":"2026-10-16T00:00:00Z","sourceUpdatedAt":"v1"}');
select pg_temp.job('46710');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46710'),'2026-10-15T12:34:56.789Z','Bestätigte eigene Veröffentlichung ersetzt gerundetes Vinted-Alter sofort');
select is((select body->'publicationAge' from public.marketplace_account_entries where external_id='46710'),'null'::jsonb,'Eigene genaue Zeit entfernt gerundetes Alter');
select is((select body->>'text' from public.marketplace_account_entries where external_id='46710'),'geladen','Bestätigung erhält Beschreibungs-Cache');
select is((select sort_at from public.marketplace_account_entries where external_id='46710'),'2026-10-15T12:34:56.789Z'::timestamptz,'Bestätigung korrigiert die globale Sortierung auf den belegten Zeitpunkt');
select pg_temp.cache('46710','{"publicationState":"active","occurredAt":"2020-01-01Z","publicationAge":{"value":8},"textState":"not_loaded"}');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46710'),'2026-10-15T12:34:56.789Z','Eigene Zeit hat beim Folgeimport Vorrang vor Anbieterzeit');
select pg_temp.job('46710','publish','confirmed','active','46701','2026-10-16Z');
select is(public.marketplace_confirmed_publication_time('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021','46710'),'2026-10-15T12:34:56.789Z'::timestamptz,'Mehrere Bestätigungen nutzen die erste bestätigte Zeit');
select pg_temp.job('46711','vinted_draft','confirmed','draft');
select pg_temp.job('46712','publish','confirmed','processing');
select pg_temp.job('46713','publish','writing',null);
select pg_temp.job('46714','publish','failed',null);
select pg_temp.job('46715','publish','outcome_unknown',null);
select pg_temp.job('46716','publish','confirmed','active','99999');
select pg_temp.job('46717');
select pg_temp.cache('46718','{"publicationState":"active"}');
select is((select body from public.marketplace_account_entries where external_id='46718'),'{"publicationState":"active","createdAt":null,"occurredAt":null,"publicationAge":null}'::jsonb,'Unbekanntes Alter bleibt unbekannt');
select pg_temp.cache('46719','{"publicationState":"active","occurredAt":"2026-09-01T00:00:00Z","publicationAge":null}');
select pg_temp.cache('46719','{"publicationState":"active","occurredAt":null}');
select is((select body->>'createdAt' from public.marketplace_account_entries where external_id='46719'),'2026-09-01T00:00:00Z','Quellerstellung bleibt ohne neue Werte erhalten');
select pg_temp.cache('46720','{"publicationState":"active","publicationAge":{"value":7,"unit":"day","observedAt":"2026-10-01Z"}}');
select pg_temp.cache('46720','{"publicationState":"active","occurredAt":null,"publicationAge":null}');
select is((select body->'publicationAge' from public.marketplace_account_entries where external_id='46720'),'{"value":7,"unit":"day","observedAt":"2026-10-01Z"}'::jsonb,'Einmal gelesenes Alter bleibt beim Folgeimport erhalten');
select pg_temp.cache('46721','{"publicationState":"active","occurredAt":"2026-09-02T00:00:00Z"}');
select pg_temp.cache('46721','{"publicationState":"active","publicationAge":{"value":8,"unit":"day"}}');
select is((select sort_at from public.marketplace_account_entries where external_id='46721'),'2026-09-02T00:00:00Z'::timestamptz,'Vorhandene Erstellung hat für die Reihenfolge Vorrang vor gerundetem Alter');
select ok(not has_function_privilege('authenticated','public.marketplace_publication_versions(uuid,uuid,uuid)','execute') and not has_function_privilege('anon','public.marketplace_publication_versions(uuid,uuid,uuid)','execute'),'Nur Worker kann Publikationsversionen lesen');
select ok(not has_function_privilege('authenticated','public.marketplace_confirmed_publication_time(uuid,uuid,text)','execute') and not has_function_privilege('anon','public.marketplace_confirmed_publication_time(uuid,uuid,text)','execute'),'Clients können den Zeithelfer nicht direkt lesen');
set local role service_role;
select is((select flipbase_published_at from pg_temp.versions() where external_id='46717'),'2026-10-15T12:34:56.789Z'::timestamptz,'Erste eigene Veröffentlichung erscheint auch ohne Cacheeintrag');
select is((select body from pg_temp.versions() where external_id='46717'),'{}'::jsonb,'Ohne Cache werden keine privaten Auftragsinhalte ausgegeben');
select is((select count(*) from pg_temp.versions() where external_id in ('46711','46712','46713','46714','46715','46716')),0::bigint,'Entwurf, Verarbeitung, Fehler, unklarer Ausgang und fremde Identität sind ausgeschlossen');
select is(public.marketplace_confirmed_publication_time('46700000-0000-4000-8000-000000000012','46700000-0000-4000-8000-000000000021','46710'),null::timestamptz,'Fremder Workspace liefert keine eigene Zeit');
select is(public.marketplace_confirmed_publication_time('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000022','46710'),null::timestamptz,'Anderes Konto liefert keine eigene Zeit');
select throws_ok($$select * from pg_temp.versions('46700000-0000-4000-8000-000000000032')$$,'42501',null,'Falsche Sitzung wird abgelehnt');
update public.marketplace_browser_sessions set expires_at=now()-interval '1 second' where public_id='46700000-0000-4000-8000-000000000031';
select throws_ok($$select * from pg_temp.versions()$$,'42501',null,'Abgelaufene Sitzung wird abgelehnt');
update public.marketplace_browser_sessions set expires_at=now()+interval '1 hour',state='stopping' where public_id='46700000-0000-4000-8000-000000000031';
select throws_ok($$select * from pg_temp.versions()$$,'42501',null,'Gestoppte Sitzung wird abgelehnt');
update public.marketplace_browser_sessions set state='active' where public_id='46700000-0000-4000-8000-000000000031';
update public.marketplace_connections set external_account_id='46709' where id='46700000-0000-4000-8000-000000000021';
select is(public.marketplace_confirmed_publication_time('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021','46710'),null::timestamptz,'Gewechselte aktuelle Kontoidentität bekommt keine alte Jobzeit');
reset role;
-- Weitere Kontogrenzen und Sitzungsrechte.
update public.marketplace_connections set external_account_id='46701' where id='46700000-0000-4000-8000-000000000021';
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body) values
 ('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000022','publication','46710','{}'),
 ('46700000-0000-4000-8000-000000000012','46700000-0000-4000-8000-000000000023','publication','46710','{}');
select is((select count(*) from public.marketplace_account_entries where external_id='46710' and body->>'publicationState'='unknown' and body->>'occurredAt' is null),2::bigint,'Gleiche Inseratkennung in anderem Konto oder Workspace erhält keine eigene Zeit');
select throws_ok($$select * from public.marketplace_publication_versions('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000022','46700000-0000-4000-8000-000000000031')$$,'42501',null,'Sitzung eines anderen Kontos ist unbrauchbar');
select throws_ok($$select * from public.marketplace_publication_versions('46700000-0000-4000-8000-000000000012','46700000-0000-4000-8000-000000000021','46700000-0000-4000-8000-000000000031')$$,'42501',null,'Workspace und Verbindung müssen zusammengehören');
update public.marketplace_browser_sessions set absolute_expires_at=now()-interval '1 second' where public_id='46700000-0000-4000-8000-000000000031';
select throws_ok($$select * from pg_temp.versions()$$,'42501',null,'Absolute Sitzungsgrenze gilt ebenfalls');
update public.marketplace_browser_sessions set absolute_expires_at=null,worker_id='46700000-0000-4000-8000-000000000041',worker_epoch=1 where public_id='46700000-0000-4000-8000-000000000031';
select throws_ok($$select * from pg_temp.versions()$$,'42501',null,'Ein nicht mehr aktiver Worker verliert den RPC-Zugriff');
update public.marketplace_browser_sessions set worker_id=null,worker_epoch=null where public_id='46700000-0000-4000-8000-000000000031';
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body) values ('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021','profile','99999','{}');
select throws_ok($$select * from pg_temp.versions()$$,'42501',null,'Ein widersprechendes Profil gibt keine Cachewerte eines anderen Kontos frei');
delete from public.marketplace_account_entries where kind='profile' and connection_id='46700000-0000-4000-8000-000000000021';
reset role;
update public.workspace_members set role='member' where workspace_id='46700000-0000-4000-8000-000000000011' and user_id='46700000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select * from pg_temp.versions()$$,'42501',null,'Widerrufene Kontoverwaltungsrechte werden erneut geprüft');
reset role;
update public.workspace_members set role='owner' where workspace_id='46700000-0000-4000-8000-000000000011' and user_id='46700000-0000-4000-8000-000000000001';
update public.workspaces set archived_at=now() where id='46700000-0000-4000-8000-000000000011';
set local role service_role;
select throws_ok($$select * from pg_temp.versions()$$,'42501',null,'Archivierte Workspaces werden abgelehnt');
reset role;
update public.workspaces set archived_at=null where id='46700000-0000-4000-8000-000000000011';
set local role service_role;
update public.marketplace_browser_sessions set operation_id='46700000-0000-4000-8000-000000000051' where public_id='46700000-0000-4000-8000-000000000031';
select throws_ok($$select * from pg_temp.versions()$$,'42501',null,'Nicht mehr freigegebener Leseauftrag verliert den Zugriff');
update public.marketplace_browser_sessions set operation_id=null where public_id='46700000-0000-4000-8000-000000000031';
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body)
select '46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021','publication','limit-'||n,'{}'::jsonb from generate_series(1,1001) n;
select is((select count(*) from pg_temp.versions()),1000::bigint,'RPC bleibt auf höchstens 1000 kontogebundene Versionen begrenzt');
delete from public.marketplace_account_entries where connection_id='46700000-0000-4000-8000-000000000021' and external_id like 'limit-%';
-- Die bestehende lokale Extension sendet keine Altersfelder. Ihr Import durchläuft denselben Cachetrigger.
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=now() where public_id='46700000-0000-4000-8000-000000000031';
update public.marketplace_connections set execution_mode='local' where id='46700000-0000-4000-8000-000000000021';
insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at) values
 ('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021','46700000-0000-4000-8000-000000000001',repeat('4',64),'46701',now()+interval '1 hour');
select lives_ok($$select public.marketplace_ingest_local_extension('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021',repeat('4',64),jsonb_build_object(
 'identity',jsonb_build_object('id','46701','username','seller'),'observedAt',clock_timestamp(),'publicationsComplete',false,
 'entries',jsonb_build_array(
 jsonb_build_object('kind','profile','externalId','46701','sortAt',clock_timestamp(),'body',jsonb_build_object('username','seller')),
 jsonb_build_object('kind','publication','externalId','46710','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Neuer Titel','occurredAt',null)),
 jsonb_build_object('kind','publication','externalId','46719','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Anbieterzeit','occurredAt',null)),
 jsonb_build_object('kind','publication','externalId','46720','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Anbieteralter','occurredAt',null)))))$$,'Lokaler Extension-Import bleibt mit fehlenden Alterswerten nutzbar');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46710' and connection_id='46700000-0000-4000-8000-000000000021'),'2026-10-15T12:34:56.789Z','Lokaler Import erhält bestätigte eigene Zeit');
select is((select body->>'createdAt' from public.marketplace_account_entries where external_id='46719'),'2026-09-01T00:00:00Z','Lokaler Import erhält die Quellerstellung');
select is((select body->'publicationAge' from public.marketplace_account_entries where external_id='46720'),'{"value":7,"unit":"day","observedAt":"2026-10-01Z"}'::jsonb,'Lokaler Import erhält gespeichertes gerundetes Alter');
select is((select body->>'text' from public.marketplace_account_entries where external_id='46710' and connection_id='46700000-0000-4000-8000-000000000021'),'geladen','Lokaler Folgeimport erhält auch den bestehenden Textcache');
reset role;
-- Der echte Abschlussweg muss seine neue Bestätigung schon im AFTER-Trigger sehen.
select pg_temp.job('46730','publish','writing',null);
update public.marketplace_listing_jobs set started_at='2026-10-15T12:33:00Z' where external_id='46730';
select pg_temp.cache('46730','{"publicationState":"active","occurredAt":null,"publicationAge":{"value":1,"unit":"day"}}');
select lives_ok($$select public.marketplace_listing_finish_job(j,'{"outcome":"confirmed","action":"publish","externalId":"46730","externalAccountId":"46701","providerState":"active","verifiedAt":"2026-10-15T12:34:56.789Z"}'::jsonb) from public.marketplace_listing_jobs j where j.external_id='46730'$$,'Bestehender Abschluss-RPC bestätigt einen begonnenen Inseratversuch');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46730'),'2026-10-15T12:34:56.789Z','AFTER-Trigger sieht Bestätigung aus demselben Abschluss-RPC und korrigiert vorhandenen Cache sofort');
select is((select body->'publicationAge' from public.marketplace_account_entries where external_id='46730'),'null'::jsonb,'Abschluss-RPC entfernt das gerundete Vinted-Alter');
alter table public.marketplace_account_entries disable trigger marketplace_preserve_publication_time;
select pg_temp.cache('46740','{"publicationState":"active","occurredAt":"invalid"}');
alter table public.marketplace_account_entries enable trigger marketplace_preserve_publication_time;
select pg_temp.cache('46740','{"publicationState":"active","publicationAge":{"value":4,"unit":"day"}}');
select is((select body->'publicationAge' from public.marketplace_account_entries where external_id='46740'),'{"value":4,"unit":"day"}'::jsonb,'Ungültige alte Zeit verdrängt kein neu gelesenes gültiges Alter');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46740'),null::text,'Ungültige alte Zeit wird nicht übernommen');
alter table public.marketplace_account_entries disable trigger marketplace_preserve_publication_time;
select pg_temp.cache('46741','{"publicationState":"active","occurredAt":"2099-01-01T00:00:00Z"}');
alter table public.marketplace_account_entries enable trigger marketplace_preserve_publication_time;
select pg_temp.cache('46741','{"publicationState":"active","publicationAge":{"value":5,"unit":"day"}}');
select is((select body->'publicationAge' from public.marketplace_account_entries where external_id='46741'),'{"value":5,"unit":"day"}'::jsonb,'Zukünftige alte Zeit verdrängt kein neu gelesenes gültiges Alter');
select pg_temp.cache('46742','{"publicationState":"active","publicationAge":{"value":6,"unit":"day"}}');
select pg_temp.cache('46742','{"publicationState":"active","occurredAt":"invalid","publicationAge":null}');
select is((select body->'publicationAge' from public.marketplace_account_entries where external_id='46742'),'{"value":6,"unit":"day"}'::jsonb,'Neu gelieferte ungültige Zeit löscht kein gespeichertes Alter');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46742'),null::text,'Ungültige neue Zeit bleibt unbekannt');

select ok(public.marketplace_publication_time_valid('2024-02-29T23:59:59.123Z',now()),'Gültiger ISO-Schalttag wird akzeptiert');
select ok(not public.marketplace_publication_time_valid('2026-02-29T23:59:59.123Z',now()),'Ungültiger Kalendertag wird nicht normalisiert');
select ok(not public.marketplace_publication_time_valid('1969-12-31T23:59:59Z',now()),'Zeit vor der Unix-Epoche wird wie im Worker ausgeschlossen');
select ok(not public.marketplace_publication_time_valid('infinity',now()),'Unendliche Zeit ist keine genaue Veröffentlichung');
select ok(not public.marketplace_publication_time_valid('2026-10-15T12:00:00Z','2026-10-15T11:00:00Z'),'Eine Zeit nach dem Abruf wird ausgeschlossen');
select ok(not has_function_privilege('authenticated','public.marketplace_publication_time_valid(text,timestamptz)','execute'),'Auch die interne Zeitprüfung bleibt dem Server vorbehalten');
-- Kleiderschrankstatus und globale Reihenfolge bleiben über Importe hinweg belastbar.
select pg_temp.cache('46801','{"publicationState":"draft","createdAt":"2026-02-01T09:00:00Z","occurredAt":"2026-02-01T09:00:00Z","publicationAge":{"value":2,"unit":"day","observedAt":"2026-10-01T00:00:00Z"}}');
select pg_temp.job('46801');
select is((select body->>'publicationState' from public.marketplace_account_entries where external_id='46801'),'draft','Aktuell belegter Vinted-Entwurf gewinnt vor historischer eigener Veröffentlichung');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46801'),null::text,'Entwurf erhält auch mit früherem Auftrag keine Veröffentlichungszeit');
select is((select body->>'createdAt' from public.marketplace_account_entries where external_id='46801'),'2026-02-01T09:00:00Z','Entwurf behält die tatsächliche Quellerstellung');
select is((select body->'publicationAge' from public.marketplace_account_entries where external_id='46801'),'null'::jsonb,'Entwurf erhält kein gerundetes Veröffentlichungsalter');
select is((select sort_at from public.marketplace_account_entries where external_id='46801'),'2026-02-01T09:00:00Z'::timestamptz,'Entwurf wird nach seiner Erstellung eingeordnet');
select pg_temp.cache('46801','{"title":"Alter Import","occurredAt":null,"isClosed":false,"isReserved":false}');
select is((select body->>'publicationState' from public.marketplace_account_entries where external_id='46801'),'draft','Alte Importversion ohne Statusfeld überschreibt keinen bekannten Entwurf');
select is((select body->>'createdAt' from public.marketplace_account_entries where external_id='46801'),'2026-02-01T09:00:00Z','Alter Import ohne Erstellungsfeld verliert keine Quellzeit');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46801'),null::text,'Fehlende Flags machen einen Entwurf nicht veröffentlicht');

select pg_temp.job('46802');
select pg_temp.cache('46802','{"publicationState":"hidden","createdAt":"2026-03-01T09:00:00Z"}');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46802'),null::text,'Verborgene Artikel erhalten keine aktive Veröffentlichungszeit');
select pg_temp.job('46803');
select pg_temp.cache('46803','{"publicationState":"unknown","createdAt":"2026-04-01T09:00:00Z"}');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46803'),null::text,'Explizit unbekannter Status bleibt trotz historischem Auftrag unbestätigt');
select pg_temp.cache('46804','{"isClosed":false,"isReserved":false}');
select is((select body->>'publicationState' from public.marketplace_account_entries where external_id='46804'),'unknown','Zwei falsche Altflags belegen keine aktive Anzeige');
select is((select sort_at from public.marketplace_account_entries where external_id='46804'),'1970-01-01T00:00:00Z'::timestamptz,'Unbekannte Chronologie bleibt unabhängig von der Importzeit am Ende');

select pg_temp.cache('46805','{"publicationState":"active","createdAt":"2026-01-03T09:00:00Z"}');
select pg_temp.cache('46806','{"publicationState":"active","createdAt":"2026-07-03T09:00:00Z"}');
select pg_temp.cache('46807','{"publicationState":"active","publicationAge":{"value":3,"unit":"day","observedAt":"2026-10-01T12:00:00Z"}}');
select is((select sort_at from public.marketplace_account_entries where external_id='46807'),'2026-09-28T12:00:00Z'::timestamptz,'Gerundetes Alter nutzt seinen gespeicherten Abrufanker');
select pg_temp.cache('46807','{"publicationState":"active","occurredAt":null}');
select is((select sort_at from public.marketplace_account_entries where external_id='46807'),'2026-09-28T12:00:00Z'::timestamptz,'Ein späterer Import verschiebt das gespeicherte Alter nicht nach vorne');
select is((select array_agg(external_id order by sort_at desc,id desc) from public.marketplace_account_entries where external_id in ('46804','46805','46806','46807')),array['46807','46806','46805','46804'],'Globale Reihenfolge nutzt Alter und Erstellung vor unbekannten Zeitpunkten');
select pg_temp.cache('46808','{"publicationState":"active","occurredAt":"2026-05-01T00:00:00Z"}');
select is((select body->>'createdAt' from public.marketplace_account_entries where external_id='46808'),'2026-05-01T00:00:00Z','Legacy-Anbieterzeit wird als Erstellung erhalten');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46808'),null::text,'Legacy-Anbieterzeit wird ohne eigenen Beleg nicht Veröffentlichung genannt');
select pg_temp.cache('46809','{"publicationState":"active","createdAt":"2099-01-01T00:00:00Z","publicationAge":{"value":-5,"unit":"day","observedAt":"2026-10-01T00:00:00Z"}}');
select is((select sort_at from public.marketplace_account_entries where external_id='46809'),'1970-01-01T00:00:00Z'::timestamptz,'Ungültige Quellen verdrängen keine echte Chronologie');
select pg_temp.cache('46810','{"publicationState":"active","publicationAge":{"value":2,"unit":"month","observedAt":"2026-10-01T00:00:00Z"}}');
select is((select sort_at from public.marketplace_account_entries where external_id='46810'),'2026-08-02T00:00:00Z'::timestamptz,'Monatsalter verwendet dieselben dreißig Tage wie die Importer');
select pg_temp.cache('46811','{"publicationState":"active","publicationAge":{"value":2,"unit":"day"}}');
select is((select sort_at from public.marketplace_account_entries where external_id='46811'),'1970-01-01T00:00:00Z'::timestamptz,'Gerundetes Alter ohne Quellenanker erfindet keinen Zeitpunkt');
select pg_temp.cache('46812','{"publicationState":"active","createdAt":"2026-06-01T00:00:00Z"}');
update public.marketplace_account_entries set observed_at=observed_at-interval '1 day',body='{"publicationState":"draft","createdAt":"2026-09-01T00:00:00Z"}' where external_id='46812';
select is((select body->>'publicationState' from public.marketplace_account_entries where external_id='46812'),'active','Veralteter Import überschreibt keinen neueren Zustand');
select is((select sort_at from public.marketplace_account_entries where external_id='46812'),'2026-06-01T00:00:00Z'::timestamptz,'Veralteter Import verändert die bestehende Reihenfolge nicht');
select pg_temp.cache('46813','{"publicationState":"draft","createdAt":"2026-06-01T00:00:00Z","metrics":{"views":10,"favorites":5}}');
select is((select count(*) from public.marketplace_listing_statistic_items where external_id='46813'),0::bigint,'Vinted-Entwurf erzeugt keinen aktiven Statistikartikel');

-- Ein erneut aktiver Artikel kann keine Bestätigung vor seinem letzten Entwurf erben.
select pg_temp.job('46814');
select pg_temp.cache('46814','{"publicationState":"draft","createdAt":"2026-06-01T00:00:00Z"}');
select pg_temp.cache('46814','{"publicationState":"active","createdAt":"2026-06-01T00:00:00Z"}');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46814'),null::text,'Entwurf zu aktiv übernimmt keine alte eigene Veröffentlichungszeit');
select pg_temp.cache('46814','{"publicationState":"active","occurredAt":null}');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46814'),null::text,'Auch weitere aktive Importe können die alte Veröffentlichung nicht reaktivieren');
select is((select sort_at from public.marketplace_account_entries where external_id='46814'),'2026-06-01T00:00:00Z'::timestamptz,'Nach einem Entwurf bleibt die Sortierung bei der belegten Erstellung');
select is(public.marketplace_confirmed_publication_time('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021','46814'),null::timestamptz,'Auch Cloud-Versionsleser erhalten keine Bestätigung vor dem letzten Entwurf');
select pg_temp.job('46814','publish','confirmed','active','46701',statement_timestamp());
select ok((select body->>'occurredAt' is not null from public.marketplace_account_entries where external_id='46814'),'Eine neu bestätigte eigene Veröffentlichung nach dem Entwurf ist wieder nutzbar');
select pg_temp.job('46815','publish','confirmed','active','46701','2099-01-01T00:00:00Z');
select pg_temp.cache('46815','{"publicationState":"active"}');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46815'),null::text,'Ein zukünftiger eigener Job ist kein gültiger Veröffentlichungsbeleg');

-- Der Bestandsabgleich korrigiert genau dieselben Zeilen wie der dauerhafte Trigger.
alter table public.marketplace_account_entries disable trigger marketplace_preserve_publication_time;
select pg_temp.cache('46820','{"occurredAt":"2026-05-02T03:04:05Z","text":"vollständig","textState":"loaded","transferSource":{"unrelated":"source"}}');
select pg_temp.cache('46821','{"publicationAge":{"value":8,"unit":"day","observedAt":"2026-10-01T00:00:00Z"},"isClosed":false,"isReserved":false}');
select pg_temp.cache('46822','{"publicationState":"draft","createdAt":"2026-05-01T00:00:00Z","occurredAt":"2026-10-15T12:34:56.789Z"}');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at)
values ('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000021','activity','46823','{"occurredAt":"2026-07-01T00:00:00Z"}','2026-07-01T00:00:00Z');
alter table public.marketplace_account_entries enable trigger marketplace_preserve_publication_time;
update public.marketplace_account_entries e set body=e.body where e.kind='publication' and exists(select 1 from public.marketplace_connections c
  where c.workspace_id=e.workspace_id and c.id=e.connection_id and c.marketplace='vinted');
select is((select body->>'createdAt' from public.marketplace_account_entries where external_id='46820'),'2026-05-02T03:04:05Z','Bestandsabgleich erhält alte Anbieterzeit als Erstellung');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46820'),null::text,'Bestandsabgleich entfernt die falsche Publikationsbehauptung');
select is((select body->>'publicationState' from public.marketplace_account_entries where external_id='46820'),'unknown','Bestandsabgleich erfindet für Altdaten keinen aktiven Status');
select is((select body->'transferSource' from public.marketplace_account_entries where external_id='46820'),'{"unrelated":"source"}'::jsonb,'Bestandsabgleich erhält vollständige unabhängige Quellfelder');
select is((select body->>'text' from public.marketplace_account_entries where external_id='46820'),'vollständig','Bestandsabgleich erhält die Beschreibung');
select is((select body->'publicationAge' from public.marketplace_account_entries where external_id='46821'),'{"value":8,"unit":"day","observedAt":"2026-10-01T00:00:00Z"}'::jsonb,'Bestandsabgleich erhält vorhandenen Quellenanker ohne neue Altersschätzung');
select is((select sort_at from public.marketplace_account_entries where external_id='46821'),'1970-01-01T00:00:00Z'::timestamptz,'Unbekannter Altstatus erhält durch ein Alterslabel keine Publikationschronologie');
select is((select body->>'occurredAt' from public.marketplace_account_entries where external_id='46822'),null::text,'Bestandsabgleich repariert falsch datierte Entwürfe');
select is((select sort_at from public.marketplace_account_entries where external_id='46823'),'2026-07-01T00:00:00Z'::timestamptz,'Bestandsabgleich verändert keine Aktivitätszeit');
select is((select body from public.marketplace_account_entries where external_id='46823'),'{"occurredAt":"2026-07-01T00:00:00Z"}'::jsonb,'Bestandsabgleich verändert keine andere Eintragsart');
select ok(not has_function_privilege('authenticated','public.marketplace_publication_age_sort_at(jsonb,timestamptz)','execute'),'Interne Alterssortierung erhält keine Browserfreigabe');

-- Mehr als eine echte API-Seite: gleiche Zeiten nutzen id als stabilen zweiten Schlüssel.
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('46700000-0000-4000-8000-000000000024','46700000-0000-4000-8000-000000000011','Seitenkonto','connected','46704');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at)
select ('46800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000024',
  'publication','page-'||n,jsonb_build_object('title','Page '||n,'publicationState','active','createdAt',case when n=61 then '2026-10-01T00:00:00Z' else '2026-01-01T00:00:00Z' end),clock_timestamp()
from generate_series(1,61) n;
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at)
values ('46800000-0000-4000-8000-000000000062','46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000024','publication','page-62','{"title":"Unbekannt","publicationState":"unknown"}',clock_timestamp());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"46700000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table publication_page_one as select public.marketplace_read_page('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000024','publication') as value;
create temporary table publication_page_two as select public.marketplace_read_page('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000024','publication',(select value->>'nextCursor' from publication_page_one)) as value;
select is((select value->'items'->0->>'title' from publication_page_one),'Page 61','Erste globale API-Seite beginnt mit der neuesten belegten Erstellung');
select is((select value->'items'->49->>'title' from publication_page_one),'Page 12','Gleiche Zeiten sind schon vor dem Blättern deterministisch geordnet');
select is((select value->'items'->0->>'title' from publication_page_two),'Page 11','Zweite API-Seite setzt die globale Reihenfolge lückenlos fort');
select is((select jsonb_array_length(value->'items') from publication_page_two),12,'Zweite API-Seite enthält alle übrigen Artikel');
select is((select value->'items'->11->>'title' from publication_page_two),'Unbekannt','Unbekanntes Alter landet auf der letzten API-Seite');
select is((select count(distinct item->>'id') from (select jsonb_array_elements(value->'items') item from publication_page_one union all select jsonb_array_elements(value->'items') from publication_page_two) pages),62::bigint,'Mehrseitige Antwort enthält keine doppelten oder verlorenen IDs');
reset role;
update public.marketplace_account_entries set body=body,sort_at=clock_timestamp() where connection_id='46700000-0000-4000-8000-000000000024';
set local role authenticated;
select is(public.marketplace_read_page('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000024','publication'),(select value from publication_page_one),'Erneuter Import desselben Bestands verändert weder erste Seite noch Cursor');
select is(public.marketplace_read_page('46700000-0000-4000-8000-000000000011','46700000-0000-4000-8000-000000000024','publication',(select value->>'nextCursor' from publication_page_one)),(select value from publication_page_two),'Erneuter Import verändert auch die Folgeseite nicht');
reset role;

select * from finish();
rollback;
