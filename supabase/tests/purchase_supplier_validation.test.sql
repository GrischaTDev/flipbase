\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('a8200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'supplier-validation@example.test', '{}', '{}');
insert into public.workspaces (id, name) values
  ('a8200000-0000-4000-8000-000000000011', 'Lieferantenprüfung eigener Workspace'),
  ('a8200000-0000-4000-8000-000000000012', 'Lieferantenprüfung fremder Workspace');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a8200000-0000-4000-8000-000000000011', 'a8200000-0000-4000-8000-000000000001', 'owner');
insert into public.suppliers (id, workspace_id, name) values
  ('a8200000-0000-4000-8000-000000000021', 'a8200000-0000-4000-8000-000000000011', 'Eigener Lieferant'),
  ('a8200000-0000-4000-8000-000000000022', 'a8200000-0000-4000-8000-000000000012', 'Fremder Lieferant');

create temporary table supplier_validation_result as select
  null::uuid as purchase_id;
grant select, update on supplier_validation_result to authenticated;

select set_config('request.jwt.claim.sub', 'a8200000-0000-4000-8000-000000000001', true);
set local role authenticated;
update supplier_validation_result
set purchase_id = (
  public.create_purchase(
    'a8200000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Einkauf mit eigenem Lieferanten","purchase_date":"2026-09-08","purchase_price":10,"request_id":"a8200000-0000-4000-8000-000000000031","supplier_id":"a8200000-0000-4000-8000-000000000021"}'::jsonb,
    '[{"type":"shipping","amount":2,"allocation_method":"direct","target_purchase_line_ref":"own-line"}]'::jsonb,
    '[{"client_ref":"own-line","title_snapshot":"Eigener Artikel","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":10,"line_total":10}]'::jsonb
  ) #>> '{purchase,id}'
)::uuid;
select public.create_purchase(
  'a8200000-0000-4000-8000-000000000011',
  '{"type":"single","title":"Einkauf mit eigenem Lieferanten","purchase_date":"2026-09-08","purchase_price":10,"request_id":"a8200000-0000-4000-8000-000000000031","supplier_id":"a8200000-0000-4000-8000-000000000021"}'::jsonb,
  '[{"type":"shipping","amount":2,"allocation_method":"direct","target_purchase_line_ref":"own-line"}]'::jsonb,
  '[{"client_ref":"own-line","title_snapshot":"Eigener Artikel","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":10,"line_total":10}]'::jsonb
);
reset role;

select is(
  (select supplier_id from public.purchases where id = (select purchase_id from supplier_validation_result)),
  'a8200000-0000-4000-8000-000000000021'::uuid,
  'create_purchase speichert einen gültigen Lieferanten aus demselben Workspace'
);
select is(
  (select count(*) from public.purchases where request_id = 'a8200000-0000-4000-8000-000000000031'),
  1::bigint,
  'dieselbe Request-ID erzeugt keinen zweiten Einkauf'
);
select is(
  (select count(*) from public.purchase_lines where purchase_id = (select purchase_id from supplier_validation_result)),
  1::bigint,
  'die idempotente Wiederholung erzeugt keine zweite Position'
);
select is(
  (select count(*) from public.purchase_costs where purchase_id = (select purchase_id from supplier_validation_result)),
  1::bigint,
  'die idempotente Wiederholung erzeugt keine zweiten Kosten'
);
select is(
  (select count(*) from public.business_events where entity_id = (select purchase_id from supplier_validation_result) and event_type = 'purchase_draft_created'),
  1::bigint,
  'die idempotente Wiederholung erzeugt genau ein Erstellungsevent'
);

set local role authenticated;
select lives_ok(
  $$select public.create_purchase(
    'a8200000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Einkauf mit Lieferant null","purchase_date":"2026-09-08","request_id":"a8200000-0000-4000-8000-000000000032","supplier_id":null}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  'JSON null bleibt als Lieferantenwert erlaubt'
);
select lives_ok(
  $$select public.create_purchase(
    'a8200000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Einkauf ohne Lieferant","purchase_date":"2026-09-08","request_id":"a8200000-0000-4000-8000-000000000033"}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  'ein fehlendes Lieferantenfeld bleibt erlaubt'
);
reset role;

select is(
  (select count(*) from public.purchases where request_id in ('a8200000-0000-4000-8000-000000000032', 'a8200000-0000-4000-8000-000000000033')),
  2::bigint,
  'Null und fehlender Lieferant erzeugen jeweils einen Einkauf'
);
select ok(
  not exists (
    select 1 from public.purchases
    where request_id in ('a8200000-0000-4000-8000-000000000032', 'a8200000-0000-4000-8000-000000000033')
      and supplier_id is not null
  ),
  'Null und fehlender Lieferant werden nicht automatisch ersetzt'
);

create temporary table supplier_validation_counts as
select
  (select count(*) from public.purchases) as purchases,
  (select count(*) from public.purchase_lines) as purchase_lines,
  (select count(*) from public.purchase_costs) as purchase_costs,
  (select count(*) from public.business_events) as business_events;

set local role authenticated;
select throws_ok(
  $$select public.create_purchase(
    'a8200000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Einkauf mit fremdem Lieferanten","purchase_date":"2026-09-08","purchase_price":10,"request_id":"a8200000-0000-4000-8000-000000000034","supplier_id":"a8200000-0000-4000-8000-000000000022"}'::jsonb,
    '[{"type":"shipping","amount":2,"allocation_method":"direct","target_purchase_line_ref":"foreign-line"}]'::jsonb,
    '[{"client_ref":"foreign-line","title_snapshot":"Fremder Artikel","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":10,"line_total":10}]'::jsonb
  )$$,
  '22023',
  'Der Lieferant gehört nicht zu diesem Workspace.',
  'create_purchase lehnt einen Lieferanten aus einem fremden Workspace ab'
);
select throws_ok(
  $$select public.create_purchase(
    'a8200000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Einkauf mit fehlendem Lieferanten","purchase_date":"2026-09-08","purchase_price":10,"request_id":"a8200000-0000-4000-8000-000000000035","supplier_id":"a8200000-0000-4000-8000-000000000099"}'::jsonb,
    '[{"type":"shipping","amount":2,"allocation_method":"direct","target_purchase_line_ref":"missing-line"}]'::jsonb,
    '[{"client_ref":"missing-line","title_snapshot":"Fehlender Artikel","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":10,"line_total":10}]'::jsonb
  )$$,
  '22023',
  'Der Lieferant gehört nicht zu diesem Workspace.',
  'create_purchase lehnt eine gültig geformte, aber fehlende Lieferanten-ID ab'
);
select throws_ok(
  $$select public.create_purchase(
    'a8200000-0000-4000-8000-000000000011',
    '{"type":"single","title":"Einkauf mit ungültigem Lieferantentext","purchase_date":"2026-09-08","purchase_price":10,"request_id":"a8200000-0000-4000-8000-000000000036","supplier_id":"kein-lieferant"}'::jsonb,
    '[{"type":"shipping","amount":2,"allocation_method":"direct","target_purchase_line_ref":"malformed-line"}]'::jsonb,
    '[{"client_ref":"malformed-line","title_snapshot":"Ungültiger Artikel","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":10,"line_total":10}]'::jsonb
  )$$,
  '22023',
  'Der Lieferant gehört nicht zu diesem Workspace.',
  'create_purchase lehnt einen ungültigen Lieferantentext kontrolliert ab'
);
reset role;

select is(
  (select count(*) from public.purchases),
  (select purchases from supplier_validation_counts),
  'abgelehnte Lieferanten-IDs hinterlassen keinen Einkaufskopf'
);
select is(
  (select count(*) from public.purchase_lines),
  (select purchase_lines from supplier_validation_counts),
  'abgelehnte Lieferanten-IDs hinterlassen keine Position'
);
select is(
  (select count(*) from public.purchase_costs),
  (select purchase_costs from supplier_validation_counts),
  'abgelehnte Lieferanten-IDs hinterlassen keine Kosten'
);
select is(
  (select count(*) from public.business_events),
  (select business_events from supplier_validation_counts),
  'abgelehnte Lieferanten-IDs hinterlassen kein Ereignis'
);

select * from finish();
rollback;
