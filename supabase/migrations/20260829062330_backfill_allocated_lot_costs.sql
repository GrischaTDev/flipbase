-- zweck: den centgenauen kostenverbrauch bestehender loszuordnungen nachziehen.
-- betroffen: public.sale_line_lot_allocations. bestandsmengen bleiben unverändert.

update public.sale_line_lot_allocations
set allocated_cost = round(quantity * unit_cost, 2)
where allocated_cost = 0
  and unit_cost > 0;
