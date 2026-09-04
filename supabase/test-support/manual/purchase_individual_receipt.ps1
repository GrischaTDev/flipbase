$ErrorActionPreference = 'Stop'

$worktreePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$containerNames = @(
  docker ps --filter "label=com.supabase.cli.workdir=$worktreePath" --filter 'name=supabase_db_' --format '{{.Names}}'
)
if ($containerNames.Count -ne 1) {
  throw "Erwartet wurde genau ein laufender lokaler Supabase-Datenbankcontainer für $worktreePath. Gefunden: $($containerNames.Count)"
}

$containerName = $containerNames[0]
$workspaceId = '9d000000-0000-4000-8000-000000000011'
$purchaseId = '9d000000-0000-4000-8000-000000000101'
$purchaseLineId = '9d000000-0000-4000-8000-000000000301'
$userId = '9d000000-0000-4000-8000-000000000001'
$barrierTimeoutSeconds = 10
$workerTimeoutSeconds = 20
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "flipbase-individual-receipt-$([guid]::NewGuid())"

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
    throw 'Die Sperrsession konnte nicht gestartet werden.'
  }
  return $process
}

function Invoke-TestCleanup {
  $cleanupFile = Join-Path $resolvedTempDirectory 'cleanup.sql'
  $cleanupOutput = Join-Path $resolvedTempDirectory 'cleanup.out'
  $cleanupError = Join-Path $resolvedTempDirectory 'cleanup.err'
  @"
begin;
delete from public.inventory_items where workspace_id = '$workspaceId';
delete from public.purchase_lines where workspace_id = '$workspaceId';
delete from public.purchases where workspace_id = '$workspaceId';
delete from public.workspace_members where workspace_id = '$workspaceId';
delete from public.workspaces where id = '$workspaceId';
delete from auth.users where id = '$userId';
commit;
"@ | Set-Content -LiteralPath $cleanupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $cleanupFile -OutputFile $cleanupOutput -ErrorFile $cleanupError
}

$gate = $null
$first = $null
$second = $null

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
  '$userId', 'authenticated', 'authenticated', 'individual-receipt-concurrency@example.test',
  'unused', '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.workspaces (id, name) values ('$workspaceId', 'individual receipt concurrency');
insert into public.workspace_members (workspace_id, user_id, role)
values ('$workspaceId', '$userId', 'owner');
insert into public.purchases (
  id, workspace_id, type, title, purchase_date, purchase_price,
  cost_allocation_mode, entry_status
) values (
  '$purchaseId', '$workspaceId', 'mystery_pack', 'Concurrent individual receipt',
  '2026-09-01', 20, 'even', 'draft'
);
insert into public.purchase_lines (
  id, workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, received_quantity, price_mode, unit_purchase_price,
  line_total, condition_snapshot
) values (
  '$purchaseLineId', '$workspaceId', '$purchaseId', 'Concurrent shoes',
  'individual', 2, 0, 'unpriced_mystery', null, null, 'very_good'
);
"@ | Set-Content -LiteralPath $setupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $setupFile -OutputFile $setupOutput -ErrorFile $setupError

  function Write-WorkerSql {
    param(
      [Parameter(Mandatory)] [string] $Path,
      [Parameter(Mandatory)] [string] $ApplicationName,
      [Parameter(Mandatory)] [string] $ItemTitle
    )
    @"
\set VERBOSITY verbose
set application_name = '$ApplicationName';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$userId';
select public.receive_individual_purchase_line(
  '$workspaceId',
  '$purchaseId',
  '$purchaseLineId',
  jsonb_build_object('title', '$ItemTitle', 'condition', 'defective')
);
commit;
"@ | Set-Content -LiteralPath $Path -Encoding utf8
  }

  $firstFile = Join-Path $resolvedTempDirectory 'first.sql'
  $secondFile = Join-Path $resolvedTempDirectory 'second.sql'
  $firstOutput = Join-Path $resolvedTempDirectory 'first.out'
  $secondOutput = Join-Path $resolvedTempDirectory 'second.out'
  $firstError = Join-Path $resolvedTempDirectory 'first.err'
  $secondError = Join-Path $resolvedTempDirectory 'second.err'
  Write-WorkerSql -Path $firstFile -ApplicationName 'flipbase-individual-receipt-worker-a' -ItemTitle 'Parallel item A'
  Write-WorkerSql -Path $secondFile -ApplicationName 'flipbase-individual-receipt-worker-b' -ItemTitle 'Parallel item B'

  $gate = Start-InteractiveSession
  $gate.StandardInput.WriteLine("set application_name = 'flipbase-individual-receipt-gate'; begin; select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('$purchaseId', 0));")
  $gate.StandardInput.Flush()
  Wait-ForScalar -Sql "select count(*) from pg_stat_activity where application_name = 'flipbase-individual-receipt-gate' and state = 'idle in transaction'" -Expected '1' -Description 'die bestätigte Einkaufssperre'

  $first = Invoke-PsqlFile -InputFile $firstFile -OutputFile $firstOutput -ErrorFile $firstError -AsProcess
  $second = Invoke-PsqlFile -InputFile $secondFile -OutputFile $secondOutput -ErrorFile $secondError -AsProcess
  Wait-ForScalar -Sql "select count(*) from pg_stat_activity where application_name in ('flipbase-individual-receipt-worker-a', 'flipbase-individual-receipt-worker-b') and wait_event_type = 'Lock'" -Expected '2' -Description 'beide wartenden Wareneingangs-RPCs'

  $gate.StandardInput.WriteLine('commit; \q')
  $gate.StandardInput.Close()
  Wait-ForProcess -Process $gate -Description 'Freigabe der Einkaufssperre'
  Wait-ForProcess -Process $first -Description 'Wareneingang Worker A'
  Wait-ForProcess -Process $second -Description 'Wareneingang Worker B'

  if ($first.ExitCode -ne 0 -or $second.ExitCode -ne 0) {
    $firstFailure = Get-Content -Raw -LiteralPath $firstError
    $secondFailure = Get-Content -Raw -LiteralPath $secondError
    throw "Beide Aufrufe müssen innerhalb der Menge 2 committen. Exit-Codes: $($first.ExitCode), $($second.ExitCode). A: $firstFailure B: $secondFailure"
  }

  $verification = Invoke-PsqlScalar -Sql "select line.received_quantity::text || ':' || count(item.id)::text || ':' || count(distinct item.id)::text || ':' || coalesce(min(item.condition), '') || ':' || coalesce(max(item.allocated_purchase_cost), -1)::text from public.purchase_lines as line left join public.inventory_items as item on item.purchase_line_id = line.id where line.id = '$purchaseLineId' group by line.received_quantity"
  if ($verification -ne '2:2:2:very_good:0') {
    throw "Paralleler Einzel-Wareneingang war nicht atomar oder übernahm Clientzustand/-kosten. Erwartet 2:2:2:very_good:0, erhalten: $verification"
  }

  Write-Host 'Einzel-Wareneingangs-Concurrency-Harness grün: zwei Commits, exakt zwei eindeutige Artikel, Snapshot-Zustand und 0 Euro Draft-Kosten.'
}
finally {
  foreach ($process in @($first, $second, $gate)) {
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
