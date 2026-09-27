\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'marketplace_connections', 'Kontoverbindungen existieren');
select has_table('public', 'marketplace_account_entries', 'Kontodaten sind getrennt gespeichert');
select ok(not has_table_privilege('anon', 'public.marketplace_connections', 'select'), 'Keine anonymen Kontodaten');
select ok(not has_table_privilege('authenticated', 'public.marketplace_connections', 'insert'), 'Keine direkte Kontoanlage');
select ok(not has_table_privilege('authenticated', 'public.marketplace_connections', 'update'), 'Kein direkter Sitzungs- oder Statuswechsel');
select ok(not has_table_privilege('authenticated', 'public.marketplace_account_entries', 'insert'), 'Keine erfundenen Verkaufsdaten durch den Client');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
 ('25000000-0000-4000-8000-000000000001','authenticated','authenticated','market-owner@example.test','{}','{}'),
 ('25000000-0000-4000-8000-000000000002','authenticated','authenticated','market-other@example.test','{}','{}'),
 ('25000000-0000-4000-8000-000000000003','authenticated','authenticated','market-member@example.test','{}','{}');
insert into public.workspaces (id,name) values
 ('25000000-0000-4000-8000-000000000011','Marktplatz A'),
 ('25000000-0000-4000-8000-000000000012','Marktplatz B');
insert into public.workspace_members (workspace_id,user_id,role) values
 ('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','owner'),
 ('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000003','member'),
 ('25000000-0000-4000-8000-000000000012','25000000-0000-4000-8000-000000000002','owner');
insert into public.marketplace_connections (id,workspace_id,display_name) values
 ('25000000-0000-4000-8000-000000000021','25000000-0000-4000-8000-000000000011','Konto A'),
 ('25000000-0000-4000-8000-000000000022','25000000-0000-4000-8000-000000000011','Konto A2'),
 ('25000000-0000-4000-8000-000000000023','25000000-0000-4000-8000-000000000012','Fremdes Konto');

select throws_ok($$insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body) values('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000023','activity','foreign','{}')$$,'23503',null,'Fremdes Konto passt nicht in den Workspace');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at)
select '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000021','activity','event-'||n,
 jsonb_build_object('title','Ereignis '||n,'message','Test','occurredAt','2026-09-26T00:00:00Z'),
 '2026-09-26T00:00:00Z'::timestamptz + n * interval '1 second' from generate_series(1,61) n;
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body) values
 ('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000022','activity','other','{"title":"Anderes Konto"}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.marketplace_connections),2,'Inhaber sieht nur eigenen Workspace');
select is(jsonb_array_length(public.marketplace_list_connections('25000000-0000-4000-8000-000000000011')->'connections'),2,'Kontoliste ist vollständig');
select is(public.marketplace_create_connection('25000000-0000-4000-8000-000000000011','  Neues Konto  ')->>'displayName','Neues Konto','Kontoanlage normalisiert nur den Namen');
select is((select status from public.marketplace_connections where display_name='Neues Konto'),'needs_login','Vorbereitete Verbindung ist nicht angemeldet');
select throws_ok($$select public.marketplace_create_connection('25000000-0000-4000-8000-000000000012','Fremd')$$,'42501',null,'Anlage im fremden Workspace abgelehnt');
select throws_ok($$select public.marketplace_create_connection('25000000-0000-4000-8000-000000000011','   ')$$,'22023',null,'Leerer Name abgelehnt');
select lives_ok($$select public.marketplace_rename_connection('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000021','Mein Konto')$$,'Eigenes Konto umbenennen');
select throws_ok($$select public.marketplace_rename_connection('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000023','Fremd')$$,'42501',null,'Fremdes Konto nicht umbenennen');
select lives_ok($$select public.marketplace_set_paused('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000021',true)$$,'Pausieren');
select is((select status from public.marketplace_connections where id='25000000-0000-4000-8000-000000000021'),'paused','Pausenstatus gespeichert');
select lives_ok($$select public.marketplace_set_paused('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000021',false)$$,'Fortsetzen');
select is((select status from public.marketplace_connections where id='25000000-0000-4000-8000-000000000021'),'needs_login','Fortsetzen erfindet keine Anmeldung');

create temporary table page_one as select public.marketplace_read_page('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000021','activity',null,null) as value;
select is((select (value->>'total')::int from page_one),61,'Zähler zählt mehr als 50 Meldungen');
select is((select jsonb_array_length(value->'items') from page_one),50,'Erste Seite begrenzt');
select ok((select value->>'nextCursor' is not null from page_one),'Weitere Seite erreichbar');
select is(jsonb_array_length(public.marketplace_read_page('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000021','activity',(select value->>'nextCursor' from page_one),null)->'items'),11,'Zweite Seite ohne Verluste');
select throws_ok($$select public.marketplace_read_page('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000022','activity',(select value->>'nextCursor' from page_one),null)$$,'22023',null,'Cursor gehört fest zu einem Konto');
select throws_ok($$select public.marketplace_read_snapshot('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000023')$$,'42501',null,'Fremder Snapshot gesperrt');
select is((public.marketplace_read_snapshot('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000021')->'activity'->>'total')::int,61,'Snapshot enthält vollständigen Kontozähler');

select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.marketplace_connections),0,'Mitglied ohne Verwaltungsrecht sieht keine Konten');
select is((select count(*)::int from public.marketplace_account_entries),0,'Mitglied sieht auch keine privaten Nachrichten');
select throws_ok($$select public.marketplace_list_connections('25000000-0000-4000-8000-000000000011')$$,'42501',null,'RPC schützt genauso wie RLS');
reset role;
update public.workspaces set archived_at=now() where id='25000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.marketplace_create_connection('25000000-0000-4000-8000-000000000011','Archiviert')$$,'42501',null,'Archivierter Workspace schreibgeschützt');
select is((select count(*)::int from public.marketplace_connections),0,'Archivierung entzieht auch Lesezugriff');
reset role;
select * from finish();
rollback;
