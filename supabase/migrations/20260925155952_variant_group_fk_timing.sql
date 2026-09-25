-- Zweck: Bestehende Workspace-Prüfung für Store-Bestellpositionen vor dem
-- Varianten-Fremdschlüssel ausführen; die Gruppenprüfung bleibt am Transaktionsende aktiv.
-- Betroffen: public.catalog_products, catalog_products_variant_group_fkey.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.catalog_products
  DROP CONSTRAINT catalog_products_variant_group_fkey;

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_variant_group_fkey FOREIGN KEY (workspace_id, variant_group_id) REFERENCES public.catalog_product_groups(workspace_id, id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;
