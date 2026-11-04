\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('46910000-0000-4000-8000-000000000001','authenticated','authenticated','selling-owner@example.test','{}','{}'),
 ('46910000-0000-4000-8000-000000000002','authenticated','authenticated','selling-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('46910000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('46910000-0000-4000-8000-000000000011','Selling categories');
insert into public.workspace_members(workspace_id,user_id,role) values('46910000-0000-4000-8000-000000000011','46910000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('46910000-0000-4000-8000-000000000021','46910000-0000-4000-8000-000000000011','Modern','connected','46911'),
 ('46910000-0000-4000-8000-000000000022','46910000-0000-4000-8000-000000000011','Legacy','connected','46912');
select ok(not has_table_privilege('anon','public.vinted_selling_category_snapshots','select'),'No anonymous read');
select ok(not has_table_privilege('authenticated','public.vinted_selling_category_snapshots','insert'),'No direct client writes');
select ok(not has_function_privilege('authenticated','public.marketplace_save_vinted_selling_tree(uuid,uuid,text,timestamptz,jsonb)','execute'),'No client cache replacement');
select ok(not has_function_privilege('anon','public.marketplace_save_vinted_selling_tree(uuid,uuid,text,timestamptz,jsonb)','execute'),'No anonymous cache replacement');
set local role service_role;
select lives_ok($$select public.marketplace_save_vinted_selling_tree('46910000-0000-4000-8000-000000000011','46910000-0000-4000-8000-000000000021','46911',now(),'[{"id":5496,"parentId":null,"title":"Modeaccessoires","path":"Modeaccessoires","isLeaf":false},{"id":5555,"parentId":5496,"title":"Schals","path":"Modeaccessoires > Schals","isLeaf":true}]')$$,'Stores the complete modern account tree');
select lives_ok($$select public.marketplace_save_vinted_selling_tree('46910000-0000-4000-8000-000000000011','46910000-0000-4000-8000-000000000022','46912',now(),'[{"id":1,"parentId":null,"title":"Damen","path":"Damen","isLeaf":false},{"id":89,"parentId":1,"title":"Schals","path":"Damen > Schals","isLeaf":true}]')$$,'Stores a different tree for another account');
select throws_ok($$select public.marketplace_save_vinted_selling_tree('46910000-0000-4000-8000-000000000011','46910000-0000-4000-8000-000000000021','46912',now(),'[]')$$,'P0001','Vinted account binding changed','Rejects foreign identity');
select throws_ok($$select public.marketplace_save_vinted_selling_tree('46910000-0000-4000-8000-000000000011','46910000-0000-4000-8000-000000000021','46911',now(),'[{"id":5555,"parentId":5496,"title":"Schals","path":"Modeaccessoires > Schals","isLeaf":true}]')$$,'P0001','Incomplete selling tree','Rejects incomplete snapshots atomically');
select public.marketplace_save_vinted_selling_tree('46910000-0000-4000-8000-000000000011','46910000-0000-4000-8000-000000000021','46911',now()-interval '1 day','[{"id":1,"parentId":null,"title":"Alt","path":"Alt","isLeaf":true}]');
select is((select categories->0->>'id' from public.vinted_selling_category_snapshots where external_account_id='46911'),'5496','Older reads cannot overwrite a newer tree');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"46910000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.vinted_selling_category_snapshots),2,'Manager reads both own account trees');
select set_config('request.jwt.claims','{"sub":"46910000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.vinted_selling_category_snapshots),0,'Unrelated user cannot read trees');
reset role;
update public.marketplace_connections set external_account_id='46913' where id='46910000-0000-4000-8000-000000000021';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"46910000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.vinted_selling_category_snapshots),1,'Rebinding hides the previous account snapshot');
reset role;
select * from finish();
rollback;
