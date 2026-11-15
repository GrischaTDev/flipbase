\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('57100000-0000-4000-8000-000000000001','authenticated','authenticated','action-dialog@example.test','{}','{}');
insert into public.platform_operators(user_id) values('57100000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('57100000-0000-4000-8000-000000000011','Browserdialoge');
insert into public.workspace_members(workspace_id,user_id,role) values('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,execution_mode,external_account_id) values
 ('57100000-0000-4000-8000-000000000021','57100000-0000-4000-8000-000000000011','Einrichtung','needs_login','local',null),
 ('57100000-0000-4000-8000-000000000022','57100000-0000-4000-8000-000000000011','Erneute Anmeldung','needs_login','cloud','5712'),
 ('57100000-0000-4000-8000-000000000023','57100000-0000-4000-8000-000000000011','Belegt','connected','cloud','5713');
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values
 ('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000022','dialog-reauth-profile');
insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at,enabled,verified_at)
  values('action-dialog-ip',repeat('7',64),'action-dialog-order','DE',clock_timestamp()+interval '30 days',true,clock_timestamp());
insert into public.marketplace_cloud_setups(public_id,workspace_id,connection_id,requested_by,request_id,is_new_connection,cloud_ip_id,state,provider_profile_id,worker_id,worker_epoch)
  select '57100000-0000-4000-8000-000000000031','57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000021','57100000-0000-4000-8000-000000000001',gen_random_uuid(),false,id,'login','chromium_57100000-0000-4000-8000-000000000051','57100000-0000-4000-8000-000000000041',1 from public.marketplace_cloud_ips where network_id='action-dialog-ip';
select public.marketplace_worker_claim('57100000-0000-4000-8000-000000000041');
select public.marketplace_browser_capacity_report('57100000-0000-4000-8000-000000000041',1,1);
create temporary table dialog_context(name text primary key,body jsonb);
grant all on dialog_context to authenticated,service_role;
create function pg_temp.setup_presence(p_connected boolean,p_dialog uuid default '57100000-0000-4000-8000-000000000081') returns jsonb language sql as $$
 select public.marketplace_cloud_setup_presence('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000031',p_dialog,p_connected);
$$;
create function pg_temp.setup_enqueue(p_dialog uuid default '57100000-0000-4000-8000-000000000081') returns jsonb language sql as $$
 select public.marketplace_account_action_enqueue('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000021',gen_random_uuid(),'cloud_setup_open',jsonb_build_object('setupId','57100000-0000-4000-8000-000000000031','dialogId',p_dialog))->'action';
$$;
create function pg_temp.reauth_presence(p_connected boolean) returns jsonb language sql as $$
 select public.marketplace_browser_dialog_presence('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000022','57100000-0000-4000-8000-000000000083',p_connected);
$$;
create function pg_temp.reauth_enqueue() returns jsonb language sql as $$
 select public.marketplace_account_action_enqueue('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000022',gen_random_uuid(),'cloud_session_open','{"dialogId":"57100000-0000-4000-8000-000000000083"}')->'action';
$$;
create function pg_temp.claim() returns jsonb language sql as $$ select public.marketplace_browser_work_claim('57100000-0000-4000-8000-000000000041',1,gen_random_uuid(),true)->'claim'; $$;
create function pg_temp.check_action(p_name text) returns jsonb language sql as $$
 select public.marketplace_account_action_check((body->>'actionId')::uuid,(body->>'claimToken')::uuid,(body->>'workerId')::uuid,1,(body->>'runnerId')::uuid,false) from dialog_context where name=p_name;
$$;
create function pg_temp.finish_action(p_name text) returns boolean language sql as $$
 select public.marketplace_account_action_finish((body->>'actionId')::uuid,(body->>'claimToken')::uuid,(body->>'workerId')::uuid,1,(body->>'runnerId')::uuid,'succeeded',jsonb_build_object('id',body->>'sessionId')) from dialog_context where name=p_name;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select pg_temp.setup_enqueue()$$,'22023',null,'Einrichtung startet niemals ohne verbundenen Dialog');
select is(pg_temp.setup_presence(true)->>'startState','idle','Verbundener Dialog reserviert allein keinen Browser');
reset role;
insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at) values
 ('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000023','57100000-0000-4000-8000-000000000001','busy-dialog-profile',clock_timestamp()+interval '10 minutes');
set local role authenticated;
insert into dialog_context values('expired',pg_temp.setup_enqueue());
select is((select body->>'waitReason' from dialog_context where name='expired'),'pool_busy','Einrichtungsauftrag wird bei belegtem Pool dauerhaft angenommen');
select is(pg_temp.setup_presence(true)->>'startState','queued','Setup-Lebenszyklus und wartender Browserstart bleiben getrennt');
select is(pg_temp.setup_presence(true)->>'startActionId',(select body->>'id' from dialog_context where name='expired'),'Setupansicht bindet die Startversion an die konkrete Aktion');
reset role;
update public.marketplace_cloud_setups set browser_presence_expires_at=clock_timestamp()-interval '1 second' where public_id='57100000-0000-4000-8000-000000000031';
set local role service_role;
select is(pg_temp.claim(),null::jsonb,'Abgelaufene Dialogpräsenz öffnet keinen Browser');
select is((select state from public.marketplace_account_actions where public_id=(select (body->>'id')::uuid from dialog_context where name='expired')),'cancelled','Nicht mehr verbundener wartender Start wird abgebrochen');
set local role authenticated;
select pg_temp.setup_presence(true);
insert into dialog_context values('closed',pg_temp.setup_enqueue());
select isnt(pg_temp.setup_presence(true)->>'startActionId',(select body->>'id' from dialog_context where name='expired'),'Neue Aktion hat eigene Identität auch bei erneut beginnender Versionsnummer');
select is(pg_temp.setup_presence(true)->>'version','1','Neue wartende Aktion darf trotz älterem Abschluss mit Version eins beginnen');
select pg_temp.setup_presence(false,'57100000-0000-4000-8000-000000000082');
select is(pg_temp.setup_presence(true)->>'startState','queued','Verspäteter Abschluss eines anderen Dialogs widerruft nicht den aktuellen Start');
select is(pg_temp.setup_presence(false)->>'startState','idle','Schließen des richtigen Dialogs entfernt den wartenden Start');
reset role;
select is((select state from public.marketplace_account_actions where public_id=(select (body->>'id')::uuid from dialog_context where name='closed')),'cancelled','Geschlossener Dialog wird später nicht automatisch ausgeführt');
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where state='active';
set local role authenticated;
select pg_temp.setup_presence(true,'57100000-0000-4000-8000-000000000082');
insert into dialog_context values('setup',pg_temp.setup_enqueue('57100000-0000-4000-8000-000000000082'));
set local role service_role;
insert into dialog_context values('setup_claim',pg_temp.claim());
select is((select body->>'actionKind' from dialog_context where name='setup_claim'),'cloud_setup_open','Einrichtungsstart nutzt die gemeinsame Auftragsvergabe');
select is((select cloud_setup_id from public.marketplace_browser_sessions where public_id=(select (body->>'sessionId')::uuid from dialog_context where name='setup_claim')),'57100000-0000-4000-8000-000000000031'::uuid,'Reservierte Sitzung bleibt an die konkrete Einrichtung gebunden');
select is(pg_temp.check_action('setup_claim')->>'active','true','Offener verbundener Dialog ist für genau diesen Start gültig');
set local role authenticated;
select is(pg_temp.setup_presence(true,'57100000-0000-4000-8000-000000000082')->>'startState','starting','Reservierung ist bis zur Übergabe ausdrücklich erst im Start');
select throws_ok($$select public.marketplace_cloud_setup_session_check('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000031',(select (body->>'sessionId')::uuid from dialog_context where name='setup_claim'))$$,'42501',null,'Private Startaktion ist noch keine interaktive Nutzersitzung');
set local role service_role;
select ok(pg_temp.finish_action('setup_claim'),'Bestätigter Browserstart kann an den interaktiven Dialog übergeben werden');
select ok((select account_action_id is null and cloud_setup_id is not null and expires_at>clock_timestamp()+interval '8 minutes' from public.marketplace_browser_sessions where public_id=(select (body->>'sessionId')::uuid from dialog_context where name='setup_claim')),'Übergabe erhält Einrichtung, entfernt Aktion und verlängert die 90-Sekunden-Startlease');
set local role authenticated;
select is(pg_temp.setup_presence(true,'57100000-0000-4000-8000-000000000082')->>'startState','running','Erfolgreiche Übergabe zeigt den laufenden Dialog');
select is(public.marketplace_cloud_setup_session_check('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000031',(select (body->>'sessionId')::uuid from dialog_context where name='setup_claim'))->>'active','true','Interaktive Einrichtung funktioniert mit derselben Sitzung weiter');
reset role;
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where state='active';
set local role authenticated;
select throws_ok($$select pg_temp.reauth_enqueue()$$,'22023',null,'Auch bestehende Anmeldung benötigt einen verbundenen Dialog');
select is(pg_temp.reauth_presence(true)->>'connected','true','Bestehendes Konto darf einen Anmeldedialog verbinden');
insert into dialog_context values('reauth_closed',pg_temp.reauth_enqueue());
select pg_temp.reauth_presence(false);
set local role service_role;
select is(pg_temp.claim(),null::jsonb,'Ein geschlossener wartender Anmeldedialog startet später nicht von selbst');
select is((select state from public.marketplace_account_actions where public_id=(select (body->>'id')::uuid from dialog_context where name='reauth_closed')),'cancelled','Dialogschluss widerruft dauerhaft den noch nicht gestarteten Anmeldeauftrag');
set local role authenticated;
select pg_temp.reauth_presence(true);
insert into dialog_context values('reauth',pg_temp.reauth_enqueue());
set local role service_role;
insert into dialog_context values('reauth_claim',pg_temp.claim());
select is((select body->>'actionKind' from dialog_context where name='reauth_claim'),'cloud_session_open','Erneute Anmeldung bleibt mit needs_login ausführbar');
select ok((select cloud_setup_id is null and account_action_id is not null from public.marketplace_browser_sessions where public_id=(select (body->>'sessionId')::uuid from dialog_context where name='reauth_claim')),'Erneute Anmeldung reserviert eine normale kontogebundene Sitzung');
set local role authenticated;
select throws_ok($$select public.marketplace_browser_session_check('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000022',(select (body->>'sessionId')::uuid from dialog_context where name='reauth_claim'))$$,'42501',null,'Privater Start ist vor Übergabe auch im normalen Sitzungsweg gesperrt');
set local role service_role;
select ok(pg_temp.finish_action('reauth_claim'),'Normale Anmeldung erhält denselben sicheren Übergabeschritt');
set local role authenticated;
select is(public.marketplace_browser_session_check('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000022',(select (body->>'sessionId')::uuid from dialog_context where name='reauth_claim'))->>'active','true','Vorhandene interaktive Anmeldung bleibt vollständig erhalten');
reset role;
update public.marketplace_worker_runtime set expires_at=clock_timestamp()-interval '1 second' where id=1;
set local role authenticated;
select is(public.marketplace_browser_session_check('57100000-0000-4000-8000-000000000011','57100000-0000-4000-8000-000000000022',(select (body->>'sessionId')::uuid from dialog_context where name='reauth_claim'))->>'active','false','Verlorene Workerberechtigung sperrt auch übergebene Anmeldesitzungen');
reset role;
select is((select state from public.marketplace_browser_sessions where public_id=(select (body->>'sessionId')::uuid from dialog_context where name='reauth_claim')),'stopping','Verlorener Worker gibt den physischen Kontoplatz nicht vorschnell frei');
select * from finish();
rollback;
