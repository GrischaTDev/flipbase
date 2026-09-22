-- Ergänzt den Artikelstamm um operative Produktmerkmale.
-- Betroffen: public.catalog_products.

alter table public.catalog_products
  add column if not exists sku text,
  add column if not exists size text,
  add column if not exists color text,
  add column if not exists material text;

alter table public.catalog_products
  add constraint catalog_products_sku_format
    check (sku is null or (sku = pg_catalog.btrim(sku) and sku <> '' and pg_catalog.length(sku) <= 80)),
  add constraint catalog_products_size_format
    check (size is null or (size = pg_catalog.btrim(size) and size <> '' and pg_catalog.length(size) <= 80)),
  add constraint catalog_products_color_format
    check (color is null or (color = pg_catalog.btrim(color) and color <> '' and pg_catalog.length(color) <= 120)),
  add constraint catalog_products_material_format
    check (material is null or (material = pg_catalog.btrim(material) and material <> '' and pg_catalog.length(material) <= 200));

comment on column public.catalog_products.sku is 'Optionale interne Artikelnummer.';
comment on column public.catalog_products.size is 'Optionale Größenangabe des Produkts.';
comment on column public.catalog_products.color is 'Optionale Farbangabe des Produkts.';
comment on column public.catalog_products.material is 'Optionale Materialangabe des Produkts.';

create index if not exists idx_catalog_products_workspace_sku
  on public.catalog_products (workspace_id, sku)
  where sku is not null;

create or replace function public.replace_and_delete_brand(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_replacement_brand_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
  v_step_changed integer := 0;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_brand_id is null or p_replacement_brand_id = p_brand_id then
    raise exception using errcode = '22023', message = 'Die Markenänderung ist ungültig.';
  end if;

  perform 1
  from public.brands
  where workspace_id = p_workspace_id and id = p_brand_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Die Marke wurde nicht gefunden.';
  end if;

  if p_replacement_brand_id is not null then
    perform 1
    from public.brands
    where workspace_id = p_workspace_id and id = p_replacement_brand_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Die Ersatzmarke wurde nicht gefunden.';
    end if;
  end if;

  update public.catalog_products
  set brand_id = p_replacement_brand_id,
      updated_at = now()
  where workspace_id = p_workspace_id and brand_id = p_brand_id;
  get diagnostics v_changed = row_count;

  update public.inventory_items
  set brand_id = p_replacement_brand_id,
      updated_at = now()
  where workspace_id = p_workspace_id and brand_id = p_brand_id;
  get diagnostics v_step_changed = row_count;
  v_changed := v_changed + v_step_changed;

  delete from public.brands
  where workspace_id = p_workspace_id and id = p_brand_id;

  return pg_catalog.jsonb_build_object('deleted', true, 'reassigned', v_changed);
end;
$$;

revoke all on function public.replace_and_delete_brand(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_and_delete_brand(uuid, uuid, uuid)
  to authenticated;
