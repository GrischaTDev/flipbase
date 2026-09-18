\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('e1800000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'expenses-owner@example.test', '{}', '{}'),
  ('e1800000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'expenses-outsider@example.test', '{}', '{}');

insert into public.workspaces (id, name, tax_mode) values
  ('e1800000-0000-4000-8000-000000000011', 'Ausgaben eigener Workspace', 'diff_25a'),
  ('e1800000-0000-4000-8000-000000000012', 'Ausgaben fremder Workspace', 'diff_25a');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('e1800000-0000-4000-8000-000000000011', 'e1800000-0000-4000-8000-000000000001', 'owner'),
  ('e1800000-0000-4000-8000-000000000012', 'e1800000-0000-4000-8000-000000000002', 'owner');

select is(
  (select count(*) from public.expense_categories where workspace_id = 'e1800000-0000-4000-8000-000000000011'),
  13::bigint,
  'neue Workspaces erhalten die 13 Standardkategorien'
);

select set_config('request.jwt.claim.sub', 'e1800000-0000-4000-8000-000000000001', true);
set local role authenticated;

insert into public.expense_categories (
  id, workspace_id, name, sort_order, created_by
) values (
  'e1800000-0000-4000-8000-000000000021',
  'e1800000-0000-4000-8000-000000000011',
  'Lagerbedarf',
  500,
  'e1800000-0000-4000-8000-000000000001'
);

insert into public.expense_recurring_rules (
  id, workspace_id, category_id, title, gross_amount, vat_rate, frequency,
  start_date, is_active, created_by
) values (
  'e1800000-0000-4000-8000-000000000031',
  'e1800000-0000-4000-8000-000000000011',
  'e1800000-0000-4000-8000-000000000021',
  'Server',
  29.90,
  19,
  'monthly',
  '2026-09-01',
  true,
  'e1800000-0000-4000-8000-000000000001'
);

insert into public.expenses (
  id, workspace_id, category_id, recurring_rule_id, occurrence_date, title,
  gross_amount, vat_rate, expense_date, due_date, status, payment_date, created_by
) values (
  'e1800000-0000-4000-8000-000000000041',
  'e1800000-0000-4000-8000-000000000011',
  'e1800000-0000-4000-8000-000000000021',
  'e1800000-0000-4000-8000-000000000031',
  '2026-09-01',
  'Server',
  29.90,
  19,
  '2026-09-01',
  '2026-09-01',
  'open',
  null,
  'e1800000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$insert into public.expenses (
      id, workspace_id, category_id, title, gross_amount, vat_rate,
      expense_date, status, payment_date, created_by
    ) values (
      'e1800000-0000-4000-8000-000000000042',
      'e1800000-0000-4000-8000-000000000011',
      'e1800000-0000-4000-8000-000000000021',
      'Kartons',
      35.00,
      19,
      '2026-09-18',
      'paid',
      '2026-09-18',
      'e1800000-0000-4000-8000-000000000001'
    )$$,
  'eine bezahlte manuelle Ausgabe mit Zahlungsdatum ist gültig'
);

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, title, gross_amount, expense_date, status, created_by
    ) values (
      'e1800000-0000-4000-8000-000000000011',
      'e1800000-0000-4000-8000-000000000021',
      'Bezahlt ohne Datum',
      10,
      '2026-09-18',
      'paid',
      'e1800000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  null,
  'bezahlt verlangt ein Zahlungsdatum'
);

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, title, gross_amount, expense_date, status, payment_date, created_by
    ) values (
      'e1800000-0000-4000-8000-000000000011',
      'e1800000-0000-4000-8000-000000000021',
      'Offen mit Zahlungsdatum',
      10,
      '2026-09-18',
      'open',
      '2026-09-18',
      'e1800000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  null,
  'offen darf kein Zahlungsdatum besitzen'
);

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, title, gross_amount, vat_rate, expense_date,
      status, payment_date, created_by
    ) values (
      'e1800000-0000-4000-8000-000000000011',
      'e1800000-0000-4000-8000-000000000021',
      'Falsche Steuer',
      10,
      12,
      '2026-09-18',
      'paid',
      '2026-09-18',
      'e1800000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  null,
  'nur 0, 7 oder 19 Prozent MwSt sind zulässig'
);

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, recurring_rule_id, occurrence_date, title,
      gross_amount, vat_rate, expense_date, due_date, status, created_by
    ) values (
      'e1800000-0000-4000-8000-000000000011',
      'e1800000-0000-4000-8000-000000000021',
      'e1800000-0000-4000-8000-000000000031',
      '2026-09-01',
      'Server doppelt',
      29.90,
      19,
      '2026-09-01',
      '2026-09-01',
      'open',
      'e1800000-0000-4000-8000-000000000001'
    )$$,
  '23505',
  null,
  'eine Wiederholungsinstanz kann pro Fälligkeit nur einmal existieren'
);

update public.expenses
set deleted_at = now()
where id = 'e1800000-0000-4000-8000-000000000041';

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, recurring_rule_id, occurrence_date, title,
      gross_amount, vat_rate, expense_date, due_date, status, created_by
    ) values (
      'e1800000-0000-4000-8000-000000000011',
      'e1800000-0000-4000-8000-000000000021',
      'e1800000-0000-4000-8000-000000000031',
      '2026-09-01',
      'Server nach Löschen',
      29.90,
      19,
      '2026-09-01',
      '2026-09-01',
      'open',
      'e1800000-0000-4000-8000-000000000001'
    )$$,
  '23505',
  null,
  'soft-gelöschte Wiederholungen werden nicht erneut materialisiert'
);

insert into public.expense_documents (
  id, workspace_id, expense_id, document_type, original_file_name,
  storage_path, mime_type, file_size, created_by
) values (
  'e1800000-0000-4000-8000-000000000051',
  'e1800000-0000-4000-8000-000000000011',
  'e1800000-0000-4000-8000-000000000042',
  'invoice',
  'kartons.pdf',
  'expense-documents/e1800000-0000-4000-8000-000000000011/e1800000-0000-4000-8000-000000000042/e1800000-0000-4000-8000-000000000051.pdf',
  'application/pdf',
  1234,
  'e1800000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$insert into public.expense_documents (
      workspace_id, expense_id, document_type, original_file_name,
      storage_path, mime_type, file_size, created_by
    ) values (
      'e1800000-0000-4000-8000-000000000011',
      'e1800000-0000-4000-8000-000000000042',
      'other',
      'falsch.pdf',
      'irgendwo/falsch.pdf',
      'application/pdf',
      10,
      'e1800000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  null,
  'Ausgabenbelege erzwingen den kanonischen privaten Pfad'
);

reset role;

select set_config('request.jwt.claim.sub', 'e1800000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (select count(*) from public.expenses),
  0::bigint,
  'ein fremder Workspace sieht keine Ausgaben'
);

select is(
  (select count(*) from public.expense_documents),
  0::bigint,
  'ein fremder Workspace sieht keine Ausgabenbelege'
);

select throws_ok(
  $$insert into public.expense_categories (
      workspace_id, name, sort_order, created_by
    ) values (
      'e1800000-0000-4000-8000-000000000011',
      'Fremde Kategorie',
      999,
      'e1800000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  null,
  'ein fremder Workspace kann keine Kategorie anlegen'
);

reset role;

select * from finish();
rollback;
