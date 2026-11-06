\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('54020000-0000-4000-8000-000000000001','authenticated','authenticated','catalog-admin@example.test','{}','{}'),
 ('54020000-0000-4000-8000-000000000002','authenticated','authenticated','catalog-user@example.test','{}','{}');
insert into public.platform_operators(user_id) values('54020000-0000-4000-8000-000000000001');
delete from public.vinted_listing_categories;
delete from public.vinted_listing_catalog_refreshes;

select ok(not has_table_privilege('authenticated','public.vinted_listing_catalog_refreshes','insert'),'No direct client refresh writes');
select ok(not has_function_privilege('anon','public.request_vinted_listing_catalog_refresh()','execute'),'No anonymous refresh requests');

set local role service_role;
select is(public.marketplace_save_vinted_listing_categories(now() - interval '1 hour', '[
 {"id":5,"parentId":null,"title":"Damen","fullTitle":"Damen","path":"","position":0,"isLeaf":false},
 {"id":5523,"parentId":5,"title":"Röcke","fullTitle":"Röcke (Damen)","path":"Damen","position":0,"isLeaf":true},
 {"id":2319,"parentId":5,"title":"Belletristik","fullTitle":"Belletristik","path":"Damen","position":1,"isLeaf":true}
]'), 3, 'Stores a small tree');
select is(public.marketplace_save_vinted_listing_category_fields(5523, now() - interval '30 minutes', '[
 {"code":"skirt_length","position":0,"required":true,"selectionType":"single","limit":1,"display":"list","title":"Rocklänge",
  "options":[{"id":392,"title":"Mini"},{"id":649,"title":"Knielänge"}]},
 {"code":"brand","position":1}
]'), true, 'Stores an extra field with its title');
select is((select title from public.vinted_listing_category_fields where category_id = 5523 and field_code = 'skirt_length'),
 'Rocklänge', 'Keeps Vinted''s field title');
select is((select title from public.vinted_listing_category_fields where category_id = 5523 and field_code = 'brand'),
 null, 'Fields without configuration have no title');
select is(public.marketplace_save_vinted_listing_category_fields(2319, now() - interval '20 minutes', '[
 {"code":"package","position":0,"required":true,"selectionType":"single","limit":1,"display":"package","title":"Paketgröße",
  "options":[{"id":8,"title":"5 kg"},{"id":9,"title":"10 kg"},{"id":10,"title":"20 kg"}],"recommendedId":8}
]'), true, 'Stores package sizes with Vinted''s recommendation');
select is((select recommended_option_id from public.vinted_listing_category_fields where category_id = 2319 and field_code = 'package'),
 8, 'Keeps the recommended package size');
select is((select option_ids from public.vinted_listing_category_fields where category_id = 2319 and field_code = 'package'),
 array[8, 9, 10], 'Keeps the offered package sizes in Vinted''s order');
select throws_ok($$select public.marketplace_save_vinted_listing_category_fields(2319, now(), '[
 {"code":"package","position":0,"required":true,"selectionType":"single","limit":1,
  "options":[{"id":1,"title":"Klein"}],"recommendedId":2}
]')$$, 'P0001', 'Invalid Vinted category fields', 'Rejects a recommendation outside the offered sizes');
select is((select recommended_option_id from public.vinted_listing_category_fields where category_id = 5523 and field_code = 'skirt_length'),
 null, 'Fields without a recommendation stay empty');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"54020000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.request_vinted_listing_catalog_refresh()$$, 'P0001', 'Nur für die Plattform-Administration.', 'Users cannot request a refresh');
select throws_ok($$select public.vinted_listing_catalog_status()$$, 'P0001', 'Nur für die Plattform-Administration.', 'Users cannot read the catalog status');
select is((select count(*)::integer from public.vinted_listing_catalog_refreshes), 0, 'Users cannot read refresh requests');

select set_config('request.jwt.claims','{"sub":"54020000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.vinted_listing_catalog_status()->>'leaves')::integer, 2, 'Operators read the catalog size');
select is((public.vinted_listing_catalog_status()->>'leavesWithFields')::integer, 2, 'Counts leaves with fields');
select is((public.vinted_listing_catalog_status()->>'leavesDue')::integer, 0, 'Recently read leaves are not due');
select ok(public.request_vinted_listing_catalog_refresh() is not null, 'Operators request a refresh');
select is((public.vinted_listing_catalog_status()->>'leavesDue')::integer, 2, 'A refresh makes earlier reads due');
select ok(public.vinted_listing_catalog_status()->>'refreshRequestedAt' is not null, 'Shows the open request');
select is((select count(*)::integer from public.vinted_listing_catalog_refreshes), 1, 'Operators read the single request row');
select ok(public.request_vinted_listing_catalog_refresh() is not null, 'A second request replaces the first');
select is((select count(*)::integer from public.vinted_listing_catalog_refreshes), 1, 'There is only ever one request');
reset role;
select * from finish();
rollback;
