-- Migration: Unterstützung von Bestandsprodukten (Katalogprodukte) in Inseraten
-- Betroffene Tabelle: public.listings
-- Betroffene Funktionen: public.prepare_listing, public.set_listing_online, public.end_listing

alter table public.listings alter column inventory_item_id drop not null;

alter table public.listings
  add column if not exists catalog_product_id uuid;

alter table public.listings
  drop constraint if exists listings_catalog_product_workspace_fkey;

alter table public.listings
  add constraint listings_catalog_product_workspace_fkey
  foreign key (workspace_id, catalog_product_id)
  references public.catalog_products(workspace_id, id) on delete cascade;

alter table public.listings
  drop constraint if exists listings_target_check;

alter table public.listings
  add constraint listings_target_check check (
    (inventory_item_id is not null and catalog_product_id is null)
    or (inventory_item_id is null and catalog_product_id is not null)
  );

drop index if exists public.listings_one_open_per_item;
create unique index if not exists listings_one_open_per_item
  on public.listings (inventory_item_id, platform)
  where status <> 'ended' and inventory_item_id is not null;

drop index if exists public.listings_one_open_per_product;
create unique index if not exists listings_one_open_per_product
  on public.listings (catalog_product_id, platform)
  where status <> 'ended' and catalog_product_id is not null;

create index if not exists listings_catalog_product_id_idx
  on public.listings (catalog_product_id);

drop function if exists public.prepare_listing(uuid, uuid, jsonb);

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
      insert into public.listings(workspace_id, inventory_item_id, catalog_product_id, title, description, price, price_type, shipping_type, shipping_price, postal_code, listed_count, last_listed_at)
      values (p_workspace_id, p_inventory_item_id, null, v_content ->> 'title', v_content ->> 'description',
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
      insert into public.listings(workspace_id, inventory_item_id, catalog_product_id, title, description, price, price_type, shipping_type, shipping_price, postal_code, listed_count, last_listed_at)
      values (p_workspace_id, null, p_catalog_product_id, v_content ->> 'title', v_content ->> 'description',
        (v_content ->> 'price')::numeric, v_content ->> 'priceType', v_content ->> 'shippingType',
        nullif(v_content ->> 'shippingPrice', '')::numeric, nullif(v_content ->> 'postalCode', ''), 1, statement_timestamp())
      returning * into v_listing;
    else
      update public.listings set title = v_content ->> 'title', description = v_content ->> 'description',
        price = (v_content ->> 'price')::numeric, price_type = v_content ->> 'priceType', shipping_type = v_content ->> 'shippingType',
        shipping_price = nullif(v_content ->> 'shippingPrice', '')::numeric, postal_code = nullif(v_content ->> 'postalCode', ''),
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

alter function public.prepare_listing(uuid, uuid, jsonb, uuid) owner to postgres;
alter function public.set_listing_online(uuid, uuid) owner to postgres;
alter function public.end_listing(uuid, uuid) owner to postgres;
revoke all on function public.prepare_listing(uuid, uuid, jsonb, uuid) from public, anon, service_role;
revoke all on function public.set_listing_online(uuid, uuid) from public, anon, service_role;
revoke all on function public.end_listing(uuid, uuid) from public, anon, service_role;
grant execute on function public.prepare_listing(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.set_listing_online(uuid, uuid) to authenticated;
grant execute on function public.end_listing(uuid, uuid) to authenticated;
