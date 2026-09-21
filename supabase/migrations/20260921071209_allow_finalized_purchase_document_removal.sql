-- Zweck: Falsch zugeordnete Einkaufsbelege auch nach Abschluss korrigierbar machen.
-- Betroffen: public.purchase_documents und storage.objects (nur Delete-Policies).

drop policy "Belege offener Einkaeufe loeschen" on public.purchase_documents;

create policy "Belege entfernen" on public.purchase_documents
  as permissive
  for delete to authenticated
  using (
    (select public.is_workspace_member(workspace_id))
    and exists (
      select 1
      from public.purchases as purchase
      where purchase.workspace_id = purchase_documents.workspace_id
        and purchase.id = purchase_documents.purchase_id
    )
  );

drop policy "Belege offener Einkaeufe entfernen" on storage.objects;

create policy "Belegdateien entfernen" on storage.objects
  as permissive
  for delete to authenticated
  using (
    bucket_id = 'purchase-documents'
    and exists (
      select 1
      from public.purchases as purchase
      where purchase.workspace_id::text = (storage.foldername(name))[2]
        and purchase.id::text = (storage.foldername(name))[3]
        and public.is_purchase_document_path(name, purchase.workspace_id, purchase.id)
        and (select public.is_workspace_member(purchase.workspace_id))
    )
  );
