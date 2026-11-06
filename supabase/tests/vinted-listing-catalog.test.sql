\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('54010000-0000-4000-8000-000000000001','authenticated','authenticated','catalog-reader@example.test','{}','{}');

-- Rechte: lesen nur Angemeldete, schreiben nur der Dienstschlüssel über die Funktionen.
select ok(not has_table_privilege('anon','public.vinted_listing_categories','select'),'No anonymous category read');
select ok(not has_table_privilege('anon','public.vinted_listing_sizes','select'),'No anonymous size read');
select ok(not has_table_privilege('authenticated','public.vinted_listing_categories','insert'),'No direct client category writes');
select ok(not has_table_privilege('authenticated','public.vinted_listing_sizes','update'),'No direct client size updates');
select ok(not has_table_privilege('authenticated','public.vinted_listing_category_fields','delete'),'No direct client field deletes');
select ok(not has_function_privilege('authenticated','public.marketplace_save_vinted_listing_categories(timestamptz,jsonb)','execute'),'Clients cannot replace the tree');
select ok(not has_function_privilege('authenticated','public.marketplace_save_vinted_listing_category_fields(integer,timestamptz,jsonb)','execute'),'Clients cannot replace category fields');
select ok(not has_function_privilege('anon','public.marketplace_save_vinted_listing_options(text,jsonb)','execute'),'Anonymous users cannot replace options');

set local role service_role;
select is(public.marketplace_save_vinted_listing_categories(now() - interval '1 hour', '[
 {"id":5,"parentId":null,"title":"Herren","fullTitle":"Herren","path":"","position":0,"isLeaf":false},
 {"id":2050,"parentId":5,"title":"Kleidung","fullTitle":"Kleidung (Herren)","path":"Herren","position":0,"isLeaf":false},
 {"id":1819,"parentId":2050,"title":"Gerade geschnittene Jeans","fullTitle":"Gerade geschnittene Jeans (Herren)","path":"Herren > Kleidung > Jeans","position":0,"isLeaf":true},
 {"id":1223,"parentId":2050,"title":"Bomberjacken","fullTitle":"Bomberjacken (Herren)","path":"Herren > Kleidung > Jacken","position":1,"isLeaf":true}
]'), 4, 'Stores the selling tree');
select is((select path from public.vinted_listing_categories where id = 1819), 'Herren > Kleidung > Jeans', 'Keeps the Vinted path');

select throws_ok($$select public.marketplace_save_vinted_listing_categories(now(), '[{"id":1,"parentId":9,"title":"A","fullTitle":"A","path":"","position":0,"isLeaf":true}]')$$,
 'P0001','Invalid Vinted listing categories','Rejects a missing parent');
select throws_ok($$select public.marketplace_save_vinted_listing_categories(now(), '[{"id":1,"parentId":null,"title":"A","fullTitle":"A","path":"","position":0,"isLeaf":false}]')$$,
 'P0001','Invalid Vinted listing categories','Rejects a branch without children');
select throws_ok($$select public.marketplace_save_vinted_listing_categories(now(), '[{"id":1,"parentId":null,"title":"A","fullTitle":"A","path":"","position":0,"isLeaf":true},{"id":1,"parentId":null,"title":"B","fullTitle":"B","path":"","position":1,"isLeaf":true}]')$$,
 'P0001','Invalid Vinted listing categories','Rejects duplicate category IDs');

select is(public.marketplace_save_vinted_listing_category_fields(1819, now() - interval '30 minutes', '[
 {"code":"brand","position":0},
 {"code":"size","position":1,"required":true,"selectionType":"single","limit":1,"display":"grid","sizeGroups":[
   {"id":14,"title":"Größen Männer","sizes":[{"id":207,"title":"S"},{"id":208,"title":"M"}]},
   {"id":77,"title":"Hosen für Herren","sizes":[{"id":1640,"title":"W32 | DE 48"},{"id":1641,"title":"W33 | DE 48"}]}]},
 {"code":"condition","position":2,"required":true,"selectionType":"single","limit":1,"display":"list","options":[
   {"id":6,"title":"Neu, mit Etikett"},{"id":2,"title":"Sehr gut"}]},
 {"code":"color","position":3,"selectionType":"multi","limit":2},
 {"code":"material","position":4,"required":false,"selectionType":"multi","limit":3,"display":"list","options":[
   {"id":303,"title":"Denim"},{"id":44,"title":"Baumwolle"}]}
]'), true, 'Stores fields with size groups and options');
select is((select array_agg(size_group_id order by position) from public.vinted_listing_category_size_groups where category_id = 1819),
 array[14,77], 'Keeps both size groups in Vinted order');
select is((select title from public.vinted_listing_sizes where id = 1640), 'W32 | DE 48', 'Keeps the exact Vinted size label');
select is((select option_ids from public.vinted_listing_category_fields where category_id = 1819 and field_code = 'condition'),
 array[6,2], 'Keeps allowed condition options in Vinted order');
select is((select option_ids from public.vinted_listing_category_fields where category_id = 1819 and field_code = 'color'),
 null::integer[], 'A field without options means all values of the attribute');
select is((select selection_limit from public.vinted_listing_category_fields where category_id = 1819 and field_code = 'material'),
 3, 'Keeps the selection limit');
select ok((select fields_observed_at is not null from public.vinted_listing_categories where id = 1819), 'Records when the fields were read');

select is(public.marketplace_save_vinted_listing_category_fields(1819, now() - interval '2 hours', '[{"code":"brand","position":0}]'),
 false, 'Older field reads cannot overwrite newer ones');
select is((select count(*)::integer from public.vinted_listing_category_fields where category_id = 1819), 5, 'Newer fields stay');
select throws_ok($$select public.marketplace_save_vinted_listing_category_fields(2050, now(), '[]')$$,
 'P0001','Unknown Vinted listing category','Only leaf categories have fields');
select throws_ok($$select public.marketplace_save_vinted_listing_category_fields(1223, now(), '[{"code":"size","position":0}]')$$,
 'P0001','Invalid Vinted category fields','A size field needs size groups');

select is(public.marketplace_save_vinted_listing_category_fields(1223, now() - interval '20 minutes', '[
 {"code":"size","position":0,"required":true,"selectionType":"single","limit":1,"sizeGroups":[
   {"id":14,"title":"Größen Männer","sizes":[{"id":206,"title":"XS"},{"id":207,"title":"S"},{"id":208,"title":"M"}]}]}
]'), true, 'Shares size groups between categories');
select is((select count(*)::integer from public.vinted_listing_sizes where size_group_id = 14), 3, 'Updates the shared size group');

select is(public.marketplace_save_vinted_listing_options('color', '[
 {"id":1,"title":"Schwarz","hex":"000000","code":"BLACK"},{"id":9,"title":"Blau","hex":"007bc4","code":"BLUE"},{"id":15,"title":"Bunt","hex":"","code":"VARIOUS"}]'),
 3, 'Stores attribute-wide colors');
select is((select hex from public.vinted_listing_options where field_code = 'color' and id = 15), null, 'An empty colour value stays empty');
select is(public.marketplace_save_vinted_listing_options('color', '[{"id":1,"title":"Schwarz","hex":"000000","code":"BLACK"}]'),
 1, 'Replaces the colour list');
select is((select count(*)::integer from public.vinted_listing_options where field_code = 'color'), 1, 'Removes colours Vinted no longer offers');
select throws_ok($$select public.marketplace_save_vinted_listing_options('size', '[{"id":1,"title":"S"}]')$$,
 'P0001','Invalid Vinted listing options','Sizes are not stored as options');

select is(public.marketplace_save_vinted_listing_categories(now() - interval '10 minutes', '[
 {"id":5,"parentId":null,"title":"Herren","fullTitle":"Herren","path":"","position":0,"isLeaf":false},
 {"id":2050,"parentId":5,"title":"Kleidung","fullTitle":"Kleidung (Herren)","path":"Herren","position":0,"isLeaf":false},
 {"id":1819,"parentId":2050,"title":"Gerade geschnittene Jeans","fullTitle":"Gerade geschnittene Jeans (Herren)","path":"Herren > Kleidung > Jeans","position":0,"isLeaf":true}
]'), 3, 'Replaces the tree');
select is((select count(*)::integer from public.vinted_listing_categories where id = 1223), 0, 'Drops categories Vinted no longer offers');
select is((select count(*)::integer from public.vinted_listing_category_fields where category_id = 1223), 0, 'Drops their fields');
select is((select count(*)::integer from public.vinted_listing_category_fields where category_id = 1819), 5, 'Keeps fields of remaining categories');
select is(public.marketplace_save_vinted_listing_categories(now() - interval '3 hours', '[
 {"id":7,"parentId":null,"title":"Alt","fullTitle":"Alt","path":"","position":0,"isLeaf":true}]'),
 0, 'An older tree cannot overwrite a newer one');
select is((select count(*)::integer from public.vinted_listing_categories), 3, 'The newer tree stays');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"54010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.vinted_listing_categories), 3, 'Signed-in users read the tree');
select is((select count(*)::integer from public.vinted_listing_sizes where size_group_id = 77), 2, 'Signed-in users read sizes');
select is((select count(*)::integer from public.vinted_listing_category_fields where category_id = 1819), 5, 'Signed-in users read category fields');
reset role;
select * from finish();
rollback;
