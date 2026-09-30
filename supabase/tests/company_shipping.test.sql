\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_column('public', 'carrier_configs', 'use_company_address', 'Versand speichert die ausdrückliche Anschrift-Auswahl');
select col_is_null('public', 'carrier_configs', 'use_company_address', 'Bestehende Konfigurationen bleiben kompatibel über null');

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('c3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'shipping-company@example.test', 'unused', '{}', '{}', now(), now());
insert into public.workspaces(id, name) values
  ('c3000000-0000-4000-8000-000000000011', 'Versand'),
  ('c3000000-0000-4000-8000-000000000012', 'Fremder Versand');
insert into public.workspace_members(workspace_id, user_id, role)
values ('c3000000-0000-4000-8000-000000000011', 'c3000000-0000-4000-8000-000000000001', 'owner');
insert into public.carrier_configs(workspace_id, sender_name, sender_street, sender_house_number, sender_postal_code, sender_city, sender_country)
values ('c3000000-0000-4000-8000-000000000011', 'Lager-Inhaber', 'Lagerweg', '8', '54321', 'Köln', 'DE');
insert into public.carrier_configs(workspace_id) values ('c3000000-0000-4000-8000-000000000012');

select is((select use_company_address from public.carrier_configs where workspace_id = 'c3000000-0000-4000-8000-000000000011'), null::boolean, 'Alter vollständiger Override bleibt uneingeschränkt gespeichert');
select set_config('request.jwt.claims', '{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.carrier_configs where workspace_id = 'c3000000-0000-4000-8000-000000000012'), 0::bigint, 'Fremde Versandkonfiguration ist nicht lesbar');
select lives_ok($$update public.carrier_configs set use_company_address = true where workspace_id = 'c3000000-0000-4000-8000-000000000011'$$, 'Mitglied darf die zentrale Anschrift wählen');
select is((select use_company_address from public.carrier_configs where workspace_id = 'c3000000-0000-4000-8000-000000000011'), true, 'Zentrale Auswahl ist bestätigt');
select is((select sender_street from public.carrier_configs where workspace_id = 'c3000000-0000-4000-8000-000000000011'), 'Lagerweg', 'Zentrale Auswahl überschreibt die alte Straße nicht');
select lives_ok($$update public.carrier_configs set use_company_address = false where workspace_id = 'c3000000-0000-4000-8000-000000000011'$$, 'Individueller Absender kann wieder gewählt werden');
select is((select sender_name from public.carrier_configs where workspace_id = 'c3000000-0000-4000-8000-000000000011'), 'Lager-Inhaber', 'Individueller Absender bleibt beim Zurückschalten unverändert');
select throws_ok($$update public.carrier_configs set workspace_id = 'c3000000-0000-4000-8000-000000000012' where workspace_id = 'c3000000-0000-4000-8000-000000000011'$$, '42501', null, 'Konfiguration kann nicht in fremden Workspace verschoben werden');
reset role;
select * from finish();
rollback;
