\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select has_table('public','platform_error_events','Fehlerprotokoll ist dauerhaft');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('56000000-0000-4000-8000-000000000001','authenticated','authenticated','log-operator@example.test','{}','{}'),
 ('56000000-0000-4000-8000-000000000002','authenticated','authenticated','log-member@example.test','{}','{}');
insert into public.platform_operators(user_id) values('56000000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('56000000-0000-4000-8000-000000000011','Protokolltest');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('56000000-0000-4000-8000-000000000011','56000000-0000-4000-8000-000000000001','owner'),
 ('56000000-0000-4000-8000-000000000011','56000000-0000-4000-8000-000000000002','admin');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('56000000-0000-4000-8000-000000000021','56000000-0000-4000-8000-000000000011','Wiehen Test','connected','560');

-- Rechte: niemand schreibt direkt, nur Betreiber lesen.
select ok(not has_table_privilege('authenticated','public.platform_error_events','insert'),'Protokoll ist nicht direkt fälschbar');
select ok(not has_table_privilege('service_role','public.platform_error_events','insert'),'Auch Worker schreiben nur über Fehlerzustände');
select ok(not has_function_privilege('authenticated','public.platform_record_error(text,text,text,text,text,uuid,text,uuid,text,jsonb)','execute'),'Interner Schreibweg bleibt verborgen');
select ok(not has_function_privilege('anon','public.platform_report_app_error(text,text,text,text)','execute'),'Anonyme App-Meldungen gesperrt');

-- Ein fehlgeschlagener Abruf wird mit Konto und Fehlercode protokolliert.
insert into public.marketplace_operations(id,workspace_id,connection_id,requested_by,authorization_kind,authorization_version)
 values('56000000-0000-4000-8000-000000000031','56000000-0000-4000-8000-000000000011','56000000-0000-4000-8000-000000000021',
  '56000000-0000-4000-8000-000000000001','scheduled_read',1);
select is((select count(*) from public.platform_error_events where reference_id='56000000-0000-4000-8000-000000000031')::int,0,'Neuer Auftrag erzeugt keinen Eintrag');
update public.marketplace_operations set state='failed',stage='cleanup',error_code='cleanup',finished_at=clock_timestamp()
 where id='56000000-0000-4000-8000-000000000031';
select is((select area||'|'||severity||'|'||code||'|'||account_label from public.platform_error_events where reference_id='56000000-0000-4000-8000-000000000031'),
 'vinted_sync|error|cleanup|Wiehen Test','Abbruch steht mit Bereich, Code und Konto im Protokoll');
select is((select detail->>'authorization_kind' from public.platform_error_events where reference_id='56000000-0000-4000-8000-000000000031'),'scheduled_read','Technische Merkmale stehen in den Details');
update public.marketplace_operations set stage='cleanup' where id='56000000-0000-4000-8000-000000000031';
select is((select count(*) from public.platform_error_events where reference_id='56000000-0000-4000-8000-000000000031')::int,1,'Unveränderter Zustand wird nicht doppelt protokolliert');

-- Pausen der Automatik: endgültige als Fehler, vorübergehende als Hinweis.
insert into public.marketplace_sync_schedules(workspace_id,connection_id,enabled,activated_by,interval_minutes)
 values('56000000-0000-4000-8000-000000000011','56000000-0000-4000-8000-000000000021',true,'56000000-0000-4000-8000-000000000001',10);
update public.marketplace_sync_schedules set paused_reason='network' where connection_id='56000000-0000-4000-8000-000000000021';
update public.marketplace_sync_schedules set paused_reason='retry_limit',enabled=false where connection_id='56000000-0000-4000-8000-000000000021';
update public.marketplace_sync_schedules set paused_reason=null where connection_id='56000000-0000-4000-8000-000000000021';
select is((select string_agg(severity||':'||code,',' order by id) from public.platform_error_events where source='marketplace_sync_schedules'),
 'warning:network,error:retry_limit','Pausen erscheinen abgestuft, das Aufheben nicht');

-- Feed-Bot: jeder neue Zyklusfehler, aber kein Wiederholen desselben Textes.
insert into public.sniper_runtime_status(id,reported_at,requests_last_minute,rejected_last_minute,request_budget,last_cycle_error)
 values(1,clock_timestamp(),0,0,10,'Vinted antwortet nicht') on conflict(id) do nothing;
update public.sniper_runtime_status set last_cycle_error='Vinted antwortet nicht';
update public.sniper_runtime_status set last_cycle_error='HTTP 429';
select ok((select count(*) from public.platform_error_events where area='feed_bot' and message='HTTP 429')=1,'Neuer Zyklusfehler steht mit Text im Protokoll');

-- App-Meldungen: nur angemeldet, gedrosselt.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(public.platform_report_app_error('forbidden','Du hast keinen Verwaltungszugriff auf diese Marktplatzkonten.','/vinted','mobile'),'App-Fehler wird angenommen');
select ok(not public.platform_report_app_error('forbidden','Du hast keinen Verwaltungszugriff auf diese Marktplatzkonten.','/vinted','mobile'),'Gleiche Meldung wird gedrosselt');
select is((select count(*) from public.platform_error_events)::int,0,'Nicht-Betreiber sehen das Protokoll nicht');
select throws_ok($$select public.platform_error_events_list('app')$$,'42501',null,'Nicht-Betreiber erhalten keine Liste');

select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select e->>'userEmail' from jsonb_array_elements(public.platform_error_events_list('app')) e limit 1),'log-member@example.test','Betreiber sehen, wem die Meldung gehört');
select is((select e->>'workspaceName' from jsonb_array_elements(public.platform_error_events_list('vinted_sync')) e where e->>'source'='marketplace_operations'),'Protokolltest','Liste nennt den Workspace');
select ok((public.platform_error_events_summary()->'vinted_sync'->>'errorsLastDay')::int>=2,'Übersicht zählt Fehler je Bereich');
select throws_ok($$select public.platform_error_events_list('unknown')$$,'22023',null,'Unbekannter Bereich wird abgelehnt');
reset role;

-- Aufbewahrung: Alte Einträge verschwinden beim nächsten Schreiben.
insert into public.platform_error_events(area,source,code,occurred_at) values('app','app','old',clock_timestamp()-interval '31 days');
update public.marketplace_operations set state='running' where id='56000000-0000-4000-8000-000000000031';
update public.marketplace_operations set state='failed' where id='56000000-0000-4000-8000-000000000031';
select is((select count(*) from public.platform_error_events where code='old')::int,0,'Einträge älter als 30 Tage werden entfernt');

select * from finish();
rollback;
