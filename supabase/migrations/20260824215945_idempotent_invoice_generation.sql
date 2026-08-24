-- Zweck: Rechnungen pro Verkauf/Shop-Bestellung atomar und idempotent erzeugen.
-- Betroffen: public.invoices, public.invoice_items, public.create_or_get_invoice.

set check_function_bodies = false;

alter table public.invoices
  add column sale_id uuid references public.sales(id) on delete restrict,
  add column store_order_id uuid references public.store_orders(id) on delete restrict;

create unique index idx_invoices_workspace_store_order
  on public.invoices (workspace_id, store_order_id)
  where store_order_id is not null;

create unique index idx_invoices_workspace_sale
  on public.invoices (workspace_id, sale_id)
  where sale_id is not null;

create or replace function public.create_or_get_invoice (
  p_workspace_id   uuid,
  p_sale_id        uuid,
  p_store_order_id uuid,
  p_invoice        jsonb,
  p_items          jsonb
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
  as $function$
declare
  v_invoice public.invoices;
  v_created boolean := false;
  v_items jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if (p_sale_id is null) = (p_store_order_id is null) then
    raise exception using errcode = '22023', message = 'Genau eine Rechnungsquelle ist erforderlich.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0
    or exists (
      select 1
      from jsonb_array_elements(p_items) as item(value)
      where nullif(btrim(item.value ->> 'title'), '') is null
        or coalesce((item.value ->> 'quantity')::integer, 0) < 1
        or coalesce((item.value ->> 'unit_price')::numeric, -1) < 0
        or coalesce((item.value ->> 'total_price')::numeric, -1) < 0
    ) then
    raise exception using errcode = '22023', message = 'Mindestens eine Rechnungsposition ist ungültig.';
  end if;

  if p_sale_id is not null and not exists (
    select 1 from public.sales
    where id = p_sale_id and workspace_id = p_workspace_id
  ) then
    raise no_data_found using message = 'Der Verkauf wurde nicht gefunden.';
  end if;

  if p_store_order_id is not null and not exists (
    select 1 from public.store_orders
    where id = p_store_order_id and workspace_id = p_workspace_id
  ) then
    raise no_data_found using message = 'Die Shop-Bestellung wurde nicht gefunden.';
  end if;

  insert into public.invoices (
    workspace_id, invoice_number, order_number, invoice_date, delivery_date,
    seller, buyer, subtotal, shipping_cost, total, tax_mode, tax_clause,
    payment_method, payment_status, payment_due_date, notes, sale_id, store_order_id
  ) values (
    p_workspace_id,
    p_invoice ->> 'invoice_number',
    p_invoice ->> 'order_number',
    (p_invoice ->> 'invoice_date')::date,
    (p_invoice ->> 'delivery_date')::date,
    coalesce(p_invoice -> 'seller', '{}'::jsonb),
    coalesce(p_invoice -> 'buyer', '{}'::jsonb),
    coalesce((p_invoice ->> 'subtotal')::numeric, 0),
    coalesce((p_invoice ->> 'shipping_cost')::numeric, 0),
    coalesce((p_invoice ->> 'total')::numeric, 0),
    coalesce(p_invoice ->> 'tax_mode', 'diff_25a'),
    p_invoice ->> 'tax_clause',
    p_invoice ->> 'payment_method',
    coalesce(p_invoice ->> 'payment_status', 'paid'),
    nullif(p_invoice ->> 'payment_due_date', '')::date,
    p_invoice ->> 'notes',
    p_sale_id,
    p_store_order_id
  )
  on conflict do nothing
  returning * into v_invoice;

  if found then
    v_created := true;
    insert into public.invoice_items (
      invoice_id, sku, title, condition, quantity, unit_price, total_price
    )
    select
      v_invoice.id,
      nullif(item.value ->> 'sku', ''),
      item.value ->> 'title',
      nullif(item.value ->> 'condition', ''),
      (item.value ->> 'quantity')::integer,
      (item.value ->> 'unit_price')::numeric,
      (item.value ->> 'total_price')::numeric
    from jsonb_array_elements(p_items) as item(value);
  else
    select * into v_invoice
    from public.invoices
    where workspace_id = p_workspace_id
      and ((p_sale_id is not null and sale_id = p_sale_id)
        or (p_store_order_id is not null and store_order_id = p_store_order_id));
    if not found then
      raise no_data_found using message = 'Die Rechnung konnte nicht gelesen werden.';
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
  into v_items
  from public.invoice_items as item
  where item.invoice_id = v_invoice.id;

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'items', v_items,
    'created', v_created
  );
end;
$function$;

comment on function public.create_or_get_invoice(uuid, uuid, uuid, jsonb, jsonb) is
  'Erstellt Rechnung und Positionen atomar oder liefert den vorhandenen Beleg derselben Quelle.';

revoke all on function public.create_or_get_invoice(uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, service_role;

grant execute on function public.create_or_get_invoice(uuid, uuid, uuid, jsonb, jsonb)
  to authenticated;
