\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('35610000-0000-4000-8000-000000000001','authenticated','authenticated','vinted-beta@example.test','{}','{"is_platform_operator":true,"role":"admin"}'),
 ('35610000-0000-4000-8000-000000000002','authenticated','authenticated','vinted-operator@example.test','{}','{}'),
 ('35610000-0000-4000-8000-000000000003','authenticated','authenticated','vinted-member@example.test','{}','{}'),
 ('35610000-0000-4000-8000-000000000004','authenticated','authenticated','vinted-outsider@example.test','{}','{}');
insert into public.platform_operators(user_id) values('35610000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values
 ('35610000-0000-4000-8000-000000000011','Vinted Beta'),
 ('35610000-0000-4000-8000-000000000012','Fremder Workspace');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000001','owner'),
 ('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000002','admin'),
 ('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000003','member'),
 ('35610000-0000-4000-8000-000000000012','35610000-0000-4000-8000-000000000004','owner');
insert into public.workspace_licenses(workspace_id,access_source,status,granted_days,starts_at,ends_at) values
 ('35610000-0000-4000-8000-000000000011','beta','active',60,now(),now()+interval '60 days');
insert into public.marketplace_connections(id,workspace_id,display_name,execution_mode) values
 ('35610000-0000-4000-8000-000000000021','35610000-0000-4000-8000-000000000011','Lokales Beta-Konto','local'),
 ('35610000-0000-4000-8000-000000000022','35610000-0000-4000-8000-000000000011','Bestehendes Cloud-Konto','cloud');
create temporary table beta_context(connection jsonb);
grant all on beta_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35610000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(public.marketplace_can_manage('35610000-0000-4000-8000-000000000011'),'Aktive Beta besitzt lokalen Kontozugriff');
select ok(not public.marketplace_can_manage_cloud('35610000-0000-4000-8000-000000000011'),'Selbst gesetzte Metadaten erteilen keine Cloudrechte');
insert into beta_context select public.marketplace_create_connection('35610000-0000-4000-8000-000000000011','Neues lokales Konto');
select is((select connection->>'executionMode' from beta_context),'local','Allgemeine Kontoanlage erstellt ausschließlich lokale Verbindungen');
select lives_ok($$select public.marketplace_approve_local_extension('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000021',repeat('b',64),'3561001')$$,'Beta kann die lokale Erweiterung freigeben');
select throws_ok($$select public.marketplace_cloud_setup_begin('35610000-0000-4000-8000-000000000011',null,'35610000-0000-4000-8000-000000000031','Cloud verboten')$$,'42501',null,'Direkte Cloud-Anlage ist gesperrt');
select throws_ok($$select public.marketplace_cloud_setup_begin('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000021','35610000-0000-4000-8000-000000000032',null)$$,'42501',null,'Lokales Konto kann nicht zur Cloud wechseln');
select throws_ok($$select public.marketplace_browser_session_reserve('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000022')$$,'42501',null,'Direkte Cloud-Browsersitzung ist gesperrt');
select throws_ok($$select public.marketplace_test_session_start('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000022')$$,'42501',null,'Auch alte Cloud-Testeinstiege bleiben gesperrt');
select throws_ok($$select public.marketplace_sync_enqueue('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000022')$$,'42501',null,'Kein kostenpflichtiger Cloud-Abruf');
reset role;

set local role service_role;
select ok(public.marketplace_workspace_authorization_valid('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000001'),'Lokaler Worker akzeptiert aktive Beta');
select ok(not public.marketplace_sync_authorization_valid('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000001'),'Cloud-Worker akzeptiert Beta nicht');
select throws_ok($$select public.marketplace_cloud_ip_purchase('claim','35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000033',null,'Proxy verboten','35610000-0000-4000-8000-000000000001','35610000-0000-4000-8000-000000000034',100,null)$$,'42501',null,'Auch serverseitiger Proxy-Kauf wird vor einer Reservierung abgewiesen');
select lives_ok($$select public.marketplace_ingest_local_extension('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000021',repeat('b',64),jsonb_build_object('identity',jsonb_build_object('id','3561001','username','beta'),'observedAt',clock_timestamp(),'publicationsComplete',false,'entries',jsonb_build_array(jsonb_build_object('kind','profile','externalId','3561001','sortAt',clock_timestamp(),'body',jsonb_build_object('username','beta')))))$$,'Lokaler Import funktioniert ohne Betreiberrolle');
reset role;
select is((select count(*)::int from public.marketplace_cloud_ip_purchases where workspace_id='35610000-0000-4000-8000-000000000011'),0,'Keine Proxy-Kaufabsicht angelegt');
select is((select count(*)::int from public.marketplace_cloud_setups where workspace_id='35610000-0000-4000-8000-000000000011'),0,'Keine Cloud-Einrichtung reserviert');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35610000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(public.marketplace_can_manage_cloud('35610000-0000-4000-8000-000000000011'),'Betreiber behält Cloud-Freigabe');
select set_config('request.jwt.claims','{"sub":"35610000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(not public.marketplace_can_manage('35610000-0000-4000-8000-000000000011'),'Einfache Workspace-Mitgliedschaft erteilt keine Kontoverwaltung');
select set_config('request.jwt.claims','{"sub":"35610000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.marketplace_list_connections('35610000-0000-4000-8000-000000000011')$$,'42501',null,'Fremde Workspaces bleiben gesperrt');
select set_config('request.jwt.claims','{"sub":"35610000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',true);
select ok(not public.marketplace_can_manage('35610000-0000-4000-8000-000000000011'),'Anonyme Sitzungen erhalten keine lokale Kontoverwaltung');
reset role;

update public.workspace_licenses set ends_at=now() where workspace_id='35610000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35610000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(not public.marketplace_can_manage('35610000-0000-4000-8000-000000000011'),'Abgelaufene Beta entzieht lokalen Zugriff');
select is((select count(*)::int from public.marketplace_connections),0,'RLS versteckt Konten nach Beta-Ende');
reset role;
set local role service_role;
select ok(not public.marketplace_workspace_authorization_valid('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000001'),'Auch lokale Worker prüfen das Beta-Ende');
select throws_ok($$select public.marketplace_ingest_local_extension('35610000-0000-4000-8000-000000000011','35610000-0000-4000-8000-000000000021',repeat('b',64),null)$$,'42501',null,'Vorherige Extension-Freigabe umgeht Beta-Ende nicht');
reset role;
select * from finish();
rollback;
