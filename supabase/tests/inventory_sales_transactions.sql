\set ON_ERROR_STOP on

begin;

do $$
declare
  v_workspace_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_purchase_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_purchase_line_id uuid := gen_random_uuid();
  v_sale jsonb;
  v_sale_id uuid;
  v_received_quantity integer;
  v_remaining_quantity integer;
  v_sale_line_count integer;
  v_sale_count integer;
  v_cogs numeric(12, 2);
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    v_user_id,
    'authenticated',
    'authenticated',
    'inventory-sales-test-' || v_user_id::text || '@example.test',
    'not-used-by-this-test',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  insert into public.workspaces (id, name)
  values (v_workspace_id, 'inventory sales transaction test');

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner');

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  insert into public.purchases (id, workspace_id, type, title, receiving_status)
  values (v_purchase_id, v_workspace_id, 'single', 'LED lamp purchase', 'ordered');

  insert into public.catalog_products (id, workspace_id, title, tracking_mode)
  values (v_product_id, v_workspace_id, 'LED lamp', 'quantity');

  insert into public.purchase_lines (
    id,
    workspace_id,
    purchase_id,
    catalog_product_id,
    title_snapshot,
    line_kind,
    ordered_quantity,
    unit_purchase_price,
    line_total
  ) values (
    v_purchase_line_id,
    v_workspace_id,
    v_purchase_id,
    v_product_id,
    'LED lamp',
    'quantity',
    5,
    4.99,
    24.95
  );

  perform public.receive_purchase_lines(
    v_workspace_id,
    v_purchase_id,
    jsonb_build_array(jsonb_build_object(
      'purchase_line_id', v_purchase_line_id,
      'received_quantity', 5,
      'received_at', '2026-08-26T12:00:00Z'
    ))
  );

  select remaining_quantity
  into v_remaining_quantity
  from public.stock_lots
  where workspace_id = v_workspace_id
    and purchase_line_id = v_purchase_line_id;

  if v_remaining_quantity <> 5 then
    raise exception 'expected remaining quantity 5 after receipt, got %', v_remaining_quantity;
  end if;

  v_sale := public.record_sale(
    v_workspace_id,
    jsonb_build_object('platform', 'direct', 'sale_date', '2026-08-26'),
    jsonb_build_array(jsonb_build_object(
      'catalog_product_id', v_product_id,
      'title_snapshot', 'LED lamp',
      'quantity', 2,
      'unit_sale_price', 9.99
    ))
  );
  v_sale_id := (v_sale -> 'sale' ->> 'id')::uuid;

  select remaining_quantity
  into v_remaining_quantity
  from public.stock_lots
  where workspace_id = v_workspace_id
    and purchase_line_id = v_purchase_line_id;

  if v_remaining_quantity <> 3 then
    raise exception 'expected remaining quantity 3 after sale, got %', v_remaining_quantity;
  end if;

  select count(*), coalesce(sum(cost_of_goods_sold), 0)
  into v_sale_line_count, v_cogs
  from public.sale_lines
  where workspace_id = v_workspace_id
    and sale_id = v_sale_id;

  if v_sale_line_count <> 1 or v_cogs <> 9.98 then
    raise exception 'expected one sale line and COGS 9.98, got % lines and % COGS', v_sale_line_count, v_cogs;
  end if;

  begin
    perform public.record_sale(
      v_workspace_id,
      jsonb_build_object('platform', 'direct', 'sale_date', '2026-08-26'),
      jsonb_build_array(jsonb_build_object(
        'catalog_product_id', v_product_id,
        'title_snapshot', 'LED lamp',
        'quantity', 4,
        'unit_sale_price', 9.99
      ))
    );
    raise exception 'oversell was accepted';
  exception
    when others then
      if sqlerrm <> 'Nicht genügend verfügbarer Bestand' then
        raise;
      end if;
  end;

  select count(*) into v_sale_count
  from public.sales
  where workspace_id = v_workspace_id;

  select remaining_quantity
  into v_remaining_quantity
  from public.stock_lots
  where workspace_id = v_workspace_id
    and purchase_line_id = v_purchase_line_id;

  if v_sale_count <> 1 or v_remaining_quantity <> 3 then
    raise exception 'oversell created a partial sale or changed stock';
  end if;

  perform public.record_sale_return(
    v_workspace_id,
    v_sale_id,
    19.98,
    true,
    'customer return',
    'full return'
  );

  select remaining_quantity
  into v_remaining_quantity
  from public.stock_lots
  where workspace_id = v_workspace_id
    and purchase_line_id = v_purchase_line_id;

  if v_remaining_quantity <> 5 then
    raise exception 'expected remaining quantity 5 after full return, got %', v_remaining_quantity;
  end if;
end;
$$;

rollback;
