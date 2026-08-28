\set ON_ERROR_STOP on

-- Dieser Test wird ausschliesslich durch run_inventory_sales_legacy_migration.ps1
-- gestartet. Der Runner kopiert die echte Migrationsdatei nach
-- /tmp/flipbase-task9-backfill.sql; die beiden \i-Aufrufe testen damit den
-- veröffentlichten Migrationsinhalt und keine nachgebildete Abfrage.

begin;

do $$
declare
  v_workspace_default uuid := gen_random_uuid();
  v_workspace_klein uuid := gen_random_uuid();
  v_workspace_invalid uuid := gen_random_uuid();
  v_purchase_id uuid := gen_random_uuid();
  v_item_id uuid := gen_random_uuid();
  v_media_id uuid := gen_random_uuid();
begin
  insert into public.workspaces (id, name, tax_mode)
  values
    (v_workspace_default, 'legacy migration default tax', 'diff_25a'),
    (v_workspace_klein, 'legacy migration klein tax', 'kleinunternehmer_19'),
    (v_workspace_invalid, 'legacy migration invalid tax', 'unbekannte-altsteuer');

  insert into public.purchases (id, workspace_id, type, title)
  values (v_purchase_id, v_workspace_default, 'single', 'Legacy purchase');

  insert into public.inventory_items (
    id, workspace_id, purchase_id, title, status, allocated_purchase_cost, tax_mode_override
  ) values (
    v_item_id, v_workspace_default, v_purchase_id, 'Legacy mystery item', 'sold', 12.34, null
  );
  insert into public.item_media (id, inventory_item_id, storage_path, file_name)
  values (v_media_id, v_item_id, 'legacy/legacy-mystery-item.webp', 'legacy-mystery-item.webp');

  insert into public.sales (
    id, workspace_id, inventory_item_id, platform, sale_price, sale_price_total, sale_date
  ) values (gen_random_uuid(), v_workspace_default, v_item_id, 'ebay', 29.99, 29.99, '2026-08-20');

  insert into public.inventory_items (workspace_id, title, status, allocated_purchase_cost, tax_mode_override)
  values
    (v_workspace_default, 'valid diff override', 'sold', 1, 'diff_25a'),
    (v_workspace_default, 'valid klein override', 'sold', 1, 'kleinunternehmer_19'),
    (v_workspace_default, 'valid regular override', 'sold', 1, 'regular_19'),
    (v_workspace_klein, 'invalid override fallback', 'sold', 1, 'historischer freitext'),
    (v_workspace_invalid, 'invalid workspace fallback', 'sold', 1, null),
    (v_workspace_invalid, 'override beats invalid workspace', 'sold', 1, 'regular_19');

  insert into public.sales (
    workspace_id, inventory_item_id, platform, sale_price, sale_price_total, sale_date
  )
  select item.workspace_id, item.id, 'ebay', 10, 10, '2026-08-20'
  from public.inventory_items as item
  where item.title in (
    'valid diff override',
    'valid klein override',
    'valid regular override',
    'invalid override fallback',
    'invalid workspace fallback',
    'override beats invalid workspace'
  );
end;
$$;

\i /tmp/flipbase-task9-backfill.sql
\i /tmp/flipbase-task9-backfill.sql

do $$
declare
  v_line_count integer;
  v_lot_count integer;
  v_movement_count integer;
begin
  select count(*) into v_line_count
  from public.sale_lines as line
  join public.sales as sale on sale.id = line.sale_id
  join public.inventory_items as item on item.id = line.inventory_item_id
  where item.title = 'Legacy mystery item'
    and line.quantity = 1
    and line.unit_sale_price = 29.99
    and line.line_total = 29.99
    and line.cost_of_goods_sold = 12.34
    and line.tax_mode = 'diff_25a';
  if v_line_count <> 1 then
    raise exception 'legacy sale must receive exactly one matching sale line, got %', v_line_count;
  end if;

  if not exists (
    select 1
    from public.inventory_items as item
    join public.item_media as media on media.inventory_item_id = item.id
    join public.sales as sale on sale.inventory_item_id = item.id
    where item.title = 'Legacy mystery item'
      and item.allocated_purchase_cost = 12.34
      and media.storage_path = 'legacy/legacy-mystery-item.webp'
      and sale.sale_price = 29.99
      and sale.sale_price_total = 29.99
  ) then
    raise exception 'legacy inventory item, media, or sale is no longer readable unchanged';
  end if;

  if exists (
    select 1 from public.sale_lines as line
    join public.inventory_items as item on item.id = line.inventory_item_id
    where item.title = 'valid diff override' and line.tax_mode <> 'diff_25a'
  ) or exists (
    select 1 from public.sale_lines as line
    join public.inventory_items as item on item.id = line.inventory_item_id
    where item.title = 'valid klein override' and line.tax_mode <> 'kleinunternehmer_19'
  ) or exists (
    select 1 from public.sale_lines as line
    join public.inventory_items as item on item.id = line.inventory_item_id
    where item.title = 'valid regular override' and line.tax_mode <> 'regular_19'
  ) or exists (
    select 1 from public.sale_lines as line
    join public.inventory_items as item on item.id = line.inventory_item_id
    where item.title = 'invalid override fallback' and line.tax_mode <> 'kleinunternehmer_19'
  ) or exists (
    select 1 from public.sale_lines as line
    join public.inventory_items as item on item.id = line.inventory_item_id
    where item.title = 'invalid workspace fallback' and line.tax_mode <> 'diff_25a'
  ) or exists (
    select 1 from public.sale_lines as line
    join public.inventory_items as item on item.id = line.inventory_item_id
    where item.title = 'override beats invalid workspace' and line.tax_mode <> 'regular_19'
  ) then
    raise exception 'legacy tax mode fallback did not produce the documented valid value';
  end if;

  select count(*) into v_line_count
  from public.sale_lines as line
  join public.inventory_items as item on item.id = line.inventory_item_id
  where item.title in (
    'Legacy mystery item',
    'valid diff override',
    'valid klein override',
    'valid regular override',
    'invalid override fallback',
    'invalid workspace fallback',
    'override beats invalid workspace'
  );
  if v_line_count <> 7 then
    raise exception 'legacy sale-line migration is not idempotent, got % rows', v_line_count;
  end if;

  select count(*) into v_lot_count
  from public.stock_lots as lot
  join public.workspaces as workspace on workspace.id = lot.workspace_id
  where workspace.name like 'legacy migration %';
  select count(*) into v_movement_count
  from public.stock_movements as movement
  join public.stock_lots as lot on lot.id = movement.stock_lot_id
  join public.workspaces as workspace on workspace.id = lot.workspace_id
  where workspace.name like 'legacy migration %';
  if v_lot_count <> 0 or v_movement_count <> 0 then
    raise exception 'legacy migration must not fabricate lots or stock movements';
  end if;
end;
$$;

rollback;
