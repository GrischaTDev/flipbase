\set ON_ERROR_STOP on
begin;
select plan(1);
do $$
declare
 u uuid := gen_random_uuid(); w uuid := gen_random_uuid(); k uuid := gen_random_uuid();
 request jsonb; lines jsonb; a jsonb; b jsonb; original uuid; corrected uuid; n integer;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(u,'authenticated','authenticated',u::text||'@example.test','unused','{}','{}',now(),now());
 insert into public.workspaces(id,name) values(w,'Freie Verkäufe Test');
 insert into public.workspace_members(workspace_id,user_id,role) values(w,u,'owner');
 perform set_config('request.jwt.claim.sub',u::text,true);
 request := jsonb_build_object('booking_key',k,'platform','direct','sale_date','2026-11-04');
 lines := '[{"position_kind":"free","title_snapshot":"Pullover","quantity":2,"unit_sale_price":25}]';
 a := public.record_sale(w,request,lines); original := (a->'sale'->>'id')::uuid;
 if (a->'sale'->>'sale_price')::numeric <> 50 then raise exception 'Falscher Umsatz'; end if;
 if a->'sale_lines'->0->>'cost_of_goods_sold' is not null then raise exception 'Unbekannte Kosten wurden erfunden'; end if;
 if jsonb_array_length(a->'stock_movements') <> 0 then raise exception 'Freier Verkauf erzeugt Bewegung'; end if;
 b := public.record_sale(w,request,lines);
 if a is distinct from b then raise exception 'Wiederholung erzeugt anderen Verkauf'; end if;
 begin
  perform public.record_sale(w, request, '[{"position_kind":"free","title_snapshot":"Anders","quantity":1,"unit_sale_price":1}]');
  raise exception 'payload_conflict_not_rejected';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.record_sale(w,request||jsonb_build_object('booking_key',gen_random_uuid()), '[{"position_kind":"free","title_snapshot":" ","quantity":1,"unit_sale_price":1}]');
  raise exception 'empty_title_not_rejected';
 exception when invalid_parameter_value then null; end;
 insert into public.workspace_company_profiles(workspace_id,legal_name,street,house_number,postal_code,city,country_code,tax_number)
 values(w,'Testbetrieb','Testweg','1','12345','Bonn','DE','123/456/789') on conflict(workspace_id) do update set legal_name=excluded.legal_name,street=excluded.street,house_number=excluded.house_number,postal_code=excluded.postal_code,city=excluded.city,country_code=excluded.country_code,tax_number=excluded.tax_number;
 a := public.create_or_get_invoice(w,original,null,'{"invoice_number":"RE-FREE","order_number":"FREE-1","invoice_date":"2026-11-04","delivery_date":"2026-11-04","subtotal":50,"total":50}', '[{"title":"Pullover","quantity":2,"unit_price":25,"total_price":50}]');
 request := request||jsonb_build_object('booking_key',gen_random_uuid(),'correction_sale_id',original,'correction_reason','Preis berichtigt');
 b := public.record_sale(w,request,'[{"position_kind":"free","title_snapshot":"Pullover","quantity":2,"unit_sale_price":20}]');
 corrected := (b->'sale'->>'id')::uuid;
 if not exists(select 1 from public.sales where id=original and voided_at is not null and sale_price=50) then raise exception 'Original nicht erhalten'; end if;
 if not exists(select 1 from public.sale_corrections where original_sale_id=original and replacement_sale_id=corrected and (document->>'total')::numeric = -50 and document->'seller'->>'name' = 'Testbetrieb') then raise exception 'Korrekturbezug fehlt'; end if;
 if (select count(*) from public.business_events where entity_id=original and event_type='sale_corrected') <> 1 then raise exception 'Korrekturhistorie fehlt'; end if;
 request := jsonb_build_object('booking_key',gen_random_uuid(),'sale_id',corrected,'amount',10,'restock',false,'reason','other','restock_action','keep_with_buyer');
 a := public.record_sale_refund(w,request); b := public.record_sale_refund(w,request);
 if a is distinct from b then raise exception 'Erstattung nicht wiederholsicher'; end if;
 if (select refund_amount from public.sales where id=corrected) <> 10 then raise exception 'Teilbetrag falsch'; end if;
 request := request||jsonb_build_object('booking_key',gen_random_uuid(),'amount',30);
 a := public.record_sale_refund(w,request);
 if (select refund_amount from public.sales where id=corrected) <> 40 then raise exception 'Gesamterstattung falsch'; end if;
 if (select returned_at is null from public.sales where id=corrected) then raise exception 'Vollerstattung fehlt'; end if;
 if exists(select 1 from public.inventory_items where workspace_id=w) or exists(select 1 from public.stock_lots where workspace_id=w) or exists(select 1 from public.stock_movements where workspace_id=w) then raise exception 'Bestand entstanden'; end if;
 if has_table_privilege('authenticated','public.sale_booking_requests','insert') or has_table_privilege('authenticated','public.sale_corrections','update') then raise exception 'Direkte Schreibrechte'; end if;
 insert into public.inventory_items(id,workspace_id,title,status,allocated_purchase_cost) values(k,w,'Bestandsware','ready',0);
 request := jsonb_build_object('booking_key',gen_random_uuid(),'platform','direct','sale_date','2026-11-04');
 a := public.record_sale(w,request,lines || jsonb_build_array(jsonb_build_object('inventory_item_id',k,'quantity',1,'unit_sale_price',10)));
 if (select status from public.inventory_items where id=k) <> 'sold' then raise exception 'Gemischter Verkauf bucht Bestand nicht'; end if;
 b := public.record_sale_refund(w,jsonb_build_object('booking_key',gen_random_uuid(),'sale_id',a->'sale'->>'id','amount',60,'restock',true,'reason','other','restock_action','restock_ready'));
 if (select status from public.inventory_items where id=k) <> 'ready' then raise exception 'Gemischte Retoure beschädigt Bestand'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform public.record_sale(w,jsonb_build_object('booking_key',gen_random_uuid(),'platform','direct','sale_date','2026-11-04'),lines);
  raise exception 'foreign_workspace_allowed';
 exception when insufficient_privilege then null; end;
end;
$$;
select pass('Freier Verkauf, Wiederholung, Korrektur, Teil-/Vollerstattung und Workspacegrenze');
select * from finish();
rollback;
