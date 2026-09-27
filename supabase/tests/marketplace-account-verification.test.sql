\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
 ('26500000-0000-4000-8000-000000000001','authenticated','authenticated','verification-owner@example.test','{}','{}'),
 ('26500000-0000-4000-8000-000000000002','authenticated','authenticated','verification-other@example.test','{}','{}');
insert into public.platform_operators (user_id) values
 ('26500000-0000-4000-8000-000000000001');
insert into public.workspaces (id, name) values
 ('26500000-0000-4000-8000-000000000011','Verification A'),
 ('26500000-0000-4000-8000-000000000012','Verification B');
insert into public.workspace_members (workspace_id, user_id, role) values
 ('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000001','owner'),
 ('26500000-0000-4000-8000-000000000012','26500000-0000-4000-8000-000000000002','owner');
insert into public.marketplace_connections (id, workspace_id, display_name) values
 ('26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000011','Account A1'),
 ('26500000-0000-4000-8000-000000000022','26500000-0000-4000-8000-000000000011','Account A2'),
 ('26500000-0000-4000-8000-000000000023','26500000-0000-4000-8000-000000000012','Account B');
insert into public.marketplace_browser_sessions
 (public_id, workspace_id, connection_id, started_by, provider_profile_id, expires_at) values
 ('26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000001','profile-a1',clock_timestamp() + interval '10 minutes'),
 ('26500000-0000-4000-8000-000000000032','26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000022','26500000-0000-4000-8000-000000000001','profile-a2',clock_timestamp() + interval '10 minutes'),
 ('26500000-0000-4000-8000-000000000033','26500000-0000-4000-8000-000000000012','26500000-0000-4000-8000-000000000023','26500000-0000-4000-8000-000000000002','profile-b',clock_timestamp() + interval '10 minutes');

select ok(not has_function_privilege('anon', 'public.marketplace_browser_confirm_account(uuid,uuid,uuid,uuid,text,text)', 'execute'), 'Anonymous cannot confirm accounts');
select ok(not has_function_privilege('authenticated', 'public.marketplace_browser_confirm_account(uuid,uuid,uuid,uuid,text,text)', 'execute'), 'Client cannot confirm accounts');
select ok(has_function_privilege('service_role', 'public.marketplace_browser_confirm_account(uuid,uuid,uuid,uuid,text,text)', 'execute'), 'Worker may confirm accounts');

select lives_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000001','12345','my-vinted')$$, 'Bound account can be confirmed');
select is((select status from public.marketplace_connections where id='26500000-0000-4000-8000-000000000021'), 'connected', 'Confirmed connection becomes connected');
select is((select body->>'username' from public.marketplace_account_entries where connection_id='26500000-0000-4000-8000-000000000021' and kind='profile'), 'my-vinted', 'Only the profile is copied');
select throws_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000022','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000001','67890','other')$$, '42501', null, 'Session cannot be used for another account');
select throws_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000012','26500000-0000-4000-8000-000000000023','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000001','67890','other')$$, '42501', null, 'Session cannot cross workspaces');
select throws_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000002','12345','other')$$, '42501', null, 'Session cannot change operator');
select throws_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000001','67890','other')$$, '23505', null, 'Existing connection cannot switch Vinted identity');
select throws_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000022','26500000-0000-4000-8000-000000000032','26500000-0000-4000-8000-000000000001','12345','duplicate')$$, '23505', null, 'Same Vinted identity cannot be assigned twice');

update public.marketplace_browser_sessions set expires_at=clock_timestamp()-interval '1 second' where public_id='26500000-0000-4000-8000-000000000032';
select throws_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000022','26500000-0000-4000-8000-000000000032','26500000-0000-4000-8000-000000000001','67890','expired')$$, '42501', null, 'Expired session cannot confirm');
delete from public.platform_operators where user_id='26500000-0000-4000-8000-000000000001';
select throws_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000001','12345','revoked')$$, '42501', null, 'Revoked operator cannot reconfirm');
select is((select count(*)::integer from public.marketplace_account_entries where kind='profile' and connection_id='26500000-0000-4000-8000-000000000022'), 0, 'Rejected account receives no profile data');

select * from finish();
rollback;
