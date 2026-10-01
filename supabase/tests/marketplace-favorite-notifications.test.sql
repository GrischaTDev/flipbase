\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public','marketplace_favorite_notifications','Favoritenmeldungen haben einen eigenen Speicher');
select has_table('public','marketplace_favorite_notification_events','Einzelereignisse bleiben dauerhaft nachvollziehbar');
select has_table('public','marketplace_favorite_notification_settings','Kontoeinstellungen sind dauerhaft gespeichert');
select has_function('public','marketplace_read_favorite_notifications',array['uuid'],'Berechtigter Feed ist verfügbar');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('33000000-0000-4000-8000-000000000001','authenticated','authenticated','favorites-owner@example.test','{}','{}'),
 ('33000000-0000-4000-8000-000000000002','authenticated','authenticated','favorites-member@example.test','{}','{}'),
 ('33000000-0000-4000-8000-000000000003','authenticated','authenticated','favorites-admin@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('33000000-0000-4000-8000-000000000001'),('33000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('33000000-0000-4000-8000-000000000011','Favoritentest'),('33000000-0000-4000-8000-000000000012','Fremder Workspace');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000001','owner'),
 ('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000002','member'),
 ('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000003','admin');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
 ('33000000-0000-4000-8000-000000000021','33000000-0000-4000-8000-000000000011','Mein Vinted Shop','connected','owner-330');
insert into public.marketplace_browser_sessions(public_id,workspace_id,connection_id,started_by,provider_profile_id,expires_at) values
 ('33000000-0000-4000-8000-000000000031','33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021','33000000-0000-4000-8000-000000000001','favorites-profile',now()+interval '1 hour');

create function pg_temp.listing(p_id text,p_favorites jsonb) returns jsonb language sql as $$
 select jsonb_build_object('kind','publication','externalId',p_id,'sortAt','2026-09-30T12:00:00Z',
   'body',jsonb_build_object('title',p_id,'metrics',jsonb_build_object('favorites',p_favorites)));
$$;
create function pg_temp.snapshot(p_minute int,p_entries jsonb,p_publications text default 'complete') returns jsonb language sql as $$
 select jsonb_build_object('identity',jsonb_build_object('id','owner-330'),
   'observedAt','2026-09-30T12:00:00Z'::timestamptz+p_minute*interval '1 minute',
   'entries',jsonb_build_array(jsonb_build_object('kind','profile','externalId','owner-330','sortAt','2026-09-30T12:00:00Z','body','{"feedbacks":[]}'::jsonb))||p_entries,
   'areas','{"profile":{"status":"complete"},"publications":{"status":"complete"},"conversations":{"status":"complete"},"messages":{"status":"complete"},"sales":{"status":"complete"},"feedback":{"status":"complete"}}'::jsonb
     || jsonb_build_object('publications',jsonb_build_object('status',p_publications,'failure',case when p_publications='failed' then 'timeout' end)));
$$;
create function pg_temp.apply(p_minute int,p_entries jsonb,p_publications text default 'complete') returns jsonb language sql as $$
 select public.marketplace_apply_vinted_import('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021','33000000-0000-4000-8000-000000000031','33000000-0000-4000-8000-000000000001',pg_temp.snapshot(p_minute,p_entries,p_publications));
$$;
create function pg_temp.feed() returns jsonb language sql as $$
 select public.marketplace_read_favorite_notifications('33000000-0000-4000-8000-000000000011');
$$;
create function pg_temp.settings() returns jsonb language sql as $$
 select public.marketplace_read_favorite_notification_settings('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021');
$$;
create function pg_temp.set_enabled(p_enabled boolean,p_version bigint) returns jsonb language sql as $$
 select public.marketplace_set_favorite_notification_settings('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',p_enabled,p_version);
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.settings()->>'enabled','true','Neue Konten melden standardmäßig ohne gesondertes Aktivieren');
select is(pg_temp.settings()->>'version','0','Noch nicht gespeicherte Einstellung hat Version null');
set local role service_role;
select lives_ok($$select pg_temp.apply(0,jsonb_build_array(pg_temp.listing('zero','0'),pg_temp.listing('unknown','null'),pg_temp.listing('decrease','5'),pg_temp.listing('skipped','2')))$$,'Erstimport setzt Ausgangswerte');
select is((select count(*)::int from public.marketplace_favorite_notifications),0,'Erstimport erzeugt keine Meldung');
select lives_ok($$select pg_temp.apply(1,jsonb_build_array(pg_temp.listing('zero','1'),pg_temp.listing('unknown','5'),pg_temp.listing('decrease','4'),pg_temp.listing('skipped','2')))$$,'Neuere Kennzahlen werden übernommen');
select is((select count(*)::int from public.marketplace_favorite_notification_events),1,'Nur null nach eins erzeugt eine Meldung');
select is((select previous_favorites::int from public.marketplace_favorite_notification_events limit 1),0,'Bekannter Nullwert bleibt Ereignisbasis');
select is((select favorites::int from public.marketplace_favorite_notification_events limit 1),1,'Neuer bekannter Wert wird gespeichert');
select is((select count(*)::int from realtime.messages where topic='workspace:33000000-0000-4000-8000-000000000011:marketplace_notifications' and event='favorite_notifications_changed' and private),1,'Eine Kontozusammenfassung sendet genau eine private Invalidierung');
select ok(not exists(select 1 from realtime.messages where topic='workspace:33000000-0000-4000-8000-000000000011:marketplace_notifications' and payload - 'id' <> '{}'::jsonb),'Broadcast enthält keine Inserat-, Konto- oder Kennzahlendetails');
select throws_ok($$select pg_temp.apply(1,jsonb_build_array(pg_temp.listing('zero','1')))$$,'22023',null,'Wiederholter Batch bleibt abgelehnt');
select throws_ok($$select pg_temp.apply(-1,jsonb_build_array(pg_temp.listing('zero','100')))$$,'22023',null,'Verspäteter Batch bleibt abgelehnt');
select lives_ok($$select pg_temp.apply(2,jsonb_build_array(pg_temp.listing('zero','1'),pg_temp.listing('unknown','null'),pg_temp.listing('decrease','5'),pg_temp.listing('skipped','2')))$$,'Erneuter Anstieg nach Abnahme ist neu');
select is((select count(*)::int from public.marketplace_favorite_notification_events),2,'Fünf nach vier nach fünf meldet genau den erneuten Anstieg');
select is((select count(*)::int from public.marketplace_favorite_notifications),2,'Jeder Beobachtungsbatch hat genau eine Zusammenfassung');

-- Ein bestätigter späterer Schreibstand lässt den echten bedingten Upsert aus.
reset role;
update public.marketplace_account_entries set observed_at='2026-09-30T14:00:00Z' where external_id='skipped';
set local role service_role;
select lives_ok($$select pg_temp.apply(3,jsonb_build_array(pg_temp.listing('zero','1'),pg_temp.listing('unknown','5'),pg_temp.listing('decrease','5'),pg_temp.listing('skipped','100')))$$,'Batch bleibt bei geschütztem neueren Inserat gültig');
select is((select body->'metrics'->>'favorites' from public.marketplace_account_entries where external_id='skipped'),'2','Bedingter Upsert verwirft ältere Zeile');
select is((select count(*)::int from public.marketplace_favorite_notification_events),2,'Verworfene Zeile und unbekannte alte Zahl erzeugen kein Ereignis');
select throws_ok($$select pg_temp.apply(4,jsonb_build_array(pg_temp.listing('zero','2'),' {"kind":"invalid","externalId":"bad","sortAt":"2026-09-30T12:00:00Z","body":{}}'::jsonb))$$,'22023',null,'Später Validierungsfehler verwirft den gesamten Batch');
select is((select count(*)::int from public.marketplace_favorite_notification_events),2,'Fehlgeschlagener Import hinterlässt kein Ereignis');
select lives_ok($$select pg_temp.apply(4,(select jsonb_agg(pg_temp.listing('many-'||n,'0')) from generate_series(1,51) n))$$,'Mehr als eine Snapshotseite importieren');
select lives_ok($$select pg_temp.apply(5,(select jsonb_agg(pg_temp.listing('many-'||n,'1')) from generate_series(1,51) n))$$,'Alle 51 Inserate erhöhen ihre Favoritenzahl');
select is((select count(*)::int from public.marketplace_favorite_notification_events where observed_at='2026-09-30T12:05:00Z'),51,'Ereignisse sind nicht auf 50 Inserate begrenzt');
select is((select count(*)::int from public.marketplace_favorite_notifications where observed_at='2026-09-30T12:05:00Z'),1,'51 Ereignisse erzeugen eine Kontozusammenfassung');

set local role authenticated;
select is(pg_temp.feed()->>'unreadCount','3','Feed zählt gespeicherte Zusammenfassungen');
select is(jsonb_array_length(pg_temp.feed()->'items'->0->'listings'),51,'Summary enthält alle Inserate des Batches');
select is(pg_temp.feed()->'items'->0->>'accountName','Mein Vinted Shop','Summary enthält den Kontonamen');
select is(jsonb_typeof(pg_temp.feed()->'items'->0->'id'),'string','Identitykennung wird sicher als Zeichenfolge übertragen');
select set_config('realtime.topic','workspace:33000000-0000-4000-8000-000000000011:marketplace_notifications',true);
select is((select count(*)::int from realtime.messages where topic='workspace:33000000-0000-4000-8000-000000000011:marketplace_notifications'),3,'Berechtigter Betreiber darf den eigenen privaten Kanal lesen');
select throws_ok($$insert into realtime.messages(topic,extension,payload,event,private) values ('workspace:33000000-0000-4000-8000-000000000011:marketplace_notifications','broadcast','{}','favorite_notifications_changed',true)$$,'42501',null,'Auch Betreiber dürfen keine Kanalereignisse fälschen');
select throws_ok($$insert into public.marketplace_favorite_notifications(workspace_id,connection_id,observed_at) values ('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000021',now())$$,'42501',null,'Browserclient darf keine Meldungen erfinden');
select is(pg_temp.set_enabled(false,1)->>'version','2','Einstellungswechsel erhöht dieselbe gespeicherte Fassung');
select throws_ok($$select pg_temp.set_enabled(true,1)$$,'40001',null,'Alte Einstellungsfassung darf neue Einstellung nicht überschreiben');
set local role service_role;
select lives_ok($$select pg_temp.apply(6,jsonb_build_array(pg_temp.listing('many-1','5')),'partial')$$,'Deaktiviertes Konto importiert weiterhin Kennzahlen');
select is((select count(*)::int from public.marketplace_favorite_notifications),3,'Deaktiviertes Konto meldet nicht');
set local role authenticated;
select is(pg_temp.set_enabled(true,2)->>'enabled','true','Meldungen lassen sich wieder aktivieren');
set local role service_role;
select lives_ok($$select pg_temp.apply(7,'[]','failed')$$,'Fehlgeschlagene Inseratquelle bleibt möglich');
select lives_ok($$select pg_temp.apply(8,jsonb_build_array(pg_temp.listing('many-1','10')),'partial')$$,'Erster erfolgreicher Abruf nach Aktivieren setzt neue Basis');
select is((select count(*)::int from public.marketplace_favorite_notifications),3,'Aktivieren erzeugt keine historischen Meldungen');
select lives_ok($$select pg_temp.apply(9,jsonb_build_array(pg_temp.listing('many-1','11'),pg_temp.listing('many-2','9')))$$,'Folgeabruf meldet nur seit Aktivierung neu beobachtete Änderungen');
select is((select count(*)::int from public.marketplace_favorite_notifications),4,'Neue Änderung nach Aktivierungsbasis erscheint');
select is((select count(*)::int from public.marketplace_favorite_notification_events where observed_at='2026-09-30T12:09:00Z'),1,'Später erstmals wieder enthaltenes Inserat erzeugt nach Teilimport keine historische Meldung');

-- 51 weitere reale Imports prüfen das separate Zählen über die Feedgrenze hinaus.
select lives_ok($$do $inner$ begin for i in 10..60 loop perform pg_temp.apply(i,jsonb_build_array(pg_temp.listing('many-1',to_jsonb(i+2)))); end loop; end $inner$;$$,'Viele Zusammenfassungen bleiben dauerhaft gespeichert');
set local role authenticated;
select is(jsonb_array_length(pg_temp.feed()->'items'),50,'Feed liefert höchstens 50 neueste Zusammenfassungen');
select is(pg_temp.feed()->>'unreadCount','55','Ungelesenzahl berücksichtigt auch ältere autorisierte Meldungen');
select is(public.marketplace_mark_favorite_notifications('33000000-0000-4000-8000-000000000011',pg_temp.feed()->'items'->0->>'id',false)->>'ok','true','Eine einzelne Meldung lässt sich markieren');
select is(pg_temp.feed()->>'unreadCount','54','Einzelmarkierung verändert ausschließlich die ausgewählte Meldung');
select is(public.marketplace_mark_favorite_notifications('33000000-0000-4000-8000-000000000011','foreign-notification',false)->>'ok','true','Unbekannte fremde Kennung bleibt eine harmlose leere Auswahl');
select is(pg_temp.feed()->>'unreadCount','54','Fremde Kennung verändert keinen Lesestatus');
select is(public.marketplace_mark_favorite_notifications('33000000-0000-4000-8000-000000000011',null,false)->>'ok','true','Alle Meldungen lassen sich als gelesen markieren');
select is(pg_temp.feed()->>'unreadCount','0','Markieren aller Meldungen umfasst auch Einträge außerhalb der Feedseite');

select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.feed()$$,'42501',null,'Normales Workspace-Mitglied darf Betreiberfeed nicht lesen');
select is((select count(*)::int from public.marketplace_favorite_notifications),0,'RLS verbirgt Details für normale Mitglieder');
select is((select count(*)::int from realtime.messages where topic='workspace:33000000-0000-4000-8000-000000000011:marketplace_notifications'),0,'Privater Kanal verweigert normale Mitglieder');
select throws_ok($$select pg_temp.settings()$$,'42501',null,'Normales Mitglied darf Einstellung nicht lesen');
select throws_ok($$select pg_temp.set_enabled(false,3)$$,'42501',null,'Normales Mitglied darf Einstellung nicht ändern');
select throws_ok($$select public.marketplace_mark_favorite_notifications('33000000-0000-4000-8000-000000000011',null,true)$$,'42501',null,'Normales Mitglied darf Historie nicht löschen');
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select pg_temp.feed()$$,'42501',null,'Workspace-Admin ohne Betreiberrecht darf Feed nicht lesen');
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.marketplace_read_favorite_notifications('33000000-0000-4000-8000-000000000012')$$,'42501',null,'Fremder Workspace ist gesperrt');
select throws_ok($$select public.marketplace_mark_favorite_notifications('33000000-0000-4000-8000-000000000012',null,true)$$,'42501',null,'Fremder Workspace darf auch nicht geleert werden');
reset role;
select ok(not has_function_privilege('anon','public.marketplace_read_favorite_notifications(uuid)','execute'),'Anonymer Feedaufruf ist gesperrt');
select ok(not has_function_privilege('authenticated','public.marketplace_prepare_favorite_import(uuid,uuid,timestamptz)','execute'),'Browser darf keinen Importkontext erzeugen');
select ok(not has_table_privilege('authenticated','public.marketplace_favorite_notification_events','insert'),'Client darf keine Einzelereignisse erfinden');
select ok(not has_table_privilege('authenticated','public.marketplace_favorite_notification_settings','update'),'Client darf weder Einstellungen noch Basisfassung direkt manipulieren');
select throws_ok($$update public.marketplace_favorite_notifications set workspace_id='33000000-0000-4000-8000-000000000012'$$,'22023',null,'Workspacebindung der Meldung bleibt unveränderbar');
delete from public.platform_operators where user_id='33000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select pg_temp.feed()$$,'42501',null,'Rechteverlust sperrt bestehende Details und Zähler');
reset role;
insert into public.platform_operators(user_id) values ('33000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(public.marketplace_mark_favorite_notifications('33000000-0000-4000-8000-000000000011',pg_temp.feed()->'items'->0->>'id',true)->>'ok','true','Einzelne Meldung lässt sich löschen');
select is(jsonb_array_length(pg_temp.feed()->'items'),50,'Einzellöschung lässt die übrige Historie bestehen');
select is(public.marketplace_mark_favorite_notifications('33000000-0000-4000-8000-000000000011',null,true)->>'ok','true','Berechtigte Nutzer dürfen die Historie löschen');
select is(jsonb_array_length(pg_temp.feed()->'items'),0,'Gelöschte Historie ist leer');
reset role;
select is((select count(*)::int from public.marketplace_favorite_notification_events),0,'Gelöschte Zusammenfassungen entfernen zugehörige Ereignisse');
select * from finish();
rollback;
