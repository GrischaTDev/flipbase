\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'product_categories', 'Kategorietabelle existiert');
select has_table('public', 'brands', 'Markentabelle existiert');
select has_column('public', 'inventory_items', 'category_id', 'Artikel verweisen auf eine Kategorie');
select has_column('public', 'inventory_items', 'brand_id', 'Artikel verweisen auf eine Marke');
select has_column('public', 'catalog_products', 'category_id', 'Katalogprodukte verweisen auf eine Kategorie');
select has_column('public', 'catalog_products', 'brand_id', 'Katalogprodukte verweisen auf eine Marke');
select ok((select relrowsecurity from pg_class where oid = 'public.product_categories'::regclass), 'RLS auf Kategorien');
select ok((select relrowsecurity from pg_class where oid = 'public.brands'::regclass), 'RLS auf Marken');
select policies_are(
  'public',
  'product_categories',
  array['Angemeldete lesen Produktkategorien'],
  'Kategorien behalten ihre bestehende Lesepolicy'
);
select policies_are(
  'public',
  'brands',
  array['Marken aendern', 'Marken anlegen', 'Marken lesen', 'Marken loeschen'],
  'Marken behalten ihre bestehenden Policies'
);
select ok(not has_function_privilege('authenticated', 'public.migrate_legacy_category_brand_texts()', 'execute'), 'Übernahme ist für Angemeldete nicht aufrufbar');
select ok(not has_table_privilege('authenticated', 'public.product_categories', 'insert'), 'Angemeldete dürfen keine Kategorien einfügen');
select ok(not has_table_privilege('authenticated', 'public.product_categories', 'update'), 'Angemeldete dürfen keine Kategorien ändern');
select ok(not has_table_privilege('authenticated', 'public.product_categories', 'delete'), 'Angemeldete dürfen keine Kategorien löschen');
select ok(not has_table_privilege('authenticated', 'public.product_categories', 'truncate'), 'Angemeldete dürfen Kategorien nicht leeren');
select ok(has_table_privilege('authenticated', 'public.product_categories', 'select'), 'Angemeldete dürfen Kategorien lesen');
select ok(has_table_privilege('authenticated', 'public.brands', 'select'), 'Angemeldete dürfen Marken lesen');
select ok(has_table_privilege('authenticated', 'public.brands', 'insert'), 'Angemeldete dürfen Marken anlegen');
select ok(has_table_privilege('authenticated', 'public.brands', 'update'), 'Angemeldete dürfen Marken ändern');
select ok(has_table_privilege('authenticated', 'public.brands', 'delete'), 'Angemeldete dürfen Marken löschen');
select ok(not has_table_privilege('authenticated', 'public.brands', 'truncate'), 'Angemeldete dürfen Marken nicht leeren');
select ok(not has_table_privilege('anon', 'public.brands', 'select'), 'anon erhält kein Markenrecht');
select ok(not has_table_privilege('anon', 'public.brands', 'insert'), 'anon darf keine Marken anlegen');
select ok(not has_table_privilege('anon', 'public.brands', 'update'), 'anon darf keine Marken ändern');
select ok(not has_table_privilege('anon', 'public.brands', 'delete'), 'anon darf keine Marken löschen');
select ok(not has_table_privilege('anon', 'public.brands', 'truncate'), 'anon darf Marken nicht leeren');

-- Testdaten als postgres. Kennungen „zz“ kommen in der Shopify-Taxonomie nicht vor.
-- Eigene Testversion „1999-01“, damit sie nicht mit der echten importierten Version
-- 2026-08 kollidiert (sonst zählt der Import-Test unten die Testkategorie mit).
insert into public.product_categories (id, parent_id, name, full_name, level, is_leaf, taxonomy_version) values
  ('zz', null, 'Testbereich', 'Testbereich', 1, false, '1999-01'),
  ('zz-1', 'zz', 'Unterbereich', 'Testbereich > Unterbereich', 2, true, '1999-01');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('c5100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'brands-a@example.test', '{}', '{}'),
  ('c5100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'brands-b@example.test', '{}', '{}');
insert into public.workspaces (id, name) values
  ('c5100000-0000-4000-8000-000000000011', 'Marken A'),
  ('c5100000-0000-4000-8000-000000000012', 'Marken B');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('c5100000-0000-4000-8000-000000000011', 'c5100000-0000-4000-8000-000000000001', 'owner'),
  ('c5100000-0000-4000-8000-000000000012', 'c5100000-0000-4000-8000-000000000002', 'owner');
insert into public.purchases (id, workspace_id, type, title, entry_status, finalized_at, finalized_by) values
  ('c5100000-0000-4000-8000-000000000031', 'c5100000-0000-4000-8000-000000000011', 'single', 'Abgeschlossen', 'finalized', now(), 'c5100000-0000-4000-8000-000000000001');
insert into public.inventory_items (id, workspace_id, title, brand, category_id) values
  ('c5100000-0000-4000-8000-000000000041', 'c5100000-0000-4000-8000-000000000011', 'Abgeschlossener Artikel', 'Sony', 'zz-1');
update public.inventory_items set purchase_id = 'c5100000-0000-4000-8000-000000000031'
where id = 'c5100000-0000-4000-8000-000000000041';

-- Kürzung auf 120 Zeichen darf keine abgeschnittene Markenschreibweise mit
-- Leerzeichen am Ende erzeugen, sonst verletzt sie name = btrim(name).
select lives_ok($$insert into public.inventory_items (id, workspace_id, title, brand, category_id)
  values ('c5100000-0000-4000-8000-000000000043', 'c5100000-0000-4000-8000-000000000011', 'Trimmtest', repeat('x', 119) || ' Ende', 'zz-1')$$,
  'Auf 120 Zeichen gekürzter Markentext mit Leerzeichen an Kürzungsstelle wird angenommen');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000043'), repeat('x', 119), 'Gekürzter Markentext behält kein Leerzeichen am Ende');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$insert into public.inventory_items (id, workspace_id, title, brand, category_id)
  values ('c5100000-0000-4000-8000-000000000042', 'c5100000-0000-4000-8000-000000000011', 'Bohrer', ' Bosch ', 'zz-1')$$,
  'Mitglied legt Artikel mit Markentext an');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), 'Bosch', 'Markentext wird bereinigt übernommen');
select is((select category from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), 'Testbereich > Unterbereich', 'Kategorietext kommt aus der Kategorie');
select lives_ok($$insert into public.catalog_products (id, workspace_id, title, brand)
  values ('c5100000-0000-4000-8000-000000000051', 'c5100000-0000-4000-8000-000000000011', 'Bohrer Katalog', 'BOSCH')$$,
  'Katalogprodukt mit anderer Schreibweise');
select is((select count(*)::int from public.brands where workspace_id = 'c5100000-0000-4000-8000-000000000011' and name_key = 'bosch'), 1, 'Gleiche Marke entsteht nur einmal');
select is((select brand from public.catalog_products where id = 'c5100000-0000-4000-8000-000000000051'), 'Bosch', 'Vorhandene Schreibweise gilt');
select lives_ok($$insert into public.inventory_items (id, workspace_id, title, brand, brand_id, category)
  values (
    'c5100000-0000-4000-8000-000000000044',
    'c5100000-0000-4000-8000-000000000011',
    'Kennungen und exakter Kategoriepfad',
    'Ignorierter Markentext',
    (select id from public.brands where workspace_id = 'c5100000-0000-4000-8000-000000000011' and name_key = 'bosch'),
    'Testbereich > Unterbereich'
  )$$,
  'Exakter Kategorietext ohne category_id und vorhandene brand_id werden synchronisiert');
select is((select category_id from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000044'), 'zz-1', 'Exakter Kategorietext wird in category_id aufgelöst');
select is((select category from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000044'), 'Testbereich > Unterbereich', 'Aufgelöster Kategoriepfad bleibt erhalten');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000044'), 'Bosch', 'Vorhandene brand_id setzt den abgeleiteten Markentext');
select lives_ok($$insert into public.catalog_products (id, workspace_id, title, category)
  values ('c5100000-0000-4000-8000-000000000052', 'c5100000-0000-4000-8000-000000000011', 'Kategorie aus Text', 'Testbereich > Unterbereich')$$,
  'Katalogprodukt darf einen exakten Kategoriepfad ohne category_id senden');
select is((select category_id from public.catalog_products where id = 'c5100000-0000-4000-8000-000000000052'), 'zz-1', 'Katalogprodukt erhält die aufgelöste category_id');
select is((select category from public.catalog_products where id = 'c5100000-0000-4000-8000-000000000052'), 'Testbereich > Unterbereich', 'Katalogprodukt behält den aufgelösten Kategoriepfad');
select lives_ok($$insert into public.inventory_items (id, workspace_id, title, category)
  values ('c5100000-0000-4000-8000-000000000045', 'c5100000-0000-4000-8000-000000000011', 'Unbekannter Kategorietext', 'Nicht in der Taxonomie')$$,
  'Unbekannter freier Kategorietext wird weiterhin angenommen');
select is((select category_id from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000045'), null::text, 'Unbekannter Kategorietext erzeugt keine Kategorie');
select is((select category from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000045'), null::text, 'Unbekannter Kategorietext wird weiterhin verworfen');
select lives_ok($$update public.inventory_items set category = 'Freitext' where id = 'c5100000-0000-4000-8000-000000000042'$$, 'Freier Kategorietext wird angenommen');
select is((select category from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), 'Testbereich > Unterbereich', 'Freier Kategorietext wird überschrieben');
select lives_ok($$update public.brands set name = 'Robert Bosch' where workspace_id = 'c5100000-0000-4000-8000-000000000011' and name_key = 'bosch'$$, 'Marke umbenennen');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), 'Robert Bosch', 'Umbenennung zieht beim Artikel nach');
select is((select brand from public.catalog_products where id = 'c5100000-0000-4000-8000-000000000051'), 'Robert Bosch', 'Umbenennung zieht beim Katalogprodukt nach');
select lives_ok($$update public.brands set name = 'Sony Group' where workspace_id = 'c5100000-0000-4000-8000-000000000011' and name_key = 'sony'$$, 'Marke eines abgeschlossenen Einkaufs umbenennen');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000041'), 'Sony Group', 'Auch Artikel abgeschlossener Einkäufe erhalten den neuen Namen');
select throws_ok($$delete from public.brands where workspace_id = 'c5100000-0000-4000-8000-000000000011' and name_key = 'robert bosch'$$, '23503', null, 'Benutzte Marke lässt sich nicht löschen');
select lives_ok($$update public.inventory_items set brand_id = null where id = 'c5100000-0000-4000-8000-000000000042'$$, 'Marke entfernen');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), null::text, 'Ohne Marke kein Markentext');
select throws_ok($$insert into public.brands (workspace_id, name) values ('c5100000-0000-4000-8000-000000000012', 'Fremd')$$, '42501', null, 'Keine Marke in fremdem Workspace');
select is((select count(*)::int from public.brands where workspace_id = 'c5100000-0000-4000-8000-000000000012'), 0, 'Fremde Marken sind unsichtbar');
select throws_ok($$insert into public.product_categories (id, name, full_name, level, taxonomy_version) values ('yy', 'Neu', 'Neu', 1, '2026-08')$$, '42501', null, 'Kategorien sind nur lesbar');
reset role;

set local role anon;
select throws_ok('select count(*) from public.product_categories', '42501', null, 'anon liest keine Kategorien');
select throws_ok('select count(*) from public.brands', '42501', null, 'anon liest keine Marken');
reset role;

-- Umbenennung einer Kategorie zieht bei verknüpften Artikeln nach.
update public.product_categories set full_name = 'Testbereich > Umbenannt', name = 'Umbenannt' where id = 'zz-1';
select is((select category from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), 'Testbereich > Umbenannt', 'Kategorie-Umbenennung zieht beim Artikel nach');
-- Zurückbenennen, damit die Erwartungen im Altbestand-Block unten unverändert bleiben.
update public.product_categories set full_name = 'Testbereich > Unterbereich', name = 'Unterbereich' where id = 'zz-1';

-- Altbestand: freie Texte ohne Verweise. Der Sync-Trigger würde sie beim Einfügen
-- sofort bereinigen, deshalb ist er nur für die Testdaten abgeschaltet.
-- inventory_items hat einen vorhandenen "deferrable initially deferred"
-- Constraint-Trigger (Verkaufsintegrität); ohne dieses Flush lehnt Postgres das
-- spätere ALTER TABLE wegen ausstehender Trigger-Ereignisse ab.
set constraints all immediate;
alter table public.inventory_items disable trigger "10_sync_category_brand_text";
alter table public.catalog_products disable trigger "10_sync_category_brand_text";
insert into public.workspaces (id, name) values ('c5100000-0000-4000-8000-000000000013', 'Altbestand');
insert into public.workspace_members (workspace_id, user_id, role)
values ('c5100000-0000-4000-8000-000000000013', 'c5100000-0000-4000-8000-000000000001', 'owner');
insert into public.inventory_items (id, workspace_id, title, brand, category) values
  ('c5100000-0000-4000-8000-000000000061', 'c5100000-0000-4000-8000-000000000013', 'Alt 1', 'Nintendo', 'Konsolen'),
  ('c5100000-0000-4000-8000-000000000062', 'c5100000-0000-4000-8000-000000000013', 'Alt 2', 'nintendo ', 'Konsolen'),
  ('c5100000-0000-4000-8000-000000000063', 'c5100000-0000-4000-8000-000000000013', 'Alt 3', 'NINTENDO', null),
  ('c5100000-0000-4000-8000-000000000064', 'c5100000-0000-4000-8000-000000000013', 'Alt 4', '   ', 'Werkzeug');
insert into public.catalog_products (id, workspace_id, title, brand, category)
values ('c5100000-0000-4000-8000-000000000071', 'c5100000-0000-4000-8000-000000000013', 'Alt Katalog', 'Nintendo', 'Spiele');
alter table public.inventory_items enable trigger "10_sync_category_brand_text";
alter table public.catalog_products enable trigger "10_sync_category_brand_text";

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.archive_workspace('c5100000-0000-4000-8000-000000000013');
reset role;

select lives_ok($$select public.migrate_legacy_category_brand_texts()$$, 'Übernahme läuft auch mit archiviertem Workspace');
select is((select string_agg(name, ',') from public.brands where workspace_id = 'c5100000-0000-4000-8000-000000000013'), 'Nintendo', 'Häufigste Schreibweise wird Markenname');
select is((select count(*)::int from public.inventory_items where workspace_id = 'c5100000-0000-4000-8000-000000000013' and brand_id is not null), 3, 'Alle Artikel mit Markentext verweisen auf die Marke');
select is((select count(*)::int from public.inventory_items where workspace_id = 'c5100000-0000-4000-8000-000000000013' and category is not null), 0, 'Alte Kategorietexte sind geleert');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000064'), null::text, 'Leerer Markentext wird entfernt');
select is((select concat_ws('|', brand, category) from public.catalog_products where id = 'c5100000-0000-4000-8000-000000000071'), 'Nintendo', 'Katalogprodukt übernommen, Kategorie geleert');
select is((select concat_ws('|', brand, category) from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000041'), 'Sony Group|Testbereich > Unterbereich', 'Verknüpfte Artikel bleiben unverändert');
select throws_ok($$update public.inventory_items set title = 'Nach Übernahme' where id = 'c5100000-0000-4000-8000-000000000061'$$, '55000', null, 'Archivschutz ist danach wieder aktiv');

-- Importierte Shopify-Taxonomie v2026-08
select is((select count(*)::int from public.product_categories where level = 1 and taxonomy_version = '2026-08'), 21, '21 Hauptbereiche nach Ausblenden von fünf');
select is((select count(*)::int from public.product_categories where split_part(id, '-', 1) in ('gc', 'se', 'bu', 'pa', 'na')), 0, 'Ausgeblendete Bereiche fehlen');
select cmp_ok((select count(*)::int from public.product_categories where taxonomy_version = '2026-08'), '>', 14000, 'Taxonomie ist vollständig importiert');
select is((select full_name from public.product_categories where id = 'el-6-6'), 'Elektronik > Computer > Laptops', 'Pfad einer bekannten Kategorie');
select is((select is_leaf from public.product_categories where id = 'el-6'), false, 'Computer hat Unterkategorien');
select is((select count(*)::int from public.product_categories child left join public.product_categories parent on parent.id = child.parent_id where child.parent_id is not null and parent.id is null), 0, 'Jede Oberkategorie existiert');

select * from finish();
rollback;
