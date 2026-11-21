\set ON_ERROR_STOP on
begin;
select no_plan();
insert into auth.users(id,email) values ('95000000-0000-4000-8000-000000000001','title-feed@example.test');
insert into public.workspaces(id,name) values ('95000000-0000-4000-8000-000000000002','Titelsuche');
insert into public.workspace_members(workspace_id,user_id,role) values ('95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','owner');
insert into public.sniper_queries(id,query_key,title,brand_id,is_active) values
 ('95000000-0000-4000-8000-000000000003','title-feed-nike','Herren Kleidung',53,true),
 ('95000000-0000-4000-8000-000000000004','title-feed-carhartt-fleece','Carhartt Fleecejacken',362,true),
 ('95000000-0000-4000-8000-000000000005','title-feed-paused','Pausierter Bot',362,false);
insert into public.sniper_listings(external_id,title,url,item_price,total_price,brand,size,discovered_by_query_id,first_seen_at) values
 ('title-fresh-plain','Moderne Jacke','https://www.vinted.de/items/1',10,12,'Nike','L','95000000-0000-4000-8000-000000000003',now()),
 ('title-fresh-vintage','Nike Vintage Jacke','https://www.vinted.de/items/2',20,22,'Nike','L','95000000-0000-4000-8000-000000000003',now()-interval '1 minute'),
 ('title-older-vintage','Vintage Nike Trackpants','https://www.vinted.de/items/3',30,32,'Nike','XL','95000000-0000-4000-8000-000000000003',now()-interval '2 minutes'),
 ('title-expired','Vintage Nike Jacke alt','https://www.vinted.de/items/4',5,7,'Nike','L','95000000-0000-4000-8000-000000000003',now()-interval '4 days'),
 ('title-carhartt-fleece','Carhartt Fleecejacke schwarz','https://www.vinted.de/items/5',35,38,'Carhartt','M','95000000-0000-4000-8000-000000000003',now()-interval '3 minutes'),
 ('title-carhartt-shirt','Carhartt T-Shirt weiß','https://www.vinted.de/items/6',15,18,'Carhartt','M','95000000-0000-4000-8000-000000000003',now()-interval '4 minutes');
insert into public.sniper_query_matches(query_id,listing_id,filter_revision,is_seed)
select '95000000-0000-4000-8000-000000000004', id, 1, false
from public.sniper_listings where external_id = 'title-carhartt-fleece';
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,1,'VINTAGE')->'items'->0->>'title','Nike Vintage Jacke','Titelsuche läuft vor dem Seitenlimit und ignoriert Großschreibung');
select is(jsonb_array_length(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'CARH')->'items'),2,'Wortanfang-Suche findet Carhartt-Titel schon ab vier Buchstaben');
select is(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'Flee CARH')->'items'->0->>'title','Carhartt Fleecejacke schwarz','Mehrere Wortanfänge gelten gemeinsam und in beliebiger Reihenfolge');
select is(jsonb_array_length(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'Vintage')->'items'),2,'Treffer über drei Tage werden auch vor der Bereinigung ausgeschlossen');
select is(jsonb_array_length(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,'Nike','l',15,25,null,null,100,'Vintage')->'items'),1,'Marke, Größe, Preise und Titel wirken gemeinsam');
select is(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'Trackpants Vintage')->'items'->0->>'title','Vintage Nike Trackpants','Mehrere Wörter müssen vorkommen, ihre Reihenfolge ist frei');
select is(jsonb_array_length(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'___%')->'items'),0,'Sonderzeichen erzeugen keinen Alles-Treffer');
select is(jsonb_array_length(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'   ')->'items'),5,'Zurücksetzen zeigt wieder den vollständigen Drei-Tage-Feed');
select is((with first as (select public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,1,'Vintage')->'items'->0 p)
 select public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,(p->>'first_seen_at')::timestamptz,(p->>'id')::uuid,1,'Vintage')->'items'->0->>'title' from first),'Vintage Nike Trackpants','Der Suchbegriff bleibt beim Nachladen erhalten');
select results_eq($$
 select item->>'title' from jsonb_array_elements(public.sniper_feed_search(
  '95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'',null,null,'{}',
  '95000000-0000-4000-8000-000000000004'::uuid)->'items') item
$$, $$values ('Carhartt Fleecejacke schwarz'::text)$$, 'Ein gewählter Vinted-Bot zeigt nur seine zugeordneten Treffer und nicht alle Artikel derselben Marke');
select is(public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'',null,null,'{}','95000000-0000-4000-8000-000000000005'::uuid)->>'covered','false','Ein pausierter Vinted-Bot meldet fehlende Sammlung');
select throws_ok($$select public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,'',null,null,'{}','95000000-0000-4000-8000-000000000999'::uuid)$$,'22023',null,'Unbekannter Vinted-Bot wird abgelehnt');
select throws_ok($$select public.sniper_feed_search('95000000-0000-4000-8000-000000000999',null,null,null,null,null,null,null,100,'Vintage')$$,'42501',null,'Workspace-Grenze bleibt auch bei einer Textsuche bestehen');
select throws_ok($$select public.sniper_feed_search('95000000-0000-4000-8000-000000000002',null,null,null,null,null,null,null,100,repeat('a',201))$$,'22023',null,'Überlange Eingaben werden abgelehnt');
reset role;
select * from finish();
rollback;
