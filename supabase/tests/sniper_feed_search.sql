\set ON_ERROR_STOP on
begin;
select no_plan();
insert into auth.users(id,email) values ('95000000-0000-4000-8000-000000000001','title-feed@example.test');
insert into public.workspaces(id,name) values ('95000000-0000-4000-8000-000000000002','Titelsuche');
insert into public.workspace_members(workspace_id,user_id,role) values ('95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','owner');
insert into public.sniper_queries(id,query_key,brand_id,is_active) values ('95000000-0000-4000-8000-000000000003','title-feed-nike',53,true);
insert into public.sniper_listings(external_id,title,url,item_price,total_price,brand,size,discovered_by_query_id,first_seen_at) values
 ('title-fresh-plain','Moderne Jacke','https://www.vinted.de/items/1',10,12,'Nike','L','95000000-0000-4000-8000-000000000003',now()),
 ('title-fresh-vintage','Nike Vintage Jacke','https://www.vinted.de/items/2',20,22,'Nike','L','95000000-0000-4000-8000-000000000003',now()-interval '1 minute'),
 ('title-older-vintage','Vintage Nike Trackpants','https://www.vinted.de/items/3',30,32,'Nike','XL','95000000-0000-4000-8000-000000000003',now()-interval '2 minutes'),
 ('title-expired','Vintage Nike Jacke alt','https://www.vinted.de/items/4',5,7,'Nike','L','95000000-0000-4000-8000-000000000003',now()-interval '8 days');
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,1,'VINTAGE')->'items'->0->>'title','Nike Vintage Jacke','Titelsuche läuft vor dem Seitenlimit und ignoriert Großschreibung');
select is(jsonb_array_length(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'Vintage')->'items'),2,'Treffer über sieben Tage werden auch vor der Bereinigung ausgeschlossen');
select is(jsonb_array_length(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,'Nike','l',15,25,null,null,100,'Vintage')->'items'),1,'Marke, Größe, Preise und Titel wirken gemeinsam');
select is(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'Trackpants Vintage')->'items'->0->>'title','Vintage Nike Trackpants','Mehrere Wörter müssen vorkommen, ihre Reihenfolge ist frei');
select is(jsonb_array_length(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'___%')->'items'),0,'Sonderzeichen erzeugen keinen Alles-Treffer');
select is(jsonb_array_length(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'   ')->'items'),3,'Zurücksetzen zeigt wieder den vollständigen Sieben-Tage-Feed');
select is((with first as (select public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,1,'Vintage')->'items'->0 p)
 select public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,(p->>'first_seen_at')::timestamptz,(p->>'id')::uuid,1,'Vintage')->'items'->0->>'title' from first),'Vintage Nike Trackpants','Der Suchbegriff bleibt beim Nachladen erhalten');
select throws_ok($$select public.sniper_feed_search('95000000-0000-4000-8000-000000000999',null,null,null,null,null,null,null,100,'Vintage')$$,'42501',null,'Workspace-Grenze bleibt auch bei einer Textsuche bestehen');
select throws_ok($$select public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,repeat('a',201))$$,'22023',null,'Überlange Eingaben werden abgelehnt');
reset role;
select * from finish();
rollback;
