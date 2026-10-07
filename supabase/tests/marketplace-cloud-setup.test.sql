\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
select has_table('public','marketplace_cloud_ips','Cloud IP inventory exists');
select has_table('public','marketplace_cloud_setups','Persistent setup reservations exist');
select has_function('public','marketplace_cloud_setup_begin',array['uuid','uuid','uuid','text'],'Cloud setup begins atomically');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('37100000-0000-4000-8000-000000000001','authenticated','authenticated','cloud-owner@example.test','{}','{}'),
 ('37100000-0000-4000-8000-000000000002','authenticated','authenticated','cloud-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('37100000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('37100000-0000-4000-8000-000000000011','Cloud A'),('37100000-0000-4000-8000-000000000012','Cloud B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000001','owner'),
 ('37100000-0000-4000-8000-000000000012','37100000-0000-4000-8000-000000000002','owner');
insert into public.marketplace_connections(id,workspace_id,display_name) values
 ('37100000-0000-4000-8000-000000000021','37100000-0000-4000-8000-000000000011','Local A'),
 ('37100000-0000-4000-8000-000000000022','37100000-0000-4000-8000-000000000011','Local B');
insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at,enabled,verified_at) values
 ('expired-ip',repeat('1',64),'order-expired','DE',now()-interval '1 day',true,now()),
 ('foreign-ip',repeat('2',64),'order-foreign','FR',now()+interval '30 days',true,now()),
 ('iproyal-test-a',repeat('3',64),'order-test','DE',now()+interval '30 days',true,now());
select throws_ok($$insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at) values('same-exit-alias',repeat('3',64),'order-test','DE',now()+interval '30 days')$$,'23505',null,'The same physical exit cannot become a second free IP');
create function pg_temp.begin_setup(p_connection uuid default '37100000-0000-4000-8000-000000000021',p_request uuid default '37100000-0000-4000-8000-000000000031',p_name text default null)
returns jsonb language sql as $$ select public.marketplace_cloud_setup_begin('37100000-0000-4000-8000-000000000011',p_connection,p_request,p_name); $$;
create function pg_temp.step(p_action text,p_identity text default null,p_profile text default null) returns jsonb language sql as $$
 select public.marketplace_cloud_setup_update('37100000-0000-4000-8000-000000000011',
  (select public_id from public.marketplace_cloud_setups where request_id='37100000-0000-4000-8000-000000000031'),
  '37100000-0000-4000-8000-000000000001','37100000-0000-4000-8000-000000000041',1,p_action,p_profile,p_identity,'seller');
$$;
select ok(not has_table_privilege('authenticated','public.marketplace_cloud_ips','select'),'App cannot inspect private IP inventory');
select ok(not has_table_privilege('authenticated','public.marketplace_cloud_setups','update'),'App cannot mutate reservations');
select ok(not has_function_privilege('authenticated','public.marketplace_cloud_setup_update(uuid,uuid,uuid,uuid,bigint,text,text,text,text)','execute'),'App cannot forge a worker transition');
select ok(not has_function_privilege('anon','public.marketplace_cloud_setup_begin(uuid,uuid,uuid,text)','execute'),'Anonymous caller cannot reserve an IP');
select ok(not has_function_privilege('authenticated','public.marketplace_cloud_network_valid(uuid,uuid)','execute'),'App cannot inspect a private binding');
select ok(not has_sequence_privilege('authenticated','public.marketplace_cloud_ips_id_seq','usage'),'App cannot use private inventory sequence');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"37100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.marketplace_approve_local_extension('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021',repeat('a',64),'123');
select is(pg_temp.begin_setup()->>'status','ready','First account reserves the eligible IP');
select is(pg_temp.begin_setup()->'setup'->>'state','reserved','Repeated request returns the original reservation');
select is(pg_temp.begin_setup('37100000-0000-4000-8000-000000000022','37100000-0000-4000-8000-000000000032')->>'status','no_capacity','Second account cannot share the only free IP');
select is(pg_temp.begin_setup(null,'37100000-0000-4000-8000-000000000033','New Cloud')->>'status','no_capacity','No new connection is created without capacity');
select throws_ok($$select pg_temp.begin_setup('37100000-0000-4000-8000-000000000022')$$,'23505',null,'Request ID cannot switch accounts');
select ok(not (pg_temp.begin_setup()->'setup' ? 'networkId'),'Public result contains no private network reference');
select is((select execution_mode from public.marketplace_connections where id='37100000-0000-4000-8000-000000000021'),'local','Reservation preserves local execution');
select set_config('request.jwt.claims','{"sub":"37100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.begin_setup()$$,'42501',null,'Other workspace owner cannot allocate an IP');
reset role;
select is((select count(*)::integer from public.marketplace_connections where workspace_id='37100000-0000-4000-8000-000000000011'),2,'Capacity failure leaves connection count unchanged');
select is((select ip.network_id from public.marketplace_cloud_setups setup join public.marketplace_cloud_ips ip on ip.id=setup.cloud_ip_id),'iproyal-test-a','Expired and foreign IPs are excluded');
update public.marketplace_connections set status='connected' where id='37100000-0000-4000-8000-000000000021';
update public.marketplace_local_extension_grants set messages_read=true,messages_send=true where connection_id='37100000-0000-4000-8000-000000000021';
set local role service_role;
select public.marketplace_worker_claim('37100000-0000-4000-8000-000000000041');
select is(pg_temp.step('claim')->'setup'->>'state','reserved','Current worker binds the reservation');
select is(pg_temp.step('bind',null,'chromium_37100000-0000-4000-8000-000000000051')->'setup'->>'state','login','Reserved profile permits setup login');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"37100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.marketplace_browser_session_reserve('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021')$$,'42501',null,'Normal cloud session still rejects local account');
select public.marketplace_cloud_setup_session_reserve('37100000-0000-4000-8000-000000000011',(pg_temp.begin_setup()->'setup'->>'setupId')::uuid);
reset role;
set local role service_role;
select public.marketplace_browser_session_bind_worker((select public_id from public.marketplace_browser_sessions where connection_id='37100000-0000-4000-8000-000000000021'),'37100000-0000-4000-8000-000000000041',1);
select throws_ok($$select pg_temp.step('verify','999')$$,'23505',null,'Different Vinted identity cannot replace local account');
reset role;
update public.marketplace_local_extension_grants set grant_generation=grant_generation+1 where connection_id='37100000-0000-4000-8000-000000000021';
set local role service_role;
select throws_ok($$select pg_temp.step('verify','123')$$,'42501',null,'Changed local generation blocks identity confirmation');
reset role;
update public.marketplace_local_extension_grants set grant_generation=grant_generation-1 where connection_id='37100000-0000-4000-8000-000000000021';
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at) values
 ('37100000-0000-4000-8000-000000000061','37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021','conversation','777','{"title":"Buyer"}',clock_timestamp());
insert into public.marketplace_local_message_outbox(workspace_id,connection_id,conversation_id,external_conversation_id,external_account_id,grant_generation,requested_by,request_id,payload_hash,message_text,state,claim_token) values
 ('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021','37100000-0000-4000-8000-000000000061','777','123',1,'37100000-0000-4000-8000-000000000001','37100000-0000-4000-8000-000000000062',repeat('c',64),'Pending','sending','37100000-0000-4000-8000-000000000063');
set local role service_role;
select is(pg_temp.step('verify','123')->'setup'->>'state','verified','Observed identity is staged without switching');
select throws_ok($$select pg_temp.step('finalize')$$,'55P03',null,'Sending message blocks the cloud transition');
update public.marketplace_local_message_outbox set state='outcome_unknown';
select throws_ok($$select pg_temp.step('finalize')$$,'55P03',null,'Ambiguous provider outcome is never retried or bypassed');
update public.marketplace_local_message_outbox set state='queued',claim_token=null;
insert into public.marketplace_local_message_outbox(id,workspace_id,connection_id,conversation_id,external_conversation_id,external_account_id,grant_generation,requested_by,request_id,payload_hash,message_text,state,claim_token) values
 ('37100000-0000-4000-8000-000000000064','37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021','37100000-0000-4000-8000-000000000061','777','123',1,'37100000-0000-4000-8000-000000000001','37100000-0000-4000-8000-000000000065',repeat('d',64),'Retry test','failed','37100000-0000-4000-8000-000000000066');
select is(pg_temp.step('finalize')->'setup'->>'state','finalizing','Prepared transition pauses new local actions');
select throws_ok($$select pg_temp.step('complete')$$,'55P03',null,'Unconfirmed browser stop blocks completion');
reset role;
select ok((select revoked_at is null from public.marketplace_local_extension_grants where connection_id='37100000-0000-4000-8000-000000000021'),'Local grant remains active before completion');
select throws_ok($$update public.marketplace_local_extension_grants set grant_generation=grant_generation+1 where connection_id='37100000-0000-4000-8000-000000000021'$$,'55P03',null,'Grant cannot rotate during finalization');
set local role authenticated;
select throws_ok($$select public.marketplace_approve_local_extension('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021',repeat('b',64),'123')$$,'55P03',null,'Authenticated approval cannot bypass the finalization fence');
select throws_ok($$select public.marketplace_retry_local_message('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021','37100000-0000-4000-8000-000000000061','37100000-0000-4000-8000-000000000064')$$,'55P03',null,'Explicit local retry cannot bypass the finalization fence');
reset role;
select is((select state from public.marketplace_local_message_outbox where id='37100000-0000-4000-8000-000000000064'),'failed','Blocked retry preserves the original message');
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where connection_id='37100000-0000-4000-8000-000000000021';
set local role service_role;
select is(pg_temp.step('complete')->'setup'->>'state','completed','Confirmed stop permits atomic completion');
select is(pg_temp.step('complete')->'setup'->>'state','completed','Lost completion reply is idempotent');
reset role;
select is((select execution_mode from public.marketplace_connections where id='37100000-0000-4000-8000-000000000021'),'cloud','Same connection now executes in cloud');
select is((select external_account_id from public.marketplace_connections where id='37100000-0000-4000-8000-000000000021'),'123','Account identity remains unchanged');
select ok((select revoked_at is not null from public.marketplace_local_extension_grants where connection_id='37100000-0000-4000-8000-000000000021'),'Successful switch revokes extension grant');
select is((select state from public.marketplace_local_message_outbox where request_id='37100000-0000-4000-8000-000000000062'),'cancelled','Queued local message is cancelled rather than replayed in the cloud');
select is((select count(*)::integer from public.marketplace_account_entries where id='37100000-0000-4000-8000-000000000061'),1,'Existing conversation keeps its identity');
select throws_ok($$delete from public.marketplace_connections where id='37100000-0000-4000-8000-000000000021'$$,'23503',null,'Deletion cannot free an uncleared IP');
set local role authenticated;
select throws_ok($$select public.marketplace_retry_local_message('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021','37100000-0000-4000-8000-000000000061','37100000-0000-4000-8000-000000000064')$$,'42501',null,'Completed cloud upgrade rejects local retries');
select public.marketplace_browser_session_reserve('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021');
reset role;
update public.marketplace_cloud_ips set expires_at=clock_timestamp()-interval '1 second' where network_id='iproyal-test-a';
select ok(not public.marketplace_cloud_network_valid('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021'),'Expired assigned IP stops cloud authorization');
select public_id as test_session_id from public.marketplace_browser_sessions where state='active' \gset
set local role authenticated;
select is(public.marketplace_browser_session_check('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000021',:'test_session_id')->>'active','false','Running normal browser stops authorizing an expired IP');
reset role;
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp();
update public.marketplace_connections set execution_mode='local' where id='37100000-0000-4000-8000-000000000021';
set local role service_role;
select is(pg_temp.step('release')->'setup'->>'state','cleanup_pending','Switching back to local requests controlled IP cleanup');
select throws_ok($$select pg_temp.step('cleanup')$$,'55P03',null,'Mapped profile keeps the IP reserved');
select lives_ok($$select pg_temp.step('detach',null,'chromium_37100000-0000-4000-8000-000000000051')$$,'Stopped unassigned profile can be detached');
select is(pg_temp.step('cleanup')->'setup'->>'state','cancelled','Confirmed cleanup frees the IP');
reset role;
-- Bereits verbundene Cloudkonten ohne IP-Reservierung behalten Konto und Daten.
update public.marketplace_cloud_ips set expires_at=now()+interval '30 days' where network_id='iproyal-test-a';
insert into public.marketplace_connections(id,workspace_id,display_name,external_account_id,execution_mode,status) values
 ('37100000-0000-4000-8000-000000000023','37100000-0000-4000-8000-000000000011','Legacy Cloud','777','cloud','connected');
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values
 ('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000023','chromium_37100000-0000-4000-8000-000000000071');
insert into public.marketplace_sync_schedules(workspace_id,connection_id,activated_by,enabled,next_due_at,authorization_version) values
 ('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000023','37100000-0000-4000-8000-000000000001',true,now()+interval '15 minutes',3);
insert into public.marketplace_operations(workspace_id,connection_id,requested_by,state) values
 ('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000023','37100000-0000-4000-8000-000000000001','queued');
create function pg_temp.begin_legacy() returns jsonb language sql as $$
 select pg_temp.begin_setup('37100000-0000-4000-8000-000000000023','37100000-0000-4000-8000-000000000034');
$$;
create function pg_temp.legacy_step(p_action text,p_identity text default null,p_profile text default null) returns jsonb language sql as $$
 select public.marketplace_cloud_setup_update('37100000-0000-4000-8000-000000000011',
  (select public_id from public.marketplace_cloud_setups where request_id='37100000-0000-4000-8000-000000000034'),
  '37100000-0000-4000-8000-000000000001','37100000-0000-4000-8000-000000000041',1,p_action,p_profile,p_identity,'legacy-seller');
$$;
set local role authenticated;
select throws_ok($$select pg_temp.begin_legacy()$$,'55P03',null,'An active read prevents legacy cloud migration');
reset role;
update public.marketplace_operations set state='failed' where connection_id='37100000-0000-4000-8000-000000000023';
set local role authenticated;
select is(pg_temp.begin_legacy()->>'status','ready','An existing cloud account reserves a free ISP IP');
select is(pg_temp.begin_legacy()->'setup'->>'state','reserved','Legacy reservation is idempotent');
reset role;
select is((select expected_external_account_id from public.marketplace_cloud_setups where connection_id='37100000-0000-4000-8000-000000000023'),'777','Legacy identity is retained for verification');
select ok((select not enabled and next_due_at is null and authorization_version=4 from public.marketplace_sync_schedules where connection_id='37100000-0000-4000-8000-000000000023'),'Only a successful reservation revokes the old schedule once');
select is((select provider_profile_id from public.marketplace_browser_profiles where connection_id='37100000-0000-4000-8000-000000000023'),'chromium_37100000-0000-4000-8000-000000000071','Reservation does not silently rewrite the old profile');
set local role service_role;
select lives_ok($$select pg_temp.legacy_step('claim')$$,'Worker claims the legacy transition');
reset role;
select throws_ok($$insert into public.marketplace_operations(workspace_id,connection_id,requested_by,state) values
 ('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000023','37100000-0000-4000-8000-000000000001','queued')$$,'42501',null,'A reserved transition rejects late normal reads');
set local role service_role;
select lives_ok($$select pg_temp.legacy_step('unmap',null,'chromium_37100000-0000-4000-8000-000000000071')$$,'Confirmed old profile can be detached');
select lives_ok($$select pg_temp.legacy_step('bind',null,'chromium_37100000-0000-4000-8000-000000000072')$$,'A separate proxy profile is bound');
reset role;
set local role authenticated;
select public.marketplace_cloud_setup_session_reserve('37100000-0000-4000-8000-000000000011',(pg_temp.begin_legacy()->'setup'->>'setupId')::uuid);
reset role;
set local role service_role;
select public.marketplace_browser_session_bind_worker((select public_id from public.marketplace_browser_sessions where connection_id='37100000-0000-4000-8000-000000000023'),'37100000-0000-4000-8000-000000000041',1);
select throws_ok($$select pg_temp.legacy_step('verify','999')$$,'23505',null,'Legacy migration rejects another signed-in account');
select lives_ok($$select pg_temp.legacy_step('verify','777')$$,'The same account can confirm its proxy profile');
select lives_ok($$select pg_temp.legacy_step('finalize')$$,'Verified legacy migration prepares completion');
reset role;
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where connection_id='37100000-0000-4000-8000-000000000023';
set local role service_role;
select is(pg_temp.legacy_step('complete')->'setup'->>'state','completed','Stopped proxy browser completes the legacy transition');
reset role;
select is((select external_account_id from public.marketplace_connections where id='37100000-0000-4000-8000-000000000023'),'777','Migration keeps the existing account identity');
select ok((select not enabled from public.marketplace_sync_schedules where connection_id='37100000-0000-4000-8000-000000000023'),'Completion does not automatically resume the schedule');
set local role authenticated;
select is(pg_temp.begin_setup('37100000-0000-4000-8000-000000000023','37100000-0000-4000-8000-000000000035')->'setup'->>'state','completed','A configured cloud account reuses its completed setup');
select is(pg_temp.begin_setup('37100000-0000-4000-8000-000000000022','37100000-0000-4000-8000-000000000036')->>'status','no_capacity','A bound legacy account does not share its proxy');
reset role;
insert into public.marketplace_connections(id,workspace_id,display_name,external_account_id,execution_mode,status) values
 ('37100000-0000-4000-8000-000000000024','37100000-0000-4000-8000-000000000011','Legacy Cancel','778','cloud','connected');
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values
 ('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000024','chromium_37100000-0000-4000-8000-000000000073');
insert into public.marketplace_sync_schedules(workspace_id,connection_id,activated_by,enabled,next_due_at,authorization_version) values
 ('37100000-0000-4000-8000-000000000011','37100000-0000-4000-8000-000000000024','37100000-0000-4000-8000-000000000001',true,now()+interval '15 minutes',7);
set local role authenticated;
select is(pg_temp.begin_setup('37100000-0000-4000-8000-000000000024','37100000-0000-4000-8000-000000000037')->>'status','no_capacity','Legacy account also receives the capacity failure');
reset role;
select ok((select enabled and next_due_at is not null and authorization_version=7 from public.marketplace_sync_schedules where connection_id='37100000-0000-4000-8000-000000000024'),'No capacity does not change an existing schedule');
insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at,enabled,verified_at) values
 ('iproyal-test-b',repeat('4',64),'order-test-b','DE',now()+interval '30 days',true,now());
set local role authenticated;
select is(pg_temp.begin_setup('37100000-0000-4000-8000-000000000024','37100000-0000-4000-8000-000000000037')->>'status','ready','Capacity retry can reserve an IP for the same legacy account');
select is(public.marketplace_cloud_setup_cancel('37100000-0000-4000-8000-000000000011',(pg_temp.begin_setup('37100000-0000-4000-8000-000000000024','37100000-0000-4000-8000-000000000037')->'setup'->>'setupId')::uuid)->>'state','cleanup_pending','Cancelling legacy setup first requests controlled cleanup');
reset role;
set local role service_role;
select public.marketplace_cloud_setup_update('37100000-0000-4000-8000-000000000011',(select public_id from public.marketplace_cloud_setups where request_id='37100000-0000-4000-8000-000000000037'),'37100000-0000-4000-8000-000000000001','37100000-0000-4000-8000-000000000041',1,'recover');
select is(public.marketplace_cloud_setup_update('37100000-0000-4000-8000-000000000011',(select public_id from public.marketplace_cloud_setups where request_id='37100000-0000-4000-8000-000000000037'),'37100000-0000-4000-8000-000000000001','37100000-0000-4000-8000-000000000041',1,'cleanup')->'setup'->>'state','cancelled','Confirmed cleanup releases the cancelled reservation');
reset role;
select is((select external_account_id from public.marketplace_connections where id='37100000-0000-4000-8000-000000000024'),'778','Cancellation keeps the legacy connection');
select is((select provider_profile_id from public.marketplace_browser_profiles where connection_id='37100000-0000-4000-8000-000000000024'),'chromium_37100000-0000-4000-8000-000000000073','Cancellation before browser opening retains the old profile mapping');
select ok((select not enabled from public.marketplace_sync_schedules where connection_id='37100000-0000-4000-8000-000000000024'),'Cancellation does not restart the old schedule');
select * from finish();
rollback;
