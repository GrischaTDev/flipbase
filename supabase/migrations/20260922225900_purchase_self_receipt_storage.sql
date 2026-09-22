-- Zweck: Erzeugte Eigenbeleg-Dateien vor dem Loeschen schuetzen.
-- Betroffen: storage.objects, Policy "Belegdateien entfernen".
drop policy "Belegdateien entfernen" on storage.objects;
create policy "Belegdateien entfernen" on storage.objects for delete to authenticated using (((bucket_id = 'purchase-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.purchases purchase
  WHERE (((purchase.workspace_id)::text = (storage.foldername(objects.name))[2]) AND ((purchase.id)::text = (storage.foldername(objects.name))[3]) AND public.is_purchase_document_path(objects.name, purchase.workspace_id, purchase.id) AND ( SELECT public.is_workspace_member(purchase.workspace_id) AS is_workspace_member) AND (NOT (EXISTS ( SELECT 1
           FROM public.purchase_documents document
          WHERE ((document.storage_path = objects.name) AND (document.document_type = 'self_receipt'::text))))))))));
