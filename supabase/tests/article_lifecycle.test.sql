\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_column('public', 'catalog_products', 'archived_at', 'Stammartikel besitzen eigene Archivmetadaten');
select has_function('public', 'set_catalog_product_archived', array['uuid', 'uuid', 'boolean'],
  'Stammartikel haben eine geschützte Archivaktion');
select has_table('public', 'article_media_cleanup_jobs', 'Gelöschte Bilddateien werden zur Bereinigung vorgemerkt');
select has_function('public', 'delete_unused_article', array['uuid', 'text', 'uuid'],
  'Unbenutzte Artikel werden nur über eine geschützte Aktion gelöscht');
select ok(not has_function_privilege('anon', 'public.set_catalog_product_archived(uuid,uuid,boolean)', 'execute'),
  'Anonyme können Stammartikel nicht archivieren');
select ok(not has_function_privilege('anon', 'public.delete_unused_article(uuid,text,uuid)', 'execute'),
  'Anonyme können Artikel nicht löschen');
select ok((select relrowsecurity from pg_class where oid='public.article_media_cleanup_jobs'::regclass),
  'Die Bildbereinigung hat aktivierte RLS');

insert into auth.users(id, aud, role, email) values
  ('a2400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'article-member@example.test'),
  ('a2400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'article-other@example.test');
insert into public.workspaces(id, name) values
  ('a2400000-0000-4000-8000-000000000010', 'Artikeltest'),
  ('a2400000-0000-4000-8000-000000000011', 'Fremder Artikeltest');
insert into public.workspace_members(workspace_id, user_id, role) values
  ('a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000001', 'owner');
insert into public.catalog_products(id, workspace_id, title) values
  ('a2400000-0000-4000-8000-000000000020', 'a2400000-0000-4000-8000-000000000010', 'Lagerartikel'),
  ('a2400000-0000-4000-8000-000000000021', 'a2400000-0000-4000-8000-000000000010', 'Mit Inserat'),
  ('a2400000-0000-4000-8000-000000000022', 'a2400000-0000-4000-8000-000000000010', 'Mit Reservierung'),
  ('a2400000-0000-4000-8000-000000000023', 'a2400000-0000-4000-8000-000000000010', 'Mit Shopauftrag'),
  ('a2400000-0000-4000-8000-000000000024', 'a2400000-0000-4000-8000-000000000011', 'Fremd'),
  ('a2400000-0000-4000-8000-000000000025', 'a2400000-0000-4000-8000-000000000010', 'Fehleingabe'),
  ('a2400000-0000-4000-8000-000000000026', 'a2400000-0000-4000-8000-000000000010', 'Verknüpftes Inserat'),
  ('a2400000-0000-4000-8000-000000000027', 'a2400000-0000-4000-8000-000000000010', 'Verknüpft reserviert'),
  ('a2400000-0000-4000-8000-000000000028', 'a2400000-0000-4000-8000-000000000010', 'Verknüpfter Auftrag'),
  ('a2400000-0000-4000-8000-000000000029', 'a2400000-0000-4000-8000-000000000010', 'Verknüpft frei');
insert into public.catalog_product_media(workspace_id, catalog_product_id, storage_path, file_name) values
  ('a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000025',
   'catalog-products/a2400000-0000-4000-8000-000000000010/a2400000-0000-4000-8000-000000000025/a2400000-0000-4000-8000-000000000026.webp', 'test.webp');

insert into public.purchases(id, workspace_id, type, title) values
  ('a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000010', 'single', 'Einkauf');
insert into public.purchase_lines(id, workspace_id, purchase_id, catalog_product_id,
  title_snapshot, line_kind, ordered_quantity, received_quantity, unit_purchase_price, line_total) values
  ('a2400000-0000-4000-8000-000000000031', 'a2400000-0000-4000-8000-000000000010',
   'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000020',
   'Lagerartikel', 'quantity', 3, 3, 5, 15),
  ('a2400000-0000-4000-8000-000000000032', 'a2400000-0000-4000-8000-000000000010',
   'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000022',
   'Mit Reservierung', 'quantity', 2, 2, 5, 10),
  ('a2400000-0000-4000-8000-000000000034', 'a2400000-0000-4000-8000-000000000010',
   'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000026',
   'Verknüpftes Inserat', 'individual', 1, 1, 5, 5),
  ('a2400000-0000-4000-8000-000000000035', 'a2400000-0000-4000-8000-000000000010',
   'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000027',
   'Verknüpft reserviert', 'individual', 1, 1, 5, 5),
  ('a2400000-0000-4000-8000-000000000036', 'a2400000-0000-4000-8000-000000000010',
   'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000028',
   'Verknüpfter Auftrag', 'individual', 1, 1, 5, 5),
  ('a2400000-0000-4000-8000-000000000037', 'a2400000-0000-4000-8000-000000000010',
   'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000029',
   'Verknüpft frei', 'individual', 1, 1, 5, 5);
insert into public.stock_lots(id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost) values
  ('a2400000-0000-4000-8000-000000000040', 'a2400000-0000-4000-8000-000000000010',
   'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000031',
   'a2400000-0000-4000-8000-000000000020', 3, 3, 5),
  ('a2400000-0000-4000-8000-000000000041', 'a2400000-0000-4000-8000-000000000010',
   'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000032',
   'a2400000-0000-4000-8000-000000000022', 2, 1, 5);
insert into public.stock_movements(workspace_id, stock_lot_id, direction, quantity, reason) values
  ('a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000041', 'out', 1, 'reservation');
insert into public.inventory_items(id, workspace_id, title, condition, status, allocated_purchase_cost, purchase_id) values
  ('a2400000-0000-4000-8000-000000000060', 'a2400000-0000-4000-8000-000000000010', 'Fehleingabe Stück', 'used', 'ready', 0, null),
  ('a2400000-0000-4000-8000-000000000061', 'a2400000-0000-4000-8000-000000000010', 'Gekauftes Stück', 'used', 'ready', 5, 'a2400000-0000-4000-8000-000000000030');
insert into public.inventory_items(id, workspace_id, title, condition, status, allocated_purchase_cost, purchase_id, purchase_line_id) values
  ('a2400000-0000-4000-8000-000000000062', 'a2400000-0000-4000-8000-000000000010', 'Inseriertes Stück', 'used', 'listed', 5, 'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000034'),
  ('a2400000-0000-4000-8000-000000000063', 'a2400000-0000-4000-8000-000000000010', 'Reserviertes Stück', 'used', 'reserved', 5, 'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000035'),
  ('a2400000-0000-4000-8000-000000000064', 'a2400000-0000-4000-8000-000000000010', 'Bestelltes Stück', 'used', 'ready', 5, 'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000036'),
  ('a2400000-0000-4000-8000-000000000065', 'a2400000-0000-4000-8000-000000000010', 'Freies Stück', 'used', 'ready', 5, 'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000037');
insert into public.item_media(inventory_item_id, storage_path) values
  ('a2400000-0000-4000-8000-000000000060', 'a2400000-0000-4000-8000-000000000060/test.webp');
insert into public.listings(workspace_id, catalog_product_id, title, description, price, price_type, shipping_type) values
  ('a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000021',
   'Mit Inserat', 'Vorbereitet', 20, 'FIXED', 'pickup');
insert into public.listings(workspace_id, inventory_item_id, title, description, price, price_type, shipping_type) values
  ('a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000062',
   'Inseriertes Stück', 'Vorbereitet', 20, 'FIXED', 'pickup');
insert into public.store_orders(id, workspace_id, order_number) values
  ('a2400000-0000-4000-8000-000000000050', 'a2400000-0000-4000-8000-000000000010', 'TEST-ARCHIVE');
insert into public.store_order_items(store_order_id, catalog_product_id, item_title, price) values
  ('a2400000-0000-4000-8000-000000000050', 'a2400000-0000-4000-8000-000000000023', 'Mit Shopauftrag', 20);
insert into public.store_order_items(store_order_id, inventory_item_id, item_title, price) values
  ('a2400000-0000-4000-8000-000000000050', 'a2400000-0000-4000-8000-000000000064', 'Bestelltes Stück', 20);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2400000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000020',true)$$,
  'Stammartikel mit Lagerbestand darf archiviert werden');
select ok((select archived_at is not null from public.catalog_products where id='a2400000-0000-4000-8000-000000000020'),
  'Archivdatum ist gesetzt');
select throws_ok($$select public.record_sale('a2400000-0000-4000-8000-000000000010',
  '{"platform":"direct","sale_date":"2026-09-24"}',
  '[{"catalog_product_id":"a2400000-0000-4000-8000-000000000020","quantity":1,"unit_sale_price":10}]')$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Archiviertes Produkt kann nicht neu verkauft werden');
select throws_ok($$select public.place_store_order(
  'a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000052',
  'ARCHIVE-STORE', '{"email":"shop@example.test"}', 10, 0, 10,
  'bank_transfer', 'paid', null, 'paid', '2026-09-24', null,
  '[{"catalog_product_id":"a2400000-0000-4000-8000-000000000020","item_title":"Lagerartikel","quantity":1,"price":10}]')$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Archiviertes Produkt kann keinen neuen Shopauftrag auslösen');
reset role;
select throws_ok($$insert into public.stock_movements(workspace_id, stock_lot_id, direction, quantity, reason) values
  ('a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000040', 'out', 1, 'reservation')$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Neue Lagerreservierung eines archivierten Stammartikels wird abgewiesen');
select throws_ok($$insert into public.purchase_lines(id, workspace_id, purchase_id, catalog_product_id,
  title_snapshot, line_kind, ordered_quantity, received_quantity, unit_purchase_price, line_total)
  values ('a2400000-0000-4000-8000-000000000033', 'a2400000-0000-4000-8000-000000000010',
    'a2400000-0000-4000-8000-000000000030', 'a2400000-0000-4000-8000-000000000020',
    'Archiviert', 'quantity', 1, 0, 5, 5)$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Neue Einkaufszeile mit archiviertem Produkt wird abgewiesen');
select lives_ok($$update public.purchase_lines set catalog_product_id = catalog_product_id
  where id = 'a2400000-0000-4000-8000-000000000031'$$,
  'Bestehende Einkaufszeile bleibt trotz Archivierung bearbeitbar');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2400000-0000-4000-8000-000000000001', true);
select is((select archived_by from public.catalog_products where id='a2400000-0000-4000-8000-000000000020'),
  'a2400000-0000-4000-8000-000000000001'::uuid, 'Akteur wird serverseitig gespeichert');
select throws_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000021',true)$$,
  '22023', 'Bitte das Inserat zuerst beenden.', 'Vorbereitetes Inserat sperrt Archivierung');
select throws_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000022',true)$$,
  '22023', 'Bitte die Reservierung zuerst klären.', 'Reservierung sperrt Archivierung');
select throws_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000023',true)$$,
  '22023', 'Bitte den offenen Shopauftrag zuerst klären.', 'Shopauftrag sperrt Archivierung');
select throws_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000026',true)$$,
  '22023', 'Bitte das Inserat zuerst beenden.', 'Inserat eines zugeordneten Stücks sperrt den Stammartikel');
select throws_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000027',true)$$,
  '22023', 'Bitte die Reservierung zuerst klären.', 'Reserviertes Stück sperrt den Stammartikel');
select throws_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000028',true)$$,
  '22023', 'Bitte den offenen Shopauftrag zuerst klären.', 'Shopauftrag eines zugeordneten Stücks sperrt den Stammartikel');
select lives_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000029',true)$$,
  'Stammartikel mit freiem zugeordnetem Stück kann archiviert werden');
reset role;
select throws_ok($$insert into public.inventory_items(id, workspace_id, title, condition, status,
  allocated_purchase_cost, purchase_id, purchase_line_id) values
  ('a2400000-0000-4000-8000-000000000066', 'a2400000-0000-4000-8000-000000000010',
   'Neu zugeordnet', 'used', 'received', 5, 'a2400000-0000-4000-8000-000000000030',
   'a2400000-0000-4000-8000-000000000037')$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Neues Einzelstück darf nicht mit archiviertem Stammartikel verknüpft werden');
select throws_ok($$update public.inventory_items set status = 'reserved'
  where id = 'a2400000-0000-4000-8000-000000000065'$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Zugeordnetes Einzelstück darf nach Elternarchivierung nicht reserviert werden');
select throws_ok($$update public.inventory_items set purchase_line_id = 'a2400000-0000-4000-8000-000000000037'
  where id = 'a2400000-0000-4000-8000-000000000062'$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Bereits inseriertes Stück darf keinem archivierten Stammartikel neu zugeordnet werden');
insert into public.sales(id, workspace_id, platform, sale_price) values
  ('a2400000-0000-4000-8000-000000000053', 'a2400000-0000-4000-8000-000000000010', 'direct', 10);
select throws_ok($$insert into public.sale_lines(workspace_id, sale_id, inventory_item_id, title_snapshot,
  quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode) values
  ('a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000053',
   'a2400000-0000-4000-8000-000000000065', 'Freies Stück', 1, 10, 10, 5, 'diff_25a')$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Zuordnung zum Archiv sperrt neue Einzelstückverkäufe');
select throws_ok($$insert into public.listings(workspace_id, inventory_item_id, title, description,
  price, price_type, shipping_type) values
  ('a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000065',
   'Freies Stück', 'Nach Archivierung', 20, 'FIXED', 'pickup')$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Zuordnung zum Archiv sperrt neue Einzelstückinserate');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2400000-0000-4000-8000-000000000001', true);
select throws_ok($$update public.catalog_products set archived_at=now() where id='a2400000-0000-4000-8000-000000000021'$$,
  '42501', null, 'Direkte Archivänderung wird abgewiesen');
select lives_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000020',true)$$,
  'Doppelte Archivierung ist idempotent');
select lives_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000020',false)$$,
  'Wiederherstellung ist möglich');
select lives_ok($$select public.set_inventory_item_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000061',true)$$,
  'Einzelstück kann für neue Vorgänge archiviert werden');
select throws_ok($$select public.record_sale('a2400000-0000-4000-8000-000000000010',
  '{"platform":"direct","sale_date":"2026-09-24"}',
  '[{"inventory_item_id":"a2400000-0000-4000-8000-000000000061","quantity":1,"unit_sale_price":10}]')$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Archiviertes Einzelstück kann nicht neu verkauft werden');
select throws_ok($$select public.record_legacy_inventory_sale(
  'a2400000-0000-4000-8000-000000000010', 'a2400000-0000-4000-8000-000000000061',
  '{"platform":"direct","sale_date":"2026-09-24","unit_sale_price":10}', 'Altbeleg geprüft')$$,
  '22023', 'Dieser Artikel ist archiviert.', 'Archiviertes Einzelstück kann keinen Legacy-Verkauf nachtragen');
select throws_ok($$select public.delete_unused_article('a2400000-0000-4000-8000-000000000010','catalog','a2400000-0000-4000-8000-000000000020')$$,
  '23503', null, 'Einkauf und Lager verhindern Löschen');
select throws_ok($$select public.delete_unused_article('a2400000-0000-4000-8000-000000000010','catalog','a2400000-0000-4000-8000-000000000021')$$,
  '23503', null, 'Vorbereitetes Inserat verhindert Löschen');
select throws_ok($$select public.delete_unused_article('a2400000-0000-4000-8000-000000000010','item','a2400000-0000-4000-8000-000000000061')$$,
  '23503', null, 'Einkaufsbezug eines Einzelstücks verhindert Löschen');
select throws_ok($$select public.delete_unused_article('a2400000-0000-4000-8000-000000000010','unknown','a2400000-0000-4000-8000-000000000025')$$,
  '22023', null, 'Unbekannte Artikelart verhindert Löschen');
update public.catalog_products set is_public_store = true where id = 'a2400000-0000-4000-8000-000000000025';
select throws_ok($$select public.delete_unused_article('a2400000-0000-4000-8000-000000000010','catalog','a2400000-0000-4000-8000-000000000025')$$,
  '23503', null, 'Öffentlich angebotener Artikel wird nicht gelöscht');
update public.catalog_products set is_public_store = false where id = 'a2400000-0000-4000-8000-000000000025';
update public.inventory_items set status = 'reserved' where id = 'a2400000-0000-4000-8000-000000000060';
select throws_ok($$select public.delete_unused_article('a2400000-0000-4000-8000-000000000010','item','a2400000-0000-4000-8000-000000000060')$$,
  '23503', null, 'Reserviertes Einzelstück wird nicht gelöscht');
update public.inventory_items set status = 'ready' where id = 'a2400000-0000-4000-8000-000000000060';
select is(public.delete_unused_article('a2400000-0000-4000-8000-000000000010','catalog','a2400000-0000-4000-8000-000000000025')->>'queued_media',
  '1', 'Produktbild wird vorgemerkt');
select is(public.delete_unused_article('a2400000-0000-4000-8000-000000000010','item','a2400000-0000-4000-8000-000000000060')->>'queued_media',
  '1', 'Einzelstückbild wird vorgemerkt');
select throws_ok($$select public.delete_unused_article('a2400000-0000-4000-8000-000000000010','catalog','a2400000-0000-4000-8000-000000000024')$$,
  '42501', null, 'Fremder Workspace kann nicht als eigener Artikel gelöscht werden');
select set_config('request.jwt.claim.sub', 'a2400000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.set_catalog_product_archived('a2400000-0000-4000-8000-000000000010','a2400000-0000-4000-8000-000000000020',true)$$,
  '42501', null, 'Fremder Nutzer ist gesperrt');
select throws_ok($$select public.delete_unused_article('a2400000-0000-4000-8000-000000000010','item','a2400000-0000-4000-8000-000000000061')$$,
  '42501', null, 'Fremder Nutzer kann Artikel nicht löschen');
reset role;
select is((select count(*)::int from public.article_media_cleanup_jobs where workspace_id='a2400000-0000-4000-8000-000000000010'), 2,
  'Genau zwei Bildbereinigungen bleiben erhalten');
select is((select count(*)::int from public.catalog_products where id='a2400000-0000-4000-8000-000000000020'), 1,
  'Benutzter Stammartikel bleibt erhalten');
select is((select count(*)::int from public.listings where catalog_product_id='a2400000-0000-4000-8000-000000000021'), 1,
  'Inserat wird nicht kaskadierend gelöscht');
select is((select remaining_quantity from public.stock_lots where id='a2400000-0000-4000-8000-000000000040'), 3,
  'Archivierung und Wiederherstellung ändern die Lagerzahl nicht');
select is((select unit_cost from public.stock_lots where id='a2400000-0000-4000-8000-000000000040'), 5::numeric,
  'Archivierung und Wiederherstellung ändern den Einstandspreis nicht');
select is((select count(*)::int from public.business_events where entity_type='catalog_product'
  and entity_id='a2400000-0000-4000-8000-000000000020' and event_type='catalog_product_archived'), 1,
  'Genau ein Archivereignis trotz doppeltem Aufruf');
select is((select count(*)::int from public.business_events where entity_type='catalog_product'
  and entity_id='a2400000-0000-4000-8000-000000000020' and event_type='catalog_product_restored'), 1,
  'Genau ein Wiederherstellungsereignis');

select * from finish();
rollback;
