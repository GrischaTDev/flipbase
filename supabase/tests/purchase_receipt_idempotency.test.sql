\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_function('public', 'receive_purchase_lines_idempotent', array['uuid','uuid','uuid','jsonb'], 'Wareneingang besitzt einen expliziten Request-Vertrag');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('ba100000-0000-4000-8000-000000000001','authenticated','authenticated','receipt-contract@example.test','{}','{}');
insert into public.workspaces(id,name) values
('ba100000-0000-4000-8000-000000000011','Wareneingang'),
('ba100000-0000-4000-8000-000000000012','Fremder Wareneingang');
insert into public.workspace_members(workspace_id,user_id,role)
values ('ba100000-0000-4000-8000-000000000011','ba100000-0000-4000-8000-000000000001','owner');
insert into public.catalog_products(id,workspace_id,title)
values ('ba100000-0000-4000-8000-000000000021','ba100000-0000-4000-8000-000000000011','Schuh');
create temporary table receipt_contract(workspace_id uuid,purchase_id uuid,lines jsonb,result jsonb);
grant select,insert,update on receipt_contract to authenticated;
select set_config('request.jwt.claim.sub','ba100000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into receipt_contract(workspace_id,purchase_id)
select 'ba100000-0000-4000-8000-000000000011',
 (public.create_purchase('ba100000-0000-4000-8000-000000000011',
 '{"type":"lot","title":"Wareneingang","purchase_date":"2026-09-08","purchase_price":50,"cost_allocation_mode":"even"}',
 '[]','[{"catalog_product_id":"ba100000-0000-4000-8000-000000000021","title_snapshot":"Schuh","line_kind":"quantity","ordered_quantity":5,"unit_purchase_price":10,"line_total":50}]')->'purchase'->>'id')::uuid;
update receipt_contract as fixture set lines = (
 select jsonb_build_array(jsonb_build_object('purchase_line_id',id,'received_quantity',2,'received_at','2026-09-08T10:00:00Z'))
 from public.purchase_lines where purchase_id=fixture.purchase_id
);

-- Fehlende RPC wird als echter Vertragsfehler gemeldet; keine Fixture-Abbruchkaskade.
select lives_ok($$update receipt_contract set result = public.receive_purchase_lines_idempotent(workspace_id,purchase_id,'ba100000-0000-4000-8000-000000000031',lines)$$,'Teilwareneingang zwei von fünf gelingt');
select is((select coalesce(sum(received_quantity),0)::bigint from public.purchase_lines where purchase_id=(select purchase_id from receipt_contract)),2::bigint,'Erster Request bucht genau zwei Einheiten');
select lives_ok($$select public.receive_purchase_lines_idempotent(workspace_id,purchase_id,'ba100000-0000-4000-8000-000000000031',lines) from receipt_contract$$,'Identischer Retry gelingt');
select is((select count(*) from public.stock_lots where purchase_id=(select purchase_id from receipt_contract)),1::bigint,'Retry erzeugt kein zweites Los');
select throws_ok($$select public.receive_purchase_lines_idempotent(workspace_id,purchase_id,'ba100000-0000-4000-8000-000000000031',jsonb_set(lines,'{0,received_quantity}','3')) from receipt_contract$$,'22023','Die Request-ID wurde bereits für einen anderen Wareneingang verwendet.','Gleiche ID mit anderem Inhalt wird abgewiesen');
select lives_ok($$select public.receive_purchase_lines_idempotent(workspace_id,purchase_id,'ba100000-0000-4000-8000-000000000032',jsonb_set(lines,'{0,received_quantity}','3')) from receipt_contract$$,'Weiterer Request bucht die übrigen drei Einheiten');
select is((select sum(received_quantity)::bigint from public.purchase_lines where purchase_id=(select purchase_id from receipt_contract)),5::bigint,'Gesamter Wareneingang bleibt fünf');
select throws_ok($$select public.receive_purchase_lines_idempotent('ba100000-0000-4000-8000-000000000012',purchase_id,'ba100000-0000-4000-8000-000000000031',lines) from receipt_contract$$,'42501','Kein Zugriff auf diesen Workspace.','Fremder Workspace kann keinen Request lesen oder wiederholen');
select throws_ok($$select public.receive_purchase_lines_idempotent(workspace_id,purchase_id,null,lines) from receipt_contract$$,'22023','Eine Request-ID ist für den Wareneingang erforderlich.','Fehlende Request-ID wird abgewiesen');

reset role;
select * from finish();
rollback;
