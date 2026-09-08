\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

-- Additiver Vertrag: zunächst gegen den alten Stand rot, Ausführung nur in CI.
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'catalog_products' and column_name = 'tracking_mode'), '''quantity''::text', 'Neue Produkte verwenden standardmäßig Mengenführung');
select ok(exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'catalog_products' and column_name = 'condition' and is_nullable = 'YES' and column_default is null), 'Produktzustand ist optional und ohne erfundenen Default');
select ok(exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'catalog_products' and column_name = 'condition_notes' and is_nullable = 'YES' and column_default is null), 'Zustandsnotiz ist ein getrenntes optionales Feld');
select ok(exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_lots' and column_name = 'unit_cost' and is_nullable = 'YES' and column_default is null), 'Offene Loskosten erlauben NULL ohne Default');
select ok(exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sale_line_lot_allocations' and column_name = 'unit_cost' and is_nullable = 'NO'), 'Verkaufszuordnungen benötigen weiterhin bekannte Kosten');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'catalog_products' and indexdef like '%(workspace_id, ean)%' and indexdef not like 'CREATE UNIQUE%'), 'EAN-Suche besitzt einen nicht eindeutigen Workspace-Index');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('b9200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'product-contract@example.test', '{}', '{}');
insert into public.workspaces (id, name) values
  ('b9200000-0000-4000-8000-000000000011', 'Produktvertrag'),
  ('b9200000-0000-4000-8000-000000000012', 'Fremder Produktvertrag');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('b9200000-0000-4000-8000-000000000011', 'b9200000-0000-4000-8000-000000000001', 'owner');
insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('b9200000-0000-4000-8000-000000000021', 'b9200000-0000-4000-8000-000000000011', 'Mengenprodukt', 'quantity'),
  ('b9200000-0000-4000-8000-000000000022', 'b9200000-0000-4000-8000-000000000011', 'Kostenloses Produkt', 'quantity'),
  ('b9200000-0000-4000-8000-000000000023', 'b9200000-0000-4000-8000-000000000011', 'FIFO-Produkt', 'quantity'),
  ('b9200000-0000-4000-8000-000000000024', 'b9200000-0000-4000-8000-000000000012', 'Fremdes Produkt', 'quantity'),
  ('b9200000-0000-4000-8000-000000000025', 'b9200000-0000-4000-8000-000000000011', 'Legacy-Produkt', 'individual');

create temporary table contract_input as select
  'b9200000-0000-4000-8000-000000000011'::uuid as workspace_id,
  '{"type":"lot","title":"Produktvertrag","purchase_date":"2026-09-08","purchase_price":160,"cost_allocation_mode":"even"}'::jsonb as purchase,
  '[{"catalog_product_id":"b9200000-0000-4000-8000-000000000021","title_snapshot":"Mengenprodukt","line_kind":"quantity","ordered_quantity":1,"unit_purchase_price":10,"line_total":10},{"catalog_product_id":"b9200000-0000-4000-8000-000000000021","title_snapshot":"Mengenprodukt","line_kind":"quantity","ordered_quantity":3,"unit_purchase_price":10,"line_total":30},{"catalog_product_id":"b9200000-0000-4000-8000-000000000021","title_snapshot":"Mengenprodukt","line_kind":"quantity","ordered_quantity":12,"unit_purchase_price":10,"line_total":120}]'::jsonb as lines;
create temporary table contract_purchases (label text primary key, id uuid not null);
grant select, update on contract_input to authenticated;
grant select, insert on contract_purchases to authenticated;
select set_config('request.jwt.claim.sub', 'b9200000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok($$insert into public.catalog_products (id, workspace_id, title) values ('b9200000-0000-4000-8000-000000000026', 'b9200000-0000-4000-8000-000000000011', 'Ohne Trackingangabe')$$, 'Produkt kann ohne expliziten Trackingmodus angelegt werden');
select is((select tracking_mode from public.catalog_products where id = 'b9200000-0000-4000-8000-000000000026'), 'quantity', 'Produkt ohne Trackingangabe ist mengenfähig');
select is((select count(*) from public.stock_lots where catalog_product_id = 'b9200000-0000-4000-8000-000000000026'), 0::bigint, 'Produktanlage erzeugt keinen Bestand');
select lives_ok($$insert into public.catalog_products (id, workspace_id, title, tracking_mode, ean, condition, condition_notes) values
  ('b9200000-0000-4000-8000-000000000027', 'b9200000-0000-4000-8000-000000000011', 'Neu', 'quantity', '1234567890123', 'new', null),
  ('b9200000-0000-4000-8000-000000000028', 'b9200000-0000-4000-8000-000000000011', 'Gebraucht', 'quantity', '1234567890123', 'used', 'Kratzer am Gehäuse')$$, 'Gleiche EAN darf verschiedene Produktzustände mit getrennten IDs besitzen');
select is((select count(distinct id) from public.catalog_products where ean = '1234567890123'), 2::bigint, 'Zustandsvarianten behalten getrennte Produktidentitäten');
select throws_ok($$update public.catalog_products set condition = 'unknown' where id = 'b9200000-0000-4000-8000-000000000021'$$, '23514', null, 'Ungültiger Produktzustand wird abgelehnt');
select lives_ok($$do $body$ declare v_condition text; begin
  foreach v_condition in array array['new','like_new','very_good','used','heavily_used','defective'] loop
    update public.catalog_products set condition = v_condition where id = 'b9200000-0000-4000-8000-000000000021';
  end loop;
  update public.catalog_products set condition = null, condition_notes = 'Freitext ohne Enumzwang' where id = 'b9200000-0000-4000-8000-000000000021';
end $body$;$$, 'Alle sechs Zustände und der offene Zustand sind zulässig');
select lives_ok($$update public.catalog_products set title = 'Legacy bleibt bearbeitbar' where id = 'b9200000-0000-4000-8000-000000000025'$$, 'Bestehende Individual-Produkte bleiben bearbeitbar');

insert into contract_purchases select 'main', (public.create_purchase(workspace_id, purchase, '[]', lines) #>> '{purchase,id}')::uuid from contract_input;
insert into contract_purchases select 'add', (public.create_purchase(workspace_id, purchase || '{"purchase_price":10}', '[]', '[]') #>> '{purchase,id}')::uuid from contract_input;
select is((select array_agg(ordered_quantity order by ordered_quantity) from public.purchase_lines where purchase_id = (select id from contract_purchases where label = 'main')), array[1,3,12], 'Ein Produkt unterstützt Mengen 1, 3 und 12');
select is((select count(distinct catalog_product_id) from public.purchase_lines where purchase_id = (select id from contract_purchases where label = 'main')), 1::bigint, 'Alle Mengen referenzieren dieselbe Produktidentität');

-- Create/Add/Update müssen denselben Produkt-, Workspace- und Zeilenvertrag prüfen.
select throws_ok(format('select public.%I(%L::uuid,%s)', operation,
  (select workspace_id from contract_input),
  case when operation = 'create_purchase' then format('%L::jsonb,''[]''::jsonb,%L::jsonb', (select purchase from contract_input), invalid.lines)
    when operation = 'add_purchase_lines' then format('%L::uuid,%L::jsonb', (select id from contract_purchases where label = 'add'), invalid.lines)
    else format('%L::uuid,%L::jsonb,''[]''::jsonb,%L::jsonb', (select id from contract_purchases where label = 'add'), (select purchase from contract_input), invalid.lines) end),
  '22023', 'Die Einkaufspositionen sind ungültig.', operation || ': ' || invalid.label)
from (values ('create_purchase'), ('add_purchase_lines'), ('update_purchase_draft')) as operations(operation)
cross join lateral (
  select 'Fremdes Workspaceprodukt' as label, jsonb_build_array((lines -> 0) || '{"catalog_product_id":"b9200000-0000-4000-8000-000000000024"}') as lines from contract_input
  union all select 'Individual mit Produkt', jsonb_build_array((lines -> 0) || '{"line_kind":"individual"}') from contract_input
  union all select 'Quantity ohne Produkt', jsonb_build_array((lines -> 0) || '{"catalog_product_id":null}') from contract_input
  union all select 'Quantity mit Individual-Produkt', jsonb_build_array((lines -> 0) || '{"catalog_product_id":"b9200000-0000-4000-8000-000000000025"}') from contract_input
) as invalid;
select is((select count(*) from public.purchases where workspace_id = (select workspace_id from contract_input)), 2::bigint, 'Abgewiesene Produktzuordnungen hinterlassen keinen Einkauf');
select is((select count(*) from public.purchase_lines where purchase_id = (select id from contract_purchases where label = 'add')), 0::bigint, 'Abgewiesene Ergänzungen und Updates hinterlassen keine Position');
select lives_ok($$select public.add_purchase_lines(workspace_id, (select id from contract_purchases where label = 'add'), jsonb_build_array((lines -> 0) || '{"catalog_product_id":null,"line_kind":"individual"}')) from contract_input$$, 'Kompatibler bekannter Legacy-Einkauf darf produktlose Individual-Zeile ergänzen');

select public.receive_purchase_lines(input.workspace_id, purchase.id,
  (select jsonb_agg(jsonb_build_object('purchase_line_id', line.id, 'received_quantity', line.ordered_quantity, 'received_at', '2026-09-08T08:00:00Z')) from public.purchase_lines as line where line.purchase_id = purchase.id))
from contract_input as input cross join contract_purchases as purchase where purchase.label = 'main';
select is((select count(*) from public.stock_lots where purchase_id = (select id from contract_purchases where label = 'main') and unit_cost is null), 3::bigint, 'Empfang schreibt für alle drei offenen Lose NULL-Kosten');
select is((select sum(remaining_quantity) from public.stock_lots where purchase_id = (select id from contract_purchases where label = 'main')), 16::bigint, 'Empfang erhält die gesamte Produktmenge');
select throws_ok($$select public.record_sale(workspace_id, '{"platform":"direct","sale_date":"2026-09-08"}', '[{"catalog_product_id":"b9200000-0000-4000-8000-000000000021","quantity":1,"unit_sale_price":20}]') from contract_input$$, '22023', 'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.', 'Offener Bestand bleibt unverkäuflich');
select is((select count(*) from public.sales where workspace_id = (select workspace_id from contract_input)), 0::bigint, 'Abgewiesener Verkauf schreibt keinen Verkaufskopf');
select is((select sum(remaining_quantity) from public.stock_lots where purchase_id = (select id from contract_purchases where label = 'main')), 16::bigint, 'Abgewiesener Verkauf verbraucht keinen Bestand');

select public.finalize_purchase_costing(workspace_id, (select id from contract_purchases where label = 'main')) from contract_input;
select is((select count(*) from public.stock_lots where purchase_id = (select id from contract_purchases where label = 'main') and unit_cost is null), 0::bigint, 'Finalisierung hinterlässt kein unbewertetes Los');
select is((select sum(round(received_quantity * unit_cost, 2)) from public.stock_lots where purchase_id = (select id from contract_purchases where label = 'main')), 160::numeric, 'Finalisierte Loskosten stimmen centgenau mit 16 mal 10 überein');

reset role;
create temporary table contract_receipts as select to_jsonb(lot) - 'unit_cost' as lot, (select jsonb_agg(to_jsonb(movement) order by movement.id) from public.stock_movements as movement where movement.stock_lot_id = lot.id) as movements from public.stock_lots as lot where lot.purchase_id = (select id from contract_purchases where label = 'main');
grant select on contract_receipts to authenticated;
set local role authenticated;
select public.reopen_purchase_costing(workspace_id, (select id from contract_purchases where label = 'main')) from contract_input;
select is((select count(*) from public.stock_lots where purchase_id = (select id from contract_purchases where label = 'main') and unit_cost is null), 3::bigint, 'Wiederöffnen stellt offene Kosten ausdrücklich als NULL dar');
select results_eq($$select to_jsonb(lot) - 'unit_cost', (select jsonb_agg(to_jsonb(movement) order by movement.id) from public.stock_movements as movement where movement.stock_lot_id = lot.id) from public.stock_lots as lot where lot.purchase_id = (select id from contract_purchases where label = 'main') order by lot.id$$, $$select lot, movements from contract_receipts order by lot ->> 'id'$$, 'Wiederöffnen bewahrt Los-IDs, Mengen, Zeitpunkte und vollständige Empfangshistorie');

insert into contract_purchases select 'free', (public.create_purchase(workspace_id, purchase || '{"purchase_price":0}', '[]', jsonb_build_array((lines -> 0) || '{"catalog_product_id":"b9200000-0000-4000-8000-000000000022","unit_purchase_price":0,"line_total":0}')) #>> '{purchase,id}')::uuid from contract_input;
select public.finalize_purchase_costing(workspace_id, (select id from contract_purchases where label = 'free')) from contract_input;
select is((select unit_cost from public.stock_lots where purchase_id = (select id from contract_purchases where label = 'free')), 0::numeric, 'Tatsächlich kostenlose Ware bleibt nach Finalisierung numerisch 0');

insert into contract_purchases select 'fifo', (public.create_purchase(workspace_id, purchase || '{"purchase_price":65}', '[]', '[{"catalog_product_id":"b9200000-0000-4000-8000-000000000023","title_snapshot":"FIFO 10","line_kind":"quantity","ordered_quantity":2,"unit_purchase_price":10,"line_total":20},{"catalog_product_id":"b9200000-0000-4000-8000-000000000023","title_snapshot":"FIFO 15","line_kind":"quantity","ordered_quantity":3,"unit_purchase_price":15,"line_total":45}]') #>> '{purchase,id}')::uuid from contract_input;
select public.receive_purchase_lines(workspace_id, (select id from contract_purchases where label = 'fifo'), (select jsonb_agg(jsonb_build_object('purchase_line_id', id, 'received_quantity', ordered_quantity, 'received_at', case when unit_purchase_price = 10 then '2026-09-08T08:00:00Z' else '2026-09-08T09:00:00Z' end)) from public.purchase_lines where purchase_id = (select id from contract_purchases where label = 'fifo'))) from contract_input;
select public.finalize_purchase_costing(workspace_id, (select id from contract_purchases where label = 'fifo')) from contract_input;
select public.record_sale(workspace_id, '{"platform":"direct","sale_date":"2026-09-08"}', '[{"catalog_product_id":"b9200000-0000-4000-8000-000000000023","quantity":3,"unit_sale_price":20}]') from contract_input;
select is((select cost_of_goods_sold from public.sale_lines where catalog_product_id = 'b9200000-0000-4000-8000-000000000023'), 35::numeric, 'FIFO verbraucht 2 mal 10 plus 1 mal 15 für einen Verkauf von 3');
select results_eq($$select allocation.quantity, allocation.unit_cost from public.sale_line_lot_allocations as allocation join public.sale_lines as line on line.id = allocation.sale_line_id where line.catalog_product_id = 'b9200000-0000-4000-8000-000000000023' order by allocation.unit_cost$$, $$values (2,10::numeric), (1,15::numeric)$$, 'FIFO-Zuordnungen speichern beide bekannten Kostenkohorten');

-- Nur Fixture-Manipulation als postgres: finalisiert, aber unbewertet.
reset role;
select lives_ok($$update public.stock_lots set unit_cost = null where purchase_id = (select id from contract_purchases where label = 'free')$$, 'Fixture kann inkonsistente finalisierte NULL-Kosten darstellen');
create temporary table contract_before_invalid_sale as select
  (select count(*) from public.sales) as sales,
  (select count(*) from public.sale_lines) as lines,
  (select count(*) from public.sale_line_lot_allocations) as allocations,
  (select count(*) from public.stock_movements) as movements,
  (select jsonb_agg(to_jsonb(lot) order by lot.id) from public.stock_lots as lot) as lots;
grant select on contract_before_invalid_sale to authenticated;
set local role authenticated;
select throws_ok($$select public.record_sale(workspace_id, '{"platform":"direct","sale_date":"2026-09-08"}', '[{"catalog_product_id":"b9200000-0000-4000-8000-000000000022","quantity":1,"unit_sale_price":20}]') from contract_input$$, '22023', 'Die aktiven Kosten eines historischen Loses müssen vor dem Verkauf geprüft werden.', 'Gelockter FIFO-Pfad lehnt auch finalisierte NULL-Kosten ausdrücklich ab');
reset role;
select results_eq($$select (select count(*) from public.sales), (select count(*) from public.sale_lines), (select count(*) from public.sale_line_lot_allocations), (select count(*) from public.stock_movements), (select jsonb_agg(to_jsonb(lot) order by lot.id) from public.stock_lots as lot)$$, $$select * from contract_before_invalid_sale$$, 'NULL-Kosten-Verkauf ist atomar: Köpfe, Zeilen, Zuordnungen, Bewegungen und Lose unverändert');

select ok(not has_table_privilege('authenticated', 'public.stock_lots', 'INSERT') and not has_table_privilege('authenticated', 'public.stock_lots', 'UPDATE') and not has_table_privilege('authenticated', 'public.stock_lots', 'DELETE'), 'Echte Bestandstabelle bleibt für direkte Client-Schreibzugriffe gesperrt');
-- Der echte Guard wird isoliert hinter der vorgeschalteten Tabellen-ACL geprüft.
-- LIKE erhält Spaltentypen, Defaults, NULL-Vertrag und Checks des aktuellen Schemas.
create temporary table contract_lot_guard (like public.stock_lots including defaults including constraints);
create trigger contract_lot_costing_guard before insert or update on contract_lot_guard
for each row execute function public.guard_stock_lot_costing_fields();
insert into contract_lot_guard select * from public.stock_lots where purchase_id = (select id from contract_purchases where label = 'main');
grant select, insert, update on contract_lot_guard to authenticated;
set local role authenticated;
select throws_ok($$update contract_lot_guard set unit_cost = 1$$, '42501', 'Bestandskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.', 'Guard verbietet direkte Kostenänderungen durch Clients');
select throws_ok($$insert into contract_lot_guard (workspace_id, purchase_id, purchase_line_id, catalog_product_id, received_quantity, remaining_quantity, unit_cost) select workspace_id, purchase_id, id, catalog_product_id, 1, 1, 0 from public.purchase_lines where purchase_id = (select id from contract_purchases where label = 'main') and ordered_quantity = 1$$, '42501', 'Bestandskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.', 'Guard verbietet auch direkte Client-Kostenbelegung mit 0');
select lives_ok($$insert into contract_lot_guard (workspace_id, purchase_id, purchase_line_id, catalog_product_id, received_quantity, remaining_quantity, unit_cost) select workspace_id, purchase_id, id, catalog_product_id, 1, 1, null from public.purchase_lines where purchase_id = (select id from contract_purchases where label = 'main') and ordered_quantity = 1$$, 'Guard erlaubt beim unbewerteten Insert ausschließlich NULL-Kosten');
reset role;
select throws_ok($$update public.stock_lots set unit_cost = -1 where purchase_id = (select id from contract_purchases where label = 'free')$$, '23514', null, 'Nichtnegativ-Check für bekannte Loskosten bleibt erhalten');
select * from finish();
rollback;
