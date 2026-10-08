\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
select has_table('public','marketplace_cloud_message_permissions','Cloud permissions are separate from read schedules');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('38500000-0000-4000-8000-000000000001','authenticated','authenticated','cloud-message-owner@example.test','{}','{}'),
 ('38500000-0000-4000-8000-000000000002','authenticated','authenticated','cloud-message-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('38500000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('38500000-0000-4000-8000-000000000011','Cloud messages');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,execution_mode,status,external_account_id) values
 ('38500000-0000-4000-8000-000000000021','38500000-0000-4000-8000-000000000011','Cloud messages','cloud','connected','123');
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values
 ('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021','cloud-message-profile');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at) values
 ('38500000-0000-4000-8000-000000000031','38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021','conversation','777','{"title":"Buyer"}',clock_timestamp());
create function pg_temp.config() returns jsonb language sql as $$ select '{"templates":["Danke für Dein Interesse an {article}!"],"delayMinutes":0,"timezone":"Europe/Berlin","rules":[],"offer":{"type":"percentage","value":10}}'::jsonb; $$;
select set_config('request.jwt.claim.sub','38500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(public.marketplace_read_favorite_messages('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021')->>'enabled','false','Cloud favorites disabled initially');
select throws_ok($$select public.marketplace_save_favorite_messages('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021',true,pg_temp.config(),0)$$,'42501',null,'Activation needs cloud send permission');
select public.marketplace_approve_cloud_messages('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021','123');
select lives_ok($$select public.marketplace_save_favorite_messages('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021',true,pg_temp.config(),0)$$,'Cloud favorites activate explicitly');
select is(public.marketplace_read_favorite_messages('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021')->>'active','true','Cloud settings bind exact send authorization');
reset role;
select has_function('public','marketplace_cloud_favorite_claim',array['uuid','bigint','uuid'],'Cloud favorite dispatch exists');
select has_function('public','marketplace_cloud_favorite_check',array['uuid','uuid','uuid','uuid','uuid','bigint','text'],'Cloud favorite lease checks exist');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at) values
 ('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021','publication','456','{"title":"Boots","price":40,"isClosed":false,"isReserved":false}',clock_timestamp());
insert into public.marketplace_sync_schedules(workspace_id,connection_id,enabled,activated_by) values('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021',true,'38500000-0000-4000-8000-000000000001');
update public.marketplace_favorite_message_settings set activated_at=clock_timestamp()-interval '1 minute';
create temporary table favorite_context(body jsonb);
grant all on favorite_context to service_role;
create function pg_temp.claim() returns jsonb language sql as $$select public.marketplace_cloud_favorite_claim('38500000-0000-4000-8000-000000000051',1,'38500000-0000-4000-8000-000000000061');$$;
create function pg_temp.check_run(p_epoch bigint default 1,p_phase text default null) returns jsonb language sql as $$ select public.marketplace_cloud_favorite_check('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021',(body->>'eventId')::uuid,(body->>'claimToken')::uuid,'38500000-0000-4000-8000-000000000051',p_epoch,coalesce(p_phase,body->>'phase')) from favorite_context; $$;
create function pg_temp.begin_run(p_original bigint default null,p_offered bigint default null) returns jsonb language sql as $$ select public.marketplace_cloud_favorite_begin('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021',(body->>'eventId')::uuid,(body->>'claimToken')::uuid,'38500000-0000-4000-8000-000000000051',1,body->>'phase',p_original,p_offered) from favorite_context; $$;
create function pg_temp.finish_run(p_outcome text,p_id text default null,p_conversation text default null,p_transaction text default null) returns jsonb language sql as $$ select public.marketplace_cloud_favorite_finish('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021',(body->>'eventId')::uuid,(body->>'claimToken')::uuid,'38500000-0000-4000-8000-000000000051',1,body->>'phase',p_outcome,p_id,null,p_conversation,p_transaction) from favorite_context; $$;
set local role service_role;
select public.marketplace_worker_claim('38500000-0000-4000-8000-000000000051');
select lives_ok($$select public.marketplace_record_favorite_events('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021','123','cloud',jsonb_build_array(jsonb_build_object('externalId','38500000-0000-4000-8000-000000000041','actorId','789','itemId','456','eventAt',clock_timestamp())))$$,'New cloud favorite imports');
select lives_ok($$select public.marketplace_record_favorite_events('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021','123','cloud',jsonb_build_array(jsonb_build_object('externalId','38500000-0000-4000-8000-000000000041','actorId','789','itemId','456','eventAt',clock_timestamp())))$$,'Cloud favorite replay deduplicates');
insert into favorite_context values(pg_temp.claim());
select is((select body->>'phase' from favorite_context),'message','Message before offer');
select is((select body->'command'->>'text' from favorite_context),'Danke für Dein Interesse an Boots!','Cloud uses shared article template');
select is(pg_temp.claim(),null::jsonb,'Global browser capacity excludes overlapping work');
select is(pg_temp.check_run(2)->>'active','false','Wrong worker epoch cannot dispatch');
select is(pg_temp.check_run(1,'offer')->>'active','false','Offer scope cannot use message authorization');
select is(pg_temp.check_run()->>'active','true','Exact message claim is valid');
select lives_ok($$select pg_temp.begin_run()$$,'Message begin is durable');
select throws_ok($$select pg_temp.begin_run()$$,'42501',null,'No repeated begin');
select throws_ok($$select pg_temp.finish_run('sent')$$,'22023',null,'Sent requires concrete provider evidence');
select lives_ok($$select pg_temp.finish_run('outcome_unknown')$$,'Ambiguous message remains unknown');
select is(pg_temp.claim(),null::jsonb,'Unknown message creates no offer');
select lives_ok($$select pg_temp.finish_run('sent','888','777','666')$$,'Original claim can resolve late proof');
select lives_ok($$select pg_temp.finish_run('sent','888','777','666')$$,'Same proof is idempotent');
select throws_ok($$select pg_temp.finish_run('sent','889','777','666')$$,'23505',null,'Conflicting proof is rejected');
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where state='active';
update favorite_context set body=pg_temp.claim();
select is((select body->>'phase' from favorite_context),'offer','Confirmed message gets a separate offer claim');
select throws_ok($$select pg_temp.begin_run(4000,3000)$$,'22023',null,'Server rejects mismatched discount');
select lives_ok($$select pg_temp.begin_run(4000,3600)$$,'Shared percent formula confirms price');
select lives_ok($$select pg_temp.finish_run('sent','555')$$,'Concrete offer receipt persists');
select lives_ok($$select pg_temp.finish_run('sent','555')$$,'Offer receipt replay is idempotent');
select throws_ok($$select pg_temp.finish_run('sent','556')$$,'23505',null,'Conflicting offer receipt rejected');
select throws_ok($$select public.marketplace_local_favorite_claim('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021',repeat('a',64),true)$$,'42501',null,'Local extension cannot claim cloud favorites');
reset role;
select is((select count(*) from public.marketplace_favorite_message_events where actor_id='789'),1::bigint,'One durable attempt per actor and item');
set local role authenticated;
select public.marketplace_revoke_cloud_messages('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021',1);
select is(public.marketplace_read_favorite_messages('38500000-0000-4000-8000-000000000011','38500000-0000-4000-8000-000000000021')->>'enabled','false','Revocation explicitly disables cloud rules');
reset role;
select * from finish();
rollback;
