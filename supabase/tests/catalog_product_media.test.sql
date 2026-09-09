\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

-- pgTAP-Ergebniscursor akzeptieren keine Schreibabfragen; Zeilenzahl separat prüfen.
create function pg_temp.media_affected_rows(p_statement text) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare v_count bigint;
begin
  execute p_statement;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Fehlende Tabelle liefert Vertragsfehler statt eines abgebrochenen SQL-Skripts.
select has_table('public', 'catalog_product_media', 'Produktmedien haben eine eigene Tabelle');
select has_column('public', 'catalog_product_media', column_name, column_name || ' gehört zum Medienvertrag')
from unnest(array['id','workspace_id','catalog_product_id','storage_path','is_primary','sort_order','file_name','file_size','mime_type','created_at']) as column_name;
select ok(exists(select 1 from pg_tables where schemaname = 'public' and tablename = 'catalog_product_media' and rowsecurity), 'Produktmedien aktivieren RLS');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'catalog_product_media' and roles = array['authenticated']::name[]), 4::bigint, 'Vier getrennte authentifizierte Tabellenpolicies');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'Produktmedien %' and roles = array['authenticated']::name[]), 4::bigint, 'Vier getrennte authentifizierte Produkt-Storagepolicies');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and position('item-media' in coalesce(qual,'') || coalesce(with_check,'')) > 0),8::bigint,'Nur vier Legacy- und vier Produktpolicies gewähren Bucketzugriff');
select ok(not exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'Artikelmedien %' and position('catalog-products' in coalesce(qual, '') || coalesce(with_check, '')) = 0), 'Keine Legacy-Policy öffnet den Produktpräfix');
select has_function('storage', 'allow_only_operation', array['text'], 'Storage-Version unterstützt die eng begrenzte Rollback-Ausnahme');
select to_regclass('public.catalog_product_media') is not null as media_contract_ready \gset
\if :media_contract_ready
select ok(has_table_privilege('authenticated','public.catalog_product_media',privilege), 'Data API besitzt ausdrückliches ' || privilege || '-Recht')
from unnest(array['SELECT','INSERT','UPDATE','DELETE']) as privilege;
select ok(not has_table_privilege('anon','public.catalog_product_media','SELECT,INSERT,UPDATE,DELETE'), 'Anonyme besitzen keine Medienrechte');
select ok(not exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid = 'public.catalog_product_media'::regclass and a.grantee = 0), 'PUBLIC besitzt keine Tabellenrechte');
select ok(not has_function_privilege('authenticated','public.protect_catalog_product_media_identity()','EXECUTE'), 'Identitätstrigger ist kein Client-Endpunkt');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.catalog_product_media'::regclass and contype = 'f' and confrelid = 'public.catalog_products'::regclass and confdeltype = 'r' and pg_get_constraintdef(oid) like 'FOREIGN KEY (workspace_id, catalog_product_id)%'), 'Zusammengesetzter Produkt-FK verwendet RESTRICT');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.catalog_product_media'::regclass and pg_get_constraintdef(oid) = definition), definition || ' ist abgesichert')
from unnest(array['UNIQUE (workspace_id, id)','UNIQUE (workspace_id, catalog_product_id, storage_path)','UNIQUE (storage_path)']) as definition;
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'catalog_product_media' and indexdef like '%UNIQUE% (workspace_id, catalog_product_id) WHERE is_primary'), 'Partieller Index verhindert zwei Hauptbilder');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'catalog_product_media' and indexdef like '%(workspace_id, catalog_product_id, is_primary DESC, sort_order, created_at, id)%'), 'Ladeindex unterstützt deterministische Reihenfolge');
select col_not_null('public','catalog_product_media', column_name, column_name || ' ist verpflichtend')
from unnest(array['id','workspace_id','catalog_product_id','storage_path','is_primary','sort_order','created_at']) as column_name;
select ok(obj_description('public.catalog_product_media'::regclass) is not null, 'Tabelle ist dokumentiert');
select ok(not has_function_privilege('authenticated','public.protect_workspace_media_object()','EXECUTE') and not has_function_privilege('service_role','public.protect_workspace_media_object()','EXECUTE'), 'Storage-Archivtrigger bleibt intern');

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('ba400000-0000-4000-8000-000000000001','authenticated','authenticated','media-a@example.test','{}','{}'),
 ('ba400000-0000-4000-8000-000000000002','authenticated','authenticated','media-b@example.test','{}','{}');
insert into public.workspaces (id,name) values
 ('ba400000-0000-4000-8000-000000000011','Medien A'),
 ('ba400000-0000-4000-8000-000000000012','Medien B'),
 ('ba400000-0000-4000-8000-000000000013','Zweiter Workspace von A');
insert into public.workspace_members (workspace_id,user_id,role) values
 ('ba400000-0000-4000-8000-000000000011','ba400000-0000-4000-8000-000000000001','owner'),
 ('ba400000-0000-4000-8000-000000000012','ba400000-0000-4000-8000-000000000002','owner'),
 ('ba400000-0000-4000-8000-000000000013','ba400000-0000-4000-8000-000000000001','owner');
create temporary table media_fixture (label text primary key, workspace_id uuid, product_id uuid, path text);
insert into media_fixture values
 ('a','ba400000-0000-4000-8000-000000000011','ba400000-0000-4000-8000-000000000021',null),
 ('a2','ba400000-0000-4000-8000-000000000011','ba400000-0000-4000-8000-000000000022',null),
 ('b','ba400000-0000-4000-8000-000000000012','ba400000-0000-4000-8000-000000000023',null),
 ('c','ba400000-0000-4000-8000-000000000013','ba400000-0000-4000-8000-000000000024',null);
update media_fixture set path = 'catalog-products/' || workspace_id || '/' || product_id || '/ba400000-0000-4000-8000-000000000031.webp';
grant select on media_fixture to authenticated,service_role;
insert into public.catalog_products (id,workspace_id,title) select product_id,workspace_id,label from media_fixture;
insert into public.inventory_items (id,workspace_id,title,status) values
 ('ba400000-0000-4000-8000-000000000041','ba400000-0000-4000-8000-000000000011','Legacy A','ready'),
 ('ba400000-0000-4000-8000-000000000042','ba400000-0000-4000-8000-000000000012','Legacy B','ready');
insert into public.item_media (id,inventory_item_id,storage_path) values
 ('ba400000-0000-4000-8000-000000000051','ba400000-0000-4000-8000-000000000041','ba400000-0000-4000-8000-000000000041/original.webp'),
 ('ba400000-0000-4000-8000-000000000052','ba400000-0000-4000-8000-000000000042','ba400000-0000-4000-8000-000000000042/original.webp');
insert into public.item_media (id,inventory_item_id,storage_path) values
 ('ba400000-0000-4000-8000-000000000053','ba400000-0000-4000-8000-000000000041','historical/custom/a.webp'),
 ('ba400000-0000-4000-8000-000000000054','ba400000-0000-4000-8000-000000000042','historical/custom/b.webp');
-- Absichtlich falsche Legacy-Zuordnung darf nie Produkt-Storage freigeben.
insert into public.item_media (inventory_item_id,storage_path)
select 'ba400000-0000-4000-8000-000000000041', path from media_fixture where label = 'b';
create temporary table media_legacy_before as select to_jsonb(m) as row from public.item_media m where id in ('ba400000-0000-4000-8000-000000000051','ba400000-0000-4000-8000-000000000052');
insert into storage.buckets(id,name,public) values ('item-media','item-media',false) on conflict(id) do nothing;
insert into storage.objects(bucket_id,name) values ('item-media','ba400000-0000-4000-8000-000000000041/original.webp'),('item-media','ba400000-0000-4000-8000-000000000042/original.webp');
insert into storage.objects(bucket_id,name) values ('item-media','historical/custom/a.webp'),('item-media','historical/custom/b.webp');
insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path) select workspace_id,product_id,path from media_fixture where label = 'b';
insert into storage.objects(bucket_id,name) select 'item-media',path from media_fixture where label = 'b';

select set_config('request.jwt.claim.sub','ba400000-0000-4000-8000-000000000001',true);
set local role authenticated;
-- Freie Metadaten sind kein Besitznachweis: A darf keinen B-Pfad freischalten.
select lives_ok($$insert into public.item_media(id,inventory_item_id,storage_path) values
 ('ba400000-0000-4000-8000-000000000071','ba400000-0000-4000-8000-000000000041','ba400000-0000-4000-8000-000000000042/original.webp'),
 ('ba400000-0000-4000-8000-000000000072','ba400000-0000-4000-8000-000000000041','historical/custom/b.webp')$$,'Angriffsfixture: A kann fremde Pfade an eigenes Item schreiben');
select set_config('storage.allow_delete_query','true',true);
select is((select count(*) from storage.objects where name = target.path),0::bigint,'Gefälschte INSERT-Referenz erlaubt keinen Download: ' || target.path)
from (values ('ba400000-0000-4000-8000-000000000042/original.webp'),('historical/custom/b.webp')) target(path);
select is(pg_temp.media_affected_rows(format('update storage.objects set metadata=''{}'' where name=%L',target.path)),0::bigint,'Gefälschte INSERT-Referenz erlaubt kein Update: ' || target.path)
from (values ('ba400000-0000-4000-8000-000000000042/original.webp'),('historical/custom/b.webp')) target(path);
select is(pg_temp.media_affected_rows(format('delete from storage.objects where name=%L',target.path)),0::bigint,'Gefälschte INSERT-Referenz erlaubt kein Delete: ' || target.path)
from (values ('ba400000-0000-4000-8000-000000000042/original.webp'),('historical/custom/b.webp')) target(path);
select is(pg_temp.media_affected_rows($$update public.item_media set storage_path = case id
 when 'ba400000-0000-4000-8000-000000000071'::uuid then 'historical/custom/b.webp'
 else 'ba400000-0000-4000-8000-000000000042/original.webp' end
 where id in ('ba400000-0000-4000-8000-000000000071','ba400000-0000-4000-8000-000000000072')$$),2::bigint,'Angriffsfixture: A kann Referenzen auch per UPDATE umhängen');
select is((select count(*) from storage.objects where name = target.path),0::bigint,'Gefälschte UPDATE-Referenz erlaubt keinen Download: ' || target.path)
from (values ('ba400000-0000-4000-8000-000000000042/original.webp'),('historical/custom/b.webp')) target(path);
select is(pg_temp.media_affected_rows(format('update storage.objects set metadata=''{}'' where name=%L',target.path)),0::bigint,'Gefälschte UPDATE-Referenz erlaubt kein Update: ' || target.path)
from (values ('ba400000-0000-4000-8000-000000000042/original.webp'),('historical/custom/b.webp')) target(path);
select is(pg_temp.media_affected_rows(format('delete from storage.objects where name=%L',target.path)),0::bigint,'Gefälschte UPDATE-Referenz erlaubt kein Delete: ' || target.path)
from (values ('ba400000-0000-4000-8000-000000000042/original.webp'),('historical/custom/b.webp')) target(path);
select is((select count(*) from storage.objects where name='historical/custom/a.webp'),0::bigint,'Auch eigene nichtkanonische Altpfade bleiben bis zur Manifestprüfung gesperrt');
select is(pg_temp.media_affected_rows($$update storage.objects set metadata='{}' where name='historical/custom/a.webp'$$),0::bigint,'Nichtkanonische Altdatei kann nicht geändert werden');
select is(pg_temp.media_affected_rows($$delete from storage.objects where name='historical/custom/a.webp'$$),0::bigint,'Nichtkanonische Altdatei kann nicht gelöscht werden');
select lives_ok($$insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path) select workspace_id,product_id,path from media_fixture where label = 'a'$$, 'A legt eigene Medien an');
select ok((select not is_primary and sort_order = 0 and created_at is not null and id is not null and file_name is null and file_size is null and mime_type is null from public.catalog_product_media where storage_path = (select path from media_fixture where label = 'a')), 'Defaults erzeugen ID/Zeitpunkt und keine erfundenen Dateimetadaten');
select is((select count(*) from public.catalog_product_media),1::bigint,'A sieht ausschließlich eigene Medien');
select lives_ok($$update public.catalog_product_media set is_primary = true, file_name = 'Foto.webp' where storage_path = (select path from media_fixture where label = 'a')$$, 'A ändert eigene Dateimetadaten');
select is((select file_name from public.catalog_product_media where storage_path = (select path from media_fixture where label = 'a')),'Foto.webp','Metadatenänderung wurde gespeichert');
select throws_ok($$insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path) select workspace_id,product_id,replace(path,'000000000031','000000000032') from media_fixture where label = 'b'$$,'42501',null,'A darf nicht in B anlegen');
select throws_ok($$insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path) select a.workspace_id,b.product_id,replace(b.path,b.workspace_id::text,a.workspace_id::text) from media_fixture a cross join media_fixture b where a.label='a' and b.label='b'$$,'23503',null,'FK verhindert fremdes Produkt unter eigenem Workspace');
select throws_ok($$insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path) select workspace_id,product_id,path from media_fixture where label = 'a'$$,'23505',null,'Doppelte dauerhafte Pfade sind gesperrt');
select throws_ok($$insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path,is_primary) select workspace_id,product_id,replace(path,'000000000031','000000000032'),true from media_fixture where label = 'a'$$,'23505',null,'Zweites Hauptbild desselben Produkts scheitert');
select lives_ok($$insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path,is_primary) select workspace_id,product_id,path,true from media_fixture where label = 'a2'$$,'Verschiedene Produkte dürfen je ein Hauptbild haben');
select lives_ok($$insert into public.catalog_product_media(id,workspace_id,catalog_product_id,storage_path,created_at)
 select ('ba400000-0000-4000-8000-0000000000' || suffix)::uuid,workspace_id,product_id,replace(path,'000000000031','0000000000' || suffix),'2026-09-08T12:00:00Z' from media_fixture cross join (values ('62'),('61')) ids(suffix) where label='a'$$,'Zwei gleich sortierte Nebenbilder werden in umgekehrter ID-Reihenfolge angelegt');
select results_eq($$select is_primary,id::text from public.catalog_product_media where catalog_product_id=(select product_id from media_fixture where label='a') order by is_primary desc,sort_order,created_at,id$$,
 $$select true,id::text from public.catalog_product_media where storage_path=(select path from media_fixture where label='a') union all values (false,'ba400000-0000-4000-8000-000000000061'),(false,'ba400000-0000-4000-8000-000000000062')$$,'Hauptbild zuerst, bei Zeit-/Sortiergleichstand stabile ID-Reihenfolge');
select lives_ok($$delete from public.catalog_product_media where id in ('ba400000-0000-4000-8000-000000000061','ba400000-0000-4000-8000-000000000062')$$,'Eigene Nebenbilder können entfernt werden');
select ok(public.is_catalog_product_media_path(replace(path,'.webp','.' || extension),workspace_id,product_id),'Kanonische Endung ' || extension || ' ist erlaubt')
from media_fixture cross join unnest(array['jpg','jpeg','png','webp','gif','avif']) as extension where label='a';
select throws_ok($$update public.catalog_product_media set sort_order = -1 where storage_path = (select path from media_fixture where label='a')$$,'23514',null,'Negative Sortierung scheitert');
select throws_ok(format('update public.catalog_product_media set %I = %L where storage_path = %L',field,value,(select path from media_fixture where label='a')),'42501',null,'Identitätsfeld ' || field || ' bleibt unveränderlich')
from (values ('id','ba400000-0000-4000-8000-000000000099'),('workspace_id','ba400000-0000-4000-8000-000000000013'),('catalog_product_id','ba400000-0000-4000-8000-000000000022'),('storage_path','changed.webp')) changes(field,value);
select throws_ok($$update public.catalog_product_media set workspace_id = c.workspace_id, catalog_product_id = c.product_id, storage_path = c.path from media_fixture c where c.label='c' and storage_path = (select path from media_fixture where label='a')$$,'42501',null,'Auch berechtigte Mitgliedschaft in zwei Workspaces erlaubt kein Umhängen');
select throws_ok(format('insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path) values (%L,%L,%L)',f.workspace_id,f.product_id,bad.path),'23514',null,bad.label)
from media_fixture f cross join lateral (values
 ('https://example.test/image.webp','HTTP-URL wird abgelehnt'),
 (f.path || '?token=signed','Signierte URL wird abgelehnt'),
 (replace(f.path,'000000000011','000000000012'),'Falscher Workspacepfad wird abgelehnt'),
 (replace(f.path,'000000000021','000000000022'),'Falscher Produktpfad wird abgelehnt'),
 (replace(f.path,'/ba400000-0000-4000-8000-000000000031','/extra/ba400000-0000-4000-8000-000000000031'),'Zusätzlicher Unterordner wird abgelehnt'),
 (replace(f.path,'.webp','.svg'),'Aktive SVG-Endung wird abgelehnt'),
 (replace(f.path,'ba400000-0000-4000-8000-000000000031.webp','original.webp'),'Nichtkanonischer Dateiname wird abgelehnt')) bad(path,label) where f.label='a';

select lives_ok($$insert into storage.objects(bucket_id,name) select 'item-media',path from media_fixture where label = 'a'$$,'A lädt kanonisches Produktobjekt hoch');
select is((select count(*) from storage.objects where bucket_id='item-media'),2::bigint,'A sieht eigenes Produkt und kanonisches Legacy-Objekt');
select lives_ok($$update storage.objects set metadata = '{"size":123}' where bucket_id='item-media' and name=(select path from media_fixture where label='a')$$,'A ändert eigenes Produktobjekt');
select is((select metadata->>'size' from storage.objects where name=(select path from media_fixture where label='a')),'123','Storage-Update wurde gespeichert');
select throws_ok($$insert into storage.objects(bucket_id,name) select 'item-media',replace(path,'000000000031','000000000032') from media_fixture where label='b'$$,'42501',null,'A darf kein fremdes Produktobjekt hochladen');
select throws_ok($$update storage.objects set name=(select path from media_fixture where label='c') where name=(select path from media_fixture where label='a')$$,'42501',null,'Produktobjekt darf nicht umbenannt oder umgehängt werden');
select throws_ok(format('insert into storage.objects(bucket_id,name) values (''item-media'',%L)',bad.path),'42501',null,'Storage lehnt ' || bad.label || ' ab')
from media_fixture f cross join lateral (values
 (replace(f.path,'.webp','.svg'),'SVG'),
 (f.path || '?token=x','Querystring'),
 (replace(f.path,'/ba400000-0000-4000-8000-000000000031','/extra/ba400000-0000-4000-8000-000000000031'),'Unterordner'),
 (replace(f.path,'000000000021','000000000099'),'fehlendes Produkt'),
 (replace(f.path,'000000000011','000000000012'),'falsche Workspace-Produktpaarung')) bad(path,label) where f.label='a';
select lives_ok($$insert into storage.objects(bucket_id,name) values ('item-media','ba400000-0000-4000-8000-000000000041/123_Foto.webp')$$,'Bestehender Legacy-Uploadpfad bleibt erlaubt');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('item-media','ba400000-0000-4000-8000-000000000042/123_Foto.webp')$$,'42501',null,'Fremder Legacy-Upload ist gesperrt');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('item-media','ba400000-0000-4000-8000-000000000041/nested/Foto.webp')$$,'42501',null,'Legacy-Upload akzeptiert genau einen Ordner');
select lives_ok($$update storage.objects set metadata='{"size":42}' where name='ba400000-0000-4000-8000-000000000041/original.webp'$$,'Kanonische Legacy-Pfade bleiben änderbar');
select is((select metadata->>'size' from storage.objects where name='ba400000-0000-4000-8000-000000000041/original.webp'),'42','Legacy-Update erreicht genau das berechtigte Objekt');
select lives_ok($$insert into public.item_media(inventory_item_id,storage_path) values ('ba400000-0000-4000-8000-000000000041','ba400000-0000-4000-8000-000000000041/123_Foto.webp')$$,'Legacy-Upload wird wie bisher nachträglich registriert');
select set_config('storage.allow_delete_query','true',true);
select is(pg_temp.media_affected_rows($$delete from storage.objects where name='ba400000-0000-4000-8000-000000000041/123_Foto.webp'$$),1::bigint,'Eigener registrierter Legacy-Upload bleibt löschbar');

-- remove() benötigt SELECT und DELETE; nur die echte Löschoperation darf unregistrierte Dateien sehen.
select lives_ok($$insert into storage.objects(bucket_id,name) select 'item-media',path from media_fixture where label='a2'$$,'Zweites Produktobjekt angelegt');
select lives_ok($$insert into storage.objects(bucket_id,name) select 'item-media',replace(path,'000000000031','000000000039') from media_fixture where label='a'$$,'Upload vor fehlgeschlagenem Metadateninsert');
select set_config('storage.operation',operation,true) from (values ('')) operations(operation);
select is((select count(*) from storage.objects where name like '%000000000039.webp'),0::bigint,'Ohne Operation bleibt verwaister Upload unsichtbar');
select is((select count(*) from storage.objects where name like '%000000000039.webp'),0::bigint,'Normales SELECT signiert keine unregistrierte Datei');
select lives_ok($$do $body$ declare v_operation text; begin
 foreach v_operation in array array['storage.object.get_authenticated','storage.object.sign','storage.object.sign_many','storage.object.list','storage.object.delete_extra'] loop
  perform set_config('storage.operation',v_operation,true);
  if exists(select 1 from storage.objects where name like '%000000000039.webp') then raise exception 'Unregistrierte Datei sichtbar bei %',v_operation; end if;
 end loop;
end $body$;$$,'Download, Signieren, Listen und ähnliche Operationsnamen bleiben gesperrt');
select set_config('storage.operation','storage.object.delete_many',true);
select set_config('storage.allow_delete_query','true',true);
select is((select count(*) from storage.objects where name like '%000000000039.webp'),1::bigint,'Nur Löschoperation sieht den eigenen kanonischen Rollbackpfad');
select is(pg_temp.media_affected_rows($$delete from storage.objects where bucket_id='item-media' and name=(select replace(path,'000000000031','000000000039') from media_fixture where label='a')$$),1::bigint,'Exakter Rollback löscht unregistrierten Upload');
select lives_ok($$insert into storage.objects(bucket_id,name) select 'item-media',replace(path,'000000000031','000000000039') from media_fixture where label='a'$$,'Einzel-Löschoperation erhält eigenes Rollbackobjekt');
select set_config('storage.operation','object.delete',true);
select is(pg_temp.media_affected_rows($$delete from storage.objects where bucket_id='item-media' and name=(select replace(path,'000000000031','000000000039') from media_fixture where label='a')$$),1::bigint,'Normalisierte Einzel-Löschoperation erlaubt ebenfalls exaktes Rollback');
select set_config('storage.operation','',true);

select set_config('request.jwt.claim.sub','ba400000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.catalog_product_media),1::bigint,'B sieht ausschließlich B-Medien');
select is((select count(*) from storage.objects where name='ba400000-0000-4000-8000-000000000042/original.webp'),1::bigint,'B behält Zugriff auf die echte kanonische Legacy-Datei trotz gefälschter A-Referenz');
select is((select count(*) from storage.objects where name='historical/custom/b.webp'),0::bigint,'B-Custompfad benötigt ebenfalls eine spätere vertrauenswürdige Zuordnung');
select is((select count(*) from storage.objects where name=(select path from media_fixture where label='a')),0::bigint,'B sieht kein A-Produktobjekt');
select is((select count(*) from storage.objects where name='ba400000-0000-4000-8000-000000000041/original.webp'),0::bigint,'B sieht kein fremdes Legacy-Objekt');
select is(pg_temp.media_affected_rows($$update public.catalog_product_media set file_name='Angriff' where storage_path=(select path from media_fixture where label='a')$$),0::bigint,'B ändert keine A-Medien');
select is(pg_temp.media_affected_rows($$delete from public.catalog_product_media where storage_path=(select path from media_fixture where label='a')$$),0::bigint,'B löscht keine A-Medien');
select is(pg_temp.media_affected_rows($$update storage.objects set metadata='{}' where name=(select path from media_fixture where label='a')$$),0::bigint,'B ändert kein A-Objekt');
select set_config('storage.operation','storage.object.delete_many',true);
select is(pg_temp.media_affected_rows($$delete from storage.objects where name=(select path from media_fixture where label='a')$$),0::bigint,'Auch die Rollbackoperation löscht kein fremdes Produktobjekt');
select is(pg_temp.media_affected_rows($$delete from storage.objects where name='ba400000-0000-4000-8000-000000000041/original.webp'$$),0::bigint,'B löscht kein fremdes Legacy-Objekt');
select set_config('request.jwt.claim.sub','ba400000-0000-4000-8000-000000000001',true);
select is(pg_temp.media_affected_rows($$delete from storage.objects where name=(select path from media_fixture where label='a2')$$),1::bigint,'A löscht eigenes registriertes Produktobjekt');
select is(pg_temp.media_affected_rows($$delete from public.catalog_product_media where storage_path=(select path from media_fixture where label='a2')$$),1::bigint,'A löscht eigene Medienmetadaten');
select set_config('storage.operation','',true);

-- Medien-only-Workspace: Retention darf nicht nur über vorhandene Belege greifen.
select lives_ok($$insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path) select workspace_id,product_id,path from media_fixture where label='c'$$,'Separater Medien-only-Workspace vorbereitet');
select throws_ok($$delete from public.workspaces where id=(select workspace_id from media_fixture where label='c')$$,'P0001',null,'Medien allein verhindern Workspace-Löschung');
select lives_ok($$select public.archive_workspace(workspace_id) from media_fixture where label='a'$$,'A archiviert seinen Workspace');
select is((select count(*) from public.catalog_product_media where storage_path=(select path from media_fixture where label='a')),1::bigint,'Archivierte Medien bleiben lesbar');
select is((select count(*) from storage.objects where name=(select path from media_fixture where label='a')),1::bigint,'Archivierte Produktdatei bleibt lesbar');
select is((select count(*) from storage.objects where name='ba400000-0000-4000-8000-000000000041/original.webp'),1::bigint,'Archivierte Legacy-Datei bleibt lesbar');
select throws_ok($$insert into public.catalog_product_media(workspace_id,catalog_product_id,storage_path) select workspace_id,product_id,replace(path,'000000000031','000000000033') from media_fixture where label='a'$$,'55000',null,'Archiv blockiert Medieninsert');
select throws_ok($$update public.catalog_product_media set sort_order=1 where storage_path=(select path from media_fixture where label='a')$$,'55000',null,'Archiv blockiert Medienupdate');
select throws_ok($$delete from public.catalog_product_media where storage_path=(select path from media_fixture where label='a')$$,'55000',null,'Archiv blockiert Medienlöschung');
select throws_ok($$insert into storage.objects(bucket_id,name) select 'item-media',replace(path,'000000000031','000000000033') from media_fixture where label='a'$$,'55000',null,'Archiv blockiert Produktupload');
select throws_ok($$update storage.objects set metadata='{}' where name=(select path from media_fixture where label='a')$$,'55000',null,'Archiv blockiert Produktdateiupdate');
select throws_ok($$delete from storage.objects where name=(select path from media_fixture where label='a')$$,'55000',null,'Archiv blockiert Produktdateilöschung');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('item-media','ba400000-0000-4000-8000-000000000041/new.webp')$$,'55000',null,'Archiv blockiert Legacy-Upload');
select throws_ok($$update storage.objects set metadata='{}' where name='ba400000-0000-4000-8000-000000000041/original.webp'$$,'55000',null,'Archiv blockiert kanonische Legacy-Updates');
select throws_ok($$delete from storage.objects where name='ba400000-0000-4000-8000-000000000041/original.webp'$$,'55000',null,'Archiv blockiert kanonische Legacy-Löschung');
reset role;
set local role service_role;
select throws_ok($$update public.catalog_product_media set file_name='Bypass' where storage_path=(select path from media_fixture where label='a')$$,'55000',null,'Service-Rolle umgeht Tabellenarchivschutz nicht');
select throws_ok($$update storage.objects set metadata='{}' where name='ba400000-0000-4000-8000-000000000041/original.webp'$$,'55000',null,'Service-Rolle umgeht Storage-Archivschutz nicht');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ba400000-0000-4000-8000-000000000002',true);
select is(pg_temp.media_affected_rows($$update storage.objects set metadata='{"size":84}' where name='ba400000-0000-4000-8000-000000000042/original.webp'$$),1::bigint,'Archiviertes A-Item mit gefälschter B-Referenz sperrt nicht die echte B-Datei');
reset role;
select is((select count(*) from storage.objects where name in ('historical/custom/a.webp','historical/custom/b.webp')),2::bigint,'Beide gesperrten Customdateien bleiben unverändert vorhanden');
select ok((select bool_and(metadata is null) from storage.objects where name in ('historical/custom/a.webp','historical/custom/b.webp')),'Abgewiesene Schreibversuche verändern keine Customdateimetadaten');
select results_eq($$select id,storage_path from public.item_media where id in ('ba400000-0000-4000-8000-000000000053','ba400000-0000-4000-8000-000000000054') order by id$$,
 $$values ('ba400000-0000-4000-8000-000000000053'::uuid,'historical/custom/a.webp'::text),('ba400000-0000-4000-8000-000000000054'::uuid,'historical/custom/b.webp'::text)$$,'Nichtkanonische Altmetadaten bleiben ohne Datenmigration erhalten');
select results_eq($$select to_jsonb(m) from public.item_media m where id in ('ba400000-0000-4000-8000-000000000051','ba400000-0000-4000-8000-000000000052') order by id$$,$$select row from media_legacy_before order by row->>'id'$$,'Bestehende Legacy-Zeilen samt Pfaden und IDs bleiben exakt erhalten');
\endif
select * from finish();
rollback;
