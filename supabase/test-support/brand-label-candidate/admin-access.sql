-- Nur synthetische Daten im neuen Testcluster; keine Produktivdaten.
begin;

select label_test.assert_true(to_regprocedure('public.list_label_admin_brands()') is not null,
  'Admin-Markenabfrage ist implementiert');
select label_test.assert_true(to_regprocedure('public.list_label_admin_references(jsonb,integer)') is not null,
  'Admin-Referenzabfrage ist implementiert');
select label_test.assert_true(to_regprocedure('public.get_label_admin_reference(integer)') is not null,
  'Admin-Detailabfrage ist implementiert');
select label_test.assert_true(to_regprocedure('public.save_label_brand_line(integer,integer,jsonb,uuid)') is not null,
  'Markenlinienpflege ist implementiert');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select label_test.expect_error('select public.list_label_admin_brands()','42501','Workspace-Nutzer liest keine Adminmarken');
select label_test.expect_error('select public.list_label_admin_references(null,0)','42501','Adminzugang wird vor Filtervalidierung geprüft');
select label_test.expect_error('select public.get_label_admin_reference(1)','42501','Workspace-Nutzer liest keine Entwürfe');
select label_test.expect_error('select public.save_label_brand_line(null,null,null,gen_random_uuid())','42501','Workspace-Nutzer legt keine Markenlinie an');
select set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
select label_test.expect_error('select public.list_label_admin_brands()','42501','Metadaten verleihen keine Adminrechte');
select set_config('request.jwt.claim.sub','',true);
select label_test.expect_error('select public.get_label_admin_reference(1)','42501','Authenticated ohne Nutzeridentität reicht nicht');
reset role;
set local role anon;
select label_test.expect_error('select public.list_label_admin_brands()','42501','Anonyme Adminabfrage gesperrt');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select label_test.assert_true(public.list_label_admin_brands()='[]'::jsonb,'Leeres Lexikon erfindet keine Marken');

do $$
declare brand jsonb; second_brand jsonb; line jsonb; edited jsonb; draft jsonb; loaded jsonb;
 args jsonb; request_id uuid:=gen_random_uuid(); rows jsonb; before_revisions bigint;
 before_events bigint; before_requests bigint;
begin
 brand:=public.save_label_brand(null,null,'{"name":"Pilotmarke","slug":"pilotmarke","aliases":[]}',gen_random_uuid());
 second_brand:=public.save_label_brand(null,null,'{"name":"Andere Marke","slug":"andere-marke","aliases":[]}',gen_random_uuid());
 args:=jsonb_build_object('brandId',(brand->>'id')::integer,'name','Linie A');
 line:=public.save_label_brand_line(null,null,args,request_id);
 perform label_test.assert_true(line->'brandId'=brand->'id' and line->>'name'='Linie A' and line->>'version'='1' and line->>'archived'='false','Neue Linie gehört zur gewählten Referenzmarke');
 perform label_test.assert_true(public.save_label_brand_line(null,null,args,request_id)=line,'Wiederholtes Anlegen liefert dieselbe Markenlinie');
 perform label_test.assert_true((select count(*)=1 from public.label_brand_lines),'Wiederholung legt keine zweite Linie an');
 perform label_test.expect_error(format('select public.save_label_brand_line(null,null,%L::jsonb,%L::uuid)',args||'{"name":"Abweichend"}',request_id),'22023','Vorgangskennung darf keine anderen Angaben ausführen');
 perform label_test.expect_error(format('select public.save_label_brand_line(null,1,%L::jsonb,gen_random_uuid())',args),'22023','Neue Linie erwartet keine bestehende Version');
 perform label_test.expect_error(format('select public.save_label_brand_line(null,null,%L::jsonb,gen_random_uuid())',args||jsonb_build_object('name',repeat('a',161))),'22023','Zu langer Linienname wird abgewiesen');
 perform label_test.expect_error(format('select public.save_label_brand_line(null,null,%L::jsonb,gen_random_uuid())',args||jsonb_build_object('name',chr(160))),'22023','Unicode-Leerraum ist kein Linienname');
 perform label_test.expect_error(format('select public.save_label_brand_line(null,null,%L::jsonb,gen_random_uuid())',args||'{"role":"admin"}'),'22023','Zusätzliche Eingabefelder werden abgewiesen');
 perform label_test.expect_error('select public.save_label_brand_line(null,null,''{"brandId":1.5,"name":"Linie"}'',gen_random_uuid())','22023','Markenkennung muss ganzzahlig sein');
 perform label_test.expect_error('select public.save_label_brand_line(null,null,''{"brandId":null,"name":"Linie"}'',gen_random_uuid())','22023','Fehlende Markenkennung wird abgewiesen');
 edited:=public.save_label_brand_line((line->>'id')::integer,1,args||'{"name":"Linie B"}',gen_random_uuid());
 perform label_test.assert_true(edited->'id'=line->'id' and edited->>'version'='2' and edited->>'name'='Linie B','Umbenennung behält Kennung und erhöht Version');
 perform label_test.expect_error(format('select public.save_label_brand_line(%s,1,%L::jsonb,gen_random_uuid())',line->>'id',args),'P0001','Veraltete Version überschreibt keine neuere Linie');
 perform label_test.expect_error(format('select public.save_label_brand_line(%s,2,%L::jsonb,gen_random_uuid())',line->>'id',args||jsonb_build_object('brandId',(second_brand->>'id')::integer)),'22023','Bestehende Linie wird nicht in eine andere Marke verschoben');
 perform label_test.assert_true((select name='Linie B' and version=2 from public.label_brand_lines where id=(line->>'id')::integer),'Fehlgeschlagene Bearbeitung verändert die Linie nicht');
 rows:=public.list_label_admin_brands();
 perform label_test.assert_true(jsonb_array_length(rows)=2 and rows->0->>'name'='Andere Marke','Adminmarken werden stabil nach Namen sortiert');
 perform label_test.assert_true(rows->1->'lines'->0=edited,'Markenabfrage liefert aktuelle Linien und Versionsnummern');
 draft:=public.create_label_draft((brand->>'id')::integer,gen_random_uuid());
 draft:=public.save_label_draft((draft->>'revisionId')::integer,1,
   jsonb_set(draft->'input','{content,title}','"Entwurf 100%_"'),gen_random_uuid());
 select count(*) into before_revisions from public.label_revisions;
 select count(*) into before_events from public.label_change_events;
 select count(*) into before_requests from public.label_edit_requests;
 loaded:=public.get_label_admin_reference((draft->>'referenceId')::integer);
 perform label_test.assert_true(loaded->'draft'=draft and loaded->'publication'='null'::jsonb,'Admin lädt unveröffentlichten Entwurf vollständig');
 perform label_test.assert_true(loaded->'brandId'=brand->'id' and loaded->>'brandSlug'='pilotmarke','Admin-Detail liefert die Referenzmarke');
 perform public.get_label_admin_reference((draft->>'referenceId')::integer);
 perform label_test.assert_true((select count(*)=before_revisions from public.label_revisions),'Wiederholtes Öffnen erzeugt keine Revision');
 perform label_test.assert_true((select count(*)=before_events from public.label_change_events) and (select count(*)=before_requests from public.label_edit_requests),'Reines Lesen erzeugt weder Schreibauftrag noch Änderungsereignis');
 perform label_test.assert_true(not (select reader_enabled from public.label_library_settings where id=1),'Adminpflege öffnet nicht den Leserbereich');
 rows:=public.list_label_admin_references(jsonb_build_object('brandId',brand->'id','state','draft','search','%_'),0);
 perform label_test.assert_true(jsonb_array_length(rows->'rows')=1 and rows->'rows'->0->'referenceId'=draft->'referenceId','Adminsuche behandelt Prozent und Unterstrich wörtlich');
 perform label_test.assert_true(rows->>'hasMore'='false' and rows->'nextOffset'='null'::jsonb,'Letzte Adminseite hat keine Folgeseite');
 perform label_test.assert_true(public.get_label_admin_reference(2147483647)='null'::jsonb,'Unbekannte Referenz ist neutral nicht verfügbar');
 perform label_test.expect_error('select public.get_label_admin_reference(null)','22023','Leere Detailkennung wird abgewiesen');
end;
$$;

select label_test.expect_error('select public.list_label_admin_references(''{}'',0)','22023','Unvollständiger Adminfilter wird abgewiesen');
select label_test.expect_error('select public.list_label_admin_references(''{"brandId":null,"state":"all","search":"","role":"admin"}'',0)','22023','Adminfilter akzeptiert kein Rollenfeld');
select label_test.expect_error('select public.list_label_admin_references(''{"brandId":null,"state":"unknown","search":""}'',0)','22023','Unbekannter Bearbeitungsstatus wird abgewiesen');
select label_test.expect_error('select public.list_label_admin_references(''{"brandId":null,"state":"all","search":""}'',-24)','22023','Negativer Adminoffset wird abgewiesen');
select label_test.expect_error('select public.list_label_admin_references(''{"brandId":null,"state":"all","search":""}'',1)','22023','Adminoffset hält den 24er-Seitenvertrag ein');
select label_test.expect_error('select public.list_label_admin_references(''{"brandId":null,"state":"all","search":""}'',null)','22023','Fehlender Adminoffset wird abgewiesen');
reset role;

-- Minimale Zustandsfixtures prüfen nur die Adminprojektion, nicht Veröffentlichung oder Storage.
create table label_test.admin_fixture(name text primary key, id integer not null);
grant select on label_test.admin_fixture to authenticated;
do $$
declare brand_id integer; line_id integer; ref_id integer; rev_id integer; v_state text;
 content jsonb; page_brand integer; i integer;
begin
 select id into brand_id from public.label_brands where slug='pilotmarke';
 select id into line_id from public.label_brand_lines where label_brand_id=brand_id;
 foreach v_state in array array['published','review','unpublished','archived'] loop
   insert into public.label_references(label_brand_id,archived) values(brand_id,v_state='archived') returning id into ref_id;
   content:=public.label_empty_content()||jsonb_build_object('title','Test '||v_state,'brandLineId',line_id,'brandName','Pilotmarke','brandLineName','Linie B');
   insert into public.label_revisions(label_reference_id,state,content,published_at)
     values(ref_id,case when v_state='unpublished' then 'discarded' when v_state='archived' then 'draft' else v_state end,
       content,case when v_state='published' then now() else null end) returning id into rev_id;
   if v_state='published' then update public.label_references set published_revision_id=rev_id where id=ref_id; end if;
   insert into label_test.admin_fixture values(v_state,ref_id);
 end loop;
 insert into public.label_brands(name,slug) values('Seitenmarke','seitenmarke') returning id into page_brand;
 insert into label_test.admin_fixture values('page-brand',page_brand);
 for i in 1..25 loop
   insert into public.label_references(label_brand_id) values(page_brand) returning id into ref_id;
   insert into public.label_revisions(label_reference_id,content) values(ref_id,public.label_empty_content());
 end loop;
end;
$$;
set local role authenticated;
do $$
declare loaded jsonb; before_revisions bigint; brand_id integer; line_id integer;
 page_brand integer; first_page jsonb; last_page jsonb; v_state text; page jsonb;
begin
 select id into brand_id from public.label_brands where slug='pilotmarke';
 select id into line_id from public.label_brand_lines where label_brand_id=brand_id;
 foreach v_state in array array['published','review','unpublished','archived'] loop
   page:=public.list_label_admin_references(jsonb_build_object('brandId',brand_id,'state',v_state,'search',''),0);
   perform label_test.assert_true(jsonb_array_length(page->'rows')=1 and page->'rows'->0->>'state'=v_state,'Adminfilter unterscheidet Zustand '||v_state);
 end loop;
 loaded:=public.get_label_admin_reference((select id from label_test.admin_fixture where name='published'));
 perform label_test.assert_true(loaded->'draft'='null'::jsonb and loaded->'publication'->>'state'='published','Veröffentlichte Referenz lädt ohne automatisch erzeugten Entwurf');
 select count(*) into before_revisions from public.label_revisions;
 perform public.get_label_admin_reference((select id from label_test.admin_fixture where name='published'));
 perform label_test.assert_true((select count(*)=before_revisions from public.label_revisions),'Lesen einer Veröffentlichung erzeugt keine Bearbeitung');
 perform public.save_label_brand_line(line_id,2,jsonb_build_object('brandId',brand_id,'name','Linie C'),gen_random_uuid());
 loaded:=public.get_label_admin_reference((select id from label_test.admin_fixture where name='published'));
 perform label_test.assert_true(loaded->'publication'->'input'->'content'->>'brandLineName'='Linie B','Umbenennung schreibt die veröffentlichte Historie nicht um');
 loaded:=public.get_label_admin_reference((select id from label_test.admin_fixture where name='archived'));
 perform label_test.assert_true(loaded->>'archived'='true' and loaded->'draft' is not null,'Archivierte Referenz bleibt für Betreiber lesbar');
 select id into page_brand from label_test.admin_fixture where name='page-brand';
 first_page:=public.list_label_admin_references(jsonb_build_object('brandId',page_brand,'state','all','search',''),0);
 last_page:=public.list_label_admin_references(jsonb_build_object('brandId',page_brand,'state','all','search',''),24);
 perform label_test.assert_true(jsonb_array_length(first_page->'rows')=24 and first_page->>'hasMore'='true' and first_page->>'nextOffset'='24','Adminübersicht begrenzt die erste Seite auf 24 Referenzen');
 perform label_test.assert_true(jsonb_array_length(last_page->'rows')=1 and last_page->>'hasMore'='false','Adminübersicht lädt den verbleibenden Treffer');
 perform label_test.assert_true((first_page->'rows'->23->>'referenceId')::integer>(last_page->'rows'->0->>'referenceId')::integer,'Adminseiten sind stabil absteigend nach Kennung sortiert');
end;
$$;
reset role;

update public.label_brands set archived=true where slug='seitenmarke';
update public.label_brand_lines set archived=true where name='Linie C';
set local role authenticated;
select label_test.assert_true(exists(select 1 from jsonb_array_elements(public.list_label_admin_brands()) as b(value) where value->>'slug'='seitenmarke' and value->>'archived'='true'),'Archivierte Marken bleiben in der Adminpflege sichtbar');
select label_test.expect_error(format('select public.save_label_brand_line(null,null,%L::jsonb,gen_random_uuid())',jsonb_build_object('brandId',(select id from public.label_brands where slug='seitenmarke'),'name','Neu')),'22023','Archivierte Marke erhält keine neue Linie');
select label_test.expect_error(format('select public.save_label_brand_line(%s,3,%L::jsonb,gen_random_uuid())',(select id from public.label_brand_lines where name='Linie C'),jsonb_build_object('brandId',(select id from public.label_brands where slug='pilotmarke'),'name','Neu')),'22023','Archivierte Linie wird nicht stillschweigend reaktiviert');
reset role;

delete from public.platform_operators where user_id='00000000-0000-0000-0000-000000000001';
set local role authenticated;
select label_test.expect_error('select public.list_label_admin_brands()','42501','Rollenentzug sperrt die nächste Adminabfrage');
select label_test.expect_error('select public.get_label_admin_reference(1)','42501','Rollenentzug sperrt auch direkte Details');
select label_test.expect_error('select public.save_label_brand_line(null,null,null,gen_random_uuid())','42501','Rollenentzug sperrt Schreibaktionen');
reset role;

select label_test.assert_true(not has_function_privilege('service_role','public.save_label_brand_line(integer,integer,jsonb,uuid)','execute'),'Service-Rolle erhält keine redaktionelle Schreibfreigabe');
select label_test.assert_true(not has_function_privilege('anon','public.get_label_admin_reference(integer)','execute'),'Admin-Detail hat keinen anonymen Execute-Grant');
rollback;
