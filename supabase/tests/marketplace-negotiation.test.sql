\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('42600000-0000-4000-8000-000000000001','authenticated','authenticated','negotiation-owner@example.test','{}','{}'),
 ('42600000-0000-4000-8000-000000000002','authenticated','authenticated','negotiation-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('42600000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('42600000-0000-4000-8000-000000000011','Negotiation');
insert into public.workspace_members(workspace_id,user_id,role) values('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,execution_mode,status,external_account_id) values
 ('42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000011','Local negotiation','local','connected','123'),
 ('42600000-0000-4000-8000-000000000022','42600000-0000-4000-8000-000000000011','Cloud negotiation','cloud','connected','124');
insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at,messages_read,messages_send) values
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000001',repeat('a',64),'123',clock_timestamp()+interval '1 hour',true,true);
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022','negotiation-cloud-profile');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values
 ('42600000-0000-4000-8000-000000000031','42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','conversation','777','{"partnerId":"789","itemId":"456","isBundle":false}'),
 ('42600000-0000-4000-8000-000000000032','42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022','conversation','778','{"partnerId":"790","itemId":"457","isBundle":false}');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body) values
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','publication','456','{"title":"Jacke","price":100,"isClosed":false,"isReserved":false}'),
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022','publication','457','{"title":"Mantel","price":100,"isClosed":false,"isReserved":false}');
create function pg_temp.config() returns jsonb language sql as $$
 select '{"discountType":"percentage","discountValue":10,"priceBands":[],"stages":[50,80,100],"delaySeconds":0,"sendOrder":"offer_first","purchaseEnabled":false,"messages":{"accepted":[{"templates":["Angenommen"],"delaySeconds":0}],"counter":[{"templates":["{article}: {price}","Preis {price}"],"delaySeconds":0},{"templates":["Danach"],"delaySeconds":1}],"final":[],"after_final":[],"after_acceptance":[],"buyer_accepted":[],"purchased":[{"templates":["Danke für Deinen Kauf"],"delaySeconds":0}]}}'::jsonb;
$$;
create function pg_temp.save(p_enabled boolean default true,p_config jsonb default pg_temp.config(),p_cloud boolean default false) returns jsonb language sql as $$
 select public.marketplace_save_negotiation('42600000-0000-4000-8000-000000000011',case when p_cloud then '42600000-0000-4000-8000-000000000022'::uuid else '42600000-0000-4000-8000-000000000021'::uuid end,
 (public.marketplace_read_negotiation('42600000-0000-4000-8000-000000000011',case when p_cloud then '42600000-0000-4000-8000-000000000022'::uuid else '42600000-0000-4000-8000-000000000021'::uuid end)->>'version')::bigint,p_enabled,p_config);
$$;
create function pg_temp.offer(p_id text,p_price bigint default 8000,p_cloud boolean default false,p_at timestamptz default clock_timestamp(),p_extra jsonb default '{}') returns uuid language plpgsql as $$
declare v_id uuid;
begin
 insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at)
 values('42600000-0000-4000-8000-000000000011',case when p_cloud then '42600000-0000-4000-8000-000000000022'::uuid else '42600000-0000-4000-8000-000000000021'::uuid end,'message',p_id,
 case when p_cloud then '42600000-0000-4000-8000-000000000032'::uuid else '42600000-0000-4000-8000-000000000031'::uuid end,
 jsonb_build_object('direction','inbound','negotiationOffer',jsonb_build_object('offerId',p_id,'transactionId',case when p_cloud then '667' else '666' end,'itemId',case when p_cloud then '457' else '456' end,'buyerId',case when p_cloud then '790' else '789' end,'sellerId',case when p_cloud then '124' else '123' end,'originalPriceCents',10000,'offeredPriceCents',p_price,'status','pending','currency','EUR')||p_extra),p_at)
 on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at returning id into v_id;
 return v_id;
end;
$$;
create temporary table negotiation_context(body jsonb);
grant all on negotiation_context to service_role;
create function pg_temp.claim() returns jsonb language sql as $$ select public.marketplace_local_negotiation_claim('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021',repeat('a',64)); $$;
create function pg_temp.begin_run() returns jsonb language sql as $$ select public.marketplace_local_negotiation_begin('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021',repeat('a',64),(body->>'jobId')::uuid,(body->>'claimToken')::uuid) from negotiation_context; $$;
create function pg_temp.finish_run(p_outcome text,p_id text default null) returns jsonb language sql as $$ select public.marketplace_local_negotiation_finish('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021',repeat('a',64),(body->>'jobId')::uuid,(body->>'claimToken')::uuid,p_outcome,p_id,null) from negotiation_context; $$;

select ok(public.marketplace_negotiation_config_valid(pg_temp.config()),'Default config is valid');
select ok(public.marketplace_negotiation_config_valid(pg_temp.config()||'{"discountValue":28.57}'),'Two-digit percent accepted');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"unexpected":true}'),'Unknown fields rejected');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"stages":[80,50,100]}'),'Descending stages rejected');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"stages":[50,80]}'),'Last stage must reach maximum discount');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"delaySeconds":604801}'),'Delay bounded');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"discountValue":null}'),'Null discount rejected');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"discountType":null}'),'Null discount type rejected');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"sendOrder":null}'),'Null send order rejected');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"priceBands":null}'),'Null price bands rejected');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"stages":null}'),'Null stages rejected');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()||'{"messages":null}'),'Null messages rejected');
select ok(not public.marketplace_negotiation_config_valid(pg_temp.config()-'purchaseEnabled'),'Missing field rejected');
select is(public.marketplace_negotiation_minimum_price(10000,pg_temp.config()),9000::bigint,'Exact 90 percent threshold');
select is(public.marketplace_negotiation_minimum_price(5000,pg_temp.config()||'{"discountType":"amount","discountValue":10}'),4000::bigint,'Amount is euros and prices are cents');
select throws_ok($$select public.marketplace_negotiation_minimum_price(100,pg_temp.config()||'{"discountType":"amount","discountValue":0.51}')$$,'22023',null,'Below half-price rejected without clipping');
select ok(not has_table_privilege('authenticated','public.marketplace_negotiation_jobs','select'),'Private jobs cannot be selected by the app');
select ok(not has_function_privilege('authenticated','public.marketplace_local_negotiation_claim(uuid,uuid,text)','execute'),'App cannot claim writes');
select ok(not has_function_privilege('anon','public.marketplace_enqueue_negotiation(uuid,uuid,uuid,uuid,uuid,text,bigint)','execute'),'Anonymous enqueue denied');
select set_config('request.jwt.claim.sub','42600000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(public.marketplace_read_negotiation('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021')->>'enabled','false','Initially disabled');
select lives_ok($$select pg_temp.save()$$,'Explicit local activation succeeds');
select throws_ok($$select public.marketplace_save_negotiation('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021',0,true,pg_temp.config())$$,'40001',null,'Stale settings version rejected');
select throws_ok($$select pg_temp.save(true,pg_temp.config(),true)$$,'42501',null,'Cloud activation does not silently grant send rights');
reset role;
savepoint message_first_cancelled_case;
set local role authenticated;
select pg_temp.save(true,pg_temp.config()||'{"sendOrder":"message_first"}');
reset role;
set local role service_role;
select pg_temp.offer('301');
insert into negotiation_context values(pg_temp.claim());
select is((select body->'sourceOffer'->>'offerId' from negotiation_context),'301','Message-first claim carries the saved source offer');
select pg_temp.offer('301',8000,false,clock_timestamp(),'{"status":"cancelled"}');
select is(pg_temp.claim(),null::jsonb,'Cancelled source offer cannot send message-first price text');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:301' and state='cancelled'),3::bigint,'Cancelled source discards action and complete message chain');
reset role;
rollback to savepoint message_first_cancelled_case;
set local role authenticated;
select pg_temp.save(true,pg_temp.config()||'{"sendOrder":"message_first"}');
reset role;
set local role service_role;
select pg_temp.offer('302');
update public.marketplace_account_entries set body=body-'negotiationOffer' where external_id='302';
select is(pg_temp.claim(),null::jsonb,'Removed source offer cannot send message-first price text');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:302' and state='cancelled'),3::bigint,'Removed source discards complete chain');
reset role;
rollback to savepoint message_first_cancelled_case;

set local role service_role;
select pg_temp.offer('303',9000);
insert into negotiation_context values(pg_temp.claim());
select pg_temp.begin_run();
select pg_temp.finish_run('sent','930');
select pg_temp.offer('303',9000,false,clock_timestamp(),'{"status":"accepted"}');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at) values('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','309','42600000-0000-4000-8000-000000000031','{"negotiationEvent":{"id":"309","type":"buyer_accepted","transactionId":"666","confirmed":true}}',clock_timestamp());
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:303' and action='message' and state='queued'),1::bigint,'Buyer-accepted import preserves text of confirmed own acceptance');
update negotiation_context set body=pg_temp.claim();
select is((select body->'command'->>'text' from negotiation_context),'Angenommen','Confirmed own acceptance still permits its follow-up text');
select is((select body->'sourceOffer' from negotiation_context),'null'::jsonb,'Confirmed own action removes pending-source requirement');
reset role;
rollback to savepoint message_first_cancelled_case;

set local role authenticated;
select pg_temp.save(true,jsonb_set(pg_temp.config(),'{messages,buyer_accepted}','[{"templates":["Danke für die Annahme"],"delaySeconds":0}]'));
reset role;
set local role service_role;
select pg_temp.offer('304');
insert into negotiation_context values(pg_temp.claim());
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at) values('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','305','42600000-0000-4000-8000-000000000031','{"negotiationEvent":{"id":"305","type":"buyer_accepted","transactionId":"666","confirmed":true}}',clock_timestamp());
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:304' and state='cancelled'),3::bigint,'Buyer acceptance cancels pending counter and price texts');
select throws_ok($$select pg_temp.begin_run()$$,'42501',null,'Previously claimed counter cannot begin after buyer acceptance');
update negotiation_context set body=pg_temp.claim();
select is((select body->'command'->>'text' from negotiation_context),'Danke für die Annahme','Independent buyer-accepted event text remains available');
reset role;
set local role authenticated;
select throws_ok($$select public.marketplace_enqueue_negotiation('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000031',(select id from public.marketplace_account_entries where external_id='304'),'42600000-0000-4000-8000-000000000073','decline')$$,'22023',null,'Manual price action cannot reopen confirmed acceptance');
reset role;
rollback to savepoint message_first_cancelled_case;

set local role service_role;
select pg_temp.offer('306');
insert into negotiation_context values(pg_temp.claim());
select pg_temp.begin_run();
update public.marketplace_negotiation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where state='sending';
select is(pg_temp.claim(),null::jsonb,'Local timeout does not claim a follow-up');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:306' and state='cancelled' and error_code='predecessor_not_sent'),2::bigint,'Local timeout permanently discards both follow-ups');
select pg_temp.finish_run('sent','931');
select is(pg_temp.claim(),null::jsonb,'Late local success cannot revive discarded follow-ups');
reset role;
rollback to savepoint message_first_cancelled_case;

delete from public.marketplace_account_entries where kind='publication' and external_id='456';
select pg_temp.offer('307');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:307'),0::bigint,'Missing listing context postpones planning');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body) values('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','publication','456','{"title":"Jacke","price":100,"isClosed":false,"isReserved":false}');
select pg_temp.offer('307');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:307'),3::bigint,'Unchanged reimport resumes new offer after listing arrives');
select pg_temp.offer('307');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:307'),3::bigint,'Resumed reimport still deduplicates jobs');
reset role;
rollback to savepoint message_first_cancelled_case;
select pg_temp.offer('101',8000,false,clock_timestamp()-interval '1 day');
select is((select count(*) from public.marketplace_negotiation_jobs),0::bigint,'Old offer stays baseline');
set local role service_role;
select pg_temp.offer('102');
select is((select count(*) from public.marketplace_negotiation_jobs),3::bigint,'New offer plans action and two separate messages');
select pg_temp.offer('102');
select is((select count(*) from public.marketplace_negotiation_jobs),3::bigint,'Repeated sync does not duplicate jobs');
select is((select completed_stages from public.marketplace_negotiation_threads where connection_id='42600000-0000-4000-8000-000000000021'),0,'Planning does not advance stage');
insert into negotiation_context values(pg_temp.claim());
select is((select body->'command'->>'kind' from negotiation_context),'offer','Offer first');
select is((select body->'command'->>'priceCents' from negotiation_context),'9500','First stage uses half the maximum discount');
select is(pg_temp.claim(),null::jsonb,'Only one local lease at a time');
select throws_ok($$select pg_temp.finish_run('sent','901')$$,'42501',null,'Receipt cannot precede durable begin');
select lives_ok($$select pg_temp.begin_run()$$,'Begin succeeds');
select throws_ok($$select pg_temp.begin_run()$$,'42501',null,'Repeated begin rejected');
select throws_ok($$select pg_temp.finish_run('sent')$$,'22023',null,'Success requires provider proof');
select lives_ok($$select pg_temp.finish_run('sent','901')$$,'Counter success recorded');
select lives_ok($$select pg_temp.finish_run('sent','901')$$,'Receipt replay is idempotent');
select is((select completed_stages from public.marketplace_negotiation_threads where connection_id='42600000-0000-4000-8000-000000000021'),1,'Confirmed counter advances exactly once');
select throws_ok($$select pg_temp.finish_run('sent','902')$$,'23505',null,'Different receipt rejected');
update negotiation_context set body=pg_temp.claim();
select is((select body->'command'->>'kind' from negotiation_context),'message','Message only after offer proof');
select ok((select body->'command'->>'text' in ('Jacke: 95,00 €','Preis 95,00 €') from negotiation_context),'Chosen template and price persisted');
select pg_temp.begin_run();
select pg_temp.finish_run('sent','903');
select is(pg_temp.claim(),null::jsonb,'Second message waits its own delay after predecessor');
update public.marketplace_negotiation_jobs set due_at=clock_timestamp()-interval '1 second' where state='queued';
update negotiation_context set body=pg_temp.claim();
select is((select body->'command'->>'text' from negotiation_context),'Danach','Second template is a real follow-up');
select pg_temp.begin_run();
select pg_temp.finish_run('sent','904');
select is(pg_temp.claim(),null::jsonb,'Time alone cannot advance negotiation');
select pg_temp.offer('103');
update negotiation_context set body=pg_temp.claim();
select is((select body->'command'->>'priceCents' from negotiation_context),'9200','New incoming offer advances to second stage');
select pg_temp.begin_run();
select pg_temp.finish_run('outcome_unknown');
select is(pg_temp.claim(),null::jsonb,'Unknown outcome suppresses following messages');
select pg_temp.offer('104');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:104'),0::bigint,'New incoming does not repeat unknown write');
select pg_temp.finish_run('sent','905');
select is((select completed_stages from public.marketplace_negotiation_threads where connection_id='42600000-0000-4000-8000-000000000021'),2,'Late proof resolves original attempt');
select pg_temp.offer('105');
update negotiation_context set body=pg_temp.claim();
select is((select body->'command'->>'priceCents' from negotiation_context),'9000','Final stage reaches limit');
select pg_temp.begin_run();
select pg_temp.finish_run('sent','906');
select pg_temp.offer('106');
select is(pg_temp.claim(),null::jsonb,'After final does not invent another counter');
select pg_temp.offer('107',9000);
update negotiation_context set body=pg_temp.claim();
select is((select body->'command'->>'action' from negotiation_context),'accept','At limit buyer offer is accepted');
select pg_temp.begin_run();
select pg_temp.finish_run('sent','907');
select is((select purchased from public.marketplace_negotiation_threads where connection_id='42600000-0000-4000-8000-000000000021'),false,'Offer acceptance is not a purchase');
reset role;
set local role authenticated;
select pg_temp.save(false,pg_temp.config()||'{"purchaseEnabled":true}');
reset role;
set local role service_role;
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at) values('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','108','42600000-0000-4000-8000-000000000031','{"negotiationEvent":{"id":"108","type":"purchased","transactionId":"666","confirmed":true}}',clock_timestamp());
select is((select purchased from public.marketplace_negotiation_threads where connection_id='42600000-0000-4000-8000-000000000021'),true,'Confirmed purchase closes negotiations');
update negotiation_context set body=pg_temp.claim();
select is((select body->'command'->>'text' from negotiation_context),'Danke für Deinen Kauf','Purchase message works independently of negotiation enabled');
select pg_temp.begin_run();
select pg_temp.finish_run('sent','908');
select pg_temp.offer('109',9999);
select is(pg_temp.claim(),null::jsonb,'No new price negotiation after purchase');
reset role;

-- Manuelle Bearbeitung ist unabhängig von aktivierter Automatik und verwendet dieselbe geprüfte Angebotsbasis.
set local role authenticated;
select pg_temp.save(true);
reset role;
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values('42600000-0000-4000-8000-000000000033','42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','conversation','779','{"partnerId":"791","itemId":"456","isBundle":false}');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,parent_id,body,sort_at) values('42600000-0000-4000-8000-000000000041','42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','401','42600000-0000-4000-8000-000000000033','{"direction":"inbound","negotiationOffer":{"offerId":"401","transactionId":"668","itemId":"456","buyerId":"791","sellerId":"123","originalPriceCents":10000,"offeredPriceCents":8000,"status":"pending","currency":"EUR"}}',clock_timestamp());
create function pg_temp.manual(p_action text default 'counter',p_price bigint default 9500,p_request uuid default '42600000-0000-4000-8000-000000000071') returns jsonb language sql as $$
 select public.marketplace_enqueue_negotiation('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000033','42600000-0000-4000-8000-000000000041',p_request,p_action,p_price);
$$;
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:401' and state='queued'),3::bigint,'Automatic action waits before manual takeover');
set local role authenticated;
select lives_ok($$select pg_temp.manual()$$,'Manual counter takes over waiting automation');
select lives_ok($$select pg_temp.manual()$$,'Identical click retries same request');
select throws_ok($$select pg_temp.manual('accept',null)$$,'23505',null,'Changed payload cannot reuse request');
select throws_ok($$select pg_temp.manual('counter',8000,'42600000-0000-4000-8000-000000000072')$$,'22023',null,'Counter must improve received price');
reset role;
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='manual:42600000-0000-4000-8000-000000000071'),1::bigint,'One durable manual request');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:401' and state='cancelled' and error_code='manual_takeover'),3::bigint,'Manual action cancels old action and followups');
select ok(not public.marketplace_negotiation_offer_valid('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000033',(select body->'negotiationOffer'||'{"sellerId":"999"}' from public.marketplace_account_entries where external_id='401')),'Wrong seller rejected');
select ok(not public.marketplace_negotiation_offer_valid('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000033',(select body->'negotiationOffer'||'{"buyerId":null}' from public.marketplace_account_entries where external_id='401')),'Null buyer rejected');
select ok(not public.marketplace_negotiation_offer_valid('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000033',(select body->'negotiationOffer'||'{"status":null}' from public.marketplace_account_entries where external_id='401')),'Null status rejected');
select ok(not public.marketplace_negotiation_offer_valid('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000033',(select body->'negotiationOffer'||'{"currency":null}' from public.marketplace_account_entries where external_id='401')),'Null currency rejected');
select ok(not public.marketplace_negotiation_offer_valid('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','42600000-0000-4000-8000-000000000033',(select body->'negotiationOffer'||'{"originalPriceCents":9000}' from public.marketplace_account_entries where external_id='401')),'Changed listing price rejected');
set local role service_role;
update negotiation_context set body=pg_temp.claim();
select is((select body->'command'->>'action' from negotiation_context),'counter','Manual action uses dedicated executor');
select pg_temp.begin_run();
select pg_temp.finish_run('sent','911');
reset role;
set local role authenticated;
select throws_ok($$select pg_temp.manual('counter',9500,'42600000-0000-4000-8000-000000000072')$$,'40001',null,'Another request cannot repeat completed offer action');
reset role;

set local role authenticated;
select pg_temp.save(false,jsonb_set(pg_temp.config()||'{"purchaseEnabled":true}','{messages,purchased}','[{"templates":["Kauf {price}"],"delaySeconds":0},{"templates":["Danke für Deinen Kauf"],"delaySeconds":0}]'));
reset role;
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values
 ('42600000-0000-4000-8000-000000000034','42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','conversation','780','{"partnerId":"792","itemId":"456","isBundle":false}'),
 ('42600000-0000-4000-8000-000000000035','42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','conversation','781','{"partnerId":"793","itemId":"456","isBundle":false}');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at) values
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','500','42600000-0000-4000-8000-000000000034','{"negotiationEvent":{"id":"500","type":"purchased","transactionId":"669","confirmed":true}}',clock_timestamp()),
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','501','42600000-0000-4000-8000-000000000035','{"negotiationEvent":{"id":"501","type":"purchased","transactionId":"670","confirmed":true,"originalPriceCents":10000,"priceCents":9000,"currency":"EUR"}}',clock_timestamp());
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='event:purchased:669' and state='skipped' and error_code='missing_event_price'),1::bigint,'Missing purchase price is a visible skipped step');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='event:purchased:669' and state='queued' and command->>'text'='Danke für Deinen Kauf'),1::bigint,'General purchase message still queues without prior negotiation');
select is((select command->>'text' from public.marketplace_negotiation_jobs where source_key='event:purchased:670' and step_index=0),'Kauf 90,00 €','Confirmed event price renders exactly');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at) values
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','502','42600000-0000-4000-8000-000000000034','{"negotiationEvent":{"id":"502","type":"purchased","transactionId":"669","confirmed":true}}',clock_timestamp());
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='event:purchased:669'),2::bigint,'One purchase sequence per transaction even with repeated provider events');

-- Cloud: gleiche Regeln, aber eigene Worker-Epoche, Profilbindung und physischer Stoppschutz.
set local role authenticated;
select public.marketplace_approve_cloud_messages('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022','124');
select pg_temp.save(true,pg_temp.config(),true);
reset role;
set local role service_role;
select public.marketplace_worker_claim('42600000-0000-4000-8000-000000000051');
savepoint cloud_timeout_case;
select pg_temp.offer('308',8000,true);
update negotiation_context set body=public.marketplace_cloud_negotiation_claim('42600000-0000-4000-8000-000000000051',1,'42600000-0000-4000-8000-000000000061');
select public.marketplace_cloud_negotiation_begin('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022',(body->>'jobId')::uuid,(body->>'claimToken')::uuid,'42600000-0000-4000-8000-000000000051',1) from negotiation_context;
update public.marketplace_negotiation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where execution_mode='cloud' and state='sending';
select is(public.marketplace_cloud_negotiation_claim('42600000-0000-4000-8000-000000000051',1,'42600000-0000-4000-8000-000000000061'),null::jsonb,'Cloud timeout cannot claim follow-ups while profile active');
select is((select count(*) from public.marketplace_negotiation_jobs where source_key='offer:308' and state='cancelled' and error_code='predecessor_not_sent'),2::bigint,'Cloud timeout permanently discards both follow-ups');
select public.marketplace_cloud_negotiation_finish('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022',(body->>'jobId')::uuid,(body->>'claimToken')::uuid,'42600000-0000-4000-8000-000000000051',1,'sent','932') from negotiation_context;
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where state='active';
select is(public.marketplace_cloud_negotiation_claim('42600000-0000-4000-8000-000000000051',1,'42600000-0000-4000-8000-000000000061'),null::jsonb,'Late cloud success and physical stop cannot revive discarded follow-ups');
rollback to savepoint cloud_timeout_case;
select pg_temp.offer('201',8000,true);
update negotiation_context set body=public.marketplace_cloud_negotiation_claim('42600000-0000-4000-8000-000000000051',1,'42600000-0000-4000-8000-000000000061');
select is((select body->'command'->>'priceCents' from negotiation_context),'9500','Cloud command uses same first stage');
select is(public.marketplace_cloud_negotiation_claim('42600000-0000-4000-8000-000000000051',1,'42600000-0000-4000-8000-000000000061'),null::jsonb,'Active profile cannot overlap');
select is((select public.marketplace_cloud_negotiation_check('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022',(body->>'jobId')::uuid,(body->>'claimToken')::uuid,'42600000-0000-4000-8000-000000000051',2)->>'active' from negotiation_context),'false','Wrong epoch rejected');
select lives_ok($$select public.marketplace_cloud_negotiation_begin('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022',(body->>'jobId')::uuid,(body->>'claimToken')::uuid,'42600000-0000-4000-8000-000000000051',1) from negotiation_context$$,'Cloud begin acknowledged');
select lives_ok($$select public.marketplace_cloud_negotiation_finish('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022',(body->>'jobId')::uuid,(body->>'claimToken')::uuid,'42600000-0000-4000-8000-000000000051',1,'sent','910') from negotiation_context$$,'Cloud receipt recorded');
update public.marketplace_browser_sessions set state='stopping',expires_at=clock_timestamp()-interval '1 second' where state='active';
select is(public.marketplace_cloud_negotiation_claim('42600000-0000-4000-8000-000000000051',1,'42600000-0000-4000-8000-000000000061'),null::jsonb,'Expired stopping browser still reserves capacity');
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where state='stopping';
update negotiation_context set body=public.marketplace_cloud_negotiation_claim('42600000-0000-4000-8000-000000000051',1,'42600000-0000-4000-8000-000000000061');
select is((select body->'command'->>'kind' from negotiation_context),'message','Physical stop releases next step');
reset role;
update public.marketplace_browser_profiles set provider_profile_id='different-profile' where connection_id='42600000-0000-4000-8000-000000000022';
select is((select count(*) from public.marketplace_negotiation_jobs where connection_id='42600000-0000-4000-8000-000000000022' and state in ('queued','claimed')),0::bigint,'Profile change cancels unbegun jobs');
set local role authenticated;
select is(public.marketplace_read_negotiation('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022')->>'enabled','true','Configured enabled remains visible while authorization inactive');
select is(public.marketplace_read_negotiation('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000022')->>'active','false','Revoked profile makes automation inactive');
reset role;

insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body) values
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','903','42600000-0000-4000-8000-000000000031','{"text":"Gleicher Text","direction":"outbound"}'),
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','911','42600000-0000-4000-8000-000000000033','{"text":"Gleicher Text","direction":"outbound"}'),
 ('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message','912','42600000-0000-4000-8000-000000000031','{"text":"Gleicher Text","direction":"outbound","isAutomated":true}');
create function pg_temp.bot(p_id text,p_conversation uuid default '42600000-0000-4000-8000-000000000031') returns boolean language sql as $$
 select (entry->>'isAutomated')::boolean from jsonb_array_elements(public.marketplace_read_page('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021','message',null,p_conversation)->'items') entry where entry->>'externalId'=p_id;
$$;
set local role authenticated;
select is(pg_temp.bot('903'),true,'Confirmed automatic negotiation text has bot origin');
select is(pg_temp.bot('911','42600000-0000-4000-8000-000000000033'),false,'Manual offer proof is not an automatic text proof');
select is(pg_temp.bot('912'),false,'Provider isAutomated and matching text cannot forge origin');
reset role;
savepoint bot_origin_case;
update public.marketplace_negotiation_jobs set automated=false where external_id='903';
set local role authenticated;
select is(pg_temp.bot('903'),false,'Manual text job cannot acquire bot origin');
reset role;
rollback to savepoint bot_origin_case;
update public.marketplace_negotiation_jobs set state='outcome_unknown' where external_id='903';
set local role authenticated;
select is(pg_temp.bot('903'),false,'Unknown text outcome has no bot origin');
reset role;
rollback to savepoint bot_origin_case;
update public.marketplace_connections set external_account_id='125' where id='42600000-0000-4000-8000-000000000021';
set local role authenticated;
select is(pg_temp.bot('903'),false,'Old identity proof cannot mark a changed account');
reset role;
rollback to savepoint bot_origin_case;
select set_config('request.jwt.claim.sub','42600000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.marketplace_read_negotiation('42600000-0000-4000-8000-000000000011','42600000-0000-4000-8000-000000000021')$$,'42501',null,'Other user cannot read settings');
reset role;
select * from finish();
rollback;
