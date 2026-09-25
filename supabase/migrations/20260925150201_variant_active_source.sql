-- Zweck: Neue Varianten auch nach Archivierung der ersten Ausführung anlegen.
-- Betroffen: public.prepare_catalog_product_variant() für public.catalog_products.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.prepare_catalog_product_variant()
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
        and archived_at is null
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
