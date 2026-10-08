-- Neue Verhaltensprüfungen für SQL-Kandidaten. NICHT ausgeführt.
-- Nur hinter fixture.sql und den Kandidaten im neuen lokalen Testcluster laden.
begin;
create function label_test.empty_content() returns jsonb language sql immutable as $$
 select '{"title":"","aliases":[],"brandLineId":null,"brandName":"","brandLineName":null,"kinds":[],"timeSummary":"","evidenceLevel":"undated","intervals":[],"features":[],"checkHints":[],"limitations":[],"relatedReferenceIds":[],"sources":[],"reviewedAt":null}'::jsonb;
$$;
grant execute on function label_test.empty_content() to authenticated;
select label_test.assert_true(public.label_validate_content(label_test.empty_content()) = label_test.empty_content(), 'Leerer strukturierter Entwurf ist zulässig');
select label_test.expect_error('select public.label_validate_content(''{}''::jsonb)', '22023', 'Fehlende Inhaltsfelder abweisen');
select label_test.expect_error('select public.label_validate_content(label_test.empty_content() || ''{"originalPath":"private/a"}''::jsonb)', '22023', 'Unbekannte Inhaltsfelder abweisen');
select label_test.expect_error('select public.label_validate_content(label_test.empty_content() || ''{"title":null}''::jsonb)', '22023', 'Null ist kein Titel');
select label_test.expect_error('select public.label_validate_content(label_test.empty_content() || jsonb_build_object(''title'',repeat(''X'',161)))', '22023', 'Titel über 160 Zeichen ablehnen');
select label_test.expect_error('select public.label_validate_content(label_test.empty_content() || ''{"reviewedAt":"2025-02-29"}''::jsonb)', '22023', 'Falsches Kalenderdatum ablehnen');
select label_test.assert_true(public.label_validate_content(label_test.empty_content() || '{"reviewedAt":"2024-02-29"}') ->> 'reviewedAt' = '2024-02-29', 'Schalttag akzeptieren');
select label_test.expect_error('select public.label_validate_content(label_test.empty_content() || ''{"intervals":[{"startYear":1999,"endYear":1990,"sourceIds":[]}]}''::jsonb)', '22023', 'Umgekehrtes Intervall ablehnen');
select label_test.expect_error('select public.label_validate_content(label_test.empty_content() || ''{"intervals":[{"startYear":1990,"endYear":null,"sourceIds":["missing"]}]}''::jsonb)', '22023', 'Nicht vorhandene Quelle ablehnen');
select label_test.expect_error('select public.label_validate_content(label_test.empty_content() || ''{"kinds":["neck-label","neck-label"]}''::jsonb)', '22023', 'Doppelte Labelart ablehnen');
select label_test.expect_error('select public.label_validate_content(label_test.empty_content() || ''{"brandLineId":1.5}''::jsonb)', '22023', 'Gebrochene Kennung ablehnen');
select label_test.expect_error('select public.label_validate_draft(jsonb_build_object(''content'',label_test.empty_content(),''images'',''[{"assetId":1,"position":1,"caption":"","alt":"","referenceItem":""}]''::jsonb))', '22023', 'Bilderfolge muss bei null beginnen');
select label_test.expect_error('select public.label_validate_draft(jsonb_build_object(''content'',label_test.empty_content(),''images'',''[{"assetId":1,"position":0,"caption":"","alt":"","referenceItem":""},{"assetId":1,"position":1,"caption":"","alt":"","referenceItem":""}]''::jsonb))', '22023', 'Doppeltes Bild ablehnen');
select label_test.expect_error('select public.label_assert_source_url(to_jsonb(''https://user:password@example.com/a''::text),''source.url'')', '22023', 'Quellenlink mit Zugangsdaten ablehnen');
select label_test.expect_error('select public.label_assert_source_url(to_jsonb(''javascript:alert(1)''::text),''source.url'')', '22023', 'Aktiven Quellenlink ablehnen');
select label_test.assert_true(public.label_json_byte_size('{"a":[1,2],"x":"ä"}'::jsonb)=20, 'Kompakte UTF-8-Größe ohne jsonb-Leerzeichen');

select label_test.assert_true(not public.label_has_text(chr(160)||chr(65279)), 'Unicode-Leerraum ist kein sichtbarer Text');

-- Reale Rolle authenticated, keine nachgebaute Autorisierung im Testclient.
do $$
declare
  brand jsonb; reference jsonb; again jsonb; saved jsonb; reviewed jsonb; receipt jsonb;
  edited jsonb; v_input jsonb; before_pointer integer; asset integer;
  first_request uuid := '20000000-0000-0000-0000-000000000001';
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  execute 'set local role authenticated';
  perform label_test.expect_error($q$select public.create_label_draft(1,'20000000-0000-0000-0000-000000000001')$q$,'42501','Workspace-Nutzer darf keine Labelentwürfe erstellen');
  perform label_test.expect_error('select public.label_draft_result(1)','42501','Interner Projektionshelfer ist nicht öffentlich aufrufbar');
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  brand := public.save_label_brand(null,null,'{"name":"Testmarke","slug":"testmarke","aliases":[]}',first_request);
  again := public.save_label_brand(null,null,'{"name":"Testmarke","slug":"testmarke","aliases":[]}',first_request);
  perform label_test.assert_true(brand=again,'Wiederholtes Anlegen liefert dieselbe Marke');
  perform label_test.expect_error($q$select public.save_label_brand(null,null,'{"name":"Andere","slug":"andere","aliases":[]}','20000000-0000-0000-0000-000000000001')$q$,'22023','Gleiche Vorgangskennung darf keine anderen Eingaben ausführen');
  reference := public.create_label_draft((brand->>'id')::integer,'20000000-0000-0000-0000-000000000002');
  again := public.create_label_draft((brand->>'id')::integer,'20000000-0000-0000-0000-000000000002');
  perform label_test.assert_true(reference=again,'Wiederholtes Anlegen erzeugt keine zweite Referenz');
  perform label_test.assert_true(reference->>'state'='draft','Anlegen veröffentlicht nicht');
  perform label_test.expect_error(format('select public.submit_label_draft(%s,1,%L)',reference->>'revisionId','20000000-0000-0000-0000-000000000003'),'22023','Leerer Entwurf ist nicht prüfbereit');
  perform label_test.assert_true((select count(*)=2 from public.label_edit_requests),'Fehlgeschlagene Prüfung erzeugt keinen Erfolgsbeleg');

  -- Nur der privilegierte Testaufbau darf verarbeitete Bildmetadaten erfinden.
  execute 'reset role';
  insert into public.label_image_assets(asset_kind,processing_status,original_path,gallery_path,detail_path,mime_type,original_bytes,width,height)
  values ('reference-image','processed','fixture/original','fixture/gallery','fixture/detail','image/png',100,100,100) returning id into asset;
  insert into public.label_image_permissions(label_image_asset_id,status,attribution,allowed_use,reviewed_by,reviewed_at)
  values(asset,'approved','Eigene Testaufnahme','Nur isolierte Tests','00000000-0000-0000-0000-000000000001',now());
  execute 'set local role authenticated';
  v_input := jsonb_build_object('content',label_test.empty_content() || jsonb_build_object(
    'title','Testetikett','kinds',jsonb_build_array('neck-label'),'timeSummary','Zeitlich ungeklärt',
    'features',jsonb_build_array('Synthetischer Test'),'limitations',jsonb_build_array('Keine historische Behauptung'),
    'reviewedAt',current_date::text),
    'images',jsonb_build_array(jsonb_build_object('assetId',asset,'position',0,'caption','Testbild','alt','Testetikett','referenceItem','Teststück A')));
  saved := public.save_label_draft((reference->>'revisionId')::integer,1,v_input,'20000000-0000-0000-0000-000000000004');
  perform label_test.assert_true(saved->>'version'='2' and saved->>'state'='draft','Speichern erhöht nur die Entwurfsversion');
  perform label_test.assert_true((select published_revision_id is null from public.label_references where id=(reference->>'referenceId')::integer),'Speichern lässt Veröffentlichung leer');
  perform label_test.expect_error(format('select public.save_label_draft(%s,1,%L::jsonb,%L)',reference->>'revisionId',v_input::text,'20000000-0000-0000-0000-000000000005'),'P0001','Veraltete Entwurfsversion darf nicht speichern');
  perform label_test.expect_error(format('select public.publish_label_draft(%s,2,%L)',reference->>'revisionId','20000000-0000-0000-0000-000000000006'),'22023','Direktes Veröffentlichen überspringt keine Prüfung');
  reviewed := public.submit_label_draft((reference->>'revisionId')::integer,2,'20000000-0000-0000-0000-000000000007');
  receipt := public.publish_label_draft((reference->>'revisionId')::integer,3,'20000000-0000-0000-0000-000000000008');
  perform label_test.assert_true(receipt->>'version'='4','Veröffentlichen bestätigt die neue Version');
  before_pointer := (reference->>'revisionId')::integer;
  perform label_test.assert_true((select published_revision_id=before_pointer from public.label_references where id=(reference->>'referenceId')::integer),'Veröffentlichen setzt den zugehörigen Revisionszeiger');
  perform label_test.assert_true((select content->>'brandName'='Testmarke' from public.label_revisions where id=before_pointer),'Markenname stammt aus der Datenbank');
  again := public.publish_label_draft(before_pointer,3,'20000000-0000-0000-0000-000000000008');
  perform label_test.assert_true(again=receipt,'Wiederholte Veröffentlichung liefert denselben Beleg');
  perform label_test.assert_true((select count(*)=1 from public.label_change_events where action='publish'),'Wiederholung schreibt kein zweites Veröffentlichungsereignis');
  edited := public.edit_label_reference((reference->>'referenceId')::integer,'20000000-0000-0000-0000-000000000009');
  perform label_test.assert_true((edited->>'revisionId')::integer <> before_pointer and edited->>'state'='draft','Bearbeiten erzeugt eine neue Revision');
  perform label_test.assert_true((select published_revision_id=before_pointer from public.label_references where id=(reference->>'referenceId')::integer),'Bearbeiten verändert den Leserstand nicht');
  v_input := jsonb_set(v_input,'{content,title}','"Neuer Entwurf"');
  saved := public.save_label_draft((edited->>'revisionId')::integer,1,v_input,'20000000-0000-0000-0000-000000000010');
  perform label_test.assert_true((select content->>'title'='Testetikett' from public.label_revisions where id=before_pointer),'Textkorrektur bleibt bis zur Veröffentlichung unsichtbar');
  perform public.discard_label_draft((edited->>'revisionId')::integer,2,'20000000-0000-0000-0000-000000000011');
  perform label_test.assert_true((select published_revision_id=before_pointer from public.label_references where id=(reference->>'referenceId')::integer),'Verwerfen entfernt keine Veröffentlichung');
  perform label_test.expect_error(format('select public.save_label_draft(%s,3,%L::jsonb,%L)',edited->>'revisionId',v_input::text,'20000000-0000-0000-0000-000000000012'),'22023','Verworfene Revision bleibt unveränderlich');
  execute 'reset role';
end;
$$;
rollback;
