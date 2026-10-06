\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select ok(not has_function_privilege('anon','public.marketplace_reorder_connections(uuid,uuid[])','execute'),'Anonyme können keine Reihenfolge ändern');
select ok(not has_function_privilege('authenticated','public.marketplace_assign_connection_slot()','execute'),'Interner Trigger ist keine App-RPC');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('39100000-0000-4000-8000-000000000001','authenticated','authenticated','order-owner@example.test','{}','{}'),
 ('39100000-0000-4000-8000-000000000002','authenticated','authenticated','order-member@example.test','{}','{}');
insert into public.platform_operators(user_id) values('39100000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values
 ('39100000-0000-4000-8000-000000000011','Kontoreihenfolge'),
 ('39100000-0000-4000-8000-000000000012','Fremder Workspace'),
 ('39100000-0000-4000-8000-000000000013','Bestehende Überbelegung');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('39100000-0000-4000-8000-000000000011','39100000-0000-4000-8000-000000000001','owner'),
 ('39100000-0000-4000-8000-000000000011','39100000-0000-4000-8000-000000000002','member'),
 ('39100000-0000-4000-8000-000000000013','39100000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,execution_mode,status)
select ('39100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'39100000-0000-4000-8000-000000000011','Konto '||n,
 case when n%2=0 then 'local' else 'cloud' end,case n%5 when 0 then 'connected' when 1 then 'needs_login' when 2 then 'paused' when 3 then 'blocked' else 'disconnected' end
from generate_series(21,29) n;
insert into public.marketplace_connections(id,workspace_id,display_name) values('39100000-0000-4000-8000-000000000040','39100000-0000-4000-8000-000000000012','Fremdes Konto');
insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at,enabled,verified_at)
 values('account-limit-test',repeat('9',64),'test','DE',now()+interval '1 day',true,now()), ('account-limit-test-b',repeat('8',64),'test-b','DE',now()+interval '1 day',true,now());
create function pg_temp.account_ids() returns uuid[] language sql as $$
 select array_agg(id order by sort_order,created_at,id) from public.marketplace_connections where workspace_id='39100000-0000-4000-8000-000000000011' and marketplace='vinted'; $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"39100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.marketplace_cloud_setup_begin('39100000-0000-4000-8000-000000000011',null,'39100000-0000-4000-8000-000000000050','Zehntes Cloudkonto')->>'status','ready','Ausstehende Cloud-Einrichtung belegt den zehnten Platz');
select is((select count(*)::integer from public.marketplace_connections where workspace_id='39100000-0000-4000-8000-000000000011'),10,'Lokale, Cloud- und vorbereitete Konten zählen gemeinsam');
select throws_ok($$select public.marketplace_create_connection('39100000-0000-4000-8000-000000000011','Elftes Konto')$$,'54000',null,'Elfte lokale Vorbereitung ist blockiert');
select lives_ok($$select public.marketplace_reorder_connections('39100000-0000-4000-8000-000000000011',array(select unnest(pg_temp.account_ids()) order by 1 desc))$$,'Alle Konten dürfen neu geordnet werden');
select is(public.marketplace_list_connections('39100000-0000-4000-8000-000000000011')->'connections'->0->>'connectionId',(pg_temp.account_ids())[1]::text,'Kontoliste verwendet die gespeicherte Reihenfolge');
select throws_ok($$select public.marketplace_reorder_connections('39100000-0000-4000-8000-000000000011',null)$$,'22023',null,'Fehlende Reihenfolge wird abgelehnt');
select throws_ok($$select public.marketplace_reorder_connections('39100000-0000-4000-8000-000000000011',(pg_temp.account_ids())[1:9])$$,'22023',null,'Veraltete oder unvollständige Liste wird abgelehnt');
select throws_ok($$select public.marketplace_reorder_connections('39100000-0000-4000-8000-000000000011',array_fill('39100000-0000-4000-8000-000000000021'::uuid,array[10]))$$,'22023',null,'Doppelte Konto-IDs werden abgelehnt');
select throws_ok($$select public.marketplace_reorder_connections('39100000-0000-4000-8000-000000000011',array_prepend('39100000-0000-4000-8000-000000000040'::uuid,(pg_temp.account_ids())[1:9]))$$,'22023',null,'Fremde IDs werden abgelehnt');
select throws_ok($$select public.marketplace_reorder_connections('39100000-0000-4000-8000-000000000011',array_prepend(null::uuid,(pg_temp.account_ids())[1:9]))$$,'22023',null,'Null-ID wird abgelehnt');
select throws_ok($$select public.marketplace_reorder_connections('39100000-0000-4000-8000-000000000012',array[]::uuid[])$$,'42501',null,'Fremder Workspace ist geschützt');
select lives_ok($$select public.marketplace_cloud_setup_cancel('39100000-0000-4000-8000-000000000011',(public.marketplace_cloud_setup_begin('39100000-0000-4000-8000-000000000011',null,'39100000-0000-4000-8000-000000000050','Zehntes Cloudkonto')->'setup'->>'setupId')::uuid)$$,'Cloud-Einrichtung darf abgebrochen werden');
select throws_ok($$select public.marketplace_cloud_setup_begin('39100000-0000-4000-8000-000000000011',null,'39100000-0000-4000-8000-000000000051','Elftes Cloudkonto')$$,'54000',null,'Auch neue Cloud-Einrichtung ist atomar auf zehn begrenzt');
select lives_ok($$select public.marketplace_rename_connection('39100000-0000-4000-8000-000000000011','39100000-0000-4000-8000-000000000021','Weiter verwendbar')$$,'Bestehende Konten bleiben bei voller Belegung bearbeitbar');
select set_config('request.jwt.claims','{"sub":"39100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.marketplace_reorder_connections('39100000-0000-4000-8000-000000000011',array[]::uuid[])$$,'42501',null,'Mitglied ohne Verwaltungszugriff darf nicht sortieren');
reset role;
alter table public.marketplace_connections disable trigger marketplace_connection_slot;
insert into public.marketplace_connections(workspace_id,display_name) select '39100000-0000-4000-8000-000000000013','Altkonto '||n from generate_series(1,11) n;
alter table public.marketplace_connections enable trigger marketplace_connection_slot;
select is((select count(*)::integer from public.marketplace_connections where workspace_id='39100000-0000-4000-8000-000000000013'),11,'Überzählige Altkonten werden nicht gelöscht');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"39100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.marketplace_reorder_connections('39100000-0000-4000-8000-000000000013',array(select id from public.marketplace_connections where workspace_id='39100000-0000-4000-8000-000000000013' order by id desc))$$,'Überzählige Altkonten bleiben sortierbar');
select throws_ok($$select public.marketplace_create_connection('39100000-0000-4000-8000-000000000013','Zwölftes')$$,'54000',null,'Überbelegung erlaubt keinen weiteren Platz');
reset role;
select * from finish();
rollback;
