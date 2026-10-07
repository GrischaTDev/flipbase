-- Verhaltensprüfungen für den Schemakandidaten.
-- Die Fixture simuliert ausschließlich Auth-ID, Betreiberrolle und Zugangsstatus.
begin;
insert into public.label_brands(name, slug) values ('Testmarke', 'testmarke');
insert into public.label_references(label_brand_id) values (1), (1);
insert into public.label_revisions(label_reference_id, content) values (1, '{}'), (2, '{}');
insert into public.label_image_assets(asset_kind, original_path, processing_status, mime_type,
 original_bytes, width, height, gallery_path, detail_path) values
 ('reference-image', 'test/original-a', 'processed', 'image/png', 100, 100, 100, 'test/gallery-a', 'test/detail-a');
insert into public.label_revision_images(label_revision_id, label_image_asset_id, position) values (1, 1, 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select label_test.assert_true(not public.can_read_label_library(), 'Leserbereich ist standardmäßig geschlossen');
select label_test.assert_true((select count(*) = 0 from public.label_brands), 'Leser sieht keine redaktionellen Tabellen');
select label_test.assert_true((select count(*) = 0 from public.label_revisions), 'Leser sieht keine Entwürfe');
select label_test.assert_true(public.get_label_library_availability() = '{"visible":false,"operator":false}'::jsonb, 'Verfügbarkeit ohne Offenlegung interner Daten');
select set_config('request.jwt.claims', '{"user_metadata":{"role":"admin"}}', true);
select label_test.assert_true(not public.can_read_label_library(), 'Manipulierte Nutzer-Metadaten erteilen keine Betreiberrechte');

do $$
declare name text; editable_column text;
begin
  foreach name in array array['label_brands','label_brand_lines','label_references','label_revisions',
   'label_image_assets','label_revision_images','label_image_permissions','label_change_events',
   'label_edit_requests','label_library_settings'] loop
    perform label_test.expect_error(format('insert into public.%I default values', name), '42501', name || ': INSERT für Leser gesperrt');
    -- Eine normale Spalte prüfen: GENERATED ALWAYS wird sonst schon vor ACL
    -- mit 428C9 abgewiesen und würde die eigentliche Rechteprüfung verdecken.
    editable_column := case name
      when 'label_brands' then 'name' when 'label_brand_lines' then 'name'
      when 'label_references' then 'archived' when 'label_revisions' then 'version'
      when 'label_image_assets' then 'processing_status' when 'label_revision_images' then 'position'
      when 'label_image_permissions' then 'status' when 'label_change_events' then 'action'
      when 'label_edit_requests' then 'action' when 'label_library_settings' then 'reader_enabled'
    end;
    perform label_test.expect_error(format('update public.%I set %I = %I', name, editable_column, editable_column), '42501', name || ': UPDATE für Leser gesperrt');
    perform label_test.expect_error(format('delete from public.%I', name), '42501', name || ': DELETE für Leser gesperrt');
    perform label_test.expect_error(format('truncate public.%I', name), '42501', name || ': TRUNCATE für Leser gesperrt');
  end loop;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select label_test.assert_true(public.can_read_label_library(), 'Betreiber darf intern lesen');
select label_test.assert_true((select count(*) = 2 from public.label_revisions), 'Betreiber kann Entwürfe lesen');
select label_test.expect_error('update public.label_library_settings set reader_enabled = true', '42501', 'Auch Betreiber kann nicht direkt freischalten');
select label_test.expect_error('insert into public.label_brands(name, slug) values (''X'', ''x'')', '42501', 'Auch Betreiber schreibt nur über spätere RPCs');

reset role;
update public.label_library_settings set reader_enabled = true;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select label_test.assert_true(public.can_read_label_library(), 'Gültige Mitgliedschaft darf geöffnete Bibliothek lesen');
select label_test.assert_true((select count(*) = 0 from public.label_revisions), 'Geöffnete Bibliothek legt Entwurfstabellen nicht offen');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select label_test.assert_true(not public.can_read_label_library(), 'Abgelaufener Zugang reicht nicht');
select set_config('request.jwt.claim.sub', '', true);
select label_test.assert_true(not public.can_read_label_library(), 'Fehlende Nutzeridentität reicht nicht');

reset role;
delete from public.platform_operators;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select label_test.assert_true(not public.can_read_label_library(), 'Betreiberentzug wirkt bei der nächsten Abfrage');
select label_test.assert_true((select count(*) = 0 from public.label_revisions), 'Entzogene Betreiberrolle sieht keine Entwürfe mehr');
reset role;
set local role anon;
select label_test.expect_error('select * from public.label_brands', '42501', 'Anonymer Tabellenzugriff gesperrt');
select label_test.expect_error('select public.can_read_label_library()', '42501', 'Anonymer Funktionszugriff gesperrt');
reset role;

select label_test.expect_error('insert into public.label_revisions(label_reference_id,content) values (1,''{}'')', '23505', 'Nur ein editierbarer Entwurf pro Referenz');
select label_test.expect_error('update public.label_references set published_revision_id=1 where id=1', '23503', 'Entwurf kann nicht als Veröffentlichung verknüpft werden');
update public.label_revisions set state='published', published_at=now() where id=1;
update public.label_references set published_revision_id=1 where id=1;
select label_test.expect_error('update public.label_references set published_revision_id=1 where id=2', '23503', 'Fremde Revision kann nicht verknüpft werden');
select label_test.expect_error('update public.label_revisions set content=''{}'' where id=1', '55000', 'Veröffentlichte Inhalte sind unveränderlich');
select label_test.expect_error('delete from public.label_revisions where id=1', '55000', 'Veröffentlichte Revision nicht löschen');
select label_test.expect_error('update public.label_revision_images set caption=''Geändert'' where label_revision_id=1', '55000', 'Veröffentlichtes Bild nicht umbeschriften');
select label_test.expect_error('delete from public.label_revision_images where label_revision_id=1', '55000', 'Veröffentlichte Bildzuordnung nicht entfernen');
select label_test.expect_error('update public.label_revision_images set label_revision_id=2 where label_revision_id=1', '55000', 'Bild aus Veröffentlichung nicht umhängen');
select label_test.expect_error('insert into public.label_revision_images(label_revision_id,label_image_asset_id,position) values (1,1,1)', '55000', 'Keine Bildzuordnung nachträglich veröffentlichen');
select label_test.expect_error('update public.label_image_assets set original_path=''ersetzt'' where id=1', '55000', 'Verarbeitete Originaldatei nicht überschreiben');
select label_test.expect_error('update public.label_image_assets set processing_status=''pending'' where id=1', '55000', 'Dateischutz nicht durch Statusrücksetzung umgehen');

insert into public.label_revisions(label_reference_id,content) values (1, '{}');
insert into public.label_revision_images(label_revision_id,label_image_asset_id,position) select id, 1, 0 from public.label_revisions where label_reference_id=1 and state='draft';
update public.label_revision_images set caption='Neuer Entwurf' where label_revision_id=(select id from public.label_revisions where label_reference_id=1 and state='draft');
select label_test.assert_true((select caption='' from public.label_revision_images where label_revision_id=1), 'Neue Beschriftung ändert alte Veröffentlichung nicht');
update public.label_revisions set state='discarded' where label_reference_id=1 and state='draft';
select label_test.expect_error('update public.label_revisions set state=''draft'' where label_reference_id=1 and state=''discarded''', '55000', 'Verworfenen Entwurf nicht überschreiben');
select label_test.expect_error('update public.label_revision_images set caption=''Geändert'' where label_revision_id=(select id from public.label_revisions where label_reference_id=1 and state=''discarded'')', '55000', 'Verworfene Bildhistorie bleibt erhalten');

insert into public.label_change_events(actor_id, action) values ('00000000-0000-0000-0000-000000000001', 'test');
select label_test.expect_error('update public.label_change_events set action=''Andere Aktion''', '55000', 'Protokoll nicht überschreiben');
select label_test.expect_error('delete from public.label_change_events', '55000', 'Protokoll nicht löschen');
select label_test.assert_true((select count(*)=10 from pg_class join pg_namespace on pg_namespace.oid=pg_class.relnamespace
 where pg_namespace.nspname='public' and relname in ('label_brands','label_brand_lines','label_references','label_revisions',
 'label_image_assets','label_revision_images','label_image_permissions','label_change_events','label_edit_requests','label_library_settings')
 and relrowsecurity), 'RLS auf allen zehn Labeltabellen');
rollback;
