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
revoke all on table public.catalog_product_media from public,anon,authenticated;
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
