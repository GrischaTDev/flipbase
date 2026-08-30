\set ON_ERROR_STOP on

begin;

select plan(1);

do $$
declare
  v_workspace_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_purchase_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_purchase_line_id uuid := gen_random_uuid();
  v_appended_line_id uuid := gen_random_uuid();
  v_individual_purchase_id uuid := gen_random_uuid();
  v_individual_line_id uuid := gen_random_uuid();
  v_individual_item_id uuid;
  v_receiving_status text;
  v_sale jsonb;
  v_sale_id uuid;
  v_received_quantity integer;
  v_remaining_quantity integer;
  v_sale_line_count integer;
  v_sale_count integer;
  v_cogs numeric(12, 2);
  v_sale_revenue numeric(12, 2);
  v_shipping_revenue numeric(12, 2);
  v_shipping_cost numeric(12, 2);
  v_packaging_cost numeric(12, 2);
  v_other_costs numeric(12, 2);
  v_cost_entry_count integer;
  v_return_result jsonb;
  v_store_order_id uuid := gen_random_uuid();
  v_store_sale_id uuid;
  v_payment_fee_category text;
  v_payment_fee_rollup numeric(12, 2);
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

  insert into public.purchases (id, workspace_id, type, title)
  values (v_purchase_id, v_workspace_id, 'single', 'LED lamp purchase');

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

  select receiving_status into v_receiving_status
  from public.purchases where id = v_purchase_id;
  if v_receiving_status <> 'ordered' then
    raise exception 'new open purchase lines must set purchase status to ordered, got %', v_receiving_status;
  end if;

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

  insert into public.purchase_lines (
    id, workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind,
    ordered_quantity, unit_purchase_price, line_total
  ) values (
    v_appended_line_id, v_workspace_id, v_purchase_id, v_product_id, 'LED lamp refill',
    'quantity', 1, 4.99, 4.99
  );
  select receiving_status into v_receiving_status
  from public.purchases where id = v_purchase_id;
  if v_receiving_status <> 'partially_received' then
    raise exception 'appended open purchase line must set purchase status to partially_received, got %', v_receiving_status;
  end if;

  insert into public.purchases (id, workspace_id, type, title)
  values (v_individual_purchase_id, v_workspace_id, 'mystery_pack', 'individual receipt');
  insert into public.purchase_lines (
    id, workspace_id, purchase_id, title_snapshot, line_kind,
    ordered_quantity, unit_purchase_price, line_total
  ) values (
    v_individual_line_id, v_workspace_id, v_individual_purchase_id, 'Mystery-Fundstück',
    'individual', 1, 12.50, 12.50
  );

  v_individual_item_id := (
    public.receive_individual_purchase_line(
      v_workspace_id,
      v_individual_purchase_id,
      v_individual_line_id,
      jsonb_build_object(
        'title', 'Mystery-Fundstück',
        'condition', 'used',
        'allocated_purchase_cost', 12.50
      )
    ) -> 'inventory_item' ->> 'id'
  )::uuid;

  if not exists (
    select 1 from public.inventory_items
    where id = v_individual_item_id
      and purchase_id = v_individual_purchase_id
      and purchase_line_id = v_individual_line_id
  ) then
    raise exception 'individual receipt did not retain inventory provenance';
  end if;
  if exists (
    select 1 from public.stock_lots where purchase_line_id = v_individual_line_id
  ) then
    raise exception 'individual receipt created a stock lot';
  end if;
  select receiving_status into v_receiving_status
  from public.purchases where id = v_individual_purchase_id;
  if v_receiving_status <> 'received' then
    raise exception 'individual receipt did not complete purchase status, got %', v_receiving_status;
  end if;

  v_sale := public.record_sale(
    v_workspace_id,
    jsonb_build_object(
      'platform', 'ebay',
      'sale_date', '2026-08-26',
      'shipping_revenue', 2.99,
      'shipping_mode', 'seller_arranged',
      'shipping_cost', 5.19,
      'platform_fee', 7.70,
      'cost_entries', jsonb_build_array(
        jsonb_build_object('category', 'packaging', 'description', 'Karton', 'amount', 0.45),
        jsonb_build_object('category', 'promotion', 'description', 'Angebot hervorheben', 'amount', 1.25)
      )
    ),
    jsonb_build_array(jsonb_build_object(
      'catalog_product_id', v_product_id,
      'title_snapshot', 'LED lamp',
      'quantity', 1,
      'unit_sale_price', 39.99
    ))
  );
  v_sale_id := (v_sale -> 'sale' ->> 'id')::uuid;

  select remaining_quantity
  into v_remaining_quantity
  from public.stock_lots
  where workspace_id = v_workspace_id
    and purchase_line_id = v_purchase_line_id;

  if v_remaining_quantity <> 4 then
    raise exception 'expected remaining quantity 4 after sale, got %', v_remaining_quantity;
  end if;

  select count(*), coalesce(sum(cost_of_goods_sold), 0)
  into v_sale_line_count, v_cogs
  from public.sale_lines
  where workspace_id = v_workspace_id
    and sale_id = v_sale_id;

  if v_sale_line_count <> 1 or v_cogs <> 4.99 then
    raise exception 'expected one sale line and COGS 4.99, got % lines and % COGS', v_sale_line_count, v_cogs;
  end if;

  select sale_price_total, shipping_revenue, shipping_cost, packaging_cost, other_costs
  into v_sale_revenue, v_shipping_revenue, v_shipping_cost, v_packaging_cost, v_other_costs
  from public.sales
  where id = v_sale_id;

  select count(*) into v_cost_entry_count
  from public.sale_cost_entries
  where sale_id = v_sale_id;

  if v_sale_revenue <> 42.98
    or v_shipping_revenue <> 2.99
    or v_shipping_cost <> 5.19
    or v_packaging_cost <> 0.45
    or v_other_costs <> 1.25
    or v_cost_entry_count <> 2 then
    raise exception 'sale did not persist separated shipping revenue and expenses';
  end if;

  begin
    perform public.record_sale(
      v_workspace_id,
      jsonb_build_object(
        'platform', 'direct', 'sale_date', '2026-08-26',
        'cost_entries', jsonb_build_array(jsonb_build_object('category', 'unsupported', 'amount', 1))
      ),
      jsonb_build_array(jsonb_build_object(
        'catalog_product_id', v_product_id, 'title_snapshot', 'LED lamp',
        'quantity', 1, 'unit_sale_price', 9.99
      ))
    );
    raise exception 'unsupported sale cost category was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.record_sale(
      v_workspace_id,
      jsonb_build_object(
        'platform', 'direct', 'sale_date', '2026-08-26',
        'shipping_revenue', -0.01
      ),
      jsonb_build_array(jsonb_build_object(
        'catalog_product_id', v_product_id, 'title_snapshot', 'LED lamp',
        'quantity', 1, 'unit_sale_price', 9.99
      ))
    );
    raise exception 'negative shipping revenue was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.record_sale(
      v_workspace_id,
      jsonb_build_object(
        'platform', 'direct', 'sale_date', '2026-08-26',
        'cost_entries', (
          select jsonb_agg(jsonb_build_object('category', 'other', 'amount', 1))
          from generate_series(1, 51)
        )
      ),
      jsonb_build_array(jsonb_build_object(
        'catalog_product_id', v_product_id, 'title_snapshot', 'LED lamp',
        'quantity', 1, 'unit_sale_price', 9.99
      ))
    );
    raise exception 'more than 50 sale cost entries were accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.record_sale(
      v_workspace_id,
      jsonb_build_object('platform', 'direct', 'sale_date', '2026-08-26'),
      jsonb_build_array(jsonb_build_object(
        'catalog_product_id', v_product_id,
        'title_snapshot', 'LED lamp',
        'quantity', 5,
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

  if v_sale_count <> 1 or v_remaining_quantity <> 4 then
    raise exception 'oversell created a partial sale or changed stock';
  end if;

  select public.record_sale_return(
    v_workspace_id,
    v_sale_id,
    42.98,
    true,
    'customer return',
    'full return',
    'restock_ready',
    'Test buyer'
  ) into v_return_result;

  select remaining_quantity
  into v_remaining_quantity
  from public.stock_lots
  where workspace_id = v_workspace_id
    and purchase_line_id = v_purchase_line_id;

  if v_remaining_quantity <> 5 then
    raise exception 'expected remaining quantity 5 after full return, got %', v_remaining_quantity;
  end if;

  if not exists (
    select 1
    from public.returns
    where workspace_id = v_workspace_id
      and sale_id = v_sale_id
      and reason = 'customer return'
      and notes = 'full return'
      and buyer_name = 'Test buyer'
      and credit_note_number = v_return_result -> 'return' ->> 'credit_note_number'
  ) then
    raise exception 'expected atomic return metadata to be persisted';
  end if;

  perform public.place_store_order(
    v_workspace_id,
    v_store_order_id,
    'STORE-PAYMENT-FEE-1',
    jsonb_build_object('email', 'store@example.test'),
    39.99,
    0,
    39.99,
    'bank_transfer',
    'paid',
    null,
    'paid',
    '2026-08-26',
    null,
    jsonb_build_array(jsonb_build_object(
      'catalog_product_id', v_product_id,
      'item_title', 'LED lamp',
      'quantity', 1,
      'price', 39.99,
      'payment_fee', 1.23
    ))
  );

  select id, other_costs
  into v_store_sale_id, v_payment_fee_rollup
  from public.sales
  where workspace_id = v_workspace_id
    and external_order_id = 'STORE-PAYMENT-FEE-1';

  select category
  into v_payment_fee_category
  from public.sale_cost_entries
  where sale_id = v_store_sale_id;

  if v_payment_fee_category <> 'payment_fee' or v_payment_fee_rollup <> 1.23 then
    raise exception 'store payment fee was not persisted as payment_fee with the correct rollup';
  end if;
end;
$$;

select pass('atomare Bestands- und Verkaufstransaktionen enden fachlich konsistent');

select * from finish();
rollback;
