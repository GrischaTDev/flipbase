\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select plan(1);
do $$
declare
  u uuid := gen_random_uuid(); w uuid := gen_random_uuid(); p uuid; result jsonb; product uuid:=gen_random_uuid(); stock_line uuid; sale uuid;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
  values(u,'authenticated','authenticated',u::text||'@example.test','{}','{}');
  insert into public.workspaces(id,name) values(w,'Freier Einkauf');
  insert into public.workspace_members(workspace_id,user_id,role) values(w,u,'owner');
  perform set_config('request.jwt.claim.sub',u::text,true);
  result := public.create_purchase(w,jsonb_build_object('request_id',gen_random_uuid(),
    'type','lot','title','10-kg-Kleidungspaket','purchase_date','2026-11-04',
    'purchase_price',300,'pricing_mode','individual','content_status','known',
    'cost_allocation_mode','even','discount_amount',0), '[]',
    '[{"position_kind":"free","client_ref":"free-1","title_snapshot":"10-kg-Kleidungspaket","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":300,"line_total":300,"allocated_additional_cost":0}]');
  p := (result#>>'{purchase,id}')::uuid;
  perform public.finalize_purchase_costing(w,p);
  if not exists(select 1 from public.purchases where id=p and entry_status='finalized' and total_purchase_cost=300) then raise exception 'Freier Einkauf nicht abgeschlossen'; end if;
  if exists(select 1 from public.inventory_items where workspace_id=w) or exists(select 1 from public.stock_lots where workspace_id=w) then raise exception 'Ungewollte Bestandsanlage'; end if;
  if exists(select 1 from public.purchase_lines where purchase_id=p and received_quantity<>0) then raise exception 'Finanzieller Abschluss behauptet einen Wareneingang'; end if;
  result := public.record_sale(w,jsonb_build_object('booking_key',gen_random_uuid(),'platform','direct','sale_date','2026-11-04'),
    jsonb_build_array(jsonb_build_object('position_kind','free','purchase_id',p,'title_snapshot','Pullover','quantity',1,'unit_sale_price',25)));
  if not exists(select 1 from public.sale_lines where sale_id=(result#>>'{sale,id}')::uuid and purchase_id=p and cost_of_goods_sold is null) then raise exception 'Einkaufsbezug fehlt oder verteilt den Paketpreis ungeprüft'; end if;
  if public.get_purchase_sale_history_state(w,p)<>'recorded' then raise exception 'Freie Einkaufszuordnung fehlt im Verkaufsverlauf'; end if;
  begin
    perform public.reopen_purchase_costing(w,p);
    raise exception 'reopen_with_free_sales_allowed';
  exception when invalid_parameter_value then null; end;
  perform public.correct_purchase_costing(w,p,'Paketpreis berichtigt',null,
    (select jsonb_agg(jsonb_build_object('id',id,'catalog_product_id',null,'title_snapshot',title_snapshot,'position_kind','free','line_kind','individual','ordered_quantity',1,'price_mode','priced','unit_purchase_price',280,'line_total',280,'condition_snapshot',null,'estimated_market_value',null)) from public.purchase_lines where purchase_id=p),'[]');
  if (select total_purchase_cost from public.purchases where id=p)<>280 then raise exception 'Freie Einkaufskorrektur falsch'; end if;
  if exists(select 1 from public.sale_lines where purchase_id=p and cost_of_goods_sold is not null) then raise exception 'Einkaufskorrektur erfindet freien Wareneinsatz'; end if;
  result:=public.create_purchase(w,jsonb_build_object('request_id',gen_random_uuid(),
    'type','lot','title','Paket ohne Einzelinhalt','purchase_date','2026-11-04',
    'purchase_price',300,'pricing_mode','total','content_status','unknown','cost_allocation_mode','even','discount_amount',0),'[]',
    '[{"position_kind":"free","client_ref":"free-total","title_snapshot":"10 kg Kleidung","line_kind":"individual","ordered_quantity":1,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"allocated_additional_cost":0}]');
  p:=(result#>>'{purchase,id}')::uuid;
  perform public.finalize_purchase_costing(w,p);
  if (select total_purchase_cost from public.purchases where id=p)<>300 then raise exception 'Freier Paket-Gesamtpreis falsch'; end if;
  perform public.set_workspace_shop_enabled(w,true,0);
  insert into public.catalog_products(id,workspace_id,title,tracking_mode) values(product,w,'Bestandsartikel','quantity');
  result:=public.create_purchase(w,jsonb_build_object('request_id',gen_random_uuid(),
    'type','lot','title','Gemischter Einkauf','purchase_date','2026-11-04','purchase_price',320,
    'pricing_mode','individual','content_status','known','cost_allocation_mode','even','discount_amount',0),'[]',
    jsonb_build_array(
      jsonb_build_object('position_kind','free','client_ref','free-mixed','title_snapshot','Kleiderpakete','line_kind','individual','ordered_quantity',2,'price_mode','priced','unit_purchase_price',150,'line_total',300,'allocated_additional_cost',0),
      jsonb_build_object('position_kind','stock','client_ref','stock-mixed','title_snapshot','Bestandsartikel','catalog_product_id',product,'line_kind','quantity','ordered_quantity',2,'price_mode','priced','unit_purchase_price',10,'line_total',20,'allocated_additional_cost',0)));
  p:=(result#>>'{purchase,id}')::uuid;
  select id into stock_line from public.purchase_lines where purchase_id=p and position_kind='stock';
  perform public.receive_purchase_lines(w,p,jsonb_build_array(jsonb_build_object('purchase_line_id',stock_line,'received_quantity',2,'received_at','2026-11-04T12:00:00Z')));
  update public.purchases set shipment_status='arrived' where id=p;
  perform public.finalize_purchase_costing(w,p);
  if (select total_purchase_cost from public.purchases where id=p)<>320
    or (select sum(allocated_total_cost) from public.purchase_lines where purchase_id=p)<>320
    or (select sum(remaining_quantity) from public.stock_lots where purchase_id=p)<>2
    or exists(select 1 from public.purchase_lines where purchase_id=p and position_kind='free' and received_quantity<>0)
  then raise exception 'Gemischter Einkauf verliert Kosten, Mengen oder Erfassungsart'; end if;
  result:=public.record_sale(w,jsonb_build_object('booking_key',gen_random_uuid(),'platform','direct','sale_date','2026-11-04'),
    jsonb_build_array(jsonb_build_object('position_kind','free','purchase_id',p,'title_snapshot','Freier Pullover','quantity',1,'unit_sale_price',25),
      jsonb_build_object('catalog_product_id',product,'quantity',1,'unit_sale_price',10)));
  sale:=(result#>>'{sale,id}')::uuid;
  if (select cost_of_goods_sold from public.sale_lines where sale_id=sale and position_kind='stock')<>10
    or exists(select 1 from public.sale_lines where sale_id=sale and position_kind='free' and cost_of_goods_sold is not null)
  then raise exception 'Gemischter Verkauf vermischt freien und bekannten Wareneinsatz'; end if;
  perform public.set_workspace_shop_enabled(w,false,1);
  perform public.correct_purchase_costing(w,p,'Bestandskosten nach Abschalten berichtigt',null,
    (select jsonb_agg(jsonb_build_object('id',id,'catalog_product_id',catalog_product_id,'title_snapshot',title_snapshot,
      'position_kind',position_kind,'line_kind',line_kind,'ordered_quantity',ordered_quantity,'price_mode','priced',
      'unit_purchase_price',case when position_kind='stock' then 20 else unit_purchase_price end,
      'line_total',case when position_kind='stock' then 40 else line_total end,
      'condition_snapshot',condition_snapshot,'estimated_market_value',estimated_market_value)) from public.purchase_lines where purchase_id=p),'[]');
  if (select total_purchase_cost from public.purchases where id=p)<>340
    or (select cost_of_goods_sold from public.sale_lines where sale_id=sale and position_kind='stock')<>20
    or exists(select 1 from public.sale_lines where sale_id=sale and position_kind='free' and cost_of_goods_sold is not null)
  then raise exception 'Historische gemischte Einkaufskorrektur nach Abschalten inkonsistent'; end if;
  perform public.record_sale_return(w,sale,35,true,'other','','restock_ready','');
  if (select sum(remaining_quantity) from public.stock_lots where purchase_id=p)<>2 then raise exception 'Gemischte Retoure bei ausgeschaltetem Shop verliert Bestand'; end if;

end;
$$;
select pass('Freier Paketkauf, finanzieller Abschluss ohne Lager und optionaler Verkaufsbezug');
select * from finish();
rollback;
