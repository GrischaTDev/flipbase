\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('e1800000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'expense-owner@example.test', '{}', '{}'),
  ('e1800000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'expense-outsider@example.test', '{}', '{}');

insert into public.workspaces (id, name, tax_mode) values
  ('e1800000-0000-4000-8000-000000000011', 'Ausgaben eigener Workspace', 'diff_25a'),
  ('e1800000-0000-4000-8000-000000000012', 'Ausgaben fremder Workspace', 'diff_25a');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('e1800000-0000-4000-8000-000000000011', 'e1800000-0000-4000-8000-000000000001', 'owner'),
  ('e1800000-0000-4000-8000-000000000012', 'e1800000-0000-4000-8000-000000000002', 'owner');

select is(
  (select count(*) from public.operating_expense_categories where workspace_id = 'e1800000-0000-4000-8000-000000000011'),
  13::bigint,
  'neue Workspaces erhalten die 13 Standardkategorien'
);

select set_config('request.jwt.claim.sub', 'e1800000-0000-4000-8000-000000000001', true);
set local role authenticated;

insert into public.operating_expense_categories (
  id, workspace_id, name, created_by
) values (
  'e1800000-0000-4000-8000-000000000021',
  'e1800000-0000-4000-8000-000000000011',
  'Lagerbedarf',
  'e1800000-0000-4000-8000-000000000001'
);

update public.operating_expense_categories
set name = 'Lager & Regale'
where id = 'e1800000-0000-4000-8000-000000000021';

update public.operating_expense_categories
set archived_at = now()
where id = 'e1800000-0000-4000-8000-000000000021';

select is(
  (select name from public.operating_expense_categories where id = 'e1800000-0000-4000-8000-000000000021'),
  'Lager & Regale',
  'eigene Kategorien lassen sich umbenennen'
);

select ok(
  (select archived_at is not null from public.operating_expense_categories where id = 'e1800000-0000-4000-8000-000000000021'),
  'Kategorien lassen sich archivieren'
);

insert into public.operating_expenses (
  id, workspace_id, category_id, title, gross_amount, vat_rate, expense_date,
  status, paid_at, created_by
)
select
  'e1800000-0000-4000-8000-000000000031',
  'e1800000-0000-4000-8000-000000000011',
  id,
  'Server September',
  29.90,
  19,
  '2026-09-01',
  'paid',
  '2026-09-03',
  'e1800000-0000-4000-8000-000000000001'
from public.operating_expense_categories
where workspace_id = 'e1800000-0000-4000-8000-000000000011'
  and default_key = 'hosting_server';

insert into public.operating_expenses (
  id, workspace_id, category_id, title, gross_amount, vat_rate, expense_date,
  status, due_date, created_by
)
select
  'e1800000-0000-4000-8000-000000000032',
  'e1800000-0000-4000-8000-000000000011',
  id,
  'Versandkartons',
  35,
  null,
  '2026-09-10',
  'open',
  '2026-09-30',
  'e1800000-0000-4000-8000-000000000001'
from public.operating_expense_categories
where workspace_id = 'e1800000-0000-4000-8000-000000000011'
  and default_key = 'shipping_material';

select is(
  (select count(*) from public.operating_expenses),
  2::bigint,
  'offene und bezahlte Ausgaben lassen sich erfassen'
);

select throws_ok(
  $$insert into public.operating_expenses (
      workspace_id, category_id, title, gross_amount, vat_rate, expense_date, status, created_by
    )
    select
      'e1800000-0000-4000-8000-000000000011', id, 'Falsche MwSt.', 10, 20,
      '2026-09-11', 'open', 'e1800000-0000-4000-8000-000000000001'
    from public.operating_expense_categories
    where workspace_id = 'e1800000-0000-4000-8000-000000000011' and default_key = 'other'$$,
  '23514',
  null,
  'nur 0, 7 und 19 Prozent MwSt. sind neben keiner Angabe erlaubt'
);

select throws_ok(
  $$insert into public.operating_expenses (
      workspace_id, category_id, title, gross_amount, expense_date, status, created_by
    )
    select
      'e1800000-0000-4000-8000-000000000011', id, 'Bezahlt ohne Datum', 10,
      '2026-09-11', 'paid', 'e1800000-0000-4000-8000-000000000001'
    from public.operating_expense_categories
    where workspace_id = 'e1800000-0000-4000-8000-000000000011' and default_key = 'other'$$,
  '23514',
  null,
  'bezahlt verlangt ein Zahlungsdatum'
);

insert into public.recurring_operating_expenses (
  id, workspace_id, category_id, title, gross_amount, vat_rate, interval,
  start_date, next_due_date, created_by
)
select
  'e1800000-0000-4000-8000-000000000041',
  'e1800000-0000-4000-8000-000000000011',
  id,
  'Monatsende Server',
  29.90,
  19,
  'monthly',
  '2026-01-31',
  '2026-01-31',
  'e1800000-0000-4000-8000-000000000001'
from public.operating_expense_categories
where workspace_id = 'e1800000-0000-4000-8000-000000000011'
  and default_key = 'hosting_server';

select is(
  public.materialize_due_operating_expenses(
    'e1800000-0000-4000-8000-000000000011',
    '2026-03-31'
  ),
  3,
  'verpasste monatliche Fälligkeiten werden bis zum Stichtag nachgezogen'
);

select is(
  (select array_agg(recurrence_date order by recurrence_date)
   from public.operating_expenses
   where recurring_rule_id = 'e1800000-0000-4000-8000-000000000041'),
  array['2026-01-31'::date, '2026-02-28'::date, '2026-03-31'::date],
  'Monatsende bleibt über kurze Monate hinweg Monatsende'
);

select is(
  (select count(*) from public.operating_expenses
   where recurring_rule_id = 'e1800000-0000-4000-8000-000000000041'
     and status = 'open'
     and paid_at is null),
  3::bigint,
  'erzeugte Fixkosten sind zunächst offen und noch kein Cash-Abfluss'
);

select is(
  public.materialize_due_operating_expenses(
    'e1800000-0000-4000-8000-000000000011',
    '2026-03-31'
  ),
  0,
  'Materialisierung ist idempotent'
);

select is(
  (select count(*) from public.operating_expenses
   where recurring_rule_id = 'e1800000-0000-4000-8000-000000000041'
     and recurrence_date > '2026-03-31'),
  0::bigint,
  'zukünftige Ausgaben werden nicht erzeugt'
);

insert into public.recurring_operating_expenses (
  id, workspace_id, category_id, title, gross_amount, interval,
  start_date, next_due_date, created_by
)
select
  'e1800000-0000-4000-8000-000000000042',
  'e1800000-0000-4000-8000-000000000011',
  id,
  'Quartalskosten',
  90,
  'quarterly',
  '2026-01-15',
  '2026-01-15',
  'e1800000-0000-4000-8000-000000000001'
from public.operating_expense_categories
where workspace_id = 'e1800000-0000-4000-8000-000000000011'
  and default_key = 'services';

insert into public.recurring_operating_expenses (
  id, workspace_id, category_id, title, gross_amount, interval,
  start_date, next_due_date, created_by
)
select
  'e1800000-0000-4000-8000-000000000043',
  'e1800000-0000-4000-8000-000000000011',
  id,
  'Jahresversicherung',
  120,
  'yearly',
  '2026-02-28',
  '2026-02-28',
  'e1800000-0000-4000-8000-000000000001'
from public.operating_expense_categories
where workspace_id = 'e1800000-0000-4000-8000-000000000011'
  and default_key = 'insurance';

select is(
  public.materialize_due_operating_expenses(
    'e1800000-0000-4000-8000-000000000011',
    '2026-07-15'
  ),
  5,
  'quartalsweise und jährliche Regeln erzeugen die fälligen Instanzen'
);

select is(
  (select next_due_date from public.recurring_operating_expenses
   where id = 'e1800000-0000-4000-8000-000000000042'),
  '2026-10-15'::date,
  'Quartalsregel wird um drei Monate fortgeschrieben'
);

select is(
  (select next_due_date from public.recurring_operating_expenses
   where id = 'e1800000-0000-4000-8000-000000000043'),
  '2027-02-28'::date,
  'Jahresregel wird um ein Jahr fortgeschrieben'
);

insert into public.operating_expense_documents (
  id, workspace_id, expense_id, document_type, original_file_name,
  storage_path, mime_type, file_size, created_by
) values (
  'e1800000-0000-4000-8000-000000000051',
  'e1800000-0000-4000-8000-000000000011',
  'e1800000-0000-4000-8000-000000000031',
  'invoice',
  'server.pdf',
  'operating-expense-documents/e1800000-0000-4000-8000-000000000011/e1800000-0000-4000-8000-000000000031/e1800000-0000-4000-8000-000000000051.pdf',
  'application/pdf',
  1234,
  'e1800000-0000-4000-8000-000000000001'
);

select is(
  (select count(*) from public.operating_expense_documents),
  1::bigint,
  'private Ausgabenbelege lassen sich mit kanonischem Pfad hinterlegen'
);

reset role;

select set_config('request.jwt.claim.sub', 'e1800000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (select count(*) from public.operating_expenses),
  0::bigint,
  'fremde Workspace-Mitglieder sehen keine Ausgaben'
);

select is(
  (select count(*) from public.operating_expense_documents),
  0::bigint,
  'fremde Workspace-Mitglieder sehen keine Ausgabenbelege'
);

select throws_ok(
  $$select public.materialize_due_operating_expenses(
      'e1800000-0000-4000-8000-000000000011',
      '2026-09-18'
    )$$,
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'fremde Workspace-Mitglieder dürfen keine Fixkosten materialisieren'
);

reset role;

select ok(
  not has_table_privilege(
    'anon',
    'public.operating_expenses',
    'select,insert,update,delete,truncate,references,trigger'
  ),
  'anon besitzt keine Rechte auf Ausgaben'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.materialize_due_operating_expenses(uuid,date)',
    'execute'
  ),
  'anon darf die Materialisierung nicht aufrufen'
);

select * from finish();
rollback;
