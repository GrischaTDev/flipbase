\set ON_ERROR_STOP on
begin;
select no_plan();

insert into auth.users(id,email) values
 ('c4030000-0000-4000-8000-000000000001','personal-feed-a@example.test'),
 ('c4030000-0000-4000-8000-000000000002','personal-feed-b@example.test');
insert into public.workspaces(id,name) values
 ('c4030000-0000-4000-8000-000000000003','Persönliche Feeds'),
 ('c4030000-0000-4000-8000-000000000004','Anderer Arbeitsbereich');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('c4030000-0000-4000-8000-000000000003','c4030000-0000-4000-8000-000000000001','owner'),
 ('c4030000-0000-4000-8000-000000000003','c4030000-0000-4000-8000-000000000002','member'),
 ('c4030000-0000-4000-8000-000000000004','c4030000-0000-4000-8000-000000000002','owner');
insert into public.vinted_listing_categories(id,parent_id,title,full_title,path,position,is_leaf,tree_observed_at) values
 (904030001,null,'Festkleidung','Festkleidung','',901,false,now()),
 (904030002,null,'Mäntel','Mäntel','',902,false,now());
insert into public.platform_operators(user_id) values ('c4030000-0000-4000-8000-000000000002');

create function pg_temp.feed_workspace()
returns uuid language sql immutable as $$
 select 'c4030000-0000-4000-8000-000000000003'::uuid
$$;
create function pg_temp.feed_id(p_title text)
returns uuid language sql stable as $$
 select id from public.sniper_watchlists where workspace_id = pg_temp.feed_workspace() and title = p_title
$$;
create function pg_temp.source_id(p_key text)
returns uuid language sql stable as $$
 select id from public.sniper_queries where query_key = p_key
$$;
create function pg_temp.active_sources(p_pattern text default 'vinted-source|%')
returns integer language sql stable as $$
 select count(*)::integer from public.sniper_queries where query_key like p_pattern and is_active
$$;
create function pg_temp.feed_page(p_id uuid, p_title_query text default '', p_after_time timestamptz default null,
    p_before_time timestamptz default null, p_before_id uuid default null, p_limit integer default 100)
returns jsonb language sql stable as $$
 select public.sniper_feed_search(pg_temp.feed_workspace(),p_id,null,null,null,null,
    p_before_time,p_before_id,p_limit,p_title_query,null,null,'{}',null,p_after_time)
$$;

-- Quellschlüssel
select is(public.sniper_watchlist_source_keys(904030001,'women'),array['vinted-source|category|904030001'],
  'Mit Unterkategorie liest ein Feed aus der Kategoriequelle');
select is(public.sniper_watchlist_source_keys(1904,null,88),array['vinted-source|brand|88'],
  'Wurzelkategorie Damen mit Marke nutzt ausschließlich die gemeinsame Markenquelle');
select is(public.sniper_watchlist_source_keys(null,'men'),array[]::text[],
  'Ohne Unterkategorie und ohne Marke entsteht keine pauschale Hauptquelle');
select is(public.sniper_watchlist_source_keys(null,'men',88),array['vinted-source|brand|88'],
  'Ohne Unterkategorie mit Marke liest ein Feed ausschließlich aus der Markenquelle');
select is(public.sniper_watchlist_source_keys(null,'both'),array[]::text[],
  'Ohne Unterkategorie und ohne Marke entstehen für beide Zielgruppen keine Hauptquellen');
select is(public.sniper_watchlist_source_keys(null,'both',88),array['vinted-source|brand|88'],
  'Ohne Unterkategorie und für beide mit Marke nutzt ausschließlich die gemeinsame Markenquelle');

select set_config('request.jwt.claim.sub','c4030000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(jsonb_array_length(pg_temp.feed_page(null)->'items'),0,'Ohne Auswahl bleibt der Feed leer');
select lives_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Meine Jacken',
  904030001,' Ralph Lauren ','Jacke',8,20,'Gut',null,array['m'],88)$$,
  'Marke und Oberkategorie können ohne Admin-Bot gespeichert werden');
select is((select brand from public.sniper_watchlists where title='Meine Jacken'),'Ralph Lauren','Marke normalisiert');
select ok(not (select is_active from public.sniper_watchlists where title='Meine Jacken'),'Neuer Feed ist gespeichert und gestoppt');
select is(jsonb_array_length(pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'))->'items'),0,'Gestoppter Feed ist leer');
select is(public.sniper_feed_import_brand(pg_temp.feed_workspace(),88),'Ralph Lauren','Link kennt eine bereits persönlich hinterlegte Marke');
select throws_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Ohne Markenname',
  null,null,'Jacke',null,null,null,null,'{}',77)$$,'22023','Bitte wähle die Marke aus.',
  'Eine Marken-ID ohne Namen wird abgelehnt, weil der Katalog nur Namen liefert');
select throws_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Ohne Quelle',
  null,null,'Jacke',null,null,null,'men','{}',null)$$,'22023','Bitte wähle mindestens eine Unterkategorie oder eine Marke aus.',
  'Ein Feed ohne Unterkategorie und ohne Marke wird abgelehnt');
select throws_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Nur Wurzel',
  5,null,'Jacke',null,null,null,'men','{}',null)$$,'22023',null,
  'Eine Wurzelkategorie ohne Marke reicht ohne Hauptquellen nicht aus');
select throws_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Preis',
  null,null,'Jacke',20,8,null,null,'{}',null)$$,'22023',null,'Umgekehrte Preisgrenze wird abgelehnt');
select throws_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Unbekannt',
  904030099,null,'Jacke',null,null,null,null,'{}',null)$$,'22023',null,'Unbekannte Kategorie wird abgelehnt');
select throws_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Größe',
  null,null,'Jacke',null,null,null,null,array['falsch'],null)$$,'22023',null,'Unbekannte Größe wird abgelehnt');
select throws_ok($$select public.save_sniper_watchlist('c4030000-0000-4000-8000-000000000004',null,'Fremd',
  null,null,'Jacke',null,null,null,null,'{}',null)$$,'42501',null,'Anderer Arbeitsbereich bleibt gesperrt');
select throws_ok($$insert into public.sniper_watchlists(workspace_id,title) values(pg_temp.feed_workspace(),'Direkt')$$,
  '42501',null,'Kein Direktzugriff zum Schreiben');
select throws_ok('select * from public.sniper_listings','42501',null,'Keine globale Freigabe des Artikelbestands');
select throws_ok($$select public.sniper_feed_bots(pg_temp.feed_workspace())$$,'42501',null,'Alte gemeinsame Bot-Liste ist gesperrt');
select throws_ok($$select public.sniper_feed_capacity()$$,'42501',null,'Normale Nutzer sehen die Auslastung nicht');
select throws_ok($$select public.set_sniper_feed_settings(50,60)$$,'42501',null,'Normale Nutzer ändern die Grenze nicht');
select lives_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),pg_temp.feed_id('Meine Jacken'),true)$$,
  'Eigener Feed lässt sich starten');
select set_config('flipbase.test_feed_a',pg_temp.feed_id('Meine Jacken')::text,true);
reset role;
select is(pg_temp.active_sources(),1,'Der Start legt genau eine Quelle an');
select ok(exists(select 1 from public.sniper_queries where query_key='vinted-source|category|904030001'
  and is_active and catalog_id=904030001 and brand_id is null and search_text is null and price_from is null
  and price_to is null and poll_interval_ms=5000 and next_attempt_at is not null),
  'Die Kategoriequelle fragt nur die Kategorie ab und reiht sich im 5-Sekunden-Takt ein');

select set_config('request.jwt.claim.sub','c4030000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.sniper_watchlists),0,'Anderes Mitglied sieht keine fremden Feeds');
select throws_ok($$select pg_temp.feed_page(current_setting('flipbase.test_feed_a')::uuid)$$,
  '42501',null,'Fremder Feed ist auch beim Lesen anhand seiner ID gesperrt');
select throws_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),
  current_setting('flipbase.test_feed_a')::uuid,false)$$,'42501',null,'Fremder Feed kann nicht gestoppt werden');
select throws_ok($$select public.delete_sniper_watchlist(pg_temp.feed_workspace(),
  current_setting('flipbase.test_feed_a')::uuid)$$,'42501',null,'Fremder Feed kann nicht entfernt werden');
select lives_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Andere Marke',
  904030001,'Polo Club','  JACKE  ',8,20,'Sehr gut',null,array['s'],99)$$,
  'Anderes Mitglied speichert eine andere Marke in derselben Kategorie');
select lives_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),pg_temp.feed_id('Andere Marke'),true)$$,
  'Zweiter Feed lässt sich starten');
select set_config('flipbase.test_feed_b',pg_temp.feed_id('Andere Marke')::text,true);
reset role;
select is(pg_temp.active_sources(),1,'Andere Marke und andere Preise teilen dieselbe Kategoriequelle');
set local role authenticated;
select is((public.sniper_feed_capacity()->>'active_category_sources')::integer,1,
  'Die Administration sieht eine laufende Kategoriequelle');
select is(jsonb_array_length(public.sniper_feed_capacity()->'sources'),1,'Die Administration sieht die Quelle in der Liste');
select is((public.sniper_feed_capacity()->'sources'->0->>'feed_count')::integer,2,'Die Quelle versorgt zwei Feeds');
select ok(not has_table_privilege('authenticated','public.sniper_active_feed_sources','select'),
  'Nur der Dienst liest die abzurufenden Quellen');
reset role;
set local role service_role;
select is((select count(*)::integer from public.sniper_active_feed_sources),1,'Dienst liest genau die eine aktive Quelle');
reset role;

-- Simuliert abgeschlossene Sammlerläufe nach dem Start der Feeds.
update public.sniper_watchlists set started_at=now()-interval '20 minutes' where workspace_id=pg_temp.feed_workspace();
insert into public.sniper_listings(external_id,title,url,item_price,total_price,brand,size,condition,
    country_code,first_seen_at,is_initial_stock)
select external_id,title,'https://www.vinted.de/items/'||external_id,price,price+2,brand,size,condition,
    'FR',now()-age,seed
from (values
 ('40400001','Ralph Lauren Vintage Jacke','Ralph Lauren',10,'38 / M','Gut',interval '30 seconds',false),
 ('40400002','Ralph Lauren Jacke Rot','Ralph Lauren',20,'M','Gut',interval '1 minute',false),
 ('40400003','Zu alter Fund Jacke','Ralph Lauren',10,'M','Gut',interval '4 days',false),
 ('40400004','Paketbestand Jacke','Ralph Lauren',10,'M','Gut',interval '1 second',true),
 ('40400005','Falscher Preis Jacke','Ralph Lauren',21,'M','Gut',interval '2 seconds',false),
 ('40400006','Falsche Größe Jacke','Ralph Lauren',10,'XXL / 54','Gut',interval '3 seconds',false),
 ('40400007','Polo Jacke','Polo Club',10,'S','Sehr gut',interval '4 seconds',false),
 ('40400008','Fremde Sammlung Jacke','Ralph Lauren',10,'M','Gut',interval '5 seconds',false),
 ('40400009','Vor Aktivierung erkannt Jacke','Ralph Lauren',10,'M','Gut',interval '4 days',false),
 ('40400010','Ralph Lauren Hemd','Ralph Lauren',10,'M','Gut',interval '6 seconds',false)
) as data(external_id,title,brand,price,size,condition,age,seed);
insert into public.sniper_query_matches(query_id,listing_id,filter_revision,first_matched_at,is_seed)
select query.id, listing.id, query.filter_revision, listing.first_seen_at, listing.is_initial_stock
from public.sniper_queries query cross join public.sniper_listings listing
where query.id=pg_temp.source_id('vinted-source|category|904030001')
  and listing.external_id between '40400001' and '40400010' and listing.external_id <> '40400008';

select set_config('request.jwt.claim.sub','c4030000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(jsonb_array_length(pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'))->'items'),2,
  'Nur frische Treffer nach Start, Marke, Suchtext, Größe, Preis und Zustand');
select is(pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'),'VIN JAC')->'items'->0->>'title',
  'Ralph Lauren Vintage Jacke','Titelwörter werden ohne Beachtung der Reihenfolge als Präfix gefiltert');
select is(pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'))->'items'->0->>'country_code','FR',
  'Verkäuferland bleibt unabhängig vom deutschen Suchmarkt erhalten');
select is(jsonb_array_length(pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'),'',now()-interval '45 seconds')->'items'),1,
  'Inkrementelle Abfrage liefert nur die neueren Karten');
select is((with first as (select pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'),'',
  null,null,null,1)->'items'->0 as item) select pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'),'',
  null,(item->>'first_seen_at')::timestamptz,(item->>'id')::uuid,1)->'items'->0->>'title' from first),
  'Ralph Lauren Jacke Rot','Cursor innerhalb des Fensters wiederholt keinen Artikel');
select throws_ok($$select pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'),'',null,null,null,101)$$,
  '22023',null,'Übergröße einer Seite ist gesperrt');
select ok(not (pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'))->>'covered')::boolean,
  'Ohne erfolgreichen Abruf gilt der Feed nicht als abgedeckt');
reset role;
update public.sniper_queries set last_success_at=now(), coverage_status='caught_up'
where id=pg_temp.source_id('vinted-source|category|904030001');
set local role authenticated;
select ok((pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'))->>'covered')::boolean,
  'Frischer, aufgeholter Abruf deckt den Feed ab');
reset role;
update public.sniper_queries set coverage_status='limited'
where id=pg_temp.source_id('vinted-source|category|904030001');
set local role authenticated;
select ok(not (pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'))->>'covered')::boolean,
  'Eine nicht hinterherkommende Quelle gilt nicht als abgedeckt');
reset role;
update public.sniper_queries set coverage_status='caught_up', last_success_at=now()-interval '10 minutes'
where id=pg_temp.source_id('vinted-source|category|904030001');
set local role authenticated;
select ok(not (pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'))->>'covered')::boolean,
  'Ein veralteter Abruf gilt nicht als abgedeckt');
reset role;

insert into public.sniper_listings(external_id,title,url,item_price,total_price,brand,size,condition,first_seen_at)
select '4050'||lpad(i::text,4,'0'),'Neue Jacke '||i,'https://www.vinted.de/items/4050'||lpad(i::text,4,'0'),
    10,12,'Ralph Lauren','M','Gut',now()-i*interval '1 second'
from generate_series(1,105) as i;
insert into public.sniper_query_matches(query_id,listing_id,filter_revision,is_seed)
select query.id,listing.id,query.filter_revision,false
from public.sniper_queries query cross join public.sniper_listings listing
where query.id=pg_temp.source_id('vinted-source|category|904030001')
  and listing.external_id between '40500001' and '40500105';
set local role authenticated;
select is(jsonb_array_length(pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'))->'items'),100,'Der Feed hält höchstens 100 Karten');
select is(jsonb_array_length(pg_temp.feed_page(pg_temp.feed_id('Meine Jacken'),'Ralph')->'items'),2,
  'Die Titelsuche bleibt innerhalb der 100 neuesten Karten');
select lives_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),pg_temp.feed_id('Meine Jacken'),false)$$,
  'Erster Feed stoppt');
reset role;
select is(pg_temp.active_sources(),1,'Anderes Mitglied hält die gemeinsame Quelle aktiv');

select set_config('request.jwt.claim.sub','c4030000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(pg_temp.feed_page(pg_temp.feed_id('Andere Marke'))->'items'->0->>'title','Polo Jacke',
  'Gemeinsame Quelle bildet je Feed eigene Marke, Größe und Zustand ab');
reset role;

-- 100-Artikel-Schutz pro Feed & zentrale Kategorieprüfung (vinted_listing_categories)
insert into public.sniper_listings(external_id,title,url,item_price,total_price,brand,size,condition,first_seen_at)
values
 ('40550001','Polo Jacke 30 Min alt','https://www.vinted.de/items/40550001',12,14,'Polo Club','S','Sehr gut',now()-interval '30 minutes'),
 ('40550002','Fremde Marke 30 Min alt','https://www.vinted.de/items/40550002',12,14,'Unbekannt','S','Sehr gut',now()-interval '30 minutes');
insert into public.sniper_query_matches(query_id,listing_id,filter_revision,first_matched_at,is_seed)
select query.id, listing.id, query.filter_revision, listing.first_seen_at, false
from public.sniper_queries query cross join public.sniper_listings listing
where query.id=pg_temp.source_id('vinted-source|category|904030001')
  and listing.external_id in ('40550001','40550002');
set local role service_role;
select lives_ok('select public.sniper_purge_expired_listings()','Bereinigung schützt die Top-100-Treffer aktiver Feeds');
select is((public.complete_sniper_search_filter_run(pg_temp.source_id('vinted-source|category|904030001'),1,0,'[]')->>'accepted')::boolean,true,
  'Zentrale Katalog-Kategorie (vinted_listing_categories) wird im Sammler-Abschluss akzeptiert');
reset role;
select ok(exists(select 1 from public.sniper_listings where external_id='40550001'),
  'Ein 30 Minuten alter Treffer eines ruhigen Feeds überlebt die 15-Minuten-Bereinigung');
select ok(not exists(select 1 from public.sniper_listings where external_id='40550002'),
  'Ein nicht passender 30 Minuten alter Artikel wird nach 15 Minuten weiterhin bereinigt');
set local role authenticated;

-- Grenze für gleichzeitig laufende Kategoriequellen
select lives_ok($$select public.set_sniper_feed_settings(1,60)$$,'Administration setzt die Grenze auf eine Kategorie');
select is((select poll_interval_ms from public.sniper_queries
  where query_key='vinted-source|category|904030001'),60000,'Neuer Takt gilt sofort für laufende Kategoriequellen');
select lives_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Mäntel',
  904030002,null,null,null,null,null,'women','{}',null)$$,'Feed mit neuer Kategorie wird gespeichert');
select throws_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),pg_temp.feed_id('Mäntel'),true)$$,
  '54000',null,'Neue Kategorie über der Grenze wird abgelehnt');
select lives_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),pg_temp.feed_id('Andere Marke'),'Andere Marke',
  904030002,'Polo Club','Jacke',8,20,'Sehr gut',null,array['s'],99)$$,
  'Wer seine einzige Kategorie wechselt, gibt den alten Platz frei und bleibt unter der Grenze');
reset role;
select is(pg_temp.active_sources('vinted-source|category|%'),1,'Nach dem Wechsel läuft nur die neue Kategorie');
set local role authenticated;
select lives_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),pg_temp.feed_id('Andere Marke'),'Andere Marke',
  904030001,'Polo Club','Jacke',8,20,'Sehr gut',null,array['s'],99)$$,'Der Feed wechselt zurück');
select lives_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),null,'Herren ohne Kategorie',
  null,'Polo Club',null,null,null,null,'men','{}',99)$$,'Marken-Feed ohne Unterkategorie wird gespeichert');
select lives_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),pg_temp.feed_id('Herren ohne Kategorie'),true)$$,
  'Marken-Feed zählt nicht gegen die Kategoriegrenze');
reset role;
select ok(not exists(select 1 from public.sniper_queries where query_key='vinted-source|main|5' and is_active),
  'Marken-Feed ohne Unterkategorie startet keine pauschale Hauptquelle mehr');
select ok(exists(select 1 from public.sniper_queries where query_key='vinted-source|brand|99' and is_active
  and catalog_id is null and brand_id=99 and brand_ids=array[99] and brand_names=array['Polo Club']
  and poll_interval_ms=60000),'Marken-Feed ohne Unterkategorie startet ausschließlich die gemeinsame Markenquelle');
set local role authenticated;
select is((public.sniper_feed_capacity()->>'active_brand_sources')::integer,1,
  'Die Administration sieht eine laufende Markenquelle');
select lives_ok($$select public.set_sniper_feed_settings(10,90)$$,'Administration hebt die Grenze wieder an');
reset role;
select is((select poll_interval_ms from public.sniper_queries
  where query_key='vinted-source|brand|99'),90000,'Neuer Takt gilt auch sofort für laufende Markenquellen');
-- Fund aus reiner Markenquelle (ohne Katalogkennung) erscheint im Marken-Feed.
update public.sniper_watchlists set started_at=now()-interval '20 minutes'
where workspace_id=pg_temp.feed_workspace() and title='Herren ohne Kategorie';
insert into public.sniper_listings(external_id,title,url,item_price,total_price,brand,size,condition,first_seen_at)
values ('40600001','Polo Club Vorschau','https://www.vinted.de/items/40600001',15,17,'Polo Club','M','Gut',now()-interval '5 seconds');
insert into public.sniper_query_matches(query_id,listing_id,filter_revision,is_seed)
select query.id, listing.id, query.filter_revision, false
from public.sniper_queries query cross join public.sniper_listings listing
where query.id=pg_temp.source_id('vinted-source|brand|99') and listing.external_id='40600001';
set local role authenticated;
select is(pg_temp.feed_page(pg_temp.feed_id('Herren ohne Kategorie'))->'items'->0->>'title',
  'Polo Club Vorschau','Direkte Markenquellen-Funde erscheinen sofort im Marken-Feed');
select lives_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),pg_temp.feed_id('Mäntel'),true)$$,
  'Nach dem Anheben startet die neue Kategorie');
select lives_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),pg_temp.feed_id('Mäntel'),false)$$,
  'Der Kategorie-Feed stoppt');
select lives_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),pg_temp.feed_id('Herren ohne Kategorie'),false)$$,
  'Der Herren-Feed stoppt');
reset role;
select ok(not exists(select 1 from public.sniper_queries where query_key in ('vinted-source|main|5',
  'vinted-source|brand|99','vinted-source|category|904030002') and is_active),'Quellen ohne Bedarf werden beendet');

set local role service_role;
select lives_ok($$select public.sniper_notify_feed_updates(pg_temp.source_id('vinted-source|category|904030001'))$$,
  'Dienst benachrichtigt die Arbeitsbereiche einer Quelle');
reset role;
set local role authenticated;
select throws_ok($$select public.sniper_notify_feed_updates(pg_temp.source_id('vinted-source|category|904030001'))$$,
  '42501',null,'Web-App darf keine Feed-Hinweise auslösen');
select lives_ok($$select public.save_sniper_watchlist(pg_temp.feed_workspace(),pg_temp.feed_id('Andere Marke'),'Meine Schuhe',
  904030001,'Polo Club','Schuh',8,20,'Sehr gut',null,array['s'],99)$$,'Aktiver Feed wechselt seine Suchbedingungen');
select is(jsonb_array_length(pg_temp.feed_page(pg_temp.feed_id('Meine Schuhe'))->'items'),0,
  'Der umgestellte Feed enthält keine alten Karten mehr');
reset role;
select is(pg_temp.active_sources(),1,'Die Kategoriequelle läuft für den umgestellten Feed weiter');
update public.workspaces set archived_at=now() where id=pg_temp.feed_workspace();
select is(pg_temp.active_sources(),0,'Archivieren beendet die letzte Quelle');
set local role authenticated;
select throws_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),
  current_setting('flipbase.test_feed_b')::uuid,true)$$,'42501',null,'Archivierte Arbeitsbereiche können keinen Feed starten');
reset role;
update public.workspaces set archived_at=null where id=pg_temp.feed_workspace();
set local role authenticated;
select lives_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),
  current_setting('flipbase.test_feed_b')::uuid,true)$$,'Nach Wiederherstellung kann der Besitzer den Feed erneut starten');
reset role;
delete from public.workspace_members
where workspace_id=pg_temp.feed_workspace() and user_id='c4030000-0000-4000-8000-000000000002';
select ok(not (select is_active from public.sniper_watchlists where id=current_setting('flipbase.test_feed_b')::uuid),
  'Entfernte Mitglieder verlieren ihre laufenden Feeds');
select is(pg_temp.active_sources(),0,'Mit dem letzten Feed endet auch die Quelle');
insert into public.workspace_members(workspace_id,user_id,role)
values (pg_temp.feed_workspace(),'c4030000-0000-4000-8000-000000000002','member');
set local role authenticated;
select lives_ok($$select public.set_sniper_watchlist_active(pg_temp.feed_workspace(),
  current_setting('flipbase.test_feed_b')::uuid,true)$$,'Wieder aufgenommenes Mitglied startet den Feed erneut');
reset role;
insert into public.workspace_licenses(workspace_id,access_source,status,granted_days,starts_at,ends_at)
values(pg_temp.feed_workspace(),'beta','active',1,now()-interval '2 days',now()-interval '1 day');
set local role service_role;
select is((select count(*)::integer from public.sniper_active_feed_sources),0,
  'Abgelaufene Zugänge erzeugen sofort keine abrufbaren Quellen mehr');
select lives_ok('select public.sniper_purge_expired_listings()','Bereinigung beendet abgelaufene Feeds');
reset role;
select is((select count(*)::integer from public.sniper_watchlists where is_active),0,
  'Abgelaufene Feeds wurden gestoppt');
select is(pg_temp.active_sources(),0,'Bereinigung beendet die Quellen abgelaufener Feeds');
update public.sniper_queries set updated_at=now()-interval '2 days'
where query_key in ('vinted-source|category|904030002','vinted-source|brand|99');
set local role service_role;
select lives_ok('select public.sniper_purge_expired_listings()','Bereinigung läuft erneut');
reset role;
select ok(pg_temp.source_id('vinted-source|category|904030002') is null,
  'Ruhende Kategoriequellen ohne Bedarf werden nach einem Tag gelöscht');
select ok(pg_temp.source_id('vinted-source|brand|99') is null,
  'Ruhende Markenquellen ohne Bedarf werden nach einem Tag gelöscht');
set local role anon;
select throws_ok($$select pg_temp.feed_page(null)$$,'42501',null,'Anonyme erhalten keinen Feed');
reset role;
select * from finish();
rollback;
