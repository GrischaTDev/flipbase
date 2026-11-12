\set on_error_stop on
begin;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values('46900000-0000-4000-8000-000000000001','authenticated','authenticated','relisting-lifecycle@example.test','{}','{}');
insert into public.platform_operators(user_id) values('46900000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('46900000-0000-4000-8000-000000000011','Relist-Lebenszyklus');
insert into public.workspace_members(workspace_id,user_id,role) values('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values('46900000-0000-4000-8000-000000000021','46900000-0000-4000-8000-000000000011','Relist','connected','46901');
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021','relist-profile');
insert into public.marketplace_browser_sessions(public_id,workspace_id,connection_id,started_by,provider_profile_id,expires_at)
values('46900000-0000-4000-8000-000000000031','46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021','46900000-0000-4000-8000-000000000001','relist-profile',clock_timestamp()+interval '1 hour');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,observed_at)
values('46900000-0000-4000-8000-000000000041','46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021','publication','46910',
  jsonb_build_object('title','Original','text','Alte Beschreibung','textState','loaded','price',20,'currency','EUR','publicationState','active','createdAt',clock_timestamp()-interval '1 day','metrics',jsonb_build_object('views',200,'favorites',9)),clock_timestamp()-interval '1 minute');
create temporary table relist_context(draft jsonb,job jsonb,source_body jsonb,source_sort timestamptz,foreign_job_id bigint,previous_job_id text,verified_at timestamptz,operation_count bigint);
grant all on relist_context to authenticated,service_role;
insert into relist_context(source_body,source_sort) select body,sort_at from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041';
set local role authenticated;
select set_config('request.jwt.claim.sub','46900000-0000-4000-8000-000000000001',true);
select public.marketplace_approve_listings('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021','46901');
update relist_context set draft=public.marketplace_create_relisting_draft('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021',
  '{"title":"Neu angeboten","description":"Originalbeschreibung","priceCents":2200,"currency":"EUR","categoryId":1223,"conditionId":2,"packageSizeId":2,"brandLabel":"Neue Marke","sizeLabel":"M"}','46900000-0000-4000-8000-000000000051','46910');
reset role;
insert into public.marketplace_listing_images(workspace_id,draft_id,storage_path,file_name,mime_type,byte_size,state,created_by)
select '46900000-0000-4000-8000-000000000011',(draft->>'id')::bigint,'46900000-0000-4000-8000-000000000011/'||(draft->>'id')||'/46900000-0000-4000-8000-000000000061.jpg','original.jpg','image/jpeg',123,'ready','46900000-0000-4000-8000-000000000001' from relist_context;
update public.marketplace_listing_drafts set image_ids=array(select id from public.marketplace_listing_images where draft_id=(select (draft->>'id')::bigint from relist_context)) where id=(select (draft->>'id')::bigint from relist_context);
insert into storage.objects(bucket_id,name,metadata) select 'marketplace-listing-media',storage_path,'{"size":123,"mimetype":"image/jpeg"}' from public.marketplace_listing_images where created_by='46900000-0000-4000-8000-000000000001';
set local role authenticated;
update relist_context set job=public.marketplace_enqueue_relisting(draft->>'id',1,'46900000-0000-4000-8000-000000000071',false,null,null,300);
select is((select job->>'relistEntryId' from relist_context),'46900000-0000-4000-8000-000000000041','Annahme bindet dieselbe Flipbase-UUID');
select is(public.marketplace_read_relisting_plans('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021')->'items'->0->'job'->>'relistEntryId','46900000-0000-4000-8000-000000000041','Plan ist schon vor Löschbeleg an der ursprünglichen Karte sichtbar');
select is(jsonb_array_length(public.marketplace_list_listing_drafts('46900000-0000-4000-8000-000000000011')->'items'),0,'Relist-Arbeitsstand erscheint nicht in der normalen Entwurfsliste');
reset role;

create function pg_temp.relist_import(p_entries jsonb) returns jsonb language sql as $$
  select public.marketplace_apply_vinted_import('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021','46900000-0000-4000-8000-000000000031','46900000-0000-4000-8000-000000000001',
    jsonb_build_object('identity',jsonb_build_object('id','46901'),'observedAt',clock_timestamp(),
      'entries',jsonb_build_array(jsonb_build_object('kind','profile','externalId','46901','sortAt',clock_timestamp(),'body',jsonb_build_object('feedbacks','[]'::jsonb)))||p_entries,
      'areas','{"profile":{"status":"complete"},"publications":{"status":"complete"},"conversations":{"status":"complete"},"messages":{"status":"complete"},"sales":{"status":"complete"},"feedback":{"status":"complete"}}'::jsonb));
$$;
set local role service_role;
select lives_ok($$select pg_temp.relist_import(jsonb_build_array(jsonb_build_object('kind','publication','externalId','46910','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Veralteter Import','price',1))))$$,'Import während Vorbereitung bleibt erfolgreich');
select is((select body from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),(select source_body from relist_context),'Vorbereitung schützt den vollständigen Originalinhalt');
select lives_ok($$select pg_temp.relist_import('[]')$$,'Vollständiger Import darf während Relist ohne alte Anzeige ankommen');
select is((select sort_at from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),(select source_sort from relist_context),'Fehlende Quelle wird weder geprunt noch umsortiert');

reset role;
update public.marketplace_listing_jobs set relist_entry_id=null where id=(select (job->>'id')::bigint from relist_context);
set local role authenticated;
select public.marketplace_read_relisting_plans('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021');
select is((select relist_entry_id::text from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'46900000-0000-4000-8000-000000000041','Alter Auftrag wird beim Planlesen ohne Migrations-Backfill sicher gebunden');
reset role;
-- Der folgende Zustand entspricht dem separat geprüften bestätigten Löschbeleg.
update public.marketplace_listing_drafts set relist_deleted_at=clock_timestamp(),relist_deleted_account_id='46901' where id=(select (draft->>'id')::bigint from relist_context);
update public.marketplace_listing_jobs set relist_publish_at=clock_timestamp()+interval '5 minutes' where id=(select (job->>'id')::bigint from relist_context);
set local role service_role;
select lives_ok($$select pg_temp.relist_import('[]')$$,'Import in der Löschlücke lässt die Karte bestehen');
select is((select body from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),(select source_body from relist_context),'Wartezeit verändert den Originalinhalt nicht');
reset role;
update public.marketplace_listing_jobs set state='failed',error_code='listing_read_failed' where id=(select (job->>'id')::bigint from relist_context);
set local role authenticated;
select throws_ok(
  $statement$select public.marketplace_cancel_listing_job((select job->>'id' from relist_context),(select version from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)))$statement$,
  '22023',null,'Fehlgeschlagener Relist nach bestätigter Löschung kann nicht freigegeben werden');
reset role;
set local role service_role;
select lives_ok($$select pg_temp.relist_import('[]')$$,'Fehlgeschlagener Relist bleibt gegen Prune geschützt');
select is((select count(*) from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),1::bigint,'Fehler löscht die ursprüngliche Karte nicht');
set local role authenticated;
update relist_context set job=public.marketplace_enqueue_relisting(draft->>'id',1,'46900000-0000-4000-8000-000000000072',false);
select is((select job->>'relistEntryId' from relist_context),'46900000-0000-4000-8000-000000000041','Wiederaufnahme verwendet dieselbe Karte');
reset role;
update public.marketplace_listing_jobs set state='writing',started_at=clock_timestamp() where id=(select (job->>'id')::bigint from relist_context);
set local role service_role;
select lives_ok($$select pg_temp.relist_import(jsonb_build_array(jsonb_build_object('kind','publication','externalId','46911','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Alter neuer Entwurf','price',1,'currency','EUR','brand','Entwurfsmarke','size','XS','publicationState','active','imageUrl','https://images.example.test/new.jpg','metrics',jsonb_build_object('views',3,'favorites',1)))))$$,'Neue Anzeige darf vor ihrem verspäteten Bestätigungsbeleg schon importiert sein');
reset role;
with foreign_draft as (
  insert into public.marketplace_listing_drafts(workspace_id,connection_id,content,created_by,relist_external_id)
    select workspace_id,connection_id,snapshot->'content',requested_by,'46911' from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context) returning id
), foreign_job as (
  insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,permission_id,requested_by,request_id,request_hash,draft_revision,authorization_version,external_account_id,execution_mode,action,snapshot,state,relist_entry_id)
    select job.workspace_id,job.connection_id,foreign_draft.id,job.permission_id,job.requested_by,'46900000-0000-4000-8000-000000000073',job.request_hash,1,job.authorization_version,job.external_account_id,job.execution_mode,job.action,jsonb_set(job.snapshot,'{relistExternalId}','"46911"'),'failed',entry.id
    from public.marketplace_listing_jobs job cross join foreign_draft join public.marketplace_account_entries entry on entry.connection_id=job.connection_id and entry.external_id='46911'
    where job.id=(select (relist_context.job->>'id')::bigint from relist_context) returning id
) update relist_context set foreign_job_id=(select id from foreign_job);
set local role service_role;
select throws_ok($$select public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(select (relist_context.job->>'id')::bigint from relist_context)),
  jsonb_build_object('outcome','confirmed','action','publish','externalId','46911','externalAccountId','46901','providerState','active','verifiedAt',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))$$,'23505',null,'Neue Cachezeile mit eigenem anderem Relist wird nicht blind gelöscht');
select is((select state from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'writing','Zuordnungskollision rollt auch die Jobbestätigung zurück');
select is((select external_id from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'46910','Zuordnungskollision erhält die alte Karte unverändert');
reset role;
delete from public.marketplace_listing_jobs where id=(select foreign_job_id from relist_context);
-- Native Erstellungskennung bleibt trotz nicht verfügbarer Nachprüfung erhalten.
savepoint creation_receipt;
delete from public.marketplace_account_entries where connection_id='46900000-0000-4000-8000-000000000021' and external_id='46911';
set local role service_role;
select public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(select (job->>'id')::bigint from relist_context)),
  '{"outcome":"outcome_unknown","errorCode":"provider_unconfirmed_saved_form","externalId":"46911","externalAccountId":"46901"}');
select is((select external_id from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'46911','Unklare Nachprüfung behält die echte neue Vinted-ID');
select is((select state from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'outcome_unknown','Erstellungskennung allein bestätigt keinen Erfolg');
select ok(exists(select 1 from public.marketplace_operations where connection_id='46900000-0000-4000-8000-000000000021' and state='queued'),'Erstellungsbeleg fordert einen lesenden Kontoabgleich an');
select is((select external_id from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'46910','Ohne eigenen Neuimport bleibt die ursprüngliche Karte erhalten');
select throws_ok($$select public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(select (job->>'id')::bigint from relist_context)),
  '{"outcome":"outcome_unknown","errorCode":"provider_unconfirmed_saved_form","externalId":"46912","externalAccountId":"46901"}')$$,'23505',null,'Eine andere neue ID darf den Erstellungsbeleg nicht ersetzen');
select throws_ok($$select public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(select (job->>'id')::bigint from relist_context)),
  '{"outcome":"outcome_unknown","errorCode":"provider_unconfirmed_saved_form","externalId":"46911","externalAccountId":"46902"}')$$,'22023',null,'Fremdes Konto liefert keinen Erstellungsbeleg');
select throws_ok($$select public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(select (job->>'id')::bigint from relist_context)),
  '{"outcome":"outcome_unknown","errorCode":"provider_unconfirmed_saved_form","externalId":"46910","externalAccountId":"46901"}')$$,'22023',null,'Alte Quellkennung ist keine Neuanlage');
select public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(select (job->>'id')::bigint from relist_context)),
  '{"outcome":"outcome_unknown","errorCode":"provider_unconfirmed_saved_navigation"}');
select is((select external_id from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'46911','Späterer Lesefehler ohne eigene Kennung verwirft den belegten Erstellungsbeleg nicht');
select lives_ok($$select pg_temp.relist_import(jsonb_build_array(jsonb_build_object('kind','publication','externalId','46911','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Neu angeboten','price',69.90,'publicationState','active'))))$$,'Eigener aktiver Neuimport löst den unklaren Auftrag atomar auf');
select is((select state from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'confirmed','Eigener Aktivbeleg bestätigt die bekannte Neuanlage automatisch');
select is((select external_id from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'46911','Automatischer Abgleich verknüpft die ursprüngliche Flipbase-UUID');
select is((select count(*) from public.marketplace_account_entries where connection_id='46900000-0000-4000-8000-000000000021' and kind='publication'),1::bigint,'Automatischer Abgleich hinterlässt genau eine Karte');
select is((select (body->>'price')::numeric from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),69.90::numeric,'Nachträglich geänderter Anbieterpreis bleibt bei der Verknüpfung erhalten');
select ok((select relist_imported_at is not null and error_code is null from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'Auftrag endet ohne Warnung und ohne weiteren Importbedarf');
rollback to savepoint creation_receipt;

savepoint receipt_mismatch;
set local role service_role;
select public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(select (job->>'id')::bigint from relist_context)),
  '{"outcome":"outcome_unknown","errorCode":"provider_unconfirmed_saved_photos_match","externalId":"46911","externalAccountId":"46901"}');
select pg_temp.relist_import(jsonb_build_array(jsonb_build_object('kind','publication','externalId','46911','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Neu angeboten','publicationState','active'))));
select is((select state from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'outcome_unknown','Echter Fotowiderspruch wird durch eine aktive Anzeige nicht zum Erfolg');
select is((select count(*) from public.marketplace_account_entries where connection_id='46900000-0000-4000-8000-000000000021' and kind='publication'),1::bigint,'Bekannte Neuanlage erzeugt auch bei Fotowiderspruch keine zweite Karte');
rollback to savepoint receipt_mismatch;

savepoint receipt_draft;
set local role service_role;
select public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(select (job->>'id')::bigint from relist_context)),
  '{"outcome":"outcome_unknown","errorCode":"provider_unconfirmed_saved_form","externalId":"46911","externalAccountId":"46901"}');
select pg_temp.relist_import(jsonb_build_array(jsonb_build_object('kind','publication','externalId','46911','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Neu angeboten','publicationState','draft'))));
select is((select state from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'outcome_unknown','Ein Anbieterentwurf beweist keine aktive Veröffentlichung');
select is((select count(*) from public.marketplace_account_entries where connection_id='46900000-0000-4000-8000-000000000021' and kind='publication'),1::bigint,'Bekannter Anbieterentwurf bleibt derselben Karte zugeordnet');
select ok((select relist_imported_at is null from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'Entwurf beendet den ausstehenden Aktivabgleich nicht');
rollback to savepoint receipt_draft;

savepoint missing_receipt;
set local role service_role;
select public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(select (job->>'id')::bigint from relist_context)),
  '{"outcome":"outcome_unknown","errorCode":"provider_unconfirmed_save_response"}');
select pg_temp.relist_import(jsonb_build_array(jsonb_build_object('kind','publication','externalId','46911','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Neu angeboten','publicationState','active'))));
select is((select state from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'outcome_unknown','Ohne Erstellungskennung wird keine Anzeige anhand ihres Titels erraten');
select is((select external_id from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'46910','Ohne Beleg bleibt die ursprüngliche Zuordnung unberührt');
rollback to savepoint missing_receipt;
reset role;

-- Ein unbekanntes Ergebnis kann erst nach Import und manueller Preisänderung bestätigt werden.
savepoint late_confirmation;
update public.marketplace_listing_jobs set state='outcome_unknown' where id=(select (job->>'id')::bigint from relist_context);
update public.marketplace_account_entries set body=jsonb_set(body,'{price}','69.90')
where connection_id='46900000-0000-4000-8000-000000000021' and external_id='46911';
set local role service_role;
update relist_context set job=public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(relist_context.job->>'id')::bigint),
  jsonb_build_object('outcome','confirmed','action','publish','externalId','46911','externalAccountId','46901','providerState','active','verifiedAt',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
select body->>'price' as price, external_id as external_id
from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041' \gset late_
select count(*) as cards from public.marketplace_account_entries where kind='publication' and connection_id='46900000-0000-4000-8000-000000000021' \gset late_
rollback to savepoint late_confirmation;
select is(:'late_price'::numeric,69.90::numeric,'Verspätete Bestätigung erhält den nachträglich geänderten Preis der aktiven Anzeige');
select is(:'late_external_id'::text,'46911'::text,'Nachträgliche Bestätigung behält die ursprüngliche Flipbase-UUID');
select is(:'late_cards'::integer,1,'Nachträgliche Bestätigung führt beide Karten zusammen');
-- Die neue ID kann vor der Publishbestätigung bereits als Anbieterentwurf im Cache liegen.
update public.marketplace_account_entries set body=jsonb_set(body,'{publicationState}','"draft"')
where connection_id='46900000-0000-4000-8000-000000000021' and external_id='46911';
set local role service_role;
update relist_context set job=public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(relist_context.job->>'id')::bigint),
  jsonb_build_object('outcome','confirmed','action','publish','externalId','46911','externalAccountId','46901','providerState','active','verifiedAt',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
select is((select external_id from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'46911','Bestätigung verknüpft dieselbe UUID atomar mit der neuen Vinted-ID');
select is((select count(*) from public.marketplace_account_entries where kind='publication' and connection_id='46900000-0000-4000-8000-000000000021'),1::bigint,'Neue und alte Cachezeile werden zu genau einer Karte');
select is((select body->>'title' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'Neu angeboten','Spätere Bestätigung überstimmt den vorher importierten Entwurfstitel');
select is((select (body->>'price')::numeric from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),22::numeric,'Bestätigter Preis ersetzt den veralteten Entwurfspreis');
select is((select body->>'brand' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'Neue Marke','Bestätigte Marke ersetzt die frühere Entwurfsmarke');
select is((select body->>'size' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'M','Bestätigte Größe ersetzt die frühere Entwurfsgröße');
select is((select body->>'imageUrl' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'https://images.example.test/new.jpg','Echter neuer Fotobeleg bleibt beim Kernwertabgleich erhalten');
select is((select body->>'text' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'Originalbeschreibung','Unvollständiger Neuimport erhält die bestätigte Snapshotbeschreibung statt der alten Beschreibung');
select is((select body->>'publicationState' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'active','Spätere aktive Publishbestätigung überstimmt einen vorher importierten Anbieterentwurf');
select is((select body->'metrics'->>'views' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'3','Neue Anzeige übernimmt ihre echten Aufrufe statt der alten 200');
select ok(not exists(select 1 from public.marketplace_listing_metric_observations observation join public.marketplace_listing_statistic_items item on item.id=observation.statistic_item_id where item.connection_id='46900000-0000-4000-8000-000000000021' and item.external_id='46911' and observation.views=200),'Neue Statistikserie enthält keinen alten Metrikbeleg');
select ok(exists(select 1 from public.marketplace_listing_metric_observations observation join public.marketplace_listing_statistic_items item on item.id=observation.statistic_item_id where item.connection_id='46900000-0000-4000-8000-000000000021' and item.external_id='46910' and observation.views=200),'Alte Statistikserie bleibt erhalten');
select ok((select body->>'occurredAt' is not null and body->'publicationAge'='null'::jsonb from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'Neue Veröffentlichung verwendet ihren bestätigten Zeitpunkt statt alten Alters');
select lives_ok($$select pg_temp.relist_import(jsonb_build_array(jsonb_build_object('kind','publication','externalId','46910','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Verspätete alte Anzeige'))))$$,'Verspäteter Import der alten Anbieterkennung ist unschädlich');
select is((select count(*) from public.marketplace_account_entries where connection_id='46900000-0000-4000-8000-000000000021' and external_id='46910'),0::bigint,'Alte Anbieterkennung wird nicht wiederbelebt');
select is((select external_id from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'46911','Verspätete alte Komplettliste prunt die neue Karte nicht vor dem tatsächlichen Neuimport');
select lives_ok($$select pg_temp.relist_import(jsonb_build_array(jsonb_build_object('kind','publication','externalId','46911','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Frischer neuer Cache','publicationState','active','metrics',jsonb_build_object('views',4,'favorites',2)))))$$,'Frischer Neuimport beendet den Übergang');
select ok((select relist_imported_at is not null from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'Nur der akzeptierte Neuimport markiert den Auftrag als übernommen');
set local role authenticated;
select is(jsonb_array_length(public.marketplace_read_relisting_plans('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021')->'items'),0,'Abgeschlossener neuer Auftrag lässt keinen älteren Fehlerplan wieder erscheinen');
select is(public.marketplace_read_listing_metric_changes('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021')->'items'->0->>'views','1','Differenz vergleicht nur die neue Inseratserie');
update relist_context set draft=public.marketplace_create_relisting_draft('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021',
  '{"title":"Erneut anbieten","description":"Originalbeschreibung","priceCents":2400,"currency":"EUR","categoryId":1223,"conditionId":2,"packageSizeId":2}','46900000-0000-4000-8000-000000000081','46911');
reset role;
insert into public.marketplace_listing_images(workspace_id,draft_id,storage_path,file_name,mime_type,byte_size,state,created_by)
select '46900000-0000-4000-8000-000000000011',(draft->>'id')::bigint,'46900000-0000-4000-8000-000000000011/'||(draft->>'id')||'/46900000-0000-4000-8000-000000000082.jpg','original.jpg','image/jpeg',123,'ready','46900000-0000-4000-8000-000000000001' from relist_context;
update public.marketplace_listing_drafts set image_ids=array(select id from public.marketplace_listing_images where draft_id=(select (draft->>'id')::bigint from relist_context)) where id=(select (draft->>'id')::bigint from relist_context);
insert into storage.objects(bucket_id,name,metadata) select 'marketplace-listing-media',storage_path,'{"size":123,"mimetype":"image/jpeg"}' from public.marketplace_listing_images where draft_id=(select (draft->>'id')::bigint from relist_context);
set local role authenticated;
update relist_context set job=public.marketplace_enqueue_relisting(draft->>'id',1,'46900000-0000-4000-8000-000000000083',false);
reset role;
update public.marketplace_listing_jobs set state='failed',error_code='listing_read_failed' where id=(select (job->>'id')::bigint from relist_context);
-- Der neue Freigabeweg muss die echte Anzeige wieder zugänglich machen, ohne
-- den fehlgeschlagenen Auftrag oder seine Diagnose aus der Historie zu löschen.
savepoint failed_relisting_cancellation;
set local role authenticated;
update relist_context set job=public.marketplace_cancel_listing_job(job->>'id',(select version from public.marketplace_listing_jobs where id=(relist_context.job->>'id')::bigint));
select is((select job->>'state' from relist_context),'cancelled','Vor-Delete-Fehler kann ausdrücklich verworfen werden');
select is(jsonb_array_length(public.marketplace_read_relisting_plans('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021')->'items'),0,'Verworfener Vor-Delete-Relist blockiert den Kleiderschrank nicht mehr');
select is((select error_code from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'listing_read_failed','Verwerfen erhält den ursprünglichen Diagnosecode');
rollback to savepoint failed_relisting_cancellation;
set local role authenticated;
update relist_context set job=public.marketplace_edit_relisting_plan(job->>'id',(select version from public.marketplace_listing_jobs where id=(relist_context.job->>'id')::bigint),true);
select is((select editing_previous_state from public.marketplace_listing_jobs where id=(select (job->>'id')::bigint from relist_context)),'failed','Fehler vor dem Löschen öffnet den bestehenden Editor ohne Terminzwang');
update relist_context set job=public.marketplace_edit_relisting_plan(job->>'id',(job->>'version')::bigint,false);
select is((select job->>'state' from relist_context),'failed','Editor schließen stellt den Vor-Delete-Fehler ohne Neustart wieder her');
update relist_context set job=public.marketplace_edit_relisting_plan(job->>'id',(job->>'version')::bigint,true),previous_job_id=job->>'id';
update relist_context set job=public.marketplace_enqueue_relisting(draft->>'id',1,'46900000-0000-4000-8000-000000000084',false,null,null,0,job->>'id',(job->>'version')::bigint);
select is((select job->>'replacesJobId' from relist_context),(select previous_job_id from relist_context),'Vor-Delete-Retry ohne Termin behält seine Auftragshistorie');
select is((select job->>'relistEntryId' from relist_context),'46900000-0000-4000-8000-000000000041','Auch ein zweiter Relist bleibt derselbe Flipbase-Artikel');
update relist_context set job=public.marketplace_cancel_listing_job(job->>'id',(job->>'version')::bigint);
select is(jsonb_array_length(public.marketplace_read_relisting_plans('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021')->'items'),0,'Cancel vor dem Löschen belebt keinen älteren Fehlerplan wieder');
reset role;
select ok(public.marketplace_relisting_import_allowed('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021','46911'),'Cancel vor dem Löschen hebt den älteren Importschutz auf');
update public.marketplace_listing_drafts set relist_deleted_at=clock_timestamp(),relist_deleted_account_id='46901' where id=(select (draft->>'id')::bigint from relist_context);
set local role authenticated;
select is(public.marketplace_read_relisting_plans('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021')->'items'->0->'job'->>'state','cancelled','Cancel nach belegtem Löschen bleibt an derselben Karte sichtbar');
update relist_context set job=public.marketplace_edit_relisting_plan(job->>'id',(job->>'version')::bigint,true);
update relist_context set job=public.marketplace_edit_relisting_plan(job->>'id',(job->>'version')::bigint,false);
select is((select job->>'state' from relist_context),'cancelled','Schließen des abgebrochenen Plans löst keine Anbieteraktion aus');
reset role;
update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where workspace_id='46900000-0000-4000-8000-000000000011' and state in ('active','stopping');
update public.marketplace_operations set state='failed',finished_at=clock_timestamp() where connection_id='46900000-0000-4000-8000-000000000021' and state in ('queued','running','outcome_unknown');
update public.marketplace_connections set execution_mode='local' where id='46900000-0000-4000-8000-000000000021';
set local role authenticated;
select public.marketplace_approve_local_extension('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021',repeat('a',64),'46901');
set local role service_role;
select lives_ok($$select public.marketplace_ingest_local_extension('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021',repeat('a',64),
  jsonb_build_object('identity',jsonb_build_object('id','46901','username','relist'),'observedAt',clock_timestamp(),'publicationsComplete',true,'entries',jsonb_build_array(
    jsonb_build_object('kind','profile','externalId','46901','sortAt',clock_timestamp(),'body',jsonb_build_object('username','relist')),
    jsonb_build_object('kind','publication','externalId','46911','sortAt',clock_timestamp(),'body',jsonb_build_object('title','Lokaler Altstand','publicationState','active')))))$$,'Lokaler Import hält denselben Relist-Schutz auch nach Ausführerwechsel ein');
select is((select body->>'title' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'Frischer neuer Cache','Lokaler Import überschreibt die nach Löschung geschützte Karte nicht');
set local role authenticated;
select public.marketplace_revoke_local_extension('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021');
reset role;
update public.marketplace_connections set execution_mode='cloud',status='connected' where id='46900000-0000-4000-8000-000000000021';
update public.marketplace_browser_sessions set state='active',provider_stopped_at=null,expires_at=clock_timestamp()+interval '1 hour' where public_id='46900000-0000-4000-8000-000000000031';
-- Ein älterer bestätigter Auftrag kann vor der Übernahme seines Neuimports weitergelaufen sein.
update public.marketplace_listing_jobs set relist_imported_at=null,relist_entry_id=null where connection_id='46900000-0000-4000-8000-000000000021' and state='confirmed' and external_id='46911';
set local role authenticated;
select public.marketplace_approve_listings('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021','46901');
update relist_context set job=public.marketplace_enqueue_relisting(draft->>'id',1,'46900000-0000-4000-8000-000000000085',false);
reset role;
update public.marketplace_listing_jobs set state='writing',started_at=clock_timestamp() where id=(select (job->>'id')::bigint from relist_context);
update relist_context set verified_at=statement_timestamp();
set local role service_role;
select lives_ok($$select pg_temp.relist_import(jsonb_build_array(jsonb_build_object('kind','publication','externalId','46912','sortAt',clock_timestamp(),'body',
  jsonb_build_object('title','Späterer Anbieterstand','price',31,'currency','EUR','brand','Spätere Marke','size','L','text','Spätere Anbieterbeschreibung','textState','loaded','publicationState','active','metrics',jsonb_build_object('views',7,'favorites',2)))))$$,'Nach dem Publishbeleg gelesener Zielcache darf vor dem Finish eintreffen');
update relist_context set job=public.marketplace_listing_finish_job((select listing_job from public.marketplace_listing_jobs listing_job where listing_job.id=(relist_context.job->>'id')::bigint),
  jsonb_build_object('outcome','confirmed','action','publish','externalId','46912','externalAccountId','46901','providerState','active','verifiedAt',to_char(verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
select is((select external_id from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'46912','Aufeinanderfolgende Relists behalten dieselbe Flipbase-UUID');
select is((select body->>'title' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'Späterer Anbieterstand','Tatsächlich nach der Bestätigung gelesener Titel bleibt erhalten');
select is((select (body->>'price')::numeric from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),31::numeric,'Tatsächlich neuerer Anbieterpreis wird nicht durch den Snapshot ersetzt');
select is((select body->>'brand' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'Spätere Marke','Tatsächlich neuere Marke bleibt erhalten');
select is((select body->>'size' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'L','Tatsächlich neuere Größe bleibt erhalten');
select is((select body->>'text' from public.marketplace_account_entries where id='46900000-0000-4000-8000-000000000041'),'Spätere Anbieterbeschreibung','Tatsächlich neuere geladene Beschreibung bleibt erhalten');
set local role authenticated;
select public.marketplace_read_relisting_plans('46900000-0000-4000-8000-000000000011','46900000-0000-4000-8000-000000000021');
select is((select count(*) from public.marketplace_account_entries where connection_id='46900000-0000-4000-8000-000000000021' and kind='publication'),1::bigint,'Wartung eines früher bestätigten Altjobs stellt keine überholte Anbieter-ID wieder her');
reset role;
update public.marketplace_operations set state='failed',finished_at=clock_timestamp()-interval '2 minutes' where connection_id='46900000-0000-4000-8000-000000000021';
update relist_context set operation_count=(select count(*) from public.marketplace_operations where connection_id='46900000-0000-4000-8000-000000000021');
set local role service_role;
select public.marketplace_request_relisting_import((select listing_job from public.marketplace_listing_jobs listing_job where connection_id='46900000-0000-4000-8000-000000000021' and state='confirmed' and external_id='46911'));
select is((select count(*) from public.marketplace_operations where connection_id='46900000-0000-4000-8000-000000000021'),(select operation_count from relist_context),'Überholter bestätigter Altjob erzeugt keine zusätzlichen Kontoabrufe');
select ok(not has_function_privilege('authenticated','public.marketplace_relink_relisting_entry(public.marketplace_listing_jobs)','execute'),'Client darf keine freie Artikelumverknüpfung aufrufen');
select * from finish();
rollback;
