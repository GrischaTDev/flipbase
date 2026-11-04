\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select plan(1);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values('53000000-0000-4000-8000-000000000001','authenticated','authenticated','shop-owner@example.test','{}','{}');
insert into public.workspaces(id,name) values('53000000-0000-4000-8000-000000000011','Shop-Schalter');
insert into public.workspace_members(workspace_id,user_id,role)
values('53000000-0000-4000-8000-000000000011','53000000-0000-4000-8000-000000000001','owner');
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare
  w uuid:='53000000-0000-4000-8000-000000000011'; result jsonb; sale uuid;
  item uuid:='53000000-0000-4000-8000-000000000021'; draft uuid:=gen_random_uuid();
begin
  result:=public.get_workspace_shop_state(w);
  if (result->>'shop_enabled')::boolean then raise exception 'Neuer Shop ist bereits aktiv'; end if;
  begin
    update public.workspaces set shop_enabled=true where id=w;
    raise exception 'direct_toggle_allowed';
  exception when insufficient_privilege then null; end;
  perform public.set_workspace_shop_enabled(w,true,0);
  insert into public.inventory_items(id,workspace_id,title,condition,status,allocated_purchase_cost)
  values(item,w,'Bestehender Artikel','used','ready',10);
  result:=public.record_sale(w,jsonb_build_object('booking_key',gen_random_uuid(),'platform','direct','sale_date','2026-11-04'),
    jsonb_build_array(jsonb_build_object('inventory_item_id',item,'quantity',1,'unit_sale_price',25)));
  sale:=(result#>>'{sale,id}')::uuid;
  result:=public.create_purchase(w,jsonb_build_object('request_id',gen_random_uuid(),
    'type','single','title','Alter Bestandsentwurf','purchase_date','2026-11-04','purchase_price',10,
    'pricing_mode','individual','content_status','known','cost_allocation_mode','even','discount_amount',0),'[]',
    '[{"position_kind":"stock","client_ref":"old-draft","title_snapshot":"Ungebuchter Artikel","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"allocated_additional_cost":0}]');
  draft:=(result#>>'{purchase,id}')::uuid;
  perform public.set_workspace_shop_enabled(w,false,1);
  perform public.delete_purchase_draft(w,draft);
  if exists(select 1 from public.purchases where id=draft) then raise exception 'Alter Entwurf bleibt gesperrt'; end if;
  begin
    insert into public.inventory_items(workspace_id,title,condition,status,allocated_purchase_cost) values(w,'Unerlaubt','used','ready',0);
    raise exception 'new_inventory_allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_workspace_shop_enabled(w,true,0);
    raise exception 'stale_version_allowed';
  exception when serialization_failure then null; end;
  perform public.record_sale_return(w,sale,25,true,'other','','restock_ready','');
  if (select status from public.inventory_items where id=item)<>'ready' then raise exception 'Historische Retoure beschädigt'; end if;
  perform public.record_sale(w,jsonb_build_object('booking_key',gen_random_uuid(),'platform','direct','sale_date','2026-11-04'),
    '[{"position_kind":"free","title_snapshot":"Frei","quantity":1,"unit_sale_price":5}]');
  perform public.set_workspace_shop_enabled(w,true,2);
  if not exists(select 1 from public.inventory_items where id=item and allocated_purchase_cost=10) then raise exception 'Historischer Bestand verloren'; end if;
  insert into public.inventory_items(workspace_id,title,condition,status,allocated_purchase_cost)
  values(w,'Unbenutzter Artikel mit Medien','used','ready',0) returning id into item;
  insert into public.item_media(inventory_item_id,storage_path) values(item,item::text||'/123_Foto.webp');
  delete from public.inventory_items where id=item;

end;
$$;
reset role;
select pass('Shop aus/an/aus/an, direkte Sperren, Version und historische Retoure');
select * from finish();
rollback;
