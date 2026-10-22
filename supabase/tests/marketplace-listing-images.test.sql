\set on_error_stop on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email) values ('46100000-0000-4000-8000-000000000001','authenticated','authenticated','draft-images@example.test');
insert into public.platform_operators(user_id) values ('46100000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values ('46100000-0000-4000-8000-000000000011','Fotos');
insert into public.workspace_members(workspace_id,user_id,role) values ('46100000-0000-4000-8000-000000000011','46100000-0000-4000-8000-000000000001','owner');
create temporary table image_test_context(kind text,body jsonb);
grant all on image_test_context to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','46100000-0000-4000-8000-000000000001',true);
insert into image_test_context values('draft',public.marketplace_create_listing_draft('46100000-0000-4000-8000-000000000011',null,'{}'));
insert into image_test_context values('other',public.marketplace_create_listing_draft('46100000-0000-4000-8000-000000000011',null,'{}'));
insert into image_test_context values('asset',public.marketplace_reserve_listing_image((select body->>'id' from image_test_context where kind='draft'),'jacke.jpg','image/jpeg',120));
select ok((select body->>'storagePath' from image_test_context where kind='asset') like '46100000-0000-4000-8000-000000000011/%','Server bestimmt den Workspace-Pfad');
select is((public.marketplace_read_listing_draft((select body->>'id' from image_test_context where kind='draft'))->>'revision'),'1','Reservieren ändert keine Bildauswahl');
select throws_ok($$select public.marketplace_commit_listing_image((select body->>'id' from image_test_context where kind='draft'),1,(select body->>'id' from image_test_context where kind='asset'))$$,'22023',null,'Nicht hochgeladene Bilder sind nicht auswählbar');
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) select 'marketplace-listing-media',body->>'storagePath','{"mimetype":"image/jpeg","size":120}' from image_test_context where kind='asset'$$,'Eigener reservierter Pfad darf hochgeladen werden');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values('marketplace-listing-media','46100000-0000-4000-8000-000000000011/geraten/a.jpg','{"mimetype":"image/jpeg","size":120}')$$,'42501',null,'Ein erratener Pfad hat keine Uploadfreigabe');
select throws_ok($$select public.marketplace_commit_listing_image((select body->>'id' from image_test_context where kind='other'),1,(select body->>'id' from image_test_context where kind='asset'))$$,'42501',null,'Bildreservierungen gehören zu genau einem Entwurf');
select is((public.marketplace_commit_listing_image((select body->>'id' from image_test_context where kind='draft'),1,(select body->>'id' from image_test_context where kind='asset'))->>'revision'),'2','Ein vollständiger Upload erhöht die Revision');
select is(jsonb_array_length(public.marketplace_read_listing_draft((select body->>'id' from image_test_context where kind='draft'))->'images'),1,'Entwurf enthält das bestätigte Foto');
select throws_ok($$select public.marketplace_set_listing_image_order((select body->>'id' from image_test_context where kind='draft'),1,'{}'::text[])$$,'40001',null,'Ein älterer Tab kann Fotos nicht entfernen');
select throws_ok($$select public.marketplace_discard_listing_image((select body->>'id' from image_test_context where kind='asset'))$$,'22023',null,'Bestätigte Bilder bleiben nach Antwortverlust erhalten');
select throws_ok($$select public.marketplace_set_listing_image_order((select body->>'id' from image_test_context where kind='draft'),2,array[(select body->>'id' from image_test_context where kind='asset'),(select '0'||(body->>'id') from image_test_context where kind='asset')])$$,'22023',null,'Zwei Textformen derselben Bild-ID dürfen keine Duplikate erzeugen');
select throws_ok($$select public.marketplace_set_listing_image_order((select body->>'id' from image_test_context where kind='other'),1,array[(select body->>'id' from image_test_context where kind='asset')])$$,'42501',null,'Keine fremde Bildzuordnung');
select is((public.marketplace_set_listing_image_order((select body->>'id' from image_test_context where kind='draft'),2,'{}'::text[])->>'revision'),'3','Entfernen ändert die Auswahl atomar');
select is(jsonb_array_length(public.marketplace_read_listing_draft((select body->>'id' from image_test_context where kind='draft'))->'images'),0,'Entferntes Bild gehört nicht mehr zur Auswahl');
select is((select count(*) from public.marketplace_listing_images),1::bigint,'Original bleibt für Sicherungen erhalten');
reset role;
select is((select public from storage.buckets where id='marketplace-listing-media'),false,'Inseratfotos sind privat');
insert into public.marketplace_listing_images(workspace_id,draft_id,storage_path,file_name,mime_type,byte_size,state,created_by)
select '46100000-0000-4000-8000-000000000011',(select (body->>'id')::bigint from image_test_context where kind='draft'),
  'fixture/full/'||position::text||'.jpg','foto.jpg','image/jpeg',120,'ready','46100000-0000-4000-8000-000000000001' from generate_series(1,99) position;
update public.marketplace_listing_drafts set image_ids=(select array_agg(id order by id) from public.marketplace_listing_images) where id=(select (body->>'id')::bigint from image_test_context where kind='draft');
set local role authenticated;
insert into image_test_context values('replacement',public.marketplace_reserve_listing_image((select body->>'id' from image_test_context where kind='draft'),'neu.jpg','image/jpeg',120));
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) select 'marketplace-listing-media',body->>'storagePath','{"mimetype":"image/jpeg","size":120}' from image_test_context where kind='replacement'$$,'Neues Original vor Ersetzung hochladen');
select throws_ok($$select public.marketplace_commit_listing_image((select body->>'id' from image_test_context where kind='draft'),2,(select body->>'id' from image_test_context where kind='replacement'),(select body->>'id' from image_test_context where kind='asset'))$$,'40001',null,'Auch Ersetzung verlangt die aktuelle Revision');
select throws_ok($$select public.marketplace_commit_listing_image((select body->>'id' from image_test_context where kind='draft'),3,(select body->>'id' from image_test_context where kind='replacement'),'999999999')$$,'42501',null,'Fremde oder nicht ausgewählte Originale werden nicht ersetzt');
select lives_ok($$select public.marketplace_commit_listing_image((select body->>'id' from image_test_context where kind='draft'),3,(select body->>'id' from image_test_context where kind='replacement'),(select body->>'id' from image_test_context where kind='asset'))$$,'Bei 100 Fotos ist bestätigte atomare Ersetzung erlaubt');
select is(jsonb_array_length(public.marketplace_read_listing_draft((select body->>'id' from image_test_context where kind='draft'))->'images'),100,'Ersetzen benötigt keinen zusätzlichen Auswahlplatz');
select is(public.marketplace_read_listing_draft((select body->>'id' from image_test_context where kind='draft'))->'images'->0->>'fileName','neu.jpg','Ersetzung behält die Titelbildposition');
select is((select state from public.marketplace_listing_images where id=(select (body->>'id')::bigint from image_test_context where kind='asset')),'ready','Ersetztes Original bleibt für Sicherungen erhalten');
insert into image_test_context values('pending',public.marketplace_reserve_listing_image((select body->>'id' from image_test_context where kind='draft'),'later.jpg','image/jpeg',120));
insert into storage.objects(bucket_id,name,metadata) select 'marketplace-listing-media',body->>'storagePath','{"mimetype":"image/jpeg","size":120}' from image_test_context where kind='pending';
select lives_ok($$select public.marketplace_delete_listing_draft('46100000-0000-4000-8000-000000000011',(select body->>'id' from image_test_context where kind='draft'),4)$$,
 'Eine Arbeitskopie mit Fotos kann gelöscht werden');
select throws_ok($$select public.marketplace_commit_listing_image((select body->>'id' from image_test_context where kind='draft'),4,(select body->>'id' from image_test_context where kind='pending'))$$,
 '42501','Kein Zugriff auf diesen Entwurf.','Ein laufender Upload kann einen gelöschten Entwurf nicht mehr verändern');
select throws_ok($$select public.marketplace_commit_listing_image((select body->>'id' from image_test_context where kind='draft'),4,(select body->>'id' from image_test_context where kind='replacement'))$$,
 '42501','Kein Zugriff auf diesen Entwurf.','Auch eine wiederholte Uploadbestätigung kann gelöschte Entwürfe nicht öffnen');
select is(public.marketplace_discard_listing_image((select body->>'id' from image_test_context where kind='pending')),
 (select body->>'storagePath' from image_test_context where kind='pending'),'Ein abgewiesener Upload bleibt nach Entwurfslöschung gezielt bereinigbar');
-- Der Storage-API-Kontext erlaubt Metadatenlöschung; Nutzerrolle und RLS bleiben aktiv.
select set_config('storage.allow_delete_query','true',true);
select lives_ok($$delete from storage.objects where bucket_id='marketplace-listing-media' and name=(select body->>'storagePath' from image_test_context where kind='pending')$$,
 'Der eigene unbestätigte Upload kann weiter über die Storage-Policy entfernt werden');
select set_config('storage.allow_delete_query','false',true);
select is((select state from public.marketplace_listing_images where id=(select (body->>'id')::bigint from image_test_context where kind='replacement')),
 'ready','Löschen der Arbeitskopie bewahrt die bestätigten Originaldaten');
select is((select count(*) from storage.objects where bucket_id='marketplace-listing-media' and name=(select body->>'storagePath' from image_test_context where kind='replacement')),
 1::bigint,'Löschen der Arbeitskopie entfernt keine Storage-Datei');
select * from finish();
rollback;
