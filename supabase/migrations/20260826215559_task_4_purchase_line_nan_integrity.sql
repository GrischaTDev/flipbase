-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_check;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_line_total_check;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_ordered_quantity_check;

ALTER TABLE public.purchase_lines
  DROP CONSTRAINT purchase_lines_unit_purchase_price_check;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_check CHECK (received_quantity >= 0 AND received_quantity <= ordered_quantity AND received_quantity::numeric <> 'NaN'::numeric);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_line_total_check CHECK (line_total <> 'NaN'::numeric AND line_total >= 0::numeric AND scale(line_total) <= 2);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_ordered_quantity_check CHECK (ordered_quantity > 0 AND ordered_quantity::numeric <> 'NaN'::numeric);

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_unit_purchase_price_check CHECK (unit_purchase_price <> 'NaN'::numeric AND unit_purchase_price >= 0::numeric AND scale(unit_purchase_price) <= 2);