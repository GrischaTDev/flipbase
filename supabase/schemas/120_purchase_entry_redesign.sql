-- Vereinfacht Verkäuferkontakte, Paketpreise sowie Status und Tracking von Einkäufen.
-- Betroffen: suppliers.country_code, purchases.arrived_at,
-- catalog_products.image_storage_path und purchase_lines.unit_purchase_price.

alter table public.suppliers
  add column if not exists country_code text;

alter table public.suppliers
  add constraint suppliers_country_code_check
  check (country_code is null or country_code ~ '^[A-Z]{2}$') not valid;

alter table public.suppliers
  add constraint suppliers_phone_e164_check
  check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$') not valid;

comment on column public.suppliers.country_code is
  'ISO-3166-1-Alpha-2-Ländercode der Verkäuferadresse.';

alter table public.purchases
  add column if not exists arrived_at timestamptz;

comment on column public.purchases.arrived_at is
  'Fachlicher Zeitpunkt, zu dem der Einkauf als angekommen bestätigt wurde.';

alter table public.catalog_products
  add column if not exists image_storage_path text;

comment on column public.catalog_products.image_storage_path is
  'Pfad des optionalen Produktbilds im privaten item-media-Bucket.';

-- Bei einem Paketpreis ist die centgenaue Positionssumme verbindlich. Der
-- daraus abgeleitete Stückdurchschnitt benötigt für Mengen wie 3,34 / 3 mehr
-- Nachkommastellen, darf aber nie negativ oder NaN sein.
alter table public.purchase_lines
  drop constraint if exists purchase_lines_unit_purchase_price_check;

alter table public.purchase_lines
  add constraint purchase_lines_unit_purchase_price_check
  check (
    unit_purchase_price is null
    or (
      unit_purchase_price <> 'NaN'::numeric
      and unit_purchase_price >= 0
      and scale(unit_purchase_price) <= 16
    )
  );

create or replace function public.update_purchase_workflow(
  p_purchase_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_before public.purchases%rowtype;
  v_after public.purchases%rowtype;
  v_event_id uuid;
  v_event_type text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich.';
  end if;
  if p_status not in ('ordered', 'arrived') then
    raise exception using errcode = '22023', message = 'Unbekannter Einkaufsstatus.';
  end if;

  select purchase.*
  into v_before
  from public.purchases as purchase
  where purchase.id = p_purchase_id
  for update;

  if not found or not public.is_workspace_member(v_before.workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Einkauf.';
  end if;

  if p_status = 'ordered' then
    if v_before.receiving_status = 'ordered' and v_before.shipment_status = 'not_shipped' then
      return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_before), 'eventId', null);
    end if;
    if v_before.receiving_status <> 'draft' then
      raise exception using errcode = '22023', message = 'Nur ein Entwurf kann bestellt werden.';
    end if;
    update public.purchases
    set receiving_status = 'ordered',
        shipment_status = 'not_shipped',
        arrived_at = null,
        updated_at = statement_timestamp()
    where id = p_purchase_id
    returning * into v_after;
    v_event_type := 'purchase_ordered';
  else
    if v_before.receiving_status = 'received' and v_before.arrived_at is not null then
      return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_before), 'eventId', null);
    end if;
    if v_before.receiving_status <> 'ordered' then
      raise exception using errcode = '22023', message = 'Nur ein bestellter Einkauf kann ankommen.';
    end if;
    update public.purchases
    set receiving_status = 'received',
        shipment_status = 'arrived',
        arrived_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where id = p_purchase_id
    returning * into v_after;
    v_event_type := 'purchase_arrived';
  end if;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    v_before.workspace_id,
    'purchase',
    p_purchase_id,
    v_event_type,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'receiving_status', pg_catalog.jsonb_build_object(
        'before', v_before.receiving_status,
        'after', v_after.receiving_status
      ),
      'arrived_at', pg_catalog.jsonb_build_object(
        'before', v_before.arrived_at,
        'after', v_after.arrived_at
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_after), 'eventId', v_event_id);
end;
$$;

alter function public.update_purchase_workflow(uuid, text) owner to postgres;
revoke all on function public.update_purchase_workflow(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_purchase_workflow(uuid, text) to authenticated;

comment on function public.update_purchase_workflow(uuid, text) is
  'Ändert Bestellt oder Angekommen samt unveränderlichem Fachereignis atomar.';

create or replace function public.update_purchase_tracking(
  p_purchase_id uuid,
  p_tracking_number text,
  p_tracking_carrier text,
  p_tracking_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_before public.purchases%rowtype;
  v_after public.purchases%rowtype;
  v_number text := nullif(pg_catalog.btrim(p_tracking_number), '');
  v_carrier text := nullif(pg_catalog.btrim(p_tracking_carrier), '');
  v_status text := coalesce(nullif(pg_catalog.btrim(p_tracking_status), ''), 'pending');
  v_event_id uuid;
  v_event_type text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich.';
  end if;
  if v_status not in ('pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception') then
    raise exception using errcode = '22023', message = 'Unbekannter Trackingstatus.';
  end if;
  if v_number is not null and v_carrier is null then
    raise exception using errcode = '22023', message = 'Zum Tracking wird ein Dienstleister benötigt.';
  end if;

  select purchase.*
  into v_before
  from public.purchases as purchase
  where purchase.id = p_purchase_id
  for update;

  if not found or not public.is_workspace_member(v_before.workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Einkauf.';
  end if;

  if v_number is null then
    v_carrier := null;
    v_status := 'pending';
  end if;

  if v_before.tracking_number is not distinct from v_number
    and v_before.tracking_carrier is not distinct from v_carrier
    and v_before.tracking_status is not distinct from v_status then
    return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_before), 'eventId', null);
  end if;

  v_event_type := case
    when v_before.tracking_number is null and v_number is not null then 'purchase_tracking_added'
    when v_before.tracking_number is not null and v_number is null then 'purchase_tracking_removed'
    else 'purchase_tracking_updated'
  end;

  update public.purchases
  set tracking_number = v_number,
      tracking_carrier = v_carrier,
      tracking_status = v_status,
      updated_at = statement_timestamp()
  where id = p_purchase_id
  returning * into v_after;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    v_before.workspace_id,
    'purchase',
    p_purchase_id,
    v_event_type,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'tracking_number', pg_catalog.jsonb_build_object(
        'before', v_before.tracking_number,
        'after', v_after.tracking_number
      ),
      'tracking_carrier', pg_catalog.jsonb_build_object(
        'before', v_before.tracking_carrier,
        'after', v_after.tracking_carrier
      ),
      'tracking_status', pg_catalog.jsonb_build_object(
        'before', v_before.tracking_status,
        'after', v_after.tracking_status
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_after), 'eventId', v_event_id);
end;
$$;

alter function public.update_purchase_tracking(uuid, text, text, text) owner to postgres;
revoke all on function public.update_purchase_tracking(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_purchase_tracking(uuid, text, text, text) to authenticated;

comment on function public.update_purchase_tracking(uuid, text, text, text) is
  'Ändert freiwilliges Tracking samt unveränderlichem Fachereignis atomar.';

create or replace function public.restore_purchase_position_prices(
  p_workspace_id uuid,
  p_purchase_id uuid,
  p_original_lines jsonb,
  p_persisted_lines jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_index integer;
  v_original jsonb;
  v_persisted jsonb;
  v_line_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_line_total numeric;
  v_mode text;
  v_total_expense_cents bigint;
begin
  if pg_catalog.jsonb_typeof(p_original_lines) <> 'array'
    or pg_catalog.jsonb_typeof(p_persisted_lines) <> 'array'
    or pg_catalog.jsonb_array_length(p_original_lines)
      <> pg_catalog.jsonb_array_length(p_persisted_lines) then
    raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind unvollständig.';
  end if;

  for v_index in 0..pg_catalog.jsonb_array_length(p_original_lines) - 1 loop
    v_original := p_original_lines -> v_index;
    v_persisted := p_persisted_lines -> v_index;
    if coalesce(v_original ->> 'price_mode', 'priced') <> 'priced' then
      continue;
    end if;
    if pg_catalog.jsonb_typeof(v_original -> 'ordered_quantity') <> 'number'
      or pg_catalog.jsonb_typeof(v_original -> 'unit_purchase_price') <> 'number'
      or pg_catalog.jsonb_typeof(v_original -> 'line_total') <> 'number' then
      raise exception using errcode = '22023', message = 'Die Positionspreise sind ungültig.';
    end if;

    v_line_id := (v_persisted ->> 'id')::uuid;
    v_quantity := (v_original ->> 'ordered_quantity')::integer;
    v_unit_price := (v_original ->> 'unit_purchase_price')::numeric;
    v_line_total := (v_original ->> 'line_total')::numeric;
    if v_quantity < 1
      or v_unit_price < 0
      or v_line_total < 0
      or pg_catalog.scale(v_unit_price) > 16
      or pg_catalog.scale(v_line_total) > 2
      or pg_catalog.abs(v_unit_price * v_quantity - v_line_total) > 0.00000001 then
      raise exception using errcode = '22023', message = 'Die Positionspreise sind ungültig.';
    end if;

    update public.purchase_lines
    set price_mode = 'priced',
        unit_purchase_price = v_unit_price,
        line_total = v_line_total,
        updated_at = pg_catalog.clock_timestamp()
    where id = v_line_id
      and workspace_id = p_workspace_id
      and purchase_id = p_purchase_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Die Einkaufsposition wurde nicht gefunden.';
    end if;
  end loop;

  update public.purchases
  set pricing_mode = 'individual'
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning cost_allocation_mode into v_mode;

  select coalesce(pg_catalog.round(pg_catalog.sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  if v_mode <> 'manual' and v_total_expense_cents > 0 then
    with positions as (
      select
        line.id,
        persisted.ordinality,
        case
          when v_mode = 'value_weighted' and totals.value_total > 0 then line.line_total
          else line.ordered_quantity::numeric
        end as weight
      from pg_catalog.jsonb_array_elements(p_persisted_lines)
        with ordinality as persisted(value, ordinality)
      join public.purchase_lines as line
        on line.id = (persisted.value ->> 'id')::uuid
      cross join (
        select pg_catalog.sum(candidate.line_total) as value_total
        from public.purchase_lines as candidate
        where candidate.workspace_id = p_workspace_id
          and candidate.purchase_id = p_purchase_id
      ) as totals
    ), shares as (
      select
        positions.*,
        v_total_expense_cents::numeric * weight
          / nullif(pg_catalog.sum(weight) over (), 0) as exact_cents
      from positions
    ), ranked as (
      select
        shares.*,
        pg_catalog.floor(exact_cents)::bigint as floor_cents,
        pg_catalog.row_number() over (
          order by exact_cents - pg_catalog.floor(exact_cents) desc, ordinality
        ) as remainder_rank,
        v_total_expense_cents
          - pg_catalog.sum(pg_catalog.floor(exact_cents)::bigint) over () as remainder_cents
      from shares
    )
    update public.purchase_lines as line
    set allocated_additional_cost = (
      ranked.floor_cents
        + case when ranked.remainder_rank <= ranked.remainder_cents then 1 else 0 end
    )::numeric / 100
    from ranked
    where line.id = ranked.id;
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) order by persisted.ordinality)
    from pg_catalog.jsonb_array_elements(p_persisted_lines)
      with ordinality as persisted(value, ordinality)
    join public.purchase_lines as line
      on line.id = (persisted.value ->> 'id')::uuid
  ), '[]'::jsonb);
end;
$$;

alter function public.restore_purchase_position_prices(uuid, uuid, jsonb, jsonb)
  owner to postgres;
revoke all on function public.restore_purchase_position_prices(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.create_purchase_with_position_prices(
  p_workspace_id uuid,
  p_purchase jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requires_restore boolean;
  v_legacy_lines jsonb;
  v_base_purchase jsonb;
  v_result jsonb;
  v_purchase_id uuid;
  v_restored_lines jsonb;
  v_purchase jsonb;
  v_supplier_id uuid;
begin
  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'supplier_id'), 'null')
      not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '') is not null
      and (p_purchase ->> 'supplier_id') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Verkäufer gehört nicht zu diesem Workspace.';
  end if;

  v_supplier_id := nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '')::uuid;
  if v_supplier_id is not null and not exists (
    select 1
    from public.suppliers as supplier
    where supplier.workspace_id = p_workspace_id
      and supplier.id = v_supplier_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der Verkäufer gehört nicht zu diesem Workspace.';
  end if;

  -- Die bestehende Erstellfunktion enthält für supplier_id noch eine zu kurze
  -- UUID-Prüfung. Der Wrapper prüft den Verkäufer korrekt und setzt ihn nach
  -- dem atomaren Basisschritt, bis die Alt-Funktion vollständig abgelöst wird.
  v_base_purchase := p_purchase || pg_catalog.jsonb_build_object('supplier_id', null);

  select coalesce(pg_catalog.bool_or(
    element.value ->> 'price_mode' = 'priced'
      and pg_catalog.jsonb_typeof(element.value -> 'unit_purchase_price') = 'number'
      and pg_catalog.scale((element.value ->> 'unit_purchase_price')::numeric) > 2
  ), false)
  into v_requires_restore
  from pg_catalog.jsonb_array_elements(p_lines) as element(value);

  if v_requires_restore then
    select coalesce(pg_catalog.jsonb_agg(
      element.value || pg_catalog.jsonb_build_object(
        'price_mode', 'unpriced_mystery',
        'unit_purchase_price', null,
        'line_total', null
      ) order by element.ordinality
    ), '[]'::jsonb)
    into v_legacy_lines
    from pg_catalog.jsonb_array_elements(p_lines)
      with ordinality as element(value, ordinality);

    v_result := public.create_purchase(
      p_workspace_id,
      v_base_purchase || pg_catalog.jsonb_build_object('pricing_mode', 'total'),
      p_expenses,
      v_legacy_lines
    );
    v_purchase_id := (v_result -> 'purchase' ->> 'id')::uuid;
    v_restored_lines := public.restore_purchase_position_prices(
      p_workspace_id,
      v_purchase_id,
      p_lines,
      v_result -> 'purchase_lines'
    );
    v_result := v_result
      || pg_catalog.jsonb_build_object('purchase_lines', v_restored_lines);
  else
    v_result := public.create_purchase(
      p_workspace_id,
      v_base_purchase,
      p_expenses,
      p_lines
    );
    v_purchase_id := (v_result -> 'purchase' ->> 'id')::uuid;
  end if;

  -- Bei einer Wiederholung mit derselben request_id bleibt der ursprünglich
  -- gespeicherte Verkäufer unverändert.
  update public.purchases
  set supplier_id = v_supplier_id,
      updated_at = statement_timestamp()
  where id = v_purchase_id
    and supplier_id is null
    and v_supplier_id is not null;

  select pg_catalog.to_jsonb(purchase)
  into v_purchase
  from public.purchases as purchase
  where purchase.id = v_purchase_id;

  return v_result
    || pg_catalog.jsonb_build_object('purchase', v_purchase);
end;
$$;

alter function public.create_purchase_with_position_prices(uuid, jsonb, jsonb, jsonb)
  owner to postgres;
revoke all on function public.create_purchase_with_position_prices(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_purchase_with_position_prices(uuid, jsonb, jsonb, jsonb)
  to authenticated;

comment on function public.create_purchase_with_position_prices(uuid, jsonb, jsonb, jsonb) is
  'Erstellt Einkäufe und bewahrt centgenaue Positionssummen mit präzisem Stückdurchschnitt.';

create or replace function public.update_purchase_draft_with_event(
  p_workspace_id uuid,
  p_purchase_id uuid,
  p_purchase jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_before public.purchases%rowtype;
  v_result jsonb;
  v_after jsonb;
  v_event_id uuid;
  v_before_line_count bigint;
  v_before_expense_count bigint;
  v_requires_restore boolean;
  v_legacy_lines jsonb;
  v_restored_lines jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich.';
  end if;

  select purchase.*
  into v_before
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found or not public.is_workspace_member(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Einkauf.';
  end if;

  select pg_catalog.count(*)
  into v_before_line_count
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select pg_catalog.count(*)
  into v_before_expense_count
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.bool_or(
    element.value ->> 'price_mode' = 'priced'
      and pg_catalog.jsonb_typeof(element.value -> 'unit_purchase_price') = 'number'
      and pg_catalog.scale((element.value ->> 'unit_purchase_price')::numeric) > 2
  ), false)
  into v_requires_restore
  from pg_catalog.jsonb_array_elements(p_lines) as element(value);

  if v_requires_restore then
    select coalesce(pg_catalog.jsonb_agg(
      element.value || pg_catalog.jsonb_build_object(
        'price_mode', 'unpriced_mystery',
        'unit_purchase_price', null,
        'line_total', null
      ) order by element.ordinality
    ), '[]'::jsonb)
    into v_legacy_lines
    from pg_catalog.jsonb_array_elements(p_lines) with ordinality as element(value, ordinality);
    v_result := public.update_purchase_draft(
      p_workspace_id,
      p_purchase_id,
      p_purchase || pg_catalog.jsonb_build_object('pricing_mode', 'total'),
      p_expenses,
      v_legacy_lines
    );
    v_restored_lines := public.restore_purchase_position_prices(
      p_workspace_id,
      p_purchase_id,
      p_lines,
      v_result -> 'purchase_lines'
    );
    select pg_catalog.to_jsonb(purchase)
    into v_after
    from public.purchases as purchase
    where purchase.id = p_purchase_id;
    v_result := v_result
      || pg_catalog.jsonb_build_object('purchase', v_after)
      || pg_catalog.jsonb_build_object('purchase_lines', v_restored_lines);
  else
    v_result := public.update_purchase_draft(
      p_workspace_id,
      p_purchase_id,
      p_purchase,
      p_expenses,
      p_lines
    );
  end if;
  v_after := v_result -> 'purchase';

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    p_workspace_id,
    'purchase',
    p_purchase_id,
    'purchase_updated',
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'title', pg_catalog.jsonb_build_object(
        'before', v_before.title,
        'after', v_after ->> 'title'
      ),
      'supplier_id', pg_catalog.jsonb_build_object(
        'before', v_before.supplier_id,
        'after', v_after ->> 'supplier_id'
      ),
      'purchase_date', pg_catalog.jsonb_build_object(
        'before', v_before.purchase_date,
        'after', v_after ->> 'purchase_date'
      ),
      'purchase_price', pg_catalog.jsonb_build_object(
        'before', v_before.purchase_price,
        'after', v_after -> 'purchase_price'
      ),
      'line_count', pg_catalog.jsonb_build_object(
        'before', v_before_line_count,
        'after', pg_catalog.jsonb_array_length(p_lines)
      ),
      'expense_count', pg_catalog.jsonb_build_object(
        'before', v_before_expense_count,
        'after', pg_catalog.jsonb_array_length(p_expenses)
      )
    )
  ) returning id into v_event_id;

  return v_result || pg_catalog.jsonb_build_object('eventId', v_event_id);
end;
$$;

alter function public.update_purchase_draft_with_event(uuid, uuid, jsonb, jsonb, jsonb)
  owner to postgres;
revoke all on function public.update_purchase_draft_with_event(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_purchase_draft_with_event(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated;

comment on function public.update_purchase_draft_with_event(uuid, uuid, jsonb, jsonb, jsonb) is
  'Speichert einen Einkaufsentwurf und dessen Fachereignis atomar.';
