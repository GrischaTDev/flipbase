\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'ebay_article_mappings', 'Bestätigte Artikelzuordnungen existieren');
select has_table('public', 'ebay_order_snapshots', 'Private Prüfstände existieren');
select has_table('public', 'ebay_order_bookings', 'Dauerhafte Quellenbelege existieren');
select ok((select relrowsecurity from pg_class where oid = 'public.ebay_order_bookings'::regclass), 'Quellenbelege haben RLS');
select ok(not has_table_privilege('authenticated', 'public.ebay_order_snapshots', 'select'), 'Browser liest keine privaten Quellen');
select ok(not has_table_privilege('authenticated', 'public.ebay_order_bookings', 'insert'), 'Browser kann keinen Beleg erfinden');
select ok(not has_column_privilege('authenticated', 'public.ebay_article_mappings', 'external_account_id', 'select'), 'Interne Kontokennung bleibt privat');
select ok(not has_function_privilege('authenticated', 'public.ebay_store_order_snapshot(uuid,uuid,bigint,uuid,text,text,jsonb,boolean)', 'execute'), 'Browser kann keine Buchungsfreigabe erfinden');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('33000000-0000-4000-8000-000000000001','authenticated','authenticated','ebay-import-one@example.test','{}','{}'),
 ('33000000-0000-4000-8000-000000000002','authenticated','authenticated','ebay-import-two@example.test','{}','{}'),
 ('33000000-0000-4000-8000-000000000003','authenticated','authenticated','ebay-import-other@example.test','{}','{}');
insert into public.workspaces(id,name) values
 ('33000000-0000-4000-8000-000000000011','eBay import A'),
 ('33000000-0000-4000-8000-000000000012','eBay import B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000001','member'),
 ('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000002','owner'),
 ('33000000-0000-4000-8000-000000000012','33000000-0000-4000-8000-000000000003','owner');
insert into public.ebay_connections(id,workspace_id,user_id,environment,status,external_account_id,authorization_version,operation_id,operation_expires_at) values
 ('33000000-0000-4000-8000-000000000021','33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000001','production','connected','seller-a',1,'33000000-0000-4000-8000-000000000031',clock_timestamp()+interval '90 seconds'),
 ('33000000-0000-4000-8000-000000000022','33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000002','production','connected','seller-b',1,null,null);
insert into public.catalog_products(id,workspace_id,title,tracking_mode) values
 ('33000000-0000-4000-8000-000000000041','33000000-0000-4000-8000-000000000011','Importartikel','quantity'),
 ('33000000-0000-4000-8000-000000000042','33000000-0000-4000-8000-000000000012','Fremder Artikel','quantity');
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.purchases(id,workspace_id,type,title) values ('33000000-0000-4000-8000-000000000051','33000000-0000-4000-8000-000000000011','single','Importbestand');
insert into public.purchase_lines(id,workspace_id,purchase_id,catalog_product_id,title_snapshot,line_kind,ordered_quantity,unit_purchase_price,line_total) values
 ('33000000-0000-4000-8000-000000000052','33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000051','33000000-0000-4000-8000-000000000041','Importartikel','quantity',8,1,8);
select public.receive_purchase_lines('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000051','[{"purchase_line_id":"33000000-0000-4000-8000-000000000052","received_quantity":8,"received_at":"2026-10-01T12:00:00Z"}]');
select public.finalize_purchase_costing('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000051');

create temporary table import_test(source jsonb, assignments jsonb, costs jsonb, display_id uuid, ready_id uuid, result jsonb);
grant select, update on import_test to authenticated, service_role;
insert into import_test(source,assignments,costs) values (
 '{"orderId":"order-1","createdAt":"2026-09-30T22:30:00Z","lastModifiedAt":"2026-10-01T10:00:00Z","observedAt":"2026-10-01T12:00:00Z","paymentStatus":"PAID","cancelStatus":"NONE_REQUESTED","fulfillmentStatus":"NOT_STARTED","currency":"EUR","totalCents":1450,"shippingRevenueCents":450,"lines":[{"lineItemId":"line-1","listingId":"123","variationId":null,"sku":null,"title":"Importartikel","quantity":3,"goodsCents":1000,"hasRefund":false,"variationAspects":[]}],"blockers":[]}',
 '[{"lineItemId":"line-1","target":{"catalogProductId":"33000000-0000-4000-8000-000000000041"}}]',
 '{"platformFeeCents":0,"shippingCostCents":300,"shippingMode":"seller_arranged","additionalCosts":[]}');
set local role service_role;
select is(public.ebay_store_order_snapshot('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',1,'33000000-0000-4000-8000-000000000031',repeat('a',64),repeat('b',64),(select source from import_test),false)->>'connectionId','33000000-0000-4000-8000-000000000021','Prüfantwort trägt die persönliche Verbindung');
select throws_ok($$select public.ebay_store_order_snapshot('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',0,'33000000-0000-4000-8000-000000000031',repeat('a',64),repeat('b',64),(select source from import_test),true)$$,'42501',null,'Überholte Freigabe darf keinen Prüfstand erzeugen');
update import_test set display_id = (public.ebay_store_order_snapshot('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',1,'33000000-0000-4000-8000-000000000031',repeat('a',64),repeat('b',64),source,false)->>'snapshotId')::uuid;
update import_test set ready_id = (public.ebay_store_order_snapshot('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',1,'33000000-0000-4000-8000-000000000031',repeat('a',64),repeat('b',64),source,true)->>'snapshotId')::uuid;
set local role authenticated;
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',display_id,assignments,costs) from import_test$$,'22023',null,'Anzeige allein erlaubt keine Buchung');
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,assignments,costs - 'platformFeeCents') from import_test$$,'22023',null,'Unbekannte Gebühren bleiben gesperrt');
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,assignments||assignments,costs) from import_test$$,'22023',null,'Doppelte Quellposition bleibt gesperrt');
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,'[{"lineItemId":"line-1","target":{"catalogProductId":"33000000-0000-4000-8000-000000000042"}}]',costs) from import_test$$,'22023',null,'Fremder Artikel bleibt gesperrt');
select throws_ok($$select public.ebay_set_article_mapping('33000000-0000-4000-8000-000000000012','33000000-0000-4000-8000-000000000021','123',null,'{"catalogProductId":"33000000-0000-4000-8000-000000000041"}')$$,'42501',null,'Fremder Workspace bleibt gesperrt');
select lives_ok($$select public.ebay_set_article_mapping('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021','123',null,'{"catalogProductId":"33000000-0000-4000-8000-000000000041"}')$$,'Normales Mitglied darf zuordnen');
update import_test set result = public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,assignments,costs);
select is((select result->>'status' from import_test),'imported','Bestellung wird gebucht');
select is((select result->>'alreadyRecorded' from import_test),'false','Erste Buchung ist neu');
select is((select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,'[]','{}')->>'saleId' from import_test),(select result->>'saleId' from import_test),'Wiederholung liefert denselben Verkauf vor neuer Bestandsprüfung');
reset role;
select is((select count(*)::int from public.sales where workspace_id='33000000-0000-4000-8000-000000000011'),1,'Genau ein Verkauf');
select is((select count(*)::int from public.ebay_order_bookings),1,'Genau ein Quellenbeleg');
select is((select sum(remaining_quantity)::int from public.stock_lots where workspace_id='33000000-0000-4000-8000-000000000011'),5,'Bestand nur einmal um drei vermindert');
select is((select sum(line_total) from public.sale_lines where workspace_id='33000000-0000-4000-8000-000000000011'),10.00::numeric,'333/334-Cent-Aufteilung erhält den Warenbetrag');
select is((select sale_price_total from public.sales where workspace_id='33000000-0000-4000-8000-000000000011'),14.50::numeric,'Versandumsatz bleibt getrennt und wird einmal addiert');
select is((select sale_date::text from public.sales where workspace_id='33000000-0000-4000-8000-000000000011'),'2026-10-01','Verkaufsdatum verwendet Berlin');
select is((select jsonb_array_length(source_lines) from public.ebay_order_bookings),2,'Beide Centgruppen haben Quellenverweise');
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::int from public.ebay_article_mappings),0,'Anderes eBay-Konto sieht keine Zuordnung');
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,assignments,costs) from import_test$$,'42501',null,'Inhaber darf fremden Prüfstand nicht buchen');
reset role;
update public.ebay_connections set external_account_id='seller-a' where id='33000000-0000-4000-8000-000000000022';
set local role authenticated;
select is((select count(*)::int from public.ebay_article_mappings),1,'Eigene Verbindung desselben eBay-Kontos sieht Zuordnung');
reset role;
set local role service_role;
select is(public.ebay_get_order_booking('33000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000022',repeat('a',64))->>'saleId',(select result->>'saleId' from import_test),'Zweiter Nutzer desselben Kontos erhält denselben Beleg');
update public.ebay_connections set operation_id='33000000-0000-4000-8000-000000000032', operation_expires_at=clock_timestamp()+interval '90 seconds' where id='33000000-0000-4000-8000-000000000022';
update import_test set ready_id = (public.ebay_store_order_snapshot('33000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000022',1,'33000000-0000-4000-8000-000000000032',repeat('a',64),repeat('b',64),source,true)->>'snapshotId')::uuid;
set local role authenticated;
select is((select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000022',ready_id,assignments,costs)->>'saleId' from import_test),(select result->>'saleId' from import_test),'Eigener Prüfstand des zweiten Kontonutzers erzeugt keinen zweiten Verkauf');
reset role;
set local role service_role;
select ok(not public.ebay_clear_order_recorded_elsewhere('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',repeat('a',64)),'Importbeleg lässt sich nicht zurücknehmen');
update import_test set display_id = (public.ebay_store_order_snapshot('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',1,'33000000-0000-4000-8000-000000000031',repeat('c',64),repeat('d',64),source||'{"orderId":"order-2"}',false)->>'snapshotId')::uuid;
select throws_ok($$select public.ebay_mark_order_recorded_elsewhere('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',display_id,' ',null) from import_test$$,'22023',null,'Manuelle Markierung verlangt einen Grund');
select is((select public.ebay_mark_order_recorded_elsewhere('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',display_id,'Schon im alten System gebucht',null)->>'status' from import_test),'recorded_elsewhere','Manuelle Markierung wird ohne Verkauf gespeichert');
select ok(public.ebay_clear_order_recorded_elsewhere('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',repeat('c',64)),'Manuelle Markierung kann zurückgenommen werden');
reset role;
select is((select count(*)::int from public.sales where workspace_id='33000000-0000-4000-8000-000000000011'),1,'Markierung und Rücknahme erzeugen keinen Verkauf');
select is((select sum(remaining_quantity)::int from public.stock_lots where workspace_id='33000000-0000-4000-8000-000000000011'),5,'Markierung und Rücknahme verändern keinen Bestand');
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.catalog_products(id,workspace_id,title,tracking_mode) values ('33000000-0000-4000-8000-000000000043','33000000-0000-4000-8000-000000000011','Artikel ohne Bestand','quantity');
set local role service_role;
update import_test set ready_id = (public.ebay_store_order_snapshot('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',1,'33000000-0000-4000-8000-000000000031',repeat('e',64),repeat('f',64),
  source||jsonb_build_object('orderId','order-3','totalCents',2050,'lines',(source->'lines')||'[{"lineItemId":"line-2","listingId":"456","variationId":null,"sku":null,"title":"Ohne Bestand","quantity":2,"goodsCents":600,"hasRefund":false,"variationAspects":[]}]'),true)->>'snapshotId')::uuid;
set local role authenticated;
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,
  assignments||'[{"lineItemId":"line-2","target":{"catalogProductId":"33000000-0000-4000-8000-000000000043"}}]',costs) from import_test$$,'P0001',null,'Fehlender Bestand der zweiten Position verwirft alles');
reset role;
select is((select count(*)::int from public.sales where workspace_id='33000000-0000-4000-8000-000000000011'),1,'Ungültige zweite Position hinterlässt keinen Verkauf');
select is((select sum(remaining_quantity)::int from public.stock_lots where workspace_id='33000000-0000-4000-8000-000000000011'),5,'Ungültige zweite Position hinterlässt keinen Bestandsabgang');
select is((select count(*)::int from public.ebay_order_bookings),1,'Ungültige zweite Position hinterlässt keinen Quellenbeleg');
set local role service_role;
update import_test set ready_id = (public.ebay_store_order_snapshot('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000021',1,'33000000-0000-4000-8000-000000000031',repeat('c',64),repeat('d',64),source||'{"orderId":"order-2"}',true)->>'snapshotId')::uuid;
reset role;
update public.catalog_products set archived_at=clock_timestamp() where id='33000000-0000-4000-8000-000000000041';
set local role authenticated;
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,assignments,costs) from import_test$$,'22023',null,'Archivierter Artikel bleibt gesperrt');
reset role;
update public.catalog_products set archived_at=null where id='33000000-0000-4000-8000-000000000041';
update public.ebay_order_snapshots set created_at=clock_timestamp()-interval '1 minute',expires_at=clock_timestamp()-interval '31 seconds' where id=(select ready_id from import_test);
set local role authenticated;
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,assignments,costs) from import_test$$,'22023',null,'Abgelaufene Buchungsfreigabe bleibt gesperrt');
select throws_ok($$insert into public.ebay_order_bookings(workspace_id,environment,source_key,status,sale_id) values ('33000000-0000-4000-8000-000000000011','production',repeat('9',64),'imported',null)$$,'42501',null,'Direkter Belegzugriff bleibt gesperrt');
reset role;
update public.ebay_connections set authorization_version=2 where id='33000000-0000-4000-8000-000000000021';
set local role authenticated;
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,assignments,costs) from import_test$$,'42501',null,'Überholte Autorisierungsfassung darf nicht buchen');
reset role;
update public.ebay_connections set authorization_version=1 where id='33000000-0000-4000-8000-000000000021';
update public.workspaces set archived_at=clock_timestamp() where id='33000000-0000-4000-8000-000000000011';
set local role authenticated;
select throws_ok($$select public.ebay_record_order_sale('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',ready_id,assignments,costs) from import_test$$,'42501',null,'Archivierter Workspace bleibt gesperrt');
reset role;
set local role service_role;
select throws_ok($$insert into public.ebay_order_bookings(workspace_id,environment,source_key,status,reason) values ('33000000-0000-4000-8000-000000000011','production',repeat('9',64),'recorded_elsewhere','Archivierter Beleg')$$,'55000',null,'Auch Dienstzugriff verändert keine archivierten Geschäftsbelege');
select public.ebay_delete_account('production','seller-a');
select is((select count(*)::int from public.ebay_order_snapshots),0,'Kontolöschung entfernt Prüfstände');
select is((select count(*)::int from public.ebay_article_mappings),0,'Kontolöschung entfernt Zuordnungen');
select is((select count(*)::int from public.ebay_order_bookings),1,'Kontolöschung erhält Geschäftsbeleg');
reset role;
insert into public.workspaces(id,name) values ('33000000-0000-4000-8000-000000000013','Nur manueller Quellenbeleg');
insert into public.ebay_order_bookings(workspace_id,environment,source_key,status,reason) values ('33000000-0000-4000-8000-000000000013','production',repeat('8',64),'recorded_elsewhere','Vorher manuell erfasst');
select throws_ok($$delete from public.workspaces where id='33000000-0000-4000-8000-000000000013'$$,'P0001',null,'Auch ein manueller Quellenbeleg verhindert die Workspace-Löschung');
select * from finish();
rollback;
