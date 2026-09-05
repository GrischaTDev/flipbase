-- Optional, server-validated EAN/GTIN snapshots for purchase lines.
-- Existing rows remain compatible because the new column is nullable.
create or replace function public.is_valid_gtin(p_value text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_length integer;
  v_sum integer := 0;
  v_position integer;
  v_digit integer;
  v_check integer;
begin
  if p_value is null or p_value !~ '^[0-9]+$' then
    return false;
  end if;
  v_length := pg_catalog.length(p_value);
  if v_length not in (8, 12, 13, 14) then
    return false;
  end if;
  v_check := pg_catalog.substr(p_value, v_length, 1)::integer;
  for v_position in 1..(v_length - 1) loop
    v_digit := pg_catalog.substr(p_value, v_length - v_position, 1)::integer;
    v_sum := v_sum + v_digit * case when v_position % 2 = 1 then 3 else 1 end;
  end loop;
  return (10 - (v_sum % 10)) % 10 = v_check;
end;
$$;
revoke execute on function public.is_valid_gtin(text) from public, anon, authenticated, service_role;
alter table public.purchase_lines add column if not exists ean_snapshot text;
alter table public.purchase_lines drop constraint if exists purchase_lines_ean_snapshot_check;
alter table public.purchase_lines add constraint purchase_lines_ean_snapshot_check
  check (ean_snapshot is null or public.is_valid_gtin(ean_snapshot));
create index if not exists idx_purchase_lines_workspace_ean
  on public.purchase_lines (workspace_id, ean_snapshot)
  where ean_snapshot is not null;

create or replace function public.set_purchase_line_eans(p_workspace_id uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_line jsonb;
  v_ean text;
begin
  if v_actor is null or p_workspace_id is null or jsonb_typeof(p_lines) <> 'array'
    or not exists (select 1 from public.workspace_members as member where member.workspace_id = p_workspace_id and member.user_id = v_actor) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    if pg_catalog.jsonb_typeof(v_line -> 'id') <> 'string'
      or (v_line ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_line -> 'ean') not in ('null', 'string') then
      raise exception using errcode = '22023', message = 'Die EAN-Zuordnung ist ungültig.';
    end if;
    v_ean := nullif(pg_catalog.btrim(v_line ->> 'ean'), '');
    if v_ean is not null and not public.is_valid_gtin(v_ean) then
      raise exception using errcode = '22023', message = 'Die EAN/GTIN ist ungültig.';
    end if;
    update public.purchase_lines as line
    set ean_snapshot = v_ean, updated_at = pg_catalog.clock_timestamp()
    from public.purchases as purchase
    where line.id = (v_line ->> 'id')::uuid
      and line.workspace_id = p_workspace_id
      and purchase.id = line.purchase_id
      and purchase.workspace_id = p_workspace_id
      and purchase.entry_status <> 'finalized';
    if not found then
      raise exception using errcode = '22023', message = 'Die Einkaufsposition ist nicht änderbar.';
    end if;
  end loop;
end;
$$;
alter function public.set_purchase_line_eans(uuid, jsonb) owner to postgres;
revoke all on function public.set_purchase_line_eans(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.set_purchase_line_eans(uuid, jsonb) to authenticated;

create or replace function public.sync_inventory_item_ean()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.ean is null and new.purchase_line_id is not null then
    select line.ean_snapshot into new.ean from public.purchase_lines as line
    where line.id = new.purchase_line_id and line.workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_inventory_item_ean() from public, anon, authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.inventory_items'::pg_catalog.regclass and tgname = 'sync_inventory_item_ean') then
    create trigger sync_inventory_item_ean before insert or update of purchase_line_id, ean on public.inventory_items
      for each row execute function public.sync_inventory_item_ean();
  end if;
end $$;
