\set ON_ERROR_STOP on
begin;
select no_plan();
insert into auth.users(id,email) values
('91000000-0000-4000-8000-000000000001','feed-a@example.test'),
('91000000-0000-4000-8000-000000000002','feed-b@example.test');
insert into public.workspaces(id,name) values
('91000000-0000-4000-8000-000000000003','Feed A'),
('91000000-0000-4000-8000-000000000004','Feed B');
insert into public.workspace_members(workspace_id,user_id,role) values
('91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','owner'),
('91000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000002','owner');
insert into public.vinted_categories(id,title,slug,path,is_leaf) values (2010000001,'Schuhe','schuhe','Test > Schuhe',true);
insert into public.sniper_queries(id,query_key,catalog_id,search_text,price_to) values
('91000000-0000-4000-8000-000000000005','feed-source-a',2010000001,null,100),
('91000000-0000-4000-8000-000000000006','feed-source-b',2010000001,null,150),
('91000000-0000-4000-8000-000000000007','feed-source-text',null,'Sneaker',150);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.save_sniper_watchlist('91000000-0000-4000-8000-000000000003',null,'Mein Filter',2010000001,' Nike ','Sneaker',5,50,'Gut',40,true)$$,'Mitglied legt eigenen Merkzettel an');
select is((select brand from public.sniper_watchlists where title = 'Mein Filter'),'Nike','Marke normalisiert');
select throws_ok($$select public.save_sniper_watchlist('91000000-0000-4000-8000-000000000004',null,'Fremd',null,null,null,null,null,null,40,true)$$,'42501',null,'Fremder Arbeitsbereich bleibt gesperrt');
select throws_ok($$insert into public.sniper_watchlists(workspace_id,title) values('91000000-0000-4000-8000-000000000003','Direkt')$$,'42501',null,'Keine direkten Schreibrechte');
select throws_ok($$select public.save_sniper_watchlist('91000000-0000-4000-8000-000000000003',null,'Preis',null,null,null,50,5,null,40,true)$$,'23514',null,'Umgekehrte Preisspanne abgelehnt');
select throws_ok($$select public.save_sniper_watchlist('91000000-0000-4000-8000-000000000003',null,'Kategorie',999,null,null,null,null,null,40,true)$$,'22023',null,'Unbekannte Kategorie abgelehnt');
select throws_ok($$select public.sniper_feed('91000000-0000-4000-8000-000000000004')$$,'42501',null,'Feed fremder Arbeitsbereiche gesperrt');
select throws_ok($$select public.sniper_feed('91000000-0000-4000-8000-000000000003',null,false,null,null,10000)$$,'22023',null,'Feed ist begrenzt');
reset role;
select is((select count(*) from public.sniper_queries),3::bigint,'Nutzerfilter erzeugt keine Sammelauftraege');

insert into public.sniper_watchlists(id,workspace_id,title,catalog_id,brand,discount_threshold_percent,starts_at) values
('91000000-0000-4000-8000-000000000008','91000000-0000-4000-8000-000000000003','Nike A',2010000001,'Nike',40,now()-interval '1 day'),
('91000000-0000-4000-8000-000000000009','91000000-0000-4000-8000-000000000004','Nike B',2010000001,'NIKE',20,now()-interval '1 day');
update public.sniper_watchlists set is_active=false where title='Mein Filter';
insert into public.sniper_listings(external_id,title,url,item_price,total_price,brand,condition,discovered_by_query_id)
select 'feed-ref-'||i,'Referenz','https://www.vinted.de/items/1',40,42,'Nike','Gut','91000000-0000-4000-8000-000000000005'::uuid
from generate_series(1,8) as i;
set local role service_role;
select lives_ok($$select public.record_sniper_listing_category('91000000-0000-4000-8000-000000000005',array(select external_id from public.sniper_listings))$$,'Kategorie durch Dienst ergaenzt');
select is(public.sniper_evaluate_watchlist_hits('91000000-0000-4000-8000-000000000005',false),0,'Einlesebestand bleibt stumm');
reset role;
insert into public.sniper_listings(external_id,title,url,item_price,total_price,brand,condition,discovered_by_query_id)
values ('feed-deal','Sneaker','https://www.vinted.de/items/2',10,12,' nike ','Gut','91000000-0000-4000-8000-000000000006');
select public.record_sniper_listing_category('91000000-0000-4000-8000-000000000006',array['feed-deal']);
set local role service_role;
select is(public.sniper_evaluate_watchlist_hits('91000000-0000-4000-8000-000000000006'),2,'Ein anderer Sammelauftrag erreicht beide passenden Arbeitsbereiche');
select is(public.sniper_evaluate_watchlist_hits('91000000-0000-4000-8000-000000000006'),0,'Keine Doppelmeldung bei Wiederholung');
reset role;
select is((select min(reference_scope) from public.sniper_watchlist_hits),'category_brand_condition','Vergleichsgruppe gespeichert');
select is((select count(*) from public.sniper_watchlist_hits),2::bigint,'Genau ein Treffer je Merkzettel');

set local role authenticated;
select is((select count(*) from public.sniper_watchlist_hits),1::bigint,'RLS zeigt nur Treffer des eigenen Arbeitsbereichs');
select is(jsonb_array_length(public.sniper_feed('91000000-0000-4000-8000-000000000003',null,true)->'items'),1,'Deal-Feed dupliziert Artikel nicht');
select is(jsonb_array_length(public.sniper_feed('91000000-0000-4000-8000-000000000003',null,false)->'items'),9,'Artikelansicht enthaelt auch stummen Bestand');
select throws_ok($$select public.sniper_feed('91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000009')$$,'42501',null,'Fremder Merkzettel im eigenen Feed gesperrt');
select throws_ok($$select public.delete_sniper_watchlist('91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000009')$$,'42501',null,'Fremder Merkzettel kann nicht geloescht werden');
select throws_ok($$select public.sniper_evaluate_watchlist_hits('91000000-0000-4000-8000-000000000006')$$,'42501',null,'Nutzer darf nicht bewerten');
select throws_ok($$select public.record_sniper_listing_category('91000000-0000-4000-8000-000000000006',array['feed-deal'])$$,'42501',null,'Nutzer darf Kategorieherkunft nicht aendern');
reset role;

-- Spaetere Kategoriekenntnis trotz vorheriger Textsuche. Erst fehlender
-- Massstab, dann dieselbe UUID mit bekanntem Bereich und genau zwei Treffern.
insert into public.sniper_listings(external_id,title,url,item_price,total_price,brand,condition,discovered_by_query_id)
values ('feed-unknown','Sneaker Text','https://www.vinted.de/items/3',12,14,'Nike','Gut','91000000-0000-4000-8000-000000000007');
select is(public.sniper_evaluate_watchlist_hits('91000000-0000-4000-8000-000000000007'),0,'Ohne Kategorie keine erfundene Bewertung');
select public.record_sniper_listing_category('91000000-0000-4000-8000-000000000006',array['feed-unknown']);
select is(public.sniper_evaluate_watchlist_hits('91000000-0000-4000-8000-000000000006'),2,'Spaeter gefundene Kategorie erlaubt Zuordnung unabhaengig von Erstentdeckung');
select is((select discovered_by_query_id from public.sniper_listings where external_id='feed-unknown'),'91000000-0000-4000-8000-000000000007'::uuid,'Erstentdeckung wird nicht umgeschrieben');

create temporary table first_page as select public.sniper_feed('91000000-0000-4000-8000-000000000003',null,false,null,null,2) as data;
select is(jsonb_array_length((select data->'items' from first_page)),2,'Seitengroesse eingehalten');
select is((public.sniper_feed('91000000-0000-4000-8000-000000000003',null,false,
    (select (data->'items'->1->>'first_seen_at')::timestamptz from first_page),
    (select (data->'items'->1->>'id')::uuid from first_page),2)->'items'->0->>'id') =
    (select data->'items'->1->>'id' from first_page),false,'UUID-Zeit-Cursor wiederholt Grenzartikel nicht');
update public.sniper_queries set is_active=false;
select is(public.sniper_feed('91000000-0000-4000-8000-000000000003')->>'covered','false','Fehlende Sammlung sichtbar');

select is((select public.sniper_watchlist_matches(watchlist,listing) from public.sniper_watchlists as watchlist cross join public.sniper_listings as listing where watchlist.title='Mein Filter' and listing.external_id='feed-deal'),true,'Kategorie, Marke, Zustand, Preis und Suchtext passen');
update public.sniper_watchlists set search_text='%Sneaker%' where title='Mein Filter';
select is((select public.sniper_watchlist_matches(watchlist,listing) from public.sniper_watchlists as watchlist cross join public.sniper_listings as listing where watchlist.title='Mein Filter' and listing.external_id='feed-deal'),false,'Suchtext wird woertlich und ohne SQL-Platzhalter behandelt');
update public.sniper_watchlists set search_text=null,price_from=11 where title='Mein Filter';
select is((select public.sniper_watchlist_matches(watchlist,listing) from public.sniper_watchlists as watchlist cross join public.sniper_listings as listing where watchlist.title='Mein Filter' and listing.external_id='feed-deal'),false,'Mindestpreis greift');
update public.sniper_watchlists set price_from=null,price_to=9 where title='Mein Filter';
select is((select public.sniper_watchlist_matches(watchlist,listing) from public.sniper_watchlists as watchlist cross join public.sniper_listings as listing where watchlist.title='Mein Filter' and listing.external_id='feed-deal'),false,'Hoechstpreis greift');
update public.sniper_watchlists set price_to=null,condition='Sehr gut' where title='Mein Filter';
select is((select public.sniper_watchlist_matches(watchlist,listing) from public.sniper_watchlists as watchlist cross join public.sniper_listings as listing where watchlist.title='Mein Filter' and listing.external_id='feed-deal'),false,'Zustand greift');
update public.sniper_watchlists set condition=null,brand='Adidas' where title='Mein Filter';
select is((select public.sniper_watchlist_matches(watchlist,listing) from public.sniper_watchlists as watchlist cross join public.sniper_listings as listing where watchlist.title='Mein Filter' and listing.external_id='feed-deal'),false,'Andere Marke bleibt ausgeschlossen');

set local role authenticated;
select lives_ok($$select public.delete_sniper_watchlist('91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000008')$$,'Eigenen Merkzettel loeschen');
select is((select count(*) from public.sniper_watchlist_hits),0::bigint,'Zugehoerige Treffer geloescht');
reset role;
select is((select count(*) from public.sniper_listings),10::bigint,'Gesammelter Bestand bleibt erhalten');
update public.sniper_listings set first_seen_at=now()-interval '31 days' where external_id in ('feed-deal','feed-unknown');
select is(public.sniper_purge_expired_listings(),2,'Aufbewahrung erfasst auch neue Merkzetteltreffer');
select is((select count(*) from public.sniper_watchlist_hits),0::bigint,'Ablauf loescht die verbleibenden Treffer mit');
select ok(not has_function_privilege('authenticated','public.create_sniper_subscription(uuid,text,integer,numeric,numeric,numeric)','execute'),'Alter Browser-Schreibweg fuer zentrale Auftraege ist gesperrt');
set local role anon;
select throws_ok($$select public.sniper_feed('91000000-0000-4000-8000-000000000003')$$,'42501',null,'Anonymer Feedzugriff gesperrt');
select throws_ok('select * from public.sniper_watchlists','42501',null,'Anonyme Merkzettel gesperrt');
reset role;
select * from finish();
rollback;
