-- Dauerhafte private Verkaufsentwürfe; Reservierungen sind interne Geschäftsbelege.
create table public.ebay_sale_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  environment text not null check(environment in ('production','sandbox')),
  external_account_id text not null,
  source_key text not null check(source_key ~ '^[0-9a-f]{64}$'),
  order_id text not null,
  source jsonb not null,
  assignments jsonb not null default '[]'::jsonb,
  costs jsonb not null default '{"platformFeeCents":null,"shippingCostCents":null,"shippingMode":null,"additionalCosts":[]}'::jsonb,
  state text not null check(state in ('needs_mapping','needs_stock','needs_costs','ready_for_review','blocked','booked','linked_existing','dismissed')),
  sale_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  resolution_reason text,
  requires_explicit_preparation boolean not null default false,
  unique(workspace_id,environment,source_key),
  unique(workspace_id,id),
  foreign key(workspace_id,sale_id) references public.sales(workspace_id,id) on delete restrict
);
comment on table public.ebay_sale_drafts is 'Private eBay-Verkaufsprüfung ohne Umsatzbuchung; dauerhaft über Kontotrennungen hinweg.';
create index ebay_sale_drafts_account on public.ebay_sale_drafts(workspace_id,environment,external_account_id,state);
create index ebay_sale_drafts_sale on public.ebay_sale_drafts(workspace_id,sale_id);
alter table public.ebay_sale_drafts enable row level security;
revoke all on public.ebay_sale_drafts from public,anon,authenticated;
grant select on public.ebay_sale_drafts to authenticated;
grant all on public.ebay_sale_drafts to service_role;
create policy "Eigene eBay Entwürfe lesen" on public.ebay_sale_drafts for select to authenticated
  using(public.ebay_cache_can_read(workspace_id,environment,external_account_id));
create policy "Dienst liest Entwürfe" on public.ebay_sale_drafts for select to service_role using(true);
create policy "Dienst erstellt Entwürfe" on public.ebay_sale_drafts for insert to service_role with check(true);
create policy "Dienst ändert Entwürfe" on public.ebay_sale_drafts for update to service_role using(true) with check(true);
create policy "Dienst löscht Entwürfe" on public.ebay_sale_drafts for delete to service_role using(true);

create table public.ebay_sale_reservations (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  draft_id uuid not null,
  inventory_item_id uuid,
  stock_lot_id uuid,
  quantity integer not null check(quantity>0),
  previous_status text,
  released_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check(num_nonnulls(inventory_item_id,stock_lot_id)=1),
  check(inventory_item_id is null or quantity=1),
  foreign key(workspace_id,draft_id) references public.ebay_sale_drafts(workspace_id,id) on delete restrict,
  foreign key(workspace_id,inventory_item_id) references public.inventory_items(workspace_id,id) on delete restrict,
  foreign key(workspace_id,stock_lot_id) references public.stock_lots(workspace_id,id) on delete restrict
);
comment on table public.ebay_sale_reservations is 'Eigene Artikel-/Losreservierungen ohne private Anbieterquelle; Freigabe wird dauerhaft protokolliert.';
create unique index ebay_sale_reservations_item on public.ebay_sale_reservations(inventory_item_id) where released_at is null and inventory_item_id is not null;
create index ebay_sale_reservations_lot on public.ebay_sale_reservations(stock_lot_id) where released_at is null;
create index ebay_sale_reservations_draft on public.ebay_sale_reservations(workspace_id,draft_id);
alter table public.ebay_sale_reservations enable row level security;
revoke all on public.ebay_sale_reservations from public,anon,authenticated;
grant select on public.ebay_sale_reservations to authenticated;
grant all on public.ebay_sale_reservations to service_role;
revoke all on sequence public.ebay_sale_reservations_id_seq from public,anon,authenticated;
grant usage,select on sequence public.ebay_sale_reservations_id_seq to service_role;
create policy "Bestandsnutzer lesen Reservierungen" on public.ebay_sale_reservations for select to authenticated using(public.can_access_workspace(workspace_id));
create policy "Dienst liest Reservierungen" on public.ebay_sale_reservations for select to service_role using(true);
create policy "Dienst erstellt Reservierungen" on public.ebay_sale_reservations for insert to service_role with check(true);
create policy "Dienst ändert Reservierungen" on public.ebay_sale_reservations for update to service_role using(true) with check(true);
create policy "Dienst löscht Reservierungen" on public.ebay_sale_reservations for delete to service_role using(true);

alter table public.stock_movements add column ebay_sale_draft_id uuid;
alter table public.stock_movements add constraint stock_movements_ebay_draft_fk foreign key(workspace_id,ebay_sale_draft_id) references public.ebay_sale_drafts(workspace_id,id) on delete restrict;
create index stock_movements_ebay_draft on public.stock_movements(workspace_id,ebay_sale_draft_id) where ebay_sale_draft_id is not null;

-- Je Besitzer summieren: Eine fremde Freigabe darf eigene Mengen nicht ausgleichen.
create function public.stock_lot_reserved_quantity(p_lot_id uuid)
returns integer language sql stable security definer set search_path='' as $$
  select coalesce(sum(greatest(quantity,0)),0)::integer from (
    select sum(case when reason='reservation' then quantity else -quantity end) quantity
    from public.stock_movements where stock_lot_id=p_lot_id and reason in ('reservation','reservation_release')
    group by ebay_sale_draft_id
  ) reserved;
$$;
revoke all on function public.stock_lot_reserved_quantity(uuid) from public,anon,authenticated;

create function public.ebay_guard_reserved_stock()
returns trigger language plpgsql security definer set search_path='' as $$
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
$$;
revoke all on function public.ebay_guard_reserved_stock() from public,anon,authenticated;
create trigger protect_ebay_item_reservation before update on public.inventory_items for each row execute function public.ebay_guard_reserved_stock();
create trigger protect_ebay_lot_reservation before update on public.stock_lots for each row execute function public.ebay_guard_reserved_stock();

create function public.ebay_guard_reservation_owner()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user not in ('postgres','service_role') and
    (case when tg_op='INSERT' then new.ebay_sale_draft_id is not null
      when tg_op='DELETE' then old.ebay_sale_draft_id is not null
      else new.ebay_sale_draft_id is not null or old.ebay_sale_draft_id is not null end)
  then raise exception 'Reservierungsbesitzer ist geschützt' using errcode='42501'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function public.ebay_guard_reservation_owner() from public,anon,authenticated;
create trigger protect_ebay_reservation_owner before insert or update or delete on public.stock_movements for each row execute function public.ebay_guard_reservation_owner();

-- Gleiche Sperrreihenfolge wie record_sale: Einkauf, Katalogartikel, Einzelstück, Los.
create function public.ebay_lock_draft_stock(p_workspace_id uuid,p_assignments jsonb)
returns void language plpgsql security invoker set search_path='' as $$
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
$$;
revoke all on function public.ebay_lock_draft_stock(uuid,jsonb) from public,anon,authenticated;

create function public.ebay_release_sale_reservations(p_draft_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
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
$$;
revoke all on function public.ebay_release_sale_reservations(uuid) from public,anon,authenticated;

create function public.ebay_prepare_sale_draft(p_cache_id bigint,p_assignments jsonb default null,p_costs jsonb default null,p_explicit boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
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
$$;
revoke all on function public.ebay_prepare_sale_draft(bigint,jsonb,jsonb,boolean) from public,anon,authenticated;

-- Einziger Übergabehaken aus der privaten Lesekopie, auch bei wiederholten Seiten.
create function public.ebay_cache_prepare_sale_draft()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.ebay_prepare_sale_draft(new.id);
  return new;
end;
$$;
revoke all on function public.ebay_cache_prepare_sale_draft() from public,anon,authenticated;
create trigger ebay_cache_prepare_sale_draft after insert or update on public.ebay_cached_orders for each row execute function public.ebay_cache_prepare_sale_draft();

create function public.ebay_mapping_prepare_sale_drafts()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_order record;
begin
  for v_order in select id from public.ebay_cached_orders o where o.workspace_id=new.workspace_id and o.environment=new.environment
    and o.external_account_id=new.external_account_id and o.auto_prepare and exists(select 1 from jsonb_array_elements(o.source->'lines') l
      where l->>'listingId'=new.listing_id and l->>'variationId' is not distinct from new.variation_id) order by o.id loop
    perform public.ebay_prepare_sale_draft(v_order.id);
  end loop;
  return new;
end;
$$;
revoke all on function public.ebay_mapping_prepare_sale_drafts() from public,anon,authenticated;
create trigger ebay_mapping_prepare_sale_drafts after insert or update on public.ebay_article_mappings for each row execute function public.ebay_mapping_prepare_sale_drafts();
