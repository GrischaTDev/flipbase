-- Steuerlicher Einkaufspreis bleibt vom betrieblichen Wareneinsatz getrennt.
-- Kein Backfill: null bezeichnet eine bislang ungeklärte Belegzuordnung.
comment on column public.purchase_costs.tax_treatment is
  'purchase_price: Gegenleistung an Warenverkäufer; expense: sonstige Kosten; null: ungeklärt.';
comment on column public.inventory_items.tax_purchase_cost is
  'Einkaufspreis für §25a ohne sonstige Kosten; null bedeutet ungeklärt.';
comment on column public.stock_lots.remaining_tax_unit_costs is
  'Centgenaue steuerliche Kosten der noch verfügbaren Einheiten in Entnahmereihenfolge; null: ungeklärt.';
comment on column public.sale_lines.tax_cost_allocations is
  'Unveränderlicher Buchungssnapshot: quantity und tax_purchase_cost (Gruppensumme) je gleichem Stückpreis.';

create or replace function public.tax_cost_allocations(p_unit_costs numeric[])
returns jsonb
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'quantity', grouped.quantity,
    'tax_purchase_cost', grouped.unit_cost * grouped.quantity
  ) order by grouped.first_position), '[]'::jsonb)
  from (
    select value as unit_cost, pg_catalog.count(*) as quantity, pg_catalog.min(ordinality) as first_position
    from pg_catalog.unnest(p_unit_costs) with ordinality as unit(value, ordinality)
    group by value
  ) as grouped;
$$;
alter function public.tax_cost_allocations(numeric[]) owner to postgres;
revoke all on function public.tax_cost_allocations(numeric[]) from public, anon, authenticated, service_role;

create or replace function public.guard_tax_cost_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'inventory_items' then
    if current_user <> 'postgres' and (
      (tg_op = 'INSERT' and new.tax_purchase_cost is not null)
      or (tg_op = 'UPDATE' and old.tax_purchase_cost is distinct from new.tax_purchase_cost)
    ) then
      raise exception using errcode = '42501', message = 'Steuerliche Einkaufspreise werden ausschließlich über die Kostenfreigabe geändert.';
    end if;
  elsif tg_table_name = 'stock_lots' then
    if new.remaining_unit_costs is not null and (
      pg_catalog.cardinality(new.remaining_unit_costs) <> new.remaining_quantity
      or exists (select 1 from pg_catalog.unnest(new.remaining_unit_costs) as value
        where value is null or value < 0 or value >= 'Infinity'::numeric or value <> pg_catalog.round(value, 2))
    ) then
      raise exception using errcode = '22023', message = 'Die betriebliche Stückkostenfolge passt nicht zum verfügbaren Bestand.';
    end if;
    if current_user <> 'postgres' and (
      (tg_op = 'INSERT' and new.remaining_unit_costs is not null)
      or (tg_op = 'UPDATE' and old.remaining_unit_costs is distinct from new.remaining_unit_costs)
    ) then
      raise exception using errcode = '42501', message = 'Stückkostenfolgen werden ausschließlich über geprüfte Geschäftsvorgänge geändert.';
    end if;
    if new.remaining_tax_unit_costs is not null and (
      pg_catalog.cardinality(new.remaining_tax_unit_costs) <> new.remaining_quantity
      or exists (select 1 from pg_catalog.unnest(new.remaining_tax_unit_costs) as value
        where value is null or value < 0 or value >= 'Infinity'::numeric or value <> pg_catalog.round(value, 2))
    ) then
      raise exception using errcode = '22023', message = 'Die steuerliche Stückkostenfolge passt nicht zum verfügbaren Bestand.';
    end if;
    if current_user <> 'postgres' and (
      (tg_op = 'INSERT' and (new.unit_tax_purchase_cost is not null or new.remaining_tax_unit_costs is not null))
      or (tg_op = 'UPDATE' and (old.unit_tax_purchase_cost is distinct from new.unit_tax_purchase_cost
        or old.remaining_tax_unit_costs is distinct from new.remaining_tax_unit_costs))
    ) then
      raise exception using errcode = '42501', message = 'Steuerliche Loskosten werden ausschließlich über geprüfte Geschäftsvorgänge geändert.';
    end if;
  else
    if tg_op = 'UPDATE' and (
      old.tax_purchase_cost is distinct from new.tax_purchase_cost
      or old.tax_cost_allocations is distinct from new.tax_cost_allocations
    ) and (
      current_user <> 'postgres'
      or old.tax_purchase_cost is not null or old.tax_cost_allocations is not null
      or old.created_at < pg_catalog.transaction_timestamp()
    ) then
      raise exception using errcode = '42501', message = 'Gebuchte steuerliche Kostensnapshots sind unveränderlich.';
    end if;
    if tg_op = 'INSERT' and current_user <> 'postgres'
      and (new.tax_purchase_cost is not null or new.tax_cost_allocations is not null) then
      raise exception using errcode = '42501', message = 'Steuerliche Kostensnapshots entstehen ausschließlich bei der Verkaufsbuchung.';
    end if;
    if (new.tax_purchase_cost is null) <> (new.tax_cost_allocations is null) then
      raise exception using errcode = '22023', message = 'Steuerlicher Einkaufspreis und Stückaufschlüsselung müssen zusammen vorliegen.';
    end if;
    if new.tax_cost_allocations is not null then
      if pg_catalog.jsonb_typeof(new.tax_cost_allocations) <> 'array' then
        raise exception using errcode = '22023', message = 'Die steuerliche Stückaufschlüsselung ist ungültig.';
      end if;
      if exists (select 1 from pg_catalog.jsonb_array_elements(new.tax_cost_allocations) as entry
        where pg_catalog.jsonb_typeof(entry -> 'quantity') is distinct from 'number'
          or coalesce(entry ->> 'quantity', '') !~ '^[1-9][0-9]*$'
          or pg_catalog.jsonb_typeof(entry -> 'tax_purchase_cost') is distinct from 'number'
          or (entry ->> 'tax_purchase_cost')::numeric < 0
          or (entry ->> 'tax_purchase_cost')::numeric <> pg_catalog.round((entry ->> 'tax_purchase_cost')::numeric, 2)
          or pg_catalog.round((entry ->> 'tax_purchase_cost')::numeric / (entry ->> 'quantity')::numeric, 2)
            <> (entry ->> 'tax_purchase_cost')::numeric / (entry ->> 'quantity')::numeric
      ) or (select coalesce(pg_catalog.sum((entry ->> 'quantity')::numeric), 0)
        from pg_catalog.jsonb_array_elements(new.tax_cost_allocations) as entry) <> new.quantity
        or (select coalesce(pg_catalog.sum((entry ->> 'tax_purchase_cost')::numeric), 0)
        from pg_catalog.jsonb_array_elements(new.tax_cost_allocations) as entry) <> new.tax_purchase_cost then
        raise exception using errcode = '22023', message = 'Die steuerliche Stückaufschlüsselung stimmt nicht mit Menge und Einkaufspreis überein.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
alter function public.guard_tax_cost_fields() owner to postgres;
revoke all on function public.guard_tax_cost_fields() from public, anon, authenticated, service_role;

create trigger protect_inventory_tax_cost
before insert or update on public.inventory_items
for each row execute function public.guard_tax_cost_fields();
create trigger protect_lot_tax_cost
before insert or update on public.stock_lots
for each row execute function public.guard_tax_cost_fields();
create trigger protect_sale_tax_cost
before insert or update on public.sale_lines
for each row execute function public.guard_tax_cost_fields();
create trigger protect_sale_lot_tax_cost
before insert or update on public.sale_line_lot_allocations
for each row execute function public.guard_tax_cost_fields();
