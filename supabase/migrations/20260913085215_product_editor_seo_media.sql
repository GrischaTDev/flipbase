-- Produkt-SEO und atomare Galeriespeicherung für catalog_products/catalog_product_media.
-- Erzeugt mit supabase db diff; Rollenentzug nach Prüfung der vorhandenen Default-Rechte vervollständigt.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create function public.lock_catalog_product_media()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  perform 1 from public.catalog_products
    where id = case when tg_op = 'DELETE' then old.catalog_product_id else new.catalog_product_id end
      and workspace_id = case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end
    for update;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function public.lock_catalog_product_media() from public, anon, authenticated, service_role;

create function public.update_product_media_layout (
  p_product_id         uuid,
  p_ordered_media_ids  uuid[],
  p_expected_media_ids uuid[],
  p_workspace_id       uuid
)
  returns setof public.catalog_product_media
  language plpgsql
  set search_path to ''
  as $function$
declare v_current uuid[];
begin
  if (select auth.uid()) is null or not public.is_workspace_member(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Workspace ist nicht zugänglich.';
  end if;
  perform 1 from public.catalog_products where id = p_product_id and workspace_id = p_workspace_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Produkt ist nicht zugänglich.';
  end if;
  if p_ordered_media_ids is null or p_expected_media_ids is null
    or array_position(p_ordered_media_ids, null) is not null
    or array_position(p_expected_media_ids, null) is not null
    or cardinality(p_ordered_media_ids) <> (select count(distinct id) from unnest(p_ordered_media_ids) id)
    or cardinality(p_expected_media_ids) <> (select count(distinct id) from unnest(p_expected_media_ids) id)
    or not p_ordered_media_ids <@ p_expected_media_ids then
    raise exception using errcode = '22023', message = 'Die Bilderliste ist ungültig.';
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_current
    from public.catalog_product_media where catalog_product_id = p_product_id and workspace_id = p_workspace_id;
  if not (v_current @> p_expected_media_ids and v_current <@ p_expected_media_ids) then
    raise exception using errcode = '40001', message = 'Die Bilder wurden zwischenzeitlich geändert. Bitte erneut laden.';
  end if;
  -- Entfernt nur ausdrücklich abgewählte Metadaten. Dateien räumt der Client nach Erfolg auf.
  delete from public.catalog_product_media where catalog_product_id = p_product_id and workspace_id = p_workspace_id
    and not (id = any(p_ordered_media_ids));
  -- Partiellen Unique-Index vor Vergabe des neuen Hauptbildes freigeben.
  update public.catalog_product_media set is_primary = false
    where catalog_product_id = p_product_id and workspace_id = p_workspace_id and is_primary;
  update public.catalog_product_media m set sort_order = (selected.position - 1)::integer, is_primary = selected.position = 1
    from unnest(p_ordered_media_ids) with ordinality selected(id, position)
    where m.id = selected.id and m.workspace_id = p_workspace_id and m.catalog_product_id = p_product_id;
  return query select m.* from public.catalog_product_media m
    where m.catalog_product_id = p_product_id and m.workspace_id = p_workspace_id order by m.sort_order;
end;
$function$;

revoke all on function public.update_product_media_layout(uuid, uuid[], uuid[], uuid) from public, anon, authenticated, service_role;

grant all on function public.update_product_media_layout(uuid, uuid[], uuid[], uuid) to authenticated;

create trigger lock_catalog_product_media
  before insert or delete or update on public.catalog_product_media
  for each row
  execute function public.lock_catalog_product_media();

alter table public.catalog_products
  add column seo_title text;

alter table public.catalog_products
  add column seo_description text;

alter table public.catalog_products
  add column url_handle text;

alter table public.catalog_products
  add constraint catalog_products_url_handle_check check (url_handle is null or length(url_handle) <= 120 and url_handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text);