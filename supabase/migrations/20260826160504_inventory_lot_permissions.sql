-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.catalog_products FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.purchase_lines FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sale_line_lot_allocations FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sale_lines FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stock_lots FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stock_movements FROM anon;