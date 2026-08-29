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
$itemAId = '83000000-0000-4000-8000-000000000002'
$itemBId = '83000000-0000-4000-8000-000000000003'
$userId = '83000000-0000-4000-8000-000000000004'
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
delete from auth.users where id = '$userId';
commit;
"@ | Set-Content -LiteralPath $cleanupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $cleanupFile -OutputFile $cleanupOutput -ErrorFile $cleanupError
}

$gateA = $null
$gateB = $null
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
  '$userId', 'authenticated', 'authenticated', 'inventory-concurrency@example.test',
  'not-used-by-this-test', '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.profiles (id, email)
values ('$userId', 'inventory-concurrency@example.test')
on conflict (id) do nothing;
insert into public.workspaces (id, name) values ('$workspaceId', 'inventory concurrency test');
insert into public.workspace_members (workspace_id, user_id, role)
values ('$workspaceId', '$userId', 'owner');
insert into public.inventory_items (id, workspace_id, title, status)
values
  ('$itemAId', '$workspaceId', 'Concurrent item A', 'ready'),
  ('$itemBId', '$workspaceId', 'Concurrent item B', 'ready');
"@ | Set-Content -LiteralPath $setupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $setupFile -OutputFile $setupOutput -ErrorFile $setupError

  function Write-WorkerSql {
    param(
      [Parameter(Mandatory)] [string] $Path,
      [Parameter(Mandatory)] [string] $ApplicationName,
      [Parameter(Mandatory)] [string] $OrderNumber,
      [Parameter(Mandatory)] [string] $FirstItemId,
      [Parameter(Mandatory)] [string] $SecondItemId
    )
    @"
\set VERBOSITY verbose
set application_name = '$ApplicationName';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$userId';
select public.record_sale(
  '$workspaceId',
  '{"platform":"direct","sale_date":"2026-08-29","external_order_id":"$OrderNumber"}'::jsonb,
  '[{"inventory_item_id":"$FirstItemId","quantity":1,"unit_sale_price":10},{"inventory_item_id":"$SecondItemId","quantity":1,"unit_sale_price":20}]'::jsonb
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
  Write-WorkerSql -Path $firstFile -ApplicationName 'flipbase-rpc-worker-a' -OrderNumber 'RPC-A-B' -FirstItemId $itemAId -SecondItemId $itemBId
  Write-WorkerSql -Path $secondFile -ApplicationName 'flipbase-rpc-worker-b' -OrderNumber 'RPC-B-A' -FirstItemId $itemBId -SecondItemId $itemAId

  $gateA = Start-InteractiveSession
  $gateA.StandardInput.WriteLine("set application_name = 'flipbase-gate-a'; begin; select id from public.inventory_items where id = '$itemAId' for update;")
  $gateA.StandardInput.Flush()
  $gateB = Start-InteractiveSession
  $gateB.StandardInput.WriteLine("set application_name = 'flipbase-gate-b'; begin; select id from public.inventory_items where id = '$itemBId' for update;")
  $gateB.StandardInput.Flush()
  Wait-ForScalar -Sql "select count(*) from pg_stat_activity where application_name in ('flipbase-gate-a', 'flipbase-gate-b') and state = 'idle in transaction'" -Expected '2' -Description 'beide bestätigten Zeilensperren'

  $first = Invoke-PsqlFile -InputFile $firstFile -OutputFile $firstOutput -ErrorFile $firstError -AsProcess
  $second = Invoke-PsqlFile -InputFile $secondFile -OutputFile $secondOutput -ErrorFile $secondError -AsProcess
  Wait-ForScalar -Sql "select count(*) from pg_stat_activity where application_name in ('flipbase-rpc-worker-a', 'flipbase-rpc-worker-b') and wait_event_type = 'Lock'" -Expected '2' -Description 'beide auf ihrer ersten Artikelsperre wartenden RPCs'

  $gateA.StandardInput.WriteLine('commit; \q')
  $gateA.StandardInput.Close()
  Wait-ForProcess -Process $gateA -Description 'Freigabe von Artikel A'
  Wait-ForScalar -Sql "select count(*) from pg_stat_activity where application_name in ('flipbase-rpc-worker-a', 'flipbase-rpc-worker-b') and wait_event_type = 'Lock'" -Expected '2' -Description 'die geordnete zweite Sperrphase'

  $gateB.StandardInput.WriteLine('commit; \q')
  $gateB.StandardInput.Close()
  Wait-ForProcess -Process $gateB -Description 'Freigabe von Artikel B'
  Wait-ForProcess -Process $first -Description 'RPC-Worker A'
  Wait-ForProcess -Process $second -Description 'RPC-Worker B'

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
  if ($loserError -notmatch 'ERROR:\s+22023:\s+Der Einzelartikel ist nicht verkaufbar\.') {
    throw "Der Verlierer lieferte nicht den erwarteten Fachfehler 22023. Ausgabe: $loserError"
  }

  $verification = Invoke-PsqlScalar -Sql "select (select count(*) from public.sales where workspace_id = '$workspaceId' and external_order_id in ('RPC-A-B', 'RPC-B-A'))::text || ':' || (select count(*) from public.sale_lines where workspace_id = '$workspaceId' and inventory_item_id in ('$itemAId', '$itemBId'))::text || ':' || (select count(*) from public.inventory_item_sale_states where inventory_item_id in ('$itemAId', '$itemBId') and sale_state = 'sold')::text || ':' || (select count(distinct active_sale_id) from public.inventory_item_sale_states where inventory_item_id in ('$itemAId', '$itemBId'))::text"
  if ($verification -ne '1:2:2:1') {
    throw "Der RPC-Verkauf war nicht atomar. Erwartet: 1:2:2:1, erhalten: $verification"
  }

  Write-Host 'RPC-Concurrency-Harness grün: invertierte Positionen, kein 40P01, genau ein atomarer Verkauf und ein Fachfehler 22023.'
}
finally {
  foreach ($process in @($first, $second, $gateA, $gateB)) {
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
