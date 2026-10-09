\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
select has_table('public','marketplace_cloud_ip_purchases','Bestellabsicht wird dauerhaft gespeichert');
select has_table('public','marketplace_cloud_ip_allowances','Spätere Paketgrenzen haben einen eigenen Anschluss');
select ok((select relrowsecurity from pg_class where oid='public.marketplace_cloud_ip_purchases'::regclass),'Bestellungen haben RLS');
select ok(not has_table_privilege('authenticated','public.marketplace_cloud_ip_purchases','select'),'Kunden sehen keine Bestellmetadaten');
select ok(not has_table_privilege('service_role','public.marketplace_cloud_ip_purchases','delete'),'Worker kann offene Kaufabsichten nicht löschen');
select ok(not has_function_privilege('authenticated','public.marketplace_cloud_ip_purchase(text,uuid,uuid,uuid,text,uuid,uuid,bigint,text)','execute'),'Kunden können keine Kaufberechtigung erfinden');
select ok(not has_function_privilege('anon','public.marketplace_cloud_ip_purchase(text,uuid,uuid,uuid,text,uuid,uuid,bigint,text)','execute'),'Anonyme können nicht bestellen');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('45100000-0000-4000-8000-000000000001','authenticated','authenticated','ip-owner@example.test','{}','{}'),
 ('45100000-0000-4000-8000-000000000002','authenticated','authenticated','ip-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values('45100000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('45100000-0000-4000-8000-000000000011','IP A'),('45100000-0000-4000-8000-000000000012','IP B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('45100000-0000-4000-8000-000000000011','45100000-0000-4000-8000-000000000001','owner'),
 ('45100000-0000-4000-8000-000000000012','45100000-0000-4000-8000-000000000002','owner');
create function pg_temp.purchase(p_action text,p_request uuid default '45100000-0000-4000-8000-000000000031',p_attempt uuid default '45100000-0000-4000-8000-000000000041',p_order text default null)
returns jsonb language sql as $$ select public.marketplace_cloud_ip_purchase(p_action,'45100000-0000-4000-8000-000000000011',p_request,null,'Cloudtest','45100000-0000-4000-8000-000000000001',p_attempt,350,p_order); $$;
set local role service_role;
select is(pg_temp.purchase('inspect')->>'status','missing','Ohne freie IP fehlt eine Bestellung');
select is(pg_temp.purchase('claim')->>'status','submit','Genau ein Aufruf darf zahlen');
select is(pg_temp.purchase('claim')->>'status','purchase_pending','Gleiche Anfrage darf nicht erneut zahlen');
select is(pg_temp.purchase('claim','45100000-0000-4000-8000-000000000032','45100000-0000-4000-8000-000000000042')->>'status','purchase_pending','Andere Anfrage wartet auf globale Bestellung');
select throws_ok($$select public.marketplace_cloud_ip_purchase('claim','45100000-0000-4000-8000-000000000012','45100000-0000-4000-8000-000000000032',null,'Fremd','45100000-0000-4000-8000-000000000002',gen_random_uuid(),350,null)$$,'42501',null,'Ohne Pilotrecht kein Kauf');
select throws_ok($$select public.marketplace_cloud_ip_purchase('inspect','45100000-0000-4000-8000-000000000011','45100000-0000-4000-8000-000000000031',null,'Anderes Konto','45100000-0000-4000-8000-000000000001',null,null,null)$$,'23505',null,'Request-ID bleibt an dasselbe Ziel gebunden');
select throws_ok($$select pg_temp.purchase('ordered','45100000-0000-4000-8000-000000000031','45100000-0000-4000-8000-000000000099','420')$$,'42501',null,'Fremder Prozess kann Kaufabsicht nicht abschließen');
select is(pg_temp.purchase('ordered',p_order=>'420')->>'status','ordered','Bestellkennung wird vor weiterer Einrichtung gespeichert');
select is(pg_temp.purchase('inspect')->>'orderId','420','Neustart liest dieselbe Anbieterbestellung');
select throws_ok($$select pg_temp.purchase('complete')$$,'55000',null,'Offene Bestellung bleibt bis Reservierung gesperrt');
reset role;
insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at,enabled,verified_at)
 values('iproyal-purchase-test',repeat('a',64),'420','DE',now()+interval '30 days',true,now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.marketplace_cloud_setup_begin('45100000-0000-4000-8000-000000000011',null,'45100000-0000-4000-8000-000000000032','Cloudtest')->>'status','no_capacity','Andere Einrichtung kann die frisch bestellte IP nicht wegnehmen');
select is(public.marketplace_cloud_setup_begin('45100000-0000-4000-8000-000000000011',null,'45100000-0000-4000-8000-000000000031','Cloudtest')->>'status','ready','Besteller reserviert die neue IP');
set local role service_role;
select is(pg_temp.purchase('complete')->>'status','completed','Erst bestätigte Reservierung gibt Kaufplatz frei');
select is(pg_temp.purchase('complete')->>'status','completed','Verlorene Abschlussantwort bleibt idempotent');
reset role;
select is((select count(*) from public.marketplace_cloud_ip_purchases),1::bigint,'Eine einzige Bestellung gespeichert');
select is((select duration_days from public.marketplace_cloud_ip_purchases),30,'Immer 30 Tage');
select is((select quantity from public.marketplace_cloud_ip_purchases),1,'Immer eine IP');
select is((select price_cents from public.marketplace_cloud_ip_purchases),350::bigint,'Aktuelles Preisangebot gespeichert');
select throws_ok($$delete from public.workspaces where id='45100000-0000-4000-8000-000000000011'$$,'23503',null,'Arbeitsplatzlöschung darf Bestellschutz nicht verschwinden lassen');
insert into public.marketplace_cloud_ip_allowances(workspace_id,ip_limit) values('45100000-0000-4000-8000-000000000011',1);
insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at,enabled,verified_at)
 values('iproyal-spare-test',repeat('b',64),'421','DE',now()+interval '30 days',true,now());
set local role authenticated;
select is(public.marketplace_cloud_setup_begin('45100000-0000-4000-8000-000000000011',null,'45100000-0000-4000-8000-000000000032','Cloudtest')->>'status','limit_reached','Paketgrenze gilt auch bei freier IP');
select is(public.marketplace_cloud_setup_begin('45100000-0000-4000-8000-000000000011',null,'45100000-0000-4000-8000-000000000031','Cloudtest')->>'status','ready','Bestehende Reservierung bleibt bei Paketgrenze verwendbar');
set local role service_role;
select is(pg_temp.purchase('claim','45100000-0000-4000-8000-000000000032','45100000-0000-4000-8000-000000000042')->>'status','limit_reached','Paketgrenze verhindert Nachbuchung');
reset role;
delete from public.marketplace_cloud_ip_allowances;
update public.marketplace_cloud_ips set enabled=false where network_id='iproyal-spare-test';
set local role service_role;
select is(pg_temp.purchase('claim','45100000-0000-4000-8000-000000000032','45100000-0000-4000-8000-000000000042')->>'status','submit','Neue berechtigte Anfrage darf nächste IP bestellen');
select is(pg_temp.purchase('inspect','45100000-0000-4000-8000-000000000032')->>'status','purchase_pending','Unklare Zahlungsantwort bleibt dauerhaft gesperrt');
select is(pg_temp.purchase('claim','45100000-0000-4000-8000-000000000033','45100000-0000-4000-8000-000000000043')->>'status','purchase_pending','Auch neue Request-ID umgeht eine unklare Zahlung nicht');
select is(pg_temp.purchase('failed','45100000-0000-4000-8000-000000000032','45100000-0000-4000-8000-000000000042')->>'status','purchase_failed','Explizite Zahlungsablehnung beendet Kaufabsicht');
select is(pg_temp.purchase('claim','45100000-0000-4000-8000-000000000032','45100000-0000-4000-8000-000000000042')->>'status','purchase_failed','Abgewiesene Anfrage wird nicht automatisch wiederholt');
select is(pg_temp.purchase('claim','45100000-0000-4000-8000-000000000033','45100000-0000-4000-8000-000000000043')->>'status','submit','Nächste ausdrückliche Einrichtung erhält eigene Kaufabsicht');
select is(pg_temp.purchase('reconcile')->>'status','completed','Bestandsabgleich ist auch ohne bereite Bestellung sicher');
reset role;
update public.marketplace_cloud_ip_purchases set created_at=clock_timestamp()-interval '3 minutes' where state='submitting';
set local role service_role;
select is(pg_temp.purchase('reconcile')->>'status','completed','Bestandsabgleich darf unbekannte Zahlung nicht löschen');
select is(pg_temp.purchase('inspect','45100000-0000-4000-8000-000000000033')->>'status','purchase_pending','Unbekannte Zahlung bleibt auch nach Wartezeit gesperrt');
select is(pg_temp.purchase('ordered','45100000-0000-4000-8000-000000000033','45100000-0000-4000-8000-000000000043','422')->>'status','ordered','Später eindeutig bestätigte Bestellung wird fortgesetzt');
select is(pg_temp.purchase('reconcile')->>'status','completed','Bestellung ohne registrierte IP bleibt geschützt');
reset role;
select is((select state from public.marketplace_cloud_ip_purchases where provider_order_id='422'),'ordered','Bestandsprüfung verlangt zuerst verifizierte IP');
insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at,enabled,verified_at)
 values('iproyal-abandoned-test',repeat('c',64),'422','DE',now()+interval '30 days',true,now());
set local role service_role;
select is(pg_temp.purchase('reconcile')->>'status','completed','Verifizierte IP einer verlassenen Einrichtung gibt Kaufplatz frei');
reset role;
select is((select state from public.marketplace_cloud_ip_purchases where provider_order_id='422'),'completed','Bekannte Zahlung bleibt dauerhaft dokumentiert');
set local role service_role;
select is(pg_temp.purchase('inspect','45100000-0000-4000-8000-000000000034')->>'status','available','Nächster Nutzer kann vorhandene IP verwenden statt nochmals zu bezahlen');
reset role;
delete from public.platform_operators where user_id='45100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select pg_temp.purchase('claim','45100000-0000-4000-8000-000000000033','45100000-0000-4000-8000-000000000043')$$,'42501',null,'Zwischen Preisangebot und Kauf entzogenes Recht stoppt Zahlung');
select * from finish();
rollback;
