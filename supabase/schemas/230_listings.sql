-- Gespeicherte und statusgeführte Kleinanzeigen-Inserate je Workspace.

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inventory_item_id uuid,
  catalog_product_id uuid,
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
  item_details jsonb not null default '{}'::jsonb check (jsonb_typeof(item_details) = 'object'),
  constraint listings_workspace_id_id_key unique (workspace_id, id),
  constraint listings_item_workspace_fkey foreign key (workspace_id, inventory_item_id)
    references public.inventory_items(workspace_id, id) on delete cascade,
  constraint listings_catalog_product_workspace_fkey foreign key (workspace_id, catalog_product_id)
    references public.catalog_products(workspace_id, id) on delete cascade,
  constraint listings_target_check check (
    (inventory_item_id is not null and catalog_product_id is null)
    or (inventory_item_id is null and catalog_product_id is not null)
  ),
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
  where status <> 'ended' and inventory_item_id is not null;

create unique index if not exists listings_one_open_per_product
  on public.listings (catalog_product_id, platform)
  where status <> 'ended' and catalog_product_id is not null;

create index if not exists listings_workspace_status_updated_idx
  on public.listings (workspace_id, status, updated_at desc, id desc);

create index if not exists listings_inventory_item_id_idx on public.listings (inventory_item_id);
create index if not exists listings_catalog_product_id_idx on public.listings (catalog_product_id);

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
grant update (title, description, price, price_type, shipping_type, shipping_price, postal_code, item_details)
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

create or replace function public.validate_listing_item_details(p_details jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_result jsonb := '{}'::jsonb;
  v_field text;
  v_value text;
begin
  if jsonb_typeof(v_details) <> 'object' then
    raise exception using errcode = '22023', message = 'Die Artikeldaten sind ungültig.';
  end if;
  foreach v_field in array array['brand', 'category', 'model', 'size', 'color', 'material', 'condition', 'conditionNotes'] loop
    if v_details ? v_field and jsonb_typeof(v_details -> v_field) not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'Die Artikeldaten sind ungültig.';
    end if;
    v_value := nullif(btrim(v_details ->> v_field), '');
    if char_length(v_value) > 120 and v_field not in ('category', 'conditionNotes')
       or char_length(v_value) > 240 and v_field = 'category'
       or char_length(v_value) > 500 and v_field = 'conditionNotes'
       or char_length(v_value) > 80 and v_field in ('size', 'color') then
      raise exception using errcode = '22023', message = 'Ein Artikelfeld ist zu lang.';
    end if;
    if v_field = 'condition' and v_value is not null
       and v_value not in ('new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective') then
      raise exception using errcode = '22023', message = 'Der Zustand ist ungültig.';
    end if;
    v_result := v_result || pg_catalog.jsonb_build_object(v_field, v_value);
  end loop;
  return v_result;
end;
$$;

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
    'postalCode', v_postal_code,
    'itemDetails', public.validate_listing_item_details(p_content -> 'itemDetails'));
end;
$$;

create or replace function public.prepare_listing(
  p_workspace_id uuid,
  p_inventory_item_id uuid default null,
  p_content jsonb default '{}'::jsonb,
  p_catalog_product_id uuid default null
)
returns public.listings
language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace public.workspaces;
  v_item public.inventory_items;
  v_product public.catalog_products;
  v_listing public.listings;
  v_content jsonb;
  v_available_qty integer;
begin
  if not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.';
  end if;
  select * into v_workspace from public.workspaces where id = p_workspace_id for share;
  if v_workspace.id is null or v_workspace.archived_at is not null then
    raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
  end if;
  if (p_inventory_item_id is null and p_catalog_product_id is null)
     or (p_inventory_item_id is not null and p_catalog_product_id is not null) then
    raise exception using errcode = '22023', message = 'Genau ein Ziel (Artikel oder Katalogprodukt) muss angegeben werden.';
  end if;
  v_content := public.validate_listing_content(p_content);

  if p_inventory_item_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_inventory_item_id::text || ':kleinanzeigen', 0));
    select * into v_item from public.inventory_items where id = p_inventory_item_id and workspace_id = p_workspace_id for update;
    if v_item.id is null then raise exception using errcode = '22023', message = 'Der Artikel gehört nicht zu diesem Workspace.'; end if;
    if v_item.archived_at is not null or v_item.status in ('reserved', 'sold', 'defective', 'archived') then
      raise exception using errcode = '22023', message = 'Dieser Artikel kann nicht inseriert werden.';
    end if;

    select * into v_listing from public.listings
      where workspace_id = p_workspace_id and inventory_item_id = p_inventory_item_id and platform = 'kleinanzeigen'
      order by updated_at desc, id desc limit 1 for update;

    if v_listing.id is null then
      insert into public.listings(workspace_id, inventory_item_id, catalog_product_id, title, description, price, price_type, shipping_type, shipping_price, postal_code, listed_count, last_listed_at, item_details)
      values (p_workspace_id, p_inventory_item_id, null, v_content ->> 'title', v_content ->> 'description',
        (v_content ->> 'price')::numeric, v_content ->> 'priceType', v_content ->> 'shippingType',
        nullif(v_content ->> 'shippingPrice', '')::numeric, nullif(v_content ->> 'postalCode', ''), 1, statement_timestamp(), v_content -> 'itemDetails')
      returning * into v_listing;
    elsif v_listing.status = 'ended' and v_listing.end_reason = 'sold' then
      raise exception using errcode = '22023', message = 'Ein nach Verkauf beendetes Inserat kann nicht erneut eingestellt werden.';
    else
      update public.listings set title = v_content ->> 'title', description = v_content ->> 'description',
        price = (v_content ->> 'price')::numeric, price_type = v_content ->> 'priceType', shipping_type = v_content ->> 'shippingType',
        shipping_price = nullif(v_content ->> 'shippingPrice', '')::numeric, postal_code = nullif(v_content ->> 'postalCode', ''),
        item_details = v_content -> 'itemDetails',
        status = 'prepared', end_reason = null, ended_at = null, online_since = null,
        listed_count = listed_count + 1, last_listed_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_catalog_product_id::text || ':kleinanzeigen', 0));
    select * into v_product from public.catalog_products where id = p_catalog_product_id and workspace_id = p_workspace_id for update;
    if v_product.id is null then raise exception using errcode = '22023', message = 'Das Produkt gehört nicht zu diesem Workspace.'; end if;
    if v_product.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieses Produkt ist archiviert.';
    end if;

    select coalesce(sum(remaining_quantity), 0) into v_available_qty
      from public.stock_lots
      where workspace_id = p_workspace_id and catalog_product_id = p_catalog_product_id;
    if v_available_qty <= 0 then
      raise exception using errcode = '22023', message = 'Für dieses Produkt ist kein verfügbarer Bestand vorhanden.';
    end if;

    select * into v_listing from public.listings
      where workspace_id = p_workspace_id and catalog_product_id = p_catalog_product_id and platform = 'kleinanzeigen'
      order by updated_at desc, id desc limit 1 for update;

    if v_listing.id is null then
      insert into public.listings(workspace_id, inventory_item_id, catalog_product_id, title, description, price, price_type, shipping_type, shipping_price, postal_code, listed_count, last_listed_at, item_details)
      values (p_workspace_id, null, p_catalog_product_id, v_content ->> 'title', v_content ->> 'description',
        (v_content ->> 'price')::numeric, v_content ->> 'priceType', v_content ->> 'shippingType',
        nullif(v_content ->> 'shippingPrice', '')::numeric, nullif(v_content ->> 'postalCode', ''), 1, statement_timestamp(), v_content -> 'itemDetails')
      returning * into v_listing;
    else
      update public.listings set title = v_content ->> 'title', description = v_content ->> 'description',
        price = (v_content ->> 'price')::numeric, price_type = v_content ->> 'priceType', shipping_type = v_content ->> 'shippingType',
        shipping_price = nullif(v_content ->> 'shippingPrice', '')::numeric, postal_code = nullif(v_content ->> 'postalCode', ''),
        item_details = v_content -> 'itemDetails',
        status = 'prepared', end_reason = null, ended_at = null, online_since = null,
        listed_count = listed_count + 1, last_listed_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    end if;
  end if;

  return v_listing;
end;
$$;

create or replace function public.set_listing_online(p_workspace_id uuid, p_listing_id uuid)
returns public.listings language plpgsql security definer set search_path = ''
as $$
declare
  v_listing public.listings;
  v_item public.inventory_items;
  v_product public.catalog_products;
  v_archived_at timestamptz;
  v_entry_status text;
  v_inventory_item_id uuid;
  v_catalog_product_id uuid;
  v_purchase_id uuid;
  v_source_package_line_id uuid;
  v_available_qty integer;
begin
  if not (select public.is_workspace_member(p_workspace_id)) then raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.'; end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.'; end if;
  select inventory_item_id, catalog_product_id into v_inventory_item_id, v_catalog_product_id
    from public.listings where id = p_listing_id and workspace_id = p_workspace_id;
  if v_inventory_item_id is null and v_catalog_product_id is null then
    raise exception using errcode = '22023', message = 'Nur vorbereitete Inserate können online gesetzt werden.';
  end if;

  if v_inventory_item_id is not null then
    select purchase_id, source_package_line_id into v_purchase_id, v_source_package_line_id
      from public.inventory_items where id = v_inventory_item_id and workspace_id = p_workspace_id;
    if v_source_package_line_id is not null then
      select entry_status into v_entry_status from public.purchases where id = v_purchase_id and workspace_id = p_workspace_id for share;
      if v_entry_status is distinct from 'finalized' then raise exception using errcode = '42501', message = 'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.'; end if;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_inventory_item_id::text || ':kleinanzeigen', 0));
    select * into v_item from public.inventory_items where id = v_inventory_item_id and workspace_id = p_workspace_id for update;
    select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
    if v_listing.id is null or v_listing.status <> 'prepared' then raise exception using errcode = '22023', message = 'Nur vorbereitete Inserate können online gesetzt werden.'; end if;
    if v_item.archived_at is not null or v_item.status not in ('received','needs_review','researched','ready','listed','returned') then raise exception using errcode = '22023', message = 'Dieser Artikel kann nicht online gestellt werden.'; end if;
    if v_item.status <> 'listed' then update public.inventory_items set status = 'listed' where id = v_item.id; end if;
    update public.listings set status = 'online', online_since = statement_timestamp() where id = v_listing.id returning * into v_listing;
    return v_listing;
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_catalog_product_id::text || ':kleinanzeigen', 0));
    select * into v_product from public.catalog_products where id = v_catalog_product_id and workspace_id = p_workspace_id for update;
    select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
    if v_listing.id is null or v_listing.status <> 'prepared' then raise exception using errcode = '22023', message = 'Nur vorbereitete Inserate können online gesetzt werden.'; end if;
    if v_product.archived_at is not null then raise exception using errcode = '22023', message = 'Dieses Produkt ist archiviert.'; end if;
    select coalesce(sum(remaining_quantity), 0) into v_available_qty from public.stock_lots where workspace_id = p_workspace_id and catalog_product_id = v_catalog_product_id;
    if v_available_qty <= 0 then raise exception using errcode = '22023', message = 'Für dieses Produkt ist kein verfügbarer Bestand vorhanden.'; end if;
    update public.listings set status = 'online', online_since = statement_timestamp() where id = v_listing.id returning * into v_listing;
    return v_listing;
  end if;
end;
$$;

create or replace function public.end_listing(p_workspace_id uuid, p_listing_id uuid)
returns public.listings language plpgsql security definer set search_path = ''
as $$
declare
  v_listing public.listings;
  v_item public.inventory_items;
  v_product public.catalog_products;
  v_archived_at timestamptz;
  v_inventory_item_id uuid;
  v_catalog_product_id uuid;
begin
  if not (select public.is_workspace_member(p_workspace_id)) then raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.'; end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.'; end if;
  select inventory_item_id, catalog_product_id into v_inventory_item_id, v_catalog_product_id
    from public.listings where id = p_listing_id and workspace_id = p_workspace_id;
  if v_inventory_item_id is null and v_catalog_product_id is null then
    raise exception using errcode = '22023', message = 'Dieses Inserat kann nicht beendet werden.';
  end if;

  if v_inventory_item_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_inventory_item_id::text || ':kleinanzeigen', 0));
    select * into v_item from public.inventory_items where id = v_inventory_item_id and workspace_id = p_workspace_id for update;
    select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
    if v_listing.id is null or v_listing.status = 'ended' then raise exception using errcode = '22023', message = 'Dieses Inserat kann nicht beendet werden.'; end if;
    if v_item.status = 'listed' then update public.inventory_items set status = 'ready' where id = v_item.id; end if;
    update public.listings set status = 'ended', end_reason = 'manual', ended_at = statement_timestamp() where id = v_listing.id returning * into v_listing;
    return v_listing;
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_catalog_product_id::text || ':kleinanzeigen', 0));
    select * into v_product from public.catalog_products where id = v_catalog_product_id and workspace_id = p_workspace_id for update;
    select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
    if v_listing.id is null or v_listing.status = 'ended' then raise exception using errcode = '22023', message = 'Dieses Inserat kann nicht beendet werden.'; end if;
    update public.listings set status = 'ended', end_reason = 'manual', ended_at = statement_timestamp() where id = v_listing.id returning * into v_listing;
    return v_listing;
  end if;
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
alter function public.prepare_listing(uuid, uuid, jsonb, uuid) owner to postgres;
alter function public.set_listing_online(uuid, uuid) owner to postgres;
alter function public.end_listing(uuid, uuid) owner to postgres;
alter function public.end_listings_after_inventory_sale() owner to postgres;
revoke all on function public.validate_listing_content(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.prepare_listing(uuid, uuid, jsonb, uuid) from public, anon, service_role;
revoke all on function public.set_listing_online(uuid, uuid) from public, anon, service_role;
revoke all on function public.end_listing(uuid, uuid) from public, anon, service_role;
revoke all on function public.end_listings_after_inventory_sale() from public, anon, authenticated, service_role;
grant execute on function public.prepare_listing(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.set_listing_online(uuid, uuid) to authenticated;
grant execute on function public.end_listing(uuid, uuid) to authenticated;
