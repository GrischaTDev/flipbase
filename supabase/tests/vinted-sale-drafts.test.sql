\set on_error_stop on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
  ('53600000-0000-4000-8000-000000000001','authenticated','authenticated','vinted-drafts@example.test','{}','{}');
insert into public.workspaces(id,name,shop_enabled) values
  ('53600000-0000-4000-8000-000000000011','Mit Shop',true),
  ('53600000-0000-4000-8000-000000000012','Ohne Shop',false);
insert into public.workspace_members(workspace_id,user_id,role)
select id,'53600000-0000-4000-8000-000000000001','owner'
from public.workspaces where id in ('53600000-0000-4000-8000-000000000011','53600000-0000-4000-8000-000000000012');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
  ('53600000-0000-4000-8000-000000000021','53600000-0000-4000-8000-000000000011','Verkäufer','connected','5361'),
  ('53600000-0000-4000-8000-000000000022','53600000-0000-4000-8000-000000000012','Verkäufer','connected','5362'),
  ('53600000-0000-4000-8000-000000000023','53600000-0000-4000-8000-000000000011','Anderes Konto','connected','5363');
insert into public.inventory_items(id,workspace_id,title,status,allocated_purchase_cost) values
  ('53600000-0000-4000-8000-000000000031','53600000-0000-4000-8000-000000000011','Pullover','listed',0),
  ('53600000-0000-4000-8000-000000000032','53600000-0000-4000-8000-000000000011','Pullover','listed',0);

with draft as (
  insert into public.marketplace_listing_drafts(workspace_id,connection_id,created_by,inventory_item_id)
  values ('53600000-0000-4000-8000-000000000011','53600000-0000-4000-8000-000000000021',
    '53600000-0000-4000-8000-000000000001','53600000-0000-4000-8000-000000000032')
  returning *
)
insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,requested_by,request_id,request_hash,
  draft_revision,authorization_version,external_account_id,execution_mode,action,snapshot,state,external_id,provider_state,verified_at)
select workspace_id,connection_id,id,created_by,gen_random_uuid(),repeat('a',64),1,1,'5361','cloud','publish',
  '{"inventoryItemId":"53600000-0000-4000-8000-000000000031"}','confirmed','53631','active',now()
from draft;

create function pg_temp.import_sale(p_seller text,p_transaction text,p_overrides jsonb default '{}')
returns void language sql as $$
  insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,observed_at)
  select workspace_id,id,'sale',p_transaction,
    jsonb_build_object('title','Pullover','sellerId',external_account_id,'saleState','sold','saleStateAt','2026-11-16T23:30:00Z',
      'externalConversationId','53611','itemIds','["53631"]'::jsonb,'itemCount',1,
      'occurredAt','2026-11-16T23:30:00Z','price',24.50,'currency','EUR','currencyConfirmed',true,'shippingLabelAction','order')
      || p_overrides, now()
  from public.marketplace_connections where external_account_id=p_seller
  on conflict(workspace_id,connection_id,kind,external_id) do update
    set body=excluded.body,observed_at=excluded.observed_at;
$$;

select pg_temp.import_sale('5361','53621');
select pg_temp.import_sale('5362','53622');
select is((select draft#>>'{lines,0,target}' from public.sale_drafts where draft->>'externalOrderId'='53621'),
  'inventory:53600000-0000-4000-8000-000000000031','Aktiver Shop verwendet den gesicherten Artikel der Veröffentlichung');
select is((select draft#>>'{lines,0,target}' from public.sale_drafts where draft->>'externalOrderId'='53622'),
  'free:Pullover','Deaktivierter Shop übernimmt eine freie Position');
select is((select draft->>'saleDate' from public.sale_drafts where draft->>'externalOrderId'='53622'),
  '2026-11-17','Kaufzeit wird als Berliner Verkaufsdatum übernommen');
select is((select draft->>'shippingMode' from public.sale_drafts where draft->>'externalOrderId'='53622'),
  'platform_prepaid','Ein bestätigter Vinted-Versandschein belegt den Versandmodus');
select is((select sum(sale_amount) from public.sale_drafts where draft->>'externalOrderId' in ('53621','53622')),
  49.00::numeric,'Beide Entwürfe übernehmen den bestätigten EUR-Kaufpreis');
select is((select count(*) from public.sales where workspace_id::text like '53600000-%'),
  0::bigint,'Entwürfe erzeugen keine Buchung');
select is((select status from public.inventory_items where id='53600000-0000-4000-8000-000000000031'),
  'listed','Entwurfsanlage lässt den Bestand verfügbar');

update public.sale_drafts set title='Bearbeiteter Entwurf' where draft->>'externalOrderId'='53621';
select pg_temp.import_sale('5361','53621','{"title":"Geänderter Anbietertitel","saleState":"shipped"}');
select is((select array_agg(title) from public.sale_drafts where draft->>'externalOrderId'='53621'),
  array['Bearbeiteter Entwurf'],'Erneuter Import erhält den bearbeiteten Entwurf');

select pg_temp.import_sale('5363','53623','{"currency":"EUR","currencyConfirmed":false,"occurredAt":null}');
select is((select draft#>>'{lines,0,target}' from public.sale_drafts where draft->>'externalOrderId'='53623'),
  '','Gleiche Artikelkennung eines anderen Kontos wird nicht zugeordnet');
select is((select draft#>'{lines,0,unitSalePrice}' from public.sale_drafts where draft->>'externalOrderId'='53623'),
  'null'::jsonb,'Die EUR-Vorbelegung ohne Währungsbeleg füllt den Stückpreis nicht');
select is((select draft->>'saleDate' from public.sale_drafts where draft->>'externalOrderId'='53623'),
  '','Fehlende Kaufzeit wird nicht durch das Importdatum ersetzt');
select pg_temp.import_sale('5362','53624','{"isBundle":true,"itemCount":2,"itemIds":[],"price":null}');
select is((select jsonb_array_length(draft->'lines') from public.sale_drafts where draft->>'externalOrderId'='53624'),
  2,'Ein Paket ergibt einen Entwurf mit zwei offenen Positionen');
select is((select draft#>'{lines,0,unitSalePrice}' from public.sale_drafts where draft->>'externalOrderId'='53624'),
  'null'::jsonb,'Der Paketpreis wird nicht auf Einzelpositionen verteilt');
select pg_temp.import_sale('5362','53624','{"isBundle":true,"itemCount":2,"itemIds":[],"price":30}');
select pg_temp.import_sale('5362','53627','{"title":"Verkauf","titleConfirmed":false}');
select is((select draft#>>'{lines,0,target}' from public.sale_drafts where draft->>'externalOrderId'='53627'),
  'free:','Fehlt der Anbietertitel, bleibt die Bezeichnung der freien Position leer');
select pg_temp.import_sale('5361','53625','{"saleState":"cancelled"}');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body)
select workspace_id,id,'sale','53626','{"sellerId":"999","title":"Preisangebot"}'
from public.marketplace_connections where external_account_id='5362';
select is((select count(*) from public.sale_drafts where draft->>'externalOrderId' in ('53625','53626')),
  0::bigint,'Erstimport eines Stornos und unbestätigte Einträge erzeugen keinen Entwurf');
insert into public.marketplace_connections(workspace_id,display_name,status,external_account_id)
values ('53600000-0000-4000-8000-000000000012','Verbindung vor Storno','connected','5364');
select pg_temp.import_sale('5364','53628','{"saleState":"cancelled"}');
delete from public.marketplace_connections where external_account_id='5364';
insert into public.marketplace_connections(workspace_id,display_name,status,external_account_id)
values ('53600000-0000-4000-8000-000000000012','Neu verbunden','connected','5364');
select pg_temp.import_sale('5364','53628');
select is((select count(*) from public.sale_drafts where draft->>'externalOrderId'='53628'),
  0::bigint,'Älterer Verkauf nach Wiederverbindung kann einen Storno nicht zurücknehmen');
delete from public.sale_drafts where draft->>'externalOrderId'='53623';
select pg_temp.import_sale('5363','53623');
select is((select count(*) from public.sale_drafts where draft->>'externalOrderId'='53623'),
  0::bigint,'Gelöschter Entwurf entsteht beim nächsten Abgleich nicht neu');

create temporary table vinted_test_drafts as
select workspace_id,id,draft->>'externalOrderId' as transaction_id from public.sale_drafts
where draft->>'externalOrderId' in ('53621','53622','53624');
grant select on vinted_test_drafts to authenticated;
create function pg_temp.book(p_transaction text,p_lines jsonb) returns jsonb language sql as $$
  select public.record_vinted_sale_draft(workspace_id,id,'{"sale_date":"2026-11-17","shipping_mode":"platform_prepaid"}',p_lines)
  from vinted_test_drafts where transaction_id=p_transaction;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','53600000-0000-4000-8000-000000000001',true);
select throws_ok($$update public.sale_drafts set vinted_source_id=null where draft->>'externalOrderId'='53621'$$,
  '42501',null,'Der Verkaufsentwurf kann seine bestätigte Quelle nicht selbst entfernen');
select ok(not has_column_privilege('authenticated','public.vinted_sale_draft_sources','booking_key','select'),
  'Die interne Buchungskennung ist für Clients nicht lesbar');
select throws_ok($$select pg_temp.book('53621','[{"position_kind":"free","title_snapshot":"Pullover","quantity":1,"unit_sale_price":24.50}]')$$,
  '22023',null,'Bei aktivem Shop kann ein Vinted-Entwurf ohne Bestandsartikel nicht gebucht werden');
select throws_ok($$select pg_temp.book('53624','[{"position_kind":"free","title_snapshot":"Hose","quantity":1,"unit_sale_price":10},{"position_kind":"free","title_snapshot":"Jacke","quantity":1,"unit_sale_price":10}]')$$,
  '22023',null,'Paketbuchung prüft den erst später bestätigten Gesamtbetrag');
select is(pg_temp.book('53622','[{"position_kind":"free","title_snapshot":"Pullover","quantity":1,"unit_sale_price":24.50}]')->'sale'->>'external_order_id',
  '53622','Deaktivierter Shop bucht den vorausgefüllten freien Verkauf');
select is(pg_temp.book('53621','[{"inventory_item_id":"53600000-0000-4000-8000-000000000031","quantity":1,"unit_sale_price":24.50}]')->'sale'->>'external_order_id',
  '53621','Aktiver Shop bucht den vorausgewählten Bestandsartikel');
select lives_ok($$select pg_temp.book('53621','[{"inventory_item_id":"53600000-0000-4000-8000-000000000031","quantity":1,"unit_sale_price":24.50}]')$$,
  'Eine wiederholte Anfrage nach der Buchung liefert dieselbe Buchung');
reset role;

select is((select count(*) from public.sales where external_order_id in ('53621','53622')),
  2::bigint,'Aus beiden Entwürfen entsteht jeweils genau ein Verkauf');
select is((select status from public.inventory_items where id='53600000-0000-4000-8000-000000000031'),
  'sold','Erst der abgeschlossene Bestandsverkauf setzt den Artikel auf verkauft');
select is((select status from public.inventory_items where id='53600000-0000-4000-8000-000000000032'),
  'listed','Gleichnamiger Bestandsartikel bleibt verfügbar');
select is((select count(*) from public.sale_drafts where draft->>'externalOrderId' in ('53621','53622')),
  0::bigint,'Die abgeschlossenen Entwürfe verschwinden aus der Entwurfsliste');
select pg_temp.import_sale('5362','53622');
select is((select count(*) from public.sale_drafts where draft->>'externalOrderId'='53622'),
  0::bigint,'Bereits gebuchter Verkauf erzeugt beim nächsten Import keinen Entwurf');

select pg_temp.import_sale('5362','53624','{"saleState":"cancelled","saleStateAt":"2026-11-17T10:00:00Z"}');
set local role authenticated;
select throws_ok($$select pg_temp.book('53624','[{"position_kind":"free","title_snapshot":"Hose","quantity":1,"unit_sale_price":10},{"position_kind":"free","title_snapshot":"Jacke","quantity":1,"unit_sale_price":20}]')$$,
  '22023',null,'Ein nachträglicher Storno verhindert den Abschluss eines offenen Entwurfs');
reset role;
select * from finish();
rollback;
