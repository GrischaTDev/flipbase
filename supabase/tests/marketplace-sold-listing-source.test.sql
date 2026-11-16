\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('57000000-0000-4000-8000-000000000001','authenticated','authenticated','action-owner@example.test','{}','{}'),
 ('57000000-0000-4000-8000-000000000002','authenticated','authenticated','action-other@example.test','{}','{}'),
 ('57000000-0000-4000-8000-000000000003','authenticated','authenticated','action-admin@example.test','{}','{}');
insert into public.platform_operators(user_id) values('57000000-0000-4000-8000-000000000001'),('57000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values('57000000-0000-4000-8000-000000000011','Aktionen A'),('57000000-0000-4000-8000-000000000012','Aktionen B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000001','owner'),
 ('57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000003','admin'),
 ('57000000-0000-4000-8000-000000000012','57000000-0000-4000-8000-000000000002','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,execution_mode,external_account_id) values
 ('57000000-0000-4000-8000-000000000021','57000000-0000-4000-8000-000000000011','A','connected','cloud','5701'),
 ('57000000-0000-4000-8000-000000000022','57000000-0000-4000-8000-000000000011','B','connected','cloud','5702'),
 ('57000000-0000-4000-8000-000000000023','57000000-0000-4000-8000-000000000012','C','connected','cloud','5703');
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values
 ('57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000021','action-profile-a'),
 ('57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000022','action-profile-b'),
 ('57000000-0000-4000-8000-000000000012','57000000-0000-4000-8000-000000000023','action-profile-c');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values
 ('57000000-0000-4000-8000-000000000031','57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000021','profile','5701','{}'),
 ('57000000-0000-4000-8000-000000000032','57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000022','profile','5702','{}'),
 ('57000000-0000-4000-8000-000000000033','57000000-0000-4000-8000-000000000012','57000000-0000-4000-8000-000000000023','profile','5703','{}'),
 ('57000000-0000-4000-8000-000000000034','57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000021','publication','57011','{"title":"Artikel A"}'),
 ('57000000-0000-4000-8000-000000000035','57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000021','publication','57012','{"title":"Artikel B"}');

insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values
 ('57000000-0000-4000-8000-000000000036','57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000021','sale','57555','{"title":"Paketverkauf","itemIds":["57011","57012"],"itemCount":2,"externalConversationId":"575551","sellerId":"5701","saleState":"completed"}');
create temporary table sold_source_action(body jsonb);
grant all on sold_source_action to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into sold_source_action select public.marketplace_account_action_enqueue('57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000021',gen_random_uuid(),'listing_content_read','{"entryId":"57000000-0000-4000-8000-000000000036","saleItemId":"57011"}')->'action';
select is((select body->>'state' from sold_source_action),'queued','Verkaufsartikel wird in derselben Kontowarteschlange gelesen');
select throws_ok($$select public.marketplace_account_action_enqueue('57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000021',gen_random_uuid(),'listing_content_read','{"entryId":"57000000-0000-4000-8000-000000000036","saleItemId":"99999"}')$$,'22023',null,'Fremder Artikel im eigenen Verkauf wird abgewiesen');
select throws_ok($$select public.marketplace_account_action_enqueue('57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000022',gen_random_uuid(),'listing_content_read','{"entryId":"57000000-0000-4000-8000-000000000036","saleItemId":"57011"}')$$,'22023',null,'Fremdes Konto darf den Verkauf nicht lesen');
select throws_ok($$select public.marketplace_account_action_enqueue('57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000021',gen_random_uuid(),'listing_content_read','{"entryId":"57000000-0000-4000-8000-000000000034","saleItemId":"57011"}')$$,'22023',null,'Ein Inserateintrag wird nicht als Verkaufsbeleg akzeptiert');
select throws_ok($$select public.marketplace_account_action_enqueue('57000000-0000-4000-8000-000000000011','57000000-0000-4000-8000-000000000021',gen_random_uuid(),'listing_content_read','{"entryId":"57000000-0000-4000-8000-000000000036","saleItemId":57011}')$$,'22023',null,'Artikelkennung muss eine Zeichenkette sein');
reset role;
select is((select entry_kind from public.marketplace_account_actions where public_id=(select (body->>'id')::uuid from sold_source_action)),'sale','Auftrag bleibt an den bisherigen Verkaufsbeleg gebunden');
select is((select external_id from public.marketplace_account_actions where public_id=(select (body->>'id')::uuid from sold_source_action)),'57555','Transaktionskennung wird nicht durch die Artikelkennung ersetzt');
select is((select is_write from public.marketplace_account_actions where public_id=(select (body->>'id')::uuid from sold_source_action)),false,'Lesen löst keine Anbieteränderung aus');
select is((select body->>'saleState' from public.marketplace_account_entries where id='57000000-0000-4000-8000-000000000036'),'completed','Verkauf bleibt unverändert abgeschlossen');
select throws_ok($$update public.marketplace_account_entries set body=jsonb_set(body,'{sellerId}','"5702"') where id='57000000-0000-4000-8000-000000000036'$$,'22023',null,'Verkaufsbeleg verweigert fremden Verkäufer');
reset role;
select * from finish();
rollback;
