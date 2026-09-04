$ErrorActionPreference = 'Stop'

$worktreePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$containerNames = @(
  docker ps --filter "label=com.supabase.cli.workdir=$worktreePath" --filter 'name=supabase_db_' --format '{{.Names}}'
)
if ($containerNames.Count -ne 1) {
  throw "Erwartet wurde genau ein laufender lokaler Supabase-Datenbankcontainer für $worktreePath. Gefunden: $($containerNames.Count)"
}

$containerName = $containerNames[0]
$workspaceId = '95000000-0000-4000-8000-000000000001'
$userId = '95000000-0000-4000-8000-000000000002'
$itemPurchaseId = '95000000-0000-4000-8000-000000000101'
$lotPurchaseId = '95000000-0000-4000-8000-000000000102'
$itemLineId = '95000000-0000-4000-8000-000000000201'
$lotLineId = '95000000-0000-4000-8000-000000000202'
$catalogProductId = '95000000-0000-4000-8000-000000000301'
$barrierTimeoutSeconds = 10
$workerTimeoutSeconds = 15
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "flipbase-purchase-costing-race-$([guid]::NewGuid())"

New-Item -ItemType Directory -Path $tempDirectory | Out-Null
$resolvedTempDirectory = (Resolve-Path -LiteralPath $tempDirectory).Path
$expectedTempRoot = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path
if (-not $resolvedTempDirectory.StartsWith($expectedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Unerwartetes temporäres Verzeichnis: $resolvedTempDirectory"
}

function Invoke-PsqlFile {
  param(
    [Parameter(Mandatory)] [string] $InputFile,
    [Parameter(Mandatory)] [string] $OutputFile,
    [Parameter(Mandatory)] [string] $ErrorFile,
    [switch] $AsProcess
  )

  $arguments = @('exec', '-i', $containerName, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres')
  if ($AsProcess) {
    return Start-Process -FilePath 'docker' -ArgumentList $arguments -RedirectStandardInput $InputFile -RedirectStandardOutput $OutputFile -RedirectStandardError $ErrorFile -WindowStyle Hidden -PassThru
  }

  $process = Start-Process -FilePath 'docker' -ArgumentList $arguments -RedirectStandardInput $InputFile -RedirectStandardOutput $OutputFile -RedirectStandardError $ErrorFile -WindowStyle Hidden -PassThru -Wait
  if ($process.ExitCode -ne 0) {
    throw (Get-Content -Raw -LiteralPath $ErrorFile)
  }
}

function Invoke-PsqlScalar {
  param([Parameter(Mandatory)] [string] $Sql)

  $output = & docker exec $containerName psql -X -v ON_ERROR_STOP=1 -At -U postgres -d postgres -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output | Out-String)
  }
  return ($output | Out-String).Trim()
}

function Wait-ForScalar {
  param(
    [Parameter(Mandatory)] [string] $Sql,
    [Parameter(Mandatory)] [string] $Expected,
    [Parameter(Mandatory)] [string] $Description
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($barrierTimeoutSeconds)
  do {
    $actual = Invoke-PsqlScalar -Sql $Sql
    if ($actual -eq $Expected) {
      return
    }

    # Dies ist ausschließlich condition-based polling auf PostgreSQL-Sitzungszustand,
    # keine zeitgesteuerte Race-Annahme.
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)

  throw "Timeout beim Warten auf $Description. Erwartet: $Expected, zuletzt gesehen: $actual"
}

function Wait-ForProcess {
  param(
    [Parameter(Mandatory)] [System.Diagnostics.Process] $Process,
    [Parameter(Mandatory)] [string] $Description
  )

  if (-not $Process.WaitForExit($workerTimeoutSeconds * 1000)) {
    $Process.Kill($true)
    throw "Timeout beim Warten auf $Description."
  }
}

function Start-InteractiveSession {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'docker'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in @('exec', '-i', $containerName, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres')) {
    [void] $startInfo.ArgumentList.Add($argument)
  }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw 'Die Wiederöffnungssitzung konnte nicht gestartet werden.'
  }
  return $process
}

function Invoke-TestCleanup {
  $cleanupFile = Join-Path $resolvedTempDirectory 'cleanup.sql'
  $cleanupOutput = Join-Path $resolvedTempDirectory 'cleanup.out'
  $cleanupError = Join-Path $resolvedTempDirectory 'cleanup.err'
  @"
begin;
set local session_replication_role = replica;
delete from public.sale_line_lot_allocations where workspace_id = '$workspaceId';
delete from public.stock_movements where workspace_id = '$workspaceId';
delete from public.returns where workspace_id = '$workspaceId';
delete from public.sale_lines where workspace_id = '$workspaceId';
delete from public.sales where workspace_id = '$workspaceId';
delete from public.stock_lots where workspace_id = '$workspaceId';
delete from public.inventory_items where workspace_id = '$workspaceId';
delete from public.purchase_costs where workspace_id = '$workspaceId';
delete from public.purchase_lines where workspace_id = '$workspaceId';
delete from public.business_events where workspace_id = '$workspaceId';
delete from public.purchases where workspace_id = '$workspaceId';
delete from public.catalog_products where workspace_id = '$workspaceId';
delete from public.workspace_members where workspace_id = '$workspaceId';
delete from public.workspaces where id = '$workspaceId';
delete from public.profiles where id = '$userId';
delete from auth.users where id = '$userId';
commit;
"@ | Set-Content -LiteralPath $cleanupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $cleanupFile -OutputFile $cleanupOutput -ErrorFile $cleanupError
}

function Write-SaleWorkerSql {
  param(
    [Parameter(Mandatory)] [string] $Path,
    [Parameter(Mandatory)] [string] $ApplicationName,
    [Parameter(Mandatory)] [string] $PurchaseKind,
    [Parameter(Mandatory)] [string] $ExternalOrderId
  )

  $linesSql = if ($PurchaseKind -eq 'item') {
    @"
pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
  'inventory_item_id', (
    select item.id
    from public.inventory_items as item
    where item.workspace_id = '$workspaceId'
      and item.purchase_line_id = '$itemLineId'
  ),
  'quantity', 1,
  'unit_sale_price', 10
))
"@
  }
  else {
    "'[{`"catalog_product_id`":`"$catalogProductId`",`"quantity`":1,`"unit_sale_price`":10}]'::jsonb"
  }

  @"
\set VERBOSITY verbose
set application_name = '$ApplicationName';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$userId';
select public.record_sale(
  '$workspaceId',
  '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"$ExternalOrderId"}'::jsonb,
  $linesSql
);
commit;
"@ | Set-Content -LiteralPath $Path -Encoding utf8
}

function Invoke-ReopenSaleRace {
  param(
    [Parameter(Mandatory)] [string] $PurchaseId,
    [Parameter(Mandatory)] [ValidateSet('item', 'lot')] [string] $PurchaseKind,
    [Parameter(Mandatory)] [string] $ApplicationSuffix,
    [Parameter(Mandatory)] [string] $ExternalOrderId,
    [Parameter(Mandatory)] [string] $ExpectedError
  )

  $reopenApplicationName = "flipbase-reopen-$ApplicationSuffix"
  $saleApplicationName = "flipbase-sale-$ApplicationSuffix"
  $workerFile = Join-Path $resolvedTempDirectory "$ApplicationSuffix-worker.sql"
  $workerOutput = Join-Path $resolvedTempDirectory "$ApplicationSuffix-worker.out"
  $workerError = Join-Path $resolvedTempDirectory "$ApplicationSuffix-worker.err"
  Write-SaleWorkerSql -Path $workerFile -ApplicationName $saleApplicationName -PurchaseKind $PurchaseKind -ExternalOrderId $ExternalOrderId

  $reopenSession = $null
  $saleWorker = $null
  try {
    $reopenSession = Start-InteractiveSession
    $reopenSession.StandardInput.WriteLine("set application_name = '$reopenApplicationName'; begin; set local role authenticated; set local request.jwt.claim.sub = '$userId'; select public.reopen_purchase_costing('$workspaceId', '$PurchaseId');")
    $reopenSession.StandardInput.Flush()

    Wait-ForScalar -Sql "select count(*) from pg_stat_activity where application_name = '$reopenApplicationName' and state = 'idle in transaction'" -Expected '1' -Description "die vollständig ausgeführte $PurchaseKind-Wiederöffnung"

    $saleWorker = Invoke-PsqlFile -InputFile $workerFile -OutputFile $workerOutput -ErrorFile $workerError -AsProcess
    Wait-ForScalar -Sql "select count(*) from pg_stat_activity where application_name = '$saleApplicationName' and wait_event_type = 'Lock'" -Expected '1' -Description "den tatsächlich auf dem $PurchaseKind-Pfad blockierten Verkauf"

    $reopenSession.StandardInput.WriteLine('commit; \q')
    $reopenSession.StandardInput.Close()
    Wait-ForProcess -Process $reopenSession -Description "Commit der $PurchaseKind-Wiederöffnung"
    Wait-ForProcess -Process $saleWorker -Description "$PurchaseKind-Verkaufsworker"

    if ($saleWorker.ExitCode -eq 0) {
      throw "Der parallele $PurchaseKind-Verkauf wurde trotz wieder geöffnetem Einkauf committet."
    }

    $workerErrorText = Get-Content -Raw -LiteralPath $workerError
    if ($workerErrorText -match '40P01|deadlock detected') {
      throw "Der parallele $PurchaseKind-Pfad endete mit einem Deadlock. Ausgabe: $workerErrorText"
    }
    if ($workerErrorText -notmatch $ExpectedError) {
      throw "Der parallele $PurchaseKind-Verkauf lieferte nicht den erwarteten Fachfehler. Ausgabe: $workerErrorText"
    }

    $verification = Invoke-PsqlScalar -Sql "select (select entry_status from public.purchases where id = '$PurchaseId') || ':' || (select count(*) from public.sales where workspace_id = '$workspaceId' and external_order_id = '$ExternalOrderId')::text || ':' || (select count(*) from public.sale_lines as sale_line join public.sales as sale on sale.id = sale_line.sale_id where sale.workspace_id = '$workspaceId' and sale.external_order_id = '$ExternalOrderId')::text"
    if ($verification -ne 'capturing:0:0') {
      throw "Der parallele $PurchaseKind-Verkauf hinterließ Teilwrites. Erwartet: capturing:0:0, erhalten: $verification"
    }

    Write-Host "Zwei-Session-$PurchaseKind-Race grün: bestätigter Lock-Wait, kein Deadlock, kein Verkauf und fachlicher Fehler."
  }
  finally {
    foreach ($process in @($saleWorker, $reopenSession)) {
      if ($null -ne $process -and -not $process.HasExited) {
        $process.Kill($true)
        $process.WaitForExit()
      }
    }
  }
}

try {
  Invoke-TestCleanup

  $setupFile = Join-Path $resolvedTempDirectory 'setup.sql'
  $setupOutput = Join-Path $resolvedTempDirectory 'setup.out'
  $setupError = Join-Path $resolvedTempDirectory 'setup.err'
  @"
insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '$userId', 'authenticated', 'authenticated', 'purchase-costing-race@example.test',
  'not-used-by-this-test', '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.profiles (id, email)
values ('$userId', 'purchase-costing-race@example.test')
on conflict (id) do nothing;
insert into public.workspaces (id, name) values ('$workspaceId', 'Purchase costing race test');
insert into public.workspace_members (workspace_id, user_id, role)
values ('$workspaceId', '$userId', 'owner');
insert into public.catalog_products (id, workspace_id, title, tracking_mode)
values ('$catalogProductId', '$workspaceId', 'Concurrent lot product', 'quantity');
insert into public.purchases (id, workspace_id, type, title, purchase_price)
values
  ('$itemPurchaseId', '$workspaceId', 'single', 'Concurrent item purchase', null),
  ('$lotPurchaseId', '$workspaceId', 'lot', 'Concurrent lot purchase', null);
insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total, condition_snapshot
) values
  ('$itemLineId', '$workspaceId', '$itemPurchaseId', null, 'Concurrent item', 'individual', 1, 0, 'priced', 10, 10, 'used'),
  ('$lotLineId', '$workspaceId', '$lotPurchaseId', '$catalogProductId', 'Concurrent lot', 'quantity', 1, 0, 'priced', 10, 10, null);
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$userId';
select public.finalize_purchase_costing('$workspaceId', '$itemPurchaseId');
select public.finalize_purchase_costing('$workspaceId', '$lotPurchaseId');
commit;
"@ | Set-Content -LiteralPath $setupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $setupFile -OutputFile $setupOutput -ErrorFile $setupError

  Invoke-ReopenSaleRace -PurchaseId $itemPurchaseId -PurchaseKind 'item' -ApplicationSuffix 'item' -ExternalOrderId 'task4-item-race' -ExpectedError '22023: Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar\.'
  Invoke-ReopenSaleRace -PurchaseId $lotPurchaseId -PurchaseKind 'lot' -ApplicationSuffix 'lot' -ExternalOrderId 'task4-lot-race' -ExpectedError '22023: Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar\.'

  Write-Host 'Purchase-Costing-Concurrency-Harness grün: Item- und Lot-Verkauf sind mit Wiederöffnung serialisiert.'
}
finally {
  try {
    Invoke-TestCleanup
  }
  finally {
    if (Test-Path -LiteralPath $resolvedTempDirectory) {
      Remove-Item -LiteralPath $resolvedTempDirectory -Recurse -Force
    }
  }
}
