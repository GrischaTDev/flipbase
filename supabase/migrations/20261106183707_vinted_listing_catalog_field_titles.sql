-- Zweck: Feldtitel wie bei Vinted im lokalen Katalog (z. B. „Rocklänge“), damit die Masken
-- Zusatzfelder einer Kategorie mit Vinteds Beschriftung zeigen. Betroffen: vinted_listing_category_fields
-- (neue Spalte title) und marketplace_save_vinted_listing_category_fields (speichert den Titel mit).
-- Die nachgetragenen Titel wurden am 06.11.2026 im Verkaufsformular gelesen. Nicht destruktiv.

alter table public.vinted_listing_category_fields
  add column title text check (title is null or char_length(btrim(title)) between 1 and 200);
comment on column public.vinted_listing_category_fields.title is 'Feldtitel wie bei Vinted, etwa "Rocklänge" oder "Material (empfohlen)"; leer bei Feldern ohne eigene Konfiguration.';

update public.vinted_listing_category_fields f set title = t.title
from (values
  ('size', 'Größe'),
  ('condition', 'Zustand'),
  ('material', 'Material (empfohlen)'),
  ('skirt_length', 'Rocklänge'),
  ('video_game_platform', 'Plattform'),
  ('video_game_ratings', 'Altersbeschränkung'),
  ('computer_operating_system', 'Betriebssystem (empfohlen)'),
  ('computer_storage_capacity', 'Speicherkapazität'),
  ('computer_ram', 'Arbeitsspeicher (RAM)'),
  ('computer_cpu_line', 'Prozessor (empfohlen)'),
  ('laptop_display_size', 'Bildschirmgröße (empfohlen)'),
  ('keyboard_layout', 'Tastatur-Layout (empfohlen)'),
  ('laptop_charger_included', 'Ladegerät inklusive'),
  ('internal_memory_capacity', 'Speicher'),
  ('sim_lock', 'SIM-Lock')
) as t(field_code, title)
where f.field_code = t.field_code and f.title is null;

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
      selection_type, selection_limit, display_type, option_ids, title)
    values(p_category_id, v_field->>'code', (v_field->>'position')::integer,
      (v_field->>'required')::boolean, v_field->>'selectionType', (v_field->>'limit')::integer,
      nullif(left(v_field->>'display', 40), ''), v_option_ids,
      nullif(left(btrim(coalesce(v_field->>'title', '')), 200), ''));
  end loop;
  update public.vinted_listing_categories set fields_observed_at = p_observed_at where id = p_category_id;
  return true;
end;
$$;
revoke all on function public.marketplace_save_vinted_listing_category_fields(integer, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_save_vinted_listing_category_fields(integer, timestamptz, jsonb) to service_role;
