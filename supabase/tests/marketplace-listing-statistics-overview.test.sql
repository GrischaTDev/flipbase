\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public','marketplace_listing_statistic_items','Dauerhafte Statistik-Datensätze sind vorhanden');
select ok((select relrowsecurity from pg_class where oid='public.marketplace_listing_statistic_items'::regclass),'Statistik-Datensätze sind durch RLS geschützt');
select ok(not has_table_privilege('authenticated','public.marketplace_listing_statistic_items','insert'),'Browser dürfen keine Statistik-Datensätze anlegen');
select ok(not has_function_privilege('anon','public.marketplace_read_listing_statistics_overview(uuid,text,uuid)','execute'),'Anonyme Clients dürfen keine Statistik abrufen');

select has_index('public','marketplace_listing_metric_observations','marketplace_listing_metric_observations_entry','Verweis auf das Inserat ist indiziert, damit das Löschen eines Inserats keinen Tabellendurchlauf braucht');
select ok((select prosecdef from pg_proc where oid='public.marketplace_read_listing_statistics_overview(uuid,text,uuid)'::regprocedure),'Lesefunktion prüft das Recht einmal selbst statt je Messzeile');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('34100000-0000-4000-8000-000000000001','authenticated','authenticated','overview-owner@example.test','{}','{}'),
 ('34100000-0000-4000-8000-000000000002','authenticated','authenticated','overview-member@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('34100000-0000-4000-8000-000000000001'),('34100000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('34100000-0000-4000-8000-000000000011','Statistikübersicht');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000001','owner'),
 ('34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000002','member');
insert into public.marketplace_connections(id,workspace_id,display_name,status) values
 ('34100000-0000-4000-8000-000000000021','34100000-0000-4000-8000-000000000011','Konto A','connected'),
 ('34100000-0000-4000-8000-000000000022','34100000-0000-4000-8000-000000000011','Konto B','connected');

insert into public.workspaces(id,name) values ('34100000-0000-4000-8000-000000000012','Fremder Workspace');
insert into public.marketplace_connections(id,workspace_id,display_name,status) values
 ('34100000-0000-4000-8000-000000000023','34100000-0000-4000-8000-000000000012','Fremdes Konto','connected');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at,observed_at) values
 ('34100000-0000-4000-8000-000000000039','34100000-0000-4000-8000-000000000012','34100000-0000-4000-8000-000000000023','publication','item-foreign',
  '{"publicationState":"active","title":"Fremd","metrics":{"views":1,"favorites":0}}',now()-interval '20 days',now()-interval '20 days');
update public.marketplace_account_entries set observed_at=now()-interval '1 hour',body=jsonb_set(body,'{metrics}','{"views":9000,"favorites":900}') where external_id='item-foreign';
-- Artikel A auf Konto A: erste Messung vor 20 Tagen, danach vier weitere.
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at,observed_at) values
 ('34100000-0000-4000-8000-000000000031','34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000021','publication','item-a',
  '{"publicationState":"active","title":"Jacke","imageUrl":"https://images.example.test/a.jpg","price":25,"currency":"EUR","metrics":{"views":100,"favorites":10}}',now()-interval '20 days',now()-interval '20 days'),
 ('34100000-0000-4000-8000-000000000032','34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000022','publication','item-b',
  '{"publicationState":"active","title":"Schal","metrics":{"views":5,"favorites":0}}',now()-interval '20 days',now()-interval '20 days');
update public.marketplace_account_entries set observed_at=now()-interval '8 days',body=jsonb_set(body,'{metrics}','{"views":110,"favorites":11}') where external_id='item-a';
update public.marketplace_account_entries set observed_at=now()-interval '2 days',body=jsonb_set(body,'{metrics}','{"views":150,"favorites":15}') where external_id='item-a';
update public.marketplace_account_entries set observed_at=now()-interval '30 minutes',body=jsonb_set(body,'{metrics}','{"views":160,"favorites":null}') where external_id='item-a';
update public.marketplace_account_entries set observed_at=now()-interval '10 minutes',body=jsonb_set(body,'{metrics}','{"views":155,"favorites":18}') where external_id='item-a';
update public.marketplace_account_entries set observed_at=now()-interval '1 hour',body=jsonb_set(body,'{metrics}','{"views":25,"favorites":0}') where external_id='item-b';

select is((select count(*)::int from public.marketplace_listing_statistic_items where workspace_id='34100000-0000-4000-8000-000000000011'),2,'Je Vinted-Artikel entsteht genau ein Statistik-Datensatz');
select is((select title from public.marketplace_listing_statistic_items where external_id='item-a'),'Jacke','Titel wird übernommen');
select is((select first_seen_at from public.marketplace_listing_statistic_items where external_id='item-a'),now()-interval '20 days','Erste Messung bestimmt den Beginn der Historie');

-- Artikel B verschwindet aus dem Kleiderschrank.
delete from public.marketplace_account_entries where external_id='item-b' and workspace_id='34100000-0000-4000-8000-000000000011';
select is((select count(*)::int from public.marketplace_listing_metric_observations o join public.marketplace_listing_statistic_items i on i.id=o.statistic_item_id where i.external_id='item-b'),2,'Messungen bleiben erhalten, wenn das Inserat verschwindet');
select isnt((select removed_at from public.marketplace_listing_statistic_items where external_id='item-b'),null,'Verschwundenes Inserat wird als nicht mehr online vermerkt');

create function pg_temp.overview(p_period text, p_connection_id uuid default null) returns jsonb language sql as $$
 select public.marketplace_read_listing_statistics_overview('34100000-0000-4000-8000-000000000011',p_period,p_connection_id);
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34100000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(pg_temp.overview('7d')->'totals'->>'views','70','Sieben Tage, alle Konten: 50 Aufrufe von A und 20 vom verschwundenen B');
select is(pg_temp.overview('7d')->'totals'->>'favorites','7','Unbekannte Favoriten werden übersprungen, nicht als null gewertet');
select is(pg_temp.overview('7d')->'previousTotals'->>'views','10','Vorzeitraum zählt den Zuwachs von vor acht Tagen');
select is(pg_temp.overview('7d')->'previousTotals'->>'favorites','1','Vorzeitraum zählt auch Favoriten');
select is(pg_temp.overview('7d')->>'activeCount','1','Nur noch vorhandene Inserate zählen als aktiv');
reset role;
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body)
select '34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000021','publication','state-'||state,
  jsonb_build_object('publicationState',state,'title',state)
from unnest(array['draft','hidden','ended','unknown']) state;
set local role authenticated;
select is(pg_temp.overview('7d')->>'activeCount','1','Entwurf, verborgen, beendet und unbekannt zählen nicht als aktive Anzeigen');
reset role;
update public.marketplace_account_entries set body=jsonb_set(body,'{publicationState}','"reserved"'::jsonb) where external_id='state-hidden';
set local role authenticated;
select is(pg_temp.overview('7d')->>'activeCount','2','Ein aktuell belegtes reserviertes Inserat bleibt im veröffentlichten Bestand');
reset role;
delete from public.marketplace_account_entries where external_id like 'state-%' and workspace_id='34100000-0000-4000-8000-000000000011';
set local role authenticated;

select is(jsonb_array_length(pg_temp.overview('7d')->'buckets'),7,'Sieben Tage liefern sieben Abschnitte');
select is((select sum((b->>'views')::int)::int from jsonb_array_elements(pg_temp.overview('7d')->'buckets') b),70,'Abschnitte ergeben zusammen die Summe');
select is(pg_temp.overview('7d','34100000-0000-4000-8000-000000000021')->'totals'->>'views','50','Ein einzelnes Konto zeigt nur seine Aufrufe');
select is(pg_temp.overview('7d')->'topItems'->0->>'title','Jacke','Stärkster Artikel steht vorn');
select is(pg_temp.overview('7d')->'topItems'->0->>'views','50','Bestenliste nennt den Zuwachs im Zeitraum');
select is(pg_temp.overview('7d')->'topItems'->0->>'totalViews','155','Bestenliste nennt den letzten bekannten Gesamtwert');
select is(pg_temp.overview('7d')->'topItems'->0->>'entryId','34100000-0000-4000-8000-000000000031','Vorhandenes Inserat ist verlinkbar');
select is(pg_temp.overview('7d')->'topItems'->0->>'accountName','Konto A','Bestenliste nennt das Konto');
select is(pg_temp.overview('7d')->'topItems'->1->>'title','Schal','Verschwundener Artikel bleibt in der Bestenliste');
select is(pg_temp.overview('7d')->'topItems'->1->>'entryId',null,'Verschwundener Artikel ist nicht verlinkbar');
select isnt(pg_temp.overview('7d')->'topItems'->1->>'removedAt',null,'Verschwundener Artikel trägt den Vermerk');

select is(pg_temp.overview('24h')->'totals'->>'views','30','24 Stunden: 10 von A (sinkender Zähler zählt 0) und 20 von B');
select is(pg_temp.overview('24h')->'totals'->>'favorites','3','24 Stunden: Favoriten gegen den letzten bekannten Wert');
select is(pg_temp.overview('24h')->'previousTotals'->>'views','0','Vorzeitraum ohne Messung ergibt null Zuwachs');
select is(jsonb_array_length(pg_temp.overview('24h')->'buckets'),24,'24 Stunden liefern 24 Abschnitte');

select is(pg_temp.overview('30d')->'totals'->>'views','80','30 Tage enthalten alle Zuwächse; die allererste Messung zählt nicht');
select is(pg_temp.overview('30d')->'previousTotals',jsonb 'null','Ohne vollständige Historie gibt es keinen Vorzeitraum');
select is(jsonb_array_length(pg_temp.overview('30d')->'buckets'),30,'30 Tage liefern 30 Abschnitte');

select throws_ok($$select pg_temp.overview('90d')$$,'22023',null,'Nicht angebotene Zeiträume werden abgelehnt');
select throws_ok($$select pg_temp.overview('7d','34100000-0000-4000-8000-000000000099')$$,'42501',null,'Ein unbekanntes Konto liefert keine Statistik');
select throws_ok($$select public.marketplace_read_listing_statistics_overview('34100000-0000-4000-8000-000000000012','7d')$$,'42501',null,'Ein fremder Workspace liefert keine Statistik');
select throws_ok($$select pg_temp.overview('7d','34100000-0000-4000-8000-000000000023')$$,'42501',null,'Ein Konto aus einem fremden Workspace liefert keine Statistik');
select is(pg_temp.overview('7d')->'totals'->>'views','70','Fremde Messungen fließen nie in die eigene Summe ein');
-- Vorzeitraum zählt nur so weit, wie der aktuelle Zeitraum schon gelaufen ist.
reset role;
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at,observed_at) values
 ('34100000-0000-4000-8000-000000000034','34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000021','publication','item-c',
  '{"publicationState":"active","title":"Hose","metrics":{"views":0,"favorites":0}}',now()-interval '20 days',now()-interval '20 days');
update public.marketplace_account_entries set body=jsonb_set(body,'{metrics}','{"views":500,"favorites":0}'),
  observed_at=((date_trunc('day',now() at time zone 'Europe/Berlin')-interval '6 days') at time zone 'Europe/Berlin')-interval '1 second'
  where external_id='item-c';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.overview('7d')->'totals'->>'views','70','Zuwachs kurz vor Zeitraumbeginn zählt nicht zum aktuellen Zeitraum');
select is(pg_temp.overview('7d')->'previousTotals'->>'views','10','Vorzeitraum endet nach derselben Laufzeit wie der aktuelle Zeitraum');
select set_config('request.jwt.claims','{"sub":"34100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.overview('7d')$$,'42501',null,'Mitglieder ohne Verwaltungsrecht haben keinen Zugriff');
select is((select count(*)::int from public.marketplace_listing_statistic_items),0,'RLS verbirgt die Statistik-Datensätze vor Mitgliedern');

-- Review Focus 1: dasselbe Inserat taucht wieder auf.
reset role;
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at,observed_at) values
 ('34100000-0000-4000-8000-000000000033','34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000022','publication','item-b',
  '{"publicationState":"active","title":"Schal","metrics":{"views":27,"favorites":0}}',now()-interval '1 minute',now()-interval '1 minute');
select is((select count(*)::int from public.marketplace_listing_statistic_items where external_id='item-b'),1,'Wiederkehrendes Inserat nutzt denselben Statistik-Datensatz');
select is((select removed_at from public.marketplace_listing_statistic_items where external_id='item-b'),null,'Wiederkehrendes Inserat gilt wieder als online');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.overview('24h','34100000-0000-4000-8000-000000000022')->'totals'->>'views','22','Zuwachs läuft über das Wiederauftauchen hinweg weiter');

reset role;
delete from public.marketplace_connections where workspace_id='34100000-0000-4000-8000-000000000011';
select is((select count(*)::int from public.marketplace_listing_statistic_items where workspace_id='34100000-0000-4000-8000-000000000011'),0,'Kontolöschung entfernt die Statistik des Kontos');
select * from finish();
rollback;
