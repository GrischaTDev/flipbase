\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select has_table('public','sale_platform_settings','Verkaufsplattformliste existiert');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('48500000-0000-4000-8000-000000000001','authenticated','authenticated','platform-owner@example.test','{}','{}'),
 ('48500000-0000-4000-8000-000000000002','authenticated','authenticated','platform-member@example.test','{}','{}'),
 ('48500000-0000-4000-8000-000000000003','authenticated','authenticated','platform-reader@example.test','{}','{}');
insert into public.workspaces(id,name) values
 ('48500000-0000-4000-8000-000000000011','Plattformen A'),
 ('48500000-0000-4000-8000-000000000012','Plattformen B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('48500000-0000-4000-8000-000000000011','48500000-0000-4000-8000-000000000001','owner'),
 ('48500000-0000-4000-8000-000000000011','48500000-0000-4000-8000-000000000002','member'),
 ('48500000-0000-4000-8000-000000000011','48500000-0000-4000-8000-000000000003','readonly');
select ok(not has_table_privilege('anon','public.sale_platform_settings','select'),'Kein anonymes Lesen');
select ok(not has_function_privilege('anon','public.save_sale_platforms(uuid,jsonb,integer)','execute'),'Kein anonymes Speichern');
select ok(not public.sale_platform_list_valid('[{"value":"a","label":"Vinted"},{"value":"b","label":" Ｖｉｎｔｅｄ "}]'),'Normalisierte Dubletten verweigert');
select ok(not public.sale_platform_list_valid('[{"label":"X"}]'),'Fehlende Kennung verweigert');
select ok(not public.sale_platform_list_valid('null'),'Null verweigert');
select ok(not public.sale_platform_list_valid('[{"value":"all","label":"Alle"}]'),'Filterkennung nicht als Plattform speicherbar');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"48500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.save_sale_platforms('48500000-0000-4000-8000-000000000011','[{"value":"vinted","label":"Vinted"},{"value":"Oza","label":"Oza"}]',0)->>'version','1','Erste Liste bestätigt');
select is(public.save_sale_platforms('48500000-0000-4000-8000-000000000011','[{"value":"Oza","label":"Mein Oza"},{"value":"vinted","label":"Vinted"}]',1)->'platforms'->0->>'value','Oza','Reihenfolge und historische Kennung erhalten');
select throws_ok($$select public.save_sale_platforms('48500000-0000-4000-8000-000000000011','[{"value":"vinted","label":"Vinted"}]',1)$$,'40001',null,'Veraltete Version verweigert');
select throws_ok($$select public.save_sale_platforms('48500000-0000-4000-8000-000000000011','[{"value":"vinted","label":"Vinted"}]',2)$$,'22023',null,'Vorhandene Kennung nicht entfernbar');
select throws_ok($$select public.save_sale_platforms('48500000-0000-4000-8000-000000000012','[{"value":"vinted","label":"Vinted"}]',0)$$,'42501',null,'Fremder Workspace verweigert');
select set_config('request.jwt.claims','{"sub":"48500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::integer from public.sale_platform_settings),1,'Leser sieht gemeinsame Liste');
select throws_ok($$select public.save_sale_platforms('48500000-0000-4000-8000-000000000011','[{"value":"vinted","label":"Vinted"}]',2)$$,'42501',null,'Leser darf nicht schreiben');
select throws_ok($$update public.sale_platform_settings set workspace_id='48500000-0000-4000-8000-000000000012'$$,'42501',null,'Workspace kann nicht verschoben werden');
select set_config('request.jwt.claims','{"sub":"48500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.save_sale_platforms('48500000-0000-4000-8000-000000000011','[{"value":"vinted","label":"Vinted"},{"value":"Oza","label":"Oza"}]',2)$$,'Mitglied darf gemeinsame Liste ändern');
reset role;
update public.workspaces set archived_at=now() where id='48500000-0000-4000-8000-000000000011';
set local role authenticated;
select is((select count(*)::integer from public.sale_platform_settings),0,'Archivierte Liste nicht lesbar');
select throws_ok($$select public.save_sale_platforms('48500000-0000-4000-8000-000000000011','[{"value":"vinted","label":"Vinted"}]',3)$$,'42501',null,'Archivierter Workspace nicht schreibbar');
reset role;
select * from finish();
rollback;
