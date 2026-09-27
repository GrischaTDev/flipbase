\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
 ('25500000-0000-4000-8000-000000000001','authenticated','authenticated','session-owner@example.test','{}','{}'),
 ('25500000-0000-4000-8000-000000000002','authenticated','authenticated','session-other@example.test','{}','{}'),
 ('25500000-0000-4000-8000-000000000003','authenticated','authenticated','session-same-workspace@example.test','{}','{}');
insert into public.workspaces (id, name) values
 ('25500000-0000-4000-8000-000000000011','Sitzung A'),
 ('25500000-0000-4000-8000-000000000012','Sitzung B');
insert into public.workspace_members (workspace_id, user_id, role) values
 ('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000001','owner'),
 ('25500000-0000-4000-8000-000000000012','25500000-0000-4000-8000-000000000002','owner'),
 ('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000003','admin');
insert into public.marketplace_connections (id, workspace_id, display_name) values
 ('25500000-0000-4000-8000-000000000021','25500000-0000-4000-8000-000000000011','Konto A1'),
 ('25500000-0000-4000-8000-000000000022','25500000-0000-4000-8000-000000000011','Konto A2'),
 ('25500000-0000-4000-8000-000000000023','25500000-0000-4000-8000-000000000012','Konto B');

select has_table('public', 'marketplace_browser_test_sessions', 'Sitzungssperren liegen serverseitig');
select ok(not has_table_privilege('authenticated', 'public.marketplace_browser_test_sessions', 'insert'), 'Client kann Sitzungen nicht direkt anlegen');
select ok(not has_table_privilege('authenticated', 'public.marketplace_browser_test_sessions', 'update'), 'Client kann Frist und Zustand nicht direkt ändern');
select ok(not has_function_privilege('authenticated', 'public.marketplace_revoke_browser_tests_on_pause()', 'execute'), 'Triggerfunktion ist nicht direkt ausführbar');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table session_a as select public.marketplace_test_session_start(
 '25500000-0000-4000-8000-000000000011', '25500000-0000-4000-8000-000000000021') as value;
select is((select value->>'state' from session_a), 'active', 'Eigene Testsitzung beginnt aktiv');
select is((select value->>'workspaceId' from session_a), '25500000-0000-4000-8000-000000000011', 'Workspace ist fest gebunden');
select is((select value->>'connectionId' from session_a), '25500000-0000-4000-8000-000000000021', 'Konto ist fest gebunden');
select ok((select value ? 'expiresAt' from session_a), 'Frist wird zurückgegeben');
select ok((select not value ? 'providerUrl' and not value ? 'token' from session_a), 'Keine Browserzugänge im Ergebnis');
select throws_ok($$select public.marketplace_test_session_start('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000021')$$, '55P03', null, 'Zweite Bedienung desselben Kontos abgelehnt');
create temporary table session_a2 as select public.marketplace_test_session_start(
 '25500000-0000-4000-8000-000000000011', '25500000-0000-4000-8000-000000000022') as value;
select isnt((select value->>'id' from session_a), (select value->>'id' from session_a2), 'Zweites Konto hat eigene Sitzung');
select throws_ok($$select public.marketplace_test_session_start('25500000-0000-4000-8000-000000000012','25500000-0000-4000-8000-000000000023')$$, '42501', null, 'Fremder Workspace verweigert');
select throws_ok($$select public.marketplace_test_session_status('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000022',(select value->>'id' from session_a)::uuid)$$, '42501', null, 'Sitzung darf nicht in anderes Konto umgehängt werden');
select is((public.marketplace_test_session_action('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000021',(select value->>'id' from session_a)::uuid,'ping')->>'accepted')::boolean, true, 'Eigene Interaktion erlaubt');

select set_config('request.jwt.claims','{"sub":"25500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(public.marketplace_can_manage('25500000-0000-4000-8000-000000000011'), 'Zweiter Admin darf dasselbe Workspace-Konto verwalten');
select is((select count(*)::integer from public.marketplace_browser_test_sessions where workspace_id = '25500000-0000-4000-8000-000000000011'), 0, 'Zweiter Admin sieht fremde Testsitzung nicht direkt');
select throws_ok($$select public.marketplace_test_session_status('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000021',(select value->>'id' from session_a)::uuid)$$, '42501', null, 'Zweiter Admin liest fremde Testsitzung nicht');
select throws_ok($$select public.marketplace_test_session_action('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000021',(select value->>'id' from session_a)::uuid,'revoke')$$, '42501', null, 'Zweiter Admin widerruft fremde Testsitzung nicht');

select set_config('request.jwt.claims','{"sub":"25500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.marketplace_test_session_status('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000021',(select value->>'id' from session_a)::uuid)$$, '42501', null, 'Fremder Benutzer liest keine Sitzung');
select throws_ok($$select public.marketplace_test_session_action('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000021',(select value->>'id' from session_a)::uuid,'revoke')$$, '42501', null, 'Fremder Benutzer widerruft nicht');
create temporary table session_b as select public.marketplace_test_session_start(
 '25500000-0000-4000-8000-000000000012', '25500000-0000-4000-8000-000000000023') as value;
select is((select value->>'state' from session_b), 'active', 'Anderer Workspace bleibt unabhängig');

select set_config('request.jwt.claims','{"sub":"25500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.marketplace_test_session_action('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000021',(select value->>'id' from session_a)::uuid,'interrupt')->>'state'), 'interrupted', 'Browserabbruch sperrt Sitzung');
select is((public.marketplace_test_session_action('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000021',(select value->>'id' from session_a)::uuid,'ping')->>'accepted')::boolean, false, 'Nach Abbruch keine Interaktion');
select is((public.marketplace_test_session_action('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000022',(select value->>'id' from session_a2)::uuid,'revoke')->>'state'), 'revoked', 'Widerruf beendet eigene Sitzung');
select is((public.marketplace_test_session_action('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000022',(select value->>'id' from session_a2)::uuid,'ping')->>'accepted')::boolean, false, 'Widerruf ist wirksam');
select throws_ok($$select public.marketplace_test_session_action('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000022',(select value->>'id' from session_a2)::uuid,'navigate')$$, '22023', null, 'Nur künstliche Testaktionen erlaubt');

reset role;
update public.marketplace_browser_test_sessions set expires_at = clock_timestamp() - interval '1 second'
 where id = (select (value->>'id')::uuid from session_b);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.marketplace_test_session_status('25500000-0000-4000-8000-000000000012','25500000-0000-4000-8000-000000000023',(select value->>'id' from session_b)::uuid)->>'state'), 'expired', 'Abgelaufener Zugriff erscheint abgelaufen');
select is((public.marketplace_test_session_action('25500000-0000-4000-8000-000000000012','25500000-0000-4000-8000-000000000023',(select value->>'id' from session_b)::uuid,'ping')->>'accepted')::boolean, false, 'Abgelaufene Sitzung nimmt keine Aktion an');
create temporary table session_b2 as select public.marketplace_test_session_start(
 '25500000-0000-4000-8000-000000000012','25500000-0000-4000-8000-000000000023') as value;
select is((select value->>'state' from session_b2), 'active', 'Neuer Start nach Fristablauf möglich');
select lives_ok($$select public.marketplace_set_paused('25500000-0000-4000-8000-000000000012','25500000-0000-4000-8000-000000000023',true)$$, 'Verbindung pausieren');
select is((public.marketplace_test_session_status('25500000-0000-4000-8000-000000000012','25500000-0000-4000-8000-000000000023',(select value->>'id' from session_b2)::uuid)->>'state'), 'revoked', 'Pausieren widerruft laufende Sitzung');
select throws_ok($$select public.marketplace_test_session_start('25500000-0000-4000-8000-000000000012','25500000-0000-4000-8000-000000000023')$$, '22023', null, 'Pausiertes Konto startet nicht');

select * from finish();
rollback;
