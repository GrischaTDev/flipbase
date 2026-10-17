\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into storage.buckets(id,name,public) values('item-media','item-media',false) on conflict(id) do nothing;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values('50100000-0000-4000-8000-000000000001','authenticated','authenticated','source@example.test','{}','{}');
insert into public.platform_operators(user_id) values('50100000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('50100000-0000-4000-8000-000000000011','Quelle');
insert into public.workspace_members(workspace_id,user_id,role) values('50100000-0000-4000-8000-000000000011','50100000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,external_account_id,status) values('50100000-0000-4000-8000-000000000021','50100000-0000-4000-8000-000000000011','Vinted','99','connected');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values('50100000-0000-4000-8000-000000000031','50100000-0000-4000-8000-000000000011','50100000-0000-4000-8000-000000000021','publication','123','{"title":"Alte Lesekopie","views":7}');
insert into public.kleinanzeigen_connections(workspace_id,external_account_id,display_name,account_type,created_by) values('50100000-0000-4000-8000-000000000011','88','Kleinanzeigen','private','50100000-0000-4000-8000-000000000001');
create function pg_temp.cache_source(p_source jsonb default '{"externalAccountId":"99","externalId":"123","title":"Jacke","description":"Vollständiger Text","priceCents":1200,"currency":"EUR","photoReferences":["https://images1.vinted.net/a.jpg"],"attributeHints":{"brand":"Marke"}}') returns jsonb language sql as $$ select public.kleinanzeigen_cache_transfer_source('50100000-0000-4000-8000-000000000011','50100000-0000-4000-8000-000000000021','50100000-0000-4000-8000-000000000031','50100000-0000-4000-8000-000000000001',p_source); $$;
create function pg_temp.read_source() returns jsonb language sql as $$ select public.kleinanzeigen_read_transfer_source('50100000-0000-4000-8000-000000000011',(select id from public.kleinanzeigen_connections where external_account_id='88'),'50100000-0000-4000-8000-000000000021','123'); $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.read_source()->>'state','ready','Vorhandene Teilangaben öffnen ein ergänzbares Formular ohne Anbieterabruf');
select is(pg_temp.read_source()->'source'->>'title','Alte Lesekopie','Gespeicherter Titel wird sofort übernommen');
select is(pg_temp.read_source()->'source'->'photoReferences','[]'::jsonb,'Fehlende gespeicherte Bilder bleiben leer statt Abruf zu erzwingen');
select throws_ok($$select pg_temp.cache_source()$$,'42501',null,'Frontend kann keinen vollständigen Quellbeleg erfinden');
reset role;set local role service_role;
select lives_ok($$select pg_temp.cache_source()$$,'Server bestätigt vollständige kontogebundene Quelle');
select is(pg_temp.cache_source()->>'fingerprint',pg_temp.cache_source()->>'fingerprint','Gleicher Inhalt behält Fingerprint trotz neuer Lesezeit');
select is((select body->>'views' from public.marketplace_account_entries where external_id='123'),'7','Quellabruf erhält andere Kontometadaten');
select throws_ok($$select pg_temp.cache_source('{"externalAccountId":"98"}')$$,'22023',null,'Unvollständige oder falsche Quelle abgelehnt');
reset role;set local role authenticated;
select is(pg_temp.read_source()->>'state','ready','Geprüfte Quelle ist bereit');
select is(pg_temp.read_source()->'source'->>'description','Vollständiger Text','Volle Beschreibung wird gelesen');
reset role;
update public.marketplace_connections set execution_mode='local' where id='50100000-0000-4000-8000-000000000021';
set local role service_role;
select throws_ok($$select pg_temp.cache_source()$$,'42501',null,'Cloudquelle kann keine lokale Bindung umgehen');
reset role;
insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at,grant_generation) values('50100000-0000-4000-8000-000000000011','50100000-0000-4000-8000-000000000021','50100000-0000-4000-8000-000000000001',repeat('a',64),'99',clock_timestamp()+interval '1 hour',3);
create function pg_temp.local_source(p_hash text default repeat('a',64),p_generation bigint default null,p_source jsonb default null) returns jsonb language sql as $$select public.kleinanzeigen_local_transfer_source('50100000-0000-4000-8000-000000000011','50100000-0000-4000-8000-000000000021',p_hash,'50100000-0000-4000-8000-000000000031','123',p_generation,p_source);$$;
set local role service_role;
select is(pg_temp.local_source()->>'generation','3','Lesefreigabe liefert aktuelle Generation ohne Nachrichten- oder Schreibfreigabe');
select throws_ok($$select pg_temp.local_source(repeat('b',64))$$,'42501',null,'Falsches Installationssecret wird abgelehnt');
select throws_ok($$select pg_temp.local_source(p_generation=>2,p_source=>'{}')$$,'42501',null,'Alte Generation kann keine Quelle importieren');
select lives_ok($$select pg_temp.local_source(p_generation=>3,p_source=>(select (body->'transferSource')-'observedAt' from public.marketplace_account_entries where external_id='123'))$$,'Gültige lokale Lesefreigabe importiert volle Quelle');
reset role;
update public.marketplace_local_extension_grants set revoked_at=clock_timestamp() where connection_id='50100000-0000-4000-8000-000000000021';
set local role service_role;
select throws_ok($$select pg_temp.local_source()$$,'42501',null,'Widerrufene lokale Freigabe kann keine Quelle mehr lesen');
reset role;
select ok(not has_function_privilege('anon','public.kleinanzeigen_read_transfer_source(uuid,bigint,uuid,text)','execute'),'Anonyme sehen keine Quelltexte');
reset role;
update public.marketplace_account_entries set body=jsonb_build_object('title','Gespeicherte Jacke','transferSource',null,'text','Bereits gespeicherte Beschreibung','textState','loaded','price',12.34,'currency','EUR','imageUrls',jsonb_build_array('https://images1.vinted.net/cached.jpg'),'brand','Marke','size','M') where external_id='123';
update public.marketplace_connections set status='needs_login' where id='50100000-0000-4000-8000-000000000021';
set local role authenticated;
select is(pg_temp.read_source()->>'state','ready','Gespeicherte Inserate bleiben ohne aktive Anbieteranmeldung kopierbar');
select is(pg_temp.read_source()->'source'->>'description','Bereits gespeicherte Beschreibung','Normaler Textcache genügt ohne separates transferSource-Feld');
select is(pg_temp.read_source()->'source'->>'priceCents','1234','Gespeicherter Europreis wird verlustfrei in Cent übernommen');
select is(pg_temp.read_source()->'source'->'photoReferences',jsonb_build_array('https://images1.vinted.net/cached.jpg'),'Gespeicherte Bildreihenfolge wird übernommen');
select is(pg_temp.read_source()->'source'->'attributeHints'->>'size','M','Vorhandene Eigenschaften werden als Zuordnungshinweise übernommen');
reset role;
update public.marketplace_connections set status='connected' where id='50100000-0000-4000-8000-000000000021';
update public.marketplace_account_entries set body=jsonb_build_object('transferSource',jsonb_build_object('externalAccountId','99','externalId','123','title','Alter gespeicherter Text','description','Weiter kopierbar','priceCents',1200,'currency','EUR','photoReferences',jsonb_build_array('https://images1.vinted.net/a.jpg'),'attributeHints','{}'::jsonb,'observedAt',clock_timestamp()-interval '30 days')) where external_id='123';
set local role authenticated;
select is(pg_temp.read_source()->>'state','ready','Gespeicherte Kopiervorlage verfällt nicht nach 24 Stunden');
reset role;
update public.marketplace_account_entries set body=jsonb_build_object('title','Aktueller Cachetitel','text','Aktueller Cachetext','textState','loaded','price',15.25,'currency','EUR','imageUrls',jsonb_build_array('https://images1.vinted.net/cover-a.jpg'),'transferSource',jsonb_build_object('externalAccountId','99','externalId','123','title','Alter Quelltitel','description','Alter Quelltext','priceCents',1200,'currency','EUR','photoReferences',jsonb_build_array('https://images1.vinted.net/original-a.jpg','https://images1.vinted.net/original-b.jpg'),'attributeHints','{}'::jsonb,'observedAt',clock_timestamp()-interval '30 days')) where external_id='123';
set local role authenticated;
select is(pg_temp.read_source()->'source'->'photoReferences',jsonb_build_array('https://images1.vinted.net/original-a.jpg','https://images1.vinted.net/original-b.jpg'),'Vollstaendige gespeicherte Originalfotos behalten Vorrang vor einem einzelnen Cachecover');
select is(pg_temp.read_source()->'source'->>'description','Aktueller Cachetext','Bildvorrang veraendert den aktuellen Beschreibungscache nicht');
select is(pg_temp.read_source()->'source'->>'priceCents','1525','Bildvorrang veraendert den aktuellen Preiscache nicht');
reset role;
update public.marketplace_account_entries set body=jsonb_set(body,'{imageUrls}','[]'::jsonb) where external_id='123';
set local role authenticated;
select is(pg_temp.read_source()->'source'->'photoReferences',jsonb_build_array('https://images1.vinted.net/original-a.jpg','https://images1.vinted.net/original-b.jpg'),'Leere normale Bildliste verwirft keine vollstaendigen gespeicherten Originalfotos');
reset role;
set local role service_role;
select is(public.kleinanzeigen_saved_listing_source('{"title":"Jacke","text":"","textState":"not_loaded","transferSource":{"externalAccountId":"99","externalId":"123","description":"Alter Quelltext"}}'::jsonb,'99','123')->>'description','Alter Quelltext','Nicht geladener leerer Kurztext verdeckt keine gespeicherte vollständige Beschreibung');
select is(public.kleinanzeigen_saved_listing_source('{"title":"Jacke","text":"","textState":"loaded","transferSource":{"externalAccountId":"99","externalId":"123","description":"Alter Quelltext"}}'::jsonb,'99','123')->>'description','','Bewusst gespeicherte leere Beschreibung wird nicht durch alten Volltext ersetzt');
select is(public.kleinanzeigen_saved_listing_source('{"title":"Jacke"}'::jsonb,'99','123')->>'description','','Echt fehlender Text bleibt leer und wird nicht erfunden');
reset role;
update public.marketplace_account_entries set body=jsonb_build_object('transferSource',jsonb_build_object('externalAccountId','98','externalId','123','title','Fremde Quelle','description','Fremd','priceCents',1200,'currency','EUR','photoReferences',jsonb_build_array('https://images1.vinted.net/a.jpg'),'attributeHints','{}'::jsonb,'observedAt',clock_timestamp())) where external_id='123';
set local role authenticated;
select throws_ok($$select pg_temp.read_source()$$,'42501',null,'Fremde Kontobelege bleiben auch ohne Anbieterabruf gesperrt');
reset role;
select ok(not has_function_privilege('anon','public.kleinanzeigen_saved_listing_source(jsonb,text,text)','execute'),'Kanonische Quellenfunktion ist nicht anonym aufrufbar');
select ok(not has_function_privilege('authenticated','public.kleinanzeigen_saved_listing_source(jsonb,text,text)','execute'),'Kanonische Quellenfunktion bleibt trotz Standardrechten servergebunden');
select ok(has_function_privilege('service_role','public.kleinanzeigen_saved_listing_source(jsonb,text,text)','execute'),'Gepruefter Server darf gespeicherte Quellen vereinheitlichen');

-- Veröffentlichter Inhalt liegt im unveränderlichen Auftrag, nicht in der Wardrobe-Liste.
insert into public.marketplace_connections(id,workspace_id,display_name,external_account_id,status) values
 ('50100000-0000-4000-8000-000000000022','50100000-0000-4000-8000-000000000011','Anderes Vinted','98','connected');
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body)
select '50100000-0000-4000-8000-000000000011','50100000-0000-4000-8000-000000000021','publication',id::text,
 jsonb_build_object('title','Aktueller Listentitel','price',15,'currency','EUR','text',null,'textState','not_loaded','imageUrls',jsonb_build_array('https://images1.vinted.net/published.jpg'))
from generate_series(90001,90014) id;
create function pg_temp.published_job(p_external text,p_account text default '99',p_state text default 'confirmed',p_action text default 'publish',p_provider text default 'active',p_snapshot_connection uuid default '50100000-0000-4000-8000-000000000021',p_started boolean default true,p_description text default 'Gespeicherter Veröffentlichungstext',p_workspace uuid default '50100000-0000-4000-8000-000000000011',p_connection uuid default '50100000-0000-4000-8000-000000000021',p_verified timestamptz default clock_timestamp()-interval '1 minute') returns bigint language plpgsql as $$
declare v_draft bigint;v_job bigint;
begin
 insert into public.marketplace_listing_drafts(workspace_id,connection_id,created_by,content)
 values(p_workspace,p_connection,'50100000-0000-4000-8000-000000000001',jsonb_build_object('description','Später geänderter Entwurf')) returning id into v_draft;
 insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,requested_by,request_id,request_hash,draft_revision,authorization_version,external_account_id,execution_mode,action,snapshot,state,external_id,provider_state,verified_at,started_at)
 values(p_workspace,p_connection,v_draft,'50100000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),1,1,p_account,'cloud',p_action,
 jsonb_build_object('connectionId',p_snapshot_connection,'content',jsonb_build_object('description',p_description),'images',jsonb_build_array(jsonb_build_object('storagePath','private/original-upload.jpg'))),p_state,p_external,p_provider,p_verified,case when p_started then clock_timestamp()-interval '2 minutes' else null end) returning id into v_job;
 return v_job;
end;
$$;
create function pg_temp.published_source(p_external text default '90001') returns jsonb language sql as $$
 select public.kleinanzeigen_read_transfer_source('50100000-0000-4000-8000-000000000011',(select id from public.kleinanzeigen_connections where external_account_id='88'),'50100000-0000-4000-8000-000000000021',p_external);
$$;
select pg_temp.published_job('90001');
set local role authenticated;
select is(pg_temp.published_source()->'source'->>'description','Gespeicherter Veröffentlichungstext','Bestätigter Auftrag liefert vorhandene Beschreibung ohne erneuten Anbieterabruf');
select is(pg_temp.published_source()->'source'->>'title','Aktueller Listentitel','Historischer Auftrag überschreibt keinen neuen Listentitel');
select is(pg_temp.published_source()->'source'->>'priceCents','1500','Historischer Auftrag überschreibt keinen neuen Listenpreis');
select is(pg_temp.published_source()->'source'->'photoReferences','["https://images1.vinted.net/published.jpg"]'::jsonb,'Originale Uploadpfade ersetzen keine Anbieter-Bildquellen');
create function pg_temp.published_reference() returns jsonb language sql as $$
 select jsonb_build_object('platform','vinted','workspaceId',s->'workspaceId','connectionId',s->'connectionId','entryId',s->'entryId','externalId',s->'externalId','fingerprint',s->'fingerprint') from pg_temp.published_source() s;
$$;
select lives_ok($$select public.kleinanzeigen_create_transfer_draft('50100000-0000-4000-8000-000000000011',(select id from public.kleinanzeigen_connections where external_account_id='88'),pg_temp.published_reference(),'{"title":"Jacke","description":"Gespeicherter Veröffentlichungstext","priceCents":1500,"currency":"EUR","priceType":"FIXED","shippingType":"pickup","postalCode":null,"categoryId":null,"categoryFields":{},"schemaRevision":null}','50100000-0000-4000-8000-000000000042')$$,'Auftragsbeschreibung und kanonischer Fingerprint werden beim Entwurf identisch geprüft');
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'item-media','listings/50100000-0000-4000-8000-000000000011/'||id::text||'/0.jpg','{"mimetype":"image/jpeg","size":1024}'::jsonb from public.listings where transfer_request_id='50100000-0000-4000-8000-000000000042';
create function pg_temp.complete_published_images() returns jsonb language sql security definer as $$ select public.kleinanzeigen_complete_transfer_images('50100000-0000-4000-8000-000000000011',id,revision,'50100000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('storagePath','listings/50100000-0000-4000-8000-000000000011/'||id::text||'/0.jpg','fileName','Vinted-1.jpg','sortOrder',0))) from public.listings where transfer_request_id='50100000-0000-4000-8000-000000000042'; $$;
set local role service_role;
select lives_ok($$select pg_temp.complete_published_images()$$,'Bildabschluss benutzt dieselbe kanonische Auftragsbeschreibung und denselben Fingerprint');
reset role;
select ok((select transfer_images_complete from public.listings where transfer_request_id='50100000-0000-4000-8000-000000000042'),'Bildabschluss hat tatsächlich das gespeicherte Transferinserat vervollständigt');
select pg_temp.published_job('90002',p_account=>'98');
select pg_temp.published_job('90003',p_state=>'failed');
select pg_temp.published_job('90004',p_action=>'vinted_draft',p_provider=>'draft');
select pg_temp.published_job('90005',p_provider=>'processing');
select pg_temp.published_job('90006',p_snapshot_connection=>'50100000-0000-4000-8000-000000000022');
select pg_temp.published_job('90007',p_started=>false);
select pg_temp.published_job('90008',p_description=>null);
select pg_temp.published_job('90009',p_account=>'98',p_connection=>'50100000-0000-4000-8000-000000000022',p_snapshot_connection=>'50100000-0000-4000-8000-000000000022');
insert into public.workspaces(id,name) values('50100000-0000-4000-8000-000000000012','Fremder Quellenworkspace');
insert into public.marketplace_connections(id,workspace_id,display_name,external_account_id,status) values('50100000-0000-4000-8000-000000000023','50100000-0000-4000-8000-000000000012','Fremdes Vinted','97','connected');
select pg_temp.published_job('90010',p_account=>'97',p_workspace=>'50100000-0000-4000-8000-000000000012',p_connection=>'50100000-0000-4000-8000-000000000023',p_snapshot_connection=>'50100000-0000-4000-8000-000000000023');
select pg_temp.published_job('90012');
update public.marketplace_listing_jobs set connection_id=null where external_id='90012';
select pg_temp.published_job('90013',p_state=>'outcome_unknown');
select pg_temp.published_job('90014',p_verified=>'infinity');
set local role authenticated;
select is(pg_temp.published_source(id::text)->'source'->>'description','',reason) from (values
 (90002,'Fremde Kontoidentität bleibt ausgeschlossen'),(90003,'Fehlgeschlagener Auftrag liefert keinen Quelltext'),
 (90004,'Vinted-Entwurf gilt nicht als bestätigte Veröffentlichung'),(90005,'Noch verarbeiteter Auftrag gilt nicht als aktiv bestätigt'),
 (90006,'Abweichende Snapshotverbindung bleibt ausgeschlossen'),(90007,'Nicht begonnener Auftrag gilt nicht als veröffentlicht'),
 (90008,'Fehlender Auftragstext wird nicht erfunden'),(90009,'Andere Verbindung mit gleicher Inseratkennung bleibt ausgeschlossen'),(90010,'Anderer Workspace mit gleicher Inseratkennung bleibt ausgeschlossen'),(90012,'Verwaister Auftrag ohne Verbindung bleibt ausgeschlossen'),(90013,'Unklarer Veröffentlichungsausgang liefert keinen Quelltext'),(90014,'Unendliche Bestätigungszeit ist kein Veröffentlichungsnachweis')) cases(id,reason);
reset role;
update public.marketplace_account_entries set body=body||'{"text":"Neuer bestätigter Text","textState":"loaded"}'::jsonb where external_id='90001';
set local role authenticated;
select is(pg_temp.published_source()->'source'->>'description','Neuer bestätigter Text','Geladener neuerer Text hat Vorrang vor Veröffentlichungssnapshot');
reset role;
update public.marketplace_account_entries set body=body||'{"text":"","textState":"loaded"}'::jsonb where external_id='90001';
set local role authenticated;
select is(pg_temp.published_source()->'source'->>'description','','Geladener Leertext bleibt trotz Veröffentlichungssnapshot leer');
reset role;
-- Eine vollständige Quelle überlebt reine Listen-Upserts; bewusst neue Angaben bleiben gültig.
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body)
values('50100000-0000-4000-8000-000000000011','50100000-0000-4000-8000-000000000021','publication','91001',
 jsonb_build_object('transferSource',jsonb_build_object('externalAccountId','99','externalId','91001','title','Alter Titel','description','Gesicherter Volltext','priceCents',1200,'currency','EUR','photoReferences',jsonb_build_array('https://images1.vinted.net/full.jpg'),'attributeHints','{}'::jsonb)));
update public.marketplace_account_entries set body='{"title":"Neuer Titel","price":17,"text":null,"textState":"not_loaded"}'::jsonb where external_id='91001';
select is((select body->'transferSource'->>'description' from public.marketplace_account_entries where external_id='91001'),'Gesicherter Volltext','Erneuter Listenimport erhält bereits gespeicherte vollständige Quelle');
select is((select body->>'title' from public.marketplace_account_entries where external_id='91001'),'Neuer Titel','Quellenerhalt überschreibt keine neue Listenüberschrift');
select is((select body->>'price' from public.marketplace_account_entries where external_id='91001'),'17','Quellenerhalt überschreibt keinen neuen Listenpreis');
update public.marketplace_account_entries set body=body||'{"transferSource":null}'::jsonb where external_id='91001';
select is((select body->'transferSource' from public.marketplace_account_entries where external_id='91001'),'null'::jsonb,'Bewusst gesetzte leere neue Quelle wird nicht ersetzt');


-- Auch vorhandene neue Objekte, unvollständige und fremd gebundene Altquellen bleiben unverändert.
update public.marketplace_account_entries set body=jsonb_build_object('transferSource',jsonb_build_object('externalAccountId','99','externalId','91001','title','Titel','description','Älterer Volltext','priceCents',1200,'currency','EUR','photoReferences','[]'::jsonb,'attributeHints','{}'::jsonb)) where external_id='91001';
update public.marketplace_account_entries set body='{"title":"Neu","transferSource":{"description":"Bewusst neue Quelle"}}'::jsonb where external_id='91001';
select is((select body->'transferSource'->>'description' from public.marketplace_account_entries where external_id='91001'),'Bewusst neue Quelle','Bewusst gesetzte neue Quelle hat Vorrang vor alter Quelle');
update public.marketplace_account_entries set body='{"title":"Nur Liste"}'::jsonb where external_id='91001';
select ok(not (select body ? 'transferSource' from public.marketplace_account_entries where external_id='91001'),'Unvollständiger Altbeleg wird nicht als vollständige Quelle konserviert');
create function pg_temp.reset_preserved_source() returns void language sql as $$
 update public.marketplace_account_entries set body=jsonb_build_object('transferSource',jsonb_build_object('externalAccountId','99','externalId','91001','title','Titel','description','Gebundener Text','priceCents',1200,'currency','EUR','photoReferences','[]'::jsonb,'attributeHints','{}'::jsonb)) where external_id='91001';
$$;
select pg_temp.reset_preserved_source();
update public.marketplace_account_entries set body='{}'::jsonb,external_id='91002' where external_id='91001';
select ok(not (select body ? 'transferSource' from public.marketplace_account_entries where external_id='91002'),'Geänderte Inseratkennung übernimmt keine alte Quelle');
update public.marketplace_account_entries set external_id='91001' where external_id='91002';
select pg_temp.reset_preserved_source();
update public.marketplace_account_entries set body='{}'::jsonb,connection_id='50100000-0000-4000-8000-000000000022' where external_id='91001';
select ok(not (select body ? 'transferSource' from public.marketplace_account_entries where external_id='91001'),'Geänderte Verbindung übernimmt keine alte Quelle');
update public.marketplace_account_entries set connection_id='50100000-0000-4000-8000-000000000021' where external_id='91001';
select pg_temp.reset_preserved_source();
update public.marketplace_account_entries set body='{}'::jsonb,kind='sale' where external_id='91001';
select ok(not (select body ? 'transferSource' from public.marketplace_account_entries where external_id='91001'),'Geänderte Eintragsart übernimmt keine Inseratquelle');
update public.marketplace_account_entries set kind='publication' where external_id='91001';
select pg_temp.reset_preserved_source();
update public.marketplace_account_entries set body='{}'::jsonb,workspace_id='50100000-0000-4000-8000-000000000012',connection_id='50100000-0000-4000-8000-000000000023' where external_id='91001';
select ok(not (select body ? 'transferSource' from public.marketplace_account_entries where external_id='91001'),'Geänderter Workspace übernimmt keine alte Inseratquelle');
update public.marketplace_account_entries set workspace_id='50100000-0000-4000-8000-000000000011',connection_id='50100000-0000-4000-8000-000000000021' where external_id='91001';
select pg_temp.reset_preserved_source();
update public.marketplace_connections set external_account_id='999' where id='50100000-0000-4000-8000-000000000021';
update public.marketplace_account_entries set body='{}'::jsonb where external_id='91001';
select ok(not (select body ? 'transferSource' from public.marketplace_account_entries where external_id='91001'),'Neu gebundenes externes Konto konserviert keine Quelle des früheren Kontos');
update public.marketplace_connections set external_account_id='99' where id='50100000-0000-4000-8000-000000000021';
select pg_temp.published_job('90011');
update public.marketplace_connections set external_account_id='999' where id='50100000-0000-4000-8000-000000000021';
set local role authenticated;
select is(pg_temp.published_source('90011')->'source'->>'description','','Neu gebundene Kontoidentität liest keine früher bestätigte Beschreibung');
reset role;
update public.marketplace_connections set external_account_id='99' where id='50100000-0000-4000-8000-000000000021';
select ok(not has_function_privilege('anon','public.kleinanzeigen_saved_publication_source(uuid,uuid,text)','execute'),'Kanonischer Veröffentlichungstext ist nicht anonym direkt lesbar');
select ok(not has_function_privilege('authenticated','public.kleinanzeigen_saved_publication_source(uuid,uuid,text)','execute'),'Veröffentlichungstext bleibt hinter den bestehenden kontrollierten Transferfunktionen');
select ok(has_function_privilege('service_role','public.kleinanzeigen_saved_publication_source(uuid,uuid,text)','execute'),'Nur Server darf kanonische gespeicherte Veröffentlichung direkt lesen');

select * from finish();rollback;
