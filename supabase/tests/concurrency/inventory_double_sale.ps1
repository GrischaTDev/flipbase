$ErrorActionPreference = 'Stop'

$worktreePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$containerNames = @(
  docker ps --filter "label=com.supabase.cli.workdir=$worktreePath" --filter 'name=supabase_db_' --format '{{.Names}}'
)
if ($containerNames.Count -ne 1) {
  throw "Erwartet wurde genau ein laufender lokaler Supabase-Datenbankcontainer für $worktreePath. Gefunden: $($containerNames.Count)"
}

$containerName = $containerNames[0]
$workspaceId = '83000000-0000-4000-8000-000000000001'
$itemId = '83000000-0000-4000-8000-000000000002'
$firstSaleId = '83000000-0000-4000-8000-000000000003'
$secondSaleId = '83000000-0000-4000-8000-000000000004'
$lockKey = 83000000
$barrierTimeoutSeconds = 10
$workerTimeoutSeconds = 15
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "flipbase-inventory-concurrency-$([guid]::NewGuid())"

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

function Start-InteractiveBarrier {
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
    throw 'Die Barriere-Session konnte nicht gestartet werden.'
  }
  return $process
}

function Invoke-TestCleanup {
  $cleanupFile = Join-Path $resolvedTempDirectory 'cleanup.sql'
  $cleanupOutput = Join-Path $resolvedTempDirectory 'cleanup.out'
  $cleanupError = Join-Path $resolvedTempDirectory 'cleanup.err'
  @"
begin;
select set_config('flipbase.allow_inventory_sold_transition', 'on', true);
update public.inventory_items set status = 'ready' where workspace_id = '$workspaceId' and status = 'sold';
delete from public.sale_line_lot_allocations where workspace_id = '$workspaceId';
delete from public.stock_movements where workspace_id = '$workspaceId';
delete from public.returns where workspace_id = '$workspaceId';
delete from public.invoice_items where invoice_id in (select id from public.invoices where workspace_id = '$workspaceId');
delete from public.invoices where workspace_id = '$workspaceId';
delete from public.shipping_orders where workspace_id = '$workspaceId';
delete from public.sale_lines where workspace_id = '$workspaceId';
delete from public.sales where workspace_id = '$workspaceId';
delete from public.inventory_items where workspace_id = '$workspaceId';
delete from public.workspace_members where workspace_id = '$workspaceId';
delete from public.workspaces where id = '$workspaceId';
commit;
"@ | Set-Content -LiteralPath $cleanupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $cleanupFile -OutputFile $cleanupOutput -ErrorFile $cleanupError
}

$barrier = $null
$first = $null
$second = $null

try {
  Invoke-TestCleanup

  $setupFile = Join-Path $resolvedTempDirectory 'setup.sql'
  $setupOutput = Join-Path $resolvedTempDirectory 'setup.out'
  $setupError = Join-Path $resolvedTempDirectory 'setup.err'
  @"
insert into public.workspaces (id, name) values ('$workspaceId', 'inventory concurrency test');
insert into public.inventory_items (id, workspace_id, title, status)
values ('$itemId', '$workspaceId', 'Concurrent item', 'ready');
"@ | Set-Content -LiteralPath $setupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $setupFile -OutputFile $setupOutput -ErrorFile $setupError

  function Write-WorkerSql {
    param([string] $Path, [string] $SaleId)
    @"
\set VERBOSITY verbose
begin;
select pg_advisory_xact_lock_shared($lockKey);
select set_config('flipbase.allow_inventory_sold_transition', 'on', true);
update public.inventory_items set status = 'sold' where id = '$itemId';
insert into public.sales (id, workspace_id, platform, sale_price, sale_price_total, sale_date)
values ('$SaleId', '$workspaceId', 'direct', 10, 10, current_date);
insert into public.sale_lines (workspace_id, sale_id, inventory_item_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode)
values ('$workspaceId', '$SaleId', '$itemId', 'Concurrent item', 1, 10, 10, 4, 'diff_25a');
set constraints all immediate;
commit;
"@ | Set-Content -LiteralPath $Path -Encoding utf8
  }

  $firstFile = Join-Path $resolvedTempDirectory 'first.sql'
  $secondFile = Join-Path $resolvedTempDirectory 'second.sql'
  $firstOutput = Join-Path $resolvedTempDirectory 'first.out'
  $secondOutput = Join-Path $resolvedTempDirectory 'second.out'
  $firstError = Join-Path $resolvedTempDirectory 'first.err'
  $secondError = Join-Path $resolvedTempDirectory 'second.err'
  Write-WorkerSql -Path $firstFile -SaleId $firstSaleId
  Write-WorkerSql -Path $secondFile -SaleId $secondSaleId

  $barrier = Start-InteractiveBarrier
  $barrier.StandardInput.WriteLine("select pg_advisory_lock($lockKey);")
  $barrier.StandardInput.Flush()
  Wait-ForScalar -Sql "select count(*) from pg_locks where locktype = 'advisory' and objid = $lockKey and mode = 'ExclusiveLock' and granted" -Expected '1' -Description 'die bestätigte exklusive Barriere'

  $first = Invoke-PsqlFile -InputFile $firstFile -OutputFile $firstOutput -ErrorFile $firstError -AsProcess
  $second = Invoke-PsqlFile -InputFile $secondFile -OutputFile $secondOutput -ErrorFile $secondError -AsProcess
  Wait-ForScalar -Sql "select count(*) from pg_locks where locktype = 'advisory' and objid = $lockKey and mode = 'ShareLock' and not granted" -Expected '2' -Description 'zwei gleichzeitig wartende Worker'

  $barrier.StandardInput.WriteLine("select pg_advisory_unlock($lockKey);")
  $barrier.StandardInput.WriteLine('\q')
  $barrier.StandardInput.Close()

  Wait-ForProcess -Process $barrier -Description 'das Freigeben der Barriere'
  if ($barrier.ExitCode -ne 0) {
    throw "Die Barriere-Session ist fehlgeschlagen: $($barrier.StandardError.ReadToEnd())"
  }
  Wait-ForProcess -Process $first -Description 'Worker 1'
  Wait-ForProcess -Process $second -Description 'Worker 2'

  $workerExitCodes = @($first.ExitCode, $second.ExitCode)
  $successfulCommits = @($workerExitCodes | Where-Object { $_ -eq 0 }).Count
  if ($successfulCommits -ne 1) {
    throw "Erwartet wurde genau ein erfolgreicher Commit, tatsächlich: $successfulCommits. Exit-Codes: $($first.ExitCode), $($second.ExitCode)"
  }

  $loserErrorFile = if ($first.ExitCode -ne 0) { $firstError } else { $secondError }
  $loserError = Get-Content -Raw -LiteralPath $loserErrorFile
  $expectedIntegrityError = 'ERROR:\s+23514:\s+Ein Einzelstueck darf nur einen bestandswirksamen Verkauf haben\.'
  if ($loserError -notmatch $expectedIntegrityError) {
    throw "Der Verlierer lieferte nicht den erwarteten Integritätsfehler 23514. Ausgabe: $loserError"
  }

  $verification = Invoke-PsqlScalar -Sql "select active_sale_count::text || ':' || coalesce(active_sale_id::text, '') from public.inventory_item_sale_states where inventory_item_id = '$itemId'"
  if ($verification -notmatch "^1:($firstSaleId|$secondSaleId)$") {
    throw "Erwartet wurde genau eine bestandswirksame Verkaufs-ID. Ausgabe: $verification"
  }

  Write-Host 'Concurrency-Harness grün: zwei wartende Sessions bestätigt; Verlierer 23514; genau eine bestandswirksame Verkaufs-ID.'
}
finally {
  foreach ($process in @($first, $second, $barrier)) {
    if ($null -ne $process -and -not $process.HasExited) {
      $process.Kill($true)
      $process.WaitForExit()
    }
  }

  try {
    Invoke-TestCleanup
  }
  finally {
    if (Test-Path -LiteralPath $resolvedTempDirectory) {
      Remove-Item -LiteralPath $resolvedTempDirectory -Recurse -Force
    }
  }
}
