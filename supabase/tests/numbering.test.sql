\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select has_table('public','number_series','Nummernkreise sind gespeichert');
select ok((select relrowsecurity from pg_class where oid='public.number_series'::regclass),'RLS ist aktiv');
select ok(not has_table_privilege('authenticated','public.number_series','update'),'Keine direkten Formatänderungen');
select ok(not has_table_privilege('authenticated','public.number_series_counters','select,insert,update,delete'),'Zähler bleiben intern');
select ok(not has_table_privilege('authenticated','public.number_assignments','insert,update,delete'),'Vergaben bleiben unveränderlich');
select ok(not has_function_privilege('anon','public.save_number_series(uuid,text,jsonb,integer)','execute'),'Anonyme dürfen keine Formate ändern');
select ok(not has_function_privilege('authenticated','public.assign_record_number()','execute'),'Vergabe ist kein öffentlicher RPC');
select is(public.format_record_number('B',' ',2026,2,100),'B 2026 100','Mindestbreite schneidet keine Ziffern ab');
select is(public.format_record_number('','-',null,2,1),'01','Ohne Jahr oder Präfix keine überzähligen Trennzeichen');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('11000000-0000-4000-8000-000000000001','authenticated','authenticated','number-owner@example.test','{}','{}'),
('11000000-0000-4000-8000-000000000002','authenticated','authenticated','number-member@example.test','{}','{}');
insert into public.workspaces(id,name) values
('11000000-0000-4000-8000-000000000010','Nummern'),
('11000000-0000-4000-8000-000000000011','Andere Nummern');
insert into public.workspace_members(workspace_id,user_id,role) values
('11000000-0000-4000-8000-000000000010','11000000-0000-4000-8000-000000000001','owner'),
('11000000-0000-4000-8000-000000000010','11000000-0000-4000-8000-000000000002','member');

insert into public.purchases(id,workspace_id,type,title,purchase_date) values
('11000000-0000-4000-8000-000000000020','11000000-0000-4000-8000-000000000010','single','Erster Einkauf','2020-01-01'),
('11000000-0000-4000-8000-000000000021','11000000-0000-4000-8000-000000000010','single','Zweiter Einkauf','2026-01-01'),
('11000000-0000-4000-8000-000000000022','11000000-0000-4000-8000-000000000011','single','Anderer Workspace','2026-01-01');
insert into public.sales(id,workspace_id,platform,sale_price) values
('11000000-0000-4000-8000-000000000030','11000000-0000-4000-8000-000000000010','ebay',10);
select is((select right(record_number,2) from public.purchases where id='11000000-0000-4000-8000-000000000020'),'01','Erster Einkauf beginnt mit 01');
select is((select right(record_number,2) from public.purchases where id='11000000-0000-4000-8000-000000000021'),'02','Zweiter Einkauf folgt fortlaufend');
select is((select right(record_number,2) from public.purchases where id='11000000-0000-4000-8000-000000000022'),'01','Workspaces zählen unabhängig');
select is((select right(record_number,2) from public.sales where id='11000000-0000-4000-8000-000000000030'),'01','Verkäufe zählen unabhängig');
select is((select split_part(record_number,' ',2) from public.purchases where id='11000000-0000-4000-8000-000000000020'),extract(year from statement_timestamp() at time zone 'Europe/Berlin')::text,'Rückdatierter Kauf beeinflusst Vergabejahr nicht');

-- Wiederholung derselben INSERT-Kennung darf keine weitere Nummer verbrauchen.
insert into public.purchases(id,workspace_id,type,title) values
('11000000-0000-4000-8000-000000000020','11000000-0000-4000-8000-000000000010','single','Wiederholung') on conflict(id) do nothing;
select is((select count(*)::int from public.number_assignments where workspace_id='11000000-0000-4000-8000-000000000010' and entity_type='purchase'),2,'Wiederholung erzeugt keine weitere Vergabe');

create function pg_temp.save_format(p_prefix text default 'NEU',p_year boolean default true,p_reset boolean default false,p_version integer default 1) returns void language sql as $$
  select public.save_number_series('11000000-0000-4000-8000-000000000010','purchase',jsonb_build_object('label','Einkäufe','prefix',p_prefix,'separator',' ','include_year',p_year,'minimum_digits',2,'start_value',1,'reset_yearly',p_reset,'timezone','Europe/Berlin'),p_version);
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select throws_ok('select pg_temp.save_format()','42501','Nur Workspace-Administratoren dürfen Nummernkreise ändern.','Mitglieder dürfen keine Regeln ändern');
select is(public.get_number_settings('11000000-0000-4000-8000-000000000010')->>'can_edit','false','Mitglieder sehen Regeln schreibgeschützt');
select throws_ok($$select public.get_number_settings('11000000-0000-4000-8000-000000000011')$$,'42501','Kein Zugriff auf diesen Workspace.','Fremde Einstellungen bleiben unsichtbar');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select lives_ok('select pg_temp.save_format()','Inhaber ändern zukünftiges Format');
select throws_ok('select pg_temp.save_format()','40001','Der Nummernkreis wurde inzwischen geändert. Bitte neu laden.','Veraltete Version überschreibt keine fremde Änderung');
reset role;
insert into public.purchases(id,workspace_id,type,title) values
('11000000-0000-4000-8000-000000000023','11000000-0000-4000-8000-000000000010','single','Neues Format');
select is((select right(record_number,2) from public.purchases where id='11000000-0000-4000-8000-000000000023'),'03','Präfixwechsel setzt Zähler nicht zurück');
select is((select left(record_number,3) from public.purchases where id='11000000-0000-4000-8000-000000000023'),'NEU','Neues Format wird vergeben');
select is((select left(record_number,1) from public.purchases where id='11000000-0000-4000-8000-000000000020'),'B','Historische Nummer bleibt erhalten');
select is((select count(*)::int from public.number_series_changes where workspace_id='11000000-0000-4000-8000-000000000010'),1,'Formatänderung wird genau einmal protokolliert');
select * from finish();
rollback;
