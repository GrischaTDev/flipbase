-- zweck: artikelstamm, einkaufspositionen, bestandslose und verkaufslinien einfuehren.
-- betroffen: purchases, inventory_items, sales sowie die neuen warenwirtschaftstabellen.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.sales
  ALTER COLUMN inventory_item_id DROP NOT NULL;

CREATE TABLE public.catalog_products (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id    uuid                     NOT NULL,
  title           text                     NOT NULL,
  brand           text,
  model           text,
  ean             text,
  category        text,
  tracking_mode   text                     NOT NULL,
  is_public_store boolean                  DEFAULT false NOT NULL,
  listing_price   numeric(12,2),
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.catalog_products
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_listing_price_check CHECK (listing_price IS NULL OR listing_price > 0::numeric);

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_pkey PRIMARY KEY (id);

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_tracking_mode_check CHECK (tracking_mode = ANY (ARRAY['quantity'::text, 'individual'::text]));

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_workspace_id_ean_key UNIQUE (workspace_id, ean);

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT ALL ON public.catalog_products TO authenticated;

GRANT ALL ON public.catalog_products TO service_role;

CREATE INDEX idx_catalog_products_workspace_id ON public.catalog_products (workspace_id);

CREATE POLICY catalog_products_delete ON public.catalog_products
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY catalog_products_insert ON public.catalog_products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY catalog_products_select ON public.catalog_products
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY catalog_products_update ON public.catalog_products
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

ALTER TABLE public.inventory_items
  ADD COLUMN purchase_line_id uuid;

CREATE INDEX idx_inventory_items_purchase_line_id ON public.inventory_items (purchase_line_id);

CREATE TABLE public.purchase_lines (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id        uuid                     NOT NULL,
  purchase_id         uuid                     NOT NULL,
  catalog_product_id  uuid,
  title_snapshot      text                     NOT NULL,
  line_kind           text                     NOT NULL,
  ordered_quantity    integer                  NOT NULL,
  received_quantity   integer                  DEFAULT 0 NOT NULL,
  unit_purchase_price numeric(12,2)            NOT NULL,
  line_total          numeric(12,2)            NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.purchase_lines
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_catalog_product_id_fkey FOREIGN KEY (catalog_product_id) REFERENCES public.catalog_products(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_check CHECK (received_quantity >= 0 AND received_quantity <= ordered_quantity);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_check1 CHECK (line_kind = 'quantity'::text AND catalog_product_id IS NOT NULL OR line_kind = 'individual'::text);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_line_kind_check CHECK (line_kind = ANY (ARRAY['quantity'::text, 'individual'::text]));

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_line_total_check CHECK (line_total >= 0::numeric);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_ordered_quantity_check CHECK (ordered_quantity > 0);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_pkey PRIMARY KEY (id);

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_purchase_line_id_fkey FOREIGN KEY (purchase_line_id) REFERENCES public.purchase_lines(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_unit_purchase_price_check CHECK (unit_purchase_price >= 0::numeric);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT ALL ON public.purchase_lines TO authenticated;

GRANT ALL ON public.purchase_lines TO service_role;

CREATE INDEX idx_purchase_lines_catalog_product_id ON public.purchase_lines (catalog_product_id);

CREATE INDEX idx_purchase_lines_purchase_id ON public.purchase_lines (purchase_id);

CREATE INDEX idx_purchase_lines_workspace_id ON public.purchase_lines (workspace_id);

CREATE POLICY purchase_lines_delete ON public.purchase_lines
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY purchase_lines_insert ON public.purchase_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY purchase_lines_select ON public.purchase_lines
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY purchase_lines_update ON public.purchase_lines
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

ALTER TABLE public.purchases
  ADD COLUMN receiving_status text DEFAULT 'received'::text NOT NULL;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_receiving_status_check
    CHECK (receiving_status = ANY (ARRAY['draft'::text, 'ordered'::text, 'partially_received'::text, 'received'::text, 'archived'::text]));

CREATE TABLE public.sale_line_lot_allocations (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  sale_line_id uuid                     NOT NULL,
  stock_lot_id uuid                     NOT NULL,
  quantity     integer                  NOT NULL,
  unit_cost    numeric(12,2)            NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.sale_line_lot_allocations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_pkey PRIMARY KEY (id);

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_quantity_check CHECK (quantity > 0);

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_sale_line_id_stock_lot_id_key UNIQUE (sale_line_id, stock_lot_id);

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_unit_cost_check CHECK (unit_cost >= 0::numeric);

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT ALL ON public.sale_line_lot_allocations TO authenticated;

GRANT ALL ON public.sale_line_lot_allocations TO service_role;

CREATE INDEX idx_sale_line_lot_allocations_workspace_id ON public.sale_line_lot_allocations (workspace_id);

CREATE INDEX idx_sale_line_lot_allocations_sale_line_id ON public.sale_line_lot_allocations (sale_line_id);

CREATE INDEX idx_sale_line_lot_allocations_stock_lot_id ON public.sale_line_lot_allocations (stock_lot_id);

CREATE POLICY sale_line_lot_allocations_insert ON public.sale_line_lot_allocations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY sale_line_lot_allocations_select ON public.sale_line_lot_allocations
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE TABLE public.sale_lines (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id       uuid                     NOT NULL,
  sale_id            uuid                     NOT NULL,
  catalog_product_id uuid,
  inventory_item_id  uuid,
  title_snapshot     text                     NOT NULL,
  quantity           integer                  NOT NULL,
  unit_sale_price    numeric(12,2)            NOT NULL,
  line_total         numeric(12,2)            NOT NULL,
  cost_of_goods_sold numeric(12,2)            NOT NULL,
  tax_mode           text                     NOT NULL,
  created_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.sale_lines
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_catalog_product_id_fkey FOREIGN KEY (catalog_product_id) REFERENCES public.catalog_products(id) ON DELETE RESTRICT;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_check CHECK (num_nonnulls(catalog_product_id, inventory_item_id) = 1);

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_cost_of_goods_sold_check CHECK (cost_of_goods_sold >= 0::numeric);

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_line_total_check CHECK (line_total >= 0::numeric);

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_pkey PRIMARY KEY (id);

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_sale_line_id_fkey FOREIGN KEY (sale_line_id) REFERENCES public.sale_lines(id) ON DELETE RESTRICT;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_quantity_check CHECK (quantity > 0);

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_tax_mode_check CHECK (tax_mode = ANY (ARRAY['diff_25a'::text, 'kleinunternehmer_19'::text, 'regular_19'::text]));

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_unit_sale_price_check CHECK (unit_sale_price >= 0::numeric);

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT ALL ON public.sale_lines TO authenticated;

GRANT ALL ON public.sale_lines TO service_role;

CREATE INDEX idx_sale_lines_inventory_item_id ON public.sale_lines (inventory_item_id);

CREATE INDEX idx_sale_lines_workspace_id ON public.sale_lines (workspace_id);

CREATE INDEX idx_sale_lines_sale_id ON public.sale_lines (sale_id);

CREATE INDEX idx_sale_lines_catalog_product_id ON public.sale_lines (catalog_product_id);

CREATE POLICY sale_lines_delete ON public.sale_lines
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY sale_lines_insert ON public.sale_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY sale_lines_select ON public.sale_lines
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY sale_lines_update ON public.sale_lines
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

ALTER TABLE public.sales
  ADD COLUMN sale_price_total numeric(12,2);

update public.sales
set sale_price_total = sale_price
where sale_price_total is null;

CREATE TABLE public.stock_lots (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id       uuid                     NOT NULL,
  purchase_id        uuid                     NOT NULL,
  purchase_line_id   uuid                     NOT NULL,
  catalog_product_id uuid                     NOT NULL,
  received_quantity  integer                  NOT NULL,
  remaining_quantity integer                  NOT NULL,
  unit_cost          numeric(12,2)            NOT NULL,
  received_at        timestamp with time zone DEFAULT now() NOT NULL,
  created_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.stock_lots
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_catalog_product_id_fkey FOREIGN KEY (catalog_product_id) REFERENCES public.catalog_products(id) ON DELETE RESTRICT;

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_check CHECK (remaining_quantity >= 0 AND remaining_quantity <= received_quantity);

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_pkey PRIMARY KEY (id);

ALTER TABLE public.sale_line_lot_allocations
  ADD CONSTRAINT sale_line_lot_allocations_stock_lot_id_fkey FOREIGN KEY (stock_lot_id) REFERENCES public.stock_lots(id) ON DELETE RESTRICT;

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE RESTRICT;

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_purchase_line_id_fkey FOREIGN KEY (purchase_line_id) REFERENCES public.purchase_lines(id) ON DELETE RESTRICT;

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_received_quantity_check CHECK (received_quantity > 0);

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_unit_cost_check CHECK (unit_cost >= 0::numeric);

ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT ALL ON public.stock_lots TO authenticated;

GRANT ALL ON public.stock_lots TO service_role;

CREATE INDEX idx_stock_lots_workspace_catalog_received ON public.stock_lots (workspace_id, catalog_product_id, received_at, id);

CREATE INDEX idx_stock_lots_purchase_line_id ON public.stock_lots (purchase_line_id);

CREATE INDEX idx_stock_lots_catalog_product_id ON public.stock_lots (catalog_product_id);

CREATE INDEX idx_stock_lots_workspace_id ON public.stock_lots (workspace_id);

CREATE INDEX idx_stock_lots_purchase_id ON public.stock_lots (purchase_id);

CREATE POLICY stock_lots_delete ON public.stock_lots
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY stock_lots_insert ON public.stock_lots
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY stock_lots_select ON public.stock_lots
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY stock_lots_update ON public.stock_lots
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE TABLE public.stock_movements (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  stock_lot_id uuid                     NOT NULL,
  sale_line_id uuid,
  direction    text                     NOT NULL,
  quantity     integer                  NOT NULL,
  reason       text                     NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.stock_movements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_direction_check CHECK (direction = ANY (ARRAY['in'::text, 'out'::text]));

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_quantity_check CHECK (quantity > 0);

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_reason_check
    CHECK (reason = ANY (ARRAY['receipt'::text, 'sale'::text, 'return'::text, 'correction'::text, 'damage'::text, 'loss'::text, 'reservation'::text, 'reservation_release'::text]));

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_sale_line_id_fkey FOREIGN KEY (sale_line_id) REFERENCES public.sale_lines(id) ON DELETE RESTRICT;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_stock_lot_id_fkey FOREIGN KEY (stock_lot_id) REFERENCES public.stock_lots(id) ON DELETE RESTRICT;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT ALL ON public.stock_movements TO authenticated;

GRANT ALL ON public.stock_movements TO service_role;

CREATE INDEX idx_stock_movements_sale_line_id ON public.stock_movements (sale_line_id);

CREATE INDEX idx_stock_movements_workspace_id ON public.stock_movements (workspace_id);

CREATE INDEX idx_stock_movements_workspace_created ON public.stock_movements (workspace_id, created_at DESC);

CREATE INDEX idx_stock_movements_stock_lot_id ON public.stock_movements (stock_lot_id);

CREATE POLICY stock_movements_insert ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY stock_movements_select ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));
