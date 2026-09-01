-- Purpose: expose a deterministic inventory target for incomplete purchase sale history.
-- Affected function: public.get_purchase_sale_history(uuid, uuid).
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.get_purchase_sale_history (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_state text;
  v_review_inventory_item_id uuid;
begin
  v_state := public.get_purchase_sale_history_state(p_workspace_id, p_purchase_id);

  if v_state = 'review_required' then
    select item.id
    into v_review_inventory_item_id
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where item.workspace_id = p_workspace_id
      and (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and item.status = 'sold'
      and not exists (
        select 1
        from public.sale_lines as sale_line
        where sale_line.workspace_id = p_workspace_id
          and sale_line.inventory_item_id = item.id
      )
    order by item.created_at, item.id
    limit 1;

    if v_review_inventory_item_id is null then
      raise exception using
        errcode = 'P0001',
        message = 'Der prüfpflichtige Inventarartikel konnte nicht bestimmt werden.';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', v_state,
    'review_inventory_item_id', v_review_inventory_item_id
  );
end;
$function$;

COMMENT ON FUNCTION public.get_purchase_sale_history(uuid,uuid) IS 'Liefert den autoritativen Verkaufsverlauf und das nächste deterministische Inventar-Prüfziel atomar.';

REVOKE ALL ON FUNCTION public.get_purchase_sale_history(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_purchase_sale_history(uuid, uuid) FROM anon, service_role;

GRANT ALL ON FUNCTION public.get_purchase_sale_history(uuid, uuid) TO authenticated;
