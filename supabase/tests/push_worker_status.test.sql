\set ON_ERROR_STOP on

begin;

select plan(4);

select ok(
  not has_table_privilege('authenticated', 'public.push_worker_runtime_status', 'select')
    and not has_table_privilege('anon', 'public.push_worker_runtime_status', 'select')
    and not has_function_privilege('authenticated', 'public.push_worker_report_status(boolean, integer, integer, integer)', 'execute'),
  'Nur der Dienstschluessel liest und meldet den Push-Stand'
);

set local role service_role;
select public.push_worker_report_status(true, 3, 1, 0);
select public.push_worker_report_status(false, 2, -5, null);
reset role;

select ok(
  (
    select count(*) = 1
      and bool_and(not enabled and waiting = 2 and retry = 0 and configuration_error = 0)
    from public.push_worker_runtime_status
  ),
  'Wiederholte Meldungen ueberschreiben dieselbe Zeile und begrenzen ungueltige Zaehler'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  'b5500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'push-operator@example.test', 'not-used-by-this-test', '{}'::jsonb,
  '{}'::jsonb, now(), now()
);
insert into public.platform_operators (user_id, note) values
  ('b5500000-0000-4000-8000-000000000001', 'Push-Pruefung');

set local role authenticated;
set local request.jwt.claim.sub = 'b5500000-0000-4000-8000-000000000001';

select is(
  (public.platform_system_health() -> 'pushWorker' ->> 'waiting')::integer,
  2,
  'Der Systemzustand zeigt den gemeldeten Push-Stand'
);

select ok(
  (public.platform_system_health() -> 'pushWorker' ->> 'enabled') = 'false',
  'Ein ausgeschalteter Push-Worker ist erkennbar'
);

reset role;
select * from finish();
rollback;
