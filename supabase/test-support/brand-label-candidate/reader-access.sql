-- Ausschließlich synthetische Referenzen im isolierten Wegwerf-Testcluster.
begin;
select label_test.assert_true(to_regprocedure('public.list_label_references(jsonb,integer)') is not null,
  'Leser-RPC ist implementiert');

create function label_test.filter(p_query text default '',p_decade jsonb default 'null',p_kind jsonb default 'null')
returns jsonb language sql immutable as $$
 select jsonb_build_object('brandSlug','testmarke','query',p_query,'decade',p_decade,'kind',p_kind);
$$;
create table label_test.references_by_name(name text primary key,id integer);
grant select on label_test.references_by_name to authenticated,anon;

-- Nur dieses Testfixture legt Bildmetadaten direkt an; kein echter Bilddecoder.
create function label_test.publish_reference(p_title text,p_intervals jsonb default '[]',p_kinds jsonb default '["neck-label"]',p_related jsonb default '[]')
returns integer language plpgsql as $$
declare b integer; d jsonb; c jsonb; a integer;
begin
 select id into b from public.label_brands where slug='testmarke';
 d:=public.create_label_draft(b,gen_random_uuid());
 insert into public.label_image_assets(asset_kind,processing_status,original_path,gallery_path,detail_path,mime_type,original_bytes,width,height)
 values('reference-image','processed','private/original/'||gen_random_uuid(),'private/gallery/'||gen_random_uuid(),
 'private/detail/'||gen_random_uuid(),'image/png',100,100,100) returning id into a;
 insert into public.label_image_permissions(label_image_asset_id,status,attribution,allowed_use,reviewed_by,reviewed_at)
 values(a,'approved','Testfotograf','Nur Test, interner Nachweis','00000000-0000-0000-0000-000000000001',now());
 c:=public.label_empty_content()||jsonb_build_object('title',p_title,'kinds',p_kinds,'timeSummary','Ungefähre Testdatierung',
 'features',jsonb_build_array('Blauer Stoff, Café'),'aliases',jsonb_build_array('Suchalias'),
 'evidenceLevel',case when jsonb_array_length(p_intervals)=0 then 'undated' else 'partially-supported' end,
 'intervals',p_intervals,'limitations',jsonb_build_array('Keine echte Markenreferenz'),
 'reviewedAt',current_date::text,'relatedReferenceIds',p_related,
 'sources',jsonb_build_array(jsonb_build_object('id','s1','title','Testbeleg','publisher','','url','https://example.test/beleg',
 'accessedAt',current_date::text,'locator','Testabbildung')));
 d:=public.save_label_draft((d->>'revisionId')::integer,1,jsonb_build_object('content',c,'images',
 jsonb_build_array(jsonb_build_object('assetId',a,'position',0,'caption','Vorderseite','alt','Testetikett','referenceItem','Teststück'))),gen_random_uuid());
 d:=public.submit_label_draft((d->>'revisionId')::integer,(d->>'version')::integer,gen_random_uuid());
 d:=public.publish_label_draft((d->>'revisionId')::integer,(d->>'version')::integer,gen_random_uuid());
 insert into label_test.references_by_name values(p_title,(d->>'referenceId')::integer);
 return (d->>'referenceId')::integer;
end;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select label_test.expect_error('select public.list_label_references(label_test.filter(),0)','42501','Geschlossener Leserbereich sperrt direkten Listenaufruf');
select label_test.expect_error('select public.get_label_reference(''testmarke'',''label-1'')','42501','Geschlossener Leserbereich sperrt direkten Detailaufruf');
select label_test.expect_error('select public.set_label_library_enabled(true,gen_random_uuid())','42501','Nutzer darf Leserbereich nicht freigeben');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter(),0)->'items')=0,'Betreiber sieht echte leere Liste statt erfundener Referenzen');
select label_test.expect_error('select public.set_label_library_enabled(true,gen_random_uuid())','22023','Ohne gültige Veröffentlichung keine Leserfreigabe');
reset role;
select public.save_label_brand(null,null,'{"name":"Testmarke","slug":"testmarke","aliases":[]}',gen_random_uuid());
select label_test.publish_reference('Lücke 1980/2000','[{"startYear":1980,"endYear":1989,"sourceIds":["s1"]},{"startYear":2000,"endYear":2009,"sourceIds":["s1"]}]');
select label_test.publish_reference('Offenes Ende','[{"startYear":1999,"endYear":null,"sourceIds":["s1"]}]','["care-size-label"]');
select label_test.publish_reference('Offener Beginn','[{"startYear":null,"endYear":1989,"sourceIds":["s1"]}]');
select label_test.publish_reference('Ungeklärt');
select label_test.publish_reference('Wörtlich % _ ,() '' OR 1=1 --');
select label_test.publish_reference('Verwandtes Ziel');
select label_test.publish_reference('Verweisende Referenz','[]','["neck-label"]',jsonb_build_array((select id from label_test.references_by_name where name='Verwandtes Ziel')));
select label_test.publish_reference('Seite '||lpad(n::text,2,'0'),'[{"startYear":1990,"endYear":1999,"sourceIds":["s1"]}]') from generate_series(1,25) as n;
set local role authenticated;
select public.set_label_library_enabled(true,'90000000-0000-0000-0000-000000000001');
select label_test.assert_true(public.set_label_library_enabled(true,'90000000-0000-0000-0000-000000000001')->>'operator'='true','Wiederholte Öffnung liefert bestätigtes Ergebnis');
select label_test.expect_error('select public.set_label_library_enabled(false,''90000000-0000-0000-0000-000000000001'')','22023','Andere Öffnungsentscheidung benötigt neue Vorgangskennung');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);

select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Seite'),0)->'items')=24,'Galerie lädt genau 24 Karten');
select label_test.assert_true((public.list_label_references(label_test.filter('Seite'),0)->>'hasMore')::boolean,'25. Treffer meldet Folgeseite');
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Seite'),24)->'items')=1,'Folgeseite enthält letzten Treffer');
select label_test.assert_true(not (public.list_label_references(label_test.filter('Seite'),24)->>'hasMore')::boolean,'Letzte Seite hat keine weitere Seite');
select label_test.assert_true(public.list_label_references(label_test.filter('Seite'),0)#>>'{items,0,title}'='Seite 01','Sortierung ist stabil nach Titel und Kennung');
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Lücke','1990'),0)->'items')=0,'Datierungslücke wird serverseitig nicht aufgefüllt');
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Lücke','2000'),0)->'items')=1,'Zweites belegtes Intervall bleibt auffindbar');
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Offenes Ende','1990'),0)->'items')=1,'Randjahr 1999 überlappt die 1990er');
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Offener Beginn','1990'),0)->'items')=0,'1989 reicht nicht in die 1990er');
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Ungeklärt','"unknown"'),0)->'items')=1,'Undatierte Referenz hat eigenen Filter');
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Ungeklärt','1990'),0)->'items')=0,'Undatiert bedeutet nicht jedes Jahrzehnt');
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Offenes Ende','null','"neck-label"'),0)->'items')=0,'Labelart wird serverseitig gefiltert');
select label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Offenes Ende','null','"care-size-label"'),0)->'items')=1,'Passende Pflegeetiketten sind auffindbar');
do $$
declare q text; r jsonb; id integer; slug text;
begin
 foreach q in array array['%','_',',()',''' OR 1=1 --'] loop
  r:=public.list_label_references(label_test.filter(q),0);
  perform label_test.assert_true(jsonb_array_length(r->'items')=1,'Suchzeichen bleiben wörtlich: '||q);
 end loop;
 r:=public.list_label_references(label_test.filter('Cafe'||chr(769)),0);
 perform label_test.assert_true(jsonb_array_length(r->'items')=24,'NFC-Suche findet Merkmale');
 perform label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Suchalias'),0)->'items')=24,'Alternativnamen werden durchsucht');
 select f.id into id from label_test.references_by_name as f where name='Verweisende Referenz'; slug:='label-'||id;
 r:=public.get_label_reference('testmarke',slug);
 perform label_test.assert_true(r->>'title'='Verweisende Referenz','Detail liefert veröffentlichte Referenz');
 perform label_test.assert_true(r#>>'{images,0,attribution}'='Testfotograf','Öffentliche Urheberangabe wird ausgeliefert');
 perform label_test.assert_true(position('private/' in r::text)=0 and position('interner Nachweis' in r::text)=0,'Detail enthält keine Speicherpfade oder internen Freigabetexte');
 perform label_test.assert_true(not(r ? 'state') and not(r ? 'audit') and not(r ? 'permissions'),'Detail enthält keine redaktionellen Metadaten');
 perform label_test.assert_true(jsonb_array_length(r#>'{content,relatedReferenceIds}')=1,'Sichtbarer verwandter Eintrag wird verknüpft');
 perform label_test.assert_true(public.get_label_reference('fremde-marke',slug) is null,'Falsche Markenzuordnung liefert keine Details');
 perform label_test.assert_true(public.get_label_reference('testmarke','label-2147483647') is null,'Unbekannter Detailpfad liefert neutral nicht verfügbar');
end;
$$;
select label_test.expect_error('select public.list_label_references(''{}'',0)','22023','Unvollständiger Filter wird abgewiesen');
select label_test.expect_error('select public.list_label_references(label_test.filter()||''{"isOperator":true}'',0)','22023','Zusätzliches Rollenfeld wird abgewiesen');
select label_test.expect_error('select public.list_label_references(label_test.filter(repeat(''X'',121)),0)','22023','Suchtext über Grenze wird abgewiesen');
select label_test.expect_error('select public.list_label_references(label_test.filter('''',''1991''),0)','22023','Ungültiger Jahrzehntanfang wird abgewiesen');
select label_test.expect_error('select public.list_label_references(label_test.filter(),-1)','22023','Negativer Offset wird abgewiesen');
select label_test.expect_error('select public.list_label_references(label_test.filter(),1)','22023','Offset muss zum 24er-Seitenvertrag passen');
select label_test.expect_error('select public.list_label_references(label_test.filter(),null)','22023','Fehlender Offset wird abgewiesen');
select label_test.expect_error('select public.label_reference_is_published(1)','42501','Interner Sichtbarkeitshelfer bleibt gesperrt');

-- Neue Entwurfsdaten dürfen Leser nie erreichen; Archivierung invalidiert Seiten.
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
declare id integer; d jsonb; r jsonb; version_before text; target integer;
begin
 select f.id into id from label_test.references_by_name as f where name='Verweisende Referenz';
 d:=public.edit_label_reference(id,gen_random_uuid());
 d:=public.save_label_draft((d->>'revisionId')::integer,(d->>'version')::integer,
 jsonb_set(d->'input','{content,title}','"Privater neuer Text"'),gen_random_uuid());
 perform label_test.assert_true(public.get_label_reference('testmarke','label-'||id)->>'title'='Verweisende Referenz','Entwurf bleibt beim Detailabruf unsichtbar');
 version_before:=public.list_label_references(label_test.filter(),0)->>'catalogVersion';
 select f.id into target from label_test.references_by_name as f where name='Verwandtes Ziel';
 perform public.archive_label_reference(target,(select version from public.label_references where public.label_references.id=target),gen_random_uuid());
 r:=public.get_label_reference('testmarke','label-'||id);
 perform label_test.assert_true(jsonb_array_length(r#>'{content,relatedReferenceIds}')=0,'Archiviertes Ziel verschwindet auch aus alten Verweisen');
 perform label_test.assert_true(public.get_label_reference('testmarke','label-'||target) is null,'Archivierte Referenz liefert keine Details');
 perform label_test.assert_true(public.list_label_references(label_test.filter(),0)->>'catalogVersion'<>version_before,'Archivierung ändert Katalogversion für Pagination');
 select f.id into target from label_test.references_by_name as f where name='Offenes Ende';
 update public.label_image_permissions set status='revoked',revoked_at=now()
 where label_image_asset_id in (select label_image_asset_id from public.label_revision_images where label_revision_id=(select published_revision_id from public.label_references where public.label_references.id=target));
 perform label_test.assert_true(public.get_label_reference('testmarke','label-'||target) is null,'Widerrufenes Bild sperrt auch Detailzugriff');
 perform label_test.assert_true(jsonb_array_length(public.list_label_references(label_test.filter('Offenes Ende'),0)->'items')=0,'Widerrufenes Bild sperrt auch Karte');
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select label_test.expect_error('select public.list_label_references(label_test.filter(),0)','42501','Abgelaufener Workspace erhält keine Bibliothek');
select set_config('request.jwt.claim.sub','',true);
select label_test.expect_error('select public.list_label_references(label_test.filter(),0)','42501','Authenticated ohne Nutzeridentität reicht nicht');
reset role;
set local role anon;
select label_test.expect_error('select public.list_label_references(label_test.filter(),0)','42501','Anonymer RPC-Aufruf wird abgewiesen');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.set_label_library_enabled(false,gen_random_uuid());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select label_test.expect_error('select public.list_label_references(label_test.filter(),0)','42501','Abschalten wirkt beim nächsten direkten Abruf');
rollback;
