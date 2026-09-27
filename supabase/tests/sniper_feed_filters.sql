\set ON_ERROR_STOP on
begin;
select no_plan();

insert into auth.users (id, email) values
  ('93000000-0000-4000-8000-000000000001', 'feed-filters@example.test');
insert into public.workspaces (id, name) values
  ('93000000-0000-4000-8000-000000000002', 'Feed Filter');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('93000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001', 'owner');
insert into public.sniper_queries (id, query_key, brand_id, is_active) values
  ('93000000-0000-4000-8000-000000000003', 'feed-filter-query', 53, true);

insert into public.sniper_listings
  (external_id, title, url, item_price, total_price, brand, size, discovered_by_query_id, first_seen_at)
select 'feed-filter-new-' || i, 'Neuer L-Fund ' || i, 'https://www.vinted.de/items/' || i,
  5, 7, 'Nike', 'L', '93000000-0000-4000-8000-000000000003', now() - i * interval '1 minute'
from generate_series(1, 65) as i;
insert into public.sniper_listings
  (external_id, title, url, item_price, total_price, brand, size, discovered_by_query_id, first_seen_at)
values
  ('feed-filter-xxl-20', 'Älterer XXL-Fund', 'https://www.vinted.de/items/100', 20, 22,
    'Nike', 'XXL / 54', '93000000-0000-4000-8000-000000000003', now() - interval '12 hours'),
  ('feed-filter-xxl-40', 'Älterer 2XL-Fund', 'https://www.vinted.de/items/101', 40, 42,
    'Nike', '2XL', '93000000-0000-4000-8000-000000000003', now() - interval '13 hours'),
  ('feed-filter-expired', 'Abgelaufener XXL-Fund', 'https://www.vinted.de/items/102', 18, 20,
    'Nike', 'XXL', '93000000-0000-4000-8000-000000000003', now() - interval '31 days');

select ok(public.sniper_feed_matches_size('XXL / 54', 'xxl'), 'XXL mit Zahl wird erkannt');
select ok(public.sniper_feed_matches_size('2XL', 'xxl'), '2XL wird als XXL erkannt');
select ok(not public.sniper_feed_matches_size('XL / 46', 'xxl'), 'XL wird nicht als XXL erkannt');
select ok(not public.sniper_feed_matches_size('XXL / 54', 'l'), 'XXL wird nicht als L erkannt');

select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(public.sniper_feed_filtered(
  '93000000-0000-4000-8000-000000000002', null, null, 'xxl', 10, 30, null, null, 1
) -> 'items' -> 0 ->> 'title', 'Älterer XXL-Fund',
  'Größe und Artikelpreis greifen vor der ersten 60er-Seite');
select is(jsonb_array_length(public.sniper_feed_filtered(
  '93000000-0000-4000-8000-000000000002', null, null, 'xxl', 10, 30, null, null, 60
) -> 'items'), 1, 'Preisgrenzen schließen teure und 31 Tage alte XXL-Funde aus');
select is(jsonb_array_length(public.sniper_feed_filtered(
  '93000000-0000-4000-8000-000000000002', null, null, 'xxl', 20, 40, null, null, 60
) -> 'items'), 2, 'Beide Preisgrenzen sind einschließlich');
with first_page as (
  select public.sniper_feed_filtered(
    '93000000-0000-4000-8000-000000000002', null, null, 'xxl', null, null, null, null, 1
  ) -> 'items' -> 0 as item
)
select is(public.sniper_feed_filtered(
  '93000000-0000-4000-8000-000000000002', null, null, 'xxl', null, null,
  (item ->> 'first_seen_at')::timestamptz, (item ->> 'id')::uuid, 1
) -> 'items' -> 0 ->> 'title', 'Älterer 2XL-Fund',
  'Ältere gefilterte Funde lassen sich über den Cursor nachladen')
from first_page;
select throws_ok($$select public.sniper_feed_filtered(
  '93000000-0000-4000-8000-000000000002', null, null, 'xxl', 50, 10, null, null, 60)$$,
  '22023', null, 'Vertauschte Preisgrenzen werden abgelehnt');
select throws_ok($$select public.sniper_feed_filtered(
  '93000000-0000-4000-8000-000000000002', null, null, 'unbekannt', null, null, null, null, 60)$$,
  '22023', null, 'Unbekannte Größe wird abgelehnt');
select throws_ok($$select public.sniper_feed_filtered(
  '93000000-0000-4000-8000-000000000009', null, null, null, null, null, null, null, 60)$$,
  '42501', null, 'Fremde Arbeitsbereiche sind gesperrt');
reset role;

set local role anon;
select throws_ok($$select public.sniper_feed_filtered(
  '93000000-0000-4000-8000-000000000002', null, null, null, null, null, null, null, 60)$$,
  '42501', null, 'Anonymer Feedzugriff ist gesperrt');
reset role;

select * from finish();
rollback;
