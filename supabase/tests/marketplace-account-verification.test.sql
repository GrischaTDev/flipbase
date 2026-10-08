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
select is((select enabled from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),true,'Bestätigte Verbindung startet standardmäßig die Automatik');
select is((select interval_minutes from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),15,'Neues Konto startet mit 15 Minuten');
update public.marketplace_sync_schedules set enabled=false,authorization_version=2,next_due_at=null where connection_id='26500000-0000-4000-8000-000000000021';
select is((select body->>'username' from public.marketplace_account_entries where connection_id='26500000-0000-4000-8000-000000000021' and kind='profile'), 'my-vinted', 'Only the profile is copied');
update public.marketplace_account_entries
  set body = body || '{"feedbackCount":16,"bio":"Saved profile text"}'::jsonb
  where connection_id='26500000-0000-4000-8000-000000000021' and kind='profile';
update public.marketplace_connections
  set last_synced_at='2026-09-27 12:00:00+00'::timestamptz
  where id='26500000-0000-4000-8000-000000000021';
select lives_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000001','12345','my-vinted-new')$$, 'Same identity can renew its login');
select is((select enabled from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),false,'Neuanmeldung hebt eine ausdrückliche Automatikpause nicht auf');
select is((select body->>'feedbackCount' from public.marketplace_account_entries where connection_id='26500000-0000-4000-8000-000000000021' and kind='profile'), '16', 'Reauthentication preserves imported ratings');
select is((select body->>'bio' from public.marketplace_account_entries where connection_id='26500000-0000-4000-8000-000000000021' and kind='profile'), 'Saved profile text', 'Reauthentication preserves imported profile text');
select is((select body->>'username' from public.marketplace_account_entries where connection_id='26500000-0000-4000-8000-000000000021' and kind='profile'), 'my-vinted-new', 'Reauthentication updates observed username');
select is((select last_synced_at from public.marketplace_connections where id='26500000-0000-4000-8000-000000000021'), '2026-09-27 12:00:00+00'::timestamptz, 'Reauthentication does not claim a new data import');
update public.marketplace_sync_schedules
  set paused_reason='needs_login',retry_after=clock_timestamp()+interval '1 hour',consecutive_failures=2,interval_minutes=30
  where connection_id='26500000-0000-4000-8000-000000000021';
select throws_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000001','67890','wrong-account')$$, '23505', null, 'Wrong identity cannot clear the login warning');
select is((select paused_reason from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),'needs_login','Rejected login preserves the warning');
select lives_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000001','12345','renewed')$$, 'Confirmed reauthentication clears the old login error');
select is((select paused_reason from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),null::text,'Confirmed login removes the obsolete warning');
select is((select retry_after from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),null::timestamptz,'Confirmed login clears its old retry delay');
select is((select consecutive_failures from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),0,'Confirmed login clears its old failure count');
select is((select authorization_version from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),3::bigint,'Old operation results cannot restore the resolved login error');
select is((select enabled from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),false,'Clearing a login warning does not resume automation');
select is((select next_due_at from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),null::timestamptz,'Paused automation does not schedule another read');
select is((select interval_minutes from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),30,'Login renewal preserves the selected interval');
update public.marketplace_sync_schedules set paused_reason='challenge',consecutive_failures=4 where connection_id='26500000-0000-4000-8000-000000000021';
select lives_ok($$select public.marketplace_browser_confirm_account('26500000-0000-4000-8000-000000000011','26500000-0000-4000-8000-000000000021','26500000-0000-4000-8000-000000000031','26500000-0000-4000-8000-000000000001','12345','renewed')$$, 'Login confirmation preserves unrelated errors');
select is((select paused_reason from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),'challenge','Unrelated warning stays visible');
select is((select consecutive_failures from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),4,'Unrelated failure count stays unchanged');
select is((select authorization_version from public.marketplace_sync_schedules where connection_id='26500000-0000-4000-8000-000000000021'),3::bigint,'Unrelated schedule version stays unchanged');
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
