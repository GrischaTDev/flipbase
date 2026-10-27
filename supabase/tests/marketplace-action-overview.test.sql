\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('51200000-0000-4000-8000-000000000001','authenticated','authenticated','action-owner@example.test','{}','{}'),
 ('51200000-0000-4000-8000-000000000002','authenticated','authenticated','action-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('51200000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('51200000-0000-4000-8000-000000000011','Actions'),('51200000-0000-4000-8000-000000000012','Other');
insert into public.workspace_members(workspace_id,user_id,role) values('51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,execution_mode,status,external_account_id) values
 ('51200000-0000-4000-8000-000000000021','51200000-0000-4000-8000-000000000011','Actions','local','connected','123'),
 ('51200000-0000-4000-8000-000000000022','51200000-0000-4000-8000-000000000011','Other account','local','connected','124'),
 ('51200000-0000-4000-8000-000000000023','51200000-0000-4000-8000-000000000012','Other workspace','local','connected','125');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,parent_id,body) values
 ('51200000-0000-4000-8000-000000000031','51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000021','conversation','777',null,'{"title":"Lisa","itemTitle":"Jacke"}'),
 ('51200000-0000-4000-8000-000000000032','51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000021','message','778','51200000-0000-4000-8000-000000000031','{}');
insert into public.marketplace_negotiation_threads(id,workspace_id,connection_id,conversation_id,item_id,transaction_id) values
 ('51200000-0000-4000-8000-000000000041','51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000021','51200000-0000-4000-8000-000000000031','456','666');
insert into public.marketplace_negotiation_jobs(workspace_id,connection_id,thread_id,conversation_id,message_id,source_key,step_index,automated,event_name,requested_by,execution_mode,external_account_id,grant_generation,action,command,source_offer,state,lease_expires_at,created_at)
 select '51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000021','51200000-0000-4000-8000-000000000041','51200000-0000-4000-8000-000000000031','51200000-0000-4000-8000-000000000032','test:'||number,0,number=2,'manual','51200000-0000-4000-8000-000000000001','local','123',1,'counter','{"kind":"offer","priceCents":2500,"currency":"EUR","secret":"not-exposed"}','{"offerId":"555"}',
 case when number in (1,3) then 'sending' when number=2 then 'claimed' when number<=13 then 'queued' else 'sent' end,case when number=3 then clock_timestamp()+interval '1 hour' else clock_timestamp()-interval '1 minute' end,clock_timestamp()-number*interval '1 minute' from generate_series(1,30) number;
insert into public.marketplace_local_message_outbox(workspace_id,connection_id,conversation_id,external_conversation_id,external_account_id,requested_by,request_id,payload_hash,message_text,grant_generation)
 values('51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000021','51200000-0000-4000-8000-000000000031','777','123','51200000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),repeat('x',200),1);
-- Historische Cloudaufträge bleiben nach einem Wechsel in den lokalen Modus sichtbar.
alter table public.marketplace_operations disable trigger marketplace_operation_requires_cloud;
insert into public.marketplace_operations(workspace_id,connection_id,requested_by,state) values
 ('51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000021','51200000-0000-4000-8000-000000000001','queued'),
 ('51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000022','51200000-0000-4000-8000-000000000001','queued');
insert into public.marketplace_operations(workspace_id,connection_id,requested_by,state) select '51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000021','51200000-0000-4000-8000-000000000001','succeeded' from generate_series(1,2);
alter table public.marketplace_operations enable trigger marketplace_operation_requires_cloud;
insert into public.marketplace_local_message_outbox(workspace_id,connection_id,conversation_id,external_conversation_id,external_account_id,requested_by,request_id,payload_hash,message_text,grant_generation,state,claim_token)
 select '51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000021','51200000-0000-4000-8000-000000000031','777','123','51200000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('b',64),'Completed',1,'sent',gen_random_uuid() from generate_series(1,2);
update public.marketplace_operations set finished_at=clock_timestamp()+interval '1 second' where state='succeeded';
update public.marketplace_local_message_outbox set updated_at=clock_timestamp()+interval '1 second' where state='sent';
update public.marketplace_local_message_outbox set attachment_name='private-photo.png',attachment_mime_type='image/png',attachment_base64='private-base64-not-returned' where state='queued';
insert into public.marketplace_connections(id,workspace_id,display_name,marketplace) values('51200000-0000-4000-8000-000000000024','51200000-0000-4000-8000-000000000011','eBay','ebay');
create function pg_temp.overview() returns jsonb language sql as $$select public.marketplace_read_action_overview('51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000021')$$;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous) values('51200000-0000-4000-8000-000000000003','authenticated','authenticated','anonymous-action@example.test','{}','{}',true);
insert into public.platform_operators(user_id) values('51200000-0000-4000-8000-000000000003');
insert into public.workspace_members(workspace_id,user_id,role) values('51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000003','owner');
set local transaction_read_only=on;
select is(current_setting('transaction_read_only'),'on','RPC runs in the read-only transaction used by PostgREST for STABLE functions');
select ok(not has_function_privilege('anon','public.marketplace_read_action_overview(uuid,uuid)','execute'),'Anonymous cannot execute RPC');
select set_config('request.jwt.claim.sub','51200000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(jsonb_array_length(pg_temp.overview()->'actions'),25,'All 15 unresolved actions and exactly ten completed actions survive');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'state'='succeeded'),10,'History limit applies across sources');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'source'='sync' and action->>'state'='queued'),1,'Only selected account sync is visible');
select is((select action->>'state' from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'source'='negotiation' and action->>'state'='outcome_unknown'),'outcome_unknown','Expired sending lease is unknown');
select is((select length(action->>'textPreview') from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'source'='message' and action->>'state'='queued'),160,'Message preview limited to 160 characters');
select is((select count(distinct action->>'source')::integer from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'state'='succeeded'),3,'Ten historical results include all three sources');
select is((select action->>'priceCents' from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'source'='negotiation' limit 1),'2500','Saved negotiated price is projected');
select is((select action->>'itemTitle' from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'source'='message' limit 1),'Jacke','Message uses scoped item title');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'source'='negotiation' and (action->>'isAutomated')::boolean),1,'Automated negotiation remains distinguishable from manual takeover');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.overview()->'actions') action where not (action->>'isAutomated')::boolean),24,'Manual negotiation, messages and sync explicitly report false');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'state'='running'),2,'Claimed and unexpired sending map to running');
select ok(not (pg_temp.overview()::text like '%private-base64-not-returned%') and not (pg_temp.overview()::text like '%private-photo.png%'),'Attachment content and private name are omitted');
select throws_ok($$select public.marketplace_read_action_overview('51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000024')$$,'42501',null,'Non-Vinted account denied');
select ok(not (pg_temp.overview()::text like '%not-exposed%') and not (pg_temp.overview()::text like '%payload_hash%') and not (pg_temp.overview()::text like '%command%'),'No private command, hash or credentials leaked');
select is((select action->>'offerId' from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'source'='negotiation' limit 1),'555','Offer evidence is preserved');
select is((select action->>'messageId' from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'source'='negotiation' limit 1),'51200000-0000-4000-8000-000000000032','Offer message association survives reload');
select is((select action->>'partnerName' from jsonb_array_elements(pg_temp.overview()->'actions') action where action->>'source'='negotiation' limit 1),'Lisa','Partner comes from scoped conversation');
select throws_ok($$select public.marketplace_read_action_overview('51200000-0000-4000-8000-000000000011','51200000-0000-4000-8000-000000000023')$$,'42501',null,'Cross-workspace account rejected');
reset role;
select is((select count(*)::integer from public.marketplace_negotiation_jobs where state='sending'),2,'Read does not mutate lease state');
select set_config('request.jwt.claim.sub','51200000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select pg_temp.overview()$$,'42501',null,'Nonmember denied');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select throws_ok($$select pg_temp.overview()$$,'42501',null,'Missing user denied');
reset role;
select set_config('request.jwt.claim.sub','51200000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select pg_temp.overview()$$,'42501',null,'Anonymous sign-in cannot read private actions');
reset role;
select * from finish();
rollback;
