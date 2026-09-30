\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table(
  'public',
  'workspace_company_profiles',
  'Unternehmensdaten besitzen eine eigene Workspace-Tabelle'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.workspace_company_profiles'::regclass),
  'RLS ist für Unternehmensdaten aktiv'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_company_profiles', 'insert'),
  'Clients dürfen Unternehmensdaten nicht direkt anlegen'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_company_profiles', 'update'),
  'Clients dürfen Unternehmensdaten nicht direkt ändern'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_company_profiles', 'delete'),
  'Clients dürfen Unternehmensdaten nicht direkt löschen'
);
select ok(
  has_table_privilege('authenticated', 'public.workspace_company_profiles', 'select'),
  'Workspace-Mitglieder dürfen Unternehmensdaten über RLS lesen'
);

select ok(
  exists(select 1 from storage.buckets where id = 'company-assets' and public = false),
  'Unternehmenslogos liegen in einem privaten Bucket'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_workspace_company_settings(uuid)',
    'execute'
  ),
  'Angemeldete Nutzer dürfen Unternehmenseinstellungen lesen'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_workspace_company_settings(uuid)',
    'execute'
  ),
  'Anonyme dürfen Unternehmenseinstellungen nicht lesen'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.update_workspace_company_settings(uuid,jsonb,text)',
    'execute'
  ),
  'Angemeldete Nutzer dürfen den geschützten Unternehmens-RPC aufrufen'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.update_workspace_company_settings(uuid,jsonb,text)',
    'execute'
  ),
  'Anonyme dürfen Unternehmenseinstellungen nicht ändern'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.set_workspace_company_logo(uuid,text)',
    'execute'
  ),
  'Angemeldete Nutzer dürfen den geschützten Logo-RPC aufrufen'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.set_workspace_company_logo(uuid,text)',
    'execute'
  ),
  'Anonyme dürfen das Unternehmenslogo nicht ändern'
);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values
  ('c2800000-0000-4000-8000-000000000001','authenticated','authenticated','company-owner@example.test','{}','{}'),
  ('c2800000-0000-4000-8000-000000000002','authenticated','authenticated','company-member@example.test','{}','{}'),
  ('c2800000-0000-4000-8000-000000000003','authenticated','authenticated','company-outsider@example.test','{}','{}');

insert into public.workspaces(id,name,tax_mode)
values
  ('c2800000-0000-4000-8000-000000000011','Interner Workspace A','diff_25a'),
  ('c2800000-0000-4000-8000-000000000012','Interner Workspace B','regular_19');

insert into public.workspace_members(workspace_id,user_id,role)
values
  ('c2800000-0000-4000-8000-000000000011','c2800000-0000-4000-8000-000000000001','owner'),
  ('c2800000-0000-4000-8000-000000000011','c2800000-0000-4000-8000-000000000002','member'),
  ('c2800000-0000-4000-8000-000000000012','c2800000-0000-4000-8000-000000000003','owner');

insert into public.workspace_company_profiles(workspace_id)
values
  ('c2800000-0000-4000-8000-000000000011'),
  ('c2800000-0000-4000-8000-000000000012');

select is(
  (select company_name from public.workspace_company_profiles
   where workspace_id='c2800000-0000-4000-8000-000000000011'),
  null::text,
  'Interner Workspace-Name wird nicht als Unternehmensname übernommen'
);
select is(
  (select legal_name from public.workspace_company_profiles
   where workspace_id='c2800000-0000-4000-8000-000000000011'),
  null::text,
  'Interner Workspace-Name wird nicht als rechtlicher Name übernommen'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2800000-0000-4000-8000-000000000002',true);

select is(
  public.get_workspace_company_settings('c2800000-0000-4000-8000-000000000011')->>'can_edit',
  'false',
  'Normales Mitglied sieht Unternehmensdaten schreibgeschützt'
);
select throws_ok(
  $$select public.update_workspace_company_settings(
    'c2800000-0000-4000-8000-000000000011',
    '{"company_name":"Nicht erlaubt"}'::jsonb,
    'diff_25a'
  )$$,
  '42501',
  'Nur Inhaber und Administratoren dürfen Unternehmensdaten ändern.',
  'Normales Mitglied darf Unternehmensdaten nicht ändern'
);
select throws_ok(
  $$select public.set_workspace_company_logo(
    'c2800000-0000-4000-8000-000000000011',
    'c2800000-0000-4000-8000-000000000011/logos/11111111-1111-4111-8111-111111111111.webp'
  )$$,
  '42501',
  'Nur Inhaber und Administratoren dürfen das Unternehmenslogo ändern.',
  'Normales Mitglied darf Unternehmenslogo nicht ändern'
);
select throws_ok(
  $$select public.get_workspace_company_settings('c2800000-0000-4000-8000-000000000012')$$,
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'Fremde Unternehmensdaten bleiben unsichtbar'
);

select set_config('request.jwt.claim.sub','c2800000-0000-4000-8000-000000000001',true);

select is(
  public.get_workspace_company_settings('c2800000-0000-4000-8000-000000000011')->>'can_edit',
  'true',
  'Inhaber darf Unternehmensdaten bearbeiten'
);

select lives_ok(
  $$select public.update_workspace_company_settings(
    'c2800000-0000-4000-8000-000000000011',
    '{
      "company_name":" Wiehen Store ",
      "legal_name":" Grischa Tänzer ",
      "legal_form":"sole_proprietorship",
      "email":" hello@example.test ",
      "street":" Testweg ",
      "house_number":" 5 ",
      "postal_code":" 32289 ",
      "city":" Rödinghausen ",
      "country_code":"de",
      "tax_number":" 123/456/789 ",
      "bank_account_holder":" Grischa Tänzer ",
      "bank_name":" Testbank ",
      "iban":"de12 3456 7890 1234 5678 90",
      "bic":"abcd de ff"
    }'::jsonb,
    'kleinunternehmer_19'
  )$$,
  'Inhaber speichert Unternehmens- und Steuerdaten atomar'
);

reset role;
select is(
  (select company_name from public.workspace_company_profiles
   where workspace_id='c2800000-0000-4000-8000-000000000011'),
  'Wiehen Store',
  'Unternehmensname wird getrimmt gespeichert'
);
select is(
  (select country_code from public.workspace_company_profiles
   where workspace_id='c2800000-0000-4000-8000-000000000011'),
  'DE',
  'Ländercode wird normalisiert'
);
select is(
  (select iban from public.workspace_company_profiles
   where workspace_id='c2800000-0000-4000-8000-000000000011'),
  'DE12345678901234567890',
  'IBAN wird ohne Leerzeichen und groß gespeichert'
);
select is(
  (select bic from public.workspace_company_profiles
   where workspace_id='c2800000-0000-4000-8000-000000000011'),
  'ABCDDEFF',
  'BIC wird ohne Leerzeichen und groß gespeichert'
);
select is(
  (select tax_mode from public.workspaces
   where id='c2800000-0000-4000-8000-000000000011'),
  'kleinunternehmer_19',
  'Steuermodus wird in derselben Speicheraktion aktualisiert'
);
select is(
  (select count(*)::integer from public.business_events
   where workspace_id='c2800000-0000-4000-8000-000000000011'
     and entity_type='company_profile'
     and event_type='company_profile_updated'),
  1,
  'Eine echte Änderung erzeugt genau ein Unternehmensaudit-Ereignis'
);
select is(
  (select changes ? 'fields' from public.business_events
   where workspace_id='c2800000-0000-4000-8000-000000000011'
     and event_type='company_profile_updated'
   order by created_at desc limit 1),
  true,
  'Audit-Ereignis nennt geänderte Feldnamen'
);
select ok(
  not exists (
    select 1
    from public.business_events
    where workspace_id='c2800000-0000-4000-8000-000000000011'
      and event_type='company_profile_updated'
      and (
        changes::text like '%DE12345678901234567890%'
        or changes::text like '%123/456/789%'
      )
  ),
  'Audit dupliziert keine vollständige IBAN oder Steuernummer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2800000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.update_workspace_company_settings(
    'c2800000-0000-4000-8000-000000000011',
    '{
      "company_name":"Wiehen Store",
      "legal_name":"Grischa Tänzer",
      "legal_form":"sole_proprietorship",
      "email":"hello@example.test",
      "street":"Testweg",
      "house_number":"5",
      "postal_code":"32289",
      "city":"Rödinghausen",
      "country_code":"DE",
      "tax_number":"123/456/789",
      "bank_account_holder":"Grischa Tänzer",
      "bank_name":"Testbank",
      "iban":"DE12345678901234567890",
      "bic":"ABCDDEFF"
    }'::jsonb,
    'kleinunternehmer_19'
  )$$,
  'Idempotentes Speichern ist erlaubt'
);
reset role;
select is(
  (select count(*)::integer from public.business_events
   where workspace_id='c2800000-0000-4000-8000-000000000011'
     and event_type='company_profile_updated'),
  1,
  'Idempotentes Speichern erzeugt kein zweites Audit-Ereignis'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2800000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.update_workspace_company_settings(
    'c2800000-0000-4000-8000-000000000011',
    '{"company_name":"Rollback-Test"}'::jsonb,
    'invalid'
  )$$,
  '22023',
  'Der Steuermodus ist ungültig.',
  'Ungültiger Steuermodus wird abgewiesen'
);
select throws_ok(
  $$select public.update_workspace_company_settings(
    'c2800000-0000-4000-8000-000000000011',
    '{"company_name":"Rollback-Test","unbekannt":"x"}'::jsonb,
    'kleinunternehmer_19'
  )$$,
  '22023',
  'Die Unternehmensdaten enthalten unbekannte Felder.',
  'Unbekannte Felder werden abgewiesen'
);
reset role;
select is(
  (select company_name from public.workspace_company_profiles
   where workspace_id='c2800000-0000-4000-8000-000000000011'),
  'Wiehen Store',
  'Fehlerhafte Speicheraktion ändert das Profil nicht'
);
select is(
  (select tax_mode from public.workspaces
   where id='c2800000-0000-4000-8000-000000000011'),
  'kleinunternehmer_19',
  'Fehlerhafte Speicheraktion ändert den Steuermodus nicht'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2800000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.set_workspace_company_logo(
    'c2800000-0000-4000-8000-000000000011',
    'c2800000-0000-4000-8000-000000000012/logos/11111111-1111-4111-8111-111111111111.webp'
  )$$,
  '22023',
  'Der Logo-Pfad ist ungültig.',
  'Logo-Pfad eines anderen Workspace wird abgewiesen'
);
select lives_ok(
  $$select public.set_workspace_company_logo(
    'c2800000-0000-4000-8000-000000000011',
    'c2800000-0000-4000-8000-000000000011/logos/11111111-1111-4111-8111-111111111111.webp'
  )$$,
  'Inhaber aktiviert einen kanonischen Logo-Pfad'
);
reset role;
select is(
  (select logo_path from public.workspace_company_profiles
   where workspace_id='c2800000-0000-4000-8000-000000000011'),
  'c2800000-0000-4000-8000-000000000011/logos/11111111-1111-4111-8111-111111111111.webp',
  'Aktives Logo wird workspacebezogen gespeichert'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2800000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$insert into storage.objects(bucket_id,name)
    values (
      'company-assets',
      'c2800000-0000-4000-8000-000000000011/logos/member-read.webp'
    )$$,
  'Testvorbereitung Mitglied-Storage'
);
rollback;
