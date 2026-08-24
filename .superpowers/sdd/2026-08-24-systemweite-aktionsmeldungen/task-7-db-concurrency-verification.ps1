$ErrorActionPreference = 'Stop'
$container = 'supabase_db_flipbase-supabase'

function Invoke-Task7Psql([string]$sql, [bool]$stopOnError = $true) {
  $argumente = @('exec', '-i', $container, 'psql', '-U', 'postgres', '-d', 'postgres')
  if ($stopOnError) {
    $argumente += @('-v', 'ON_ERROR_STOP=1')
  }
  $ausgabe = $sql | & docker @argumente 2>&1
  return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($ausgabe -join "`n") }
}

$setup = @'
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  'f7000000-0000-4000-8000-000000000077', 'authenticated', 'authenticated',
  'task-7-concurrency@localhost.invalid', '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), false, false
);
insert into public.workspaces (id, name)
values ('f7100000-0000-4000-8000-000000000077', 'Task 7 Concurrency');
insert into public.workspace_members (workspace_id, user_id, role)
values ('f7100000-0000-4000-8000-000000000077', 'f7000000-0000-4000-8000-000000000077', 'owner');
insert into public.inventory_items (id, workspace_id, title, status)
values ('f7200000-0000-4000-8000-000000000077', 'f7100000-0000-4000-8000-000000000077', 'Concurrency Artikel', 'ready');
'@

$cleanup = @'
delete from public.sales where workspace_id = 'f7100000-0000-4000-8000-000000000077';
delete from public.store_order_items where store_order_id in (
  select id from public.store_orders where workspace_id = 'f7100000-0000-4000-8000-000000000077'
);
delete from public.store_orders where workspace_id = 'f7100000-0000-4000-8000-000000000077';
delete from public.inventory_items where workspace_id = 'f7100000-0000-4000-8000-000000000077';
delete from public.workspace_members where workspace_id = 'f7100000-0000-4000-8000-000000000077';
delete from public.workspaces where id = 'f7100000-0000-4000-8000-000000000077';
delete from auth.users where id = 'f7000000-0000-4000-8000-000000000077';
'@

$blockerSql = @'
begin;
select id from public.inventory_items
where id = 'f7200000-0000-4000-8000-000000000077'
for update;
select pg_sleep(2);
commit;
'@

function New-CheckoutSql([string]$orderId, [string]$orderNumber) {
  return @"
set request.jwt.claim.sub = 'f7000000-0000-4000-8000-000000000077';
set request.jwt.claims = '{"sub":"f7000000-0000-4000-8000-000000000077","role":"authenticated"}';
set role authenticated;
select id from public.place_store_order(
  'f7100000-0000-4000-8000-000000000077', '$orderId', '$orderNumber',
  '{"firstName":"Concurrency","lastName":"Test"}'::jsonb,
  100, 0, 100, 'bank_transfer', 'pending', null, 'pending', '2026-08-24', 'Concurrency',
  '[{"inventory_item_id":"f7200000-0000-4000-8000-000000000077","item_title":"Concurrency Artikel","quantity":1,"price":100,"payment_fee":0}]'::jsonb
);
"@
}

$jobScript = {
  param([string]$containerName, [string]$sql)
  $ausgabe = $sql | docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1
  [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($ausgabe -join "`n") }
}

try {
  $setupResult = Invoke-Task7Psql $setup
  if ($setupResult.ExitCode -ne 0) { throw $setupResult.Output }

  $blocker = Start-Job -ScriptBlock $jobScript -ArgumentList $container, $blockerSql
  Start-Sleep -Milliseconds 300
  $checkoutA = Start-Job -ScriptBlock $jobScript -ArgumentList $container, (New-CheckoutSql 'f7300000-0000-4000-8000-000000000077' 'RF-CONCURRENT-A')
  $checkoutB = Start-Job -ScriptBlock $jobScript -ArgumentList $container, (New-CheckoutSql 'f7300000-0000-4000-8000-000000000078' 'RF-CONCURRENT-B')

  Wait-Job -Job $blocker, $checkoutA, $checkoutB | Out-Null
  $blockerResult = Receive-Job $blocker
  $ergebnisse = @(Receive-Job $checkoutA, $checkoutB)
  Remove-Job $blocker, $checkoutA, $checkoutB

  if ($blockerResult.ExitCode -ne 0) { throw $blockerResult.Output }
  $exitCodes = @($ergebnisse.ExitCode | Sort-Object)
  if ($exitCodes.Count -ne 2 -or $exitCodes[0] -ne 0 -or $exitCodes[1] -eq 0) {
    throw "Erwartet wurde genau ein erfolgreicher und ein abgewiesener Checkout; erhalten: $($exitCodes -join ',').`n$($ergebnisse.Output -join "`n---`n")"
  }
  $abgewiesenerCheckout = $ergebnisse | Where-Object { $_.ExitCode -ne 0 }
  if ($abgewiesenerCheckout.Output -notmatch 'nicht mehr verkaufbar') {
    throw "Der zweite Checkout scheiterte nicht am verkauften Artikel:`n$($abgewiesenerCheckout.Output)"
  }

  $verification = Invoke-Task7Psql @'
select
  (select count(*) from public.store_orders where workspace_id = 'f7100000-0000-4000-8000-000000000077') as order_count,
  (select count(*) from public.sales where workspace_id = 'f7100000-0000-4000-8000-000000000077') as sale_count,
  (select status from public.inventory_items where id = 'f7200000-0000-4000-8000-000000000077') as inventory_status;
'@
  if ($verification.ExitCode -ne 0 -or $verification.Output -notmatch '1\s+\|\s+1\s+\|\s+sold') {
    throw "Concurrency-Endzustand ist falsch:`n$($verification.Output)"
  }

  Write-Output 'PASS concurrency: zwei IDs, genau 1 Order, 1 Sale und Status sold'
} finally {
  $cleanupResult = Invoke-Task7Psql $cleanup $false
  if ($cleanupResult.ExitCode -ne 0) {
    Write-Error "Fixture-Cleanup fehlgeschlagen:`n$($cleanupResult.Output)"
  }
}
