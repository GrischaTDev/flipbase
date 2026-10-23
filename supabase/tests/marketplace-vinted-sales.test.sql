\set on_error_stop on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('46800000-0000-4000-8000-000000000001','authenticated','authenticated','vinted-sales@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('46800000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values ('46800000-0000-4000-8000-000000000011','Verkäufe'),('46800000-0000-4000-8000-000000000012','Fremd');
insert into public.workspace_members(workspace_id,user_id,role) values ('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
('46800000-0000-4000-8000-000000000021','46800000-0000-4000-8000-000000000011','Verkäufer','connected','123'),
('46800000-0000-4000-8000-000000000022','46800000-0000-4000-8000-000000000011','Anderes Konto','connected','456'),
('46800000-0000-4000-8000-000000000023','46800000-0000-4000-8000-000000000012','Fremder Workspace','connected','789');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,observed_at,body) select
'46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000021','publication',n::text,'2026-10-21T09:00:00Z',
jsonb_build_object('title','Paketartikel '||n,'publicationState','active','publicationAge',jsonb_build_object('value',n,'unit','day','observedAt','2026-10-20T10:00:00Z')) from generate_series(41,46) n;
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body) values
('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000022','publication','41','{"title":"Anderes Konto","publicationState":"active"}'),
('46800000-0000-4000-8000-000000000012','46800000-0000-4000-8000-000000000023','publication','41','{"title":"Fremd","publicationState":"active"}');
create function pg_temp.sale(p_state text,p_at text,p_ids jsonb default '["41","42","43","44","45","46"]',p_price jsonb default '40') returns void language sql as $$
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at)
values ('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000021','sale','71',
jsonb_build_object('title','6 Artikel','saleState',p_state,'status',p_state,'saleStateAt',p_at,'sellerId','123','externalConversationId','51','itemIds',p_ids,'itemCount',6,'price',p_price,'currency','EUR','occurredAt','2026-10-21T10:00:00Z'),p_at::timestamptz)
on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
$$;
select pg_temp.sale('sold','2026-10-21T10:00:00Z');
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),0::bigint,'Paketverkauf entfernt alle sechs Artikel aus der sichtbaren Liste');
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000022'),1::bigint,'Identische Artikelkennung eines anderen Kontos bleibt sichtbar');
select is((select count(*) from public.marketplace_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),6::bigint,'Lesekopien bleiben für die Nachvollziehbarkeit erhalten');
select pg_temp.sale('cancelled','2026-10-22T10:00:00Z','[]','null');
select is((select body->>'saleState' from public.marketplace_account_entries where kind='sale' and external_id='71'),'cancelled','Stornierung bleibt als Verkaufsvorgang gespeichert');
select is((select jsonb_array_length(body->'itemIds') from public.marketplace_account_entries where kind='sale' and external_id='71'),6,'Unvollständige Stornierantwort erhält sämtliche Paketartikel');
select is((select body->>'price' from public.marketplace_account_entries where kind='sale' and external_id='71'),'40','Stornierantwort ohne Preis erhält den tatsächlich gelesenen Verkaufspreis');
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),0::bigint,'Stornierung allein ist keine Wiederveröffentlichung');
select pg_temp.sale('sold','2026-10-21T10:00:00Z');
select is((select body->>'saleState' from public.marketplace_account_entries where kind='sale' and external_id='71'),'cancelled','Älterer Verkaufsausschnitt nimmt Stornierung nicht zurück');
select pg_temp.sale('shipped','2026-10-22T10:30:00Z');
select is((select body->>'saleState' from public.marketplace_account_entries where kind='sale' and external_id='71'),'cancelled','Auch ein später aktualisierter alter Versandstatus nimmt Stornierung nicht zurück');
select pg_temp.sale('relisted','2026-10-22T11:00:00Z');
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),0::bigint,'Wiederaufnahmeereignis allein gibt keine veralteten Anbieterkennungen frei');
update public.marketplace_account_entries set observed_at='2026-10-22T12:00:00Z' where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021';
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),6::bigint,'Anbieterbeleg zur Wiederaufnahme gibt das gesamte aktive Paket frei');
select is((select count(*) from public.marketplace_account_entries where kind='sale' and external_id='71'),1::bigint,'Wiederaufnahme dupliziert und löscht keinen Verkaufsvorgang');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at)
select workspace_id,connection_id,kind,'70',body||'{"saleState":"cancelled","saleStateAt":"2026-10-20T10:00:00Z"}','2026-10-20T10:00:00Z' from public.marketplace_account_entries where kind='sale' and external_id='71';
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),6::bigint,'Ein älterer stornierter Kauf sperrt spätere belegte Wiederaufnahme nicht');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at)
select workspace_id,connection_id,kind,'72',body||'{"saleState":"sold","saleStateAt":"2026-10-22T13:00:00Z"}','2026-10-22T13:00:00Z' from public.marketplace_account_entries where kind='sale' and external_id='71';
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),0::bigint,'Ein neuerer Kauf sperrt den Artikel trotz früherer Wiederaufnahme');
update public.marketplace_account_entries set body=body||'{"saleState":"relisted","saleStateAt":"2026-10-22T14:00:00Z"}',sort_at='2026-10-22T14:00:00Z' where kind='sale' and external_id='72';
update public.marketplace_account_entries set observed_at='2026-10-22T15:00:00Z' where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021';
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),6::bigint,'Wiederholter Kauf und Wiederaufnahme bleiben nach aktueller Anbieterliste möglich');
-- Ein weiterer bestätigter Vorgang ohne Quellzeit darf keine belegte Freigabe verdrängen.
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at)
select workspace_id,connection_id,kind,'73',body||'{"saleState":"shipped","saleStateAt":null,"occurredAt":null}','1970-01-01T00:00:00Z' from public.marketplace_account_entries where kind='sale' and external_id='71';
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),0::bigint,'Zeitlich ungeklärter weiterer Verkauf verhindert eine unbewiesene Freigabe');
update public.marketplace_account_entries set body=body||'{"saleState":"relisted","saleStateAt":"2026-10-22T14:30:00Z"}',sort_at='2026-10-22T14:30:00Z' where kind='sale' and external_id='73';
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),6::bigint,'Belegte Wiederaufnahme löst auch einen zuvor zeitlich ungeklärten Verkauf auf');
select set_config('request.jwt.claim.sub','46800000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"46800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.marketplace_visible_account_entries where workspace_id='46800000-0000-4000-8000-000000000012'),0::bigint,'Sicht übernimmt die Workspace-Rechte der Ursprungstabelle');
select is((select count(*) from public.marketplace_visible_account_entries where kind='publication' and connection_id='46800000-0000-4000-8000-000000000021'),6::bigint,'Angemeldete lesen die eigene aktive Liste direkt durch die Sicht');
select is((public.marketplace_read_page('46800000-0000-4000-8000-000000000011','46800000-0000-4000-8000-000000000021','publication')->>'total')::integer,6,'Seitenzähler verwendet dieselbe sichtbare Liste');
reset role;
select * from finish();
rollback;
