\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('57500000-0000-4000-8000-000000000001','authenticated','authenticated','action-retention@example.test','{}','{}');
insert into public.platform_operators(user_id) values('57500000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('57500000-0000-4000-8000-000000000011','Geschlossenes Archiv'),('57500000-0000-4000-8000-000000000012','Noch lebender Browser');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('57500000-0000-4000-8000-000000000011','57500000-0000-4000-8000-000000000001','owner'),
 ('57500000-0000-4000-8000-000000000012','57500000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,execution_mode,external_account_id) values
 ('57500000-0000-4000-8000-000000000021','57500000-0000-4000-8000-000000000011','Unklar, physisch beendet','connected','cloud','5751'),
 ('57500000-0000-4000-8000-000000000022','57500000-0000-4000-8000-000000000011','Noch nie gestartet','connected','cloud','5752'),
 ('57500000-0000-4000-8000-000000000023','57500000-0000-4000-8000-000000000012','Aktiver Browser','connected','cloud','5753');
insert into public.marketplace_browser_sessions(public_id,workspace_id,connection_id,started_by,provider_profile_id,state,expires_at,provider_stopped_at) values
 ('57500000-0000-4000-8000-000000000031','57500000-0000-4000-8000-000000000011','57500000-0000-4000-8000-000000000021','57500000-0000-4000-8000-000000000001','retention-stopped-profile','closed',clock_timestamp()-interval '1 minute',clock_timestamp()),
 ('57500000-0000-4000-8000-000000000032','57500000-0000-4000-8000-000000000012','57500000-0000-4000-8000-000000000023','57500000-0000-4000-8000-000000000001','retention-live-profile','active',clock_timestamp()+interval '10 minutes',null);
insert into public.marketplace_account_actions(workspace_id,connection_id,requested_by,request_id,request_hash,kind,payload,provider_profile_id,is_write,state,browser_session_id,write_started_at) values
 ('57500000-0000-4000-8000-000000000011','57500000-0000-4000-8000-000000000021','57500000-0000-4000-8000-000000000001','57500000-0000-4000-8000-000000000041',repeat('a',64),'price_save','{}','retention-stopped-profile',true,'outcome_unknown','57500000-0000-4000-8000-000000000031',clock_timestamp()-interval '1 minute'),
 ('57500000-0000-4000-8000-000000000011','57500000-0000-4000-8000-000000000022','57500000-0000-4000-8000-000000000001','57500000-0000-4000-8000-000000000042',repeat('b',64),'profile_details_read','{}','retention-waiting-profile',false,'queued',null,null),
 ('57500000-0000-4000-8000-000000000012','57500000-0000-4000-8000-000000000023','57500000-0000-4000-8000-000000000001','57500000-0000-4000-8000-000000000043',repeat('c',64),'profile_details_read','{}','retention-live-profile',false,'queued',null,null);
select throws_ok($$delete from public.marketplace_connections where id='57500000-0000-4000-8000-000000000021'$$,'23503',null,'Direkte Kontolöschung schützt ungeklärte Aufträge weiterhin');
select throws_ok($$delete from public.marketplace_connections where id='57500000-0000-4000-8000-000000000022'$$,'23503',null,'Direkte Kontolöschung schützt wartende Aufträge weiterhin');
update public.workspaces set archived_at=clock_timestamp()-interval '31 days' where id in ('57500000-0000-4000-8000-000000000011','57500000-0000-4000-8000-000000000012');
select lives_ok($$delete from public.workspaces where id='57500000-0000-4000-8000-000000000011'$$,'Bestehende explizite Workspace-Löschung bleibt nach physischem Browserstopp möglich');
select is((select count(*)::integer from public.marketplace_account_actions where workspace_id='57500000-0000-4000-8000-000000000011'),0,'Explizite Workspace-Löschung entfernt dessen alte und nie gestartete Aufträge');
select throws_ok($$delete from public.workspaces where id='57500000-0000-4000-8000-000000000012'$$,'23503',null,'Workspace-Löschung erhält die bestehende Sperre für lebende Browser');
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where public_id='57500000-0000-4000-8000-000000000032';
select lives_ok($$delete from public.workspaces where id='57500000-0000-4000-8000-000000000012'$$,'Bestätigter Browserstopp gibt den bisherigen Workspace-Löschweg frei');
select is((select count(*)::integer from public.marketplace_connections where workspace_id in ('57500000-0000-4000-8000-000000000011','57500000-0000-4000-8000-000000000012')),0,'Es bleiben keine entfernten Konten zurück');
select * from finish();
rollback;
