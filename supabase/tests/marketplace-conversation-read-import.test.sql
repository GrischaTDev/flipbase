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
 ('58000000-0000-4000-8000-000000000033','58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','conversation','58012','{"title":"Anderes"}','2026-11-01T10:00:00Z','2026-11-01T10:00:00Z');
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

-- Snapshot wie aus dem Postfach: Profil, Zielgespräch mit Nachricht und ein fremdes Gespräch.
create function pg_temp.snapshot(p_entries jsonb, p_conversations text) returns jsonb language sql as $$
  select jsonb_build_object('identity',jsonb_build_object('id','5801'),'observedAt',clock_timestamp(),'entries',p_entries,
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

select throws_ok($$select pg_temp.apply(pg_temp.snapshot(jsonb_build_array(
  (select body from read_context where name='profile'),(select body from read_context where name='target'),
  (select body from read_context where name='message'),(select body from read_context where name='foreign')),'complete'))$$,
  '42501','Auftragsgebundener Importzugriff verweigert','Ungefilterter Postfachstand mit fremdem Gespräch wird abgelehnt');
select is((pg_temp.apply(pg_temp.snapshot(jsonb_build_array(
  (select body from read_context where name='profile'),(select body from read_context where name='target'),
  (select body from read_context where name='message')),'partial'))->>'message')::integer,1,'Auf das Zielgespräch beschränkter Stand wird übernommen');
select is((select body->>'title' from public.marketplace_account_entries where external_id='58011' and kind='conversation'),'Ziel neu','Zielgespräch ist aktualisiert');
select is((select count(*)::integer from public.marketplace_account_entries where kind='message' and external_id='580111'),1,'Nachricht des Zielgesprächs ist gespeichert');
select is((select body->>'title' from public.marketplace_account_entries where external_id='58012' and kind='conversation'),'Anderes','Teilstand löscht und ändert andere Gespräche nicht');

select * from finish();
rollback;
