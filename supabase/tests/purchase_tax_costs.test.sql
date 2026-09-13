\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('d1300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'tax-costs@example.test', '{}', '{}');
insert into public.workspaces (id, name, tax_mode) values
('d1300000-0000-4000-8000-000000000011', 'Tax costs', 'diff_25a'),
('d1300000-0000-4000-8000-000000000012', 'Other workspace', 'diff_25a');
insert into public.workspace_members (workspace_id, user_id, role)
values ('d1300000-0000-4000-8000-000000000011', 'd1300000-0000-4000-8000-000000000001', 'owner');
select set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
insert into public.catalog_products (id, workspace_id, title, tracking_mode)
values ('d1300000-0000-4000-8000-000000000021', 'd1300000-0000-4000-8000-000000000011', 'Identical goods', 'quantity');
create temporary table tax_test_results (name text primary key, id uuid, snapshot jsonb);
grant all on tax_test_results to authenticated;

create function pg_temp.tax_purchase(p_name text, p_price numeric, p_quantity integer, p_costs jsonb, p_kind text default 'individual')
returns uuid language plpgsql as $$
declare result jsonb; purchase_id uuid;
begin
 result := public.create_purchase('d1300000-0000-4000-8000-000000000011',
   jsonb_build_object('type','single','title',p_name,'purchase_date','2026-09-13','purchase_price',round(p_price * p_quantity,2)),
   p_costs, jsonb_build_array(jsonb_build_object('title_snapshot',p_name,'line_kind',p_kind,
     'catalog_product_id',case when p_kind = 'quantity' then 'd1300000-0000-4000-8000-000000000021' else null end,
     'ordered_quantity',p_quantity,'unit_purchase_price',p_price,'line_total',round(p_price * p_quantity,2))));
 purchase_id := (result #>> '{purchase,id}')::uuid;
 insert into tax_test_results(name,id) values(p_name,purchase_id);
 return purchase_id;
end; $$;

select public.finalize_purchase_costing('d1300000-0000-4000-8000-000000000011',
 pg_temp.tax_purchase('seller-shipping',100,1,'[{"type":"shipping","amount":10,"tax_treatment":"purchase_price"},{"type":"other","amount":20,"tax_treatment":"expense"}]'));
select is((select tax_purchase_cost from inventory_items where purchase_id=(select id from tax_test_results where name='seller-shipping')),110::numeric,'Verkäuferleistung erhöht Steuer-EK, Fremdkosten nicht');
select is((select allocated_purchase_cost from inventory_items where purchase_id=(select id from tax_test_results where name='seller-shipping')),130::numeric,'Wareneinsatz enthält beide Kostenarten');
insert into item_costs(inventory_item_id,type,amount)
select id,'repair',15 from inventory_items where purchase_id=(select id from tax_test_results where name='seller-shipping');
insert into tax_test_results(name,id,snapshot)
select 'individual-sale',(result #>> '{sale,id}')::uuid,result from (
 select public.record_sale('d1300000-0000-4000-8000-000000000011', '{"platform":"test","sale_date":"2026-09-13"}',
 jsonb_build_array(jsonb_build_object('inventory_item_id',id,'quantity',1,'unit_sale_price',150))) as result
 from inventory_items where purchase_id=(select id from tax_test_results where name='seller-shipping')
) as result;
select is((select tax_purchase_cost from sale_lines where sale_id=(select id from tax_test_results where name='individual-sale')),110::numeric,'Verkauf übernimmt festen Steuer-EK');
select is((select cost_of_goods_sold from sale_lines where sale_id=(select id from tax_test_results where name='individual-sale')),145::numeric,'Direkte Reparaturkosten zählen ausschließlich zum Wareneinsatz');
select is((select tax_cost_allocations from sale_lines where sale_id=(select id from tax_test_results where name='individual-sale')),'[{"quantity":1,"tax_purchase_cost":110}]'::jsonb,'Stückschnappschuss enthält den steuerlichen Einkaufspreis');
select throws_ok($$update sale_lines set tax_purchase_cost=0,tax_cost_allocations='[{"quantity":1,"tax_purchase_cost":0}]' where sale_id=(select id from tax_test_results where name='individual-sale')$$,'42501','Gebuchte steuerliche Kostensnapshots sind unveränderlich.','Auch privilegierte Kostenkorrekturen überschreiben keinen Steuersnapshot');

select public.finalize_purchase_costing('d1300000-0000-4000-8000-000000000011',pg_temp.tax_purchase('unknown',100,1,'[{"type":"shipping","amount":10}]'));
select is((select tax_purchase_cost from inventory_items where purchase_id=(select id from tax_test_results where name='unknown')),null::numeric,'Fehlende Altklassifizierung bleibt ungeklärt');
select is((select tax_treatment from purchase_costs where purchase_id=(select id from tax_test_results where name='unknown')),null::text,'Keine erfundene Klassifizierung beim Abschluss');
select public.finalize_purchase_costing('d1300000-0000-4000-8000-000000000011',pg_temp.tax_purchase('goods-only',10,1,'[]'));
select is((select tax_purchase_cost from inventory_items where purchase_id=(select id from tax_test_results where name='goods-only')),10::numeric,'Warenbetrag ohne Zusatzkosten ist bekannter Steuer-EK');
select public.reopen_purchase_costing('d1300000-0000-4000-8000-000000000011',(select id from tax_test_results where name='goods-only'));
select is((select tax_purchase_cost from inventory_items where purchase_id=(select id from tax_test_results where name='goods-only')),null::numeric,'Wiederöffnung entfernt den freigegebenen Steuer-EK');

-- Zwei Lose desselben Produkts mit unterschiedlichem Einkaufspreis.
select public.finalize_purchase_costing('d1300000-0000-4000-8000-000000000011',pg_temp.tax_purchase('lot-cheap',20,2,'[]','quantity'));
select public.finalize_purchase_costing('d1300000-0000-4000-8000-000000000011',pg_temp.tax_purchase('lot-expensive',80,1,'[]','quantity'));
insert into tax_test_results(name,id,snapshot)
select 'quantity-sale',(result #>> '{sale,id}')::uuid,result from (
 select public.record_sale('d1300000-0000-4000-8000-000000000011','{"platform":"test","sale_date":"2026-09-13"}',
 '[{"catalog_product_id":"d1300000-0000-4000-8000-000000000021","quantity":3,"unit_sale_price":50}]') as result
) as result;
select is((select tax_purchase_cost from sale_lines where sale_id=(select id from tax_test_results where name='quantity-sale')),120::numeric,'Mehrlosverkauf summiert Steuer-EK exakt');
select is((select tax_cost_allocations from sale_lines where sale_id=(select id from tax_test_results where name='quantity-sale')),'[{"quantity":2,"tax_purchase_cost":40},{"quantity":1,"tax_purchase_cost":80}]'::jsonb,'Gewinn- und Verluststücke bleiben im Snapshot getrennte Gruppen');
select is((select sum(tax_purchase_cost) from sale_line_lot_allocations where sale_line_id in(select id from sale_lines where sale_id=(select id from tax_test_results where name='quantity-sale'))),120::numeric,'Loszuordnung trägt denselben Steuer-EK');
select ok(not exists(select 1 from stock_lots where catalog_product_id='d1300000-0000-4000-8000-000000000021' and (remaining_quantity <> 0 or cardinality(remaining_tax_unit_costs) <> 0)),'Verkauf verbraucht Menge und steuerliche Kostenfolge zusammen');
select public.record_sale_return('d1300000-0000-4000-8000-000000000011',(select id from tax_test_results where name='quantity-sale'),150,true,'Rückgabe',null,'restock_ready',null);
select is((select sum(remaining_quantity) from stock_lots where catalog_product_id='d1300000-0000-4000-8000-000000000021'),3::bigint,'Retoure lagert die vollständige Menge wieder ein');
select is((select sum(value) from stock_lots cross join lateral unnest(remaining_tax_unit_costs) as value where catalog_product_id='d1300000-0000-4000-8000-000000000021'),120::numeric,'Retoure stellt den steuerlichen Kostenbestand wieder her');
insert into tax_test_results(name,id)
select 'resale',(public.record_sale('d1300000-0000-4000-8000-000000000011','{"platform":"test","sale_date":"2026-09-13"}',
 '[{"catalog_product_id":"d1300000-0000-4000-8000-000000000021","quantity":1,"unit_sale_price":50}]') #>> '{sale,id}')::uuid;
select is((select tax_purchase_cost from sale_lines where sale_id=(select id from tax_test_results where name='resale')),20::numeric,'Erneuter Teilverkauf übernimmt richtige Stückkosten');

-- Korrektur verändert verfügbare Steuerkosten, gebuchte Werte bleiben erhalten.
select public.correct_purchase_costing('d1300000-0000-4000-8000-000000000011',
 (select id from tax_test_results where name='lot-cheap'),'Kaufpreis laut korrigiertem Beleg',null,
 (select jsonb_agg(jsonb_build_object('id',id,'catalog_product_id',catalog_product_id,
 'title_snapshot',title_snapshot,'line_kind',line_kind,'ordered_quantity',ordered_quantity,
 'price_mode',price_mode,'unit_purchase_price',30,'line_total',60,
 'condition_snapshot',condition_snapshot,'estimated_market_value',estimated_market_value))
 from purchase_lines where purchase_id=(select id from tax_test_results where name='lot-cheap')),'[]');
select is((select tax_purchase_cost from sale_lines where sale_id=(select id from tax_test_results where name='resale')),20::numeric,'Kostenkorrektur lässt Steuer-EK des gebuchten Teilverkaufs unverändert');
select is((select tax_purchase_cost from sale_lines where sale_id=(select id from tax_test_results where name='quantity-sale')),120::numeric,'Kostenkorrektur lässt auch den retournierten Verkaufssnapshot unverändert');
select is((select sum(value) from stock_lots cross join lateral unnest(remaining_tax_unit_costs) as value
 where purchase_id=(select id from tax_test_results where name='lot-cheap')),30::numeric,'Noch verfügbares Stück bekommt den korrigierten Steuer-EK');
select public.record_sale_return('d1300000-0000-4000-8000-000000000011',(select id from tax_test_results where name='resale'),50,true,'Rückgabe nach Kostenkorrektur',null,'restock_ready',null);
select is((select sum(value) from stock_lots cross join lateral unnest(remaining_tax_unit_costs) as value
 where purchase_id=(select id from tax_test_results where name='lot-cheap')),60::numeric,'Retoure nach Korrektur verwendet aktuelle Kosten und bewahrt alte Verkaufssnapshots');
select public.correct_purchase_costing('d1300000-0000-4000-8000-000000000011',
 (select id from tax_test_results where name='seller-shipping'),'Verkäuferbeleg geklärt',null,
 (select jsonb_agg(jsonb_build_object('id',id,'catalog_product_id',catalog_product_id,
 'title_snapshot',title_snapshot,'line_kind',line_kind,'ordered_quantity',ordered_quantity,
 'price_mode',price_mode,'unit_purchase_price',unit_purchase_price,'line_total',line_total,
 'condition_snapshot',condition_snapshot,'estimated_market_value',estimated_market_value))
 from purchase_lines where purchase_id=(select id from tax_test_results where name='seller-shipping')),
 (select jsonb_agg(jsonb_build_object('id',id,'type',type,'amount',amount,'description',description,
 'allocation_method',allocation_method,'target_purchase_line_id',target_purchase_line_id,'tax_treatment','expense'))
 from purchase_costs where purchase_id=(select id from tax_test_results where name='seller-shipping')));
select is((select tax_purchase_cost from inventory_items where purchase_id=(select id from tax_test_results where name='seller-shipping')),100::numeric,'Korrektur übernimmt ausdrückliche neue Kostenklassifizierung');
select is((select tax_purchase_cost from sale_lines where sale_id=(select id from tax_test_results where name='individual-sale')),110::numeric,'Klassifizierungskorrektur verändert gebuchte Steuer-EK nicht');
select is((select cost_of_goods_sold from sale_lines where sale_id=(select id from tax_test_results where name='individual-sale')),145::numeric,'Reparaturkosten bleiben bei Korrektur im betriebswirtschaftlichen Wareneinsatz');

-- Centaufteilung eines bereits eingegangenen Loses: 10 Euro / 3 Stück.
select pg_temp.tax_purchase('rounding',3.3333333333333333,3,'[]','quantity');
select public.receive_purchase_lines('d1300000-0000-4000-8000-000000000011',
 (select id from tax_test_results where name='rounding'),
 (select jsonb_agg(jsonb_build_object('purchase_line_id',id,'received_quantity',3,'received_at','2026-09-12T12:00:00Z'))
 from purchase_lines where purchase_id=(select id from tax_test_results where name='rounding')));
select public.finalize_purchase_costing('d1300000-0000-4000-8000-000000000011',(select id from tax_test_results where name='rounding'));
select is((select remaining_tax_unit_costs from stock_lots where purchase_id=(select id from tax_test_results where name='rounding')),array[3.34,3.33,3.33]::numeric[],'Bereits vorhandenes Los bekommt eine centgenaue Stückkostenfolge');
insert into tax_test_results(name,id)
select 'rounding-sale',(public.record_sale('d1300000-0000-4000-8000-000000000011','{"platform":"test","sale_date":"2026-09-13"}',
 '[{"catalog_product_id":"d1300000-0000-4000-8000-000000000021","quantity":1,"unit_sale_price":10}]') #>> '{sale,id}')::uuid;
select is((select tax_purchase_cost from sale_lines where sale_id=(select id from tax_test_results where name='rounding-sale')),3.34::numeric,'Erster Teilverkauf konsumiert den tatsächlichen Restcent');
select is((select remaining_tax_unit_costs from stock_lots where purchase_id=(select id from tax_test_results where name='rounding')),array[3.33,3.33]::numeric[],'Verbleibende Kosten werden nicht erneut aus einem Durchschnitt gerundet');

select lives_ok($$update stock_lots set remaining_tax_unit_costs=array[3.3300,3.3300]::numeric[]
 where purchase_id=(select id from tax_test_results where name='rounding')$$,'Nachgestellte Nullen ändern die Centgenauigkeit nicht');
insert into tax_test_results(name,id)
select 'trailing-zero-sale',(public.record_sale('d1300000-0000-4000-8000-000000000011','{"platform":"test","sale_date":"2026-09-13"}',
 '[{"catalog_product_id":"d1300000-0000-4000-8000-000000000021","quantity":1,"unit_sale_price":10}]') #>> '{sale,id}')::uuid;
select is((select tax_cost_allocations from sale_lines where sale_id=(select id from tax_test_results where name='trailing-zero-sale')),
 '[{"quantity":1,"tax_purchase_cost":3.33}]'::jsonb,'Auch JSON-Kostensnapshots akzeptieren centgenaue Werte mit nachgestellten Nullen');
select throws_ok($$update stock_lots set remaining_tax_unit_costs=array[3.331]::numeric[]
 where purchase_id=(select id from tax_test_results where name='rounding')$$,'22023','Die steuerliche Stückkostenfolge passt nicht zum verfügbaren Bestand.','Echte Bruchteile eines Cents bleiben gesperrt');

-- Änderungs-RPC übernimmt Klassifizierung und hält sie in der Chronik fest.
select pg_temp.tax_purchase('draft-update',10,1,'[{"type":"shipping","amount":2}]');
select public.update_purchase_draft('d1300000-0000-4000-8000-000000000011',
 (select id from tax_test_results where name='draft-update'),
 '{"type":"single","title":"draft-update","purchase_date":"2026-09-13","purchase_price":10}',
 '[{"type":"shipping","amount":2,"tax_treatment":"purchase_price"}]',
 '[{"client_ref":"draft-line","title_snapshot":"draft-update","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":10,"line_total":10}]');
select is((select tax_treatment from purchase_costs where purchase_id=(select id from tax_test_results where name='draft-update')),'purchase_price','Entwurfsänderung speichert Kostenklassifizierung');
select ok(exists(select 1 from business_events where entity_id=(select id from tax_test_results where name='draft-update')
 and event_type='purchase_draft_updated' and changes::text like '%tax_treatment%'),'Klassifizierung ist im Änderungsjournal enthalten');

-- Nachtrag eines bereits früher verkauften Altbestands: Betriebskosten ja, Steuer-EK ungeklärt.
select set_config('flipbase.allow_inventory_sold_transition','on',true);
insert into inventory_items(id,workspace_id,title,status,allocated_purchase_cost)
values('d1300000-0000-4000-8000-000000000099','d1300000-0000-4000-8000-000000000011','Historisches Stück','sold',100);
insert into item_costs(inventory_item_id,type,amount)
values('d1300000-0000-4000-8000-000000000099','repair',20);
select public.record_legacy_inventory_sale('d1300000-0000-4000-8000-000000000011','d1300000-0000-4000-8000-000000000099',
 '{"platform":"direct","sale_date":"2026-09-12","unit_sale_price":150}','Verkaufsbeleg nachgetragen');
select is((select cost_of_goods_sold from sale_lines where inventory_item_id='d1300000-0000-4000-8000-000000000099'),120::numeric,'Auch beim historischen Verkaufsnachtrag bleiben Reparaturkosten im Wareneinsatz');
select is((select tax_purchase_cost from sale_lines where inventory_item_id='d1300000-0000-4000-8000-000000000099'),null::numeric,'Historischer Verkaufsnachtrag erfindet keinen Steuer-EK');

-- Derselbe Waren-/Zusatzkostenrestcent muss bei Betriebskosten und Steuer-EK am selben Stück bleiben.
select pg_temp.tax_purchase('component-rounding',3.3333333333333333,3,'[{"type":"shipping","amount":0.01,"tax_treatment":"purchase_price"}]','quantity');
select public.receive_purchase_lines('d1300000-0000-4000-8000-000000000011',
 (select id from tax_test_results where name='component-rounding'),
 (select jsonb_agg(jsonb_build_object('purchase_line_id',id,'received_quantity',3,'received_at','2026-09-11T12:00:00Z'))
 from purchase_lines where purchase_id=(select id from tax_test_results where name='component-rounding')));
select public.finalize_purchase_costing('d1300000-0000-4000-8000-000000000011',(select id from tax_test_results where name='component-rounding'));
select is((select remaining_tax_unit_costs from stock_lots where purchase_id=(select id from tax_test_results where name='component-rounding')),array[3.35,3.33,3.33]::numeric[],'Steuer-EK benutzt dieselben Waren-/Zusatzkostenrestcents wie der betriebliche Kostenplan');
select is((select remaining_unit_costs from stock_lots where purchase_id=(select id from tax_test_results where name='component-rounding')),array[3.35,3.33,3.33]::numeric[],'Bestehendes Los bewahrt auch die betrieblichen Stückkosten exakt');
insert into tax_test_results(name,id)
select 'component-sale',(public.record_sale('d1300000-0000-4000-8000-000000000011','{"platform":"test","sale_date":"2026-09-13"}',
 '[{"catalog_product_id":"d1300000-0000-4000-8000-000000000021","quantity":1,"unit_sale_price":10}]') #>> '{sale,id}')::uuid;
select is((select cost_of_goods_sold from sale_lines where sale_id=(select id from tax_test_results where name='component-sale')),3.35::numeric,'FIFO rundet den Wareneinsatz nicht erneut aus dem Losdurchschnitt');
select is((select tax_purchase_cost from sale_lines where sale_id=(select id from tax_test_results where name='component-sale')),3.35::numeric,'Steuer-EK und Wareneinsatz stimmen beim verkauften Restcent-Stück überein');
select public.record_sale_return('d1300000-0000-4000-8000-000000000011',(select id from tax_test_results where name='component-sale'),10,true,'Restcent-Stück zurück',null,'restock_ready',null);
select is((select remaining_unit_costs from stock_lots where purchase_id=(select id from tax_test_results where name='component-rounding')),array[3.33,3.33,3.35]::numeric[],'Retoure bewahrt betriebliche Stückkosten und fügt das zurückgegebene Stück hinten an');
select is((select remaining_tax_unit_costs from stock_lots where purchase_id=(select id from tax_test_results where name='component-rounding')),array[3.33,3.33,3.35]::numeric[],'Retoure verwendet für Steuer-EK dieselbe Stückreihenfolge');
insert into tax_test_results(name,id)
select 'component-resale',(public.record_sale('d1300000-0000-4000-8000-000000000011','{"platform":"test","sale_date":"2026-09-13"}',
 '[{"catalog_product_id":"d1300000-0000-4000-8000-000000000021","quantity":3,"unit_sale_price":10}]') #>> '{sale,id}')::uuid;
select is((select tax_cost_allocations from sale_lines where sale_id=(select id from tax_test_results where name='component-resale')),'[{"quantity":2,"tax_purchase_cost":6.66},{"quantity":1,"tax_purchase_cost":3.35}]'::jsonb,'Erneuter Verkauf bewahrt die einzelnen Einkaufspreise nach der Retoure');
select is((select cost_of_goods_sold from sale_lines where sale_id=(select id from tax_test_results where name='component-resale')),10.01::numeric,'Erneuter Verkauf erhält den exakten betrieblichen Gesamtkostenpool');
select public.finalize_purchase_costing('d1300000-0000-4000-8000-000000000011',
 pg_temp.tax_purchase('component-cohort',3.3333333333333333,3,'[{"type":"shipping","amount":0.01,"tax_treatment":"purchase_price"}]','quantity'));
select ok(not exists(select 1 from stock_lots where purchase_id=(select id from tax_test_results where name='component-cohort')
 and remaining_unit_costs is distinct from remaining_tax_unit_costs),'Neu erzeugte Kostenkohorten verwenden ebenfalls identische Stückkostenfolgen');

-- Eingabe-/Schutz- und Mandantenregressionen.
set local role authenticated;
select throws_ok($$update inventory_items set tax_purchase_cost=999 where purchase_id=(select id from tax_test_results where name='unknown')$$,'42501',null,'Direkte Steuerwertänderung wird gesperrt');
select throws_ok($$select public.finalize_purchase_costing('d1300000-0000-4000-8000-000000000012',(select id from tax_test_results where name='unknown'))$$,'42501','Kein Zugriff auf diesen Workspace.','Steuer-EK kann nicht für fremden Workspace freigegeben werden');
select throws_ok($$select pg_temp.tax_purchase('invalid',10,1,'[{"type":"shipping","amount":10,"tax_treatment":"guess"}]')$$,'23514',null,'Ungültige Kostenklassifizierung wird abgelehnt');
reset role;
select ok(not has_function_privilege('authenticated','public.tax_cost_allocations(numeric[])','execute'),'Interner Snapshot-Helfer ist keine öffentliche RPC');
select * from finish();
rollback;
