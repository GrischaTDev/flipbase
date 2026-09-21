-- Ergänzt fachliche Quellen- und Verkäufernamen im Einkaufsentwurfsprotokoll.
-- Betroffen: public.purchase_draft_audit_snapshot(uuid, uuid).

create or replace function public.purchase_draft_audit_snapshot(
  p_workspace_id uuid,
  p_purchase_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with line_values as (
    select line.id, pg_catalog.jsonb_build_object(
      'catalog_product_id', line.catalog_product_id,
      'title_snapshot', line.title_snapshot,
      'ean_snapshot', line.ean_snapshot,
      'line_kind', line.line_kind,
      'is_package', line.is_package,
      'ordered_quantity', line.ordered_quantity,
      'unit_purchase_price', line.unit_purchase_price,
      'line_total', line.line_total,
      'allocated_additional_cost', line.allocated_additional_cost,
      'price_mode', line.price_mode,
      'condition_snapshot', line.condition_snapshot,
      'estimated_market_value', line.estimated_market_value
    ) as value
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id
  ), cost_values as (
    select cost.target_purchase_line_id, pg_catalog.jsonb_build_object(
      'type', cost.type,
      'amount', cost.amount,
      'tax_treatment', cost.tax_treatment,
      'description', cost.description,
      'allocation_method', cost.allocation_method
    ) as value
    from public.purchase_costs as cost
    where cost.workspace_id = p_workspace_id and cost.purchase_id = p_purchase_id
  ), lines as (
    select line.value || pg_catalog.jsonb_build_object('direct_costs', coalesce((
      select pg_catalog.jsonb_agg(cost.value order by cost.value)
      from cost_values as cost where cost.target_purchase_line_id = line.id
    ), '[]'::jsonb)) as value
    from line_values as line
  ), costs as (
    select cost.value || pg_catalog.jsonb_build_object('target_line', line.value) as value
    from cost_values as cost
    left join line_values as line on line.id = cost.target_purchase_line_id
  )
  select pg_catalog.jsonb_build_object(
    'purchase', (
      select coalesce((
        select pg_catalog.jsonb_object_agg(field.key, field.value)
        from pg_catalog.jsonb_each(pg_catalog.to_jsonb(purchase)) as field
        where field.key = any(array[
          'source_id', 'supplier_id', 'type', 'title', 'purchase_date',
          'purchase_price', 'cost_allocation_mode', 'notes', 'tracking_number',
          'tracking_carrier', 'tracking_status', 'content_status',
          'pricing_mode', 'supplier_reference', 'discount_amount', 'seller_type',
          'seller_name', 'seller_street',
          'seller_address_extra', 'seller_postal_code', 'seller_city',
          'seller_country_code'
        ])
      ), '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'source_name', (
          select source.name
          from public.sources as source
          where source.workspace_id = purchase.workspace_id and source.id = purchase.source_id
        ),
        'supplier_name', (
          select supplier.name
          from public.suppliers as supplier
          where supplier.workspace_id = purchase.workspace_id
            and supplier.id = purchase.supplier_id
        )
      )
      from public.purchases as purchase
      where purchase.workspace_id = p_workspace_id and purchase.id = p_purchase_id
    ),
    'lines', coalesce((select pg_catalog.jsonb_agg(value order by value) from lines), '[]'::jsonb),
    'costs', coalesce((select pg_catalog.jsonb_agg(value order by value) from costs), '[]'::jsonb)
  );
$$;

alter function public.purchase_draft_audit_snapshot(uuid, uuid) owner to postgres;
revoke all on function public.purchase_draft_audit_snapshot(uuid, uuid)
  from public, anon, authenticated, service_role;
