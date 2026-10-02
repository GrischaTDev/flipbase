\set ON_ERROR_STOP on
begin;
select plan(7);

-- Einladungen müssen an der Fristgrenze und nach Widerruf serverseitig scheitern.
insert into public.beta_applications(id,first_name,last_name,email,status,granted_days)
values ('a1000000-0000-4000-8000-000000000001','Beta','Test','beta-lifecycle@example.test','accepted',60);
insert into auth.users(id,email,raw_user_meta_data)
values ('a2000000-0000-4000-8000-000000000001','beta-lifecycle@example.test',
  '{"beta_application_id":"a1000000-0000-4000-8000-000000000001"}'::jsonb);

select lives_ok($$select public.prepare_beta_invitation(
  'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',repeat('a',64))$$,
  'Eine angenommene Bewerbung erhält einen verwalteten Link');
select lives_ok($$select public.complete_beta_invitation('a3000000-0000-4000-8000-000000000001',(select lease_id from public.beta_lifecycle_operations where request_id='a3000000-0000-4000-8000-000000000001'),true,null)$$,
  'Versand schaltet den Link frei');
select ok((select invitation_expires_at = invitation_sent_at + interval '168 hours'
  from public.beta_applications where id='a1000000-0000-4000-8000-000000000001'),
  'Die Registrierung gilt genau sieben Tage');
select lives_ok($$select public.inspect_beta_registration(repeat('a',64))$$,
  'Ein gültiger Link kann ohne Registrierung geprüft werden');
select is((select registered_at from public.beta_applications
  where id='a1000000-0000-4000-8000-000000000001'),null::timestamptz,
  'Prüfen startet keine Beta');
update public.beta_registration_links set expires_at=now()
where application_id='a1000000-0000-4000-8000-000000000001';
select throws_ok($$select public.begin_beta_registration(repeat('a',64),
  'a3000000-0000-4000-8000-000000000002')$$,'22023','Registrierungslink ist ungültig oder abgelaufen',
  'Die genaue Fristgrenze ist ungültig');
select ok(not has_table_privilege('authenticated','public.beta_registration_links','select'),
  'Link-Hashes sind für angemeldete Nutzer nicht lesbar');
select * from finish();
rollback;
