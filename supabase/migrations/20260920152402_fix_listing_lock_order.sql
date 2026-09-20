-- Zweck: Sperrreihenfolge der Inseratsfunktionen mit Verkauf und Einkaufsabschluss vereinheitlichen.
-- Betroffene Funktionen: public.prepare_listing, public.set_listing_online, public.end_listing.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

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
  v_content := public.validate_listing_content(p_content);
  -- Alle Inserats-RPCs sperren advisory -> Artikel -> Inserat. Der Verkaufstrigger
  -- hält ebenfalls zuerst den Artikel und kann dadurch keinen Sperrkreis bilden.
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
declare v_listing public.listings; v_item public.inventory_items; v_archived_at timestamptz; v_entry_status text; v_inventory_item_id uuid; v_purchase_id uuid; v_source_package_line_id uuid;
begin
  if not (select public.is_workspace_member(p_workspace_id)) then raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.'; end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.'; end if;
  select inventory_item_id into v_inventory_item_id from public.listings where id = p_listing_id and workspace_id = p_workspace_id;
  if v_inventory_item_id is null then raise exception using errcode = '22023', message = 'Nur vorbereitete Inserate können online gesetzt werden.'; end if;
  select purchase_id, source_package_line_id into v_purchase_id, v_source_package_line_id
    from public.inventory_items where id = v_inventory_item_id and workspace_id = p_workspace_id;
  if v_source_package_line_id is not null then
    -- Einkaufsfunktionen sperren zuerst den Einkauf und danach seine Artikel.
    select entry_status into v_entry_status from public.purchases where id = v_purchase_id and workspace_id = p_workspace_id for share;
    if v_entry_status is distinct from 'finalized' then raise exception using errcode = '42501', message = 'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.'; end if;
  end if;
  -- Sperrreihenfolge: optionaler Einkauf -> advisory -> Artikel -> Inserat.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_inventory_item_id::text || ':kleinanzeigen', 0));
  select * into v_item from public.inventory_items where id = v_inventory_item_id and workspace_id = p_workspace_id for update;
  select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
  if v_listing.id is null or v_listing.status <> 'prepared' then raise exception using errcode = '22023', message = 'Nur vorbereitete Inserate können online gesetzt werden.'; end if;
  if v_item.archived_at is not null or v_item.status not in ('received','needs_review','researched','ready','listed','returned') then raise exception using errcode = '22023', message = 'Dieser Artikel kann nicht online gestellt werden.'; end if;
  if v_item.status <> 'listed' then update public.inventory_items set status = 'listed' where id = v_item.id; end if;
  update public.listings set status = 'online', online_since = statement_timestamp() where id = v_listing.id returning * into v_listing;
  return v_listing;
end;
$$;

create or replace function public.end_listing(p_workspace_id uuid, p_listing_id uuid)
returns public.listings language plpgsql security definer set search_path = ''
as $$
declare v_listing public.listings; v_item public.inventory_items; v_archived_at timestamptz; v_inventory_item_id uuid;
begin
  if not (select public.is_workspace_member(p_workspace_id)) then raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.'; end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.'; end if;
  select inventory_item_id into v_inventory_item_id from public.listings where id = p_listing_id and workspace_id = p_workspace_id;
  if v_inventory_item_id is null then raise exception using errcode = '22023', message = 'Dieses Inserat kann nicht beendet werden.'; end if;
  -- Sperrreihenfolge: advisory -> Artikel -> Inserat.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_inventory_item_id::text || ':kleinanzeigen', 0));
  select * into v_item from public.inventory_items where id = v_inventory_item_id and workspace_id = p_workspace_id for update;
  select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
  if v_listing.id is null or v_listing.status = 'ended' then raise exception using errcode = '22023', message = 'Dieses Inserat kann nicht beendet werden.'; end if;
  if v_item.status = 'listed' then update public.inventory_items set status = 'ready' where id = v_item.id; end if;
  update public.listings set status = 'ended', end_reason = 'manual', ended_at = statement_timestamp() where id = v_listing.id returning * into v_listing;
  return v_listing;
end;
$$;
