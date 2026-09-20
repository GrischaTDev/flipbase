\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select plan(29);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('23000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'listing-owner@example.test', '{}', '{}'),
  ('23000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'listing-outsider@example.test', '{}', '{}');

insert into public.workspaces (id, name) values
  ('23000000-0000-4000-8000-000000000011', 'Inserate eigener Workspace'),
  ('23000000-0000-4000-8000-000000000012', 'Inserate fremder Workspace');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('23000000-0000-4000-8000-000000000011', '23000000-0000-4000-8000-000000000001', 'owner'),
  ('23000000-0000-4000-8000-000000000012', '23000000-0000-4000-8000-000000000002', 'owner');

insert into public.inventory_items (id, workspace_id, title, status) values
  ('23000000-0000-4000-8000-000000000021', '23000000-0000-4000-8000-000000000011', 'Eigener Artikel', 'ready'),
  ('23000000-0000-4000-8000-000000000022', '23000000-0000-4000-8000-000000000012', 'Fremder Artikel', 'ready');

select has_table('public', 'listings', 'listings table exists');
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

select * from finish();
rollback;
