\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select plan(10);

select has_column('public', 'catalog_products', 'description', 'Artikel besitzen eine echte Beschreibung');
select col_type_is('public', 'catalog_products', 'description', 'text', 'Beschreibung ist freier Text');
select col_is_null('public', 'catalog_products', 'description', 'Bestehende Artikel benötigen keine erfundene Beschreibung');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('bd130000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'catalog-update@example.test', '{}', '{}');
insert into public.workspaces (id, name) values
  ('bd130000-0000-4000-8000-000000000011', 'Artikel A'),
  ('bd130000-0000-4000-8000-000000000012', 'Artikel B');
insert into public.workspace_members (workspace_id, user_id, role)
values ('bd130000-0000-4000-8000-000000000011', 'bd130000-0000-4000-8000-000000000001', 'owner');
insert into public.catalog_products (id, workspace_id, title) values
  ('bd130000-0000-4000-8000-000000000021', 'bd130000-0000-4000-8000-000000000011', 'Alte Artikelbezeichnung'),
  ('bd130000-0000-4000-8000-000000000022', 'bd130000-0000-4000-8000-000000000012', 'Fremder Artikel');
insert into public.purchases (id, workspace_id, type, title, purchase_price)
values ('bd130000-0000-4000-8000-000000000031', 'bd130000-0000-4000-8000-000000000011', 'lot', 'Historischer Einkauf', 20);
insert into public.purchase_lines (id, workspace_id, purchase_id, catalog_product_id, title_snapshot, line_kind, ordered_quantity, unit_purchase_price, line_total)
values ('bd130000-0000-4000-8000-000000000041', 'bd130000-0000-4000-8000-000000000011', 'bd130000-0000-4000-8000-000000000031', 'bd130000-0000-4000-8000-000000000021', 'Historischer Einkaufstext', 'quantity', 2, 10, 20);
create temporary table catalog_snapshot as
select to_jsonb(line) as line, to_jsonb(purchase) as purchase
from public.purchase_lines line join public.purchases purchase on purchase.id = line.purchase_id
where line.id = 'bd130000-0000-4000-8000-000000000041';
grant select on catalog_snapshot to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bd130000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$update public.catalog_products set title = 'Neuer Name', description = 'Eine echte Beschreibung mit Umlauten: Größe.' where id = 'bd130000-0000-4000-8000-000000000021' and workspace_id = 'bd130000-0000-4000-8000-000000000011'$$, 'Mitglied darf eigenen Artikel aktualisieren');
select is((select description from public.catalog_products where id = 'bd130000-0000-4000-8000-000000000021'), 'Eine echte Beschreibung mit Umlauten: Größe.', 'Beschreibung wird dauerhaft gespeichert');
select is((select count(*) from public.catalog_products where workspace_id = 'bd130000-0000-4000-8000-000000000011'), 1::bigint, 'Bearbeiten legt keinen zweiten Artikel an');
select is((select to_jsonb(line) from public.purchase_lines line where id = 'bd130000-0000-4000-8000-000000000041'), (select line from catalog_snapshot), 'Die gesamte historische Einkaufsposition bleibt unverändert');
select is((select to_jsonb(purchase) from public.purchases purchase where id = 'bd130000-0000-4000-8000-000000000031'), (select purchase from catalog_snapshot), 'Der historische Einkauf bleibt unverändert');
with changed as (
  update public.catalog_products set description = 'Unzulässig' where id = 'bd130000-0000-4000-8000-000000000022' returning id
) select is((select count(*) from changed), 0::bigint, 'Ein fremder Workspace kann nicht bearbeitet werden');
reset role;
select is((select description from public.catalog_products where id = 'bd130000-0000-4000-8000-000000000022'), null::text, 'Fremde Beschreibung bleibt unverändert');
select * from finish();
rollback;
