$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$worktreePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$fixturePath = Join-Path $PSScriptRoot 'inventory_sales_legacy_migration.sql'
$migrationPath = Join-Path $worktreePath 'supabase\migrations\20260828101500_backfill_legacy_sale_lines.sql'
$containerFixturePath = '/tmp/flipbase-task9-legacy-fixture.sql'
$containerMigrationPath = '/tmp/flipbase-task9-backfill.sql'

$containerNames = @(
  docker ps --filter "label=com.supabase.cli.workdir=$worktreePath" --filter 'name=supabase_db_' --format '{{.Names}}'
)
if ($LASTEXITCODE -ne 0 -or $containerNames.Count -ne 1) {
  throw "Erwartet wurde genau ein laufender lokaler Supabase-Datenbankcontainer fuer $worktreePath. Gefunden: $($containerNames.Count)"
}
$containerName = $containerNames[0]

if (-not (Test-Path -LiteralPath $fixturePath)) {
  throw "Legacy-fixture nicht gefunden: $fixturePath"
}
if (-not (Test-Path -LiteralPath $migrationPath)) {
  throw "Backfill-Migration nicht gefunden: $migrationPath"
}

docker cp $fixturePath "${containerName}:$containerFixturePath"
if ($LASTEXITCODE -ne 0) {
  throw 'Legacy-fixture konnte nicht in den lokalen Postgres-Container kopiert werden.'
}
docker cp $migrationPath "${containerName}:$containerMigrationPath"
if ($LASTEXITCODE -ne 0) {
  throw 'Backfill-Migration konnte nicht in den lokalen Postgres-Container kopiert werden.'
}

try {
  docker exec $containerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f $containerFixturePath
  if ($LASTEXITCODE -ne 0) {
    throw 'Legacy-Migrationsfixture ist fehlgeschlagen.'
  }
} finally {
  docker exec $containerName rm -f $containerFixturePath $containerMigrationPath | Out-Null
}
