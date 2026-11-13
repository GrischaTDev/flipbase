\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('46800000-0000-4000-8000-000000000001','authenticated','authenticated','label-owner@example.test','{}','{}'),
 ('46800000-0000-4000-8000-000000000002','authenticated','authenticated','label-member@example.test','{}','{}'),
 ('46800000-0000-4000-8000-000000000003','authenticated','authenticated','label-stranger@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('46800000-0000-4000-8000-000000000001'),('46800000-0000-4000-8000-000000000002'),('46800000-0000-4000-8000-000000000003');
insert into public.workspaces(id,name) values ('46800000-0000-4000-8000-000000000011','Versandscheine'),('46800000-0000-4000-8000-000000000012','Fremder Workspace');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000001','owner'),
 ('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000002','member'),
 ('46800000-0000-4000-8000-000000000012','46800000-0000-4000-8000-000000000003','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('46800000-0000-4000-8000-000000000021','46800000-0000-4000-8000-000000000011','Versandkonto','connected','468');

select ok(not has_table_privilege('anon','public.marketplace_shipping_labels','select'),'Anonyme Nutzer lesen keine Versandscheine');
select ok(not has_table_privilege('authenticated','public.marketplace_shipping_labels','insert'),'Angemeldete Nutzer legen keine Versandscheine direkt an');
select ok((select not public from storage.buckets where id='marketplace-shipping-labels'),'Versandschein-Dateien liegen in einem privaten Bucket');

set local role service_role;
insert into public.marketplace_shipping_labels(workspace_id,connection_id,external_transaction_id,external_shipment_id,external_conversation_id,title,carrier_name,label_type,storage_path,mime_type,byte_size,requested_by_flipbase)
values ('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000021','24052549356','51458635363','500969788562','Carhartt WIP Teddy-Fleecejacke','DPD Pickup','printable',
 '46800000-0000-4000-8000-000000000011/46800000-0000-4000-8000-000000000021/24052549356.pdf','application/pdf',48213,true);
select throws_ok($$insert into public.marketplace_shipping_labels(workspace_id,connection_id,external_transaction_id,external_shipment_id,title,storage_path,mime_type,byte_size)
 values ('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000021','24052549356','51458635363','Doppelt','andere-datei.pdf','application/pdf',1)$$,'23505',null,'Je Verkauf gibt es genau einen Versandschein');
select throws_ok($$insert into public.marketplace_shipping_labels(workspace_id,connection_id,external_transaction_id,external_shipment_id,title,storage_path,mime_type,byte_size)
 values ('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000021','1','2','Falscher Typ','x.html','text/html',1)$$,'23514',null,'Nur PDF- und Bilddateien sind erlaubt');
insert into storage.objects(bucket_id,name,owner,metadata) values
 ('marketplace-shipping-labels','46800000-0000-4000-8000-000000000011/46800000-0000-4000-8000-000000000021/24052549356.pdf',null,'{"mimetype":"application/pdf","size":48213}');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"46800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.marketplace_shipping_labels),1,'Workspace-Inhaber sieht den Versandschein');
select is((select count(*)::int from storage.objects where bucket_id='marketplace-shipping-labels'),1,'Workspace-Inhaber darf die Datei lesen');
select throws_ok($$insert into public.marketplace_shipping_labels(workspace_id,connection_id,external_transaction_id,external_shipment_id,title,storage_path,mime_type,byte_size)
 values ('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000021','9','9','Eigen','eigen.pdf','application/pdf',1)$$,'42501',null,'Auch Inhaber legen keine Versandscheine am Worker vorbei an');
select set_config('request.jwt.claims','{"sub":"46800000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.marketplace_shipping_labels),0,'Fremde Workspaces sehen keine Versandscheine');
select is((select count(*)::int from storage.objects where bucket_id='marketplace-shipping-labels'),0,'Fremde Workspaces lesen keine Versandschein-Dateien');
reset role;
select * from finish();
rollback;
