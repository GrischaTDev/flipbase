-- Persistiert den optionalen Positionsmarktwert beim Einzel-Wareneingang
-- und ergänzt ihn bei der Finalisierung ausschließlich für noch leere Artikelwerte.
-- Betroffen: public.receive_individual_purchase_line und public.finalize_purchase_costing.

set check_function_bodies = false;

create or replace function public.finalize_purchase_costing (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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
    on linked_line.id = item.purchase_line_id
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
      on linked_line.id = item.purchase_line_id
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or item.purchase_line_id is null
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
          line.line_kind = 'individual'
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

    if v_line.line_kind = 'individual' then
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
            condition,
            status,
            allocated_purchase_cost,
            expected_value
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.title_snapshot,
            case
              when v_line.condition_snapshot in (
                'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
              ) then v_line.condition_snapshot
              else 'used'
            end,
            'ready',
            v_unit_shares[v_item_position]::numeric / 100,
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
          pg_catalog.count(*)::integer as quantity,
          pg_catalog.min(share.ordinality) as first_position
        from pg_catalog.unnest(v_unit_shares)
          with ordinality as share(value, ordinality)
        where share.ordinality > v_unit_offset
        group by share.value
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
          received_at
        ) values (
          p_workspace_id,
          p_purchase_id,
          v_line.id,
          v_line.catalog_product_id,
          v_cohort.quantity,
          v_cohort.quantity,
          v_cohort.unit_cost_cents::numeric / 100,
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
      on linked_line.id = item.purchase_line_id
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or item.purchase_line_id is null
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
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and (
        line.received_quantity <> line.ordered_quantity
        or line.allocated_additional_cost > line.allocated_total_cost
        or (
          line.line_kind = 'individual'
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
  )::bigint
  into v_inventory_cents;

  if v_inventory_cents <> v_total_cents then
    raise exception using
      errcode = 'P0001',
      message = 'Der gesamte Einkaufsbestand reconciliiert nicht mit den Einkaufsgesamtkosten.';
  end if;

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
$function$;

create or replace function public.receive_individual_purchase_line (
  p_workspace_id     uuid,
  p_purchase_id      uuid,
  p_purchase_line_id uuid,
  p_item             jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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
    workspace_id, purchase_id, purchase_line_id, title, condition, status,
    allocated_purchase_cost, expected_value
  ) values (
    p_workspace_id, p_purchase_id, p_purchase_line_id, v_title, v_condition, 'received',
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
$function$;
