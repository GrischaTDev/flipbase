\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select plan(16);

select has_table('public', 'catalog_product_groups', 'Artikelgruppen sind vorhanden');
select has_column('public', 'catalog_products', 'variant_group_id', 'Varianten können zugeordnet werden');
select ok(
  (select condeferrable and condeferred from pg_constraint
    where conname = 'catalog_products_variant_group_fkey'),
  'Gruppenprüfung lässt bestehenden Workspace-Schutz zuerst ausführen'
);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('bf140000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'variants@example.test', '{}', '{}');
insert into public.workspaces (id, name) values
  ('bf140000-0000-4000-8000-000000000011', 'Varianten A'),
  ('bf140000-0000-4000-8000-000000000012', 'Varianten B');
insert into public.workspace_members (workspace_id, user_id, role)
values ('bf140000-0000-4000-8000-000000000011', 'bf140000-0000-4000-8000-000000000001', 'owner');
insert into public.catalog_products (id, workspace_id, title, size, color, material) values
  ('bf140000-0000-4000-8000-000000000021', 'bf140000-0000-4000-8000-000000000011', 'Schuh', '39', 'Schwarz', 'Leder'),
  ('bf140000-0000-4000-8000-000000000022', 'bf140000-0000-4000-8000-000000000012', 'Fremder Schuh', '39', 'Schwarz', 'Leder');

select is((select variant_group_id from public.catalog_products where id = 'bf140000-0000-4000-8000-000000000021'), 'bf140000-0000-4000-8000-000000000021'::uuid, 'Neuer Artikel bildet eine eigene Gruppe');

-- Ein vor der Migration angelegter Artikel hatte noch keine Gruppenkennung.
update public.catalog_products set variant_group_id = null
where id = 'bf140000-0000-4000-8000-000000000021';
delete from public.catalog_product_groups
where id = 'bf140000-0000-4000-8000-000000000021';
select is((select variant_group_id from public.catalog_products where id = 'bf140000-0000-4000-8000-000000000021'), null::uuid, 'Altartikel ist zunächst ohne Gruppe');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bf140000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.create_catalog_product_variant(
  'bf140000-0000-4000-8000-000000000011',
  'bf140000-0000-4000-8000-000000000021',
  '40', 'Schwarz', null, null, null
)$$, 'Mitglied darf eine weitere Größe anlegen');
select is((select count(*) from public.catalog_products where workspace_id = 'bf140000-0000-4000-8000-000000000011'), 2::bigint, 'Die Variante ist ein eigener Artikel');
select is((select count(distinct variant_group_id) from public.catalog_products where workspace_id = 'bf140000-0000-4000-8000-000000000011'), 1::bigint, 'Beide Größen teilen eine Gruppe');
select is((select variant_group_id from public.catalog_products where id = 'bf140000-0000-4000-8000-000000000021'), 'bf140000-0000-4000-8000-000000000021'::uuid, 'Altartikel behält seine ID und bekommt eine Gruppe');
select throws_ok($$select public.create_catalog_product_variant(
  'bf140000-0000-4000-8000-000000000011',
  'bf140000-0000-4000-8000-000000000021',
  '40', 'schwarz', null, null, null
)$$, '23505', null, 'Doppelte Größen-Farbkombination wird verhindert');
select lives_ok($$update public.catalog_products set title = 'Schuh Modell B', material = 'Textil'
  where id = 'bf140000-0000-4000-8000-000000000021'$$, 'Gemeinsame Angaben lassen sich bearbeiten');
select is((select count(*) from public.catalog_products where workspace_id = 'bf140000-0000-4000-8000-000000000011' and title = 'Schuh Modell B' and material = 'Textil'), 2::bigint, 'Gemeinsame Angaben werden synchronisiert');
select public.set_catalog_product_archived(
  'bf140000-0000-4000-8000-000000000011',
  'bf140000-0000-4000-8000-000000000021', true
);
select lives_ok($$select public.create_catalog_product_variant(
  'bf140000-0000-4000-8000-000000000011',
  (select id from public.catalog_products where workspace_id = 'bf140000-0000-4000-8000-000000000011' and size = '40'),
  '41', 'Schwarz', null, null, null
)$$, 'Weitere Größe lässt sich auch nach Archivierung der ersten Variante anlegen');
select is((select count(*) from public.catalog_products where workspace_id = 'bf140000-0000-4000-8000-000000000011'), 3::bigint, 'Aktive Variante bleibt Ausgangspunkt der Gruppe');
select throws_ok($$select public.create_catalog_product_variant(
  'bf140000-0000-4000-8000-000000000012',
  'bf140000-0000-4000-8000-000000000022',
  '40', 'Schwarz', null, null, null
)$$, '42501', null, 'Fremder Workspace bleibt geschützt');
select is((select count(*) from public.catalog_products where workspace_id = 'bf140000-0000-4000-8000-000000000012'), 0::bigint, 'Fremde Artikel sind nicht sichtbar');

select * from finish();
rollback;
