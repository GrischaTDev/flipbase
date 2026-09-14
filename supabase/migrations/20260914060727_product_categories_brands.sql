-- Zweck: Tabellen für Produktkategorien (Shopify-Taxonomie) und Marken je Workspace,
-- Verweisspalten und Text-Synchronisierung an Artikeln und Katalogprodukten.
-- Betroffen: public.product_categories, public.brands (neu, RLS aktiv);
--   public.inventory_items und public.catalog_products (+ category_id, brand_id).
-- Erzeugt mit supabase db diff aus supabase/schemas/150_product_categories_brands.sql.
--
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.migrate_legacy_category_brand_texts()
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  alter table public.inventory_items disable trigger "00_protect_archived_workspace";
  alter table public.catalog_products disable trigger "00_protect_archived_workspace";
  alter table public.brands disable trigger "00_protect_archived_workspace";

  with spellings as (
    select item.workspace_id, pg_catalog.left(pg_catalog.btrim(item.brand), 120) as name
    from public.inventory_items as item
    where pg_catalog.btrim(coalesce(item.brand, '')) <> ''
    union all
    select product.workspace_id, pg_catalog.left(pg_catalog.btrim(product.brand), 120)
    from public.catalog_products as product
    where pg_catalog.btrim(coalesce(product.brand, '')) <> ''
  ),
  counted as (
    select spelling.workspace_id, spelling.name, pg_catalog.count(*) as uses
    from spellings as spelling
    group by spelling.workspace_id, spelling.name
  ),
  ranked as (
    select
      counted.workspace_id,
      counted.name,
      pg_catalog.row_number() over (
        partition by counted.workspace_id, pg_catalog.lower(counted.name)
        order by counted.uses desc, counted.name asc
      ) as position
    from counted
  )
  insert into public.brands (workspace_id, name)
  select ranked.workspace_id, ranked.name
  from ranked
  where ranked.position = 1
  on conflict (workspace_id, name_key) do nothing;

  -- Setzt category auf null; der Sync-Trigger berechnet den Text danach aus
  -- category_id neu. Mit Verweis bleibt der Pfad, ohne Verweis verschwindet der Text.
  update public.inventory_items as item
  set brand_id = coalesce(item.brand_id, (
        select brand.id from public.brands as brand
        where brand.workspace_id = item.workspace_id
          and brand.name_key = pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(item.brand), 120))
      )),
      category = null
  where item.brand is not null or item.category is not null;

  update public.catalog_products as product
  set brand_id = coalesce(product.brand_id, (
        select brand.id from public.brands as brand
        where brand.workspace_id = product.workspace_id
          and brand.name_key = pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(product.brand), 120))
      )),
      category = null
  where product.brand is not null or product.category is not null;

  alter table public.inventory_items enable trigger "00_protect_archived_workspace";
  alter table public.catalog_products enable trigger "00_protect_archived_workspace";
  alter table public.brands enable trigger "00_protect_archived_workspace";
end;
$function$;

REVOKE ALL ON FUNCTION public.migrate_legacy_category_brand_texts() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.sync_brand_name_to_records()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.inventory_items as item
  set brand = new.name
  where item.workspace_id = new.workspace_id
    and item.brand_id = new.id
    and item.brand is distinct from new.name;

  update public.catalog_products as product
  set brand = new.name
  where product.workspace_id = new.workspace_id
    and product.brand_id = new.id
    and product.brand is distinct from new.name;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.sync_brand_name_to_records() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.sync_category_brand_text()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_brand_name text;
begin
  if (tg_op = 'INSERT' and new.brand_id is null)
    or (tg_op = 'UPDATE'
      and new.brand_id is not distinct from old.brand_id
      and new.brand is distinct from old.brand)
  then
    v_brand_name := pg_catalog.left(pg_catalog.btrim(coalesce(new.brand, '')), 120);
    if v_brand_name = '' then
      new.brand_id := null;
    else
      insert into public.brands (workspace_id, name)
      values (new.workspace_id, v_brand_name)
      on conflict (workspace_id, name_key) do nothing;

      select brand.id into new.brand_id
      from public.brands as brand
      where brand.workspace_id = new.workspace_id
        and brand.name_key = pg_catalog.lower(v_brand_name);
    end if;
  end if;

  if new.brand_id is null then
    new.brand := null;
  else
    select brand.name into new.brand
    from public.brands as brand
    where brand.workspace_id = new.workspace_id
      and brand.id = new.brand_id;
  end if;

  if new.category_id is null then
    new.category := null;
  else
    select category.full_name into new.category
    from public.product_categories as category
    where category.id = new.category_id;
  end if;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.sync_category_brand_text() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.sync_category_name_to_records()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.inventory_items as item
  set category = new.full_name
  where item.category_id = new.id
    and item.category is distinct from new.full_name
    and not exists (
      select 1 from public.workspaces as workspace
      where workspace.id = item.workspace_id and workspace.archived_at is not null
    );

  update public.catalog_products as product
  set category = new.full_name
  where product.category_id = new.id
    and product.category is distinct from new.full_name
    and not exists (
      select 1 from public.workspaces as workspace
      where workspace.id = product.workspace_id and workspace.archived_at is not null
    );

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.sync_category_name_to_records() FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.brands (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  name         text                     NOT NULL,
  name_key     text                     GENERATED ALWAYS AS (lower(name)) STORED,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.brands IS 'Marken je Workspace. Gleiche Schreibweisen ohne Groß-/Kleinunterschied sind nur einmal möglich.';

ALTER TABLE public.brands
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_name_check CHECK (name = btrim(name) AND name <> ''::text AND length(name) <= 120);

ALTER TABLE public.brands
  ADD CONSTRAINT brands_pkey PRIMARY KEY (id);

ALTER TABLE public.brands
  ADD CONSTRAINT brands_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_workspace_id_key UNIQUE (workspace_id, id);

ALTER TABLE public.brands
  ADD CONSTRAINT brands_workspace_name_key UNIQUE (workspace_id, name_key);

GRANT ALL ON public.brands TO authenticated;

GRANT ALL ON public.brands TO service_role;

CREATE TRIGGER "00_protect_archived_workspace"
  BEFORE INSERT OR DELETE OR UPDATE ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_archived_workspace_data();

CREATE TRIGGER sync_brand_name_to_records
  AFTER UPDATE OF name ON public.brands
  FOR EACH ROW
  WHEN (old.name IS DISTINCT FROM new.name)
  EXECUTE FUNCTION public.sync_brand_name_to_records();

CREATE POLICY "Marken aendern" ON public.brands
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Marken anlegen" ON public.brands
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Marken lesen" ON public.brands
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Marken loeschen" ON public.brands
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.catalog_products
  ADD COLUMN category_id text;

ALTER TABLE public.catalog_products
  ADD COLUMN brand_id uuid;

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_workspace_brand_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES public.brands(workspace_id, id);

CREATE INDEX idx_catalog_products_workspace_brand ON public.catalog_products (workspace_id, brand_id);

CREATE INDEX idx_catalog_products_category ON public.catalog_products (category_id);

CREATE TRIGGER "10_sync_category_brand_text"
  BEFORE INSERT OR UPDATE OF category_id, brand_id, category, brand ON public.catalog_products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_category_brand_text();

ALTER TABLE public.inventory_items
  ADD COLUMN category_id text;

ALTER TABLE public.inventory_items
  ADD COLUMN brand_id uuid;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_workspace_brand_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES public.brands(workspace_id, id);

CREATE INDEX idx_inventory_items_category ON public.inventory_items (category_id);

CREATE INDEX idx_inventory_items_workspace_brand ON public.inventory_items (workspace_id, brand_id);

CREATE TRIGGER "10_sync_category_brand_text"
  BEFORE INSERT OR UPDATE OF category_id, brand_id, category, brand ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_category_brand_text();

CREATE TABLE public.product_categories (
  id               text     NOT NULL,
  parent_id        text,
  name             text     NOT NULL,
  full_name        text     NOT NULL,
  level            smallint NOT NULL,
  is_leaf          boolean  DEFAULT true NOT NULL,
  taxonomy_version text     NOT NULL,
  is_deprecated    boolean  DEFAULT false NOT NULL
);

COMMENT ON TABLE public.product_categories IS 'Kategoriebaum der Shopify Standard Product Taxonomy (deutsch), flach gespeichert. Die id ist die Shopify-Kennung, keine eigene.';

COMMENT ON COLUMN public.product_categories.full_name IS 'Voller Pfad wie "Elektronik > Computer > Laptops". Die Datenbank schreibt ihn in category von Artikeln und Katalogprodukten.';

COMMENT ON COLUMN public.product_categories.is_deprecated IS 'Von Shopify entfernt. Bleibt erhalten, weil Artikel weiter darauf verweisen dürfen; der Wähler zeigt sie nicht mehr an.';

ALTER TABLE public.product_categories
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_full_name_check CHECK (btrim(full_name) <> ''::text);

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_id_check CHECK (id ~ '^[a-z]{2}(-[0-9]+)*$'::text);

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_level_check CHECK (level >= 1 AND level <= 12);

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_name_check CHECK (btrim(name) <> ''::text);

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id);

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id);

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.product_categories(id);

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_root_has_no_parent CHECK ((level = 1) = (parent_id IS NULL));

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_taxonomy_version_check CHECK (taxonomy_version ~ '^[0-9]{4}-[0-9]{2}$'::text);

GRANT SELECT ON public.product_categories TO authenticated;

GRANT ALL ON public.product_categories TO service_role;

CREATE INDEX idx_product_categories_deprecated ON public.product_categories (is_deprecated);

CREATE INDEX idx_product_categories_parent ON public.product_categories (parent_id);

CREATE TRIGGER sync_category_name_to_records
  AFTER UPDATE OF full_name ON public.product_categories
  FOR EACH ROW
  WHEN (old.full_name IS DISTINCT FROM new.full_name)
  EXECUTE FUNCTION public.sync_category_name_to_records();

CREATE POLICY "Angemeldete lesen Produktkategorien" ON public.product_categories
  FOR SELECT
  TO authenticated
  USING (true);