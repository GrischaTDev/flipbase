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
set local role service_role;
select lives_ok($$select public.marketplace_import_local_inbox('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021',repeat('a',64),pg_temp.inbox(true))$$,'Latest import preserves separate backfill cursor');
select lives_ok($$select public.marketplace_import_local_inbox('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021',repeat('a',64),pg_temp.inbox(false))$$,'Unchanged list import without detail');
reset role;
select is((select body->>'lastActiveAt' from public.marketplace_account_entries where id='36100000-0000-4000-8000-000000000031'),'2026-10-04T09:00:00Z','Latest list does not erase known partner activity');
select is((select body->>'itemTitle' from public.marketplace_account_entries where id='36100000-0000-4000-8000-000000000031'),'Boots','Latest list does not erase known article');
select is((select inbox_next_page from public.marketplace_local_extension_grants where connection_id='36100000-0000-4000-8000-000000000021'),4,'Latest import does not rewind pending backfill');
select ok((select relrowsecurity from pg_class where oid='public.marketplace_local_message_outbox'::regclass),'Outbox RLS enabled');
select ok(not has_table_privilege('authenticated','public.marketplace_local_message_outbox','select'),'App cannot read private photo bytes or claims');
select ok(not has_table_privilege('anon','public.marketplace_local_message_outbox','insert'),'Anonymous cannot enqueue directly');
select ok(not has_function_privilege('authenticated','public.marketplace_local_message_claim(uuid,uuid,text)','execute'),'App cannot claim');
select set_config('request.jwt.claim.sub','36100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select pg_temp.enqueue()$$,'42501',null,'Read grant does not authorize send');
select lives_ok($$select public.marketplace_approve_local_messaging('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021',repeat('a',64),'123')$$,'Explicit same-installation grant');
select lives_ok($$select pg_temp.enqueue()$$,'Enqueues explicit text');
select lives_ok($$select pg_temp.enqueue()$$,'Repeating identical request id is idempotent');
select throws_ok($$select pg_temp.enqueue('36100000-0000-4000-8000-000000000041','Changed')$$,'23505',null,'Request id cannot change its payload');
select lives_ok($$select pg_temp.enqueue('36100000-0000-4000-8000-000000000042',E'Hallo\nZweite Zeile')$$,'Multiline text accepted');
select throws_ok($$select pg_temp.enqueue('36100000-0000-4000-8000-000000000043','')$$,'22023',null,'Empty message rejected');
select throws_ok($$select pg_temp.enqueue('36100000-0000-4000-8000-000000000043','',jsonb_build_object('name','a.png','mimeType','image/png','base64','c2VjcmV0'))$$,'22023',null,'False PNG rejected');
select ok(not (public.marketplace_read_local_messages('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021','36100000-0000-4000-8000-000000000031')::text like '%claimToken%'),'Public queue hides claim');
reset role;
select is((select count(*)::integer from public.marketplace_local_message_outbox where request_id='36100000-0000-4000-8000-000000000041'),1,'One row per stable request');
update public.marketplace_local_message_outbox set created_at=clock_timestamp()-interval '1 minute' where request_id='36100000-0000-4000-8000-000000000041';
set local role service_role;
select ok((pg_temp.claim()->'command') is not null,'Worker claims first command');
select lives_ok($$select pg_temp.start()$$,'Start persisted before provider attempt');
select throws_ok($$select pg_temp.start()$$,'42501',null,'Starting twice never permits second attempt');
select throws_ok($$select pg_temp.report('sent')$$,'22023',null,'No sent state without provider id');
select lives_ok($$select pg_temp.report('outcome_unknown')$$,'Ambiguous attempt persisted');
select lives_ok($$select pg_temp.report('outcome_unknown')$$,'Lost finish acknowledgement can replay');
select lives_ok($$select pg_temp.report('sent','999')$$,'Same attempt can report subsequently proven result');
select lives_ok($$select pg_temp.report('sent','999')$$,'Proven result replay is idempotent');
select throws_ok($$select pg_temp.report('sent','1000')$$,'23505',null,'Conflicting provider id rejected');
select ok((pg_temp.claim()->'command') is not null,'Next queued message claimed');
select lives_ok($$select public.marketplace_local_message_finish('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021',repeat('a',64),id,claim_token,'outcome_unknown',null,'interrupted') from public.marketplace_local_message_outbox where request_id='36100000-0000-4000-8000-000000000042'$$,'Lost start acknowledgement stops retry even while claim state remains');
reset role;
select is((select count(*)::integer from public.marketplace_account_entries where kind='message' and external_id='999' and parent_id='36100000-0000-4000-8000-000000000031'),1,'Confirmed message belongs to correct conversation');
set local role authenticated;
select lives_ok($$select pg_temp.enqueue('36100000-0000-4000-8000-000000000043','Pending')$$,'Another explicit message waiting');
reset role;
select set_config('request.jwt.claim.sub','36100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select pg_temp.enqueue('36100000-0000-4000-8000-000000000043')$$,'42501',null,'Foreign user cannot enqueue');
select throws_ok($$select public.marketplace_read_local_messages('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021','36100000-0000-4000-8000-000000000031')$$,'42501',null,'Foreign user cannot read queue');
reset role;
update public.marketplace_local_extension_grants set revoked_at=clock_timestamp() where connection_id='36100000-0000-4000-8000-000000000021';
set local role service_role;
select throws_ok($$select pg_temp.claim()$$,'42501',null,'Revocation stops new claims');
reset role;
select set_config('request.jwt.claim.sub','36100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.marketplace_read_local_messages('36100000-0000-4000-8000-000000000011','36100000-0000-4000-8000-000000000021','36100000-0000-4000-8000-000000000031')$$,'Owner sees cancelled pending message after revocation');
reset role;
select is((select state from public.marketplace_local_message_outbox where request_id='36100000-0000-4000-8000-000000000043'),'cancelled','Revoked unsent message is not shown waiting forever');
select * from finish();
rollback;
