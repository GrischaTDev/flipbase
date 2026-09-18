\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('e1700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'documents-owner@example.test', '{}', '{}'),
  ('e1700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'documents-outsider@example.test', '{}', '{}');
insert into public.workspaces (id, name, tax_mode) values
  ('e1700000-0000-4000-8000-000000000011', 'Belege eigener Workspace', 'diff_25a'),
  ('e1700000-0000-4000-8000-000000000012', 'Belege fremder Workspace', 'diff_25a');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('e1700000-0000-4000-8000-000000000011', 'e1700000-0000-4000-8000-000000000001', 'owner'),
  ('e1700000-0000-4000-8000-000000000012', 'e1700000-0000-4000-8000-000000000002', 'owner');

create temporary table document_test_results (name text primary key, id uuid, snapshot jsonb);
grant all on document_test_results to authenticated;

create function pg_temp.new_purchase(p_title text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  v_id := (public.create_purchase(
    'e1700000-0000-4000-8000-000000000011',
    jsonb_build_object('type', 'single', 'title', p_title, 'purchase_date', '2026-09-18', 'purchase_price', 10),
    '[]'::jsonb,
    '[{"client_ref":"beleg-line","title_snapshot":"Jacke","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":10,"line_total":10}]'::jsonb
  ) #>> '{purchase,id}')::uuid;
  return v_id;
end; $$;

create function pg_temp.business_state(p_purchase_id uuid)
returns jsonb language sql as $$
  select jsonb_build_object(
    'purchase', (
      select jsonb_build_object(
        'purchase_price', purchase_price, 'total_purchase_cost', total_purchase_cost,
        'entry_status', entry_status, 'finalized_at', finalized_at,
        'seller_details_version', seller_details_version, 'updated_at', updated_at
      ) from public.purchases where id = p_purchase_id
    ),
    'lines', (select coalesce(jsonb_agg(to_jsonb(line) order by line.id), '[]') from public.purchase_lines as line where line.purchase_id = p_purchase_id),
    'items', (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]') from public.inventory_items as item where item.purchase_id = p_purchase_id)
  );
$$;

select set_config('request.jwt.claim.sub', 'e1700000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into document_test_results (name, id) select 'open', pg_temp.new_purchase('Offener Einkauf');
insert into document_test_results (name, id) select 'finalized', pg_temp.new_purchase('Abgeschlossener Einkauf');
reset role;

select public.finalize_purchase_costing(
  'e1700000-0000-4000-8000-000000000011',
  (select id from document_test_results where name = 'finalized')
);
update document_test_results
set snapshot = pg_temp.business_state(id)
where name = 'finalized';

-- Belege hochladen: offener und abgeschlossener Einkauf nehmen beide an.
select set_config('request.jwt.claim.sub', 'e1700000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into public.purchase_documents (
  id, workspace_id, purchase_id, document_type, original_file_name, storage_path, mime_type, file_size, created_by
)
select
  'e1700000-0000-4000-8000-000000000021',
  'e1700000-0000-4000-8000-000000000011',
  (select id from document_test_results where name = 'open'),
  'invoice',
  'Rechnung Vinted.pdf',
  'purchase-documents/e1700000-0000-4000-8000-000000000011/'
    || (select id from document_test_results where name = 'open')
    || '/e1700000-0000-4000-8000-000000000021.pdf',
  'application/pdf',
  12345,
  'e1700000-0000-4000-8000-000000000001';

insert into public.purchase_documents (
  id, workspace_id, purchase_id, document_type, original_file_name, storage_path, mime_type, file_size, created_by
)
select
  'e1700000-0000-4000-8000-000000000022',
  'e1700000-0000-4000-8000-000000000011',
  (select id from document_test_results where name = 'finalized'),
  'payment_proof',
  'Zahlung.png',
  'purchase-documents/e1700000-0000-4000-8000-000000000011/'
    || (select id from document_test_results where name = 'finalized')
    || '/e1700000-0000-4000-8000-000000000022.png',
  'image/png',
  2048,
  'e1700000-0000-4000-8000-000000000001';
reset role;

select is(
  (select count(*) from public.purchase_documents),
  2::bigint,
  'Belege lassen sich auch an einem abgeschlossenen Einkauf hinterlegen'
);

select is(
  pg_temp.business_state((select id from document_test_results where name = 'finalized')),
  (select snapshot from document_test_results where name = 'finalized'),
  'Ein Beleg verändert Kosten, Positionen, Bestand und Abschlussstatus nicht'
);

select is(
  (select array[event.event_type, event.changes ->> 'document_type', event.changes ->> 'original_file_name']
   from public.business_events as event
   where event.entity_id = (select id from document_test_results where name = 'open')
     and event.event_type = 'purchase_document_added'),
  array['purchase_document_added', 'invoice', 'Rechnung Vinted.pdf'],
  'Das Hochladen erscheint mit Belegart und Dateiname in der Historie'
);

-- Pfadform ist erzwungen.
select set_config('request.jwt.claim.sub', 'e1700000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  format(
    $$insert into public.purchase_documents (workspace_id, purchase_id, document_type, original_file_name, storage_path, mime_type, file_size, created_by)
      values ('e1700000-0000-4000-8000-000000000011', %L, 'other', 'falsch.pdf', 'irgendwo/datei.pdf', 'application/pdf', 10, 'e1700000-0000-4000-8000-000000000001')$$,
    (select id from document_test_results where name = 'open')
  ),
  '23514',
  null,
  'ein Beleg außerhalb des kanonischen Pfads wird abgelehnt'
);

select throws_ok(
  $$update public.purchase_documents set original_file_name = 'anders.pdf'$$,
  '42501',
  null,
  'Belegmetadaten sind unveränderlich'
);

-- Löschen: vor dem Abschluss erlaubt, danach nicht mehr.
delete from public.purchase_documents where id = 'e1700000-0000-4000-8000-000000000022';
delete from public.purchase_documents where id = 'e1700000-0000-4000-8000-000000000021';
reset role;

select is(
  (select array_agg(id::text order by id::text) from public.purchase_documents),
  array['e1700000-0000-4000-8000-000000000022'],
  'nur der Beleg des offenen Einkaufs wurde entfernt'
);

select is(
  (select count(*) from public.business_events where event_type = 'purchase_document_removed'),
  1::bigint,
  'das Entfernen steht als eigenes Ereignis in der Historie'
);

-- Fremder Workspace sieht und schreibt nichts.
select set_config('request.jwt.claim.sub', 'e1700000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select count(*) from public.purchase_documents),
  0::bigint,
  'ein fremder Workspace sieht keine Belege'
);

select throws_ok(
  format(
    $$insert into public.purchase_documents (workspace_id, purchase_id, document_type, original_file_name, storage_path, mime_type, file_size, created_by)
      values ('e1700000-0000-4000-8000-000000000011', %L, 'other', 'fremd.pdf',
        'purchase-documents/e1700000-0000-4000-8000-000000000011/%s/e1700000-0000-4000-8000-000000000031.pdf',
        'application/pdf', 10, 'e1700000-0000-4000-8000-000000000002')$$,
    (select id from document_test_results where name = 'finalized'),
    (select id from document_test_results where name = 'finalized')
  ),
  '42501',
  null,
  'ein fremder Workspace kann keinen Beleg anlegen'
);
reset role;

select * from finish();
rollback;
