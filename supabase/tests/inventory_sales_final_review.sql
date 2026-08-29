\set ON_ERROR_STOP on

begin;

do $$
declare
  v_workspace_id uuid := '81000000-0000-4000-8000-000000000001';
  v_user_id uuid := '81000000-0000-4000-8000-000000000002';
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at
  ) values (
    v_user_id,
    'authenticated',
    'authenticated',
    'final-review@example.test',
    'not-used-by-this-test',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  insert into public.workspaces (id, name)
  values (v_workspace_id, 'inventory sales final review');

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner');

  insert into public.catalog_products (id, workspace_id, title, tracking_mode)
  values
    ('81000000-0000-4000-8000-000000000003', v_workspace_id, 'Dreierpack', 'quantity'),
    ('81000000-0000-4000-8000-000000000004', v_workspace_id, 'Einzelpack', 'quantity');

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000002';

do $$
declare
  v_workspace_id uuid := '81000000-0000-4000-8000-000000000001';
  v_purchase_result jsonb;
  v_purchase_id uuid;
  v_first_line_id uuid;
  v_first_sale jsonb;
  v_first_sale_id uuid;
  v_first_lot_id uuid;
  v_individual_item_id uuid := '81000000-0000-4000-8000-000000000005';
  v_individual_sale jsonb;
  v_individual_sale_id uuid;
  v_movement_count integer;
  v_remaining_quantity integer;
  v_unit_cost numeric;
  v_cogs numeric;
  v_returned_at timestamptz;
  v_item_status text;
begin
  v_purchase_result := public.create_purchase(
    v_workspace_id,
    jsonb_build_object(
      'type', 'lot',
      'title', 'Centgenaue Kostenverteilung',
      'purchase_date', '2026-08-29',
      'purchase_price', 50,
      'cost_allocation_mode', 'even'
    ),
    jsonb_build_array(jsonb_build_object(
      'type', 'shipping',
      'amount', 0.05,
      'description', 'Versand'
    )),
    jsonb_build_array(
      jsonb_build_object(
        'catalog_product_id', '81000000-0000-4000-8000-000000000003',
        'title_snapshot', 'Dreierpack',
        'line_kind', 'quantity',
        'ordered_quantity', 3,
        'unit_purchase_price', 10,
        'line_total', 30
      ),
      jsonb_build_object(
        'catalog_product_id', '81000000-0000-4000-8000-000000000004',
        'title_snapshot', 'Einzelpack',
        'line_kind', 'quantity',
        'ordered_quantity', 1,
        'unit_purchase_price', 20,
        'line_total', 20
      )
    )
  );

  v_purchase_id := (v_purchase_result -> 'purchase' ->> 'id')::uuid;
  v_first_line_id := (v_purchase_result -> 'purchase_lines' -> 0 ->> 'id')::uuid;

  if jsonb_array_length(v_purchase_result -> 'purchase_costs') <> 1
    or jsonb_array_length(v_purchase_result -> 'purchase_lines') <> 2 then
    raise exception 'atomic purchase response is incomplete';
  end if;

  if (
    select sum(line.allocated_additional_cost)
    from public.purchase_lines as line
    where line.purchase_id = v_purchase_id
  ) <> 0.05 then
    raise exception 'additional costs were not allocated exactly to the cent';
  end if;

  if (
    select allocated_additional_cost
    from public.purchase_lines
    where id = v_first_line_id
  ) <> 0.04 then
    raise exception 'even allocation must weight ordered units deterministically';
  end if;

  perform public.receive_purchase_lines(
    v_workspace_id,
    v_purchase_id,
    jsonb_build_array(jsonb_build_object(
      'purchase_line_id', v_first_line_id,
      'received_quantity', 3,
      'received_at', '2026-08-29T08:00:00Z'
    ))
  );

  select id, unit_cost
  into v_first_lot_id, v_unit_cost
  from public.stock_lots
  where purchase_line_id = v_first_line_id;

  if round(v_unit_cost * 3, 2) <> 30.04 then
    raise exception 'stock-lot unit cost excludes allocated expenses: %', v_unit_cost;
  end if;

  v_first_sale := public.record_sale(
    v_workspace_id,
    jsonb_build_object('platform', 'direct', 'sale_date', '2026-08-29'),
    jsonb_build_array(jsonb_build_object(
      'catalog_product_id', '81000000-0000-4000-8000-000000000003',
      'quantity', 3,
      'unit_sale_price', 20
    ))
  );
  v_first_sale_id := (v_first_sale -> 'sale' ->> 'id')::uuid;

  select cost_of_goods_sold into v_cogs
  from public.sale_lines where sale_id = v_first_sale_id;
  if v_cogs <> 30.04 then
    raise exception 'FIFO COGS excludes allocated expenses: %', v_cogs;
  end if;

  insert into public.inventory_items (
    id, workspace_id, title, status, allocated_purchase_cost
  ) values (
    v_individual_item_id, v_workspace_id, 'Teilrabatt-Einzelstueck', 'ready', 10
  );

  v_individual_sale := public.record_sale(
    v_workspace_id,
    jsonb_build_object('platform', 'direct', 'sale_date', '2026-08-29'),
    jsonb_build_array(jsonb_build_object(
      'inventory_item_id', v_individual_item_id,
      'quantity', 1,
      'unit_sale_price', 50
    ))
  );
  v_individual_sale_id := (v_individual_sale -> 'sale' ->> 'id')::uuid;

  perform public.record_sale_return(
    v_workspace_id,
    v_individual_sale_id,
    5,
    false,
    'partial discount',
    'item remains with buyer',
    'keep_with_buyer',
    'Test buyer'
  );

  select count(*) into v_movement_count
  from public.stock_movements as movement
  join public.sale_lines as line on line.id = movement.sale_line_id
  where line.sale_id = v_individual_sale_id
    and movement.reason in ('return', 'damage');
  select returned_at into v_returned_at
  from public.sales where id = v_individual_sale_id;
  select status into v_item_status
  from public.inventory_items where id = v_individual_item_id;

  if v_movement_count <> 0 or v_returned_at is not null or v_item_status <> 'sold' then
    raise exception 'partial credit changed physical return state: movements %, returned_at %, item status %',
      v_movement_count, v_returned_at, v_item_status;
  end if;

  select remaining_quantity into v_remaining_quantity
  from public.stock_lots where id = v_first_lot_id;
  if v_remaining_quantity <> 0 then
    raise exception 'unexpected stock change after unrelated partial credit';
  end if;
end;
$$;

reset role;

do $$
declare
  v_table_name text;
  v_command text;
begin
  foreach v_table_name in array array['stock_lots', 'stock_movements', 'sale_lines'] loop
    foreach v_command in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('authenticated', format('public.%I', v_table_name), v_command) then
        raise exception 'authenticated still has direct % privilege on %', v_command, v_table_name;
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('stock_lots', 'stock_movements', 'sale_lines')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'booking tables still expose direct write policies';
  end if;
end;
$$;

rollback;
