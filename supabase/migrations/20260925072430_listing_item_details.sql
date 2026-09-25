-- Speichert bearbeitbare Artikeldaten pro Inserat in public.listings.item_details.
-- Betroffen: public.listings.item_details, public.prepare_listing und die Inhaltsvalidierung.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.prepare_listing (
  p_workspace_id       uuid,
  p_inventory_item_id  uuid  DEFAULT NULL::uuid,
  p_content            jsonb DEFAULT '{}'::jsonb,
  p_catalog_product_id uuid  DEFAULT NULL::uuid
)
  RETURNS public.listings
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.validate_listing_content (
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
    'postalCode', v_postal_code,
    'itemDetails', public.validate_listing_item_details(p_content -> 'itemDetails'));
end;
$function$;

CREATE FUNCTION public.validate_listing_item_details (
  p_details jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.validate_listing_item_details(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.validate_listing_item_details(jsonb) TO service_role;

ALTER TABLE public.listings
  ADD COLUMN item_details jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_item_details_check CHECK (jsonb_typeof(item_details) = 'object'::text);

REVOKE UPDATE (description, image_selection_saved, postal_code, price, price_type, shipping_price, shipping_type, title) ON public.listings FROM authenticated;

GRANT UPDATE (description, image_selection_saved, item_details, postal_code, price, price_type, shipping_price, shipping_type, title) ON public.listings TO authenticated;
