-- Zweck: aktuelle eBay-Storno-/Erstattungshinweise und nachvollziehbare Gebührenherkunft.
-- Betroffen: ebay_sale_drafts.costs_origin und private Prüf-/Glockenfunktionen.
-- Automatisch aus deklarativem Zielkatalog erzeugt; alte Kosten werden konservativ erhalten.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create or replace function public.ebay_cache_record_sale_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  if new.auto_prepare or (public.ebay_sale_source_issues(new.source)<>'[]'::jsonb and exists(
    select 1 from public.ebay_order_bookings b where b.workspace_id=new.workspace_id and b.environment=new.environment and b.source_key=new.source_key and b.sale_id is not null)) then
    insert into public.ebay_sale_notifications(workspace_id,environment,external_account_id,source_key,order_id)
      values(new.workspace_id,new.environment,new.external_account_id,new.source_key,new.order_id) on conflict do nothing;
  end if;
  return new;
end;
$function$;

create or replace function public.ebay_close_sale_draft (
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
  select * into v_booking from public.ebay_order_bookings where workspace_id=v_order.workspace_id and environment=v_order.environment and source_key=v_order.source_key;
  -- Ältere Übernahmen können ohne Entwurf entstanden sein. Nur den Klärbezug anlegen, nie reservieren.
  if v_draft.id is null and v_booking.sale_id is not null then
    insert into public.ebay_sale_drafts(workspace_id,environment,external_account_id,source_key,order_id,source,assignments,state,sale_id)
      values(v_order.workspace_id,v_order.environment,v_order.external_account_id,v_order.source_key,v_order.order_id,v_order.source,v_booking.source_lines,
        case when v_booking.status='imported' then 'booked' else 'linked_existing' end,v_booking.sale_id) returning * into v_draft;
  end if;
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
  v_costs:=coalesce(p_costs,case when v_draft.costs_origin='personal' then v_draft.costs end,jsonb_build_object('platformFeeCents',v_order.source->'platformFeeCents','shippingCostCents',null,'shippingMode',null,'additionalCosts','[]'::jsonb));
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
    insert into public.ebay_sale_drafts(workspace_id,environment,external_account_id,source_key,order_id,source,assignments,costs,state,costs_origin)
      values(v_order.workspace_id,v_order.environment,v_order.external_account_id,v_order.source_key,v_order.order_id,v_order.source,'[]',v_costs,'needs_mapping',case when p_costs is null then 'automatic' else 'personal' end) returning * into v_draft;
  end if;
  if v_order.source->>'cancelStatus'='CANCELED' then
    perform public.ebay_release_sale_reservations(v_draft.id);
    v_state:='blocked';
  elsif v_order.source->>'paymentStatus' is distinct from 'PAID' or v_order.source->>'cancelStatus' is distinct from 'NONE_REQUESTED'
    or v_order.source->'blockers' is distinct from '[]'::jsonb or v_order.source->>'currency' is distinct from 'EUR'
    or exists(select 1 from jsonb_array_elements(v_order.source->'lines') l where l->'hasRefund' is distinct from 'false'::jsonb)
  then
    -- Unklare Quelle hält die bisherige Reservierung einschließlich ihrer Zuordnung fest.
    update public.ebay_sale_drafts set source=v_order.source,costs=v_costs,costs_origin=case when p_costs is null then costs_origin else 'personal' end,state='blocked',updated_at=clock_timestamp() where id=v_draft.id;
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
  update public.ebay_sale_drafts set source=v_order.source,assignments=v_assignments,costs=v_costs,costs_origin=case when p_costs is null then costs_origin else 'personal' end,state=v_state,requires_explicit_preparation=false,updated_at=clock_timestamp() where id=v_draft.id;
  return v_draft.id;
end;
$function$;

create or replace function public.ebay_sale_draft_json (
  p_draft public.ebay_sale_drafts
)
  returns jsonb
  language sql
  immutable
  set search_path to ''
  as $function$
  select jsonb_build_object('id',p_draft.id,'workspaceId',p_draft.workspace_id,'environment',p_draft.environment,
    'orderId',p_draft.order_id,'source',p_draft.source,'assignments',case when p_draft.state in ('booked','linked_existing') then
      (select coalesce(jsonb_agg(a),'[]'::jsonb) from jsonb_array_elements(p_draft.assignments) a where exists(select 1 from jsonb_array_elements(p_draft.source->'lines') l where l->>'lineItemId'=a->>'lineItemId')) else p_draft.assignments end,'costs',p_draft.costs,
    'costsOrigin',p_draft.costs_origin,'sourceIssues',case when p_draft.state in ('booked','linked_existing') then public.ebay_sale_source_issues(p_draft.source) else '[]'::jsonb end,
    'state',p_draft.state,'saleId',p_draft.sale_id,'createdAt',p_draft.created_at,'updatedAt',p_draft.updated_at);
$function$;

create or replace function public.ebay_sale_drafts_read (
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
      and (state not in ('booked','linked_existing','dismissed') or (state in ('booked','linked_existing') and public.ebay_sale_source_issues(source)<>'[]'::jsonb));
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'drafts',v_result);
end;
$function$;

create or replace function public.ebay_sale_notifications_read (
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
    'connectionId',p_connection_id,'orderId',n.order_id,'draftId',d.id,'state',coalesce(d.state,'needs_mapping'),'sourceIssues',case when d.state in ('booked','linked_existing') then public.ebay_sale_source_issues(d.source) else '[]'::jsonb end,'createdAt',n.created_at,'readAt',r.read_at)
    order by n.created_at desc,n.id desc),'[]'::jsonb) from (select * from public.ebay_sale_notifications n
      where workspace_id=p_workspace_id and environment=v_connection.environment and external_account_id=v_connection.external_account_id
        and not exists(select 1 from public.ebay_sale_notification_receipts r where r.event_id=n.id and r.user_id=(select auth.uid()) and r.dismissed_at is not null)
      order by created_at desc,id desc limit 100 offset (p_page-1)*100) n
    left join public.ebay_sale_drafts d on d.workspace_id=n.workspace_id and d.environment=n.environment and d.source_key=n.source_key
    left join public.ebay_sale_notification_receipts r on r.event_id=n.id and r.user_id=(select auth.uid()));
end;
$function$;

create function public.ebay_sale_source_issues (
  p_source jsonb
)
  returns jsonb
  language sql
  immutable
  set search_path to ''
  as $function$
  select to_jsonb(array_remove(array[
    case when p_source->>'cancelStatus'='CANCELED' then 'canceled'
      when p_source->>'cancelStatus' is not null and p_source->>'cancelStatus'<>'NONE_REQUESTED' then 'cancellation_pending' end,
    case when coalesce(p_source->'blockers','[]'::jsonb)?'refund_or_unknown'
      or p_source->>'paymentStatus' in ('FULLY_REFUNDED','PARTIALLY_REFUNDED')
      or exists(select 1 from jsonb_array_elements(coalesce(p_source->'lines','[]'::jsonb)) l where l->'hasRefund'='true'::jsonb)
      then 'refund_or_unknown' end
  ],null));
$function$;

revoke all on function public.ebay_sale_source_issues(jsonb) from public;

grant all on function public.ebay_sale_source_issues(jsonb) to service_role;

alter table public.ebay_sale_drafts
  add column costs_origin text default 'personal'::text not null;

alter table public.ebay_sale_drafts
  add constraint ebay_sale_drafts_costs_origin_check check (costs_origin = any (array['automatic'::text, 'personal'::text]));
-- Explizite Rechte aus dem tatsächlichen Zielkatalog.
revoke all on function public.ebay_sale_source_issues(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ebay_sale_source_issues(jsonb) to service_role;
