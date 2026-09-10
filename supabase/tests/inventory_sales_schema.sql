\set ON_ERROR_STOP on

begin;

select plan(6);

do $$
declare
  required_columns text[] := array[
    'id', 'workspace_id', 'title', 'tracking_mode', 'is_public_store'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'catalog_products'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'catalog_products is missing required columns: %', missing_columns;
  end if;
end;
$$;

select pass('catalog_products besitzt alle benötigten Spalten');

do $$
declare
  required_columns text[] := array[
    'purchase_line_id', 'catalog_product_id', 'received_quantity',
    'remaining_quantity', 'unit_cost'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'stock_lots'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'stock_lots is missing required columns: %', missing_columns;
  end if;
end;
$$;

select pass('stock_lots besitzt alle benötigten Spalten');

do $$
declare
  required_columns text[] := array[
    'sale_id', 'catalog_product_id', 'inventory_item_id', 'quantity',
    'unit_sale_price', 'cost_of_goods_sold'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sale_lines'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'sale_lines is missing required columns: %', missing_columns;
  end if;
end;
$$;

select pass('sale_lines besitzt alle benötigten Spalten');

do $$
declare
  required_sales_columns text[] := array['shipping_revenue', 'shipping_mode'];
  missing_sales_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_sales_columns
  from unnest(required_sales_columns) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sales'
      and column_info.column_name = required.column_name
  );

  if missing_sales_columns is not null then
    raise exception 'sales is missing required shipping columns: %', missing_sales_columns;
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'sale_cost_entries'
  ) then
    raise exception 'sale_cost_entries table is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sales'::regclass
      and lower(pg_get_constraintdef(oid)) like '%shipping_mode%'
      and lower(pg_get_constraintdef(oid)) like '%seller_arranged%'
      and lower(pg_get_constraintdef(oid)) like '%platform_prepaid%'
      and lower(pg_get_constraintdef(oid)) like '%pickup%'
  ) then
    raise exception 'sales must restrict shipping_mode to the supported values';
  end if;
end;
$$;

select pass('Verkäufe speichern Versand-Erlös und strukturierte Kosten fachlich getrennt');

do $$
declare
  table_name text;
begin
  foreach table_name in array array['catalog_products', 'purchase_lines', 'stock_lots', 'stock_movements', 'sale_lines', 'sale_line_lot_allocations', 'sale_cost_entries'] loop
    if not exists (
      select 1 from pg_class as relation
      join pg_namespace as schema on schema.oid = relation.relnamespace
      where schema.nspname = 'public' and relation.relname = table_name and relation.relrowsecurity
    ) then
      raise exception '% must have row level security enabled', table_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('stock_movements', 'sale_line_lot_allocations')
      and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'movement and allocation history must not have update or delete policies';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sale_cost_entries'
      and roles = array['authenticated'::name]
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) <> 4 then
    raise exception 'sale_cost_entries must define one authenticated policy per operation';
  end if;

  if exists (
    select 1 from unnest(array['catalog_products', 'purchase_lines', 'stock_lots', 'stock_movements', 'sale_lines', 'sale_line_lot_allocations']) as required(table_name)
    where has_table_privilege('authenticated', format('public.%I', required.table_name), 'TRUNCATE')
  ) then
    raise exception 'authenticated must not have truncate privileges';
  end if;

  if exists (
    select 1 from public.sales where sale_price_total is distinct from sale_price
  ) then
    raise exception 'existing sales must be backfilled to sale_price_total';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_lines'::regclass
      and lower(pg_get_constraintdef(oid)) like '%num_nonnulls(catalog_product_id, inventory_item_id) = 1%'
  ) then
    raise exception 'sale_lines must enforce its catalog product XOR inventory item';
  end if;
end;
$$;

select pass('RLS-, Policy-, Rechte- und Constraint-Verträge sind vollständig');

do $$
declare
  workspace_one uuid := gen_random_uuid();
  workspace_two uuid := gen_random_uuid();
  purchase_one uuid := gen_random_uuid();
  product_one uuid := gen_random_uuid();
  product_two uuid := gen_random_uuid();
  line_one uuid := gen_random_uuid();
  lot_one uuid := gen_random_uuid();
  item_one uuid := gen_random_uuid();
  sale_one uuid := gen_random_uuid();
  sale_line_one uuid := gen_random_uuid();
  line_with_history uuid := gen_random_uuid();
  item_with_history uuid := gen_random_uuid();
begin
  insert into public.workspaces (id, name) values (workspace_one, 'schema test one'), (workspace_two, 'schema test two');
  insert into public.purchases (id, workspace_id, type, title) values (purchase_one, workspace_one, 'single', 'test purchase');
  insert into public.catalog_products (id, workspace_id, title, tracking_mode) values
    (product_one, workspace_one, 'test product', 'quantity'),
    (product_two, workspace_two, 'foreign product', 'quantity');
  insert into public.purchase_lines (id, workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind, ordered_quantity, unit_purchase_price, line_total)
    values (line_one, workspace_one, purchase_one, product_one, 'test product', 'quantity', 2, 5, 10);
  insert into public.stock_lots (id, workspace_id, purchase_id, purchase_line_id, catalog_product_id, received_quantity, remaining_quantity, unit_cost)
    values (lot_one, workspace_one, purchase_one, line_one, product_one, 2, 2, 5);
  insert into public.inventory_items (id, workspace_id, purchase_id, purchase_line_id, title)
    values (item_one, workspace_one, purchase_one, line_one, 'test item');
  insert into public.sales (id, workspace_id, inventory_item_id, platform, sale_price, sale_price_total)
    values (sale_one, workspace_one, item_one, 'direct', 10, 10);
  insert into public.sale_lines (id, workspace_id, sale_id, catalog_product_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode)
    values (sale_line_one, workspace_one, sale_one, product_one, 'valid sale line', 1, 10, 10, 5, 'diff_25a');
  insert into public.purchase_lines (id, workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind, ordered_quantity, unit_purchase_price, line_total)
    values (line_with_history, workspace_one, purchase_one, product_one, 'historical line', 'quantity', 1, 1, 1);
  insert into public.inventory_items (id, workspace_id, purchase_id, purchase_line_id, title)
    values (item_with_history, workspace_one, purchase_one, line_with_history, 'historical item');

  begin
    insert into public.purchase_lines (workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind, ordered_quantity, unit_purchase_price, line_total)
      values (workspace_one, purchase_one, product_two, 'foreign product', 'quantity', 1, 1, 1);
    raise exception 'cross-workspace purchase line was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.purchase_lines (workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind, ordered_quantity, unit_purchase_price, line_total)
      values (workspace_one, purchase_one, product_one, 'invalid line total', 'quantity', 2, 5, 10.01);
    raise exception 'mismatching purchase line total was accepted';
  exception when check_violation then null;
  end;

  -- Paketpreise können bei einer stückzahlunabhängigen Aufteilung einen
  -- präzisen rechnerischen Stückdurchschnitt benötigen. Die Positionssumme
  -- selbst bleibt weiterhin centgenau.
  insert into public.purchase_lines (
    workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind,
    ordered_quantity, unit_purchase_price, line_total
  ) values (
    workspace_one, purchase_one, product_one, 'precise unit average', 'quantity',
    3, 1.1133333333333333, 3.34
  );

  begin
    insert into public.purchase_lines (workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind, ordered_quantity, unit_purchase_price, line_total)
      values (workspace_one, purchase_one, product_one, 'NaN unit cost', 'quantity', 1, 'NaN'::numeric, 1);
    raise exception 'NaN unit purchase price was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.purchase_lines (workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind, ordered_quantity, unit_purchase_price, line_total)
      values (workspace_one, purchase_one, product_one, 'NaN total', 'quantity', 1, 1, 'NaN'::numeric);
    raise exception 'NaN line total was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.sale_lines (workspace_id, sale_id, catalog_product_id, inventory_item_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode)
      values (workspace_one, sale_one, product_one, item_one, 'invalid xor', 1, 10, 10, 5, 'diff_25a');
    raise exception 'sale line XOR violation was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.stock_lots (workspace_id, purchase_id, purchase_line_id, catalog_product_id, received_quantity, remaining_quantity, unit_cost)
      values (workspace_one, purchase_one, line_one, product_one, 1, 2, 1);
    raise exception 'invalid stock lot quantity was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.sale_lines (workspace_id, sale_id, catalog_product_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode)
      values (workspace_one, sale_one, product_one, 'invalid quantity', 0, 10, 10, 5, 'diff_25a');
    raise exception 'non-positive sale line quantity was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.stock_movements (workspace_id, stock_lot_id, sale_line_id, direction, quantity, reason)
      values (workspace_one, lot_one, sale_line_one, 'out', 0, 'sale');
    raise exception 'non-positive stock movement quantity was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.sale_line_lot_allocations (workspace_id, sale_line_id, stock_lot_id, quantity, unit_cost)
      values (workspace_one, sale_line_one, lot_one, 0, 5);
    raise exception 'non-positive allocation quantity was accepted';
  exception when check_violation then null;
  end;

  begin
    delete from public.purchase_lines where id = line_with_history;
    raise exception 'referenced purchase line was deleted';
  exception when foreign_key_violation then null;
  end;
end;
$$;

select pass('Workspace- und Werte-Constraints lehnen ungültige Fachdaten ab');

select * from finish();
rollback;
