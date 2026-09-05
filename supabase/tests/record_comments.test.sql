\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select has_table('public','record_comments','Kommentare besitzen eine eigene Tabelle');
select ok((select relrowsecurity from pg_class where oid='public.record_comments'::regclass),'RLS ist aktiv');
select ok(not has_table_privilege('anon','public.record_comments','select'),'Anonym kein Tabellenlesen');
select ok(not has_table_privilege('authenticated','public.record_comments','update'),'Keine Kommentar-Änderungen');
select ok(not has_table_privilege('authenticated','public.record_comments','delete'),'Keine Kommentar-Löschung');
select ok(not has_column_privilege('authenticated','public.record_comments','created_at','insert'),'Zeit stammt nur vom Server');
select ok(not has_column_privilege('authenticated','public.record_comments','id','insert'),'ID stammt nur vom Server');
select ok(not has_function_privilege('anon','public.list_record_timeline(uuid,text,uuid,timestamptz,text,uuid,integer)','execute'),'Anonym kein RPC-Zugriff');
select ok(not has_function_privilege('service_role','public.list_record_timeline(uuid,text,uuid,timestamptz,text,uuid,integer)','execute'),'Kein allgemeiner Dienstrollen-Endpunkt');
select ok(not has_table_privilege('authenticated','public.business_events','insert,update,delete'),'Geschäftsjournal bleibt gesperrt');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('96000000-0000-4000-8000-000000000001','authenticated','authenticated','chronicle-owner@example.test','{}','{"full_name":"Alex"}'),
('96000000-0000-4000-8000-000000000002','authenticated','authenticated','chronicle-member@example.test','{}','{"full_name":"Kim"}'),
('96000000-0000-4000-8000-000000000003','authenticated','authenticated','chronicle-other@example.test','{}','{}');
insert into public.workspaces(id,name) values ('96000000-0000-4000-8000-000000000010','Chronik'),('96000000-0000-4000-8000-000000000011','Fremd');
insert into public.workspace_members(workspace_id,user_id,role) values
('96000000-0000-4000-8000-000000000010','96000000-0000-4000-8000-000000000001','owner'),
('96000000-0000-4000-8000-000000000010','96000000-0000-4000-8000-000000000002','member'),
('96000000-0000-4000-8000-000000000011','96000000-0000-4000-8000-000000000003','owner');
insert into public.purchases(id,workspace_id,type,title) values
('96000000-0000-4000-8000-000000000020','96000000-0000-4000-8000-000000000010','single','Einkauf'),
('96000000-0000-4000-8000-000000000021','96000000-0000-4000-8000-000000000011','single','Fremder Einkauf');
insert into public.sales(id,workspace_id,platform,sale_price) values ('96000000-0000-4000-8000-000000000030','96000000-0000-4000-8000-000000000010','ebay',10);
insert into public.business_events(id,workspace_id,entity_type,entity_id,event_type,actor_id,created_at,changes) values
('96000000-0000-4000-8000-000000000040','96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000020','purchase_corrected','96000000-0000-4000-8000-000000000001','2026-09-05T10:00:00Z','{"purchase_price":{"before":10,"after":12}}');
insert into public.record_comments(id,workspace_id,purchase_id,author_id,body,created_at) values
('96000000-0000-4000-8000-000000000041','96000000-0000-4000-8000-000000000010','96000000-0000-4000-8000-000000000020','96000000-0000-4000-8000-000000000001','Gleichstand','2026-09-05T10:00:00Z'),
('96000000-0000-4000-8000-000000000042','96000000-0000-4000-8000-000000000010','96000000-0000-4000-8000-000000000020','96000000-0000-4000-8000-000000000001','Älter','2026-09-04T10:00:00Z');

create function pg_temp.add_comment(p_body text, p_author uuid default '96000000-0000-4000-8000-000000000002',p_purchase uuid default '96000000-0000-4000-8000-000000000020',p_sale uuid default null,p_workspace uuid default '96000000-0000-4000-8000-000000000010') returns void language sql as $$
insert into public.record_comments(workspace_id,purchase_id,sale_id,author_id,body) values(p_workspace,p_purchase,p_sale,p_author,p_body);
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.record_comments),2,'Ein normales Mitglied liest Kommentare anderer Mitglieder');
select results_eq($$select kind from public.list_record_timeline('96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000020')$$,array['event','comment','comment']::text[],'Gemeinsame stabile Reihenfolge bei gleichem Zeitpunkt');
select results_eq($$select id from public.list_record_timeline('96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000020','2026-09-05T10:00:00Z','event','96000000-0000-4000-8000-000000000040',1)$$,array['96000000-0000-4000-8000-000000000041'::uuid],'Cursor wechselt bei gleicher Zeit von Ereignis zu Kommentar');
select results_eq($$select id from public.list_record_timeline('96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000020','2026-09-05T10:00:00Z','comment','96000000-0000-4000-8000-000000000041',1)$$,array['96000000-0000-4000-8000-000000000042'::uuid],'Nächste Seite wiederholt keine Einträge');
select is((select actor_name from public.list_record_timeline('96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000020') limit 1),'Alex','Nur Profil-Anzeigename');
select lives_ok($$select pg_temp.add_comment('Ein Mitglied schreibt')$$,'Mitglied darf schreiben');
select lives_ok($$select pg_temp.add_comment('Verkauf',p_purchase=>null,p_sale=>'96000000-0000-4000-8000-000000000030')$$,'Auch Verkaufskommentare erlaubt');
select is((select count(*)::int from public.list_record_timeline('96000000-0000-4000-8000-000000000010','sale','96000000-0000-4000-8000-000000000030')),1,'Verkauf und Einkauf bleiben getrennt');
select throws_ok($$select pg_temp.add_comment('Gefälscht','96000000-0000-4000-8000-000000000001')$$,'42501',null,'Autor darf nicht gefälscht werden');
select throws_ok($$select pg_temp.add_comment('Falscher Einkauf',p_purchase=>'96000000-0000-4000-8000-000000000021')$$,'42501',null,'Fremde Zuordnung gesperrt');
select throws_ok($$select pg_temp.add_comment('Beides',p_sale=>'96000000-0000-4000-8000-000000000030')$$,'23514',null,'Genau ein Datensatz erforderlich');
select throws_ok($$select pg_temp.add_comment('')$$,'23514',null,'Leerer Kommentar gesperrt');
select throws_ok($$select pg_temp.add_comment(E' \t\n')$$,'23514',null,'Reiner Leerraum gesperrt');
select throws_ok($$select pg_temp.add_comment(repeat('a',5001))$$,'23514',null,'Mehr als 5000 Zeichen gesperrt');
select lives_ok($$select pg_temp.add_comment(repeat('a',5000))$$,'5000 Zeichen erlaubt');
select throws_ok($$select public.list_record_timeline('96000000-0000-4000-8000-000000000011','purchase','96000000-0000-4000-8000-000000000021')$$,'42501',null,'Fremder Workspace im RPC gesperrt');
select throws_ok($$select public.list_record_timeline('96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000021')$$,'42501',null,'Fremder Datensatz mit eigener Workspace-ID gesperrt');
select throws_ok($$select public.list_record_timeline('96000000-0000-4000-8000-000000000010',null,'96000000-0000-4000-8000-000000000020')$$,'42501',null,'Null-Typ ist kein gültiger Bereich');
select throws_ok($$select public.list_record_timeline('96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000020',p_page_size=>101)$$,'22023',null,'Maximal 100 Einträge');
select throws_ok($$select public.list_record_timeline('96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000020',p_cursor_kind=>'event')$$,'22023',null,'Unvollständiger Cursor gesperrt');
select throws_ok($$update public.record_comments set body='Geändert'$$,'42501',null,'Ändern scheitert tatsächlich');
select throws_ok($$delete from public.record_comments$$,'42501',null,'Löschen scheitert tatsächlich');
select throws_ok($$update public.business_events set reason='Geändert'$$,'42501',null,'Journaländerung scheitert tatsächlich');
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.record_comments),0,'Fremdes Mitglied liest keine Kommentare');
select throws_ok($$select pg_temp.add_comment('Fremder',p_author=>'96000000-0000-4000-8000-000000000003')$$,'42501',null,'Fremdes Mitglied kann nicht schreiben');
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
select public.archive_workspace('96000000-0000-4000-8000-000000000010');
select throws_ok($$select pg_temp.add_comment('Archiv',p_author=>'96000000-0000-4000-8000-000000000001')$$,'55000',null,'Archiv sperrt Schreiben');
select lives_ok($$select public.list_record_timeline('96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000020')$$,'Archiv bleibt lesbar');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select * from public.record_comments$$,'42501',null,'Anonymes Lesen gesperrt');
select throws_ok($$select public.list_record_timeline('96000000-0000-4000-8000-000000000010','purchase','96000000-0000-4000-8000-000000000020')$$,'42501',null,'Anonymer RPC gesperrt');
reset role;
select * from finish();
rollback;
