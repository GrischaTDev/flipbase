-- Zweck: Vinted-Katalog vor dem Einreihen von Veröffentlichungen und Relists prüfen.
-- Betroffen: marketplace_listing_jobs und einmalige Kategorieumstellung in marketplace_listing_drafts.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default
-- Gemeinsame Prüfung vor der Auftragsannahme, auch für geplante Relists und lokale Browser.
create or replace function public.marketplace_check_vinted_listing_catalog()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_content jsonb := new.snapshot->'content';
  v_category public.vinted_listing_categories;
  v_field record;
  v_value text;
  v_size_id bigint;
begin
  if new.action <> 'publish' then return new; end if;
  select * into v_category from public.vinted_listing_categories
    where id = (v_content->>'categoryId')::bigint;
  if not found then
    -- Ohne synchronisierten Verkaufsbaum bleibt die Prüfung im Anbieterformular zuständig.
    if not exists(select 1 from public.vinted_listing_categories) then return new; end if;
    raise exception 'Wähle im Entwurf eine aktuelle Vinted-Kategorie.' using errcode = 'PV001';
  end if;
  if not v_category.is_leaf then
    raise exception 'Wähle im Entwurf eine Vinted-Unterkategorie.' using errcode = 'PV001';
  end if;
  if v_category.fields_observed_at is null then return new; end if;

  v_size_id := (v_content->>'sizeId')::bigint;
  if exists(select 1 from public.vinted_listing_category_fields
    where category_id = v_category.id and field_code = 'size' and required)
    and v_size_id is null then
    raise exception 'Wähle eine Vinted-Größe für diese Kategorie.' using errcode = 'PV001';
  end if;
  if v_size_id is not null
    and exists(select 1 from public.vinted_listing_category_size_groups where category_id = v_category.id)
    and not exists(select 1 from public.vinted_listing_category_size_groups g
      join public.vinted_listing_sizes s using (size_group_id)
      where g.category_id = v_category.id and s.id = v_size_id) then
    raise exception 'Die gewählte Größe passt nicht zur Vinted-Kategorie.' using errcode = 'PV001';
  end if;

  for v_field in
    select f.required, f.option_ids, field.content_key, field.label
    from public.vinted_listing_category_fields f
    join (values ('condition', 'conditionId', 'Zustand'),
                 ('package', 'packageSizeId', 'Paketgröße'),
                 ('accessory_department', 'accessory_department', 'Zielgruppe'))
      field(code, content_key, label) on field.code = f.field_code
    where f.category_id = v_category.id
    order by f.position
  loop
    v_value := case when v_field.content_key = 'accessory_department'
      then v_content->'attributes'->>v_field.content_key else v_content->>v_field.content_key end;
    if (v_field.required and nullif(v_value, '') is null)
      or (nullif(v_value, '') is not null and v_field.option_ids is not null
        and not exists(select 1 from unnest(v_field.option_ids) id where id::text = v_value)) then
      raise exception 'Wähle im Entwurf einen gültigen Wert für „%“.', v_field.label using errcode = 'PV001';
    end if;
  end loop;

  -- Marken werden bei Vinted gesucht; der lokale Katalog enthält keine vollständige Markenliste.
  if nullif(btrim(v_content->>'brandLabel'), '') is null and (
    v_content->>'brandId' is not null or exists(select 1 from public.vinted_listing_category_fields
      where category_id = v_category.id and field_code = 'brand' and required)
  ) then
    raise exception 'Wähle die Marke im Entwurf erneut aus.' using errcode = 'PV001';
  end if;
  return new;
end;
$$;

revoke all on function public.marketplace_check_vinted_listing_catalog() from public, anon, authenticated;

create trigger marketplace_check_vinted_listing_catalog
before insert on public.marketplace_listing_jobs
for each row execute function public.marketplace_check_vinted_listing_catalog();

-- Vinted ersetzte die alte konkrete Kategorie „Tücher & Schals“. Nur ungesperrte Entwürfe
-- mit genau dieser alten Kategorie und passendem gespeicherten Namen werden übernommen.
update public.marketplace_listing_drafts d
set content = d.content || jsonb_build_object('categoryId', c.id, 'categoryLabel', c.full_title)
    || case when d.content->>'categoryLabel' = 'Damen > Accessoires > Tücher & Schals'
         and not coalesce((d.content->'attributes') ? 'accessory_department', false)
       then jsonb_build_object('attributes', coalesce(d.content->'attributes', '{}'::jsonb)
         || jsonb_build_object('accessory_department', '576', 'accessory_department_label', 'Damen'))
       else '{}'::jsonb end,
    revision = d.revision + 1,
    updated_at = clock_timestamp()
from public.vinted_listing_categories c
where d.deleted_at is null
  and d.content->>'categoryId' = '89'
  and d.content->>'categoryLabel' in ('Tücher & Schals', 'Damen > Accessoires > Tücher & Schals')
  and c.id = 5555 and c.title = 'Tücher & Schals' and c.is_leaf
  and not exists(select 1 from public.vinted_listing_categories old where old.id = 89)
  and not exists(select 1 from public.marketplace_listing_jobs j where j.draft_id = d.id
    and j.state in ('queued', 'paused', 'claimed', 'writing', 'outcome_unknown'));
