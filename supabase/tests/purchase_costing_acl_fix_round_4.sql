\set ON_ERROR_STOP on

begin;

select no_plan();

select is(
  pg_catalog.has_table_privilege(
    expectation.role_name,
    'public.purchase_lines',
    expectation.privilege_name
  ),
  expectation.expected,
  pg_catalog.format(
    '%s: purchase_lines %s entspricht dem RPC-only-Vertrag',
    expectation.role_name,
    expectation.privilege_name
  )
)
from (
  values
    ('anon', 'SELECT', false),
    ('anon', 'INSERT', false),
    ('anon', 'UPDATE', false),
    ('anon', 'DELETE', false),
    ('anon', 'TRUNCATE', false),
    ('anon', 'REFERENCES', false),
    ('anon', 'TRIGGER', false),
    ('authenticated', 'SELECT', true),
    ('authenticated', 'INSERT', false),
    ('authenticated', 'UPDATE', false),
    ('authenticated', 'DELETE', false),
    ('authenticated', 'TRUNCATE', false),
    ('authenticated', 'REFERENCES', false),
    ('authenticated', 'TRIGGER', false),
    ('service_role', 'SELECT', true),
    ('service_role', 'INSERT', false),
    ('service_role', 'UPDATE', false),
    ('service_role', 'DELETE', false),
    ('service_role', 'TRUNCATE', false),
    ('service_role', 'REFERENCES', false),
    ('service_role', 'TRIGGER', false)
) as expectation(role_name, privilege_name, expected);

select ok(
  coalesce(
    (
      select
        routine.prosecdef
        and owner_role.rolname = 'postgres'
        and 'search_path=""' = any(coalesce(routine.proconfig, array[]::text[]))
        and pg_catalog.has_function_privilege('authenticated', routine.oid, 'execute')
        and not pg_catalog.has_function_privilege('anon', routine.oid, 'execute')
        and not pg_catalog.has_function_privilege('service_role', routine.oid, 'execute')
      from pg_catalog.pg_proc as routine
      join pg_catalog.pg_roles as owner_role on owner_role.oid = routine.proowner
      where routine.oid = pg_catalog.to_regprocedure(expectation.function_signature)
    ),
    false
  ),
  pg_catalog.format(
    '%s bleibt eine gehärtete authenticated-Business-RPC ohne service_role-Ausführungsrecht',
    expectation.function_name
  )
)
from (
  values
    ('create_purchase', 'public.create_purchase(uuid,jsonb,jsonb,jsonb)'),
    ('add_purchase_lines', 'public.add_purchase_lines(uuid,uuid,jsonb)'),
    ('receive_purchase_lines', 'public.receive_purchase_lines(uuid,uuid,jsonb)'),
    ('receive_individual_purchase_line', 'public.receive_individual_purchase_line(uuid,uuid,uuid,jsonb)'),
    ('finalize_purchase_costing', 'public.finalize_purchase_costing(uuid,uuid)'),
    ('reopen_purchase_costing', 'public.reopen_purchase_costing(uuid,uuid)'),
    ('correct_purchase_costing', 'public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb)')
) as expectation(function_name, function_signature);

insert into public.workspaces (id, name) values (
  '9b000000-0000-4000-8000-000000000011',
  'Einkaufspositions-ACL Fixrunde 4'
);

insert into public.purchases (id, workspace_id, type, title) values (
  '9b000000-0000-4000-8000-000000000101',
  '9b000000-0000-4000-8000-000000000011',
  'single',
  'TRUNCATE-Regressionsbeleg'
);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, price_mode, unit_purchase_price, line_total
) values (
  '9b000000-0000-4000-8000-000000000201',
  '9b000000-0000-4000-8000-000000000011',
  '9b000000-0000-4000-8000-000000000101',
  'Muss trotz TRUNCATE-Versuch erhalten bleiben',
  'individual',
  1,
  'priced',
  1.00,
  1.00
);

set local role anon;

select throws_ok(
  $$truncate table public.purchase_lines cascade$$,
  '42501',
  'permission denied for table purchase_lines',
  'anon kann Einkaufspositionen nicht per TRUNCATE CASCADE beseitigen'
);

reset role;
set local role authenticated;

select throws_ok(
  $$truncate table public.purchase_lines cascade$$,
  '42501',
  'permission denied for table purchase_lines',
  'authenticated kann Einkaufspositionen nicht per TRUNCATE CASCADE beseitigen'
);

reset role;
set local role service_role;

select throws_ok(
  $$truncate table public.purchase_lines cascade$$,
  '42501',
  'permission denied for table purchase_lines',
  'service_role kann den RPC-only-Schutz nicht per TRUNCATE CASCADE umgehen'
);

reset role;

select is(
  (
    select pg_catalog.count(*)
    from public.purchase_lines
    where id = '9b000000-0000-4000-8000-000000000201'
  ),
  1::bigint,
  'alle drei echten TRUNCATE-Versuche lassen die Einkaufsposition unverändert'
);

select * from finish();

rollback;
