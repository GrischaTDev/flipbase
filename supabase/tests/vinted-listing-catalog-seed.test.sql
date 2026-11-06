\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

-- Erstbefüllung des lokalen Vinted-Katalogs (gelesen am 06.11.2026 im Verkaufsformular).
select ok((select count(*) from public.vinted_listing_categories) >= 2800, 'Contains the whole selling tree');
select is((select count(*)::integer from public.vinted_listing_categories c where c.is_leaf
  and not exists (select 1 from public.vinted_listing_category_fields f where f.category_id = c.id)),
  0, 'Every leaf category has its fields');
select is((select count(*)::integer from public.vinted_listing_categories where is_leaf and fields_observed_at is null),
  0, 'Every leaf category records when its fields were read');
select is((select count(*)::integer from public.vinted_listing_categories c where c.parent_id is not null
  and not exists (select 1 from public.vinted_listing_categories p where p.id = c.parent_id)),
  0, 'Every parent exists');
select is((select array_agg(size_group_id order by position) from public.vinted_listing_category_size_groups
  where category_id = 1845), array[80,82,81,83,84,85], 'Women''s straight jeans offer all six size groups');
select is((select array_agg(size_group_id order by position) from public.vinted_listing_category_size_groups
  where category_id = 1819), array[14,77], 'Men''s straight jeans offer letter sizes and waist sizes');
select is((select title from public.vinted_listing_sizes where id = 1640), 'W32 | DE 48', 'Keeps Vinted''s exact size label');
select is((select title from public.vinted_listing_options where field_code = 'condition' and id = 6),
  'Neu, mit Etikett', 'Keeps Vinted''s exact condition label');
select ok(not exists (select 1 from public.vinted_listing_category_fields where category_id = 5555 and field_code = 'size'),
  'Scarves have no size');
select ok(exists (select 1 from public.vinted_listing_category_fields where category_id = 5555
  and field_code = 'accessory_department'), 'Scarves ask for the target group');
select * from finish();
rollback;
