\set on_error_stop on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
 ('46000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'listing-draft-owner@example.test', '{}', '{}'),
 ('46000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'listing-draft-other@example.test', '{}', '{}');
insert into public.platform_operators (user_id) values
 ('46000000-0000-4000-8000-000000000001'), ('46000000-0000-4000-8000-000000000002');
insert into public.workspaces (id, name) values
 ('46000000-0000-4000-8000-000000000011', 'Inseratentwürfe'),
 ('46000000-0000-4000-8000-000000000012', 'Fremde Inseratentwürfe');
insert into public.workspace_members (workspace_id, user_id, role) values
 ('46000000-0000-4000-8000-000000000011', '46000000-0000-4000-8000-000000000001', 'owner'),
 ('46000000-0000-4000-8000-000000000012', '46000000-0000-4000-8000-000000000002', 'owner');
insert into public.marketplace_connections (id, workspace_id, display_name, execution_mode, status) values
 ('46000000-0000-4000-8000-000000000021', '46000000-0000-4000-8000-000000000011', 'Eigenes Konto', 'local', 'needs_login'),
 ('46000000-0000-4000-8000-000000000022', '46000000-0000-4000-8000-000000000012', 'Fremdes Konto', 'local', 'needs_login');

select has_table('public', 'marketplace_listing_drafts', 'Entwürfe haben eine eigene Tabelle');
select ok(public.marketplace_listing_content_valid('{"title":"Unvollständige Jacke"}'), 'Unvollständige Inhalte sind speicherbar');
select ok(not public.marketplace_listing_content_valid('{"priceCents":12.5}'), 'Centbeträge sind ganzzahlig');
select ok(not public.marketplace_listing_content_valid('{"title":false}'), 'Textfelder erlauben keine booleschen Werte');
select ok(not public.marketplace_listing_content_valid('{"title":"Hidden\u001f"}'), 'Unsichtbare Steuerzeichen sind gesperrt');
select ok(not public.marketplace_listing_content_valid('{"unknown":true}'), 'Unbekannte Felder werden abgelehnt');
select ok(public.marketplace_listing_content_valid('{"aiPhoto":true}'), 'KI-Fotos dürfen markiert werden');
select ok(public.marketplace_listing_content_valid('{"aiPhoto":false}'), 'Originalfotos dürfen markiert werden');
select ok(not public.marketplace_listing_content_valid('{"aiPhoto":"true"}'), 'Fotoangabe akzeptiert keinen Text');
select ok(not public.marketplace_listing_content_valid('{"aiPhoto":null}'), 'Fotoangabe akzeptiert kein null');
select ok(not public.marketplace_listing_content_valid('{"colorIds":[1,1]}'), 'Auswahlwerte dürfen nicht doppelt sein');
select ok(not public.marketplace_listing_content_valid('{"attributes":{"constructor":"x"}}'), 'Gefährliche Attributnamen sind gesperrt');
select ok(not has_table_privilege('anon', 'public.marketplace_listing_drafts', 'select'), 'Keine anonymen Entwürfe');
select ok(not has_table_privilege('authenticated', 'public.marketplace_listing_drafts', 'update'), 'Revisionen lassen sich nicht direkt überschreiben');

create temporary table draft_test_context (body jsonb);
grant all on draft_test_context to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-000000000001', true);
insert into draft_test_context select public.marketplace_create_listing_draft(
 '46000000-0000-4000-8000-000000000011', null, '{"title":"Meine Jacke"}', p_request_id=>'46000000-0000-4000-8000-000000000031');
select is((public.marketplace_create_listing_draft('46000000-0000-4000-8000-000000000011',null,'{"title":"Antwortverlust"}',p_request_id=>'46000000-0000-4000-8000-000000000031')->>'id'),
 (select body->>'id' from draft_test_context),'Wiederholen nach Antwortverlust legt keinen zweiten Entwurf an');
select is((select body->>'revision' from draft_test_context), '1', 'Neuer Entwurf beginnt bei Revision eins');
select is((select jsonb_typeof(body->'id') from draft_test_context), 'string', 'IDs werden verlustfrei als Text übertragen');
select is((select body->'content'->>'priceCents' from draft_test_context), null, 'Einkaufskosten sind kein Verkaufspreis');
select is((select body->>'connectionId' from draft_test_context), null, 'Vorbereitung braucht kein Konto');
select is((select count(*) from public.marketplace_listing_drafts), 1::bigint, 'Der eigene Entwurf ist sichtbar');
select throws_ok($$select public.marketplace_create_listing_draft('46000000-0000-4000-8000-000000000011','46000000-0000-4000-8000-000000000022','{}')$$,
 '42501', null, 'Ein fremdes Zielkonto wird abgelehnt');
select is((public.marketplace_save_listing_draft((select body->>'id' from draft_test_context), 1,
 '{"title":"Neue Jacke","priceCents":4200,"aiPhoto":true}', '46000000-0000-4000-8000-000000000021')->>'revision'), '2', 'Speichern erhöht die Revision');
select throws_ok($$select public.marketplace_save_listing_draft((select body->>'id' from draft_test_context),1,'{"title":"Alter Tab"}',null)$$,
 '40001', null, 'Der alte Tab überschreibt keine neuere Revision');
select is((public.marketplace_read_listing_draft((select body->>'id' from draft_test_context))->'content'->>'title'),
 'Neue Jacke', 'Nach Konflikt bleibt der neue Inhalt erhalten');
select is((public.marketplace_read_listing_draft((select body->>'id' from draft_test_context))->'content'->>'aiPhoto'), 'true', 'Gespeicherte KI-Fotoangabe bleibt beim erneuten Laden erhalten');

select set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.marketplace_listing_drafts), 0::bigint, 'Fremde Entwürfe sind unsichtbar');
select throws_ok($$select public.marketplace_read_listing_draft((select body->>'id' from draft_test_context))$$,
 '42501', null, 'Ein erratener Entwurflink gewährt keinen Zugriff');
select throws_ok($$select public.marketplace_save_listing_draft((select body->>'id' from draft_test_context),2,'{"title":"Fremder"}',null)$$,
 '42501', null, 'Ein fremder Arbeitsbereich kann nicht speichern');
select throws_ok($$select public.marketplace_delete_listing_draft('46000000-0000-4000-8000-000000000011',(select body->>'id' from draft_test_context),2)$$,
 '42501', null, 'Ein fremder Arbeitsbereich kann keinen Entwurf löschen');
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values
 ('46000000-0000-4000-8000-000000000011','46000000-0000-4000-8000-000000000002','member');
set local role authenticated;
select throws_ok($$select public.marketplace_delete_listing_draft('46000000-0000-4000-8000-000000000011',(select body->>'id' from draft_test_context),2)$$,
 '42501', null, 'Eine einfache Mitgliedschaft verleiht kein Recht zum Löschen von Inseratentwürfen');

select set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-000000000001', true);
select is((public.marketplace_save_listing_template('46000000-0000-4000-8000-000000000011',null,null,'Jacken',
 '{"title":"{brand} Jacke {size}"}')->>'revision'), '1', 'Vorlage speichert ausgewählte Felder');
select throws_ok($$select public.marketplace_save_listing_template('46000000-0000-4000-8000-000000000011',null,null,'Andere Vorlage','{"connectionId":"fremd"}')$$,
 '22023', null, 'Vorlagen übernehmen keine Zielkonten');
select is((select count(*) from public.marketplace_listing_templates), 1::bigint, 'Vorlagen gehören zum eigenen Arbeitsbereich');
select throws_ok($$select public.marketplace_save_listing_template('46000000-0000-4000-8000-000000000011',null,null,'jacken','{"title":"Andere"}')$$,
 '23505', null, 'Gleichnamige Vorlagen werden nicht still überschrieben');
select public.marketplace_create_listing_draft('46000000-0000-4000-8000-000000000011',null,'{"title":"Zweiter Entwurf"}');
select is(jsonb_array_length(public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_limit=>1)->'items'),1,'Entwürfe werden begrenzt geblättert');
select is((public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_cursor=>public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_limit=>1)->'nextCursor')->'items'->0->>'id'),
 (select body->>'id' from draft_test_context),'Die zweite Seite lässt keinen Entwurf aus');
select is(jsonb_array_length(public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_query=>'nicht gefunden')->'items'),0,'Die Suche umfasst den Arbeitsbereich');

reset role;
-- Bearbeitungen dürfen weder die Reihenfolge noch einen bereits ausgegebenen Cursor verschieben.
create temporary table draft_page_context(label text primary key,body jsonb,page jsonb);
grant all on draft_page_context to authenticated;
update public.marketplace_listing_drafts set created_at='2026-10-09T08:00:00Z',updated_at='2026-10-22T12:00:00Z'
where id=(select (body->>'id')::bigint from draft_test_context);
update public.marketplace_listing_drafts set created_at='2026-10-09T10:00:00Z',updated_at='2026-10-09T10:00:00Z'
where id<>(select (body->>'id')::bigint from draft_test_context) and workspace_id='46000000-0000-4000-8000-000000000011';
set local role authenticated;
insert into draft_page_context(label,body) values('newest',public.marketplace_create_listing_draft(
 '46000000-0000-4000-8000-000000000011',null,'{"title":"Neuester Entwurf"}',p_request_id=>'46000000-0000-4000-8000-000000000032'));
reset role;
update public.marketplace_listing_drafts set created_at='2026-10-09T10:00:00Z',updated_at='2026-10-09T09:00:00Z'
where id=(select (body->>'id')::bigint from draft_page_context where label='newest');
set local role authenticated;
update draft_page_context set page=public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_limit=>1) where label='newest';
select is((select page->'items'->0->>'id' from draft_page_context where label='newest'),
 (select body->>'id' from draft_page_context where label='newest'),'Neueste Erstellung steht vorn; bei gleichem Datum entscheidet die höhere ID');
select is((select page->'nextCursor'->>'createdAt' from draft_page_context where label='newest'),
 (public.marketplace_read_listing_draft((select body->>'id' from draft_page_context where label='newest'))->>'createdAt'),'Der Cursor enthält das Erstelldatum');
select is((select page->'nextCursor'->>'updatedAt' from draft_page_context where label='newest'),
 (public.marketplace_read_listing_draft((select body->>'id' from draft_page_context where label='newest'))->>'updatedAt'),'Geöffnete ältere Clients erhalten weiterhin ihr erwartetes Cursorfeld');
select public.marketplace_save_listing_draft((select body->>'id' from draft_test_context),2,'{"title":"Nach erster Seite bearbeitet"}','46000000-0000-4000-8000-000000000021');
insert into draft_page_context(label,page) values('second',public.marketplace_list_listing_drafts(
 '46000000-0000-4000-8000-000000000011',p_cursor=>(select page->'nextCursor' from draft_page_context where label='newest'),p_limit=>1));
select is((select page->'items'->0->'content'->>'title' from draft_page_context where label='second'),
 'Zweiter Entwurf','Gleiches Erstelldatum bleibt über Seitengrenzen eindeutig');
insert into draft_page_context(label,page) values('last',public.marketplace_list_listing_drafts(
 '46000000-0000-4000-8000-000000000011',p_cursor=>(select page->'nextCursor' from draft_page_context where label='second'),p_limit=>1));
select is((select page->'items'->0->>'id' from draft_page_context where label='last'),
 (select body->>'id' from draft_test_context),'Eine zwischenzeitliche Bearbeitung überspringt keinen älteren Entwurf');
select is((select page->'nextCursor' from draft_page_context where label='last'),'null'::jsonb,'Die letzte Seite beendet das Blättern');
select is((public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_cursor=>(select (page->'nextCursor')-'createdAt' from draft_page_context where label='newest'),p_limit=>1)->'items'->0->'content'->>'title'),
 'Zweiter Entwurf','Ein älterer Client blättert anhand der zugeordneten Erstellung weiter');
select throws_ok($$select public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_cursor=>(select (page->'nextCursor')||'{"createdAt":null}'::jsonb from draft_page_context where label='newest'))$$,
 '22023',null,'Ein ungültiger neuer Cursor fällt nicht auf das alte Datumsfeld zurück');
select set_config('request.jwt.claim.sub','46000000-0000-4000-8000-000000000002',true);
insert into draft_page_context(label,body) values('foreign',public.marketplace_create_listing_draft(
 '46000000-0000-4000-8000-000000000012',null,'{"title":"Fremder Cursor-Anker"}'));
select set_config('request.jwt.claim.sub','46000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_cursor=>jsonb_build_object('id',(select body->>'id' from draft_page_context where label='foreign'),'updatedAt','2026-10-09T08:00:00Z'))$$,
 '22023',null,'Alte Cursor dürfen keinen Anker aus einem fremden Arbeitsbereich verwenden');

select throws_ok($$select public.marketplace_delete_listing_draft('46000000-0000-4000-8000-000000000012',(select body->>'id' from draft_page_context where label='newest'),1)$$,
 '42501',null,'Löschen muss zum ausdrücklich übergebenen Arbeitsbereich gehören');
select throws_ok($$select public.marketplace_delete_listing_draft(null,(select body->>'id' from draft_page_context where label='newest'),1)$$,
 '42501',null,'Löschen ohne Arbeitsbereich ist gesperrt');
select throws_ok($$select public.marketplace_delete_listing_draft('46000000-0000-4000-8000-000000000011',(select body->>'id' from draft_test_context),2)$$,
 '40001',null,'Eine alte Revision kann keinen inzwischen bearbeiteten Entwurf löschen');
select throws_ok($$select public.marketplace_delete_listing_draft('46000000-0000-4000-8000-000000000011',(select body->>'id' from draft_test_context),null)$$,
 '40001',null,'Löschen benötigt eine konkrete Revision');
select lives_ok($$select public.marketplace_delete_listing_draft('46000000-0000-4000-8000-000000000011',(select body->>'id' from draft_page_context where label='newest'),1)$$,
 'Der aktuelle Entwurf kann gelöscht werden');
select is((select count(*) from public.marketplace_listing_drafts where id=(select (body->>'id')::bigint from draft_page_context where label='newest')),0::bigint,'Gelöschte Entwürfe sind auch bei direktem Lesen unsichtbar');
select is(jsonb_array_length(public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_query=>'Neuester')->'items'),0,'Gelöschte Entwürfe fehlen in der Suche');
select is((public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_cursor=>(select page->'nextCursor' from draft_page_context where label='newest'),p_limit=>1)->'items'->0->'content'->>'title'),
 'Zweiter Entwurf','Ein bereits ausgegebener Cursor bleibt nach dem Löschen seines Entwurfs gültig');
select is((public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_cursor=>(select (page->'nextCursor')-'createdAt' from draft_page_context where label='newest'),p_limit=>1)->'items'->0->'content'->>'title'),
 'Zweiter Entwurf','Auch ein älterer Client kann nach einem gelöschten Cursor-Anker weiterblättern');
select throws_ok($$select public.marketplace_read_listing_draft((select body->>'id' from draft_page_context where label='newest'))$$,
 '42501',null,'Gelöschte Entwürfe können nicht wieder geöffnet werden');
select throws_ok($$select public.marketplace_save_listing_draft((select body->>'id' from draft_page_context where label='newest'),1,'{}',null)$$,
 '42501',null,'Ein alter Tab kann den gelöschten Entwurf nicht wieder speichern');
select throws_ok($$select public.marketplace_create_listing_draft('46000000-0000-4000-8000-000000000011',null,'{}',p_request_id=>'46000000-0000-4000-8000-000000000032')$$,
 '42501',null,'Eine wiederholte Anlageantwort stellt keinen gelöschten Entwurf wieder her');
select throws_ok($$select public.marketplace_reserve_listing_image((select body->>'id' from draft_page_context where label='newest'),'old-tab.jpg','image/jpeg',100)$$,
 '42501',null,'Ein alter Tab kann für einen gelöschten Entwurf keine Fotos reservieren');
select throws_ok($$select public.marketplace_set_listing_image_order((select body->>'id' from draft_page_context where label='newest'),1,array[]::text[])$$,
 '42501',null,'Ein alter Tab kann die Bildauswahl eines gelöschten Entwurfs nicht ändern');
select throws_ok($$select public.marketplace_enqueue_listing((select body->>'id' from draft_page_context where label='newest'),1,'publish','46000000-0000-4000-8000-000000000033',false)$$,
 '42501','Kein Zugriff auf diesen Entwurf.','Ein gelöschter Entwurf kann keinen neuen Veröffentlichungsauftrag erzeugen');
reset role;
select ok((select deleted_at is not null and revision=2 from public.marketplace_listing_drafts where id=(select (body->>'id')::bigint from draft_page_context where label='newest')),
 'Löschen merkt den entfernten Stand revisionsgebunden vor');
select ok(not has_function_privilege('anon','public.marketplace_delete_listing_draft(uuid,text,bigint)','execute'),'Anonyme Nutzer dürfen keine Entwürfe löschen');
select ok(not has_function_privilege('authenticated','public.marketplace_lock_listing_draft(text)','execute'),'Die interne Entwurfsperre ist keine öffentliche Schreibschnittstelle');
select ok(not has_table_privilege('authenticated','public.marketplace_listing_drafts','delete'),'Direktes Löschen kann die Revisionskontrolle nicht umgehen');

-- Jeder Auftragszustand bekommt eine eigene Arbeitskopie; keine Anbieteraktion wird ausgeführt.
create temporary table draft_delete_job_context(state text primary key,draft_id bigint,job_id bigint);
grant all on draft_delete_job_context to authenticated;
with drafts as (
 insert into public.marketplace_listing_drafts(workspace_id,created_by,content)
 select '46000000-0000-4000-8000-000000000011','46000000-0000-4000-8000-000000000001',jsonb_build_object('title',state)
 from unnest(array['queued','paused','claimed','writing','outcome_unknown','confirmed','failed','cancelled']) state
 returning id,content
) insert into draft_delete_job_context(state,draft_id) select content->>'title',id from drafts;
with jobs as (
 insert into public.marketplace_listing_jobs(workspace_id,draft_id,requested_by,request_id,request_hash,draft_revision,authorization_version,
 external_account_id,execution_mode,action,snapshot,state,scheduled_at,time_zone,external_id,provider_state,verified_at)
 select '46000000-0000-4000-8000-000000000011',draft_id,'46000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),1,1,
 '46001','cloud','publish','{}',state,case when state='queued' then now()+interval '1 day' end,case when state='queued' then 'Europe/Berlin' end,
 case when state='confirmed' then '46009' end,case when state='confirmed' then 'active' end,case when state='confirmed' then now() end
 from draft_delete_job_context returning id,draft_id
) update draft_delete_job_context context set job_id=jobs.id from jobs where context.draft_id=jobs.draft_id;
insert into public.marketplace_listing_images(workspace_id,draft_id,storage_path,file_name,mime_type,byte_size,state,created_by)
select '46000000-0000-4000-8000-000000000011',draft_id,'46000000-0000-4000-8000-000000000011/'||draft_id||'/original.jpg','original.jpg','image/jpeg',100,'ready','46000000-0000-4000-8000-000000000001'
from draft_delete_job_context where state='confirmed';
set local role authenticated;
select throws_ok(format('select public.marketplace_delete_listing_draft(%L,%L,1)','46000000-0000-4000-8000-000000000011',draft_id::text),
 '55000',null,'Löschen schützt den Auftrag im Zustand '||state)
from draft_delete_job_context where state in ('queued','paused','claimed','writing','outcome_unknown') order by state;
select lives_ok(format('select public.marketplace_delete_listing_draft(%L,%L,1)','46000000-0000-4000-8000-000000000011',draft_id::text),
 'Eine Arbeitskopie mit abgeschlossenem Auftrag darf gelöscht werden: '||state)
from draft_delete_job_context where state in ('confirmed','failed','cancelled') order by state;
select is((select count(*) from public.marketplace_listing_jobs where id in(select job_id from draft_delete_job_context)),8::bigint,'Löschen verändert keine Veröffentlichungshistorie');
select ok((select bool_and(job.state=context.state and job.version=1) from public.marketplace_listing_jobs job join draft_delete_job_context context on context.job_id=job.id),
 'Alle Auftragszustände und Revisionen bleiben beim Löschen der Arbeitskopie unverändert');
select is((select external_id from public.marketplace_listing_jobs where id=(select job_id from draft_delete_job_context where state='confirmed')),
 '46009','Die Kennung des bereits veröffentlichten Inserats bleibt erhalten');
select is((select count(*) from public.marketplace_listing_images where draft_id=(select draft_id from draft_delete_job_context where state='confirmed')),1::bigint,
 'Originalfotos der abgeschlossenen Veröffentlichung bleiben erhalten');
reset role;
select is((select count(*) from public.marketplace_listing_drafts where deleted_at is null and id in(select draft_id from draft_delete_job_context where state in ('queued','paused','claimed','writing','outcome_unknown'))),5::bigint,
 'Alle gesperrten Entwürfe bleiben unverändert erhalten');

select lives_ok($$delete from public.marketplace_connections where id='46000000-0000-4000-8000-000000000021'$$,'Ein vorbereiteter Entwurf blockiert keine Kontolöschung');
set local role authenticated;
select is((public.marketplace_read_listing_draft((select body->>'id' from draft_test_context))->>'connectionId'),null,'Nach Kontolöschung bleibt die Arbeitskopie ohne Zielkonto erhalten');
reset role;
update public.workspaces set archived_at=now() where id='46000000-0000-4000-8000-000000000011';
set local role authenticated;
select throws_ok($$select public.marketplace_save_listing_draft((select body->>'id' from draft_test_context),3,'{}',null)$$,
 '42501', null, 'Archivierte Arbeitsbereiche können keine Entwürfe ändern');
select throws_ok($$select public.marketplace_delete_listing_draft('46000000-0000-4000-8000-000000000011',(select body->>'id' from draft_test_context),3)$$,
 '42501',null,'Archivierte Arbeitsbereiche können keine Entwürfe löschen');
select * from finish();
rollback;
