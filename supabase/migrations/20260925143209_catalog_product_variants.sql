-- Zweck: Artikelgruppen für Größen- und Farbvarianten mit eigener Produkt-ID.
-- Betroffen: public.catalog_product_groups, public.catalog_products.variant_group_id,
--            public.create_catalog_product_variant und zugehörige Trigger.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.create_catalog_product_variant (
  p_workspace_id  uuid,
  p_product_id    uuid,
  p_size          text,
  p_color         text,
  p_ean           text,
  p_sku           text,
  p_listing_price numeric
)
  RETURNS public.catalog_products
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_source public.catalog_products;
  v_variant public.catalog_products;
  v_group_id uuid;
begin
  select * into v_source from public.catalog_products
    where workspace_id = p_workspace_id and id = p_product_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Der Ausgangsartikel ist nicht zugänglich.';
  end if;
  if v_source.archived_at is not null then
    raise exception using errcode = '22023', message = 'Archivierte Artikel können keine neue Variante erhalten.';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_size, '')), '') is null
     and nullif(pg_catalog.btrim(coalesce(p_color, '')), '') is null then
    raise exception using errcode = '22023', message = 'Bitte Größe oder Farbe für die Variante angeben.';
  end if;
  if p_listing_price is not null and p_listing_price <= 0 then
    raise exception using errcode = '22023', message = 'Bitte einen positiven Shoppreis eingeben.';
  end if;

  v_group_id := v_source.variant_group_id;
  if v_group_id is null then
    v_group_id := v_source.id;
    insert into public.catalog_product_groups(id, workspace_id)
      values (v_group_id, p_workspace_id);
    update public.catalog_products set variant_group_id = v_group_id
      where id = v_source.id and workspace_id = p_workspace_id;
  end if;

  insert into public.catalog_products(
    workspace_id, variant_group_id, title, brand_id, model, category_id,
    tracking_mode, condition, condition_notes, size, color, material, ean, sku,
    description, seo_title, seo_description, url_handle,
    is_public_store, listing_price
  ) values (
    p_workspace_id, v_group_id, v_source.title, v_source.brand_id, v_source.model,
    v_source.category_id, v_source.tracking_mode, v_source.condition,
    v_source.condition_notes, nullif(pg_catalog.btrim(p_size), ''),
    nullif(pg_catalog.btrim(p_color), ''), v_source.material,
    nullif(pg_catalog.btrim(p_ean), ''),
    nullif(pg_catalog.btrim(p_sku), ''), v_source.description,
    v_source.seo_title, v_source.seo_description, v_source.url_handle,
    v_source.is_public_store, p_listing_price
  ) returning * into v_variant;
  return v_variant;
end;
$function$;

REVOKE ALL ON FUNCTION public.create_catalog_product_variant(uuid, uuid, text, text, text, text, numeric) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_catalog_product_variant(uuid, uuid, text, text, text, text, numeric) TO authenticated;

GRANT ALL ON FUNCTION public.create_catalog_product_variant(uuid, uuid, text, text, text, text, numeric) TO service_role;

CREATE FUNCTION public.prepare_catalog_product_variant()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_source public.catalog_products;
begin
  if new.variant_group_id is null then
    new.variant_group_id := new.id;
    insert into public.catalog_product_groups(id, workspace_id)
      values (new.variant_group_id, new.workspace_id);
  else
    select * into v_source from public.catalog_products
      where workspace_id = new.workspace_id and variant_group_id = new.variant_group_id
      order by created_at, id limit 1;
    if not found then
      raise exception using errcode = '22023', message = 'Die Artikelgruppe enthält keinen Ausgangsartikel.';
    end if;
    if v_source.archived_at is not null then
      raise exception using errcode = '22023', message = 'Archivierte Artikel können keine neue Variante erhalten.';
    end if;
    new.title := v_source.title;
    new.brand_id := v_source.brand_id;
    new.brand := v_source.brand;
    new.model := v_source.model;
    new.category_id := v_source.category_id;
    new.category := v_source.category;
    new.material := v_source.material;
    new.description := v_source.description;
    new.seo_title := v_source.seo_title;
    new.seo_description := v_source.seo_description;
    new.url_handle := v_source.url_handle;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.prepare_catalog_product_variant() FROM PUBLIC;

GRANT ALL ON FUNCTION public.prepare_catalog_product_variant() TO authenticated;

GRANT ALL ON FUNCTION public.prepare_catalog_product_variant() TO service_role;

CREATE FUNCTION public.sync_catalog_product_group()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if pg_catalog.pg_trigger_depth() > 1 then return null; end if;
  update public.catalog_products
    set title = new.title,
        brand_id = new.brand_id,
        model = new.model,
        category_id = new.category_id,
        material = new.material,
        description = new.description,
        seo_title = new.seo_title,
        seo_description = new.seo_description,
        url_handle = new.url_handle
    where workspace_id = new.workspace_id
      and variant_group_id = new.variant_group_id
      and id <> new.id;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.sync_catalog_product_group() FROM PUBLIC;

GRANT ALL ON FUNCTION public.sync_catalog_product_group() TO authenticated;

GRANT ALL ON FUNCTION public.sync_catalog_product_group() TO service_role;

CREATE TABLE public.catalog_product_groups (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.catalog_product_groups IS 'Verbindet Größen- und Farbvarianten eines Artikelmodells innerhalb eines Workspace.';

ALTER TABLE public.catalog_product_groups
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.catalog_product_groups
  ADD CONSTRAINT catalog_product_groups_pkey PRIMARY KEY (id);

ALTER TABLE public.catalog_product_groups
  ADD CONSTRAINT catalog_product_groups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.catalog_product_groups
  ADD CONSTRAINT catalog_product_groups_workspace_id_id_key UNIQUE (workspace_id, id);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.catalog_product_groups TO authenticated;

GRANT ALL ON public.catalog_product_groups TO service_role;

CREATE INDEX catalog_product_groups_workspace_idx ON public.catalog_product_groups (workspace_id);

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.catalog_product_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE POLICY "Artikelgruppen aendern" ON public.catalog_product_groups
  FOR UPDATE
  TO authenticated
  USING (( SELECT public.is_workspace_member(catalog_product_groups.workspace_id) AS is_workspace_member))
  WITH CHECK (( SELECT public.is_workspace_member(catalog_product_groups.workspace_id) AS is_workspace_member));

CREATE POLICY "Artikelgruppen anlegen" ON public.catalog_product_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (( SELECT public.is_workspace_member(catalog_product_groups.workspace_id) AS is_workspace_member));

CREATE POLICY "Artikelgruppen lesen" ON public.catalog_product_groups
  FOR SELECT
  TO authenticated
  USING (( SELECT public.is_workspace_member(catalog_product_groups.workspace_id) AS is_workspace_member));

CREATE POLICY "Artikelgruppen loeschen" ON public.catalog_product_groups
  FOR DELETE
  TO authenticated
  USING (( SELECT public.is_workspace_member(catalog_product_groups.workspace_id) AS is_workspace_member));

ALTER TABLE public.catalog_products
  ADD COLUMN variant_group_id uuid;

COMMENT ON COLUMN public.catalog_products.variant_group_id IS 'Gemeinsame Artikelgruppe. Jede Variante behält ihre eigene Produkt-ID und ihren eigenen Bestand.';

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_variant_group_fkey FOREIGN KEY (workspace_id, variant_group_id) REFERENCES public.catalog_product_groups(workspace_id, id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX catalog_products_variant_options_unique
  ON public.catalog_products (workspace_id, variant_group_id, lower(COALESCE(size, ''::text)), lower(COALESCE(color, ''::text)));

CREATE INDEX catalog_products_variant_group_idx ON public.catalog_products (workspace_id, variant_group_id);

CREATE TRIGGER "05_prepare_catalog_product_variant"
  BEFORE INSERT ON public.catalog_products
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_catalog_product_variant();

CREATE TRIGGER "20_sync_catalog_product_group"
  AFTER UPDATE OF title, brand_id, model, category_id, material, description, seo_title, seo_description, url_handle ON public.catalog_products
  FOR EACH ROW
  WHEN
    (old.title IS DISTINCT FROM new.title OR old.brand_id IS DISTINCT FROM new.brand_id OR old.model IS DISTINCT FROM new.model OR old.category_id IS DISTINCT FROM new.category_id
    OR old.material IS DISTINCT FROM new.material OR old.description IS DISTINCT FROM new.description OR old.seo_title IS DISTINCT FROM new.seo_title OR old.seo_description IS
    DISTINCT FROM new.seo_description OR old.url_handle IS DISTINCT FROM new.url_handle)
  EXECUTE FUNCTION public.sync_catalog_product_group();
