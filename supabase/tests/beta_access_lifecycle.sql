\set ON_ERROR_STOP on
begin;
select plan(36);

insert into auth.users(id,email) values ('b2000000-0000-4000-8000-000000000001','beta-operator@example.test');
insert into public.platform_operators(user_id) values ('b2000000-0000-4000-8000-000000000001');
insert into public.beta_applications(id,first_name,last_name,email,status,granted_days)
values ('b1000000-0000-4000-8000-000000000001','Beta','Lifecycle','beta-access@example.test','accepted',60),
  ('b1000000-0000-4000-8000-000000000002','Beta','Withdrawal','beta-withdraw@example.test','accepted',60);
insert into auth.users(id,email,raw_user_meta_data) values
  ('b2000000-0000-4000-8000-000000000002','beta-access@example.test','{"beta_application_id":"b1000000-0000-4000-8000-000000000001"}'),
  ('b2000000-0000-4000-8000-000000000003','beta-withdraw@example.test','{"beta_application_id":"b1000000-0000-4000-8000-000000000002"}');

select public.prepare_beta_invitation('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001',repeat('b',64));
select public.complete_beta_invitation('b3000000-0000-4000-8000-000000000001',
  (select lease_id from public.beta_lifecycle_operations where request_id='b3000000-0000-4000-8000-000000000001'),true,null);
select public.begin_beta_registration(repeat('b',64),'b3000000-0000-4000-8000-000000000002');
select throws_ok($$select public.prepare_beta_withdrawal('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000003')$$,
  '55P03','Beta-Vorgang wird bereits verarbeitet','Registrierung und Löschung können nicht gleichzeitig gewinnen');
update auth.users set encrypted_password='confirmed-password',email_confirmed_at=now() where id='b2000000-0000-4000-8000-000000000002';
update public.beta_registration_links set expires_at=now() where token_hash=repeat('b',64);
select throws_ok($$select public.complete_beta_registration('b3000000-0000-4000-8000-000000000002',
  (select lease_id from public.beta_lifecycle_operations where request_id='b3000000-0000-4000-8000-000000000002'))$$,
  '22023','Registrierungslink ist ungültig oder abgelaufen','Fristablauf nach Passwortvergabe verhindert die Aktivierung');
select is((select status from public.workspace_licenses where beta_application_id='b1000000-0000-4000-8000-000000000001'),'pending','Fehlgeschlagener Abschluss startet keine Beta');
select public.fail_beta_lifecycle_operation('b3000000-0000-4000-8000-000000000002',
  (select lease_id from public.beta_lifecycle_operations where request_id='b3000000-0000-4000-8000-000000000002'));
update public.beta_registration_links set expires_at=now()+interval '7 days' where token_hash=repeat('b',64);
select public.begin_beta_registration(repeat('b',64),'b3000000-0000-4000-8000-000000000004');
set local role service_role;
select lives_ok($$select public.complete_beta_registration('b3000000-0000-4000-8000-000000000004',
  (select lease_id from public.beta_lifecycle_operations where request_id='b3000000-0000-4000-8000-000000000004'))$$,'Bestätigter Abschluss aktiviert die Beta auch mit echten Dienstrechten');
reset role;
select ok((select ends_at=starts_at+interval '60 days' from public.workspace_licenses where beta_application_id='b1000000-0000-4000-8000-000000000001'),'Die Laufzeit startet beim Passwortabschluss');
select throws_ok($$select public.inspect_beta_registration(repeat('b',64))$$,'22023','Registrierungslink ist ungültig oder abgelaufen','Verbrauchte Links erzeugen keinen weiteren Zugang');
select throws_ok($$select public.prepare_beta_withdrawal('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000005')$$,
  '22023','Nur ausstehende Registrierungen können zurückgezogen werden','Registrierte Konten sind vor der Rücknahme geschützt');

select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.create_workspace('Unbegrenzter Zugang')$$,'42501','Während der Beta kannst Du keinen weiteren Workspace erstellen','Aktive Beta kann keinen lizenzlosen Workspace erzeugen');
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.change_beta_duration('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000006','extend',30)$$,'Betreiber verlängert die Beta');
select ok((select ends_at=starts_at+interval '90 days' from public.workspace_licenses where beta_application_id='b1000000-0000-4000-8000-000000000001'),'Aktive Verlängerung beginnt am bisherigen Ende');
select public.change_beta_duration('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000006','extend',30);
select ok((select ends_at=starts_at+interval '90 days' from public.workspace_licenses where beta_application_id='b1000000-0000-4000-8000-000000000001'),'Wiederholung verlängert nicht doppelt');
select throws_ok($$select public.change_beta_duration('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000006','extend',31)$$,
  '22023','Vorgangskennung bereits verwendet','Eine Kennung kann nicht mit anderen Tagen wiederverwendet werden');
select lives_ok($$select public.change_beta_duration('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000007','end',0)$$,'Beta lässt sich sofort beenden');
select ok((select ended_at=now() and ends_at=now() from public.workspace_licenses where beta_application_id='b1000000-0000-4000-8000-000000000001'),'Beenden gilt ab Serverzeitpunkt');
select is((select count(*) from auth.users where id='b2000000-0000-4000-8000-000000000002'),1::bigint,'Beenden erhält das Auth-Konto');

select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select access_status from public.list_my_workspace_access()),'ended','Zugangsauskunft bleibt nach Beta-Ende erreichbar');
select is((select count(*) from public.sources),0::bigint,'Geschäftsdaten sind mit bestehendem JWT nicht mehr lesbar');
select is((select count(*) from public.profiles),1::bigint,'Eigenes Profil bleibt lesbar');
select is((select count(*) from public.workspace_licenses),1::bigint,'Eigene Lizenz bleibt lesbar');
select ok(public.is_workspace_member((select workspace_id from public.workspace_members limit 1)),'Mitgliedschaft bleibt bestehen');
select throws_ok($$select public.create_workspace('Umgehung')$$,'42501','Dein Beta-Zugang ist abgelaufen oder noch nicht registriert','Neuer Workspace umgeht die abgelaufene Beta nicht');
select throws_ok($$select public.change_beta_duration('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000008','extend',30)$$,
  '42501','Nur für Betreiber','Normale Nutzer können ihren Zugang nicht verlängern');
select throws_ok($$select public.export_audit_snapshot((select workspace_id from public.workspace_members limit 1))$$,'42501','Beta-Zugang ist abgelaufen oder gesperrt','Export umgeht die abgelaufene Beta nicht');
reset role;
select ok(not has_function_privilege('authenticated','public.workspace_has_business_data(uuid)','execute'),'Private Bestandsprüfung bleibt intern');
select ok(not has_table_privilege('authenticated','public.beta_lifecycle_operations','select'),'Interne Vorgänge bleiben für Browser gesperrt');
select throws_ok($$insert into public.catalog_products(workspace_id,title) select workspace_id,'Dienstimport' from public.workspace_licenses where beta_application_id='b1000000-0000-4000-8000-000000000001'$$,
  '42501','Dein Zugang zu diesem Workspace ist abgelaufen oder gesperrt','Schreibzugriff mit Dienstrechten bleibt nach Ablauf gesperrt');
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select public.change_beta_duration('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000009','extend',10);
select ok((select ended_at is null and status='active' and ends_at=now()+interval '10 days' from public.workspace_licenses where beta_application_id='b1000000-0000-4000-8000-000000000001'),'Verlängerung einer beendeten Beta beginnt jetzt');

update public.workspace_licenses set status='suspended' where beta_application_id='b1000000-0000-4000-8000-000000000001';
select throws_ok($$select public.change_beta_duration('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000020','extend',10)$$,'22023','Nur registrierte Beta-Konten können geändert werden','Verlängerung hebt eine Suspendierung nicht auf');
select public.prepare_beta_invitation('b1000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000010',repeat('c',64));
select public.complete_beta_invitation('b3000000-0000-4000-8000-000000000010',
  (select lease_id from public.beta_lifecycle_operations where request_id='b3000000-0000-4000-8000-000000000010'),true,null);
insert into public.platform_operators(user_id) values ('b2000000-0000-4000-8000-000000000003');
select throws_ok($$select public.prepare_beta_withdrawal('b1000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000011')$$,'22023','Das Konto wird bereits verwendet und kann nicht als offene Registrierung gelöscht werden','Betreiberkonto ist vor offener Kontobereinigung geschützt');
delete from public.platform_operators where user_id='b2000000-0000-4000-8000-000000000003';
select lives_ok($$select public.prepare_beta_withdrawal('b1000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000011')$$,'Rücknahme sperrt zuerst den Link');
select throws_ok($$select public.inspect_beta_registration(repeat('c',64))$$,'22023','Registrierungslink ist ungültig oder abgelaufen','Zurückgezogene Links sind sofort ungültig');
insert into public.platform_operators(user_id) values ('b2000000-0000-4000-8000-000000000003');
select throws_ok($$delete from auth.users where id='b2000000-0000-4000-8000-000000000003'$$,'22023','Das Konto wird bereits verwendet und kann nicht als offene Registrierung gelöscht werden','Nachträglich zugewiesene Betreiberrolle verhindert Auth-Löschung');
delete from public.platform_operators where user_id='b2000000-0000-4000-8000-000000000003';
delete from auth.users where id='b2000000-0000-4000-8000-000000000003';
select is((select withdrawal_user_id from public.beta_applications where id='b1000000-0000-4000-8000-000000000002'),'b2000000-0000-4000-8000-000000000003'::uuid,'Ursprüngliche Auth-ID überlebt das Löschen und einen Antwortverlust');
set local role service_role;
select lives_ok($$select public.complete_beta_withdrawal('b3000000-0000-4000-8000-000000000011',
  (select lease_id from public.beta_lifecycle_operations where request_id='b3000000-0000-4000-8000-000000000011'))$$,'Bereinigung lässt sich mit Dienstrechten nach externer Auth-Löschung abschließen');
reset role;
select is((select count(*) from public.beta_applications where email='beta-withdraw@example.test'),0::bigint,'E-Mail ist wieder für eine neue Bewerbung frei');
select lives_ok($$select public.prepare_beta_withdrawal('b1000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000011')$$,'Erfolgreiche Löschung ist wiederholbar');
select * from finish();
rollback;
