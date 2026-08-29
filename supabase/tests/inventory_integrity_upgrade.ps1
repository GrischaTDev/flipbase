$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$worktreePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$migrationDirectory = Join-Path $worktreePath 'supabase\migrations'
$fixturePath = Join-Path $PSScriptRoot 'fixtures\inventory_integrity_legacy.sql'
$migrationFiles = @(Get-ChildItem -LiteralPath $migrationDirectory -Filter '*.sql' | Sort-Object Name)
$currentMigrations = @($migrationFiles | Where-Object { $_.Name -match '^\d{14}_inventory_integrity_unification\.sql$' })

if ($currentMigrations.Count -ne 1) {
  throw "Erwartet wurde genau eine Migration inventory_integrity_unification. Gefunden: $($currentMigrations.Count)"
}

$currentMigration = $currentMigrations[0]
$currentIndex = [Array]::IndexOf($migrationFiles, $currentMigration)
if ($currentIndex -lt 1 -or $currentIndex -ne ($migrationFiles.Count - 1)) {
  throw 'Die Inventar-Integritaetsmigration muss genau eine unmittelbare Vorgaengermigration besitzen und die neueste Migration sein.'
}

$previousMigration = $migrationFiles[$currentIndex - 1]
$previousVersion = $previousMigration.BaseName.Split('_')[0]
$currentVersion = $currentMigration.BaseName.Split('_')[0]

if (-not (Test-Path -LiteralPath $fixturePath)) {
  throw "Legacy-Fixture nicht gefunden: $fixturePath"
}

$temporaryFiles = @(
  (New-TemporaryFile).FullName,
  (New-TemporaryFile).FullName
)
$beforeFile = $temporaryFiles[0]
$afterFile = $temporaryFiles[1]
$temporaryRoot = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path
foreach ($temporaryFile in $temporaryFiles) {
  $resolvedFile = (Resolve-Path -LiteralPath $temporaryFile).Path
  if (-not $resolvedFile.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unerwartete temporaere Pruefdatei: $resolvedFile"
  }
}

$containerName = $null
$containerFixturePath = "/tmp/flipbase-inventory-upgrade-$([guid]::NewGuid()).sql"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)] [string] $Executable,
    [Parameter(Mandatory)] [string[]] $Arguments,
    [Parameter(Mandatory)] [string] $Description
  )

  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Description ist mit Exit-Code $LASTEXITCODE fehlgeschlagen."
  }
}

function Resolve-DatabaseContainer {
  $containers = @(
    docker ps --filter "label=com.supabase.cli.workdir=$worktreePath" --filter 'name=supabase_db_' --format '{{.Names}}'
  )
  if ($LASTEXITCODE -ne 0 -or $containers.Count -ne 1) {
    throw "Erwartet wurde genau ein laufender Supabase-Datenbankcontainer fuer $worktreePath. Gefunden: $($containers.Count)"
  }
  return $containers[0]
}

function Invoke-PsqlScalar {
  param([Parameter(Mandatory)] [string] $Sql)

  $output = & docker exec $script:containerName psql -X -v ON_ERROR_STOP=1 -Atq -U postgres -d postgres -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output | Out-String)
  }
  return ($output | Out-String).Trim()
}

function Capture-LegacySnapshot {
  param([Parameter(Mandatory)] [string] $OutputPath)

  $snapshotSql = @"
with fixture_workspaces as (
  select unnest(array[
    '82000000-0000-4000-8000-000000000001'::uuid,
    '82000000-0000-4000-8000-000000000002'::uuid
  ]) as id
), inventory_rows as (
  select item.*
  from public.inventory_items as item
  where item.workspace_id in (select id from fixture_workspaces)
), sale_rows as (
  select sale.*
  from public.sales as sale
  where sale.workspace_id in (select id from fixture_workspaces)
), sale_line_rows as (
  select sale_line.*
  from public.sale_lines as sale_line
  where sale_line.workspace_id in (select id from fixture_workspaces)
), store_order_rows as (
  select store_order.*
  from public.store_orders as store_order
  where store_order.workspace_id in (select id from fixture_workspaces)
), store_order_item_rows as (
  select store_item.*
  from public.store_order_items as store_item
  join store_order_rows as store_order on store_order.id = store_item.store_order_id
)
select jsonb_build_object(
  'counts', jsonb_build_object(
    'workspaces', (select count(*) from public.workspaces where id in (select id from fixture_workspaces)),
    'workspace_members', (select count(*) from public.workspace_members where workspace_id in (select id from fixture_workspaces)),
    'inventory_items', (select count(*) from inventory_rows),
    'sales', (select count(*) from sale_rows),
    'sale_lines', (select count(*) from sale_line_rows),
    'store_orders', (select count(*) from store_order_rows),
    'store_order_items', (select count(*) from store_order_item_rows)
  ),
  'ids', jsonb_build_object(
    'inventory_items', (select jsonb_agg(id order by id) from inventory_rows),
    'sales', (select jsonb_agg(id order by id) from sale_rows),
    'sale_lines', (select jsonb_agg(id order by id) from sale_line_rows),
    'store_orders', (select jsonb_agg(id order by id) from store_order_rows),
    'store_order_items', (select jsonb_agg(id order by id) from store_order_item_rows)
  ),
  'sums', jsonb_build_object(
    'sale_price', (select coalesce(sum(sale_price), 0) from sale_rows),
    'sale_price_total', (select coalesce(sum(sale_price_total), 0) from sale_rows),
    'line_total', (select coalesce(sum(line_total), 0) from sale_line_rows),
    'cost_of_goods_sold', (select coalesce(sum(cost_of_goods_sold), 0) from sale_line_rows),
    'store_order_subtotal', (select coalesce(sum(subtotal), 0) from store_order_rows),
    'store_order_shipping_cost', (select coalesce(sum(shipping_cost), 0) from store_order_rows),
    'store_order_total', (select coalesce(sum(total), 0) from store_order_rows),
    'store_order_item_price', (select coalesce(sum(price), 0) from store_order_item_rows),
    'store_order_item_quantity', (select coalesce(sum(quantity), 0) from store_order_item_rows),
    'store_order_item_line_value', (select coalesce(sum(price * quantity), 0) from store_order_item_rows)
  ),
  'hashes', jsonb_build_object(
    'inventory_items', (select md5(coalesce(string_agg(
      concat_ws('|', id, workspace_id, title, status, allocated_purchase_cost), E'\n' order by id
    ), '')) from inventory_rows),
    'sales', (select md5(coalesce(string_agg(
      concat_ws('|', id, workspace_id, inventory_item_id, platform, sale_price, sale_price_total, sale_date, returned_at is null), E'\n' order by id
    ), '')) from sale_rows),
    'sale_lines', (select md5(coalesce(string_agg(
      concat_ws('|', id, workspace_id, sale_id, inventory_item_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode), E'\n' order by id
    ), '')) from sale_line_rows),
    'store_orders', md5(coalesce((
      select jsonb_agg(to_jsonb(store_order) order by store_order.id)::text
      from store_order_rows as store_order
    ), '[]')),
    'store_order_items', md5(coalesce((
      select jsonb_agg(to_jsonb(store_item) order by store_item.id)::text
      from store_order_item_rows as store_item
    ), '[]'))
  )
)::text;
"@

  $snapshot = Invoke-PsqlScalar -Sql $snapshotSql
  $snapshot | Set-Content -LiteralPath $OutputPath -Encoding utf8
  return $snapshot
}

try {
  Write-Host "Upgrade-Probe: Reset auf $previousVersion ($($previousMigration.Name))"
  Invoke-CheckedCommand -Executable 'npx' -Arguments @(
    'supabase', 'db', 'reset', '--local', '--version', $previousVersion, '--no-seed'
  ) -Description 'Reset auf die unmittelbare Vorgaengerversion'

  $containerName = Resolve-DatabaseContainer
  Invoke-CheckedCommand -Executable 'docker' -Arguments @(
    'cp', $fixturePath, "${containerName}:$containerFixturePath"
  ) -Description 'Kopieren der Legacy-Fixture'
  Invoke-CheckedCommand -Executable 'docker' -Arguments @(
    'exec', $containerName, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-f', $containerFixturePath
  ) -Description 'Einspielen der Legacy-Fixture per psql'

  $beforeSnapshot = Capture-LegacySnapshot -OutputPath $beforeFile
  Write-Host "Vorher-Snapshot: $beforeSnapshot"

  Invoke-CheckedCommand -Executable 'npx' -Arguments @(
    'supabase', 'migration', 'up', '--local'
  ) -Description 'Anwenden der Inventar-Integritaetsmigration'

  $containerName = Resolve-DatabaseContainer
  $afterSnapshot = Capture-LegacySnapshot -OutputPath $afterFile
  Write-Host "Nachher-Snapshot: $afterSnapshot"

  if ($beforeSnapshot -ne $afterSnapshot) {
    throw "Legacy-Daten wurden durch das Upgrade veraendert. Vorher: $beforeFile; Nachher: $afterFile"
  }

  $appliedVersion = Invoke-PsqlScalar -Sql "select count(*) from supabase_migrations.schema_migrations where version = '$currentVersion'"
  if ($appliedVersion -ne '1') {
    throw "Die Migration $currentVersion ist nicht genau einmal als angewendet verzeichnet. Ergebnis: $appliedVersion"
  }

  $classificationMismatches = Invoke-PsqlScalar -Sql @"
with expected(inventory_item_id, sale_state) as (
  values
    ('82000000-0000-4000-8000-000000000005'::uuid, 'no_active_sale'::text),
    ('82000000-0000-4000-8000-000000000006'::uuid, 'sold'::text),
    ('82000000-0000-4000-8000-000000000007'::uuid, 'legacy_sold_unverified'::text),
    ('82000000-0000-4000-8000-000000000008'::uuid, 'sale_status_conflict'::text),
    ('82000000-0000-4000-8000-000000000009'::uuid, 'multiple_active_sales'::text),
    ('82000000-0000-4000-8000-000000000010'::uuid, 'legacy_sold_unverified'::text),
    ('82000000-0000-4000-8000-000000000017'::uuid, 'legacy_sold_unverified'::text),
    ('82000000-0000-4000-8000-000000000018'::uuid, 'legacy_sale_header_without_line'::text)
)
select count(*)
from expected
left join public.inventory_item_sale_states as actual using (inventory_item_id)
where actual.sale_state is distinct from expected.sale_state;
"@
  if ($classificationMismatches -ne '0') {
    throw "Die View-Klassifikation enthaelt $classificationMismatches Abweichung(en)."
  }

  $triggerVerification = Invoke-PsqlScalar -Sql @"
select
  count(*)::text || ':' ||
  count(*) filter (where trigger.tgenabled <> 'D')::text || ':' ||
  count(*) filter (where trigger.tgconstraint <> 0)::text || ':' ||
  count(*) filter (where constraint_row.condeferrable and constraint_row.condeferred)::text
from pg_trigger as trigger
left join pg_constraint as constraint_row on constraint_row.oid = trigger.tgconstraint
where trigger.tgname in (
  'protect_inventory_item_sold_status',
  'inventory_item_sale_integrity_on_insert',
  'inventory_item_sale_integrity_on_status',
  'inventory_item_sale_integrity_on_sale_line',
  'inventory_item_sale_integrity_on_sale'
);
"@
  if ($triggerVerification -ne '5:5:4:4') {
    throw "Triggerpruefung fehlgeschlagen. Erwartet: 5:5:4:4, erhalten: $triggerVerification"
  }

  $privilegeVerification = Invoke-PsqlScalar -Sql @"
select concat_ws(':',
  has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'select'),
  has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'insert'),
  has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'update'),
  has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'delete'),
  has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'truncate'),
  has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'maintain'),
  has_table_privilege('anon', 'public.inventory_reconciliation_events', 'select'),
  has_table_privilege('anon', 'public.inventory_reconciliation_events', 'truncate'),
  has_function_privilege('authenticated', 'public.record_legacy_inventory_sale(uuid,uuid,jsonb,text)', 'execute'),
  has_function_privilege('anon', 'public.record_legacy_inventory_sale(uuid,uuid,jsonb,text)', 'execute'),
  has_function_privilege('service_role', 'public.record_legacy_inventory_sale(uuid,uuid,jsonb,text)', 'execute'),
  has_function_privilege('authenticated', 'public.validate_inventory_item_sale_integrity(uuid)', 'execute'),
  has_function_privilege('service_role', 'public.validate_inventory_item_sale_integrity(uuid)', 'execute')
);
"@
  if ($privilegeVerification -ne 't:f:f:f:f:f:f:f:t:f:f:f:f') {
    throw "Rechtepruefung fehlgeschlagen: $privilegeVerification"
  }

  Write-Host "Upgrade-Harness gruen: $previousVersion -> $currentVersion; Daten, IDs, Summen und Hashes unveraendert; View, Trigger und Rechte bestaetigt."
}
finally {
  if ($null -ne $containerName) {
    & docker exec $containerName rm -f $containerFixturePath 2>$null | Out-Null
  }
  foreach ($temporaryFile in $temporaryFiles) {
    if (Test-Path -LiteralPath $temporaryFile) {
      Remove-Item -LiteralPath $temporaryFile -Force
    }
  }
}
