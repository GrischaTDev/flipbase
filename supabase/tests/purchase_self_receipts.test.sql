\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('e2300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'self-receipt@example.test', '{}', '{}');
insert into public.workspaces (id, name, tax_mode)
values ('e2300000-0000-4000-8000-000000000011', 'Eigenbelege', 'diff_25a');
insert into public.workspace_members (workspace_id, user_id, role)
values ('e2300000-0000-4000-8000-000000000011',
        'e2300000-0000-4000-8000-000000000001', 'owner');
insert into public.suppliers (id, workspace_id, name)
values ('e2300000-0000-4000-8000-000000000031',
        'e2300000-0000-4000-8000-000000000011', 'Gespeicherter Verkäufer');

select set_config('request.jwt.claim.sub', 'e2300000-0000-4000-8000-000000000001', true);
set local role authenticated;

create temporary table self_receipt_test_purchase (id uuid);
grant all on self_receipt_test_purchase to authenticated;
insert into self_receipt_test_purchase (id)
select (public.create_purchase(
  'e2300000-0000-4000-8000-000000000011',
  jsonb_build_object(
    'type', 'single', 'title', 'Jacke', 'purchase_date', '2026-09-23',
    'purchase_price', 25, 'receipt_mode', 'self', 'seller_name', '@vintage_user'
  ),
  '[]'::jsonb,
  '[{"client_ref":"line-1","title_snapshot":"Jacke","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":25,"line_total":25}]'::jsonb
) #>> '{purchase,id}')::uuid;

select is((select receipt_mode from public.purchases where id =
  (select id from self_receipt_test_purchase)), 'self',
  'Eigenbelegmodus wird beim Anlegen gespeichert');
select is((select seller_name from public.purchases where id =
  (select id from self_receipt_test_purchase)), '@vintage_user',
  'Bekannte Verkäuferkennung bleibt am Einkauf');
select is((select supplier_id from public.purchases where id =
  (select id from self_receipt_test_purchase)), null::uuid,
  'Eigenbeleg braucht keinen gespeicherten Verkäufer');

reset role;
select throws_ok($$
  update public.purchases
  set supplier_id = 'e2300000-0000-4000-8000-000000000031'
  where id = (select id from self_receipt_test_purchase)
$$, '23514', null, 'Eigenbelegmodus und gespeicherter Verkäufer schließen sich aus');
set local role authenticated;

select public.finalize_purchase_costing(
  'e2300000-0000-4000-8000-000000000011',
  (select id from self_receipt_test_purchase)
);

insert into public.purchase_documents (
  id, workspace_id, purchase_id, document_type, source_finalized_at,
  original_file_name, storage_path, mime_type, file_size, created_by
)
select
  'e2300000-0000-4000-8000-000000000021',
  'e2300000-0000-4000-8000-000000000011',
  purchase.id, 'self_receipt', purchase.finalized_at,
  'Eigenbeleg.pdf',
  'purchase-documents/e2300000-0000-4000-8000-000000000011/' || purchase.id ||
    '/e2300000-0000-4000-8000-000000000021.pdf',
  'application/pdf', 1500, 'e2300000-0000-4000-8000-000000000001'
from public.purchases as purchase
where purchase.id = (select id from self_receipt_test_purchase);

select is((select count(*)::integer from public.purchase_documents
  where document_type = 'self_receipt' and purchase_id =
    (select id from self_receipt_test_purchase)), 1,
  'Eigenbeleg ist dem abgeschlossenen Einkauf zugeordnet');

select throws_ok($$
  insert into public.purchase_documents (
    id, workspace_id, purchase_id, document_type, source_finalized_at,
    original_file_name, storage_path, mime_type, file_size, created_by
  )
  select 'e2300000-0000-4000-8000-000000000022',
    'e2300000-0000-4000-8000-000000000011', purchase.id,
    'self_receipt', purchase.finalized_at, 'Doppelt.pdf',
    'purchase-documents/e2300000-0000-4000-8000-000000000011/' || purchase.id ||
      '/e2300000-0000-4000-8000-000000000022.pdf',
    'application/pdf', 1500, 'e2300000-0000-4000-8000-000000000001'
  from public.purchases as purchase
  where purchase.id = (select id from self_receipt_test_purchase)
$$, '23505', null, 'Dieselbe Abschlussfassung erhält keinen zweiten Eigenbeleg');

delete from public.purchase_documents
where id = 'e2300000-0000-4000-8000-000000000021';
select is((select count(*)::integer from public.purchase_documents
  where id = 'e2300000-0000-4000-8000-000000000021'), 1,
  'Ein erzeugter Eigenbeleg kann nicht gelöscht werden');

reset role;
insert into storage.objects (bucket_id, name)
select 'purchase-documents', document.storage_path
from public.purchase_documents as document
where document.id = 'e2300000-0000-4000-8000-000000000021';
set local role authenticated;
select set_config('storage.allow_delete_query', 'true', true);

delete from storage.objects
where name = (select storage_path from public.purchase_documents
  where id = 'e2300000-0000-4000-8000-000000000021');
select is((select count(*)::integer from storage.objects
  where name = (select storage_path from public.purchase_documents
    where id = 'e2300000-0000-4000-8000-000000000021')), 1,
  'Auch die gespeicherte Eigenbeleg-Datei kann nicht gelöscht werden');

reset role;
select * from finish();
rollback;
