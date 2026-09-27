\set ON_ERROR_STOP on
begin;
select no_plan();

insert into auth.users (id, email) values
  ('92000000-0000-4000-8000-000000000001', 'feed-brands@example.test');
insert into public.workspaces (id, name) values
  ('92000000-0000-4000-8000-000000000002', 'Feed Brands');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('92000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 'owner');
insert into public.sniper_queries (id, query_key, brand_id, is_active) values
  ('92000000-0000-4000-8000-000000000003', 'feed-brand-nike', 53, true),
  ('92000000-0000-4000-8000-000000000004', 'feed-brand-adidas', 14, false);
insert into public.sniper_listings
  (external_id, title, url, item_price, total_price, brand, discovered_by_query_id, first_seen_at)
values
  ('feed-brand-nike', 'Nike', 'https://www.vinted.de/items/1', 10, 12, ' Nike ',
    '92000000-0000-4000-8000-000000000003', now() - interval '3 minutes'),
  ('feed-brand-adidas', 'Adidas', 'https://www.vinted.de/items/2', 12, 14, 'Adidas',
    '92000000-0000-4000-8000-000000000004', now() - interval '2 minutes'),
  ('feed-brand-other', 'Andere Marke', 'https://www.vinted.de/items/3', 15, 17, 'Reebok',
    '92000000-0000-4000-8000-000000000003', now() - interval '1 minute');

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is((select array_agg(brand order by brand) from public.sniper_supported_brands(
  '92000000-0000-4000-8000-000000000002')), array['Nike', 'Reebok'],
  'Nur Marken aus aktiven Vinted-Sammelauftraegen erscheinen');
select is(jsonb_array_length(public.sniper_feed_by_brand(
  '92000000-0000-4000-8000-000000000002', null, ' nike ', null, null, 1)->'items'),
  1, 'Marke wird vor der Seitenteilung und ohne Beachtung der Schreibweise gefiltert');
select is(public.sniper_feed_by_brand(
  '92000000-0000-4000-8000-000000000002', null, 'nike', null, null, 1)
  ->'items'->0->>'title', 'Nike', 'Erster Treffer gehoert zur gewaehlten Marke');
select throws_ok($$select public.sniper_feed_by_brand(
  '92000000-0000-4000-8000-000000000002', null, ' ', null, null, 1)$$,
  '22023', null, 'Leere Marke wird abgelehnt');
select throws_ok($$select public.sniper_supported_brands(
  '92000000-0000-4000-8000-000000000005')$$,
  '42501', null, 'Marken fremder Arbeitsbereiche sind gesperrt');
reset role;

set local role anon;
select throws_ok($$select public.sniper_supported_brands(
  '92000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'Anonyme Markenabfrage ist gesperrt');
select throws_ok($$select public.sniper_feed_by_brand(
  '92000000-0000-4000-8000-000000000002', null, null, null, null, 1)$$,
  '42501', null, 'Anonymer Feedzugriff ist gesperrt');
reset role;

select * from finish();
rollback;
