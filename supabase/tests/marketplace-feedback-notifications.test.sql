\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('42000000-0000-4000-8000-000000000001','authenticated','authenticated','feedback-owner@example.test','{}','{}'),
 ('42000000-0000-4000-8000-000000000002','authenticated','authenticated','feedback-member@example.test','{}','{}'),
 ('42000000-0000-4000-8000-000000000003','authenticated','authenticated','feedback-admin@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('42000000-0000-4000-8000-000000000001'),('42000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('42000000-0000-4000-8000-000000000011','Bewertungstest'),('42000000-0000-4000-8000-000000000012','Fremder Workspace');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('42000000-0000-4000-8000-000000000011','42000000-0000-4000-8000-000000000001','owner'),
 ('42000000-0000-4000-8000-000000000011','42000000-0000-4000-8000-000000000002','member'),
 ('42000000-0000-4000-8000-000000000011','42000000-0000-4000-8000-000000000003','admin');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('42000000-0000-4000-8000-000000000021','42000000-0000-4000-8000-000000000011','Mein Vinted Shop','connected','owner-420');
insert into public.marketplace_browser_sessions(public_id,workspace_id,connection_id,started_by,provider_profile_id,expires_at) values
 ('42000000-0000-4000-8000-000000000031','42000000-0000-4000-8000-000000000011','42000000-0000-4000-8000-000000000021','42000000-0000-4000-8000-000000000001','feedback-profile',now()+interval '1 hour');

create function pg_temp.feedback(p_id text,p_automatic boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('id',p_id,'authorName','mitglied','rating',5,'isAutomatic',p_automatic,'occurredAt','2026-09-30T12:00:00Z','text','Danke!');
$$;
create function pg_temp.apply(p_minute int,p_feedbacks jsonb,p_feedback_status text default 'complete',p_invalid boolean default false) returns jsonb language sql as $$
 select public.marketplace_apply_vinted_import('42000000-0000-4000-8000-000000000011','42000000-0000-4000-8000-000000000021','42000000-0000-4000-8000-000000000031','42000000-0000-4000-8000-000000000001',
 jsonb_build_object('identity',jsonb_build_object('id','owner-420'),'observedAt','2026-09-30T12:00:00Z'::timestamptz+p_minute*interval '1 minute',
 'entries',jsonb_build_array(jsonb_build_object('kind','profile','externalId','owner-420','sortAt','2026-09-30T12:00:00Z',
 'body',case when p_feedbacks is null then '{}'::jsonb else jsonb_build_object('feedbacks',p_feedbacks) end))
 || case when p_invalid then '[{"kind":"invalid","externalId":"bad","sortAt":"2026-09-30T12:00:00Z","body":{}}]'::jsonb else '[]'::jsonb end,
 'areas','{"profile":{"status":"complete"},"publications":{"status":"complete"},"conversations":{"status":"complete"},"messages":{"status":"complete"},"sales":{"status":"complete"},"feedback":{"status":"complete"}}'::jsonb
 || jsonb_build_object('feedback',jsonb_build_object('status',p_feedback_status,'failure',case when p_feedback_status='failed' then 'timeout' end))));
$$;
create function pg_temp.feed() returns jsonb language sql as $$
 select public.marketplace_read_feedback_notifications('42000000-0000-4000-8000-000000000011');
$$;
create function pg_temp.mark(p_id text default null,p_clear boolean default false) returns jsonb language sql as $$
 select public.marketplace_mark_feedback_notifications('42000000-0000-4000-8000-000000000011',p_id,p_clear);
$$;

set local role service_role;
select lives_ok($$select pg_temp.apply(0,null,'failed')$$,'Fehlgeschlagene Bewertungen setzen keine Ausgangsbasis');
select lives_ok($$select pg_temp.apply(1,jsonb_build_array(pg_temp.feedback('old')))$$,'Erster erfolgreicher Abruf übernimmt historischen Bestand');
select is((select count(*)::int from public.marketplace_feedback_notifications where notified_at is not null),0,'Erstbestand erzeugt keine Meldung');
select lives_ok($$select pg_temp.apply(2,jsonb_build_array(pg_temp.feedback('old'),pg_temp.feedback('member'),pg_temp.feedback('auto',true)))$$,'Neue Mitglieder- und Systembewertungen werden übernommen');
select is((select count(*)::int from public.marketplace_feedback_notifications where notified_at is not null),2,'Beide Herkunftsarten werden genau einmal gemeldet');
reset role;
select is((select count(*)::int from realtime.messages where topic='workspace:42000000-0000-4000-8000-000000000011:marketplace_feedback_notifications' and event='feedback_notifications_changed' and private),1,'Ein Abruf sendet genau eine private Invalidierung');
select ok(not exists(select 1 from realtime.messages where topic='workspace:42000000-0000-4000-8000-000000000011:marketplace_feedback_notifications' and payload - 'id' <> '{}'::jsonb),'Broadcast enthält keine Bewertungs- oder Kontodetails');
set local role service_role;
select lives_ok($$select pg_temp.apply(3,jsonb_build_array(pg_temp.feedback('old') || '{"isAutomatic":true,"text":"korrigiert"}',pg_temp.feedback('member'),pg_temp.feedback('auto',true)))$$,'Korrektur von Herkunft und Text wird akzeptiert');
select is((select count(*)::int from public.marketplace_feedback_notifications where notified_at is not null),2,'Korrekturen und wiederholte Bewertungen erzeugen keine Meldung');
select throws_ok($$select pg_temp.apply(2,jsonb_build_array(pg_temp.feedback('stale')))$$,'22023',null,'Veraltete Abrufe werden abgelehnt');
select throws_ok($$select pg_temp.apply(4,jsonb_build_array(pg_temp.feedback('rollback')),'complete',true)$$,'22023',null,'Später Importfehler rollt Meldung mit zurück');
select ok(not exists(select 1 from public.marketplace_feedback_notifications where external_feedback_id in ('stale','rollback')),'Abgelehnte Abrufe hinterlassen keine Meldungen');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.feed()->>'unreadCount','2','Berechtigter Feed zählt nur neue Bewertungen');
select set_config('realtime.topic','workspace:42000000-0000-4000-8000-000000000011:marketplace_feedback_notifications',true);
select is((select count(*)::int from realtime.messages where topic=(select realtime.topic())),1,'Berechtigter Betreiber darf private Bewertungsinvalidierung lesen');
select throws_ok($$insert into realtime.messages(topic,extension,payload,event,private) values ('workspace:42000000-0000-4000-8000-000000000011:marketplace_feedback_notifications','broadcast','{}','feedback_notifications_changed',true)$$,'42501',null,'Browser darf keine Bewertungsereignisse fälschen');
select is(pg_temp.feed()->'items'->0->>'accountName','Mein Vinted Shop','Meldung enthält die richtige Kontozuordnung');
select is(pg_temp.feed()->'items'->0->>'isAutomatic','true','Automatische Herkunft bleibt ausdrücklich erkennbar');
select lives_ok($$select pg_temp.mark((pg_temp.feed()->'items'->0->>'id'))$$,'Einzelne Meldung wird gelesen');
select is(pg_temp.feed()->>'unreadCount','1','Gelesenstatus senkt den Gesamtzähler');
select lives_ok($$select pg_temp.mark(null,true)$$,'Verlauf kann geleert werden');
select is(jsonb_array_length(pg_temp.feed()->'items'),0,'Geleerter Verlauf ist unsichtbar');
select throws_ok($$update public.marketplace_feedback_notifications set author_name='gefälscht'$$,'42501',null,'Browser kann keine Meldungsdetails ändern');
select throws_ok($$delete from public.marketplace_feedback_notifications$$,'42501',null,'Browser kann bekannte Kennungen nicht entfernen');
select throws_ok($$select public.marketplace_read_feedback_notifications('42000000-0000-4000-8000-000000000012')$$,'42501',null,'Fremder Workspace ist gesperrt');
select throws_ok($$select public.marketplace_mark_feedback_notifications('42000000-0000-4000-8000-000000000012',null,true)$$,'42501',null,'Fremder Verlauf kann nicht geleert werden');
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.feed()$$,'42501',null,'Betreiber ohne Workspace-Adminrecht sieht keine Meldungen');
select is((select count(*)::int from public.marketplace_feedback_notifications),0,'RLS sperrt direkten Tabellenzugriff normaler Mitglieder');
select is((select count(*)::int from realtime.messages where topic=(select realtime.topic())),0,'Privater Kanal sperrt normale Mitglieder');
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select pg_temp.feed()$$,'42501',null,'Workspace-Admin ohne Betreiberfreigabe bleibt gesperrt');
set local role anon;
select throws_ok($$select pg_temp.feed()$$,'42501',null,'Anonyme Aufrufe sind gesperrt');

set local role service_role;
select lives_ok($$select pg_temp.apply(4,'[]')$$,'Vorübergehend fehlende Bewertungen werden übernommen');
select lives_ok($$select pg_temp.apply(5,jsonb_build_array(pg_temp.feedback('old'),pg_temp.feedback('member'),pg_temp.feedback('auto',true)))$$,'Bekannte Bewertungen können wieder erscheinen');
select is((select count(*)::int from public.marketplace_feedback_notifications where notified_at is not null and cleared_at is null),0,'Geleerte und wieder erschienene Bewertungen werden nicht erneut gemeldet');
select lives_ok($$select pg_temp.apply(6,null,'failed')$$,'Fehlgeschlagener Teilabruf erhält den letzten Bestand');
select lives_ok($$select pg_temp.apply(7,jsonb_build_array(pg_temp.feedback('old'),pg_temp.feedback('after-failure',null)))$$,'Neue Bewertung nach Abruffehler wird übernommen');
select is((select count(*)::int from public.marketplace_feedback_notifications where notified_at is not null and cleared_at is null),1,'Abruffehler setzt die vorhandene Basis nicht zurück');
select lives_ok($$select pg_temp.apply(8,(select jsonb_agg(pg_temp.feedback('many-'||n)) from generate_series(1,51) n))$$,'Mehr als eine Seite neuer Bewertungen wird gespeichert');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(jsonb_array_length(pg_temp.feed()->'items'),50,'Glockenliste ist auf 50 Meldungen begrenzt');
select is(pg_temp.feed()->>'unreadCount','52','Zähler enthält auch Meldungen außerhalb der ersten Seite');
select lives_ok($$select pg_temp.mark()$$,'Alle Meldungen einschließlich Folgeseite können gelesen werden');
select is(pg_temp.feed()->>'unreadCount','0','Gemeinsames Gelesen-Markieren gilt vollständig');

-- Ein vor dem Update bestehendes Profil hat noch keine Kennungshistorie.
reset role;
alter table public.marketplace_account_entries disable trigger marketplace_record_feedback_notifications;
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('42000000-0000-4000-8000-000000000022','42000000-0000-4000-8000-000000000011','Altbestand','connected','old-420');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,observed_at) values
 ('42000000-0000-4000-8000-000000000011','42000000-0000-4000-8000-000000000022','profile','old-420',jsonb_build_object('feedbacks',jsonb_build_array(pg_temp.feedback('historical'))),'2026-09-29T12:00:00Z');
alter table public.marketplace_account_entries enable trigger marketplace_record_feedback_notifications;
update public.marketplace_account_entries set body=jsonb_build_object('feedbacks',jsonb_build_array(pg_temp.feedback('historical') || '{"isAutomatic":true}',pg_temp.feedback('new-after-upgrade'))),observed_at='2026-09-30T12:00:00Z' where external_id='old-420';
select is((select count(*)::int from public.marketplace_feedback_notifications where connection_id='42000000-0000-4000-8000-000000000022' and notified_at is not null),1,'Nach Upgrade wird nur die neue Kennung gemeldet, keine korrigierte historische Bewertung');
select ok(not has_sequence_privilege('authenticated','public.marketplace_feedback_notifications_id_seq','usage'),'Browser darf keine Meldungsnummern vergeben');
select ok(not has_sequence_privilege('anon','public.marketplace_feedback_notifications_id_seq','select'),'Anonyme Nutzer können keine internen Meldungsnummern lesen');

select * from finish();
rollback;
