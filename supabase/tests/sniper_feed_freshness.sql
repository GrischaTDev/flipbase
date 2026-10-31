\set ON_ERROR_STOP on
begin;
select no_plan();

-- Nur frisch eingestellte Vinted-Artikel gelten als neuer Fund. Erstbestand bleibt
-- für die Doppelerkennung gespeichert, erscheint aber nicht im Feed.
insert into auth.users(id,email) values
 ('e3000000-0000-4000-8000-000000000001','freshness-admin@example.test'),
 ('e3000000-0000-4000-8000-000000000002','freshness-member@example.test');
insert into public.platform_operators(user_id) values ('e3000000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values ('e3000000-0000-4000-8000-000000000003','Frische Funde');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('e3000000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000002','owner');
insert into public.vinted_categories(id,title,slug,path,is_leaf) values (9300001,'Jacken','freshness-jackets','Jacken',true);
insert into public.sniper_runtime_status(id,reported_at,requests_last_minute,rejected_last_minute,request_budget,search_filter_version,search_filter_reported_at)
 values (1,now(),0,0,24,1,now());

select set_config('request.jwt.claim.sub','e3000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.save_sniper_search_filter(null,'FRESH broad',9300001,'[]','{}','all',1000,null,null);
select public.save_sniper_search_filter(null,'FRESH narrow',9300001,'[]',array['Jacke'],'all',1000,null,null);
select public.set_sniper_query_active((select id from public.sniper_queries where title='FRESH broad'),true);
select public.set_sniper_query_active((select id from public.sniper_queries where title='FRESH narrow'),true);
reset role;

create function pg_temp.run(p_title text, p_ids text[]) returns jsonb language sql as $$
    select public.complete_sniper_search_filter_run(query.id, query.filter_revision, query.request_cursor,
        (select jsonb_agg(jsonb_build_object('external_id',id,'title','Jacke '||id,'url','https://www.vinted.de/items/'||id,
            'item_price',10,'total_price',11,'currency','EUR')) from unnest(p_ids) id))
    from public.sniper_queries query where query.title = p_title;
$$;
grant execute on function pg_temp.run(text,text[]) to service_role;

set local role service_role;
select is((pg_temp.run('FRESH broad',array['10000000000','10010000000'])->>'seeded')::boolean,true,'Erster Abruf ist Erstbestand');
select is((select newest_external_id from public.sniper_queries where title='FRESH broad'),10010000000::bigint,'Erstbestand legt die neueste Artikelnummer fest');
select ok((select bool_and(is_initial_stock) from public.sniper_listings where external_id in ('10000000000','10010000000')),'Erstbestand ist markiert');

select is((pg_temp.run('FRESH broad',array['10010000001','10003000000','10010000000','legacy-id'])->>'created')::integer,2,
 'Nur frische und nicht numerische Nummern werden gespeichert');
select is((select count(*) from public.sniper_listings where external_id='10003000000'),0::bigint,'Hochgeschobener Altartikel wird nicht gespeichert');
select is((select count(*) from public.sniper_query_matches m join public.sniper_listings l on l.id=m.listing_id where l.external_id='10003000000'),0::bigint,
 'Hochgeschobener Altartikel erhält keine Filterzuordnung');
select is((select newest_external_id from public.sniper_queries where title='FRESH broad'),10010000001::bigint,'Neueste Nummer steigt mit');
select is((pg_temp.run('FRESH broad',array['10005000001'])->>'created')::integer,1,'Knapp unter einer Stunde älter zählt noch als frisch');
select ok(not (select is_initial_stock from public.sniper_listings where external_id='10010000001'),'Laufender Fund ist kein Erstbestand');

-- Erstbestand eines Filters wird sichtbar, sobald ein laufender Filter ihn frisch findet.
select is((pg_temp.run('FRESH narrow',array['10010000500'])->>'seeded')::boolean,true,'Zweiter Filter beginnt mit Erstbestand');
select ok((select is_initial_stock from public.sniper_listings where external_id='10010000500'),'Fremder Erstbestand ist zunächst verborgen');
select is((pg_temp.run('FRESH broad',array['10010000500'])->>'seeded')::boolean,false,'Laufender Filter übernimmt den Artikel');
select ok(not (select is_initial_stock from public.sniper_listings where external_id='10010000500'),'Frischer Fund eines laufenden Filters wird sichtbar');
reset role;

select set_config('request.jwt.claim.sub','e3000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select array_agg(item->>'title' order by item->>'title') from jsonb_array_elements(
 public.sniper_feed_search('e3000000-0000-4000-8000-000000000003',null,null,null,null,null,null,null,100,'')->'items') item),
 array['Jacke 10005000001','Jacke 10010000001','Jacke 10010000500','Jacke legacy-id'],'Feed zeigt keinen Erstbestand');
reset role;

select * from finish();
rollback;
