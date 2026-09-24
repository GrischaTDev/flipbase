-- Eigene Bildauswahl und Reihenfolge pro Kleinanzeigen-Inserat.
-- Betroffen: public.listing_images und private Bilder im Bucket item-media.

alter table public.listings add column image_selection_saved boolean not null default false;
grant update (image_selection_saved) on table public.listings to authenticated;

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  listing_id uuid not null,
  storage_path text not null,
  file_name text,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint listing_images_listing_fkey foreign key (workspace_id, listing_id)
    references public.listings(workspace_id, id) on delete cascade,
  constraint listing_images_path_unique unique (listing_id, storage_path)
);

comment on table public.listing_images is
  'Bildauswahl für ein Inserat; verweist auf Artikelbilder oder eigene private Inseratbilder.';

create index listing_images_workspace_listing_order_idx
  on public.listing_images (workspace_id, listing_id, sort_order, id);
create index listing_images_storage_path_idx on public.listing_images (storage_path);

alter table public.listing_images enable row level security;
create trigger "00_protect_archived_workspace"
  before insert or update or delete on public.listing_images
  for each row execute function public.protect_archived_workspace_data();
revoke all on table public.listing_images from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.listing_images to authenticated;

create policy "Inseratbilder lesen" on public.listing_images
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy "Inseratbilder anlegen" on public.listing_images
  for insert to authenticated with check ((select public.is_workspace_member(workspace_id)));
create policy "Inseratbilder ändern" on public.listing_images
  for update to authenticated
  using ((select public.is_workspace_member(workspace_id)))
  with check ((select public.is_workspace_member(workspace_id)));
create policy "Inseratbilder löschen" on public.listing_images
  for delete to authenticated using ((select public.is_workspace_member(workspace_id)));

create policy "Eigene Inseratbilder lesen" on storage.objects
  for select to authenticated using (
    bucket_id = 'item-media'
    and exists (
      select 1 from public.listings as listing
      where listing.workspace_id::text = (storage.foldername(name))[2]
        and listing.id::text = (storage.foldername(name))[3]
        and name ~ ('^listings/' || listing.workspace_id::text || '/' || listing.id::text
          || '/[0-9a-f-]+\.(jpg|jpeg|png|webp|gif|avif)$')
        and (select public.is_workspace_member(listing.workspace_id))
    )
  );
create policy "Eigene Inseratbilder hochladen" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'item-media'
    and exists (
      select 1 from public.listings as listing
      where listing.workspace_id::text = (storage.foldername(name))[2]
        and listing.id::text = (storage.foldername(name))[3]
        and name ~ ('^listings/' || listing.workspace_id::text || '/' || listing.id::text
          || '/[0-9a-f-]+\.(jpg|jpeg|png|webp|gif|avif)$')
        and (select public.is_workspace_member(listing.workspace_id))
    )
  );
create policy "Eigene Inseratbilder löschen" on storage.objects
  for delete to authenticated using (
    bucket_id = 'item-media'
    and exists (
      select 1 from public.listings as listing
      where listing.workspace_id::text = (storage.foldername(name))[2]
        and listing.id::text = (storage.foldername(name))[3]
        and name ~ ('^listings/' || listing.workspace_id::text || '/' || listing.id::text
          || '/[0-9a-f-]+\.(jpg|jpeg|png|webp|gif|avif)$')
        and (select public.is_workspace_member(listing.workspace_id))
    )
  );
