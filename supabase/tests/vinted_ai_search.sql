\set ON_ERROR_STOP on
begin;
select no_plan();
insert into auth.users(id,email) values
 ('54000000-0000-4000-8000-000000000001','ai-admin@example.test'),
 ('54000000-0000-4000-8000-000000000002','ai-beta@example.test');
insert into public.workspaces(id,name) values ('54000000-0000-4000-8000-000000000003','AI-Test');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000001','owner'),
 ('54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000002','member');
insert into public.platform_operators(user_id) values ('54000000-0000-4000-8000-000000000001');
insert into public.sniper_listings(id,external_id,title,url,item_price,total_price) values
 ('54000000-0000-4000-8000-000000000004','ai-test','Testmodell','https://www.vinted.de/items/540',20,22);

select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6-luna')->>'cached','false','Erste Anfrage reserviert Kosten');
select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6-luna')->>'error','search_busy','Zweite parallele Anfrage wird blockiert');
update public.vinted_ai_searches set status='completed',result='{"analysis":{}}',input_tokens=1000,output_tokens=500,web_search_calls=1,estimated_cost_usd=0.01035;
select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6-luna')->>'cached','true','Identische Anfrage verwendet Ergebnis erneut');
select is((select count(*) from public.vinted_ai_searches),1::bigint,'Cache verursacht keine neue Verbrauchszeile');
select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('b',64),'gpt-6-luna')->>'cached','false','Geaenderte Inhalte werden neu analysiert');
update public.vinted_ai_searches set created_at=now()-interval '3 minutes' where status='pending';
select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6.1-sol')->>'cached','false','Modellvergleich hat eigenen Cache');
select is((select count(*) from public.vinted_ai_searches where status='unknown' and estimated_cost_usd is null),1::bigint,'Unterbrochener Request bleibt mit unbekannten Kosten bestehen');
select throws_ok($$select public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000002','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6-luna')$$,'42501',null,'Beta-Nutzer duerfen keine Kosten reservieren');
select throws_ok($$select public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000099','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6-luna')$$,'42501',null,'Fremder Workspace wird abgewiesen');
select throws_ok($$select public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004','bad','gpt-6-luna')$$,'22023',null,'Ungueltiger Hash wird abgewiesen');

select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.vinted_ai_searches),0::bigint,'Beta-Nutzer sehen keine Analyse- oder Kostendaten');
select is(public.vinted_ai_search_usage('54000000-0000-4000-8000-000000000003'),'[]'::jsonb,'Beta-Nutzer sehen auch keine aggregierten Kosten');
select throws_ok($$select public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6-luna')$$,'42501',null,'Direkter RPC mit vorgetaeuschter Admin-ID ist gesperrt');
select throws_ok($$update public.vinted_ai_searches set estimated_cost_usd=0$$,'42501',null,'Client kann Kosten nicht manipulieren');
select throws_ok($$select setval('public.vinted_ai_searches_id_seq',1)$$,'42501',null,'Client kann auch die Verbrauchssequenz nicht manipulieren');
reset role;
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.vinted_ai_searches),3::bigint,'Admin sieht eigenen Verlauf');
select is((public.vinted_ai_search_usage('54000000-0000-4000-8000-000000000003')->0->>'unknown_cost_requests')::integer,1,'Unbekannte Kosten erscheinen separat statt als Null');
select is((public.vinted_ai_search_usage('54000000-0000-4000-8000-000000000003')->0->>'average_cost_usd')::numeric,0.01035::numeric,'Durchschnitt umfasst nur bekannte Kosten');
reset role;
update public.vinted_ai_searches set status='failed' where status='pending';
insert into public.vinted_ai_searches(user_id,workspace_id,listing_id,input_hash,model,status)
 select '54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('c',64),'gpt-6-luna','failed' from generate_series(1,17);
select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('d',64),'gpt-6-luna')->>'error','search_limit','Auch fehlgeschlagene Anfragen zaehlen zum Stundenlimit');
update public.vinted_ai_searches set created_at=now()-interval '2 hours';
insert into public.vinted_ai_searches(user_id,workspace_id,listing_id,input_hash,model,status,created_at)
 select '54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('c',64),'gpt-6-luna','failed',now()-interval '2 hours' from generate_series(1,80);
select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('d',64),'gpt-6-luna')->>'error','search_limit','Tageslimit gilt unabhaengig vom Stundenlimit');
select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6-luna')->>'cached','true','Cache bleibt auch bei ausgeschöpftem Limit kostenfrei nutzbar');
delete from public.vinted_ai_searches where user_id='54000000-0000-4000-8000-000000000001';
select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6.1-terra')->>'cached','false','Terra ist fuer einen eigenen Modellvergleich freigegeben');
update public.vinted_ai_searches set status='failed' where status='pending';
select is(public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6-astra')->>'cached','false','Astra ist fuer einen eigenen Modellvergleich freigegeben');
delete from public.workspace_members where user_id='54000000-0000-4000-8000-000000000001';
select throws_ok($$select public.reserve_vinted_ai_search('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000004',repeat('a',64),'gpt-6-luna')$$,'42501',null,'Entzogener Workspacezugriff sperrt auch Cache');
select * from finish();
rollback;
