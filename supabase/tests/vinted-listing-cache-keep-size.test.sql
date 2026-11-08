\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into public.workspaces(id, name) values ('54100000-0000-4000-8000-000000000011', 'Größe');
insert into public.marketplace_connections(id, workspace_id, display_name, external_account_id, status)
values ('54100000-0000-4000-8000-000000000021', '54100000-0000-4000-8000-000000000011', 'Vinted', '77', 'connected');
insert into public.marketplace_account_entries(id, workspace_id, connection_id, kind, external_id, body)
values ('54100000-0000-4000-8000-000000000031', '54100000-0000-4000-8000-000000000011',
  '54100000-0000-4000-8000-000000000021', 'publication', '555',
  '{"title":"Jeans","size":"M / 38 / 10","listingContent":{"title":"Jeans","description":"Alt","priceCents":3390,"currency":"EUR","categoryId":1841,"categoryLabel":"Schlaghosen","brandId":40005,"brandLabel":"Silver","sizeId":207,"sizeLabel":"M","conditionId":2,"conditionLabel":"Sehr gut","colorIds":[27],"colorLabels":["Marineblau"],"materialIds":[303],"materialLabels":["Denim"],"packageSizeId":2,"attributes":{}}}');

create function pg_temp.cache(p_changes jsonb) returns boolean language sql as $$
  select public.marketplace_cache_listing_content('54100000-0000-4000-8000-000000000011',
    '54100000-0000-4000-8000-000000000021', '54100000-0000-4000-8000-000000000031', '555',
    (select body->'listingContent' from public.marketplace_account_entries
      where id = '54100000-0000-4000-8000-000000000031') || p_changes);
$$;
create function pg_temp.body() returns jsonb language sql as $$
  select body from public.marketplace_account_entries where id = '54100000-0000-4000-8000-000000000031';
$$;

set local role service_role;
select ok(pg_temp.cache('{"description":"Neu","sizeId":null,"sizeLabel":""}'), 'Stores an edit without a readable size');
select is(pg_temp.body()->'listingContent'->>'description', 'Neu', 'Takes the edited description');
select is(pg_temp.body()->'listingContent'->>'sizeId', '207', 'Keeps the stored size id');
select is(pg_temp.body()->'listingContent'->>'sizeLabel', 'M', 'Keeps the stored size label');
select is(pg_temp.body()->>'size', 'M', 'Keeps the size shown in the wardrobe');

select ok(pg_temp.cache('{"sizeId":208,"sizeLabel":"L"}'), 'Stores a real size change');
select is(pg_temp.body()->'listingContent'->>'sizeLabel', 'L', 'A real size change overwrites');
select is(pg_temp.body()->>'size', 'L', 'The wardrobe shows the new size');

select ok(pg_temp.cache('{"categoryId":2319,"categoryLabel":"Bücher","sizeId":null,"sizeLabel":""}'), 'Stores a category change');
select is(pg_temp.body()->'listingContent'->>'sizeId', null, 'A category change does not keep the old size');
select is(pg_temp.body()->>'size', null, 'The wardrobe shows no size after a category change');
reset role;
select * from finish();
rollback;
