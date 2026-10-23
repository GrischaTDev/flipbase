-- Vorhandene Verkäufe unabhängig von ihrer gespeicherten Plattform bewusst zuordnen.
-- Ersetzt ausschließlich ebay_existing_sales_read und ebay_link_existing_sale;
-- Verkaufsdaten, Bestandsbewegungen und bestehende Funktionsrechte bleiben erhalten.
-- Aus dem Supabase-Abgleich erzeugt; nur Schlüsselwortschreibung vereinheitlicht.

-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create or replace function public.ebay_existing_sales_read (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_page          integer default 1
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.ebay_connections;
begin
  v_connection:=public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  if p_page is null or p_page<1 or p_page>100000 then raise exception 'Ungültige Seite' using errcode='22023'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'platform',s.platform,'saleDate',s.sale_date,'total',s.sale_price_total,'externalOrderId',s.external_order_id,
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'inventoryItemId',l.inventory_item_id,'catalogProductId',l.catalog_product_id,'title',l.title_snapshot,'quantity',l.quantity,'total',l.line_total) order by l.id),'[]'::jsonb)
      from public.sale_lines l where l.sale_id=s.id and l.workspace_id=p_workspace_id)) order by s.sale_date desc,s.id),'[]'::jsonb)
    from (select * from public.sales s where s.workspace_id=p_workspace_id and s.returned_at is null and s.voided_at is null
      and not exists(select 1 from public.ebay_order_bookings b where b.sale_id=s.id)
      order by s.sale_date desc,s.id limit 50 offset (p_page-1)*50) s);
end;
$function$;

create or replace function public.ebay_link_existing_sale (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_snapshot_id   uuid,
  p_sale_id       uuid,
  p_assignments   jsonb,
  p_reason        text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.ebay_connections; v_snapshot public.ebay_order_snapshots; v_sale public.sales; v_booking public.ebay_order_bookings;
  v_a jsonb; v_expected jsonb; v_actual jsonb;
begin
  v_connection:=public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  select * into v_snapshot from public.ebay_order_snapshots where id=p_snapshot_id and workspace_id=p_workspace_id and connection_id=p_connection_id
    and user_id=(select auth.uid()) and authorization_version=v_connection.authorization_version and external_account_id=v_connection.external_account_id;
  if not found then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_connection.environment||':'||v_snapshot.source_key,0));
  select * into v_booking from public.ebay_order_bookings where workspace_id=p_workspace_id and environment=v_connection.environment and source_key=v_snapshot.source_key;
  if found then return jsonb_build_object('status',v_booking.status,'saleId',v_booking.sale_id); end if;
  if v_snapshot.expires_at<=clock_timestamp() or p_reason is null or char_length(trim(p_reason)) not between 1 and 500
    then raise exception 'Aktuelle Prüfung und Erklärung erforderlich' using errcode='22023'; end if;
  select * into v_sale from public.sales where id=p_sale_id and workspace_id=p_workspace_id for update;
  if not found or v_sale.returned_at is not null or v_sale.voided_at is not null
    or exists(select 1 from public.ebay_order_bookings where sale_id=p_sale_id)
    or (v_sale.external_order_id is not null and v_sale.external_order_id<>v_snapshot.source->>'orderId')
  then raise exception 'Ungültiger vorhandener Verkauf' using errcode='22023'; end if;
  perform 1 from public.sale_lines where workspace_id=p_workspace_id and sale_id=p_sale_id order by id for update;
  if jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments)<>jsonb_array_length(v_snapshot.source->'lines')
    or jsonb_array_length(p_assignments)=0 or (select count(distinct a->>'lineItemId') from jsonb_array_elements(p_assignments) a)<>jsonb_array_length(p_assignments)
    or (select count(distinct l->>'lineItemId') from jsonb_array_elements(v_snapshot.source->'lines') l)<>jsonb_array_length(p_assignments)
  then raise exception 'Vollständige Positionszuordnung erforderlich' using errcode='22023'; end if;
  for v_a in select value from jsonb_array_elements(p_assignments) loop
    if (select count(*) from jsonb_object_keys(v_a))<>2
      or not exists(select 1 from jsonb_array_elements(v_snapshot.source->'lines') l where l->>'lineItemId'=v_a->>'lineItemId')
    then raise exception 'Ungültige Position' using errcode='22023'; end if;
    -- Verkaufte/archivierte Artikel sind hier zulässig; die tatsächlichen Verkaufspositionen sind der Beleg.
    if jsonb_typeof(v_a->'target') is distinct from 'object' or (select count(*) from jsonb_object_keys(v_a->'target'))<>1
      or not ((v_a->'target')?'inventoryItemId' or (v_a->'target')?'catalogProductId')
    then raise exception 'Ungültiger Artikel' using errcode='22023'; end if;
  end loop;
  select jsonb_agg(jsonb_build_object('target',target,'quantity',quantity) order by target::text) into v_expected from (
    select a->'target' target,sum((l->>'quantity')::integer) quantity from jsonb_array_elements(p_assignments) a
      join jsonb_array_elements(v_snapshot.source->'lines') l on l->>'lineItemId'=a->>'lineItemId' group by a->'target'
  ) t;
  select jsonb_agg(jsonb_build_object('target',target,'quantity',quantity) order by target::text) into v_actual from (
    select case when inventory_item_id is not null then jsonb_build_object('inventoryItemId',inventory_item_id) else jsonb_build_object('catalogProductId',catalog_product_id) end target,sum(quantity) quantity
      from public.sale_lines where workspace_id=p_workspace_id and sale_id=p_sale_id group by inventory_item_id,catalog_product_id
  ) t;
  if v_expected is distinct from v_actual then raise exception 'Bestellung muss zum vollständigen Verkauf passen' using errcode='22023'; end if;
  insert into public.ebay_order_bookings(workspace_id,environment,source_key,status,sale_id,source_lines,reason,recorded_by)
    values(p_workspace_id,v_connection.environment,v_snapshot.source_key,'recorded_elsewhere',p_sale_id,p_assignments,trim(p_reason),(select auth.uid()));
  perform public.ebay_close_sale_draft(p_workspace_id,v_connection.environment,v_snapshot.source_key,'linked_existing',p_sale_id,trim(p_reason));
  return jsonb_build_object('status','recorded_elsewhere','saleId',p_sale_id);
end;
$function$;