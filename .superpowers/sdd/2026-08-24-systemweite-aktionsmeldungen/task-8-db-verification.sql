\set ON_ERROR_STOP on

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  'f8000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'task-8-db-verification@localhost.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Task 8 DB Verification"}'::jsonb,
  now(), now(), false, false
);

insert into public.workspaces (id, name) values
  ('f8100000-0000-4000-8000-000000000001', 'Task 8 eigener Workspace'),
  ('f8100000-0000-4000-8000-000000000002', 'Task 8 fremder Workspace');

insert into public.workspace_members (workspace_id, user_id, role) values (
  'f8100000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.inventory_items (id, workspace_id, title, status) values
  ('f8200000-0000-4000-8000-000000000001', 'f8100000-0000-4000-8000-000000000001', 'Rechnungsartikel', 'sold'),
  ('f8200000-0000-4000-8000-000000000002', 'f8100000-0000-4000-8000-000000000002', 'Fremder Artikel', 'sold');

insert into public.sales (id, workspace_id, inventory_item_id, platform, sale_price) values
  ('f8300000-0000-4000-8000-000000000001', 'f8100000-0000-4000-8000-000000000001', 'f8200000-0000-4000-8000-000000000001', 'test', 50),
  ('f8300000-0000-4000-8000-000000000002', 'f8100000-0000-4000-8000-000000000002', 'f8200000-0000-4000-8000-000000000002', 'test', 60);

do $$
begin
  if not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'create_or_get_invoice'
      and procedure.prosecdef = false
      and procedure.proconfig = array['search_path=""']
      and has_function_privilege('authenticated', procedure.oid, 'execute')
      and not has_function_privilege('anon', procedure.oid, 'execute')
      and not has_function_privilege('service_role', procedure.oid, 'execute')
  ) then
    raise exception 'Rechte oder Sicherheitsattribute von create_or_get_invoice sind falsch.';
  end if;
  raise notice 'PASS security: invoker, leerer search_path, execute nur authenticated';
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.create_or_get_invoice(null, null, null, '{}'::jsonb, '[]'::jsonb);
    raise exception 'Anon-Aufruf wurde unerwartet erlaubt.';
  exception when insufficient_privilege then
    raise notice 'PASS execute: anon abgewiesen';
  end;
end;
$$;

reset role;
set local request.jwt.claim.sub = 'f8000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_first jsonb;
  v_retry jsonb;
begin
  select public.create_or_get_invoice(
    'f8100000-0000-4000-8000-000000000001',
    'f8300000-0000-4000-8000-000000000001',
    null,
    '{"invoice_number":"RE-TASK8-1","order_number":"ORDER-TASK8-1","invoice_date":"2026-08-25","delivery_date":"2026-08-25","seller":{"name":"Flipbase"},"buyer":{"name":"Ada"},"subtotal":50,"shipping_cost":0,"total":50,"tax_mode":"diff_25a","payment_method":"test","payment_status":"paid"}'::jsonb,
    '[{"sku":"TASK8","title":"Rechnungsartikel","quantity":1,"unit_price":50,"total_price":50}]'::jsonb
  ) into strict v_first;

  select public.create_or_get_invoice(
    'f8100000-0000-4000-8000-000000000001',
    'f8300000-0000-4000-8000-000000000001',
    null,
    '{"invoice_number":"RE-TASK8-DUPLIKAT","order_number":"ORDER-TASK8-1","invoice_date":"2026-08-25","delivery_date":"2026-08-25","seller":{"name":"Flipbase"},"buyer":{"name":"Ada"},"subtotal":50,"shipping_cost":0,"total":50,"tax_mode":"diff_25a","payment_method":"test","payment_status":"paid"}'::jsonb,
    '[{"title":"Duplikat","quantity":1,"unit_price":50,"total_price":50}]'::jsonb
  ) into strict v_retry;

  if (v_first ->> 'created')::boolean is not true
    or (v_retry ->> 'created')::boolean is not false
    or v_first -> 'invoice' ->> 'id' <> v_retry -> 'invoice' ->> 'id'
    or (select count(*) from public.invoices where sale_id = 'f8300000-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.invoice_items where invoice_id = (v_first -> 'invoice' ->> 'id')::uuid) <> 1
    or v_retry -> 'items' -> 0 ->> 'title' <> 'Rechnungsartikel' then
    raise exception 'Idempotente Rechnung oder Positionen sind falsch: first %, retry %', v_first, v_retry;
  end if;
  raise notice 'PASS idempotency: eine Rechnung, eine bestätigte Position, Retry liefert denselben Beleg';
end;
$$;

do $$
declare
  v_invalid_failed boolean := false;
  v_foreign_failed boolean := false;
begin
  begin
    perform public.create_or_get_invoice(
      'f8100000-0000-4000-8000-000000000001',
      'f8300000-0000-4000-8000-000000000001',
      null,
      '{"invoice_number":"RE-INVALID","order_number":"INVALID","invoice_date":"2026-08-25","delivery_date":"2026-08-25"}'::jsonb,
      '[]'::jsonb
    );
  exception when sqlstate '22023' then v_invalid_failed := true;
  end;

  begin
    perform public.create_or_get_invoice(
      'f8100000-0000-4000-8000-000000000002',
      'f8300000-0000-4000-8000-000000000002',
      null,
      '{"invoice_number":"RE-FOREIGN","order_number":"FOREIGN","invoice_date":"2026-08-25","delivery_date":"2026-08-25"}'::jsonb,
      '[{"title":"Fremd","quantity":1,"unit_price":60,"total_price":60}]'::jsonb
    );
  exception when insufficient_privilege then v_foreign_failed := true;
  end;

  if not v_invalid_failed or not v_foreign_failed then
    raise exception 'Validierung oder fremder Workspace wurde nicht sicher abgewiesen.';
  end if;
  raise notice 'PASS validation/RLS: leere Positionen und fremder Workspace abgewiesen';
end;
$$;

reset role;
rollback;

do $$
begin
  if exists (select 1 from auth.users where id = 'f8000000-0000-4000-8000-000000000001') then
    raise exception 'Fixture-Daten wurden nach rollback gefunden.';
  end if;
  raise notice 'PASS final rollback: keine Fixture-Daten verblieben';
end;
$$;
