-- Gespeicherte und statusgeführte Kleinanzeigen-Inserate je Workspace.

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inventory_item_id uuid not null,
  platform text not null default 'kleinanzeigen' check (platform = 'kleinanzeigen'),
  status text not null default 'prepared' check (status in ('prepared', 'online', 'ended')),
  end_reason text check (end_reason in ('sold', 'manual')),
  title text not null check (char_length(btrim(title)) between 1 and 65),
  description text not null check (char_length(description) <= 4000),
  price numeric(12,2) not null check (price between 0 and 99999999),
  price_type text not null check (price_type in ('FIXED', 'NEGOTIABLE')),
  shipping_type text not null check (shipping_type in ('pickup', 'shipping', 'both')),
  shipping_price numeric(12,2) constraint listings_shipping_price_nonnegative_check check (shipping_price >= 0),
  postal_code text check (postal_code ~ '^[0-9]{5}$'),
  listed_count integer not null default 0 check (listed_count >= 0),
  last_listed_at timestamptz,
  online_since timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_workspace_id_id_key unique (workspace_id, id),
  constraint listings_item_workspace_fkey foreign key (workspace_id, inventory_item_id)
    references public.inventory_items(workspace_id, id) on delete cascade,
  constraint listings_shipping_price_check check (
    (shipping_type = 'pickup' and shipping_price is null)
    or shipping_type in ('shipping', 'both')
  ),
  constraint listings_end_state_check check (
    (status = 'ended' and end_reason is not null and ended_at is not null)
    or (status <> 'ended' and end_reason is null and ended_at is null)
  )
);

comment on table public.listings is 'Gespeicherte und statusgeführte Verkaufsinserate eines Workspace.';

create unique index if not exists listings_one_open_per_item
  on public.listings (inventory_item_id, platform)
  where status <> 'ended';

create index if not exists listings_workspace_status_updated_idx
  on public.listings (workspace_id, status, updated_at desc, id desc);

create index if not exists listings_inventory_item_id_idx on public.listings (inventory_item_id);

alter table public.listings enable row level security;

create or replace function public.touch_listing_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

alter function public.touch_listing_updated_at() owner to postgres;
revoke all on function public.touch_listing_updated_at() from public, anon, authenticated, service_role;

drop trigger if exists listings_touch_updated_at on public.listings;
create trigger listings_touch_updated_at
before update on public.listings
for each row execute function public.touch_listing_updated_at();

drop trigger if exists "00_protect_archived_workspace" on public.listings;
create trigger "00_protect_archived_workspace"
before insert or update or delete on public.listings
for each row execute function public.protect_archived_workspace_data();

revoke all on table public.listings from public, anon, authenticated, service_role;
grant select on table public.listings to authenticated;
grant update (title, description, price, price_type, shipping_type, shipping_price, postal_code)
  on table public.listings to authenticated;

drop policy if exists "Inserate lesen" on public.listings;
create policy "Inserate lesen"
on public.listings
for select
to authenticated
using ((select public.is_workspace_member(workspace_id)));

drop policy if exists "Inseratsinhalt ändern" on public.listings;
create policy "Inseratsinhalt ändern"
on public.listings
for update
to authenticated
using ((select public.is_workspace_member(workspace_id)))
with check ((select public.is_workspace_member(workspace_id)));

create or replace function public.validate_listing_content(p_content jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_content ->> 'title', ''));
  v_description text := coalesce(p_content ->> 'description', '');
  v_price_text text := p_content ->> 'price';
  v_shipping_price_text text := p_content ->> 'shippingPrice';
  v_price numeric(12,2);
  v_shipping_price numeric(12,2);
  v_price_type text := p_content ->> 'priceType';
  v_shipping_type text := p_content ->> 'shippingType';
  v_postal_code text := nullif(btrim(coalesce(p_content ->> 'postalCode', '')), '');
begin
  if jsonb_typeof(p_content) <> 'object' then
    raise exception using errcode = '22023', message = 'Die Inseratsdaten sind ungültig.';
  end if;
  if char_length(v_title) not between 1 and 65 then
    raise exception using errcode = '22023', message = 'Der Titel muss 1 bis 65 Zeichen enthalten.';
  end if;
  if char_length(v_description) > 4000 then
    raise exception using errcode = '22023', message = 'Die Beschreibung darf höchstens 4.000 Zeichen enthalten.';
  end if;
  if v_price_text is null or v_price_text !~ '^[0-9]+(\.[0-9]{1,2})?$' then
    raise exception using errcode = '22023', message = 'Der Preis muss zwischen 0 und 99.999.999 € liegen.';
  end if;
  v_price := v_price_text::numeric(12,2);
  if v_price > 99999999 then
    raise exception using errcode = '22023', message = 'Der Preis muss zwischen 0 und 99.999.999 € liegen.';
  end if;
  if v_price_type not in ('FIXED', 'NEGOTIABLE') then
    raise exception using errcode = '22023', message = 'Die Preisart ist ungültig.';
  end if;
  if v_shipping_type not in ('pickup', 'shipping', 'both') then
    raise exception using errcode = '22023', message = 'Die Versandart ist ungültig.';
  end if;
  if v_shipping_price_text is not null then
    if v_shipping_price_text !~ '^[0-9]+(\.[0-9]{1,2})?$' then
      raise exception using errcode = '22023', message = 'Versandkosten dürfen nicht negativ sein.';
    end if;
    v_shipping_price := v_shipping_price_text::numeric(12,2);
  end if;
  if v_shipping_type = 'pickup' and v_shipping_price is not null then
    raise exception using errcode = '22023', message = 'Bei Abholung dürfen keine Versandkosten gespeichert sein.';
  end if;
  if v_postal_code is not null and v_postal_code !~ '^[0-9]{5}$' then
    raise exception using errcode = '22023', message = 'Die Postleitzahl muss aus fünf Ziffern bestehen.';
  end if;
  return jsonb_build_object('title', v_title, 'description', v_description, 'price', v_price,
    'priceType', v_price_type, 'shippingType', v_shipping_type, 'shippingPrice', v_shipping_price,
    'postalCode', v_postal_code);
end;
$$;

create or replace function public.prepare_listing(p_workspace_id uuid, p_inventory_item_id uuid, p_content jsonb)
returns public.listings
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace public.workspaces;
  v_item public.inventory_items;
  v_listing public.listings;
  v_content jsonb;
begin
  if not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.';
  end if;
  select * into v_workspace from public.workspaces where id = p_workspace_id for share;
  if v_workspace.id is null or v_workspace.archived_at is not null then
    raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
  end if;
  select * into v_item from public.inventory_items where id = p_inventory_item_id and workspace_id = p_workspace_id for update;
  if v_item.id is null then raise exception using errcode = '22023', message = 'Der Artikel gehört nicht zu diesem Workspace.'; end if;
  if v_item.archived_at is not null or v_item.status in ('reserved', 'sold', 'defective', 'archived') then
    raise exception using errcode = '22023', message = 'Dieser Artikel kann nicht inseriert werden.';
  end if;
  v_content := public.validate_listing_content(p_content);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_inventory_item_id::text || ':kleinanzeigen', 0));
  select * into v_listing from public.listings
    where workspace_id = p_workspace_id and inventory_item_id = p_inventory_item_id and platform = 'kleinanzeigen'
    order by updated_at desc, id desc limit 1 for update;
  if v_listing.id is null then
    insert into public.listings(workspace_id, inventory_item_id, title, description, price, price_type, shipping_type, shipping_price, postal_code, listed_count, last_listed_at)
    values (p_workspace_id, p_inventory_item_id, v_content ->> 'title', v_content ->> 'description',
      (v_content ->> 'price')::numeric, v_content ->> 'priceType', v_content ->> 'shippingType',
      nullif(v_content ->> 'shippingPrice', '')::numeric, nullif(v_content ->> 'postalCode', ''), 1, statement_timestamp())
    returning * into v_listing;
  elsif v_listing.status = 'ended' and v_listing.end_reason = 'sold' then
    raise exception using errcode = '22023', message = 'Ein nach Verkauf beendetes Inserat kann nicht erneut eingestellt werden.';
  else
    update public.listings set title = v_content ->> 'title', description = v_content ->> 'description',
      price = (v_content ->> 'price')::numeric, price_type = v_content ->> 'priceType', shipping_type = v_content ->> 'shippingType',
      shipping_price = nullif(v_content ->> 'shippingPrice', '')::numeric, postal_code = nullif(v_content ->> 'postalCode', ''),
      status = 'prepared', end_reason = null, ended_at = null, online_since = null,
      listed_count = listed_count + 1, last_listed_at = statement_timestamp()
    where id = v_listing.id returning * into v_listing;
  end if;
  return v_listing;
end;
$$;

create or replace function public.set_listing_online(p_workspace_id uuid, p_listing_id uuid)
returns public.listings language plpgsql security definer set search_path = ''
as $$
declare v_listing public.listings; v_item public.inventory_items; v_archived_at timestamptz; v_entry_status text;
begin
  if not (select public.is_workspace_member(p_workspace_id)) then raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.'; end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.'; end if;
  select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
  if v_listing.id is null or v_listing.status <> 'prepared' then raise exception using errcode = '22023', message = 'Nur vorbereitete Inserate können online gesetzt werden.'; end if;
  select * into v_item from public.inventory_items where id = v_listing.inventory_item_id and workspace_id = p_workspace_id for update;
  if v_item.source_package_line_id is not null then
    select entry_status into v_entry_status from public.purchases where id = v_item.purchase_id and workspace_id = p_workspace_id for share;
    if v_entry_status is distinct from 'finalized' then raise exception using errcode = '42501', message = 'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.'; end if;
  end if;
  if v_item.archived_at is not null or v_item.status not in ('received','needs_review','researched','ready','listed','returned') then raise exception using errcode = '22023', message = 'Dieser Artikel kann nicht online gestellt werden.'; end if;
  if v_item.status <> 'listed' then update public.inventory_items set status = 'listed' where id = v_item.id; end if;
  update public.listings set status = 'online', online_since = statement_timestamp() where id = v_listing.id returning * into v_listing;
  return v_listing;
end;
$$;

create or replace function public.end_listing(p_workspace_id uuid, p_listing_id uuid)
returns public.listings language plpgsql security definer set search_path = ''
as $$
declare v_listing public.listings; v_item public.inventory_items; v_archived_at timestamptz;
begin
  if not (select public.is_workspace_member(p_workspace_id)) then raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.'; end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.'; end if;
  select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
  if v_listing.id is null or v_listing.status = 'ended' then raise exception using errcode = '22023', message = 'Dieses Inserat kann nicht beendet werden.'; end if;
  select * into v_item from public.inventory_items where id = v_listing.inventory_item_id and workspace_id = p_workspace_id for update;
  if v_item.status = 'listed' then update public.inventory_items set status = 'ready' where id = v_item.id; end if;
  update public.listings set status = 'ended', end_reason = 'manual', ended_at = statement_timestamp() where id = v_listing.id returning * into v_listing;
  return v_listing;
end;
$$;

create or replace function public.end_listings_after_inventory_sale()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'sold' and old.status is distinct from new.status then
    update public.listings set status = 'ended', end_reason = 'sold', ended_at = statement_timestamp()
    where workspace_id = new.workspace_id and inventory_item_id = new.id and status <> 'ended';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_end_after_inventory_sale on public.inventory_items;
create trigger listings_end_after_inventory_sale
after update of status on public.inventory_items
for each row execute function public.end_listings_after_inventory_sale();

alter function public.validate_listing_content(jsonb) owner to postgres;
alter function public.prepare_listing(uuid, uuid, jsonb) owner to postgres;
alter function public.set_listing_online(uuid, uuid) owner to postgres;
alter function public.end_listing(uuid, uuid) owner to postgres;
alter function public.end_listings_after_inventory_sale() owner to postgres;
revoke all on function public.validate_listing_content(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.prepare_listing(uuid, uuid, jsonb) from public, anon, service_role;
revoke all on function public.set_listing_online(uuid, uuid) from public, anon, service_role;
revoke all on function public.end_listing(uuid, uuid) from public, anon, service_role;
revoke all on function public.end_listings_after_inventory_sale() from public, anon, authenticated, service_role;
grant execute on function public.prepare_listing(uuid, uuid, jsonb) to authenticated;
grant execute on function public.set_listing_online(uuid, uuid) to authenticated;
grant execute on function public.end_listing(uuid, uuid) to authenticated;
