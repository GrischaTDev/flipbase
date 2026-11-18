\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
-- Gesprächsabruf als gespeicherter Auftrag: Die Datenbank nimmt nur das angefragte Gespräch an.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('58000000-0000-4000-8000-000000000001','authenticated','authenticated','chat-read-owner@example.test','{}','{}');
insert into public.platform_operators(user_id) values('58000000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('58000000-0000-4000-8000-000000000011','Chatabruf');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,execution_mode,external_account_id) values
 ('58000000-0000-4000-8000-000000000021','58000000-0000-4000-8000-000000000011','Chat','connected','cloud','5801');
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values
 ('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','chat-read-profile');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at,observed_at) values
 ('58000000-0000-4000-8000-000000000031','58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','profile','5801','{}','2026-11-01T10:00:00Z','2026-11-01T10:00:00Z'),
 ('58000000-0000-4000-8000-000000000032','58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','conversation','58011','{"title":"Ziel"}','2026-11-01T10:00:00Z','2026-11-01T10:00:00Z'),
 ('58000000-0000-4000-8000-000000000033','58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','conversation','58012','{"title":"Anderes"}','2026-11-01T10:00:00Z','2026-11-01T10:00:00Z'),
 ('58000000-0000-4000-8000-000000000034','58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','sale','58021','{"sellerId":"5801","externalConversationId":"58011","saleState":"completed","saleStateAt":"2026-11-01T10:00:00Z","itemIds":["58031"],"itemCount":1,"brand":"Burberry"}','2026-11-01T10:00:00Z','2026-11-01T10:00:00Z');
create temporary table read_context(name text primary key,body jsonb);
grant all on read_context to authenticated,service_role;

set local role service_role;
select public.marketplace_worker_claim('58000000-0000-4000-8000-000000000041');
select public.marketplace_browser_capacity_report('58000000-0000-4000-8000-000000000041',1,2);
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"58000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into read_context values('action',public.marketplace_account_action_enqueue('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021',
  gen_random_uuid(),'conversations_read','{"conversationId":"58000000-0000-4000-8000-000000000032"}')->'action');
reset role;
set local role service_role;
insert into read_context values('claim',public.marketplace_browser_work_claim('58000000-0000-4000-8000-000000000041',1,gen_random_uuid(),true)->'claim');
select is((select body->>'actionKind' from read_context where name='claim'),'conversations_read','Gesprächsabruf wird als Auftrag beansprucht');

-- Snapshot wie aus dem Postfach: Profil, Zielgespräch mit Nachricht und der bestätigte Verkauf.
create function pg_temp.snapshot(p_entries jsonb, p_conversations text) returns jsonb language sql as $$
  select jsonb_build_object('identity',jsonb_build_object('id','5801'),'observedAt',statement_timestamp(),'entries',(
    select jsonb_agg(case when entry->>'kind'='conversation' then jsonb_set(entry,'{body,detailCheckedAt}',to_jsonb(statement_timestamp())) else entry end)
    from jsonb_array_elements(p_entries) entry),
    'areas',jsonb_build_object('profile','{"status":"complete"}'::jsonb,'publications','{"status":"partial"}'::jsonb,
      'conversations',jsonb_build_object('status',p_conversations),'messages','{"status":"partial"}'::jsonb,
      'sales','{"status":"partial"}'::jsonb,'feedback','{"status":"partial"}'::jsonb));
$$;
create function pg_temp.apply(p_snapshot jsonb) returns jsonb language sql as $$
  select public.marketplace_apply_vinted_import('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021',
    (select (body->>'sessionId')::uuid from read_context where name='claim'),'58000000-0000-4000-8000-000000000001',p_snapshot);
$$;
insert into read_context values('profile','{"kind":"profile","externalId":"5801","sortAt":"2026-11-16T00:00:00Z","body":{"feedbacks":[]}}');
insert into read_context values('target','{"kind":"conversation","externalId":"58011","sortAt":"2026-11-16T00:00:00Z","body":{"title":"Ziel neu"}}');
insert into read_context values('message','{"kind":"message","externalId":"580111","parentExternalId":"58011","sortAt":"2026-11-16T00:00:00Z","body":{"text":"Hallo"}}');
insert into read_context values('foreign','{"kind":"conversation","externalId":"58012","sortAt":"2026-11-16T00:00:00Z","body":{"title":"Anderes neu"}}');
insert into read_context values('sale','{"kind":"sale","externalId":"58021","sortAt":"2026-11-16T00:00:00Z","body":{"sellerId":"5801","externalConversationId":"58011","saleState":"sold","saleStateAt":"2026-11-01T10:00:00Z","status":"Verkauft","itemIds":["58031"],"itemCount":1,"shippingLabelAction":"order"}}');
insert into read_context values('confirmed',
  jsonb_set((select body from read_context where name='target'),'{body}','{"title":"Ziel neu","saleTrackingVersion":3,"saleTransactionId":"58021","saleSellerId":"5801"}'));

select throws_ok($$select pg_temp.apply(pg_temp.snapshot(jsonb_build_array(
  (select body from read_context where name='profile'),(select body from read_context where name='target'),
  (select body from read_context where name='message'),(select body from read_context where name='foreign')),'complete'))$$,
  '42501','Auftragsgebundener Importzugriff verweigert','Ungefilterter Postfachstand mit fremdem Gespräch wird abgelehnt');
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(jsonb_build_array(
  (select body from read_context where name='profile'),(select body from read_context where name='confirmed'),
  (select body from read_context where name='sale')),'complete'))$$,
  '42501','Auftragsgebundener Importzugriff verweigert','Gezielter Abruf darf andere Gespräche nicht bereinigen');
select throws_ok($$select pg_temp.apply(pg_temp.snapshot(jsonb_build_array(
  (select body from read_context where name='profile'),(select body from read_context where name='target'),
  (select body from read_context where name='sale')),'partial'))$$,
  '42501','Auftragsgebundener Importzugriff verweigert','Verkauf ohne bestätigte Zuordnung im Chat wird abgelehnt');
select throws_ok(format($$select pg_temp.apply(pg_temp.snapshot(jsonb_build_array(
  (select body from read_context where name='profile'),(select body from read_context where name='confirmed'),
  jsonb_set((select body from read_context where name='sale'),%L,%L::jsonb)),'partial'))$$,field_path,replacement),
  '42501','Auftragsgebundener Importzugriff verweigert',description)
from (values
  ('{body,externalConversationId}','"58012"','Verkauf aus einem anderen Chat wird abgelehnt'),
  ('{body,sellerId}','"5802"','Verkauf eines anderen Verkäuferkontos wird abgelehnt'),
  ('{externalId}','"58022"','Abweichende Transaktion wird abgelehnt')
) as invalid(field_path,replacement,description);
select is(pg_temp.apply(pg_temp.snapshot(jsonb_build_array(
  (select body from read_context where name='profile'),(select body from read_context where name='confirmed'),
  (select body from read_context where name='message'),(select body from read_context where name='sale')),'partial')),
  '{"profile":1,"publication":0,"conversation":1,"message":1,"sale":1}'::jsonb,
  'Zielgespräch, Nachricht und gebundener Verkauf werden gemeinsam übernommen');
select is((select body->>'shippingLabelAction' from public.marketplace_account_entries where kind='sale' and external_id='58021'),
  'order','Die Versandaktion ist im gespeicherten Verkauf vorhanden');
select is((select body->>'saleState' from public.marketplace_account_entries where kind='sale' and external_id='58021'),
  'sold','Ein fälschlich abgeschlossener Verkauf kehrt zu Verkauft zurück');
select is((select body->>'brand' from public.marketplace_account_entries where kind='sale' and external_id='58021'),
  'Burberry','Die Datenbank bewahrt die gesicherte Artikelmarke beim Teilimport');
select is((select body->>'title' from public.marketplace_account_entries where external_id='58011' and kind='conversation'),'Ziel neu','Zielgespräch ist aktualisiert');
select is((select count(*)::integer from public.marketplace_account_entries where kind='message' and external_id='580111'),1,'Nachricht des Zielgesprächs ist gespeichert');
select is((select body->>'title' from public.marketplace_account_entries where external_id='58012' and kind='conversation'),'Anderes','Teilstand löscht und ändert andere Gespräche nicht');

insert into read_context values('new-confirmed',jsonb_set((select body from read_context where name='confirmed'),'{body,saleTransactionId}','"58022"'));
insert into read_context values('new-sale',(select jsonb_set(jsonb_set(body,'{externalId}','"58022"'),'{body,title}','"Neue Jacke"') from read_context where name='sale'));
select is(pg_temp.apply(pg_temp.snapshot(jsonb_build_array(
  (select body from read_context where name='profile'),(select body from read_context where name='new-confirmed'),
  (select body from read_context where name='new-sale')),'partial'))->>'sale','1',
  'Gezielter Chatabruf importiert einen erstmals bestätigten Verkauf');
select pg_temp.apply(pg_temp.snapshot(jsonb_build_array(
  (select body from read_context where name='profile'),(select body from read_context where name='new-confirmed'),
  (select body from read_context where name='new-sale')),'partial'));
reset role;
select is((select array_agg(title) from public.sale_drafts where workspace_id='58000000-0000-4000-8000-000000000011' and draft->>'externalOrderId'='58022'),
  array['Neue Jacke'],'Der Verkauf aus wiederholtem Chatabruf steht als genau ein Verkaufsentwurf bereit');

select * from finish();
rollback;
