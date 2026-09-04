\set ON_ERROR_STOP on

begin;

select plan(83);

select has_column('public', 'purchases', 'entry_status', 'Einkäufe haben einen Erfassungsstatus');
select has_column('public', 'purchases', 'finalized_at', 'Einkäufe speichern den Finalisierungszeitpunkt');
select has_column('public', 'purchases', 'finalized_by', 'Einkäufe speichern die finalisierende Person');
select has_column('public', 'purchase_lines', 'price_mode', 'Einkaufspositionen haben einen Preismodus');
select has_column('public', 'purchase_lines', 'estimated_market_value', 'Einkaufspositionen speichern einen geschätzten Marktwert');
select has_column('public', 'purchase_lines', 'allocated_total_cost', 'Einkaufspositionen speichern zugeordnete Gesamtkosten');
select has_column('public', 'purchase_costs', 'workspace_id', 'Zusatzkosten sind einem Workspace zugeordnet');
select has_column('public', 'purchase_costs', 'allocation_method', 'Zusatzkosten haben eine Verteilungsmethode');
select has_column('public', 'purchase_costs', 'target_purchase_line_id', 'Direkte Zusatzkosten referenzieren eine Einkaufsposition');
select has_column(
  'public',
  'sale_line_lot_allocations',
  'consumption_sequence',
  'Losentnahmen speichern eine fachliche Reihenfolge'
);
select has_column(
  'public',
  'sale_line_lot_allocations',
  'active_allocated_cost',
  'Losentnahmen trennen historische von weiterhin aktiven Kosten'
);

select is(
  (
    select column_info.is_nullable::text
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sale_line_lot_allocations'
      and column_info.column_name = 'consumption_sequence'
  ),
  'YES'::text,
  'die Entnahmereihenfolge bleibt fuer kontrolliert zu pruefende Altdaten nullable'
);

select is(
  (
    select column_info.is_nullable::text
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sale_line_lot_allocations'
      and column_info.column_name = 'active_allocated_cost'
  ),
  'YES'::text,
  'aktive Kosten bleiben fuer kontrolliert zu pruefende Altdaten nullable'
);

select is(
  (
    select pg_catalog.jsonb_agg(constraint_info.conname order by constraint_info.conname)
    from pg_catalog.pg_constraint as constraint_info
    join pg_catalog.pg_class as relation on relation.oid = constraint_info.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sale_line_lot_allocations'
      and constraint_info.conname in (
        'sale_line_lot_allocations_active_allocated_cost_check',
        'sale_line_lot_allocations_consumption_sequence_check',
        'sale_line_lot_allocations_lot_consumption_sequence_key'
      )
  ),
  '[
    "sale_line_lot_allocations_active_allocated_cost_check",
    "sale_line_lot_allocations_consumption_sequence_check",
    "sale_line_lot_allocations_lot_consumption_sequence_key"
  ]'::jsonb,
  'Sequenz und aktive Kosten sind durch benannte Constraints abgesichert'
);

select is(
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_indexes as index_info
    where index_info.schemaname = 'public'
      and index_info.tablename = 'sale_line_lot_allocations'
      and index_info.indexname = 'sale_line_lot_allocations_lot_consumption_sequence_key'
      and index_info.indexdef ilike '%unique%stock_lot_id%consumption_sequence%'
  ),
  1::bigint,
  'die Entnahmereihenfolge ist je Lagerlos eindeutig indiziert'
);

select has_trigger(
  'public',
  'sale_line_lot_allocations',
  'protect_sale_line_lot_allocation_sequence',
  'eine vergebene Entnahmereihenfolge ist serverseitig geschuetzt'
);

select ok(
  (
    select pg_catalog.count(*) = 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    join pg_catalog.pg_roles as owner_role on owner_role.oid = routine.proowner
    where namespace.nspname = 'public'
      and routine.proname = 'guard_sale_line_lot_allocation_sequence'
      and owner_role.rolname = 'postgres'
      and not routine.prosecdef
      and 'search_path=""' = any(coalesce(routine.proconfig, array[]::text[]))
      and not has_function_privilege('authenticated', routine.oid, 'execute')
      and not has_function_privilege('anon', routine.oid, 'execute')
      and not has_function_privilege('service_role', routine.oid, 'execute')
  ),
  'der Sequenz-Guard ist eng gehaertet und fuer Clients nicht direkt ausfuehrbar'
);

select ok(
  not has_table_privilege('authenticated', 'public.sale_line_lot_allocations', 'insert')
  and not has_table_privilege('authenticated', 'public.sale_line_lot_allocations', 'update')
  and not has_table_privilege('authenticated', 'public.sale_line_lot_allocations', 'delete')
  and not has_table_privilege('anon', 'public.sale_line_lot_allocations', 'insert')
  and not has_table_privilege('anon', 'public.sale_line_lot_allocations', 'update')
  and not has_table_privilege('anon', 'public.sale_line_lot_allocations', 'delete'),
  'öffentliche Clientrollen können Losentnahmereihenfolge oder aktive Kosten nicht direkt manipulieren'
);

select is(
  (
    select column_info.is_nullable::text
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'purchases'
      and column_info.column_name = 'purchase_price'
  ),
  'YES'::text,
  'der Entwurfs-Kopfpreis ist nullable und unterscheidet unbekannt von kostenlos'
);

select ok(
  (
    select column_info.column_default is null
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'purchases'
      and column_info.column_name = 'purchase_price'
  ),
  'ein ausgelassener Kopfpreis erhält keinen impliziten Nullpreis als Default'
);

select is(
  (
    select column_info.is_nullable::text
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'purchases'
      and column_info.column_name = 'total_purchase_cost'
  ),
  'YES'::text,
  'abgeleitete Gesamtkosten bleiben bis zur atomaren Finalisierung nullable'
);

select ok(
  (
    select column_info.column_default is null
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'purchases'
      and column_info.column_name = 'total_purchase_cost'
  ),
  'Draft-Gesamtkosten erhalten keinen impliziten numerischen Default'
);

select is(
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(relation.relname, trigger_info.tgname)
      order by relation.relname, trigger_info.tgname
    )
    from pg_catalog.pg_trigger as trigger_info
    join pg_catalog.pg_class as relation on relation.oid = trigger_info.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and not trigger_info.tgisinternal
      and trigger_info.tgname in (
        'protect_inventory_item_costing_fields',
        'protect_purchase_cost_mutation',
        'protect_purchase_costing_fields',
        'protect_purchase_line_costing_fields',
        'protect_stock_lot_costing_fields'
      )
  ),
  '[
    ["inventory_items", "protect_inventory_item_costing_fields"],
    ["purchase_costs", "protect_purchase_cost_mutation"],
    ["purchase_lines", "protect_purchase_line_costing_fields"],
    ["purchases", "protect_purchase_costing_fields"],
    ["stock_lots", "protect_stock_lot_costing_fields"]
  ]'::jsonb,
  'enge serverseitige Guards schützen alle direkt erreichbaren Costing-Flächen'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_trigger as trigger_info
    join pg_catalog.pg_class as relation on relation.oid = trigger_info.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and not trigger_info.tgisinternal
      and trigger_info.tgname in (
        'protect_inventory_item_costing_fields',
        'protect_purchase_cost_mutation'
      )
      and trigger_info.tgtype = 31
  ),
  2::bigint,
  'Kostenzeilen- und Inventory-Guards decken INSERT, UPDATE und DELETE zeilenweise ab'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    join pg_catalog.pg_roles as owner_role on owner_role.oid = routine.proowner
    where namespace.nspname = 'public'
      and routine.proname in (
        'guard_inventory_item_costing_fields',
        'guard_purchase_cost_mutation',
        'guard_purchase_costing_fields',
        'guard_purchase_line_costing_fields',
        'guard_stock_lot_costing_fields'
      )
      and owner_role.rolname = 'postgres'
      and not routine.prosecdef
      and 'search_path=""' = any(coalesce(routine.proconfig, array[]::text[]))
  ),
  5::bigint,
  'Guard-Funktionen sind postgres-owned Security-Invoker mit leerem search_path'
);

select ok(
  has_table_privilege('authenticated', 'public.purchases', 'insert')
  and has_table_privilege('authenticated', 'public.purchases', 'update')
  and has_table_privilege('authenticated', 'public.purchase_costs', 'insert')
  and has_table_privilege('authenticated', 'public.purchase_costs', 'update')
  and has_table_privilege('authenticated', 'public.purchase_lines', 'select')
  and not has_table_privilege('authenticated', 'public.purchase_lines', 'insert')
  and not has_table_privilege('authenticated', 'public.purchase_lines', 'update')
  and not has_table_privilege('authenticated', 'public.purchase_lines', 'delete')
  and has_table_privilege('authenticated', 'public.inventory_items', 'update'),
  'authenticated darf nur die mit Geld-Constraints geschützten Kopfdaten und Kosten direkt schreiben; Einkaufspositionen ausschließlich über Business-RPCs'
);

select ok(
  not has_table_privilege('authenticated', 'public.stock_lots', 'insert')
  and not has_table_privilege('authenticated', 'public.stock_lots', 'update')
  and not has_table_privilege('authenticated', 'public.stock_lots', 'delete')
  and not has_table_privilege('authenticated', 'public.stock_movements', 'insert')
  and not has_table_privilege('authenticated', 'public.stock_movements', 'update')
  and not has_table_privilege('authenticated', 'public.stock_movements', 'delete'),
  'authenticated besitzt weiterhin keine direkten Schreibrechte auf Lose oder Bewegungen'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.cmd = 'UPDATE'
      and policy.tablename in ('purchases', 'purchase_lines', 'inventory_items')
  ),
  3::bigint,
  'RLS lässt genau die drei triggergeprüften Draft-Updatepfade für Workspace-Mitglieder offen'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    join pg_catalog.pg_roles as owner_role on owner_role.oid = routine.proowner
    where namespace.nspname = 'public'
      and routine.proname in (
        'add_purchase_lines',
        'create_purchase',
        'finalize_purchase_costing',
        'receive_individual_purchase_line',
        'receive_purchase_lines'
      )
      and owner_role.rolname = 'postgres'
      and routine.prosecdef
      and 'search_path=""' = any(coalesce(routine.proconfig, array[]::text[]))
  ),
  5::bigint,
  'alle Costing-Write-RPCs laufen gehärtet unter dem festen postgres-Owner'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname in (
        'add_purchase_lines',
        'create_purchase',
        'finalize_purchase_costing',
        'receive_individual_purchase_line',
        'receive_purchase_lines'
      )
      and has_function_privilege('authenticated', routine.oid, 'execute')
      and not has_function_privilege('anon', routine.oid, 'execute')
      and not has_function_privilege('service_role', routine.oid, 'execute')
  ),
  5::bigint,
  'Costing-Write-RPCs sind ausschließlich für authenticated ausführbar'
);

insert into public.workspaces (id, name)
values
  ('91000000-0000-4000-8000-000000000001', 'Kosten-Workspace eins'),
  ('91000000-0000-4000-8000-000000000002', 'Kosten-Workspace zwei');

insert into public.purchases (id, workspace_id, type, title)
values
  ('91000000-0000-4000-8000-000000000011', '91000000-0000-4000-8000-000000000001', 'single', 'Kosten-Einkauf eins'),
  ('91000000-0000-4000-8000-000000000012', '91000000-0000-4000-8000-000000000002', 'single', 'Kosten-Einkauf zwei');

select throws_ok(
  $$
    insert into public.purchases (
      id, workspace_id, type, title, purchase_price
    ) values (
      '91000000-0000-4000-8000-000000000051',
      '91000000-0000-4000-8000-000000000001',
      'single', 'Kaufpreis mit Teilcent', 1.001
    )
  $$,
  '23514', null,
  'direkte Tabellenwrites können Kaufpreise mit Teilcent nicht still runden'
);

select throws_ok(
  $$
    insert into public.purchases (
      id, workspace_id, type, title, purchase_price
    ) values (
      '91000000-0000-4000-8000-000000000052',
      '91000000-0000-4000-8000-000000000001',
      'single', 'Negativer Kaufpreis', -0.01
    )
  $$,
  '23514', null,
  'direkte Tabellenwrites lehnen negative Kaufpreise ab'
);

select throws_ok(
  $$
    insert into public.purchases (
      id, workspace_id, type, title, purchase_price
    ) values (
      '91000000-0000-4000-8000-000000000053',
      '91000000-0000-4000-8000-000000000001',
      'single', 'NaN-Kaufpreis', 'NaN'::numeric
    )
  $$,
  '23514', null,
  'direkte Tabellenwrites lehnen NaN als Kaufpreis ab'
);

select throws_ok(
  $$
    insert into public.purchase_costs (
      id, workspace_id, purchase_id, type, amount
    ) values (
      '91000000-0000-4000-8000-000000000061',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011',
      'shipping', 1.001
    )
  $$,
  '23514', null,
  'direkte Tabellenwrites können Zusatzkosten mit Teilcent nicht still runden'
);

select throws_ok(
  $$
    insert into public.purchase_costs (
      id, workspace_id, purchase_id, type, amount
    ) values (
      '91000000-0000-4000-8000-000000000062',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011',
      'shipping', -0.01
    )
  $$,
  '23514', null,
  'direkte Tabellenwrites lehnen negative Zusatzkosten ab'
);

select throws_ok(
  $$
    insert into public.purchase_costs (
      id, workspace_id, purchase_id, type, amount
    ) values (
      '91000000-0000-4000-8000-000000000063',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011',
      'shipping', 0
    )
  $$,
  '23514', null,
  'direkte Tabellenwrites lehnen leere Zusatzkostenzeilen ab'
);

select throws_ok(
  $$
    insert into public.purchase_costs (
      id, workspace_id, purchase_id, type, amount
    ) values (
      '91000000-0000-4000-8000-000000000064',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011',
      'shipping', 'NaN'::numeric
    )
  $$,
  '23514', null,
  'direkte Tabellenwrites lehnen NaN als Zusatzkosten ab'
);

select lives_ok(
  $$
    insert into public.purchase_lines (
      id, workspace_id, purchase_id, title_snapshot, line_kind,
      ordered_quantity, price_mode, unit_purchase_price, line_total
    ) values (
      '91000000-0000-4000-8000-000000000021',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011',
      'Bepreiste Position', 'individual', 2, 'priced', 4.50, 9.00
    )
  $$,
  'bepreiste Einkaufsposition mit Geldwerten ist gültig'
);

select lives_ok(
  $$
    insert into public.purchase_lines (
      id, workspace_id, purchase_id, title_snapshot, line_kind,
      ordered_quantity, price_mode, unit_purchase_price, line_total
    ) values (
      '91000000-0000-4000-8000-000000000022',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011',
      'Unbepreiste Überraschungsposition', 'individual', 1,
      'unpriced_mystery', null, null
    )
  $$,
  'unbepreiste Überraschungsposition ohne Geldwerte ist gültig'
);

select throws_ok(
  $$
    insert into public.purchase_lines (
      workspace_id, purchase_id, title_snapshot, line_kind,
      ordered_quantity, price_mode, unit_purchase_price, line_total
    ) values (
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011',
      'Fehlender Preis', 'individual', 1, 'priced', null, null
    )
  $$,
  '23514', null,
  'bepreiste Einkaufsposition ohne Geldwerte wird abgelehnt'
);

select throws_ok(
  $$
    insert into public.purchase_lines (
      workspace_id, purchase_id, title_snapshot, line_kind,
      ordered_quantity, price_mode, unit_purchase_price, line_total
    ) values (
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011',
      'Ungültiger Überraschungspreis', 'individual', 1,
      'unpriced_mystery', 0, 0
    )
  $$,
  '23514', null,
  'unbepreiste Überraschungsposition mit Geldwerten wird abgelehnt'
);

select lives_ok(
  $$
    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, allocation_method,
      target_purchase_line_id
    ) values (
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011', 'shipping', 2.50,
      'direct', '91000000-0000-4000-8000-000000000021'
    )
  $$,
  'direkte Zusatzkosten im selben Workspace sind gültig'
);

select throws_ok(
  $$
    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, allocation_method
    ) values (
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011', 'shipping', 2.50, 'direct'
    )
  $$,
  '23514', null,
  'direkte Zusatzkosten ohne Zielposition werden abgelehnt'
);

select throws_ok(
  $$
    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, allocation_method,
      target_purchase_line_id
    ) values (
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011', 'shipping', 2.50,
      'quantity', '91000000-0000-4000-8000-000000000021'
    )
  $$,
  '23514', null,
  'nicht direkte Zusatzkosten mit Zielposition werden abgelehnt'
);

select lives_ok(
  $$
    insert into public.purchase_lines (
      id, workspace_id, purchase_id, title_snapshot, line_kind,
      ordered_quantity, price_mode, unit_purchase_price, line_total
    ) values (
      '91000000-0000-4000-8000-000000000023',
      '91000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-000000000012',
      'Fremde Position', 'individual', 1, 'priced', 1, 1
    )
  $$,
  'bepreiste Position eines zweiten Workspace ist gültig'
);

select throws_ok(
  $$
    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, allocation_method,
      target_purchase_line_id
    ) values (
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000011', 'shipping', 2.50,
      'direct', '91000000-0000-4000-8000-000000000023'
    )
  $$,
  '23503', null,
  'direkte Zusatzkosten dürfen keine fremde Workspace-Position referenzieren'
);

select has_table('public', 'business_events', 'das fachliche Ereignisjournal existiert');

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'business_events'
  ),
  'RLS ist für das fachliche Ereignisjournal aktiviert'
);

select has_index(
  'public',
  'business_events',
  'business_events_workspace_created_id_idx',
  'der globale Verlauf hat einen Workspace-Keyset-Index'
);

select has_index(
  'public',
  'business_events',
  'business_events_entity_created_id_idx',
  'der Datensatzverlauf hat einen Entity-Keyset-Index'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'business_events'
  ),
  0::bigint,
  'das Ereignisjournal besitzt keine direkten Client-Policies'
);

select ok(
  not has_table_privilege('authenticated', 'public.business_events', 'select'),
  'authentifizierte Clients dürfen das Ereignisjournal nicht direkt lesen'
);

select ok(
  not has_table_privilege('authenticated', 'public.business_events', 'insert'),
  'authentifizierte Clients dürfen Ereignisse nicht direkt anlegen'
);

select ok(
  not has_table_privilege('authenticated', 'public.business_events', 'update'),
  'authentifizierte Clients dürfen Ereignisse nicht direkt ändern'
);

select ok(
  not has_table_privilege('authenticated', 'public.business_events', 'delete'),
  'authentifizierte Clients dürfen Ereignisse nicht direkt löschen'
);

select ok(
  not has_table_privilege('authenticated', 'public.business_events', 'truncate'),
  'authentifizierte Clients dürfen das Ereignisjournal nicht leeren'
);

select ok(
  not has_table_privilege('anon', 'public.business_events', 'select')
  and not has_table_privilege('anon', 'public.business_events', 'insert')
  and not has_table_privilege('anon', 'public.business_events', 'update')
  and not has_table_privilege('anon', 'public.business_events', 'delete')
  and not has_table_privilege('anon', 'public.business_events', 'truncate'),
  'anonyme Clients besitzen keinerlei direkten Tabellenzugriff'
);

select has_function(
  'public',
  'list_business_events',
  array['uuid', 'jsonb', 'timestamp with time zone', 'uuid', 'integer'],
  'der globale Verlauf wird als paginierte RPC angeboten'
);

select has_function(
  'public',
  'list_entity_business_events',
  array['uuid', 'text', 'uuid', 'timestamp with time zone', 'uuid', 'integer'],
  'der Datensatzverlauf wird als paginierte RPC angeboten'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_business_events(uuid,jsonb,timestamp with time zone,uuid,integer)',
    'execute'
  ),
  'authentifizierte Benutzer dürfen die geschützte globale RPC aufrufen'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_business_events(uuid,jsonb,timestamp with time zone,uuid,integer)',
    'execute'
  ),
  'anonyme Benutzer dürfen die geschützte globale RPC nicht aufrufen'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_entity_business_events(uuid,text,uuid,timestamp with time zone,uuid,integer)',
    'execute'
  ),
  'authentifizierte Benutzer dürfen die geschützte Datensatz-RPC aufrufen'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_entity_business_events(uuid,text,uuid,timestamp with time zone,uuid,integer)',
    'execute'
  ),
  'anonyme Benutzer dürfen die geschützte Datensatz-RPC nicht aufrufen'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('92000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'event-owner@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'event-admin@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('92000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'event-accountant@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('92000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'event-member@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('92000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'event-outsider@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.workspaces (id, name) values
  ('92000000-0000-4000-8000-000000000011', 'Ereignis-Workspace eins'),
  ('92000000-0000-4000-8000-000000000012', 'Ereignis-Workspace zwei');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('92000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000001', 'owner'),
  ('92000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000002', 'admin'),
  ('92000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000003', 'accountant'),
  ('92000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000004', 'member'),
  ('92000000-0000-4000-8000-000000000012', '92000000-0000-4000-8000-000000000005', 'owner');

insert into public.purchases (id, workspace_id, type, title) values
  ('92000000-0000-4000-8000-000000000021', '92000000-0000-4000-8000-000000000011', 'single', 'Journal-Einkauf eins'),
  ('92000000-0000-4000-8000-000000000022', '92000000-0000-4000-8000-000000000012', 'single', 'Journal-Einkauf zwei');

insert into public.inventory_items (id, workspace_id, purchase_id, title) values (
  '92000000-0000-4000-8000-000000000031',
  '92000000-0000-4000-8000-000000000011',
  '92000000-0000-4000-8000-000000000021',
  'Journal-Inventarartikel'
);

insert into public.sales (id, workspace_id, inventory_item_id, platform) values (
  '92000000-0000-4000-8000-000000000041',
  '92000000-0000-4000-8000-000000000011',
  '92000000-0000-4000-8000-000000000031',
  'test'
);

insert into public.returns (
  id, workspace_id, sale_id, inventory_item_id, credit_note_number, reason
) values (
  '92000000-0000-4000-8000-000000000051',
  '92000000-0000-4000-8000-000000000011',
  '92000000-0000-4000-8000-000000000041',
  '92000000-0000-4000-8000-000000000031',
  'CN-JOURNAL-1',
  'Testretoure'
);

insert into public.business_events (
  id, workspace_id, entity_type, entity_id, event_type, actor_id,
  reason, changes, correlation_id, created_at
) values
  (
    '92000000-0000-4000-8000-000000000101',
    '92000000-0000-4000-8000-000000000011',
    'purchase',
    '92000000-0000-4000-8000-000000000021',
    'purchase_costing_corrected',
    '92000000-0000-4000-8000-000000000001',
    'Preis korrigiert',
    '{"purchase_price":{"before":100,"after":110},"allocated_total_cost":{"before":100,"after":110}}'::jsonb,
    '92000000-0000-4000-8000-000000000201',
    '2026-08-31 10:00:00+00'
  ),
  (
    '92000000-0000-4000-8000-000000000102',
    '92000000-0000-4000-8000-000000000011',
    'purchase',
    '92000000-0000-4000-8000-000000000021',
    'purchase_finalized',
    '92000000-0000-4000-8000-000000000001',
    null,
    '{}'::jsonb,
    '92000000-0000-4000-8000-000000000202',
    '2026-08-31 10:00:00+00'
  ),
  ('92000000-0000-4000-8000-000000000103', '92000000-0000-4000-8000-000000000011', 'inventory_item', '92000000-0000-4000-8000-000000000031', 'inventory_cost_changed', null, null, '{}'::jsonb, '92000000-0000-4000-8000-000000000203', '2026-08-31 09:00:00+00'),
  ('92000000-0000-4000-8000-000000000104', '92000000-0000-4000-8000-000000000011', 'sale', '92000000-0000-4000-8000-000000000041', 'sale_recorded', null, null, '{}'::jsonb, '92000000-0000-4000-8000-000000000204', '2026-08-31 08:00:00+00'),
  ('92000000-0000-4000-8000-000000000105', '92000000-0000-4000-8000-000000000011', 'return', '92000000-0000-4000-8000-000000000051', 'return_recorded', null, null, '{}'::jsonb, '92000000-0000-4000-8000-000000000205', '2026-08-31 07:00:00+00'),
  ('92000000-0000-4000-8000-000000000106', '92000000-0000-4000-8000-000000000011', 'export', '92000000-0000-4000-8000-000000000061', 'audit_export_created', null, null, '{}'::jsonb, '92000000-0000-4000-8000-000000000206', '2026-08-31 06:00:00+00'),
  ('92000000-0000-4000-8000-000000000107', '92000000-0000-4000-8000-000000000012', 'purchase', '92000000-0000-4000-8000-000000000022', 'purchase_finalized', '92000000-0000-4000-8000-000000000005', null, '{}'::jsonb, '92000000-0000-4000-8000-000000000207', '2026-08-31 11:00:00+00');

select throws_ok(
  $$
    update public.business_events
    set reason = 'Manipulation'
    where id = '92000000-0000-4000-8000-000000000101'
  $$,
  'P0001',
  'Fachliche Ereignisse sind unveränderbar.',
  'auch der Tabelleneigentümer kann Ereignisse nicht ändern'
);

select throws_ok(
  $$
    delete from public.business_events
    where id = '92000000-0000-4000-8000-000000000101'
  $$,
  'P0001',
  'Fachliche Ereignisse sind unveränderbar.',
  'auch der Tabelleneigentümer kann Ereignisse nicht löschen'
);

select throws_ok(
  'truncate table public.business_events',
  'P0001',
  'Fachliche Ereignisse sind unveränderbar.',
  'auch der Tabelleneigentümer kann das Journal nicht leeren'
);

set local role authenticated;

select throws_ok(
  $$
    insert into public.business_events (
      workspace_id, entity_type, entity_id, event_type
    ) values (
      '92000000-0000-4000-8000-000000000011',
      'purchase',
      '92000000-0000-4000-8000-000000000021',
      'client_injection'
    )
  $$,
  '42501',
  null,
  'Clients können keine Ereignisse direkt einschleusen'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select * from public.list_business_events(
    '92000000-0000-4000-8000-000000000011', '{}'::jsonb, null, null, 25
  )$$,
  'Workspace-Eigentümer dürfen den globalen Verlauf lesen'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select * from public.list_business_events(
    '92000000-0000-4000-8000-000000000011', '{}'::jsonb, null, null, 25
  )$$,
  'Administratoren dürfen den globalen Verlauf lesen'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select * from public.list_business_events(
    '92000000-0000-4000-8000-000000000011', '{}'::jsonb, null, null, 25
  )$$,
  'Steuerberater dürfen den globalen Verlauf lesen'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select * from public.list_business_events(
    '92000000-0000-4000-8000-000000000011', '{}'::jsonb, null, null, 25
  )$$,
  '42501',
  'Keine Berechtigung für den globalen Ereignisverlauf.',
  'normale Mitglieder dürfen den globalen Verlauf nicht lesen'
);

select throws_ok(
  $$select * from public.list_business_events(
    '92000000-0000-4000-8000-000000000012', '{}'::jsonb, null, null, 25
  )$$,
  '42501',
  'Keine Berechtigung für den globalen Ereignisverlauf.',
  'globale Abfragen eines fremden Workspace scheitern'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$
    select id
    from public.list_business_events(
      '92000000-0000-4000-8000-000000000011',
      '{"entity_type":"purchase"}'::jsonb,
      null,
      null,
      1
    )
  $$,
  $$values ('92000000-0000-4000-8000-000000000102'::uuid)$$,
  'die erste Seite ordnet gleiche Zeitpunkte zusätzlich absteigend nach ID'
);

select results_eq(
  $$
    select id
    from public.list_business_events(
      '92000000-0000-4000-8000-000000000011',
      '{"entity_type":"purchase"}'::jsonb,
      '2026-08-31 10:00:00+00',
      '92000000-0000-4000-8000-000000000102',
      1
    )
  $$,
  $$values ('92000000-0000-4000-8000-000000000101'::uuid)$$,
  'der zusammengesetzte Cursor überspringt bei gleichem Zeitpunkt kein Ereignis'
);

select throws_ok(
  $$select * from public.list_business_events(
    '92000000-0000-4000-8000-000000000011', '{}'::jsonb, null, null, 101
  )$$,
  '22023',
  'Die Seitengröße muss zwischen 1 und 100 liegen.',
  'die globale Seitengröße ist begrenzt'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select * from public.list_entity_business_events(
    '92000000-0000-4000-8000-000000000011', 'purchase',
    '92000000-0000-4000-8000-000000000021', null, null, 25
  )$$,
  'Mitglieder dürfen den Verlauf zugänglicher Einkäufe lesen'
);

select lives_ok(
  $$select * from public.list_entity_business_events(
    '92000000-0000-4000-8000-000000000011', 'inventory_item',
    '92000000-0000-4000-8000-000000000031', null, null, 25
  )$$,
  'Mitglieder dürfen den Verlauf zugänglicher Inventarartikel lesen'
);

select lives_ok(
  $$select * from public.list_entity_business_events(
    '92000000-0000-4000-8000-000000000011', 'sale',
    '92000000-0000-4000-8000-000000000041', null, null, 25
  )$$,
  'Mitglieder dürfen den Verlauf zugänglicher Verkäufe lesen'
);

select lives_ok(
  $$select * from public.list_entity_business_events(
    '92000000-0000-4000-8000-000000000011', 'return',
    '92000000-0000-4000-8000-000000000051', null, null, 25
  )$$,
  'Mitglieder dürfen den Verlauf zugänglicher Retouren lesen'
);

select throws_ok(
  $$select * from public.list_entity_business_events(
    '92000000-0000-4000-8000-000000000011', 'export',
    '92000000-0000-4000-8000-000000000061', null, null, 25
  )$$,
  '42501',
  'Keine Berechtigung für diesen Datensatzverlauf.',
  'Exportverläufe bleiben für normale Mitglieder gesperrt'
);

select throws_ok(
  $$select * from public.list_entity_business_events(
    '92000000-0000-4000-8000-000000000011', 'purchase',
    '92000000-0000-4000-8000-000000000022', null, null, 25
  )$$,
  '42501',
  'Keine Berechtigung für diesen Datensatzverlauf.',
  'ein Datensatz aus einem anderen Workspace kann nicht über den lokalen Verlauf gelesen werden'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select * from public.list_entity_business_events(
    '92000000-0000-4000-8000-000000000011', 'export',
    '92000000-0000-4000-8000-000000000061', null, null, 25
  )$$,
  'Steuerberater dürfen Exportverläufe lesen'
);

select results_eq(
  $$
    select id
    from public.list_entity_business_events(
      '92000000-0000-4000-8000-000000000011', 'purchase',
      '92000000-0000-4000-8000-000000000021', null, null, 25
    )
  $$,
  $$values
    ('92000000-0000-4000-8000-000000000102'::uuid),
    ('92000000-0000-4000-8000-000000000101'::uuid)
  $$,
  'der Datensatzverlauf liefert ausschließlich passende Ereignisse in stabiler Reihenfolge'
);

select * from finish();

rollback;
