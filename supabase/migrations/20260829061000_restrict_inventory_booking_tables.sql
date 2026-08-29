-- zweck: direkte schreibzugriffe auf transaktionale buchungstabellen sperren.
-- betroffen: public.stock_lots, public.stock_movements, public.sale_lines,
-- public.sale_line_lot_allocations.

revoke insert, update, delete on table public.stock_lots from authenticated;
revoke insert, update, delete on table public.stock_movements from authenticated;
revoke insert, update, delete on table public.sale_lines from authenticated;
revoke insert, update, delete on table public.sale_line_lot_allocations from authenticated;
