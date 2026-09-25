\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select plan(8);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('23100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'listing-image-owner@example.test', '{}', '{}'),
  ('23100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'listing-image-outsider@example.test', '{}', '{}');
insert into public.workspaces (id, name) values
  ('23100000-0000-4000-8000-000000000011', 'Eigene Inseratbilder'),
  ('23100000-0000-4000-8000-000000000012', 'Fremde Inseratbilder');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('23100000-0000-4000-8000-000000000011', '23100000-0000-4000-8000-000000000001', 'owner'),
  ('23100000-0000-4000-8000-000000000012', '23100000-0000-4000-8000-000000000002', 'owner');
insert into public.inventory_items (id, workspace_id, title, status) values
  ('23100000-0000-4000-8000-000000000021', '23100000-0000-4000-8000-000000000011', 'Eigener Artikel', 'ready');
insert into public.listings (
  id, workspace_id, inventory_item_id, title, description, price, price_type, shipping_type
) values (
  '23100000-0000-4000-8000-000000000031',
  '23100000-0000-4000-8000-000000000011',
  '23100000-0000-4000-8000-000000000021',
  'Eigenes Inserat', '', 10, 'FIXED', 'pickup'
);

select is(
  (select image_selection_saved from public.listings where id = '23100000-0000-4000-8000-000000000031'),
  false,
  'alte Inserate verwenden ihre Artikelbilder als Ausgangspunkt'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '23100000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into public.listing_images(workspace_id, listing_id, storage_path, file_name, sort_order)
    values ('23100000-0000-4000-8000-000000000011', '23100000-0000-4000-8000-000000000031',
      '23100000-0000-4000-8000-000000000021/photo.jpg', 'photo.jpg', 0)$$,
  'Mitglied kann Bilder zum eigenen Inserat auswählen'
);
select is((select count(*)::int from public.listing_images), 1, 'eigenes Inseratbild ist lesbar');

select set_config('request.jwt.claim.sub', '23100000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.listing_images), 0, 'fremde Inseratbilder bleiben verborgen');
select throws_ok(
  $$insert into public.listing_images(workspace_id, listing_id, storage_path, sort_order)
    values ('23100000-0000-4000-8000-000000000011', '23100000-0000-4000-8000-000000000031',
      '23100000-0000-4000-8000-000000000021/foreign.jpg', 1)$$,
  '42501', null, 'fremdes Inserat kann nicht verändert werden'
);

select set_config('request.jwt.claim.sub', '23100000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$insert into public.listing_images(workspace_id, listing_id, storage_path, sort_order)
    values ('23100000-0000-4000-8000-000000000011', '23100000-0000-4000-8000-000000000031',
      '23100000-0000-4000-8000-000000000021/negative.jpg', -1)$$,
  '23514', null, 'negative Bildposition wird abgelehnt'
);
select lives_ok(
  $$update public.listings set image_selection_saved = true
    where id = '23100000-0000-4000-8000-000000000031'$$,
  'leere oder eigene Bildauswahl kann gespeichert werden'
);
select is(
  (select image_selection_saved from public.listings where id = '23100000-0000-4000-8000-000000000031'),
  true,
  'gespeicherte Bildauswahl bleibt vom Artikel getrennt'
);

select * from finish();
rollback;
