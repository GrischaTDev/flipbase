\set ON_ERROR_STOP on

begin;

select no_plan();

select has_function(
  'public',
  'allocate_integer_cents',
  array['bigint', 'numeric[]'],
  'der interne Cent-Allocator ist vorhanden'
);

select results_eq(
  $$select share from unnest(public.allocate_integer_cents(10, array[4, 3, 3]::numeric[])) as share$$,
  $$values (4::bigint), (3::bigint), (3::bigint)$$,
  'Largest Remainder verteilt Rest-Cent bei Gleichstand nach Arrayposition'
);

select results_eq(
  $$select share from unnest(public.allocate_integer_cents(10000, array[1, 1, 1, 1, 1, 1]::numeric[])) as share$$,
  $$values (1667::bigint), (1667::bigint), (1667::bigint), (1667::bigint), (1666::bigint), (1666::bigint)$$,
  '100 Euro auf sechs Einheiten ergeben viermal 16,67 und zweimal 16,66 Euro'
);

select results_eq(
  $$select share from unnest(public.allocate_integer_cents(0, array[0, 0]::numeric[])) as share$$,
  $$values (0::bigint), (0::bigint)$$,
  'ein Nullbetrag darf auch auf Nullgewichte verteilt werden'
);

select throws_ok(
  $$select public.allocate_integer_cents(-1, array[1]::numeric[])$$,
  '22023',
  'Der Gesamtbetrag in Cent darf nicht negativ sein.',
  'negative Gesamtbeträge werden abgelehnt'
);

select throws_ok(
  $$select public.allocate_integer_cents(1, array[1, -1]::numeric[])$$,
  '22023',
  'Verteilungsgewichte dürfen nicht negativ sein.',
  'negative Gewichte werden abgelehnt'
);

select throws_ok(
  $$select public.allocate_integer_cents(1, array[]::numeric[])$$,
  '22023',
  'Mindestens ein Verteilungsgewicht ist erforderlich.',
  'ein leeres Gewichtsarray wird abgelehnt'
);

select throws_ok(
  $$select public.allocate_integer_cents(1, array[0, 0]::numeric[])$$,
  '22023',
  'Die Summe der Verteilungsgewichte muss positiv sein.',
  'ein positiver Betrag kann nicht auf reine Nullgewichte verteilt werden'
);

select has_function(
  'public',
  'finalize_purchase_costing',
  array['uuid', 'uuid'],
  'die atomare Einkaufsfinalisierung ist als RPC vorhanden'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.finalize_purchase_costing(uuid,uuid)',
    'execute'
  ),
  'authenticated darf die Finalisierungs-RPC ausführen'
);

select ok(
  not has_function_privilege('public', 'public.finalize_purchase_costing(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.finalize_purchase_costing(uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.finalize_purchase_costing(uuid,uuid)', 'execute'),
  'public, anon und service_role besitzen kein Ausführungsrecht auf die Business-RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.allocate_integer_cents(bigint,numeric[])',
    'execute'
  ),
  'der Cent-Allocator bleibt für Clients intern'
);

select is(
  (
    select owner_role.rolname
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    join pg_catalog.pg_roles as owner_role on owner_role.oid = routine.proowner
    where namespace.nspname = 'public'
      and routine.proname = 'finalize_purchase_costing'
      and pg_catalog.pg_get_function_identity_arguments(routine.oid) = 'p_workspace_id uuid, p_purchase_id uuid'
  ),
  'postgres'::name,
  'die gehärtete Business-RPC hat einen festen Owner'
);

select ok(
  (
    select routine.prosecdef
      and 'search_path=""' = any(coalesce(routine.proconfig, array[]::text[]))
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = 'finalize_purchase_costing'
      and pg_catalog.pg_get_function_identity_arguments(routine.oid) = 'p_workspace_id uuid, p_purchase_id uuid'
  ),
  'die Business-RPC ist security definer mit leerem search_path'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '93000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'costing-owner@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '93000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'costing-outsider@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.workspaces (id, name) values
  ('93000000-0000-4000-8000-000000000011', 'Kostenfinalisierung'),
  ('93000000-0000-4000-8000-000000000012', 'Fremde Kostenfinalisierung');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000001', 'owner'),
  ('93000000-0000-4000-8000-000000000012', '93000000-0000-4000-8000-000000000002', 'owner');

insert into public.sources (id, workspace_id, name) values
  ('93000000-0000-4000-8000-000000000301', '93000000-0000-4000-8000-000000000011', 'Eigene Quelle'),
  ('93000000-0000-4000-8000-000000000302', '93000000-0000-4000-8000-000000000012', 'Fremde Quelle');

insert into public.suppliers (id, workspace_id, name) values
  ('93000000-0000-4000-8000-000000000401', '93000000-0000-4000-8000-000000000011', 'Eigener Lieferant'),
  ('93000000-0000-4000-8000-000000000402', '93000000-0000-4000-8000-000000000012', 'Fremder Lieferant');

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sources'
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (workspace_id, id)'
  ) and exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'suppliers'
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (workspace_id, id)'
  ),
  'Quellen und Lieferanten besitzen eindeutige Workspace-ID-Schlüssel'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'purchases'
      and constraint_row.contype = 'f'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        like 'FOREIGN KEY (workspace_id, source_id) REFERENCES sources(workspace_id, id)%'
  ) and exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'purchases'
      and constraint_row.contype = 'f'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        like 'FOREIGN KEY (workspace_id, supplier_id) REFERENCES suppliers(workspace_id, id)%'
  ),
  'Einkäufe erzwingen Quelle und Lieferant zusätzlich über zusammengesetzte Workspace-FKs'
);

insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('93000000-0000-4000-8000-000000000201', '93000000-0000-4000-8000-000000000011', 'Normal 40', 'quantity'),
  ('93000000-0000-4000-8000-000000000202', '93000000-0000-4000-8000-000000000011', 'Normal 30 A', 'quantity'),
  ('93000000-0000-4000-8000-000000000203', '93000000-0000-4000-8000-000000000011', 'Normal 30 B', 'quantity'),
  ('93000000-0000-4000-8000-000000000204', '93000000-0000-4000-8000-000000000011', 'Menge 20', 'quantity'),
  ('93000000-0000-4000-8000-000000000205', '93000000-0000-4000-8000-000000000011', 'Menge 3', 'quantity'),
  ('93000000-0000-4000-8000-000000000206', '93000000-0000-4000-8000-000000000011', 'Menge 2', 'quantity'),
  ('93000000-0000-4000-8000-000000000207', '93000000-0000-4000-8000-000000000011', 'Mystery-Sechser', 'quantity'),
  ('93000000-0000-4000-8000-000000000208', '93000000-0000-4000-8000-000000000011', 'Atomarer Fehler', 'quantity'),
  ('93000000-0000-4000-8000-000000000209', '93000000-0000-4000-8000-000000000011', 'Kopfkonflikt', 'quantity'),
  ('93000000-0000-4000-8000-000000000210', '93000000-0000-4000-8000-000000000011', 'Nullpreis', 'quantity'),
  ('93000000-0000-4000-8000-000000000211', '93000000-0000-4000-8000-000000000011', 'Artfremdes Los', 'quantity'),
  ('93000000-0000-4000-8000-000000000212', '93000000-0000-4000-8000-000000000011', 'Artfremdes Item', 'quantity'),
  ('93000000-0000-4000-8000-000000000213', '93000000-0000-4000-8000-000000000011', 'Bewegungsfehler', 'quantity'),
  ('93000000-0000-4000-8000-000000000214', '93000000-0000-4000-8000-000000000011', 'Fehlende Bewegung', 'quantity'),
  ('93000000-0000-4000-8000-000000000215', '93000000-0000-4000-8000-000000000011', 'Falsche Losverknüpfung', 'quantity'),
  ('93000000-0000-4000-8000-000000000216', '93000000-0000-4000-8000-000000000011', 'Unbewerteter Draft-Eingang', 'quantity');

insert into public.purchases (
  id, workspace_id, type, title, purchase_price, total_purchase_cost
) values
  ('93000000-0000-4000-8000-000000000101', '93000000-0000-4000-8000-000000000011', 'lot', 'Normal 40 30 30', null, null),
  ('93000000-0000-4000-8000-000000000102', '93000000-0000-4000-8000-000000000011', 'single', 'Direkte Gebühr', null, null),
  ('93000000-0000-4000-8000-000000000103', '93000000-0000-4000-8000-000000000011', 'lot', 'Mengenverteilung', null, null),
  ('93000000-0000-4000-8000-000000000104', '93000000-0000-4000-8000-000000000011', 'lot', 'Planwert klein groß', null, null),
  ('93000000-0000-4000-8000-000000000105', '93000000-0000-4000-8000-000000000011', 'lot', 'Planwert groß klein', null, null),
  ('93000000-0000-4000-8000-000000000106', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Mystery sechs Einheiten', 90, null),
  ('93000000-0000-4000-8000-000000000107', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Gemischte Mystery-Preise', 20, null),
  ('93000000-0000-4000-8000-000000000108', '93000000-0000-4000-8000-000000000011', 'single', 'Ohne Position', null, null),
  ('93000000-0000-4000-8000-000000000109', '93000000-0000-4000-8000-000000000011', 'lot', 'Atomarer Losfehler', null, null),
  ('93000000-0000-4000-8000-000000000110', '93000000-0000-4000-8000-000000000011', 'lot', 'Widersprüchlicher Kopf', 99, null),
  ('93000000-0000-4000-8000-000000000111', '93000000-0000-4000-8000-000000000012', 'single', 'Fremder Einkauf', null, null),
  ('93000000-0000-4000-8000-000000000112', '93000000-0000-4000-8000-000000000011', 'lot', 'Explizite Null im Konflikt', 0, null),
  ('93000000-0000-4000-8000-000000000113', '93000000-0000-4000-8000-000000000011', 'lot', 'Echte Nullsumme', 0, null),
  ('93000000-0000-4000-8000-000000000114', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Mystery ohne Kopfpreis', null, null),
  ('93000000-0000-4000-8000-000000000115', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Mystery kostenlos', 0, null),
  ('93000000-0000-4000-8000-000000000116', '93000000-0000-4000-8000-000000000011', 'single', 'Item ohne Positionslink', null, null),
  ('93000000-0000-4000-8000-000000000117', '93000000-0000-4000-8000-000000000011', 'lot', 'Mengenposition mit Item', null, null),
  ('93000000-0000-4000-8000-000000000118', '93000000-0000-4000-8000-000000000011', 'single', 'Einzelposition mit Los', null, null),
  ('93000000-0000-4000-8000-000000000119', '93000000-0000-4000-8000-000000000011', 'single', 'Item mit falscher Position', null, null),
  ('93000000-0000-4000-8000-000000000120', '93000000-0000-4000-8000-000000000011', 'single', 'Item im falschen Workspace', null, null),
  ('93000000-0000-4000-8000-000000000121', '93000000-0000-4000-8000-000000000011', 'lot', 'Bewegung im falschen Workspace', null, null),
  ('93000000-0000-4000-8000-000000000122', '93000000-0000-4000-8000-000000000011', 'lot', 'Receipt-Menge widerspricht Los', null, null),
  ('93000000-0000-4000-8000-000000000123', '93000000-0000-4000-8000-000000000011', 'lot', 'Fehlende Receipt-Bewegung', null, null),
  ('93000000-0000-4000-8000-000000000124', '93000000-0000-4000-8000-000000000011', 'single', 'Gelistetes Item', null, null),
  ('93000000-0000-4000-8000-000000000125', '93000000-0000-4000-8000-000000000011', 'single', 'Defektes Item', null, null),
  ('93000000-0000-4000-8000-000000000126', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Komponentenweise Mystery-Kosten', 0.01, null),
  ('93000000-0000-4000-8000-000000000127', '93000000-0000-4000-8000-000000000011', 'lot', 'Los mit falschem Einkauf', null, null),
  ('93000000-0000-4000-8000-000000000128', '93000000-0000-4000-8000-000000000011', 'single', 'Fremder Positionslink', null, null),
  ('93000000-0000-4000-8000-000000000129', '93000000-0000-4000-8000-000000000011', 'lot', 'Unbewerteter Mengen-Draft', null, null),
  ('93000000-0000-4000-8000-000000000130', '93000000-0000-4000-8000-000000000011', 'single', 'Unbewerteter Einzel-Draft', null, null);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total, estimated_market_value, created_at
) values
  ('93000000-0000-4000-8000-000000000301', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000101', '93000000-0000-4000-8000-000000000201', 'Normal 40', 'quantity', 1, 0, 'priced', 40, 40, 1, '2026-08-31 08:00:01+00'),
  ('93000000-0000-4000-8000-000000000302', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000101', '93000000-0000-4000-8000-000000000202', 'Normal 30 A', 'quantity', 1, 0, 'priced', 30, 30, 500, '2026-08-31 08:00:02+00'),
  ('93000000-0000-4000-8000-000000000303', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000101', '93000000-0000-4000-8000-000000000203', 'Normal 30 B', 'quantity', 1, 0, 'priced', 30, 30, 999, '2026-08-31 08:00:03+00'),
  ('93000000-0000-4000-8000-000000000304', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000102', null, 'Direkt A', 'individual', 1, 0, 'priced', 10, 10, null, '2026-08-31 08:01:01+00'),
  ('93000000-0000-4000-8000-000000000305', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000102', null, 'Direkt B', 'individual', 1, 1, 'priced', 20, 20, null, '2026-08-31 08:01:02+00'),
  ('93000000-0000-4000-8000-000000000306', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000103', '93000000-0000-4000-8000-000000000204', 'Menge 20', 'quantity', 20, 20, 'priced', 1, 20, null, '2026-08-31 08:02:01+00'),
  ('93000000-0000-4000-8000-000000000307', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000103', '93000000-0000-4000-8000-000000000205', 'Menge 3', 'quantity', 3, 0, 'priced', 1, 3, null, '2026-08-31 08:02:02+00'),
  ('93000000-0000-4000-8000-000000000308', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000103', '93000000-0000-4000-8000-000000000206', 'Menge 2', 'quantity', 2, 0, 'priced', 1, 2, null, '2026-08-31 08:02:03+00'),
  ('93000000-0000-4000-8000-000000000309', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000104', null, 'Plan A1', 'individual', 1, 0, 'priced', 40, 40, 1, '2026-08-31 08:03:01+00'),
  ('93000000-0000-4000-8000-000000000310', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000104', null, 'Plan A2', 'individual', 1, 0, 'priced', 60, 60, 999, '2026-08-31 08:03:02+00'),
  ('93000000-0000-4000-8000-000000000311', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000105', null, 'Plan B1', 'individual', 1, 0, 'priced', 40, 40, 999, '2026-08-31 08:04:01+00'),
  ('93000000-0000-4000-8000-000000000312', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000105', null, 'Plan B2', 'individual', 1, 0, 'priced', 60, 60, 1, '2026-08-31 08:04:02+00'),
  ('93000000-0000-4000-8000-000000000313', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000106', '93000000-0000-4000-8000-000000000207', 'Mystery-Sechser', 'quantity', 6, 0, 'unpriced_mystery', null, null, 9999, '2026-08-31 08:05:01+00'),
  ('93000000-0000-4000-8000-000000000314', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000107', null, 'Mystery unbekannt', 'individual', 1, 0, 'unpriced_mystery', null, null, 10, '2026-08-31 08:06:01+00'),
  ('93000000-0000-4000-8000-000000000315', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000107', null, 'Mystery fälschlich bepreist', 'individual', 1, 0, 'priced', 10, 10, 20, '2026-08-31 08:06:02+00'),
  ('93000000-0000-4000-8000-000000000318', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000109', null, 'Atomarer vorheriger Item-Write', 'individual', 1, 0, 'priced', 2, 2, null, '2026-08-31 08:06:59+00'),
  ('93000000-0000-4000-8000-000000000316', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000109', '93000000-0000-4000-8000-000000000208', 'Atomarer Fehler', 'quantity', 2, 0, 'priced', 5, 10, null, '2026-08-31 08:07:01+00'),
  ('93000000-0000-4000-8000-000000000317', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000110', '93000000-0000-4000-8000-000000000209', 'Kopfkonflikt', 'quantity', 1, 0, 'priced', 100, 100, null, '2026-08-31 08:08:01+00'),
  ('93000000-0000-4000-8000-000000000319', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000112', '93000000-0000-4000-8000-000000000210', 'Explizite Null im Konflikt', 'quantity', 1, 0, 'priced', 1, 1, null, '2026-08-31 08:09:01+00'),
  ('93000000-0000-4000-8000-000000000320', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000113', '93000000-0000-4000-8000-000000000210', 'Echte Nullsumme', 'quantity', 2, 0, 'priced', 0, 0, null, '2026-08-31 08:10:01+00'),
  ('93000000-0000-4000-8000-000000000321', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000114', null, 'Mystery ohne Kopfpreis', 'individual', 1, 0, 'unpriced_mystery', null, null, null, '2026-08-31 08:11:01+00'),
  ('93000000-0000-4000-8000-000000000322', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000115', null, 'Mystery kostenlos', 'individual', 1, 0, 'unpriced_mystery', null, null, null, '2026-08-31 08:12:01+00'),
  ('93000000-0000-4000-8000-000000000323', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000116', null, 'Zielposition für Linkfehler', 'individual', 1, 0, 'priced', 1, 1, null, '2026-08-31 08:13:01+00'),
  ('93000000-0000-4000-8000-000000000324', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000117', '93000000-0000-4000-8000-000000000212', 'Mengenposition mit Item', 'quantity', 1, 1, 'priced', 1, 1, null, '2026-08-31 08:14:01+00'),
  ('93000000-0000-4000-8000-000000000325', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000118', '93000000-0000-4000-8000-000000000211', 'Einzelposition mit Los', 'individual', 1, 1, 'priced', 1, 1, null, '2026-08-31 08:15:01+00'),
  ('93000000-0000-4000-8000-000000000326', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000119', null, 'Zielposition für falschen Link', 'individual', 1, 0, 'priced', 1, 1, null, '2026-08-31 08:16:01+00'),
  ('93000000-0000-4000-8000-000000000327', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000128', null, 'Tatsächlich verlinkte Fremdposition', 'individual', 1, 1, 'priced', 1, 1, null, '2026-08-31 08:16:02+00'),
  ('93000000-0000-4000-8000-000000000328', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000120', null, 'Zielposition für Workspacefehler', 'individual', 1, 0, 'priced', 1, 1, null, '2026-08-31 08:17:01+00'),
  ('93000000-0000-4000-8000-000000000329', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000121', '93000000-0000-4000-8000-000000000213', 'Bewegung im falschen Workspace', 'quantity', 1, 1, 'priced', 1, 1, null, '2026-08-31 08:18:01+00'),
  ('93000000-0000-4000-8000-000000000330', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000122', '93000000-0000-4000-8000-000000000213', 'Receipt-Menge widerspricht Los', 'quantity', 2, 2, 'priced', 1, 2, null, '2026-08-31 08:19:01+00'),
  ('93000000-0000-4000-8000-000000000331', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000123', '93000000-0000-4000-8000-000000000214', 'Fehlende Receipt-Bewegung', 'quantity', 2, 2, 'priced', 1, 2, null, '2026-08-31 08:20:01+00'),
  ('93000000-0000-4000-8000-000000000332', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000124', null, 'Gelistetes Item', 'individual', 1, 1, 'priced', 1, 1, null, '2026-08-31 08:21:01+00'),
  ('93000000-0000-4000-8000-000000000333', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000125', null, 'Defektes Item', 'individual', 1, 1, 'priced', 1, 1, null, '2026-08-31 08:22:01+00'),
  ('93000000-0000-4000-8000-000000000334', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000126', null, 'Mystery Komponente 1', 'individual', 1, 0, 'unpriced_mystery', null, null, null, '2026-08-31 08:23:01+00'),
  ('93000000-0000-4000-8000-000000000335', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000126', null, 'Mystery Komponente 3 A', 'individual', 3, 0, 'unpriced_mystery', null, null, null, '2026-08-31 08:23:02+00'),
  ('93000000-0000-4000-8000-000000000336', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000126', null, 'Mystery Komponente 3 B', 'individual', 3, 0, 'unpriced_mystery', null, null, null, '2026-08-31 08:23:03+00'),
  ('93000000-0000-4000-8000-000000000337', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000127', '93000000-0000-4000-8000-000000000215', 'Los mit falschem Einkauf', 'quantity', 1, 1, 'priced', 1, 1, null, '2026-08-31 08:24:01+00'),
  ('93000000-0000-4000-8000-000000000338', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000129', '93000000-0000-4000-8000-000000000216', 'Unbewerteter Mengen-Draft', 'quantity', 2, 0, 'priced', 5, 10, null, '2026-08-31 08:25:01+00'),
  ('93000000-0000-4000-8000-000000000339', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000130', null, 'Unbewerteter Einzel-Draft', 'individual', 1, 0, 'priced', 5, 5, null, '2026-08-31 08:25:02+00');

insert into public.purchase_costs (
  id, workspace_id, purchase_id, type, amount, allocation_method,
  target_purchase_line_id, created_at
) values
  ('93000000-0000-4000-8000-000000000401', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000101', 'shipping', 10, 'value_weighted', null, '2026-08-31 09:00:01+00'),
  ('93000000-0000-4000-8000-000000000402', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000102', 'fee', 8, 'direct', '93000000-0000-4000-8000-000000000305', '2026-08-31 09:00:02+00'),
  ('93000000-0000-4000-8000-000000000403', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000103', 'transport', 10, 'quantity', null, '2026-08-31 09:00:03+00'),
  ('93000000-0000-4000-8000-000000000404', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000104', 'shipping', 10, 'value_weighted', null, '2026-08-31 09:00:04+00'),
  ('93000000-0000-4000-8000-000000000405', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000105', 'shipping', 10, 'value_weighted', null, '2026-08-31 09:00:05+00'),
  ('93000000-0000-4000-8000-000000000406', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000106', 'shipping', 10, 'value_weighted', null, '2026-08-31 09:00:06+00'),
  ('93000000-0000-4000-8000-000000000407', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000126', 'shipping', 0.03, 'quantity', null, '2026-08-31 09:00:07+00');

insert into public.inventory_items (
  id, workspace_id, purchase_id, purchase_line_id, title, condition,
  status, allocated_purchase_cost
) values
  ('93000000-0000-4000-8000-000000000501', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000102', '93000000-0000-4000-8000-000000000305', 'Bereits erfasstes Einzelstück', 'used', 'received', 0),
  ('93000000-0000-4000-8000-000000000504', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000116', null, 'Item ohne Positionslink', 'used', 'received', 0),
  ('93000000-0000-4000-8000-000000000505', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000117', '93000000-0000-4000-8000-000000000324', 'Artfremdes Item an Mengenposition', 'used', 'received', 0),
  ('93000000-0000-4000-8000-000000000506', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000119', '93000000-0000-4000-8000-000000000327', 'Item mit falscher Einkaufsposition', 'used', 'received', 0),
  ('93000000-0000-4000-8000-000000000507', '93000000-0000-4000-8000-000000000012', '93000000-0000-4000-8000-000000000120', null, 'Item im falschen Workspace', 'used', 'received', 0),
  ('93000000-0000-4000-8000-000000000508', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000124', '93000000-0000-4000-8000-000000000332', 'Gelistetes Item', 'used', 'listed', 0),
  ('93000000-0000-4000-8000-000000000509', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000125', '93000000-0000-4000-8000-000000000333', 'Defektes Item', 'defective', 'defective', 0);

insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost, received_at
) values
  ('93000000-0000-4000-8000-000000000502', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000103', '93000000-0000-4000-8000-000000000306', '93000000-0000-4000-8000-000000000204', 20, 20, 1, '2026-08-31 10:00:00+00'),
  ('93000000-0000-4000-8000-000000000510', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000118', '93000000-0000-4000-8000-000000000325', '93000000-0000-4000-8000-000000000211', 1, 1, 1, '2026-08-31 10:01:00+00'),
  ('93000000-0000-4000-8000-000000000511', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000121', '93000000-0000-4000-8000-000000000329', '93000000-0000-4000-8000-000000000213', 1, 1, 1, '2026-08-31 10:02:00+00'),
  ('93000000-0000-4000-8000-000000000512', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000122', '93000000-0000-4000-8000-000000000330', '93000000-0000-4000-8000-000000000213', 2, 2, 1, '2026-08-31 10:03:00+00'),
  ('93000000-0000-4000-8000-000000000513', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000123', '93000000-0000-4000-8000-000000000331', '93000000-0000-4000-8000-000000000214', 2, 2, 0, '2026-08-31 10:04:00+00'),
  ('93000000-0000-4000-8000-000000000514', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000128', '93000000-0000-4000-8000-000000000337', '93000000-0000-4000-8000-000000000215', 1, 1, 1, '2026-08-31 10:05:00+00');

set local session_replication_role = replica;

insert into public.stock_movements (
  id, workspace_id, stock_lot_id, direction, quantity, reason, created_at
) values
  ('93000000-0000-4000-8000-000000000503', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000502', 'in', 20, 'receipt', '2026-08-31 10:00:01+00'),
  ('93000000-0000-4000-8000-000000000515', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000510', 'in', 1, 'receipt', '2026-08-31 10:01:01+00'),
  ('93000000-0000-4000-8000-000000000516', '93000000-0000-4000-8000-000000000012', '93000000-0000-4000-8000-000000000511', 'in', 1, 'receipt', '2026-08-31 10:02:01+00'),
  ('93000000-0000-4000-8000-000000000517', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000512', 'in', 1, 'receipt', '2026-08-31 10:03:01+00'),
  ('93000000-0000-4000-8000-000000000518', '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000514', 'in', 1, 'receipt', '2026-08-31 10:05:01+00');

set local session_replication_role = origin;

create function public.test_reject_existing_receipt_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.id = '93000000-0000-4000-8000-000000000503'::uuid then
    raise exception using errcode = 'P0001', message = 'Bestehende Receipt-Historie wurde umgeschrieben.';
  end if;
  return new;
end;
$$;

create trigger test_reject_existing_receipt_update
before update on public.stock_movements
for each row execute function public.test_reject_existing_receipt_update();

create function public.test_fail_purchase_costing_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.entity_type = 'purchase'
    and new.entity_id = '93000000-0000-4000-8000-000000000109'::uuid
    and new.event_type = 'purchase_finalized' then
    if not exists (
      select 1
      from public.purchases as purchase
      where purchase.id = new.entity_id
        and purchase.entry_status = 'finalized'
        and purchase.purchase_price = 12
        and purchase.total_purchase_cost = 12
        and purchase.finalized_at is not null
        and purchase.finalized_by is not null
    ) or (
      select count(*)
      from public.purchase_lines as line
      where line.purchase_id = new.entity_id
        and line.received_quantity = line.ordered_quantity
        and line.allocated_total_cost > 0
    ) <> 2 or not exists (
      select 1
      from public.inventory_items as item
      where item.purchase_id = new.entity_id
        and item.purchase_line_id = '93000000-0000-4000-8000-000000000318'::uuid
        and item.allocated_purchase_cost = 2
    ) or not exists (
      select 1
      from public.stock_lots as lot
      where lot.purchase_id = new.entity_id
        and lot.purchase_line_id = '93000000-0000-4000-8000-000000000316'::uuid
        and lot.received_quantity = 2
        and lot.remaining_quantity = 2
        and lot.unit_cost = 5
    ) or not exists (
      select 1
      from public.stock_movements as movement
      join public.stock_lots as lot on lot.id = movement.stock_lot_id
      where lot.purchase_id = new.entity_id
        and movement.direction = 'in'
        and movement.reason = 'receipt'
        and movement.quantity = 2
    ) or not exists (
      select 1
      from public.business_events as event
      where event.id = new.id
    ) then
      raise exception using errcode = 'P0001', message = 'Der erzwungene Fehler trat vor sämtlichen Finalisierungswrites auf.';
    end if;
    raise exception using errcode = 'P0001', message = 'Erzwungener Ereignisfehler nach sämtlichen Finalisierungswrites.';
  end if;
  return new;
end;
$$;

create trigger test_fail_purchase_costing_event_insert
after insert on public.business_events
for each row execute function public.test_fail_purchase_costing_event_insert();

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000101'
  )$$,
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'ein fehlender authentifizierter Aufrufer wird vor jedem Write abgelehnt'
);

select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    update public.purchases
    set entry_status = 'finalized',
        finalized_at = now(),
        finalized_by = '93000000-0000-4000-8000-000000000001'
    where id = '93000000-0000-4000-8000-000000000101'
  $$,
  '42501',
  'Finalisierungsstatus und abgeleitete Einkaufskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'authenticated kann Finalisierungsstatus und Metadaten nicht direkt setzen'
);

select throws_ok(
  $$
    update public.purchases
    set total_purchase_cost = 999
    where id = '93000000-0000-4000-8000-000000000101'
  $$,
  '42501',
  'Finalisierungsstatus und abgeleitete Einkaufskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'authenticated kann abgeleitete Kopfkosten nicht direkt ändern'
);

select throws_ok(
  $$
    insert into public.purchases (
      id, workspace_id, type, title, purchase_price, total_purchase_cost
    ) values (
      '93000000-0000-4000-8000-000000000131',
      '93000000-0000-4000-8000-000000000011',
      'single',
      'Manipulierter numerischer Draft-Gesamtwert',
      0,
      0
    )
  $$,
  '42501',
  'Finalisierungsstatus und abgeleitete Einkaufskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'authenticated kann einem neuen Draft keinen numerischen Gesamtwert geben'
);

select throws_ok(
  $$
    update public.purchase_lines
    set allocated_additional_cost = 999,
        allocated_total_cost = 999
    where id = '93000000-0000-4000-8000-000000000301'
  $$,
  '42501',
  'permission denied for table purchase_lines',
  'authenticated kann Einkaufspositionen einschließlich abgeleiteter Kosten nicht direkt ändern'
);

select throws_ok(
  $$
    update public.inventory_items
    set allocated_purchase_cost = 999
    where id = '93000000-0000-4000-8000-000000000501'
  $$,
  '42501',
  'Bestandskosten dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'authenticated kann Kosten eines Bestandsartikels nicht direkt ändern'
);

select lives_ok(
  $$
    update public.purchases
    set title = 'Normaler Entwurf bearbeitet', purchase_price = 1
    where id = '93000000-0000-4000-8000-000000000112'
  $$,
  'legitime Kopfangaben eines Entwurfs bleiben direkt editierbar'
);

update public.purchases
set purchase_price = 0
where id = '93000000-0000-4000-8000-000000000112';

select throws_ok(
  $$
    update public.purchase_lines
    set title_snapshot = 'Direkt B im Entwurf'
    where id = '93000000-0000-4000-8000-000000000305'
  $$,
  '42501',
  'permission denied for table purchase_lines',
  'Positionsangaben eines Entwurfs werden ausschließlich über Business-RPCs geändert'
);

select lives_ok(
  $$
    update public.inventory_items
    set title = 'Erfasstes Einzelstück bearbeitet', status = 'needs_review'
    where id = '93000000-0000-4000-8000-000000000501'
  $$,
  'nicht kostenbezogene Entwurfsangaben eines Bestandsartikels bleiben editierbar'
);

select lives_ok(
  $$select public.receive_purchase_lines(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000129',
    '[{"purchase_line_id":"93000000-0000-4000-8000-000000000338","received_quantity":2,"received_at":"2026-08-31T11:00:00Z"}]'::jsonb
  )$$,
  'der gehärtete Mengen-Wareneingang bleibt für Drafts verfügbar'
);

select is(
  (
    select lot.unit_cost
    from public.stock_lots as lot
    where lot.purchase_id = '93000000-0000-4000-8000-000000000129'
  ),
  0::numeric,
  'ein Draft-Wareneingang erfindet vor der Finalisierung keine Loskosten'
);

select lives_ok(
  $$select public.receive_individual_purchase_line(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000130',
    '93000000-0000-4000-8000-000000000339',
    '{"title":"Unbewertetes Einzelstück","condition":"used","allocated_purchase_cost":999}'::jsonb
  )$$,
  'der gehärtete Einzel-Wareneingang bleibt für Drafts verfügbar'
);

select is(
  (
    select item.allocated_purchase_cost
    from public.inventory_items as item
    where item.purchase_id = '93000000-0000-4000-8000-000000000130'
  ),
  0::numeric,
  'ein Draft-Wareneingang ignoriert clientseitige Bestandskosten bis zur Finalisierung'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000012',
    '93000000-0000-4000-8000-000000000111'
  )$$,
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'ein Workspace-fremder Einkauf wird abgelehnt'
);

select public.finalize_purchase_costing(
  '93000000-0000-4000-8000-000000000011',
  '93000000-0000-4000-8000-000000000101'
) as normal_result \gset

select is(
  :'normal_result'::jsonb - 'eventId',
  jsonb_build_object(
    'purchaseId', '93000000-0000-4000-8000-000000000101'::uuid,
    'totalPurchaseCost', 110::numeric,
    'allocatedTotalCost', 110::numeric,
    'entryStatus', 'finalized'
  ),
  'die normale Finalisierung liefert den PurchaseCostingResult-Vertrag'
);

select ok(
  exists (
    select 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '93000000-0000-4000-8000-000000000101',
      null,
      null,
      25
    ) as event
    where event.id = (:'normal_result'::jsonb ->> 'eventId')::uuid
      and event.workspace_id = '93000000-0000-4000-8000-000000000011'
      and event.entity_type = 'purchase'
      and event.entity_id = '93000000-0000-4000-8000-000000000101'
      and event.event_type = 'purchase_finalized'
      and event.actor_id = '93000000-0000-4000-8000-000000000001'
  ),
  'die zurückgegebene Event-ID bezeichnet genau das persistierte Finalisierungsereignis'
);

select ok(
  (
    select purchase.purchase_price = 100
      and purchase.total_purchase_cost = 110
      and purchase.entry_status = 'finalized'
      and purchase.finalized_at is not null
      and purchase.finalized_by = '93000000-0000-4000-8000-000000000001'
    from public.purchases as purchase
    where purchase.id = '93000000-0000-4000-8000-000000000101'
  ),
  'der normale Warenbetrag wird aus den Positionen abgeleitet und am Kopf persistiert'
);

select results_eq(
  $$
    select line.allocated_additional_cost, line.allocated_total_cost
    from public.purchase_lines as line
    where line.purchase_id = '93000000-0000-4000-8000-000000000101'
    order by line.created_at, line.id
  $$,
  $$values
    (4.00::numeric, 44.00::numeric),
    (3.00::numeric, 33.00::numeric),
    (3.00::numeric, 33.00::numeric)
  $$,
  '40/30/30 Warenwert verteilt 10 Euro Zusatzkosten als 4/3/3'
);

select is(
  (
    select sum(line.allocated_total_cost)
    from public.purchase_lines as line
    where line.purchase_id = '93000000-0000-4000-8000-000000000101'
  ),
  110.00::numeric,
  'alle normalen Positionsanteile reconciliieren exakt zur Einkaufsgesamtsumme'
);

select ok(
  (
    select count(*) = 3
      and sum(lot.received_quantity) = 3
      and sum(lot.received_quantity * lot.unit_cost) = 110
    from public.stock_lots as lot
    where lot.purchase_id = '93000000-0000-4000-8000-000000000101'
  ) and (
    select count(*) = 3
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = '93000000-0000-4000-8000-000000000101'
      and movement.direction = 'in'
      and movement.reason = 'receipt'
  ),
  'Finalisierung stellt normalen Bestand samt Cent-genauen Eingangsbewegungen bereit'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000101'
  )$$,
  '22023',
  'Der Einkauf ist bereits finalisiert.',
  'eine zweite Finalisierung wird nach der Sperre abgelehnt'
);

select ok(
  (
    select count(*) = 3
    from public.stock_lots
    where purchase_id = '93000000-0000-4000-8000-000000000101'
  ) and (
    select count(*) = 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '93000000-0000-4000-8000-000000000101',
      null,
      null,
      25
    ) as event
    where event.entity_type = 'purchase'
      and event.event_type = 'purchase_finalized'
  ),
  'wiederholte Finalisierung erzeugt weder doppelten Bestand noch ein zweites Ereignis'
);

select throws_ok(
  $$
    update public.purchases
    set purchase_price = 101
    where id = '93000000-0000-4000-8000-000000000101'
  $$,
  '42501',
  'Finalisierte Einkaufsdaten dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'direkte Draft-Feldänderungen sind nach Finalisierung gesperrt'
);

select throws_ok(
  $$
    update public.purchase_lines
    set title_snapshot = 'Manipulierte finale Position'
    where id = '93000000-0000-4000-8000-000000000301'
  $$,
  '42501',
  'permission denied for table purchase_lines',
  'finalisierte Positionen lassen sich bereits auf Tabellenebene nicht direkt verändern'
);

select throws_ok(
  $$
    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, allocation_method
    ) values (
      '93000000-0000-4000-8000-000000000011',
      '93000000-0000-4000-8000-000000000101',
      'late_fee', 1, 'quantity'
    )
  $$,
  '42501',
  'Kosten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'nachträgliche direkte Zusatzkosten sind gesperrt'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000102'
  )$$,
  'direkt zugeordnete Zusatzkosten lassen sich finalisieren'
);

select results_eq(
  $$
    select line.allocated_additional_cost
    from public.purchase_lines as line
    where line.purchase_id = '93000000-0000-4000-8000-000000000102'
    order by line.created_at, line.id
  $$,
  $$values (0.00::numeric), (8.00::numeric)$$,
  'eine direkte Gebühr von 8 Euro trifft ausschließlich ihre Zielposition'
);

select results_eq(
  $$
    select line.id, count(item.id), sum(item.allocated_purchase_cost)
    from public.purchase_lines as line
    join public.inventory_items as item on item.purchase_line_id = line.id
    where line.purchase_id = '93000000-0000-4000-8000-000000000102'
    group by line.id, line.created_at
    order by line.created_at, line.id
  $$,
  $$values
    ('93000000-0000-4000-8000-000000000304'::uuid, 1::bigint, 10.00::numeric),
    ('93000000-0000-4000-8000-000000000305'::uuid, 1::bigint, 28.00::numeric)
  $$,
  'Einzelstücke werden erzeugt oder aktualisiert und reconciliieren je Position'
);

select ok(
  (
    select item.status = 'ready'
    from public.inventory_items as item
    where item.id = '93000000-0000-4000-8000-000000000501'
  ),
  'ein bereits erfasstes Einzelstück wird ohne Duplikat verkaufsbereit aktualisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000103'
  )$$,
  'mengenbasierte Zusatzkosten lassen sich finalisieren'
);

select results_eq(
  $$
    select line.allocated_additional_cost
    from public.purchase_lines as line
    where line.purchase_id = '93000000-0000-4000-8000-000000000103'
    order by line.created_at, line.id
  $$,
  $$values (8.00::numeric), (1.20::numeric), (0.80::numeric)$$,
  '10 Euro werden über Mengen 20/3/2 als 8/1,20/0,80 verteilt'
);

select ok(
  (
    select count(*) = 3
      and sum(lot.received_quantity) = 25
      and sum(lot.received_quantity * lot.unit_cost) = 35
    from public.stock_lots as lot
    where lot.purchase_id = '93000000-0000-4000-8000-000000000103'
  ) and (
    select lot.unit_cost = 1.40 and lot.received_quantity = 20
    from public.stock_lots as lot
    where lot.id = '93000000-0000-4000-8000-000000000502'
  ),
  'vorhandene Bestandslose werden aktualisiert und neue Lose exakt ergänzt'
);

select results_eq(
  $$
    select movement.id, movement.direction, movement.reason,
      movement.quantity, movement.created_at
    from public.stock_movements as movement
    where movement.id = '93000000-0000-4000-8000-000000000503'
  $$,
  $$values (
    '93000000-0000-4000-8000-000000000503'::uuid,
    'in'::text,
    'receipt'::text,
    20,
    '2026-08-31 10:00:01+00'::timestamptz
  )$$,
  'eine bestehende Receipt-Bewegung bleibt vollständig unverändert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000104'
  )$$,
  'erste Planwert-Variante lässt sich finalisieren'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000105'
  )$$,
  'zweite Planwert-Variante lässt sich finalisieren'
);

select results_eq(
  $$
    select line.allocated_additional_cost, line.allocated_total_cost
    from public.purchase_lines as line
    where line.purchase_id = '93000000-0000-4000-8000-000000000104'
    order by line.created_at, line.id
  $$,
  $$
    select line.allocated_additional_cost, line.allocated_total_cost
    from public.purchase_lines as line
    where line.purchase_id = '93000000-0000-4000-8000-000000000105'
    order by line.created_at, line.id
  $$,
  'vertauschte geschätzte Marktwerte verändern keinen einzigen Kostenanteil'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000106'
  )$$,
  'Mystery-Gesamtkosten lassen sich auf alle sechs Einheiten verteilen'
);

select ok(
  (
    select purchase.purchase_price = 90
      and purchase.total_purchase_cost = 100
      and purchase.entry_status = 'finalized'
    from public.purchases as purchase
    where purchase.id = '93000000-0000-4000-8000-000000000106'
  ) and (
    select line.allocated_additional_cost = 10
      and line.allocated_total_cost = 100
      and line.received_quantity = 6
    from public.purchase_lines as line
    where line.id = '93000000-0000-4000-8000-000000000313'
  ),
  'Mystery-Warenbetrag, Zusatzkosten und Positionssumme bleiben getrennt und exakt'
);

select results_eq(
  $$
    select lot.received_quantity, lot.unit_cost::numeric(12,2)
    from public.stock_lots as lot
    where lot.purchase_id = '93000000-0000-4000-8000-000000000106'
    order by lot.unit_cost desc, lot.id
  $$,
  $$values (4, 16.67::numeric), (2, 16.66::numeric)$$,
  'das Mystery-Mengenlos wird in vier 16,67- und zwei 16,66-Euro-Kohorten geteilt'
);

select ok(
  (
    select sum(lot.received_quantity) = 6
      and sum(lot.received_quantity * lot.unit_cost) = 100
    from public.stock_lots as lot
    where lot.purchase_id = '93000000-0000-4000-8000-000000000106'
  ),
  'jede Mystery-Menge zählt vollständig und alle Lose reconciliieren auf 100 Euro'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000107'
  )$$,
  '22023',
  'Mystery-Einkaufspositionen müssen vollständig unbepreist sein.',
  'eine Mystery Box mit gemischten Preismodi wird abgelehnt'
);

select ok(
  (
    select purchase.entry_status = 'draft'
      and purchase.finalized_at is null
      and purchase.finalized_by is null
    from public.purchases as purchase
    where purchase.id = '93000000-0000-4000-8000-000000000107'
  ) and not exists (
    select 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '93000000-0000-4000-8000-000000000107',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_finalized'
  ),
  'die ungültige Mystery-Finalisierung hinterlässt keine Teiländerung'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000108'
  )$$,
  '22023',
  'Ein Einkauf ohne Positionen kann nicht finalisiert werden.',
  'Finalisierung ohne Positionen wird abgelehnt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000109'
  )$$,
  'P0001',
  'Erzwungener Ereignisfehler nach sämtlichen Finalisierungswrites.',
  'ein Fehler nach Kopf, Lines, Bestand, Movement und Event bricht die Finalisierung ab'
);

select ok(
  (
    select purchase.entry_status = 'draft'
      and purchase.purchase_price is null
      and purchase.total_purchase_cost is null
      and purchase.finalized_at is null
      and purchase.finalized_by is null
    from public.purchases as purchase
    where purchase.id = '93000000-0000-4000-8000-000000000109'
  ) and not exists (
    select 1
    from public.purchase_lines as line
    where line.purchase_id = '93000000-0000-4000-8000-000000000109'
      and (
        line.allocated_additional_cost <> 0
        or line.allocated_total_cost <> 0
        or line.received_quantity <> 0
      )
  ),
  'der späte Ereignisfehler rollt Kopf und sämtliche vorherigen Positionswrites zurück'
);

select ok(
  not exists (
    select 1
    from public.inventory_items
    where purchase_id = '93000000-0000-4000-8000-000000000109'
  ) and not exists (
    select 1
    from public.stock_lots
    where purchase_id = '93000000-0000-4000-8000-000000000109'
  ) and not exists (
    select 1
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = '93000000-0000-4000-8000-000000000109'
  ) and not exists (
    select 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '93000000-0000-4000-8000-000000000109',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_finalized'
  ),
  'der späte Ereignisfehler hinterlässt weder Item, Los, Bewegung noch Finalisierungsereignis'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000110'
  )$$,
  '22023',
  'Der vorhandene Warenbetrag widerspricht der Summe der Einkaufspositionen.',
  'ein vorhandener widersprüchlicher normaler Kopfwert wird abgelehnt'
);

select ok(
  (
    select purchase.entry_status = 'draft'
      and purchase.purchase_price = 99
      and purchase.total_purchase_cost is null
    from public.purchases as purchase
    where purchase.id = '93000000-0000-4000-8000-000000000110'
  ) and not exists (
    select 1
    from public.stock_lots
    where purchase_id = '93000000-0000-4000-8000-000000000110'
  ),
  'der Kopfwert-Konflikt ändert weder Einkauf noch Bestand'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000112'
  )$$,
  '22023',
  'Der vorhandene Warenbetrag widerspricht der Summe der Einkaufspositionen.',
  'ein ausdrücklich erfasster normaler Nullpreis widerspricht einer positiven Positionssumme'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000113'
  )$$,
  'eine ausdrücklich kostenlose normale Nullsumme lässt sich finalisieren'
);

select ok(
  (
    select purchase.purchase_price = 0
      and purchase.total_purchase_cost = 0
      and purchase.entry_status = 'finalized'
    from public.purchases as purchase
    where purchase.id = '93000000-0000-4000-8000-000000000113'
  ) and (
    select sum(lot.received_quantity) = 2
      and sum(lot.received_quantity * lot.unit_cost) = 0
    from public.stock_lots as lot
    where lot.purchase_id = '93000000-0000-4000-8000-000000000113'
  ),
  'eine echte Nullsumme bleibt als realer Nullpreis samt vollständiger Menge erhalten'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000114'
  )$$,
  '22023',
  'Mystery-Einkäufe benötigen einen ausdrücklich erfassten Warenbetrag.',
  'ein unbekannter Mystery-Kopfpreis kann nicht als Nullpreis finalisiert werden'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000115'
  )$$,
  'ein ausdrücklich kostenloser Mystery-Einkauf lässt sich finalisieren'
);

select ok(
  (
    select purchase.purchase_price = 0
      and purchase.total_purchase_cost = 0
      and purchase.entry_status = 'finalized'
    from public.purchases as purchase
    where purchase.id = '93000000-0000-4000-8000-000000000115'
  ) and (
    select count(*) = 1 and sum(item.allocated_purchase_cost) = 0
    from public.inventory_items as item
    where item.purchase_id = '93000000-0000-4000-8000-000000000115'
  ),
  'Mystery-Nullpreis und vollständiger Einzelbestand bleiben unterscheidbar von unbekannt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000116'
  )$$,
  '22023',
  'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.',
  'ein Item ohne purchase_line_id wird vor der Finalisierung abgelehnt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000117'
  )$$,
  '22023',
  'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.',
  'eine Mengenposition darf kein Einzel-Item besitzen'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000118'
  )$$,
  '22023',
  'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.',
  'eine Individualposition darf kein Mengenlos besitzen'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000119'
  )$$,
  '22023',
  'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.',
  'ein Item mit einer Position eines anderen Einkaufs wird abgelehnt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000120'
  )$$,
  '22023',
  'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.',
  'ein Item desselben Einkaufs in einem anderen Workspace wird abgelehnt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000121'
  )$$,
  '22023',
  'Vorhandene Receipt-Bewegungen müssen exakt zum Bestandslos passen.',
  'eine Receipt-Bewegung im falschen Workspace wird abgelehnt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000122'
  )$$,
  '22023',
  'Vorhandene Receipt-Bewegungen müssen exakt zum Bestandslos passen.',
  'eine vorhandene Receipt-Menge muss exakt der Losmenge entsprechen'
);

select results_eq(
  $$
    select lot.received_quantity, movement.quantity, movement.created_at
    from public.stock_lots as lot
    join public.stock_movements as movement on movement.stock_lot_id = lot.id
    where lot.id = '93000000-0000-4000-8000-000000000512'
  $$,
  $$values (2, 1, '2026-08-31 10:03:01+00'::timestamptz)$$,
  'eine inkonsistente Receipt-Historie bleibt nach der Ablehnung unverändert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000123'
  )$$,
  'für ein vorhandenes Los ohne Receipt-Bewegung wird genau eine Bewegung ergänzt'
);

select results_eq(
  $$
    select movement.direction, movement.reason, movement.quantity
    from public.stock_movements as movement
    where movement.stock_lot_id = '93000000-0000-4000-8000-000000000513'
  $$,
  $$values ('in'::text, 'receipt'::text, 2)$$,
  'die fehlende Receipt-Bewegung entspricht exakt der unveränderten Losmenge'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000124'
  )$$,
  '22023',
  'Nur unbearbeitete Einzelstücke können finalisiert werden.',
  'ein gelistetes Einzelstück wird nicht still auf ready zurückgesetzt'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000125'
  )$$,
  '22023',
  'Nur unbearbeitete Einzelstücke können finalisiert werden.',
  'ein als defective markiertes Einzelstück wird nicht still auf ready zurückgesetzt'
);

select results_eq(
  $$
    select item.id, item.status
    from public.inventory_items as item
    where item.id in (
      '93000000-0000-4000-8000-000000000508',
      '93000000-0000-4000-8000-000000000509'
    )
    order by item.id
  $$,
  $$values
    ('93000000-0000-4000-8000-000000000508'::uuid, 'listed'::text),
    ('93000000-0000-4000-8000-000000000509'::uuid, 'defective'::text)
  $$,
  'abgelehnte nicht-draftfähige Itemstatus bleiben unverändert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000126'
  )$$,
  'Mystery-Basispreis und Zusatzkosten werden komponentenweise verteilt'
);

select results_eq(
  $$
    select line.ordered_quantity, line.allocated_additional_cost,
      line.allocated_total_cost, count(item.id), sum(item.allocated_purchase_cost)
    from public.purchase_lines as line
    join public.inventory_items as item on item.purchase_line_id = line.id
    where line.purchase_id = '93000000-0000-4000-8000-000000000126'
    group by line.id, line.created_at
    order by line.created_at, line.id
  $$,
  $$values
    (1, 0.01::numeric, 0.01::numeric, 1::bigint, 0.01::numeric),
    (3, 0.01::numeric, 0.02::numeric, 3::bigint, 0.02::numeric),
    (3, 0.01::numeric, 0.01::numeric, 3::bigint, 0.01::numeric)
  $$,
  'Mengen 1/3/3 erhalten getrennte Komponenten ohne Zusatzkosten über Gesamtkosten'
);

select ok(
  (
    select purchase.total_purchase_cost = 0.04
    from public.purchases as purchase
    where purchase.id = '93000000-0000-4000-8000-000000000126'
  ) and not exists (
    select 1
    from public.purchase_lines as line
    where line.purchase_id = '93000000-0000-4000-8000-000000000126'
      and line.allocated_additional_cost > line.allocated_total_cost
  ) and (
    select sum(line.allocated_total_cost) = 0.04
    from public.purchase_lines as line
    where line.purchase_id = '93000000-0000-4000-8000-000000000126'
  ) and (
    select sum(item.allocated_purchase_cost) = 0.04
    from public.inventory_items as item
    where item.purchase_id = '93000000-0000-4000-8000-000000000126'
  ),
  'Mystery-Kopf, Lines und sämtliche Einheiten reconciliieren auf vier Cent'
);

select throws_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000127'
  )$$,
  '22023',
  'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.',
  'ein Los mit passender Position, aber fremdem purchase_id wird abgelehnt'
);

reset role;

insert into public.purchase_costs (
  id, workspace_id, purchase_id, type, amount, allocation_method
) values
  (
    '93000000-0000-4000-8000-000000000408',
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000101',
    'other', 1, 'value_weighted'
  ),
  (
    '93000000-0000-4000-8000-000000000409',
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000129',
    'other', 1, 'value_weighted'
  );

insert into public.inventory_items (
  id, workspace_id, purchase_id, purchase_line_id, title, condition,
  status, allocated_purchase_cost
) values
  (
    '93000000-0000-4000-8000-000000000519',
    '93000000-0000-4000-8000-000000000011',
    null,
    '93000000-0000-4000-8000-000000000301',
    'Nur über finale Position verknüpft A', 'used', 'received', 0
  ),
  (
    '93000000-0000-4000-8000-000000000520',
    '93000000-0000-4000-8000-000000000011',
    null,
    '93000000-0000-4000-8000-000000000302',
    'Nur über finale Position verknüpft B', 'used', 'received', 0
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    update public.purchase_costs
    set purchase_id = '93000000-0000-4000-8000-000000000129'
    where id = '93000000-0000-4000-8000-000000000408'
  $$,
  '42501',
  'Kosten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'eine Kostenzeile kann nicht von einem finalisierten auf einen Draft-Einkauf verschoben werden'
);

select throws_ok(
  $$
    delete from public.purchase_costs
    where id = '93000000-0000-4000-8000-000000000401'
  $$,
  '42501',
  'Kosten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'eine Kostenzeile eines finalisierten Einkaufs kann nicht gelöscht werden'
);

select lives_ok(
  $$
    update public.purchase_costs
    set description = 'Legitime Draft-Korrektur'
    where id = '93000000-0000-4000-8000-000000000409'
  $$,
  'eine Kostenzeile bleibt innerhalb desselben Draft-Einkaufs editierbar'
);

select throws_ok(
  $$
    update public.purchase_costs
    set purchase_id = '93000000-0000-4000-8000-000000000130'
    where id = '93000000-0000-4000-8000-000000000409'
  $$,
  '42501',
  'Kostenzeilen dürfen nicht auf einen anderen Einkauf verschoben werden.',
  'auch zwischen zwei Drafts kann eine Kostenzeile nicht umgehängt werden'
);

select throws_ok(
  $$
    update public.inventory_items
    set purchase_id = '93000000-0000-4000-8000-000000000129',
        purchase_line_id = '93000000-0000-4000-8000-000000000338'
    where id = '93000000-0000-4000-8000-000000000519'
  $$,
  '42501',
  'Bestandsdaten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'ein nur über seine finale Position verknüpftes Item kann nicht auf einen Draft verschoben werden'
);

select throws_ok(
  $$
    update public.inventory_items
    set title = 'Manipulierter Titel'
    where id = '93000000-0000-4000-8000-000000000520'
  $$,
  '42501',
  'Bestandsdaten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'ein nur über seine Position finalisiertes Item kann nicht direkt geändert werden'
);

select throws_ok(
  $$
    delete from public.inventory_items
    where id = '93000000-0000-4000-8000-000000000520'
  $$,
  '42501',
  'Bestandsdaten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'ein nur über seine Position finalisiertes Item kann nicht gelöscht werden'
);

select throws_ok(
  $$
    insert into public.inventory_items (
      id, workspace_id, purchase_id, purchase_line_id, title, condition,
      status, allocated_purchase_cost
    ) values (
      '93000000-0000-4000-8000-000000000522',
      '93000000-0000-4000-8000-000000000011',
      null,
      '93000000-0000-4000-8000-000000000303',
      'Client-Insert an finale Position', 'used', 'received', 0
    )
  $$,
  '42501',
  'Bestandsdaten finalisierter Einkäufe dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'ein Client kann kein nur über die Position verknüpftes Item an einen finalisierten Einkauf hängen'
);

select lives_ok(
  $$
    insert into public.inventory_items (
      id, workspace_id, title, condition, status, allocated_purchase_cost
    ) values (
      '93000000-0000-4000-8000-000000000523',
      '93000000-0000-4000-8000-000000000011',
      'Legitimer Standalone-Artikel', 'used', 'received', 7
    )
  $$,
  'ein Standalone-Artikel ohne Einkaufslink bleibt anlegbar'
);

select lives_ok(
  $$
    update public.inventory_items
    set title = 'Legitimer Standalone-Artikel bearbeitet',
        allocated_purchase_cost = 8
    where id = '93000000-0000-4000-8000-000000000523'
  $$,
  'ein Standalone-Artikel ohne Einkaufslink bleibt editierbar'
);

select lives_ok(
  $$
    delete from public.inventory_items
    where id = '93000000-0000-4000-8000-000000000523'
  $$,
  'ein Standalone-Artikel ohne Einkaufslink bleibt löschbar'
);

select is(
  (
    public.create_purchase(
      '93000000-0000-4000-8000-000000000011',
      '{
        "type":"single",
        "title":"Manipulierte Draft-Gesamtkosten",
        "purchase_date":"2026-08-31",
        "purchase_price":null,
        "total_purchase_cost":999
      }'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    ) -> 'purchase' ->> 'total_purchase_cost'
  )::numeric,
  null::numeric,
  'create_purchase ignoriert manipulierte Gesamtkosten und gibt einen unbekannten Draftwert zurück'
);

select is(
  (
    select purchase.total_purchase_cost
    from public.purchases as purchase
    where purchase.title = 'Manipulierte Draft-Gesamtkosten'
  ),
  null::numeric,
  'manipulierte Draft-Gesamtkosten werden auch nicht numerisch persistiert'
);

reset role;

-- ---------------------------------------------------------------------------
-- Task 4: finalisierte Einkäufe sicher wieder öffnen und korrigieren
-- ---------------------------------------------------------------------------

select has_function(
  'public',
  'reopen_purchase_costing',
  array['uuid', 'uuid'],
  'die atomare Wiederöffnung ist als RPC vorhanden'
);

select has_function(
  'public',
  'correct_purchase_costing',
  array['uuid', 'uuid', 'text', 'numeric', 'jsonb', 'jsonb'],
  'die atomare Korrektur besitzt einen ausdrücklichen Kaufpreis-Parameter'
);

select ok(
  has_function_privilege(
    'authenticated',
    to_regprocedure('public.reopen_purchase_costing(uuid,uuid)'),
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    to_regprocedure('public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb)'),
    'execute'
  ),
  'authenticated darf Wiederöffnung und Korrektur ausführen'
);

select ok(
  not coalesce(has_function_privilege(
    'public',
    to_regprocedure('public.reopen_purchase_costing(uuid,uuid)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'anon',
    to_regprocedure('public.reopen_purchase_costing(uuid,uuid)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.reopen_purchase_costing(uuid,uuid)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'public',
    to_regprocedure('public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'anon',
    to_regprocedure('public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb)'),
    'execute'
  ), false),
  'öffentliche, anonyme und Service-Role-Aufrufer erhalten keine Korrekturrechte'
);

select results_eq(
  $$
    select routine.proname, owner_role.rolname,
      routine.prosecdef,
      'search_path=""' = any(coalesce(routine.proconfig, array[]::text[]))
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    join pg_catalog.pg_roles as owner_role on owner_role.oid = routine.proowner
    where namespace.nspname = 'public'
      and routine.proname in ('correct_purchase_costing', 'reopen_purchase_costing')
    order by routine.proname
  $$,
  $$values
    ('correct_purchase_costing'::name, 'postgres'::name, true, true),
    ('reopen_purchase_costing'::name, 'postgres'::name, true, true)
  $$,
  'beide Business-RPCs haben einen festen Owner, Definer-Schutz und leeren search_path'
);

insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('94000000-0000-4000-8000-000000000201', '93000000-0000-4000-8000-000000000011', 'Wiederöffnung Menge', 'quantity'),
  ('94000000-0000-4000-8000-000000000202', '93000000-0000-4000-8000-000000000011', 'Korrektur Menge', 'quantity'),
  ('94000000-0000-4000-8000-000000000203', '93000000-0000-4000-8000-000000000011', 'Verkauftes Los', 'quantity'),
  ('94000000-0000-4000-8000-000000000204', '93000000-0000-4000-8000-000000000011', 'Mystery-Preiskorrektur', 'quantity'),
  ('94000000-0000-4000-8000-000000000205', '93000000-0000-4000-8000-000000000011', 'Retouren-Korrektur', 'quantity'),
  ('94000000-0000-4000-8000-000000000206', '93000000-0000-4000-8000-000000000011', 'Aktive Centfolge', 'quantity'),
  ('94000000-0000-4000-8000-000000000207', '93000000-0000-4000-8000-000000000011', 'Legacy-Reihenfolge', 'quantity'),
  ('94000000-0000-4000-8000-000000000208', '93000000-0000-4000-8000-000000000011', 'Teilweise Wiedereinlagerung', 'quantity');

insert into public.purchases (
  id, workspace_id, type, title, purchase_price, total_purchase_cost
) values
  ('94000000-0000-4000-8000-000000000101', '93000000-0000-4000-8000-000000000011', 'lot', 'Ohne Verkauf wieder öffnen', null, null),
  ('94000000-0000-4000-8000-000000000102', '93000000-0000-4000-8000-000000000011', 'single', 'Verkauftes Einzelstück', null, null),
  ('94000000-0000-4000-8000-000000000103', '93000000-0000-4000-8000-000000000011', 'lot', 'Teilverkauftes Los', null, null),
  ('94000000-0000-4000-8000-000000000104', '93000000-0000-4000-8000-000000000011', 'lot', 'Verkaufte und unverkäufte Korrektur', null, null),
  ('94000000-0000-4000-8000-000000000105', '93000000-0000-4000-8000-000000000011', 'single', 'Rollback der Korrektur', null, null),
  ('94000000-0000-4000-8000-000000000107', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Mystery wieder öffnen', 20, null),
  ('94000000-0000-4000-8000-000000000108', '93000000-0000-4000-8000-000000000011', 'single', 'Finalisiert ohne Verkauf', null, null),
  ('94000000-0000-4000-8000-000000000109', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Verkaufte Mystery-Preiskorrektur', 3, null),
  ('94000000-0000-4000-8000-000000000110', '93000000-0000-4000-8000-000000000011', 'single', 'Zusatzkosten bewusst entfernen', null, null),
  ('94000000-0000-4000-8000-000000000111', '93000000-0000-4000-8000-000000000011', 'lot', 'Mehrfach verkaufte und retournierte Menge', null, null),
  ('94000000-0000-4000-8000-000000000112', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Aktive Centfolge nach Wiedereinlagerung', 0.03, null),
  ('94000000-0000-4000-8000-000000000113', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Legacy-Reihenfolge ohne Sequenz', 0.03, null),
  ('94000000-0000-4000-8000-000000000114', '93000000-0000-4000-8000-000000000011', 'mystery_pack', 'Teilweise Wiedereinlagerung', 0.03, null);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total, condition_snapshot, estimated_market_value,
  created_at
) values
  ('94000000-0000-4000-8000-000000000301', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000101', null, 'Wiederöffnung Einzelstück', 'individual', 1, 0, 'priced', 10, 10, 'very_good', null, '2026-08-31 12:00:01+00'),
  ('94000000-0000-4000-8000-000000000302', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000101', '94000000-0000-4000-8000-000000000201', 'Wiederöffnung Menge', 'quantity', 2, 0, 'priced', 5, 10, null, null, '2026-08-31 12:00:02+00'),
  ('94000000-0000-4000-8000-000000000303', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000102', null, 'Verkauftes Einzelstück', 'individual', 1, 0, 'priced', 12, 12, 'like_new', null, '2026-08-31 12:01:01+00'),
  ('94000000-0000-4000-8000-000000000304', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000103', '94000000-0000-4000-8000-000000000203', 'Verkauftes Los', 'quantity', 2, 0, 'priced', 6, 12, null, null, '2026-08-31 12:02:01+00'),
  ('94000000-0000-4000-8000-000000000305', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000104', null, 'Korrektur Einzelstücke', 'individual', 2, 0, 'priced', 10, 20, 'very_good', null, '2026-08-31 12:03:01+00'),
  ('94000000-0000-4000-8000-000000000306', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000104', '94000000-0000-4000-8000-000000000202', 'Korrektur Menge', 'quantity', 3, 0, 'priced', 10, 30, null, null, '2026-08-31 12:03:02+00'),
  ('94000000-0000-4000-8000-000000000307', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000105', null, 'Rollback Einzelstück', 'individual', 1, 0, 'priced', 8, 8, 'used', null, '2026-08-31 12:04:01+00'),
  ('94000000-0000-4000-8000-000000000308', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000107', null, 'Mystery-Inhalt', 'individual', 2, 0, 'unpriced_mystery', null, null, 'used', 30, '2026-08-31 12:05:01+00'),
  ('94000000-0000-4000-8000-000000000309', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000108', null, 'Noch nicht verkauft', 'individual', 1, 0, 'priced', 4, 4, 'used', null, '2026-08-31 12:06:01+00'),
  ('94000000-0000-4000-8000-000000000310', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000109', '94000000-0000-4000-8000-000000000204', 'Mystery-Preiskorrektur', 'quantity', 3, 0, 'unpriced_mystery', null, null, null, null, '2026-08-31 12:07:01+00'),
  ('94000000-0000-4000-8000-000000000311', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000110', null, 'Zusatzkosten bewusst entfernen', 'individual', 1, 0, 'priced', 5, 5, 'used', null, '2026-08-31 12:08:01+00'),
  ('94000000-0000-4000-8000-000000000312', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000111', '94000000-0000-4000-8000-000000000205', 'Retouren-Korrektur', 'quantity', 3, 0, 'priced', 0.01, 0.03, null, null, '2026-08-31 12:09:01+00'),
  ('94000000-0000-4000-8000-000000000313', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000112', '94000000-0000-4000-8000-000000000206', 'Aktive Centfolge', 'quantity', 3, 0, 'unpriced_mystery', null, null, null, null, '2026-08-31 12:10:01+00'),
  ('94000000-0000-4000-8000-000000000314', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000113', '94000000-0000-4000-8000-000000000207', 'Legacy-Reihenfolge', 'quantity', 3, 0, 'unpriced_mystery', null, null, null, null, '2026-08-31 12:11:01+00'),
  ('94000000-0000-4000-8000-000000000315', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000114', '94000000-0000-4000-8000-000000000208', 'Teilweise Wiedereinlagerung', 'quantity', 3, 0, 'unpriced_mystery', null, null, null, null, '2026-08-31 12:12:01+00');

insert into public.purchase_costs (
  id, workspace_id, purchase_id, type, amount, description, allocation_method
) values
  ('94000000-0000-4000-8000-000000000401', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000101', 'shipping', 4, 'Einkaufsversand', 'quantity'),
  ('94000000-0000-4000-8000-000000000402', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000104', 'shipping', 5, 'Alter Einkaufsversand', 'value_weighted'),
  ('94000000-0000-4000-8000-000000000403', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000105', 'shipping', 2, 'Rollback-Versand', 'value_weighted'),
  ('94000000-0000-4000-8000-000000000404', '93000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000110', 'shipping', 2, 'Zu löschende Zusatzkosten', 'value_weighted');

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000101'
  )$$,
  'das Wiederöffnungs-Fixture wird zunächst regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000102'
  )$$,
  'das Einzelverkaufs-Fixture wird zunächst regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000103'
  )$$,
  'das Losverkaufs-Fixture wird zunächst regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000104'
  )$$,
  'das Korrektur-Fixture wird zunächst regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000105'
  )$$,
  'das Rollback-Fixture wird zunächst regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000107'
  )$$,
  'das Mystery-Wiederöffnungs-Fixture wird zunächst regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000108'
  )$$,
  'das Fixture ohne Verkauf wird zunächst regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000109'
  )$$,
  'das verkaufte Mystery-Fixture wird zunächst regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000110'
  )$$,
  'das Fixture für das bewusste Entfernen von Zusatzkosten wird finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000111'
  )$$,
  'das Retouren-Fixture wird zunächst regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000112'
  )$$,
  'das Fixture für die aktive Centfolge wird regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000113'
  )$$,
  'das Fixture für historische Entnahmereihenfolgen wird regulär finalisiert'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000114'
  )$$,
  'das Fixture für teilweise Wiedereinlagerung wird regulär finalisiert'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"eBay","sale_date":"2026-08-20","external_order_id":"task4-sold-item"}'::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'inventory_item_id', (
          select item.id
          from public.inventory_items as item
          where item.purchase_line_id = '94000000-0000-4000-8000-000000000303'
        ),
        'quantity', 1,
        'unit_sale_price', 25
      ))
    )
  $$,
  'das Einzelstück-Fixture erhält einen Verkauf'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"eBay","sale_date":"2026-08-21","external_order_id":"task4-sold-lot"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000203","quantity":1,"unit_sale_price":20}]'::jsonb
    )
  $$,
  'das Los-Fixture erhält eine verkaufte Einheit'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"eBay","sale_date":"2026-08-22","platform_fee":3,"shipping_cost":4,"packaging_cost":1,"other_costs":2,"external_order_id":"task4-correct-item"}'::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'inventory_item_id', (
          select item.id
          from public.inventory_items as item
          where item.purchase_line_id = '94000000-0000-4000-8000-000000000305'
          order by item.created_at, item.id
          limit 1
        ),
        'quantity', 1,
        'unit_sale_price', 50
      ))
    )
  $$,
  'das Korrektur-Fixture verkauft ein Einzelstück mit festen Erlösdaten'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"Vinted","sale_date":"2026-08-23","platform_fee":1,"shipping_cost":2,"packaging_cost":3,"other_costs":4,"external_order_id":"task4-correct-lot"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000202","quantity":1,"unit_sale_price":30}]'::jsonb
    )
  $$,
  'das Korrektur-Fixture verkauft eine Mengeneinheit mit festen Erlösdaten'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"eBay","sale_date":"2026-08-24","external_order_id":"task4-rollback"}'::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'inventory_item_id', (
          select item.id
          from public.inventory_items as item
          where item.purchase_line_id = '94000000-0000-4000-8000-000000000307'
        ),
        'quantity', 1,
        'unit_sale_price', 18
      ))
    )
  $$,
  'das Rollback-Fixture erhält einen Verkauf'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"eBay","sale_date":"2026-08-25","external_order_id":"task4-mystery-price"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000204","quantity":1,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'das Mystery-Preiskorrektur-Fixture erhält einen Verkauf'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-26","external_order_id":"task4-delete-costs"}'::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'inventory_item_id', (
          select item.id
          from public.inventory_items as item
          where item.purchase_line_id = '94000000-0000-4000-8000-000000000311'
        ),
        'quantity', 1,
        'unit_sale_price', 12
      ))
    )
  $$,
  'das Zusatzkosten-Fixture erhält einen Verkauf'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-27","external_order_id":"task4-return-restocked"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000205","quantity":2,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'das Retouren-Fixture verkauft zunächst zwei Einheiten'
);

select lives_ok(
  $$
    select public.record_sale_return(
      '93000000-0000-4000-8000-000000000011',
      (
        select sale.id
        from public.sales as sale
        where sale.external_order_id = 'task4-return-restocked'
      ),
      20,
      true,
      'customer return',
      'wieder eingelagert',
      'restock_ready',
      'Testkäufer A'
    )
  $$,
  'die erste Mengenretoure wird vollständig wieder eingelagert'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-28","external_order_id":"task4-return-written-off"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000205","quantity":1,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'das Retouren-Fixture verkauft eine wieder vorhandene Einheit erneut'
);

select lives_ok(
  $$
    select public.record_sale_return(
      '93000000-0000-4000-8000-000000000011',
      (
        select sale.id
        from public.sales as sale
        where sale.external_order_id = 'task4-return-written-off'
      ),
      10,
      false,
      'customer return',
      'nicht wieder eingelagert',
      'write_off',
      'Testkäufer B'
    )
  $$,
  'die zweite Mengenretoure wird als nicht einlagerbar dokumentiert'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-20","external_order_id":"task4-active-cent-restocked"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000206","quantity":1,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'die aktive Centfolge verkauft zunächst eine Einheit'
);

select lives_ok(
  $$
    select public.record_sale_return(
      '93000000-0000-4000-8000-000000000011',
      (
        select sale.id
        from public.sales as sale
        where sale.external_order_id = 'task4-active-cent-restocked'
      ),
      10,
      true,
      'customer return',
      'vollständig wieder eingelagert',
      'restock_ready',
      'Testkäufer C'
    )
  $$,
  'die erste Einheit der aktiven Centfolge wird vollständig wieder eingelagert'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-21","external_order_id":"task4-active-cent-current"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000206","quantity":2,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'nach der Wiedereinlagerung werden zwei weiterhin aktive Einheiten verkauft'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-22","external_order_id":"task4-legacy-first"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000207","quantity":2,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'die Legacy-Reihenfolge erfasst ihren fachlich ersten Verkauf'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-23","external_order_id":"task4-legacy-second"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000207","quantity":1,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'die Legacy-Reihenfolge erfasst ihren fachlich zweiten Verkauf'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-24","external_order_id":"task4-partial-restock"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000208","quantity":2,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'das Teilretouren-Fixture verkauft zunächst zwei Einheiten'
);

select lives_ok(
  $$
    select public.record_sale_return(
      '93000000-0000-4000-8000-000000000011',
      (
        select sale.id
        from public.sales as sale
        where sale.external_order_id = 'task4-partial-restock'
      ),
      20,
      true,
      'customer return',
      'Legacy-Fakt wird anschließend auf eine Einheit präzisiert',
      'restock_ready',
      'Testkäufer D'
    )
  $$,
  'das Teilretouren-Fixture erzeugt zunächst einen dokumentierten Retourenfakt'
);

reset role;

select results_eq(
  $$
    select sale.external_order_id,
      (pg_catalog.to_jsonb(allocation) ->> 'consumption_sequence')::bigint
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id in (
      'task4-return-restocked',
      'task4-return-written-off',
      'task4-active-cent-restocked',
      'task4-active-cent-current',
      'task4-legacy-first',
      'task4-legacy-second',
      'task4-partial-restock'
    )
    order by sale.external_order_id
  $$,
  $$values
    ('task4-active-cent-current'::text, 2::bigint),
    ('task4-active-cent-restocked'::text, 1::bigint),
    ('task4-legacy-first'::text, 1::bigint),
    ('task4-legacy-second'::text, 2::bigint),
    ('task4-partial-restock'::text, 1::bigint),
    ('task4-return-restocked'::text, 1::bigint),
    ('task4-return-written-off'::text, 2::bigint)
  $$,
  'mehrere Verkaufsaufrufe derselben Transaktion erhalten je Los eine fortlaufende fachliche Reihenfolge'
);

select throws_ok(
  $$
    update public.sale_line_lot_allocations as allocation
    set consumption_sequence = 99
    from public.sale_lines as sale_line,
      public.sales as sale
    where sale_line.id = allocation.sale_line_id
      and sale.id = sale_line.sale_id
      and sale.external_order_id = 'task4-active-cent-restocked'
  $$,
  '42501',
  'Eine vergebene Losentnahmereihenfolge ist unveränderlich.',
  'eine vergebene fachliche Entnahmereihenfolge lässt sich nicht direkt verändern'
);

set local session_replication_role = replica;

select throws_ok(
  $$
    update public.sale_line_lot_allocations as later_allocation
    set consumption_sequence = 1
    from public.sale_lines as sale_line,
      public.sales as sale
    where sale_line.id = later_allocation.sale_line_id
      and sale.id = sale_line.sale_id
      and sale.external_order_id = 'task4-active-cent-current'
  $$,
  '23505',
  null,
  'auch bei deaktiviertem Guard verhindert der eindeutige Index doppelte Lossequenzen'
);

-- Exakte Zeitgleichheit und absichtlich umgekehrte UUIDs dürfen die explizite
-- fachliche Reihenfolge dieser neuen Verkäufe nicht beeinflussen.
update public.sales
set created_at = '2026-08-31 12:30:00+00'
where external_order_id in ('task4-return-restocked', 'task4-return-written-off');

update public.sale_line_lot_allocations as allocation
set id = case sale.external_order_id
    when 'task4-return-restocked'
      then '94000000-0000-4000-8000-000000000502'::uuid
    when 'task4-return-written-off'
      then '94000000-0000-4000-8000-000000000501'::uuid
  end,
  created_at = '2026-08-31 12:30:00+00'
from public.sale_lines as sale_line,
  public.sales as sale
where sale_line.id = allocation.sale_line_id
  and sale.id = sale_line.sale_id
  and sale.external_order_id in (
    'task4-return-restocked',
    'task4-return-written-off'
  );

-- Dieses Fixture simuliert nullable Task-6-Altdaten ohne Sequenz. Bei exakt
-- gleichen Fachzeiten darf eine Korrektur keine UUID-Chronologie erfinden.
do $$
begin
  if exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sale_line_lot_allocations'
      and column_info.column_name = 'consumption_sequence'
  ) then
    execute $sql$
      update public.sale_line_lot_allocations as allocation
      set consumption_sequence = null,
        active_allocated_cost = null
      from public.sale_lines as sale_line,
        public.sales as sale
      where sale_line.id = allocation.sale_line_id
        and sale.id = sale_line.sale_id
        and sale.external_order_id in ('task4-legacy-first', 'task4-legacy-second')
    $sql$;
  end if;
end;
$$;

update public.sales
set created_at = '2026-08-31 12:31:00+00'
where external_order_id in ('task4-legacy-first', 'task4-legacy-second');

update public.sale_line_lot_allocations as allocation
set created_at = '2026-08-31 12:31:00+00'
from public.sale_lines as sale_line,
  public.sales as sale
where sale_line.id = allocation.sale_line_id
  and sale.id = sale_line.sale_id
  and sale.external_order_id in ('task4-legacy-first', 'task4-legacy-second');

-- Ein bestehender Legacy-Fakt kann eine teilweise Wiedereinlagerung enthalten.
-- Die Korrektur muss die tatsächlich zurückgekehrte Menge aus den unveränderten
-- Bewegungen ableiten, ohne Verkaufs- oder Retourenfakten umzuschreiben.
update public.stock_movements as movement
set quantity = 1
from public.sale_lines as sale_line,
  public.sales as sale
where sale_line.id = movement.sale_line_id
  and sale.id = sale_line.sale_id
  and sale.external_order_id = 'task4-partial-restock'
  and movement.reason = 'return';

update public.stock_lots
set remaining_quantity = 2
where purchase_id = '94000000-0000-4000-8000-000000000114';

set local session_replication_role = origin;

create temporary table task4_partial_fact_snapshot on commit drop as
select pg_catalog.jsonb_build_object(
  'sales', (
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(sale) order by sale.id)
    from public.sales as sale
    where sale.external_order_id = 'task4-partial-restock'
  ),
  'returns', (
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(returned_sale) order by returned_sale.id)
    from public.returns as returned_sale
    join public.sales as sale on sale.id = returned_sale.sale_id
    where sale.external_order_id = 'task4-partial-restock'
  ),
  'movements', (
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(movement) order by movement.id)
    from public.stock_movements as movement
    join public.sale_lines as sale_line on sale_line.id = movement.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-partial-restock'
  )
) as facts;

grant select on task4_partial_fact_snapshot to authenticated;

create temporary table task4_reopen_item_snapshot on commit drop as
select item.id, item.created_at
from public.inventory_items as item
where item.purchase_id = '94000000-0000-4000-8000-000000000101';

create temporary table task4_reopen_lot_snapshot on commit drop as
select lot.id, lot.received_quantity, lot.remaining_quantity, lot.received_at
from public.stock_lots as lot
where lot.purchase_id = '94000000-0000-4000-8000-000000000101';

create temporary table task4_reopen_movement_snapshot on commit drop as
select movement.id, movement.stock_lot_id, movement.direction, movement.quantity,
  movement.reason, movement.created_at
from public.stock_movements as movement
join public.stock_lots as lot on lot.id = movement.stock_lot_id
where lot.purchase_id = '94000000-0000-4000-8000-000000000101';

grant select on task4_reopen_item_snapshot, task4_reopen_lot_snapshot,
  task4_reopen_movement_snapshot to authenticated;

create function public.test_fail_purchase_correction_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.entity_type = 'purchase'
    and new.entity_id = '94000000-0000-4000-8000-000000000105'::uuid
    and new.event_type = 'purchase_corrected' then
    if not exists (
      select 1
      from public.purchases as purchase
      where purchase.id = new.entity_id
        and purchase.entry_status = 'finalized'
        and purchase.purchase_price = 18
        and purchase.total_purchase_cost = 20
    ) or not exists (
      select 1
      from public.purchase_lines as line
      where line.id = '94000000-0000-4000-8000-000000000307'
        and line.unit_purchase_price = 18
        and line.line_total = 18
        and line.allocated_total_cost = 20
    ) or not exists (
      select 1
      from public.inventory_items as item
      where item.purchase_line_id = '94000000-0000-4000-8000-000000000307'
        and item.allocated_purchase_cost = 20
    ) or not exists (
      select 1
      from public.sale_lines as sale_line
      join public.sales as sale on sale.id = sale_line.sale_id
      where sale.external_order_id = 'task4-rollback'
        and sale_line.cost_of_goods_sold = 20
    ) or not exists (
      select 1
      from public.business_events as event
      where event.id = new.id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Der erzwungene Korrekturfehler trat vor den abhängigen Writes auf.';
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'Erzwungener Ereignisfehler nach sämtlichen Korrekturwrites.';
  end if;
  return new;
end;
$$;

create trigger test_fail_purchase_correction_event_insert
after insert on public.business_events
for each row execute function public.test_fail_purchase_correction_event_insert();

create function public.test_fail_purchase_reopen_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.entity_type = 'purchase'
    and new.entity_id = '94000000-0000-4000-8000-000000000108'::uuid
    and new.event_type = 'purchase_reopened' then
    if not exists (
      select 1
      from public.purchases as purchase
      where purchase.id = new.entity_id
        and purchase.entry_status = 'capturing'
        and purchase.purchase_price is null
        and purchase.total_purchase_cost is null
        and purchase.finalized_at is null
        and purchase.finalized_by is null
    ) or not exists (
      select 1
      from public.purchase_lines as line
      where line.id = '94000000-0000-4000-8000-000000000309'
        and line.allocated_additional_cost = 0
        and line.allocated_total_cost = 0
    ) or not exists (
      select 1
      from public.inventory_items as item
      where item.purchase_line_id = '94000000-0000-4000-8000-000000000309'
        and item.status = 'received'
        and item.allocated_purchase_cost = 0
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Der erzwungene Wiederöffnungsfehler trat vor den abhängigen Writes auf.';
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'Erzwungener Ereignisfehler nach sämtlichen Wiederöffnungswrites.';
  end if;
  return new;
end;
$$;

create trigger test_fail_purchase_reopen_event_insert
after insert on public.business_events
for each row execute function public.test_fail_purchase_reopen_event_insert();

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.reopen_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000101'
  )$$,
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'Wiederöffnen ohne authentifizierten Aufrufer scheitert vor jedem Write'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000104',
    'Preis korrigiert',
    null,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'Korrigieren ohne authentifizierten Aufrufer scheitert vor jedem Write'
);

select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-25","external_order_id":"task4-partial-current"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000208","quantity":1,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'nach einer teilweisen Wiedereinlagerung bleibt genau die vorhandene Menge verkaufbar'
);

select throws_ok(
  $$select public.reopen_purchase_costing(
    '93000000-0000-4000-8000-000000000012',
    '94000000-0000-4000-8000-000000000101'
  )$$,
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'eine Wiederöffnung über einen fremden Workspace wird ohne Write abgelehnt'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000012',
    '94000000-0000-4000-8000-000000000104',
    'Fremder Workspace',
    null,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'eine Korrektur über einen fremden Workspace wird ohne Write abgelehnt'
);

select throws_ok(
  $$select public.reopen_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000102'
  )$$,
  '22023',
  'Ein Einkauf mit Verkäufen kann nicht wieder geöffnet werden.',
  'eine Verkaufsposition für ein Einzelstück verhindert die Wiederöffnung'
);

select throws_ok(
  $$select public.reopen_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000103'
  )$$,
  '22023',
  'Ein Einkauf mit Verkäufen kann nicht wieder geöffnet werden.',
  'eine verkaufte Loszuordnung verhindert die Wiederöffnung'
);

select lives_ok(
  $$select public.reopen_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000101'
  )$$,
  'ein finalisierter Einkauf ohne Verkauf lässt sich atomar wieder öffnen'
);

select ok(
  (
    select purchase.entry_status = 'capturing'
      and purchase.purchase_price is null
      and purchase.total_purchase_cost is null
      and purchase.finalized_at is null
      and purchase.finalized_by is null
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000101'
  ) and not exists (
    select 1
    from public.purchase_lines as line
    where line.purchase_id = '94000000-0000-4000-8000-000000000101'
      and (
        line.allocated_additional_cost <> 0
        or line.allocated_total_cost <> 0
      )
  ),
  'Wiederöffnen leert Finalisierungsmetadaten, normale Ableitungen und Positionskosten'
);

select results_eq(
  $$
    select item.id, item.created_at
    from public.inventory_items as item
    where item.purchase_id = '94000000-0000-4000-8000-000000000101'
    order by item.id
  $$,
  $$select snapshot.id, snapshot.created_at from task4_reopen_item_snapshot as snapshot order by snapshot.id$$,
  'die Wiederöffnung bewahrt alle Einzelartikel-Identitäten'
);

select results_eq(
  $$
    select lot.id, lot.received_quantity, lot.remaining_quantity, lot.received_at
    from public.stock_lots as lot
    where lot.purchase_id = '94000000-0000-4000-8000-000000000101'
    order by lot.id
  $$,
  $$
    select snapshot.id, snapshot.received_quantity, snapshot.remaining_quantity,
      snapshot.received_at
    from task4_reopen_lot_snapshot as snapshot
    order by snapshot.id
  $$,
  'die Wiederöffnung bewahrt Los-Identität und Bestandsmengen'
);

select results_eq(
  $$
    select movement.id, movement.stock_lot_id, movement.direction,
      movement.quantity, movement.reason, movement.created_at
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = '94000000-0000-4000-8000-000000000101'
    order by movement.id
  $$,
  $$
    select snapshot.id, snapshot.stock_lot_id, snapshot.direction,
      snapshot.quantity, snapshot.reason, snapshot.created_at
    from task4_reopen_movement_snapshot as snapshot
    order by snapshot.id
  $$,
  'die unveränderliche Receipt-Historie bleibt vollständig erhalten'
);

select ok(
  not exists (
    select 1
    from public.inventory_items as item
    where item.purchase_id = '94000000-0000-4000-8000-000000000101'
      and (item.allocated_purchase_cost <> 0 or item.status in ('ready', 'listed'))
  ) and not exists (
    select 1
    from public.stock_lots as lot
    where lot.purchase_id = '94000000-0000-4000-8000-000000000101'
      and lot.unit_cost <> 0
  ),
  'abgeleitete unverkaufte Bestände sind nach dem Kostenreset nicht verkaufsbereit'
);

select throws_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"eBay","sale_date":"2026-08-31"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":10}]'::jsonb
    )
  $$,
  '22023',
  'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.',
  'Mengenbestand eines wieder geöffneten Einkaufs kann nicht verkauft werden'
);

select throws_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"eBay","sale_date":"2026-08-31"}'::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'inventory_item_id', (
          select item.id
          from public.inventory_items as item
          where item.purchase_line_id = '94000000-0000-4000-8000-000000000301'
        ),
        'quantity', 1,
        'unit_sale_price', 10
      ))
    )
  $$,
  '22023',
  'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.',
  'ein wieder geöffnetes Einzelstück kann nicht verkauft werden'
);

select is(
  (
    select count(*)
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '94000000-0000-4000-8000-000000000101',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_reopened'
      and event.changes #>> '{purchase,before,entry_status}' = 'finalized'
      and event.changes #>> '{purchase,after,entry_status}' = 'capturing'
      and (event.changes #>> '{purchase,before,total_purchase_cost}')::numeric = 24
      and event.changes #> '{purchase,after,total_purchase_cost}' = 'null'::jsonb
  ),
  1::bigint,
  'genau ein aussagekräftiges unveränderliches Wiederöffnungsereignis wird angelegt'
);

select lives_ok(
  $$select public.reopen_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000107'
  )$$,
  'auch ein Mystery-Einkauf ohne Verkauf lässt sich wieder öffnen'
);

select ok(
  (
    select purchase.entry_status = 'capturing'
      and purchase.purchase_price = 20
      and purchase.total_purchase_cost is null
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000107'
  ),
  'Wiederöffnen bewahrt den ausdrücklich erfassten Mystery-Warenbetrag'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000104'::uuid,
    '94000000-0000-4000-8000-000000000104'::uuid,
    ' ',
    null,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'ein unpassender Workspace wird vor der Nutzlast ausgewertet'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000104',
    '   ',
    null,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Ein verständlicher Grund der Korrektur ist erforderlich.',
  'eine Korrektur lehnt einen leeren Pflichtgrund ab'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000108',
    'Noch kein Verkauf',
    null,
    '[{"id":"94000000-0000-4000-8000-000000000309","catalog_product_id":null,"title_snapshot":"Noch nicht verkauft","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":4,"line_total":4,"condition_snapshot":"used","estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Ein Einkauf ohne Verkauf muss wieder geöffnet werden.',
  'die Korrektur bleibt dem Ablauf nach dem ersten Verkauf vorbehalten'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000104',
    'Unvollständige Ersatzdaten',
    null,
    '[{"id":"94000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Korrektur Einzelstücke","line_kind":"individual","ordered_quantity":2,"price_mode":"priced","unit_purchase_price":20,"line_total":40,"condition_snapshot":"very_good","estimated_market_value":null}]'::jsonb,
    '[{"id":"94000000-0000-4000-8000-000000000402","type":"shipping","amount":10,"description":"Neuer Einkaufsversand","allocation_method":"value_weighted","target_purchase_line_id":null}]'::jsonb
  )$$,
  '22023',
  'Bestehende Einkaufspositionen dürfen bei einer Korrektur nicht entfernt werden.',
  'eine Ersatznutzlast darf keine bestehende Position auslassen'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000104',
    'Fremdes Feld',
    null,
    '[{"id":"94000000-0000-4000-8000-000000000305","workspace_id":"93000000-0000-4000-8000-000000000012","catalog_product_id":null,"title_snapshot":"Korrektur Einzelstücke","line_kind":"individual","ordered_quantity":2,"price_mode":"priced","unit_purchase_price":20,"line_total":40,"condition_snapshot":"very_good","estimated_market_value":null},{"id":"94000000-0000-4000-8000-000000000306","catalog_product_id":"94000000-0000-4000-8000-000000000202","title_snapshot":"Korrektur Menge","line_kind":"quantity","ordered_quantity":3,"price_mode":"priced","unit_purchase_price":20,"line_total":60,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[{"id":"94000000-0000-4000-8000-000000000402","type":"shipping","amount":10,"description":"Neuer Einkaufsversand","allocation_method":"value_weighted","target_purchase_line_id":null}]'::jsonb
  )$$,
  '22023',
  'Die Ersatz-Einkaufspositionen sind ungültig.',
  'workspace- und andere fremde Felder werden strikt abgelehnt'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000104',
    'Ungültige Zusatzkosten',
    null,
    '[{"id":"94000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Korrektur Einzelstücke","line_kind":"individual","ordered_quantity":2,"price_mode":"priced","unit_purchase_price":20,"line_total":40,"condition_snapshot":"very_good","estimated_market_value":null},{"id":"94000000-0000-4000-8000-000000000306","catalog_product_id":"94000000-0000-4000-8000-000000000202","title_snapshot":"Korrektur Menge","line_kind":"quantity","ordered_quantity":3,"price_mode":"priced","unit_purchase_price":20,"line_total":60,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[{"id":"94000000-0000-4000-8000-000000000402","type":"shipping","amount":-1,"description":"Negativ","allocation_method":"value_weighted","target_purchase_line_id":null}]'::jsonb
  )$$,
  '22023',
  'Die Ersatz-Zusatzkosten sind ungültig.',
  'negative oder semantisch ungültige Zusatzkosten werden abgelehnt'
);

select ok(
  (
    select purchase.purchase_price = 50
      and purchase.total_purchase_cost = 55
      and purchase.entry_status = 'finalized'
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000104'
  ) and (
    select cost.amount = 5
    from public.purchase_costs as cost
    where cost.id = '94000000-0000-4000-8000-000000000402'
  ) and not exists (
    select 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '94000000-0000-4000-8000-000000000104',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_corrected'
  ),
  'alle abgelehnten Korrekturen lassen Einkauf, Kosten und Journal unverändert'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000104',
    'Rechnungsbetrag und Einkaufsversand korrigiert',
    null,
    '[{"id":"94000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Korrektur Einzelstücke","line_kind":"individual","ordered_quantity":2,"price_mode":"priced","unit_purchase_price":20,"line_total":40,"condition_snapshot":"very_good","estimated_market_value":null},{"id":"94000000-0000-4000-8000-000000000306","catalog_product_id":"94000000-0000-4000-8000-000000000202","title_snapshot":"Korrektur Menge","line_kind":"quantity","ordered_quantity":3,"price_mode":"priced","unit_purchase_price":20,"line_total":60,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[{"id":"94000000-0000-4000-8000-000000000402","type":"shipping","amount":10,"description":"Neuer Einkaufsversand","allocation_method":"value_weighted","target_purchase_line_id":null}]'::jsonb
  )$$,
  'eine begründete Korrektur aktualisiert Einkauf und abhängige Kosten atomar'
);

select results_eq(
  $$
    select line.id, line.unit_purchase_price, line.line_total,
      line.allocated_additional_cost, line.allocated_total_cost
    from public.purchase_lines as line
    where line.purchase_id = '94000000-0000-4000-8000-000000000104'
    order by line.id
  $$,
  $$values
    ('94000000-0000-4000-8000-000000000305'::uuid, 20::numeric, 40::numeric, 4::numeric, 44::numeric),
    ('94000000-0000-4000-8000-000000000306'::uuid, 20::numeric, 60::numeric, 6::numeric, 66::numeric)
  $$,
  'die Korrektur berechnet Positions- und Zusatzkosten centgenau neu'
);

select ok(
  (
    select purchase.purchase_price = 100
      and purchase.total_purchase_cost = 110
      and purchase.entry_status = 'finalized'
      and purchase.finalized_at is not null
      and purchase.finalized_by is not null
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000104'
  ) and (
    select count(*) = 2 and min(item.allocated_purchase_cost) = 22
      and max(item.allocated_purchase_cost) = 22
    from public.inventory_items as item
    where item.purchase_line_id = '94000000-0000-4000-8000-000000000305'
  ) and (
    select sum(lot.received_quantity) = 3
      and sum(lot.remaining_quantity) = 2
      and min(lot.unit_cost) = 22
      and max(lot.unit_cost) = 22
    from public.stock_lots as lot
    where lot.purchase_line_id = '94000000-0000-4000-8000-000000000306'
  ),
  'Kopf, unverkaufte Einzelstücke und verbleibender Losbestand tragen die korrigierten Kosten'
);

select results_eq(
  $$
    select sale.external_order_id, sale_line.unit_sale_price,
      sale_line.line_total, sale_line.cost_of_goods_sold
    from public.sales as sale
    join public.sale_lines as sale_line on sale_line.sale_id = sale.id
    where sale.external_order_id in ('task4-correct-item', 'task4-correct-lot')
    order by sale.external_order_id
  $$,
  $$values
    ('task4-correct-item'::text, 50::numeric, 50::numeric, 22::numeric),
    ('task4-correct-lot'::text, 30::numeric, 30::numeric, 22::numeric)
  $$,
  'verkaufte Einzel- und Lospositionen behalten Erlöse und erhalten korrigierten Wareneinsatz'
);

select results_eq(
  $$
    select allocation.quantity, allocation.unit_cost, allocation.allocated_cost
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-correct-lot'
  $$,
  $$values (1, 22::numeric, 22::numeric)$$,
  'auch der persistierte Los-Kostensnapshot wird korrigiert'
);

select results_eq(
  $$
    select sale.external_order_id, sale.platform, sale.sale_price,
      sale.sale_price_total, sale.sale_date, sale.platform_fee,
      sale.shipping_cost, sale.packaging_cost, sale.other_costs
    from public.sales as sale
    where sale.external_order_id in ('task4-correct-item', 'task4-correct-lot')
    order by sale.external_order_id
  $$,
  $$values
    ('task4-correct-item'::text, 'eBay'::text, 50::numeric, 50::numeric, '2026-08-22'::date, 3::numeric, 4::numeric, 1::numeric, 2::numeric),
    ('task4-correct-lot'::text, 'Vinted'::text, 30::numeric, 30::numeric, '2026-08-23'::date, 1::numeric, 2::numeric, 3::numeric, 4::numeric)
  $$,
  'Korrekturen verändern keine Erlöse, Plattformen, Daten oder Verkaufskosten'
);

select is(
  (
    select count(*)
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '94000000-0000-4000-8000-000000000104',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_corrected'
      and event.reason = 'Rechnungsbetrag und Einkaufsversand korrigiert'
      and event.correlation_id is not null
      and (event.changes #>> '{purchase,before,purchase_price}')::numeric = 50
      and (event.changes #>> '{purchase,after,purchase_price}')::numeric = 100
      and (event.changes #>> '{purchase,before,total_purchase_cost}')::numeric = 55
      and (event.changes #>> '{purchase,after,total_purchase_cost}')::numeric = 110
      and jsonb_array_length(event.changes #> '{lines,before}') = 2
      and jsonb_array_length(event.changes #> '{lines,after}') = 2
      and jsonb_array_length(event.changes #> '{costs,before}') = 1
      and jsonb_array_length(event.changes #> '{costs,after}') = 1
      and jsonb_array_length(event.changes #> '{inventory_items,before}') = 2
      and jsonb_array_length(event.changes #> '{inventory_items,after}') = 2
      and jsonb_array_length(event.changes #> '{stock_lots,before}') = 1
      and jsonb_array_length(event.changes #> '{stock_lots,after}') = 1
      and jsonb_array_length(event.changes #> '{sale_lines,before}') = 2
      and jsonb_array_length(event.changes #> '{sale_lines,after}') = 2
      and jsonb_array_length(event.changes #> '{lot_allocations,before}') = 1
      and jsonb_array_length(event.changes #> '{lot_allocations,after}') = 1
      and (event.changes #>> '{downstream_cogs,before}')::numeric = 22
      and (event.changes #>> '{downstream_cogs,after}')::numeric = 44
  ),
  1::bigint,
  'genau ein Ereignis enthält vorherige und neue Eingaben, Kostenanteile und COGS-Folgen'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000105',
    'Rollback erzwingen',
    null,
    '[{"id":"94000000-0000-4000-8000-000000000307","catalog_product_id":null,"title_snapshot":"Rollback Einzelstück","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":18,"line_total":18,"condition_snapshot":"used","estimated_market_value":null}]'::jsonb,
    '[{"id":"94000000-0000-4000-8000-000000000403","type":"shipping","amount":2,"description":"Rollback-Versand","allocation_method":"value_weighted","target_purchase_line_id":null}]'::jsonb
  )$$,
  'P0001',
  'Erzwungener Ereignisfehler nach sämtlichen Korrekturwrites.',
  'ein Fehler nach allen Korrekturwrites rollt die ganze Transaktion zurück'
);

select ok(
  (
    select purchase.purchase_price = 8
      and purchase.total_purchase_cost = 10
      and purchase.entry_status = 'finalized'
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000105'
  ) and (
    select line.unit_purchase_price = 8
      and line.line_total = 8
      and line.allocated_total_cost = 10
    from public.purchase_lines as line
    where line.id = '94000000-0000-4000-8000-000000000307'
  ) and (
    select item.allocated_purchase_cost = 10
    from public.inventory_items as item
    where item.purchase_line_id = '94000000-0000-4000-8000-000000000307'
  ) and (
    select sale_line.cost_of_goods_sold = 10
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-rollback'
  ) and not exists (
    select 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '94000000-0000-4000-8000-000000000105',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_corrected'
  ),
  'der späte Fehler bewahrt Kopf, Line, Bestand, COGS und Ereignisbestand vollständig'
);

select throws_ok(
  $$select public.reopen_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000108'
  )$$,
  'P0001',
  'Erzwungener Ereignisfehler nach sämtlichen Wiederöffnungswrites.',
  'ein Fehler beim abschließenden Wiederöffnungsereignis rollt alle vorherigen Writes zurück'
);

select ok(
  (
    select purchase.entry_status = 'finalized'
      and purchase.purchase_price = 4
      and purchase.total_purchase_cost = 4
      and purchase.finalized_at is not null
      and purchase.finalized_by is not null
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000108'
  ) and (
    select line.allocated_additional_cost = 0
      and line.allocated_total_cost = 4
    from public.purchase_lines as line
    where line.id = '94000000-0000-4000-8000-000000000309'
  ) and (
    select item.status = 'ready'
      and item.allocated_purchase_cost = 4
    from public.inventory_items as item
    where item.purchase_line_id = '94000000-0000-4000-8000-000000000309'
  ) and not exists (
    select 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '94000000-0000-4000-8000-000000000108',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_reopened'
  ),
  'der späte Wiederöffnungsfehler bewahrt Finalisierung, Kosten, Bestand und Ereignisbestand'
);

select throws_ok(
  $$
    update public.inventory_items
    set status = 'ready'
    where purchase_line_id = '94000000-0000-4000-8000-000000000301'
  $$,
  '42501',
  'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.',
  'ein wieder geöffnetes Einzelstück kann über die Data API nicht auf bereit gesetzt werden'
);

select throws_ok(
  $$
    update public.inventory_items
    set status = 'listed'
    where purchase_line_id = '94000000-0000-4000-8000-000000000301'
  $$,
  '42501',
  'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.',
  'ein wieder geöffnetes Einzelstück kann über die Data API nicht auf eingestellt gesetzt werden'
);

reset role;

update public.inventory_items
set status = 'ready'
where purchase_line_id = '94000000-0000-4000-8000-000000000301';

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-reopened-item-bypass"}'::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'inventory_item_id', (
          select item.id
          from public.inventory_items as item
          where item.purchase_line_id = '94000000-0000-4000-8000-000000000301'
        ),
        'quantity', 1,
        'unit_sale_price', 10
      ))
    )
  $$,
  '22023',
  'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.',
  'record_sale prüft den wieder geöffneten Einkauf selbst nach einer privilegierten Statusmanipulation'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000110',
    'SQL-NULL für Positionen ablehnen',
    null,
    null::jsonb,
    '[{"id":"94000000-0000-4000-8000-000000000404","type":"shipping","amount":2,"description":"Zu löschende Zusatzkosten","allocation_method":"value_weighted","target_purchase_line_id":null}]'::jsonb
  )$$,
  '22023',
  'Die Ersatz-Einkaufspositionen sind ungültig.',
  'SQL-NULL ist kein leeres Ersatz-Positionsarray'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000110',
    'SQL-NULL für Zusatzkosten ablehnen',
    null,
    '[{"id":"94000000-0000-4000-8000-000000000311","catalog_product_id":null,"title_snapshot":"Zusatzkosten bewusst entfernen","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":5,"line_total":5,"condition_snapshot":"used","estimated_market_value":null}]'::jsonb,
    null::jsonb
  )$$,
  '22023',
  'Die Ersatz-Zusatzkosten sind ungültig.',
  'SQL-NULL ist kein bewusst leeres Zusatzkostenarray'
);

select ok(
  (
    select purchase.purchase_price = 5
      and purchase.total_purchase_cost = 7
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000110'
  ) and (
    select cost.amount = 2
    from public.purchase_costs as cost
    where cost.id = '94000000-0000-4000-8000-000000000404'
  ) and (
    select sale_line.cost_of_goods_sold = 7
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-delete-costs'
  ) and not exists (
    select 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '94000000-0000-4000-8000-000000000110',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_corrected'
  ),
  'abgelehnte SQL-NULL-Nutzlasten lassen Einkauf, Zusatzkosten, COGS und Journal atomar unverändert'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000110',
    'Zusatzkosten bewusst vollständig entfernt',
    null,
    '[{"id":"94000000-0000-4000-8000-000000000311","catalog_product_id":null,"title_snapshot":"Zusatzkosten bewusst entfernen","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":5,"line_total":5,"condition_snapshot":"used","estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'ein echtes leeres Zusatzkostenarray entfernt vorhandene Zusatzkosten absichtlich'
);

select ok(
  (
    select purchase.purchase_price = 5
      and purchase.total_purchase_cost = 5
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000110'
  ) and not exists (
    select 1
    from public.purchase_costs as cost
    where cost.purchase_id = '94000000-0000-4000-8000-000000000110'
  ) and (
    select sale_line.cost_of_goods_sold = 5
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-delete-costs'
  ),
  'das bewusste Entfernen reconciliert Kopf, Kostenzeilen und historischen Wareneinsatz'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000111',
    'Retourenbestand und Rundungscent korrigiert',
    null,
    '[{"id":"94000000-0000-4000-8000-000000000312","catalog_product_id":"94000000-0000-4000-8000-000000000205","title_snapshot":"Retouren-Korrektur","line_kind":"quantity","ordered_quantity":3,"price_mode":"priced","unit_purchase_price":0.01,"line_total":0.03,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[{"id":"94000000-0000-4000-8000-000000000405","type":"shipping","amount":0.01,"description":"Rundungscent","allocation_method":"quantity","target_purchase_line_id":null}]'::jsonb
  )$$,
  'eine Korrektur trennt historische Loszuordnungen von aktuellem Retourenbestand'
);

select results_eq(
  $$
    select sale.external_order_id, allocation.quantity,
      allocation.unit_cost, allocation.allocated_cost,
      sale_line.cost_of_goods_sold
    from public.sales as sale
    join public.sale_lines as sale_line on sale_line.sale_id = sale.id
    join public.sale_line_lot_allocations as allocation on allocation.sale_line_id = sale_line.id
    where sale.external_order_id in ('task4-return-restocked', 'task4-return-written-off')
    order by sale.external_order_id
  $$,
  $$values
    ('task4-return-restocked'::text, 2, 0.015::numeric, 0.03::numeric, 0.03::numeric),
    ('task4-return-written-off'::text, 1, 0.02::numeric, 0.02::numeric, 0.02::numeric)
  $$,
  'mehrere historische Verkäufe behalten centgenau korrigierte COGS-Snapshots'
);

select ok(
  (
    select lot.received_quantity = 3
      and lot.remaining_quantity = 2
      and pg_catalog.round(lot.unit_cost * lot.received_quantity, 2) = 0.04
      and pg_catalog.round(lot.unit_cost * lot.remaining_quantity, 2) = 0.03
    from public.stock_lots as lot
    where lot.purchase_id = '94000000-0000-4000-8000-000000000111'
  ) and (
    select count(*) = 2
      and pg_catalog.count(*) filter (where returned_sale.restock_action = 'restock_ready') = 1
      and pg_catalog.count(*) filter (where returned_sale.restock_action = 'write_off') = 1
    from public.returns as returned_sale
    join public.sales as sale on sale.id = returned_sale.sale_id
    where sale.external_order_id in ('task4-return-restocked', 'task4-return-written-off')
  ) and (
    select count(*) = 6
      and pg_catalog.count(*) filter (where movement.reason = 'receipt') = 1
      and pg_catalog.count(*) filter (where movement.reason = 'sale') = 2
      and pg_catalog.count(*) filter (where movement.reason = 'return') = 2
      and pg_catalog.count(*) filter (where movement.reason = 'damage') = 1
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = '94000000-0000-4000-8000-000000000111'
  ),
  'aktueller Restbestand, wieder eingelagerte und abgeschriebene Retouren bleiben unverändert und reconciliert'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-30","external_order_id":"task4-return-after-correction"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000205","quantity":2,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'korrigierter wieder eingelagerter Restbestand bleibt anschließend verkaufbar'
);

select ok(
  (
    select sale_line.cost_of_goods_sold = 0.02
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-return-after-correction'
  ) and (
    select lot.remaining_quantity = 0
    from public.stock_lots as lot
    where lot.purchase_id = '94000000-0000-4000-8000-000000000111'
  ),
  'ein erneuter Verkauf zieht nur aktive beziehungsweise abgeschriebene Historie vom korrigierten Loswert ab'
);

select results_eq(
  $$
    select sale.external_order_id,
      (pg_catalog.to_jsonb(allocation) ->> 'consumption_sequence')::bigint,
      (pg_catalog.to_jsonb(allocation) ->> 'active_allocated_cost')::numeric
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id in (
      'task4-return-restocked',
      'task4-return-written-off',
      'task4-return-after-correction'
    )
    order by sale.external_order_id
  $$,
  $$values
    ('task4-return-after-correction'::text, 3::bigint, 0.02::numeric),
    ('task4-return-restocked'::text, 1::bigint, 0::numeric),
    ('task4-return-written-off'::text, 2::bigint, 0.02::numeric)
  $$,
  'vollständig wiedereingelagert, abgeschrieben und erneut verkauft verbrauchen nur ihre aktive Centmenge'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000112',
    'Aktive Centfolge auf einen Cent korrigiert',
    0.01,
    '[{"id":"94000000-0000-4000-8000-000000000313","catalog_product_id":"94000000-0000-4000-8000-000000000206","title_snapshot":"Aktive Centfolge","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'die aktive Centfolge ist auch bei einem einzelnen Rundungscent korrigierbar'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000112',
    'Aktive Centfolge auf zwei Cent korrigiert',
    0.02,
    '[{"id":"94000000-0000-4000-8000-000000000313","catalog_product_id":"94000000-0000-4000-8000-000000000206","title_snapshot":"Aktive Centfolge","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'die aktive Centfolge ist auch bei zwei Rundungscents korrigierbar'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000112',
    'Aktive Centfolge auf vier Cent korrigiert',
    0.04,
    '[{"id":"94000000-0000-4000-8000-000000000313","catalog_product_id":"94000000-0000-4000-8000-000000000206","title_snapshot":"Aktive Centfolge","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'die aktive Centfolge ist bei vier Cent korrigierbar'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000112',
    'Vier-Cent-Korrektur deterministisch wiederholt',
    0.04,
    '[{"id":"94000000-0000-4000-8000-000000000313","catalog_product_id":"94000000-0000-4000-8000-000000000206","title_snapshot":"Aktive Centfolge","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'dieselbe Vier-Cent-Korrektur bleibt beim zweiten Lauf deterministisch'
);

select results_eq(
  $$
    select sale.external_order_id,
      allocation.quantity,
      allocation.allocated_cost,
      (pg_catalog.to_jsonb(allocation) ->> 'active_allocated_cost')::numeric,
      sale_line.cost_of_goods_sold
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id in ('task4-active-cent-restocked', 'task4-active-cent-current')
    order by sale.external_order_id
  $$,
  $$values
    ('task4-active-cent-current'::text, 2, 0.03::numeric, 0.03::numeric, 0.03::numeric),
    ('task4-active-cent-restocked'::text, 1, 0.02::numeric, 0::numeric, 0.02::numeric)
  $$,
  'vollständig wiedereingelagerte Historie verbraucht keinen Cent der aktiven Kostenfolge'
);

select ok(
  (
    select lot.remaining_quantity = 1
      and pg_catalog.round(lot.unit_cost * lot.remaining_quantity, 2) = 0.01
    from public.stock_lots as lot
    where lot.purchase_id = '94000000-0000-4000-8000-000000000112'
  ) and (
    select pg_catalog.sum(
      (pg_catalog.to_jsonb(allocation) ->> 'active_allocated_cost')::numeric
    ) = 0.03
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot on lot.id = allocation.stock_lot_id
    where lot.purchase_id = '94000000-0000-4000-8000-000000000112'
  ),
  'aktive COGS von 0,03 Euro und aktueller Bestand von 0,01 Euro reconciliieren exakt auf 0,04 Euro'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-26","external_order_id":"task4-active-cent-resale"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000206","quantity":1,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'die letzte wiedereingelagerte Einheit bleibt nach der Korrektur verkaufbar'
);

select ok(
  (
    select sale_line.cost_of_goods_sold = 0.01
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-active-cent-resale'
  ) and (
    select (pg_catalog.to_jsonb(allocation) ->> 'consumption_sequence')::bigint = 3
      and (pg_catalog.to_jsonb(allocation) ->> 'active_allocated_cost')::numeric = 0.01
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-active-cent-resale'
  ) and (
    select pg_catalog.sum(
      (pg_catalog.to_jsonb(allocation) ->> 'active_allocated_cost')::numeric
    ) = 0.04
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot on lot.id = allocation.stock_lot_id
    where lot.purchase_id = '94000000-0000-4000-8000-000000000112'
  ),
  'der spätere Wiederverkauf übernimmt den letzten Cent und setzt die Lossequenz lückenlos fort'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000114',
    'Teilweise Wiedereinlagerung centgenau korrigiert',
    0.04,
    '[{"id":"94000000-0000-4000-8000-000000000315","catalog_product_id":"94000000-0000-4000-8000-000000000208","title_snapshot":"Teilweise Wiedereinlagerung","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'eine teilweise Wiedereinlagerung kann ohne Änderung ihrer Verkaufs- und Retourenfakten korrigiert werden'
);

select results_eq(
  $$
    select sale.external_order_id,
      allocation.quantity,
      allocation.allocated_cost,
      (pg_catalog.to_jsonb(allocation) ->> 'active_allocated_cost')::numeric
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id in ('task4-partial-restock', 'task4-partial-current')
    order by sale.external_order_id
  $$,
  $$values
    ('task4-partial-current'::text, 1, 0.01::numeric, 0.01::numeric),
    ('task4-partial-restock'::text, 2, 0.03::numeric, 0.02::numeric)
  $$,
  'eine Teilretoure verbraucht nur die fachlich nicht wieder im Bestand befindliche Menge'
);

select ok(
  (
    select lot.remaining_quantity = 1
      and pg_catalog.round(lot.unit_cost * lot.remaining_quantity, 2) = 0.01
    from public.stock_lots as lot
    where lot.purchase_id = '94000000-0000-4000-8000-000000000114'
  ) and (
    select pg_catalog.sum(
      (pg_catalog.to_jsonb(allocation) ->> 'active_allocated_cost')::numeric
    ) = 0.03
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot on lot.id = allocation.stock_lot_id
    where lot.purchase_id = '94000000-0000-4000-8000-000000000114'
  ) and (
    select snapshot.facts = pg_catalog.jsonb_build_object(
      'sales', (
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(sale) order by sale.id)
        from public.sales as sale
        where sale.external_order_id = 'task4-partial-restock'
      ),
      'returns', (
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(returned_sale) order by returned_sale.id)
        from public.returns as returned_sale
        join public.sales as sale on sale.id = returned_sale.sale_id
        where sale.external_order_id = 'task4-partial-restock'
      ),
      'movements', (
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(movement) order by movement.id)
        from public.stock_movements as movement
        join public.sale_lines as sale_line on sale_line.id = movement.sale_line_id
        join public.sales as sale on sale.id = sale_line.sale_id
        where sale.external_order_id = 'task4-partial-restock'
      )
    )
    from task4_partial_fact_snapshot as snapshot
  ),
  'Teilretouren-COGS plus aktueller Bestand reconciliieren und alle historischen Fakten bleiben bytegenau unverändert'
);

select lives_ok(
  $$
    select public.record_sale(
      '93000000-0000-4000-8000-000000000011',
      '{"platform":"direct","sale_date":"2026-08-27","external_order_id":"task4-partial-resale"}'::jsonb,
      '[{"catalog_product_id":"94000000-0000-4000-8000-000000000208","quantity":1,"unit_sale_price":10}]'::jsonb
    )
  $$,
  'der Restbestand nach Teilretoure bleibt verkaufbar'
);

select ok(
  (
    select sale_line.cost_of_goods_sold = 0.01
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-partial-resale'
  ) and (
    select pg_catalog.sum(
      (pg_catalog.to_jsonb(allocation) ->> 'active_allocated_cost')::numeric
    ) = 0.04
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot on lot.id = allocation.stock_lot_id
    where lot.purchase_id = '94000000-0000-4000-8000-000000000114'
  ),
  'auch nach Teilretoure bleibt der letzte Cent beim Wiederverkauf exakt erhalten'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000113',
    'Mehrdeutige Legacy-Reihenfolge darf nicht geraten werden',
    0.04,
    '[{"id":"94000000-0000-4000-8000-000000000314","catalog_product_id":"94000000-0000-4000-8000-000000000207","title_snapshot":"Legacy-Reihenfolge","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Die historische Losentnahmereihenfolge ist nicht eindeutig. Bitte vor der Korrektur manuell prüfen.',
  'exakte Legacy-Zeitgleichheit wird ohne erfundene UUID-Chronologie verständlich abgelehnt'
);

select ok(
  (
    select purchase.purchase_price = 0.03
      and purchase.total_purchase_cost = 0.03
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000113'
  ) and (
    select pg_catalog.sum(sale_line.cost_of_goods_sold) = 0.03
    from public.sale_lines as sale_line
    join public.stock_lots as lot on lot.catalog_product_id = sale_line.catalog_product_id
    where lot.purchase_id = '94000000-0000-4000-8000-000000000113'
  ) and not exists (
    select 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '94000000-0000-4000-8000-000000000113',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_corrected'
  ),
  'die abgelehnte Legacy-Korrektur lässt Einkauf, COGS und Journal atomar unverändert'
);

reset role;
set local session_replication_role = replica;

update public.sale_line_lot_allocations as allocation
set created_at = case sale.external_order_id
    when 'task4-legacy-first' then '2026-08-31 12:31:01+00'::timestamptz
    when 'task4-legacy-second' then '2026-08-31 12:31:02+00'::timestamptz
  end
from public.sale_lines as sale_line,
  public.sales as sale
where sale_line.id = allocation.sale_line_id
  and sale.id = sale_line.sale_id
  and sale.external_order_id in ('task4-legacy-first', 'task4-legacy-second');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000113',
    'Eindeutige Legacy-Zeitfolge sicher korrigiert',
    0.04,
    '[{"id":"94000000-0000-4000-8000-000000000314","catalog_product_id":"94000000-0000-4000-8000-000000000207","title_snapshot":"Legacy-Reihenfolge","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'eindeutige unveränderliche Legacy-Zeitpunkte dürfen sicher als Reihenfolge dienen'
);

select results_eq(
  $$
    select sale.external_order_id,
      allocation.allocated_cost,
      sale_line.cost_of_goods_sold,
      pg_catalog.to_jsonb(allocation) ->> 'consumption_sequence'
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id in ('task4-legacy-first', 'task4-legacy-second')
    order by sale.external_order_id
  $$,
  $$values
    ('task4-legacy-first'::text, 0.03::numeric, 0.03::numeric, null::text),
    ('task4-legacy-second'::text, 0.01::numeric, 0.01::numeric, null::text)
  $$,
  'eindeutige Legacy-Zeiten erhalten die tatsächliche Reihenfolge ohne UUID-Tiebreak und ohne stillen Backfill'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000109',
    'Fehlender Mystery-Kaufpreis',
    null::numeric,
    '[{"id":"94000000-0000-4000-8000-000000000310","catalog_product_id":"94000000-0000-4000-8000-000000000204","title_snapshot":"Mystery-Preiskorrektur","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Der korrigierte Mystery-Kaufpreis ist ungültig.',
  'eine Mystery-Korrektur verlangt einen ausdrücklichen Kaufpreis'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000109',
    'NaN als Mystery-Kaufpreis',
    'NaN'::numeric,
    '[{"id":"94000000-0000-4000-8000-000000000310","catalog_product_id":"94000000-0000-4000-8000-000000000204","title_snapshot":"Mystery-Preiskorrektur","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Der korrigierte Mystery-Kaufpreis ist ungültig.',
  'NaN ist kein gültiger Mystery-Kaufpreis'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000109',
    'Negativer Mystery-Kaufpreis',
    -0.01,
    '[{"id":"94000000-0000-4000-8000-000000000310","catalog_product_id":"94000000-0000-4000-8000-000000000204","title_snapshot":"Mystery-Preiskorrektur","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Der korrigierte Mystery-Kaufpreis ist ungültig.',
  'negative Mystery-Kaufpreise werden abgelehnt'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000109',
    'Teilcent als Mystery-Kaufpreis',
    1.001,
    '[{"id":"94000000-0000-4000-8000-000000000310","catalog_product_id":"94000000-0000-4000-8000-000000000204","title_snapshot":"Mystery-Preiskorrektur","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Der korrigierte Mystery-Kaufpreis ist ungültig.',
  'Mystery-Kaufpreise mit Teilcent werden abgelehnt'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000110',
    'Normaler Einkauf mit Kopfpreis',
    5,
    '[{"id":"94000000-0000-4000-8000-000000000311","catalog_product_id":null,"title_snapshot":"Zusatzkosten bewusst entfernen","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":5,"line_total":5,"condition_snapshot":"used","estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Normale Einkäufe leiten den Kaufpreis ausschließlich aus den Positionen ab.',
  'ein normaler Einkauf lehnt einen nichtleeren Kopfpreis ab'
);

select ok(
  (
    select purchase.purchase_price = 3
      and purchase.total_purchase_cost = 3
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000109'
  ) and (
    select sale_line.cost_of_goods_sold = 1
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-mystery-price'
  ) and not exists (
    select 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '94000000-0000-4000-8000-000000000109',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_corrected'
  ),
  'alle ungültigen Kaufpreise lassen Mystery-Kopf, COGS und Journal atomar unverändert'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000109',
    'Mystery-Kaufpreis auf sechs Euro korrigiert',
    6,
    '[{"id":"94000000-0000-4000-8000-000000000310","catalog_product_id":"94000000-0000-4000-8000-000000000204","title_snapshot":"Mystery-Preiskorrektur","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'ein verkaufter Mystery-Kaufpreis lässt sich ausdrücklich korrigieren'
);

select ok(
  (
    select purchase.purchase_price = 6
      and purchase.total_purchase_cost = 6
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000109'
  ) and (
    select pg_catalog.min(lot.unit_cost) = 2
      and pg_catalog.max(lot.unit_cost) = 2
      and pg_catalog.sum(lot.remaining_quantity) = 2
    from public.stock_lots as lot
    where lot.purchase_id = '94000000-0000-4000-8000-000000000109'
  ) and (
    select sale_line.cost_of_goods_sold = 2
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-mystery-price'
  ),
  'die Mystery-Korrektur aktualisiert Kopf, Restbestand und historischen COGS-Snapshot'
);

select lives_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000109',
    'Mystery-Kaufpreis auf ausdrücklich kostenlos korrigiert',
    0,
    '[{"id":"94000000-0000-4000-8000-000000000310","catalog_product_id":"94000000-0000-4000-8000-000000000204","title_snapshot":"Mystery-Preiskorrektur","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'numeric 0 bleibt ein gültiger ausdrücklicher Mystery-Kaufpreis'
);

select ok(
  (
    select purchase.purchase_price = 0
      and purchase.total_purchase_cost = 0
    from public.purchases as purchase
    where purchase.id = '94000000-0000-4000-8000-000000000109'
  ) and not exists (
    select 1
    from public.stock_lots as lot
    where lot.purchase_id = '94000000-0000-4000-8000-000000000109'
      and lot.unit_cost <> 0
  ) and (
    select sale_line.cost_of_goods_sold = 0
    from public.sale_lines as sale_line
    join public.sales as sale on sale.id = sale_line.sale_id
    where sale.external_order_id = 'task4-mystery-price'
  ) and (
    select count(*) = 2
      and pg_catalog.count(*) filter (
        where (event.changes #>> '{purchase,before,purchase_price}')::numeric = 3
          and (event.changes #>> '{purchase,after,purchase_price}')::numeric = 6
          and (event.changes #>> '{downstream_cogs,before}')::numeric = 1
          and (event.changes #>> '{downstream_cogs,after}')::numeric = 2
      ) = 1
      and pg_catalog.count(*) filter (
        where (event.changes #>> '{purchase,before,purchase_price}')::numeric = 6
          and (event.changes #>> '{purchase,after,purchase_price}')::numeric = 0
          and (event.changes #>> '{downstream_cogs,before}')::numeric = 2
          and (event.changes #>> '{downstream_cogs,after}')::numeric = 0
      ) = 1
    from public.list_entity_business_events(
      '93000000-0000-4000-8000-000000000011',
      'purchase',
      '94000000-0000-4000-8000-000000000109',
      null,
      null,
      25
    ) as event
    where event.event_type = 'purchase_corrected'
  ),
  'auch die Nullkorrektur aktualisiert Kosten und dokumentiert beide Mystery-Preisänderungen vollständig'
);

select throws_ok(
  $$
    update public.purchases
    set purchase_price = 1
    where id = '94000000-0000-4000-8000-000000000104'
  $$,
  '42501',
  'Finalisierte Einkaufsdaten dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'direkte Data-API-Updates können die Korrektur nicht nachahmen'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Fremde Quelle darf nicht gespeichert werden","purchase_date":"2026-08-31","purchase_price":null,"source_id":"93000000-0000-4000-8000-000000000302"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"foreign-source-line","catalog_product_id":null,"title_snapshot":"Workspace-Quelle","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Die Einkaufsquelle gehört nicht zu diesem Workspace.',
  'create_purchase lehnt eine Quelle aus einem fremden Workspace verständlich ab'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Fremder Lieferant darf nicht gespeichert werden","purchase_date":"2026-08-31","purchase_price":null,"supplier_id":"93000000-0000-4000-8000-000000000402"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"foreign-supplier-line","catalog_product_id":null,"title_snapshot":"Workspace-Lieferant","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Der Lieferant gehört nicht zu diesem Workspace.',
  'create_purchase lehnt einen Lieferanten aus einem fremden Workspace verständlich ab'
);

select results_eq(
  $$
    select count(*)
    from public.purchases as purchase
    where purchase.title in (
      'Fremde Quelle darf nicht gespeichert werden',
      'Fremder Lieferant darf nicht gespeichert werden'
    )
  $$,
  $$values (0::bigint)$$,
  'abgelehnte Workspace-Referenzen hinterlassen keinen Einkauf und keine abhängigen Daten'
);

select lives_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"mystery_pack","title":"Atomare Draft-Zuordnung","purchase_date":"2026-08-31","purchase_price":25}'::jsonb,
    '[{"type":"shipping","amount":5,"description":"Direktversand","allocation_method":"direct","target_purchase_line_ref":"draft-find"}]'::jsonb,
    '[{"client_ref":"draft-find","catalog_product_id":null,"title_snapshot":"Mystery-Fundstück","line_kind":"individual","ordered_quantity":1,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":"very_good","estimated_market_value":40,"allocated_additional_cost":0}]'::jsonb
  )$$,
  'create_purchase persistiert Mystery-Draft und direkte Kosten atomar'
);

select ok(
  exists (
    select 1
    from public.purchases as purchase
    join public.purchase_lines as line on line.purchase_id = purchase.id
    join public.purchase_costs as cost
      on cost.purchase_id = purchase.id
      and cost.target_purchase_line_id = line.id
    where purchase.title = 'Atomare Draft-Zuordnung'
      and line.price_mode = 'unpriced_mystery'
      and line.unit_purchase_price is null
      and line.line_total is null
      and line.condition_snapshot = 'very_good'
      and line.estimated_market_value = 40
      and cost.allocation_method = 'direct'
  ),
  'die UI-Draft-ID wird nur in die echte Positions-UUID aufgelöst und nie persistiert'
);

reset role;

insert into public.catalog_products (
  id, workspace_id, title, tracking_mode
) values
  (
    '95000000-0000-4000-8000-000000000201',
    '93000000-0000-4000-8000-000000000011',
    'Draft-Mengenbestand',
    'quantity'
  ),
  (
    '95000000-0000-4000-8000-000000000202',
    '93000000-0000-4000-8000-000000000011',
    'Capturing-Mengenbestand',
    'quantity'
  );

insert into public.purchases (
  id, workspace_id, type, title, entry_status
) values
  (
    '95000000-0000-4000-8000-000000000101',
    '93000000-0000-4000-8000-000000000011',
    'single',
    'Draft-Einzelbestand darf nicht verkauft werden',
    'draft'
  ),
  (
    '95000000-0000-4000-8000-000000000102',
    '93000000-0000-4000-8000-000000000011',
    'single',
    'Capturing-Einzelbestand darf nicht verkauft werden',
    'capturing'
  ),
  (
    '95000000-0000-4000-8000-000000000103',
    '93000000-0000-4000-8000-000000000011',
    'lot',
    'Draft-Mengenbestand darf nicht verkauft werden',
    'draft'
  ),
  (
    '95000000-0000-4000-8000-000000000104',
    '93000000-0000-4000-8000-000000000011',
    'lot',
    'Capturing-Mengenbestand darf nicht verkauft werden',
    'capturing'
  );

insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total
) values
  (
    '95000000-0000-4000-8000-000000000301',
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000101',
    null,
    'Draft-Einzelbestand',
    'individual',
    1,
    1,
    'priced',
    10,
    10
  ),
  (
    '95000000-0000-4000-8000-000000000302',
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000102',
    null,
    'Capturing-Einzelbestand',
    'individual',
    1,
    1,
    'priced',
    10,
    10
  ),
  (
    '95000000-0000-4000-8000-000000000303',
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000103',
    '95000000-0000-4000-8000-000000000201',
    'Draft-Mengenbestand',
    'quantity',
    1,
    1,
    'priced',
    10,
    10
  ),
  (
    '95000000-0000-4000-8000-000000000304',
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000104',
    '95000000-0000-4000-8000-000000000202',
    'Capturing-Mengenbestand',
    'quantity',
    1,
    1,
    'priced',
    10,
    10
  );

insert into public.inventory_items (
  id, workspace_id, purchase_id, purchase_line_id, title, condition,
  status, allocated_purchase_cost
) values
  (
    '95000000-0000-4000-8000-000000000401',
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000101',
    '95000000-0000-4000-8000-000000000301',
    'Draft-Einzelbestand',
    'used',
    'ready',
    10
  ),
  (
    '95000000-0000-4000-8000-000000000402',
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000102',
    '95000000-0000-4000-8000-000000000302',
    'Capturing-Einzelbestand',
    'used',
    'ready',
    10
  );

insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost, received_at
) values
  (
    '95000000-0000-4000-8000-000000000403',
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000103',
    '95000000-0000-4000-8000-000000000303',
    '95000000-0000-4000-8000-000000000201',
    1,
    1,
    10,
    '2026-08-31 13:00:00+00'
  ),
  (
    '95000000-0000-4000-8000-000000000404',
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000104',
    '95000000-0000-4000-8000-000000000304',
    '95000000-0000-4000-8000-000000000202',
    1,
    1,
    10,
    '2026-08-31 13:00:01+00'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.record_sale(
    '93000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"draft-individual-guard"}'::jsonb,
    '[{"inventory_item_id":"95000000-0000-4000-8000-000000000401","quantity":1,"unit_sale_price":20}]'::jsonb
  )$$,
  '22023',
  'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.',
  'Einzelbestand eines Draft-Einkaufs ist auch bei ready-Status nicht verkaufbar'
);

select throws_ok(
  $$select public.record_sale(
    '93000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"capturing-individual-guard"}'::jsonb,
    '[{"inventory_item_id":"95000000-0000-4000-8000-000000000402","quantity":1,"unit_sale_price":20}]'::jsonb
  )$$,
  '22023',
  'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.',
  'Einzelbestand eines laufenden Wareneingangs ist nicht verkaufbar'
);

select throws_ok(
  $$select public.record_sale(
    '93000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"draft-quantity-guard"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000201","quantity":1,"unit_sale_price":20}]'::jsonb
  )$$,
  '22023',
  'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.',
  'Mengenbestand eines Draft-Einkaufs ist nicht verkaufbar'
);

select throws_ok(
  $$select public.record_sale(
    '93000000-0000-4000-8000-000000000011',
    '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"capturing-quantity-guard"}'::jsonb,
    '[{"catalog_product_id":"95000000-0000-4000-8000-000000000202","quantity":1,"unit_sale_price":20}]'::jsonb
  )$$,
  '22023',
  'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.',
  'Mengenbestand eines laufenden Wareneingangs ist nicht verkaufbar'
);

select is(
  (
    select count(*)
    from public.sales as sale
    where sale.external_order_id in (
      'draft-individual-guard',
      'capturing-individual-guard',
      'draft-quantity-guard',
      'capturing-quantity-guard'
    )
  ),
  0::bigint,
  'abgelehnte Draft-Verkäufe schreiben weder Verkaufskopf noch Folgebewegungen'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Ungültiger Zustand muss atomar scheitern","purchase_date":"2026-08-31"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"invalid-condition","catalog_product_id":null,"title_snapshot":"Ungültiger Zustand","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"broken","estimated_market_value":null}]'::jsonb
  )$$,
  '22023',
  'Der Zustand einer Einkaufsposition ist ungültig.',
  'create_purchase lehnt unbekannte Zustandswerte vor jedem Write ab'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Normaler Einkauf ohne Positionspreis","purchase_date":"2026-08-31"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"normal-unpriced","catalog_product_id":null,"title_snapshot":"Unbepreiste normale Position","line_kind":"individual","ordered_quantity":1,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":"used","estimated_market_value":null}]'::jsonb
  )$$,
  '22023',
  'Die Einkaufspositionen passen nicht zur Einkaufsart.',
  'ein normaler Einkauf darf keine unbepreiste Mystery-Position enthalten'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"lot","title":"Bepreiste Position ohne Preise","purchase_date":"2026-08-31"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"normal-null-price","catalog_product_id":"95000000-0000-4000-8000-000000000201","title_snapshot":"Bepreist ohne Preis","line_kind":"quantity","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb
  )$$,
  '22023',
  'Die Einkaufspositionen passen nicht zur Einkaufsart.',
  'eine bepreiste normale Position benötigt Zahlen für Einzel- und Gesamtpreis'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"mystery_pack","title":"Bepreiste Mystery-Position","purchase_date":"2026-08-31","purchase_price":10}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"mystery-priced","catalog_product_id":null,"title_snapshot":"Bepreistes Mystery-Teil","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":10}]'::jsonb
  )$$,
  '22023',
  'Die Einkaufspositionen passen nicht zur Einkaufsart.',
  'ein Mystery-Einkauf darf keine bepreiste Position enthalten'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"mystery_pack","title":"Mystery-Position mit verstecktem Preis","purchase_date":"2026-08-31","purchase_price":10}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"mystery-hidden-price","catalog_product_id":null,"title_snapshot":"Mystery mit Preis","line_kind":"individual","ordered_quantity":1,"price_mode":"unpriced_mystery","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":10}]'::jsonb
  )$$,
  '22023',
  'Die Einkaufspositionen passen nicht zur Einkaufsart.',
  'unbepreiste Mystery-Positionen müssen beide Preisfelder explizit leer lassen'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"mystery_pack","title":"Kaufpreis als Text","purchase_date":"2026-08-31","purchase_price":"10"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"price-string","catalog_product_id":null,"title_snapshot":"Kaufpreis-Typ","line_kind":"individual","ordered_quantity":1,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Der Kaufpreis muss centgenau und darf nicht negativ sein.',
  'create_purchase verlangt für den Kaufpreis eine JSON-Zahl oder null'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"mystery_pack","title":"Negativer Kaufpreis","purchase_date":"2026-08-31","purchase_price":-0.01}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"price-negative","catalog_product_id":null,"title_snapshot":"Negativer Kaufpreis","line_kind":"individual","ordered_quantity":1,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Der Kaufpreis muss centgenau und darf nicht negativ sein.',
  'create_purchase lehnt negative Kaufpreise vor jedem Write ab'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"mystery_pack","title":"Kaufpreis mit Teilcent","purchase_date":"2026-08-31","purchase_price":10.001}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"price-subcent","catalog_product_id":null,"title_snapshot":"Kaufpreis mit Teilcent","line_kind":"individual","ordered_quantity":1,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Der Kaufpreis muss centgenau und darf nicht negativ sein.',
  'create_purchase lehnt Kaufpreise mit Teilcent vor jedem Write ab'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Zusatzkosten als Text","purchase_date":"2026-08-31","purchase_price":null}'::jsonb,
    '[{"type":"shipping","amount":"1","allocation_method":"value_weighted"}]'::jsonb,
    '[{"client_ref":"expense-string","catalog_product_id":null,"title_snapshot":"Zusatzkosten-Typ","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Zusatzkosten müssen positive centgenaue Zahlen sein.',
  'create_purchase verlangt für Zusatzkosten eine JSON-Zahl'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Negative Zusatzkosten","purchase_date":"2026-08-31","purchase_price":null}'::jsonb,
    '[{"type":"shipping","amount":-0.01,"allocation_method":"value_weighted"}]'::jsonb,
    '[{"client_ref":"expense-negative","catalog_product_id":null,"title_snapshot":"Negative Zusatzkosten","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Zusatzkosten müssen positive centgenaue Zahlen sein.',
  'create_purchase lehnt negative Zusatzkosten vor jedem Write ab'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Zusatzkosten mit Teilcent","purchase_date":"2026-08-31","purchase_price":null}'::jsonb,
    '[{"type":"shipping","amount":1.001,"allocation_method":"value_weighted"}]'::jsonb,
    '[{"client_ref":"expense-subcent","catalog_product_id":null,"title_snapshot":"Zusatzkosten mit Teilcent","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Zusatzkosten müssen positive centgenaue Zahlen sein.',
  'create_purchase lehnt Zusatzkosten mit Teilcent vor jedem Write ab'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Manuelle Zuordnung als Text","purchase_date":"2026-08-31","purchase_price":null,"cost_allocation_mode":"manual"}'::jsonb,
    '[{"type":"shipping","amount":1,"allocation_method":"value_weighted"}]'::jsonb,
    '[{"client_ref":"allocation-string","catalog_product_id":null,"title_snapshot":"Zuordnung-Typ","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":"1"}]'::jsonb
  )$$,
  '22023',
  'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.',
  'create_purchase verlangt für manuelle Kostenzuordnungen eine JSON-Zahl oder null'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Negative manuelle Zuordnung","purchase_date":"2026-08-31","purchase_price":null,"cost_allocation_mode":"manual"}'::jsonb,
    '[{"type":"shipping","amount":1,"allocation_method":"value_weighted"}]'::jsonb,
    '[{"client_ref":"allocation-negative","catalog_product_id":null,"title_snapshot":"Negative Zuordnung","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":-1}]'::jsonb
  )$$,
  '22023',
  'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.',
  'create_purchase lehnt negative manuelle Kostenzuordnungen vor jedem Write ab'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Manuelle Zuordnung mit Teilcent","purchase_date":"2026-08-31","purchase_price":null,"cost_allocation_mode":"manual"}'::jsonb,
    '[{"type":"shipping","amount":1,"allocation_method":"value_weighted"}]'::jsonb,
    '[{"client_ref":"allocation-subcent","catalog_product_id":null,"title_snapshot":"Zuordnung mit Teilcent","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":1.001}]'::jsonb
  )$$,
  '22023',
  'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.',
  'create_purchase lehnt manuelle Kostenzuordnungen mit Teilcent vor jedem Write ab'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Marktwert als Text","purchase_date":"2026-08-31","purchase_price":null}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"market-string","catalog_product_id":null,"title_snapshot":"Marktwert-Typ","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":"20","allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Der geschätzte Marktwert muss centgenau und darf nicht negativ sein.',
  'create_purchase verlangt für den Marktwert eine JSON-Zahl oder null'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Negativer Marktwert","purchase_date":"2026-08-31","purchase_price":null}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"market-negative","catalog_product_id":null,"title_snapshot":"Negativer Marktwert","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":-0.01,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Der geschätzte Marktwert muss centgenau und darf nicht negativ sein.',
  'create_purchase lehnt negative Marktwerte vor jedem Write ab'
);

select throws_ok(
  $$select public.create_purchase(
    '93000000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Marktwert mit Teilcent","purchase_date":"2026-08-31","purchase_price":null}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"market-subcent","catalog_product_id":null,"title_snapshot":"Marktwert mit Teilcent","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":20.001,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Der geschätzte Marktwert muss centgenau und darf nicht negativ sein.',
  'create_purchase lehnt Marktwerte mit Teilcent vor jedem Write ab'
);

select is(
  (
    select count(*)
    from public.purchases as purchase
    where purchase.title in (
      'Ungültiger Zustand muss atomar scheitern',
      'Normaler Einkauf ohne Positionspreis',
      'Bepreiste Position ohne Preise',
      'Bepreiste Mystery-Position',
      'Mystery-Position mit verstecktem Preis',
      'Kaufpreis als Text',
      'Negativer Kaufpreis',
      'Kaufpreis mit Teilcent',
      'Zusatzkosten als Text',
      'Negative Zusatzkosten',
      'Zusatzkosten mit Teilcent',
      'Manuelle Zuordnung als Text',
      'Negative manuelle Zuordnung',
      'Manuelle Zuordnung mit Teilcent',
      'Marktwert als Text',
      'Negativer Marktwert',
      'Marktwert mit Teilcent'
    )
  ),
  0::bigint,
  'ungültige create_purchase-Payloads hinterlassen weder Kopf noch abhängige Daten'
);

reset role;

select has_function(
  'public',
  'update_purchase_draft',
  array['uuid', 'uuid', 'jsonb', 'jsonb', 'jsonb'],
  'der persistierte Einkaufsentwurf besitzt eine atomare Update-RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    pg_catalog.to_regprocedure('public.update_purchase_draft(uuid,uuid,jsonb,jsonb,jsonb)'),
    'execute'
  ),
  'authenticated darf persistierte Einkaufsentwürfe atomar aktualisieren'
);

select ok(
  not coalesce(has_function_privilege(
    'public',
    pg_catalog.to_regprocedure('public.update_purchase_draft(uuid,uuid,jsonb,jsonb,jsonb)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'anon',
    pg_catalog.to_regprocedure('public.update_purchase_draft(uuid,uuid,jsonb,jsonb,jsonb)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'service_role',
    pg_catalog.to_regprocedure('public.update_purchase_draft(uuid,uuid,jsonb,jsonb,jsonb)'),
    'execute'
  ), false),
  'öffentliche, anonyme und Service-Role-Aufrufer dürfen Einkaufsentwürfe nicht ändern'
);

insert into public.purchases (
  id, workspace_id, type, title, purchase_date, entry_status,
  cost_allocation_mode
) values (
  '95000000-0000-4000-8000-000000000105',
  '93000000-0000-4000-8000-000000000011',
  'single',
  'Draft vor atomarem Update',
  '2026-08-31',
  'draft',
  'even'
);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, received_quantity, price_mode, unit_purchase_price,
  line_total, condition_snapshot
) values (
  '95000000-0000-4000-8000-000000000305',
  '93000000-0000-4000-8000-000000000011',
  '95000000-0000-4000-8000-000000000105',
  'Alte Draft-Position',
  'individual',
  1,
  0,
  'priced',
  10,
  10,
  'used'
);

insert into public.purchase_costs (
  id, workspace_id, purchase_id, type, amount, description,
  allocation_method, target_purchase_line_id
) values (
  '95000000-0000-4000-8000-000000000405',
  '93000000-0000-4000-8000-000000000011',
  '95000000-0000-4000-8000-000000000105',
  'shipping',
  1,
  'Alte Draft-Kosten',
  'direct',
  '95000000-0000-4000-8000-000000000305'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000105',
    '{"type":"single","title":"Fremde Quelle darf Draft nicht ändern","purchase_date":"2026-08-31","purchase_price":10,"source_id":"93000000-0000-4000-8000-000000000302","cost_allocation_mode":"even","tracking_status":"pending"}'::jsonb,
    '[{"type":"shipping","amount":1,"description":"Alte Draft-Kosten","allocation_method":"direct","target_purchase_line_ref":"95000000-0000-4000-8000-000000000305"}]'::jsonb,
    '[{"client_ref":"95000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Alte Draft-Position","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Die Einkaufsquelle gehört nicht zu diesem Workspace.',
  'update_purchase_draft lehnt eine Quelle aus einem fremden Workspace vor allen Writes ab'
);

select throws_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000105',
    '{"type":"single","title":"Fremder Lieferant darf Draft nicht ändern","purchase_date":"2026-08-31","purchase_price":10,"supplier_id":"93000000-0000-4000-8000-000000000402","cost_allocation_mode":"even","tracking_status":"pending"}'::jsonb,
    '[{"type":"shipping","amount":1,"description":"Alte Draft-Kosten","allocation_method":"direct","target_purchase_line_ref":"95000000-0000-4000-8000-000000000305"}]'::jsonb,
    '[{"client_ref":"95000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Alte Draft-Position","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Der Lieferant gehört nicht zu diesem Workspace.',
  'update_purchase_draft lehnt einen Lieferanten aus einem fremden Workspace vor allen Writes ab'
);

select ok(
  (
    select purchase.title = 'Draft vor atomarem Update'
      and purchase.source_id is null
      and purchase.supplier_id is null
    from public.purchases as purchase
    where purchase.id = '95000000-0000-4000-8000-000000000105'
  ) and (
    select count(*) = 1
      and min(cost.amount) = 1
      and min(cost.description) = 'Alte Draft-Kosten'
    from public.purchase_costs as cost
    where cost.purchase_id = '95000000-0000-4000-8000-000000000105'
  ),
  'abgelehnte Workspace-Referenzen verändern den Draft und seine Kosten nicht teilweise'
);

select lives_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000105',
    '{"type":"single","title":"Draft atomar aktualisiert","purchase_date":"2026-08-31","purchase_price":30,"cost_allocation_mode":"even","tracking_status":"pending"}'::jsonb,
    '[{"type":"shipping","amount":5,"description":"Neue Direktkosten","allocation_method":"direct","target_purchase_line_ref":"new-line"}]'::jsonb,
    '[{"client_ref":"95000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Bestehende Position geändert","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":20,"line_total":20,"condition_snapshot":"very_good","estimated_market_value":40,"allocated_additional_cost":0},{"client_ref":"new-line","catalog_product_id":null,"title_snapshot":"Neue Position","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":20,"allocated_additional_cost":0}]'::jsonb
  )$$,
  'ein Draft wird mit Kopf, bestehenden/neuen Positionen und Direct-Target atomar aktualisiert'
);

select ok(
  (
    select purchase.id = '95000000-0000-4000-8000-000000000105'
      and purchase.title = 'Draft atomar aktualisiert'
      and purchase.purchase_price = 30
      and purchase.entry_status = 'draft'
    from public.purchases as purchase
    where purchase.id = '95000000-0000-4000-8000-000000000105'
  ) and (
    select count(*) = 2
      and count(*) filter (
        where line.id = '95000000-0000-4000-8000-000000000305'
          and line.title_snapshot = 'Bestehende Position geändert'
      ) = 1
    from public.purchase_lines as line
    where line.purchase_id = '95000000-0000-4000-8000-000000000105'
  ) and (
    select count(*) = 1
      and bool_and(cost.target_purchase_line_id = line.id)
      and bool_and(line.title_snapshot = 'Neue Position')
    from public.purchase_costs as cost
    join public.purchase_lines as line on line.id = cost.target_purchase_line_id
    where cost.purchase_id = '95000000-0000-4000-8000-000000000105'
  ) and (
    select count(*) = 1
    from public.purchases as purchase
    where purchase.id = '95000000-0000-4000-8000-000000000105'
  ),
  'das atomare Update behält Purchase- und bestehende Line-ID und löst neue Direct-Targets exakt auf'
);

select throws_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000105',
    '{"type":"single","title":"Darf nicht teilweise sichtbar sein","purchase_date":"2026-08-31","purchase_price":20,"cost_allocation_mode":"even","tracking_status":"pending"}'::jsonb,
    '[{"type":"shipping","amount":9,"description":"Ungültiges Ziel","allocation_method":"direct","target_purchase_line_ref":"missing-line"}]'::jsonb,
    '[{"client_ref":"95000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Darf nicht teilweise sichtbar sein","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":20,"line_total":20,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Die direkte Kostenzuordnung verweist auf keine Einkaufsposition.',
  'ein unbekanntes Direct-Target lehnt das gesamte Draft-Update ab'
);

select ok(
  (
    select purchase.title = 'Draft atomar aktualisiert'
      and purchase.purchase_price = 30
    from public.purchases as purchase
    where purchase.id = '95000000-0000-4000-8000-000000000105'
  ) and (
    select count(*) = 2
      and count(*) filter (
        where line.id = '95000000-0000-4000-8000-000000000305'
          and line.title_snapshot = 'Bestehende Position geändert'
      ) = 1
    from public.purchase_lines as line
    where line.purchase_id = '95000000-0000-4000-8000-000000000105'
  ) and (
    select count(*) = 1 and min(cost.amount) = 5
    from public.purchase_costs as cost
    where cost.purchase_id = '95000000-0000-4000-8000-000000000105'
  ),
  'ein abgelehntes Update rollt Kopf, Positionen und Kosten vollständig zurück'
);

select throws_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000101',
    '{"type":"lot","title":"Finalisiert bleibt unverändert","purchase_date":"2026-08-31","purchase_price":100,"cost_allocation_mode":"even","tracking_status":"pending"}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Nur ein nicht finalisierter Einkaufsentwurf kann bearbeitet werden.',
  'finalisierte Einkäufe sind für die Draft-Update-RPC gesperrt'
);

select throws_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000129',
    '{"type":"lot","title":"Erfasste Menge darf nicht umgebaut werden","purchase_date":"2026-08-31","purchase_price":15,"cost_allocation_mode":"even","tracking_status":"pending"}'::jsonb,
    '[{"type":"other","amount":1,"description":"Bestehende Kosten","allocation_method":"value_weighted","target_purchase_line_ref":null}]'::jsonb,
    '[{"client_ref":"93000000-0000-4000-8000-000000000338","catalog_product_id":"93000000-0000-4000-8000-000000000216","title_snapshot":"Unbewerteter Mengen-Draft","line_kind":"quantity","ordered_quantity":3,"price_mode":"priced","unit_purchase_price":5,"line_total":15,"condition_snapshot":null,"estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Bereits erfasste Einkaufspositionen dürfen strukturell nicht verändert werden.',
  'ein Draft-Update darf die Identität und Menge bereits erfassten Bestands nicht gefährden'
);

select throws_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000105',
    '{"type":"single","title":"Teilcent darf nicht gerundet werden","purchase_date":"2026-08-31","purchase_price":30.001,"cost_allocation_mode":"even","tracking_status":"pending"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"95000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Teilcent-Test","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":30,"line_total":30,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0}]'::jsonb
  )$$,
  '22023',
  'Der Kaufpreis muss centgenau und darf nicht negativ sein.',
  'ein Draft-Update lehnt einen Kaufpreis mit Teilcent vor allen Schreibzugriffen ab'
);

select throws_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000105',
    '{"type":"single","title":"Manuelle Draft-Zuordnung als Text","purchase_date":"2026-08-31","purchase_price":30,"cost_allocation_mode":"manual","tracking_status":"pending"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"95000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Manuelle Draft-Zuordnung","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":30,"line_total":30,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":"0"}]'::jsonb
  )$$,
  '22023',
  'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.',
  'update_purchase_draft verlangt für manuelle Kostenzuordnungen eine JSON-Zahl oder null'
);

select throws_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000105',
    '{"type":"single","title":"Negative manuelle Draft-Zuordnung","purchase_date":"2026-08-31","purchase_price":30,"cost_allocation_mode":"manual","tracking_status":"pending"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"95000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Negative manuelle Draft-Zuordnung","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":30,"line_total":30,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":-0.01}]'::jsonb
  )$$,
  '22023',
  'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.',
  'update_purchase_draft lehnt negative manuelle Kostenzuordnungen vor jedem Write ab'
);

select throws_ok(
  $$select public.update_purchase_draft(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000105',
    '{"type":"single","title":"Manuelle Draft-Zuordnung mit Teilcent","purchase_date":"2026-08-31","purchase_price":30,"cost_allocation_mode":"manual","tracking_status":"pending"}'::jsonb,
    '[]'::jsonb,
    '[{"client_ref":"95000000-0000-4000-8000-000000000305","catalog_product_id":null,"title_snapshot":"Manuelle Draft-Zuordnung mit Teilcent","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":30,"line_total":30,"condition_snapshot":"used","estimated_market_value":null,"allocated_additional_cost":0.001}]'::jsonb
  )$$,
  '22023',
  'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.',
  'update_purchase_draft lehnt manuelle Kostenzuordnungen mit Teilcent vor jedem Write ab'
);

select ok(
  (
    select purchase.title = 'Draft atomar aktualisiert'
      and purchase.cost_allocation_mode = 'even'
    from public.purchases as purchase
    where purchase.id = '95000000-0000-4000-8000-000000000105'
  ) and (
    select count(*) = 2
    from public.purchase_lines as line
    where line.purchase_id = '95000000-0000-4000-8000-000000000105'
  ) and (
    select count(*) = 1 and min(cost.amount) = 5
    from public.purchase_costs as cost
    where cost.purchase_id = '95000000-0000-4000-8000-000000000105'
  ),
  'ungültige manuelle Draft-Zuordnungen hinterlassen Kopf, Positionen und Kosten unverändert'
);

reset role;

insert into public.purchases (
  id, workspace_id, type, title, purchase_date, purchase_price,
  total_purchase_cost, entry_status, finalized_at, finalized_by
) values (
  '95000000-0000-4000-8000-000000000106',
  '93000000-0000-4000-8000-000000000011',
  'single',
  'Legacy-Verkauf ohne Verkaufsposition',
  '2026-08-31',
  10,
  10,
  'finalized',
  '2026-08-31 14:00:00+00',
  '93000000-0000-4000-8000-000000000001'
);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, received_quantity, price_mode, unit_purchase_price,
  line_total, allocated_total_cost, condition_snapshot
) values (
  '95000000-0000-4000-8000-000000000306',
  '93000000-0000-4000-8000-000000000011',
  '95000000-0000-4000-8000-000000000106',
  'Legacy-Einzelstück',
  'individual',
  1,
  1,
  'priced',
  10,
  10,
  10,
  'used'
);

select set_config('flipbase.allow_inventory_sold_transition', 'on', true);
insert into public.inventory_items (
  id, workspace_id, purchase_id, purchase_line_id, title, condition,
  status, allocated_purchase_cost
) values (
  '95000000-0000-4000-8000-000000000405',
  '93000000-0000-4000-8000-000000000011',
  '95000000-0000-4000-8000-000000000106',
  '95000000-0000-4000-8000-000000000306',
  'Legacy-Einzelstück',
  'used',
  'sold',
  10
);
select set_config('flipbase.allow_inventory_sold_transition', 'off', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select has_function(
  'public',
  'get_purchase_sale_history_state',
  array['uuid', 'uuid'],
  'die UI erhält einen expliziten autoritativen Verkaufsverlaufszustand'
);

select has_function(
  'public',
  'get_purchase_sale_history',
  array['uuid', 'uuid'],
  'die UI erhält Zustand und konkretes Prüfziel atomar vom Server'
);

select ok(
  has_function_privilege(
    'authenticated',
    pg_catalog.to_regprocedure('public.get_purchase_sale_history(uuid,uuid)'),
    'execute'
  ),
  'authenticated darf Zustand und Prüfziel eines Einkaufs lesen'
);

select ok(
  not coalesce(has_function_privilege(
    'public',
    pg_catalog.to_regprocedure('public.get_purchase_sale_history(uuid,uuid)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'anon',
    pg_catalog.to_regprocedure('public.get_purchase_sale_history(uuid,uuid)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'service_role',
    pg_catalog.to_regprocedure('public.get_purchase_sale_history(uuid,uuid)'),
    'execute'
  ), false),
  'nur authentifizierte Nutzer dürfen Zustand und Prüfziel abfragen'
);

select ok(
  has_function_privilege(
    'authenticated',
    pg_catalog.to_regprocedure('public.get_purchase_sale_history_state(uuid,uuid)'),
    'execute'
  ),
  'authenticated darf den autoritativen Verkaufsverlaufszustand lesen'
);

select ok(
  not coalesce(has_function_privilege(
    'public',
    pg_catalog.to_regprocedure('public.get_purchase_sale_history_state(uuid,uuid)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'anon',
    pg_catalog.to_regprocedure('public.get_purchase_sale_history_state(uuid,uuid)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'service_role',
    pg_catalog.to_regprocedure('public.get_purchase_sale_history_state(uuid,uuid)'),
    'execute'
  ), false),
  'öffentliche, anonyme und Service-Role-Aufrufer dürfen den Verlaufszustand nicht abfragen'
);

select lives_ok(
  $$select 1 / (public.get_purchase_sale_history_state(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000106'
  ) = 'review_required')::integer$$,
  'ein sold-Status ohne Verkaufsposition benötigt ausdrücklich Prüfung und Nachpflege'
);

select is(
  public.get_purchase_sale_history(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000106'
  ) ->> 'state',
  'review_required',
  'der atomare Verlauf meldet einen einzelnen ungeklärten Legacy-Artikel zur Prüfung'
);

select is(
  public.get_purchase_sale_history(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000106'
  ) ->> 'review_inventory_item_id',
  '95000000-0000-4000-8000-000000000405',
  'der atomare Verlauf liefert das konkrete Inventarziel für die Nachpflege'
);

select lives_ok(
  $$select 1 / (not public.has_purchase_recorded_sales(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000106'
  ))::integer$$,
  'ein sold-Status allein gilt nicht länger als aufgezeichneter Verkauf'
);

select throws_ok(
  $$select public.reopen_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000106'
  )$$,
  '22023',
  'Der Verkaufsstatus ist unvollständig. Bitte Verkaufsdaten prüfen und nachpflegen.',
  'ein prüfpflichtiger Legacy-Verkauf wird fail-closed nicht wieder geöffnet'
);

select throws_ok(
  $$select public.correct_purchase_costing(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000106',
    'Legacy-Verkaufsdaten müssen zuerst nachgepflegt werden',
    null,
    '[{"id":"95000000-0000-4000-8000-000000000306","catalog_product_id":null,"title_snapshot":"Legacy-Einzelstück","line_kind":"individual","ordered_quantity":1,"price_mode":"priced","unit_purchase_price":10,"line_total":10,"condition_snapshot":"used","estimated_market_value":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023',
  'Der Verkaufsstatus ist unvollständig. Bitte Verkaufsdaten prüfen und nachpflegen.',
  'ein prüfpflichtiger Legacy-Verkauf zeigt auch serverseitig keine kaputte Korrekturaktion'
);

reset role;

select ok(
  (
    select purchase.entry_status = 'finalized'
      and purchase.purchase_price = 10
      and purchase.total_purchase_cost = 10
    from public.purchases as purchase
    where purchase.id = '95000000-0000-4000-8000-000000000106'
  ) and not exists (
    select 1
    from public.business_events as event
    where event.entity_id = '95000000-0000-4000-8000-000000000106'
      and event.event_type in ('purchase_reopened', 'purchase_corrected')
  ),
  'beide abgelehnten Legacy-Aktionen hinterlassen Einkauf und Historie unverändert'
);

select set_config('flipbase.allow_inventory_sold_transition', 'on', true);
insert into public.inventory_items (
  id, workspace_id, purchase_id, purchase_line_id, title, condition,
  status, allocated_purchase_cost
) values (
  '95000000-0000-4000-8000-000000000406',
  '93000000-0000-4000-8000-000000000011',
  '95000000-0000-4000-8000-000000000106',
  '95000000-0000-4000-8000-000000000306',
  'Zweites Legacy-Einzelstück',
  'used',
  'sold',
  10
);
select set_config('flipbase.allow_inventory_sold_transition', 'off', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select is(
  public.get_purchase_sale_history(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000106'
  ) ->> 'review_inventory_item_id',
  '95000000-0000-4000-8000-000000000405',
  'bei mehreren ungeklärten Artikeln ist das erste Prüfziel deterministisch'
);

select lives_ok(
  $$select public.resolve_legacy_sold_item(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000405',
    'restore_stock',
    'Historischen Status geprüft'
  )$$,
  'das erste konkrete Prüfziel lässt sich im Artikeldetail erfolgreich klären'
);

select is(
  public.get_purchase_sale_history(
    '93000000-0000-4000-8000-000000000011',
    '95000000-0000-4000-8000-000000000106'
  ) ->> 'review_inventory_item_id',
  '95000000-0000-4000-8000-000000000406',
  'nach der Klärung liefert der Server deterministisch das nächste Prüfziel'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select has_function(
  'public',
  'has_purchase_recorded_sales',
  array['uuid', 'uuid'],
  'die UI kann den unveränderlichen Verkaufsverlauf autoritativ abfragen'
);

select ok(
  has_function_privilege(
    'authenticated',
    pg_catalog.to_regprocedure('public.has_purchase_recorded_sales(uuid,uuid)'),
    'execute'
  ),
  'authenticated darf den autoritativen Verkaufsverlauf eines Einkaufs lesen'
);

select ok(
  not coalesce(has_function_privilege(
    'public',
    pg_catalog.to_regprocedure('public.has_purchase_recorded_sales(uuid,uuid)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'anon',
    pg_catalog.to_regprocedure('public.has_purchase_recorded_sales(uuid,uuid)'),
    'execute'
  ), false)
  and not coalesce(has_function_privilege(
    'service_role',
    pg_catalog.to_regprocedure('public.has_purchase_recorded_sales(uuid,uuid)'),
    'execute'
  ), false),
  'öffentliche, anonyme und Service-Role-Aufrufer dürfen keinen Einkaufsverlauf abfragen'
);

select lives_ok(
  $$
    select public.record_sale_return(
      '93000000-0000-4000-8000-000000000011',
      (
        select sale.id
        from public.sales as sale
        where sale.external_order_id = 'task4-sold-item'
      ),
      25,
      true,
      'Historischen Einzelverkauf vollständig retourniert',
      null,
      'restock_ready',
      null
    )
  $$,
  'das historische Einzelstück-Fixture wird vor der Verlaufsprüfung vollständig retourniert'
);

select lives_ok(
  $$select 1 / public.has_purchase_recorded_sales(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000102'
  )::integer$$,
  'ein vollständig retournierter Einzelverkauf bleibt unabhängig vom aktiven Status erkennbar'
);

select lives_ok(
  $$select 1 / (public.get_purchase_sale_history_state(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000102'
  ) = 'recorded')::integer$$,
  'eine echte retournierte Verkaufsposition bleibt der Zustand recorded'
);

select is(
  public.get_purchase_sale_history(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000102'
  ) ->> 'review_inventory_item_id',
  null,
  'ein echter historischer Verkauf hat kein Prüfziel'
);

select lives_ok(
  $$select 1 / public.has_purchase_recorded_sales(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000103'
  )::integer$$,
  'ein historischer Mengenverkauf bleibt erkennbar'
);

select lives_ok(
  $$select 1 / public.has_purchase_recorded_sales(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000111'
  )::integer$$,
  'auch ein vollständig retournierter Mengenverkauf bleibt historisch verkauft'
);

select lives_ok(
  $$select 1 / (not public.has_purchase_recorded_sales(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000108'
  ))::integer$$,
  'ein Einkauf ohne Verkauf wird autoritativ als unveräußert erkannt'
);

select lives_ok(
  $$select 1 / (public.get_purchase_sale_history_state(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000108'
  ) = 'none')::integer$$,
  'ein wirklicher Nichtverkauf bleibt der Zustand none'
);

select is(
  public.get_purchase_sale_history(
    '93000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000108'
  ) ->> 'review_inventory_item_id',
  null,
  'ein wirklicher Nichtverkauf hat kein Prüfziel'
);

reset role;

select * from finish();

rollback;
