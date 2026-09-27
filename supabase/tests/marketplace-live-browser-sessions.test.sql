\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
 ('25600000-0000-4000-8000-000000000001','authenticated','authenticated','browser-owner@example.test','{}','{}'),
 ('25600000-0000-4000-8000-000000000002','authenticated','authenticated','browser-other@example.test','{}','{}'),
 ('25600000-0000-4000-8000-000000000003','authenticated','authenticated','browser-admin@example.test','{}','{}');
insert into public.workspaces (id, name) values
 ('25600000-0000-4000-8000-000000000011','Browser A'),
 ('25600000-0000-4000-8000-000000000012','Browser B');
insert into public.workspace_members (workspace_id, user_id, role) values
 ('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000001','owner'),
 ('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000003','admin'),
 ('25600000-0000-4000-8000-000000000012','25600000-0000-4000-8000-000000000002','owner');
insert into public.marketplace_connections (id, workspace_id, display_name) values
 ('25600000-0000-4000-8000-000000000021','25600000-0000-4000-8000-000000000011','Browserkonto A1'),
 ('25600000-0000-4000-8000-000000000022','25600000-0000-4000-8000-000000000011','Browserkonto A2'),
 ('25600000-0000-4000-8000-000000000023','25600000-0000-4000-8000-000000000012','Browserkonto B');
insert into public.marketplace_browser_profiles (workspace_id, connection_id, provider_profile_id) values
 ('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000021','test-profile-a1'),
 ('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000022','test-profile-a2'),
 ('25600000-0000-4000-8000-000000000012','25600000-0000-4000-8000-000000000023','test-profile-b');

select has_table('public', 'marketplace_browser_profiles', 'Profilzuordnung liegt serverseitig');
select has_table('public', 'marketplace_browser_sessions', 'Dauerhafte Browsersperre liegt serverseitig');
select ok(not has_table_privilege('authenticated', 'public.marketplace_browser_profiles', 'select'), 'Profil-IDs sind nicht direkt lesbar');
select ok(not has_table_privilege('authenticated', 'public.marketplace_browser_sessions', 'select'), 'Sitzungen sind nicht direkt lesbar');
select ok(not has_table_privilege('authenticated', 'public.marketplace_browser_sessions', 'insert'), 'Client kann keine Sperre direkt anlegen');
select ok(not has_table_privilege('authenticated', 'public.marketplace_browser_sessions', 'update'), 'Client kann Sperre nicht direkt freigeben');
select ok(not has_table_privilege('authenticated', 'public.marketplace_browser_sessions', 'delete'), 'Client kann Sperre nicht direkt löschen');
select ok(not has_function_privilege('anon', 'public.marketplace_browser_session_reserve(uuid, uuid)', 'execute'), 'Anonyme Nutzer können keine Sitzung reservieren');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table browser_a as select public.marketplace_browser_session_reserve(
 '25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000021') as value;
select is((select value->>'state' from browser_a), 'active', 'Eigene Browsersitzung beginnt aktiv');
select ok((select value ? 'id' and value ? 'expiresAt' from browser_a), 'Öffentliche Sitzungsdaten vorhanden');
select ok((select not value ? 'providerProfileId' and not value ? 'providerUrl' and not value ? 'token' from browser_a), 'Keine Anbieterzugänge in der Antwort');
select throws_ok($$select public.marketplace_browser_session_reserve('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000021')$$, '55P03', null, 'Zweite Bedienung desselben Kontos gesperrt');
create temporary table browser_a2 as select public.marketplace_browser_session_reserve(
 '25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000022') as value;
select isnt((select value->>'id' from browser_a), (select value->>'id' from browser_a2), 'Zweites Konto bleibt unabhängig');
select is((public.marketplace_browser_session_revoke('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000022',(select value->>'id' from browser_a2)::uuid)->>'state'), 'stopping', 'Widerruf merkt Anbieter-Stopp vor');
select throws_ok($$select public.marketplace_browser_session_reserve('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000022')$$, '55P03', null, 'Widerruf gibt Konto vor Anbieter-Stopp nicht frei');
select throws_ok($$select public.marketplace_browser_session_reserve('25600000-0000-4000-8000-000000000012','25600000-0000-4000-8000-000000000023')$$, '42501', null, 'Fremder Workspace gesperrt');
select is((public.marketplace_browser_session_check('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000021',(select value->>'id' from browser_a)::uuid)->>'active')::boolean, true, 'Eigene aktive Sitzung akzeptiert');
select throws_ok($$select public.marketplace_browser_session_check('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000022',(select value->>'id' from browser_a)::uuid)$$, '42501', null, 'Sitzung kann nicht zu anderem Konto wechseln');

select set_config('request.jwt.claims','{"sub":"25600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(public.marketplace_can_manage('25600000-0000-4000-8000-000000000011'), 'Zweiter Admin darf Workspace verwalten');
select throws_ok($$select public.marketplace_browser_session_check('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000021',(select value->>'id' from browser_a)::uuid)$$, '42501', null, 'Zweiter Admin darf fremde Browsersitzung nicht lesen');

select set_config('request.jwt.claims','{"sub":"25600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.marketplace_browser_session_check('25600000-0000-4000-8000-000000000011','25600000-0000-4000-8000-000000000021',(select value->>'id' from browser_a)::uuid)$$, '42501', null, 'Anderer Workspace sieht Sitzung nicht');
create temporary table browser_b as select public.marketplace_browser_session_reserve(
 '25600000-0000-4000-8000-000000000012','25600000-0000-4000-8000-000000000023') as value;
select is((select value->>'state' from browser_b), 'active', 'Anderer Workspace bleibt unabhängig');

reset role;
update public.marketplace_browser_sessions set expires_at = clock_timestamp() - interval '1 second'
 where public_id = (select (value->>'id')::uuid from browser_b);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.marketplace_browser_session_check('25600000-0000-4000-8000-000000000012','25600000-0000-4000-8000-000000000023',(select value->>'id' from browser_b)::uuid)->>'active')::boolean, false, 'Ablauf sperrt Aktionen');
select throws_ok($$select public.marketplace_browser_session_reserve('25600000-0000-4000-8000-000000000012','25600000-0000-4000-8000-000000000023')$$, '55P03', null, 'Ablauf gibt Konto vor Anbieter-Stopp nicht frei');
reset role;
select is((select state from public.marketplace_browser_sessions where public_id = (select (value->>'id')::uuid from browser_b)), 'stopping', 'Ablauf verlangt Anbieter-Stopp');
update public.marketplace_browser_sessions set state = 'closed', provider_stopped_at = clock_timestamp()
 where public_id = (select (value->>'id')::uuid from browser_b);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
create temporary table browser_b2 as select public.marketplace_browser_session_reserve(
 '25600000-0000-4000-8000-000000000012','25600000-0000-4000-8000-000000000023') as value;
select is((select value->>'state' from browser_b2), 'active', 'Neustart erst nach bestätigtem Anbieter-Stopp');
select lives_ok($$select public.marketplace_set_paused('25600000-0000-4000-8000-000000000012','25600000-0000-4000-8000-000000000023',true)$$, 'Verbindung pausieren');
select is((public.marketplace_browser_session_check('25600000-0000-4000-8000-000000000012','25600000-0000-4000-8000-000000000023',(select value->>'id' from browser_b2)::uuid)->>'active')::boolean, false, 'Pause sperrt Aktionen');
reset role;
select throws_ok($$delete from public.marketplace_connections where id = '25600000-0000-4000-8000-000000000021'$$, '23503', null, 'Konto mit ungeklärter Browsersitzung kann nicht gelöscht werden');
select lives_ok($$delete from auth.users where id = '25600000-0000-4000-8000-000000000001'$$, 'Bediener kann gelöscht werden');
select is((select count(*)::integer from public.marketplace_browser_sessions where public_id = (select (value->>'id')::uuid from browser_a)), 1, 'Benutzerlöschung entfernt ungeklärte Browsersperre nicht');
select is((select state from public.marketplace_browser_sessions where public_id = (select (value->>'id')::uuid from browser_b2)), 'stopping', 'Pause verlangt Anbieter-Stopp');

select * from finish();
rollback;
