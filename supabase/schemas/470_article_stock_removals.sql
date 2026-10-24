-- Nachvollziehbare Bestandsabgänge ohne Verkauf oder erneute Ausgabenbuchung.
alter table public.inventory_items add column stock_removed_at timestamptz;
comment on column public.inventory_items.stock_removed_at is 'Gebuchter Bestandsabgang; verhindert die erneute Aktivierung des Einzelstücks.';

create table public.stock_removals (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  request_id text not null check (length(request_id) between 1 and 200),
  article_kind text not null check (article_kind in ('catalog', 'item')),
  article_id uuid not null,
  quantity integer not null check (quantity > 0),
  reason text not null check (reason in ('damage', 'loss', 'correction')),
  notes text check (length(notes) <= 1000),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, request_id),
  unique (workspace_id, id)
);
comment on table public.stock_removals is 'Unveränderliche Abgänge für beschädigte, verlorene oder irrtümlich erfasste Ware.';
create index stock_removals_article_idx on public.stock_removals(workspace_id, article_kind, article_id);
create index stock_removals_actor_idx on public.stock_removals(actor_id);
alter table public.stock_removals enable row level security;
revoke all on public.stock_removals from public, anon, authenticated, service_role;
revoke all on sequence public.stock_removals_id_seq from public, anon, authenticated, service_role;
grant select on public.stock_removals to authenticated;
create policy "Eigene Bestandsabgänge lesen" on public.stock_removals
  for select to authenticated using ((select public.can_access_workspace(workspace_id)));
create policy "Bestandsabgänge nicht direkt anlegen" on public.stock_removals
  for insert to authenticated with check (false);
create policy "Bestandsabgänge nicht ändern" on public.stock_removals
  for update to authenticated using (false) with check (false);
create policy "Bestandsabgänge nicht löschen" on public.stock_removals
  for delete to authenticated using (false);
create policy "Keine anonymen Bestandsabgänge lesen" on public.stock_removals for select to anon using (false);
create policy "Keine anonymen Bestandsabgänge anlegen" on public.stock_removals for insert to anon with check (false);
create policy "Keine anonymen Bestandsabgänge ändern" on public.stock_removals for update to anon using (false) with check (false);
create policy "Keine anonymen Bestandsabgänge löschen" on public.stock_removals for delete to anon using (false);

alter table public.stock_movements add column stock_removal_id bigint;
alter table public.stock_movements add column removed_cost numeric(12,2) check (removed_cost >= 0 and removed_cost < 'Infinity'::numeric);
alter table public.stock_movements add constraint stock_movements_removal_workspace_fkey
  foreign key (workspace_id, stock_removal_id) references public.stock_removals(workspace_id, id) on delete restrict;
create index stock_movements_removal_idx on public.stock_movements(workspace_id, stock_removal_id);

create function public.protect_stock_removal_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'Gebuchte Bestandsabgänge bleiben unverändert erhalten.';
end;
$$;
create trigger protect_stock_removal_history before update or delete on public.stock_removals
for each row execute function public.protect_stock_removal_history();
create trigger protect_stock_removal_movement before update or delete on public.stock_movements
for each row when (old.stock_removal_id is not null) execute function public.protect_stock_removal_history();
revoke execute on function public.protect_stock_removal_history() from public, anon, authenticated, service_role;

create function public.protect_removed_inventory_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.stock_removed_at is not null then
      raise exception using errcode = '23503', message = 'Dieser Artikel hat einen gebuchten Bestandsabgang. Du kannst ihn archivieren.';
    end if;
    return old;
  end if;
  if current_user <> 'postgres' and (
    (tg_op = 'INSERT' and new.stock_removed_at is not null)
    or (tg_op = 'UPDATE' and new.stock_removed_at is distinct from old.stock_removed_at)
  ) then
    raise exception using errcode = '42501', message = 'Nutze die Aktion „Aus Bestand entfernen“.';
  end if;
  if tg_op = 'UPDATE' and old.stock_removed_at is not null
    and (new.stock_removed_at is distinct from old.stock_removed_at or new.status <> 'archived') then
    raise exception using errcode = '22023', message = 'Dieses Stück wurde bereits aus dem Bestand entfernt.';
  end if;
  return new;
end;
$$;
create trigger protect_removed_inventory_item before insert or update or delete on public.inventory_items
for each row execute function public.protect_removed_inventory_item();
revoke execute on function public.protect_removed_inventory_item() from public, anon, authenticated, service_role;

-- Sicherheitsdefinierer ist nötig: Benutzer dürfen Lose und das unveränderliche Journal nicht direkt ändern.
create function public.remove_article_stock(
  p_workspace_id uuid, p_article_kind text, p_article_id uuid, p_quantity integer,
  p_reason text, p_notes text, p_request_id text
)
returns public.stock_removals language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_removal public.stock_removals;
  v_lot public.stock_lots;
  v_item public.inventory_items;
  v_purchase_id uuid;
  v_item_ids uuid[];
  v_remaining integer := p_quantity;
  v_take integer;
  v_costs numeric[];
  v_cost numeric;
  v_cents bigint;
  v_active_quantity integer;
  v_active_cost numeric;
  v_active_cost_known boolean;
  v_removed_quantity integer;
  v_removed_cost numeric;
  v_details jsonb := '[]'::jsonb;
  v_notes text := nullif(btrim(p_notes), '');
begin
  if v_actor is null or p_workspace_id is null or p_article_id is null
    or not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_article_kind is null or p_article_kind not in ('catalog', 'item')
    or p_quantity is null or p_quantity < 1 or p_quantity > 100000
    or (p_article_kind = 'item' and p_quantity <> 1)
    or p_reason is null or p_reason not in ('damage', 'loss', 'correction')
    or p_request_id is null or length(p_request_id) not between 1 and 200
    or length(v_notes) > 1000 then
    raise exception using errcode = '22023', message = 'Bitte eine ganze Stückzahl, einen Grund und höchstens 1000 Zeichen Notiz angeben.';
  end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then raise exception using errcode = '55000', message = 'Dieser Workspace ist archiviert.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_request_id, 0));
  select * into v_removal from public.stock_removals where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if v_removal.article_kind <> p_article_kind or v_removal.article_id <> p_article_id
      or v_removal.quantity <> p_quantity or v_removal.reason <> p_reason
      or v_removal.notes is distinct from v_notes or v_removal.actor_id <> v_actor then
      raise exception using errcode = '22023', message = 'Dieser Buchungsversuch wurde bereits mit anderen Angaben verwendet.';
    end if;
    return v_removal;
  end if;

  -- Dieselbe Sperrreihenfolge wie Verkäufe und Einkaufskorrekturen: Einkauf, Artikel, Stücke, Lose.
  for v_purchase_id in
    select distinct source.purchase_id from (
      select lot.purchase_id from public.stock_lots lot where lot.workspace_id = p_workspace_id
        and p_article_kind = 'catalog' and lot.catalog_product_id = p_article_id
      union
      select coalesce(item.purchase_id, line.purchase_id) from public.inventory_items item
        left join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
        where item.workspace_id = p_workspace_id and ((p_article_kind = 'item' and item.id = p_article_id)
          or (p_article_kind = 'catalog' and line.catalog_product_id = p_article_id))
    ) source where source.purchase_id is not null order by source.purchase_id
  loop
    perform 1 from public.purchases where workspace_id = p_workspace_id and id = v_purchase_id for update;
  end loop;
  if p_article_kind = 'catalog' then
    perform 1 from public.catalog_products where workspace_id = p_workspace_id and id = p_article_id for update;
    if not found then raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.'; end if;
  end if;
  select coalesce(array_agg(item.id order by item.id), array[]::uuid[]) into v_item_ids
    from public.inventory_items item
    left join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
    where item.workspace_id = p_workspace_id and ((p_article_kind = 'item' and item.id = p_article_id)
      or (p_article_kind = 'catalog' and line.catalog_product_id = p_article_id));
  perform 1 from public.inventory_items where workspace_id = p_workspace_id and id = any(v_item_ids) order by id for update;
  if p_article_kind = 'item' and cardinality(v_item_ids) <> 1 then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  -- Ein Inserat oder offener Auftrag darf nicht heimlich einen leeren Artikel anbieten.
  if exists (select 1 from public.listings where workspace_id = p_workspace_id and status <> 'ended'
    and ((p_article_kind = 'catalog' and catalog_product_id = p_article_id) or inventory_item_id = any(v_item_ids))) then
    raise exception using errcode = '22023', message = 'Beende zuerst das Inserat dieses Artikels.';
  end if;
  if exists (select 1 from public.store_order_items oi join public.store_orders o on o.id = oi.store_order_id
    where o.workspace_id = p_workspace_id and o.status not in ('completed', 'cancelled')
      and ((p_article_kind = 'catalog' and oi.catalog_product_id = p_article_id) or oi.inventory_item_id = any(v_item_ids))) then
    raise exception using errcode = '22023', message = 'Klär zuerst den offenen Shopauftrag dieses Artikels.';
  end if;
  if exists (select 1 from public.inventory_items where workspace_id = p_workspace_id and id = any(v_item_ids) and status = 'reserved')
    or exists (select 1 from public.stock_movements m join public.stock_lots lot on lot.id = m.stock_lot_id
      where lot.workspace_id = p_workspace_id and p_article_kind = 'catalog' and lot.catalog_product_id = p_article_id
        and m.reason in ('reservation', 'reservation_release') group by lot.id
        having sum(case when m.reason = 'reservation' then m.quantity else -m.quantity end) > 0) then
    raise exception using errcode = '22023', message = 'Hebe zuerst die Reservierung dieses Artikels auf.';
  end if;
  insert into public.stock_removals(workspace_id, request_id, article_kind, article_id, quantity, reason, notes, actor_id)
    values (p_workspace_id, p_request_id, p_article_kind, p_article_id, p_quantity, p_reason, v_notes, v_actor)
    returning * into v_removal;

  for v_lot in select lot.* from public.stock_lots lot where lot.workspace_id = p_workspace_id
    and p_article_kind = 'catalog' and lot.catalog_product_id = p_article_id and lot.remaining_quantity > 0
    order by lot.received_at, lot.id for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_lot.remaining_quantity);
    v_costs := v_lot.remaining_unit_costs;
    if v_costs is null and v_lot.unit_cost is not null then
      -- Ältere Teilbestände ohne Stückkostenfolge dürfen den belegten Restpool nutzen.
      -- Unklare Teilretouren liefern keinen nachweisbaren Restpool und bleiben gesperrt.
      select coalesce(sum(a.quantity - state.restocked), 0)::integer,
        coalesce(sum(coalesce(a.active_allocated_cost, case when state.restocked = a.quantity then 0
          when state.restocked = 0 then a.allocated_cost else null end)), 0),
        coalesce(bool_and(state.restocked between 0 and a.quantity and
          (a.active_allocated_cost is not null or state.restocked in (0, a.quantity))), true)
      into v_active_quantity, v_active_cost, v_active_cost_known
      from public.sale_line_lot_allocations a
      left join lateral (
        select coalesce(sum(case when m.direction = 'in' and m.reason = 'return' then m.quantity
          when m.direction = 'out' and m.reason = 'damage' then -m.quantity else 0 end), 0)::integer as restocked
        from public.stock_movements m where m.workspace_id = a.workspace_id
          and m.stock_lot_id = a.stock_lot_id and m.sale_line_id = a.sale_line_id
      ) state on true where a.stock_lot_id = v_lot.id;
      select coalesce(sum(case when direction = 'out' then quantity else -quantity end), 0)::integer,
        coalesce(sum(case when direction = 'out' then removed_cost else -removed_cost end), 0)
        into v_removed_quantity, v_removed_cost from public.stock_movements
        where stock_lot_id = v_lot.id and stock_removal_id is not null;
      if not v_active_cost_known
        or v_lot.remaining_quantity + v_active_quantity + v_removed_quantity <> v_lot.received_quantity
        or v_lot.unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception using errcode = '22023', message = 'Die Stückkosten dieses älteren Bestands müssen zuerst geprüft werden.';
      end if;
      v_cost := round(v_lot.unit_cost * v_lot.received_quantity, 2) - v_active_cost - v_removed_cost;
      if v_cost < 0 or v_cost::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception using errcode = '22023', message = 'Die Stückkosten dieses älteren Bestands müssen zuerst geprüft werden.';
      end if;
      v_cents := round(v_cost * 100)::bigint;
      select array_agg((v_cents / v_lot.remaining_quantity + case when n <= mod(v_cents, v_lot.remaining_quantity) then 1 else 0 end)::numeric / 100 order by n)
        into v_costs from pg_catalog.generate_series(1, v_lot.remaining_quantity) n;
    end if;
    if v_costs is not null and cardinality(v_costs) <> v_lot.remaining_quantity then
      raise exception using errcode = '22023', message = 'Die Stückkosten dieses Bestands müssen zuerst geprüft werden.';
    end if;
    select sum(value) into v_cost from pg_catalog.unnest(v_costs[1:v_take]) value;
    v_details := v_details || jsonb_build_array(jsonb_build_object('stock_lot_id', v_lot.id, 'quantity', v_take,
      'unit_costs', v_costs[1:v_take], 'tax_unit_costs', v_lot.remaining_tax_unit_costs[1:v_take], 'cost', v_cost));
    update public.stock_lots set remaining_quantity = remaining_quantity - v_take,
      remaining_unit_costs = v_costs[(v_take + 1):v_lot.remaining_quantity],
      remaining_tax_unit_costs = v_lot.remaining_tax_unit_costs[(v_take + 1):v_lot.remaining_quantity]
      where workspace_id = p_workspace_id and id = v_lot.id;
    insert into public.stock_movements(workspace_id, stock_lot_id, direction, quantity, reason, stock_removal_id, removed_cost)
      values (p_workspace_id, v_lot.id, 'out', v_take, p_reason, v_removal.id, v_cost);
    v_remaining := v_remaining - v_take;
  end loop;
  for v_item in select item.* from public.inventory_items item
    join public.inventory_item_sale_states state on state.inventory_item_id = item.id and state.workspace_id = item.workspace_id
    where item.workspace_id = p_workspace_id and item.id = any(v_item_ids)
      and state.sale_state = 'no_active_sale' and item.status not in ('sold', 'archived', 'reserved') and item.stock_removed_at is null
    order by item.id
  loop
    exit when v_remaining = 0;
    update public.inventory_items set stock_removed_at = v_removal.created_at, status = 'archived'
      where workspace_id = p_workspace_id and id = v_item.id;
    v_details := v_details || jsonb_build_array(jsonb_build_object('inventory_item_id', v_item.id, 'quantity', 1,
      'cost', v_item.allocated_purchase_cost, 'tax_purchase_cost', v_item.tax_purchase_cost));
    insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, reason, changes)
      values (p_workspace_id, 'inventory_item', v_item.id, 'article_stock_removed', v_actor, p_reason,
        jsonb_build_object('quantity', jsonb_build_object('before', 1, 'after', 0), 'stock_removal_id', v_removal.id, 'notes', v_notes));
    v_remaining := v_remaining - 1;
  end loop;
  if v_remaining <> 0 then
    raise exception using errcode = '22023', message = 'Die Stückzahl übersteigt den vorhandenen, eindeutig zugeordneten Bestand. Lade den Artikel neu.';
  end if;
  -- Der unveränderliche Beleg hält die genaue Los-/Stückzuordnung und deren Kosten fest.
  insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, reason, changes)
    values (p_workspace_id, case when p_article_kind = 'catalog' then 'catalog_product' else 'inventory_item' end,
      p_article_id, 'stock_removal_recorded', v_actor, p_reason,
      jsonb_build_object('quantity', p_quantity, 'notes', v_notes, 'stock_removal_id', v_removal.id, 'allocations', v_details));
  return v_removal;
end;
$$;
alter function public.remove_article_stock(uuid,text,uuid,integer,text,text,text) owner to postgres;
revoke execute on function public.remove_article_stock(uuid,text,uuid,integer,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.remove_article_stock(uuid,text,uuid,integer,text,text,text) to authenticated;

-- Eine Gegenbuchung je Originalabgang und Los; Originalbeleg und beide Bewegungen
-- bleiben durch protect_stock_removal_history unveränderlich geschützt.
create unique index stock_movements_removal_reversal_idx
  on public.stock_movements(stock_removal_id, stock_lot_id)
  where stock_removal_id is not null and direction = 'in';

create function public.reverse_catalog_stock_removal(p_workspace_id uuid, p_stock_removal_id bigint, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_removal public.stock_removals;
  v_event public.business_events;
  v_reversal public.business_events;
  v_movement public.stock_movements;
  v_lot public.stock_lots;
  v_allocation jsonb;
  v_costs numeric[];
  v_tax_costs numeric[];
  v_purchase_id uuid;
  v_count integer := 0;
  v_quantity integer := 0;
  v_active_quantity integer;
  v_active_cost numeric;
  v_active_cost_known boolean;
  v_removed_quantity integer;
  v_removed_cost numeric;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null or p_workspace_id is null or not public.can_access_workspace(p_workspace_id)
  then raise exception 'Kein Zugriff auf diesen Bestandsabgang.' using errcode = '42501'; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then raise exception 'Kein Zugriff auf diesen Bestandsabgang.' using errcode = '42501'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then raise exception 'Kein Zugriff auf diesen Bestandsabgang.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'Begründung für die Gegenbuchung fehlt oder ist zu lang.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':stock-removal-reversal:' || p_stock_removal_id::text, 0));
  select * into v_removal from public.stock_removals where workspace_id = p_workspace_id and id = p_stock_removal_id;
  if not found or v_removal.article_kind <> 'catalog' then
    raise exception 'Kein losbasierter Bestandsabgang vorhanden.' using errcode = '22023';
  end if;
  select * into v_reversal from public.business_events where workspace_id = p_workspace_id
    and entity_type = 'catalog_product' and entity_id = v_removal.article_id
    and event_type = 'stock_removal_reversed' and changes->>'stock_removal_id' = p_stock_removal_id::text;
  if found then
    if v_reversal.reason is distinct from v_reason or v_reversal.actor_id is distinct from v_actor then
      raise exception 'Dieser Abgang wurde bereits mit anderer Begründung gegengebucht.' using errcode = '22023';
    end if;
    return v_reversal.id;
  end if;
  begin
    select * into strict v_event from public.business_events where workspace_id = p_workspace_id
      and entity_type = 'catalog_product' and entity_id = v_removal.article_id
      and event_type = 'stock_removal_recorded' and changes->>'stock_removal_id' = p_stock_removal_id::text;
  exception when no_data_found or too_many_rows then
    raise exception 'Der ursprüngliche Ausbuchungsbeleg ist nicht eindeutig vorhanden.' using errcode = '22023';
  end;
  if jsonb_typeof(v_event.changes->'allocations') is distinct from 'array'
    or jsonb_array_length(v_event.changes->'allocations') = 0
    or exists(select 1 from jsonb_array_elements(v_event.changes->'allocations') a where not (a ? 'stock_lot_id'))
  then raise exception 'Die ursprüngliche Loszuordnung ist unvollständig.' using errcode = '22023'; end if;

  -- Dieselbe Sperrreihenfolge wie Verkauf, Ausbuchung und eBay-Reservierung.
  for v_purchase_id in select distinct l.purchase_id from public.stock_lots l
    join public.stock_movements m on m.stock_lot_id = l.id and m.workspace_id = l.workspace_id
    where m.workspace_id = p_workspace_id and m.stock_removal_id = p_stock_removal_id order by l.purchase_id
  loop
    perform 1 from public.purchases where workspace_id = p_workspace_id and id = v_purchase_id and entry_status = 'finalized' for update;
    if not found then raise exception 'Der Ursprungseinkauf muss zuerst geprüft werden.' using errcode = '22023'; end if;
  end loop;
  perform 1 from public.catalog_products where workspace_id = p_workspace_id and id = v_removal.article_id for update;
  if not found then raise exception 'Der ursprüngliche Artikel fehlt.' using errcode = '22023'; end if;
  perform l.id from public.stock_lots l where l.workspace_id = p_workspace_id and l.id in
    (select stock_lot_id from public.stock_movements where workspace_id = p_workspace_id and stock_removal_id = p_stock_removal_id)
    order by l.received_at, l.id for update;

  for v_movement in select * from public.stock_movements where workspace_id = p_workspace_id
    and stock_removal_id = p_stock_removal_id order by stock_lot_id, id
  loop
    if v_movement.direction <> 'out' or v_movement.reason <> v_removal.reason or v_movement.sale_line_id is not null then
      raise exception 'Die ursprünglichen Abgangsbewegungen sind nicht eindeutig.' using errcode = '22023';
    end if;
    select * into strict v_lot from public.stock_lots where workspace_id = p_workspace_id
      and id = v_movement.stock_lot_id and catalog_product_id = v_removal.article_id;
    select a into strict v_allocation from jsonb_array_elements(v_event.changes->'allocations') a
      where a->>'stock_lot_id' = v_lot.id::text;
    if (v_allocation->>'quantity')::integer is distinct from v_movement.quantity
      or (v_allocation->>'cost')::numeric is distinct from v_movement.removed_cost
      or jsonb_typeof(v_allocation->'unit_costs') is distinct from 'array'
      or jsonb_array_length(v_allocation->'unit_costs') <> v_movement.quantity
      or v_lot.remaining_quantity + v_movement.quantity > v_lot.received_quantity
      or coalesce(cardinality(v_lot.remaining_unit_costs), 0) <> v_lot.remaining_quantity
    then raise exception 'Die belegten Stückkosten oder Mengen müssen zuerst geprüft werden.' using errcode = '22023'; end if;
    select array_agg(value::numeric order by ordinality) into v_costs
      from jsonb_array_elements_text(v_allocation->'unit_costs') with ordinality;
    if (select sum(cost) from unnest(v_costs) cost) is distinct from v_movement.removed_cost
      or exists(select 1 from unnest(v_costs) cost where cost is null or cost < 0 or cost <> round(cost, 2) or cost::text in ('NaN','Infinity','-Infinity'))
    then raise exception 'Die belegten Stückkosten sind unvollständig.' using errcode = '22023'; end if;
    -- Spätere Einkaufskorrekturen oder unklare Teilretouren dürfen einen alten
    -- Kostenbeleg nicht stillschweigend in einen inzwischen anderen Pool einfügen.
    select coalesce(sum(a.quantity - state.restocked), 0)::integer,
      coalesce(sum(coalesce(a.active_allocated_cost, case when state.restocked = a.quantity then 0
        when state.restocked = 0 then a.allocated_cost else null end)), 0),
      coalesce(bool_and(state.restocked between 0 and a.quantity and
        (a.active_allocated_cost is not null or state.restocked in (0, a.quantity))), true)
      into v_active_quantity, v_active_cost, v_active_cost_known
      from public.sale_line_lot_allocations a left join lateral (
        select coalesce(sum(case when m.direction = 'in' and m.reason = 'return' then m.quantity
          when m.direction = 'out' and m.reason = 'damage' then -m.quantity else 0 end), 0)::integer restocked
        from public.stock_movements m where m.workspace_id = a.workspace_id
          and m.stock_lot_id = a.stock_lot_id and m.sale_line_id = a.sale_line_id
      ) state on true where a.stock_lot_id = v_lot.id;
    select coalesce(sum(case when direction = 'out' then quantity else -quantity end), 0)::integer,
      coalesce(sum(case when direction = 'out' then removed_cost else -removed_cost end), 0)
      into v_removed_quantity, v_removed_cost from public.stock_movements
      where stock_lot_id = v_lot.id and stock_removal_id is not null;
    if not v_active_cost_known or v_lot.unit_cost is null or v_lot.unit_cost::text in ('NaN','Infinity','-Infinity')
      or v_lot.remaining_quantity + v_active_quantity + v_removed_quantity <> v_lot.received_quantity
      or round(v_lot.unit_cost * v_lot.received_quantity, 2) is distinct from
        (select coalesce(sum(cost), 0) from unnest(v_lot.remaining_unit_costs) cost) + v_active_cost + v_removed_cost
    then raise exception 'Der aktuelle Mengen- und Kostenpool muss zuerst geprüft werden.' using errcode = '22023'; end if;
    v_tax_costs := null;
    if v_allocation->'tax_unit_costs' is distinct from 'null'::jsonb then
      if jsonb_typeof(v_allocation->'tax_unit_costs') is distinct from 'array'
        or jsonb_array_length(v_allocation->'tax_unit_costs') <> v_movement.quantity
      then raise exception 'Die belegten Steuerkosten sind unvollständig.' using errcode = '22023'; end if;
      select array_agg(value::numeric order by ordinality) into v_tax_costs
        from jsonb_array_elements_text(v_allocation->'tax_unit_costs') with ordinality;
      if exists(select 1 from unnest(v_tax_costs) cost where cost is null or cost < 0 or cost <> round(cost, 2) or cost::text in ('NaN','Infinity','-Infinity')) then
        raise exception 'Die belegten Steuerkosten sind unvollständig.' using errcode = '22023';
      end if;
    end if;
    update public.stock_lots set remaining_quantity = remaining_quantity + v_movement.quantity,
      remaining_unit_costs = v_costs || coalesce(remaining_unit_costs, array[]::numeric[]),
      remaining_tax_unit_costs = case when v_tax_costs is null
        or (v_lot.remaining_quantity > 0 and cardinality(v_lot.remaining_tax_unit_costs) is distinct from v_lot.remaining_quantity)
        then null else v_tax_costs || coalesce(remaining_tax_unit_costs, array[]::numeric[]) end
      where id = v_lot.id;
    insert into public.stock_movements(workspace_id,stock_lot_id,direction,quantity,reason,stock_removal_id,removed_cost)
      values(p_workspace_id,v_lot.id,'in',v_movement.quantity,'correction',p_stock_removal_id,v_movement.removed_cost);
    v_count := v_count + 1;
    v_quantity := v_quantity + v_movement.quantity;
  end loop;
  if v_quantity <> v_removal.quantity or v_count <> jsonb_array_length(v_event.changes->'allocations') then
    raise exception 'Die ursprüngliche Loszuordnung ist unvollständig.' using errcode = '22023';
  end if;
  insert into public.business_events(workspace_id,entity_type,entity_id,event_type,actor_id,reason,changes)
    values(p_workspace_id,'catalog_product',v_removal.article_id,'stock_removal_reversed',v_actor,v_reason,
      jsonb_build_object('stock_removal_id',p_stock_removal_id,'original_event_id',v_event.id,
        'quantity',v_quantity,'allocations',v_event.changes->'allocations')) returning * into v_reversal;
  return v_reversal.id;
end;
$$;
alter function public.reverse_catalog_stock_removal(uuid,bigint,text) owner to postgres;
revoke all on function public.reverse_catalog_stock_removal(uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.reverse_catalog_stock_removal(uuid,bigint,text) to authenticated;
