-- Lesende Einzelkauf-Vorschau. Der Fingerabdruck bindet die Bestätigung an
-- genau die geprüften Einkaufs-, Artikel- und Verkaufsdaten.
create or replace function public.preview_purchase_cost_repair(
  p_workspace_id uuid,
  p_purchase_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_classification text;
  v_reason text;
  v_costs jsonb;
  v_items jsonb;
  v_sales jsonb;
  v_state jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin', 'accountant')
  ) then
    raise exception using errcode = '42501', message = 'Keine Berechtigung für die Kostenprüfung.';
  end if;

  select * into v_purchase from public.purchases
  where workspace_id = p_workspace_id and id = p_purchase_id;
  if not found then
    raise exception using errcode = '42501', message = 'Der Einkauf ist nicht zugänglich.';
  end if;

  select classification, reason into v_classification, v_reason
  from public.preview_purchase_costing_legacy(p_workspace_id)
  where purchase_id = p_purchase_id;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
  into v_costs from public.purchase_costs c
  where c.workspace_id = p_workspace_id and c.purchase_id = p_purchase_id;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
  into v_items from public.inventory_items i
  where i.workspace_id = p_workspace_id and i.purchase_id = p_purchase_id;
  select coalesce(jsonb_agg(jsonb_build_object('line', to_jsonb(l), 'sale', to_jsonb(s)) order by l.id), '[]'::jsonb)
  into v_sales from public.sale_lines l
  join public.sales s on s.id = l.sale_id and s.workspace_id = l.workspace_id
  join public.inventory_items i on i.id = l.inventory_item_id and i.workspace_id = l.workspace_id
  where i.workspace_id = p_workspace_id and i.purchase_id = p_purchase_id;

  v_state := jsonb_build_object('purchase', to_jsonb(v_purchase), 'costs', v_costs, 'items', v_items, 'sales', v_sales);
  return jsonb_build_object(
    'purchaseId', p_purchase_id,
    'purchasePrice', v_purchase.purchase_price,
    'costs', v_costs,
    'items', v_items,
    'classification', coalesce(v_classification, 'already_finalized'),
    'reason', coalesce(v_reason, 'Die Einkaufskosten wurden bereits abgeschlossen.'),
    'fingerprint', md5(v_state::text)
  );
end;
$$;

alter function public.preview_purchase_cost_repair(uuid, uuid) owner to postgres;
revoke execute on function public.preview_purchase_cost_repair(uuid, uuid) from public, anon, service_role;
grant execute on function public.preview_purchase_cost_repair(uuid, uuid) to authenticated;
