-- Vereinheitlicht Wareneingang und Ankunftsstatus.
-- Betroffen: public.purchases, public.purchase_lines.

create or replace function public.refresh_purchase_receiving_status(
  p_workspace_id uuid,
  p_purchase_id uuid
)
returns public.purchases
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase public.purchases;
begin
  update public.purchases
  set receiving_status = case
        when exists (
          select 1
          from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity < ordered_quantity
        ) and exists (
          select 1
          from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity > 0
        ) then 'partially_received'
        when exists (
          select 1
          from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity < ordered_quantity
        ) then case when receiving_status = 'draft' then 'draft' else 'ordered' end
        else 'received'
      end,
      shipment_status = case
        when exists (
          select 1
          from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity > 0
        ) then 'arrived'
        else shipment_status
      end,
      arrived_at = case
        when exists (
          select 1
          from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity > 0
        ) then coalesce(arrived_at, now())
        else arrived_at
      end,
      updated_at = now()
  where id = p_purchase_id
    and workspace_id = p_workspace_id
  returning * into v_purchase;

  return v_purchase;
end;
$$;

alter function public.refresh_purchase_receiving_status(uuid, uuid) owner to postgres;
