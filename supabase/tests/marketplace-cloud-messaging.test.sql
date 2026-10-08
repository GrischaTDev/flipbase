\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
select has_table('public','marketplace_cloud_message_permissions','Cloud permissions are separate from read schedules');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('36500000-0000-4000-8000-000000000001','authenticated','authenticated','cloud-message-owner@example.test','{}','{}'),
 ('36500000-0000-4000-8000-000000000002','authenticated','authenticated','cloud-message-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('36500000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('36500000-0000-4000-8000-000000000011','Cloud messages');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,execution_mode,status,external_account_id) values
 ('36500000-0000-4000-8000-000000000021','36500000-0000-4000-8000-000000000011','Cloud messages','cloud','connected','123');
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values
 ('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021','cloud-message-profile');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at) values
 ('36500000-0000-4000-8000-000000000031','36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021','conversation','777','{"title":"Buyer"}',clock_timestamp());
create temporary table message_context(name text primary key,body jsonb);
grant all on message_context to authenticated,service_role;
create function pg_temp.enqueue(p_id uuid default '36500000-0000-4000-8000-000000000041',p_text text default 'Hallo') returns jsonb language sql as $$
 select public.marketplace_enqueue_message('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021','36500000-0000-4000-8000-000000000031',p_id,p_text);
$$;
create function pg_temp.permission() returns jsonb language sql as $$
 select public.marketplace_read_message_permission('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021');
$$;
create function pg_temp.check_run() returns jsonb language sql as $$
 select public.marketplace_cloud_message_check('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021',(body->>'messageId')::uuid,(body->>'claimToken')::uuid,'36500000-0000-4000-8000-000000000051',1) from message_context where name='claim';
$$;
create function pg_temp.begin_run() returns jsonb language sql as $$
 select public.marketplace_cloud_message_begin('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021',(body->>'messageId')::uuid,(body->>'claimToken')::uuid,'36500000-0000-4000-8000-000000000051',1) from message_context where name='claim';
$$;
create function pg_temp.finish_run(p_outcome text,p_external text default null) returns jsonb language sql as $$
 select public.marketplace_cloud_message_finish('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021',(body->>'messageId')::uuid,(body->>'claimToken')::uuid,'36500000-0000-4000-8000-000000000051',1,p_outcome,p_external,null) from message_context where name='claim';
$$;
select set_config('request.jwt.claim.sub','36500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(pg_temp.permission()->>'allowed','false','Cloud read connection does not imply send permission');
select throws_ok($$select pg_temp.enqueue()$$,'42501',null,'No cloud send without explicit approval');
select throws_ok($$select public.marketplace_approve_cloud_messages('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021','999')$$,'42501',null,'Approval requires exact external account');
select is(public.marketplace_approve_cloud_messages('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021','123')->>'allowed','true','Explicit same-account approval');
select is(pg_temp.permission()->>'authorizationVersion','1','First permission generation');
select lives_ok($$select pg_temp.enqueue()$$,'Cloud message queues with approved identity');
select lives_ok($$select pg_temp.enqueue()$$,'Same request remains idempotent');
select throws_ok($$select pg_temp.enqueue('36500000-0000-4000-8000-000000000041','Other')$$,'23505',null,'Same request cannot change payload');
select throws_ok($$select pg_temp.enqueue('36500000-0000-4000-8000-000000000042','')$$,'22023',null,'Empty cloud text is rejected');
reset role;
select is((select count(*) from public.marketplace_local_message_outbox where request_id='36500000-0000-4000-8000-000000000041'),1::bigint,'Exactly one request row');
select ok((select execution_mode='cloud' and grant_generation is null and cloud_authorization_version=1 from public.marketplace_local_message_outbox where request_id='36500000-0000-4000-8000-000000000041'),'Cloud and local authorization are disjoint');
select ok(not has_table_privilege('authenticated','public.marketplace_cloud_message_permissions','update'),'App cannot forge permissions');
select ok(not has_function_privilege('authenticated','public.marketplace_cloud_message_claim(uuid,bigint,uuid)','execute'),'App cannot claim server work');
select set_config('request.jwt.claim.sub','36500000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select pg_temp.enqueue()$$,'42501',null,'Foreign user cannot queue cloud messages');
select throws_ok($$select pg_temp.permission()$$,'42501',null,'Foreign user cannot inspect cloud permission');
reset role;
set local role service_role;
select throws_ok($$select public.marketplace_local_message_claim('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021',repeat('a',64))$$,'42501',null,'Local extension cannot execute cloud work');
select is(public.marketplace_worker_claim('36500000-0000-4000-8000-000000000051')->>'workerEpoch','1','Worker runtime exists');
select is(public.marketplace_cloud_message_claim('36500000-0000-4000-8000-000000000051',2,'36500000-0000-4000-8000-000000000061'),null::jsonb,'Wrong epoch cannot claim');
insert into message_context values('claim',public.marketplace_cloud_message_claim('36500000-0000-4000-8000-000000000051',1,'36500000-0000-4000-8000-000000000061'));
select is(pg_temp.check_run()->>'active','true','Manual send is allowed without an enabled automatic read schedule');
select is(public.marketplace_cloud_message_claim('36500000-0000-4000-8000-000000000051',1,'36500000-0000-4000-8000-000000000062'),null::jsonb,'Unresolved browser prevents concurrent write');
select lives_ok($$select pg_temp.begin_run()$$,'Persist sending before provider request');
select throws_ok($$select pg_temp.begin_run()$$,'42501',null,'Same attempt cannot begin twice');
select throws_ok($$select pg_temp.finish_run('sent')$$,'22023',null,'Sent requires external message evidence');
select lives_ok($$select pg_temp.finish_run('outcome_unknown')$$,'Lost response is durable');
select lives_ok($$select pg_temp.finish_run('sent','999')$$,'Original claim can resolve its unknown result');
select lives_ok($$select pg_temp.finish_run('sent','999')$$,'Finish acknowledgement can replay');
select throws_ok($$select pg_temp.finish_run('sent','1000')$$,'23505',null,'Conflicting evidence is refused');
reset role;
select is((select count(*) from public.marketplace_account_entries where kind='message' and external_id='999' and parent_id='36500000-0000-4000-8000-000000000031'),1::bigint,'Confirmed cloud message is stored in its own conversation');
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where state='active';
select set_config('request.jwt.claim.sub','36500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select pg_temp.enqueue('36500000-0000-4000-8000-000000000042','Pending')$$,'Second cloud message waits');
reset role;
update public.marketplace_browser_profiles set provider_profile_id='changed-cloud-message-profile' where connection_id='36500000-0000-4000-8000-000000000021';
set local role authenticated;
select is(pg_temp.permission()->>'allowed','false','Profile replacement invalidates previous approval');
select lives_ok($$select public.marketplace_read_messages('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021','36500000-0000-4000-8000-000000000031')$$,'Queue remains visible after profile replacement');
reset role;
select is((select state from public.marketplace_local_message_outbox where request_id='36500000-0000-4000-8000-000000000042'),'cancelled','Unsent old-profile message is cancelled');
set local role authenticated;
select is(public.marketplace_approve_cloud_messages('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021','123')->>'authorizationVersion','3','Replaced profile requires a fresh generation');
select lives_ok($$select pg_temp.enqueue('36500000-0000-4000-8000-000000000043','Retry test')$$,'Freshly approved message queues');
reset role;
set local role service_role;
update message_context set body=public.marketplace_cloud_message_claim('36500000-0000-4000-8000-000000000051',1,'36500000-0000-4000-8000-000000000063') where name='claim';
select lives_ok($$select pg_temp.begin_run()$$,'Newly approved attempt begins');
select lives_ok($$select pg_temp.finish_run('outcome_unknown')$$,'Unknown original persists before retry');
select throws_ok($$select public.marketplace_cloud_message_finish('36500000-0000-4000-8000-000000000012','36500000-0000-4000-8000-000000000021',(body->>'messageId')::uuid,(body->>'claimToken')::uuid,'36500000-0000-4000-8000-000000000051',1,'sent','1001') from message_context where name='claim'$$,'42501',null,'Original claim cannot finish for a foreign workspace');
reset role;
set local role authenticated;
select throws_ok($$select public.marketplace_retry_message('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021','36500000-0000-4000-8000-000000000031',(body->>'messageId')::uuid,false) from message_context where name='claim'$$,'22023',null,'Unknown original requires explicit review before retry');
select lives_ok($$select public.marketplace_retry_message('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021','36500000-0000-4000-8000-000000000031',(body->>'messageId')::uuid,true) from message_context where name='claim'$$,'Reviewed unknown original creates exactly one explicit retry');
reset role;
set local role service_role;
select lives_ok($$select pg_temp.finish_run('sent','1001')$$,'Delayed original evidence resolves its own attempt');
reset role;
select is((select state from public.marketplace_local_message_outbox where request_id=(select (body->>'messageId')::uuid from message_context where name='claim')),'cancelled','Late original success cancels an unstarted retry');
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where state='active';
set local role authenticated;
select lives_ok($$select pg_temp.enqueue('36500000-0000-4000-8000-000000000044','Expired claim')$$,'Queues an unstarted recovery case');
reset role;
set local role service_role;
update message_context set body=public.marketplace_cloud_message_claim('36500000-0000-4000-8000-000000000051',1,'36500000-0000-4000-8000-000000000064') where name='claim';
reset role;
update public.marketplace_local_message_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where request_id='36500000-0000-4000-8000-000000000044';
update public.marketplace_browser_sessions set expires_at=clock_timestamp()-interval '1 second' where state='active';
set local role service_role;
select is(public.marketplace_cloud_message_claim('36500000-0000-4000-8000-000000000051',1,'36500000-0000-4000-8000-000000000065'),null::jsonb,'Expired claim with an unresolved browser is not transferable');
reset role;
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where state='active';
set local role service_role;
insert into message_context values('reclaimed',public.marketplace_cloud_message_claim('36500000-0000-4000-8000-000000000051',1,'36500000-0000-4000-8000-000000000065'));
select ok((select body->>'claimToken' from message_context where name='claim')<>(select body->>'claimToken' from message_context where name='reclaimed'),'Confirmed browser stop permits a new claim for an unstarted attempt');
select is(pg_temp.check_run()->>'active','false','Old claim is fenced after recovery');
reset role;
delete from public.platform_operators where user_id='36500000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.marketplace_cloud_message_check('36500000-0000-4000-8000-000000000011','36500000-0000-4000-8000-000000000021',(body->>'messageId')::uuid,(body->>'claimToken')::uuid,'36500000-0000-4000-8000-000000000051',1)->>'active','false','Operator removal fences the current write before any further provider action') from message_context where name='reclaimed';
reset role;
select * from finish();
rollback;
