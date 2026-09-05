$ErrorActionPreference = 'Stop'

$worktreePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path

$previousVersion = '20260829174944'
$workspaceId = '95000000-0000-4000-8000-000000000001'
$userId = '95000000-0000-4000-8000-000000000002'
$purchaseId = '95000000-0000-4000-8000-000000000003'
$productId = '95000000-0000-4000-8000-000000000004'
$lineId = '95000000-0000-4000-8000-000000000005'
$lotId = '95000000-0000-4000-8000-000000000006'

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
  $containers = @(docker ps --filter "label=com.supabase.cli.workdir=$worktreePath" --filter 'name=supabase_db_' --format '{{.Names}}')
  if ($LASTEXITCODE -ne 0 -or $containers.Count -ne 1) {
    throw "Erwartet wurde genau ein lokaler Supabase-Datenbankcontainer fuer $worktreePath. Gefunden: $($containers.Count)"
  }
  return $containers[0]
}

function Invoke-Psql {
  param(
    [Parameter(Mandatory)] [string] $Container,
    [Parameter(Mandatory)] [string] $Sql,
    [switch] $Scalar
  )

  $arguments = @('exec', $Container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1')
  if ($Scalar) { $arguments += @('-Atq') }
  $arguments += @('-U', 'postgres', '-d', 'postgres', '-c', $Sql)
  $output = & docker @arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($output | Out-String) }
  return ($output | Out-String).Trim()
}

try {
  Invoke-CheckedCommand -Executable 'npx' -Arguments @(
    'supabase', 'db', 'reset', '--local', '--version', $previousVersion, '--no-seed'
  ) -Description 'Reset auf die unmittelbare Vorgaengerversion'

  $container = Resolve-DatabaseContainer
  Invoke-Psql -Container $container -Sql @"
insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '$userId', 'authenticated', 'authenticated',
  'purchase-costing-upgrade@example.test', 'unused', '{}'::jsonb, '{}'::jsonb,
  now(), now()
);
insert into public.workspaces (id, name) values ('$workspaceId', 'purchase costing upgrade');
insert into public.workspace_members (workspace_id, user_id, role)
values ('$workspaceId', '$userId', 'owner');
insert into public.purchases (id, workspace_id, type, title, purchase_price)
values ('$purchaseId', '$workspaceId', 'mystery_pack', 'Legacy oversized purchase', 100);
insert into public.purchase_costs (purchase_id, type, amount, description)
values ('$purchaseId', 'shipping', 10, 'Legacy shipping');
insert into public.catalog_products (id, workspace_id, title, tracking_mode)
values ('$productId', '$workspaceId', 'Legacy bulk item', 'quantity');
insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, unit_purchase_price, line_total
) values (
  '$lineId', '$workspaceId', '$purchaseId', '$productId', 'Legacy bulk item',
  'quantity', 100001, 100001, 0, 0
);
insert into public.stock_lots (
  id, workspace_id, purchase_id, purchase_line_id, catalog_product_id,
  received_quantity, remaining_quantity, unit_cost, received_at
) values (
  '$lotId', '$workspaceId', '$purchaseId', '$lineId', '$productId',
  100001, 100001, 0.123456789012, 'infinity'::timestamptz
);
"@ | Out-Null

  Invoke-CheckedCommand -Executable 'npx' -Arguments @(
    'supabase', 'migration', 'up', '--local'
  ) -Description 'Anwenden der Purchase-Costing-Migration'

  $container = Resolve-DatabaseContainer
  $verification = Invoke-Psql -Container $container -Scalar -Sql @"
select concat_ws(':',
  (select workspace_id::text from public.purchase_costs where purchase_id = '$purchaseId'),
  (select data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
   from information_schema.columns
   where table_schema = 'public' and table_name = 'stock_lots' and column_name = 'unit_cost'),
  (select convalidated::text from pg_constraint where conname = 'purchase_lines_ordered_quantity_check'),
  (select convalidated::text from pg_constraint where conname = 'stock_lots_received_at_finite_check'),
  (select classification
   from public.preview_purchase_costing_legacy('$workspaceId')
   where purchase_id = '$purchaseId')
)
from pg_catalog.set_config('request.jwt.claim.sub', '$userId', false);
"@

  $expected = "${workspaceId}:numeric(24,12):false:false:manual_review"
  if ($verification -ne $expected) {
    throw "Upgrade-Pruefung fehlgeschlagen. Erwartet: $expected; erhalten: $verification"
  }

  Write-Host 'Purchase-Costing-Upgrade-Harness gruen: Workspace-Backfill, Praezision und kontrollierte manuelle Altfall-Klassifikation bestaetigt.'
}
finally {
  Invoke-CheckedCommand -Executable 'npx' -Arguments @(
    'supabase', 'db', 'reset', '--local'
  ) -Description 'Wiederherstellen der aktuellen lokalen Datenbank'
}

