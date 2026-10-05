\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('36100000-0000-4000-8000-000000000001','authenticated','authenticated','message-owner@example.test','{}','{}'),
 ('36100000-0000-4000-8000-000000000002','authenticated','authenticated','message-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('36100000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('36100000-0000-4000-8000-000000000011','Message A');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,execution_mode,status,external_account_id) values
 ('36100000-0000-4000-8000-000000000021','36100000-0000-4000-8000-000000000011','Message A','local','connected','123');
insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at,messages_read,inbox_next_page) values
 ('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021','36100000-0000-4000-8000-000000000001',repeat('a',64),'123',clock_timestamp()+interval '1 hour',true,4);
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at) values
 ('36100000-0000-4000-8000-000000000031','36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021','conversation','777','{"title":"Buyer"}',clock_timestamp());
create function pg_temp.enqueue(p_id uuid default '36100000-0000-4000-8000-000000000041',p_text text default 'Hallo',p_attachment jsonb default null) returns jsonb language sql as $$
 select public.marketplace_enqueue_local_message('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021','36100000-0000-4000-8000-000000000031',p_id,p_text,p_attachment);
$$;
create function pg_temp.claim() returns jsonb language sql as $$
 select public.marketplace_local_message_claim('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021',repeat('a',64));
$$;
create function pg_temp.start() returns jsonb language sql as $$
 select public.marketplace_local_message_start('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021',repeat('a',64),id,claim_token) from public.marketplace_local_message_outbox where request_id='36100000-0000-4000-8000-000000000041';
$$;
create function pg_temp.report(p_outcome text,p_external text default null) returns jsonb language sql as $$
 select public.marketplace_local_message_finish('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021',repeat('a',64),id,claim_token,p_outcome,p_external) from public.marketplace_local_message_outbox where request_id='36100000-0000-4000-8000-000000000041';
$$;
create function pg_temp.inbox(p_details boolean) returns jsonb language sql as $$
 select jsonb_build_object('identity',jsonb_build_object('id','123'),'mode','latest','observedAt',clock_timestamp(),'page',1,'nextPage',4,'conversationsComplete',false,
 'entries',jsonb_build_array(jsonb_build_object('kind','conversation','externalId','777','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Buyer','text','Hello','occurredAt',clock_timestamp(),'sourceUpdatedAt','2026-10-04T10:00:00Z','detailCheckedAt',case when p_details then clock_timestamp() end,'unread',false,'imageUrl',null,'lastActiveAt',case when p_details then '2026-10-04T09:00:00Z' end,'itemTitle',case when p_details then 'Boots' end,'itemPrice',case when p_details then 58 end))));
$$;
create function pg_temp.retry(p_confirmed boolean default false) returns jsonb language sql as $$
 select public.marketplace_retry_local_message('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021','36100000-0000-4000-8000-000000000031',
   current_setting('test.retry_source_id')::uuid,p_confirmed);
$$;
select set_config('request.jwt.claim.sub','36100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.marketplace_approve_local_messaging('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021',repeat('a',64),'123')$$,'Approve initial send');
select lives_ok($$select pg_temp.enqueue('36100000-0000-4000-8000-000000000041','Hallo',jsonb_build_object('name','photo.jpg','mimeType','image/jpeg','base64','/9j/2Q=='))$$,'Enqueue text and image');
reset role;
select set_config('test.retry_source_id',(select id::text from public.marketplace_local_message_outbox where request_id='36100000-0000-4000-8000-000000000041'),true);
set local role authenticated;
select throws_ok($$select pg_temp.retry()$$,'22023',null,'Pending messages cannot be retried');
reset role;
set local role service_role;
select ok((pg_temp.claim()->'command') is not null,'Claim original attempt');
select lives_ok($$select pg_temp.start()$$,'Start original attempt');
select lives_ok($$select pg_temp.report('outcome_unknown')$$,'Record uncertain outcome');
reset role;
set local role authenticated;
select throws_ok($$select pg_temp.retry()$$,'22023',null,'Uncertain outcomes require explicit user confirmation');
select lives_ok($$select pg_temp.retry(true)$$,'Explicit retry creates replacement');
select lives_ok($$select pg_temp.retry(true)$$,'Lost acknowledgement replays replacement');
reset role;
select is((select count(*)::integer from public.marketplace_local_message_outbox),2,'Exactly one replacement for repeated clicks');
select is((select state from public.marketplace_local_message_outbox where request_id='36100000-0000-4000-8000-000000000041'),'cancelled','Original attempt is superseded');
select is((select attachment_base64 from public.marketplace_local_message_outbox where state='queued'),'/9j/2Q==','Attachment survives retry without browser payload');
select is((select message_text from public.marketplace_local_message_outbox where state='queued'),'Hallo','Text survives retry');
set local role service_role;
select lives_ok($$select pg_temp.report('outcome_unknown')$$,'Late original receipt is acknowledged without another send');
select lives_ok($$select pg_temp.report('sent','999')$$,'Late success of original attempt is recorded');
reset role;
select is((select state from public.marketplace_local_message_outbox where request_id=(select id from public.marketplace_local_message_outbox where request_id='36100000-0000-4000-8000-000000000041')),'cancelled','Proven late success cancels a replacement not yet started');
select is((select count(*)::integer from public.marketplace_account_entries where external_id='999' and kind='message'),1,'Proven late result remains visible in transcript');
set local role authenticated;
select throws_ok($$select pg_temp.retry(true)$$,'22023',null,'Confirmed messages cannot be retried');
select set_config('test.retry_source_id',(pg_temp.enqueue('36100000-0000-4000-8000-000000000042','Failed text')->'message'->>'id'),true);
reset role;
set local role service_role;
select ok((pg_temp.claim()->'command') is not null,'Claim known failure');
select lives_ok($$select public.marketplace_local_message_finish(workspace_id,connection_id,repeat('a',64),id,claim_token,'failed',null,'login_required') from public.marketplace_local_message_outbox where id=current_setting('test.retry_source_id')::uuid$$,'Record known failure before provider POST');
reset role;
set local role authenticated;
select lives_ok($$select pg_temp.retry()$$,'Known failure retries without uncertain-send confirmation');
select lives_ok($$select pg_temp.retry()$$,'Known failure replay returns the same replacement');
select throws_ok($$select public.marketplace_retry_local_message('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021','36100000-0000-4000-8000-000000000099',current_setting('test.retry_source_id')::uuid,true)$$,'42501',null,'Retry cannot target a different conversation');
reset role;
select is((select count(*)::integer from public.marketplace_local_message_outbox where state='queued'),1,'Known failure has exactly one queued replacement');
select ok(not has_function_privilege('anon','public.marketplace_retry_local_message(uuid,uuid,uuid,uuid,boolean)','execute'),'Anonymous retry access is revoked');
set local role service_role;
select ok((pg_temp.claim()->'command') is not null,'Claim replacement for uncertain result');
select lives_ok($$select public.marketplace_local_message_finish(workspace_id,connection_id,repeat('a',64),id,claim_token,'outcome_unknown',null,'interrupted') from public.marketplace_local_message_outbox where state='claimed'$$,'Store uncertainty for replacement');
reset role;
select set_config('test.retry_source_id',(select id::text from public.marketplace_local_message_outbox where state='outcome_unknown'),true);
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at) values
 ('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021','message','1001','36100000-0000-4000-8000-000000000031','{"text":"Failed text","direction":"outbound"}',clock_timestamp());
set local role authenticated;
select throws_ok($$select pg_temp.retry(true)$$,'22023',null,'Imported matching message prevents duplicate send even with confirmation');
reset role;
select set_config('request.jwt.claim.sub','36100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select pg_temp.retry(true)$$,'42501',null,'Foreign user cannot retry');
reset role;
select set_config('request.jwt.claim.sub','36100000-0000-4000-8000-000000000001',true);
update public.marketplace_local_extension_grants set revoked_at=clock_timestamp();
set local role authenticated;
select throws_ok($$select pg_temp.retry(true)$$,'42501',null,'Revoked grant cannot retry');
reset role;
select * from finish();
rollback;
