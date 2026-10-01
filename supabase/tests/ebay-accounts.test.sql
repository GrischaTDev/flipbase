\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public','ebay_connections','Persönliche Verbindungen existieren');
select ok((select relrowsecurity from pg_class where oid='public.ebay_connections'::regclass),'Verbindungen haben RLS');
select ok((select relrowsecurity from pg_class where oid='public.ebay_credentials'::regclass),'Tokens haben RLS');
select ok((select relrowsecurity from pg_class where oid='public.ebay_authorization_states'::regclass),'OAuth-Zustände haben RLS');
select ok(not has_table_privilege('anon','public.ebay_connections','select'),'Keine anonymen Konten');
select ok(not has_table_privilege('authenticated','public.ebay_credentials','select'),'Kein Tokenzugriff für Nutzer');
select ok(not has_table_privilege('authenticated','public.ebay_authorization_states','select'),'Keine OAuth-Hashes im Browser');
select ok(not has_table_privilege('authenticated','public.ebay_connections','update'),'Nutzer können keinen Verbindungsstatus erfinden');
select ok(not has_function_privilege('authenticated','public.ebay_claim_connection(uuid,uuid,uuid,uuid)','execute'),'Token-Sperre nur für Dienst');
select ok(not has_function_privilege('authenticated','public.ebay_complete_authorization(uuid,bigint,text,text,text)','execute'),'Anmeldung nur durch Callback bestätigbar');
select ok(not has_function_privilege('anon','public.ebay_disconnect(uuid,uuid)','execute'),'Keine anonyme Trennung');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('32000000-0000-4000-8000-000000000001','authenticated','authenticated','ebay-one@example.test','{}','{}'),
 ('32000000-0000-4000-8000-000000000002','authenticated','authenticated','ebay-two@example.test','{}','{}'),
 ('32000000-0000-4000-8000-000000000003','authenticated','authenticated','ebay-other@example.test','{}','{}');
insert into public.workspaces(id,name) values
 ('32000000-0000-4000-8000-000000000011','eBay Workspace A'),
 ('32000000-0000-4000-8000-000000000012','eBay Workspace B');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','member'),
 ('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000002','owner'),
 ('32000000-0000-4000-8000-000000000012','32000000-0000-4000-8000-000000000003','owner');
insert into public.ebay_connections(id,workspace_id,user_id,environment) values
 ('32000000-0000-4000-8000-000000000021','32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','production'),
 ('32000000-0000-4000-8000-000000000022','32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000002','production'),
 ('32000000-0000-4000-8000-000000000023','32000000-0000-4000-8000-000000000012','32000000-0000-4000-8000-000000000003','production');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(public.ebay_can_connect('32000000-0000-4000-8000-000000000011'),'Normales Mitglied braucht keine Betreiberrechte');
select ok(not public.ebay_can_connect('32000000-0000-4000-8000-000000000012'),'Fremder Workspace gesperrt');
select is((select count(*)::int from public.ebay_connections),1,'Nur eigenes Konto sichtbar, auch gegenüber Workspace-Inhaber');
select throws_ok($$select public.ebay_disconnect('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000022')$$,'42501',null,'Anderes Nutzerkonto nicht trennbar');
reset role;
set local role service_role;

select public.ebay_begin_authorization('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','production',repeat('a',64));
select is(public.ebay_consume_authorization(repeat('a',64))->>'id','32000000-0000-4000-8000-000000000021','Callback findet gebundene Verbindung');
select is(public.ebay_consume_authorization(repeat('a',64)),null::jsonb,'OAuth-Zustand genau einmal verwendbar');
select ok(public.ebay_complete_authorization('32000000-0000-4000-8000-000000000021',1,'seller-one','Nutzer A','v1.ciphertext'),'Aktuelle Freigabe bestätigt');
select is((select status from public.ebay_connections where id='32000000-0000-4000-8000-000000000021'),'connected','Echter Verbindungsstatus');
select is(public.ebay_claim_connection('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000021','32000000-0000-4000-8000-000000000031'),null::jsonb,'Workspace-Inhaber erhält keine fremden Tokens');
select is(public.ebay_claim_connection('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000021','32000000-0000-4000-8000-000000000031')->>'encryptedTokens','v1.ciphertext','Dienst sperrt eigene Verbindung');
select is(public.ebay_claim_connection('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000021','32000000-0000-4000-8000-000000000032'),null::jsonb,'Zweiter Refresh wartet statt Tokens zu überschreiben');
select ok(not public.ebay_finish_read('32000000-0000-4000-8000-000000000021','32000000-0000-4000-8000-000000000032',1,'foreign-token',false,true),'Falsche Sperre darf nicht abschließen');
select ok(public.ebay_finish_read('32000000-0000-4000-8000-000000000021','32000000-0000-4000-8000-000000000031',1,'refreshed-token',false,true),'Sperrinhaber speichert erneuerte Tokens');
select is((select encrypted_tokens from public.ebay_credentials where id='32000000-0000-4000-8000-000000000021'),'refreshed-token','Tokenaktualisierung bestätigt');
select isnt((select last_read_at from public.ebay_connections where id='32000000-0000-4000-8000-000000000021'),null::timestamptz,'Erfolgreicher Abruf vermerkt');

select public.ebay_begin_authorization('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','production',repeat('b',64));
select ok(not public.ebay_complete_authorization('32000000-0000-4000-8000-000000000021',1,'old-account','Alt','old-token'),'Überholter Callback kann kein altes Konto speichern');
update public.ebay_authorization_states set expires_at = now() - interval '1 minute' where state_hash=repeat('b',64);
select is(public.ebay_consume_authorization(repeat('b',64)),null::jsonb,'Abgelaufener Zustand gesperrt');
select public.ebay_begin_authorization('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','production',repeat('c',64));
select public.ebay_consume_authorization(repeat('c',64));
select ok(public.ebay_complete_authorization('32000000-0000-4000-8000-000000000021',3,'seller-one','Nutzer A','active-token'),'Erneute Freigabe bestätigt');
select public.ebay_claim_connection('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000021','32000000-0000-4000-8000-000000000031');
set local role authenticated;
select ok(public.ebay_disconnect('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000021'),'Eigenes Konto trennen');
reset role;
set local role service_role;
select is((select count(*)::int from public.ebay_credentials where id='32000000-0000-4000-8000-000000000021'),0,'Trennen entfernt Tokens');
select is((select count(*)::int from public.ebay_authorization_states where connection_id='32000000-0000-4000-8000-000000000021'),0,'Trennen entfernt offene Logins');
select ok(not public.ebay_finish_read('32000000-0000-4000-8000-000000000021','32000000-0000-4000-8000-000000000031',3,'late-token',false,true),'Verspäteter Abruf belebt getrenntes Konto nicht wieder');
select ok(not public.ebay_complete_authorization('32000000-0000-4000-8000-000000000021',3,'seller-one','Alt','late-token'),'Verspäteter Callback belebt getrenntes Konto nicht wieder');

select public.ebay_begin_authorization('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','production',repeat('d',64));
delete from public.workspace_members where workspace_id='32000000-0000-4000-8000-000000000011' and user_id='32000000-0000-4000-8000-000000000001';
select is(public.ebay_consume_authorization(repeat('d',64)),null::jsonb,'Entferntes Mitglied kann Callback nicht verwenden');
insert into public.workspace_members(workspace_id,user_id,role) values ('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','member');
select public.ebay_begin_authorization('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000001','production',repeat('e',64));
select public.ebay_consume_authorization(repeat('e',64));
select public.ebay_complete_authorization('32000000-0000-4000-8000-000000000021',6,'seller-one','Nutzer A','delete-token');
select public.ebay_delete_account('sandbox','seller-one');
select is((select count(*)::int from public.ebay_connections where id='32000000-0000-4000-8000-000000000021'),1,'Sandbox-Meldung löscht kein Production-Konto');
select public.ebay_delete_account('production','seller-one');
select is((select count(*)::int from public.ebay_connections where id='32000000-0000-4000-8000-000000000021'),0,'Signierte Kontolöschung entfernt persönliche Verbindung');
select is((select count(*)::int from public.ebay_credentials where id='32000000-0000-4000-8000-000000000021'),0,'Kontolöschung entfernt auch Tokens');
select is((select count(*)::int from public.ebay_connections where workspace_id in ('32000000-0000-4000-8000-000000000011','32000000-0000-4000-8000-000000000012')),2,'Andere Konten bleiben erhalten');

select * from finish();
rollback;
