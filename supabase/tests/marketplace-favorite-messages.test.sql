\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('38100000-0000-4000-8000-000000000001','authenticated','authenticated','favorite-owner@example.test','{}','{}'),
 ('38100000-0000-4000-8000-000000000002','authenticated','authenticated','favorite-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('38100000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('38100000-0000-4000-8000-000000000011','Favorite A');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,execution_mode,status,external_account_id) values
 ('38100000-0000-4000-8000-000000000021','38100000-0000-4000-8000-000000000011','Favorite A','local','connected','123');
insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at,messages_read,messages_send) values
 ('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021','38100000-0000-4000-8000-000000000001',repeat('a',64),'123',clock_timestamp()+interval '1 hour',true,true);
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at) values
 ('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021','publication','456','{"title":"Boots","price":58,"isClosed":false,"isReserved":false}',clock_timestamp());
create function pg_temp.config() returns jsonb language sql as $$
 select '{"templates":["Danke für Dein Interesse an {article}!"],"rules":[],"delayMinutes":0,"timezone":"Europe/Berlin"}'::jsonb;
$$;
create function pg_temp.read_settings() returns jsonb language sql as $$
 select public.marketplace_read_favorite_messages('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021');
$$;
create function pg_temp.save(p_enabled boolean,p_version bigint,p_config jsonb default pg_temp.config()) returns jsonb language sql as $$
 select public.marketplace_save_favorite_messages('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021',p_enabled,p_config,p_version);
$$;
create function pg_temp.ingest(p_actor text default '789',p_id uuid default '38100000-0000-4000-8000-000000000041',p_at timestamptz default clock_timestamp()-interval '1 second',p_item text default '456') returns jsonb language sql as $$
 select public.marketplace_import_local_favorites('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021',repeat('a',64),jsonb_build_array(jsonb_build_object('externalId',p_id,'actorId',p_actor,'itemId',p_item,'eventAt',p_at)));
$$;
create function pg_temp.claim() returns jsonb language sql as $$
 select public.marketplace_local_favorite_claim('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021',repeat('a',64));
$$;
create function pg_temp.start() returns jsonb language sql as $$
 select public.marketplace_local_favorite_start('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021',repeat('a',64),id,claim_token) from public.marketplace_favorite_message_events where external_id='38100000-0000-4000-8000-000000000041';
$$;
create function pg_temp.report(p_outcome text,p_external text default null) returns jsonb language sql as $$
 select public.marketplace_local_favorite_finish('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021',repeat('a',64),id,claim_token,p_outcome,p_external) from public.marketplace_favorite_message_events where external_id='38100000-0000-4000-8000-000000000041';
$$;
select ok(not has_table_privilege('authenticated','public.marketplace_favorite_message_events','insert'),'App cannot forge favorite events');
select ok(not has_table_privilege('authenticated','public.marketplace_favorite_message_settings','update'),'App cannot bypass explicit save');
select ok(not has_function_privilege('authenticated','public.marketplace_local_favorite_claim(uuid,uuid,text)','execute'),'App cannot claim');
select ok((select relrowsecurity from pg_class where oid='public.marketplace_favorite_message_events'::regclass),'Events use RLS');
select ok((select relrowsecurity from pg_class where oid='public.marketplace_favorite_message_settings'::regclass),'Settings use RLS');
select ok(not has_sequence_privilege('authenticated','public.marketplace_favorite_message_settings_id_seq','usage'),'App cannot advance the private settings sequence');
select ok(not has_function_privilege('anon','public.marketplace_save_favorite_messages(uuid,uuid,boolean,jsonb,bigint)','execute'),'Anonymous users cannot activate settings');
select ok(public.marketplace_favorite_message_config_valid(pg_temp.config()),'Bounded standard text accepted');
select ok(not public.marketplace_favorite_message_config_valid(pg_temp.config()||'{"extra":true}'),'Extra config rejected');
select ok(not public.marketplace_favorite_message_config_valid(pg_temp.config()||'{"delayMinutes":10081}'),'Unbounded delay rejected');
select ok(not public.marketplace_favorite_message_config_valid(pg_temp.config()||'{"templates":[""]}'),'Empty template rejected');
select ok(not public.marketplace_favorite_message_config_valid(pg_temp.config()||'{"rules":[{"name":"night","startHour":22,"endHour":8,"days":[8],"minPrice":null,"maxPrice":null,"templates":["night"]}]}'),'Invalid weekday rejected');
select set_config('request.jwt.claim.sub','38100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(pg_temp.read_settings()->>'enabled','false','Disabled by default');
select lives_ok($$select pg_temp.save(true,0)$$,'Explicit activation accepted');
select is(pg_temp.read_settings()->>'active','true','Active badge requires a matching live grant');
select throws_ok($$select pg_temp.save(false,0)$$,'40001',null,'Stale editor cannot overwrite activation');
select ok(not(pg_temp.read_settings()::text like '%tokenHash%'),'Journal hides browser credentials');
reset role;
set local role service_role;
select lives_ok($$select pg_temp.ingest('789','38100000-0000-4000-8000-000000000040',clock_timestamp()-interval '1 hour')$$,'Old notification read safely');
reset role;
select is((select count(*)::integer from public.marketplace_favorite_message_events),0,'Pre-activation favorites are never enqueued');
update public.marketplace_favorite_message_settings set activated_at=clock_timestamp()-interval '1 minute';
set local role service_role;
select lives_ok($$select pg_temp.ingest()$$,'New event accepted');
select lives_ok($$select pg_temp.ingest()$$,'Repeated sync is idempotent');
select lives_ok($$select pg_temp.ingest('789','38100000-0000-4000-8000-000000000042')$$,'Repeated actor/item does not create another attempt');
select throws_ok($$select pg_temp.ingest(null)$$,'22023',null,'Null actor rejected');
select throws_ok($$select pg_temp.ingest('789','38100000-0000-4000-8000-000000000042',clock_timestamp()+interval '2 hours')$$,'22023',null,'Future event rejected');
select lives_ok($$select pg_temp.ingest('555','38100000-0000-4000-8000-000000000042',clock_timestamp(),'999')$$,'Unknown item is ignored');
select is(pg_temp.claim()->'command'->>'text','Danke für Dein Interesse an Boots!','Article substituted at claim');
select is(pg_temp.claim()->>'command',null,'Parallel claim cannot repeat occupied event');
select lives_ok($$select pg_temp.start()$$,'Start persisted before provider write');
select throws_ok($$select pg_temp.start()$$,'42501',null,'Second start is forbidden');
select throws_ok($$select pg_temp.report('sent')$$,'22023',null,'Sent requires provider confirmation');
select lives_ok($$select pg_temp.report('outcome_unknown')$$,'Ambiguous write stays unknown');
select lives_ok($$select pg_temp.report('outcome_unknown')$$,'Lost receipt acknowledgement can replay');
select is(pg_temp.claim()->>'command',null,'Unknown write is never automatically retried');
select lives_ok($$select pg_temp.report('sent','888')$$,'Same attempt can later report proven receipt');
select lives_ok($$select pg_temp.report('sent','888')$$,'Receipt replay is idempotent');
select throws_ok($$select pg_temp.report('sent','889')$$,'23505',null,'Conflicting provider receipt rejected');
select lives_ok($$select pg_temp.ingest('555','38100000-0000-4000-8000-000000000043')$$,'Another actor is independent');
reset role;
select is((select count(*)::integer from public.marketplace_favorite_message_events),2,'Exactly one event per actor/item');
set local role authenticated;
select lives_ok($$select pg_temp.save(false,1)$$,'Deactivation accepted');
reset role;
select is((select state from public.marketplace_favorite_message_events where actor_id='555'),'cancelled','Deactivation cancels unsent events');
set local role service_role;
select is(pg_temp.claim()->>'command',null,'Disabled automation never claims');
select is(public.marketplace_favorite_message_text(pg_temp.config()||'{"rules":[{"name":"night","startHour":22,"endHour":8,"days":[],"minPrice":null,"maxPrice":null,"templates":["Nacht"]}]}',58,'2026-10-05T23:00:00Z','38100000-0000-4000-8000-000000000041'),'Nacht','Overnight rule matches Berlin sending time');
select is(public.marketplace_favorite_message_text(pg_temp.config()||'{"rules":[{"name":"morning","startHour":8,"endHour":12,"days":[1],"minPrice":50,"maxPrice":60,"templates":["Morgen"]}]}',58,'2026-10-05T07:00:00Z','38100000-0000-4000-8000-000000000041'),'Morgen','Time weekday and price match together');
select is(public.marketplace_favorite_message_text(pg_temp.config()||'{"rules":[{"name":"morning","startHour":8,"endHour":12,"days":[1],"minPrice":50,"maxPrice":60,"templates":["Morgen"]}]}',40,'2026-10-05T07:00:00Z','38100000-0000-4000-8000-000000000041'),'Danke für Dein Interesse an {article}!','Price mismatch uses standard');
select is(public.marketplace_favorite_message_text(pg_temp.config()||'{"rules":[{"name":"night","startHour":22,"endHour":8,"days":[],"minPrice":null,"maxPrice":null,"templates":["Nacht"]}]}',58,'2026-10-05T06:00:00Z','38100000-0000-4000-8000-000000000041'),'Danke für Dein Interesse an {article}!','End hour is exclusive in Berlin');
select is(public.marketplace_favorite_message_text(pg_temp.config()||'{"rules":[{"name":"first","startHour":null,"endHour":null,"days":[],"minPrice":null,"maxPrice":null,"templates":["Erste"]},{"name":"second","startHour":null,"endHour":null,"days":[],"minPrice":null,"maxPrice":null,"templates":["Zweite"]}]}',58,'2026-10-05T06:00:00Z','38100000-0000-4000-8000-000000000041'),'Erste','First matching rule wins');
reset role;
set local role authenticated;
select lives_ok($$select pg_temp.save(true,2,pg_temp.config()||'{"delayMinutes":30}')$$,'Delayed automation can be explicitly activated');
reset role;
update public.marketplace_favorite_message_settings set activated_at=clock_timestamp()-interval '1 hour';
set local role service_role;
select lives_ok($$select pg_temp.ingest('666','38100000-0000-4000-8000-000000000044')$$,'Recent favorite is stored for delayed sending');
select is(pg_temp.claim()->>'command',null,'Delay does not send a recent favorite immediately');
reset role;
update public.marketplace_favorite_message_events set event_at=clock_timestamp()-interval '31 minutes' where actor_id='666';
set local role service_role;
select is(pg_temp.claim()->'command'->>'actorId','666','Due delayed favorite becomes claimable');
reset role;
update public.marketplace_favorite_message_events set lease_expires_at=clock_timestamp()-interval '1 second' where actor_id='666';
set local role service_role;
select is(pg_temp.claim()->'command'->>'actorId','666','Unstarted expired claim can be recovered');
select lives_ok($$select public.marketplace_local_favorite_start('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021',repeat('a',64),id,claim_token) from public.marketplace_favorite_message_events where actor_id='666'$$,'Recovered claim persists its provider start');
reset role;
update public.marketplace_favorite_message_events set lease_expires_at=clock_timestamp()-interval '1 second' where actor_id='666';
set local role service_role;
select is(pg_temp.claim()->>'command',null,'Started expired write is not reclaimed');
reset role;
select is((select state from public.marketplace_favorite_message_events where actor_id='666'),'outcome_unknown','Started expired write becomes unknown');
update public.marketplace_local_extension_grants set grant_generation=grant_generation+1;
set local role authenticated;
select is(pg_temp.read_settings()->>'active','false','Replaced grant makes the active badge inactive');
reset role;
set local role service_role;
select is(public.marketplace_local_favorites_state('38100000-0000-4000-8000-000000000011','38100000-0000-4000-8000-000000000021',repeat('a',64))->>'enabled','false','Replacement grant cannot inherit automation');
reset role;
set local role authenticated;
select lives_ok($$select pg_temp.save(true,3)$$,'Replacement grant requires explicit renewed activation');
reset role;
select ok((select activated_at>clock_timestamp()-interval '5 seconds' from public.marketplace_favorite_message_settings),'Renewed activation resets the historical baseline');
reset role;
select set_config('request.jwt.claim.sub','38100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select pg_temp.read_settings()$$,'42501',null,'Foreign user cannot read');
select throws_ok($$select pg_temp.save(true,2)$$,'42501',null,'Foreign user cannot activate');
reset role;
select set_config('request.jwt.claim.sub','38100000-0000-4000-8000-000000000001',true);
update public.marketplace_local_extension_grants set revoked_at=clock_timestamp();
set local role authenticated;
select throws_ok($$select pg_temp.save(true,4)$$,'42501',null,'Revoked grant cannot activate');
reset role;
set local role service_role;
select throws_ok($$select pg_temp.claim()$$,'42501',null,'Revocation stops worker');
select * from finish();
rollback;
