\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('f1800000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'expenses-owner@example.test', '{}', '{}'),
  ('f1800000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'expenses-outsider@example.test', '{}', '{}');

insert into public.workspaces (id, name, tax_mode) values
  ('f1800000-0000-4000-8000-000000000011', 'Ausgaben eigener Workspace', 'diff_25a'),
  ('f1800000-0000-4000-8000-000000000012', 'Ausgaben fremder Workspace', 'diff_25a');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('f1800000-0000-4000-8000-000000000011', 'f1800000-0000-4000-8000-000000000001', 'owner'),
  ('f1800000-0000-4000-8000-000000000012', 'f1800000-0000-4000-8000-000000000002', 'owner');

insert into public.expense_categories (
  id, workspace_id, name, sort_order, is_default, created_by
) values (
  'f1800000-0000-4000-8000-000000000022',
  'f1800000-0000-4000-8000-000000000012',
  'Fremde feste Kategorie',
  900,
  false,
  'f1800000-0000-4000-8000-000000000002'
);

select ok(
  (select count(*) from public.expense_categories
   where workspace_id = 'f1800000-0000-4000-8000-000000000011') >= 13,
  'ein Workspace erhält die Standardkategorien'
);

select is(
  (select count(*) from public.expense_categories
   where workspace_id = 'f1800000-0000-4000-8000-000000000011'
     and name = 'Versandmaterial'),
  1::bigint,
  'Standardkategorien werden nicht doppelt angelegt'
);

select set_config('request.jwt.claim.sub', 'f1800000-0000-4000-8000-000000000001', true);
set local role authenticated;

insert into public.expense_categories (
  id, workspace_id, name, sort_order, is_default, created_by
) values (
  'f1800000-0000-4000-8000-000000000021',
  'f1800000-0000-4000-8000-000000000011',
  'Eigenes Material',
  900,
  false,
  'f1800000-0000-4000-8000-000000000001'
);

insert into public.expense_recurring_rules (
  id, workspace_id, category_id, title, vendor_name, quantity, gross_amount, vat_rate, frequency,
  start_date, end_date, is_active, created_by
) values (
  'f1800000-0000-4000-8000-000000000031',
  'f1800000-0000-4000-8000-000000000011',
  'f1800000-0000-4000-8000-000000000021',
  'Server',
  'Netcup',
  2,
  29.90,
  19,
  'monthly',
  '2026-09-01',
  null,
  true,
  'f1800000-0000-4000-8000-000000000001'
);

insert into public.expenses (
  id, workspace_id, category_id, recurring_rule_id, occurrence_date, title,
  gross_amount, vat_rate, expense_date, due_date, status, payment_date, created_by
) values (
  'f1800000-0000-4000-8000-000000000041',
  'f1800000-0000-4000-8000-000000000011',
  'f1800000-0000-4000-8000-000000000021',
  'f1800000-0000-4000-8000-000000000031',
  '2026-09-01',
  'Server',
  29.90,
  19,
  '2026-09-01',
  '2026-09-01',
  'open',
  null,
  'f1800000-0000-4000-8000-000000000001'
);

insert into public.expenses (
  id, workspace_id, category_id, title, vendor_name, quantity, gross_amount, vat_rate,
  expense_date, status, payment_date, created_by
) values (
  'f1800000-0000-4000-8000-000000000042',
  'f1800000-0000-4000-8000-000000000011',
  'f1800000-0000-4000-8000-000000000021',
  'Paketband',
  'Bürohandel',
  4,
  12.50,
  null,
  '2026-09-18',
  'paid',
  '2026-09-18',
  'f1800000-0000-4000-8000-000000000001'
);

select is(
  (select quantity from public.expenses
   where id = 'f1800000-0000-4000-8000-000000000042'),
  4,
  'eine Ausgabe speichert die Stückzahl'
);

select is(
  (select vendor_name from public.expenses
   where id = 'f1800000-0000-4000-8000-000000000042'),
  'Bürohandel',
  'eine Ausgabe speichert den Händler oder Anbieter'
);

select is(
  (select quantity from public.expense_recurring_rules
   where id = 'f1800000-0000-4000-8000-000000000031'),
  2,
  'eine Wiederholungsregel speichert die Stückzahl'
);

select is(
  (select vendor_name from public.expense_recurring_rules
   where id = 'f1800000-0000-4000-8000-000000000031'),
  'Netcup',
  'eine Wiederholungsregel speichert den Händler oder Anbieter'
);

select lives_ok(
  $$insert into public.expenses (
      workspace_id, category_id, recurring_rule_id, occurrence_date, title,
      gross_amount, vat_rate, expense_date, due_date, status, payment_date, created_by
    ) values (
      'f1800000-0000-4000-8000-000000000011',
      'f1800000-0000-4000-8000-000000000021',
      'f1800000-0000-4000-8000-000000000031',
      '2026-09-01',
      'Server erneut',
      99,
      19,
      '2026-09-01',
      '2026-09-01',
      'open',
      null,
      'f1800000-0000-4000-8000-000000000001'
    ) on conflict (workspace_id, recurring_rule_id, occurrence_date) do nothing$$,
  'derselbe Konfliktschlüssel wie PostgREST ist verwendbar'
);

select is(
  (select count(*) from public.expenses
   where recurring_rule_id = 'f1800000-0000-4000-8000-000000000031'
     and occurrence_date = '2026-09-01'),
  1::bigint,
  'erneutes Erzeugen verdoppelt die Fälligkeit nicht'
);

select is(
  (select gross_amount from public.expenses
   where id = 'f1800000-0000-4000-8000-000000000041'),
  29.90::numeric,
  'erneutes Erzeugen überschreibt den historischen Betrag nicht'
);

select lives_ok(
  $$insert into public.expenses (
      id, workspace_id, category_id, title, gross_amount,
      expense_date, status, payment_date, created_by
    ) values (
      'f1800000-0000-4000-8000-000000000043',
      'f1800000-0000-4000-8000-000000000011',
      'f1800000-0000-4000-8000-000000000021',
      'Zweite manuelle Ausgabe',
      8,
      '2026-09-19',
      'open',
      null,
      'f1800000-0000-4000-8000-000000000001'
    )$$,
  'mehrere manuelle Ausgaben ohne Wiederholungsregel bleiben zulässig'
);

select throws_ok(
  $$update public.expenses
    set quantity = 0
    where id = 'f1800000-0000-4000-8000-000000000042'$$,
  '23514',
  null,
  'die Stückzahl muss positiv sein'
);

select lives_ok(
  $$update public.expense_categories
    set name = 'Eigenes Versandmaterial'
    where id = 'f1800000-0000-4000-8000-000000000021'$$,
  'eigene Kategorien lassen sich ändern'
);

select lives_ok(
  $$update public.expenses
    set status = 'paid', payment_date = '2026-09-18'
    where id = 'f1800000-0000-4000-8000-000000000041'$$,
  'eine offene Ausgabe lässt sich korrekt als bezahlt markieren'
);

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, title, gross_amount, vat_rate,
      expense_date, status, payment_date, created_by
    ) values (
      'f1800000-0000-4000-8000-000000000011',
      'f1800000-0000-4000-8000-000000000021',
      'Ungültige MwSt',
      10,
      5,
      '2026-09-18',
      'paid',
      '2026-09-18',
      'f1800000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  null,
  'nur 0, 7, 19 oder keine MwSt-Angabe sind erlaubt'
);

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, title, gross_amount,
      expense_date, status, payment_date, created_by
    ) values (
      'f1800000-0000-4000-8000-000000000011',
      'f1800000-0000-4000-8000-000000000021',
      'Bezahlt ohne Datum',
      10,
      '2026-09-18',
      'paid',
      null,
      'f1800000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  null,
  'bezahlt verlangt ein Zahlungsdatum'
);

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, title, gross_amount,
      expense_date, status, payment_date, created_by
    ) values (
      'f1800000-0000-4000-8000-000000000011',
      'f1800000-0000-4000-8000-000000000021',
      'Offen mit Datum',
      10,
      '2026-09-18',
      'open',
      '2026-09-18',
      'f1800000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  null,
  'offen darf kein Zahlungsdatum besitzen'
);

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, recurring_rule_id, occurrence_date, title,
      gross_amount, vat_rate, expense_date, due_date, status, payment_date, created_by
    ) values (
      'f1800000-0000-4000-8000-000000000011',
      'f1800000-0000-4000-8000-000000000021',
      'f1800000-0000-4000-8000-000000000031',
      '2026-09-01',
      'Server doppelt',
      29.90,
      19,
      '2026-09-01',
      '2026-09-01',
      'open',
      null,
      'f1800000-0000-4000-8000-000000000001'
    )$$,
  '23505',
  null,
  'eine Wiederholungsinstanz kann nur einmal existieren'
);

update public.expenses
set deleted_at = now()
where id = 'f1800000-0000-4000-8000-000000000041';

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, recurring_rule_id, occurrence_date, title,
      gross_amount, vat_rate, expense_date, due_date, status, payment_date, created_by
    ) values (
      'f1800000-0000-4000-8000-000000000011',
      'f1800000-0000-4000-8000-000000000021',
      'f1800000-0000-4000-8000-000000000031',
      '2026-09-01',
      'Server nach Löschung',
      29.90,
      19,
      '2026-09-01',
      '2026-09-01',
      'open',
      null,
      'f1800000-0000-4000-8000-000000000001'
    )$$,
  '23505',
  null,
  'soft-gelöschte Wiederholungsinstanzen werden nicht erneut materialisiert'
);

select throws_ok(
  $$insert into public.expenses (
      workspace_id, category_id, title, gross_amount,
      expense_date, status, payment_date, created_by
    ) values (
      'f1800000-0000-4000-8000-000000000011',
      'f1800000-0000-4000-8000-000000000022',
      'Fremde Kategorie',
      10,
      '2026-09-18',
      'paid',
      '2026-09-18',
      'f1800000-0000-4000-8000-000000000001'
    )$$,
  '42501',
  null,
  'eine Kategorie aus einem anderen Workspace wird bereits durch RLS abgelehnt'
);

select ok(
  public.is_expense_document_path(
    'expense-documents/f1800000-0000-4000-8000-000000000011/f1800000-0000-4000-8000-000000000042/f1800000-0000-4000-8000-000000000051.pdf',
    'f1800000-0000-4000-8000-000000000011',
    'f1800000-0000-4000-8000-000000000042'
  ),
  'kanonische Belegpfade werden akzeptiert'
);

select ok(
  not public.is_expense_document_path(
    'expense-documents/f1800000-0000-4000-8000-000000000012/f1800000-0000-4000-8000-000000000042/f1800000-0000-4000-8000-000000000051.pdf',
    'f1800000-0000-4000-8000-000000000011',
    'f1800000-0000-4000-8000-000000000042'
  ),
  'fremde Workspace-Pfade werden abgelehnt'
);

reset role;

select set_config('request.jwt.claim.sub', 'f1800000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (select count(*) from public.expenses),
  0::bigint,
  'ein fremder Workspace sieht keine Ausgaben'
);

select throws_ok(
  $$insert into public.expense_categories (
      workspace_id, name, sort_order, is_default, created_by
    ) values (
      'f1800000-0000-4000-8000-000000000011',
      'Fremde Kategorie',
      999,
      false,
      'f1800000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  null,
  'ein fremder Workspace kann keine Kategorie anlegen'
);

reset role;

select * from finish();
rollback;
