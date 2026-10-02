\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select has_table('public','marketplace_listing_metric_observations','Messhistorie ist vorhanden');
select ok((select relrowsecurity from pg_class where oid='public.marketplace_listing_metric_observations'::regclass),'Messhistorie ist durch RLS geschützt');
select ok(not has_table_privilege('authenticated','public.marketplace_listing_metric_observations','insert'),'Browser dürfen keine Statistik erfinden');
select ok(not has_function_privilege('anon','public.marketplace_read_listing_metric_changes(uuid,uuid,integer)','execute'),'Anonyme Clients dürfen keine Statistik abrufen');
select ok(not has_function_privilege('authenticated','public.marketplace_known_metric_count(jsonb,text)','execute'),'Interne Kennzahlfunktion hat keine Browserfreigabe');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('34000000-0000-4000-8000-000000000001','authenticated','authenticated','statistics-owner@example.test','{}','{}'),
 ('34000000-0000-4000-8000-000000000002','authenticated','authenticated','statistics-member@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('34000000-0000-4000-8000-000000000001'),('34000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('34000000-0000-4000-8000-000000000011','Statistiktest');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('34000000-0000-4000-8000-000000000011','34000000-0000-4000-8000-000000000001','owner'),
 ('34000000-0000-4000-8000-000000000011','34000000-0000-4000-8000-000000000002','member');
insert into public.marketplace_connections(id,workspace_id,display_name,status) values
 ('34000000-0000-4000-8000-000000000021','34000000-0000-4000-8000-000000000011','Statistikkonto','connected');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at,observed_at) values
 ('34000000-0000-4000-8000-000000000031','34000000-0000-4000-8000-000000000011','34000000-0000-4000-8000-000000000021','publication','listing-340','{"title":"Artikel","metrics":{"views":5,"favorites":1}}','2026-09-25T12:05:00Z','2026-09-25T12:05:00Z');
create function pg_temp.statistics(p_minutes integer default 5) returns jsonb language sql as $$
 select public.marketplace_read_listing_metric_changes('34000000-0000-4000-8000-000000000011','34000000-0000-4000-8000-000000000021',p_minutes)->'items'->0;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.statistics()->>'views',null,'Erste Beobachtung erfindet keinen vorherigen Wert');
select is(pg_temp.statistics()->>'baselineAt',null,'Noch fehlende Basis bleibt unbekannt');
set local role service_role;
update public.marketplace_account_entries set observed_at='2026-10-01T12:05:00Z',body='{"metrics":{"views":10,"favorites":2}}' where external_id='listing-340';
update public.marketplace_account_entries set observed_at='2026-10-02T11:05:00Z',body='{"metrics":{"views":20,"favorites":3}}' where external_id='listing-340';
update public.marketplace_account_entries set observed_at='2026-10-02T12:00:00Z',body='{"metrics":{"views":30,"favorites":4}}' where external_id='listing-340';
update public.marketplace_account_entries set observed_at='2026-10-02T12:05:00Z',body='{"metrics":{"views":32,"favorites":5}}' where external_id='listing-340';
update public.marketplace_connections set last_synced_at='2026-10-02T12:05:00Z' where id='34000000-0000-4000-8000-000000000021';
select is((select count(*)::int from public.marketplace_listing_metric_observations where connection_id='34000000-0000-4000-8000-000000000021'),5,'Jeder akzeptierte Messpunkt wird genau einmal gespeichert');
set local role authenticated;
select is(pg_temp.statistics()->>'views','2','Letzter Abruf zeigt plus zwei Aufrufe');
select is(pg_temp.statistics()->>'favorites','1','Letzter Abruf zeigt plus einen Favoriten');
select is(pg_temp.statistics(60)->>'views','12','Stundenvergleich verwendet die gespeicherte Stundenbasis');
select is(pg_temp.statistics(1440)->>'views','22','Tagesvergleich verwendet die gespeicherte Tagesbasis');
select is(pg_temp.statistics(10080)->>'views','27','Wochenvergleich verwendet die gespeicherte Wochenbasis');
select throws_ok($$select pg_temp.statistics(10)$$,'22023',null,'Nicht angebotene Zeiträume werden abgelehnt');
select throws_ok($$select public.marketplace_read_listing_metric_changes('34000000-0000-4000-8000-000000000012','34000000-0000-4000-8000-000000000021',5)$$,'42501',null,'Ein fremder Workspace liefert keine Kennzahlen');
set local role service_role;
update public.marketplace_account_entries set observed_at='2026-10-02T12:10:00Z' where external_id='listing-340';
set local role authenticated;
select is(pg_temp.statistics()->>'views','0','Unveränderter Folgeabruf entfernt den vorherigen Zuwachs');
select is(pg_temp.statistics()->>'favorites','0','Unveränderte Favoriten haben keinen neuen Zuwachs');
set local role service_role;
update public.marketplace_account_entries set observed_at='2026-10-02T12:15:00Z',body='{"metrics":{"views":null,"favorites":4}}' where external_id='listing-340';
set local role authenticated;
select is(pg_temp.statistics()->>'views',null,'Unbekannte Aufrufe bleiben unbekannt');
select is(pg_temp.statistics()->>'favorites','0','Abnahmen werden nicht als positiver Zuwachs angezeigt');
select set_config('request.jwt.claims','{"sub":"34000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.statistics()$$,'42501',null,'Mitglieder ohne Verwaltungsrecht haben keinen Statistikzugriff');
select is((select count(*)::int from public.marketplace_listing_metric_observations),0,'RLS verbirgt die gesamte Messhistorie vor Mitgliedern');
reset role;
select is((select count(*)::int from realtime.messages where topic='workspace:34000000-0000-4000-8000-000000000011:marketplace_account:34000000-0000-4000-8000-000000000021' and event='account_imported' and private),1,'Bestätigter Import erzeugt eine private Kontomeldung');
select is((select payload->>'connectionId' from realtime.messages where event='account_imported' and topic like 'workspace:34000000%'),'34000000-0000-4000-8000-000000000021','Meldung ist ausdrücklich an das Konto gebunden');
update public.marketplace_connections set last_synced_at='2026-10-02T12:05:00Z' where id='34000000-0000-4000-8000-000000000021';
select is((select count(*)::int from realtime.messages where event='account_imported' and topic like 'workspace:34000000%'),1,'Gleicher Zeitstempel erzeugt kein wiederholtes Ereignis');
delete from public.marketplace_connections where id='34000000-0000-4000-8000-000000000021';
select is((select count(*)::int from public.marketplace_listing_metric_observations),0,'Kontolöschung entfernt die zugehörige Messhistorie');
select * from finish();
rollback;
