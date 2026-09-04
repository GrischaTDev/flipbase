\set ON_ERROR_STOP on

begin;

select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '9c000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'individual-receipt-fix@example.test',
  'unused',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.workspaces (id, name)
values ('9c000000-0000-4000-8000-000000000011', 'Mehrfacher Einzel-Wareneingang');

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '9c000000-0000-4000-8000-000000000011',
  '9c000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.purchases (
  id, workspace_id, type, title, purchase_date, purchase_price,
  cost_allocation_mode, entry_status
) values (
  '9c000000-0000-4000-8000-000000000101',
  '9c000000-0000-4000-8000-000000000011',
  'mystery_pack',
  'Drei unbekannte Einzelstücke',
  '2026-09-01',
  30,
  'even',
  'draft'
);

insert into public.purchase_lines (
  id, workspace_id, purchase_id, title_snapshot, line_kind,
  ordered_quantity, received_quantity, price_mode, unit_purchase_price,
  line_total, condition_snapshot
) values (
  '9c000000-0000-4000-8000-000000000301',
  '9c000000-0000-4000-8000-000000000011',
  '9c000000-0000-4000-8000-000000000101',
  'Mystery-Schuhe',
  'individual',
  3,
  0,
  'unpriced_mystery',
  null,
  null,
  'like_new'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9c000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.receive_individual_purchase_line(
    '9c000000-0000-4000-8000-000000000011',
    '9c000000-0000-4000-8000-000000000101',
    '9c000000-0000-4000-8000-000000000301',
    '{"title":"Mystery-Schuh 1","condition":"defective"}'::jsonb
  )$$,
  'das erste Stück einer unbepreisten Mystery-Position wird erfasst'
);

select lives_ok(
  $$select public.receive_individual_purchase_line(
    '9c000000-0000-4000-8000-000000000011',
    '9c000000-0000-4000-8000-000000000101',
    '9c000000-0000-4000-8000-000000000301',
    '{"title":"Mystery-Schuh 2","condition":"defective"}'::jsonb
  )$$,
  'ein zweiter RPC-Aufruf erfasst genau das zweite Stück derselben Position'
);

select lives_ok(
  $$select public.receive_individual_purchase_line(
    '9c000000-0000-4000-8000-000000000011',
    '9c000000-0000-4000-8000-000000000101',
    '9c000000-0000-4000-8000-000000000301',
    '{"title":"Mystery-Schuh 3","condition":"defective"}'::jsonb
  )$$,
  'ein dritter RPC-Aufruf erfasst genau das dritte Stück derselben Position'
);

select is(
  (
    select line.received_quantity
    from public.purchase_lines as line
    where line.id = '9c000000-0000-4000-8000-000000000301'
  ),
  3,
  'die empfangene Menge wird pro erfolgreichem Aufruf atomar um eins erhöht'
);

select is(
  (
    select count(*)::integer
    from public.inventory_items as item
    where item.purchase_line_id = '9c000000-0000-4000-8000-000000000301'
  ),
  3,
  'drei Aufrufe erzeugen drei verschiedene Bestandsartikel'
);

select ok(
  (
    select count(*) = 3
      and count(distinct item.id) = 3
      and bool_and(item.condition = 'like_new')
      and bool_and(item.allocated_purchase_cost = 0)
    from public.inventory_items as item
    where item.purchase_line_id = '9c000000-0000-4000-8000-000000000301'
  ),
  'Zustand stammt aus dem Positions-Snapshot und Draft-Kosten bleiben offen bei 0 Euro'
);

select throws_ok(
  $$select public.receive_individual_purchase_line(
    '9c000000-0000-4000-8000-000000000011',
    '9c000000-0000-4000-8000-000000000101',
    '9c000000-0000-4000-8000-000000000301',
    '{"title":"Mystery-Schuh 4","condition":"used"}'::jsonb
  )$$,
  '22023',
  'Die Einzelartikelposition ist nicht offen.',
  'nach der bestellten Menge wird ein weiteres Stück fachlich abgelehnt'
);

select lives_ok(
  $$select public.finalize_purchase_costing(
    '9c000000-0000-4000-8000-000000000011',
    '9c000000-0000-4000-8000-000000000101'
  )$$,
  'der vollständig erfasste unbepreiste Mystery-Einkauf kann finalisiert werden'
);

select ok(
  (
    select count(*) = 3
      and sum(item.allocated_purchase_cost) = 30
      and min(item.allocated_purchase_cost) = 10
      and max(item.allocated_purchase_cost) = 10
      and bool_and(item.status = 'ready')
    from public.inventory_items as item
    where item.purchase_line_id = '9c000000-0000-4000-8000-000000000301'
  ),
  'die Finalisierung verteilt echte Einkaufskosten auf alle drei vorhandenen Stücke'
);

select * from finish();

rollback;
