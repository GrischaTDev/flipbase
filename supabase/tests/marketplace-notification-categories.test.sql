\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('42600000-0000-4000-8000-000000000001','authenticated','authenticated','category-owner@example.test','{}','{}'),
 ('42600000-0000-4000-8000-000000000002','authenticated','authenticated','category-member@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('42600000-0000-4000-8000-000000000001'),('42600000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('42600000-0000-4000-8000-000000000011','Kategorienprüfung');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000001','owner'),
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000002','member');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000011','Kategoriekonto','connected','426');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,observed_at) values
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','conversation','700','{"title":"Testkontakt"}',now());

create function pg_temp.setting(p_category text,p_enabled boolean,p_version bigint) returns jsonb language sql as $$
 select public.marketplace_set_notification_category_settings('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021',p_category,p_enabled,p_version);
$$;
create function pg_temp.settings() returns jsonb language sql as $$
 select public.marketplace_read_message_notification_settings('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021');
$$;
create function pg_temp.event(p_id text,p_kind text,p_at timestamptz default clock_timestamp()) returns jsonb language sql as $$
 select jsonb_build_object('externalId',p_id,'externalConversationId','700','occurredAt',to_char(p_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'direction','inbound','source','conversation_snapshot')
   || case when p_kind is null then '{}'::jsonb else jsonb_build_object('notificationKind',p_kind) end;
$$;
create function pg_temp.apply(p_events jsonb,p_at timestamptz default clock_timestamp()) returns integer language sql as $$
 select public.marketplace_record_message_event_batch('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','426',
   jsonb_build_object('version',1,'observedAt',to_char(greatest(p_at,(select max((e->>'occurredAt')::timestamptz) from jsonb_array_elements(p_events) e)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'events',p_events,'complete',true,'coveredConversationIds','["700"]'::jsonb));
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from jsonb_object_keys(pg_temp.settings()->'categories')),7,'All seven categories are represented by the account RPC');
select ok(not exists(select 1 from jsonb_each(pg_temp.settings()->'categories') c where c.value<>'true'::jsonb),'New account defaults enable every category');
select throws_ok($$select pg_temp.setting('unknown',false,0)$$,'22023',null,'Unknown category is rejected');
select throws_ok($$select pg_temp.setting(null,false,0)$$,'22023',null,'Missing category is rejected');
select throws_ok($$select pg_temp.setting('shipping',null,0)$$,'22023',null,'Missing enabled flag is rejected');
select lives_ok($$select pg_temp.setting('shipping',false,0)$$,'Shipping can be disabled independently');
select is(pg_temp.settings()->'categories'->>'shipping','false','Shipping state is persisted');
select is(pg_temp.settings()->'categories'->>'messages','true','Chat messages stay enabled');
select is(pg_temp.settings()->'categories'->>'payments','true','Refunds stay enabled');
select throws_ok($$select pg_temp.setting('orders',false,0)$$,'40001',null,'Concurrent stale version cannot overwrite account settings');
select lives_ok($$select pg_temp.setting('shipping',false,1)$$,'Unchanged category remains idempotent');
select is(pg_temp.settings()->>'version','1','Idempotent save keeps the version');
select set_config('request.jwt.claims','{"sub":"42600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.setting('orders',false,1)$$,'42501',null,'Ordinary workspace members cannot change notifications');
reset role;
set local role anon;
select throws_ok($$select pg_temp.setting('orders',false,1)$$,'42501',null,'Anonymous clients cannot call the privileged setter');
reset role;
select ok(not has_table_privilege('authenticated','public.marketplace_message_notification_settings','UPDATE'),'Clients cannot bypass version or timestamp guards');
select ok(not has_function_privilege('anon','public.marketplace_notification_enabled(uuid,uuid,text,timestamp with time zone)','EXECUTE'),'Internal category lookup is not exposed anonymously');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,observed_at) values
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','profile','426','{"feedbacks":[]}',now()-interval '2 minutes');
update public.marketplace_account_entries set body='{"feedbacks":[{"id":"unrelated-preference-review","authorName":"Test","rating":5,"occurredAtVerified":false}]}',observed_at=now()-interval '1 minute'
 where connection_id='42600000-0000-4000-8000-000000000021' and kind='profile';
select ok(exists(select 1 from public.marketplace_feedback_notifications where external_feedback_id='unrelated-preference-review' and notified_at is not null),'An unrelated shipping choice does not silently disable legacy undated reviews');

set local role service_role;
select is(pg_temp.apply('[]',now()-interval '2 days'),0,'Initial limited snapshot establishes a silent baseline');
reset role;
-- Simulate the migration on an existing account: historical first baseline stays intact,
-- while newly classified system events begin at the release boundary.
update public.marketplace_message_notification_baselines set system_events_since=now()-interval '2 minutes'
 where connection_id='42600000-0000-4000-8000-000000000021';
set local role service_role;
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:1','order_cancelled',now()-interval '1 day'))),0,'Old system event after account baseline stays silent at the new release');
select ok(exists(select 1 from public.marketplace_message_notifications where external_event_id='status_message:1' and notified_at is null),'Historical identifier is still remembered');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:1','order_cancelled',now()-interval '1 day'))),0,'Repeated historical event cannot become a notification');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:2','order_cancelled'))),1,'A genuinely new cancellation is notified');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('action_message:3','refund_started'))),1,'Refund notification is independent from shipping');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('action_message:4','shipment_sent'))),0,'Disabled shipping is silent');
select ok(exists(select 1 from public.marketplace_message_notifications where external_event_id='action_message:4' and notification_kind='shipment_sent' and notified_at is null),'Paused category still records its source key');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('message:5',null))),1,'Legacy five-field chat payload stays supported');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:6',null))),1,'Legacy system payload gets a safe other-status fallback');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:7','feedback_received'))),0,'Profile source owns received reviews instead of a duplicate chat notification');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:13','item_unavailable'))),0,'An unavailable item after an offer never notifies');
select ok(exists(select 1 from public.marketplace_message_notifications where external_event_id='status_message:13' and notification_kind='item_unavailable' and notified_at is null),'The unavailable-item event is still recorded silently');
select throws_ok($$select pg_temp.apply(jsonb_build_array(pg_temp.event('message:8','refund_completed')))$$,'22023',null,'A chat message cannot masquerade as a refund');
select throws_ok($$select pg_temp.apply(jsonb_build_array(pg_temp.event('action_message:8','message')))$$,'22023',null,'System source cannot masquerade as a human message');
select throws_ok($$select pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:8','invented')))$$,'22023',null,'Unknown notification kind is rejected');
select throws_ok($$select pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:8','order_completed')||'{"notificationKind":null}'))$$,'22023',null,'Explicit null kind is invalid in ingestion');
select throws_ok($$select pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:8','order_completed')||'{"privateText":"secret"}'))$$,'22023',null,'Private provider content cannot enter event metadata');
reset role;
select is((select payload->>'title' from public.web_push_events where source_key='vinted-message:'||(select id::text from public.marketplace_message_notifications where external_event_id='status_message:2')),'Bestellung storniert','Push contains the controlled cancellation title');
select is((select payload->>'title' from public.web_push_events where source_key='vinted-message:'||(select id::text from public.marketplace_message_notifications where external_event_id='action_message:3')),'Rückerstattung eingeleitet','Push distinguishes the refund stage');
select ok(not exists(select 1 from public.web_push_events where payload->>'title'='shipment_sent'),'Internal enum keys are not user-facing copy');

insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('42600000-0000-4000-8000-000000000031','42600000-0000-4000-8000-000000000001',now(),now());
insert into public.web_push_generations(id,user_id,token_hash) values
 ('42600000-0000-4000-8000-000000000032','42600000-0000-4000-8000-000000000001',repeat('b',64));
insert into public.web_push_devices(id,user_id,session_id,installation_id,endpoint_fingerprint,endpoint,p256dh,auth,vapid_key_id) values
 ('42600000-0000-4000-8000-000000000032','42600000-0000-4000-8000-000000000001','42600000-0000-4000-8000-000000000031',
  '42600000-0000-4000-8000-000000000033','notification-category-test','https://fcm.googleapis.com/category-test',repeat('x',87),repeat('x',22),'v1');
insert into public.web_push_preferences(device_id,workspace_id,categories) values
 ('42600000-0000-4000-8000-000000000032','42600000-0000-4000-8000-000000000011',array['message']);
insert into public.web_push_deliveries(event_id,device_id,binding_generation)
 select e.id,'42600000-0000-4000-8000-000000000032','42600000-0000-4000-8000-000000000032'
 from public.web_push_events e where e.source_key='vinted-message:'||(select id::text from public.marketplace_message_notifications where external_event_id='status_message:2');
create temporary table category_push_claim as select * from public.web_push_claim('v1',true);
select ok((select public.web_push_authorize(id,binding_generation,claim_token) is not null from category_push_claim),'Queued order push is authorized while its account category is enabled');
-- Only the persisted flag changes in this fixture; the public setter/version contract is covered above.
update public.marketplace_message_notification_settings set categories=jsonb_set(categories,'{orders}','false')
 where connection_id='42600000-0000-4000-8000-000000000021';
select ok((select public.web_push_authorize(id,binding_generation,claim_token) is null from category_push_claim),'Disabling an account category cancels an already claimed push');
select is((select status from public.web_push_deliveries where id=(select id from category_push_claim)),'expired','Cancelled push reaches terminal state without sending');
update public.marketplace_message_notification_settings set categories=jsonb_set(categories,'{orders}','true')
 where connection_id='42600000-0000-4000-8000-000000000021';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select pg_temp.setting('shipping',true,1)$$,'Shipping can be re-enabled');
select is(pg_temp.settings()->'categories'->>'orders','true','Changing shipping leaves order setting intact');
reset role;
select is((select (category_enabled_since->>'shipping')::numeric from public.marketplace_message_notification_settings where connection_id='42600000-0000-4000-8000-000000000021'),
  (select floor((category_enabled_since->>'shipping')::numeric) from public.marketplace_message_notification_settings where connection_id='42600000-0000-4000-8000-000000000021'),'Activation boundary uses the provider second precision');
select ok(public.marketplace_notification_enabled('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','shipping',
  (select to_timestamp((category_enabled_since->>'shipping')::double precision) from public.marketplace_message_notification_settings where connection_id='42600000-0000-4000-8000-000000000021')),'A new event in the exact activation source second is retained');
select ok(not public.marketplace_notification_enabled('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','shipping',
  (select to_timestamp((category_enabled_since->>'shipping')::double precision)-interval '1 second' from public.marketplace_message_notification_settings where connection_id='42600000-0000-4000-8000-000000000021')),'A source second before activation stays silent');
set local role service_role;
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('action_message:4','shipment_sent'))),0,'Known event during the pause is never replayed');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('action_message:9','delivered',now()-interval '1 minute'))),0,'Previously unseen shipping from the pause is not backfilled');
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('action_message:10','delivered'))),1,'New shipping after enabling is delivered');
reset role;

create temporary table notification_catalog(kind text,category text,title text);
insert into notification_catalog values
 ('message','messages','Neue Nachricht'),('offer_received','offers','Neuer Preisvorschlag'),
 ('sale_sold','orders','Artikel verkauft'),('purchase_created','orders','Artikel gekauft'),
 ('order_cancelled','orders','Bestellung storniert'),('transaction_cancelled','orders','Transaktion abgebrochen'),
 ('item_relisted','orders','Artikel wieder eingestellt'),('shipping_label_ready','shipping','Versandlabel verfügbar'),
 ('shipment_sent','shipping','Sendung verschickt'),('ready_for_pickup','shipping','Sendung abholbereit'),
 ('delivered','shipping','Sendung zugestellt'),('order_completed','orders','Bestellung abgeschlossen'),
 ('order_suspended','orders','Bestellung unterbrochen'),('issue_reported','orders','Problem gemeldet'),
 ('refund_started','payments','Rückerstattung eingeleitet'),('refund_completed','payments','Rückerstattung abgeschlossen'),
 ('refund_accepted','payments','Rückerstattung angenommen'),('return_shipped','shipping','Rücksendung verschickt'),
 ('feedback_received','feedback','Neue Bewertung'),('feedback_sent','feedback','Bewertung abgegeben'),
 ('support_closed','other','Supportchat beendet'),('item_unavailable','other','Artikel nicht verfügbar'),
 ('other_status','other','Status bei Vinted aktualisiert');
select ok(not exists(select 1 from notification_catalog where public.marketplace_notification_category(kind)<>category),'Every kind belongs to the agreed independent category');
select ok(not exists(select 1 from notification_catalog where public.marketplace_notification_title(kind)<>title),'Every kind has a controlled readable title');
select ok(not exists(select 1 from notification_catalog where not public.marketplace_notification_kind_valid(
 case kind when 'message' then 'message:11' when 'offer_received' then 'offer_request_message:11' else 'payment_message:11' end,kind)),'Full enum survives the database boundary');

-- An old client retains its former master switch, including a preserved explicit review choice.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select pg_temp.setting('feedback',false,2)$$,'Reviews can be disabled separately');
select lives_ok($$select public.marketplace_set_message_notification_settings('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021',false,3)$$,'Legacy client can disable inbox categories');
select ok(not exists(select 1 from jsonb_each(pg_temp.settings()->'categories') c where c.value<>'false'::jsonb),'Legacy switch and explicit review preference are preserved');
select lives_ok($$select public.marketplace_set_message_notification_settings('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021',true,4)$$,'Legacy client can re-enable its inbox categories');
select is(pg_temp.settings()->'categories'->>'feedback','false','Legacy enable does not reset the separate review choice');
reset role;

update public.marketplace_account_entries set body='{"feedbacks":[]}',observed_at=now()-interval '1 minute'
 where connection_id='42600000-0000-4000-8000-000000000021' and kind='profile';
update public.marketplace_account_entries set body='{"feedbacks":[{"id":"paused-review","authorName":"Test","rating":5}]}',observed_at=clock_timestamp()
 where connection_id='42600000-0000-4000-8000-000000000021' and kind='profile';
select ok(exists(select 1 from public.marketplace_feedback_notifications where external_feedback_id='paused-review' and notified_at is null),'Disabled review is remembered without a notification');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select pg_temp.setting('feedback',true,5)$$,'Reviews can be enabled without replaying pause history');
reset role;
update public.marketplace_account_entries set body=jsonb_build_object('feedbacks',jsonb_build_array(
  jsonb_build_object('id','paused-review','authorName','Test','rating',5),
  jsonb_build_object('id','delayed-review','authorName','Test','rating',5,'occurredAt',to_char((now()-interval '10 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  jsonb_build_object('id','fresh-review','authorName','Test','rating',5,'occurredAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'occurredAtVerified',true),
  jsonb_build_object('id','fallback-time-review','authorName','Test','rating',5,'occurredAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'occurredAtVerified',false),
  jsonb_build_object('id','unknown-time-review','authorName','Test','rating',5,'occurredAt','invalid-date')
)),observed_at=clock_timestamp()
 where connection_id='42600000-0000-4000-8000-000000000021' and kind='profile';
select ok(exists(select 1 from public.marketplace_feedback_notifications where external_feedback_id='delayed-review' and notified_at is null),'Unseen review from a failed paused import is not backfilled');
select ok(exists(select 1 from public.marketplace_feedback_notifications where external_feedback_id='fresh-review' and notified_at is not null),'Actual new review after enabling is notified');
select ok(exists(select 1 from public.marketplace_feedback_notifications where external_feedback_id='unknown-time-review' and notified_at is null),'Unknown review time cannot bypass an explicit activation boundary');
select ok(exists(select 1 from public.marketplace_feedback_notifications where external_feedback_id='fallback-time-review' and notified_at is null),'Synthetic sync-start timestamp cannot masquerade as a verified review date');
select ok(public.marketplace_feedback_occurred_at('2026-13-01T00:00:00.000Z') is null,'Malformed provider date cannot abort the profile import');
-- A sync can start before activation and read the genuine new review afterwards.
update public.marketplace_account_entries set observed_at=now()-interval '1 minute'
 where connection_id='42600000-0000-4000-8000-000000000021' and kind='profile';
update public.marketplace_account_entries set body=jsonb_set(body,'{feedbacks}',body->'feedbacks'||jsonb_build_array(
  jsonb_build_object('id','concurrent-review','authorName','Test','rating',5,'occurredAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'occurredAtVerified',true)
)),observed_at=now()-interval '30 seconds'
 where connection_id='42600000-0000-4000-8000-000000000021' and kind='profile';
select ok(exists(select 1 from public.marketplace_feedback_notifications where external_feedback_id='concurrent-review' and notified_at is not null),'Review creation after activation is not suppressed by an older sync-start time');
update public.marketplace_connections set execution_mode='local' where id='42600000-0000-4000-8000-000000000021';
set local role service_role;
select is(pg_temp.apply(jsonb_build_array(pg_temp.event('status_message:12','feedback_received'))),1,'Local accounts retain chat reviews because they have no profile feedback source');
reset role;
select * from finish();
rollback;
