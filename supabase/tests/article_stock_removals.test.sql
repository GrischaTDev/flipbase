\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, aud, role, email) values
  ('a4700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'stock-removal@example.test'),
  ('a4700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'stock-removal-other@example.test');
insert into public.workspaces(id, name, tax_mode) values
  ('a4700000-0000-4000-8000-000000000010', 'Bestandsabgang', 'kleinunternehmer_19');
insert into public.workspace_members(workspace_id, user_id, role) values
  ('a4700000-0000-4000-8000-000000000010', 'a4700000-0000-4000-8000-000000000001', 'owner');
select set_config('request.jwt.claim.sub', 'a4700000-0000-4000-8000-000000000001', true);
insert into public.catalog_products(id, workspace_id, title) values
  ('a4700000-0000-4000-8000-000000000020', 'a4700000-0000-4000-8000-000000000010', 'Schuh 42'),
  ('a4700000-0000-4000-8000-000000000021', 'a4700000-0000-4000-8000-000000000010', 'Schuh 43');
insert into public.purchases(id, workspace_id, type, title, entry_status, finalized_at, finalized_by) values
  ('a4700000-0000-4000-8000-000000000030', 'a4700000-0000-4000-8000-000000000010', 'single', 'Schuhe', 'finalized', now(), 'a4700000-0000-4000-8000-000000000001');
insert into public.purchase_lines(id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, unit_purchase_price, line_total) values
  ('a4700000-0000-4000-8000-000000000031', 'a4700000-0000-4000-8000-000000000010', 'a4700000-0000-4000-8000-000000000030',
    'a4700000-0000-4000-8000-000000000020', 'Schuh 42', 'quantity', 3, 3, 0.033333333333, 0.10),
  ('a4700000-0000-4000-8000-000000000032', 'a4700000-0000-4000-8000-000000000010', 'a4700000-0000-4000-8000-000000000030',
    'a4700000-0000-4000-8000-000000000021', 'Schuh 43', 'quantity', 2, 2, 5, 10);
insert into public.stock_lots(id, workspace_id, purchase_id, purchase_line_id, catalog_product_id, received_quantity, remaining_quantity,
  unit_cost, remaining_unit_costs, remaining_tax_unit_costs) values
  ('a4700000-0000-4000-8000-000000000040', 'a4700000-0000-4000-8000-000000000010', 'a4700000-0000-4000-8000-000000000030',
    'a4700000-0000-4000-8000-000000000031', 'a4700000-0000-4000-8000-000000000020', 3, 3, 0.033333333333, array[0.04,0.03,0.03], array[0.04,0.03,0.03]),
  ('a4700000-0000-4000-8000-000000000041', 'a4700000-0000-4000-8000-000000000010', 'a4700000-0000-4000-8000-000000000030',
    'a4700000-0000-4000-8000-000000000032', 'a4700000-0000-4000-8000-000000000021', 2, 2, 5, null, null);
insert into public.inventory_items(id, workspace_id, title, condition, status, allocated_purchase_cost) values
  ('a4700000-0000-4000-8000-000000000050', 'a4700000-0000-4000-8000-000000000010', 'Einzelstück', 'used', 'defective', 7);

select ok(not has_function_privilege('anon', 'public.remove_article_stock(uuid,text,uuid,integer,text,text,text)', 'execute'), 'Anonyme können keinen Bestand entfernen');
select ok(not has_table_privilege('authenticated', 'public.stock_removals', 'insert'), 'Journal ist nicht direkt beschreibbar');
select ok((select relrowsecurity from pg_class where oid = 'public.stock_removals'::regclass), 'Journal hat RLS');
set local role authenticated;
select lives_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','catalog','a4700000-0000-4000-8000-000000000020',1,'damage','Sohle beschädigt','remove-one')$$, 'Ein beschädigtes Stück wird ausgebucht');
select is((select remaining_quantity from stock_lots where id = 'a4700000-0000-4000-8000-000000000040'), 2, 'Drei Stück werden zu zwei');
select is((select received_quantity from stock_lots where id = 'a4700000-0000-4000-8000-000000000040'), 3, 'Ursprünglicher Eingang bleibt erhalten');
select is((select remaining_unit_costs from stock_lots where id = 'a4700000-0000-4000-8000-000000000040'), array[0.03,0.03], 'Restcent gehört zum entfernten Stück');
select is((select remaining_tax_unit_costs from stock_lots where id = 'a4700000-0000-4000-8000-000000000040'), array[0.03,0.03], 'Steuerkosten werden passend gekürzt');
select is((select remaining_quantity from stock_lots where id = 'a4700000-0000-4000-8000-000000000041'), 2, 'Andere Variante bleibt unberührt');
select lives_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','catalog','a4700000-0000-4000-8000-000000000020',1,'damage','Sohle beschädigt','remove-one')$$, 'Wiederholte Antwort bucht nicht doppelt');
select is((select count(*) from stock_removals), 1::bigint, 'Ein Vorgang erzeugt genau einen Abgang');
select throws_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','catalog','a4700000-0000-4000-8000-000000000020',2,'damage','Sohle beschädigt','remove-one')$$, '22023', 'Dieser Buchungsversuch wurde bereits mit anderen Angaben verwendet.', 'Buchungskennung darf nicht umgedeutet werden');
select throws_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','catalog','a4700000-0000-4000-8000-000000000020',3,'loss',null,'too-many')$$, '22023', 'Die Stückzahl übersteigt den vorhandenen, eindeutig zugeordneten Bestand. Lade den Artikel neu.', 'Überbuchung bricht vollständig ab');
select is((select remaining_quantity from stock_lots where id = 'a4700000-0000-4000-8000-000000000040'), 2, 'Fehlgeschlagener Abgang verändert nichts');
select lives_ok($$select public.record_sale('a4700000-0000-4000-8000-000000000010', '{"platform":"test","sale_date":"2026-10-13"}', '[{"catalog_product_id":"a4700000-0000-4000-8000-000000000020","quantity":1,"unit_sale_price":20}]')$$, 'Restbestand bleibt nach einem Abgang verkaufbar');
select is((select cost_of_goods_sold from sale_lines where catalog_product_id = 'a4700000-0000-4000-8000-000000000020'), 0.03::numeric, 'Verkauf übernimmt nur Kosten des verkauften Stücks');
select is((select removed_cost from stock_movements where stock_removal_id is not null), 0.04::numeric, 'Abgang hält seine eigenen Kosten fest');
select lives_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','item','a4700000-0000-4000-8000-000000000050',1,'damage',null,'item-one')$$, 'Auch ein defektes Einzelstück kann entfernt werden');
select is((select status from inventory_items where id = 'a4700000-0000-4000-8000-000000000050'), 'archived', 'Einzelstück ist nicht mehr im Bestand');
select ok((select stock_removed_at is not null from inventory_items where id = 'a4700000-0000-4000-8000-000000000050'), 'Einzelstück hat einen geschützten Abgangszeitpunkt');
select throws_ok($$update inventory_items set status = 'ready' where id = 'a4700000-0000-4000-8000-000000000050'$$, '22023', 'Dieses Stück wurde bereits aus dem Bestand entfernt.', 'Einzelstück kann nicht heimlich wieder aktiviert werden');
select throws_ok($$select public.delete_unused_article('a4700000-0000-4000-8000-000000000010','item','a4700000-0000-4000-8000-000000000050')$$, '23503', 'Dieser Artikel hat einen gebuchten Bestandsabgang. Du kannst ihn archivieren.', 'Löschen zerstört keinen gebuchten Abgang');
select lives_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','catalog','a4700000-0000-4000-8000-000000000021',1,'correction',null,'old-lot')$$, 'Unberührtes älteres Los erhält eine genaue Restkostenfolge');
select is((select remaining_unit_costs from stock_lots where id = 'a4700000-0000-4000-8000-000000000041'), array[5.00], 'Auch ältere Lose behalten richtige Kosten');
reset role;
insert into public.stock_movements(workspace_id, stock_lot_id, direction, quantity, reason) values
  ('a4700000-0000-4000-8000-000000000010', 'a4700000-0000-4000-8000-000000000041', 'out', 1, 'reservation');
set local role authenticated;
select throws_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','catalog','a4700000-0000-4000-8000-000000000021',1,'loss',null,'reserved')$$, '22023', 'Hebe zuerst die Reservierung dieses Artikels auf.', 'Reservierter Bestand kann nicht verschwinden');
reset role;
delete from public.stock_movements where stock_lot_id = 'a4700000-0000-4000-8000-000000000041' and reason = 'reservation';
insert into public.listings(workspace_id, catalog_product_id, title, description, price, price_type, shipping_type) values
  ('a4700000-0000-4000-8000-000000000010', 'a4700000-0000-4000-8000-000000000021', 'Schuh 43', 'Inserat', 20, 'FIXED', 'pickup');
set local role authenticated;
select throws_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','catalog','a4700000-0000-4000-8000-000000000021',1,'loss',null,'listed')$$, '22023', 'Beende zuerst das Inserat dieses Artikels.', 'Inserierte Ware muss zuerst aus dem Angebot genommen werden');
reset role;
delete from public.listings where catalog_product_id = 'a4700000-0000-4000-8000-000000000021';
-- Historische Teilbestände besitzen gegebenenfalls noch keine Stückkostenfolge.
update public.stock_lots set remaining_unit_costs = null where id = 'a4700000-0000-4000-8000-000000000040';
set local role authenticated;
select lives_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','catalog','a4700000-0000-4000-8000-000000000020',1,'loss',null,'last-piece')$$, 'Auch das letzte Stück kann nach einem Teilverkauf ausgebucht werden');
select is((select remaining_quantity from stock_lots where id = 'a4700000-0000-4000-8000-000000000040'), 0, 'Restbestand ist wirklich null');
select is((select sum(removed_cost) from stock_movements where stock_lot_id = 'a4700000-0000-4000-8000-000000000040') +
  (select cost_of_goods_sold from sale_lines where catalog_product_id = 'a4700000-0000-4000-8000-000000000020'), 0.10::numeric, 'Abgänge und Verkauf bewahren den vollständigen ursprünglichen Kostenbetrag');
select set_config('request.jwt.claim.sub', 'a4700000-0000-4000-8000-000000000002', true);
select is((select count(*) from stock_removals), 0::bigint, 'Fremde Benutzer sehen keine Abgänge');
select throws_ok($$select public.remove_article_stock('a4700000-0000-4000-8000-000000000010','catalog','a4700000-0000-4000-8000-000000000021',1,'loss',null,'foreign')$$, '42501', 'Kein Zugriff auf diesen Artikel.', 'Fremder Benutzer kann nichts ausbuchen');
reset role;
select throws_ok($$update stock_removals set reason = 'loss'$$, '42501', 'Gebuchte Bestandsabgänge bleiben unverändert erhalten.', 'Journal bleibt selbst für direkten Serverzugriff unveränderlich');
select is((select count(*) from business_events where workspace_id = 'a4700000-0000-4000-8000-000000000010' and event_type = 'stock_removal_recorded'), 4::bigint, 'Jeder Abgang hat einen Beleg mit Stückzuordnung');
select * from finish();
rollback;
