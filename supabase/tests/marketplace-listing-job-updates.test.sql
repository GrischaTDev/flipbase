\set on_error_stop on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select has_function('public','marketplace_notify_listing_job_change',array[]::text[],'Inserataufträge besitzen eine eigene private Änderungsmeldung');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('46600000-0000-4000-8000-000000000001','authenticated','authenticated','listing-updates@example.test','{}','{}'),
 ('46600000-0000-4000-8000-000000000002','authenticated','authenticated','foreign-listing-updates@example.test','{}','{}'),
 ('46600000-0000-4000-8000-000000000003','authenticated','authenticated','member-listing-updates@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('46600000-0000-4000-8000-000000000001'),('46600000-0000-4000-8000-000000000002'),('46600000-0000-4000-8000-000000000003');
insert into public.workspaces(id,name) values ('46600000-0000-4000-8000-000000000011','Inseratmeldungen'),('46600000-0000-4000-8000-000000000012','Fremde Inseratmeldungen');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('46600000-0000-4000-8000-000000000011','46600000-0000-4000-8000-000000000001','owner'),
 ('46600000-0000-4000-8000-000000000012','46600000-0000-4000-8000-000000000002','owner'),
 ('46600000-0000-4000-8000-000000000011','46600000-0000-4000-8000-000000000003','member');
create temporary table listing_update_context(draft_id bigint,job_id bigint,topic text);
grant select on listing_update_context to authenticated,anon;
grant all on listing_update_context to service_role;
with added as (
 insert into public.marketplace_listing_drafts(workspace_id,created_by) values ('46600000-0000-4000-8000-000000000011','46600000-0000-4000-8000-000000000001') returning id
) insert into listing_update_context(draft_id,topic) select id,'workspace:46600000-0000-4000-8000-000000000011:marketplace_listing:'||id::text from added;
set local role service_role;
with added as (
 insert into public.marketplace_listing_jobs(workspace_id,draft_id,requested_by,request_id,request_hash,draft_revision,authorization_version,external_account_id,execution_mode,action,snapshot)
 select '46600000-0000-4000-8000-000000000011',draft_id,'46600000-0000-4000-8000-000000000001','46600000-0000-4000-8000-000000000031',repeat('a',64),1,1,'46601','cloud','publish','{"privateContent":"never broadcast","storagePath":"private/original.jpg"}' from listing_update_context returning id
) update listing_update_context set job_id=(select id from added);
reset role;
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),1::bigint,'Die Annahme meldet genau eine private Änderung');
select is((select payload-'id' from realtime.messages where topic=(select topic from listing_update_context)),jsonb_build_object('workspaceId','46600000-0000-4000-8000-000000000011','draftId',(select draft_id::text from listing_update_context)),'Nur Workspace- und Textentwurfkennung werden übertragen');
select ok((select bool_and(private and extension='broadcast' and event='listing_jobs_changed' and jsonb_typeof(payload->'id')='string') from realtime.messages where topic=(select topic from listing_update_context)),'Der Anbieter ergänzt ausschließlich eine Ereigniskennung auf dem privaten Kanal');
set local role service_role;
update public.marketplace_listing_jobs set state='claimed' where id=(select job_id from listing_update_context);
update public.marketplace_listing_jobs set updated_at=clock_timestamp() where id=(select job_id from listing_update_context);
update public.marketplace_listing_jobs set state='claimed' where id=(select job_id from listing_update_context);
reset role;
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),2::bigint,'Lease- und Versionsänderungen ohne Statuswechsel erzeugen keine weiteren Meldungen');
set local role service_role;
update public.marketplace_listing_jobs set state='writing' where id=(select job_id from listing_update_context);
update public.marketplace_listing_jobs set state='confirmed',external_id='46609',provider_state='active',verified_at=clock_timestamp() where id=(select job_id from listing_update_context);
reset role;
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),4::bigint,'Beginn und belegter Abschluss werden getrennt gemeldet');
set local role authenticated;
select set_config('request.jwt.claim.sub','46600000-0000-4000-8000-000000000001',true);
select set_config('realtime.topic',(select topic from listing_update_context),true);
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),4::bigint,'Eigene Kontoverwalter können den privaten Kanal empfangen');
select throws_ok($$insert into realtime.messages(topic,event,extension,private,payload) select topic,'listing_jobs_changed','broadcast',true,'{}'::jsonb from listing_update_context$$,'42501',null,'Auch Kontoverwalter können keine Inseratauftragsmeldungen vortäuschen');
select set_config('realtime.topic',(select topic||':other' from listing_update_context),true);
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),0::bigint,'Die Freigabe gilt ausschließlich für den angefragten Kanal');
select set_config('realtime.topic',(select topic from listing_update_context),true);
select set_config('request.jwt.claim.sub','46600000-0000-4000-8000-000000000002',true);
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),0::bigint,'Fremde Workspaces erhalten keine Inseratmeldungen');
select set_config('request.jwt.claim.sub','46600000-0000-4000-8000-000000000003',true);
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),0::bigint,'Mitglieder ohne Kontoverwaltung erhalten keine Inseratmeldungen');
reset role;
update public.workspaces set archived_at=clock_timestamp() where id='46600000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub','46600000-0000-4000-8000-000000000001',true);
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),0::bigint,'Archivierte Workspaces verlieren den Empfang');
reset role;
select ok(not has_function_privilege('authenticated','public.marketplace_notify_listing_job_change()','execute') and not has_function_privilege('anon','public.marketplace_notify_listing_job_change()','execute'),'Clients können die Sendefunktion nicht direkt aufrufen');
set local role anon;
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),0::bigint,'Anonyme erhalten keine Inseratmeldungen');
reset role;
set local role service_role;
delete from public.marketplace_listing_jobs where id=(select job_id from listing_update_context);
reset role;
select is((select count(*) from realtime.messages where topic=(select topic from listing_update_context)),5::bigint,'Das Entfernen eines Auftrags aktualisiert dessen bestehenden Entwurfskanal');
select * from finish();
rollback;
