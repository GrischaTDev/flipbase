-- Gemeinsame Artikelgruppen für Größen- und Farbvarianten.
-- Betroffen: public.catalog_product_groups, public.catalog_products.variant_group_id.
-- Historische Artikel-IDs und ihre Einkaufs-/Verkaufsbezüge bleiben unverändert.

create table public.catalog_product_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

comment on table public.catalog_product_groups is
  'Verbindet Größen- und Farbvarianten eines Artikelmodells innerhalb eines Workspace.';

alter table public.catalog_product_groups enable row level security;

create policy "Artikelgruppen lesen" on public.catalog_product_groups
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy "Artikelgruppen anlegen" on public.catalog_product_groups
  for insert to authenticated with check ((select public.is_workspace_member(workspace_id)));
create policy "Artikelgruppen aendern" on public.catalog_product_groups
  for update to authenticated
  using ((select public.is_workspace_member(workspace_id)))
  with check ((select public.is_workspace_member(workspace_id)));
create policy "Artikelgruppen loeschen" on public.catalog_product_groups
  for delete to authenticated using ((select public.is_workspace_member(workspace_id)));

revoke all on public.catalog_product_groups from anon, authenticated;
grant select, insert, update, delete on public.catalog_product_groups to authenticated;

create index catalog_product_groups_workspace_idx
  on public.catalog_product_groups(workspace_id);

create trigger "00_protect_archived_workspace" before insert or update or delete
  on public.catalog_product_groups for each row
  execute function public.protect_archived_workspace_data();

alter table public.catalog_products add column variant_group_id uuid;

alter table public.catalog_products
  add constraint catalog_products_variant_group_fkey
  foreign key (workspace_id, variant_group_id)
  references public.catalog_product_groups(workspace_id, id)
  on delete restrict;

create index catalog_products_variant_group_idx
  on public.catalog_products(workspace_id, variant_group_id);

create unique index catalog_products_variant_options_unique
  on public.catalog_products(
    workspace_id,
    variant_group_id,
    pg_catalog.lower(coalesce(size, '')),
    pg_catalog.lower(coalesce(color, ''))
  );

comment on column public.catalog_products.variant_group_id is
  'Gemeinsame Artikelgruppe. Jede Variante behält ihre eigene Produkt-ID und ihren eigenen Bestand.';

-- Bestehende Artikel ohne Gruppe gelten als Einzelgruppe. Erst beim Hinzufügen
-- einer Variante wird ihre unveränderte ID zur Gruppenkennung.

create function public.prepare_catalog_product_variant()
returns trigger language plpgsql security invoker set search_path = '' as $$
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
$$;

create trigger "05_prepare_catalog_product_variant" before insert on public.catalog_products
for each row execute function public.prepare_catalog_product_variant();

create function public.create_catalog_product_variant(
  p_workspace_id uuid,
  p_product_id uuid,
  p_size text,
  p_color text,
  p_ean text,
  p_sku text,
  p_listing_price numeric
)
returns public.catalog_products language plpgsql security invoker set search_path = '' as $$
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
$$;

revoke execute on function public.create_catalog_product_variant(
  uuid, uuid, text, text, text, text, numeric
) from public, anon;
grant execute on function public.create_catalog_product_variant(
  uuid, uuid, text, text, text, text, numeric
) to authenticated;

create function public.sync_catalog_product_group()
returns trigger language plpgsql security invoker set search_path = '' as $$
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
$$;

create trigger "20_sync_catalog_product_group" after update of
  title, brand_id, model, category_id, material, description,
  seo_title, seo_description, url_handle on public.catalog_products
for each row when (
  old.title is distinct from new.title
  or old.brand_id is distinct from new.brand_id
  or old.model is distinct from new.model
  or old.category_id is distinct from new.category_id
  or old.material is distinct from new.material
  or old.description is distinct from new.description
  or old.seo_title is distinct from new.seo_title
  or old.seo_description is distinct from new.seo_description
  or old.url_handle is distinct from new.url_handle
)
execute function public.sync_catalog_product_group();

revoke execute on function public.prepare_catalog_product_variant() from public, anon;
revoke execute on function public.sync_catalog_product_group() from public, anon;
