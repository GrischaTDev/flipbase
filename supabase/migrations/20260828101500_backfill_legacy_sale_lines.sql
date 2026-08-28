-- zweck: historische einzelartikel-verkaeufe als unveraenderbare verkaufspositionen nachziehen.
-- betroffen: public.sales, public.inventory_items, public.sale_lines.
-- keine bestandslose oder bestandsbewegungen fuer historische daten erzeugen.

insert into public.sale_lines (
  workspace_id,
  sale_id,
  inventory_item_id,
  title_snapshot,
  quantity,
  unit_sale_price,
  line_total,
  cost_of_goods_sold,
  tax_mode
)
select
  sale.workspace_id,
  sale.id,
  item.id,
  item.title,
  1,
  sale.sale_price,
  sale.sale_price,
  item.allocated_purchase_cost,
  coalesce(item.tax_mode_override, workspace.tax_mode)
from public.sales as sale
join public.inventory_items as item
  on item.id = sale.inventory_item_id
 and item.workspace_id = sale.workspace_id
join public.workspaces as workspace
  on workspace.id = sale.workspace_id
where not exists (
  select 1
  from public.sale_lines as sale_line
  where sale_line.sale_id = sale.id
);
