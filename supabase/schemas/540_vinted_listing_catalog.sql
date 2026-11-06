-- Lokaler Vinted-Katalog für Erstellen, Bearbeiten und Relisten.
--
-- Verkaufsbaum, Felder je Kategorie und alle Auswahlwerte stehen hier mit Vinteds
-- Originalkennungen. Die Oberfläche liest ausschließlich diese Tabellen; Vinted wird erst
-- beim Absenden abgeglichen. Der Katalog ist für alle Konten gleich (vinted.de) und hat
-- deshalb keinen Konto- oder Arbeitsbereichsbezug. Geschrieben wird nur vom Worker über
-- die Funktionen unten. Quellen und Nachweis: docs/implementation/vinted-local-catalog.md.

create table public.vinted_listing_categories (
  id integer primary key check (id > 0),
  parent_id integer references public.vinted_listing_categories(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  full_title text not null check (char_length(btrim(full_title)) between 1 and 300),
  path text not null check (char_length(path) <= 2000),
  position integer not null check (position >= 0),
  is_leaf boolean not null,
  restricted_to_status_id integer,
  tree_observed_at timestamptz not null,
  fields_observed_at timestamptz,
  check (parent_id is null or parent_id <> id)
);
comment on table public.vinted_listing_categories is 'Vinteds Verkaufsbaum (item_upload/catalogs) mit Originalkennungen; Grundlage der Kategorieauswahl beim Inserieren.';
comment on column public.vinted_listing_categories.path is 'Pfad der Elternkategorien wie bei Vinted, etwa "Herren > Kleidung > Jeans".';
comment on column public.vinted_listing_categories.fields_observed_at is 'Zeitpunkt der zuletzt gespeicherten Felder dieser Kategorie; leer, solange keine gelesen wurden.';
create index vinted_listing_categories_parent on public.vinted_listing_categories(parent_id);

create table public.vinted_listing_size_groups (
  id integer primary key check (id > 0),
  title text not null check (char_length(btrim(title)) between 1 and 200)
);
comment on table public.vinted_listing_size_groups is 'Vinteds Größengruppen wie "S/M/L", "EU" oder "Hosen für Herren"; mehrere Kategorien teilen sich eine Gruppe.';

create table public.vinted_listing_sizes (
  id integer primary key check (id > 0),
  size_group_id integer not null references public.vinted_listing_size_groups(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  position integer not null check (position >= 0)
);
comment on table public.vinted_listing_sizes is 'Größen mit Vinteds Kennung und exakter Bezeichnung, etwa 1640 "W32 | DE 48".';
create index vinted_listing_sizes_group on public.vinted_listing_sizes(size_group_id, position);

-- Kennungen sind nur je Merkmal eindeutig (Farbe 1 ist nicht Zustand 1), daher kein eigenes id-Feld.
create table public.vinted_listing_options (
  field_code text not null check (field_code ~ '^[a-z][a-z0-9_]{0,39}$' and field_code <> 'size'),
  id integer not null check (id > 0),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  position integer not null check (position >= 0),
  hex text check (hex is null or hex ~ '^[0-9A-Fa-f]{6}$'),
  color_code text check (color_code is null or char_length(color_code) between 1 and 40),
  primary key (field_code, id)
);
comment on table public.vinted_listing_options is 'Auswahlwerte außer Größen je Merkmal (Zustand, Farbe, Material, Zielgruppe, Paketgröße) mit Vinteds Kennungen.';

create table public.vinted_listing_category_fields (
  category_id integer not null references public.vinted_listing_categories(id) on delete cascade,
  field_code text not null check (field_code ~ '^[a-z][a-z0-9_]{0,39}$'),
  position integer not null check (position >= 0),
  required boolean,
  selection_type text check (selection_type is null or selection_type in ('single', 'multi')),
  selection_limit integer check (selection_limit is null or selection_limit between 1 and 100),
  display_type text check (display_type is null or char_length(display_type) between 1 and 40),
  option_ids integer[] check (option_ids is null or cardinality(option_ids) <= 1000),
  primary key (category_id, field_code)
);
comment on table public.vinted_listing_category_fields is 'Felder einer Kategorie in Vinteds Reihenfolge mit Pflicht, Auswahlart und Höchstanzahl.';
comment on column public.vinted_listing_category_fields.option_ids is 'Erlaubte Werte aus vinted_listing_options in Vinteds Reihenfolge; leer heißt alle Werte des Merkmals (z. B. Farben). Größen stehen in vinted_listing_category_size_groups.';

create table public.vinted_listing_category_size_groups (
  category_id integer not null references public.vinted_listing_categories(id) on delete cascade,
  size_group_id integer not null references public.vinted_listing_size_groups(id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (category_id, size_group_id)
);
comment on table public.vinted_listing_category_size_groups is 'Größengruppen, die Vinted für eine Kategorie anbietet, in Vinteds Reihenfolge.';
create index vinted_listing_category_size_groups_group on public.vinted_listing_category_size_groups(size_group_id);

-- Lesen darf jeder Angemeldete: Der Katalog enthält keine Nutzer- oder Kontodaten.
-- Schreib-Policies gibt es absichtlich nicht; nur der Dienstschlüssel schreibt über die Funktionen.
alter table public.vinted_listing_categories enable row level security;
alter table public.vinted_listing_size_groups enable row level security;
alter table public.vinted_listing_sizes enable row level security;
alter table public.vinted_listing_options enable row level security;
alter table public.vinted_listing_category_fields enable row level security;
alter table public.vinted_listing_category_size_groups enable row level security;

revoke all on public.vinted_listing_categories, public.vinted_listing_size_groups, public.vinted_listing_sizes,
  public.vinted_listing_options, public.vinted_listing_category_fields, public.vinted_listing_category_size_groups
  from public, anon, authenticated;
grant select on public.vinted_listing_categories, public.vinted_listing_size_groups, public.vinted_listing_sizes,
  public.vinted_listing_options, public.vinted_listing_category_fields, public.vinted_listing_category_size_groups
  to authenticated;
grant all on public.vinted_listing_categories, public.vinted_listing_size_groups, public.vinted_listing_sizes,
  public.vinted_listing_options, public.vinted_listing_category_fields, public.vinted_listing_category_size_groups
  to service_role;

create policy "Signed-in users read Vinted listing categories" on public.vinted_listing_categories
  for select to authenticated using (true);
create policy "Signed-in users read Vinted size groups" on public.vinted_listing_size_groups
  for select to authenticated using (true);
create policy "Signed-in users read Vinted sizes" on public.vinted_listing_sizes
  for select to authenticated using (true);
create policy "Signed-in users read Vinted listing options" on public.vinted_listing_options
  for select to authenticated using (true);
create policy "Signed-in users read Vinted category fields" on public.vinted_listing_category_fields
  for select to authenticated using (true);
create policy "Signed-in users read Vinted category size groups" on public.vinted_listing_category_size_groups
  for select to authenticated using (true);

-- Ersetzt den Verkaufsbaum vollständig. Kategorien, die Vinted nicht mehr anbietet, entfallen
-- samt ihren Feldern. Ein älterer Lesestand überschreibt keinen neueren.
create or replace function public.marketplace_save_vinted_listing_categories(
  p_observed_at timestamptz, p_categories jsonb
) returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_observed_at is null or p_observed_at > clock_timestamp() + interval '5 minutes'
    or p_categories is null or jsonb_typeof(p_categories) <> 'array'
    or jsonb_array_length(p_categories) not between 1 and 10000
  then raise exception 'Invalid Vinted listing categories'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_categories) n
    where jsonb_typeof(n) <> 'object'
      or jsonb_typeof(n->'id') <> 'number' or (n->>'id') !~ '^[1-9][0-9]{0,9}$'
      or (n->'parentId' is not null and jsonb_typeof(n->'parentId') <> 'null'
        and (jsonb_typeof(n->'parentId') <> 'number' or (n->>'parentId') !~ '^[1-9][0-9]{0,9}$'))
      or jsonb_typeof(n->'title') <> 'string' or jsonb_typeof(n->'fullTitle') <> 'string'
      or jsonb_typeof(n->'path') <> 'string' or jsonb_typeof(n->'isLeaf') <> 'boolean'
      or jsonb_typeof(n->'position') <> 'number' or (n->>'position') !~ '^[0-9]{1,9}$'
      or (n->'restrictedToStatusId' is not null and jsonb_typeof(n->'restrictedToStatusId') not in ('null', 'number'))
  ) then raise exception 'Invalid Vinted listing categories'; end if;
  drop table if exists pg_temp.vinted_listing_category_input;
  create temporary table vinted_listing_category_input on commit drop as
  select (n->>'id')::bigint as id, nullif(n->>'parentId', '')::bigint as parent_id,
    btrim(n->>'title') as title, btrim(n->>'fullTitle') as full_title, n->>'path' as path,
    (n->>'position')::integer as position, (n->>'isLeaf')::boolean as is_leaf,
    nullif(n->>'restrictedToStatusId', '')::bigint as restricted_to_status_id
  from jsonb_array_elements(p_categories) n;
  if exists (select 1 from pg_temp.vinted_listing_category_input where id > 2147483647 or parent_id > 2147483647)
    or (select count(*) <> count(distinct id) from pg_temp.vinted_listing_category_input)
    or exists (select 1 from pg_temp.vinted_listing_category_input c where c.parent_id is not null
      and not exists (select 1 from pg_temp.vinted_listing_category_input p where p.id = c.parent_id))
    or exists (select 1 from pg_temp.vinted_listing_category_input c where c.is_leaf
      and exists (select 1 from pg_temp.vinted_listing_category_input k where k.parent_id = c.id))
    or exists (select 1 from pg_temp.vinted_listing_category_input c where not c.is_leaf
      and not exists (select 1 from pg_temp.vinted_listing_category_input k where k.parent_id = c.id))
  then raise exception 'Invalid Vinted listing categories'; end if;
  if exists (select 1 from public.vinted_listing_categories where tree_observed_at > p_observed_at)
  then return 0; end if;
  delete from public.vinted_listing_categories c
  where not exists (select 1 from pg_temp.vinted_listing_category_input i where i.id = c.id);
  insert into public.vinted_listing_categories(id, parent_id, title, full_title, path, position, is_leaf,
    restricted_to_status_id, tree_observed_at)
  select id::integer, parent_id::integer, title, full_title, path, position, is_leaf,
    restricted_to_status_id::integer, p_observed_at
  from pg_temp.vinted_listing_category_input
  on conflict (id) do update set parent_id = excluded.parent_id, title = excluded.title,
    full_title = excluded.full_title, path = excluded.path, position = excluded.position,
    is_leaf = excluded.is_leaf, restricted_to_status_id = excluded.restricted_to_status_id,
    tree_observed_at = excluded.tree_observed_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.marketplace_save_vinted_listing_categories(timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_save_vinted_listing_categories(timestamptz, jsonb) to service_role;

-- Speichert die Felder einer Endkategorie samt Größengruppen und Auswahlwerten.
-- p_fields: [{code, position, required, selectionType, limit, display,
--   sizeGroups?: [{id, title, sizes: [{id, title}]}], options?: [{id, title, hex?, code?}]}]
create or replace function public.marketplace_save_vinted_listing_category_fields(
  p_category_id integer, p_observed_at timestamptz, p_fields jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_field jsonb; v_group jsonb; v_option jsonb; v_size jsonb;
  v_option_ids integer[]; v_index integer; v_codes text[] := '{}';
begin
  if p_category_id is null or p_observed_at is null or p_observed_at > clock_timestamp() + interval '5 minutes'
    or p_fields is null or jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) > 50
  then raise exception 'Invalid Vinted category fields'; end if;
  perform 1 from public.vinted_listing_categories c where c.id = p_category_id and c.is_leaf for update;
  if not found then raise exception 'Unknown Vinted listing category'; end if;
  if exists (select 1 from public.vinted_listing_categories c where c.id = p_category_id
    and c.fields_observed_at > p_observed_at) then return false; end if;
  for v_field in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(v_field) <> 'object' or jsonb_typeof(v_field->'code') <> 'string'
      or (v_field->>'code') !~ '^[a-z][a-z0-9_]{0,39}$' or (v_field->>'code') = any(v_codes)
      or jsonb_typeof(v_field->'position') <> 'number' or (v_field->>'position') !~ '^[0-9]{1,4}$'
      or jsonb_typeof(coalesce(v_field->'required', 'null')) not in ('null', 'boolean')
      or coalesce(v_field->>'selectionType', 'single') not in ('single', 'multi')
      or jsonb_typeof(coalesce(v_field->'limit', 'null')) not in ('null', 'number')
      or (v_field->'limit' is not null and jsonb_typeof(v_field->'limit') = 'number'
        and (v_field->>'limit') !~ '^[1-9][0-9]?$')
      or ((v_field->>'code') = 'size') <> (v_field->'sizeGroups' is not null)
      or (v_field->'sizeGroups' is not null and (jsonb_typeof(v_field->'sizeGroups') <> 'array'
        or jsonb_array_length(v_field->'sizeGroups') not between 1 and 30))
      or (v_field->'options' is not null and (jsonb_typeof(v_field->'options') <> 'array'
        or jsonb_array_length(v_field->'options') > 1000 or (v_field->>'code') = 'size'))
    then raise exception 'Invalid Vinted category fields'; end if;
    v_codes := v_codes || (v_field->>'code');
    for v_group in select value from jsonb_array_elements(coalesce(v_field->'sizeGroups', '[]')) loop
      if jsonb_typeof(v_group->'id') <> 'number' or (v_group->>'id') !~ '^[1-9][0-9]{0,8}$'
        or jsonb_typeof(v_group->'title') <> 'string' or char_length(btrim(v_group->>'title')) not between 1 and 200
        or jsonb_typeof(v_group->'sizes') <> 'array' or jsonb_array_length(v_group->'sizes') not between 1 and 500
      then raise exception 'Invalid Vinted category fields'; end if;
      for v_size in select value from jsonb_array_elements(v_group->'sizes') loop
        if jsonb_typeof(v_size->'id') <> 'number' or (v_size->>'id') !~ '^[1-9][0-9]{0,8}$'
          or jsonb_typeof(v_size->'title') <> 'string' or char_length(btrim(v_size->>'title')) not between 1 and 200
        then raise exception 'Invalid Vinted category fields'; end if;
      end loop;
    end loop;
    for v_option in select value from jsonb_array_elements(coalesce(v_field->'options', '[]')) loop
      if jsonb_typeof(v_option->'id') <> 'number' or (v_option->>'id') !~ '^[1-9][0-9]{0,8}$'
        or jsonb_typeof(v_option->'title') <> 'string' or char_length(btrim(v_option->>'title')) not between 1 and 200
      then raise exception 'Invalid Vinted category fields'; end if;
    end loop;
  end loop;

  delete from public.vinted_listing_category_fields f where f.category_id = p_category_id;
  delete from public.vinted_listing_category_size_groups g where g.category_id = p_category_id;
  for v_field in select value from jsonb_array_elements(p_fields) loop
    v_option_ids := null;
    v_index := 0;
    for v_group in select value from jsonb_array_elements(coalesce(v_field->'sizeGroups', '[]')) loop
      insert into public.vinted_listing_size_groups(id, title)
      values((v_group->>'id')::integer, btrim(v_group->>'title'))
      on conflict (id) do update set title = excluded.title;
      insert into public.vinted_listing_sizes(id, size_group_id, title, position)
      select (s.value->>'id')::integer, (v_group->>'id')::integer, btrim(s.value->>'title'), (s.ordinality - 1)::integer
      from jsonb_array_elements(v_group->'sizes') with ordinality s
      on conflict (id) do update set size_group_id = excluded.size_group_id, title = excluded.title,
        position = excluded.position;
      insert into public.vinted_listing_category_size_groups(category_id, size_group_id, position)
      values(p_category_id, (v_group->>'id')::integer, v_index);
      v_index := v_index + 1;
    end loop;
    if v_field->'options' is not null then
      insert into public.vinted_listing_options(field_code, id, title, position, hex, color_code)
      select v_field->>'code', (o.value->>'id')::integer, btrim(o.value->>'title'), (o.ordinality - 1)::integer,
        nullif(o.value->>'hex', ''), nullif(o.value->>'code', '')
      from jsonb_array_elements(v_field->'options') with ordinality o
      on conflict (field_code, id) do update set title = excluded.title, position = excluded.position,
        hex = coalesce(excluded.hex, vinted_listing_options.hex),
        color_code = coalesce(excluded.color_code, vinted_listing_options.color_code);
      select coalesce(array_agg((o.value->>'id')::integer order by o.ordinality), '{}')
      into v_option_ids from jsonb_array_elements(v_field->'options') with ordinality o;
    end if;
    insert into public.vinted_listing_category_fields(category_id, field_code, position, required,
      selection_type, selection_limit, display_type, option_ids)
    values(p_category_id, v_field->>'code', (v_field->>'position')::integer,
      (v_field->>'required')::boolean, v_field->>'selectionType', (v_field->>'limit')::integer,
      nullif(left(v_field->>'display', 40), ''), v_option_ids);
  end loop;
  update public.vinted_listing_categories set fields_observed_at = p_observed_at where id = p_category_id;
  return true;
end;
$$;
revoke all on function public.marketplace_save_vinted_listing_category_fields(integer, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_save_vinted_listing_category_fields(integer, timestamptz, jsonb) to service_role;

-- Speichert eine merkmalsweite Liste wie die Farben (item_upload/colors) oder Paketgrößen.
create or replace function public.marketplace_save_vinted_listing_options(
  p_field_code text, p_options jsonb
) returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_field_code is null or p_field_code !~ '^[a-z][a-z0-9_]{0,39}$' or p_field_code = 'size'
    or p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 1 and 1000
    or exists (select 1 from jsonb_array_elements(p_options) o
      where jsonb_typeof(o->'id') <> 'number' or (o->>'id') !~ '^[1-9][0-9]{0,8}$'
        or jsonb_typeof(o->'title') <> 'string' or char_length(btrim(o->>'title')) not between 1 and 200
        or (o->'hex' is not null and jsonb_typeof(o->'hex') <> 'null'
          and coalesce(o->>'hex', '') !~ '^([0-9A-Fa-f]{6})?$'))
    or (select count(*) <> count(distinct o->>'id') from jsonb_array_elements(p_options) o)
  then raise exception 'Invalid Vinted listing options'; end if;
  insert into public.vinted_listing_options(field_code, id, title, position, hex, color_code)
  select p_field_code, (o.value->>'id')::integer, btrim(o.value->>'title'), (o.ordinality - 1)::integer,
    nullif(o.value->>'hex', ''), nullif(o.value->>'code', '')
  from jsonb_array_elements(p_options) with ordinality o
  on conflict (field_code, id) do update set title = excluded.title, position = excluded.position,
    hex = excluded.hex, color_code = excluded.color_code;
  get diagnostics v_count = row_count;
  -- Werte, die Vinted nicht mehr anbietet, entfallen.
  delete from public.vinted_listing_options v where v.field_code = p_field_code
    and not exists (select 1 from jsonb_array_elements(p_options) o where (o->>'id')::integer = v.id);
  return v_count;
end;
$$;
revoke all on function public.marketplace_save_vinted_listing_options(text, jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_save_vinted_listing_options(text, jsonb) to service_role;
