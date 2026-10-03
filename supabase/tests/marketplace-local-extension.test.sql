\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('35100000-0000-4000-8000-000000000001','authenticated','authenticated','local-owner@example.test','{}','{}'),
 ('35100000-0000-4000-8000-000000000002','authenticated','authenticated','local-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('35100000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('35100000-0000-4000-8000-000000000011','Local A'),('35100000-0000-4000-8000-000000000012','Local B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000001','owner'),
 ('35100000-0000-4000-8000-000000000012','35100000-0000-4000-8000-000000000002','owner');
insert into public.marketplace_connections(id,workspace_id,display_name) values
 ('35100000-0000-4000-8000-000000000021','35100000-0000-4000-8000-000000000011','Local A'),
 ('35100000-0000-4000-8000-000000000022','35100000-0000-4000-8000-000000000011','Cloud B'),
 ('35100000-0000-4000-8000-000000000023','35100000-0000-4000-8000-000000000012','Foreign');
create function pg_temp.approve(p_hash text default repeat('a',64),p_identity text default '123') returns jsonb language sql as $$
 select public.marketplace_approve_local_extension('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021',p_hash,p_identity);
$$;
create function pg_temp.ingest(p_hash text default repeat('a',64),p_snapshot jsonb default null) returns jsonb language sql as $$
 select public.marketplace_ingest_local_extension('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021',p_hash,p_snapshot);
$$;
create function pg_temp.snapshot(p_identity text default '123',p_complete boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('identity',jsonb_build_object('id',p_identity,'username','seller'),'observedAt',clock_timestamp(),'publicationsComplete',p_complete,
 'entries',jsonb_build_array(jsonb_build_object('kind','profile','externalId',p_identity,'sortAt',clock_timestamp(),'body',jsonb_build_object('username','seller')),
 jsonb_build_object('kind','publication','externalId','456','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Boots','price',58))));
$$;
select ok(not has_table_privilege('authenticated','public.marketplace_local_extension_grants','select'),'Token hashes are not readable by app users');
select ok(not has_table_privilege('service_role','auth.users','select'),'Worker receives no broad auth.users access');
select ok(not has_function_privilege('authenticated','public.marketplace_local_extension_user_valid(uuid)','execute'),'App cannot probe private user validity');
select ok(not has_function_privilege('authenticated','public.marketplace_ingest_local_extension(uuid,uuid,text,jsonb)','execute'),'Client cannot call trusted import RPC');
select ok(not has_function_privilege('anon','public.marketplace_approve_local_extension(uuid,uuid,text,text)','execute'),'Anonymous cannot approve');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.approve()$$,'42501',null,'Foreign user cannot approve');
select set_config('request.jwt.claims','{"sub":"35100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.marketplace_approve_local_extension('35100000-0000-4000-8000-000000000012','35100000-0000-4000-8000-000000000023',repeat('a',64),'123')$$,'42501',null,'Foreign workspace cannot approve');
select throws_ok($$select pg_temp.approve('bad','123')$$,'22023',null,'Malformed hash rejected');
select throws_ok($$select pg_temp.approve(repeat('a',64),'00123')$$,'22023',null,'Noncanonical identity rejected');
reset role;
insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at) values('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021','35100000-0000-4000-8000-000000000001','local-conflict',clock_timestamp()+interval '1 minute');
set local role authenticated;
select throws_ok($$select pg_temp.approve()$$,'55P03',null,'Unresolved cloud session prevents local takeover');
reset role;
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where connection_id='35100000-0000-4000-8000-000000000021';
insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version) values('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021','35100000-0000-4000-8000-000000000001','manual_read',1);
set local role authenticated;
select throws_ok($$select pg_temp.approve()$$,'55P03',null,'Queued cloud operation prevents takeover');
reset role;
update public.marketplace_operations set state='failed' where connection_id='35100000-0000-4000-8000-000000000021';
insert into public.marketplace_sync_schedules(workspace_id,connection_id,activated_by,enabled,interval_minutes,next_due_at) values('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021','35100000-0000-4000-8000-000000000001',true,15,clock_timestamp()+interval '15 minutes');
set local role authenticated;
select throws_ok($$select pg_temp.approve()$$,'55P03',null,'Active schedule prevents takeover');
reset role;
update public.marketplace_sync_schedules set enabled=false,next_due_at=null where connection_id='35100000-0000-4000-8000-000000000021';
set local role authenticated;
select lives_ok($$select pg_temp.approve()$$,'Manager may explicitly approve local pilot');
select is((select execution_mode from public.marketplace_connections where id='35100000-0000-4000-8000-000000000021'),'local','Approval selects local execution');
select is((select status from public.marketplace_connections where id='35100000-0000-4000-8000-000000000021'),'needs_login','Approval does not fabricate observed login');
select lives_ok($$select pg_temp.approve()$$,'Identical approval is idempotent after a lost binding acknowledgement');
select is(pg_temp.approve()->>'expiresAt',public.marketplace_read_local_extension('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021')->'binding'->>'expiresAt','Idempotent approval never extends its existing TTL');
select throws_ok($$select pg_temp.approve(repeat('b',64))$$,'55P03',null,'Second installation cannot overwrite active grant');
select throws_ok($$select public.marketplace_browser_session_reserve('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021')$$,'42501',null,'Local account cannot open cloud browser');
select ok(not(public.marketplace_read_local_extension('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021')->'binding' ? 'tokenHash'),'Public binding hides hash');
reset role;
select throws_ok($$select public.marketplace_approve_local_extension('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000022',repeat('c',64),'123')$$,'23505',null,'Same identity cannot be reserved in two connections');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select pg_temp.ingest(repeat('b',64))$$,'42501',null,'Foreign installation hash rejected');
select throws_ok($$select public.marketplace_ingest_local_extension('35100000-0000-4000-8000-000000000012','35100000-0000-4000-8000-000000000023',repeat('a',64),null)$$,'42501',null,'Token cannot cross scopes');
select is(pg_temp.ingest()->>'externalAccountId','123','Heartbeat resolves only the approved identity');
select throws_ok($$select pg_temp.ingest(repeat('a',64),pg_temp.snapshot('999'))$$,'42501',null,'Browser account switching stops import');
select lives_ok($$select pg_temp.ingest(repeat('a',64),pg_temp.snapshot())$$,'Public profile and listings imported atomically');
select is((select count(*)::integer from public.marketplace_account_entries where connection_id='35100000-0000-4000-8000-000000000021'),2,'Two public records stored');
select is((select status from public.marketplace_account_sync_sources where connection_id='35100000-0000-4000-8000-000000000021' and area='publications'),'partial','Partial source is explicit');
select lives_ok($$select pg_temp.ingest(repeat('a',64),jsonb_set(pg_temp.snapshot(),'{entries}',jsonb_build_array(pg_temp.snapshot()->'entries'->0)))$$,'Partial empty listing page is accepted');
select is((select count(*)::integer from public.marketplace_account_entries where connection_id='35100000-0000-4000-8000-000000000021' and kind='publication'),1,'Partial missing listing is retained');
select throws_ok($$select pg_temp.ingest(repeat('a',64),jsonb_set(pg_temp.snapshot(),'{observedAt}',to_jsonb((clock_timestamp()-interval '1 hour')::text)))$$,'22023',null,'Stale snapshot cannot overwrite newer import');
select throws_ok($$select pg_temp.ingest(repeat('a',64),jsonb_set(pg_temp.snapshot(),'{entries,1,body}', '{"cookies":"private"}'::jsonb))$$,'22023',null,'Trusted RPC also refuses secret-bearing body fields');
select is((select body->>'title' from public.marketplace_account_entries where connection_id='35100000-0000-4000-8000-000000000021' and kind='publication'),'Boots','Rejected payload leaves stored snapshot untouched');

select is((select capabilities from public.marketplace_connections where id='35100000-0000-4000-8000-000000000021'),' {"profile.read":"verified","listings.read":"verified"}'::jsonb,'No message or publication write capabilities verified');
select throws_ok($$insert into public.marketplace_operations(workspace_id,connection_id,requested_by) values('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021','35100000-0000-4000-8000-000000000001')$$,'42501',null,'Direct worker insert also rejects local mode');
select throws_ok($$update public.marketplace_sync_schedules set enabled=true where connection_id='35100000-0000-4000-8000-000000000021'$$,'42501',null,'Direct scheduler reactivation rejects local mode');
reset role;
update public.marketplace_local_extension_grants set expires_at=clock_timestamp()-interval '1 second' where connection_id='35100000-0000-4000-8000-000000000021';
set local role service_role;
select throws_ok($$select pg_temp.ingest()$$,'42501',null,'Expired grant rejects heartbeat');
select is((select execution_mode from public.marketplace_connections where id='35100000-0000-4000-8000-000000000021'),'local','Expiry never falls back to cloud');
reset role;
update public.marketplace_local_extension_grants set expires_at=clock_timestamp()+interval '1 hour' where connection_id='35100000-0000-4000-8000-000000000021';
update auth.users set is_anonymous=true where id='35100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select pg_temp.ingest()$$,'42501',null,'Anonymous account conversion invalidates current authorization');
reset role;
update auth.users set is_anonymous=false where id='35100000-0000-4000-8000-000000000001';
delete from public.workspace_members where workspace_id='35100000-0000-4000-8000-000000000011' and user_id='35100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select pg_temp.ingest()$$,'42501',null,'Current user permission checked on every request');
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000001','owner');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.marketplace_revoke_local_extension('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021')->>'ok','true','User can revoke installation');
select is(public.marketplace_read_local_extension('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000021')->'binding'->>'revoked','true','Revocation visible without secret');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select pg_temp.ingest()$$,'42501',null,'Revocation stops an old installation');
select is((select execution_mode from public.marketplace_connections where id='35100000-0000-4000-8000-000000000021'),'local','Revocation never restarts cloud');
select * from finish();
rollback;
