\set ON_ERROR_STOP on

begin;

-- Die Fixture legt ihre Ausgangsdaten bewusst als postgres an. Die RPC-Aufrufe
-- und RLS-Pruefungen laufen danach mit dem echten authenticated-Rollen-/JWT-Kontext.
insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values (
  'f6000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'task-6-db-verification@localhost.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Task 6 DB Verification"}'::jsonb,
  now(),
  now(),
  false,
  false
);

insert into public.workspaces (id, name)
values
  ('f6100000-0000-4000-8000-000000000001', 'Task 6 eigener Workspace'),
  ('f6100000-0000-4000-8000-000000000002', 'Task 6 fremder Workspace');

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'f6100000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.inventory_items (id, workspace_id, title)
values (
  'f6200000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000001',
  'Task 6 Testartikel'
);

insert into public.sales (id, workspace_id, inventory_item_id, platform, sale_price)
values
  (
    'f6300000-0000-4000-8000-000000000001',
    'f6100000-0000-4000-8000-000000000001',
    'f6200000-0000-4000-8000-000000000001',
    'test',
    10
  ),
  (
    'f6300000-0000-4000-8000-000000000002',
    'f6100000-0000-4000-8000-000000000001',
    'f6200000-0000-4000-8000-000000000001',
    'test',
    20
  );

insert into public.shipping_orders (
  id,
  workspace_id,
  sale_id,
  order_number,
  order_date,
  platform,
  item_title,
  item_sku,
  item_condition,
  sale_price,
  customer,
  carrier,
  package_type,
  status,
  notes
)
values
  ('f6410000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001', 'SAME-1', '2026-08-24', 'test', 'Gleicher Verkauf 1', 'SAME-1', 'used', 10, '{"name":"Same"}', 'dhl', 'small', 'ready_to_pack', 'same-1'),
  ('f6410000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001', 'SAME-2', '2026-08-24', 'test', 'Gleicher Verkauf 2', 'SAME-2', 'used', 11, '{"name":"Same"}', 'dhl', 'medium', 'ready_to_pack', 'same-2'),
  ('f6420000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001', 'MIXED-1', '2026-08-24', 'test', 'Gemischter Verkauf 1', 'MIXED-1', 'used', 12, '{"name":"Mixed"}', 'dhl', 'small', 'ready_to_pack', 'mixed-1'),
  ('f6420000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000002', 'MIXED-2', '2026-08-24', 'test', 'Gemischter Verkauf 2', 'MIXED-2', 'used', 13, '{"name":"Mixed"}', 'dhl', 'medium', 'ready_to_pack', 'mixed-2'),
  ('f6430000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001', 'NULL-1', '2026-08-24', 'test', 'Null Verkauf 1', 'NULL-1', 'used', 14, '{"name":"Null"}', 'dhl', 'small', 'ready_to_pack', 'null-1'),
  ('f6430000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000001', null, 'NULL-2', '2026-08-24', 'test', 'Null Verkauf 2', 'NULL-2', 'used', 15, '{"name":"Null"}', 'dhl', 'medium', 'ready_to_pack', 'null-2'),
  ('f6440000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001', 'ROLLBACK-1', '2026-08-24', 'test', 'Rollback 1', 'ROLLBACK-1', 'used', 16, '{"name":"Rollback"}', 'dhl', 'small', 'ready_to_pack', 'rollback-1'),
  ('f6440000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001', 'ROLLBACK-2', '2026-08-24', 'test', 'Rollback 2', 'ROLLBACK-2', 'used', 17, '{"name":"Rollback"}', 'dhl', 'medium', 'ready_to_pack', 'rollback-2'),
  ('f6450000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001', 'TAMPER-1', '2026-08-24', 'test', 'Manipulation 1', 'TAMPER-1', 'used', 18, '{"name":"Tamper"}', 'dhl', 'small', 'ready_to_pack', 'tamper-1'),
  ('f6450000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001', 'TAMPER-2', '2026-08-24', 'test', 'Manipulation 2', 'TAMPER-2', 'used', 19, '{"name":"Tamper"}', 'dhl', 'medium', 'ready_to_pack', 'tamper-2'),
  ('f6490000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000002', null, 'FOREIGN-1', '2026-08-24', 'test', 'Fremd 1', 'FOREIGN-1', 'used', 20, '{"name":"Foreign"}', 'dhl', 'small', 'ready_to_pack', 'foreign-1'),
  ('f6490000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000002', null, 'FOREIGN-2', '2026-08-24', 'test', 'Fremd 2', 'FOREIGN-2', 'used', 21, '{"name":"Foreign"}', 'dhl', 'medium', 'ready_to_pack', 'foreign-2');

do $$
begin
  if not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'bundle_shipping_orders'
      and procedure.prosecdef = false
      and procedure.proconfig = array['search_path=""']
      and has_function_privilege('authenticated', procedure.oid, 'execute')
      and not has_function_privilege('anon', procedure.oid, 'execute')
      and not has_function_privilege('service_role', procedure.oid, 'execute')
  ) then
    raise exception 'Rechte oder Sicherheitsattribute von bundle_shipping_orders sind falsch.';
  end if;

  if not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'unbundle_shipping_order'
      and procedure.prosecdef = false
      and procedure.proconfig = array['search_path=""']
      and has_function_privilege('authenticated', procedure.oid, 'execute')
      and not has_function_privilege('anon', procedure.oid, 'execute')
      and not has_function_privilege('service_role', procedure.oid, 'execute')
  ) then
    raise exception 'Rechte oder Sicherheitsattribute von unbundle_shipping_order sind falsch.';
  end if;

  raise notice 'PASS security: invoker, leerer search_path, execute nur authenticated';
end;
$$;

set local role anon;

do $$
begin
  begin
    perform *
    from public.unbundle_shipping_order(
      'f6100000-0000-4000-8000-000000000001',
      'f6450000-0000-4000-8000-000000000001'
    );
    raise exception 'Anon-Aufruf wurde unerwartet erlaubt.';
  exception
    when insufficient_privilege then
      raise notice 'PASS execute: anon wird mit SQLSTATE % verweigert', sqlstate;
  end;
end;
$$;

reset role;
set local request.jwt.claim.sub = 'f6000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"f6000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_bundle_missing boolean := false;
  v_unbundle_missing boolean := false;
begin
  begin
    perform *
    from public.bundle_shipping_orders(
      'f6100000-0000-4000-8000-000000000001',
      array['f6410000-0000-4000-8000-000000000001', 'f6410000-0000-4000-8000-999999999999']::uuid[],
      'BUNDLE-MISSING', '2026-08-24', 'test', 'Fehlende Quelle', 'BUNDLE-MISSING', 'used', 10,
      '{"name":"Missing"}'::jsonb, 'dhl', 'small', array['Vorhanden', 'Fehlt'], 'missing'
    );
  exception
    when no_data_found then
      v_bundle_missing := true;
  end;

  begin
    perform *
    from public.unbundle_shipping_order(
      'f6100000-0000-4000-8000-000000000001',
      'f6480000-0000-4000-8000-999999999999'
    );
  exception
    when no_data_found then
      v_unbundle_missing := true;
  end;

  if not v_bundle_missing or not v_unbundle_missing then
    raise exception 'Nicht-gefunden-Pfade liefern nicht SQLSTATE P0002.';
  end if;
  raise notice 'PASS missing contract: Bundle und Unbundle liefern SQLSTATE P0002';
end;
$$;

do $$
declare
  v_bundle public.shipping_orders;
  v_reloaded public.shipping_orders;
  v_expected jsonb;
  v_restored jsonb;
  v_restored_count integer;
begin
  select * into strict v_bundle
  from public.bundle_shipping_orders(
    'f6100000-0000-4000-8000-000000000001',
    array['f6410000-0000-4000-8000-000000000001', 'f6410000-0000-4000-8000-000000000002']::uuid[],
    'BUNDLE-SAME',
    '2026-08-24',
    'test',
    'Bundle gleicher Verkauf',
    'BUNDLE-SAME',
    'used',
    21,
    '{"name":"Same"}'::jsonb,
    'dhl',
    'medium',
    array['Gleicher Verkauf 1', 'Gleicher Verkauf 2'],
    'bundle-same'
  );

  if v_bundle.id is null
    or v_bundle.id = any(array['f6410000-0000-4000-8000-000000000001', 'f6410000-0000-4000-8000-000000000002']::uuid[])
    or v_bundle.sale_id is distinct from 'f6300000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Bundle-UUID oder gemeinsame sale_id ist falsch: %', to_jsonb(v_bundle);
  end if;

  if exists (
    select 1 from public.shipping_orders
    where id = any(array['f6410000-0000-4000-8000-000000000001', 'f6410000-0000-4000-8000-000000000002']::uuid[])
  ) then
    raise exception 'Quellauftraege sind nach dem Bundle noch vorhanden.';
  end if;

  select * into strict v_reloaded
  from public.shipping_orders
  where id = v_bundle.id;

  if to_jsonb(v_reloaded) is distinct from to_jsonb(v_bundle) then
    raise exception 'RPC-Rueckgabe und Reload unterscheiden sich.';
  end if;

  select jsonb_agg(snapshot.order_row order by snapshot.order_row ->> 'id')
  into v_expected
  from jsonb_array_elements(v_bundle.bundled_orders_snapshot) as snapshot(order_row);

  select jsonb_agg(to_jsonb(restored) order by restored.id::text), count(*)
  into v_restored, v_restored_count
  from public.unbundle_shipping_order(
    'f6100000-0000-4000-8000-000000000001',
    v_bundle.id
  ) as restored;

  if v_restored_count <> 2 or v_restored is distinct from v_expected then
    raise exception 'Unbundle hat Snapshot, IDs oder Workspace nicht exakt wiederhergestellt.';
  end if;

  if exists (select 1 from public.shipping_orders where id = v_bundle.id) then
    raise exception 'Bundle ist nach Unbundle noch vorhanden.';
  end if;

  raise notice 'PASS same sale_id: %, echte Bundle-UUID: %, Reload/Restore: exakt', v_bundle.sale_id, v_bundle.id;
end;
$$;

do $$
declare
  v_bundle public.shipping_orders;
begin
  select * into strict v_bundle
  from public.bundle_shipping_orders(
    'f6100000-0000-4000-8000-000000000001',
    array['f6420000-0000-4000-8000-000000000001', 'f6420000-0000-4000-8000-000000000002']::uuid[],
    'BUNDLE-MIXED', '2026-08-24', 'test', 'Bundle gemischt', 'BUNDLE-MIXED', 'used', 25,
    '{"name":"Mixed"}'::jsonb, 'dhl', 'medium', array['Mixed 1', 'Mixed 2'], 'bundle-mixed'
  );

  if v_bundle.sale_id is not null then
    raise exception 'Gemischte sale_ids wurden nicht null: %', v_bundle.sale_id;
  end if;

  perform * from public.unbundle_shipping_order('f6100000-0000-4000-8000-000000000001', v_bundle.id);
  raise notice 'PASS mixed sale_ids: null';
end;
$$;

do $$
declare
  v_bundle public.shipping_orders;
begin
  select * into strict v_bundle
  from public.bundle_shipping_orders(
    'f6100000-0000-4000-8000-000000000001',
    array['f6430000-0000-4000-8000-000000000001', 'f6430000-0000-4000-8000-000000000002']::uuid[],
    'BUNDLE-NULL', '2026-08-24', 'test', 'Bundle null', 'BUNDLE-NULL', 'used', 29,
    '{"name":"Null"}'::jsonb, 'dhl', 'medium', array['Null 1', 'Null 2'], 'bundle-null'
  );

  if v_bundle.sale_id is not null then
    raise exception 'Teilweise leere sale_ids wurden nicht null: %', v_bundle.sale_id;
  end if;

  perform * from public.unbundle_shipping_order('f6100000-0000-4000-8000-000000000001', v_bundle.id);
  raise notice 'PASS null sale_id: null';
end;
$$;

do $$
declare
  v_bundle public.shipping_orders;
  v_failed boolean := false;
begin
  select * into strict v_bundle
  from public.bundle_shipping_orders(
    'f6100000-0000-4000-8000-000000000001',
    array['f6440000-0000-4000-8000-000000000001', 'f6440000-0000-4000-8000-000000000002']::uuid[],
    'BUNDLE-ROLLBACK', '2026-08-24', 'test', 'Bundle rollback', 'BUNDLE-ROLLBACK', 'used', 33,
    '{"name":"Rollback"}'::jsonb, 'dhl', 'medium', array['Rollback 1', 'Rollback 2'], 'bundle-rollback'
  );

  insert into public.shipping_orders (
    id, workspace_id, sale_id, order_number, platform, item_title, sale_price, customer, carrier, package_type, notes
  )
  values (
    'f6440000-0000-4000-8000-000000000001',
    'f6100000-0000-4000-8000-000000000001',
    'f6300000-0000-4000-8000-000000000001',
    'ROLLBACK-COLLISION',
    'test',
    'Absichtliche ID-Kollision',
    99,
    '{"name":"Collision"}'::jsonb,
    'dhl',
    'small',
    'collision'
  );

  begin
    perform *
    from public.unbundle_shipping_order(
      'f6100000-0000-4000-8000-000000000001',
      v_bundle.id
    );
  exception
    when unique_violation then
      v_failed := true;
  end;

  if not v_failed
    or not exists (select 1 from public.shipping_orders where id = v_bundle.id)
    or exists (select 1 from public.shipping_orders where id = 'f6440000-0000-4000-8000-000000000002')
    or (select notes from public.shipping_orders where id = 'f6440000-0000-4000-8000-000000000001') <> 'collision' then
    raise exception 'Der absichtliche Unbundle-Fehler wurde nicht vollstaendig zurueckgerollt.';
  end if;

  delete from public.shipping_orders where id = 'f6440000-0000-4000-8000-000000000001';
  perform * from public.unbundle_shipping_order('f6100000-0000-4000-8000-000000000001', v_bundle.id);
  raise notice 'PASS statement rollback: SQLSTATE 23505, Bundle und Kollisionszeile unveraendert';
end;
$$;

do $$
declare
  v_bundle public.shipping_orders;
  v_valid_snapshot jsonb;
  v_failed boolean := false;
begin
  select * into strict v_bundle
  from public.bundle_shipping_orders(
    'f6100000-0000-4000-8000-000000000001',
    array['f6450000-0000-4000-8000-000000000001', 'f6450000-0000-4000-8000-000000000002']::uuid[],
    'BUNDLE-TAMPER', '2026-08-24', 'test', 'Bundle Manipulation', 'BUNDLE-TAMPER', 'used', 37,
    '{"name":"Tamper"}'::jsonb, 'dhl', 'medium', array['Tamper 1', 'Tamper 2'], 'bundle-tamper'
  );

  v_valid_snapshot := v_bundle.bundled_orders_snapshot;

  update public.shipping_orders
  set bundled_orders_snapshot = jsonb_set(
    bundled_orders_snapshot,
    '{0,workspace_id}',
    '"f6100000-0000-4000-8000-000000000002"'::jsonb
  )
  where id = v_bundle.id;

  begin
    perform *
    from public.unbundle_shipping_order(
      'f6100000-0000-4000-8000-000000000001',
      v_bundle.id
    );
  exception
    when sqlstate '22023' then
      v_failed := true;
  end;

  if not v_failed or not exists (select 1 from public.shipping_orders where id = v_bundle.id) then
    raise exception 'Manipulierter Snapshot wurde nicht sicher abgewiesen.';
  end if;

  update public.shipping_orders
  set bundled_orders_snapshot = v_valid_snapshot
  where id = v_bundle.id;

  perform * from public.unbundle_shipping_order('f6100000-0000-4000-8000-000000000001', v_bundle.id);
  raise notice 'PASS snapshot manipulation: SQLSTATE 22023, Bundle bleibt erhalten';
end;
$$;

do $$
declare
  v_visible integer;
  v_rpc_denied boolean := false;
  v_insert_denied boolean := false;
begin
  select count(*) into v_visible
  from public.shipping_orders
  where workspace_id = 'f6100000-0000-4000-8000-000000000002';

  begin
    perform *
    from public.bundle_shipping_orders(
      'f6100000-0000-4000-8000-000000000002',
      array['f6490000-0000-4000-8000-000000000001', 'f6490000-0000-4000-8000-000000000002']::uuid[],
      'BUNDLE-FOREIGN', '2026-08-24', 'test', 'Bundle fremd', 'BUNDLE-FOREIGN', 'used', 41,
      '{"name":"Foreign"}'::jsonb, 'dhl', 'medium', array['Foreign 1', 'Foreign 2'], 'bundle-foreign'
    );
  exception
    when insufficient_privilege then
      v_rpc_denied := true;
  end;

  begin
    insert into public.shipping_orders (
      workspace_id, order_number, platform, item_title, sale_price, customer, carrier, package_type
    )
    values (
      'f6100000-0000-4000-8000-000000000002',
      'FOREIGN-RLS-INSERT',
      'test',
      'Fremder RLS-Insert',
      42,
      '{}'::jsonb,
      'dhl',
      'small'
    );
  exception
    when insufficient_privilege then
      v_insert_denied := true;
  end;

  if v_visible <> 0 or not v_rpc_denied or not v_insert_denied then
    raise exception 'Fremder Workspace wurde nicht vollstaendig durch RLS/RPC geschuetzt.';
  end if;

  raise notice 'PASS foreign workspace: 0 sichtbare Zeilen, RPC und RLS-Insert SQLSTATE 42501';
end;
$$;

reset role;
rollback;

do $$
begin
  if exists (
    select 1 from auth.users
    where id = 'f6000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Fixture-Daten wurden nach ROLLBACK gefunden.';
  end if;

  raise notice 'PASS final rollback: keine Fixture-Daten verblieben';
end;
$$;
