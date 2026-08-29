-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.inventory_items
  DROP CONSTRAINT inventory_items_purchase_line_id_fkey;

ALTER TABLE public.inventory_items
  DROP CONSTRAINT inventory_items_workspace_purchase_line_fkey;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_purchase_line_id_fkey FOREIGN KEY (purchase_line_id) REFERENCES public.purchase_lines(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_workspace_purchase_line_fkey FOREIGN KEY (workspace_id, purchase_line_id) REFERENCES public.purchase_lines(workspace_id, id) ON DELETE RESTRICT;