\set on_error_stop on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
 ('46000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'listing-draft-owner@example.test', '{}', '{}'),
 ('46000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'listing-draft-other@example.test', '{}', '{}');
insert into public.platform_operators (user_id) values
 ('46000000-0000-4000-8000-000000000001'), ('46000000-0000-4000-8000-000000000002');
insert into public.workspaces (id, name) values
 ('46000000-0000-4000-8000-000000000011', 'Inseratentwürfe'),
 ('46000000-0000-4000-8000-000000000012', 'Fremde Inseratentwürfe');
insert into public.workspace_members (workspace_id, user_id, role) values
 ('46000000-0000-4000-8000-000000000011', '46000000-0000-4000-8000-000000000001', 'owner'),
 ('46000000-0000-4000-8000-000000000012', '46000000-0000-4000-8000-000000000002', 'owner');
insert into public.marketplace_connections (id, workspace_id, display_name, execution_mode, status) values
 ('46000000-0000-4000-8000-000000000021', '46000000-0000-4000-8000-000000000011', 'Eigenes Konto', 'local', 'needs_login'),
 ('46000000-0000-4000-8000-000000000022', '46000000-0000-4000-8000-000000000012', 'Fremdes Konto', 'local', 'needs_login');

select has_table('public', 'marketplace_listing_drafts', 'Entwürfe haben eine eigene Tabelle');
select ok(public.marketplace_listing_content_valid('{"title":"Unvollständige Jacke"}'), 'Unvollständige Inhalte sind speicherbar');
select ok(not public.marketplace_listing_content_valid('{"priceCents":12.5}'), 'Centbeträge sind ganzzahlig');
select ok(not public.marketplace_listing_content_valid('{"title":false}'), 'Textfelder erlauben keine booleschen Werte');
select ok(not public.marketplace_listing_content_valid('{"title":"Hidden\u001f"}'), 'Unsichtbare Steuerzeichen sind gesperrt');
select ok(not public.marketplace_listing_content_valid('{"unknown":true}'), 'Unbekannte Felder werden abgelehnt');
select ok(not public.marketplace_listing_content_valid('{"colorIds":[1,1]}'), 'Auswahlwerte dürfen nicht doppelt sein');
select ok(not public.marketplace_listing_content_valid('{"attributes":{"constructor":"x"}}'), 'Gefährliche Attributnamen sind gesperrt');
select ok(not has_table_privilege('anon', 'public.marketplace_listing_drafts', 'select'), 'Keine anonymen Entwürfe');
select ok(not has_table_privilege('authenticated', 'public.marketplace_listing_drafts', 'update'), 'Revisionen lassen sich nicht direkt überschreiben');

create temporary table draft_test_context (body jsonb);
grant all on draft_test_context to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-000000000001', true);
insert into draft_test_context select public.marketplace_create_listing_draft(
 '46000000-0000-4000-8000-000000000011', null, '{"title":"Meine Jacke"}', p_request_id=>'46000000-0000-4000-8000-000000000031');
select is((public.marketplace_create_listing_draft('46000000-0000-4000-8000-000000000011',null,'{"title":"Antwortverlust"}',p_request_id=>'46000000-0000-4000-8000-000000000031')->>'id'),
 (select body->>'id' from draft_test_context),'Wiederholen nach Antwortverlust legt keinen zweiten Entwurf an');
select is((select body->>'revision' from draft_test_context), '1', 'Neuer Entwurf beginnt bei Revision eins');
select is((select jsonb_typeof(body->'id') from draft_test_context), 'string', 'IDs werden verlustfrei als Text übertragen');
select is((select body->'content'->>'priceCents' from draft_test_context), null, 'Einkaufskosten sind kein Verkaufspreis');
select is((select body->>'connectionId' from draft_test_context), null, 'Vorbereitung braucht kein Konto');
select is((select count(*) from public.marketplace_listing_drafts), 1::bigint, 'Der eigene Entwurf ist sichtbar');
select throws_ok($$select public.marketplace_create_listing_draft('46000000-0000-4000-8000-000000000011','46000000-0000-4000-8000-000000000022','{}')$$,
 '42501', null, 'Ein fremdes Zielkonto wird abgelehnt');
select is((public.marketplace_save_listing_draft((select body->>'id' from draft_test_context), 1,
 '{"title":"Neue Jacke","priceCents":4200}', '46000000-0000-4000-8000-000000000021')->>'revision'), '2', 'Speichern erhöht die Revision');
select throws_ok($$select public.marketplace_save_listing_draft((select body->>'id' from draft_test_context),1,'{"title":"Alter Tab"}',null)$$,
 '40001', null, 'Der alte Tab überschreibt keine neuere Revision');
select is((public.marketplace_read_listing_draft((select body->>'id' from draft_test_context))->'content'->>'title'),
 'Neue Jacke', 'Nach Konflikt bleibt der neue Inhalt erhalten');

select set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.marketplace_listing_drafts), 0::bigint, 'Fremde Entwürfe sind unsichtbar');
select throws_ok($$select public.marketplace_read_listing_draft((select body->>'id' from draft_test_context))$$,
 '42501', null, 'Ein erratener Entwurflink gewährt keinen Zugriff');
select throws_ok($$select public.marketplace_save_listing_draft((select body->>'id' from draft_test_context),2,'{"title":"Fremder"}',null)$$,
 '42501', null, 'Ein fremder Arbeitsbereich kann nicht speichern');

select set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-000000000001', true);
select is((public.marketplace_save_listing_template('46000000-0000-4000-8000-000000000011',null,null,'Jacken',
 '{"title":"{brand} Jacke {size}"}')->>'revision'), '1', 'Vorlage speichert ausgewählte Felder');
select throws_ok($$select public.marketplace_save_listing_template('46000000-0000-4000-8000-000000000011',null,null,'Andere Vorlage','{"connectionId":"fremd"}')$$,
 '22023', null, 'Vorlagen übernehmen keine Zielkonten');
select is((select count(*) from public.marketplace_listing_templates), 1::bigint, 'Vorlagen gehören zum eigenen Arbeitsbereich');
select throws_ok($$select public.marketplace_save_listing_template('46000000-0000-4000-8000-000000000011',null,null,'jacken','{"title":"Andere"}')$$,
 '23505', null, 'Gleichnamige Vorlagen werden nicht still überschrieben');
select public.marketplace_create_listing_draft('46000000-0000-4000-8000-000000000011',null,'{"title":"Zweiter Entwurf"}');
select is(jsonb_array_length(public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_limit=>1)->'items'),1,'Entwürfe werden begrenzt geblättert');
select is((public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_cursor=>public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_limit=>1)->'nextCursor')->'items'->0->>'id'),
 (select body->>'id' from draft_test_context),'Die zweite Seite lässt keinen Entwurf aus');
select is(jsonb_array_length(public.marketplace_list_listing_drafts('46000000-0000-4000-8000-000000000011',p_query=>'nicht gefunden')->'items'),0,'Die Suche umfasst den Arbeitsbereich');

reset role;
select lives_ok($$delete from public.marketplace_connections where id='46000000-0000-4000-8000-000000000021'$$,'Ein vorbereiteter Entwurf blockiert keine Kontolöschung');
set local role authenticated;
select is((public.marketplace_read_listing_draft((select body->>'id' from draft_test_context))->>'connectionId'),null,'Nach Kontolöschung bleibt die Arbeitskopie ohne Zielkonto erhalten');
reset role;
update public.workspaces set archived_at=now() where id='46000000-0000-4000-8000-000000000011';
set local role authenticated;
select throws_ok($$select public.marketplace_save_listing_draft((select body->>'id' from draft_test_context),2,'{}',null)$$,
 '42501', null, 'Archivierte Arbeitsbereiche können keine Entwürfe ändern');
select * from finish();
rollback;
