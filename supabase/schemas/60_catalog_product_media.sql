-- Produktmedien speichern ausschließlich private, kanonische Storage-Pfade.
create function public.is_catalog_product_media_path(p_path text, p_workspace_id uuid, p_product_id uuid)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select p_path ~ ('^catalog-products/' || p_workspace_id::text || '/' || p_product_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$');
$$;

revoke all on function public.is_catalog_product_media_path(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.is_catalog_product_media_path(text,uuid,uuid) to authenticated,service_role;

create table public.catalog_product_media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  catalog_product_id uuid not null,
  storage_path text not null unique,
  is_primary boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  file_name text,
  file_size integer check (file_size >= 0),
  mime_type text,
  created_at timestamptz not null default now(),
  alt_text text check (pg_catalog.char_length(alt_text) <= 500),
  foreign key (workspace_id,catalog_product_id)
    references public.catalog_products(workspace_id,id) on delete restrict,
  unique (workspace_id,id),
  unique (workspace_id,catalog_product_id,storage_path),
  constraint catalog_product_media_storage_path_check
    check (public.is_catalog_product_media_path(storage_path,workspace_id,catalog_product_id))
);

comment on table public.catalog_product_media is
  'Private Produktbilder: dauerhafte Storage-Pfade und Metadaten, niemals signierte URLs. Legacy-Itemmedien bleiben unverändert.';

create unique index catalog_product_media_primary_idx
  on public.catalog_product_media(workspace_id,catalog_product_id) where is_primary;
create index catalog_product_media_load_idx
  on public.catalog_product_media(workspace_id,catalog_product_id,is_primary desc,sort_order,created_at,id);

create function public.protect_catalog_product_media_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Mitgliedschaft in mehreren Workspaces berechtigt nicht zum Umhängen.
  if (new.id,new.workspace_id,new.catalog_product_id,new.storage_path)
    is distinct from (old.id,old.workspace_id,old.catalog_product_id,old.storage_path) then
    raise exception using errcode = '42501',
      message = 'Die Identität eines Produktmediums darf nicht geändert werden.';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_catalog_product_media_identity() from public,anon,authenticated,service_role;
create trigger protect_catalog_product_media_identity
  before update on public.catalog_product_media
  for each row execute function public.protect_catalog_product_media_identity();

alter table public.catalog_product_media enable row level security;
revoke all on table public.catalog_product_media from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.catalog_product_media to authenticated;

create policy "Produktmedien lesen" on public.catalog_product_media
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy "Produktmedien anlegen" on public.catalog_product_media
  for insert to authenticated with check ((select public.is_workspace_member(workspace_id)));
create policy "Produktmedien aendern" on public.catalog_product_media
  for update to authenticated
  using ((select public.is_workspace_member(workspace_id)))
  with check ((select public.is_workspace_member(workspace_id)));
create policy "Produktmedien loeschen" on public.catalog_product_media
  for delete to authenticated using ((select public.is_workspace_member(workspace_id)));

-- Die Storage-Laufzeit muss Operationshelfer mitbringen. Kein Ersatz im fremden Schema.
-- remove([exactPath]) braucht SELECT bereits vor dem Metadateninsert; die Ausnahme
-- gilt nur für Löschen, niemals für Download, Signieren oder Listen.
create policy "Produktmedien lesen" on storage.objects
  for select to authenticated using (
    bucket_id = 'item-media'
    and exists (
      select 1 from public.catalog_products p
      where p.workspace_id::text = (storage.foldername(name))[2]
        and p.id::text = (storage.foldername(name))[3]
        and public.is_catalog_product_media_path(name,p.workspace_id,p.id)
        and (select public.is_workspace_member(p.workspace_id))
    )
    and (
      exists (select 1 from public.catalog_product_media m where m.storage_path = name)
      or storage.allow_only_operation('object.delete')
      or storage.allow_only_operation('object.delete_many')
    )
  );

create policy "Produktmedien hochladen" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'item-media'
    and exists (
      select 1 from public.catalog_products p
      where p.workspace_id::text = (storage.foldername(name))[2]
        and p.id::text = (storage.foldername(name))[3]
        and public.is_catalog_product_media_path(name,p.workspace_id,p.id)
        and (select public.is_workspace_member(p.workspace_id))
    )
  );

create policy "Produktmedien aendern" on storage.objects
  for update to authenticated using (
    bucket_id = 'item-media'
    and exists (
      select 1 from public.catalog_products p
      where p.workspace_id::text = (storage.foldername(name))[2]
        and p.id::text = (storage.foldername(name))[3]
        and public.is_catalog_product_media_path(name,p.workspace_id,p.id)
        and (select public.is_workspace_member(p.workspace_id))
    )
  ) with check (
    bucket_id = 'item-media'
    and exists (
      select 1 from public.catalog_products p
      where p.workspace_id::text = (storage.foldername(name))[2]
        and p.id::text = (storage.foldername(name))[3]
        and public.is_catalog_product_media_path(name,p.workspace_id,p.id)
        and (select public.is_workspace_member(p.workspace_id))
    )
  );

create policy "Produktmedien loeschen" on storage.objects
  for delete to authenticated using (
    bucket_id = 'item-media'
    and exists (
      select 1 from public.catalog_products p
      where p.workspace_id::text = (storage.foldername(name))[2]
        and p.id::text = (storage.foldername(name))[3]
        and public.is_catalog_product_media_path(name,p.workspace_id,p.id)
        and (select public.is_workspace_member(p.workspace_id))
    )
  );
-- Alle Galerieänderungen werden je Produkt serialisiert, auch einzelne Uploads.
create function public.lock_catalog_product_media()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.catalog_products
    where id = case when tg_op = 'DELETE' then old.catalog_product_id else new.catalog_product_id end
      and workspace_id = case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end
    for update;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.lock_catalog_product_media() from public, anon, authenticated, service_role;
create trigger lock_catalog_product_media before insert or update or delete on public.catalog_product_media
for each row execute function public.lock_catalog_product_media();

create function public.update_product_media_layout(
  p_product_id uuid, p_ordered_media_ids uuid[], p_expected_media_ids uuid[], p_workspace_id uuid
) returns setof public.catalog_product_media
language plpgsql volatile security invoker set search_path = '' as $$
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
$$;
revoke all on function public.update_product_media_layout(uuid,uuid[],uuid[],uuid) from public,anon,authenticated,service_role;
grant execute on function public.update_product_media_layout(uuid,uuid[],uuid[],uuid) to authenticated;
