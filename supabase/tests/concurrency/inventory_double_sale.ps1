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

  $arguments = @('exec', '-i', $containerName, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres')
  if ($AsProcess) {
    return Start-Process -FilePath 'docker' -ArgumentList $arguments -RedirectStandardInput $InputFile -RedirectStandardOutput $OutputFile -RedirectStandardError $ErrorFile -WindowStyle Hidden -PassThru
  }

  $process = Start-Process -FilePath 'docker' -ArgumentList $arguments -RedirectStandardInput $InputFile -RedirectStandardOutput $OutputFile -RedirectStandardError $ErrorFile -WindowStyle Hidden -PassThru -Wait
  if ($process.ExitCode -ne 0) {
    throw (Get-Content -Raw -LiteralPath $ErrorFile)
  }
}

try {
  $setupFile = Join-Path $resolvedTempDirectory 'setup.sql'
  $setupOutput = Join-Path $resolvedTempDirectory 'setup.out'
  $setupError = Join-Path $resolvedTempDirectory 'setup.err'
  @"
delete from public.workspaces where id = '$workspaceId';
insert into public.workspaces (id, name) values ('$workspaceId', 'inventory concurrency test');
insert into public.inventory_items (id, workspace_id, title, status)
values ('$itemId', '$workspaceId', 'Concurrent item', 'ready');
"@ | Set-Content -LiteralPath $setupFile -Encoding utf8
  Invoke-PsqlFile -InputFile $setupFile -OutputFile $setupOutput -ErrorFile $setupError

  $barrierFile = Join-Path $resolvedTempDirectory 'barrier.sql'
  $barrierOutput = Join-Path $resolvedTempDirectory 'barrier.out'
  $barrierError = Join-Path $resolvedTempDirectory 'barrier.err'
  @"
select pg_advisory_lock($lockKey);
select pg_sleep(4);
select pg_advisory_unlock($lockKey);
"@ | Set-Content -LiteralPath $barrierFile -Encoding utf8

  function Write-WorkerSql {
    param([string] $Path, [string] $SaleId)
    @"
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
  Write-WorkerSql -Path $firstFile -SaleId $firstSaleId
  Write-WorkerSql -Path $secondFile -SaleId $secondSaleId

  $barrier = Invoke-PsqlFile -InputFile $barrierFile -OutputFile $barrierOutput -ErrorFile $barrierError -AsProcess
  Start-Sleep -Milliseconds 500
  $first = Invoke-PsqlFile -InputFile $firstFile -OutputFile (Join-Path $resolvedTempDirectory 'first.out') -ErrorFile (Join-Path $resolvedTempDirectory 'first.err') -AsProcess
  $second = Invoke-PsqlFile -InputFile $secondFile -OutputFile (Join-Path $resolvedTempDirectory 'second.out') -ErrorFile (Join-Path $resolvedTempDirectory 'second.err') -AsProcess

  $first.WaitForExit()
  $second.WaitForExit()
  $barrier.WaitForExit()

  $successfulCommits = @($first.ExitCode, $second.ExitCode | Where-Object { $_ -eq 0 }).Count
  if ($successfulCommits -ne 1) {
    throw "Erwartet wurde genau ein erfolgreicher Commit, tatsächlich: $successfulCommits. Exit-Codes: $($first.ExitCode), $($second.ExitCode)"
  }

  $verifyFile = Join-Path $resolvedTempDirectory 'verify.sql'
  $verifyOutput = Join-Path $resolvedTempDirectory 'verify.out'
  $verifyError = Join-Path $resolvedTempDirectory 'verify.err'
  @"
select active_sale_count::text || ':' || coalesce(active_sale_id::text, '')
from public.inventory_item_sale_states
where inventory_item_id = '$itemId';
"@ | Set-Content -LiteralPath $verifyFile -Encoding utf8
  Invoke-PsqlFile -InputFile $verifyFile -OutputFile $verifyOutput -ErrorFile $verifyError
  $verification = Get-Content -Raw -LiteralPath $verifyOutput
  if ($verification -notmatch "1:($firstSaleId|$secondSaleId)") {
    throw "Erwartet wurde genau eine bestandswirksame Verkaufs-ID. Ausgabe: $verification"
  }

  Write-Host 'Concurrency-Harness grün: genau ein Commit und eine bestandswirksame Verkaufs-ID.'
}
finally {
  $cleanupFile = Join-Path $resolvedTempDirectory 'cleanup.sql'
  $cleanupOutput = Join-Path $resolvedTempDirectory 'cleanup.out'
  $cleanupError = Join-Path $resolvedTempDirectory 'cleanup.err'
  "delete from public.workspaces where id = '$workspaceId';" | Set-Content -LiteralPath $cleanupFile -Encoding utf8
  try {
    Invoke-PsqlFile -InputFile $cleanupFile -OutputFile $cleanupOutput -ErrorFile $cleanupError
  }
  finally {
    if (Test-Path -LiteralPath $resolvedTempDirectory) {
      Remove-Item -LiteralPath $resolvedTempDirectory -Recurse -Force
    }
  }
}
