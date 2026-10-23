-- Berechtigte Entwurfsaktionen und vollständige Altverkaufszuordnung.
create function public.ebay_sale_draft_json(p_draft public.ebay_sale_drafts)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_draft.id,'workspaceId',p_draft.workspace_id,'environment',p_draft.environment,
    'orderId',p_draft.order_id,'source',p_draft.source,'assignments',case when p_draft.state in ('booked','linked_existing') then
      (select coalesce(jsonb_agg(a),'[]'::jsonb) from jsonb_array_elements(p_draft.assignments) a where exists(select 1 from jsonb_array_elements(p_draft.source->'lines') l where l->>'lineItemId'=a->>'lineItemId')) else p_draft.assignments end,'costs',p_draft.costs,
    'costsOrigin',p_draft.costs_origin,'sourceIssues',case when p_draft.state in ('booked','linked_existing') then public.ebay_sale_source_issues(p_draft.source) else '[]'::jsonb end,
    'state',p_draft.state,'saleId',p_draft.sale_id,'createdAt',p_draft.created_at,'updatedAt',p_draft.updated_at);
$$;
revoke all on function public.ebay_sale_draft_json(public.ebay_sale_drafts) from public,anon,authenticated;
grant execute on function public.ebay_sale_draft_json(public.ebay_sale_drafts) to service_role;

create function public.ebay_sale_drafts_read(p_workspace_id uuid,p_connection_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_connection public.ebay_connections; v_result jsonb;
begin
  v_connection:=public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  select coalesce(jsonb_agg(public.ebay_sale_draft_json(d) order by d.created_at desc),'[]'::jsonb) into v_result
    from public.ebay_sale_drafts d where workspace_id=p_workspace_id and environment=v_connection.environment and external_account_id=v_connection.external_account_id
      and (state not in ('booked','linked_existing','dismissed') or (state in ('booked','linked_existing') and public.ebay_sale_source_issues(source)<>'[]'::jsonb));
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'drafts',v_result);
end;
$$;
revoke all on function public.ebay_sale_drafts_read(uuid,uuid) from public,anon;
grant execute on function public.ebay_sale_drafts_read(uuid,uuid) to authenticated;

create function public.ebay_save_sale_draft(p_workspace_id uuid,p_connection_id uuid,p_snapshot_id uuid,p_assignments jsonb,p_costs jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
    on conflict(workspace_id,environment,source_key) do update set last_scanned_payment_status=coalesce(public.ebay_cached_orders.last_scanned_payment_status,public.ebay_cached_orders.source->>'paymentStatus'),source=excluded.source,observed_at=clock_timestamp() returning id into v_id;
  v_draft_id:=public.ebay_prepare_sale_draft(v_id,p_assignments,p_costs,true);
  select * into v_draft from public.ebay_sale_drafts where id=v_draft_id;
  return public.ebay_sale_draft_json(v_draft);
end;
$$;
revoke all on function public.ebay_save_sale_draft(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.ebay_save_sale_draft(uuid,uuid,uuid,jsonb,jsonb) to authenticated;

create function public.ebay_close_sale_draft(p_workspace_id uuid,p_environment text,p_source_key text,p_state text,p_sale_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_draft public.ebay_sale_drafts;
begin
  select * into v_draft from public.ebay_sale_drafts where workspace_id=p_workspace_id and environment=p_environment and source_key=p_source_key for update;
  if not found then
    insert into public.ebay_sale_drafts(workspace_id,environment,external_account_id,source_key,order_id,source,assignments,state,sale_id,resolution_reason)
      select p_workspace_id,p_environment,s.external_account_id,p_source_key,s.source->>'orderId',s.source,b.source_lines,p_state,p_sale_id,p_reason
      from public.ebay_order_snapshots s join public.ebay_order_bookings b on b.workspace_id=s.workspace_id and b.environment=s.environment and b.source_key=s.source_key
      where s.workspace_id=p_workspace_id and s.environment=p_environment and s.source_key=p_source_key
      order by s.created_at desc limit 1;
    return;
  end if;
  perform public.ebay_release_sale_reservations(v_draft.id);
  update public.ebay_sale_drafts set state=p_state,sale_id=p_sale_id,resolution_reason=p_reason,updated_at=clock_timestamp() where id=v_draft.id;
end;
$$;
revoke all on function public.ebay_close_sale_draft(uuid,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.ebay_close_sale_draft(uuid,text,text,text,uuid,text) to service_role;
grant execute on function public.ebay_release_sale_reservations(uuid),public.ebay_lock_draft_stock(uuid,jsonb) to service_role;

-- Nur interner Reservierungsbezug, keine Bestellnummer, Preise oder Anbieterquelle.
create function public.ebay_reservations_read(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'draftId',r.draft_id,'inventoryItemId',r.inventory_item_id,'stockLotId',r.stock_lot_id,'quantity',r.quantity,'createdAt',r.created_at) order by r.id),'[]'::jsonb)
    from public.ebay_sale_reservations r where workspace_id=p_workspace_id and released_at is null);
end;
$$;
revoke all on function public.ebay_reservations_read(uuid) from public,anon;
grant execute on function public.ebay_reservations_read(uuid) to authenticated;

create function public.ebay_reservation_resolve(p_workspace_id uuid,p_draft_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
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
$$;
revoke all on function public.ebay_reservation_resolve(uuid,uuid,text) from public,anon;
grant execute on function public.ebay_reservation_resolve(uuid,uuid,text) to authenticated;

create function public.ebay_existing_sales_read(p_workspace_id uuid,p_connection_id uuid,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
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
$$;
revoke all on function public.ebay_existing_sales_read(uuid,uuid,integer) from public,anon;
grant execute on function public.ebay_existing_sales_read(uuid,uuid,integer) to authenticated;

create function public.ebay_link_existing_sale(p_workspace_id uuid,p_connection_id uuid,p_snapshot_id uuid,p_sale_id uuid,p_assignments jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
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
$$;
revoke all on function public.ebay_link_existing_sale(uuid,uuid,uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.ebay_link_existing_sale(uuid,uuid,uuid,uuid,jsonb,text) to authenticated;


create or replace function public.ebay_store_order_snapshot(p_user_id uuid, p_connection_id uuid, p_version bigint, p_operation_id uuid, p_source_key text, p_review_hash text, p_source jsonb, p_booking_ready boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
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
  -- Sichtbarer Prüfstand und zuletzt vom Hintergrund erkannter Zahlungsstand bleiben getrennt.
  update public.ebay_cached_orders set last_scanned_payment_status=coalesce(last_scanned_payment_status,source->>'paymentStatus'),source=p_source,observed_at=v_now where workspace_id=v_connection.workspace_id
    and environment=v_connection.environment and external_account_id=v_connection.external_account_id and source_key=p_source_key;
  select public.ebay_sale_draft_json(d) into v_draft from public.ebay_sale_drafts d
    where workspace_id=v_connection.workspace_id and environment=v_connection.environment and source_key=p_source_key;
  if v_draft is not null then v_assignments:=v_draft->'assignments'; end if;
  return jsonb_build_object('draft',v_draft,'workspaceId',v_connection.workspace_id,'connectionId',p_connection_id,'snapshotId',v_snapshot.id,'reviewHash',p_review_hash,
    'expiresAt',v_snapshot.expires_at,'source',p_source,'assignments',v_assignments,
    'booking',public.ebay_get_order_booking(p_user_id,p_connection_id,p_source_key));
end;
$$;


create or replace function public.ebay_record_order_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
    if v_draft.requires_explicit_preparation or v_draft.state in ('blocked','dismissed','linked_existing','booked')
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
$$;


create or replace function public.ebay_mark_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_reason text, p_sale_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
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
$$;


create or replace function public.ebay_clear_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_source_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections; v_cleared boolean;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id;
  v_connection := public.ebay_lock_import_connection(p_user_id,v_connection.workspace_id,p_connection_id);
  if p_source_key is null or p_source_key !~ '^[0-9a-f]{64}$' then raise exception 'Ungültige Quelle' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_connection.workspace_id::text || ':' || v_connection.environment || ':' || p_source_key,0));
  delete from public.ebay_order_bookings where workspace_id = v_connection.workspace_id and environment = v_connection.environment
    and source_key = p_source_key and status = 'recorded_elsewhere';
  v_cleared:=found;
  if v_cleared then
    -- Der alte Beleg ist aufgehoben. Keine stillschweigende Wiederreservierung durch Cache/Review.
    update public.ebay_sale_drafts set state='needs_mapping',sale_id=null,resolution_reason=null,
      requires_explicit_preparation=true,updated_at=clock_timestamp()
      where workspace_id=v_connection.workspace_id and environment=v_connection.environment and source_key=p_source_key
        and state in ('dismissed','linked_existing');
  end if;
  return v_cleared;
end;
$$;
