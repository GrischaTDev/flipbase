\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,aud,role,email) values
 ('a4710000-0000-4000-8000-000000000001','authenticated','authenticated','stock-reversal@example.test'),
 ('a4710000-0000-4000-8000-000000000002','authenticated','authenticated','stock-reversal-other@example.test');
insert into public.workspaces(id,name,tax_mode) values
 ('a4710000-0000-4000-8000-000000000010','Gegenbuchung','kleinunternehmer_19');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('a4710000-0000-4000-8000-000000000010','a4710000-0000-4000-8000-000000000001','owner');
select set_config('request.jwt.claim.sub','a4710000-0000-4000-8000-000000000001',true);
insert into public.catalog_products(id,workspace_id,title) values
 ('a4710000-0000-4000-8000-000000000020','a4710000-0000-4000-8000-000000000010','Burberry Schal');
insert into public.purchases(id,workspace_id,type,title,entry_status,finalized_at,finalized_by) values
 ('a4710000-0000-4000-8000-000000000030','a4710000-0000-4000-8000-000000000010','single','Vier Schals','finalized',now(),'a4710000-0000-4000-8000-000000000001');
insert into public.purchase_lines(id,workspace_id,purchase_id,catalog_product_id,title_snapshot,line_kind,ordered_quantity,received_quantity,unit_purchase_price,line_total) values
 ('a4710000-0000-4000-8000-000000000031','a4710000-0000-4000-8000-000000000010','a4710000-0000-4000-8000-000000000030','a4710000-0000-4000-8000-000000000020','Burberry Schal','quantity',4,4,13,52);
insert into public.stock_lots(id,workspace_id,purchase_id,purchase_line_id,catalog_product_id,received_quantity,remaining_quantity,unit_cost,remaining_unit_costs,remaining_tax_unit_costs) values
 ('a4710000-0000-4000-8000-000000000040','a4710000-0000-4000-8000-000000000010','a4710000-0000-4000-8000-000000000030','a4710000-0000-4000-8000-000000000031','a4710000-0000-4000-8000-000000000020',4,4,13,array[13,13,13,13],array[13,13,13,13]);

set local role authenticated;
select public.record_sale('a4710000-0000-4000-8000-000000000010','{"platform":"vinted","sale_date":"2026-09-29"}','[{"catalog_product_id":"a4710000-0000-4000-8000-000000000020","quantity":1,"unit_sale_price":30}]');
select public.record_sale('a4710000-0000-4000-8000-000000000010','{"platform":"vinted","sale_date":"2026-10-08"}','[{"catalog_product_id":"a4710000-0000-4000-8000-000000000020","quantity":1,"unit_sale_price":26}]');
select public.record_sale('a4710000-0000-4000-8000-000000000010','{"platform":"vinted","sale_date":"2026-10-16"}','[{"catalog_product_id":"a4710000-0000-4000-8000-000000000020","quantity":1,"unit_sale_price":26}]');
select public.remove_article_stock('a4710000-0000-4000-8000-000000000010','catalog','a4710000-0000-4000-8000-000000000020',1,'loss',null,'false-loss');
reset role;

create temporary table reversal_test as select r.id removal_id,to_jsonb(r) original_removal,
 (select jsonb_agg(to_jsonb(m) order by m.id) from public.stock_movements m where m.stock_removal_id=r.id) original_movements,
 (select jsonb_agg(to_jsonb(s) order by s.id) from public.sales s where s.workspace_id=r.workspace_id) original_sales,
 null::uuid reversal_id from public.stock_removals r where request_id='false-loss';
grant select,update on reversal_test to authenticated;
select is((select remaining_quantity from public.stock_lots where id='a4710000-0000-4000-8000-000000000040'),0,'Vier Stück minus drei Verkäufe und falscher Verlust ergeben null');
select has_function('public','reverse_catalog_stock_removal',array['uuid','bigint','text'],'Begründeter Rücknahmeweg ist vorhanden');
update public.stock_lots set unit_cost=14 where id='a4710000-0000-4000-8000-000000000040';
set local role authenticated;
select throws_ok($$select public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',removal_id,'Korrektur') from reversal_test$$,'22023','Der aktuelle Mengen- und Kostenpool muss zuerst geprüft werden.','Ein zwischenzeitlich geänderter Einkaufspreis darf nicht mit alten Kosten gegengebucht werden');
reset role;
select is((select remaining_quantity from public.stock_lots where id='a4710000-0000-4000-8000-000000000040'),0,'Unklarer Kostenpool lässt Menge unverändert');
update public.stock_lots set unit_cost=13 where id='a4710000-0000-4000-8000-000000000040';
set local role authenticated;
select lives_ok($$update reversal_test set reversal_id=public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',removal_id,'Versehentliche Verlustausbuchung; eBay-Verkauf noch zu prüfen')$$,'Falscher Verlust wird nachvollziehbar gegengebucht');
reset role;
select is((select remaining_quantity from public.stock_lots where id='a4710000-0000-4000-8000-000000000040'),1,'Genau ein Stück ist wieder vorhanden');
select is((select remaining_unit_costs from public.stock_lots where id='a4710000-0000-4000-8000-000000000040'),array[13]::numeric[],'Belegte Stückkosten sind wiederhergestellt');
select is((select remaining_tax_unit_costs from public.stock_lots where id='a4710000-0000-4000-8000-000000000040'),array[13]::numeric[],'Belegte Steuerkosten sind wiederhergestellt');
select is((select to_jsonb(r) from public.stock_removals r join reversal_test t on t.removal_id=r.id),(select original_removal from reversal_test),'Ursprünglicher Verlustbeleg bleibt vollständig unverändert');
select is((select jsonb_agg(to_jsonb(m) order by m.id) from public.stock_movements m join reversal_test t on t.removal_id=m.stock_removal_id where m.direction='out'),(select original_movements from reversal_test),'Ursprüngliche Verlustbewegung bleibt unverändert');
select is((select jsonb_agg(to_jsonb(s) order by s.id) from public.sales s where s.workspace_id='a4710000-0000-4000-8000-000000000010'),(select original_sales from reversal_test),'Alle drei vorhandenen Verkäufe bleiben vollständig unverändert');
select is((select count(*) from public.business_events where workspace_id='a4710000-0000-4000-8000-000000000010' and event_type='stock_removal_reversed'),1::bigint,'Gegenbuchung besitzt einen eigenen Geschäftsbeleg');
set local role authenticated;
select lives_ok($$select public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',removal_id,'Versehentliche Verlustausbuchung; eBay-Verkauf noch zu prüfen') from reversal_test$$,'Wiederholung ist sicher');
reset role;
select is((select remaining_quantity from public.stock_lots where id='a4710000-0000-4000-8000-000000000040'),1,'Wiederholung erzeugt kein zusätzliches Stück');
select is((select count(*) from public.stock_movements m join reversal_test t on t.removal_id=m.stock_removal_id where m.direction='in'),1::bigint,'Genau eine Eingangsbewegung mit Bezug auf den Verlust');

select ok(not has_function_privilege('anon','public.reverse_catalog_stock_removal(uuid,bigint,text)','execute'),'Anonyme Benutzer dürfen keinen Abgang zurücknehmen');
select ok(not has_function_privilege('service_role','public.reverse_catalog_stock_removal(uuid,bigint,text)','execute'),'Geerbte Standardrechte dürfen den persönlichen Rücknahmeweg nicht für Dienste freigeben');
select ok(not has_table_privilege('authenticated','public.stock_movements','insert'),'Die Gegenbuchung kann nicht am berechtigten Weg vorbei angelegt werden');
set local role authenticated;
select throws_ok($$select public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',removal_id,'') from reversal_test$$,'22023','Begründung für die Gegenbuchung fehlt oder ist zu lang.','Eine Begründung ist erforderlich');
select throws_ok($$select public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',removal_id,'Andere Erklärung') from reversal_test$$,'22023','Dieser Abgang wurde bereits mit anderer Begründung gegengebucht.','Eine Wiederholung kann den vorhandenen Beleg nicht umdeuten');
select throws_ok($$select public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',-1,'Korrektur')$$,'22023','Kein losbasierter Bestandsabgang vorhanden.','Unbekannter Abgang wird abgewiesen');
select set_config('request.jwt.claim.sub','a4710000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',removal_id,'Versehentliche Verlustausbuchung; eBay-Verkauf noch zu prüfen') from reversal_test$$,'42501','Kein Zugriff auf diesen Bestandsabgang.','Fremder Benutzer kann weder zurücknehmen noch einen Wiederholungsbeleg lesen');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',removal_id,'Korrektur') from reversal_test$$,'42501','Kein Zugriff auf diesen Bestandsabgang.','Ohne Anmeldung ist auch ein direkter Serveraufruf gesperrt');
reset role;
select set_config('request.jwt.claim.sub','a4710000-0000-4000-8000-000000000001',true);
select throws_ok($$update public.stock_movements set quantity=2 where stock_removal_id=(select removal_id from reversal_test) and direction='in'$$,'42501','Gebuchte Bestandsabgänge bleiben unverändert erhalten.','Auch die Gegenbewegung ist unveränderlich');
select throws_ok($$delete from public.stock_movements where stock_removal_id=(select removal_id from reversal_test) and direction='in'$$,'42501','Gebuchte Bestandsabgänge bleiben unverändert erhalten.','Gegenbewegung kann nicht gelöscht werden');
select throws_ok($$delete from public.business_events where event_type='stock_removal_reversed' and workspace_id='a4710000-0000-4000-8000-000000000010'$$,'P0001','Fachliche Ereignisse sind unveränderbar.','Der neue Geschäftsbeleg bleibt erhalten');

insert into public.ebay_cached_orders(workspace_id,environment,external_account_id,order_id,source_key,source,created_at,auto_prepare)
 values('a4710000-0000-4000-8000-000000000010','production','reversal-seller','order-7587',repeat('d',64),
 '{"orderId":"order-7587","createdAt":"2026-10-19T13:12:15Z","paymentStatus":"PAID","cancelStatus":"NONE_REQUESTED","currency":"EUR","totalCents":2900,"shippingRevenueCents":0,"platformFeeCents":468,"lines":[{"lineItemId":"line-7587","listingId":"7587","variationId":null,"variationAspects":[],"title":"Burberry Schal","quantity":1,"goodsCents":2900,"hasRefund":false}],"blockers":[]}',now(),false);
select public.ebay_prepare_sale_draft(id,'[{"lineItemId":"line-7587","target":{"catalogProductId":"a4710000-0000-4000-8000-000000000020"}}]',null,true)
 from public.ebay_cached_orders where workspace_id='a4710000-0000-4000-8000-000000000010' and order_id='order-7587';
select is((select state from public.ebay_sale_drafts where workspace_id='a4710000-0000-4000-8000-000000000010' and order_id='order-7587'),'needs_costs','Gegengebuchtes Stück lässt sich für eBay reservieren; unbekannte Kosten bleiben offen');
select is((select sum(r.quantity) from public.ebay_sale_reservations r where r.workspace_id='a4710000-0000-4000-8000-000000000010' and r.released_at is null),1::bigint,'Genau ein Stück gehört dem eBay-Entwurf');
select is((select public.stock_lot_reserved_quantity('a4710000-0000-4000-8000-000000000040')),1,'Reservierter Schal ist nicht erneut verfügbar');
select is((select count(*) from public.sales where workspace_id='a4710000-0000-4000-8000-000000000010'),3::bigint,'Reservierung erzeugt keinen vierten Verkauf');
select is((select costs->'shippingCostCents' from public.ebay_sale_drafts where workspace_id='a4710000-0000-4000-8000-000000000010' and order_id='order-7587'),'null'::jsonb,'Unbekannte eigene Versandkosten bleiben unbekannt');
select is((select costs->>'platformFeeCents' from public.ebay_sale_drafts where workspace_id='a4710000-0000-4000-8000-000000000010' and order_id='order-7587'),'468','Belegte eBay-Gebühr bleibt erhalten');
set local role authenticated;
select throws_ok($$select public.record_sale('a4710000-0000-4000-8000-000000000010','{"platform":"vinted","sale_date":"2026-10-24"}','[{"catalog_product_id":"a4710000-0000-4000-8000-000000000020","quantity":1,"unit_sale_price":29}]')$$,'P0001',null,'Anderer Verkauf kann den reservierten Schal nicht verbrauchen');
reset role;
select public.ebay_release_sale_reservations(id) from public.ebay_sale_drafts where workspace_id='a4710000-0000-4000-8000-000000000010' and order_id='order-7587';

set local role authenticated;
select lives_ok($$select public.record_sale('a4710000-0000-4000-8000-000000000010','{"platform":"ebay","sale_date":"2026-10-19"}','[{"catalog_product_id":"a4710000-0000-4000-8000-000000000020","quantity":1,"unit_sale_price":29}]')$$,'Regulärer Folgeverkauf akzeptiert die gegengebuchte Menge');
reset role;
select is((select sum(cost_of_goods_sold) from public.sale_lines where workspace_id='a4710000-0000-4000-8000-000000000010'),52::numeric,'Vier Verkäufe enthalten genau den gesamten Einkaufspreis');
select is((select remaining_quantity from public.stock_lots where id='a4710000-0000-4000-8000-000000000040'),0,'Folgeverkauf verbraucht das Stück genau einmal');

-- Centfolgen, späterer weiterer Verlust und ältere Lose ohne Kostenfolge.
insert into public.catalog_products(id,workspace_id,title) values
 ('a4710000-0000-4000-8000-000000000021','a4710000-0000-4000-8000-000000000010','Centfolge');
insert into public.purchase_lines(id,workspace_id,purchase_id,catalog_product_id,title_snapshot,line_kind,ordered_quantity,received_quantity,unit_purchase_price,line_total) values
 ('a4710000-0000-4000-8000-000000000032','a4710000-0000-4000-8000-000000000010','a4710000-0000-4000-8000-000000000030','a4710000-0000-4000-8000-000000000021','Centfolge','quantity',3,3,0.033333333333,0.10);
insert into public.stock_lots(id,workspace_id,purchase_id,purchase_line_id,catalog_product_id,received_quantity,remaining_quantity,unit_cost,remaining_unit_costs,remaining_tax_unit_costs) values
 ('a4710000-0000-4000-8000-000000000041','a4710000-0000-4000-8000-000000000010','a4710000-0000-4000-8000-000000000030','a4710000-0000-4000-8000-000000000032','a4710000-0000-4000-8000-000000000021',3,3,0.033333333333,array[0.04,0.03,0.03],null);
set local role authenticated;
select public.remove_article_stock('a4710000-0000-4000-8000-000000000010','catalog','a4710000-0000-4000-8000-000000000021',2,'loss',null,'cent-first');
select public.remove_article_stock('a4710000-0000-4000-8000-000000000010','catalog','a4710000-0000-4000-8000-000000000021',1,'damage',null,'cent-second');
select lives_ok($$select public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',id,'Erster Abgang war falsch') from public.stock_removals where request_id='cent-first'$$,'Ein früherer Abgang kann neben einem späteren echten Abgang korrigiert werden');
reset role;
select is((select remaining_unit_costs from public.stock_lots where id='a4710000-0000-4000-8000-000000000041'),array[0.04,0.03]::numeric[],'Ursprüngliche Centfolge wird genau wiederhergestellt');
select ok((select remaining_tax_unit_costs is null from public.stock_lots where id='a4710000-0000-4000-8000-000000000041'),'Unbekannte Steuerkosten werden nicht erfunden');
update public.stock_lots set remaining_unit_costs=null where id='a4710000-0000-4000-8000-000000000041';
set local role authenticated;
select lives_ok($$select public.remove_article_stock('a4710000-0000-4000-8000-000000000010','catalog','a4710000-0000-4000-8000-000000000021',1,'correction',null,'cent-third')$$,'Älterer Kostenpool berücksichtigt die Gegenbuchung auch bei einem erneuten Abgang');
select lives_ok($$select public.record_sale('a4710000-0000-4000-8000-000000000010','{"platform":"test","sale_date":"2026-10-24"}','[{"catalog_product_id":"a4710000-0000-4000-8000-000000000021","quantity":1,"unit_sale_price":10}]')$$,'Reststück bleibt nach Gegenbuchung und neuem Abgang verkaufbar');
reset role;
select is((select sum(case when direction='out' then removed_cost else -removed_cost end) from public.stock_movements where stock_lot_id='a4710000-0000-4000-8000-000000000041' and stock_removal_id is not null)+
 (select cost_of_goods_sold from public.sale_lines where catalog_product_id='a4710000-0000-4000-8000-000000000021'),0.10::numeric,'Nettoabgänge und Verkauf bewahren exakt den Einkaufspreis');

-- Ein beschädigter Ursprungsbeleg darf keinen scheinbar passenden Bestand erzeugen.
insert into public.stock_removals(workspace_id,request_id,article_kind,article_id,quantity,reason,actor_id)
 values('a4710000-0000-4000-8000-000000000010','missing-event','catalog','a4710000-0000-4000-8000-000000000020',1,'loss','a4710000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$select public.reverse_catalog_stock_removal('a4710000-0000-4000-8000-000000000010',id,'Korrektur') from public.stock_removals where request_id='missing-event'$$,'22023','Der ursprüngliche Ausbuchungsbeleg ist nicht eindeutig vorhanden.','Fehlender ursprünglicher Geschäftsbeleg sperrt die Rücknahme');
reset role;
select is((select remaining_quantity from public.stock_lots where id='a4710000-0000-4000-8000-000000000040'),0,'Ungültige Rücknahme verändert keine Menge');

select * from finish();
rollback;
