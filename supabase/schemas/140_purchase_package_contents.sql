-- Bezahlte Paketpositionen und ihr unabhängig erfasster Inhalt.
-- Rechnungspreise bleiben an purchase_lines, unbekannte Einzelkosten bleiben null.
alter table public.purchase_lines add constraint purchase_lines_package_check
  check (not is_package or (line_kind = 'individual' and catalog_product_id is null
    and ordered_quantity = 1 and price_mode = 'priced'
    and unit_purchase_price is not null and unit_purchase_price < 'Infinity'::numeric
    and line_total = unit_purchase_price));

alter table public.inventory_items add constraint inventory_items_package_origin_fkey
  foreign key (workspace_id, source_package_line_id)
  references public.purchase_lines(workspace_id, id) on delete restrict;
alter table public.inventory_items add constraint inventory_items_package_cost_check
  check ((source_package_line_id is null and allocated_purchase_cost is not null)
    or (source_package_line_id is not null and purchase_id is not null and purchase_line_id is null
      and allocated_purchase_cost is null and tax_purchase_cost is null));
create index inventory_items_package_origin_idx
  on public.inventory_items(workspace_id, source_package_line_id);
comment on column public.purchase_lines.is_package is
  'Bezahlte Paketposition ohne eigenen verkäuflichen Bestand. Inhalt wird separat erfasst.';
comment on column public.inventory_items.source_package_line_id is
  'Dauerhafte Herkunft aus einer Paketposition; keine Einzelpreiszuordnung.';

create table public.purchase_package_capture_requests (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  purchase_line_id uuid not null,
  request_id uuid not null,
  request_items jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, request_id),
  foreign key (workspace_id, purchase_line_id)
    references public.purchase_lines(workspace_id, id) on delete restrict
);
comment on table public.purchase_package_capture_requests is
  'Unveränderliche Erfassungsanfragen verhindern doppelte Paketinhalte bei Wiederholungen.';
create index purchase_package_capture_requests_line_idx
  on public.purchase_package_capture_requests(workspace_id, purchase_line_id);
alter table public.purchase_package_capture_requests enable row level security;
revoke all on public.purchase_package_capture_requests from public, anon, authenticated, service_role;
grant select on public.purchase_package_capture_requests to authenticated;
create policy "Mitglieder lesen Paketerfassungen"
  on public.purchase_package_capture_requests for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create trigger protect_purchase_package_capture_requests
  before update or delete on public.purchase_package_capture_requests
  for each row execute function public.prevent_business_event_mutation();

create function public.guard_purchase_package_line()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (
    old.is_package is distinct from new.is_package
    or old.workspace_id is distinct from new.workspace_id
    or old.purchase_id is distinct from new.purchase_id
    or old.id is distinct from new.id
  ) and (
    exists (select 1 from public.inventory_items where source_package_line_id = old.id and workspace_id = old.workspace_id)
    or exists (select 1 from public.purchase_package_capture_requests where purchase_line_id = old.id and workspace_id = old.workspace_id)
    or (old.is_package is distinct from new.is_package and (
      old.received_quantity > 0
      or exists (select 1 from public.inventory_items where purchase_line_id = old.id and workspace_id = old.workspace_id)
      or exists (select 1 from public.stock_lots where purchase_line_id = old.id and workspace_id = old.workspace_id)
    ))
  ) then
    raise exception using errcode = '42501', message = 'Die Herkunft bereits erfasster Artikel darf nicht geändert werden.';
  end if;
  return new;
end;
$$;
create trigger protect_purchase_package_line before update on public.purchase_lines
  for each row execute function public.guard_purchase_package_line();
revoke all on function public.guard_purchase_package_line() from public, anon, authenticated, service_role;

create function public.guard_purchase_package_inventory()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_line public.purchase_lines;
  v_purchase public.purchases;
begin
  if tg_op = 'UPDATE' and old.source_package_line_id is not null and (
    old.source_package_line_id is distinct from new.source_package_line_id
    or old.purchase_id is distinct from new.purchase_id
    or old.purchase_line_id is distinct from new.purchase_line_id
    or old.workspace_id is distinct from new.workspace_id
    or old.id is distinct from new.id
  ) then
    raise exception using errcode = '42501', message = 'Die Paketherkunft eines Artikels ist unveränderlich.';
  end if;
  if tg_op = 'UPDATE' and old.source_package_line_id is null and new.source_package_line_id is not null then
    raise exception using errcode = '42501', message = 'Bestehende Artikel dürfen nicht nachträglich als Paketinhalt umgedeutet werden.';
  end if;
  if tg_op = 'DELETE' and old.source_package_line_id is not null then
    raise exception using errcode = '42501', message = 'Erfasste Paketinhalte dürfen nicht gelöscht werden.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.purchase_line_id is not null and exists (
    select 1 from public.purchase_lines where id = new.purchase_line_id and is_package
  ) then
    raise exception using errcode = '22023', message = 'Paketpositionen erzeugen keinen eigenen Bestandsartikel.';
  end if;
  if new.source_package_line_id is null then return new; end if;
  if tg_op = 'INSERT' and current_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'Paketinhalte werden ausschließlich über die Paketerfassung angelegt.';
  end if;
  select * into v_purchase from public.purchases
    where workspace_id = new.workspace_id and id = new.purchase_id for share;
  select * into v_line from public.purchase_lines
    where workspace_id = new.workspace_id and id = new.source_package_line_id;
  if v_line.id is null or not v_line.is_package or v_line.purchase_id is distinct from new.purchase_id
    or v_purchase.id is null then
    raise exception using errcode = '22023', message = 'Die Paketposition gehört nicht zu diesem Einkauf.';
  end if;
  if current_user <> 'postgres' and new.status in ('ready', 'listed') and v_purchase.entry_status <> 'finalized' then
    raise exception using errcode = '42501', message = 'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.';
  end if;
  return new;
end;
$$;
create trigger protect_purchase_package_inventory before insert or update or delete on public.inventory_items
  for each row execute function public.guard_purchase_package_inventory();
revoke all on function public.guard_purchase_package_inventory() from public, anon, authenticated, service_role;

create function public.guard_purchase_package_lot()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.purchase_lines where id = new.purchase_line_id and is_package) then
    raise exception using errcode = '22023', message = 'Paketpositionen erzeugen keinen eigenen Mengenbestand.';
  end if;
  return new;
end;
$$;
create trigger protect_purchase_package_lot before insert or update on public.stock_lots
  for each row execute function public.guard_purchase_package_lot();
revoke all on function public.guard_purchase_package_lot() from public, anon, authenticated, service_role;

create function public.guard_package_sale_cost()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_package boolean;
begin
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
create trigger protect_package_sale_cost before insert or update on public.sale_lines
  for each row execute function public.guard_package_sale_cost();
revoke all on function public.guard_package_sale_cost() from public, anon, authenticated, service_role;

create function public.capture_purchase_package_contents(
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
alter function public.capture_purchase_package_contents(uuid,uuid,jsonb,uuid) owner to postgres;
revoke all on function public.capture_purchase_package_contents(uuid,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.capture_purchase_package_contents(uuid,uuid,jsonb,uuid) to authenticated;
comment on function public.capture_purchase_package_contents(uuid,uuid,jsonb,uuid) is
  'Erfasst Paketinhalt nach Ankunft atomar und wiederholbar, auch nach Abschluss; unbekannte Einzelkosten bleiben null.';
