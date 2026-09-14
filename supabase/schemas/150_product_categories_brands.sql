-- Produktkategorien (Shopify Standard Product Taxonomy) und Marken je Workspace.
--
-- Ladereihenfolge in supabase/config.toml: nach 140_purchase_package_contents.sql.
-- Nutzt public.is_workspace_member() aus database.sql und
-- public.protect_archived_workspace_data() aus 80_workspace_retention.sql.
--
-- Die Kategoriedaten stehen nicht hier, sondern in der von
-- scripts/import-shopify-taxonomy.mjs erzeugten Migration.

create table if not exists public.product_categories (
    id text primary key check (id ~ '^[a-z]{2}(-[0-9]+)*$'),
    parent_id text references public.product_categories (id),
    name text not null check (pg_catalog.btrim(name) <> ''),
    full_name text not null check (pg_catalog.btrim(full_name) <> ''),
    level smallint not null check (level between 1 and 12),
    is_leaf boolean not null default true,
    taxonomy_version text not null check (taxonomy_version ~ '^[0-9]{4}-[0-9]{2}$'),
    is_deprecated boolean not null default false,
    constraint product_categories_root_has_no_parent check ((level = 1) = (parent_id is null))
);

comment on table public.product_categories is
    'Kategoriebaum der Shopify Standard Product Taxonomy (deutsch), flach gespeichert. Die id ist die Shopify-Kennung, keine eigene.';
comment on column public.product_categories.full_name is
    'Voller Pfad wie "Elektronik > Computer > Laptops". Die Datenbank schreibt ihn in category von Artikeln und Katalogprodukten.';
comment on column public.product_categories.is_deprecated is
    'Von Shopify entfernt. Bleibt erhalten, weil Artikel weiter darauf verweisen dürfen; der Wähler zeigt sie nicht mehr an.';

alter table public.product_categories enable row level security;

create policy "Angemeldete lesen Produktkategorien" on public.product_categories
    for select to authenticated
    using (true);

-- Geschrieben wird ausschließlich per Migration. Anon bekommt kein Tabellenrecht.
revoke all on table public.product_categories from anon, authenticated;
grant select on table public.product_categories to authenticated;

create index if not exists idx_product_categories_parent on public.product_categories (parent_id);
create index if not exists idx_product_categories_deprecated on public.product_categories (is_deprecated);

create table if not exists public.brands (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces (id) on delete cascade,
    name text not null check (
        name = pg_catalog.btrim(name) and name <> '' and pg_catalog.length(name) <= 120
    ),
    name_key text generated always as (pg_catalog.lower(name)) stored,
    created_at timestamptz not null default now(),
    -- Beginnt mit workspace_id und deckt damit auch die Policies ab.
    constraint brands_workspace_name_key unique (workspace_id, name_key),
    constraint brands_workspace_id_key unique (workspace_id, id)
);

comment on table public.brands is
    'Marken je Workspace. Gleiche Schreibweisen ohne Groß-/Kleinunterschied sind nur einmal möglich.';

alter table public.brands enable row level security;

create policy "Marken lesen" on public.brands
    for select to authenticated
    using (public.is_workspace_member(workspace_id));
create policy "Marken anlegen" on public.brands
    for insert to authenticated
    with check (public.is_workspace_member(workspace_id));
create policy "Marken aendern" on public.brands
    for update to authenticated
    using (public.is_workspace_member(workspace_id))
    with check (public.is_workspace_member(workspace_id));
create policy "Marken loeschen" on public.brands
    for delete to authenticated
    using (public.is_workspace_member(workspace_id));

revoke all on table public.brands from anon, authenticated;
grant select, insert, update, delete on table public.brands to authenticated;

create trigger "00_protect_archived_workspace" before insert or update or delete on public.brands
for each row execute function public.protect_archived_workspace_data();

-- Verweise. "no action" verhindert wie "restrict" das Löschen benutzter Einträge,
-- prüft aber erst am Ende der Anweisung – so bleibt das kaskadierende Löschen eines
-- ganzen Workspace möglich.
alter table public.inventory_items
    add column if not exists category_id text references public.product_categories (id),
    add column if not exists brand_id uuid;
alter table public.catalog_products
    add column if not exists category_id text references public.product_categories (id),
    add column if not exists brand_id uuid;

alter table public.inventory_items
    add constraint inventory_items_workspace_brand_fkey
    foreign key (workspace_id, brand_id) references public.brands (workspace_id, id);
alter table public.catalog_products
    add constraint catalog_products_workspace_brand_fkey
    foreign key (workspace_id, brand_id) references public.brands (workspace_id, id);

create index if not exists idx_inventory_items_category on public.inventory_items (category_id);
create index if not exists idx_inventory_items_workspace_brand on public.inventory_items (workspace_id, brand_id);
create index if not exists idx_catalog_products_category on public.catalog_products (category_id);
create index if not exists idx_catalog_products_workspace_brand on public.catalog_products (workspace_id, brand_id);

-- Füllt category und brand aus den Verweisen.
--
-- Kategorie: Ein exakter vorhandener full_name wird in die Kennung aufgelöst.
-- Andere freie Texte werden nie ausgewertet (Nutzerentscheidung vom 14.09.2026).
-- Marke: Die Kennung hat Vorrang. Markentext wird nur ausgewertet, wenn beim Anlegen
-- keine Kennung mitkommt oder sich beim Ändern der Text ändert und die Kennung gleich
-- bleibt. So bleiben Paketerfassung, CSV-Import und Barcode-Übernahme unverändert.
create or replace function public.sync_category_brand_text()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brand_name text;
begin
  if (tg_op = 'INSERT' and new.brand_id is null)
    or (tg_op = 'UPDATE'
      and new.brand_id is not distinct from old.brand_id
      and new.brand is distinct from old.brand)
  then
    v_brand_name := pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(coalesce(new.brand, '')), 120));
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

  if new.category_id is null and new.category is not null then
    select category.id into new.category_id
    from public.product_categories as category
    where category.full_name = new.category
    order by category.id
    limit 1;
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
$$;

revoke execute on function public.sync_category_brand_text() from public, anon, authenticated, service_role;

-- "10_" läuft nach "00_protect_archived_workspace" und vor den fachlichen
-- Schutz-Triggern; keiner von ihnen prüft Kategorie oder Marke.
create trigger "10_sync_category_brand_text"
    before insert or update of category_id, brand_id, category, brand on public.inventory_items
    for each row execute function public.sync_category_brand_text();
create trigger "10_sync_category_brand_text"
    before insert or update of category_id, brand_id, category, brand on public.catalog_products
    for each row execute function public.sync_category_brand_text();

-- SECURITY DEFINER: guard_inventory_item_costing_fields verbietet angemeldeten
-- Nutzern jede Änderung an Artikeln abgeschlossener Einkäufe. Ohne erhöhte Rechte
-- scheiterte jede Umbenennung. Geändert wird nur der abgeleitete Markentext im
-- Workspace der Marke.
create or replace function public.sync_brand_name_to_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

alter function public.sync_brand_name_to_records() owner to postgres;
revoke execute on function public.sync_brand_name_to_records() from public, anon, authenticated, service_role;

create trigger sync_brand_name_to_records
    after update of name on public.brands
    for each row
    when (old.name is distinct from new.name)
    execute function public.sync_brand_name_to_records();

-- Für spätere Shopify-Versionen mit geänderten Pfaden. Archivierte Workspaces bleiben
-- unverändert, weil ihr Schutz auch postgres sperrt; ihr Text wird beim nächsten
-- Speichern nach einer Wiederherstellung neu gesetzt.
create or replace function public.sync_category_name_to_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

alter function public.sync_category_name_to_records() owner to postgres;
revoke execute on function public.sync_category_name_to_records() from public, anon, authenticated, service_role;

create trigger sync_category_name_to_records
    after update of full_name on public.product_categories
    for each row
    when (old.full_name is distinct from new.full_name)
    execute function public.sync_category_name_to_records();

-- Einmalige Übernahme freier Texte (Migration *_migrate_legacy_category_brand_texts).
--
-- DESTRUKTIV: Alle Kategorietexte ohne category_id werden geleert. Das hat der
-- Nutzer am 14.09.2026 ausdrücklich so entschieden (Option C): freie Texte passen
-- nicht verlässlich auf eine Shopify-Kategorie.
--
-- Marken: je Workspace eine Marke je Vergleichsform, Anzeigename ist die häufigste
-- Schreibweise, bei Gleichstand die alphabetisch erste.
--
-- Nur postgres ruft sie auf. "00_protect_archived_workspace" sperrt auch postgres
-- und wird deshalb innerhalb dieser Transaktion ab- und wieder eingeschaltet;
-- scheitert die Übernahme, rollt Postgres auch das Abschalten zurück. Die übrigen
-- Schutz-Trigger lassen postgres durch oder betreffen andere Spalten.
-- Die Funktion bleibt bestehen, damit der Datenbanktest sie mit Altbestand prüft.
create or replace function public.migrate_legacy_category_brand_texts()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  alter table public.inventory_items disable trigger "00_protect_archived_workspace";
  alter table public.catalog_products disable trigger "00_protect_archived_workspace";
  alter table public.brands disable trigger "00_protect_archived_workspace";

  with spellings as (
    select item.workspace_id, pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(item.brand), 120)) as name
    from public.inventory_items as item
    where pg_catalog.btrim(coalesce(item.brand, '')) <> ''
    union all
    select product.workspace_id, pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(product.brand), 120))
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
          and brand.name_key = pg_catalog.lower(pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(item.brand), 120)))
      )),
      category = null
  where item.brand is not null or item.category is not null;

  update public.catalog_products as product
  set brand_id = coalesce(product.brand_id, (
        select brand.id from public.brands as brand
        where brand.workspace_id = product.workspace_id
          and brand.name_key = pg_catalog.lower(pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(product.brand), 120)))
      )),
      category = null
  where product.brand is not null or product.category is not null;

  alter table public.inventory_items enable trigger "00_protect_archived_workspace";
  alter table public.catalog_products enable trigger "00_protect_archived_workspace";
  alter table public.brands enable trigger "00_protect_archived_workspace";
end;
$$;

revoke execute on function public.migrate_legacy_category_brand_texts() from public, anon, authenticated, service_role;
