-- Freie Verkäufe: wiederholsichere Buchung und unveränderliche Korrekturbezüge.
create table public.sale_booking_requests (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_key uuid not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, booking_key)
);
comment on table public.sale_booking_requests is 'Bestätigte Antworten für wiederholte Verkaufs- und Erstattungsbuchungen.';
create table public.sale_corrections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  original_sale_id uuid not null references public.sales(id) on delete restrict unique,
  replacement_sale_id uuid not null references public.sales(id) on delete restrict unique,
  document jsonb,
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);
comment on table public.sale_corrections is 'Dauerhafte Beziehung zwischen aufgehobenem freien Verkauf und Ersatzverkauf.';
create index sale_corrections_workspace_idx on public.sale_corrections(workspace_id);
alter table public.sale_booking_requests enable row level security;
revoke all on public.sale_booking_requests from public, anon, authenticated, service_role;
grant select on public.sale_booking_requests to authenticated;
create policy "sale_booking_requests anon select" on public.sale_booking_requests for select to anon using (false);
create policy "sale_booking_requests anon insert" on public.sale_booking_requests for insert to anon with check (false);
create policy "sale_booking_requests anon update" on public.sale_booking_requests for update to anon using (false) with check (false);
create policy "sale_booking_requests anon delete" on public.sale_booking_requests for delete to anon using (false);
create policy "sale_booking_requests authenticated select" on public.sale_booking_requests for select to authenticated using ((select public.can_access_workspace(workspace_id)));
create policy "sale_booking_requests authenticated insert" on public.sale_booking_requests for insert to authenticated with check (false);
create policy "sale_booking_requests authenticated update" on public.sale_booking_requests for update to authenticated using (false) with check (false);
create policy "sale_booking_requests authenticated delete" on public.sale_booking_requests for delete to authenticated using (false);
alter table public.sale_corrections enable row level security;
revoke all on public.sale_corrections from public, anon, authenticated, service_role;
grant select on public.sale_corrections to authenticated;
create policy "sale_corrections anon select" on public.sale_corrections for select to anon using (false);
create policy "sale_corrections anon insert" on public.sale_corrections for insert to anon with check (false);
create policy "sale_corrections anon update" on public.sale_corrections for update to anon using (false) with check (false);
create policy "sale_corrections anon delete" on public.sale_corrections for delete to anon using (false);
create policy "sale_corrections authenticated select" on public.sale_corrections for select to authenticated using ((select public.can_access_workspace(workspace_id)));
create policy "sale_corrections authenticated insert" on public.sale_corrections for insert to authenticated with check (false);
create policy "sale_corrections authenticated update" on public.sale_corrections for update to authenticated using (false) with check (false);
create policy "sale_corrections authenticated delete" on public.sale_corrections for delete to authenticated using (false);

create function public.record_sale_refund(p_workspace_id uuid, p_refund jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key uuid := (p_refund ->> 'booking_key')::uuid;
  v_request jsonb := pg_catalog.jsonb_build_object('refund', p_refund);
  v_previous jsonb;
  v_result jsonb;
begin
  if (select auth.uid()) is null or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if v_key is null then
    raise exception using errcode = '22023', message = 'Die Buchungskennung fehlt.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || v_key::text, 0));
  select request, result into v_previous, v_result from public.sale_booking_requests
    where workspace_id = p_workspace_id and booking_key = v_key;
  if found then
    if v_previous is distinct from v_request then
      raise exception using errcode = '22023', message = 'Die Buchungskennung gehört zu anderen Erstattungsdaten.';
    end if;
    return v_result;
  end if;
  v_result := public.record_sale_return(p_workspace_id, (p_refund ->> 'sale_id')::uuid,
    (p_refund ->> 'amount')::numeric, (p_refund ->> 'restock')::boolean,
    p_refund ->> 'reason', coalesce(p_refund ->> 'notes', ''),
    p_refund ->> 'restock_action', coalesce(p_refund ->> 'buyer_name', ''));
  insert into public.sale_booking_requests(workspace_id, booking_key, request, result)
    values (p_workspace_id, v_key, v_request, v_result);
  return v_result;
end;
$$;
revoke all on function public.record_sale_refund(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_sale_refund(uuid, jsonb) to authenticated;

create or replace function public.guard_package_sale_cost()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_package boolean;
begin
  if tg_op = 'UPDATE' and new.position_kind is distinct from old.position_kind then
    raise exception using errcode = '22023', message = 'Die Erfassungsart einer Verkaufsposition ist unveränderlich.';
  end if;
  if new.position_kind = 'free' then
    if new.cost_of_goods_sold is not null or new.tax_purchase_cost is not null or new.tax_cost_allocations is not null then
      raise exception using errcode = '22023', message = 'Freie Verkäufe haben noch keinen zugeordneten Wareneinsatz.';
    end if;
    return new;
  end if;
  select source_package_line_id is not null into v_package from public.inventory_items
    where workspace_id = new.workspace_id and id = new.inventory_item_id;
  if coalesce(v_package, false) then
    if new.cost_of_goods_sold is not null or new.tax_purchase_cost is not null or new.tax_cost_allocations is not null then
      raise exception using errcode = '22023', message = 'Unbekannte Paketkosten dürfen im Verkauf nicht durch einen Betrag ersetzt werden.';
    end if;
  elsif new.cost_of_goods_sold is null then
    raise exception using errcode = '23502', message = 'Normale Verkaufspositionen benötigen bekannte Kosten.';
  end if;
  return new;
end;
$$;