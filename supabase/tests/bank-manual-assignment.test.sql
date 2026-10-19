\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select has_function('public', 'enforce_manual_bank_assignment', array[]::text[], 'Manuelle Zuordnung hat eine serverseitige Prüfung');
select has_index('public', 'bank_transactions', 'bank_transactions_manual_target_unique', 'Parallele manuelle Ziele sind durch einen eindeutigen Index geschützt');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
('f1950000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'bank-owner@example.test', '{}', '{}'),
('f1950000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bank-outsider@example.test', '{}', '{}');
insert into public.workspaces(id, name) values
('f1950000-0000-4000-8000-000000000011', 'Bankzuordnung'),
('f1950000-0000-4000-8000-000000000012', 'Zweiter eigener Arbeitsbereich'),
('f1950000-0000-4000-8000-000000000013', 'Fremder Arbeitsbereich');
insert into public.workspace_members(workspace_id, user_id, role) values
('f1950000-0000-4000-8000-000000000011', 'f1950000-0000-4000-8000-000000000001', 'owner'),
('f1950000-0000-4000-8000-000000000012', 'f1950000-0000-4000-8000-000000000001', 'owner'),
('f1950000-0000-4000-8000-000000000013', 'f1950000-0000-4000-8000-000000000002', 'owner');
insert into public.bank_transactions(id, workspace_id, booking_date, counterparty_name, purpose, amount)
select ('f1950000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
case i when 23 then 'f1950000-0000-4000-8000-000000000012'::uuid
when 24 then 'f1950000-0000-4000-8000-000000000013'::uuid
else 'f1950000-0000-4000-8000-000000000011'::uuid end,
'2026-10-19', 'Testbuchung', 'Manuelle Zuordnung', 80
from generate_series(21, 28) as i;
select set_config('request.jwt.claim.sub', 'f1950000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok($q$
  update public.bank_transactions set status = 'matched',
  match_json = '{"targetType":"sale","targetId":"sale-target","targetReference":"VK-42","targetAmount":80,"confidenceLabel":"manual","confidence":100}'::jsonb
  where id = 'f1950000-0000-4000-8000-000000000021'
$q$, 'Mitglied darf eine Bankbewegung manuell zuordnen');
select throws_ok($q$
  update public.bank_transactions set status = 'matched', match_json =
  (select match_json from public.bank_transactions where id = 'f1950000-0000-4000-8000-000000000021')
  where id = 'f1950000-0000-4000-8000-000000000022'
$q$, '23514', 'Dieser Eintrag ist bereits einer anderen Bankbewegung zugeordnet.', 'Dasselbe Ziel ist nicht doppelt manuell zuordenbar');
select lives_ok($q$
  update public.bank_transactions set status = 'booked', booked_at = now()
  where id = 'f1950000-0000-4000-8000-000000000021'
$q$, 'Ein vorhandener manueller Treffer lässt sich weiterhin buchen');
select throws_ok($q$
  update public.bank_transactions set status = 'matched',
  match_json = '{"targetType":"sale","targetId":"sale-target","confidenceLabel":"exact"}'::jsonb
  where id = 'f1950000-0000-4000-8000-000000000022'
$q$, '23514', 'Dieser Eintrag ist bereits einer anderen Bankbewegung zugeordnet.', 'Automatische Treffer belegen kein bereits manuell belegtes Ziel');
select lives_ok($q$
  update public.bank_transactions set status = 'matched',
  match_json = '{"targetType":"sale","targetId":"sale-target","confidenceLabel":"manual"}'::jsonb
  where id = 'f1950000-0000-4000-8000-000000000023'
$q$, 'Zielkennungen bleiben nach Arbeitsbereich getrennt');
with changed as (
  update public.bank_transactions set status = 'matched',
  match_json = '{"targetType":"sale","targetId":"foreign-target","confidenceLabel":"manual"}'::jsonb
  where id = 'f1950000-0000-4000-8000-000000000024' returning id
) select is((select count(*) from changed), 0::bigint, 'Fremde Bankbewegungen bleiben durch RLS geschützt');
select throws_ok($q$
  update public.bank_transactions set status = 'matched',
  match_json = '{"targetType":"unknown","targetId":"invalid","confidenceLabel":"manual"}'::jsonb
  where id = 'f1950000-0000-4000-8000-000000000022'
$q$, '23514', 'Bitte wähle einen gültigen Eintrag für die Bankzuordnung.', 'Unbekannte manuelle Zielarten werden abgewiesen');
select lives_ok($q$
  update public.bank_transactions set status = 'matched',
  match_json = '{"targetType":"operating_expense","targetId":"opex-shipping","confidenceLabel":"high"}'::jsonb
  where id in ('f1950000-0000-4000-8000-000000000025','f1950000-0000-4000-8000-000000000026')
$q$, 'Bestehende automatische Sammelvorschläge bleiben möglich');
select throws_ok($q$
  update public.bank_transactions set status = 'matched',
  match_json = '{"targetType":"operating_expense","targetId":"opex-shipping","confidenceLabel":"manual"}'::jsonb
  where id = 'f1950000-0000-4000-8000-000000000022'
$q$, '23514', 'Dieser Eintrag ist bereits einer anderen Bankbewegung zugeordnet.', 'Manuell wird kein bereits automatisch belegtes Ziel übernommen');
select lives_ok($q$
  update public.bank_transactions set status = 'matched',
  match_json = '{"targetType":"purchase","targetId":"released-target","confidenceLabel":"manual"}'::jsonb
  where id = 'f1950000-0000-4000-8000-000000000027';
  update public.bank_transactions set status = 'ignored'
  where id = 'f1950000-0000-4000-8000-000000000027';
  update public.bank_transactions set status = 'matched',
  match_json = '{"targetType":"purchase","targetId":"released-target","confidenceLabel":"manual"}'::jsonb
  where id = 'f1950000-0000-4000-8000-000000000028'
$q$, 'Ignorierte Bankbewegungen belegen ein Ziel nicht mehr');
select ok(not has_function_privilege(role_name, 'public.enforce_manual_bank_assignment()', 'execute'), 'Kein öffentlicher Funktionsaufruf für ' || role_name)
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);

select * from finish();
rollback;
