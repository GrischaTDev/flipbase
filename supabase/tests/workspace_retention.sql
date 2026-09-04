\set ON_ERROR_STOP on
begin;
select no_plan();
select has_column('public', 'workspaces', 'archived_at', 'Workspace besitzt einen Archivstatus');
select has_function('public', 'archive_workspace', array['uuid'], 'Archivierung ist eine Serveroperation');
select has_function('public', 'restore_workspace', array['uuid'], 'Wiederherstellung ist eine Serveroperation');
select ok(not has_function_privilege('authenticated','public.set_workspace_archive_state(uuid,boolean)','execute'),'Interner Statushelfer ist kein Client-Endpunkt');
select ok(not has_function_privilege('service_role','public.set_workspace_archive_state(uuid,boolean)','execute'),'Interner Statushelfer ist auch für service_role gesperrt');
select ok(not has_function_privilege('authenticated','public.protect_archived_workspace_data()','execute'),'Operativer Trigger bleibt intern');
select ok(not has_function_privilege('service_role','public.archive_workspace(uuid)','execute'),'Service-Rolle hat keinen Lifecycle-Endpunkt');

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('86000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'retention@example.test', 'unused', '{}', '{}', now(), now());
insert into public.workspaces (id, name) values
 ('86000000-0000-4000-8000-000000000002', 'Archiv'),
 ('86000000-0000-4000-8000-000000000003', 'Aktiv');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('86000000-0000-4000-8000-000000000002','86000000-0000-4000-8000-000000000001','owner'),
 ('86000000-0000-4000-8000-000000000003','86000000-0000-4000-8000-000000000001','owner');
insert into public.inventory_items(id,workspace_id,title,status) values
 ('86000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000002','Artikel','ready'),
 ('86000000-0000-4000-8000-000000000005','86000000-0000-4000-8000-000000000003','Aktiver Artikel','ready');
insert into public.item_costs(id,inventory_item_id,type,amount) values
 ('86000000-0000-4000-8000-000000000006','86000000-0000-4000-8000-000000000004','repair',12);
insert into public.purchases(id,workspace_id,type,title) values
 ('86000000-0000-4000-8000-000000000007','86000000-0000-4000-8000-000000000002','single','Entwurf');
insert into public.catalog_products(id,workspace_id,title,tracking_mode) values
 ('86000000-0000-4000-8000-000000000010','86000000-0000-4000-8000-000000000002','Mengenartikel','quantity');
insert into public.purchase_lines(id,workspace_id,purchase_id,catalog_product_id,title_snapshot,line_kind,ordered_quantity,unit_purchase_price,line_total) values
 ('86000000-0000-4000-8000-000000000011','86000000-0000-4000-8000-000000000002','86000000-0000-4000-8000-000000000007','86000000-0000-4000-8000-000000000010','Mengenartikel','quantity',2,10,20);
insert into public.invoices(id,workspace_id,invoice_number,order_number) values
 ('86000000-0000-4000-8000-000000000012','86000000-0000-4000-8000-000000000002','RE-1','ORD-1');
insert into public.store_orders(id,workspace_id,order_number) values
 ('86000000-0000-4000-8000-000000000013','86000000-0000-4000-8000-000000000002','ORD-1');
insert into public.market_research(id,workspace_id,query) values
 ('86000000-0000-4000-8000-000000000014','86000000-0000-4000-8000-000000000002','Artikel');
insert into public.invoice_items(invoice_id,title) values ('86000000-0000-4000-8000-000000000012','Belegposition');
insert into public.item_media(inventory_item_id,storage_path) values ('86000000-0000-4000-8000-000000000004','images/test.webp');
insert into public.listing_drafts(inventory_item_id,platform,title,description,price) values ('86000000-0000-4000-8000-000000000004','ebay','Artikel','Beschreibung',20);
insert into public.store_order_items(store_order_id,inventory_item_id,item_title) values ('86000000-0000-4000-8000-000000000013','86000000-0000-4000-8000-000000000004','Artikel');
insert into public.research_comparables(research_id,platform,title,price) values ('86000000-0000-4000-8000-000000000014','ebay','Artikel',20);
set local role authenticated;
select set_config('request.jwt.claim.sub','86000000-0000-4000-8000-000000000001',true);
select throws_ok($$update public.workspaces set archived_at=now() where id='86000000-0000-4000-8000-000000000002'$$,'42501','Archivstatus darf nur über die Workspace-Aktionen geändert werden.','Direkte Archivierung ist gesperrt');
select lives_ok($$select public.archive_workspace('86000000-0000-4000-8000-000000000002')$$,'Inhaber archiviert');
select lives_ok($$select public.archive_workspace('86000000-0000-4000-8000-000000000002')$$,'Wiederholung ist idempotent');
select throws_ok($$update public.workspaces set archived_at=null where id='86000000-0000-4000-8000-000000000002'$$,'42501','Archivstatus darf nur über die Workspace-Aktionen geändert werden.','Direkte Wiederherstellung gesperrt');
select throws_ok($$select public.create_purchase('86000000-0000-4000-8000-000000000002','{"type":"single","title":"RPC-Einkauf","purchase_price":10}')$$,'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.','SECURITY DEFINER Einkauf-RPC gesperrt');
select throws_ok($$select public.record_sale('86000000-0000-4000-8000-000000000002','{"platform":"ebay","sale_date":"2026-09-04"}','[{"inventory_item_id":"86000000-0000-4000-8000-000000000004","title_snapshot":"Artikel","quantity":1,"unit_sale_price":20}]')$$,'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.','SECURITY DEFINER Verkauf-RPC gesperrt');
select throws_ok($$select public.receive_purchase_lines('86000000-0000-4000-8000-000000000002','86000000-0000-4000-8000-000000000007','[{"purchase_line_id":"86000000-0000-4000-8000-000000000011","received_quantity":1,"received_at":"2026-09-04T12:00:00Z"}]')$$,'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.','SECURITY DEFINER Wareneingang-RPC gesperrt');
select ok((select archived_at is not null from public.workspaces where id='86000000-0000-4000-8000-000000000002'),'Archiv bleibt sichtbar');
select is((select count(*)::int from public.inventory_items where workspace_id='86000000-0000-4000-8000-000000000002'),1,'Artikel bleibt lesbar');
select lives_ok($$select public.export_audit_snapshot('86000000-0000-4000-8000-000000000002','{}')$$,'Archivierter Workspace bleibt exportierbar');
select throws_ok($$update public.inventory_items set title='Neu' where id='86000000-0000-4000-8000-000000000004'$$,'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.','Update gesperrt');
select throws_ok($$delete from public.inventory_items where id='86000000-0000-4000-8000-000000000004'$$,'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.','Delete gesperrt');
select throws_ok($$update public.inventory_items set workspace_id='86000000-0000-4000-8000-000000000003' where id='86000000-0000-4000-8000-000000000004'$$,'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.','Verschieben aus Archiv gesperrt');
select throws_ok($$update public.item_costs set amount=13 where id='86000000-0000-4000-8000-000000000006'$$,'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.','Elternbezogene Kosten gesperrt');
select throws_ok($$update public.item_costs set inventory_item_id='86000000-0000-4000-8000-000000000005' where id='86000000-0000-4000-8000-000000000006'$$,'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.','Kind aus Archiv verschieben gesperrt');
select throws_ok($$delete from public.workspaces where id='86000000-0000-4000-8000-000000000002'$$,'P0001','Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.','Archiv bleibt aufbewahrt');
select lives_ok($$update public.inventory_items set title='Neu' where id='86000000-0000-4000-8000-000000000005'$$,'Anderer Workspace bleibt aktiv');
reset role;
select is((select count(*)::int from public.business_events where workspace_id='86000000-0000-4000-8000-000000000002' and event_type='workspace_archived'),1,'Genau ein Archivierungseintrag');
select is((select actor_id from public.business_events where workspace_id='86000000-0000-4000-8000-000000000002' and event_type='workspace_archived'),'86000000-0000-4000-8000-000000000001'::uuid,'Journal nennt Akteur');

-- Fehlende Pflichtfelder sind absichtlich egal: der Archivschutz muss vor
-- Elternbezogene Schreibwege einschließlich Medien und Belegpositionen.
select throws_ok(format('insert into public.%I(%I) values (%L)',table_name,parent_column,parent_id),'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.',table_name || ' blockiert Einfügen über Eltern')
from (values
 ('item_costs','inventory_item_id','86000000-0000-4000-8000-000000000004'),
 ('item_media','inventory_item_id','86000000-0000-4000-8000-000000000004'),
 ('listing_drafts','inventory_item_id','86000000-0000-4000-8000-000000000004'),
 ('invoice_items','invoice_id','86000000-0000-4000-8000-000000000012'),
 ('store_order_items','store_order_id','86000000-0000-4000-8000-000000000013'),
 ('research_comparables','research_id','86000000-0000-4000-8000-000000000014')
) children(table_name,parent_column,parent_id);
select throws_ok(format('update public.%I set %I=%I where %I=%L',table_name,parent_column,parent_column,parent_column,parent_id),'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.',table_name || ' blockiert Änderung über Eltern')
from (values
 ('item_costs','inventory_item_id','86000000-0000-4000-8000-000000000004'),
 ('item_media','inventory_item_id','86000000-0000-4000-8000-000000000004'),
 ('listing_drafts','inventory_item_id','86000000-0000-4000-8000-000000000004'),
 ('invoice_items','invoice_id','86000000-0000-4000-8000-000000000012'),
 ('store_order_items','store_order_id','86000000-0000-4000-8000-000000000013'),
 ('research_comparables','research_id','86000000-0000-4000-8000-000000000014')
) children(table_name,parent_column,parent_id);
select throws_ok(format('delete from public.%I where %I=%L',table_name,parent_column,parent_id),'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.',table_name || ' blockiert Löschen über Eltern')
from (values
 ('item_costs','inventory_item_id','86000000-0000-4000-8000-000000000004'),
 ('item_media','inventory_item_id','86000000-0000-4000-8000-000000000004'),
 ('listing_drafts','inventory_item_id','86000000-0000-4000-8000-000000000004'),
 ('invoice_items','invoice_id','86000000-0000-4000-8000-000000000012'),
 ('store_order_items','store_order_id','86000000-0000-4000-8000-000000000013'),
 ('research_comparables','research_id','86000000-0000-4000-8000-000000000014')
) children(table_name,parent_column,parent_id);
-- Fehlende Pflichtfelder sind absichtlich egal: der Archivschutz muss vor
-- Fachtriggern und Constraints greifen, auch bei privilegierten RPC-Schreibrechten.
select throws_ok(format('insert into public.%I(workspace_id) values (%L)',table_name,'86000000-0000-4000-8000-000000000002'),'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.',table_name || ' blockiert neue Zeilen')
from unnest(array['purchases','purchase_lines','purchase_costs','inventory_items','inventory_reconciliation_events','sales','sale_lines','sale_cost_entries','sale_line_lot_allocations','stock_lots','stock_movements','returns','invoices','shipping_orders','store_orders','bank_transactions','offline_purchase_entries','cash_wallet_sessions','catalog_products','email_confirmations','market_research','activity_logs']) table_name;
set local role service_role;
select throws_ok($$update public.inventory_items set title='Service' where id='86000000-0000-4000-8000-000000000004'$$,'55000','Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.','Service-Rolle hat keinen operativen Bypass');
reset role;
update public.workspace_members set role='admin' where workspace_id='86000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok($$select public.restore_workspace('86000000-0000-4000-8000-000000000002')$$,'42501','Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.','Admin darf nicht wiederherstellen');
select throws_ok($$select public.archive_workspace('86000000-0000-4000-8000-000000000002')$$,'42501','Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.','Admin darf nicht archivieren');
select throws_ok($$update public.workspaces set archived_at=null where id='86000000-0000-4000-8000-000000000002'$$,'42501','Archivstatus darf nur über die Workspace-Aktionen geändert werden.','Admin darf Status nicht direkt umgehen');
select lives_ok($$select public.export_audit_snapshot('86000000-0000-4000-8000-000000000002','{}')$$,'Admin kann Archiv exportieren');
reset role;
update public.workspace_members set role='accountant' where workspace_id='86000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok($$select public.archive_workspace('86000000-0000-4000-8000-000000000002')$$,'42501','Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.','Buchhalter darf nicht archivieren');
select throws_ok($$select public.restore_workspace('86000000-0000-4000-8000-000000000002')$$,'42501','Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.','Buchhalter darf nicht wiederherstellen');
select lives_ok($$select public.export_audit_snapshot('86000000-0000-4000-8000-000000000002','{}')$$,'Buchhalter kann Archiv exportieren');
reset role;
update public.workspace_members set role='member' where workspace_id='86000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok($$select public.restore_workspace('86000000-0000-4000-8000-000000000002')$$,'42501','Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.','Mitglied darf nicht wiederherstellen');
select throws_ok($$select public.archive_workspace('86000000-0000-4000-8000-000000000002')$$,'42501','Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.','Mitglied darf nicht archivieren');
select is((select count(*)::int from public.inventory_items where workspace_id='86000000-0000-4000-8000-000000000002'),1,'Mitglied behält Artikel-Leserecht');
select set_config('request.jwt.claim.sub','86000000-0000-4000-8000-000000000099',true);
select throws_ok($$select public.archive_workspace('86000000-0000-4000-8000-000000000002')$$,'42501','Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.','Fremder Nutzer abgewiesen');
select throws_ok($$select public.restore_workspace('86000000-0000-4000-8000-000000000002')$$,'42501','Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.','Fremder Nutzer darf nicht wiederherstellen');
reset role;
select ok(not has_function_privilege('anon','public.archive_workspace(uuid)','execute'),'Anon darf nicht archivieren');
select ok(not has_function_privilege('anon','public.restore_workspace(uuid)','execute'),'Anon darf nicht wiederherstellen');
update public.workspace_members set role='owner' where workspace_id='86000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','86000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.restore_workspace('86000000-0000-4000-8000-000000000002')$$,'Inhaber stellt wieder her');
select lives_ok($$select public.restore_workspace('86000000-0000-4000-8000-000000000002')$$,'Wiederherstellung idempotent');
select lives_ok($$update public.inventory_items set title='Wieder aktiv' where id='86000000-0000-4000-8000-000000000004'$$,'Wiederherstellung erlaubt Änderungen');
reset role;
select is((select count(*)::int from public.business_events where workspace_id='86000000-0000-4000-8000-000000000002' and event_type='workspace_restored'),1,'Genau ein Wiederherstellungseintrag');
insert into public.workspaces(id,name) values ('86000000-0000-4000-8000-000000000020','Leer mit Journal'),('86000000-0000-4000-8000-000000000021','Wirklich leer');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('86000000-0000-4000-8000-000000000020','86000000-0000-4000-8000-000000000001','owner'),
 ('86000000-0000-4000-8000-000000000021','86000000-0000-4000-8000-000000000001','owner');
set local role authenticated;
select lives_ok($$delete from public.workspaces where id='86000000-0000-4000-8000-000000000021'$$,'Leerer Workspace kann gelöscht werden');
select is((select count(*)::int from public.workspaces where id='86000000-0000-4000-8000-000000000021'),0,'Leerer Workspace tatsächlich gelöscht');
select public.archive_workspace('86000000-0000-4000-8000-000000000020');
select public.restore_workspace('86000000-0000-4000-8000-000000000020');
select throws_ok($$delete from public.workspaces where id='86000000-0000-4000-8000-000000000020'$$,'P0001','Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.','Journal allein verhindert Löschen auch nach Wiederherstellung');
select * from finish();
rollback;
