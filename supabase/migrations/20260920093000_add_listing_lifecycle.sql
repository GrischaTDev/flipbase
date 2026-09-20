-- Zweck: Transaktionale Lebenszyklus-RPCs für gespeicherte Inserate und Verkaufs-Kopplung ergänzen.
-- Betroffene Funktionen: public.prepare_listing, public.set_listing_online, public.end_listing.
-- Betroffener Trigger: public.listings_end_after_inventory_sale auf public.inventory_items.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.end_listing (
  p_workspace_id uuid,
  p_listing_id   uuid
)
  RETURNS public.listings
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.end_listing(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.end_listing(uuid, uuid) TO authenticated;

CREATE FUNCTION public.end_listings_after_inventory_sale()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.status = 'sold' and old.status is distinct from new.status then
    update public.listings set status = 'ended', end_reason = 'sold', ended_at = statement_timestamp()
    where workspace_id = new.workspace_id and inventory_item_id = new.id and status <> 'ended';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.end_listings_after_inventory_sale() FROM PUBLIC;

CREATE FUNCTION public.prepare_listing (
  p_workspace_id      uuid,
  p_inventory_item_id uuid,
  p_content           jsonb
)
  RETURNS public.listings
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.prepare_listing(uuid, uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.prepare_listing(uuid, uuid, jsonb) TO authenticated;

CREATE FUNCTION public.set_listing_online (
  p_workspace_id uuid,
  p_listing_id   uuid
)
  RETURNS public.listings
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.set_listing_online(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_listing_online(uuid, uuid) TO authenticated;

CREATE FUNCTION public.validate_listing_content (
  p_content jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.validate_listing_content(jsonb) FROM PUBLIC;

CREATE TRIGGER listings_end_after_inventory_sale
  AFTER UPDATE OF status ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.end_listings_after_inventory_sale();

ALTER FUNCTION public.validate_listing_content(jsonb) OWNER TO postgres;
ALTER FUNCTION public.prepare_listing(uuid, uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.set_listing_online(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.end_listing(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.end_listings_after_inventory_sale() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_listing_content(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_listing(uuid, uuid, jsonb) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.set_listing_online(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.end_listing(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.end_listings_after_inventory_sale() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_listing(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_listing_online(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_listing(uuid, uuid) TO authenticated;
