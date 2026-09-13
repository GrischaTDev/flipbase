-- Erhält direkte Artikelkosten beim historischen Verkaufsnachtrag im Wareneinsatz.
-- Betroffen: record_legacy_inventory_sale; steuerliche Altkosten bleiben ungeklärt.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create or replace function public.record_legacy_inventory_sale (
  p_workspace_id      uuid,
  p_inventory_item_id uuid,
  p_sale              jsonb,
  p_reason            text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_inventory_item public.inventory_items;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_event public.inventory_reconciliation_events;
  v_sale_state text;
  v_unit_sale_price numeric(12, 2);
  v_workspace_tax_mode text;
  v_shipping_revenue numeric(12,2) := 0;
  v_shipping_mode text;
  v_cost_entries jsonb := '[]'::jsonb;
  v_cost_entry jsonb;
  v_packaging_cost numeric(12,2) := 0;
  v_other_costs numeric(12,2) := 0;
  v_money_key text;
begin
  if v_actor_id is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Ein dokumentierter Klaerungsgrund ist erforderlich.';
  end if;

  if jsonb_typeof(p_sale) <> 'object'
    or nullif(trim(p_sale ->> 'platform'), '') is null
    or (p_sale ->> 'sale_date') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_sale -> 'unit_sale_price') <> 'number'
    or (p_sale ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
    or (p_sale ->> 'unit_sale_price')::numeric <= 0 then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungueltig.';
  end if;

  foreach v_money_key in array array['platform_fee', 'shipping_cost', 'shipping_revenue', 'packaging_cost', 'other_costs'] loop
    if p_sale ? v_money_key
      and (
        jsonb_typeof(p_sale -> v_money_key) <> 'number'
        or (p_sale ->> v_money_key) !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
        or (p_sale ->> v_money_key)::numeric < 0
      ) then
      raise exception using errcode = '22023', message = 'Die Verkaufsbeträge sind ungültig.';
    end if;
  end loop;

  if p_sale ? 'shipping_mode'
    and jsonb_typeof(p_sale -> 'shipping_mode') <> 'null'
    and (
      jsonb_typeof(p_sale -> 'shipping_mode') <> 'string'
      or p_sale ->> 'shipping_mode' not in ('seller_arranged', 'platform_prepaid', 'pickup')
    ) then
    raise exception using errcode = '22023', message = 'Die Versandabwicklung ist ungültig.';
  end if;

  if p_sale ? 'cost_entries' then
    if jsonb_typeof(p_sale -> 'cost_entries') <> 'array' then
      raise exception using errcode = '22023', message = 'Die zusätzlichen Verkaufskosten sind ungültig.';
    end if;
    v_cost_entries := p_sale -> 'cost_entries';
  else
    v_cost_entries := jsonb_strip_nulls(jsonb_build_array(
      case when coalesce((p_sale ->> 'packaging_cost')::numeric, 0) > 0
        then jsonb_build_object('category', 'packaging', 'amount', (p_sale ->> 'packaging_cost')::numeric)
      end,
      case when coalesce((p_sale ->> 'other_costs')::numeric, 0) > 0
        then jsonb_build_object('category', 'other', 'amount', (p_sale ->> 'other_costs')::numeric)
      end
    ));
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    into v_cost_entries
    from jsonb_array_elements(v_cost_entries) as entry(value)
    where value <> 'null'::jsonb;
  end if;

  if jsonb_array_length(v_cost_entries) > 50 then
    raise exception using errcode = '22023', message = 'Es sind höchstens 50 zusätzliche Verkaufskosten erlaubt.';
  end if;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    if jsonb_typeof(v_cost_entry) <> 'object'
      or jsonb_typeof(v_cost_entry -> 'category') <> 'string'
      or v_cost_entry ->> 'category' not in ('packaging', 'payment_fee', 'promotion', 'other')
      or (v_cost_entry ? 'description' and jsonb_typeof(v_cost_entry -> 'description') not in ('string', 'null'))
      or jsonb_typeof(v_cost_entry -> 'amount') <> 'number'
      or (v_cost_entry ->> 'amount') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_cost_entry ->> 'amount')::numeric < 0 then
      raise exception using errcode = '22023', message = 'Eine zusätzliche Verkaufskostenzeile ist ungültig.';
    end if;

    if v_cost_entry ->> 'category' = 'packaging' then
      v_packaging_cost := v_packaging_cost + (v_cost_entry ->> 'amount')::numeric;
    else
      v_other_costs := v_other_costs + (v_cost_entry ->> 'amount')::numeric;
    end if;
  end loop;

  v_shipping_revenue := coalesce((p_sale ->> 'shipping_revenue')::numeric, 0);
  v_shipping_mode := nullif(p_sale ->> 'shipping_mode', '');

  select *
  into v_inventory_item
  from public.inventory_items
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Der Inventarartikel wurde nicht gefunden.';
  end if;

  select sale_state
  into v_sale_state
  from public.inventory_item_sale_states
  where inventory_item_id = p_inventory_item_id
    and workspace_id = p_workspace_id;

  if v_sale_state <> 'legacy_sold_unverified' then
    raise exception using errcode = '22023', message = 'Legacy-Verkaufsnachtrag ist nur fuer ungepruefte sold-Altdaten zulaessig.';
  end if;

  select tax_mode into v_workspace_tax_mode
  from public.workspaces
  where id = p_workspace_id;
  v_unit_sale_price := (p_sale ->> 'unit_sale_price')::numeric(12, 2);

  insert into public.sales (
    workspace_id, inventory_item_id, platform, sale_price, sale_price_total, sale_date,
    platform_fee, shipping_cost, packaging_cost, other_costs, shipping_revenue, shipping_mode,
    external_order_id, external_listing_id, buyer_notes
  ) values (
    p_workspace_id, null, trim(p_sale ->> 'platform'),
    v_unit_sale_price + v_shipping_revenue, v_unit_sale_price + v_shipping_revenue, (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    v_packaging_cost,
    v_other_costs,
    v_shipping_revenue,
    v_shipping_mode,
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), '')
  ) returning * into v_sale;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    insert into public.sale_cost_entries (
      workspace_id, sale_id, category, description, amount
    ) values (
      p_workspace_id,
      v_sale.id,
      v_cost_entry ->> 'category',
      nullif(trim(v_cost_entry ->> 'description'), ''),
      (v_cost_entry ->> 'amount')::numeric
    );
  end loop;

  insert into public.sale_lines (
    workspace_id, sale_id, inventory_item_id, title_snapshot, quantity,
    unit_sale_price, line_total, cost_of_goods_sold, tax_mode
  ) values (
    p_workspace_id, v_sale.id, p_inventory_item_id,
    coalesce(nullif(trim(p_sale ->> 'title_snapshot'), ''), v_inventory_item.title),
    1, v_unit_sale_price, v_unit_sale_price,
    v_inventory_item.allocated_purchase_cost + coalesce((
      select pg_catalog.sum(cost.amount) from public.item_costs as cost
      where cost.inventory_item_id = v_inventory_item.id
    ), 0), v_workspace_tax_mode
  ) returning * into v_sale_line;

  update public.sales
  set inventory_item_id = p_inventory_item_id
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.inventory_reconciliation_events (
    workspace_id, inventory_item_id, actor_id, event_type,
    previous_status, new_status, reason
  ) values (
    p_workspace_id, p_inventory_item_id, v_actor_id, 'record_legacy_sale',
    'sold', 'sold', trim(p_reason)
  ) returning * into v_event;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'cost_entries', coalesce((
      select jsonb_agg(to_jsonb(cost_entry) order by cost_entry.id)
      from public.sale_cost_entries as cost_entry
      where cost_entry.sale_id = v_sale.id
    ), '[]'::jsonb),
    'sale_lines', jsonb_build_array(to_jsonb(v_sale_line)),
    'lot_allocations', '[]'::jsonb,
    'stock_movements', '[]'::jsonb,
    'event', to_jsonb(v_event)
  );
end;
$function$;
