\set ON_ERROR_STOP on

begin;

do $$
declare
  v_workspace_id uuid := gen_random_uuid();
  v_purchase_id uuid := gen_random_uuid();
  v_item_id uuid := gen_random_uuid();
  v_sale_id uuid := gen_random_uuid();
  v_media_id uuid := gen_random_uuid();
  v_line_count integer;
  v_lot_count integer;
  v_movement_count integer;
begin
  insert into public.workspaces (id, name, tax_mode)
  values (v_workspace_id, 'legacy migration acceptance', 'diff_25a');

  insert into public.purchases (id, workspace_id, type, title)
  values (v_purchase_id, v_workspace_id, 'single', 'Legacy purchase');

  insert into public.inventory_items (
    id, workspace_id, purchase_id, title, status, allocated_purchase_cost
  ) values (
    v_item_id, v_workspace_id, v_purchase_id, 'Legacy mystery item', 'sold', 12.34
  );

  insert into public.item_media (id, inventory_item_id, storage_path, file_name)
  values (v_media_id, v_item_id, 'legacy/legacy-mystery-item.webp', 'legacy-mystery-item.webp');

  insert into public.sales (
    id, workspace_id, inventory_item_id, platform, sale_price, sale_price_total, sale_date
  ) values (
    v_sale_id, v_workspace_id, v_item_id, 'ebay', 29.99, 29.99, '2026-08-20'
  );

  -- Simulates the data state immediately before the additive migration.
  insert into public.sale_lines (
    workspace_id, sale_id, inventory_item_id, title_snapshot, quantity,
    unit_sale_price, line_total, cost_of_goods_sold, tax_mode
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
  where sale.id = v_sale_id
    and not exists (
      select 1 from public.sale_lines as sale_line where sale_line.sale_id = sale.id
    );

  select count(*) into v_line_count
  from public.sale_lines
  where sale_id = v_sale_id
    and workspace_id = v_workspace_id
    and inventory_item_id = v_item_id
    and quantity = 1
    and unit_sale_price = 29.99
    and line_total = 29.99
    and cost_of_goods_sold = 12.34
    and tax_mode = 'diff_25a';
  if v_line_count <> 1 then
    raise exception 'legacy sale must receive exactly one matching sale line, got %', v_line_count;
  end if;

  if not exists (
    select 1
    from public.inventory_items as item
    join public.item_media as media on media.inventory_item_id = item.id
    join public.sales as sale on sale.inventory_item_id = item.id
    where item.id = v_item_id
      and item.title = 'Legacy mystery item'
      and item.allocated_purchase_cost = 12.34
      and media.id = v_media_id
      and media.storage_path = 'legacy/legacy-mystery-item.webp'
      and sale.id = v_sale_id
      and sale.sale_price = 29.99
      and sale.sale_price_total = 29.99
  ) then
    raise exception 'legacy inventory item, media, or sale is no longer readable unchanged';
  end if;

  select count(*) into v_lot_count
  from public.stock_lots
  where workspace_id = v_workspace_id;
  select count(*) into v_movement_count
  from public.stock_movements
  where workspace_id = v_workspace_id;
  if v_lot_count <> 0 or v_movement_count <> 0 then
    raise exception 'legacy migration must not fabricate lots or stock movements';
  end if;

  -- Idempotency: a second run must not duplicate the historical sale line.
  insert into public.sale_lines (
    workspace_id, sale_id, inventory_item_id, title_snapshot, quantity,
    unit_sale_price, line_total, cost_of_goods_sold, tax_mode
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
  where sale.id = v_sale_id
    and not exists (
      select 1 from public.sale_lines as sale_line where sale_line.sale_id = sale.id
    );

  select count(*) into v_line_count
  from public.sale_lines
  where sale_id = v_sale_id;
  if v_line_count <> 1 then
    raise exception 'legacy sale-line migration is not idempotent, got % rows', v_line_count;
  end if;
end;
$$;

rollback;
