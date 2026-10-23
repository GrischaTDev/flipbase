-- Zweck: Zahlungsübergänge unabhängig von persönlichen Prüfständen erhalten und aufgehobene Zuordnungen bewusst neu vorbereiten.
-- Betroffen: ebay_cached_orders.last_scanned_payment_status, ebay_sale_drafts.requires_explicit_preparation und zugehörige RPCs.
-- Erzeugt aus dem Schemaabgleich mit ausdrücklich UTF-8; korrigiert auch den beschädigten früheren Funktionskörper, ohne alte Migrationen zu ändern.
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
          or (v_old.id is not null and coalesce(v_old.last_scanned_payment_status,v_old.source->>'paymentStatus')<>'PAID')) and not coalesce(v_old.auto_prepare,false);
      insert into public.ebay_cached_orders(workspace_id,environment,external_account_id,order_id,source_key,source,created_at,modified_at,auto_prepare,seen_generation,last_scanned_payment_status)
        values(v_scan.workspace_id,v_scan.environment,v_scan.external_account_id,v_source->>'orderId',v_row->>'sourceKey',v_source,v_created,(v_source->>'lastModifiedAt')::timestamptz,coalesce(v_new_sale,false),v_scan.generation,v_source->>'paymentStatus')
        on conflict(workspace_id,environment,external_account_id,order_id) do update set source=excluded.source,modified_at=excluded.modified_at,observed_at=clock_timestamp(),auto_prepare=public.ebay_cached_orders.auto_prepare or excluded.auto_prepare,seen_generation=excluded.seen_generation,last_scanned_payment_status=excluded.last_scanned_payment_status returning id into v_id;
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

create or replace function public.ebay_clear_order_recorded_elsewhere (
  p_user_id       uuid,
  p_connection_id uuid,
  p_source_key    text
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

create or replace function public.ebay_prepare_sale_draft (
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
  v_remaining integer; v_take integer; v_complete boolean; v_targets_valid boolean:=true; v_state text; v_booking public.ebay_order_bookings;
begin
  select * into strict v_order from public.ebay_cached_orders where id=p_cache_id;
  perform pg_advisory_xact_lock(hashtextextended(v_order.workspace_id::text||':'||v_order.environment||':'||v_order.source_key,0));
  select * into v_draft from public.ebay_sale_drafts where workspace_id=v_order.workspace_id and environment=v_order.environment and source_key=v_order.source_key for update;
  -- Nach bewusster Aufhebung bleibt Lesen still; nur Speichern darf neu reservieren.
  if v_draft.requires_explicit_preparation and not p_explicit then
    update public.ebay_sale_drafts set source=v_order.source,updated_at=clock_timestamp() where id=v_draft.id;
    return v_draft.id;
  end if;
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
    begin
      v_target:=public.ebay_import_target(v_order.workspace_id,v_a->'target');
    exception when sqlstate '22023' then
      if p_explicit then raise; end if;
      -- Historische Zuordnungen können inzwischen archivierte Ziele enthalten.
      -- Das darf andere Bestellungen derselben Abgleichseite nicht aufhalten.
      v_targets_valid:=false;
    end;
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
    v_state:=case when not v_complete then 'needs_mapping' when not v_targets_valid then 'needs_stock' else 'needs_costs' end;
    if v_complete and v_targets_valid and not exists(select 1 from public.ebay_sale_reservations where draft_id=v_draft.id and released_at is null) then
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
  update public.ebay_sale_drafts set source=v_order.source,assignments=v_assignments,costs=v_costs,state=v_state,requires_explicit_preparation=false,updated_at=clock_timestamp() where id=v_draft.id;
  return v_draft.id;
end;
$function$;

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
$function$;

create or replace function public.ebay_save_sale_draft (
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
    on conflict(workspace_id,environment,source_key) do update set last_scanned_payment_status=coalesce(public.ebay_cached_orders.last_scanned_payment_status,public.ebay_cached_orders.source->>'paymentStatus'),source=excluded.source,observed_at=clock_timestamp() returning id into v_id;
  v_draft_id:=public.ebay_prepare_sale_draft(v_id,p_assignments,p_costs,true);
  select * into v_draft from public.ebay_sale_drafts where id=v_draft_id;
  return public.ebay_sale_draft_json(v_draft);
end;
$function$;

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
$function$;

alter table public.ebay_cached_orders
  add column last_scanned_payment_status text;

alter table public.ebay_sale_drafts
  add column requires_explicit_preparation boolean default false not null;
