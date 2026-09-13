\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('ba500000-0000-4000-8000-000000000001','authenticated','authenticated','gallery-layout@example.test','{}','{}');
insert into public.workspaces(id,name) values ('ba500000-0000-4000-8000-000000000011','Layout'),('ba500000-0000-4000-8000-000000000012','Fremd');
insert into public.workspace_members(workspace_id,user_id,role) values ('ba500000-0000-4000-8000-000000000011','ba500000-0000-4000-8000-000000000001','owner');
insert into public.catalog_products(id,workspace_id,title,seo_title,seo_description,url_handle)
values ('ba500000-0000-4000-8000-000000000021','ba500000-0000-4000-8000-000000000011','Titel','Suchname','Beschreibung','suchname'),('ba500000-0000-4000-8000-000000000022','ba500000-0000-4000-8000-000000000012','Fremd',null,null,null);
insert into public.catalog_product_media(id,workspace_id,catalog_product_id,storage_path,is_primary,sort_order)
values ('ba500000-0000-4000-8000-000000000031','ba500000-0000-4000-8000-000000000011','ba500000-0000-4000-8000-000000000021','catalog-products/ba500000-0000-4000-8000-000000000011/ba500000-0000-4000-8000-000000000021/ba500000-0000-4000-8000-000000000031.png',true,0),
('ba500000-0000-4000-8000-000000000032','ba500000-0000-4000-8000-000000000011','ba500000-0000-4000-8000-000000000021','catalog-products/ba500000-0000-4000-8000-000000000011/ba500000-0000-4000-8000-000000000021/ba500000-0000-4000-8000-000000000032.png',false,1),
('ba500000-0000-4000-8000-000000000033','ba500000-0000-4000-8000-000000000012','ba500000-0000-4000-8000-000000000022','catalog-products/ba500000-0000-4000-8000-000000000012/ba500000-0000-4000-8000-000000000022/ba500000-0000-4000-8000-000000000033.png',true,0);
select ok(not has_function_privilege('anon','public.update_product_media_layout(uuid,uuid[],uuid[],uuid)','execute'),'Anonyme dürfen Galerie nicht ändern');
select ok(not has_function_privilege('authenticated','public.lock_catalog_product_media()','execute'),'Sperrtrigger bleibt intern');
create function pg_temp.reject_gallery_update() returns trigger language plpgsql as $$
begin
  if current_setting('test.fail_gallery',true) = 'on' then raise exception 'Simulierter Schreibfehler'; end if;
  return new;
end;
$$;
create trigger reject_gallery_update before update on public.catalog_product_media for each row execute function pg_temp.reject_gallery_update();
select set_config('request.jwt.claim.sub','ba500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select seo_title from public.catalog_products where id='ba500000-0000-4000-8000-000000000021'),'Suchname','SEO-Titel gespeichert');
select is((select seo_description from public.catalog_products where id='ba500000-0000-4000-8000-000000000021'),'Beschreibung','SEO-Beschreibung gespeichert');
update public.catalog_products set title='Neuer Titel' where id='ba500000-0000-4000-8000-000000000021';
select is((select url_handle from public.catalog_products where id='ba500000-0000-4000-8000-000000000021'),'suchname','Titeländerung lässt Handle stabil');
select is((select count(*) from public.catalog_products where id='ba500000-0000-4000-8000-000000000022'),0::bigint,'Fremde SEO-Felder sind verborgen');
select throws_ok($$update public.catalog_products set url_handle='Ungültiger Pfad' where id='ba500000-0000-4000-8000-000000000021'$$,'23514',null,'Handleformat wird serverseitig geprüft');
select results_eq($$select id from public.update_product_media_layout('ba500000-0000-4000-8000-000000000021',array['ba500000-0000-4000-8000-000000000032','ba500000-0000-4000-8000-000000000031']::uuid[],array['ba500000-0000-4000-8000-000000000031','ba500000-0000-4000-8000-000000000032']::uuid[],'ba500000-0000-4000-8000-000000000011')$$,$$values ('ba500000-0000-4000-8000-000000000032'::uuid),('ba500000-0000-4000-8000-000000000031'::uuid)$$,'Reihenfolge wird atomar gespeichert');
select is((select id from public.catalog_product_media where catalog_product_id='ba500000-0000-4000-8000-000000000021' and is_primary),'ba500000-0000-4000-8000-000000000032'::uuid,'Erstes Bild ist Hauptbild');
select is((select sum(sort_order) from public.catalog_product_media where catalog_product_id='ba500000-0000-4000-8000-000000000021'),1::bigint,'Sortierung beginnt bei null');
select throws_ok($$select * from public.update_product_media_layout('ba500000-0000-4000-8000-000000000021',array['ba500000-0000-4000-8000-000000000031','ba500000-0000-4000-8000-000000000031']::uuid[],array['ba500000-0000-4000-8000-000000000031','ba500000-0000-4000-8000-000000000032']::uuid[],'ba500000-0000-4000-8000-000000000011')$$,'22023','Die Bilderliste ist ungültig.','Doppelte IDs werden abgewiesen');
select throws_ok($$select * from public.update_product_media_layout('ba500000-0000-4000-8000-000000000021',array['ba500000-0000-4000-8000-000000000033']::uuid[],array['ba500000-0000-4000-8000-000000000031','ba500000-0000-4000-8000-000000000032']::uuid[],'ba500000-0000-4000-8000-000000000011')$$,'22023','Die Bilderliste ist ungültig.','Fremde IDs dürfen nicht eingeschleust werden');
select throws_ok($$select * from public.update_product_media_layout('ba500000-0000-4000-8000-000000000022',array['ba500000-0000-4000-8000-000000000033']::uuid[],array['ba500000-0000-4000-8000-000000000033']::uuid[],'ba500000-0000-4000-8000-000000000012')$$,'42501','Workspace ist nicht zugänglich.','Fremder Workspace wird abgewiesen');
select throws_ok($$select * from public.update_product_media_layout('ba500000-0000-4000-8000-000000000022','{}','{}','ba500000-0000-4000-8000-000000000011')$$,'42501','Produkt ist nicht zugänglich.','Produkt muss zum Workspace gehören');
select throws_ok($$select * from public.update_product_media_layout('ba500000-0000-4000-8000-000000000021',array['ba500000-0000-4000-8000-000000000031']::uuid[],array['ba500000-0000-4000-8000-000000000031']::uuid[],'ba500000-0000-4000-8000-000000000011')$$,'40001','Die Bilder wurden zwischenzeitlich geändert. Bitte erneut laden.','Zwischenzeitlicher Upload wird erkannt');
select is((select count(*) from public.catalog_product_media where catalog_product_id='ba500000-0000-4000-8000-000000000021'),2::bigint,'Konflikt hat keine Teiländerungen');
select is((select id from public.catalog_product_media where catalog_product_id='ba500000-0000-4000-8000-000000000021' and is_primary),'ba500000-0000-4000-8000-000000000032'::uuid,'Hauptbild bleibt bei Konflikt erhalten');
select set_config('test.fail_gallery','on',true);
select throws_ok($$select * from public.update_product_media_layout('ba500000-0000-4000-8000-000000000021',array['ba500000-0000-4000-8000-000000000031']::uuid[],array['ba500000-0000-4000-8000-000000000031','ba500000-0000-4000-8000-000000000032']::uuid[],'ba500000-0000-4000-8000-000000000011')$$,'P0001','Simulierter Schreibfehler','Fehler nach DELETE bricht gesamte Speicherung ab');
select set_config('test.fail_gallery','off',true);
select is((select count(*) from public.catalog_product_media where catalog_product_id='ba500000-0000-4000-8000-000000000021'),2::bigint,'Rollback stellt gelöschte Metadaten wieder her');
select lives_ok($$select * from public.update_product_media_layout('ba500000-0000-4000-8000-000000000021',array['ba500000-0000-4000-8000-000000000031']::uuid[],array['ba500000-0000-4000-8000-000000000031','ba500000-0000-4000-8000-000000000032']::uuid[],'ba500000-0000-4000-8000-000000000011')$$,'Bild entfernen und Hauptbild wechseln');
select throws_ok($$select * from public.update_product_media_layout('ba500000-0000-4000-8000-000000000021',array['ba500000-0000-4000-8000-000000000031','ba500000-0000-4000-8000-000000000032']::uuid[],array['ba500000-0000-4000-8000-000000000031','ba500000-0000-4000-8000-000000000032']::uuid[],'ba500000-0000-4000-8000-000000000011')$$,'40001','Die Bilder wurden zwischenzeitlich geändert. Bitte erneut laden.','Zwischenzeitliches Entfernen wird erkannt');
select lives_ok($$select * from public.update_product_media_layout('ba500000-0000-4000-8000-000000000021','{}',array['ba500000-0000-4000-8000-000000000031']::uuid[],'ba500000-0000-4000-8000-000000000011')$$,'Alle Bilder entfernen');
select is((select count(*) from public.catalog_product_media where catalog_product_id='ba500000-0000-4000-8000-000000000021'),0::bigint,'Leere Galerie wird gespeichert');
reset role;
select is((select count(*) from public.catalog_product_media where catalog_product_id='ba500000-0000-4000-8000-000000000022'),1::bigint,'Fremde Galerie bleibt unverändert');
select * from finish();
rollback;
