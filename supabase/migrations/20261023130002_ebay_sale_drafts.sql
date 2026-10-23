-- Zweck: private eBay-Verkaufsentwürfe, eigene Reservierungen, Altverkaufszuordnung und Glocke.
-- Betroffen: ebay_sale_*, stock_movements.ebay_sale_draft_id, FIFO-Buchung und eBay-Review-RPCs.
-- Erzeugt mit supabase db diff und tatsächlichen Ziel-ACLs; bestehende Migrationen bleiben unverändert.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create or replace function public.ebay_cache_page (
  p_connection_id uuid,
  p_operation_id  uuid,
  p_version       bigint,
  p_scan_id       bigint,
  p_offset        integer,
  p_rows          jsonb,
  p_complete      boolean,
  p_total         integer
)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.ebay_connections; v_scan public.ebay_cache_scans; v_row jsonb; v_source jsonb; v_old public.ebay_cached_orders; v_id bigint; v_new_sale boolean; v_size integer; v_count integer; v_created timestamptz; v_paid timestamptz; v_recipient public.ebay_connections;
begin
  select * into v_scan from public.ebay_cache_scans where id=p_scan_id and lease_connection_id=p_connection_id and lease_operation_id=p_operation_id and lease_version=p_version and lease_expires_at>clock_timestamp() for update;
  if not found or v_scan.window_to is null or p_offset is null or v_scan.next_offset<>p_offset then return false; end if;
  select * into v_connection from public.ebay_connections where id=p_connection_id and operation_id=p_operation_id and operation_expires_at>clock_timestamp() and authorization_version=p_version and status='connected' for update;
  if not found or v_connection.workspace_id<>v_scan.workspace_id or v_connection.environment<>v_scan.environment or v_connection.external_account_id<>v_scan.external_account_id
    or not public.user_can_access_workspace(v_connection.workspace_id,v_connection.user_id)
    or not exists(select 1 from public.workspaces w where w.id=v_connection.workspace_id and w.archived_at is null) then return false; end if;
  v_size:=case when v_scan.kind='orders' then 50 else 200 end;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>v_size or octet_length(p_rows::text)>4194304
    or p_complete is null or p_total is null or p_total<0 or p_total>1000000
    then raise exception 'Ungültige Cacheseite' using errcode='22023'; end if;
  v_count:=jsonb_array_length(p_rows);
  if v_scan.expected_total is not null and v_scan.expected_total<>p_total then
    -- Veränderliche Anbieterseiten erneut ab Beginn lesen; Abschlussmarke bleibt unverändert.
    update public.ebay_cache_scans set next_offset=0,expected_total=null,seen_count=0,generation=extensions.gen_random_uuid(),last_error='unavailable',lease_expires_at=null,next_due_at=clock_timestamp()+interval '5 minutes' where id=p_scan_id;
    return false;
  end if;
  if p_offset+v_count>p_total or p_complete<>(p_offset+v_count=p_total) or (not p_complete and v_count<>v_size)
    or (v_scan.kind='listings' and p_total>=25000) then raise exception 'Unvollständige Cacheseite' using errcode='22023'; end if;
  if (select count(distinct case when v_scan.kind='orders' then r#>>'{source,orderId}' else r->>'id' end) from jsonb_array_elements(p_rows) r)<>v_count
    then raise exception 'Doppelte Quellenkennung' using errcode='22023'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if v_scan.kind='listings' then
      if jsonb_typeof(v_row) is distinct from 'object' or length(v_row->>'id') not between 1 and 256 or v_row->>'id' is null then raise exception 'Ungültiges Inserat' using errcode='22023'; end if;
      insert into public.ebay_cached_listings(workspace_id,environment,external_account_id,listing_id,listing,seen_generation)
        values(v_scan.workspace_id,v_scan.environment,v_scan.external_account_id,v_row->>'id',v_row,v_scan.generation)
        on conflict(workspace_id,environment,external_account_id,listing_id) do update set listing=excluded.listing,active=true,seen_generation=excluded.seen_generation,observed_at=clock_timestamp();
    else
      v_source:=v_row->'source';
      if jsonb_typeof(v_source) is distinct from 'object' or length(v_source->>'orderId') not between 1 and 256 or v_source->>'orderId' is null
        or v_row->>'sourceKey' is null or v_row->>'sourceKey' !~ '^[0-9a-f]{64}$' or jsonb_typeof(v_source->'lines') is distinct from 'array'
        or jsonb_array_length(v_source->'lines')>200 then raise exception 'Ungültige Bestellquelle' using errcode='22023'; end if;
      v_created:=(v_source->>'createdAt')::timestamptz;
      if v_created is null or not isfinite(v_created) or v_created>v_scan.window_to
        then raise exception 'Ungültiges Bestelldatum' using errcode='22023'; end if;
      perform pg_advisory_xact_lock(hashtextextended(v_scan.workspace_id::text||':'||v_scan.environment||':'||(v_row->>'sourceKey'),0));
      select * into v_old from public.ebay_cached_orders where workspace_id=v_scan.workspace_id and environment=v_scan.environment and external_account_id=v_scan.external_account_id and order_id=v_source->>'orderId' for update;
      v_paid:=(v_source->>'paidAt')::timestamptz;
      v_new_sale:=v_scan.baseline_to is not null and v_source->>'paymentStatus'='PAID'
        and ((v_old.id is null and (v_created>v_scan.baseline_to or coalesce(isfinite(v_paid) and v_paid>=v_created and v_paid>v_scan.baseline_to and v_paid<=v_scan.window_to,false)))
          or (v_old.id is not null and v_old.source->>'paymentStatus'<>'PAID')) and not coalesce(v_old.auto_prepare,false);
      insert into public.ebay_cached_orders(workspace_id,environment,external_account_id,order_id,source_key,source,created_at,modified_at,auto_prepare,seen_generation)
        values(v_scan.workspace_id,v_scan.environment,v_scan.external_account_id,v_source->>'orderId',v_row->>'sourceKey',v_source,v_created,(v_source->>'lastModifiedAt')::timestamptz,coalesce(v_new_sale,false),v_scan.generation)
        on conflict(workspace_id,environment,external_account_id,order_id) do update set source=excluded.source,modified_at=excluded.modified_at,observed_at=clock_timestamp(),auto_prepare=public.ebay_cached_orders.auto_prepare or excluded.auto_prepare,seen_generation=excluded.seen_generation returning id into v_id;
      if v_new_sale then
        -- Ein Kontoabruf kann mehrere persönliche Freigaben bedienen; keine Abrufverbindung als Empfänger voraussetzen.
        for v_recipient in select c.* from public.ebay_connections c where c.workspace_id=v_scan.workspace_id and c.environment=v_scan.environment
          and c.external_account_id=v_scan.external_account_id and c.status='connected' and public.user_can_access_workspace(c.workspace_id,c.user_id) loop
          -- Opt-in und Pilotgrenzen bleiben im bestehenden Outbox-/Versandweg; Ereignis ist je Nutzer und Verkauf eindeutig.
          perform public.web_push_enqueue_event('ebay-cache-order:'||v_id::text||':'||v_recipient.user_id::text,v_scan.workspace_id,'order',v_recipient.id,jsonb_build_object('kind','ebay_orders','connectionId',v_recipient.id));
        end loop;
      end if;
    end if;
  end loop;
  if p_complete and v_scan.kind='orders' and (select count(*) from public.ebay_cached_orders where workspace_id=v_scan.workspace_id and environment=v_scan.environment and external_account_id=v_scan.external_account_id and seen_generation=v_scan.generation)<>p_total
    then raise exception 'Bestellseiten überschneiden sich' using errcode='22023'; end if;
  if p_complete and v_scan.kind='listings' then
    if (select count(*) from public.ebay_cached_listings where workspace_id=v_scan.workspace_id and environment=v_scan.environment and external_account_id=v_scan.external_account_id and seen_generation=v_scan.generation)<>p_total
      then raise exception 'Inseratseiten überschneiden sich' using errcode='22023'; end if;
    update public.ebay_cached_listings set active=false where workspace_id=v_scan.workspace_id and environment=v_scan.environment and external_account_id=v_scan.external_account_id and seen_generation<>v_scan.generation;
  end if;
  update public.ebay_cache_scans set expected_total=case when p_complete then null else p_total end,seen_count=case when p_complete then 0 else seen_count+v_count end,
    baseline_to=case when p_complete then coalesce(baseline_to,window_to) else baseline_to end,
    watermark=case when p_complete then window_to else watermark end,completed_at=case when p_complete then clock_timestamp() else completed_at end,
    window_from=case when p_complete then null else window_from end,window_to=case when p_complete then null else window_to end,
    next_offset=case when p_complete then 0 else next_offset+v_size end,last_error=null,
    lease_expires_at=case when p_complete then null else lease_expires_at end,
    next_due_at=clock_timestamp()+case when not p_complete then interval '5 seconds' when kind='orders' then interval '5 minutes' else interval '1 hour' end where id=p_scan_id;
  return true;
end;
$function$;

create function public.ebay_cache_prepare_sale_draft()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  perform public.ebay_prepare_sale_draft(new.id);
  return new;
end;
$function$;

revoke all on function public.ebay_cache_prepare_sale_draft() from public;

grant all on function public.ebay_cache_prepare_sale_draft() to service_role;

create function public.ebay_cache_record_sale_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  if new.auto_prepare then
    insert into public.ebay_sale_notifications(workspace_id,environment,external_account_id,source_key,order_id)
      values(new.workspace_id,new.environment,new.external_account_id,new.source_key,new.order_id) on conflict do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function public.ebay_cache_record_sale_notification() from public;

grant all on function public.ebay_cache_record_sale_notification() to service_role;

create function public.ebay_close_sale_draft (
  p_workspace_id uuid,
  p_environment  text,
  p_source_key   text,
  p_state        text,
  p_sale_id      uuid,
  p_reason       text
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
declare v_draft public.ebay_sale_drafts;
begin
  select * into v_draft from public.ebay_sale_drafts where workspace_id=p_workspace_id and environment=p_environment and source_key=p_source_key for update;
  if not found then return; end if;
  perform public.ebay_release_sale_reservations(v_draft.id);
  update public.ebay_sale_drafts set state=p_state,sale_id=p_sale_id,resolution_reason=p_reason,updated_at=clock_timestamp() where id=v_draft.id;
end;
$function$;

revoke all on function public.ebay_close_sale_draft(uuid, text, text, text, uuid, text) from public;

grant all on function public.ebay_close_sale_draft(uuid, text, text, text, uuid, text) to service_role;

create or replace function public.ebay_delete_account (
  p_environment         text,
  p_external_account_id text
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
begin
  perform 1 from public.ebay_connections where environment=p_environment and external_account_id=p_external_account_id order by id for update;
  delete from public.ebay_sale_notifications where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_cached_orders where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_cached_listings where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_cache_scans where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_order_observations where environment=p_environment and external_account_id=p_external_account_id;
  update public.ebay_sale_drafts set external_account_id='deleted:'||id::text,order_id='',source='{}'::jsonb,
    costs='{"platformFeeCents":null,"shippingCostCents":null,"shippingMode":null,"additionalCosts":[]}'::jsonb,
    state=case when state in ('booked','linked_existing','dismissed') then state else 'blocked' end,
    resolution_reason='Anbieterkonto gelöscht; interne Reservierung bewusst klären',updated_at=clock_timestamp()
    where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_article_mappings where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_connections where environment=p_environment and external_account_id=p_external_account_id;
end;
$function$;

create function public.ebay_existing_sales_read (
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
  return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'saleDate',s.sale_date,'total',s.sale_price_total,'externalOrderId',s.external_order_id,
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'inventoryItemId',l.inventory_item_id,'catalogProductId',l.catalog_product_id,'title',l.title_snapshot,'quantity',l.quantity,'total',l.line_total) order by l.id),'[]'::jsonb)
      from public.sale_lines l where l.sale_id=s.id and l.workspace_id=p_workspace_id)) order by s.sale_date desc,s.id),'[]'::jsonb)
    from (select * from public.sales s where s.workspace_id=p_workspace_id and lower(s.platform)='ebay' and s.returned_at is null and s.voided_at is null
      and not exists(select 1 from public.ebay_order_bookings b where b.sale_id=s.id)
      order by s.sale_date desc,s.id limit 50 offset (p_page-1)*50) s);
end;
$function$;

revoke all on function public.ebay_existing_sales_read(uuid, uuid, integer) from public;

grant all on function public.ebay_existing_sales_read(uuid, uuid, integer) to authenticated;

grant all on function public.ebay_existing_sales_read(uuid, uuid, integer) to service_role;

create function public.ebay_guard_reservation_owner()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if current_user not in ('postgres','service_role') and
    (case when tg_op='INSERT' then new.ebay_sale_draft_id is not null
      when tg_op='DELETE' then old.ebay_sale_draft_id is not null
      else new.ebay_sale_draft_id is not null or old.ebay_sale_draft_id is not null end)
  then raise exception 'Reservierungsbesitzer ist geschützt' using errcode='42501'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;

revoke all on function public.ebay_guard_reservation_owner() from public;

grant all on function public.ebay_guard_reservation_owner() to service_role;

create function public.ebay_guard_reserved_stock()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  if tg_table_name='inventory_items' then
    if (new.status is distinct from old.status or new.archived_at is distinct from old.archived_at
      or new.workspace_id is distinct from old.workspace_id or new.purchase_id is distinct from old.purchase_id
      or new.purchase_line_id is distinct from old.purchase_line_id)
      and exists(select 1 from public.ebay_sale_reservations where inventory_item_id=old.id and released_at is null)
    then raise exception 'Artikel gehört zu einer offenen Verkaufsreservierung' using errcode='22023'; end if;
  else
    if new.remaining_quantity < public.stock_lot_reserved_quantity(old.id)
      or ((new.workspace_id is distinct from old.workspace_id or new.catalog_product_id is distinct from old.catalog_product_id
        or new.purchase_id is distinct from old.purchase_id) and public.stock_lot_reserved_quantity(old.id)>0)
    then raise exception 'Reservierter Bestand darf nicht verändert werden' using errcode='22023'; end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.ebay_guard_reserved_stock() from public;

grant all on function public.ebay_guard_reserved_stock() to service_role;

create function public.ebay_link_existing_sale (
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
  if not found or lower(v_sale.platform)<>'ebay' or v_sale.returned_at is not null or v_sale.voided_at is not null
    or exists(select 1 from public.ebay_order_bookings where sale_id=p_sale_id)
    or (v_sale.external_order_id is not null and v_sale.external_order_id<>v_snapshot.source->>'orderId')
  then raise exception 'Ungültiger vorhandener eBay-Verkauf' using errcode='22023'; end if;
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

revoke all on function public.ebay_link_existing_sale(uuid, uuid, uuid, uuid, jsonb, text) from public;

grant all on function public.ebay_link_existing_sale(uuid, uuid, uuid, uuid, jsonb, text) to authenticated;

grant all on function public.ebay_link_existing_sale(uuid, uuid, uuid, uuid, jsonb, text) to service_role;

create function public.ebay_lock_draft_stock (
  p_workspace_id uuid,
  p_assignments  jsonb
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
begin
  perform p.id from public.purchases p where p.workspace_id=p_workspace_id and p.id in (
    select coalesce(i.purchase_id,l.purchase_id) from public.inventory_items i
      left join public.purchase_lines l on l.id=i.purchase_line_id and l.workspace_id=i.workspace_id
      where i.workspace_id=p_workspace_id and i.id in(select (a#>>'{target,inventoryItemId}')::uuid from jsonb_array_elements(p_assignments) a)
    union select s.purchase_id from public.stock_lots s where s.workspace_id=p_workspace_id and s.catalog_product_id in
      (select (a#>>'{target,catalogProductId}')::uuid from jsonb_array_elements(p_assignments) a)
  ) order by p.id for update;
  perform c.id from public.catalog_products c where c.workspace_id=p_workspace_id and c.id in
    (select (a#>>'{target,catalogProductId}')::uuid from jsonb_array_elements(p_assignments) a) order by c.id for update;
  perform i.id from public.inventory_items i where i.workspace_id=p_workspace_id and i.id in
    (select (a#>>'{target,inventoryItemId}')::uuid from jsonb_array_elements(p_assignments) a) order by i.id for update;
  perform l.id from public.stock_lots l where l.workspace_id=p_workspace_id and l.catalog_product_id in
    (select (a#>>'{target,catalogProductId}')::uuid from jsonb_array_elements(p_assignments) a) order by l.received_at,l.id for update;
end;
$function$;

revoke all on function public.ebay_lock_draft_stock(uuid, jsonb) from public;

grant all on function public.ebay_lock_draft_stock(uuid, jsonb) to service_role;

create function public.ebay_mapping_prepare_sale_drafts()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_order record;
begin
  for v_order in select id from public.ebay_cached_orders o where o.workspace_id=new.workspace_id and o.environment=new.environment
    and o.external_account_id=new.external_account_id and o.auto_prepare and exists(select 1 from jsonb_array_elements(o.source->'lines') l
      where l->>'listingId'=new.listing_id and l->>'variationId' is not distinct from new.variation_id) order by o.id loop
    perform public.ebay_prepare_sale_draft(v_order.id);
  end loop;
  return new;
end;
$function$;

revoke all on function public.ebay_mapping_prepare_sale_drafts() from public;

grant all on function public.ebay_mapping_prepare_sale_drafts() to service_role;

create or replace function public.ebay_mark_order_recorded_elsewhere (
  p_user_id       uuid,
  p_connection_id uuid,
  p_snapshot_id   uuid,
  p_reason        text,
  p_sale_id       uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_connection public.ebay_connections; v_snapshot public.ebay_order_snapshots; v_booking public.ebay_order_bookings;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id;
  v_connection := public.ebay_lock_import_connection(p_user_id,v_connection.workspace_id,p_connection_id);
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id and connection_id = p_connection_id
    and user_id = p_user_id and authorization_version = v_connection.authorization_version and external_account_id = v_connection.external_account_id;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_connection.workspace_id::text || ':' || v_connection.environment || ':' || v_snapshot.source_key,0));
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id for update;
  select * into v_booking from public.ebay_order_bookings where workspace_id = v_connection.workspace_id and environment = v_connection.environment and source_key = v_snapshot.source_key;
  if found then return public.ebay_get_order_booking(p_user_id,p_connection_id,v_snapshot.source_key); end if;
  if v_snapshot.expires_at <= clock_timestamp() or p_reason is null or char_length(trim(p_reason)) not between 1 and 500
  then raise exception 'Grund und aktuelle Bestellprüfung erforderlich' using errcode = '22023'; end if;
  if p_sale_id is not null then raise exception 'Bestehenden Verkauf mit vollständigen Positionen zuordnen' using errcode='22023'; end if;
  if p_sale_id is not null and (not exists (select 1 from public.sales where id = p_sale_id and workspace_id = v_connection.workspace_id)
    or exists (select 1 from public.ebay_order_bookings where sale_id = p_sale_id and status = 'imported'))
  then raise exception 'Ungültiger manueller Verkauf' using errcode = '22023'; end if;
  insert into public.ebay_order_bookings(workspace_id,environment,source_key,status,sale_id,reason,recorded_by)
    values (v_connection.workspace_id,v_connection.environment,v_snapshot.source_key,'recorded_elsewhere',p_sale_id,trim(p_reason),p_user_id);
  perform public.ebay_close_sale_draft(v_connection.workspace_id,v_connection.environment,v_snapshot.source_key,'dismissed',null,p_reason);
  return jsonb_build_object('status','recorded_elsewhere','saleId',p_sale_id);
end;
$function$;

create function public.ebay_prepare_sale_draft (
  p_cache_id    bigint,
  p_assignments jsonb   default null::jsonb,
  p_costs       jsonb   default null::jsonb,
  p_explicit    boolean default false
)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare v_order public.ebay_cached_orders; v_draft public.ebay_sale_drafts; v_assignments jsonb; v_costs jsonb;
  v_a jsonb; v_line jsonb; v_target jsonb; v_group record; v_item public.inventory_items; v_lot public.stock_lots;
  v_remaining integer; v_take integer; v_complete boolean; v_state text; v_booking public.ebay_order_bookings;
begin
  select * into strict v_order from public.ebay_cached_orders where id=p_cache_id;
  perform pg_advisory_xact_lock(hashtextextended(v_order.workspace_id::text||':'||v_order.environment||':'||v_order.source_key,0));
  select * into v_draft from public.ebay_sale_drafts where workspace_id=v_order.workspace_id and environment=v_order.environment and source_key=v_order.source_key for update;
  if v_draft.state in ('booked','linked_existing','dismissed') then
    update public.ebay_sale_drafts set source=v_order.source,updated_at=clock_timestamp() where id=v_draft.id;
    return v_draft.id;
  end if;
  if v_draft.id is null and not (p_explicit or v_order.auto_prepare) then return null; end if;
  -- Ein Storno kann Positionen entfernen. Den bestehenden Besitzer deshalb vor
  -- jeder neuen Positionsprüfung klären; eine unklare Quelle behält ihn unverändert.
  if v_order.source->>'paymentStatus' is distinct from 'PAID' or v_order.source->>'cancelStatus' is distinct from 'NONE_REQUESTED'
    or v_order.source->'blockers' is distinct from '[]'::jsonb or v_order.source->>'currency' is distinct from 'EUR'
    or exists(select 1 from jsonb_array_elements(v_order.source->'lines') l where l->'hasRefund' is distinct from 'false'::jsonb)
  then
    if v_draft.id is not null then
      if v_order.source->>'cancelStatus'='CANCELED' then perform public.ebay_release_sale_reservations(v_draft.id); end if;
      update public.ebay_sale_drafts set source=v_order.source,state='blocked',updated_at=clock_timestamp() where id=v_draft.id;
      return v_draft.id;
    elsif not p_explicit then return null;
    end if;
  end if;
  select * into v_booking from public.ebay_order_bookings where workspace_id=v_order.workspace_id and environment=v_order.environment and source_key=v_order.source_key;
  if v_booking.id is not null and v_draft.id is null then return null; end if;
  v_assignments:=p_assignments;
  if v_assignments is null then
    select coalesce(jsonb_agg(a),'[]'::jsonb) into v_assignments from jsonb_array_elements(coalesce(v_draft.assignments,'[]'::jsonb)) a
      where exists(select 1 from jsonb_array_elements(v_order.source->'lines') l where l->>'lineItemId'=a->>'lineItemId');
    if v_assignments is null or v_assignments='[]'::jsonb then
      select coalesce(jsonb_agg(jsonb_build_object('lineItemId',l->>'lineItemId','target',case when m.inventory_item_id is not null then jsonb_build_object('inventoryItemId',m.inventory_item_id) else jsonb_build_object('catalogProductId',m.catalog_product_id) end)),'[]'::jsonb)
        into v_assignments from jsonb_array_elements(v_order.source->'lines') l join public.ebay_article_mappings m on m.workspace_id=v_order.workspace_id
        and m.environment=v_order.environment and m.external_account_id=v_order.external_account_id and m.listing_id=l->>'listingId' and m.variation_id is not distinct from l->>'variationId'
        and (m.variation_id is not null or l->'variationAspects'='[]'::jsonb);
    end if;
  end if;
  if jsonb_typeof(v_assignments) is distinct from 'array' or jsonb_array_length(v_assignments)>200
    or (select count(distinct a->>'lineItemId') from jsonb_array_elements(v_assignments) a)<>jsonb_array_length(v_assignments)
  then raise exception 'Ungültige Artikelzuordnung' using errcode='22023'; end if;
  for v_a in select value from jsonb_array_elements(v_assignments) loop
    if (select count(*) from jsonb_object_keys(v_a))<>2 or not exists(select 1 from jsonb_array_elements(v_order.source->'lines') l where l->>'lineItemId'=v_a->>'lineItemId')
    then raise exception 'Ungültige Artikelzuordnung' using errcode='22023'; end if;
    v_target:=public.ebay_import_target(v_order.workspace_id,v_a->'target');
  end loop;
  v_complete:=jsonb_array_length(v_assignments)=jsonb_array_length(v_order.source->'lines') and jsonb_array_length(v_assignments)>0;
  -- Neu eingelesene Gebühren werden angezeigt; persönlich bestätigte Kosten bleiben erhalten.
  v_costs:=coalesce(p_costs,v_draft.costs,jsonb_build_object('platformFeeCents',v_order.source->'platformFeeCents','shippingCostCents',null,'shippingMode',null,'additionalCosts','[]'::jsonb));
  if jsonb_typeof(v_costs) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_costs))<>4
    or not (v_costs ?& array['platformFeeCents','shippingCostCents','shippingMode','additionalCosts'])
    or (v_costs->'platformFeeCents'<>'null'::jsonb and not public.ebay_valid_cents(v_costs->'platformFeeCents'))
    or (v_costs->'shippingCostCents'<>'null'::jsonb and not public.ebay_valid_cents(v_costs->'shippingCostCents'))
    or (v_costs->'shippingMode'<>'null'::jsonb and v_costs->>'shippingMode' not in ('pickup','seller_arranged','platform_prepaid'))
    or jsonb_typeof(v_costs->'additionalCosts') is distinct from 'array' or jsonb_array_length(v_costs->'additionalCosts')>50
  then raise exception 'Ungültige Kosten' using errcode='22023'; end if;
  for v_a in select value from jsonb_array_elements(v_costs->'additionalCosts') loop
    if not public.ebay_valid_cents(v_a->'amountCents') or coalesce(v_a->>'category','') not in ('packaging','payment_fee','promotion','other')
      or (select count(*) from jsonb_object_keys(v_a))<>3 or not(v_a?'description')
      or jsonb_typeof(v_a->'description') not in ('string','null') or char_length(coalesce(v_a->>'description',''))>500
    then raise exception 'Ungültige Zusatzkosten' using errcode='22023'; end if;
  end loop;
  -- Unzugeordnete neue Aufträge bleiben zunächst nur in der Bestellübersicht.
  if v_draft.id is null and not p_explicit and not v_complete then return null; end if;
  if v_draft.id is null then
    insert into public.ebay_sale_drafts(workspace_id,environment,external_account_id,source_key,order_id,source,assignments,costs,state)
      values(v_order.workspace_id,v_order.environment,v_order.external_account_id,v_order.source_key,v_order.order_id,v_order.source,'[]',v_costs,'needs_mapping') returning * into v_draft;
  end if;
  if v_order.source->>'cancelStatus'='CANCELED' then
    perform public.ebay_release_sale_reservations(v_draft.id);
    v_state:='blocked';
  elsif v_order.source->>'paymentStatus' is distinct from 'PAID' or v_order.source->>'cancelStatus' is distinct from 'NONE_REQUESTED'
    or v_order.source->'blockers' is distinct from '[]'::jsonb or v_order.source->>'currency' is distinct from 'EUR'
    or exists(select 1 from jsonb_array_elements(v_order.source->'lines') l where l->'hasRefund' is distinct from 'false'::jsonb)
  then
    -- Unklare Quelle hält die bisherige Reservierung einschließlich ihrer Zuordnung fest.
    update public.ebay_sale_drafts set source=v_order.source,costs=v_costs,state='blocked',updated_at=clock_timestamp() where id=v_draft.id;
    return v_draft.id;
  else
    perform public.ebay_lock_draft_stock(v_order.workspace_id,v_draft.assignments||v_assignments);
    if v_draft.assignments is distinct from v_assignments or v_draft.source->'lines' is distinct from v_order.source->'lines' then
      perform public.ebay_release_sale_reservations(v_draft.id);
    end if;
    v_state:=case when v_complete then 'needs_costs' else 'needs_mapping' end;
    if v_complete and not exists(select 1 from public.ebay_sale_reservations where draft_id=v_draft.id and released_at is null) then
      -- Untertransaktion: Ein Fehlbestand nimmt sämtliche Paketreservierungen zurück.
      begin
        for v_group in select a->'target' target,sum((l->>'quantity')::integer)::integer quantity from jsonb_array_elements(v_assignments) a
          join jsonb_array_elements(v_order.source->'lines') l on l->>'lineItemId'=a->>'lineItemId' group by a->'target' order by (a->'target')::text loop
          if v_group.quantity is null or v_group.quantity<=0 then raise exception 'Ungültige Menge' using errcode='22023'; end if;
          if v_group.target?'inventoryItemId' then
            select * into strict v_item from public.inventory_items where id=(v_group.target->>'inventoryItemId')::uuid and workspace_id=v_order.workspace_id;
            if v_group.quantity<>1 or v_item.status not in ('ready','listed') or v_item.archived_at is not null
              or exists(select 1 from public.purchases where id=v_item.purchase_id and entry_status<>'finalized')
              or exists(select 1 from public.inventory_item_sale_states where inventory_item_id=v_item.id and sale_state<>'no_active_sale')
            then raise exception 'Bestand fehlt' using errcode='P2001'; end if;
            update public.inventory_items set status='reserved' where id=v_item.id;
            insert into public.ebay_sale_reservations(workspace_id,draft_id,inventory_item_id,quantity,previous_status) values(v_order.workspace_id,v_draft.id,v_item.id,1,v_item.status);
          else
            v_remaining:=v_group.quantity;
            for v_lot in select l.* from public.stock_lots l join public.purchases p on p.id=l.purchase_id and p.workspace_id=l.workspace_id
              where l.workspace_id=v_order.workspace_id and l.catalog_product_id=(v_group.target->>'catalogProductId')::uuid and p.entry_status='finalized' and l.remaining_quantity>0 order by l.received_at,l.id loop
              v_take:=least(v_remaining,greatest(0,v_lot.remaining_quantity-public.stock_lot_reserved_quantity(v_lot.id)));
              if v_take>0 then
                insert into public.ebay_sale_reservations(workspace_id,draft_id,stock_lot_id,quantity) values(v_order.workspace_id,v_draft.id,v_lot.id,v_take);
                insert into public.stock_movements(workspace_id,stock_lot_id,direction,quantity,reason,ebay_sale_draft_id) values(v_order.workspace_id,v_lot.id,'out',v_take,'reservation',v_draft.id);
                v_remaining:=v_remaining-v_take;
              end if;
              exit when v_remaining=0;
            end loop;
            if v_remaining>0 then raise exception 'Bestand fehlt' using errcode='P2001'; end if;
          end if;
        end loop;
      exception when sqlstate 'P2001' then v_state:='needs_stock';
      end;
    end if;
    if v_state='needs_costs' and public.ebay_valid_cents(v_costs->'platformFeeCents') and public.ebay_valid_cents(v_costs->'shippingCostCents') then v_state:='ready_for_review'; end if;
  end if;
  update public.ebay_sale_drafts set source=v_order.source,assignments=v_assignments,costs=v_costs,state=v_state,updated_at=clock_timestamp() where id=v_draft.id;
  return v_draft.id;
end;
$function$;

revoke all on function public.ebay_prepare_sale_draft(bigint, jsonb, jsonb, boolean) from public;

grant all on function public.ebay_prepare_sale_draft(bigint, jsonb, jsonb, boolean) to service_role;

create or replace function public.ebay_record_order_sale (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_snapshot_id   uuid,
  p_assignments   jsonb,
  p_costs         jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_connection public.ebay_connections; v_snapshot public.ebay_order_snapshots; v_booking public.ebay_order_bookings;
  v_source jsonb; v_line jsonb; v_assignment jsonb; v_target jsonb; v_cost jsonb;
  v_lines jsonb := '[]'; v_links jsonb := '[]'; v_costs jsonb := '[]'; v_result jsonb;
  v_quantity integer; v_cents bigint; v_base bigint; v_remainder integer; v_count integer;
  v_draft public.ebay_sale_drafts; v_total bigint := 0; v_id uuid; v_index integer := 0; v_sale_date date;
begin
  v_connection := public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id and workspace_id = p_workspace_id
    and connection_id = p_connection_id and user_id = (select auth.uid())
    and authorization_version = v_connection.authorization_version and external_account_id = v_connection.external_account_id;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  -- Auch eine noch nicht angelegte Quelle wird bis Commit gesperrt.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_connection.environment || ':' || v_snapshot.source_key,0));
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id for update;
  select * into v_booking from public.ebay_order_bookings where workspace_id = p_workspace_id
    and environment = v_connection.environment and source_key = v_snapshot.source_key;
  if found then
    return jsonb_build_object('status',v_booking.status,'saleId',v_booking.sale_id)
      || case when v_booking.status = 'imported' then jsonb_build_object('alreadyRecorded',true) else '{}'::jsonb end;
  end if;
  if not v_snapshot.booking_ready or v_snapshot.expires_at <= clock_timestamp()
  then raise exception 'Bestellung bitte erneut prüfen' using errcode = '22023'; end if;
  v_source := v_snapshot.source;
  if v_source->>'currency' is distinct from 'EUR' or v_source->>'paymentStatus' is distinct from 'PAID'
    or v_source->>'cancelStatus' is distinct from 'NONE_REQUESTED' or v_source->'blockers' is distinct from '[]'::jsonb
    or not public.ebay_valid_cents(v_source->'totalCents') or not public.ebay_valid_cents(v_source->'shippingRevenueCents')
    or jsonb_typeof(v_source->'lines') is distinct from 'array' or jsonb_array_length(v_source->'lines') not between 1 and 200
  then raise exception 'Bestellung ist nicht buchbar' using errcode = '22023'; end if;
  if exists (select 1 from public.sales where workspace_id = p_workspace_id and lower(platform) = 'ebay'
    and external_order_id = v_source->>'orderId')
  then raise exception 'Vorhandenen eBay-Verkauf bitte zuerst prüfen und manuell zuordnen' using errcode = '22023'; end if;
  if jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments) <> jsonb_array_length(v_source->'lines')
    or (select count(distinct value->>'lineItemId') from jsonb_array_elements(p_assignments)) <> jsonb_array_length(p_assignments)
    or (select count(distinct value->>'lineItemId') from jsonb_array_elements(v_source->'lines')) <> jsonb_array_length(v_source->'lines')
  then raise exception 'Ungültige Artikelzuordnung' using errcode = '22023'; end if;
  if jsonb_typeof(p_costs) is distinct from 'object' or not public.ebay_valid_cents(p_costs->'platformFeeCents')
    or not public.ebay_valid_cents(p_costs->'shippingCostCents') or jsonb_typeof(p_costs->'additionalCosts') is distinct from 'array'
    or jsonb_array_length(p_costs->'additionalCosts') > 50
    or not (p_costs ? 'shippingMode') or (p_costs->'shippingMode' <> 'null'::jsonb and p_costs->>'shippingMode' not in ('seller_arranged','platform_prepaid','pickup'))
    or exists (select 1 from jsonb_object_keys(p_costs) k where k not in ('platformFeeCents','shippingCostCents','shippingMode','additionalCosts'))
  then raise exception 'Kosten bitte ausdrücklich bestätigen' using errcode = '22023'; end if;
  for v_cost in select value from jsonb_array_elements(p_costs->'additionalCosts') loop
    if jsonb_typeof(v_cost) is distinct from 'object' or not public.ebay_valid_cents(v_cost->'amountCents')
      or coalesce(v_cost->>'category','') not in ('packaging','payment_fee','promotion','other')
      or jsonb_typeof(v_cost->'description') is distinct from 'null' and jsonb_typeof(v_cost->'description') is distinct from 'string'
      or char_length(coalesce(v_cost->>'description','')) > 500
      or exists (select 1 from jsonb_object_keys(v_cost) k where k not in ('category','description','amountCents'))
    then raise exception 'Ungültige Kosten' using errcode = '22023'; end if;
    v_costs := v_costs || jsonb_build_array(jsonb_build_object('category',v_cost->>'category','description',v_cost->>'description','amount',round((v_cost->>'amountCents')::numeric/100,2)));
  end loop;
  for v_line in select value from jsonb_array_elements(v_source->'lines') loop
    if not public.ebay_valid_cents(v_line->'goodsCents') or v_line->'hasRefund' is distinct from 'false'::jsonb
      or jsonb_typeof(v_line->'quantity') is distinct from 'number' or coalesce(v_line->>'quantity','') !~ '^[1-9][0-9]{0,9}$'
      or (v_line->>'quantity')::numeric > 2147483647
    then raise exception 'Ungültige Quellposition' using errcode = '22023'; end if;
    v_quantity := (v_line->>'quantity')::integer; v_cents := (v_line->>'goodsCents')::bigint;
    if v_cents < v_quantity then raise exception 'Stückpreise müssen positiv sein' using errcode = '22023'; end if;
    select value into v_assignment from jsonb_array_elements(p_assignments) where value->>'lineItemId' = v_line->>'lineItemId';
    if not found or jsonb_typeof(v_assignment) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_assignment)) <> 2
    then raise exception 'Ungültige Artikelzuordnung' using errcode = '22023'; end if;
    v_target := public.ebay_import_target(p_workspace_id,v_assignment->'target');
    if v_target ? 'inventory_item_id' and v_quantity <> 1 then raise exception 'Einzelstückmenge muss eins sein' using errcode = '22023'; end if;
    v_base := v_cents / v_quantity; v_remainder := (v_cents % v_quantity)::integer;
    for v_count in 0..1 loop
      v_index := case when v_count = 0 then v_quantity-v_remainder else v_remainder end;
      if v_index > 0 then
        v_lines := v_lines || jsonb_build_array(v_target || jsonb_build_object('quantity',v_index,'unit_sale_price',round((v_base+v_count)::numeric/100,2),'title_snapshot',v_line->>'title'));
        v_links := v_links || jsonb_build_array(jsonb_build_object('lineItemId',v_line->>'lineItemId','quantity',v_index,'unitPriceCents',v_base+v_count));
      end if;
    end loop;
    v_total := v_total + v_cents;
  end loop;
  if v_total + (v_source->>'shippingRevenueCents')::bigint <> (v_source->>'totalCents')::bigint
    or v_total > 999999999999 then raise exception 'Quellbeträge passen nicht zusammen' using errcode = '22023'; end if;
  v_sale_date := ((v_source->>'createdAt')::timestamptz at time zone 'Europe/Berlin')::date;
  if v_sale_date is null then raise exception 'Verkaufsdatum fehlt' using errcode = '22023'; end if;
  select * into v_draft from public.ebay_sale_drafts where workspace_id=p_workspace_id
    and environment=v_connection.environment and source_key=v_snapshot.source_key for update;
  if v_draft.id is not null then
    if v_draft.state in ('blocked','dismissed','linked_existing','booked')
      or (select jsonb_agg(a order by a->>'lineItemId') from jsonb_array_elements(v_draft.assignments) a)
        is distinct from (select jsonb_agg(a order by a->>'lineItemId') from jsonb_array_elements(p_assignments) a)
    then raise exception 'Gespeicherten Entwurf bitte erneut prüfen' using errcode='22023'; end if;
    perform public.ebay_release_sale_reservations(v_draft.id);
  end if;
  v_result := public.record_sale(p_workspace_id,jsonb_build_object('platform','ebay','sale_date',v_sale_date,
    'external_order_id',v_source->>'orderId','shipping_revenue',round((v_source->>'shippingRevenueCents')::numeric/100,2),
    'platform_fee',round((p_costs->>'platformFeeCents')::numeric/100,2),'shipping_cost',round((p_costs->>'shippingCostCents')::numeric/100,2),
    'shipping_mode',p_costs->>'shippingMode','cost_entries',v_costs),v_lines);
  v_id := (v_result->'sale'->>'id')::uuid;
  if jsonb_array_length(v_result->'sale_line_ids') is distinct from jsonb_array_length(v_links)
  then raise exception 'Verkaufspositionen konnten nicht bestätigt werden' using errcode = '22023'; end if;
  select jsonb_agg(link.value || jsonb_build_object('saleLineId',v_result->'sale_line_ids'->(link.ordinality::int-1)) order by link.ordinality)
    into v_links from jsonb_array_elements(v_links) with ordinality as link(value,ordinality);
  insert into public.ebay_order_bookings(workspace_id,environment,source_key,status,sale_id,source_lines,recorded_by)
    values (p_workspace_id,v_connection.environment,v_snapshot.source_key,'imported',v_id,v_links,(select auth.uid()));
  update public.ebay_sale_drafts set state='booked',sale_id=v_id,costs=p_costs,source=v_source,updated_at=clock_timestamp() where id=v_draft.id;
  return jsonb_build_object('status','imported','saleId',v_id,'alreadyRecorded',false);
end;
$function$;

create function public.ebay_release_sale_reservations (
  p_draft_id uuid
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
declare v_draft public.ebay_sale_drafts; v_res public.ebay_sale_reservations;
begin
  select * into strict v_draft from public.ebay_sale_drafts where id=p_draft_id;
  perform public.ebay_lock_draft_stock(v_draft.workspace_id,v_draft.assignments);
  for v_res in select * from public.ebay_sale_reservations where draft_id=p_draft_id and released_at is null order by id for update loop
    update public.ebay_sale_reservations set released_at=clock_timestamp() where id=v_res.id;
    if v_res.inventory_item_id is not null then
      update public.inventory_items set status=v_res.previous_status where id=v_res.inventory_item_id and status='reserved';
    else
      insert into public.stock_movements(workspace_id,stock_lot_id,direction,quantity,reason,ebay_sale_draft_id)
        values(v_res.workspace_id,v_res.stock_lot_id,'in',v_res.quantity,'reservation_release',p_draft_id);
    end if;
  end loop;
end;
$function$;

revoke all on function public.ebay_release_sale_reservations(uuid) from public;

grant all on function public.ebay_release_sale_reservations(uuid) to service_role;

create function public.ebay_reservation_resolve (
  p_workspace_id uuid,
  p_draft_id     uuid,
  p_reason       text
)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.ebay_sale_drafts;
begin
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then raise exception 'Klärgrund fehlt' using errcode='22023'; end if;
  select * into v_draft from public.ebay_sale_drafts where workspace_id=p_workspace_id and id=p_draft_id;
  if not found then raise exception 'Reservierung fehlt' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_draft.environment||':'||v_draft.source_key,0));
  select * into v_draft from public.ebay_sale_drafts where id=p_draft_id for update;
  if v_draft.state in ('booked','linked_existing') then raise exception 'Gebuchten Verkauf über Retouren klären' using errcode='22023'; end if;
  perform public.ebay_close_sale_draft(p_workspace_id,v_draft.environment,v_draft.source_key,'dismissed',null,trim(p_reason));
  return true;
end;
$function$;

revoke all on function public.ebay_reservation_resolve(uuid, uuid, text) from public;

grant all on function public.ebay_reservation_resolve(uuid, uuid, text) to authenticated;

grant all on function public.ebay_reservation_resolve(uuid, uuid, text) to service_role;

create function public.ebay_reservations_read (
  p_workspace_id uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'draftId',r.draft_id,'inventoryItemId',r.inventory_item_id,'stockLotId',r.stock_lot_id,'quantity',r.quantity,'createdAt',r.created_at) order by r.id),'[]'::jsonb)
    from public.ebay_sale_reservations r where workspace_id=p_workspace_id and released_at is null);
end;
$function$;

revoke all on function public.ebay_reservations_read(uuid) from public;

grant all on function public.ebay_reservations_read(uuid) to authenticated;

grant all on function public.ebay_reservations_read(uuid) to service_role;

create function public.ebay_sale_drafts_read (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.ebay_connections; v_result jsonb;
begin
  v_connection:=public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  select coalesce(jsonb_agg(public.ebay_sale_draft_json(d) order by d.created_at desc),'[]'::jsonb) into v_result
    from public.ebay_sale_drafts d where workspace_id=p_workspace_id and environment=v_connection.environment and external_account_id=v_connection.external_account_id
      and state not in ('booked','linked_existing','dismissed');
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'drafts',v_result);
end;
$function$;

revoke all on function public.ebay_sale_drafts_read(uuid, uuid) from public;

grant all on function public.ebay_sale_drafts_read(uuid, uuid) to authenticated;

grant all on function public.ebay_sale_drafts_read(uuid, uuid) to service_role;

create function public.ebay_sale_notification_update (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_event_id      bigint,
  p_action        text
)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.ebay_connections;
begin
  v_connection:=public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  if p_action is null or p_action not in ('read','unread','dismiss') then raise exception 'Ungültige Aktion' using errcode='22023'; end if;
  if not exists(select 1 from public.ebay_sale_notifications where id=p_event_id and workspace_id=p_workspace_id and environment=v_connection.environment and external_account_id=v_connection.external_account_id)
    then raise exception 'Privater Kontozugriff verweigert' using errcode='42501'; end if;
  insert into public.ebay_sale_notification_receipts(event_id,user_id,read_at,dismissed_at)
    values(p_event_id,(select auth.uid()),case when p_action in ('read','dismiss') then clock_timestamp() end,case when p_action='dismiss' then clock_timestamp() end)
    on conflict(event_id,user_id) do update set read_at=excluded.read_at,dismissed_at=coalesce(excluded.dismissed_at,public.ebay_sale_notification_receipts.dismissed_at);
  return true;
end;
$function$;

revoke all on function public.ebay_sale_notification_update(uuid, uuid, bigint, text) from public;

grant all on function public.ebay_sale_notification_update(uuid, uuid, bigint, text) to authenticated;

grant all on function public.ebay_sale_notification_update(uuid, uuid, bigint, text) to service_role;

create function public.ebay_sale_notifications_read (
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
  return (select coalesce(jsonb_agg(jsonb_build_object('eventId',n.id,'eventKey','ebay-sale:'||n.id::text,'workspaceId',n.workspace_id,
    'connectionId',p_connection_id,'orderId',n.order_id,'draftId',d.id,'state',coalesce(d.state,'needs_mapping'),'createdAt',n.created_at,'readAt',r.read_at)
    order by n.created_at desc,n.id desc),'[]'::jsonb) from (select * from public.ebay_sale_notifications n
      where workspace_id=p_workspace_id and environment=v_connection.environment and external_account_id=v_connection.external_account_id
        and not exists(select 1 from public.ebay_sale_notification_receipts r where r.event_id=n.id and r.user_id=(select auth.uid()) and r.dismissed_at is not null)
      order by created_at desc,id desc limit 100 offset (p_page-1)*100) n
    left join public.ebay_sale_drafts d on d.workspace_id=n.workspace_id and d.environment=n.environment and d.source_key=n.source_key
    left join public.ebay_sale_notification_receipts r on r.event_id=n.id and r.user_id=(select auth.uid()));
end;
$function$;

revoke all on function public.ebay_sale_notifications_read(uuid, uuid, integer) from public;

grant all on function public.ebay_sale_notifications_read(uuid, uuid, integer) to authenticated;

grant all on function public.ebay_sale_notifications_read(uuid, uuid, integer) to service_role;

create function public.ebay_save_sale_draft (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_snapshot_id   uuid,
  p_assignments   jsonb,
  p_costs         jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.ebay_connections; v_snapshot public.ebay_order_snapshots; v_id bigint; v_draft_id uuid; v_draft public.ebay_sale_drafts;
begin
  v_connection:=public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  select * into v_snapshot from public.ebay_order_snapshots where id=p_snapshot_id and connection_id=p_connection_id
    and user_id=(select auth.uid()) and workspace_id=p_workspace_id and authorization_version=v_connection.authorization_version
    and environment=v_connection.environment and external_account_id=v_connection.external_account_id and expires_at>clock_timestamp();
  if not found then raise exception 'Bestellung bitte erneut prüfen' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_connection.environment||':'||v_snapshot.source_key,0));
  if exists(select 1 from public.ebay_cached_orders where workspace_id=p_workspace_id and environment=v_connection.environment
    and source_key=v_snapshot.source_key and observed_at>v_snapshot.created_at
    and source-'observedAt' is distinct from v_snapshot.source-'observedAt')
  then raise exception 'Quellstand wurde geändert; bitte erneut prüfen' using errcode='22023'; end if;
  insert into public.ebay_cached_orders(workspace_id,environment,external_account_id,order_id,source_key,source,created_at)
    values(p_workspace_id,v_connection.environment,v_connection.external_account_id,v_snapshot.source->>'orderId',v_snapshot.source_key,v_snapshot.source,(v_snapshot.source->>'createdAt')::timestamptz)
    on conflict(workspace_id,environment,source_key) do update set source=excluded.source,observed_at=clock_timestamp() returning id into v_id;
  v_draft_id:=public.ebay_prepare_sale_draft(v_id,p_assignments,p_costs,true);
  select * into v_draft from public.ebay_sale_drafts where id=v_draft_id;
  return public.ebay_sale_draft_json(v_draft);
end;
$function$;

revoke all on function public.ebay_save_sale_draft(uuid, uuid, uuid, jsonb, jsonb) from public;

grant all on function public.ebay_save_sale_draft(uuid, uuid, uuid, jsonb, jsonb) to authenticated;

grant all on function public.ebay_save_sale_draft(uuid, uuid, uuid, jsonb, jsonb) to service_role;

create or replace function public.ebay_store_order_snapshot (
  p_user_id       uuid,
  p_connection_id uuid,
  p_version       bigint,
  p_operation_id  uuid,
  p_source_key    text,
  p_review_hash   text,
  p_source        jsonb,
  p_booking_ready boolean
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_connection public.ebay_connections; v_snapshot public.ebay_order_snapshots; v_now timestamptz := clock_timestamp(); v_assignments jsonb; v_draft jsonb;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id;
  v_connection := public.ebay_lock_import_connection(p_user_id,v_connection.workspace_id,p_connection_id);
  if v_connection.authorization_version is distinct from p_version or v_connection.operation_id is distinct from p_operation_id
    or p_operation_id is null or v_connection.operation_expires_at <= clock_timestamp()
  then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_source_key is null or p_source_key !~ '^[0-9a-f]{64}$' or p_review_hash is null or p_review_hash !~ '^[0-9a-f]{64}$'
    or p_booking_ready is null or jsonb_typeof(p_source) is distinct from 'object'
    or jsonb_typeof(p_source->'lines') is distinct from 'array' or jsonb_array_length(p_source->'lines') > 200
    or jsonb_typeof(p_source->'blockers') is distinct from 'array'
    or char_length(p_source->>'orderId') not between 1 and 256 or p_source->>'orderId' is null
    or octet_length(p_source::text) > 262144
  then raise exception 'Ungültige Quelle' using errcode = '22023'; end if;
  -- Begrenzte Bereinigung nur für das gerade bestätigte persönliche Konto.
  delete from public.ebay_order_snapshots where id in (
    select id from public.ebay_order_snapshots where connection_id = p_connection_id and expires_at <= v_now
      order by expires_at limit 100
  );
  insert into public.ebay_order_snapshots(workspace_id,connection_id,user_id,authorization_version,environment,external_account_id,source_key,review_hash,source,booking_ready,created_at,expires_at)
    values (v_connection.workspace_id,p_connection_id,p_user_id,p_version,v_connection.environment,v_connection.external_account_id,
      p_source_key,p_review_hash,p_source,p_booking_ready,v_now,v_now + case when p_booking_ready then interval '30 seconds' else interval '5 minutes' end)
    returning * into v_snapshot;
  select coalesce(jsonb_agg(jsonb_build_object('lineItemId',line->>'lineItemId','target',
    case when m.inventory_item_id is not null then jsonb_build_object('inventoryItemId',m.inventory_item_id)
      else jsonb_build_object('catalogProductId',m.catalog_product_id) end)), '[]'::jsonb) into v_assignments
    from jsonb_array_elements(p_source->'lines') line join public.ebay_article_mappings m
      on m.workspace_id = v_connection.workspace_id and m.environment = v_connection.environment
      and m.external_account_id = v_connection.external_account_id and m.listing_id = line->>'listingId'
      and m.variation_id is not distinct from line->>'variationId'
      and (m.variation_id is not null or line->'variationAspects' = '[]'::jsonb);
  -- Vor der Cachezeile dieselbe Quellensperre wie Hintergrundabgleich und Buchung.
  perform pg_advisory_xact_lock(hashtextextended(v_connection.workspace_id::text||':'||v_connection.environment||':'||p_source_key,0));
  -- Der neue Anbieterstand aktualisiert nur bereits bekannte Quellen; historisches Öffnen reserviert nichts.
  update public.ebay_cached_orders set source=p_source,observed_at=v_now where workspace_id=v_connection.workspace_id
    and environment=v_connection.environment and external_account_id=v_connection.external_account_id and source_key=p_source_key;
  select public.ebay_sale_draft_json(d) into v_draft from public.ebay_sale_drafts d
    where workspace_id=v_connection.workspace_id and environment=v_connection.environment and source_key=p_source_key;
  if v_draft is not null then v_assignments:=v_draft->'assignments'; end if;
  return jsonb_build_object('draft',v_draft,'workspaceId',v_connection.workspace_id,'connectionId',p_connection_id,'snapshotId',v_snapshot.id,'reviewHash',p_review_hash,
    'expiresAt',v_snapshot.expires_at,'source',p_source,'assignments',v_assignments,
    'booking',public.ebay_get_order_booking(p_user_id,p_connection_id,p_source_key));
end;
$function$;

create or replace function public.record_sale (
  p_workspace_id uuid,
  p_sale         jsonb,
  p_lines        jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_input_line jsonb;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_stock_lot public.stock_lots;
  v_catalog_product public.catalog_products;
  v_inventory_item public.inventory_items;
  v_workspace public.workspaces;
  v_catalog_product_id uuid;
  v_inventory_item_id uuid;
  v_header_inventory_item_id uuid;
  v_source_purchase_id uuid;
  v_source_purchase_status text;
  v_locked_purchase_ids uuid[] := array[]::uuid[];
  v_quantity integer;
  v_unit_sale_price numeric(12, 2);
  v_line_total numeric(12, 2);
  v_tax_costs numeric[];
  v_business_unit_costs numeric[];
  v_line_tax_costs numeric[];
  v_tax_unknown boolean;
  v_line_cogs numeric(12, 2);
  v_remaining_quantity integer;
  v_allocated_quantity integer;
  v_allocation_cost numeric(12,2);
  v_previously_allocated_cost numeric(12,2);
  v_lot_total_cost numeric(12,2);
  v_remaining_lot_cost numeric(12,2);
  v_remaining_cost_cents bigint;
  v_previously_active_quantity integer;
  v_consumption_sequence bigint;
  v_ambiguous_active_cost_count integer;
  v_invalid_restocked_quantity_count integer;
  v_sale_total numeric(12, 2) := 0;
  v_shipping_revenue numeric(12,2) := 0;
  v_shipping_mode text;
  v_cost_entries jsonb := '[]'::jsonb;
  v_cost_entry jsonb;
  v_packaging_cost numeric(12,2) := 0;
  v_other_costs numeric(12,2) := 0;
  v_money_key text;
  v_sale_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_sale_state text;
  v_business_event_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_sale) <> 'object'
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0
    or nullif(trim(p_sale ->> 'platform'), '') is null
    or (p_sale ->> 'sale_date') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungültig.';
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

  select * into v_workspace
  from public.workspaces
  where id = p_workspace_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Workspace wurde nicht gefunden.';
  end if;

  -- Validate every line before taking locks or writing the sale header.
  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(trim(v_input_line ->> 'catalog_product_id'), ''),
        nullif(trim(v_input_line ->> 'inventory_item_id'), '')
      ) <> 1
      or (
        nullif(trim(v_input_line ->> 'catalog_product_id'), '') is not null
        and jsonb_typeof(v_input_line -> 'catalog_product_id') <> 'string'
      )
      or (
        nullif(trim(v_input_line ->> 'inventory_item_id'), '') is not null
        and jsonb_typeof(v_input_line -> 'inventory_item_id') <> 'string'
      ) then
      raise exception using errcode = '22023', message = 'Eine Verkaufsposition ist ungültig.';
    end if;
  end loop;

  -- Lock every currently relevant source purchase before any item or lot.
  -- Reopen/correction use the same purchase-first order, and UUID sorting
  -- prevents client-controlled deadlocks across mixed multi-line sales.
  select coalesce(
    pg_catalog.array_agg(source.purchase_id order by source.purchase_id),
    array[]::uuid[]
  )
  into v_locked_purchase_ids
  from (
    select coalesce(item.purchase_id, linked_line.purchase_id) as purchase_id
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    join public.inventory_items as item
      on item.workspace_id = p_workspace_id
      and item.id = (element.value ->> 'inventory_item_id')::uuid
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where nullif(pg_catalog.btrim(element.value ->> 'inventory_item_id'), '') is not null

    union

    select lot.purchase_id
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    join public.stock_lots as lot
      on lot.workspace_id = p_workspace_id
      and lot.catalog_product_id = (element.value ->> 'catalog_product_id')::uuid
      and lot.remaining_quantity > 0
    where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
  ) as source
  where source.purchase_id is not null;

  if pg_catalog.cardinality(v_locked_purchase_ids) > 0 then
    for v_purchase_position in 1..pg_catalog.cardinality(v_locked_purchase_ids) loop
      perform purchase.id
      from public.purchases as purchase
      where purchase.workspace_id = p_workspace_id
        and purchase.id = v_locked_purchase_ids[v_purchase_position]
      for update;
    end loop;
  end if;

  -- Nach den Einkäufen und vor den Losen sperren und Archivstatus prüfen.
  for v_catalog_product_id in
    select candidate.catalog_product_id
    from (
      select distinct (element.value ->> 'catalog_product_id')::uuid as catalog_product_id
      from pg_catalog.jsonb_array_elements(p_lines) as element(value)
      where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
    ) as candidate
    order by candidate.catalog_product_id
  loop
    select * into v_catalog_product from public.catalog_products
      where workspace_id = p_workspace_id and id = v_catalog_product_id for update;
    if not found then
      raise exception using errcode = '22023', message = 'Der Mengenartikel ist ungültig.';
    end if;
    if v_catalog_product.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
    end if;
  end loop;

  -- A draft lot can exist while goods are being received, but it must never
  -- close an availability gap for a sale. Keep finalized inventory sellable
  -- even when another draft of the same product exists.
  for v_input_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
  loop
    v_catalog_product_id := (v_input_line ->> 'catalog_product_id')::uuid;
    v_quantity := (v_input_line ->> 'quantity')::integer;

    if coalesce((
      select pg_catalog.sum(lot.remaining_quantity)
      from public.stock_lots as lot
      join public.purchases as purchase
        on purchase.workspace_id = lot.workspace_id
        and purchase.id = lot.purchase_id
      where lot.workspace_id = p_workspace_id
        and lot.catalog_product_id = v_catalog_product_id
        and lot.remaining_quantity > 0
        and purchase.entry_status = 'finalized'
    ), 0) < v_quantity
      and exists (
        select 1
        from public.stock_lots as lot
        join public.purchases as purchase
          on purchase.workspace_id = lot.workspace_id
          and purchase.id = lot.purchase_id
        where lot.workspace_id = p_workspace_id
          and lot.catalog_product_id = v_catalog_product_id
          and lot.remaining_quantity > 0
          and purchase.entry_status is distinct from 'finalized'
      ) then
      raise exception using
        errcode = '22023',
        message = 'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.';
    end if;
  end loop;

  -- Resolve unique UUIDs first and lock the items in one stable order.
  for v_inventory_item_id in
    select candidate.inventory_item_id
    from (
      select distinct (element.value ->> 'inventory_item_id')::uuid as inventory_item_id
      from jsonb_array_elements(p_lines) as element(value)
      where nullif(trim(element.value ->> 'inventory_item_id'), '') is not null
    ) as candidate
    order by candidate.inventory_item_id
  loop
    select * into v_inventory_item
    from public.inventory_items
    where id = v_inventory_item_id
      and workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Der Einzelartikel wurde nicht gefunden.';
    end if;

    if v_inventory_item.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
    end if;

    v_source_purchase_id := v_inventory_item.purchase_id;
    if v_source_purchase_id is null and v_inventory_item.purchase_line_id is not null then
      select line.purchase_id
      into v_source_purchase_id
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.id = v_inventory_item.purchase_line_id;
    end if;

    if v_source_purchase_id is not null then
      if not (v_source_purchase_id = any(v_locked_purchase_ids)) then
        raise exception using
          errcode = '40001',
          message = 'Die Einkaufszuordnung des Einzelartikels wurde parallel geändert.';
      end if;

      select purchase.entry_status
      into v_source_purchase_status
      from public.purchases as purchase
      where purchase.workspace_id = p_workspace_id
        and purchase.id = v_source_purchase_id;

      if v_source_purchase_status is distinct from 'finalized' then
        raise exception using
          errcode = '22023',
          message = 'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.';
      end if;
    end if;

    select sale_state into v_sale_state
    from public.inventory_item_sale_states
    where inventory_item_id = v_inventory_item.id
      and workspace_id = p_workspace_id;

    if v_inventory_item.status not in ('ready', 'listed')
      or v_sale_state is distinct from 'no_active_sale' then
      raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
    end if;
  end loop;

  if jsonb_array_length(p_lines) = 1
    and jsonb_typeof(p_lines -> 0 -> 'inventory_item_id') = 'string' then
    v_header_inventory_item_id := (p_lines -> 0 ->> 'inventory_item_id')::uuid;
  end if;

  insert into public.sales (
    workspace_id,
    inventory_item_id,
    platform,
    sale_price,
    sale_price_total,
    sale_date,
    platform_fee,
    shipping_cost,
    packaging_cost,
    other_costs,
    shipping_revenue,
    shipping_mode,
    external_order_id,
    external_listing_id,
    buyer_notes,
    created_at
  ) values (
    p_workspace_id,
    v_header_inventory_item_id,
    trim(p_sale ->> 'platform'),
    0,
    0,
    (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    v_packaging_cost,
    v_other_costs,
    v_shipping_revenue,
    v_shipping_mode,
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), ''),
    pg_catalog.clock_timestamp()
  )
  returning * into v_sale;

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

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(v_input_line ->> 'catalog_product_id', ''),
        nullif(v_input_line ->> 'inventory_item_id', '')
      ) <> 1 then
      raise exception using errcode = '22023', message = 'Eine Verkaufsposition ist ungültig.';
    end if;

    v_catalog_product_id := nullif(v_input_line ->> 'catalog_product_id', '')::uuid;
    v_inventory_item_id := nullif(v_input_line ->> 'inventory_item_id', '')::uuid;
    v_quantity := (v_input_line ->> 'quantity')::integer;
    v_unit_sale_price := (v_input_line ->> 'unit_sale_price')::numeric(12, 2);
    v_line_total := v_quantity * v_unit_sale_price;
    v_line_cogs := 0;
    v_line_tax_costs := array[]::numeric[];
    v_tax_unknown := false;

    if v_catalog_product_id is not null then
      select * into v_catalog_product
      from public.catalog_products
      where id = v_catalog_product_id
        and workspace_id = p_workspace_id;

      if not found then
        raise exception using errcode = '22023', message = 'Der Mengenartikel ist ungültig.';
      end if;

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        catalog_product_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
        tax_mode
      ) values (
        p_workspace_id,
        v_sale.id,
        v_catalog_product.id,
        coalesce(nullif(trim(v_input_line ->> 'title_snapshot'), ''), v_catalog_product.title),
        v_quantity,
        v_unit_sale_price,
        v_line_total,
        0,
        v_workspace.tax_mode
      )
      returning * into v_sale_line;

      v_remaining_quantity := v_quantity;
      for v_stock_lot in
        select lot.*
        from public.stock_lots as lot
        join public.purchases as purchase
          on purchase.workspace_id = lot.workspace_id
          and purchase.id = lot.purchase_id
        where lot.workspace_id = p_workspace_id
          and lot.catalog_product_id = v_catalog_product.id
          and lot.remaining_quantity > 0
          and purchase.id = any(v_locked_purchase_ids)
          and purchase.entry_status = 'finalized'
        order by lot.received_at, lot.id
        for update of lot
      loop
        exit when v_remaining_quantity = 0;

        -- Fremde und manuelle Reservierungen bleiben auch beim allgemeinen FIFO geschützt.
        v_allocated_quantity := least(v_remaining_quantity, greatest(0,
          v_stock_lot.remaining_quantity - public.stock_lot_reserved_quantity(v_stock_lot.id)));
        continue when v_allocated_quantity = 0;

        select
          coalesce(pg_catalog.sum(coalesce(
            allocation.active_allocated_cost,
            case
              when movement_state.restocked_quantity = allocation.quantity then 0
              when movement_state.restocked_quantity = 0 then allocation.allocated_cost
              else null
            end
          )), 0),
          pg_catalog.count(*) filter (
            where allocation.active_allocated_cost is null
              and movement_state.restocked_quantity not in (0, allocation.quantity)
          )::integer,
          coalesce(pg_catalog.sum(
            allocation.quantity - movement_state.restocked_quantity
          ), 0)::integer,
          pg_catalog.count(*) filter (
            where movement_state.restocked_quantity < 0
              or movement_state.restocked_quantity > allocation.quantity
          )::integer
        into
          v_previously_allocated_cost,
          v_ambiguous_active_cost_count,
          v_previously_active_quantity,
          v_invalid_restocked_quantity_count
        from public.sale_line_lot_allocations as allocation
        left join lateral (
          select coalesce(pg_catalog.sum(
            case
              when movement.direction = 'in' and movement.reason = 'return'
                then movement.quantity
              when movement.direction = 'out' and movement.reason = 'damage'
                then -movement.quantity
              else 0
            end
          ), 0)::integer as restocked_quantity
          from public.stock_movements as movement
          where movement.workspace_id = allocation.workspace_id
            and movement.stock_lot_id = allocation.stock_lot_id
            and movement.sale_line_id = allocation.sale_line_id
        ) as movement_state on true
        where allocation.stock_lot_id = v_stock_lot.id;

        if v_ambiguous_active_cost_count <> 0 then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten einer historischen Teilretoure müssen vor dem Verkauf geprüft werden.';
        end if;

        if v_invalid_restocked_quantity_count <> 0
          or v_stock_lot.remaining_quantity + v_previously_active_quantity
            + coalesce((select sum(m.quantity) from public.stock_movements m
              where m.stock_lot_id = v_stock_lot.id and m.stock_removal_id is not null), 0)
            <> v_stock_lot.received_quantity then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Mengen eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        if v_stock_lot.unit_cost is null
          or v_stock_lot.unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        -- A purchase-backed lot owns one exact cent pool. Repeated partial
        -- sales consume the leading deterministic cents from the currently
        -- remaining pool instead of rounding the average unit cost anew.
        v_lot_total_cost := pg_catalog.round(
          v_stock_lot.unit_cost * v_stock_lot.received_quantity,
          2
        );
        -- Gebuchte Abgänge tragen ihre Kosten selbst; sie gehören nicht zum nächsten Verkauf.
        v_remaining_lot_cost := v_lot_total_cost - v_previously_allocated_cost
          - coalesce((select sum(m.removed_cost) from public.stock_movements m
            where m.stock_lot_id = v_stock_lot.id and m.stock_removal_id is not null), 0);

        if v_remaining_lot_cost < 0
          or v_remaining_lot_cost <> pg_catalog.round(v_remaining_lot_cost, 2) then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        v_remaining_cost_cents := pg_catalog.round(v_remaining_lot_cost * 100)::bigint;
        v_allocation_cost := (
          v_allocated_quantity::bigint
            * (v_remaining_cost_cents / v_stock_lot.remaining_quantity::bigint)
          + least(
              v_allocated_quantity::bigint,
              pg_catalog.mod(
                v_remaining_cost_cents,
                v_stock_lot.remaining_quantity::bigint
              )
            )
        )::numeric / 100;

        v_business_unit_costs := v_stock_lot.remaining_unit_costs[1:v_allocated_quantity];
        if v_stock_lot.remaining_unit_costs is not null then
          if pg_catalog.cardinality(v_business_unit_costs) <> v_allocated_quantity then
            raise exception using errcode = '22023', message = 'Die Stückkostenfolge des Loses ist unvollständig.';
          end if;
          select pg_catalog.sum(value) into v_allocation_cost from pg_catalog.unnest(v_business_unit_costs) as value;
        end if;
        v_tax_costs := v_stock_lot.remaining_tax_unit_costs[1:v_allocated_quantity];
        if v_tax_costs is null or pg_catalog.cardinality(v_tax_costs) <> v_allocated_quantity then
          v_tax_unknown := true;
        else
          v_line_tax_costs := v_line_tax_costs || v_tax_costs;
        end if;
        update public.stock_lots
        set remaining_tax_unit_costs = v_stock_lot.remaining_tax_unit_costs[(v_allocated_quantity + 1):v_stock_lot.remaining_quantity],
            remaining_unit_costs = v_stock_lot.remaining_unit_costs[(v_allocated_quantity + 1):v_stock_lot.remaining_quantity],
            remaining_quantity = remaining_quantity - v_allocated_quantity
        where id = v_stock_lot.id
          and workspace_id = p_workspace_id;

        select greatest(
          coalesce(pg_catalog.max(allocation.consumption_sequence), 0),
          pg_catalog.count(*)
        ) + 1
        into v_consumption_sequence
        from public.sale_line_lot_allocations as allocation
        where allocation.workspace_id = p_workspace_id
          and allocation.stock_lot_id = v_stock_lot.id;

        insert into public.sale_line_lot_allocations (
          workspace_id,
          sale_line_id,
          stock_lot_id,
          quantity,
          unit_cost,
          allocated_cost,
          consumption_sequence,
          active_allocated_cost, tax_purchase_cost, tax_cost_allocations, active_tax_unit_costs, active_unit_costs
        ) values (
          p_workspace_id,
          v_sale_line.id,
          v_stock_lot.id,
          v_allocated_quantity,
          v_stock_lot.unit_cost,
          v_allocation_cost,
          v_consumption_sequence,
          v_allocation_cost,
          (select pg_catalog.sum(value) from pg_catalog.unnest(v_tax_costs) as value),
          public.tax_cost_allocations(v_tax_costs),
          v_tax_costs,
          v_business_unit_costs
        );

        insert into public.stock_movements (
          workspace_id,
          stock_lot_id,
          sale_line_id,
          direction,
          quantity,
          reason
        ) values (
          p_workspace_id,
          v_stock_lot.id,
          v_sale_line.id,
          'out',
          v_allocated_quantity,
          'sale'
        );

        v_line_cogs := v_line_cogs + v_allocation_cost;
        v_remaining_quantity := v_remaining_quantity - v_allocated_quantity;
        v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);
      end loop;

      if v_remaining_quantity <> 0 then
        raise exception using errcode = 'P0001', message = 'Nicht genügend verfügbarer Bestand';
      end if;

      update public.sale_lines
      set tax_purchase_cost = case when v_tax_unknown then null else (select pg_catalog.sum(value) from pg_catalog.unnest(v_line_tax_costs) as value) end,
          tax_cost_allocations = case when v_tax_unknown then null else public.tax_cost_allocations(v_line_tax_costs) end,
          cost_of_goods_sold = v_line_cogs
      where id = v_sale_line.id
        and workspace_id = p_workspace_id
      returning * into v_sale_line;
    else
      if v_quantity <> 1 then
        raise exception using errcode = '22023', message = 'Einzelartikel können nur einmal verkauft werden.';
      end if;

      select * into v_inventory_item
      from public.inventory_items
      where id = v_inventory_item_id
        and workspace_id = p_workspace_id
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'Der Einzelartikel wurde nicht gefunden.';
      end if;

      if v_inventory_item.status not in ('ready', 'listed')
        or exists (
          select 1
          from public.sales as existing_sale
          left join public.sale_lines as existing_line
            on existing_line.workspace_id = existing_sale.workspace_id
           and existing_line.sale_id = existing_sale.id
          where existing_sale.workspace_id = p_workspace_id
            and existing_sale.id <> v_sale.id
            and existing_sale.returned_at is null
            and existing_sale.voided_at is null
            and (
              existing_sale.inventory_item_id = v_inventory_item.id
              or existing_line.inventory_item_id = v_inventory_item.id
            )
        ) then
        raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
      end if;

      perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

      update public.inventory_items
      set status = 'sold',
          updated_at = now()
      where id = v_inventory_item.id
        and workspace_id = p_workspace_id;

      v_line_cogs := v_inventory_item.allocated_purchase_cost + coalesce((
        select pg_catalog.sum(cost.amount) from public.item_costs as cost
        where cost.inventory_item_id = v_inventory_item.id
      ), 0);

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        inventory_item_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
        tax_purchase_cost, tax_cost_allocations,
        tax_mode
      ) values (
        p_workspace_id,
        v_sale.id,
        v_inventory_item.id,
        coalesce(nullif(trim(v_input_line ->> 'title_snapshot'), ''), v_inventory_item.title),
        1,
        v_unit_sale_price,
        v_line_total,
        v_line_cogs,
        v_inventory_item.tax_purchase_cost,
        public.tax_cost_allocations(case when v_inventory_item.tax_purchase_cost is null then null else array[v_inventory_item.tax_purchase_cost] end),
        v_workspace.tax_mode
      )
      returning * into v_sale_line;
    end if;

    v_sale_total := v_sale_total + v_line_total;
    v_sale_line_ids := array_append(v_sale_line_ids, v_sale_line.id);
  end loop;

  update public.sales
  set sale_price = v_sale_total + v_shipping_revenue,
      sale_price_total = v_sale_total + v_shipping_revenue
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    p_workspace_id,
    'sale',
    v_sale.id,
    'sale_recorded',
    (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'financials', pg_catalog.jsonb_build_object(
        'before', null,
        'after', pg_catalog.jsonb_build_object(
          'item_revenue', v_sale_total,
          'buyer_shipping_revenue', v_shipping_revenue,
          'total_revenue', v_sale.sale_price_total,
          'cost_of_goods_sold', (
            select case when pg_catalog.count(*) filter (where sale_line.cost_of_goods_sold is null) > 0 then null else coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0) end
            from public.sale_lines as sale_line
            where sale_line.workspace_id = p_workspace_id
              and sale_line.sale_id = v_sale.id
          ),
          'platform_fee', v_sale.platform_fee,
          'seller_shipping_cost', v_sale.shipping_cost,
          'additional_costs', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'category', cost_entry.category,
                'description', cost_entry.description,
                'amount', cost_entry.amount
              ) order by cost_entry.id
            )
            from public.sale_cost_entries as cost_entry
            where cost_entry.workspace_id = p_workspace_id
              and cost_entry.sale_id = v_sale.id
          ), '[]'::jsonb)
        )
      ),
      'sale', pg_catalog.jsonb_build_object(
        'before', null,
        'after', pg_catalog.jsonb_build_object(
          'platform', v_sale.platform,
          'sale_date', v_sale.sale_date,
          'shipping_mode', v_sale.shipping_mode
        )
      )
    )
  )
  returning id into v_business_event_id;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'business_event_id', v_business_event_id,
    -- Eingabereihenfolge für unveränderliche externe Positionsnachweise.
    'sale_line_ids', to_jsonb(v_sale_line_ids),
    'cost_entries', coalesce((
      select jsonb_agg(to_jsonb(cost_entry) order by cost_entry.id)
      from public.sale_cost_entries as cost_entry
      where cost_entry.sale_id = v_sale.id
    ), '[]'::jsonb),
    'sale_lines', coalesce((
      select jsonb_agg(to_jsonb(sale_line) order by sale_line.id)
      from public.sale_lines as sale_line
      where sale_line.id = any(v_sale_line_ids)
    ), '[]'::jsonb),
    'lot_allocations', coalesce((
      select jsonb_agg(to_jsonb(allocation) order by allocation.id)
      from public.sale_line_lot_allocations as allocation
      where allocation.sale_line_id = any(v_sale_line_ids)
    ), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(movement) order by movement.id)
      from public.stock_movements as movement
      where movement.sale_line_id = any(v_sale_line_ids)
        and movement.reason = 'sale'
    ), '[]'::jsonb),
    'stock_quantities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stock_lot_id', stock_lot.id,
        'remaining_quantity', stock_lot.remaining_quantity
      ) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb)
  );
end;
$function$;

create function public.stock_lot_reserved_quantity (
  p_lot_id uuid
)
  returns integer
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select coalesce(sum(greatest(quantity,0)),0)::integer from (
    select sum(case when reason='reservation' then quantity else -quantity end) quantity
    from public.stock_movements where stock_lot_id=p_lot_id and reason in ('reservation','reservation_release')
    group by ebay_sale_draft_id
  ) reserved;
$function$;

revoke all on function public.stock_lot_reserved_quantity(uuid) from public;

grant all on function public.stock_lot_reserved_quantity(uuid) to service_role;

create trigger ebay_mapping_prepare_sale_drafts
  after insert or update on public.ebay_article_mappings
  for each row
  execute function public.ebay_mapping_prepare_sale_drafts();

create trigger ebay_cache_prepare_sale_draft
  after insert or update on public.ebay_cached_orders
  for each row
  execute function public.ebay_cache_prepare_sale_draft();

create trigger ebay_cache_record_sale_notification
  after insert or update on public.ebay_cached_orders
  for each row
  execute function public.ebay_cache_record_sale_notification();

create table public.ebay_sale_drafts (
  id                  uuid                     default gen_random_uuid() not null,
  workspace_id        uuid                     not null,
  environment         text                     not null,
  external_account_id text                     not null,
  source_key          text                     not null,
  order_id            text                     not null,
  source              jsonb                    not null,
  assignments         jsonb                    default '[]'::jsonb not null,
  costs               jsonb                    default '{"shippingMode": null, "additionalCosts": [], "platformFeeCents": null, "shippingCostCents": null}'::jsonb not null,
  state               text                     not null,
  sale_id             uuid,
  created_at          timestamp with time zone default clock_timestamp() not null,
  updated_at          timestamp with time zone default clock_timestamp() not null,
  resolution_reason   text
);

create function public.ebay_sale_draft_json (
  p_draft public.ebay_sale_drafts
)
  returns jsonb
  language sql
  immutable
  set search_path to ''
  as $function$
  select jsonb_build_object('id',p_draft.id,'workspaceId',p_draft.workspace_id,'environment',p_draft.environment,
    'orderId',p_draft.order_id,'source',p_draft.source,'assignments',p_draft.assignments,'costs',p_draft.costs,
    'state',p_draft.state,'saleId',p_draft.sale_id,'createdAt',p_draft.created_at,'updatedAt',p_draft.updated_at);
$function$;

revoke all on function public.ebay_sale_draft_json(public.ebay_sale_drafts) from public;

grant all on function public.ebay_sale_draft_json(public.ebay_sale_drafts) to service_role;

comment on table public.ebay_sale_drafts is 'Private eBay-Verkaufsprüfung ohne Umsatzbuchung; dauerhaft über Kontotrennungen hinweg.';

alter table public.ebay_sale_drafts
  enable row level security;

alter table public.ebay_sale_drafts
  add constraint ebay_sale_drafts_environment_check check (environment = any (array['production'::text, 'sandbox'::text]));

alter table public.ebay_sale_drafts
  add constraint ebay_sale_drafts_pkey primary key (id);

alter table public.ebay_sale_drafts
  add constraint ebay_sale_drafts_source_key_check check (source_key ~ '^[0-9a-f]{64}$'::text);

alter table public.ebay_sale_drafts
  add constraint ebay_sale_drafts_state_check
    check
    (state = any (array['needs_mapping'::text, 'needs_stock'::text, 'needs_costs'::text, 'ready_for_review'::text, 'blocked'::text, 'booked'::text, 'linked_existing'::text,
    'dismissed'::text]));

alter table public.ebay_sale_drafts
  add constraint ebay_sale_drafts_workspace_id_environment_source_key_key unique (workspace_id, environment, source_key);

alter table public.ebay_sale_drafts
  add constraint ebay_sale_drafts_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete restrict;

alter table public.ebay_sale_drafts
  add constraint ebay_sale_drafts_workspace_id_id_key unique (workspace_id, id);

alter table public.ebay_sale_drafts
  add constraint ebay_sale_drafts_workspace_id_sale_id_fkey foreign key (workspace_id, sale_id) references public.sales(workspace_id, id) on delete restrict;

grant select on public.ebay_sale_drafts to authenticated;

grant all on public.ebay_sale_drafts to service_role;

create index ebay_sale_drafts_sale on public.ebay_sale_drafts (workspace_id, sale_id);

create index ebay_sale_drafts_account on public.ebay_sale_drafts (workspace_id, environment, external_account_id, state);

create policy "Dienst erstellt Entwürfe" on public.ebay_sale_drafts
  for insert
  to service_role
  with check (true);

create policy "Dienst liest Entwürfe" on public.ebay_sale_drafts
  for select
  to service_role
  using (true);

create policy "Dienst löscht Entwürfe" on public.ebay_sale_drafts
  for delete
  to service_role
  using (true);

create policy "Dienst ändert Entwürfe" on public.ebay_sale_drafts
  for update
  to service_role
  using (true)
  with check (true);

create policy "Eigene eBay Entwürfe lesen" on public.ebay_sale_drafts
  for select
  to authenticated
  using (public.ebay_cache_can_read(workspace_id, environment, external_account_id));

create table public.ebay_sale_notification_receipts (
  id           bigint                   generated always as identity not null,
  event_id     bigint                   not null,
  user_id      uuid                     not null,
  read_at      timestamp with time zone,
  dismissed_at timestamp with time zone
);

comment on table public.ebay_sale_notification_receipts is 'Persönlicher Lesestatus und ausgeblendeter Verlauf ohne Änderung des Verkaufsbelegs.';

alter table public.ebay_sale_notification_receipts
  enable row level security;

alter table public.ebay_sale_notification_receipts
  add constraint ebay_sale_notification_receipts_event_id_user_id_key unique (event_id, user_id);

alter table public.ebay_sale_notification_receipts
  add constraint ebay_sale_notification_receipts_pkey primary key (id);

alter table public.ebay_sale_notification_receipts
  add constraint ebay_sale_notification_receipts_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

grant all on public.ebay_sale_notification_receipts to service_role;

create index ebay_sale_notification_receipts_user on public.ebay_sale_notification_receipts (user_id);

create policy "Dienst erstellt Glockenstatus" on public.ebay_sale_notification_receipts
  for insert
  to service_role
  with check (true);

create policy "Dienst liest Glockenstatus" on public.ebay_sale_notification_receipts
  for select
  to service_role
  using (true);

create policy "Dienst löscht Glockenstatus" on public.ebay_sale_notification_receipts
  for delete
  to service_role
  using (true);

create policy "Dienst ändert Glockenstatus" on public.ebay_sale_notification_receipts
  for update
  to service_role
  using (true)
  with check (true);

create table public.ebay_sale_notifications (
  id                  bigint                   generated always as identity not null,
  workspace_id        uuid                     not null,
  environment         text                     not null,
  external_account_id text                     not null,
  source_key          text                     not null,
  order_id            text                     not null,
  created_at          timestamp with time zone default clock_timestamp() not null
);

comment on table public.ebay_sale_notifications is 'Private dauerhafte eBay-Glockenereignisse unabhängig von Push-Opt-in und endgültiger Buchung.';

alter table public.ebay_sale_notifications
  enable row level security;

alter table public.ebay_sale_notifications
  add constraint ebay_sale_notifications_environment_check check (environment = any (array['production'::text, 'sandbox'::text]));

alter table public.ebay_sale_notifications
  add constraint ebay_sale_notifications_pkey primary key (id);

alter table public.ebay_sale_notification_receipts
  add constraint ebay_sale_notification_receipts_event_id_fkey foreign key (event_id) references public.ebay_sale_notifications(id) on delete cascade;

alter table public.ebay_sale_notifications
  add constraint ebay_sale_notifications_workspace_id_environment_source_key_key unique (workspace_id, environment, source_key);

alter table public.ebay_sale_notifications
  add constraint ebay_sale_notifications_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade;

grant all on public.ebay_sale_notifications to service_role;

create index ebay_sale_notifications_account on public.ebay_sale_notifications (workspace_id, environment, external_account_id, created_at desc);

create policy "Dienst erstellt Glockenereignisse" on public.ebay_sale_notifications
  for insert
  to service_role
  with check (true);

create policy "Dienst liest Glockenereignisse" on public.ebay_sale_notifications
  for select
  to service_role
  using (true);

create policy "Dienst löscht Glockenereignisse" on public.ebay_sale_notifications
  for delete
  to service_role
  using (true);

create policy "Dienst ändert Glockenereignisse" on public.ebay_sale_notifications
  for update
  to service_role
  using (true)
  with check (true);

create table public.ebay_sale_reservations (
  id                bigint                   generated always as identity not null,
  workspace_id      uuid                     not null,
  draft_id          uuid                     not null,
  inventory_item_id uuid,
  stock_lot_id      uuid,
  quantity          integer                  not null,
  previous_status   text,
  released_at       timestamp with time zone,
  created_at        timestamp with time zone default clock_timestamp() not null
);

comment on table public.ebay_sale_reservations is 'Eigene Artikel-/Losreservierungen ohne private Anbieterquelle; Freigabe wird dauerhaft protokolliert.';

alter table public.ebay_sale_reservations
  enable row level security;

alter table public.ebay_sale_reservations
  add constraint ebay_sale_reservations_check check (num_nonnulls(inventory_item_id, stock_lot_id) = 1);

alter table public.ebay_sale_reservations
  add constraint ebay_sale_reservations_check1 check (inventory_item_id is null or quantity = 1);

alter table public.ebay_sale_reservations
  add constraint ebay_sale_reservations_pkey primary key (id);

alter table public.ebay_sale_reservations
  add constraint ebay_sale_reservations_quantity_check check (quantity > 0);

alter table public.ebay_sale_reservations
  add constraint ebay_sale_reservations_workspace_id_draft_id_fkey foreign key (workspace_id, draft_id) references public.ebay_sale_drafts(workspace_id, id) on delete restrict;

alter table public.ebay_sale_reservations
  add constraint ebay_sale_reservations_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete restrict;

alter table public.ebay_sale_reservations
  add constraint ebay_sale_reservations_workspace_id_inventory_item_id_fkey foreign key (workspace_id, inventory_item_id) references public.inventory_items(workspace_id, id)
    on delete restrict;

alter table public.ebay_sale_reservations
  add constraint ebay_sale_reservations_workspace_id_stock_lot_id_fkey foreign key (workspace_id, stock_lot_id) references public.stock_lots(workspace_id, id) on delete restrict;

grant select on public.ebay_sale_reservations to authenticated;

grant all on public.ebay_sale_reservations to service_role;

create index ebay_sale_reservations_draft on public.ebay_sale_reservations (workspace_id, draft_id);

create index ebay_sale_reservations_lot on public.ebay_sale_reservations (stock_lot_id)
  where released_at is null;

create unique index ebay_sale_reservations_item on public.ebay_sale_reservations (inventory_item_id)
  where released_at is null and inventory_item_id is not null;

create policy "Bestandsnutzer lesen Reservierungen" on public.ebay_sale_reservations
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Dienst erstellt Reservierungen" on public.ebay_sale_reservations
  for insert
  to service_role
  with check (true);

create policy "Dienst liest Reservierungen" on public.ebay_sale_reservations
  for select
  to service_role
  using (true);

create policy "Dienst löscht Reservierungen" on public.ebay_sale_reservations
  for delete
  to service_role
  using (true);

create policy "Dienst ändert Reservierungen" on public.ebay_sale_reservations
  for update
  to service_role
  using (true)
  with check (true);

create trigger protect_ebay_item_reservation
  before update on public.inventory_items
  for each row
  execute function public.ebay_guard_reserved_stock();

create trigger protect_ebay_lot_reservation
  before update on public.stock_lots
  for each row
  execute function public.ebay_guard_reserved_stock();

alter table public.stock_movements
  add column ebay_sale_draft_id uuid;

alter table public.stock_movements
  add constraint stock_movements_ebay_draft_fk foreign key (workspace_id, ebay_sale_draft_id) references public.ebay_sale_drafts(workspace_id, id) on delete restrict;

create index stock_movements_ebay_draft on public.stock_movements (workspace_id, ebay_sale_draft_id)
  where ebay_sale_draft_id is not null;

create trigger protect_ebay_reservation_owner
  before insert or delete or update on public.stock_movements
  for each row
  execute function public.ebay_guard_reservation_owner();
-- Automatisch aus dem Zielkatalog erzeugte explizite Rechte.
revoke all on function public.ebay_cache_page(p_connection_id uuid, p_operation_id uuid, p_version bigint, p_scan_id bigint, p_offset integer, p_rows jsonb, p_complete boolean, p_total integer) from public, anon, authenticated, service_role;
revoke all on function public.ebay_cache_prepare_sale_draft() from public, anon, authenticated, service_role;
revoke all on function public.ebay_cache_record_sale_notification() from public, anon, authenticated, service_role;
revoke all on function public.ebay_close_sale_draft(p_workspace_id uuid, p_environment text, p_source_key text, p_state text, p_sale_id uuid, p_reason text) from public, anon, authenticated, service_role;
revoke all on function public.ebay_delete_account(p_environment text, p_external_account_id text) from public, anon, authenticated, service_role;
revoke all on function public.ebay_existing_sales_read(p_workspace_id uuid, p_connection_id uuid, p_page integer) from public, anon, authenticated, service_role;
revoke all on function public.ebay_guard_reservation_owner() from public, anon, authenticated, service_role;
revoke all on function public.ebay_guard_reserved_stock() from public, anon, authenticated, service_role;
revoke all on function public.ebay_link_existing_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_sale_id uuid, p_assignments jsonb, p_reason text) from public, anon, authenticated, service_role;
revoke all on function public.ebay_lock_draft_stock(p_workspace_id uuid, p_assignments jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ebay_mapping_prepare_sale_drafts() from public, anon, authenticated, service_role;
revoke all on function public.ebay_mark_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_reason text, p_sale_id uuid) from public, anon, authenticated, service_role;
revoke all on function public.ebay_prepare_sale_draft(p_cache_id bigint, p_assignments jsonb, p_costs jsonb, p_explicit boolean) from public, anon, authenticated, service_role;
revoke all on function public.ebay_record_order_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ebay_release_sale_reservations(p_draft_id uuid) from public, anon, authenticated, service_role;
revoke all on function public.ebay_reservation_resolve(p_workspace_id uuid, p_draft_id uuid, p_reason text) from public, anon, authenticated, service_role;
revoke all on function public.ebay_reservations_read(p_workspace_id uuid) from public, anon, authenticated, service_role;
revoke all on function public.ebay_sale_draft_json(p_draft ebay_sale_drafts) from public, anon, authenticated, service_role;
revoke all on function public.ebay_sale_drafts_read(p_workspace_id uuid, p_connection_id uuid) from public, anon, authenticated, service_role;
revoke all on function public.ebay_sale_notification_update(p_workspace_id uuid, p_connection_id uuid, p_event_id bigint, p_action text) from public, anon, authenticated, service_role;
revoke all on function public.ebay_sale_notifications_read(p_workspace_id uuid, p_connection_id uuid, p_page integer) from public, anon, authenticated, service_role;
revoke all on function public.ebay_save_sale_draft(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ebay_store_order_snapshot(p_user_id uuid, p_connection_id uuid, p_version bigint, p_operation_id uuid, p_source_key text, p_review_hash text, p_source jsonb, p_booking_ready boolean) from public, anon, authenticated, service_role;
revoke all on function public.record_sale(p_workspace_id uuid, p_sale jsonb, p_lines jsonb) from public, anon, authenticated, service_role;
revoke all on function public.stock_lot_reserved_quantity(p_lot_id uuid) from public, anon, authenticated, service_role;
revoke all on sequence public.ebay_sale_notification_receipts_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.ebay_sale_notifications_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.ebay_sale_reservations_id_seq from public, anon, authenticated, service_role;
revoke all on table public.ebay_sale_drafts from public, anon, authenticated, service_role;
revoke all on table public.ebay_sale_notification_receipts from public, anon, authenticated, service_role;
revoke all on table public.ebay_sale_notifications from public, anon, authenticated, service_role;
revoke all on table public.ebay_sale_reservations from public, anon, authenticated, service_role;
grant execute on function public.ebay_cache_page(p_connection_id uuid, p_operation_id uuid, p_version bigint, p_scan_id bigint, p_offset integer, p_rows jsonb, p_complete boolean, p_total integer) to service_role;
grant execute on function public.ebay_cache_prepare_sale_draft() to service_role;
grant execute on function public.ebay_cache_record_sale_notification() to service_role;
grant execute on function public.ebay_close_sale_draft(p_workspace_id uuid, p_environment text, p_source_key text, p_state text, p_sale_id uuid, p_reason text) to service_role;
grant execute on function public.ebay_delete_account(p_environment text, p_external_account_id text) to service_role;
grant execute on function public.ebay_existing_sales_read(p_workspace_id uuid, p_connection_id uuid, p_page integer) to authenticated;
grant execute on function public.ebay_existing_sales_read(p_workspace_id uuid, p_connection_id uuid, p_page integer) to service_role;
grant execute on function public.ebay_guard_reservation_owner() to service_role;
grant execute on function public.ebay_guard_reserved_stock() to service_role;
grant execute on function public.ebay_link_existing_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_sale_id uuid, p_assignments jsonb, p_reason text) to authenticated;
grant execute on function public.ebay_link_existing_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_sale_id uuid, p_assignments jsonb, p_reason text) to service_role;
grant execute on function public.ebay_lock_draft_stock(p_workspace_id uuid, p_assignments jsonb) to service_role;
grant execute on function public.ebay_mapping_prepare_sale_drafts() to service_role;
grant execute on function public.ebay_mark_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_reason text, p_sale_id uuid) to service_role;
grant execute on function public.ebay_prepare_sale_draft(p_cache_id bigint, p_assignments jsonb, p_costs jsonb, p_explicit boolean) to service_role;
grant execute on function public.ebay_record_order_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb) to authenticated;
grant execute on function public.ebay_release_sale_reservations(p_draft_id uuid) to service_role;
grant execute on function public.ebay_reservation_resolve(p_workspace_id uuid, p_draft_id uuid, p_reason text) to authenticated;
grant execute on function public.ebay_reservation_resolve(p_workspace_id uuid, p_draft_id uuid, p_reason text) to service_role;
grant execute on function public.ebay_reservations_read(p_workspace_id uuid) to authenticated;
grant execute on function public.ebay_reservations_read(p_workspace_id uuid) to service_role;
grant execute on function public.ebay_sale_draft_json(p_draft ebay_sale_drafts) to service_role;
grant execute on function public.ebay_sale_drafts_read(p_workspace_id uuid, p_connection_id uuid) to authenticated;
grant execute on function public.ebay_sale_drafts_read(p_workspace_id uuid, p_connection_id uuid) to service_role;
grant execute on function public.ebay_sale_notification_update(p_workspace_id uuid, p_connection_id uuid, p_event_id bigint, p_action text) to authenticated;
grant execute on function public.ebay_sale_notification_update(p_workspace_id uuid, p_connection_id uuid, p_event_id bigint, p_action text) to service_role;
grant execute on function public.ebay_sale_notifications_read(p_workspace_id uuid, p_connection_id uuid, p_page integer) to authenticated;
grant execute on function public.ebay_sale_notifications_read(p_workspace_id uuid, p_connection_id uuid, p_page integer) to service_role;
grant execute on function public.ebay_save_sale_draft(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb) to authenticated;
grant execute on function public.ebay_save_sale_draft(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb) to service_role;
grant execute on function public.ebay_store_order_snapshot(p_user_id uuid, p_connection_id uuid, p_version bigint, p_operation_id uuid, p_source_key text, p_review_hash text, p_source jsonb, p_booking_ready boolean) to service_role;
grant execute on function public.record_sale(p_workspace_id uuid, p_sale jsonb, p_lines jsonb) to authenticated;
grant execute on function public.stock_lot_reserved_quantity(p_lot_id uuid) to service_role;
grant select on sequence public.ebay_sale_notification_receipts_id_seq to service_role;
grant update on sequence public.ebay_sale_notification_receipts_id_seq to service_role;
grant usage on sequence public.ebay_sale_notification_receipts_id_seq to service_role;
grant select on sequence public.ebay_sale_notifications_id_seq to service_role;
grant update on sequence public.ebay_sale_notifications_id_seq to service_role;
grant usage on sequence public.ebay_sale_notifications_id_seq to service_role;
grant select on sequence public.ebay_sale_reservations_id_seq to service_role;
grant update on sequence public.ebay_sale_reservations_id_seq to service_role;
grant usage on sequence public.ebay_sale_reservations_id_seq to service_role;
grant select on table public.ebay_sale_drafts to authenticated;
grant delete on table public.ebay_sale_drafts to service_role;
grant insert on table public.ebay_sale_drafts to service_role;
grant maintain on table public.ebay_sale_drafts to service_role;
grant references on table public.ebay_sale_drafts to service_role;
grant select on table public.ebay_sale_drafts to service_role;
grant trigger on table public.ebay_sale_drafts to service_role;
grant truncate on table public.ebay_sale_drafts to service_role;
grant update on table public.ebay_sale_drafts to service_role;
grant delete on table public.ebay_sale_notification_receipts to service_role;
grant insert on table public.ebay_sale_notification_receipts to service_role;
grant maintain on table public.ebay_sale_notification_receipts to service_role;
grant references on table public.ebay_sale_notification_receipts to service_role;
grant select on table public.ebay_sale_notification_receipts to service_role;
grant trigger on table public.ebay_sale_notification_receipts to service_role;
grant truncate on table public.ebay_sale_notification_receipts to service_role;
grant update on table public.ebay_sale_notification_receipts to service_role;
grant delete on table public.ebay_sale_notifications to service_role;
grant insert on table public.ebay_sale_notifications to service_role;
grant maintain on table public.ebay_sale_notifications to service_role;
grant references on table public.ebay_sale_notifications to service_role;
grant select on table public.ebay_sale_notifications to service_role;
grant trigger on table public.ebay_sale_notifications to service_role;
grant truncate on table public.ebay_sale_notifications to service_role;
grant update on table public.ebay_sale_notifications to service_role;
grant select on table public.ebay_sale_reservations to authenticated;
grant delete on table public.ebay_sale_reservations to service_role;
grant insert on table public.ebay_sale_reservations to service_role;
grant maintain on table public.ebay_sale_reservations to service_role;
grant references on table public.ebay_sale_reservations to service_role;
grant select on table public.ebay_sale_reservations to service_role;
grant trigger on table public.ebay_sale_reservations to service_role;
grant truncate on table public.ebay_sale_reservations to service_role;
grant update on table public.ebay_sale_reservations to service_role;
