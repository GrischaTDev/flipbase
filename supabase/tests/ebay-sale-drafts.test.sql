\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('47500000-0000-4000-8000-000000000001','authenticated','authenticated','ebay-import-one@example.test','{}','{}'),
 ('47500000-0000-4000-8000-000000000002','authenticated','authenticated','ebay-import-two@example.test','{}','{}'),
 ('47500000-0000-4000-8000-000000000003','authenticated','authenticated','ebay-import-other@example.test','{}','{}');
insert into public.workspaces(id,name) values
 ('47500000-0000-4000-8000-000000000011','eBay import A'),
 ('47500000-0000-4000-8000-000000000012','eBay import B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000001','member'),
 ('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000002','owner'),
 ('47500000-0000-4000-8000-000000000012','47500000-0000-4000-8000-000000000003','owner');
insert into public.ebay_connections(id,workspace_id,user_id,environment,status,external_account_id,authorization_version,operation_id,operation_expires_at) values
 ('47500000-0000-4000-8000-000000000021','47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000001','production','connected','seller-a',1,'47500000-0000-4000-8000-000000000031',clock_timestamp()+interval '90 seconds'),
 ('47500000-0000-4000-8000-000000000022','47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000002','production','connected','seller-b',1,null,null);
insert into public.catalog_products(id,workspace_id,title,tracking_mode) values
 ('47500000-0000-4000-8000-000000000041','47500000-0000-4000-8000-000000000011','Importartikel','quantity'),
 ('47500000-0000-4000-8000-000000000042','47500000-0000-4000-8000-000000000012','Fremder Artikel','quantity');
select set_config('request.jwt.claims','{"sub":"47500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.purchases(id,workspace_id,type,title) values ('47500000-0000-4000-8000-000000000051','47500000-0000-4000-8000-000000000011','single','Importbestand');
insert into public.purchase_lines(id,workspace_id,purchase_id,catalog_product_id,title_snapshot,line_kind,ordered_quantity,unit_purchase_price,line_total) values
 ('47500000-0000-4000-8000-000000000052','47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000051','47500000-0000-4000-8000-000000000041','Importartikel','quantity',8,1,8);
select public.receive_purchase_lines('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000051','[{"purchase_line_id":"47500000-0000-4000-8000-000000000052","received_quantity":8,"received_at":"2026-10-01T12:00:00Z"}]');
select public.finalize_purchase_costing('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000051');

create temporary table import_test(source jsonb, assignments jsonb, costs jsonb, display_id uuid, ready_id uuid, result jsonb);
grant select, update on import_test to authenticated, service_role;
insert into import_test(source,assignments,costs) values (
 '{"orderId":"order-1","createdAt":"2026-09-30T22:30:00Z","lastModifiedAt":"2026-10-01T10:00:00Z","observedAt":"2026-10-01T12:00:00Z","paymentStatus":"PAID","cancelStatus":"NONE_REQUESTED","fulfillmentStatus":"NOT_STARTED","currency":"EUR","totalCents":1450,"shippingRevenueCents":450,"lines":[{"lineItemId":"line-1","listingId":"123","variationId":null,"sku":null,"title":"Importartikel","quantity":3,"goodsCents":1000,"hasRefund":false,"variationAspects":[]}],"blockers":[]}',
 '[{"lineItemId":"line-1","target":{"catalogProductId":"47500000-0000-4000-8000-000000000041"}}]',
 '{"platformFeeCents":0,"shippingCostCents":300,"shippingMode":"seller_arranged","additionalCosts":[]}');

insert into public.ebay_article_mappings(workspace_id,environment,external_account_id,listing_id,catalog_product_id)
values ('47500000-0000-4000-8000-000000000011','production','seller-a','123','47500000-0000-4000-8000-000000000041');
insert into public.ebay_cached_orders(workspace_id,environment,external_account_id,order_id,source_key,source,created_at,auto_prepare)
select '47500000-0000-4000-8000-000000000011','production','seller-a','order-1',repeat('a',64),source,now(),true from import_test;
select is((select sum(quantity)::int from public.stock_movements where workspace_id='47500000-0000-4000-8000-000000000011' and reason='reservation'),3,'Neuer zugeordneter Verkauf reserviert sofort drei Stück');
set local role authenticated;
select throws_ok($$select public.record_sale('47500000-0000-4000-8000-000000000011','{"platform":"ebay","sale_date":"2026-10-23"}','[{"catalog_product_id":"47500000-0000-4000-8000-000000000041","quantity":6,"unit_sale_price":10}]')$$,'P0001',null,'Manueller Verkauf darf drei reservierte Stück nicht verbrauchen');
reset role;
select is((select state from public.ebay_sale_drafts where source_key=repeat('a',64)),'needs_costs','Unbekannte Kosten bleiben offen trotz Reservierung');
select is((select costs->'shippingCostCents' from public.ebay_sale_drafts where source_key=repeat('a',64)),'null'::jsonb,'Käuferporto ist keine eigene Ausgabe');
update public.ebay_cached_orders set observed_at=clock_timestamp() where source_key=repeat('a',64);
select is((select count(*)::int from public.ebay_sale_drafts),1,'Doppelabruf erzeugt keinen zweiten Entwurf');
select is((select sum(quantity)::int from public.ebay_sale_reservations where released_at is null),3,'Doppelabruf reserviert nicht doppelt');
set local role service_role;
update import_test set ready_id=(public.ebay_store_order_snapshot('47500000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000021',1,'47500000-0000-4000-8000-000000000031',repeat('a',64),repeat('b',64),source,true)->>'snapshotId')::uuid;
set local role authenticated;
update import_test set result=public.ebay_record_order_sale('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,assignments,costs);
reset role;
select is((select count(*)::int from public.ebay_sale_reservations where released_at is null),0,'Buchung wandelt eigene Reservierung um');
select is((select state from public.ebay_sale_drafts where source_key=repeat('a',64)),'booked','Entwurf ist dauerhaft abgeschlossen');
select is((select sum(remaining_quantity)::int from public.stock_lots where workspace_id='47500000-0000-4000-8000-000000000011'),5,'Reservierung und Buchung erzeugen genau einen Abgang');
select has_table('public','ebay_sale_notifications','Neue Verkäufe besitzen eine dauerhafte Glockenquelle');

create function pg_temp.add_order(p_id text,p_changes jsonb default '{}'::jsonb,p_auto boolean default true) returns bigint language plpgsql as $$
declare v_id bigint; begin
 insert into public.ebay_cached_orders(workspace_id,environment,external_account_id,order_id,source_key,source,created_at,auto_prepare)
 select '47500000-0000-4000-8000-000000000011','production','seller-a',p_id,encode(extensions.digest(p_id,'sha256'),'hex'),source||jsonb_build_object('orderId',p_id)||p_changes,now(),p_auto from import_test returning id into v_id;
 return v_id;
end; $$;
create function pg_temp.stage(p_id text) returns uuid language sql as $$
 select (public.ebay_store_order_snapshot('47500000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000021',1,'47500000-0000-4000-8000-000000000031',o.source_key,repeat('b',64),o.source,true)->>'snapshotId')::uuid from public.ebay_cached_orders o where order_id=p_id;
$$;
select pg_temp.add_order('historical','{}',false);
select is((select count(*)::int from public.ebay_sale_drafts where order_id='historical'),0,'Historische bezahlte Bestellung bleibt ohne Entwurf');
select pg_temp.stage('historical');
select is((select count(*)::int from public.ebay_sale_drafts where order_id='historical'),0,'Historische Prüfung reserviert auch mit kompletter Inseratzuordnung nichts');
select is((select count(*)::int from public.ebay_sale_notifications where order_id='historical'),0,'Historische Quelle hält die Glocke still');
select pg_temp.add_order('package',jsonb_build_object('lines',(select (source->'lines')||jsonb_build_array((source->'lines'->0)||'{"lineItemId":"line-2"}') from import_test)));
select is((select state from public.ebay_sale_drafts where order_id='package'),'needs_stock','Doppelte Paketziele werden gemeinsam auf sechs Stück geprüft');
select is((select count(*)::int from public.ebay_sale_reservations where released_at is null),0,'Paketfehler hinterlässt keine Teilreservierung');
select pg_temp.add_order('refund');
select is((select sum(quantity)::int from public.ebay_sale_reservations where released_at is null),3,'Zweiter Auftrag besitzt eigene Reservierung');
update public.ebay_cached_orders set source=source||'{"blockers":["refund_or_unknown"]}' where order_id='refund';
select is((select state from public.ebay_sale_drafts where order_id='refund'),'blocked','Erstattung verlangt Klärung');
select is((select sum(quantity)::int from public.ebay_sale_reservations where released_at is null),3,'Erstattung ist kein Wareneingang und behält Reservierung');
select pg_temp.add_order('competitor');
select is((select state from public.ebay_sale_drafts where order_id='competitor'),'needs_stock','Fremde Reservierung ist nicht verfügbar');
select lives_ok($$update public.ebay_cached_orders set source=source||'{"cancelStatus":"CANCELED","blockers":["cancelled"],"lines":[]}' where order_id='refund'$$,'Storno mit entfallenen Quellpositionen gibt die bisherige eigene Reservierung frei');
select is((select count(*)::int from public.ebay_sale_reservations where released_at is null),0,'Eindeutiges Storno gibt nur eigene Reservierung frei');
update public.ebay_cached_orders set observed_at=clock_timestamp() where order_id='refund';
select is((select sum(quantity)::int from public.stock_movements where reason='reservation_release'),6,'Wiederholtes Storno gibt nicht erneut frei');
update public.ebay_cached_orders set source=source||'{"blockers":["refund_or_unknown"]}' where order_id='order-1';
select is((select state from public.ebay_sale_drafts where order_id='order-1'),'booked','Gebuchter Beleg bleibt bei Erstattung gebucht');
select is((select sum(remaining_quantity)::int from public.stock_lots where workspace_id='47500000-0000-4000-8000-000000000011'),5,'Keine automatische Wiedereinlagerung gebuchter Ware');
update public.ebay_cached_orders set observed_at=clock_timestamp() where order_id='competitor';
select is((select state from public.ebay_sale_drafts where order_id='competitor'),'needs_costs','Freier Bestand lässt erneuten Reservierungsversuch zu');
update import_test set ready_id=pg_temp.stage('competitor');
set local role authenticated;
select throws_ok($$select public.ebay_record_order_sale('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,assignments,costs||'{"shippingCostCents":null}') from import_test$$,'22023',null,'Unbekannte eigene Versandkosten erlauben keine Buchung');
reset role;
select is((select sum(quantity)::int from public.ebay_sale_reservations where released_at is null),3,'Fehlerhafte Buchung erhält Reservierung');
set local role authenticated;
select lives_ok($$select public.ebay_save_sale_draft('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,assignments,costs||'{"shippingCostCents":0}') from import_test$$,'Bekannte echte Nullkosten sind speicherbar');
reset role;
select is((select state from public.ebay_sale_drafts where order_id='competitor'),'ready_for_review','Vollständige bekannte Kosten führen zur Prüfung');
select is((select public.ebay_store_order_snapshot('47500000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000021',1,'47500000-0000-4000-8000-000000000031',source_key,repeat('b',64),source,false)#>>'{draft,costs,shippingCostCents}' from public.ebay_cached_orders where order_id='competitor'),'0','Erneute Prüfung enthält gespeicherte Nullkosten');
create function pg_temp.reject_sale_write() returns trigger language plpgsql as $$begin raise exception 'Simulierter Buchungsfehler' using errcode='P2002'; end;$$;
create trigger draft_test_sale_failure before insert on public.sales for each row execute function pg_temp.reject_sale_write();
set local role authenticated;
select throws_ok($$select public.ebay_record_order_sale('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,assignments,costs) from import_test$$,'P2002',null,'Fehler nach eigener Freigabe rollt vollständige Buchung zurück');
reset role;
drop trigger draft_test_sale_failure on public.sales;
select is((select sum(quantity)::int from public.ebay_sale_reservations where released_at is null),3,'Rollback stellt eigene Reservierung wieder her');
set local role authenticated;
select throws_ok($$select public.remove_article_stock('47500000-0000-4000-8000-000000000011','catalog','47500000-0000-4000-8000-000000000041',1,'loss','Test','draft-removal-1')$$,'22023','Hebe zuerst die Reservierung dieses Artikels auf.','Bestehender Bestandsabgang respektiert Reservierungsbewegungen');
reset role;
select ok(not has_table_privilege('authenticated','public.ebay_sale_drafts' ,'insert'),'Browser kann keinen Entwurf erfinden');
select ok(not has_table_privilege('authenticated','public.ebay_sale_reservations','update'),'Browser kann keinen Besitzer freigeben');
set local role authenticated;
select throws_ok($$update public.stock_lots set remaining_quantity=1 where workspace_id='47500000-0000-4000-8000-000000000011'$$,'42501',null,'Direkte Mengenänderung darf eigene Reservierung nicht unterlaufen');
reset role;
-- Persönliche Glocke, stabile Kennung und unabhängiger Verlauf.
select is((select count(*)::int from public.ebay_sale_notifications where order_id='order-1'),1,'Eine Glockenmeldung trotz Doppelabruf und Buchung');
set local role authenticated;
select ok(jsonb_array_length(public.ebay_sale_notifications_read('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021'))>0,'Persönlich verbundenes Konto sieht Glocke');
select set_config('request.jwt.claims','{"sub":"47500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(jsonb_array_length(public.ebay_sale_notifications_read('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000022')),0,'Workspace-Inhaber mit anderem Konto sieht keine private Glocke');
select is((select count(*)::int from public.ebay_sale_drafts),0,'Anderes Konto sieht keine Entwurfsquelle');
reset role;
update public.ebay_connections set external_account_id='seller-a' where id='47500000-0000-4000-8000-000000000022';
set local role authenticated;
select ok(jsonb_array_length(public.ebay_sale_notifications_read('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000022'))>0,'Persönliche zweite Verbindung sieht dieselbe Glockenquelle');
reset role;
select public.ebay_sale_notification_update('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000022',(select id from public.ebay_sale_notifications where order_id='order-1'),'dismiss');
select set_config('request.jwt.claims','{"sub":"47500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(exists(select 1 from jsonb_array_elements(public.ebay_sale_notifications_read('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021')) e where e->>'orderId'='order-1'),'Löschen des Verlaufs betrifft nur den handelnden Nutzer');
update public.ebay_connections set status='disconnected' where id='47500000-0000-4000-8000-000000000021';
set local role authenticated;
select throws_ok($$select public.ebay_sale_notifications_read('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021')$$,'42501',null,'Kontotrennung sperrt private Glocke');
select is(jsonb_array_length(public.ebay_reservations_read('47500000-0000-4000-8000-000000000011')),1,'Interne Bestandsklärung bleibt nach Kontotrennung erreichbar');
reset role;
select public.ebay_reservation_resolve('47500000-0000-4000-8000-000000000011',(select id from public.ebay_sale_drafts where order_id='competitor'),'Ware tatsächlich wieder verfügbar');
select is((select count(*)::int from public.ebay_sale_reservations where released_at is null),0,'Bewusste interne Klärung gibt eigene Reservierung frei');
update public.ebay_cached_orders set observed_at=clock_timestamp() where order_id='competitor';
select is((select count(*)::int from public.ebay_sale_reservations where released_at is null),0,'Bewusst verworfener Entwurf wird nicht erneut reserviert');
update public.ebay_connections set status='connected' where id='47500000-0000-4000-8000-000000000021';
-- Einzelstückbesitzer, fremde manuelle Reservierung und Altverkauf mit bereits verkauftem Artikel.
insert into public.inventory_items(id,workspace_id,title,status,allocated_purchase_cost) values
 ('47500000-0000-4000-8000-000000000061','47500000-0000-4000-8000-000000000011','Eigenes Einzelstück','ready',1),
 ('47500000-0000-4000-8000-000000000062','47500000-0000-4000-8000-000000000011','Fremd reserviert','reserved',1);
insert into public.ebay_article_mappings(workspace_id,environment,external_account_id,listing_id,inventory_item_id) values
 ('47500000-0000-4000-8000-000000000011','production','seller-a','single','47500000-0000-4000-8000-000000000061'),
 ('47500000-0000-4000-8000-000000000011','production','seller-a','manual','47500000-0000-4000-8000-000000000062');
select pg_temp.add_order('single',jsonb_build_object('totalCents',1450,'lines',(select jsonb_build_array((source->'lines'->0)||'{"listingId":"single","quantity":1}') from import_test)));
select is((select status from public.inventory_items where id='47500000-0000-4000-8000-000000000061'),'reserved','Konkretes Einzelstück wird reserviert');
set local role authenticated;
select throws_ok($$update public.inventory_items set status='ready' where id='47500000-0000-4000-8000-000000000061'$$,'22023',null,'Normale Artikelbearbeitung darf eigenen Besitzer nicht freigeben');
reset role;
select pg_temp.add_order('manual',jsonb_build_object('lines',(select jsonb_build_array((source->'lines'->0)||'{"listingId":"manual","quantity":1}') from import_test)));
select is((select state from public.ebay_sale_drafts where order_id='manual'),'needs_stock','Fremde manuelle Einzelstückreservierung wird nicht übernommen');
update public.ebay_cached_orders set source=source||'{"cancelStatus":"CANCELED"}' where order_id='manual';
select is((select status from public.inventory_items where id='47500000-0000-4000-8000-000000000062'),'reserved','Storno löst keine fremde Reservierung');
update import_test set ready_id=pg_temp.stage('single');
set local role authenticated;
update import_test set result=public.ebay_record_order_sale('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,'[{"lineItemId":"line-1","target":{"inventoryItemId":"47500000-0000-4000-8000-000000000061"}}]',costs);
reset role;
select is((select status from public.inventory_items where id='47500000-0000-4000-8000-000000000061'),'sold','Eigene Reservierung wird zu endgültigem Einzelstückverkauf');
-- Vollständiger manuell erfasster Katalogverkauf mit abweichenden historischen Kosten.
insert into public.purchases(id,workspace_id,type,title) values ('47500000-0000-4000-8000-000000000071','47500000-0000-4000-8000-000000000011','single','Weiterer Bestand');
insert into public.purchase_lines(id,workspace_id,purchase_id,catalog_product_id,title_snapshot,line_kind,ordered_quantity,unit_purchase_price,line_total) values
 ('47500000-0000-4000-8000-000000000072','47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000071','47500000-0000-4000-8000-000000000041','Importartikel','quantity',6,1,6);
select public.receive_purchase_lines('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000071','[{"purchase_line_id":"47500000-0000-4000-8000-000000000072","received_quantity":6,"received_at":"2026-10-23T12:00:00Z"}]');
select public.finalize_purchase_costing('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000071');

set local role authenticated;
update import_test set result=public.record_sale('47500000-0000-4000-8000-000000000011','{"platform":"ebay","sale_date":"2026-10-23","platform_fee":7,"shipping_cost":9}','[{"catalog_product_id":"47500000-0000-4000-8000-000000000041","quantity":3,"unit_sale_price":10}]');
reset role;
select pg_temp.add_order('existing');
select is((select sum(quantity)::int from public.ebay_sale_reservations where released_at is null),3,'Neue Quelle zu Altverkauf reserviert zunächst ihre eigene Menge');
update import_test set ready_id=pg_temp.stage('existing');
update public.sales set returned_at=clock_timestamp() where id=(select (result#>>'{sale,id}')::uuid from import_test);
set local role authenticated;
select is(jsonb_array_length(public.ebay_existing_sales_read('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021')),0,'Zurückgenommene Verkäufe werden nicht angeboten');
select throws_ok($$select public.ebay_link_existing_sale('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,(result#>>'{sale,id}')::uuid,assignments,'Zurückgenommen') from import_test$$,'22023',null,'Zurückgenommener Verkauf ist keine gültige Zuordnung');
reset role;
update public.sales set returned_at=null,voided_at=clock_timestamp(),voided_by='47500000-0000-4000-8000-000000000001',void_reason='Fehlbuchung' where id=(select (result#>>'{sale,id}')::uuid from import_test);
set local role authenticated;
select is(jsonb_array_length(public.ebay_existing_sales_read('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021')),0,'Stornierte Fehlbuchungen werden nicht angeboten');
reset role;
update public.sales set voided_at=null,voided_by=null,void_reason=null where id=(select (result#>>'{sale,id}')::uuid from import_test);
set local role authenticated;
select ok(jsonb_array_length(public.ebay_existing_sales_read('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021'))>0,'Bestehender Verkauf bleibt mit seinen verkauften Positionen auswählbar');
select throws_ok($$select public.ebay_link_existing_sale('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,(result#>>'{sale,id}')::uuid,'[{"lineItemId":"line-1","target":{"inventoryItemId":"47500000-0000-4000-8000-000000000061"}}]','Altverkauf') from import_test$$,'22023',null,'Andere Verkaufspositionen passen nicht vollständig');
select is((select public.ebay_link_existing_sale('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,(result#>>'{sale,id}')::uuid,assignments,'Abweichende Preise und Kosten geprüft')->>'status' from import_test),'recorded_elsewhere','Vollständiger Altverkauf wird ohne neue Buchung zugeordnet');
reset role;
select is((select platform_fee from public.sales where id=(select (result#>>'{sale,id}')::uuid from import_test)),7::numeric,'Historisch bestätigte Gebühren bleiben erhalten');
select is((select shipping_cost from public.sales where id=(select (result#>>'{sale,id}')::uuid from import_test)),9::numeric,'Historisch bestätigte Versandkosten bleiben erhalten');
select is((select sum(remaining_quantity)::int from public.stock_lots where workspace_id='47500000-0000-4000-8000-000000000011'),8,'Altverkaufszuordnung erzeugt keinen weiteren Abgang');
select is((select count(*)::int from public.ebay_sale_reservations where released_at is null),0,'Altverkaufszuordnung gibt ausschließlich eigene offene Reservierung frei');
select is((select state from public.ebay_sale_drafts where order_id='existing'),'linked_existing','Altverkaufszuordnung schließt dauerhaften Entwurf');
select pg_temp.add_order('existing-again','{}',false);
update import_test set ready_id=pg_temp.stage('existing-again');
set local role authenticated;
select throws_ok($$select public.ebay_link_existing_sale('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,(result#>>'{sale,id}')::uuid,assignments,'Zweite Zuordnung') from import_test$$,'22023',null,'Ein vollständiger Verkauf darf nicht zwei Quellen erhalten');
reset role;
update import_test set ready_id=pg_temp.stage('historical');
update public.ebay_cached_orders set observed_at=clock_timestamp(),source=source||'{"cancelStatus":"CANCELED"}' where order_id='historical';
set local role authenticated;
select throws_ok($$select public.ebay_save_sale_draft('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,assignments,costs) from import_test$$,'22023',null,'Alter Prüfstand darf neu erkanntes Storno nicht überschreiben');
reset role;
insert into public.inventory_items(id,workspace_id,title,status,allocated_purchase_cost) values ('47500000-0000-4000-8000-000000000063','47500000-0000-4000-8000-000000000011','Historisch verkauftes Einzelstück','ready',2);
set local role authenticated;
update import_test set result=public.record_sale('47500000-0000-4000-8000-000000000011','{"platform":"ebay","sale_date":"2026-10-22"}','[{"inventory_item_id":"47500000-0000-4000-8000-000000000063","quantity":1,"unit_sale_price":10}]');
reset role;
select pg_temp.add_order('sold-single',jsonb_build_object('lines',(select jsonb_build_array((source->'lines'->0)||'{"quantity":1}') from import_test)),false);
update import_test set ready_id=pg_temp.stage('sold-single');
set local role authenticated;
select is((select public.ebay_link_existing_sale('47500000-0000-4000-8000-000000000011','47500000-0000-4000-8000-000000000021',ready_id,(result#>>'{sale,id}')::uuid,'[{"lineItemId":"line-1","target":{"inventoryItemId":"47500000-0000-4000-8000-000000000063"}}]','Historischer Einzelstückverkauf')->>'status' from import_test),'recorded_elsewhere','Bereits verkauftes Einzelstück wird anhand seines vollständigen Verkaufs zugeordnet');
reset role;
select is((select status from public.inventory_items where id='47500000-0000-4000-8000-000000000063'),'sold','Altzuordnung lagert verkauftes Einzelstück nicht wieder ein');
select pg_temp.add_order('late-mapping'  ,jsonb_build_object('lines',(select jsonb_build_array((source->'lines'->0)||'{"listingId":"late","quantity":1}') from import_test)));
select is((select count(*)::int from public.ebay_sale_drafts where order_id='late-mapping'),0,'Neue unzugeordnete Quelle bleibt nachbearbeitbar ohne Entwurf');
insert into public.ebay_article_mappings(workspace_id,environment,external_account_id,listing_id,catalog_product_id) values
 ('47500000-0000-4000-8000-000000000011','production','seller-a','late','47500000-0000-4000-8000-000000000041');
select is((select state from public.ebay_sale_drafts where order_id='late-mapping'),'needs_costs','Nachträgliche vollständige Inseratzuordnung bereitet neue Quelle sofort vor');
select public.ebay_reservation_resolve('47500000-0000-4000-8000-000000000011',id,'Testklärung') from public.ebay_sale_drafts where order_id='late-mapping';
insert into public.catalog_products(id,workspace_id,title,tracking_mode,archived_at) values ('47500000-0000-4000-8000-000000000081','47500000-0000-4000-8000-000000000011','Archiviertes Ziel','quantity',clock_timestamp());
insert into public.ebay_article_mappings(workspace_id,environment,external_account_id,listing_id,catalog_product_id) values ('47500000-0000-4000-8000-000000000011','production','seller-a','archived','47500000-0000-4000-8000-000000000081');
select lives_ok($$select pg_temp.add_order('archived-target',jsonb_build_object('lines',(select jsonb_build_array((source->'lines'->0)||'{"listingId":"archived","quantity":1}') from import_test)))$$,'Archiviertes Zuordnungsziel unterbricht den Hintergrundabgleich nicht');
select is((select state from public.ebay_sale_drafts where order_id='archived-target'),'needs_stock','Archiviertes Ziel erscheint als Bestandsklärfall ohne Reservierung');
select pg_temp.add_order('account-delete'  ,jsonb_build_object('lines',(select jsonb_build_array((source->'lines'->0)||'{"quantity":1}') from import_test)));
select is((select sum(quantity)::int from public.ebay_sale_reservations where released_at is null),1,'Löschfall hat eine eigene offene Reservierung');
set local role service_role;
select public.ebay_delete_account('production','seller-a');
reset role;
select is((select count(*)::int from public.ebay_cached_orders where external_account_id='seller-a'),0,'Bestätigte Kontolöschung entfernt private Cachequellen');
select is((select count(*)::int from public.ebay_sale_notifications where external_account_id='seller-a'),0,'Kontolöschung entfernt private Glockeninhalte');
select is((select count(*)::int from public.ebay_sale_drafts where external_account_id='seller-a'),0,'Kontolöschung entfernt private Entwurfsquellen');
select is((select sum(quantity)::int from public.ebay_sale_reservations where released_at is null),1,'Kontolöschung gibt keine Ware still frei');
select is((select count(*)::int from public.ebay_order_bookings where workspace_id='47500000-0000-4000-8000-000000000011'),4,'Minimale Buchungsbelege überleben Kontolöschung');
select * from finish();
rollback;
