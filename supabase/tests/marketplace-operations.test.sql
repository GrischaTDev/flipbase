\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
 ('27000000-0000-4000-8000-000000000001','authenticated','authenticated','operation-owner@example.test','{}','{}'),
 ('27000000-0000-4000-8000-000000000002','authenticated','authenticated','operation-other@example.test','{}','{}');
insert into public.platform_operators (user_id) values ('27000000-0000-4000-8000-000000000001');
insert into public.workspaces (id, name) values
 ('27000000-0000-4000-8000-000000000011','Operation A'),
 ('27000000-0000-4000-8000-000000000012','Operation B');
insert into public.workspace_members (workspace_id, user_id, role) values
 ('27000000-0000-4000-8000-000000000011','27000000-0000-4000-8000-000000000001','owner'),
 ('27000000-0000-4000-8000-000000000012','27000000-0000-4000-8000-000000000002','owner');
insert into public.marketplace_connections (id, workspace_id, display_name, status) values
 ('27000000-0000-4000-8000-000000000021','27000000-0000-4000-8000-000000000011','Konto A','connected'),
 ('27000000-0000-4000-8000-000000000022','27000000-0000-4000-8000-000000000012','Konto B','connected');

select ok(not has_table_privilege('authenticated','public.marketplace_operations','insert'),
 'Browseraufträge können nicht direkt vom Client erfunden werden');
select ok(not has_function_privilege('authenticated',
 'public.marketplace_cache_listing_text(uuid,uuid,uuid,text,text,boolean,text,numeric)','execute'),
 'Nur der Worker darf Inseratwerte zwischenspeichern');
select ok(not has_function_privilege('authenticated',
 'public.marketplace_cache_profile_about(uuid,uuid,text,text)','execute'),
 'Nur der Worker darf Profilwerte zwischenspeichern');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table own_operation as
  select public.marketplace_sync_enqueue('27000000-0000-4000-8000-000000000011',
    '27000000-0000-4000-8000-000000000021') as value;
select is((select value->>'id' from own_operation),
  (public.marketplace_sync_enqueue('27000000-0000-4000-8000-000000000011',
    '27000000-0000-4000-8000-000000000021')->>'id'),
  'Doppelklick verwendet denselben Auftrag');
select throws_ok($$select public.marketplace_sync_enqueue(
 '27000000-0000-4000-8000-000000000012','27000000-0000-4000-8000-000000000022')$$,
 '42501',null,'Fremder Workspace ist gesperrt');
select is((select count(*)::integer from public.marketplace_operations),1,
 'Nur Auftrag im eigenen Workspace ist sichtbar');
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.marketplace_operations),0,
 'Fremder Nutzer sieht keinen Auftrag');
select throws_ok($$select public.marketplace_sync_enqueue(
 '27000000-0000-4000-8000-000000000011','27000000-0000-4000-8000-000000000021')$$,
 '42501',null,'Fremder Nutzer startet keinen Auftrag');
reset role;

insert into public.marketplace_account_entries
 (id,workspace_id,connection_id,kind,external_id,body) values
 ('27000000-0000-4000-8000-000000000031','27000000-0000-4000-8000-000000000011',
  '27000000-0000-4000-8000-000000000021','publication','41',
  '{"title":"Jacke","text":"Gelesen","textState":"loaded","price":19}');
update public.marketplace_account_entries set body =
 '{"title":"Jacke","text":null,"textState":"not_loaded","price":19}'::jsonb
 where id='27000000-0000-4000-8000-000000000031';
select is((select body->>'text' from public.marketplace_account_entries
 where id='27000000-0000-4000-8000-000000000031'),'Gelesen',
 'Listenimport überschreibt die gelesene Beschreibung nicht');
select is(public.marketplace_cache_listing_text(
 '27000000-0000-4000-8000-000000000011','27000000-0000-4000-8000-000000000021',
 '27000000-0000-4000-8000-000000000031','41','Neu',true,'Neue Jacke',21),true,
 'Bestätigte Änderung erreicht den richtigen Eintrag');
select is((select body->>'title' from public.marketplace_account_entries
 where id='27000000-0000-4000-8000-000000000031'),'Neue Jacke',
 'Bestätigter Titel ist sofort gespeichert');
select is(public.marketplace_cache_listing_text(
 '27000000-0000-4000-8000-000000000012','27000000-0000-4000-8000-000000000022',
 '27000000-0000-4000-8000-000000000031','41','Fremd',true,'Fremd',1),false,
 'Cache akzeptiert keinen Eintrag eines fremden Kontos');

insert into public.marketplace_account_entries
 (id,workspace_id,connection_id,kind,external_id,body) values
 ('27000000-0000-4000-8000-000000000032','27000000-0000-4000-8000-000000000011',
  '27000000-0000-4000-8000-000000000021','profile','123',
  '{"bio":"Alter Text","bioState":"loaded"}');
select is(public.marketplace_cache_profile_about(
 '27000000-0000-4000-8000-000000000011','27000000-0000-4000-8000-000000000021',
 '123','Neuer Text'),true,'Bestätigter Profiltext wird gespeichert');
update public.marketplace_account_entries set body =
 '{"bio":null,"bioState":"not_loaded"}'::jsonb
 where id='27000000-0000-4000-8000-000000000032';
select is((select body->>'bio' from public.marketplace_account_entries
 where id='27000000-0000-4000-8000-000000000032'),'Neuer Text',
 'Listenimport löscht den bestätigten Profiltext nicht');

select * from finish();
rollback;
