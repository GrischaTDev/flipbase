\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select plan(62);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('23000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'listing-owner@example.test', '{}', '{}'),
  ('23000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'listing-outsider@example.test', '{}', '{}');

insert into public.workspaces (id, name) values
  ('23000000-0000-4000-8000-000000000011', 'Inserate eigener Workspace'),
  ('23000000-0000-4000-8000-000000000012', 'Inserate fremder Workspace');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('23000000-0000-4000-8000-000000000011', '23000000-0000-4000-8000-000000000001', 'owner'),
  ('23000000-0000-4000-8000-000000000012', '23000000-0000-4000-8000-000000000002', 'owner');

insert into public.workspaces (id, name) values
  ('23000000-0000-4000-8000-000000000013', 'Archivierter Inserate-Workspace');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('23000000-0000-4000-8000-000000000013', '23000000-0000-4000-8000-000000000001', 'owner');

insert into public.purchases (id, workspace_id, type, title) values
  ('23000000-0000-4000-8000-000000000031', '23000000-0000-4000-8000-000000000011', 'lot', 'Wieder geöffneter Paketeinkauf');
insert into public.purchase_lines (
  id, workspace_id, purchase_id, title_snapshot, line_kind, ordered_quantity,
  unit_purchase_price, line_total, is_package
) values (
  '23000000-0000-4000-8000-000000000032',
  '23000000-0000-4000-8000-000000000011',
  '23000000-0000-4000-8000-000000000031',
  'Paketposition',
  'individual',
  1,
  10,
  10,
  true
);

insert into public.inventory_items (id, workspace_id, title, status) values
  ('23000000-0000-4000-8000-000000000021', '23000000-0000-4000-8000-000000000011', 'Eigener Artikel', 'ready'),
  ('23000000-0000-4000-8000-000000000022', '23000000-0000-4000-8000-000000000012', 'Fremder Artikel', 'ready'),
  ('23000000-0000-4000-8000-000000000023', '23000000-0000-4000-8000-000000000011', 'Lebenszyklus-Artikel', 'ready'),
  ('23000000-0000-4000-8000-000000000024', '23000000-0000-4000-8000-000000000011', 'Reservierter Artikel', 'reserved'),
  ('23000000-0000-4000-8000-000000000026', '23000000-0000-4000-8000-000000000013', 'Archivierter Artikel', 'ready');
insert into public.inventory_items (
  id, workspace_id, purchase_id, source_package_line_id, title, status,
  allocated_purchase_cost, tax_purchase_cost
) values (
  '23000000-0000-4000-8000-000000000025',
  '23000000-0000-4000-8000-000000000011',
  '23000000-0000-4000-8000-000000000031',
  '23000000-0000-4000-8000-000000000032',
  'Paketinhalt',
  'received',
  null,
  null
);
update public.workspaces
set archived_at = now()
where id = '23000000-0000-4000-8000-000000000013';

select has_table('public', 'listings', 'listings table exists');
select hasnt_table('public', 'listing_drafts', 'legacy listing drafts table is removed');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.listings'::regclass),
  'listings has rls'
);
select has_check('public', 'listings', 'listings validates domain values');
select has_index('public', 'listings', 'listings_one_open_per_item', 'one open listing index exists');
select ok(not has_table_privilege('anon', 'public.listings', 'select'), 'anon cannot read listings');
select ok(has_table_privilege('authenticated', 'public.listings', 'select'), 'members can read listings');
select ok(not has_table_privilege('authenticated', 'public.listings', 'insert'), 'direct insert is denied');
select ok(not has_table_privilege('authenticated', 'public.listings', 'delete'), 'direct delete is denied');
select ok(has_column_privilege('authenticated', 'public.listings', 'title', 'update'), 'title is editable');
select ok(not has_column_privilege('authenticated', 'public.listings', 'status', 'update'), 'status is rpc-only');

create function pg_temp.insert_listing(
  p_id uuid,
  p_workspace_id uuid,
  p_inventory_item_id uuid,
  p_title text default 'Artikel',
  p_description text default 'Beschreibung',
  p_price numeric default 20,
  p_shipping_type text default 'pickup',
  p_shipping_price numeric default null,
  p_postal_code text default null,
  p_status text default 'ended',
  p_end_reason text default 'manual',
  p_ended_at timestamptz default now()
) returns void language sql as $$
  insert into public.listings(
    id, workspace_id, inventory_item_id, title, description, price, price_type,
    shipping_type, shipping_price, postal_code, status, end_reason, ended_at
  ) values (
    p_id, p_workspace_id, p_inventory_item_id, p_title, p_description, p_price, 'FIXED',
    p_shipping_type, p_shipping_price, p_postal_code, p_status, p_end_reason, p_ended_at
  );
$$;

select lives_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000101','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021',repeat('x',65))$$,
  '65-character title succeeds'
);
select throws_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000102','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021',repeat('x',66))$$,
  '23514', null, '66-character title fails'
);
select lives_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000103','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel',repeat('x',4000))$$,
  '4,000-character description succeeds'
);
select throws_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000104','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel',repeat('x',4001))$$,
  '23514', null, '4,001-character description fails'
);
select lives_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000105','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',99999999)$$,
  'maximum price succeeds'
);
select throws_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000106','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',99999999.01)$$,
  '23514', null, 'price above maximum fails'
);
select lives_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000107','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',20,'shipping',0,'12345')$$,
  'five-digit postal code succeeds'
);
select throws_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000108','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',20,'shipping',0,'1234')$$,
  '23514', null, 'four-digit postal code fails'
);
select throws_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000109','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',20,'shipping',0,'123456')$$,
  '23514', null, 'six-digit postal code fails'
);
select lives_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000110','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',20,'pickup',null)$$,
  'pickup accepts a null shipping price'
);
select throws_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000111','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',20,'pickup',1)$$,
  '23514', null, 'pickup rejects a shipping price'
);
select throws_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000112','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',20,'pickup',null,null,'ended',null,null)$$,
  '23514', null, 'ended listings require reason and timestamp'
);
select lives_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000113','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',20,'pickup',null,null,'ended','manual',now())$$,
  'ended listing accepts reason and timestamp'
);
select throws_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000114','23000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000021','Artikel','Beschreibung',20,'pickup',null,null,'prepared','manual',now())$$,
  '23514', null, 'open listings reject end metadata'
);
select lives_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000115','23000000-0000-4000-8000-000000000012','23000000-0000-4000-8000-000000000022','Artikel','Beschreibung',20,'pickup',null,null,'prepared',null,null)$$,
  'first open listing succeeds'
);
select throws_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000116','23000000-0000-4000-8000-000000000012','23000000-0000-4000-8000-000000000022','Artikel','Beschreibung',20,'pickup',null,null,'prepared',null,null)$$,
  '23505', null, 'second open listing fails'
);
update public.listings
set status = 'ended', end_reason = 'manual', ended_at = now()
where id = '23000000-0000-4000-8000-000000000115';
select lives_ok(
  $$select pg_temp.insert_listing('23000000-0000-4000-8000-000000000117','23000000-0000-4000-8000-000000000012','23000000-0000-4000-8000-000000000022','Artikel','Beschreibung',20,'pickup',null,null,'prepared',null,null)$$,
  'new open row after an ended listing succeeds'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::integer from public.listings where workspace_id = '23000000-0000-4000-8000-000000000011'),
  6,
  'member sees listings in the own workspace'
);
select is(
  (select count(*)::integer from public.listings where workspace_id = '23000000-0000-4000-8000-000000000012'),
  0,
  'non-member sees zero listings'
);
reset role;

select has_function('public', 'prepare_listing', array['uuid', 'uuid', 'jsonb', 'uuid']);
select has_function('public', 'set_listing_online', array['uuid', 'uuid']);
select has_function('public', 'end_listing', array['uuid', 'uuid']);
select function_privs_are(
  'public', 'prepare_listing', array['uuid', 'uuid', 'jsonb', 'uuid'],
  'authenticated', array['EXECUTE'], 'authenticated can prepare listings'
);
select function_privs_are(
  'public', 'prepare_listing', array['uuid', 'uuid', 'jsonb', 'uuid'],
  'anon', array[]::text[], 'anon cannot prepare listings'
);

create temporary table listing_lifecycle_results (
  name text primary key,
  listing_id uuid not null
);
grant all on table listing_lifecycle_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into listing_lifecycle_results(name, listing_id)
    select 'primary', id from public.prepare_listing(
      '23000000-0000-4000-8000-000000000011',
      '23000000-0000-4000-8000-000000000023',
      '{"title":"Erstes Inserat","description":"Beschreibung","price":"20.50","priceType":"FIXED","shippingType":"shipping","shippingPrice":"4.90","postalCode":"12345"}'
    )$$,
  'prepare creates the first listing'
);
select is(
  (select status from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  'prepared',
  'prepare stores a prepared listing'
);
select is(
  (select listed_count from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  1,
  'first prepare starts the listing counter at one'
);
select ok(
  (select last_listed_at is not null from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  'prepare stores the listing timestamp'
);
select is(
  (select price from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  20.50::numeric,
  'prepare accepts decimal prices'
);
select lives_ok(
  $$insert into listing_lifecycle_results(name, listing_id)
    select 'primary', id from public.prepare_listing(
      '23000000-0000-4000-8000-000000000011',
      '23000000-0000-4000-8000-000000000023',
      '{"title":"Erneutes Inserat","description":"Beschreibung","price":"21","priceType":"NEGOTIABLE","shippingType":"pickup","shippingPrice":null,"postalCode":null}'
    )
    on conflict (name) do update set listing_id = excluded.listing_id$$,
  'prepare reuses a manually ended or open listing'
);
select is(
  (select title from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  'Erneutes Inserat',
  'prepare refreshes the saved content'
);
select is(
  (select listed_count from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  2,
  'second prepare increments the listing counter'
);
select lives_ok(
  $$select public.set_listing_online(
    '23000000-0000-4000-8000-000000000011',
    (select listing_id from listing_lifecycle_results where name = 'primary')
  )$$,
  'set online accepts a prepared listing'
);
select is(
  (select status from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  'online',
  'set online changes the listing status'
);
select is(
  (select status from public.inventory_items where id = '23000000-0000-4000-8000-000000000023'),
  'listed',
  'set online changes the inventory status'
);
select throws_ok(
  $$select public.set_listing_online(
    '23000000-0000-4000-8000-000000000011',
    (select listing_id from listing_lifecycle_results where name = 'primary')
  )$$,
  '22023',
  'Nur vorbereitete Inserate können online gesetzt werden.',
  'set online rejects a non-prepared listing'
);
select lives_ok(
  $$select public.end_listing(
    '23000000-0000-4000-8000-000000000011',
    (select listing_id from listing_lifecycle_results where name = 'primary')
  )$$,
  'end listing accepts an online listing'
);
select is(
  (select status || '/' || end_reason from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  'ended/manual',
  'end listing records a manual end'
);
select is(
  (select status from public.inventory_items where id = '23000000-0000-4000-8000-000000000023'),
  'ready',
  'end listing returns the inventory to ready'
);
select lives_ok(
  $$select public.prepare_listing(
    '23000000-0000-4000-8000-000000000011',
    '23000000-0000-4000-8000-000000000023',
    '{"title":"Zum Verkaufen","description":"Beschreibung","price":"22","priceType":"FIXED","shippingType":"pickup","shippingPrice":null,"postalCode":null}'
  )$$,
  'a manually ended listing can be prepared again'
);
select lives_ok(
  $$select public.set_listing_online(
    '23000000-0000-4000-8000-000000000011',
    (select listing_id from listing_lifecycle_results where name = 'primary')
  )$$,
  'a re-prepared listing can be set online'
);
reset role;
select set_config('flipbase.allow_inventory_sold_transition', 'on', true);
update public.inventory_items set status = 'sold' where id = '23000000-0000-4000-8000-000000000023';
select is(
  (select status from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  'ended',
  'selling the item ends every open listing'
);
select is(
  (select end_reason from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'primary')),
  'sold',
  'selling the item records the sold end reason'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.prepare_listing(
    '23000000-0000-4000-8000-000000000011',
    '23000000-0000-4000-8000-000000000023',
    '{"title":"Unbefugt","description":"","price":"1","priceType":"FIXED","shippingType":"pickup","shippingPrice":null,"postalCode":null}'
  )$$,
  '42501',
  'Du bist kein Mitglied dieses Workspace.',
  'non-members cannot prepare listings'
);

select set_config('request.jwt.claim.sub', '23000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.prepare_listing(
    '23000000-0000-4000-8000-000000000013',
    '23000000-0000-4000-8000-000000000026',
    '{"title":"Archiv","description":"","price":"1","priceType":"FIXED","shippingType":"pickup","shippingPrice":null,"postalCode":null}'
  )$$,
  '42501',
  'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.',
  'archived workspaces cannot prepare listings'
);
select throws_ok(
  $$select public.prepare_listing(
    '23000000-0000-4000-8000-000000000011',
    '23000000-0000-4000-8000-000000000024',
    '{"title":"Reserviert","description":"","price":"1","priceType":"FIXED","shippingType":"pickup","shippingPrice":null,"postalCode":null}'
  )$$,
  '22023',
  'Dieser Artikel kann nicht inseriert werden.',
  'reserved items cannot be prepared'
);
select throws_ok(
  $$select public.prepare_listing(
    '23000000-0000-4000-8000-000000000011',
    '23000000-0000-4000-8000-000000000025',
    '{"title":"","description":"","price":"1","priceType":"FIXED","shippingType":"pickup","shippingPrice":null,"postalCode":null}'
  )$$,
  '22023',
  'Der Titel muss 1 bis 65 Zeichen enthalten.',
  'invalid content is rejected by the RPC'
);
select lives_ok(
  $$insert into listing_lifecycle_results(name, listing_id)
    select 'package', id from public.prepare_listing(
      '23000000-0000-4000-8000-000000000011',
      '23000000-0000-4000-8000-000000000025',
      '{"title":"Paketinhalt","description":"","price":"1","priceType":"FIXED","shippingType":"pickup","shippingPrice":null,"postalCode":null}'
    )$$,
  'a package item can be prepared while its purchase is open'
);
select throws_ok(
  $$select public.set_listing_online(
    '23000000-0000-4000-8000-000000000011',
    (select listing_id from listing_lifecycle_results where name = 'package')
  )$$,
  '42501',
  'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.',
  'a package item from a reopened purchase cannot be set online'
);
select is(
  (select status from public.listings where id = (select listing_id from listing_lifecycle_results where name = 'package')),
  'prepared',
  'the blocked package listing stays prepared'
);
select is(
  (select status from public.inventory_items where id = '23000000-0000-4000-8000-000000000025'),
  'received',
  'the blocked package inventory stays unchanged'
);
reset role;

select * from finish();
rollback;
