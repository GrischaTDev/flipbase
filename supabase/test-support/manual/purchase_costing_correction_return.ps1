$ErrorActionPreference = 'Stop'

$worktreePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$containerNames = @(
  docker ps --filter "label=com.supabase.cli.workdir=$worktreePath" --filter 'name=supabase_db_' --format '{{.Names}}'
)
if ($containerNames.Count -ne 1) {
  throw "Erwartet wurde genau ein laufender lokaler Supabase-Datenbankcontainer für $worktreePath. Gefunden: $($containerNames.Count)"
}

$containerName = $containerNames[0]
$workspaceId = '96000000-0000-4000-8000-000000000001'
$userId = '96000000-0000-4000-8000-000000000002'
$purchaseAId = '96000000-0000-4000-8000-000000000101'
$purchaseBId = '96000000-0000-4000-8000-000000000102'
$purchaseCId = '96000000-0000-4000-8000-000000000103'
$lineAId = '96000000-0000-4000-8000-000000000201'
$lineBId = '96000000-0000-4000-8000-000000000202'
$lineCId = '96000000-0000-4000-8000-000000000203'
$productAId = '96000000-0000-4000-8000-000000000301'
$productBId = '96000000-0000-4000-8000-000000000302'
$productCId = '96000000-0000-4000-8000-000000000303'
$barrierTimeoutSeconds = 10
$workerTimeoutSeconds = 20
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "flipbase-correction-return-race-$([guid]::NewGuid())"

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

    # Ausschließlich zustandsbasiertes Polling auf PostgreSQL, keine Sleep-Race-Annahme.
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
    throw 'Die koordinierte Datenbanksitzung konnte nicht gestartet werden.'
  }
  return $process
}

function Get-InteractiveFailure {
  param([Parameter(Mandatory)] [System.Diagnostics.Process] $Process)

  $stdout = $Process.StandardOutput.ReadToEnd()
  $stderr = $Process.StandardError.ReadToEnd()
  return "$stdout`n$stderr"
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

function Get-CorrectionSql {
  param(
    [Parameter(Mandatory)] [string] $PurchaseId,
    [Parameter(Mandatory)] [string] $LineId,
    [Parameter(Mandatory)] [string] $ProductId,
    [Parameter(Mandatory)] [string] $Reason
  )

  return @"
select public.correct_purchase_costing(
  '$workspaceId',
  '$PurchaseId',
  '$Reason',
  0.04,
  '[{"id":"$LineId","catalog_product_id":"$ProductId","title_snapshot":"Concurrent correction","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
  '[]'::jsonb
)
"@
}

function Get-ReturnSql {
  param([Parameter(Mandatory)] [string] $ExternalOrderId)

  return @"
select public.record_sale_return(
  '$workspaceId',
  (select sale.id from public.sales as sale where sale.workspace_id = '$workspaceId' and sale.external_order_id = '$ExternalOrderId'),
  10,
  true,
  'concurrent return',
  'coordinated harness',
  'restock_ready',
  'Concurrency test'
)
"@
}

function Assert-NoDeadlockAndFinalState {
  param(
    [Parameter(Mandatory)] [string] $PurchaseId,
    [Parameter(Mandatory)] [string] $ExternalOrderId,
    [Parameter(Mandatory)] [AllowEmptyString()] [string] $CorrectionError,
    [Parameter(Mandatory)] [AllowEmptyString()] [string] $ReturnError
  )

  $combinedError = "$CorrectionError`n$ReturnError"
  if ($combinedError -match '40P01|deadlock detected') {
    throw "Correction-vs-return endete mit einem Deadlock. Ausgabe: $combinedError"
  }
  if (-not [string]::IsNullOrWhiteSpace($combinedError)) {
    throw "Correction-vs-return endete mit einem unerwarteten Datenbankfehler. Ausgabe: $combinedError"
  }

  $verification = Invoke-PsqlScalar -Sql "select (select purchase_price::numeric(12,2) from public.purchases where id = '$PurchaseId')::text || ':' || (select refund_amount from public.sales where workspace_id = '$workspaceId' and external_order_id = '$ExternalOrderId')::text || ':' || (select count(*) from public.returns as returned_sale join public.sales as sale on sale.id = returned_sale.sale_id where sale.workspace_id = '$workspaceId' and sale.external_order_id = '$ExternalOrderId')::text || ':' || (select remaining_quantity from public.stock_lots where purchase_id = '$PurchaseId')::text || ':' || (select active_allocated_cost from public.sale_line_lot_allocations as allocation join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id join public.sales as sale on sale.id = sale_line.sale_id where sale.external_order_id = '$ExternalOrderId')::text || ':' || (select count(*) from public.business_events where workspace_id = '$workspaceId' and entity_type = 'purchase' and entity_id = '$PurchaseId' and event_type = 'purchase_corrected')::text"
  if ($verification -ne '0.04:10.00:1:3:0.00:1') {
    throw "Correction-vs-return hinterließ keinen eindeutigen seriellen Endzustand. Erwartet: 0.04:10.00:1:3:0.00:1, erhalten: $verification"
  }
}

function Invoke-CorrectionFirstRace {
  $correctionApplication = 'flipbase-correction-first'
  $returnApplication = 'flipbase-return-second'
  $returnFile = Join-Path $resolvedTempDirectory 'return-second.sql'
  $returnOutput = Join-Path $resolvedTempDirectory 'return-second.out'
  $returnError = Join-Path $resolvedTempDirectory 'return-second.err'
  $correctionSql = Get-CorrectionSql -PurchaseId $purchaseAId -LineId $lineAId -ProductId $productAId -Reason 'correction first'
  $returnSql = Get-ReturnSql -ExternalOrderId 'task4-r3-race-a'
  @"
\set VERBOSITY verbose
set application_name = '$returnApplication';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$userId';
$returnSql;
commit;
"@ | Set-Content -LiteralPath $returnFile -Encoding utf8

  $correctionSession = $null
  $returnWorker = $null
  try {
    $correctionSession = Start-InteractiveSession
    $correctionSession.StandardInput.WriteLine("set application_name = '$correctionApplication'; begin; select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('$purchaseAId', 0)); select id from public.purchases where id = '$purchaseAId' for update; select id from public.stock_lots where purchase_id = '$purchaseAId' for update; set local role authenticated; set local request.jwt.claim.sub = '$userId';")
    $correctionSession.StandardInput.Flush()
    Wait-ForScalar -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = '$correctionApplication' and state = 'idle in transaction'" -Expected '1' -Description 'den purchase→lot-Korrekturprefix'

    $returnWorker = Invoke-PsqlFile -InputFile $returnFile -OutputFile $returnOutput -ErrorFile $returnError -AsProcess
    Wait-ForScalar -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = '$returnApplication' and wait_event_type = 'Lock'" -Expected '1' -Description 'den echten Retouren-Lock-Wait hinter dem Korrekturprefix'

    $correctionSession.StandardInput.WriteLine('\o /dev/null')
    $correctionSession.StandardInput.WriteLine("$correctionSql;")
    $correctionSession.StandardInput.WriteLine('\o')
    $correctionSession.StandardInput.WriteLine('commit; \q')
    $correctionSession.StandardInput.Close()
    Wait-ForProcess -Process $correctionSession -Description 'Korrektur in der ersten Serialisierungsrichtung'
    Wait-ForProcess -Process $returnWorker -Description 'Retoure in der zweiten Serialisierungsposition'

    $correctionFailure = if ($correctionSession.ExitCode -eq 0) { '' } else { Get-InteractiveFailure -Process $correctionSession }
    $returnFailure = if ($returnWorker.ExitCode -eq 0) { '' } else { Get-Content -Raw -LiteralPath $returnError }
    Assert-NoDeadlockAndFinalState -PurchaseId $purchaseAId -ExternalOrderId 'task4-r3-race-a' -CorrectionError $correctionFailure -ReturnError $returnFailure
    Write-Host 'Korrektur-zuerst grün: echter Retouren-Lock-Wait, kein 40P01 und ein vollständiger serieller Endzustand.'
  }
  finally {
    foreach ($process in @($returnWorker, $correctionSession)) {
      if ($null -ne $process -and -not $process.HasExited) {
        $process.Kill($true)
        $process.WaitForExit()
      }
    }
  }
}

function Invoke-ReturnFirstRace {
  $returnApplication = 'flipbase-return-first'
  $correctionApplication = 'flipbase-correction-second'
  $correctionFile = Join-Path $resolvedTempDirectory 'correction-second.sql'
  $correctionOutput = Join-Path $resolvedTempDirectory 'correction-second.out'
  $correctionError = Join-Path $resolvedTempDirectory 'correction-second.err'
  $correctionSql = Get-CorrectionSql -PurchaseId $purchaseBId -LineId $lineBId -ProductId $productBId -Reason 'return first'
  $returnSql = Get-ReturnSql -ExternalOrderId 'task4-r3-race-b'
  @"
\set VERBOSITY verbose
set application_name = '$correctionApplication';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$userId';
$correctionSql;
commit;
"@ | Set-Content -LiteralPath $correctionFile -Encoding utf8

  $returnSession = $null
  $correctionWorker = $null
  try {
    $returnSession = Start-InteractiveSession
    $returnSession.StandardInput.WriteLine("set application_name = '$returnApplication'; begin; select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('$purchaseBId', 0)); select id from public.purchases where id = '$purchaseBId' for update; select id from public.sales where workspace_id = '$workspaceId' and external_order_id = 'task4-r3-race-b' for update; set local role authenticated; set local request.jwt.claim.sub = '$userId';")
    $returnSession.StandardInput.Flush()
    Wait-ForScalar -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = '$returnApplication' and state = 'idle in transaction'" -Expected '1' -Description 'den purchase→sale-Retourenprefix'

    $correctionWorker = Invoke-PsqlFile -InputFile $correctionFile -OutputFile $correctionOutput -ErrorFile $correctionError -AsProcess
    Wait-ForScalar -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = '$correctionApplication' and wait_event_type = 'Lock'" -Expected '1' -Description 'den echten Korrektur-Lock-Wait hinter der Retoure'

    $returnSession.StandardInput.WriteLine('\o /dev/null')
    $returnSession.StandardInput.WriteLine("$returnSql;")
    $returnSession.StandardInput.WriteLine('\o')
    $returnSession.StandardInput.WriteLine('commit; \q')
    $returnSession.StandardInput.Close()
    Wait-ForProcess -Process $returnSession -Description 'Retoure in der ersten Serialisierungsrichtung'
    Wait-ForProcess -Process $correctionWorker -Description 'Korrektur in der zweiten Serialisierungsposition'

    $returnFailure = if ($returnSession.ExitCode -eq 0) { '' } else { Get-InteractiveFailure -Process $returnSession }
    $correctionFailure = if ($correctionWorker.ExitCode -eq 0) { '' } else { Get-Content -Raw -LiteralPath $correctionError }
    Assert-NoDeadlockAndFinalState -PurchaseId $purchaseBId -ExternalOrderId 'task4-r3-race-b' -CorrectionError $correctionFailure -ReturnError $returnFailure
    Write-Host 'Retoure-zuerst grün: echter Korrektur-Lock-Wait, kein 40P01 und ein vollständiger serieller Endzustand.'
  }
  finally {
    foreach ($process in @($correctionWorker, $returnSession)) {
      if ($null -ne $process -and -not $process.HasExited) {
        $process.Kill($true)
        $process.WaitForExit()
      }
    }
  }
}

function Invoke-ConcurrentResidualSales {
  $gateApplication = 'flipbase-residual-gate'
  $workerApplications = @('flipbase-residual-sale-a', 'flipbase-residual-sale-b')
  $gateSession = $null
  $workers = @()
  try {
    $workerFiles = @()
    for ($position = 0; $position -lt $workerApplications.Count; $position++) {
      $workerFile = Join-Path $resolvedTempDirectory "residual-sale-$position.sql"
      $workerOutput = Join-Path $resolvedTempDirectory "residual-sale-$position.out"
      $workerError = Join-Path $resolvedTempDirectory "residual-sale-$position.err"
      $externalOrderId = "task4-r3-residual-$position"
      @"
\set VERBOSITY verbose
set application_name = '$($workerApplications[$position])';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$userId';
select public.record_sale(
  '$workspaceId',
  '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"$externalOrderId"}'::jsonb,
  '[{"catalog_product_id":"$productCId","quantity":1,"unit_sale_price":10}]'::jsonb
);
commit;
"@ | Set-Content -LiteralPath $workerFile -Encoding utf8
      $workerFiles += @{
        Input = $workerFile
        Output = $workerOutput
        Error = $workerError
      }
    }

    $gateSession = Start-InteractiveSession
    $gateSession.StandardInput.WriteLine("set application_name = '$gateApplication'; begin; select id from public.purchases where id = '$purchaseCId' for update;")
    $gateSession.StandardInput.Flush()
    Wait-ForScalar -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = '$gateApplication' and state = 'idle in transaction'" -Expected '1' -Description 'die bestätigte Purchase-Sperre vor zwei Rest-Cent-Verkäufen'

    foreach ($workerFile in $workerFiles) {
      $workers += Invoke-PsqlFile -InputFile $workerFile.Input -OutputFile $workerFile.Output -ErrorFile $workerFile.Error -AsProcess
    }
    Wait-ForScalar -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name in ('flipbase-residual-sale-a', 'flipbase-residual-sale-b') and wait_event_type = 'Lock'" -Expected '2' -Description 'beide gleichzeitig am Einkauf wartenden Rest-Cent-Verkäufe'

    $gateSession.StandardInput.WriteLine('commit; \q')
    $gateSession.StandardInput.Close()
    Wait-ForProcess -Process $gateSession -Description 'Freigabe des Rest-Cent-Einkaufs'
    foreach ($worker in $workers) {
      Wait-ForProcess -Process $worker -Description 'parallelen Rest-Cent-Verkauf'
    }

    for ($position = 0; $position -lt $workers.Count; $position++) {
      if ($workers[$position].ExitCode -ne 0) {
        $workerFailure = Get-Content -Raw -LiteralPath $workerFiles[$position].Error
        throw "Ein paralleler Rest-Cent-Verkauf ist fehlgeschlagen. Ausgabe: $workerFailure"
      }
    }

    $verification = Invoke-PsqlScalar -Sql "select (select count(*) from public.sales where workspace_id = '$workspaceId' and external_order_id in ('task4-r3-residual-0', 'task4-r3-residual-1'))::text || ':' || (select remaining_quantity from public.stock_lots where purchase_id = '$purchaseCId')::text || ':' || (select sum(active_allocated_cost) from public.sale_line_lot_allocations as allocation join public.stock_lots as lot on lot.id = allocation.stock_lot_id where lot.purchase_id = '$purchaseCId')::text || ':' || (select min(sale_line.cost_of_goods_sold) from public.sale_lines as sale_line join public.sales as sale on sale.id = sale_line.sale_id where sale.external_order_id in ('task4-r3-residual-0', 'task4-r3-residual-1'))::text || ':' || (select max(sale_line.cost_of_goods_sold) from public.sale_lines as sale_line join public.sales as sale on sale.id = sale_line.sale_id where sale.external_order_id in ('task4-r3-residual-0', 'task4-r3-residual-1'))::text || ':' || (select count(distinct allocation.consumption_sequence) from public.sale_line_lot_allocations as allocation join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id join public.sales as sale on sale.id = sale_line.sale_id where sale.external_order_id in ('task4-r3-residual-0', 'task4-r3-residual-1'))::text || ':' || (select min(allocation.consumption_sequence) from public.sale_line_lot_allocations as allocation join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id join public.sales as sale on sale.id = sale_line.sale_id where sale.external_order_id in ('task4-r3-residual-0', 'task4-r3-residual-1'))::text || ':' || (select max(allocation.consumption_sequence) from public.sale_line_lot_allocations as allocation join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id join public.sales as sale on sale.id = sale_line.sale_id where sale.external_order_id in ('task4-r3-residual-0', 'task4-r3-residual-1'))::text"
    if ($verification -ne '2:1:0.03:0.01:0.02:2:2:3') {
      throw "Parallele Rest-Cent-Verkäufe reconcilierten nicht exakt. Erwartet: 2:1:0.03:0.01:0.02:2:2:3, erhalten: $verification"
    }

    Write-Host 'Parallele Rest-Cent-Verkäufe grün: zwei bestätigte Lock-Waits, COGS 0,02/0,01, Rest 0,01 und eindeutige Sequenzen.'
  }
  finally {
    foreach ($process in @($workers + @($gateSession))) {
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
  '$userId', 'authenticated', 'authenticated', 'correction-return-race@example.test',
  'not-used-by-this-test', '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.profiles (id, email)
values ('$userId', 'correction-return-race@example.test')
on conflict (id) do nothing;
insert into public.workspaces (id, name) values ('$workspaceId', 'Correction return race');
insert into public.workspace_members (workspace_id, user_id, role)
values ('$workspaceId', '$userId', 'owner');
insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
  ('$productAId', '$workspaceId', 'Correction first', 'quantity'),
  ('$productBId', '$workspaceId', 'Return first', 'quantity'),
  ('$productCId', '$workspaceId', 'Concurrent residual sales', 'quantity');
insert into public.purchases (id, workspace_id, type, title, purchase_price) values
  ('$purchaseAId', '$workspaceId', 'mystery_pack', 'Correction first', 0.03),
  ('$purchaseBId', '$workspaceId', 'mystery_pack', 'Return first', 0.03),
  ('$purchaseCId', '$workspaceId', 'mystery_pack', 'Concurrent residual sales', 0.03);
insert into public.purchase_lines (
  id, workspace_id, purchase_id, catalog_product_id, title_snapshot,
  line_kind, ordered_quantity, received_quantity, price_mode,
  unit_purchase_price, line_total
) values
  ('$lineAId', '$workspaceId', '$purchaseAId', '$productAId', 'Concurrent correction', 'quantity', 3, 0, 'unpriced_mystery', null, null),
  ('$lineBId', '$workspaceId', '$purchaseBId', '$productBId', 'Concurrent correction', 'quantity', 3, 0, 'unpriced_mystery', null, null),
  ('$lineCId', '$workspaceId', '$purchaseCId', '$productCId', 'Concurrent residual sales', 'quantity', 3, 0, 'unpriced_mystery', null, null);
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$userId';
select public.finalize_purchase_costing('$workspaceId', '$purchaseAId');
select public.finalize_purchase_costing('$workspaceId', '$purchaseBId');
select public.finalize_purchase_costing('$workspaceId', '$purchaseCId');
select public.record_sale(
  '$workspaceId',
  '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-race-a"}'::jsonb,
  '[{"catalog_product_id":"$productAId","quantity":1,"unit_sale_price":10}]'::jsonb
);
select public.record_sale(
  '$workspaceId',
  '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-race-b"}'::jsonb,
  '[{"catalog_product_id":"$productBId","quantity":1,"unit_sale_price":10}]'::jsonb
);
select public.record_sale(
  '$workspaceId',
  '{"platform":"direct","sale_date":"2026-08-31","external_order_id":"task4-r3-residual-history"}'::jsonb,
  '[{"catalog_product_id":"$productCId","quantity":1,"unit_sale_price":10}]'::jsonb
);
select public.record_sale_return(
  '$workspaceId',
  (select id from public.sales where workspace_id = '$workspaceId' and external_order_id = 'task4-r3-residual-history'),
  10, true, 'history return', 'fully restocked', 'restock_ready', 'Concurrency test'
);
select public.correct_purchase_costing(
  '$workspaceId',
  '$purchaseCId',
  'prepare concurrent residual cents',
  0.04,
  '[{"id":"$lineCId","catalog_product_id":"$productCId","title_snapshot":"Concurrent residual sales","line_kind":"quantity","ordered_quantity":3,"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null,"condition_snapshot":null,"estimated_market_value":null}]'::jsonb,
  '[]'::jsonb
);
commit;
"@ | Set-Content -LiteralPath $setupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $setupFile -OutputFile $setupOutput -ErrorFile $setupError

  Invoke-CorrectionFirstRace
  Invoke-ReturnFirstRace
  Invoke-ConcurrentResidualSales

  Write-Host 'Purchase-costing-Concurrency-Harness grün: beide Correction/Return-Reihenfolgen und parallele Rest-Cent-Verkäufe serialisieren exakt.'
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
