\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('42500000-0000-4000-8000-000000000001','authenticated','authenticated','inbox-owner@example.test','{}','{}'),
 ('42500000-0000-4000-8000-000000000002','authenticated','authenticated','inbox-member@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('42500000-0000-4000-8000-000000000001'),('42500000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('42500000-0000-4000-8000-000000000011','Postfachtest'),('42500000-0000-4000-8000-000000000012','Fremder Workspace');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('42500000-0000-4000-8000-000000000011','42500000-0000-4000-8000-000000000001','owner'),
 ('42500000-0000-4000-8000-000000000011','42500000-0000-4000-8000-000000000002','member');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('42500000-0000-4000-8000-000000000021','42500000-0000-4000-8000-000000000011','Postfachkonto','connected','90');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,observed_at) values
 ('42500000-0000-4000-8000-000000000011','42500000-0000-4000-8000-000000000021','conversation','700','{"title":"Testkontakt","unread":true}','2026-09-30T12:00:00Z');
create function pg_temp.event(p_id text,p_conversation text default '700',p_at text default '2026-09-30T12:01:00.000Z') returns jsonb language sql as $$
 select jsonb_build_object('externalId',p_id,'externalConversationId',p_conversation,'occurredAt',p_at,'direction','inbound','source','conversation_snapshot');
$$;
create function pg_temp.apply(p_minute int,p_events jsonb,p_complete boolean default true,p_covered jsonb default '["700"]') returns integer language sql as $$
 select public.marketplace_record_message_event_batch('42500000-0000-4000-8000-000000000011','42500000-0000-4000-8000-000000000021','90',
 jsonb_build_object('version',1,'observedAt',to_char('2026-09-30T12:00:00Z'::timestamptz+p_minute*interval '1 minute','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'events',p_events,'complete',p_complete,'coveredConversationIds',p_covered));
$$;
create function pg_temp.feed() returns jsonb language sql as $$select public.marketplace_read_message_notifications('42500000-0000-4000-8000-000000000011');$$;
set local role service_role;
select is(pg_temp.apply(0,jsonb_build_array(pg_temp.event('message:501','700','2026-09-30T11:59:00.000Z'))),0,'Historical first snapshot stays silent');
select is(pg_temp.apply(2,jsonb_build_array(pg_temp.event('message:501','700','2026-09-30T11:59:00.000Z'),pg_temp.event('message:502'),pg_temp.event('offer_request_message:503'))),2,'Text and proposal in already unread conversation create separate events');
select is(pg_temp.apply(2,jsonb_build_array(pg_temp.event('message:502'),pg_temp.event('offer_request_message:503'))),0,'Repeated snapshot stays idempotent');
select throws_ok($$select pg_temp.apply(3,jsonb_build_array(pg_temp.event('message:504') || '{"direction":"outbound"}'))$$,'22023',null,'Outbound events cannot enter the inbound feed');
select throws_ok($$select pg_temp.apply(3,jsonb_build_array(pg_temp.event('message:504') || '{"body":"private"}'))$$,'22023',null,'Private provider content is not accepted in event contract');
select throws_ok($$select pg_temp.apply(1,'[]')$$,'22023',null,'Stale snapshot cannot advance reference');
select is((select count(*)::int from public.marketplace_message_notifications where notified_at is not null),2,'Rejected snapshots leave no false event');
select is(pg_temp.apply(4,jsonb_build_array(pg_temp.event('message:505','701','2026-09-30T12:03:00.000Z')),false,'[]'),1,'Confirmed event for not yet imported conversation is retained');
reset role;
select is((select count(*)::int from realtime.messages where topic='workspace:42500000-0000-4000-8000-000000000011:marketplace_message_notifications' and event='message_notifications_changed' and private),1,'One private invalidation per visible event batch');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,observed_at) values
 ('42500000-0000-4000-8000-000000000011','42500000-0000-4000-8000-000000000021','conversation','701','{"title":"Neuer Kontakt"}','2026-09-30T12:04:00Z');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.feed()->>'unreadCount','3','Resolved pending conversation appears in feed');
select is(pg_temp.feed()->'items'->0->>'accountName','Postfachkonto','Feed keeps correct account');
select ok((pg_temp.feed()->'items'->0->>'conversationId') is not null,'Feed deep link uses imported conversation id');
select lives_ok($$select public.marketplace_mark_message_notifications('42500000-0000-4000-8000-000000000011',pg_temp.feed()->'items'->0->>'id')$$,'One bell item can be marked read');
select is(pg_temp.feed()->>'unreadCount','2','Marking bell only changes own feed count');
select is((select body->>'unread' from public.marketplace_account_entries where external_id='700'),'true','Bell marking preserves Vinted unread status');
select lives_ok($$select public.marketplace_mark_message_notifications('42500000-0000-4000-8000-000000000011',null,true)$$,'Clearing feed preserves known identifiers');
select is(jsonb_array_length(pg_temp.feed()->'items'),0,'Cleared feed is empty');
select throws_ok($$delete from public.marketplace_message_notifications$$,'42501',null,'Browser cannot delete event reference');
select throws_ok($$select public.marketplace_read_message_notifications('42500000-0000-4000-8000-000000000012')$$,'42501',null,'Foreign workspace feed is denied');
select set_config('request.jwt.claims','{"sub":"42500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.feed()$$,'42501',null,'Ordinary workspace member cannot read private conversations');
reset role;
set local role service_role;
select is(pg_temp.apply(5,jsonb_build_array(pg_temp.event('message:502'))),0,'Cleared event never returns on repeated provider response');
select throws_ok($$select public.marketplace_record_message_event_batch('42500000-0000-4000-8000-000000000011','42500000-0000-4000-8000-000000000021','91','{}')$$,'42501',null,'Foreign account identity is denied');
select is(pg_temp.apply(6,jsonb_build_array(pg_temp.event('message:506','702','2026-09-30T11:00:00.000Z')),false,'[]'),0,'Later historical pages stay silent after the first reference');
reset role;
update public.marketplace_connections set execution_mode='local' where id='42500000-0000-4000-8000-000000000021';
insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at,messages_read) values
 ('42500000-0000-4000-8000-000000000011','42500000-0000-4000-8000-000000000021','42500000-0000-4000-8000-000000000001',repeat('a',64),'90',clock_timestamp()+interval '1 hour',true);
create function pg_temp.local_batch() returns jsonb language sql as $$
 select jsonb_build_object('identity',jsonb_build_object('id','90'),'mode','latest','observedAt',to_char(current_timestamp at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'page',1,'nextPage',1,'conversationsComplete',false,
 'entries','[{"kind":"conversation","externalId":"703","sortAt":"2026-09-30T12:07:00Z","body":{"title":"Test","text":null,"occurredAt":"2026-09-30T12:07:00Z","sourceUpdatedAt":"2026-09-30T12:07:00Z","detailCheckedAt":null,"unread":true,"imageUrl":null}}]'::jsonb,
 'inboxEvents',jsonb_build_object('version',2,'observedAt',to_char(current_timestamp at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'events','[]'::jsonb,'complete',true,'coveredConversationIds','[]'::jsonb));
$$;
set local role service_role;
select throws_ok($$select public.marketplace_import_local_inbox('42500000-0000-4000-8000-000000000011','42500000-0000-4000-8000-000000000021',repeat('a',64),pg_temp.local_batch())$$,'22023',null,'Invalid event contract rolls back local import');
select ok(not exists(select 1 from public.marketplace_account_entries where external_id='703'),'Failed event import leaves no conversation writes');
select lives_ok($$select public.marketplace_import_local_inbox('42500000-0000-4000-8000-000000000011','42500000-0000-4000-8000-000000000021',repeat('a',64),jsonb_set(pg_temp.local_batch(),'{inboxEvents,version}','1'))$$,'Version one shares the existing atomic local import');
select * from finish();
rollback;
