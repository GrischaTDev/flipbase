\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('d2400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'purchase-delete@example.test', '{}', '{}');
insert into public.workspaces (id, name, tax_mode)
values ('d2400000-0000-4000-8000-000000000011', 'Entwurf löschen', 'diff_25a'),
       ('d2400000-0000-4000-8000-000000000012', 'Anderer Workspace', 'diff_25a');
insert into public.workspace_members (workspace_id, user_id, role)
values ('d2400000-0000-4000-8000-000000000011',
        'd2400000-0000-4000-8000-000000000001', 'owner');

insert into public.purchases (id, workspace_id, type, title, purchase_price, receipt_mode)
values
  ('d2400000-0000-4000-8000-000000000021', 'd2400000-0000-4000-8000-000000000011',
   'single', 'Eigenbelegentwurf', 25, 'self'),
  ('d2400000-0000-4000-8000-000000000022', 'd2400000-0000-4000-8000-000000000011',
   'single', 'Entwurf mit Wareneingang', 25, 'self'),
  ('d2400000-0000-4000-8000-000000000023', 'd2400000-0000-4000-8000-000000000011',
   'single', 'Kein Entwurf', 25, 'self'),
  ('d2400000-0000-4000-8000-000000000024', 'd2400000-0000-4000-8000-000000000012',
   'single', 'Fremder Entwurf', 25, 'self');
update public.purchases set entry_status = 'capturing'
where id = 'd2400000-0000-4000-8000-000000000023';

insert into public.purchase_lines
  (id, workspace_id, purchase_id, title_snapshot, line_kind, ordered_quantity,
   received_quantity, unit_purchase_price, line_total)
values
  ('d2400000-0000-4000-8000-000000000031', 'd2400000-0000-4000-8000-000000000011',
   'd2400000-0000-4000-8000-000000000021', 'Jacke', 'individual', 1, 0, 25, 25),
  ('d2400000-0000-4000-8000-000000000032', 'd2400000-0000-4000-8000-000000000011',
   'd2400000-0000-4000-8000-000000000022', 'Schuhe', 'individual', 1, 1, 25, 25);
insert into public.purchase_costs (workspace_id, purchase_id, type, amount)
values ('d2400000-0000-4000-8000-000000000011',
        'd2400000-0000-4000-8000-000000000021', 'shipping', 2);

select set_config('request.jwt.claim.sub', 'd2400000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok($$select public.delete_purchase_draft(
  'd2400000-0000-4000-8000-000000000011',
  'd2400000-0000-4000-8000-000000000022')$$,
  '22023', 'Ein Einkauf mit erfasstem Bestand kann nicht gelöscht werden.',
  'Wareneingang schützt den Entwurf');
select throws_ok($$select public.delete_purchase_draft(
  'd2400000-0000-4000-8000-000000000011',
  'd2400000-0000-4000-8000-000000000023')$$,
  '22023', 'Nur ein Einkaufsentwurf kann gelöscht werden.',
  'Andere Einkaufszustände bleiben erhalten');
select throws_ok($$select public.delete_purchase_draft(
  'd2400000-0000-4000-8000-000000000012',
  'd2400000-0000-4000-8000-000000000024')$$,
  '42501', 'Kein Zugriff auf diesen Workspace.',
  'Fremde Workspaces sind gesperrt');

select lives_ok($$select public.delete_purchase_draft(
  'd2400000-0000-4000-8000-000000000011',
  'd2400000-0000-4000-8000-000000000021')$$,
  'Eigenbelegentwurf mit Position und Nebenkosten wird gelöscht');
select is((select count(*) from public.purchases
  where id = 'd2400000-0000-4000-8000-000000000021'), 0::bigint,
  'Entwurf ist entfernt');
select is((select count(*) from public.purchase_lines
  where purchase_id = 'd2400000-0000-4000-8000-000000000021'), 0::bigint,
  'Position ist entfernt');
select is((select count(*) from public.purchase_costs
  where purchase_id = 'd2400000-0000-4000-8000-000000000021'), 0::bigint,
  'Nebenkosten sind entfernt');
select is((select count(*) from public.purchases
  where id = 'd2400000-0000-4000-8000-000000000022'), 1::bigint,
  'Geschützter Einkauf bleibt erhalten');

reset role;
select is(has_function_privilege('anon', 'public.delete_purchase_draft(uuid,uuid)', 'execute'),
  false, 'Anonyme dürfen den Löschendpunkt nicht aufrufen');
select is(has_function_privilege('service_role', 'public.delete_purchase_draft(uuid,uuid)', 'execute'),
  false, 'Service-Rolle erhält keinen direkten Aufruf');
select is(has_function_privilege('authenticated', 'public.delete_purchase_draft(uuid,uuid)', 'execute'),
  true, 'Angemeldete Nutzer dürfen den geprüften Löschendpunkt aufrufen');
select is(has_table_privilege('authenticated', 'public.purchases', 'delete'),
  false, 'Direktes Löschen des Einkaufs ist gesperrt');
select is((select count(*) from public.business_events
  where entity_id = 'd2400000-0000-4000-8000-000000000021'
    and event_type = 'purchase_draft_deleted'), 1::bigint,
  'Löschung ist im Fachjournal erfasst');

select * from finish();
rollback;
