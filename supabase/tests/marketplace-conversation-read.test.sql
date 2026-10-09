\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('38900000-0000-4000-8000-000000000001','authenticated','authenticated','conversation-reader@example.test','{}','{}'),
 ('38900000-0000-4000-8000-000000000002','authenticated','authenticated','conversation-member@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('38900000-0000-4000-8000-000000000001'),('38900000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('38900000-0000-4000-8000-000000000011','Gesprächsstatus');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000001','owner'),
 ('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000002','member');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('38900000-0000-4000-8000-000000000021','38900000-0000-4000-8000-000000000011','Lesekonto','connected','389');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values
 ('38900000-0000-4000-8000-000000000031','38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000021','conversation','500','{"unread":true,"detailCheckedAt":"2026-10-08T09:00:00Z"}');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,parent_id,external_id,body,sort_at) values
 ('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000021','message','38900000-0000-4000-8000-000000000031','701','{"direction":"inbound","text":"Hallo"}','2026-10-08T08:00:00Z');
insert into public.marketplace_message_notifications(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id,conversation_id,occurred_at,observed_at,notified_at) values
 ('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000021','389','500','message:701','38900000-0000-4000-8000-000000000031','2026-10-08T08:00:00Z','2026-10-08T09:00:00Z','2026-10-08T09:00:00Z'),
 ('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000021','389','500','message:702','38900000-0000-4000-8000-000000000031','2026-10-08T09:30:00Z','2026-10-08T10:00:00Z','2026-10-08T10:00:00Z');
create function pg_temp.conversation() returns jsonb language sql as $$
 select public.marketplace_read_page('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000021','conversation')->'items'->0;
$$;
create function pg_temp.mark(p_version text,p_at timestamptz default '2026-10-08T09:00:00Z') returns jsonb language sql as $$
 select public.marketplace_mark_conversation_read('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000021','38900000-0000-4000-8000-000000000031',p_version,p_at);
$$;
select ok(not has_function_privilege('anon','public.marketplace_mark_conversation_read(uuid,uuid,uuid,text,timestamptz)','execute'),'Kein anonymer Lesestatuswechsel');
select ok(not has_table_privilege('authenticated','public.marketplace_account_entries','update'),'Kein direkter Schreibzugriff auf importierte Kontodaten');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"38900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table read_reference as select pg_temp.conversation()->>'readVersion' as version;
select is(pg_temp.conversation()->>'unread','true','Ein Eingang bleibt vor dem Öffnen ungelesen');
select is(pg_temp.mark((select version from read_reference),'2026-10-08T10:00:00Z')->>'marked','false','Unbestätigter Detailabruf wird nicht gelesen');
select is(pg_temp.mark((select version from read_reference))->>'marked','true','Erfolgreich geladener Stand wird bestätigt');
select is(pg_temp.conversation()->>'unread','false','Ungelesen verschwindet im Postfach');
select is((select count(*)::int from public.marketplace_message_notifications where read),1,'Nur bereits beobachtete Glockenmeldungen werden gelesen');
select is(pg_temp.mark((select version from read_reference))->>'marked','true','Wiederholter Abschluss ist idempotent');
reset role;
update public.marketplace_account_entries set body='{"unread":true,"detailCheckedAt":"2026-10-08T09:00:00Z"}',observed_at=clock_timestamp() where id='38900000-0000-4000-8000-000000000031';
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,parent_id,external_id,body,sort_at) values
 ('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000021','message','38900000-0000-4000-8000-000000000031','800','{"direction":"outbound"}','2026-10-08T09:00:00Z');
set local role authenticated;
select is(pg_temp.conversation()->>'unread','false','Erneuter Import und eigene Nachricht erzeugen kein falsches Ungelesen');
reset role;
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,parent_id,external_id,body,sort_at) values
 ('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000021','message','38900000-0000-4000-8000-000000000031','702','{"direction":"inbound","text":"Hallo"}','2026-10-08T08:00:00Z');
set local role authenticated;
select is(pg_temp.conversation()->>'unread','true','Neue Nachrichten-ID wird auch bei identischem Text und Datum wieder ungelesen');
select is(pg_temp.mark((select version from read_reference))->>'marked','false','Verspäteter Abschluss verschluckt keinen neuen Eingang');
select is(pg_temp.conversation()->>'unread','true','Neuer Eingang bleibt nach verspätetem Abschluss ungelesen');
select set_config('request.jwt.claims','{"sub":"38900000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.mark(repeat('a',32))$$,'42501',null,'Mitglied darf keinen Kontolesestatus ändern');
select set_config('request.jwt.claims','{"sub":"38900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.marketplace_mark_conversation_read('38900000-0000-4000-8000-000000000011','38900000-0000-4000-8000-000000000022','38900000-0000-4000-8000-000000000031',repeat('a',32),'2026-10-08T09:00:00Z')$$,'42501',null,'Fremdes Konto wird abgelehnt');
select throws_ok($$select pg_temp.mark('invalid')$$,'22023',null,'Ungültige Version wird abgelehnt');
reset role;
update public.marketplace_connections set external_account_id='390' where id='38900000-0000-4000-8000-000000000021';
set local role authenticated;
select isnt(pg_temp.conversation()->>'readVersion',(select version from read_reference),'Kontowechsel übernimmt keinen früheren Lesestatus');
reset role;
select * from finish();
rollback;
