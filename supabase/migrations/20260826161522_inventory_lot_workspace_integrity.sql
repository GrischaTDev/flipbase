-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP POLICY catalog_products_delete ON public.catalog_products;

DROP POLICY catalog_products_insert ON public.catalog_products;

DROP POLICY catalog_products_select ON public.catalog_products;

DROP POLICY catalog_products_update ON public.catalog_products;

DROP POLICY purchase_lines_delete ON public.purchase_lines;

DROP POLICY purchase_lines_insert ON public.purchase_lines;

DROP POLICY purchase_lines_select ON public.purchase_lines;

DROP POLICY purchase_lines_update ON public.purchase_lines;

DROP POLICY sale_line_lot_allocations_insert ON public.sale_line_lot_allocations;

DROP POLICY sale_line_lot_allocations_select ON public.sale_line_lot_allocations;

DROP POLICY sale_lines_delete ON public.sale_lines;

DROP POLICY sale_lines_insert ON public.sale_lines;

DROP POLICY sale_lines_select ON public.sale_lines;

DROP POLICY sale_lines_update ON public.sale_lines;

DROP POLICY stock_lots_delete ON public.stock_lots;

DROP POLICY stock_lots_insert ON public.stock_lots;

DROP POLICY stock_lots_select ON public.stock_lots;

DROP POLICY stock_lots_update ON public.stock_lots;

DROP POLICY stock_movements_insert ON public.stock_movements;

DROP POLICY stock_movements_select ON public.stock_movements;

COMMENT ON TABLE public.catalog_products IS 'Artikelstamm je Workspace.';

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_workspace_id_id_key UNIQUE (workspace_id, id);

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.catalog_products FROM authenticated;

CREATE POLICY "Artikelstamm aendern" ON public.catalog_products
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Artikelstamm anlegen" ON public.catalog_products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Artikelstamm lesen" ON public.catalog_products
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Artikelstamm loeschen" ON public.catalog_products
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_workspace_id_id_key UNIQUE (workspace_id, id);

COMMENT ON TABLE public.purchase_lines IS 'Einkaufspositionen je Workspace.';

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_workspace_catalog_product_fkey FOREIGN KEY (workspace_id, catalog_product_id) REFERENCES public.catalog_products(workspace_id, id)
    ON DELETE RESTRICT;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_workspace_purchase_line_fkey FOREIGN KEY (workspace_id, purchase_line_id) REFERENCES public.purchase_lines(workspace_id, id) ON DELETE SET NULL;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.purchase_lines FROM authenticated;

CREATE POLICY "Einkaufspositionen aendern" ON public.purchase_lines
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Einkaufspositionen anlegen" ON public.purchase_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Einkaufspositionen lesen" ON public.purchase_lines
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Einkaufspositionen loeschen" ON public.purchase_lines
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_workspace_purchase_fkey FOREIGN KEY (workspace_id, purchase_id) REFERENCES public.purchases(workspace_id, id) ON DELETE CASCADE;

COMMENT ON TABLE public.sale_line_lot_allocations IS 'Loszuordnungen mit Kosten-Snapshot.';

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sale_line_lot_allocations FROM authenticated;

CREATE POLICY "Loszuordnungen anlegen" ON public.sale_line_lot_allocations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Loszuordnungen lesen" ON public.sale_line_lot_allocations
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

COMMENT ON TABLE public.sale_lines IS 'Verkaufspositionen mit Kosten-Snapshot.';

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_workspace_catalog_product_fkey FOREIGN KEY (workspace_id, catalog_product_id) REFERENCES public.catalog_products(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_workspace_sale_line_fkey FOREIGN KEY (workspace_id, sale_line_id) REFERENCES public.sale_lines(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_workspace_inventory_item_fkey FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES public.inventory_items(workspace_id, id) ON DELETE RESTRICT;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sale_lines FROM authenticated;

CREATE POLICY "Verkaufspositionen aendern" ON public.sale_lines
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Verkaufspositionen anlegen" ON public.sale_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Verkaufspositionen lesen" ON public.sale_lines
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Verkaufspositionen loeschen" ON public.sale_lines
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.sales
  ADD CONSTRAINT sales_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_workspace_sale_fkey FOREIGN KEY (workspace_id, sale_id) REFERENCES public.sales(workspace_id, id) ON DELETE CASCADE;

COMMENT ON TABLE public.stock_lots IS 'Bestandslose mit FIFO-Kosten.';

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_workspace_catalog_product_fkey FOREIGN KEY (workspace_id, catalog_product_id) REFERENCES public.catalog_products(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_workspace_stock_lot_fkey FOREIGN KEY (workspace_id, stock_lot_id) REFERENCES public.stock_lots(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_workspace_purchase_fkey FOREIGN KEY (workspace_id, purchase_id) REFERENCES public.purchases(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_workspace_purchase_line_fkey FOREIGN KEY (workspace_id, purchase_line_id) REFERENCES public.purchase_lines(workspace_id, id) ON DELETE RESTRICT;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stock_lots FROM authenticated;

CREATE POLICY "Bestandslose aendern" ON public.stock_lots
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Bestandslose anlegen" ON public.stock_lots
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Bestandslose lesen" ON public.stock_lots
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Bestandslose loeschen" ON public.stock_lots
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

COMMENT ON TABLE public.stock_movements IS 'Unveraenderbare Bestandsbewegungen.';

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_workspace_sale_line_fkey FOREIGN KEY (workspace_id, sale_line_id) REFERENCES public.sale_lines(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_workspace_stock_lot_fkey FOREIGN KEY (workspace_id, stock_lot_id) REFERENCES public.stock_lots(workspace_id, id) ON DELETE RESTRICT;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stock_movements FROM authenticated;

CREATE POLICY "Bestandsbewegungen anlegen" ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Bestandsbewegungen lesen" ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));