begin;

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

rollback;
