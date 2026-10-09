\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('38800000-0000-4000-8000-000000000001','authenticated','authenticated','bot-owner@example.test','{}','{}'),
 ('38800000-0000-4000-8000-000000000002','authenticated','authenticated','bot-other@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('38800000-0000-4000-8000-000000000001'),('38800000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('38800000-0000-4000-8000-000000000011','Bot A'),('38800000-0000-4000-8000-000000000012','Bot B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('38800000-0000-4000-8000-000000000011','38800000-0000-4000-8000-000000000001','owner'),
 ('38800000-0000-4000-8000-000000000012','38800000-0000-4000-8000-000000000002','owner');
insert into public.marketplace_connections(id,workspace_id,display_name) values
 ('38800000-0000-4000-8000-000000000021','38800000-0000-4000-8000-000000000011','Bot A'),
 ('38800000-0000-4000-8000-000000000022','38800000-0000-4000-8000-000000000011','Bot A2'),
 ('38800000-0000-4000-8000-000000000023','38800000-0000-4000-8000-000000000012','Bot B');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values
 ('38800000-0000-4000-8000-000000000031','38800000-0000-4000-8000-000000000011','38800000-0000-4000-8000-000000000021','conversation','500','{}');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,parent_id,external_id,body,sort_at)
select '38800000-0000-4000-8000-000000000011','38800000-0000-4000-8000-000000000021','message','38800000-0000-4000-8000-000000000031',n::text,
 jsonb_build_object('text','Hallo!','direction',case when n=4 then 'inbound' when n=5 then 'unknown' else 'outbound' end,'isAutomated',true),
 '2026-10-01'::timestamptz + n * interval '1 second' from generate_series(1,55) n;

-- Gleiche Texte und Anbieter-IDs in anderen Konten dürfen keine Automatikherkunft vortäuschen.
insert into public.marketplace_favorite_message_events(workspace_id,connection_id,external_id,actor_id,item_id,event_at,setting_version,title,state,execution_mode,external_message_id,external_conversation_id)
select '38800000-0000-4000-8000-000000000011',case when n=8 then '38800000-0000-4000-8000-000000000022'::uuid else '38800000-0000-4000-8000-000000000021'::uuid end,
 gen_random_uuid(),n::text,'100',now(),1,'Hallo!',case when n=3 then 'outcome_unknown' when n=12 then 'failed' else 'sent' end,
 case when n=1 then 'cloud' else 'local' end,n::text,case when n=6 then '999' when n=7 then null else '500' end
from generate_series(1,12) n where n not in (2,9,10);
insert into public.marketplace_favorite_message_events(workspace_id,connection_id,external_id,actor_id,item_id,event_at,setting_version,title,state,external_message_id,external_conversation_id) values
 ('38800000-0000-4000-8000-000000000012','38800000-0000-4000-8000-000000000023',gen_random_uuid(),'9','100',now(),1,'Hallo!','sent','9','500');

create function pg_temp.page(p_cursor text default null) returns jsonb language sql as $$
 select public.marketplace_read_page('38800000-0000-4000-8000-000000000011','38800000-0000-4000-8000-000000000021','message',p_cursor,'38800000-0000-4000-8000-000000000031');
$$;
create function pg_temp.automated(p_id text) returns boolean language sql as $$
 select (entry->>'isAutomated')::boolean from jsonb_array_elements(pg_temp.page(pg_temp.page()->>'nextCursor')->'items') entry where entry->>'externalId'=p_id
 union all
 select (entry->>'isAutomated')::boolean from jsonb_array_elements(pg_temp.page()->'items') entry where entry->>'externalId'=p_id;
$$;

select ok(not has_table_privilege('authenticated','public.marketplace_favorite_message_events','select'),'Private Versandbelege bleiben geschützt');
select ok(not has_function_privilege('anon','public.marketplace_read_page(uuid,uuid,text,text,uuid)','execute'),'Keine anonymen Nachrichtenabrufe');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"38800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(jsonb_array_length(pg_temp.page()->'items'),50,'Erste Seite bleibt begrenzt');
select is(jsonb_array_length(pg_temp.page(pg_temp.page()->>'nextCursor')->'items'),5,'Herkunft bleibt auch auf der Folgeseite verfügbar');
select is(pg_temp.automated('1'),true,'Bestätigte Cloud-Antwort erkannt');
select is(pg_temp.automated('2'),false,'Manuelle Antwort mit identischem Text bleibt manuell');
select is(pg_temp.automated('3'),false,'Unbestätigter Versand bleibt unmarkiert');
select is(pg_temp.automated('4'),false,'Eingehende Nachricht bekommt keine eigene Automatikherkunft');
select is(pg_temp.automated('5'),false,'Unbekannte Richtung bekommt keine Automatikherkunft');
select is(pg_temp.automated('6'),false,'Beleg aus anderem Gespräch passt nicht');
select is(pg_temp.automated('7'),true,'Älterer bestätigter Extension-Beleg mit eindeutiger Nachrichten-ID bleibt erkennbar');
select is(pg_temp.automated('8'),false,'Gleiche Nachrichten-ID aus anderem Konto passt nicht');
select is(pg_temp.automated('9'),false,'Gleiche Nachrichten-ID aus anderem Workspace passt nicht');
select is(pg_temp.automated('10'),false,'Importiertes isAutomated wird durch den Versandbeleg ersetzt');
select is(pg_temp.automated('11'),true,'Bestätigte lokale Antwort mit Gesprächs-ID erkannt');
select is(pg_temp.automated('12'),false,'Fehlgeschlagener Versand bleibt unmarkiert');
select throws_ok($$select public.marketplace_read_page('38800000-0000-4000-8000-000000000012','38800000-0000-4000-8000-000000000023','activity')$$,'42501',null,'Fremder Workspace wird abgelehnt');
select throws_ok($$select public.marketplace_read_page('38800000-0000-4000-8000-000000000011','38800000-0000-4000-8000-000000000022','message',null,'38800000-0000-4000-8000-000000000031')$$,'42501',null,'Fremdes Gespräch wird abgelehnt');
reset role;
update public.marketplace_account_entries set body='{"direction":"outbound","text":"Erneut importiert"}' where kind='message' and external_id='1' and connection_id='38800000-0000-4000-8000-000000000021';
set local role authenticated;
select is(pg_temp.automated('1'),true,'Neue Synchronisierung erhält die bestätigte Herkunft');
select set_config('request.jwt.claims','{"sub":"38800000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.page()$$,'42501',null,'Anderer Betreiber erhält keine Nachrichten dieses Workspaces');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select pg_temp.page()$$,'42501',null,'Ohne Benutzeridentität wird kein Chat ausgeliefert');
select set_config('request.jwt.claims','{"sub":"38800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.archive_workspace('38800000-0000-4000-8000-000000000011');
select throws_ok($$select pg_temp.page()$$,'42501',null,'Archivierter Workspace bleibt gesperrt');
reset role;
select * from finish();
rollback;
