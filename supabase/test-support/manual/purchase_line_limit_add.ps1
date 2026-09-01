$ErrorActionPreference = 'Stop'

$worktreePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$containerNames = @(
  docker ps --filter "label=com.supabase.cli.workdir=$worktreePath" --filter 'name=supabase_db_' --format '{{.Names}}'
)
if ($containerNames.Count -ne 1) {
  throw "Erwartet wurde genau ein laufender lokaler Supabase-Datenbankcontainer für $worktreePath. Gefunden: $($containerNames.Count)"
}

$containerName = $containerNames[0]
$workspaceId = '9b000000-0000-4000-8000-000000000011'
$purchaseId = '9b000000-0000-4000-8000-000000000101'
$userId = '9b000000-0000-4000-8000-000000000001'
$barrierTimeoutSeconds = 10
$workerTimeoutSeconds = 20
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "flipbase-purchase-line-limit-$([guid]::NewGuid())"

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
  '$userId', 'authenticated', 'authenticated', 'purchase-line-concurrency@example.test',
  'unused', '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.workspaces (id, name) values ('$workspaceId', 'purchase line concurrency test');
insert into public.workspace_members (workspace_id, user_id, role)
values ('$workspaceId', '$userId', 'owner');
insert into public.purchases (id, workspace_id, type, title)
values ('$purchaseId', '$workspaceId', 'single', 'Concurrent 1.000 line boundary');
insert into public.purchase_lines (
  workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, price_mode, unit_purchase_price, line_total
)
select
  '$workspaceId', '$purchaseId', format('Existing line %s', number),
  'individual', 1, 'priced', 0.01, 0.01
from generate_series(1, 999) as number;
"@ | Set-Content -LiteralPath $setupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $setupFile -OutputFile $setupOutput -ErrorFile $setupError

  function Write-WorkerSql {
    param(
      [Parameter(Mandatory)] [string] $Path,
      [Parameter(Mandatory)] [string] $ApplicationName,
      [Parameter(Mandatory)] [string] $LineTitle
    )
    @"
\set VERBOSITY verbose
set application_name = '$ApplicationName';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$userId';
select public.add_purchase_lines(
  '$workspaceId',
  '$purchaseId',
  '[{"title_snapshot":"$LineTitle","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":0.01,"line_total":0.01}]'::jsonb
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
  Write-WorkerSql -Path $firstFile -ApplicationName 'flipbase-line-limit-worker-a' -LineTitle 'Concurrent line A'
  Write-WorkerSql -Path $secondFile -ApplicationName 'flipbase-line-limit-worker-b' -LineTitle 'Concurrent line B'

  $gate = Start-InteractiveSession
  $gate.StandardInput.WriteLine("set application_name = 'flipbase-line-limit-gate'; begin; select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('$purchaseId', 0));")
  $gate.StandardInput.Flush()
  Wait-ForScalar -Sql "select count(*) from pg_stat_activity where application_name = 'flipbase-line-limit-gate' and state = 'idle in transaction'" -Expected '1' -Description 'die bestätigte Einkaufssperre'

  $first = Invoke-PsqlFile -InputFile $firstFile -OutputFile $firstOutput -ErrorFile $firstError -AsProcess
  $second = Invoke-PsqlFile -InputFile $secondFile -OutputFile $secondOutput -ErrorFile $secondError -AsProcess
  Wait-ForScalar -Sql "select count(*) from pg_stat_activity where application_name in ('flipbase-line-limit-worker-a', 'flipbase-line-limit-worker-b') and wait_event_type = 'Lock'" -Expected '2' -Description 'beide auf die Einkaufsgrenze wartenden RPCs'

  $gate.StandardInput.WriteLine('commit; \q')
  $gate.StandardInput.Close()
  Wait-ForProcess -Process $gate -Description 'Freigabe der Einkaufssperre'
  Wait-ForProcess -Process $first -Description 'add_purchase_lines Worker A'
  Wait-ForProcess -Process $second -Description 'add_purchase_lines Worker B'

  $workerExitCodes = @($first.ExitCode, $second.ExitCode)
  $successfulCommits = @($workerExitCodes | Where-Object { $_ -eq 0 }).Count
  if ($successfulCommits -ne 1) {
    throw "Erwartet wurde genau ein erfolgreicher RPC-Commit, tatsächlich: $successfulCommits. Exit-Codes: $($first.ExitCode), $($second.ExitCode)"
  }

  $loserErrorFile = if ($first.ExitCode -ne 0) { $firstError } else { $secondError }
  $loserError = Get-Content -Raw -LiteralPath $loserErrorFile
  if ($loserError -match '40P01|deadlock detected') {
    throw "Der Verlierer endete mit einem Deadlock statt einem Fachfehler. Ausgabe: $loserError"
  }
  if ($loserError -notmatch 'ERROR:\s+22023:\s+Ein Einkauf ist auf 1\.000 Positionen begrenzt\.') {
    throw "Der Verlierer lieferte nicht den erwarteten Fachfehler 22023. Ausgabe: $loserError"
  }

  $verification = Invoke-PsqlScalar -Sql "select count(*)::text || ':' || coalesce(sum(ordered_quantity), 0)::text from public.purchase_lines where workspace_id = '$workspaceId' and purchase_id = '$purchaseId'"
  if ($verification -ne '1000:1000') {
    throw "Die parallelen Ergänzungen überschritten die Fachgrenze oder waren nicht atomar. Erwartet: 1000:1000, erhalten: $verification"
  }

  Write-Host 'Positionsgrenzen-Concurrency-Harness grün: ein Commit, ein klarer 22023-Fachfehler, kein 40P01 und exakt 1.000 Positionen/Einheiten.'
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
