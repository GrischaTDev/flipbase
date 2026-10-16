\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select has_table('public','marketplace_user_settings','Persönliche Marktplatzauswahl existiert');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('48000000-0000-4000-8000-000000000001','authenticated','authenticated','marketplace-a@example.test','{}','{}'),
 ('48000000-0000-4000-8000-000000000002','authenticated','authenticated','marketplace-b@example.test','{}','{}');
insert into public.workspaces(id,name) values
 ('48000000-0000-4000-8000-000000000011','Auswahl A'),
 ('48000000-0000-4000-8000-000000000012','Auswahl B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('48000000-0000-4000-8000-000000000011','48000000-0000-4000-8000-000000000001','owner'),
 ('48000000-0000-4000-8000-000000000011','48000000-0000-4000-8000-000000000002','member');
select ok(not has_table_privilege('anon','public.marketplace_user_settings','select'),'Anonyme haben keinen Lesezugriff');
select ok(not has_function_privilege('anon','public.marketplace_save_settings(uuid,boolean,boolean,boolean,boolean)','execute'),'Anonyme können keine Auswahl speichern');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"48000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.marketplace_save_settings('48000000-0000-4000-8000-000000000011',false,true,true)->>'vinted','false','Eigene Auswahl speicherbar');
select is(public.marketplace_save_settings('48000000-0000-4000-8000-000000000011',true,false,false,true)->>'vinted','false','Erstmigration überschreibt vorhandene Auswahl nicht');
select throws_ok($$select public.marketplace_save_settings('48000000-0000-4000-8000-000000000012',false,false,false)$$,'42501',null,'Fremder Workspace verweigert');
select throws_ok($$insert into public.marketplace_user_settings(user_id,workspace_id) values('48000000-0000-4000-8000-000000000002','48000000-0000-4000-8000-000000000011')$$,'42501',null,'Keine Auswahl für anderen Nutzer anlegbar');
select set_config('request.jwt.claims','{"sub":"48000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.marketplace_user_settings),0,'Anderes Mitglied sieht keine fremde Auswahl');
select lives_ok($$select public.marketplace_save_settings('48000000-0000-4000-8000-000000000011',true,false,true)$$,'Mitglied kann eigene Auswahl speichern');
select is((select count(*)::int from public.marketplace_user_settings),1,'Nur eigene Auswahl sichtbar');
select throws_ok($$update public.marketplace_user_settings set user_id='48000000-0000-4000-8000-000000000001'$$,'42501',null,'Eigentümer kann nicht verschoben werden');
select throws_ok($$delete from public.marketplace_user_settings$$,'42501',null,'Direktes Löschen nicht freigegeben');
reset role;
update public.workspaces set archived_at=now() where id='48000000-0000-4000-8000-000000000011';
set local role authenticated;
select throws_ok($$select public.marketplace_save_settings('48000000-0000-4000-8000-000000000011',true,true,true)$$,'42501',null,'Archivierter Workspace verweigert');
select is((select count(*)::int from public.marketplace_user_settings),0,'Archivierte Auswahl wird nicht gelesen');
reset role;
select * from finish();
rollback;
