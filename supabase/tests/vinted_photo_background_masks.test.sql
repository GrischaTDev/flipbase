\set on_error_stop on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,aud,role,email) values
 ('45900000-0000-4000-8000-000000000001','authenticated','authenticated','mask-owner@example.test'),
 ('45900000-0000-4000-8000-000000000002','authenticated','authenticated','mask-member@example.test'),
 ('45900000-0000-4000-8000-000000000003','authenticated','authenticated','mask-other@example.test');
insert into public.platform_operators(user_id) values
 ('45900000-0000-4000-8000-000000000001'),
 ('45900000-0000-4000-8000-000000000003');
insert into public.workspaces(id,name) values
 ('45900000-0000-4000-8000-000000000011','Masken-Shop-A'),
 ('45900000-0000-4000-8000-000000000012','Masken-Shop-B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('45900000-0000-4000-8000-000000000011','45900000-0000-4000-8000-000000000001','owner'),
 ('45900000-0000-4000-8000-000000000011','45900000-0000-4000-8000-000000000002','member'),
 ('45900000-0000-4000-8000-000000000012','45900000-0000-4000-8000-000000000003','owner');

create temporary table mask_ctx(kind text,body jsonb);
grant all on mask_ctx to authenticated;

select is((select public from storage.buckets where id='marketplace-listing-masks'),false,'Masken-Bucket ist privat');

insert into mask_ctx values('first',public.reserve_vinted_photo_background_mask(
 '45900000-0000-4000-8000-000000000001','45900000-0000-4000-8000-000000000011',repeat('a',64),'fal','fal-ai/birefnet'));
select is((select body->>'cached' from mask_ctx where kind='first'),'false','Erste Maskenanfrage reserviert Slot');
select is(public.reserve_vinted_photo_background_mask(
 '45900000-0000-4000-8000-000000000001','45900000-0000-4000-8000-000000000011',repeat('a',64),'fal','fal-ai/birefnet')->>'error',
 'mask_busy','Parallele offene Maskenberechnung desselben Nutzers wird blockiert');

update public.vinted_photo_background_masks set status='completed',byte_size=512,estimated_cost_usd=0.001,finished_at=now()
 where id=(select (body->>'id')::uuid from mask_ctx where kind='first');
insert into storage.objects(bucket_id,name,metadata)
 select 'marketplace-listing-masks',body->>'storagePath','{"mimetype":"image/png","size":512}' from mask_ctx where kind='first';

select is(public.reserve_vinted_photo_background_mask(
 '45900000-0000-4000-8000-000000000001','45900000-0000-4000-8000-000000000011',repeat('a',64),'fal','fal-ai/birefnet')->>'cached',
 'true','Abgeschlossene Maske wird ohne neue Kosten wiederverwendet');
select is((select count(*) from public.vinted_photo_background_masks),1::bigint,'Cache-Treffer erzeugt keinen neuen Eintrag');

select throws_ok($$select public.reserve_vinted_photo_background_mask('45900000-0000-4000-8000-000000000002','45900000-0000-4000-8000-000000000011',repeat('b',64),'fal','fal-ai/birefnet')$$,
 '42501',null,'Normales Mitglied ohne Verwaltungsrecht darf keine Masken reservieren');
select throws_ok($$select public.reserve_vinted_photo_background_mask('45900000-0000-4000-8000-000000000001','45900000-0000-4000-8000-000000000012',repeat('b',64),'fal','fal-ai/birefnet')$$,
 '42501',null,'Fremder Workspace wird abgewiesen');
select throws_ok($$select public.reserve_vinted_photo_background_mask('45900000-0000-4000-8000-000000000001','45900000-0000-4000-8000-000000000011','kurz','fal','fal-ai/birefnet')$$,
 '22023',null,'Ungueltiger Hash wird abgewiesen');

set local role authenticated;
select set_config('request.jwt.claim.sub','45900000-0000-4000-8000-000000000001',true);
select is((select count(*) from storage.objects where bucket_id='marketplace-listing-masks'),1::bigint,'Berechtigter Workspace darf fertige Maske im Storage lesen');
select is((public.vinted_photo_background_mask_usage('45900000-0000-4000-8000-000000000011')->0->>'completed_requests')::integer,1,'Nutzungsuebersicht zaehlt abgeschlossene Masken');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values('marketplace-listing-masks','45900000-0000-4000-8000-000000000011/fake.png','{"mimetype":"image/png","size":10}')$$,
 '42501',null,'Client darf nicht direkt in den Masken-Bucket schreiben');

insert into mask_ctx values('draftA',public.marketplace_create_listing_draft('45900000-0000-4000-8000-000000000011',null,'{}'));
insert into mask_ctx values('img1',public.marketplace_reserve_listing_image((select body->>'id' from mask_ctx where kind='draftA'),'a.jpg','image/jpeg',120));
insert into storage.objects(bucket_id,name,metadata) select 'marketplace-listing-media',body->>'storagePath','{"mimetype":"image/jpeg","size":120}' from mask_ctx where kind='img1';
select lives_ok($$select public.marketplace_commit_listing_image((select body->>'id' from mask_ctx where kind='draftA'),1,(select body->>'id' from mask_ctx where kind='img1'))$$,'Erstes Foto bestaetigt');

select lives_ok($$select public.marketplace_set_listing_photo_options(
  (select body->>'id' from mask_ctx where kind='draftA'),2,
  jsonb_build_object('resize',null,'crops','{}'::jsonb,'backgroundCalm',
    jsonb_build_object((select body->>'id' from mask_ctx where kind='img1'),jsonb_build_object('maskId',(select body->>'id' from mask_ctx where kind='first'),'strength',75))))$$,
 'Gueltige backgroundCalm-Option mit eigener Maske wird akzeptiert');

select throws_ok($$select public.marketplace_set_listing_photo_options(
  (select body->>'id' from mask_ctx where kind='draftA'),3,
  jsonb_build_object('resize',null,'crops','{}'::jsonb,'backgroundCalm',
    jsonb_build_object((select body->>'id' from mask_ctx where kind='img1'),jsonb_build_object('maskId',(select body->>'id' from mask_ctx where kind='first'),'strength',101))))$$,
 '22023',null,'Ungueltige Staerke > 100 wird abgelehnt');

select is(
  public.marketplace_set_listing_image_order((select body->>'id' from mask_ctx where kind='draftA'),3,'{}'::text[])->'photoOptions'->'backgroundCalm',
  '{}'::jsonb,
  'Entfernen des Fotos bereinigt auch dessen backgroundCalm-Eintrag');

select set_config('request.jwt.claim.sub','45900000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.vinted_photo_background_masks),0::bigint,'Fremder Workspace sieht keine fremden Fotomasken');
select is((select count(*) from storage.objects where bucket_id='marketplace-listing-masks'),0::bigint,'Fremder Workspace sieht keine fremden Storage-Masken');
insert into mask_ctx values('draftB',public.marketplace_create_listing_draft('45900000-0000-4000-8000-000000000012',null,'{}'));
insert into mask_ctx values('imgB',public.marketplace_reserve_listing_image((select body->>'id' from mask_ctx where kind='draftB'),'b.jpg','image/jpeg',120));
insert into storage.objects(bucket_id,name,metadata) select 'marketplace-listing-media',body->>'storagePath','{"mimetype":"image/jpeg","size":120}' from mask_ctx where kind='imgB';
select lives_ok($$select public.marketplace_commit_listing_image((select body->>'id' from mask_ctx where kind='draftB'),1,(select body->>'id' from mask_ctx where kind='imgB'))$$,'Eigenes Foto B bestaetigt');
select throws_ok($$select public.marketplace_set_listing_photo_options(
  (select body->>'id' from mask_ctx where kind='draftB'),2,
  jsonb_build_object('resize',null,'crops','{}'::jsonb,'backgroundCalm',
    jsonb_build_object((select body->>'id' from mask_ctx where kind='imgB'),jsonb_build_object('maskId',(select body->>'id' from mask_ctx where kind='first'),'strength',60))))$$,
 '22023',null,'Maske eines fremden Workspaces darf nicht uebernommen werden');

reset role;
insert into public.vinted_photo_background_masks(workspace_id,user_id,input_hash,provider,model,status)
 select '45900000-0000-4000-8000-000000000011','45900000-0000-4000-8000-000000000001',repeat('c',64),'fal','fal-ai/birefnet','failed'
 from generate_series(1,59);
select is(public.reserve_vinted_photo_background_mask(
 '45900000-0000-4000-8000-000000000001','45900000-0000-4000-8000-000000000011',repeat('d',64),'fal','fal-ai/birefnet')->>'error',
 'mask_limit','Stundenlimit greift nach 60 Maskenanfragen');

select * from finish();
rollback;
