\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('a8100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'draft-audit@example.test', '{}', '{}'),
  ('a8100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'draft-outsider@example.test', '{}', '{}');
insert into public.workspaces (id, name) values
  ('a8100000-0000-4000-8000-000000000011', 'Entwurfschronik');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a8100000-0000-4000-8000-000000000011', 'a8100000-0000-4000-8000-000000000001', 'owner');
insert into public.suppliers (id, workspace_id, name) values
  ('a8100000-0000-4000-8000-000000000021', 'a8100000-0000-4000-8000-000000000011', 'Lieferant');

create temporary table draft_input as select
  'a8100000-0000-4000-8000-000000000011'::uuid as workspace_id,
  null::uuid as purchase_id,
  '{"type":"single","title":"Entwurf","purchase_date":"2026-09-08","purchase_price":20,"pricing_mode":"individual","cost_allocation_mode":"even","request_id":"a8100000-0000-4000-8000-000000000031"}'::jsonb as purchase,
  '[{"type":"shipping","amount":2,"allocation_method":"direct","target_purchase_line_ref":"first"}]'::jsonb as costs,
  '[{"client_ref":"first","title_snapshot":"Artikel","line_kind":"individual","ordered_quantity":2,"unit_purchase_price":10,"line_total":20}]'::jsonb as lines;
grant select, update on draft_input to authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000001', true);
set local role authenticated;
update draft_input set purchase_id = (public.create_purchase(workspace_id, purchase, costs, lines) #>> '{purchase,id}')::uuid;
select public.create_purchase(workspace_id, purchase, costs, lines) from draft_input;
select is((select count(*) from draft_input as input cross join lateral public.list_record_timeline(input.workspace_id, 'purchase', input.purchase_id) as event where event.event_type = 'purchase_draft_created'), 1::bigint, 'Authentifizierter Client liest Erstellung über bestehende Chronik-RPC');
reset role;

select is((select count(*) from public.business_events where entity_id = (select purchase_id from draft_input)), 1::bigint, 'Erstellen und idempotente Wiederholung schreiben genau ein Ereignis');
select is((select event_type from public.business_events where entity_id = (select purchase_id from draft_input)), 'purchase_draft_created', 'Erstellung besitzt den vereinbarten Ereignistyp');
select ok((select actor_id = 'a8100000-0000-4000-8000-000000000001'::uuid and workspace_id = (select workspace_id from draft_input) and entity_type = 'purchase' from public.business_events where entity_id = (select purchase_id from draft_input)), 'Autor und Mandant stammen aus der autorisierten Transaktion');
select is((select changes #>> '{purchase,after,title}' from public.business_events where entity_id = (select purchase_id from draft_input)), 'Entwurf', 'Erstellung enthält den gespeicherten Titel');
select is((select changes #>> '{lines,after,0,ordered_quantity}' from public.business_events where entity_id = (select purchase_id from draft_input)), '2', 'Erstellung enthält die Positionsmenge');
select is((select changes #>> '{costs,after,0,amount}' from public.business_events where entity_id = (select purchase_id from draft_input)), '2', 'Erstellung enthält Zusatzkosten');
select ok((select created_at = transaction_timestamp() from public.business_events where entity_id = (select purchase_id from draft_input)), 'Ereigniszeit stammt vom Server');
select ok((select not (changes::text ~ '"(created_at|updated_at|request_id|target_purchase_line_id|id)"') from public.business_events where entity_id = (select purchase_id from draft_input)), 'Snapshot enthält keine technischen IDs oder Zeitstempel');

-- Neue Zeilen- und Kosten-IDs sowie Leerraum ergeben keine fachliche Änderung.
set local role authenticated;
select public.update_purchase_draft(workspace_id, purchase_id, purchase || '{"title":" Entwurf "}', costs, lines) from draft_input;
reset role;
select is((select count(*) from public.business_events where entity_id = (select purchase_id from draft_input)), 1::bigint, 'Identisches Speichern bleibt trotz regenerierter IDs ohne Änderungseintrag');

set local role authenticated;
update draft_input set purchase = purchase || '{"title":"Geändert","discount_amount":1,"supplier_id":"a8100000-0000-4000-8000-000000000021"}';
select public.update_purchase_draft(workspace_id, purchase_id, purchase, costs, lines) from draft_input;
reset role;
select is((select count(*) from public.business_events where entity_id = (select purchase_id from draft_input) and event_type = 'purchase_draft_updated'), 1::bigint, 'Mehrere Änderungen in einem Speichern ergeben genau ein Änderungsereignis');
select is((select changes #>> '{purchase,before,title}' from public.business_events where entity_id = (select purchase_id from draft_input) and event_type = 'purchase_draft_updated'), 'Entwurf', 'Vorherwert bleibt erhalten');
select is((select changes #>> '{purchase,after,discount_amount}' from public.business_events where entity_id = (select purchase_id from draft_input) and event_type = 'purchase_draft_updated'), '1', 'Rabatt ist im Nachherwert enthalten');
select is((select changes #>> '{purchase,after,supplier_id}' from public.business_events where entity_id = (select purchase_id from draft_input) and event_type = 'purchase_draft_updated'), 'a8100000-0000-4000-8000-000000000021', 'Lieferantenwechsel ist enthalten');

-- Der Kostenfehler tritt nach Positionsänderungen auf: alles muss zurückrollen.
set local role authenticated;
select throws_ok($$select public.update_purchase_draft(workspace_id, purchase_id, purchase, '[{"amount":-1}]', jsonb_set(lines, '{0,title_snapshot}', '"Nicht gespeichert"')) from draft_input$$, '22023', 'Zusatzkosten sind ungültig.', 'Fehlgeschlagenes Speichern wird vollständig zurückgerollt');
reset role;
select is((select count(*) from public.business_events where entity_id = (select purchase_id from draft_input)), 2::bigint, 'Fehlgeschlagenes Speichern erzeugt kein Ereignis');
select is((select title_snapshot from public.purchase_lines where purchase_id = (select purchase_id from draft_input)), 'Artikel', 'Fehlgeschlagenes Speichern verändert keine Position');

set local role authenticated;
update draft_input set lines = jsonb_set(jsonb_set(lines, '{0,ordered_quantity}', '3'), '{0,line_total}', '30'), purchase = purchase || '{"purchase_price":30}', costs = jsonb_set(costs, '{0,amount}', '3');
select public.update_purchase_draft(workspace_id, purchase_id, purchase, costs, lines) from draft_input;
reset role;
select is((select count(*) from public.business_events where entity_id = (select purchase_id from draft_input)), 3::bigint, 'Positions- und Kostenänderung erzeugen einen weiteren Eintrag');
select ok(exists(select 1 from public.business_events where entity_id = (select purchase_id from draft_input) and changes #>> '{lines,before,0,ordered_quantity}' = '2' and changes #>> '{lines,after,0,ordered_quantity}' = '3' and changes #>> '{costs,after,0,amount}' = '3'), 'Menge und Kosten besitzen tatsächliche Vorher- und Nachherwerte');

select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.update_purchase_draft(workspace_id, purchase_id, purchase, costs, lines) from draft_input$$, '42501', 'Kein Zugriff auf diesen Workspace.', 'Fremde Benutzer dürfen keine Entwürfe ändern');
reset role;
select is((select count(*) from public.business_events where entity_id = (select purchase_id from draft_input)), 3::bigint, 'Abgewiesener Zugriff erzeugt kein Ereignis');
select ok(not has_table_privilege('authenticated', 'public.business_events', 'insert') and not has_table_privilege('authenticated', 'public.business_events', 'select'), 'Journal bleibt ohne direkten Clientzugriff');
select ok(not has_function_privilege('authenticated', 'public.purchase_draft_audit_snapshot(uuid,uuid)', 'execute') and not has_function_privilege('anon', 'public.purchase_draft_audit_snapshot(uuid,uuid)', 'execute') and not has_function_privilege('service_role', 'public.purchase_draft_audit_snapshot(uuid,uuid)', 'execute') and not exists (
  select 1 from pg_proc as routine
  cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) as privilege
  where routine.oid = 'public.purchase_draft_audit_snapshot(uuid,uuid)'::regprocedure
    and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
), 'Snapshot-Helfer besitzt keine direkten Clientrechte');
select ok((select not prosecdef and 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.purchase_draft_audit_snapshot(uuid,uuid)'::regprocedure), 'Snapshot-Helfer bleibt invoker mit leerem Suchpfad');

select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000001', true);
set local role authenticated;
update draft_input set lines = lines || '[{"client_ref":"second","title_snapshot":"Zweiter Artikel","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":10,"line_total":10}]';
select public.update_purchase_draft(workspace_id, purchase_id, purchase, costs, lines) from draft_input;
reset role;
select is((select count(*) from public.business_events where entity_id = (select purchase_id from draft_input)), 4::bigint, 'Neue Position erzeugt einen Änderungseintrag');
set local role authenticated;
update draft_input set lines = jsonb_build_array(lines -> 1, lines -> 0);
select public.update_purchase_draft(workspace_id, purchase_id, purchase, costs, lines) from draft_input;
reset role;
select is((select count(*) from public.business_events where entity_id = (select purchase_id from draft_input)), 4::bigint, 'Reihenfolge und regenerierte Ziel-IDs erzeugen keinen künstlichen Eintrag');
set local role authenticated;
update draft_input set costs = jsonb_set(costs, '{0,target_purchase_line_ref}', '"second"');
select public.update_purchase_draft(workspace_id, purchase_id, purchase, costs, lines) from draft_input;
reset role;
select is((select count(*) from public.business_events where entity_id = (select purchase_id from draft_input)), 5::bigint, 'Andere direkte Zielposition erzeugt einen Änderungseintrag');
select ok(exists(select 1 from public.business_events where entity_id = (select purchase_id from draft_input) and changes #>> '{costs,before,0,target_line,title_snapshot}' = 'Artikel' and changes #>> '{costs,after,0,target_line,title_snapshot}' = 'Zweiter Artikel'), 'Direkte Kostenzuordnung zeigt die fachlichen Zielpositionen');
select * from finish();
rollback;
