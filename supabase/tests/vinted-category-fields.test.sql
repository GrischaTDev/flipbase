\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('47010000-0000-4000-8000-000000000001','authenticated','authenticated','fields-owner@example.test','{}','{}'),
 ('47010000-0000-4000-8000-000000000002','authenticated','authenticated','fields-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('47010000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('47010000-0000-4000-8000-000000000011','Category fields');
insert into public.workspace_members(workspace_id,user_id,role) values('47010000-0000-4000-8000-000000000011','47010000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('47010000-0000-4000-8000-000000000021','47010000-0000-4000-8000-000000000011','Jeans','connected','47011');
select ok(not has_table_privilege('anon','public.vinted_category_field_snapshots','select'),'No anonymous read');
select ok(not has_table_privilege('authenticated','public.vinted_category_field_snapshots','insert'),'No direct client writes');
select ok(not has_table_privilege('authenticated','public.vinted_category_field_snapshots','update'),'No direct client updates');
select ok(not has_function_privilege('authenticated','public.marketplace_save_vinted_category_fields(uuid,uuid,text,timestamptz,jsonb)','execute'),'No client cache replacement');
select ok(not has_function_privilege('anon','public.marketplace_save_vinted_category_fields(uuid,uuid,text,timestamptz,jsonb)','execute'),'No anonymous cache replacement');
set local role service_role;
select is(public.marketplace_save_vinted_category_fields('47010000-0000-4000-8000-000000000011','47010000-0000-4000-8000-000000000021','47011',now(),
 '{"categoryId":257,"fields":[{"field":"size","sizeGroupId":null,"choices":[{"id":1641,"label":"W32","selected":false,"disabled":false,"sizeGroupId":1074}]}],"unknownFields":[]}'),
 true,'Stores real size groups for a category');
select throws_ok($$select public.marketplace_save_vinted_category_fields('47010000-0000-4000-8000-000000000011','47010000-0000-4000-8000-000000000021','47012',now(),'{"categoryId":257,"fields":[]}')$$,
 'P0001','Vinted account binding changed','Rejects a foreign account identity');
select throws_ok($$select public.marketplace_save_vinted_category_fields('47010000-0000-4000-8000-000000000011','47010000-0000-4000-8000-000000000021','47011',now(),'{"categoryId":"257","fields":[]}')$$,
 'P0001','Invalid category fields','Rejects malformed snapshots');
select is(public.marketplace_save_vinted_category_fields('47010000-0000-4000-8000-000000000011','47010000-0000-4000-8000-000000000021','47011',now()-interval '1 day','{"categoryId":257,"fields":[]}'),
 false,'Older reads cannot overwrite newer fields');
select is((select fields->'fields'->0->'choices'->0->>'label' from public.vinted_category_field_snapshots where category_id=257),'W32','Newest fields stay stored');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"47010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.vinted_category_field_snapshots),1,'Manager reads own account fields');
select set_config('request.jwt.claims','{"sub":"47010000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.vinted_category_field_snapshots),0,'Unrelated user cannot read fields');
reset role;
update public.marketplace_connections set external_account_id='47013' where id='47010000-0000-4000-8000-000000000021';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"47010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.vinted_category_field_snapshots),0,'Rebinding hides the previous account fields');
reset role;
set local role service_role;
select is(public.marketplace_save_vinted_category_fields('47010000-0000-4000-8000-000000000011','47010000-0000-4000-8000-000000000021','47013',now(),'{"categoryId":1839,"fields":[]}'),
 true,'New account stores its own fields');
select is((select count(*)::integer from public.vinted_category_field_snapshots where connection_id='47010000-0000-4000-8000-000000000021'),1,'Previous account fields are discarded');
reset role;
select * from finish();
rollback;
