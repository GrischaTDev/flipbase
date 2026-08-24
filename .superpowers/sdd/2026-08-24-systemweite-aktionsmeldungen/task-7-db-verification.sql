\set ON_ERROR_STOP on

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
values (
  'f7000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'task-7-db-verification@localhost.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Task 7 DB Verification"}'::jsonb,
  now(), now(), false, false
);

insert into public.workspaces (id, name)
values
  ('f7100000-0000-4000-8000-000000000001', 'Task 7 eigener Workspace'),
  ('f7100000-0000-4000-8000-000000000002', 'Task 7 fremder Workspace');

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'f7100000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.inventory_items (id, workspace_id, title, status)
values
  ('f7200000-0000-4000-8000-000000000001', 'f7100000-0000-4000-8000-000000000001', 'Checkout Artikel', 'ready'),
  ('f7200000-0000-4000-8000-000000000002', 'f7100000-0000-4000-8000-000000000001', 'Rollback Artikel', 'ready');

do $$
declare
  v_name text;
begin
  foreach v_name in array array['place_store_order', 'replace_bank_transactions', 'book_bank_transaction']
  loop
    if not exists (
      select 1
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = v_name
        and procedure.prosecdef = false
        and procedure.proconfig = array['search_path=""']
        and has_function_privilege('authenticated', procedure.oid, 'execute')
        and not has_function_privilege('anon', procedure.oid, 'execute')
        and not has_function_privilege('service_role', procedure.oid, 'execute')
    ) then
      raise exception 'Rechte oder Sicherheitsattribute von % sind falsch.', v_name;
    end if;
  end loop;
  raise notice 'PASS security: alle Task-7-RPCs invoker und nur authenticated';
end;
$$;

set local request.jwt.claim.sub = 'f7000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"f7000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_order public.store_orders;
  v_retry public.store_orders;
begin
  select * into strict v_order
  from public.place_store_order(
    'f7100000-0000-4000-8000-000000000001',
    'f7300000-0000-4000-8000-000000000001',
    'RF-TASK7-1',
    '{"firstName":"Ada","lastName":"Lovelace","paymentMethod":"bank_transfer"}'::jsonb,
    100, 4.99, 104.99, 'bank_transfer', 'pending', 'REF-TASK7', 'pending',
    '2026-08-24', 'Task-7-Fixture',
    '[{"inventory_item_id":"f7200000-0000-4000-8000-000000000001","item_title":"Checkout Artikel","quantity":1,"price":100,"payment_fee":0}]'::jsonb
  );

  if v_order.id <> 'f7300000-0000-4000-8000-000000000001'::uuid
    or (select count(*) from public.store_order_items where store_order_id = v_order.id) <> 1
    or (select count(*) from public.sales where external_order_id = 'RF-TASK7-1') <> 1
    or (select status from public.inventory_items where id = 'f7200000-0000-4000-8000-000000000001') <> 'sold' then
    raise exception 'Checkout wurde nicht vollständig atomar gespeichert.';
  end if;

  select * into strict v_retry
  from public.place_store_order(
    'f7100000-0000-4000-8000-000000000001',
    'f7300000-0000-4000-8000-000000000001',
    'RF-TASK7-1',
    '{"firstName":"Ada","lastName":"Lovelace","paymentMethod":"bank_transfer"}'::jsonb,
    100, 4.99, 104.99, 'bank_transfer', 'pending', 'REF-TASK7', 'pending',
    '2026-08-24', 'Task-7-Fixture',
    '[{"inventory_item_id":"f7200000-0000-4000-8000-000000000001","item_title":"Checkout Artikel","quantity":1,"price":100,"payment_fee":0}]'::jsonb
  );

  if v_retry.id <> v_order.id
    or (select count(*) from public.store_orders where id = v_order.id) <> 1
    or (select count(*) from public.store_order_items where store_order_id = v_order.id) <> 1
    or (select count(*) from public.sales where external_order_id = 'RF-TASK7-1') <> 1 then
    raise exception 'Idempotenter Checkout-Retry hat Duplikate erzeugt.';
  end if;

  begin
    perform public.place_store_order(
      'f7100000-0000-4000-8000-000000000001',
      'f7300000-0000-4000-8000-000000000099',
      'RF-TASK7-ANDERE-ID',
      '{"firstName":"Grace","lastName":"Hopper","paymentMethod":"bank_transfer"}'::jsonb,
      100, 4.99, 104.99, 'bank_transfer', 'pending', 'REF-TASK7-2', 'pending',
      '2026-08-24', 'Task-7-Zweitversuch',
      '[{"inventory_item_id":"f7200000-0000-4000-8000-000000000001","item_title":"Checkout Artikel","quantity":1,"price":100,"payment_fee":0}]'::jsonb
    );
    raise exception 'Bereits verkaufter Einzelartikel wurde mit anderer Bestell-ID erneut verkauft.';
  exception
    when no_data_found then null;
  end;

  if (select count(*) from public.store_orders where id in (
      'f7300000-0000-4000-8000-000000000001',
      'f7300000-0000-4000-8000-000000000099'
    )) <> 1
    or (select count(*) from public.sales where inventory_item_id = 'f7200000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Zweiter Checkout hat trotz Sperr-/Statusvertrag Duplikate hinterlassen.';
  end if;

  raise notice 'PASS checkout: Parent, Position, Sale, Retry und zweite ID atomar geschützt';
end;
$$;

do $$
begin
  begin
    perform public.place_store_order(
      'f7100000-0000-4000-8000-000000000001',
      'f7300000-0000-4000-8000-000000000002',
      'RF-TASK7-ROLLBACK', '{}'::jsonb,
      50, 0, 50, 'bank_transfer', 'pending', null, 'pending',
      '2026-08-24', 'Rollback',
      '[{"inventory_item_id":"f7200000-0000-4000-8000-000000000002","item_title":"Rollback Artikel","quantity":1,"price":25,"payment_fee":0},{"inventory_item_id":"f7200000-0000-4000-8000-999999999999","item_title":"Fehlt","quantity":1,"price":25,"payment_fee":0}]'::jsonb
    );
    raise exception 'Ungültiger Checkout wurde unerwartet gespeichert.';
  exception
    when no_data_found then null;
  end;

  if exists (select 1 from public.store_orders where id = 'f7300000-0000-4000-8000-000000000002')
    or exists (select 1 from public.sales where external_order_id = 'RF-TASK7-ROLLBACK')
    or (select status from public.inventory_items where id = 'f7200000-0000-4000-8000-000000000002') <> 'ready' then
    raise exception 'Checkout-Rollback hat Teilzustand hinterlassen.';
  end if;
  raise notice 'PASS checkout rollback: kein Teilzustand';
end;
$$;

do $$
declare
  v_count integer;
  v_booked public.bank_transactions;
begin
  select public.replace_bank_transactions(
    'f7100000-0000-4000-8000-000000000001',
    '[{"id":"f7400000-0000-4000-8000-000000000001","booking_date":"2026-08-24","counterparty_name":"Ada","purpose":"RF-TASK7-1","amount":104.99,"currency":"EUR","status":"matched"},{"id":"f7400000-0000-4000-8000-000000000002","booking_date":"2026-08-23","counterparty_name":"Nebenbuchung","purpose":"Test","amount":10,"currency":"EUR","status":"pending"}]'::jsonb
  ) into v_count;
  if v_count <> 2 or (select count(*) from public.bank_transactions where workspace_id = 'f7100000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'Bank-Replace hat nicht zwei Zeilen bestätigt.';
  end if;

  select public.replace_bank_transactions(
    'f7100000-0000-4000-8000-000000000001',
    '[{"id":"f7400000-0000-4000-8000-000000000001","booking_date":"2026-08-24","counterparty_name":"Ada","purpose":"RF-TASK7-1","amount":104.99,"currency":"EUR","status":"matched"}]'::jsonb
  ) into v_count;
  if v_count <> 1 or exists (select 1 from public.bank_transactions where id = 'f7400000-0000-4000-8000-000000000002') then
    raise exception 'Bank-Replace hat entfernte Zeilen nicht atomar bereinigt.';
  end if;

  select * into strict v_booked
  from public.book_bank_transaction(
    'f7100000-0000-4000-8000-000000000001',
    'f7400000-0000-4000-8000-000000000001',
    '2026-08-24 20:00:00+00',
    'f7300000-0000-4000-8000-000000000001'
  );
  if v_booked.status <> 'booked'
    or (select payment_status from public.store_orders where id = 'f7300000-0000-4000-8000-000000000001') <> 'paid' then
    raise exception 'Shop-Zahlungsbuchung wurde nicht atomar bestätigt.';
  end if;
  raise notice 'PASS accounting: Replace und Shop-Zahlungsbuchung atomar';
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform public.replace_bank_transactions(
      'f7100000-0000-4000-8000-000000000001',
      '[]'::jsonb
    );
    raise exception 'Anon-Aufruf wurde unerwartet erlaubt.';
  exception
    when insufficient_privilege then
      raise notice 'PASS execute: anon abgewiesen';
  end;
end;
$$;

reset role;
rollback;
