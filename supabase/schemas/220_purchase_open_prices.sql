-- Erlaubt offene Preise in normalen Einkaufsentwürfen und sperrt Abschluss,
-- Ankunft sowie Bestandsübernahme bis alle Positionspreise vollständig sind.

alter table public.purchase_lines
  drop constraint purchase_lines_price_mode_check;
alter table public.purchase_lines
  add constraint purchase_lines_price_mode_check
  check (price_mode in ('priced', 'open', 'unpriced_mystery'));

alter table public.purchase_lines
  drop constraint purchase_lines_check2;
alter table public.purchase_lines
  add constraint purchase_lines_check2
  check (
    (
      price_mode = 'priced'
      and unit_purchase_price is not null
      and line_total is not null
      and line_total = pg_catalog.round(ordered_quantity * unit_purchase_price, 2)
    )
    or (
      price_mode in ('open', 'unpriced_mystery')
      and unit_purchase_price is null
      and line_total is null
    )
  );

create or replace function public.purchase_has_open_prices(
  p_workspace_id uuid,
  p_purchase_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.purchases as purchase
    join public.purchase_lines as line
      on line.workspace_id = purchase.workspace_id
      and line.purchase_id = purchase.id
    where purchase.workspace_id = p_workspace_id
      and purchase.id = p_purchase_id
      and coalesce(
        purchase.pricing_mode,
        case when purchase.type = 'mystery_pack' then 'total' else 'individual' end
      ) = 'individual'
      and (
        line.price_mode <> 'priced'
        or line.unit_purchase_price is null
        or line.line_total is null
      )
  );
$$;

alter function public.purchase_has_open_prices(uuid, uuid) owner to postgres;

comment on function public.purchase_has_open_prices(uuid, uuid) is
  'Erkennt offene Preise in normalen Einkaufspositionen, einschließlich alter unpriced_mystery-Daten.';

create or replace function public.prevent_open_price_purchase_stock_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.purchase_id is not null
    and public.purchase_has_open_prices(new.workspace_id, new.purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor der Bestandsübernahme ergänzt werden.';
  end if;
  return new;
end;
$$;

alter function public.prevent_open_price_purchase_stock_transfer() owner to postgres;

create trigger prevent_open_price_purchase_inventory_transfer
  before insert or update of purchase_id on public.inventory_items
  for each row execute function public.prevent_open_price_purchase_stock_transfer();

create trigger prevent_open_price_purchase_stock_lot_transfer
  before insert or update of purchase_id on public.stock_lots
  for each row execute function public.prevent_open_price_purchase_stock_transfer();

create or replace function public.build_purchase_costing_plan(
  p_workspace_id uuid,
  p_purchase_id uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_line_tax_shares bigint[];
  v_unit_tax_shares bigint[];
  v_global_tax_shares bigint[];
  v_tax_additional_cents bigint := 0;
  v_tax_unknown boolean := false;
  v_line public.purchase_lines;
  v_cost record;
  v_line_ids uuid[];
  v_line_weights numeric[];
  v_line_goods_shares bigint[];
  v_discount_shares bigint[];
  v_line_additional_shares bigint[];
  v_line_total_shares bigint[];
  v_cost_shares bigint[];
  v_cost_weights numeric[];
  v_unit_goods_shares bigint[];
  v_unit_additional_shares bigint[];
  v_unit_total_shares bigint[];
  v_global_unit_goods_shares bigint[];
  v_global_unit_total_shares bigint[];
  v_goods_cents bigint := 0;
  v_additional_cents bigint := 0;
  v_discount_cents bigint := 0;
  v_total_cents bigint := 0;
  v_allocated_cents bigint := 0;
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_target_position integer := 0;
  v_global_unit_position integer := 0;
  v_lines jsonb := '[]'::jsonb;
begin
  if p_workspace_id is null or p_purchase_id is null then
    raise exception using
      errcode = '22023',
      message = 'Workspace und Einkauf sind für die Kostenberechnung erforderlich.';
  end if;

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.content_status = 'unknown' then
    raise exception using
      errcode = '22023',
      message = 'Der Inhalt muss vor dem Abschluss vollständig erfasst sein.';
  end if;

  v_discount_cents := (coalesce(v_purchase.discount_amount, 0) * 100)::bigint;
  if v_purchase.purchase_price is not null
    and v_discount_cents > (v_purchase.purchase_price * 100)::bigint then
    raise exception using
      errcode = '22023',
      message = 'Der Rabatt darf den Warenbetrag nicht übersteigen.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_line_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ohne Positionen kann nicht finalisiert werden.';
  end if;

  if v_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_max_line_units > v_max_purchase_units
    or v_total_units > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  select
    pg_catalog.array_agg(line.id order by line.created_at, line.id),
    pg_catalog.array_agg(line.ordered_quantity::numeric order by line.created_at, line.id)
  into v_line_ids, v_line_weights
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_purchase.purchase_price is not null and (
    v_purchase.purchase_price::text in ('NaN', 'Infinity', '-Infinity')
    or v_purchase.purchase_price < 0
    or v_purchase.purchase_price <> pg_catalog.round(v_purchase.purchase_price, 2)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der Warenbetrag ist ungültig.';
  end if;

  if exists (
    select 1
    from public.purchase_costs as cost
    where cost.workspace_id = p_workspace_id
      and cost.purchase_id = p_purchase_id
      and (
        cost.amount::text in ('NaN', 'Infinity', '-Infinity')
        or cost.amount < 0
        or pg_catalog.scale(cost.amount) > 2
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Zusatzkosten müssen als nichtnegative ganze Cent erfasst sein.';
  end if;

  if exists (
    select 1
    from public.purchase_costs as cost
    where cost.workspace_id = p_workspace_id
      and cost.purchase_id = p_purchase_id
      and cost.allocation_method = 'direct'
      and not (cost.target_purchase_line_id = any(v_line_ids))
  ) then
    raise exception using
      errcode = '22023',
      message = 'Direkte Zusatzkosten müssen eine Position desselben Einkaufs referenzieren.';
  end if;

  select coalesce(pg_catalog.sum((cost.amount * 100)::bigint), 0)
  into v_additional_cents
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  v_line_goods_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);
  v_line_additional_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);

  if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
    if exists (
      select 1
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.purchase_id = p_purchase_id
        and (
          line.price_mode <> 'unpriced_mystery'
          or line.unit_purchase_price is not null
          or line.line_total is not null
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Mystery-Einkaufspositionen müssen vollständig unbepreist sein.';
    end if;

    if v_purchase.purchase_price is null then
      raise exception using
        errcode = '22023',
        message = 'Mystery-Einkäufe benötigen einen ausdrücklich erfassten Warenbetrag.';
    end if;

    v_goods_cents := (v_purchase.purchase_price * 100)::bigint - v_discount_cents;
    v_total_cents := v_goods_cents + v_additional_cents;
    v_global_unit_goods_shares := public.allocate_integer_cents(
      v_goods_cents,
      pg_catalog.array_fill(1::numeric, array[v_total_units::integer])
    );
    v_global_unit_total_shares := public.allocate_integer_cents(
      v_total_cents,
      pg_catalog.array_fill(1::numeric, array[v_total_units::integer])
    );

    -- Mystery-Kosten bilden eine einzige stabile Einheitenfolge. Würden
    -- Warenwert und jede Zusatzkostenzeile separat gerundet, könnten einzelne
    -- Einheiten trotz gleicher Ausgangslage um mehrere Cent auseinanderliegen.
    for v_line_position in 1..v_line_count loop
      select line.*
      into v_line
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.id = v_line_ids[v_line_position];

      for v_item_position in 1..v_line.ordered_quantity loop
        v_global_unit_position := v_global_unit_position + 1;
        v_line_goods_shares[v_line_position] :=
          v_line_goods_shares[v_line_position]
          + v_global_unit_goods_shares[v_global_unit_position];
        v_line_additional_shares[v_line_position] :=
          v_line_additional_shares[v_line_position]
          + v_global_unit_total_shares[v_global_unit_position]
          - v_global_unit_goods_shares[v_global_unit_position];
      end loop;
    end loop;
  else
    if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
      raise exception using
        errcode = '22023',
        message = 'Offene Einkaufspreise müssen vor dem Abschluss ergänzt werden.';
    end if;

    select pg_catalog.sum((line.line_total * 100)::bigint)
    into v_goods_cents
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id;

    if v_purchase.purchase_price is not null
      and (v_purchase.purchase_price * 100)::bigint <> v_goods_cents then
      raise exception using
        errcode = '22023',
        message = 'Der vorhandene Warenbetrag widerspricht der Summe der Einkaufspositionen.';
    end if;

    select pg_catalog.array_agg(
      (line.line_total * 100)::bigint order by line.created_at, line.id
    )
    into v_line_goods_shares
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id;

    v_discount_shares := public.allocate_integer_cents(v_discount_cents, v_line_goods_shares);
    for v_line_position in 1..v_line_count loop
      v_line_goods_shares[v_line_position] :=
        v_line_goods_shares[v_line_position] - v_discount_shares[v_line_position];
    end loop;
    v_goods_cents := v_goods_cents - v_discount_cents;

    for v_cost in
      select cost.*
      from public.purchase_costs as cost
      where cost.workspace_id = p_workspace_id
        and cost.purchase_id = p_purchase_id
      order by cost.created_at, cost.id
    loop
      if v_cost.allocation_method = 'direct' then
        v_cost_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);
        v_target_position := pg_catalog.array_position(
          v_line_ids,
          v_cost.target_purchase_line_id
        );
        v_cost_shares[v_target_position] := (v_cost.amount * 100)::bigint;
      elsif v_cost.allocation_method = 'quantity' then
        v_cost_shares := public.allocate_integer_cents(
          (v_cost.amount * 100)::bigint,
          v_line_weights
        );
      else
        select pg_catalog.array_agg(
          line.line_total order by line.created_at, line.id
        )
        into v_cost_weights
        from public.purchase_lines as line
        where line.workspace_id = p_workspace_id
          and line.purchase_id = p_purchase_id;
        v_cost_shares := public.allocate_integer_cents(
          (v_cost.amount * 100)::bigint,
          v_cost_weights
        );
      end if;

      for v_line_position in 1..v_line_count loop
        v_line_additional_shares[v_line_position] :=
          v_line_additional_shares[v_line_position] + v_cost_shares[v_line_position];
      end loop;
    end loop;
  end if;

  v_total_cents := v_goods_cents + v_additional_cents;
  v_line_total_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);

  for v_line_position in 1..v_line_count loop
    v_line_total_shares[v_line_position] :=
      v_line_goods_shares[v_line_position]
      + v_line_additional_shares[v_line_position];
  end loop;

  select pg_catalog.sum(share.value)
  into v_allocated_cents
  from pg_catalog.unnest(v_line_total_shares) as share(value);

  if v_allocated_cents <> v_total_cents then
    raise exception using
      errcode = 'P0001',
      message = 'Die Kostenverteilung stimmt nicht mit den Einkaufsgesamtkosten überein.';
  end if;

  -- Unbekannte Belegzuordnung bleibt unbekannt; keine automatische Altklassifizierung.
  select coalesce(pg_catalog.bool_or(cost.tax_treatment is null), false),
    coalesce(pg_catalog.sum(case when cost.tax_treatment = 'purchase_price'
      then (cost.amount * 100)::bigint else 0 end), 0)
  into v_tax_unknown, v_tax_additional_cents
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id and cost.purchase_id = p_purchase_id;
  v_line_tax_shares := v_line_goods_shares;
  if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
    v_global_tax_shares := public.allocate_integer_cents(v_goods_cents + v_tax_additional_cents,
      pg_catalog.array_fill(1::numeric, array[v_total_units::integer]));
  else
    for v_cost in select cost.* from public.purchase_costs as cost
      where cost.workspace_id = p_workspace_id and cost.purchase_id = p_purchase_id
        and cost.tax_treatment = 'purchase_price'
      order by cost.created_at, cost.id
    loop
      if v_cost.allocation_method = 'direct' then
        v_cost_shares := pg_catalog.array_fill(0::bigint, array[v_line_count]);
        v_cost_shares[pg_catalog.array_position(v_line_ids, v_cost.target_purchase_line_id)] := (v_cost.amount * 100)::bigint;
      elsif v_cost.allocation_method = 'quantity' then
        v_cost_shares := public.allocate_integer_cents((v_cost.amount * 100)::bigint, v_line_weights);
      else
        select pg_catalog.array_agg(line.line_total order by line.created_at, line.id)
        into v_cost_weights from public.purchase_lines as line
        where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id;
        v_cost_shares := public.allocate_integer_cents((v_cost.amount * 100)::bigint, v_cost_weights);
      end if;
      for v_line_position in 1..v_line_count loop
        v_line_tax_shares[v_line_position] := v_line_tax_shares[v_line_position] + v_cost_shares[v_line_position];
      end loop;
    end loop;
  end if;

  v_global_unit_position := 0;
  for v_line_position in 1..v_line_count loop
    select line.*
    into v_line
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.id = v_line_ids[v_line_position];

    if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
      v_unit_total_shares := pg_catalog.array_fill(
        0::bigint,
        array[v_line.ordered_quantity]
      );
      for v_item_position in 1..v_line.ordered_quantity loop
        v_global_unit_position := v_global_unit_position + 1;
        v_unit_total_shares[v_item_position] :=
          v_global_unit_total_shares[v_global_unit_position];
      end loop;
    else
      v_unit_goods_shares := public.allocate_integer_cents(
        v_line_goods_shares[v_line_position],
        pg_catalog.array_fill(1::numeric, array[v_line.ordered_quantity])
      );
      v_unit_additional_shares := public.allocate_integer_cents(
        v_line_additional_shares[v_line_position],
        pg_catalog.array_fill(1::numeric, array[v_line.ordered_quantity])
      );
      v_unit_total_shares := pg_catalog.array_fill(
        0::bigint,
        array[v_line.ordered_quantity]
      );
      for v_item_position in 1..v_line.ordered_quantity loop
        v_unit_total_shares[v_item_position] :=
          v_unit_goods_shares[v_item_position]
          + v_unit_additional_shares[v_item_position];
      end loop;
    end if;

    if v_tax_unknown then
      v_unit_tax_shares := null;
    elsif v_global_tax_shares is not null then
      v_unit_tax_shares := v_global_tax_shares[(v_global_unit_position - v_line.ordered_quantity + 1):v_global_unit_position];
    else
      -- Dieselben Waren-/Zusatzkostenanteile wie beim betrieblichen Wareneinsatz:
      -- Zusammenrunden würde einzelne steuerliche Stückkosten verschieben.
      v_unit_tax_shares := public.allocate_integer_cents(
        v_line_tax_shares[v_line_position] - v_line_goods_shares[v_line_position],
        pg_catalog.array_fill(1::numeric, array[v_line.ordered_quantity]));
      for v_item_position in 1..v_line.ordered_quantity loop
        v_unit_tax_shares[v_item_position] := v_unit_goods_shares[v_item_position] + v_unit_tax_shares[v_item_position];
      end loop;
    end if;

    v_lines := v_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'lineId', v_line.id,
        'goodsCents', v_line_goods_shares[v_line_position],
        'additionalCents', v_line_additional_shares[v_line_position],
        'totalCents', v_line_total_shares[v_line_position],
        'unitTotalCents', pg_catalog.to_jsonb(v_unit_total_shares),
        'unitTaxPurchaseCents', pg_catalog.to_jsonb(v_unit_tax_shares)
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'goodsCents', v_goods_cents,
    'additionalCents', v_additional_cents,
    'totalCents', v_total_cents,
    'allocatedCents', v_allocated_cents,
    'lines', v_lines
  );
end;
$$;


create or replace function public.finalize_purchase_costing(
  p_workspace_id uuid,
  p_purchase_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_purchase public.purchases;
  v_line public.purchase_lines;
  v_existing_lot public.stock_lots;
  v_cohort record;
  v_costing_plan jsonb;
  v_line_plan jsonb;
  v_line_ids uuid[];
  v_line_total_shares bigint[];
  v_line_additional_shares bigint[];
  v_unit_shares bigint[];
  v_tax_unit_costs numeric[];
  v_existing_item_ids uuid[];
  v_goods_cents bigint := 0;
  v_total_cents bigint := 0;
  v_allocated_cents bigint := 0;
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_existing_count integer := 0;
  v_existing_lot_quantity integer := 0;
  v_movement_count integer := 0;
  v_inventory_cents bigint := 0;
  v_lot_total_cents bigint := 0;
  v_unit_offset integer := 0;
  v_suffix_position integer := 0;
  v_stock_lot_id uuid;
  v_event_id uuid;
  v_finalized_at timestamptz := pg_catalog.clock_timestamp();
  v_latest_received_at timestamptz;
  v_next_received_at timestamptz;
begin
  if v_actor_id is null
    or p_workspace_id is null
    or p_purchase_id is null
    or not exists (
      select 1
      from public.workspace_members as member
      where member.workspace_id = p_workspace_id
        and member.user_id = v_actor_id
    ) then
    raise exception using
      errcode = '42501',
      message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status = 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Der Einkauf ist bereits finalisiert.';
  end if;

  if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor dem Abschluss ergänzt werden.';
  end if;

  if v_purchase.request_id is not null and v_purchase.shipment_status <> 'arrived' then
    raise exception using
      errcode = '22023',
      message = 'Vor dem Abschluss muss die Ankunft bestätigt sein.';
  end if;

  if v_purchase.content_status = 'unknown' then
    raise exception using
      errcode = '22023',
      message = 'Der Inhalt muss vor dem Abschluss vollständig erfasst sein.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_line_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ohne Positionen kann nicht finalisiert werden.';
  end if;

  if v_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_max_line_units > v_max_purchase_units
    or v_total_units > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  perform line.id
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
  order by line.created_at, line.id
  for update;

  perform cost.id
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id
  order by cost.created_at, cost.id
  for update;

  select pg_catalog.array_agg(line.id order by line.created_at, line.id)
  into v_line_ids
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  perform item.id
  from public.inventory_items as item
  left join public.purchase_lines as linked_line
    on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
  where item.purchase_id = p_purchase_id
    or linked_line.purchase_id = p_purchase_id
  order by item.created_at, item.id
  for update of item;

  perform lot.id
  from public.stock_lots as lot
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.purchase_id = p_purchase_id
    or linked_line.purchase_id = p_purchase_id
  order by lot.received_at, lot.id
  for update of lot;

  if exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where lot.workspace_id = p_workspace_id
      and (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and not pg_catalog.isfinite(lot.received_at)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Historische Bestandslose mit nicht-endlichem Empfangszeitpunkt müssen vor der Finalisierung manuell geprüft werden.';
  end if;

  perform movement.id
  from public.stock_movements as movement
  join public.stock_lots as lot on lot.id = movement.stock_lot_id
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.purchase_id = p_purchase_id
    or linked_line.purchase_id = p_purchase_id
  order by movement.created_at, movement.id
  for update of movement;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or (item.purchase_line_id is null and item.source_package_line_id is null)
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'individual'
      )
  ) or exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        lot.workspace_id <> p_workspace_id
        or lot.purchase_id <> p_purchase_id
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'quantity'
        or lot.catalog_product_id <> linked_line.catalog_product_id
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.';
  end if;

  if exists (
    select 1
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = p_purchase_id
      and (
        movement.workspace_id <> p_workspace_id
        or movement.direction <> 'in'
        or movement.reason <> 'receipt'
        or movement.sale_line_id is not null
        or movement.quantity <> lot.received_quantity
      )
  ) or exists (
    select 1
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = p_purchase_id
    group by movement.stock_lot_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'Vorhandene Receipt-Bewegungen müssen exakt zum Bestandslos passen.';
  end if;

  if exists (
    select 1
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and (
        (
          line.line_kind = 'individual' and not line.is_package
          and line.received_quantity <> (
            select pg_catalog.count(*)::integer
            from public.inventory_items as item
            where item.workspace_id = p_workspace_id
              and item.purchase_id = p_purchase_id
              and item.purchase_line_id = line.id
          )
        )
        or (
          line.line_kind = 'quantity'
          and line.received_quantity <> (
            select coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
            from public.stock_lots as lot
            where lot.workspace_id = p_workspace_id
              and lot.purchase_id = p_purchase_id
              and lot.purchase_line_id = line.id
          )
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Empfangsmengen und vorhandener Bestand stimmen vor der Finalisierung nicht überein.';
  end if;

  if exists (
    select 1
    from public.inventory_items as item
    where item.workspace_id = p_workspace_id
      and item.purchase_id = p_purchase_id
      and item.status not in ('received', 'needs_review', 'researched', 'ready')
  ) then
    raise exception using
      errcode = '22023',
      message = 'Nur unbearbeitete Einzelstücke können finalisiert werden.';
  end if;

  if exists (
    select 1
    from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and (
        lot.remaining_quantity <> lot.received_quantity
        or exists (
          select 1
          from public.sale_line_lot_allocations as allocation
          where allocation.workspace_id = p_workspace_id
            and allocation.stock_lot_id = lot.id
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Bereits verwendete Bestandslose verhindern die Finalisierung.';
  end if;

  v_costing_plan := public.build_purchase_costing_plan(
    p_workspace_id,
    p_purchase_id
  );
  v_goods_cents := (v_costing_plan ->> 'goodsCents')::bigint;
  v_total_cents := (v_costing_plan ->> 'totalCents')::bigint;
  v_allocated_cents := (v_costing_plan ->> 'allocatedCents')::bigint;

  select
    pg_catalog.array_agg((line_plan.value ->> 'additionalCents')::bigint order by line_plan.ordinality),
    pg_catalog.array_agg((line_plan.value ->> 'totalCents')::bigint order by line_plan.ordinality)
  into v_line_additional_shares, v_line_total_shares
  from pg_catalog.jsonb_array_elements(v_costing_plan -> 'lines')
    with ordinality as line_plan(value, ordinality);

  for v_line_position in 1..v_line_count loop
    v_line_plan := v_costing_plan -> 'lines' -> (v_line_position - 1);

    select line.*
    into v_line
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.id = v_line_ids[v_line_position];

    select pg_catalog.array_agg(unit_share.value::bigint order by unit_share.ordinality)
    into v_unit_shares
    from pg_catalog.jsonb_array_elements_text(v_line_plan -> 'unitTotalCents')
      with ordinality as unit_share(value, ordinality);
    select pg_catalog.array_agg(pg_catalog.round(unit_share.value::numeric / 100, 2) order by unit_share.ordinality)
    into v_tax_unit_costs
    from pg_catalog.jsonb_array_elements_text(nullif(v_line_plan -> 'unitTaxPurchaseCents', 'null'::jsonb))
      with ordinality as unit_share(value, ordinality);

    if v_line.is_package then
      -- Der bezahlte Paketpreis bleibt an der Position, ohne verkäuflichen Platzhalter.
      null;
    elsif v_line.line_kind = 'individual' then
      perform item.id
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_line_id = v_line.id
      order by item.created_at, item.id
      for update;

      if exists (
        select 1
        from public.inventory_items as item
        where item.workspace_id = p_workspace_id
          and item.purchase_line_id = v_line.id
          and (
            item.purchase_id is distinct from p_purchase_id
            or item.status not in ('received', 'needs_review', 'researched', 'ready')
          )
      ) then
        raise exception using
          errcode = '22023',
          message = 'Nur unbearbeitete Einzelstücke können finalisiert werden.';
      end if;

      select pg_catalog.array_agg(item.id order by item.created_at, item.id)
      into v_existing_item_ids
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_line_id = v_line.id;

      v_existing_count := coalesce(pg_catalog.cardinality(v_existing_item_ids), 0);
      if v_existing_count > v_line.ordered_quantity then
        raise exception using
          errcode = '22023',
          message = 'Die Zahl erfasster Einzelstücke überschreitet die Positionsmenge.';
      end if;

      for v_item_position in 1..v_line.ordered_quantity loop
        if v_item_position <= v_existing_count then
          update public.inventory_items
          set allocated_purchase_cost = v_unit_shares[v_item_position]::numeric / 100,
              tax_purchase_cost = v_tax_unit_costs[v_item_position],
              ean = coalesce(v_line.ean_snapshot, ean),
              expected_value = coalesce(expected_value, v_line.estimated_market_value),
              status = 'ready',
              updated_at = v_finalized_at
          where id = v_existing_item_ids[v_item_position]
            and workspace_id = p_workspace_id;
        else
          insert into public.inventory_items (
            workspace_id,
            purchase_id,
            purchase_line_id,
            title,
            ean,
            condition,
            status,
            allocated_purchase_cost,
            tax_purchase_cost,
            expected_value
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.title_snapshot,
            v_line.ean_snapshot,
            case
              when v_line.condition_snapshot in (
                'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
              ) then v_line.condition_snapshot
              else 'used'
            end,
            'ready',
            v_unit_shares[v_item_position]::numeric / 100,
            v_tax_unit_costs[v_item_position],
            v_line.estimated_market_value
          );
        end if;
      end loop;
    else
      perform lot.id
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_line_id = v_line.id
      order by lot.received_at, lot.id
      for update;

      if exists (
        select 1
        from public.stock_lots as lot
        where lot.workspace_id = p_workspace_id
          and lot.purchase_line_id = v_line.id
          and (
            lot.purchase_id <> p_purchase_id
            or lot.catalog_product_id <> v_line.catalog_product_id
            or lot.remaining_quantity <> lot.received_quantity
            or exists (
              select 1
              from public.stock_movements as movement
              where movement.workspace_id = p_workspace_id
                and movement.stock_lot_id = lot.id
                and (
                  movement.direction <> 'in'
                  or movement.reason <> 'receipt'
                )
            )
            or exists (
              select 1
              from public.sale_line_lot_allocations as allocation
              where allocation.workspace_id = p_workspace_id
                and allocation.stock_lot_id = lot.id
            )
          )
      ) then
        raise exception using
          errcode = '22023',
          message = 'Bereits verwendete Bestandslose verhindern die Finalisierung.';
      end if;

      select
        pg_catalog.count(*)::integer,
        coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
      into v_existing_count, v_existing_lot_quantity
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_line_id = v_line.id;

      if v_existing_lot_quantity > v_line.ordered_quantity then
        raise exception using
          errcode = '22023',
          message = 'Die vorhandene Losmenge überschreitet die Positionsmenge.';
      end if;

      v_unit_offset := 0;
      for v_existing_lot in
        select lot.*
        from public.stock_lots as lot
        where lot.workspace_id = p_workspace_id
          and lot.purchase_line_id = v_line.id
        order by lot.received_at, lot.id
        for update
      loop
        select coalesce(pg_catalog.sum(v_unit_shares[unit_position]), 0)::bigint
        into v_lot_total_cents
        from pg_catalog.generate_series(
          v_unit_offset + 1,
          v_unit_offset + v_existing_lot.received_quantity
        ) as unit_position;

        v_unit_offset := v_unit_offset + v_existing_lot.received_quantity;

        update public.stock_lots
        set unit_cost = (
          v_lot_total_cents::numeric
          / v_existing_lot.received_quantity
          / 100
        )
        , unit_tax_purchase_cost = (select pg_catalog.avg(value) from pg_catalog.unnest(v_tax_unit_costs[(v_unit_offset - v_existing_lot.received_quantity + 1):v_unit_offset]) as value),
          remaining_tax_unit_costs = v_tax_unit_costs[(v_unit_offset - v_existing_lot.received_quantity + 1):v_unit_offset],
          remaining_unit_costs = (select pg_catalog.array_agg(pg_catalog.round(value::numeric / 100, 2) order by ordinality)
            from pg_catalog.unnest(v_unit_shares[(v_unit_offset - v_existing_lot.received_quantity + 1):v_unit_offset]) with ordinality as unit(value, ordinality))
        where id = v_existing_lot.id
          and workspace_id = p_workspace_id;

        if (
          select pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)
          from public.stock_lots as lot
          where lot.id = v_existing_lot.id
            and lot.workspace_id = p_workspace_id
        ) <> v_lot_total_cents::numeric / 100 then
          raise exception using
            errcode = '22023',
            message = 'Die Loskosten lassen sich nicht centgenau speichern.';
        end if;

        select pg_catalog.count(*)::integer
        into v_movement_count
        from public.stock_movements as movement
        where movement.workspace_id = p_workspace_id
          and movement.stock_lot_id = v_existing_lot.id;

        if v_movement_count > 1 then
          raise exception using
            errcode = '22023',
            message = 'Ein Bestandslos besitzt mehrere Eingangsbewegungen und kann nicht automatisch umgebaut werden.';
        end if;

        if v_movement_count = 0 then
          insert into public.stock_movements (
            workspace_id,
            stock_lot_id,
            direction,
            quantity,
            reason
          ) values (
            p_workspace_id,
            v_existing_lot.id,
            'in',
            v_existing_lot.received_quantity,
            'receipt'
          );
        end if;
      end loop;

      if v_unit_offset < pg_catalog.cardinality(v_unit_shares) then
        select pg_catalog.max(lot.received_at)
        into v_latest_received_at
        from public.stock_lots as lot
        where lot.workspace_id = p_workspace_id
          and lot.purchase_line_id = v_line.id;

        if v_latest_received_at is null then
          v_next_received_at := v_finalized_at;
        elsif not pg_catalog.isfinite(v_latest_received_at)
          or v_latest_received_at >= '294276-12-31 23:59:59.999999+00'::timestamptz then
          raise exception using
            errcode = '22023',
            message = 'Für neue Bestandslose ist kein späterer endlicher Empfangszeitpunkt verfügbar.';
        else
          v_next_received_at := greatest(
            v_finalized_at,
            v_latest_received_at + interval '1 microsecond'
          );
        end if;
      end if;

      v_suffix_position := 0;

      for v_cohort in
        select
          share.value as unit_cost_cents,
          v_tax_unit_costs[share.ordinality] as tax_unit_cost,
          pg_catalog.count(*)::integer as quantity,
          pg_catalog.min(share.ordinality) as first_position
        from pg_catalog.unnest(v_unit_shares)
          with ordinality as share(value, ordinality)
        where share.ordinality > v_unit_offset
        group by share.value, v_tax_unit_costs[share.ordinality]
        order by pg_catalog.min(share.ordinality)
      loop
        if v_suffix_position > 0 then
          if not pg_catalog.isfinite(v_next_received_at)
            or v_next_received_at >= '294276-12-31 23:59:59.999999+00'::timestamptz then
            raise exception using
              errcode = '22023',
              message = 'Für neue Bestandslose ist kein späterer endlicher Empfangszeitpunkt verfügbar.';
          end if;

          v_next_received_at := v_next_received_at + interval '1 microsecond';
        end if;

        v_suffix_position := v_suffix_position + 1;

        insert into public.stock_lots (
          workspace_id,
          purchase_id,
          purchase_line_id,
          catalog_product_id,
          received_quantity,
          remaining_quantity,
          unit_cost,
          unit_tax_purchase_cost,
          remaining_tax_unit_costs,
          remaining_unit_costs,
          received_at
        ) values (
          p_workspace_id,
          p_purchase_id,
          v_line.id,
          v_line.catalog_product_id,
          v_cohort.quantity,
          v_cohort.quantity,
          v_cohort.unit_cost_cents::numeric / 100,
          v_cohort.tax_unit_cost,
          case when v_cohort.tax_unit_cost is null then null else pg_catalog.array_fill(v_cohort.tax_unit_cost, array[v_cohort.quantity]) end,
          pg_catalog.array_fill(pg_catalog.round(v_cohort.unit_cost_cents::numeric / 100, 2), array[v_cohort.quantity]),
          v_next_received_at
        ) returning id into v_stock_lot_id;

        insert into public.stock_movements (
          workspace_id,
          stock_lot_id,
          direction,
          quantity,
          reason
        ) values (
          p_workspace_id,
          v_stock_lot_id,
          'in',
          v_cohort.quantity,
          'receipt'
        );
      end loop;
    end if;

    update public.purchase_lines
    set allocated_additional_cost =
          v_line_additional_shares[v_line_position]::numeric / 100,
        allocated_total_cost = v_line_total_shares[v_line_position]::numeric / 100,
        received_quantity = ordered_quantity,
        updated_at = v_finalized_at
    where workspace_id = p_workspace_id
      and id = v_line.id;
  end loop;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or (item.purchase_line_id is null and item.source_package_line_id is null)
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'individual'
      )
  ) or exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        lot.workspace_id <> p_workspace_id
        or lot.purchase_id <> p_purchase_id
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'quantity'
        or lot.catalog_product_id <> linked_line.catalog_product_id
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Der Bestand ist nach der Finalisierung strukturell inkonsistent.';
  end if;

  if exists (
    select 1
    from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and lot.unit_cost is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Nach der Finalisierung müssen alle Bestandslose bekannte Kosten besitzen.';
  end if;

  if exists (
    select 1
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and (
        line.received_quantity <> line.ordered_quantity
        or line.allocated_additional_cost > line.allocated_total_cost
        or (
          line.line_kind = 'individual' and not line.is_package
          and (
            line.ordered_quantity <> (
              select pg_catalog.count(*)::integer
              from public.inventory_items as item
              where item.workspace_id = p_workspace_id
                and item.purchase_id = p_purchase_id
                and item.purchase_line_id = line.id
            )
            or line.allocated_total_cost * 100 <> (
              select coalesce(
                pg_catalog.sum(item.allocated_purchase_cost * 100),
                0
              )
              from public.inventory_items as item
              where item.workspace_id = p_workspace_id
                and item.purchase_id = p_purchase_id
                and item.purchase_line_id = line.id
            )
          )
        )
        or (
          line.line_kind = 'quantity'
          and (
            line.ordered_quantity <> (
              select coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
              from public.stock_lots as lot
              where lot.workspace_id = p_workspace_id
                and lot.purchase_id = p_purchase_id
                and lot.purchase_line_id = line.id
            )
            or line.ordered_quantity <> (
              select coalesce(pg_catalog.sum(lot.remaining_quantity), 0)::integer
              from public.stock_lots as lot
              where lot.workspace_id = p_workspace_id
                and lot.purchase_id = p_purchase_id
                and lot.purchase_line_id = line.id
            )
            or line.allocated_total_cost * 100 <> (
              select coalesce(
                pg_catalog.sum(
                  (pg_catalog.round(lot.received_quantity * lot.unit_cost, 2) * 100)::bigint
                ),
                0
              )
              from public.stock_lots as lot
              where lot.workspace_id = p_workspace_id
                and lot.purchase_id = p_purchase_id
                and lot.purchase_line_id = line.id
            )
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Positionskosten und Bestand reconciliieren nach der Finalisierung nicht exakt.';
  end if;

  if exists (
    select 1
    from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and (
        select pg_catalog.count(*)
        from public.stock_movements as movement
        where movement.workspace_id = p_workspace_id
          and movement.stock_lot_id = lot.id
          and movement.direction = 'in'
          and movement.reason = 'receipt'
          and movement.quantity = lot.received_quantity
      ) <> 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Bestandslose und Receipt-Bewegungen reconciliieren nach der Finalisierung nicht exakt.';
  end if;

  select (
    coalesce((
      select pg_catalog.sum(item.allocated_purchase_cost * 100)
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = p_purchase_id
    ), 0)
    + coalesce((
      select pg_catalog.sum(
        (pg_catalog.round(lot.received_quantity * lot.unit_cost, 2) * 100)::bigint
      )
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_id = p_purchase_id
    ), 0)
    + coalesce((
      select pg_catalog.sum(line.allocated_total_cost * 100)
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id and line.is_package
    ), 0)
  )::bigint
  into v_inventory_cents;

  if v_inventory_cents <> v_total_cents then
    raise exception using
      errcode = 'P0001',
      message = 'Der gesamte Einkaufsbestand reconciliiert nicht mit den Einkaufsgesamtkosten.';
  end if;

  update public.inventory_items
  set status = 'ready', updated_at = v_finalized_at
  where workspace_id = p_workspace_id and purchase_id = p_purchase_id
    and source_package_line_id is not null and status in ('received', 'needs_review', 'researched');

  update public.purchases
  set purchase_price = pg_catalog.round(v_goods_cents::numeric / 100, 2),
      total_purchase_cost = v_total_cents::numeric / 100,
      entry_status = 'finalized',
      finalized_at = v_finalized_at,
      finalized_by = v_actor_id,
      updated_at = v_finalized_at
  where workspace_id = p_workspace_id
    and id = p_purchase_id;

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
    'purchase_finalized',
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'purchase_price', pg_catalog.jsonb_build_object(
        'before', v_purchase.purchase_price,
        'after', v_goods_cents::numeric / 100
      ),
      'total_purchase_cost', pg_catalog.jsonb_build_object(
        'before', v_purchase.total_purchase_cost,
        'after', v_total_cents::numeric / 100
      ),
      'allocated_total_cost', pg_catalog.jsonb_build_object(
        'before', 0,
        'after', v_allocated_cents::numeric / 100
      ),
      'entry_status', pg_catalog.jsonb_build_object(
        'before', v_purchase.entry_status,
        'after', 'finalized'
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'purchaseId', p_purchase_id,
    'totalPurchaseCost', v_total_cents::numeric / 100,
    'allocatedTotalCost', v_allocated_cents::numeric / 100,
    'entryStatus', 'finalized',
    'eventId', v_event_id
  );
end;
$$;


create or replace function public.create_purchase(
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
  v_purchase public.purchases;
  v_expense jsonb;
  v_line jsonb;
  v_line_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_refs jsonb := '{}'::jsonb;
  v_line_ref text;
  v_target_line_id uuid;
  v_source_id uuid;
  v_supplier_id uuid;
  v_purchase_type text;
  v_total_expense_cents bigint;
  v_manual_cents bigint;
  v_mode text;
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_audit_after jsonb;
  v_catalog_product_id uuid;
  v_seller_details jsonb := public.normalize_purchase_seller_details(p_purchase);
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_purchase) <> 'object'
    or jsonb_typeof(p_expenses) <> 'array'
    or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if nullif(p_purchase ->> 'request_id', '') is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':' || (p_purchase ->> 'request_id'), 0));
    select * into v_purchase from public.purchases
    where workspace_id = p_workspace_id and request_id = (p_purchase ->> 'request_id')::uuid;
    if found then
      return jsonb_build_object(
        'purchase', to_jsonb(v_purchase),
        'purchase_lines', coalesce((select jsonb_agg(line order by line.created_at, line.id) from public.purchase_lines line where line.purchase_id = v_purchase.id), '[]'::jsonb),
        'purchase_costs', coalesce((select jsonb_agg(cost) from public.purchase_costs cost where cost.purchase_id = v_purchase.id), '[]'::jsonb)
      );
    end if;
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null')
      not in ('null', 'number')
    or (
      pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price') = 'number'
      and (
        (p_purchase ->> 'purchase_price')::numeric < 0
        or pg_catalog.scale((p_purchase ->> 'purchase_price')::numeric) > 2
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Kaufpreis muss centgenau und darf nicht negativ sein.';
  end if;

  for v_expense in
    select element.value
    from pg_catalog.jsonb_array_elements(p_expenses) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_expense) <> 'object'
      or pg_catalog.jsonb_typeof(v_expense -> 'amount') <> 'number'
      or (v_expense ->> 'amount')::numeric <= 0
      or pg_catalog.scale((v_expense ->> 'amount')::numeric) > 2 then
      raise exception using
        errcode = '22023',
        message = 'Zusatzkosten müssen positive centgenaue Zahlen sein.';
    end if;
  end loop;

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  select
    coalesce(pg_catalog.max(candidate.quantity), 0),
    coalesce(pg_catalog.sum(candidate.quantity), 0)
  into v_requested_unit_max, v_requested_unit_total
  from (
    select case
      when pg_catalog.jsonb_typeof(element.value) = 'object'
        and pg_catalog.jsonb_typeof(element.value -> 'ordered_quantity') = 'number'
        and element.value ->> 'ordered_quantity' ~ '^[1-9][0-9]*$'
      then (element.value ->> 'ordered_quantity')::numeric
      else null
    end as quantity
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  ) as candidate;

  if v_requested_unit_max > v_max_purchase_units
    or v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  v_mode := coalesce(nullif(p_purchase ->> 'cost_allocation_mode', ''), 'even');
  if v_mode not in ('manual', 'even', 'value_weighted') then
    raise exception using errcode = '22023', message = 'Die Kostenverteilung ist ungültig.';
  end if;

  v_purchase_type := nullif(p_purchase ->> 'type', '');
  if v_purchase_type not in ('single', 'mystery_pack', 'lot', 'pallet') then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'source_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '') is not null
      and (p_purchase ->> 'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;
  v_source_id := nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '')::uuid;
  if v_source_id is not null and not exists (
    select 1
    from public.sources as source
    where source.workspace_id = p_workspace_id
      and source.id = v_source_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'supplier_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '') is not null
      and (p_purchase ->> 'supplier_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
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
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;

  -- Validate the purchase-type contract before the purchase header is written.
  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    if v_line ? 'is_package' and pg_catalog.jsonb_typeof(v_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
    end if;
    v_catalog_product_id := case
      when coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null') = 'null'
        then null
      else (v_line ->> 'catalog_product_id')::uuid
    end;
    if (v_line ->> 'line_kind' = 'quantity' and v_catalog_product_id is null)
      or (v_line ->> 'line_kind' = 'individual' and v_catalog_product_id is not null)
      or (
        v_catalog_product_id is not null
        and not exists (
          select 1
          from public.catalog_products as product
          where product.workspace_id = p_workspace_id
            and product.id = v_catalog_product_id
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    if v_line ? 'condition_snapshot'
      and coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null') <> 'null'
      and (
        pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot') <> 'string'
        or v_line ->> 'condition_snapshot' not in (
          'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Der Zustand einer Einkaufsposition ist ungültig.';
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value') = 'number'
        and (
          (v_line ->> 'estimated_market_value')::numeric < 0
          or pg_catalog.scale((v_line ->> 'estimated_market_value')::numeric) > 2
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Der geschätzte Marktwert muss centgenau und darf nicht negativ sein.';
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost') = 'number'
        and (
          (v_line ->> 'allocated_additional_cost')::numeric < 0
          or pg_catalog.scale((v_line ->> 'allocated_additional_cost')::numeric) > 2
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.';
    end if;

    if coalesce(p_purchase ->> 'pricing_mode', case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
      if coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') <> 'unpriced_mystery'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') <> 'null'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') <> 'null' then
        raise exception using
          errcode = '22023',
          message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
      end if;
    elsif not (
      (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'open'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
      )
      or (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'priced'
        and pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price') = 'number'
        and pg_catalog.jsonb_typeof(v_line -> 'line_total') = 'number'
        and (v_line ->> 'unit_purchase_price')::numeric >= 0
        and (v_line ->> 'line_total')::numeric >= 0
        and pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) <= 16
        and pg_catalog.scale((v_line ->> 'line_total')::numeric) <= 2
        and (v_line ->> 'line_total')::numeric = pg_catalog.round(
          (v_line ->> 'ordered_quantity')::integer
          * (v_line ->> 'unit_purchase_price')::numeric,
          2
        )
      )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
    end if;
  end loop;

  if coalesce(
    p_purchase ->> 'pricing_mode',
    case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end
  ) = 'individual'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_lines) as line(value)
      where coalesce(nullif(line.value ->> 'price_mode', ''), 'priced') = 'open'
    )
    and coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null') <> 'null' then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf mit offenen Positionspreisen darf keinen Warenbetrag enthalten.';
  end if;

  insert into public.purchases (
    workspace_id, source_id, supplier_id, type, title, purchase_date,
    purchase_price, cost_allocation_mode, notes, tracking_number,
    tracking_carrier, tracking_status, receiving_status,
    content_status, pricing_mode, supplier_reference, request_id, discount_amount,
    seller_type, seller_name, seller_street, seller_address_extra,
    seller_postal_code, seller_city, seller_country_code
  ) values (
    p_workspace_id,
    v_source_id,
    v_supplier_id,
    v_purchase_type,
    coalesce(btrim(p_purchase ->> 'title'), ''),
    (p_purchase ->> 'purchase_date')::date,
    (p_purchase ->> 'purchase_price')::numeric,
    v_mode,
    nullif(btrim(p_purchase ->> 'notes'), ''),
    nullif(btrim(p_purchase ->> 'tracking_number'), ''),
    nullif(p_purchase ->> 'tracking_carrier', ''),
    coalesce(nullif(p_purchase ->> 'tracking_status', ''), 'pending'),
    'draft',
    coalesce(p_purchase ->> 'content_status', 'known'),
    p_purchase ->> 'pricing_mode',
    nullif(btrim(p_purchase ->> 'supplier_reference'), ''),
    nullif(p_purchase ->> 'request_id', '')::uuid,
    coalesce((p_purchase ->> 'discount_amount')::numeric, 0),
    v_seller_details ->> 'seller_type',
    v_seller_details ->> 'seller_name',
    v_seller_details ->> 'seller_street',
    v_seller_details ->> 'seller_address_extra',
    v_seller_details ->> 'seller_postal_code',
    v_seller_details ->> 'seller_city',
    v_seller_details ->> 'seller_country_code'
  ) returning * into v_purchase;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_ref := nullif(pg_catalog.btrim(v_line ->> 'client_ref'), '');
    if v_line_ref is not null and v_line_refs ? v_line_ref then
      raise exception using errcode = '22023', message = 'Einkaufspositionen benötigen eindeutige Entwurfskennungen.';
    end if;

    insert into public.purchase_lines (
      is_package,
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      ean_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost, price_mode, condition_snapshot,
      estimated_market_value
    ) values (
      coalesce((v_line ->> 'is_package')::boolean, false),
      p_workspace_id,
      v_purchase.id,
      nullif(v_line ->> 'catalog_product_id', '')::uuid,
      btrim(v_line ->> 'title_snapshot'),
      nullif(btrim(v_line ->> 'ean_snapshot'), ''),
      v_line ->> 'line_kind',
      (v_line ->> 'ordered_quantity')::integer,
      0,
      (v_line ->> 'unit_purchase_price')::numeric,
      (v_line ->> 'line_total')::numeric,
      case when v_mode = 'manual'
        then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
        else 0
      end,
      coalesce(nullif(v_line ->> 'price_mode', ''), 'priced'),
      nullif(v_line ->> 'condition_snapshot', ''),
      (v_line ->> 'estimated_market_value')::numeric
    ) returning id into v_line_id;
    v_line_ids := array_append(v_line_ids, v_line_id);
    if v_line_ref is not null then
      v_line_refs := pg_catalog.jsonb_set(
        v_line_refs,
        array[v_line_ref],
        pg_catalog.to_jsonb(v_line_id::text),
        true
      );
    end if;
  end loop;

  for v_expense in select value from jsonb_array_elements(p_expenses) loop
    if coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted') = 'direct' then
      v_line_ref := nullif(pg_catalog.btrim(v_expense ->> 'target_purchase_line_ref'), '');
      if v_line_ref is null or not (v_line_refs ? v_line_ref) then
        raise exception using errcode = '22023', message = 'Die direkte Kostenzuordnung verweist auf keine Einkaufsposition.';
      end if;
      v_target_line_id := (v_line_refs ->> v_line_ref)::uuid;
    else
      v_target_line_id := null;
    end if;

    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, description,
      allocation_method, target_purchase_line_id, tax_treatment
    ) values (
      p_workspace_id,
      v_purchase.id,
      coalesce(nullif(btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(btrim(v_expense ->> 'description'), ''),
      coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted'),
      v_target_line_id,
      v_expense ->> 'tax_treatment'
    );
  end loop;

  select coalesce(round(sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.purchase_id = v_purchase.id;

  if cardinality(v_line_ids) = 0 or v_purchase.content_status = 'unknown' then
    null;
  elsif v_mode = 'manual' then
    select coalesce(round(sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using errcode = '22023', message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
    end if;
  elsif v_total_expense_cents > 0 then
    with weights as (
      select
        line.id,
        ids.ordinality,
        case
          when v_mode = 'value_weighted' and totals.value_total > 0 then line.line_total
          else line.ordered_quantity::numeric
        end as weight
      from unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
      cross join (
        select sum(candidate.line_total) as value_total
        from public.purchase_lines as candidate
        where candidate.id = any(v_line_ids)
      ) as totals
    ), shares as (
      select
        weights.*,
        v_total_expense_cents::numeric * weight / nullif(sum(weight) over (), 0) as exact_cents
      from weights
    ), ranked as (
      select
        shares.*,
        floor(exact_cents)::bigint as floor_cents,
        row_number() over (order by exact_cents - floor(exact_cents) desc, ordinality) as remainder_rank,
        v_total_expense_cents - sum(floor(exact_cents)::bigint) over () as remainder_cents
      from shares
    )
    update public.purchase_lines as line
    set allocated_additional_cost = (
      ranked.floor_cents + case when ranked.remainder_rank <= ranked.remainder_cents then 1 else 0 end
    )::numeric / 100
    from ranked
    where line.id = ranked.id;
  end if;

  v_audit_after := public.purchase_draft_audit_snapshot(p_workspace_id, v_purchase.id);
  insert into public.business_events (
    workspace_id, entity_type, entity_id, event_type, actor_id, changes
  ) values (
    p_workspace_id, 'purchase', v_purchase.id, 'purchase_draft_created', (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object('before', null, 'after', v_audit_after -> 'purchase'),
      'lines', pg_catalog.jsonb_build_object('before', null, 'after', v_audit_after -> 'lines'),
      'costs', pg_catalog.jsonb_build_object('before', null, 'after', v_audit_after -> 'costs')
    )
  );

  return jsonb_build_object(
    'purchase', to_jsonb(v_purchase),
    'purchase_costs', coalesce((
      select jsonb_agg(to_jsonb(cost) order by cost.created_at, cost.id)
      from public.purchase_costs as cost where cost.purchase_id = v_purchase.id
    ), '[]'::jsonb),
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(line) order by ids.ordinality)
      from unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
    ), '[]'::jsonb)
  );
end;
$$;


create or replace function public.update_purchase_draft(
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
  v_purchase public.purchases;
  v_existing_line public.purchase_lines;
  v_line jsonb;
  v_expense jsonb;
  v_line_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_refs jsonb := '{}'::jsonb;
  v_line_ref text;
  v_catalog_product_id uuid;
  v_target_line_id uuid;
  v_source_id uuid;
  v_supplier_id uuid;
  v_purchase_type text;
  v_mode text;
  v_total_expense_cents bigint;
  v_manual_cents bigint;
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_audit_before jsonb;
  v_audit_after jsonb;
  v_seller_details jsonb := public.normalize_purchase_seller_details(p_purchase);
  v_seller_details_before jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or pg_catalog.jsonb_typeof(p_purchase) <> 'object'
    or pg_catalog.jsonb_typeof(p_expenses) <> 'array'
    or pg_catalog.jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null')
      not in ('null', 'number')
    or (
      pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price') = 'number'
      and (
        (p_purchase ->> 'purchase_price')::numeric < 0
        or pg_catalog.scale((p_purchase ->> 'purchase_price')::numeric) > 2
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Kaufpreis muss centgenau und darf nicht negativ sein.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status = 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Nur ein nicht finalisierter Einkaufsentwurf kann bearbeitet werden.';
  end if;

  v_seller_details_before := public.purchase_seller_details_snapshot(v_purchase);
  v_audit_before := public.purchase_draft_audit_snapshot(p_workspace_id, p_purchase_id);

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  select
    coalesce(pg_catalog.max(candidate.quantity), 0),
    coalesce(pg_catalog.sum(candidate.quantity), 0)
  into v_requested_unit_max, v_requested_unit_total
  from (
    select case
      when pg_catalog.jsonb_typeof(element.value) = 'object'
        and pg_catalog.jsonb_typeof(element.value -> 'ordered_quantity') = 'number'
        and element.value ->> 'ordered_quantity' ~ '^[1-9][0-9]*$'
      then (element.value ->> 'ordered_quantity')::numeric
      else null
    end as quantity
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  ) as candidate;

  if v_requested_unit_max > v_max_purchase_units
    or v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  v_purchase_type := nullif(p_purchase ->> 'type', '');
  v_mode := coalesce(nullif(p_purchase ->> 'cost_allocation_mode', ''), 'even');
  if v_purchase_type not in ('single', 'mystery_pack', 'lot', 'pallet')
    or v_mode not in ('manual', 'even', 'value_weighted') then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'source_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '') is not null
      and (p_purchase ->> 'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;
  v_source_id := nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '')::uuid;
  if v_source_id is not null and not exists (
    select 1
    from public.sources as source
    where source.workspace_id = p_workspace_id
      and source.id = v_source_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'supplier_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '') is not null
      and (p_purchase ->> 'supplier_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
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
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;

  if coalesce(
    p_purchase ->> 'pricing_mode',
    case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end
  ) = 'individual'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_lines) as line(value)
      where coalesce(nullif(line.value ->> 'price_mode', ''), 'priced') = 'open'
    ) then
    if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null') <> 'null' then
      raise exception using
        errcode = '22023',
        message = 'Ein Einkauf mit offenen Positionspreisen darf keinen Warenbetrag enthalten.';
    end if;

    if exists (
      select 1
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.purchase_id = p_purchase_id
        and (
          line.received_quantity > 0
          or exists (
            select 1
            from public.inventory_items as item
            where item.workspace_id = p_workspace_id
              and item.purchase_line_id = line.id
          )
          or exists (
            select 1
            from public.stock_lots as lot
            where lot.workspace_id = p_workspace_id
              and lot.purchase_line_id = line.id
          )
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Offene Einkaufspreise können nicht bei bereits übernommenem Bestand gespeichert werden.';
    end if;
  end if;

  for v_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  loop
    if v_line ? 'is_package' and pg_catalog.jsonb_typeof(v_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
    end if;
    v_line_ref := nullif(pg_catalog.btrim(v_line ->> 'client_ref'), '');
    if pg_catalog.jsonb_typeof(v_line) <> 'object'
      or v_line_ref is null
      or v_line_refs ? v_line_ref
      or pg_catalog.jsonb_typeof(v_line -> 'title_snapshot') <> 'string'
      or nullif(pg_catalog.btrim(v_line ->> 'title_snapshot'), '') is null
      or pg_catalog.jsonb_typeof(v_line -> 'line_kind') <> 'string'
      or v_line ->> 'line_kind' not in ('quantity', 'individual')
      or pg_catalog.jsonb_typeof(v_line -> 'ordered_quantity') <> 'number'
      or (v_line ->> 'ordered_quantity') !~ '^[1-9][0-9]*$'
      or coalesce(nullif(v_line ->> 'price_mode', ''), 'priced')
        not in ('priced', 'open', 'unpriced_mystery')
      or coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null')
        not in ('null', 'string')
      or coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null')
        not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot') = 'string'
        and v_line ->> 'condition_snapshot' not in (
          'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
        )
      )
      or coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value') = 'number'
        and (
          (v_line ->> 'estimated_market_value')::numeric < 0
          or pg_catalog.scale((v_line ->> 'estimated_market_value')::numeric) > 2
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    if v_mode = 'manual' and (
      coalesce(pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost') = 'number'
        and (
          (v_line ->> 'allocated_additional_cost')::numeric < 0
          or pg_catalog.scale((v_line ->> 'allocated_additional_cost')::numeric) > 2
        )
      )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.';
    end if;

    if coalesce(p_purchase ->> 'pricing_mode', case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
      if coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') <> 'unpriced_mystery'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') <> 'null'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') <> 'null' then
        raise exception using
          errcode = '22023',
          message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
      end if;
    elsif not (
      (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'open'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
      )
      or (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'priced'
        and pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price') = 'number'
        and pg_catalog.jsonb_typeof(v_line -> 'line_total') = 'number'
        and (v_line ->> 'unit_purchase_price')::numeric >= 0
        and (v_line ->> 'line_total')::numeric >= 0
        and pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) <= 16
        and pg_catalog.scale((v_line ->> 'line_total')::numeric) <= 2
        and (v_line ->> 'line_total')::numeric = pg_catalog.round(
          (v_line ->> 'ordered_quantity')::integer
          * (v_line ->> 'unit_purchase_price')::numeric,
          2
        )
      )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
    end if;

    v_catalog_product_id := case
      when coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null') = 'null'
        then null
      else (v_line ->> 'catalog_product_id')::uuid
    end;
    if (v_line ->> 'line_kind' = 'quantity' and v_catalog_product_id is null)
      or (v_line ->> 'line_kind' = 'individual' and v_catalog_product_id is not null)
      or (
        v_catalog_product_id is not null
        and not exists (
          select 1
          from public.catalog_products as product
          where product.workspace_id = p_workspace_id
            and product.id = v_catalog_product_id
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    v_existing_line := null;
    if v_line_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select line.*
      into v_existing_line
      from public.purchase_lines as line
      where line.id = v_line_ref::uuid
      for update;

      if found and (
        v_existing_line.workspace_id <> p_workspace_id
        or v_existing_line.purchase_id <> p_purchase_id
      ) then
        raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
      end if;
    end if;

    if v_existing_line.id is not null then
      if (
        v_existing_line.received_quantity > 0
        or exists (
          select 1
          from public.inventory_items as item
          where item.workspace_id = p_workspace_id
            and item.purchase_line_id = v_existing_line.id
        )
        or exists (
          select 1
          from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_line_id = v_existing_line.id
        )
      ) and (
        v_existing_line.line_kind <> v_line ->> 'line_kind'
        or v_existing_line.ordered_quantity <> (v_line ->> 'ordered_quantity')::integer
        or v_existing_line.catalog_product_id is distinct from v_catalog_product_id
      ) then
        raise exception using
          errcode = '22023',
          message = 'Bereits erfasste Einkaufspositionen dürfen strukturell nicht verändert werden.';
      end if;

      update public.purchase_lines
      set is_package = coalesce((v_line ->> 'is_package')::boolean, is_package),
          catalog_product_id = v_catalog_product_id,
          title_snapshot = pg_catalog.btrim(v_line ->> 'title_snapshot'),
          ean_snapshot = case
            when v_line ? 'ean_snapshot'
              then nullif(pg_catalog.btrim(v_line ->> 'ean_snapshot'), '')
            else v_existing_line.ean_snapshot
          end,
          line_kind = v_line ->> 'line_kind',
          ordered_quantity = (v_line ->> 'ordered_quantity')::integer,
          price_mode = coalesce(nullif(v_line ->> 'price_mode', ''), 'priced'),
          unit_purchase_price = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
              then null
            else (v_line ->> 'unit_purchase_price')::numeric
          end,
          line_total = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
              then null
            else (v_line ->> 'line_total')::numeric
          end,
          allocated_additional_cost = case
            when v_mode = 'manual'
              then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
            else 0
          end,
          condition_snapshot = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null') = 'null'
              then null
            else v_line ->> 'condition_snapshot'
          end,
          estimated_market_value = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null') = 'null'
              then null
            else (v_line ->> 'estimated_market_value')::numeric
          end,
          updated_at = pg_catalog.clock_timestamp()
      where id = v_existing_line.id
      returning id into v_line_id;
    else
      insert into public.purchase_lines (
        is_package,
        workspace_id, purchase_id, catalog_product_id, title_snapshot,
        ean_snapshot,
        line_kind, ordered_quantity, received_quantity, unit_purchase_price,
        line_total, allocated_additional_cost, price_mode, condition_snapshot,
        estimated_market_value
      ) values (
        coalesce((v_line ->> 'is_package')::boolean, false),
        p_workspace_id,
        p_purchase_id,
        v_catalog_product_id,
        pg_catalog.btrim(v_line ->> 'title_snapshot'),
        nullif(pg_catalog.btrim(v_line ->> 'ean_snapshot'), ''),
        v_line ->> 'line_kind',
        (v_line ->> 'ordered_quantity')::integer,
        0,
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
            then null
          else (v_line ->> 'unit_purchase_price')::numeric
        end,
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
            then null
          else (v_line ->> 'line_total')::numeric
        end,
        case when v_mode = 'manual'
          then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
          else 0
        end,
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced'),
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null') = 'null'
            then null
          else v_line ->> 'condition_snapshot'
        end,
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null') = 'null'
            then null
          else (v_line ->> 'estimated_market_value')::numeric
        end
      ) returning id into v_line_id;
    end if;

    v_line_ids := pg_catalog.array_append(v_line_ids, v_line_id);
    v_line_refs := pg_catalog.jsonb_set(
      v_line_refs,
      array[v_line_ref],
      pg_catalog.to_jsonb(v_line_id::text),
      true
    );
  end loop;

  if exists (
    select 1
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and line.id <> all(v_line_ids)
      and (
        line.received_quantity > 0
        or exists (
          select 1 from public.inventory_items as item
          where item.workspace_id = p_workspace_id
            and item.purchase_line_id = line.id
        )
        or exists (
          select 1 from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_line_id = line.id
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Bereits erfasste Einkaufspositionen dürfen nicht entfernt werden.';
  end if;

  delete from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  delete from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
    and line.id <> all(v_line_ids);

  for v_expense in
    select element.value
    from pg_catalog.jsonb_array_elements(p_expenses) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_expense) <> 'object'
      or pg_catalog.jsonb_typeof(v_expense -> 'amount') <> 'number'
      or (v_expense ->> 'amount')::numeric <= 0
      or pg_catalog.scale((v_expense ->> 'amount')::numeric) > 2
      or coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted')
        not in ('direct', 'quantity', 'value_weighted') then
      raise exception using errcode = '22023', message = 'Zusatzkosten sind ungültig.';
    end if;

    if coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted') = 'direct' then
      v_line_ref := nullif(pg_catalog.btrim(v_expense ->> 'target_purchase_line_ref'), '');
      if v_line_ref is null or not (v_line_refs ? v_line_ref) then
        raise exception using
          errcode = '22023',
          message = 'Die direkte Kostenzuordnung verweist auf keine Einkaufsposition.';
      end if;
      v_target_line_id := (v_line_refs ->> v_line_ref)::uuid;
    else
      v_target_line_id := null;
    end if;

    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, description,
      allocation_method, target_purchase_line_id, tax_treatment
    ) values (
      p_workspace_id,
      p_purchase_id,
      coalesce(nullif(pg_catalog.btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(pg_catalog.btrim(v_expense ->> 'description'), ''),
      coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted'),
      v_target_line_id,
      v_expense ->> 'tax_treatment'
    );
  end loop;

  select coalesce(pg_catalog.round(pg_catalog.sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  if pg_catalog.cardinality(v_line_ids) = 0 then
    null;
  elsif v_mode = 'manual' then
    select coalesce(pg_catalog.round(pg_catalog.sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using
        errcode = '22023',
        message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
    end if;
  elsif v_total_expense_cents > 0 then
    with weights as (
      select
        line.id,
        ids.ordinality,
        case
          when v_mode = 'value_weighted' and totals.value_total > 0 then line.line_total
          else line.ordered_quantity::numeric
        end as weight
      from pg_catalog.unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
      cross join (
        select pg_catalog.sum(candidate.line_total) as value_total
        from public.purchase_lines as candidate
        where candidate.id = any(v_line_ids)
      ) as totals
    ), shares as (
      select
        weights.*,
        v_total_expense_cents::numeric * weight
          / nullif(pg_catalog.sum(weight) over (), 0) as exact_cents
      from weights
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

  update public.purchases
  set source_id = v_source_id,
      supplier_id = v_supplier_id,
      content_status = coalesce(p_purchase ->> 'content_status', v_purchase.content_status),
      pricing_mode = coalesce(p_purchase ->> 'pricing_mode', v_purchase.pricing_mode),
      supplier_reference = nullif(btrim(p_purchase ->> 'supplier_reference'), ''),
      discount_amount = coalesce((p_purchase ->> 'discount_amount')::numeric, 0),
      type = v_purchase_type,
      title = coalesce(pg_catalog.btrim(p_purchase ->> 'title'), ''),
      purchase_date = (p_purchase ->> 'purchase_date')::date,
      purchase_price = (p_purchase ->> 'purchase_price')::numeric,
      cost_allocation_mode = v_mode,
      notes = nullif(pg_catalog.btrim(p_purchase ->> 'notes'), ''),
      tracking_number = nullif(pg_catalog.btrim(p_purchase ->> 'tracking_number'), ''),
      tracking_carrier = nullif(p_purchase ->> 'tracking_carrier', ''),
      tracking_status = coalesce(nullif(p_purchase ->> 'tracking_status', ''), 'pending'),
      seller_type = v_seller_details ->> 'seller_type',
      seller_name = v_seller_details ->> 'seller_name',
      seller_street = v_seller_details ->> 'seller_street',
      seller_address_extra = v_seller_details ->> 'seller_address_extra',
      seller_postal_code = v_seller_details ->> 'seller_postal_code',
      seller_city = v_seller_details ->> 'seller_city',
      seller_country_code = v_seller_details ->> 'seller_country_code',
      updated_at = pg_catalog.clock_timestamp()
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning * into v_purchase;

  -- Ein offener Nachtragsdialog soll einen zwischenzeitlich gespeicherten Entwurf
  -- nicht überschreiben; deshalb zählt auch dieser Weg die Version hoch.
  if public.purchase_seller_details_snapshot(v_purchase) is distinct from v_seller_details_before then
    update public.purchases
    set seller_details_version = seller_details_version + 1
    where workspace_id = p_workspace_id
      and id = p_purchase_id
    returning * into v_purchase;
  end if;

  v_audit_after := public.purchase_draft_audit_snapshot(p_workspace_id, p_purchase_id);
  if v_audit_before is distinct from v_audit_after then
    insert into public.business_events (
      workspace_id, entity_type, entity_id, event_type, actor_id, changes
    ) values (
      p_workspace_id, 'purchase', p_purchase_id, 'purchase_draft_updated', (select auth.uid()),
      pg_catalog.jsonb_build_object(
        'purchase', pg_catalog.jsonb_build_object('before', v_audit_before -> 'purchase', 'after', v_audit_after -> 'purchase'),
        'lines', pg_catalog.jsonb_build_object('before', v_audit_before -> 'lines', 'after', v_audit_after -> 'lines'),
        'costs', pg_catalog.jsonb_build_object('before', v_audit_before -> 'costs', 'after', v_audit_after -> 'costs')
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'purchase', pg_catalog.to_jsonb(v_purchase),
    'purchase_costs', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cost) order by cost.created_at, cost.id)
      from public.purchase_costs as cost
      where cost.workspace_id = p_workspace_id
        and cost.purchase_id = p_purchase_id
    ), '[]'::jsonb),
    'purchase_lines', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) order by ids.ordinality)
      from pg_catalog.unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
    ), '[]'::jsonb)
  );
end;
$$;


create or replace function public.receive_purchase_lines(
  p_workspace_id uuid,
  p_purchase_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input_line jsonb;
  v_purchase public.purchases;
  v_purchase_line public.purchase_lines;
  v_stock_lot public.stock_lots;
  v_purchase_line_id uuid;
  v_received_quantity integer;
  v_received_at timestamptz;
  v_purchase_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'Die Wareneingangsdaten sind ungültig.';
  end if;

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  for v_input_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_input_line) <> 'object'
      or pg_catalog.jsonb_typeof(v_input_line -> 'purchase_line_id') <> 'string'
      or pg_catalog.jsonb_typeof(v_input_line -> 'received_quantity') <> 'number'
      or (v_input_line ->> 'received_quantity') !~ '^[1-9][0-9]*$'
      or pg_catalog.jsonb_typeof(v_input_line -> 'received_at') <> 'string' then
      raise exception using errcode = '22023', message = 'Eine Wareneingangsposition ist ungültig.';
    end if;

    begin
      v_received_at := (v_input_line ->> 'received_at')::timestamptz;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'Eine Wareneingangsposition ist ungültig.';
    end;

    if not pg_catalog.isfinite(v_received_at) then
      raise exception using
        errcode = '22023',
        message = 'Der Empfangszeitpunkt muss ein endlicher Zeitpunkt sein.';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if v_purchase.entry_status = 'finalized' then
    raise exception using errcode = '22023', message = 'Finalisierte Einkäufe können keinen weiteren Wareneingang erhalten.';
  end if;
  if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor dem Wareneingang ergänzt werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_max_line_units > v_max_purchase_units
    or v_total_units > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'purchase_line_id') <> 'string'
      or jsonb_typeof(v_input_line -> 'received_quantity') <> 'number'
      or (v_input_line ->> 'received_quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'received_at') <> 'string' then
      raise exception using errcode = '22023', message = 'Eine Wareneingangsposition ist ungültig.';
    end if;

    v_purchase_line_id := (v_input_line ->> 'purchase_line_id')::uuid;
    v_received_quantity := (v_input_line ->> 'received_quantity')::integer;
    v_received_at := (v_input_line ->> 'received_at')::timestamptz;

    select * into v_purchase_line
    from public.purchase_lines
    where id = v_purchase_line_id
      and workspace_id = p_workspace_id
      and purchase_id = p_purchase_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Die Einkaufsposition wurde nicht gefunden.';
    end if;

    if v_purchase_line.line_kind = 'individual' then
      raise exception using errcode = '22023', message = 'Einzelartikel werden über den expliziten Einzelartikelpfad eingebucht.';
    end if;

    if v_purchase_line.line_kind <> 'quantity'
      or v_purchase_line.catalog_product_id is null
      or not exists (
        select 1
        from public.catalog_products as product
        where product.workspace_id = p_workspace_id
          and product.id = v_purchase_line.catalog_product_id
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufsposition ist keinem gültigen Mengenprodukt zugeordnet.';
    end if;

    if v_purchase_line.received_quantity + v_received_quantity > v_purchase_line.ordered_quantity then
      raise exception using errcode = '22023', message = 'Die empfangene Menge überschreitet die bestellte Menge.';
    end if;

    update public.purchase_lines
    set received_quantity = received_quantity + v_received_quantity,
        updated_at = now()
    where id = v_purchase_line.id
      and workspace_id = p_workspace_id
    returning * into v_purchase_line;

    insert into public.stock_lots (
      workspace_id,
      purchase_id,
      purchase_line_id,
      catalog_product_id,
      received_quantity,
      remaining_quantity,
      unit_cost,
      received_at
    ) values (
      p_workspace_id,
      p_purchase_id,
      v_purchase_line.id,
      v_purchase_line.catalog_product_id,
      v_received_quantity,
      v_received_quantity,
      null,
      v_received_at
    )
    returning * into v_stock_lot;

    insert into public.stock_movements (
      workspace_id,
      stock_lot_id,
      direction,
      quantity,
      reason
    ) values (
      p_workspace_id,
      v_stock_lot.id,
      'in',
      v_received_quantity,
      'receipt'
    );

    v_purchase_line_ids := array_append(v_purchase_line_ids, v_purchase_line.id);
    v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);
  end loop;

  perform public.refresh_purchase_receiving_status(p_workspace_id, p_purchase_id);

  return jsonb_build_object(
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(purchase_line) order by purchase_line.id)
      from public.purchase_lines as purchase_line
      where purchase_line.id = any(v_purchase_line_ids)
    ), '[]'::jsonb),
    'stock_lots', coalesce((
      select jsonb_agg(to_jsonb(stock_lot) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb)
  );
end;
$$;


create or replace function public.receive_individual_purchase_line(
  p_workspace_id uuid,
  p_purchase_id uuid,
  p_purchase_line_id uuid,
  p_item jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_purchase_line public.purchase_lines;
  v_inventory_item public.inventory_items;
  v_title text;
  v_condition text;
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or p_purchase_line_id is null
    or jsonb_typeof(p_item) <> 'object'
    or jsonb_typeof(p_item -> 'title') <> 'string' then
    raise exception using errcode = '22023', message = 'Die Einzelartikel-Wareneingangsdaten sind ungültig.';
  end if;

  v_title := btrim(p_item ->> 'title');
  if v_title = '' then
    raise exception using errcode = '22023', message = 'Die Einzelartikel-Wareneingangsdaten sind ungültig.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if v_purchase.entry_status = 'finalized' then
    raise exception using errcode = '22023', message = 'Finalisierte Einkäufe können keinen weiteren Wareneingang erhalten.';
  end if;
  if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor dem Wareneingang ergänzt werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_max_line_units > v_max_purchase_units
    or v_total_units > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  select * into v_purchase_line
  from public.purchase_lines
  where id = p_purchase_line_id
    and workspace_id = p_workspace_id
    and purchase_id = p_purchase_id
  for update;
  if not found
    or v_purchase_line.is_package
    or v_purchase_line.line_kind <> 'individual'
    or v_purchase_line.received_quantity >= v_purchase_line.ordered_quantity then
    raise exception using errcode = '22023', message = 'Die Einzelartikelposition ist nicht offen.';
  end if;

  v_condition := case
    when v_purchase_line.condition_snapshot in (
      'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
    ) then v_purchase_line.condition_snapshot
    else 'used'
  end;

  insert into public.inventory_items (
    workspace_id, purchase_id, purchase_line_id, title, ean, condition, status,
    allocated_purchase_cost, expected_value
  ) values (
    p_workspace_id, p_purchase_id, p_purchase_line_id, v_title, v_purchase_line.ean_snapshot, v_condition, 'received',
    0, v_purchase_line.estimated_market_value
  ) returning * into v_inventory_item;

  update public.purchase_lines
  set received_quantity = received_quantity + 1, updated_at = now()
  where id = p_purchase_line_id
    and workspace_id = p_workspace_id
    and purchase_id = p_purchase_id
    and received_quantity < ordered_quantity
  returning * into v_purchase_line;

  if not found then
    raise exception using errcode = '22023', message = 'Die Einzelartikelposition ist nicht offen.';
  end if;

  v_purchase := public.refresh_purchase_receiving_status(p_workspace_id, p_purchase_id);
  return jsonb_build_object(
    'purchase_line', to_jsonb(v_purchase_line),
    'inventory_item', to_jsonb(v_inventory_item),
    'purchase', to_jsonb(v_purchase)
  );
end;
$$;


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

  if p_status = 'arrived'
    and public.purchase_has_open_prices(v_before.workspace_id, v_before.id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor der Ankunft ergänzt werden.';
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
    if v_before.receiving_status not in ('ordered', 'partially_received', 'received') then
      raise exception using errcode = '22023', message = 'Nur ein bestellter oder empfangener Einkauf kann ankommen.';
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


create or replace function public.capture_purchase_package_contents(
  p_workspace_id uuid, p_purchase_line_id uuid, p_items jsonb, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_purchase public.purchases;
  v_line public.purchase_lines;
  v_previous public.purchase_package_capture_requests;
  v_item jsonb;
  v_inventory public.inventory_items;
  v_items jsonb := '[]'::jsonb;
  v_response jsonb;
  v_purchase_id uuid;
  v_archived_at timestamptz;
begin
  if v_actor_id is null or p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_purchase_line_id is null or p_request_id is null
    or pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Paketposition, Request-ID und Inhaltsliste sind erforderlich.';
  end if;
  if pg_catalog.jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Bitte zwischen einem und 100 Artikeln erfassen.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'package:' || p_workspace_id::text || ':' || p_request_id::text, 0));
  select * into v_previous from public.purchase_package_capture_requests
    where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if v_previous.purchase_line_id is distinct from p_purchase_line_id or v_previous.request_items is distinct from p_items then
      raise exception using errcode = '22023', message = 'Die Request-ID wurde bereits für eine andere Paketerfassung verwendet.';
    end if;
    return v_previous.response;
  end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then
    raise exception using errcode = '55000', message = 'Der Workspace ist archiviert.';
  end if;
  select purchase_id into v_purchase_id from public.purchase_lines
    where workspace_id = p_workspace_id and id = p_purchase_line_id;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diese Paketposition.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_purchase_id::text, 0));
  select * into v_purchase from public.purchases
    where workspace_id = p_workspace_id and id = v_purchase_id for update;
  select * into v_line from public.purchase_lines
    where workspace_id = p_workspace_id and id = p_purchase_line_id for update;
  if v_line.id is null or not v_line.is_package or v_line.purchase_id is distinct from v_purchase.id then
    raise exception using errcode = '22023', message = 'Die Position ist kein Paket dieses Einkaufs.';
  end if;
  if v_purchase.shipment_status <> 'arrived' or v_purchase.arrived_at is null
    or v_purchase.receiving_status = 'archived' then
    raise exception using errcode = '22023', message = 'Vor der Paketerfassung muss die Ankunft bestätigt sein.';
  end if;
  if public.purchase_has_open_prices(p_workspace_id, v_purchase.id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor der Bestandsübernahme ergänzt werden.';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['title','condition','brand','model','description','expected_value']::text[] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_item -> 'title') is distinct from 'string'
      or nullif(pg_catalog.btrim(v_item ->> 'title'), '') is null
      or pg_catalog.length(v_item ->> 'title') > 300
      or pg_catalog.jsonb_typeof(v_item -> 'condition') is distinct from 'string'
      or v_item ->> 'condition' not in ('new','like_new','very_good','used','heavily_used','defective')
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'brand'),'null') not in ('null','string')
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'model'),'null') not in ('null','string')
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'description'),'null') not in ('null','string')
      or pg_catalog.length(v_item ->> 'description') > 5000
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'expected_value'),'null') not in ('null','number') then
      raise exception using errcode = '22023', message = 'Die Artikeldaten des Paketinhalts sind ungültig.';
    end if;
    if v_item ->> 'expected_value' is not null and (
      (v_item ->> 'expected_value')::numeric < 0
      or (v_item ->> 'expected_value')::numeric >= 'Infinity'::numeric
      or (v_item ->> 'expected_value')::numeric <> pg_catalog.round((v_item ->> 'expected_value')::numeric,2)
    ) then
      raise exception using errcode = '22023', message = 'Der erwartete Verkaufswert muss nichtnegativ und centgenau sein.';
    end if;
    insert into public.inventory_items (
      workspace_id, purchase_id, source_package_line_id, title, condition, brand, model, description,
      status, allocated_purchase_cost, tax_purchase_cost, expected_value, is_public_store
    ) values (
      p_workspace_id, v_purchase.id, v_line.id, pg_catalog.btrim(v_item ->> 'title'), v_item ->> 'condition',
      nullif(pg_catalog.btrim(v_item ->> 'brand'), ''), nullif(pg_catalog.btrim(v_item ->> 'model'), ''),
      nullif(pg_catalog.btrim(v_item ->> 'description'), ''),
      case when v_purchase.entry_status = 'finalized' then 'ready' else 'received' end,
      null, null, (v_item ->> 'expected_value')::numeric, false
    ) returning * into v_inventory;
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(v_inventory));
  end loop;
  update public.purchase_lines set received_quantity = 1, updated_at = statement_timestamp()
    where workspace_id = p_workspace_id and id = v_line.id returning * into v_line;
  v_response := pg_catalog.jsonb_build_object('inventory_items',v_items,'purchase_line',pg_catalog.to_jsonb(v_line));
  insert into public.business_events(workspace_id,entity_type,entity_id,event_type,actor_id,changes)
    values (p_workspace_id,'purchase',v_purchase.id,'purchase_package_contents_captured',v_actor_id,
      pg_catalog.jsonb_build_object('source_package_line_id',v_line.id,'request_id',p_request_id,'inventory_items',v_items));
  insert into public.purchase_package_capture_requests(workspace_id,purchase_line_id,request_id,request_items,response)
    values (p_workspace_id,v_line.id,p_request_id,p_items,v_response);
  return v_response;
end;
$$;

alter function public.build_purchase_costing_plan(uuid, uuid) owner to postgres;
alter function public.finalize_purchase_costing(uuid, uuid) owner to postgres;
alter function public.create_purchase(uuid, jsonb, jsonb, jsonb) owner to postgres;
alter function public.update_purchase_draft(uuid, uuid, jsonb, jsonb, jsonb) owner to postgres;
alter function public.receive_purchase_lines(uuid, uuid, jsonb) owner to postgres;
alter function public.receive_individual_purchase_line(uuid, uuid, uuid, jsonb) owner to postgres;
alter function public.update_purchase_workflow(uuid, text) owner to postgres;
alter function public.capture_purchase_package_contents(uuid, uuid, jsonb, uuid) owner to postgres;

revoke all on function public.purchase_has_open_prices(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_open_price_purchase_stock_transfer()
  from public, anon, authenticated, service_role;
