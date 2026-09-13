\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('d1400000-0000-4000-8000-000000000001','authenticated','authenticated','package@example.test','{}','{}');
insert into public.workspaces(id,name,tax_mode) values
('d1400000-0000-4000-8000-000000000011','Paketerfassung','diff_25a'),
('d1400000-0000-4000-8000-000000000012','Fremder Workspace','diff_25a');
insert into public.workspace_members(workspace_id,user_id,role)
values ('d1400000-0000-4000-8000-000000000011','d1400000-0000-4000-8000-000000000001','owner');
select set_config('request.jwt.claim.sub','d1400000-0000-4000-8000-000000000001',true);
create temporary table package_results(name text primary key,id uuid,snapshot jsonb);
grant all on package_results to authenticated;

create function pg_temp.package_line(p_name text,p_extra jsonb default '{}') returns jsonb
language sql as $$
  select jsonb_build_object('title_snapshot',p_name,'line_kind','individual','ordered_quantity',1,
    'is_package',true,'unit_purchase_price',100,'line_total',100) || p_extra;
$$;
create function pg_temp.package_purchase(p_name text,p_lines jsonb default null) returns uuid
language plpgsql as $$
declare v_result jsonb; v_id uuid;
begin
  v_result := public.create_purchase('d1400000-0000-4000-8000-000000000011',
    jsonb_build_object('type','single','title',p_name,'purchase_date','2026-09-13','pricing_mode','individual'),
    '[]',coalesce(p_lines,jsonb_build_array(pg_temp.package_line(p_name))));
  v_id := (v_result #>> '{purchase,id}')::uuid;
  insert into package_results values (p_name,v_id,v_result);
  return v_id;
end;
$$;
create function pg_temp.package_line_id(p_name text) returns uuid language sql as $$
  select id from public.purchase_lines where purchase_id=(select id from package_results where name=p_name)
    and is_package order by created_at,id limit 1;
$$;
create function pg_temp.package_arrive(p_name text) returns void language plpgsql as $$
declare v_id uuid := (select id from package_results where name=p_name);
begin
  perform public.update_purchase_workflow(v_id,'ordered');
  perform public.update_purchase_workflow(v_id,'arrived');
end;
$$;
create function pg_temp.package_capture(p_name text,p_items jsonb,p_request uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.capture_purchase_package_contents('d1400000-0000-4000-8000-000000000011',
    pg_temp.package_line_id(p_name),p_items,p_request);
$$;
create function pg_temp.package_finalize(p_name text) returns jsonb language sql as $$
  select public.finalize_purchase_costing('d1400000-0000-4000-8000-000000000011',
    (select id from package_results where name=p_name));
$$;
create function pg_temp.package_correct(p_name text,p_price numeric,p_flag jsonb default '{}') returns jsonb
language sql as $$
  select public.correct_purchase_costing('d1400000-0000-4000-8000-000000000011',
    (select id from package_results where name=p_name),'Rechnung überprüft',null,
    (select jsonb_agg(jsonb_build_object('id',id,'catalog_product_id',catalog_product_id,
      'title_snapshot',title_snapshot,'line_kind',line_kind,'ordered_quantity',ordered_quantity,
      'price_mode',price_mode,'unit_purchase_price',p_price,'line_total',p_price * ordered_quantity,
      'condition_snapshot',condition_snapshot,'estimated_market_value',estimated_market_value) || p_flag)
    from public.purchase_lines where purchase_id=(select id from package_results where name=p_name)),'[]');
$$;

set local role authenticated;
select pg_temp.package_purchase('Hundert Euro');
select is((select is_package from purchase_lines where id=pg_temp.package_line_id('Hundert Euro')),true,'Neuanlage erhält das Paketkennzeichen');
select throws_ok($$select pg_temp.package_capture('Hundert Euro','[{"title":"Schuhe","condition":"used"}]')$$,
  '22023','Vor der Paketerfassung muss die Ankunft bestätigt sein.','Erfassung vor Ankunft ist gesperrt');
select throws_ok($$select public.receive_individual_purchase_line('d1400000-0000-4000-8000-000000000011',
  (select id from package_results where name='Hundert Euro'),pg_temp.package_line_id('Hundert Euro'),'{"title":"Paket"}')$$,
  '22023','Die Einzelartikelposition ist nicht offen.','Normaler Einzelwareneingang erzeugt keinen Paketartikel');
select throws_ok($$select public.receive_purchase_lines('d1400000-0000-4000-8000-000000000011',
  (select id from package_results where name='Hundert Euro'),jsonb_build_array(jsonb_build_object(
  'purchase_line_id',pg_temp.package_line_id('Hundert Euro'),'received_quantity',1)))$$,
  '22023',null,'Mengenwareneingang lehnt Paketpositionen ab');
select pg_temp.package_arrive('Hundert Euro');
insert into package_results(name,snapshot) values ('Erfassung',pg_temp.package_capture('Hundert Euro',
  '[{"title":"Schuhpaar A","condition":"used","brand":"Marke","description":"Ein Paar"},{"title":"Schuhpaar B","condition":"new","expected_value":80}]',
  'd1400000-0000-4000-8000-000000000021'));
select is((select count(*) from inventory_items where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),2::bigint,'Zwei Paare ergeben genau zwei Artikel');
select ok((select bool_and(purchase_line_id is null and allocated_purchase_cost is null and tax_purchase_cost is null
  and purchase_id=(select id from package_results where name='Hundert Euro')) from inventory_items
  where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),'Herkunft bleibt getrennt, beide Kosten bleiben unbekannt');
select is((select line_total from purchase_lines where id=pg_temp.package_line_id('Hundert Euro')),100::numeric,'Rechnungspreis bleibt 100 Euro');
reset role;
select is((select count(*) from business_events where event_type='purchase_package_contents_captured'),1::bigint,'Erfassung erzeugt ein Fachereignis');
set local role authenticated;
select is(pg_temp.package_capture('Hundert Euro',
  '[{"title":"Schuhpaar A","condition":"used","brand":"Marke","description":"Ein Paar"},{"title":"Schuhpaar B","condition":"new","expected_value":80}]',
  'd1400000-0000-4000-8000-000000000021'),(select snapshot from package_results where name='Erfassung'),'Identische Wiederholung liefert denselben Snapshot');
select is((select count(*) from inventory_items where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),2::bigint,'Wiederholung erzeugt keine Duplikate');
select throws_ok($$select pg_temp.package_capture('Hundert Euro','[{"title":"Anderer Inhalt","condition":"used"}]',
  'd1400000-0000-4000-8000-000000000021')$$,'22023','Die Request-ID wurde bereits für eine andere Paketerfassung verwendet.','Request-ID darf nicht umgedeutet werden');
select throws_ok($$select pg_temp.package_capture('Hundert Euro','[{"title":"Gültig","condition":"used"},{"title":"","condition":"new"}]')$$,
  '22023','Die Artikeldaten des Paketinhalts sind ungültig.','Fehler in späterem Inhalt bricht die gesamte Erfassung ab');
select is((select count(*) from inventory_items where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),2::bigint,'Fehlgeschlagene Erfassung bleibt atomar');
select throws_ok($$select pg_temp.package_capture('Hundert Euro','[{"title":"Preis","condition":"used","allocated_purchase_cost":0}]')$$,
  '22023','Die Artikeldaten des Paketinhalts sind ungültig.','Payload darf keinen Rechnungspreis erfinden');
select throws_ok($$select pg_temp.package_capture('Hundert Euro','[{"title":"Wert","condition":"used","expected_value":-1}]')$$,
  '22023','Der erwartete Verkaufswert muss nichtnegativ und centgenau sein.','Negative Schätzwerte sind ungültig');
select throws_ok($$select pg_temp.package_capture('Hundert Euro','[]')$$,'22023','Bitte zwischen einem und 100 Artikeln erfassen.','Leere Erfassung bleibt gesperrt');
select ok((select bool_and(not is_public_store) from inventory_items
  where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),'Neue Paketinhalte werden nicht automatisch veröffentlicht');
select lives_ok($$select pg_temp.package_finalize('Hundert Euro')$$,'Abschluss mit separat erfasstem Inhalt gelingt');
select is((select purchase_price from purchases where id=(select id from package_results where name='Hundert Euro')),100::numeric,'Abschluss bewahrt Warenbetrag');
select is((select allocated_total_cost from purchase_lines where id=pg_temp.package_line_id('Hundert Euro')),100::numeric,'Kosten bleiben einmalig an der Paketposition');
select is((select count(*) from inventory_items where purchase_line_id=pg_temp.package_line_id('Hundert Euro')),0::bigint,'Kein Paketplatzhalter im Inventar');
select is((select count(*) from stock_lots where purchase_line_id=pg_temp.package_line_id('Hundert Euro')),0::bigint,'Kein Paketplatzhalter im Mengenbestand');
select ok((select bool_and(allocated_purchase_cost is null and status='ready') from inventory_items
  where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),'Abschluss macht Inhalte verkaufbar ohne Bewertung');
select lives_ok($$update inventory_items set title='Schuhpaar A bearbeitet',brand='Andere Marke',description='Details'
  where id=(select (snapshot #>> '{inventory_items,0,id}')::uuid from package_results where name='Erfassung')$$,'Vorhandener Artikeleditor darf Paketinhalt bearbeiten');
select throws_ok($$update inventory_items set source_package_line_id=null where source_package_line_id=pg_temp.package_line_id('Hundert Euro')$$,
  '42501','Die Paketherkunft eines Artikels ist unveränderlich.','Herkunft darf nicht entfernt werden');
select throws_ok($$update inventory_items set purchase_id=null where source_package_line_id=pg_temp.package_line_id('Hundert Euro')$$,
  '42501','Die Paketherkunft eines Artikels ist unveränderlich.','Einkaufsverweis darf nicht entfernt werden');
select throws_ok($$update inventory_items set allocated_purchase_cost=0 where source_package_line_id=pg_temp.package_line_id('Hundert Euro')$$,
  '23514',null,'Unbekannte Kosten dürfen nicht zu null Euro werden');
select throws_ok($$delete from inventory_items where source_package_line_id=pg_temp.package_line_id('Hundert Euro')$$,
  '42501',null,'Erfasste Inhalte dürfen nicht gelöscht werden');
select lives_ok($$select pg_temp.package_capture('Hundert Euro','[{"title":"Nachtrag","condition":"very_good"}]')$$,'Weiterer Erfassungsschritt nach Abschluss gelingt');
select is((select count(*) from inventory_items where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),3::bigint,'Zusätzlicher Inhalt wird einzeln ergänzt');
select lives_ok($$select public.reopen_purchase_costing('d1400000-0000-4000-8000-000000000011',
  (select id from package_results where name='Hundert Euro'))$$,'Wiederöffnung vor einem Verkauf gelingt');
select ok((select bool_and(allocated_purchase_cost is null and status='received') from inventory_items
  where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),'Wiederöffnung bewahrt unbekannte Kosten und Herkunft');
select throws_ok($$update inventory_items set status='ready' where source_package_line_id=pg_temp.package_line_id('Hundert Euro')$$,
  '42501','Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.','Wiederöffnung sperrt Verkaufsvorbereitung');
select lives_ok($$select pg_temp.package_finalize('Hundert Euro')$$,'Erneuter Abschluss erzeugt keine Duplikate');
select is((select count(*) from inventory_items where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),3::bigint,'Drei Inhalte bleiben nach erneutem Abschluss drei Inhalte');

insert into package_results(name,id,snapshot)
select 'Verkauf',(result #>> '{sale,id}')::uuid,result from (select public.record_sale(
  'd1400000-0000-4000-8000-000000000011','{"platform":"test","sale_date":"2026-09-13"}',
  jsonb_build_array(jsonb_build_object('inventory_item_id',(select snapshot #>> '{inventory_items,0,id}' from package_results where name='Erfassung'),
    'quantity',1,'unit_sale_price',70))) as result) as sale;
select is((select sale_price_total from sales where id=(select id from package_results where name='Verkauf')),70::numeric,'Verkauf bucht den tatsächlichen Erlös');
select ok((select cost_of_goods_sold is null and tax_purchase_cost is null and tax_cost_allocations is null
  from sale_lines where sale_id=(select id from package_results where name='Verkauf')),'Verkaufssnapshot lässt Betriebs- und Steuerkosten offen');
select throws_ok($$select public.reopen_purchase_costing('d1400000-0000-4000-8000-000000000011',
  (select id from package_results where name='Hundert Euro'))$$,'22023','Ein Einkauf mit Verkäufen kann nicht wieder geöffnet werden.','Verkaufsverlauf der Paketinhalte verhindert Wiederöffnung');
select lives_ok($$select pg_temp.package_correct('Hundert Euro',100,'{"is_package":true}')$$,'Kostenkorrektur erkennt Paketkennzeichen');
select lives_ok($$select pg_temp.package_correct('Hundert Euro',110)$$,'Älterer Korrekturaufruf bewahrt Paketkennzeichen');
select is((select line_total from purchase_lines where id=pg_temp.package_line_id('Hundert Euro')),110::numeric,'Explizite Rechnungskorrektur ändert nur den Paketbetrag');
select ok((select bool_and(allocated_purchase_cost is null and tax_purchase_cost is null) from inventory_items
  where source_package_line_id=pg_temp.package_line_id('Hundert Euro')),'Korrektur verteilt Paketbetrag nicht auf Kinder');
select is((select cost_of_goods_sold from sale_lines where sale_id=(select id from package_results where name='Verkauf')),null::numeric,'Korrektur erfindet keinen Wareneinsatz im Verkauf');
select throws_ok($$select pg_temp.package_correct('Hundert Euro',110,'{"is_package":false}')$$,
  '42501','Die Herkunft bereits erfasster Artikel darf nicht geändert werden.','Korrektur darf Paket nicht in Einzelposition umwandeln');
select lives_ok($$select public.record_sale_return('d1400000-0000-4000-8000-000000000011',
  (select id from package_results where name='Verkauf'),70,true,'Rückgabe',null,'restock_ready',null)$$,'Retoure des Paketinhalts gelingt');
select ok((select source_package_line_id=pg_temp.package_line_id('Hundert Euro') and allocated_purchase_cost is null and status='ready'
  from inventory_items where id=(select (snapshot #>> '{inventory_items,0,id}')::uuid from package_results where name='Erfassung')),'Retoure bewahrt Herkunft und unbekannte Kosten');

select pg_temp.package_purchase('Leeres Paket');
select pg_temp.package_arrive('Leeres Paket');
select lives_ok($$select pg_temp.package_finalize('Leeres Paket')$$,'Abschluss vor erster Inhaltserfassung gelingt');
select is((select count(*) from inventory_items where purchase_id=(select id from package_results where name='Leeres Paket')),0::bigint,'Ungeöffnetes Paket erzeugt keinen verkäuflichen Bestand');
select lives_ok($$select pg_temp.package_capture('Leeres Paket','[{"title":"Später ausgepackt","condition":"new"}]')$$,'Erste Erfassung nach Abschluss gelingt');
select throws_ok($$select pg_temp.package_capture('Leeres Paket','[{"title":"Schuhpaar A","condition":"used"}]',
  'd1400000-0000-4000-8000-000000000021')$$,'22023','Die Request-ID wurde bereits für eine andere Paketerfassung verwendet.','Request-ID ist auch über Paketgrenzen eindeutig');

select pg_temp.package_purchase('Gemischt',jsonb_build_array(pg_temp.package_line('Paket'),pg_temp.package_line('Bekannter Artikel',
  '{"is_package":false,"unit_purchase_price":20,"line_total":20}')));
select pg_temp.package_arrive('Gemischt');
select pg_temp.package_capture('Gemischt','[{"title":"Erster Inhalt","condition":"used"}]');
select lives_ok($$select pg_temp.package_capture('Gemischt','[{"title":"Zweiter Inhalt","condition":"used"}]')$$,'Mehrere Erfassungen im angekommenen gemischten Einkauf gelingen');
select lives_ok($$select pg_temp.package_finalize('Gemischt')$$,'Gemischter Einkauf wird korrekt abgeschlossen');
select is((select purchase_price from purchases where id=(select id from package_results where name='Gemischt')),120::numeric,'Gemischter Rechnungsgesamtbetrag bleibt korrekt');
select is((select allocated_purchase_cost from inventory_items where purchase_id=(select id from package_results where name='Gemischt')
  and source_package_line_id is null),20::numeric,'Bekannte normale Einzelkosten bleiben erhalten');

select throws_ok($$select pg_temp.package_purchase('Ungültige Menge',jsonb_build_array(pg_temp.package_line('Paket',
  '{"ordered_quantity":2,"line_total":200}')))$$,'23514',null,'Paketmenge muss eins sein');
select throws_ok($$select pg_temp.package_purchase('Ungültiges Kennzeichen',jsonb_build_array(pg_temp.package_line('Paket',
  '{"is_package":"true"}')))$$,'22023','Das Paketkennzeichen muss ein Wahrheitswert sein.','Paketkennzeichen akzeptiert keine Zeichenkette');
select throws_ok($$select public.capture_purchase_package_contents('d1400000-0000-4000-8000-000000000012',
  pg_temp.package_line_id('Hundert Euro'),'[{"title":"Fremd","condition":"used"}]',gen_random_uuid())$$,
  '42501','Kein Zugriff auf diesen Workspace.','Fremder Workspace ist gesperrt');
select throws_ok($$insert into purchase_package_capture_requests(workspace_id,purchase_line_id,request_id,request_items,response)
  values ('d1400000-0000-4000-8000-000000000011',pg_temp.package_line_id('Hundert Euro'),gen_random_uuid(),'[]','{}')$$,
  '42501',null,'Anfragejournal ist für direkte Schreibzugriffe gesperrt');

-- Alle schreibenden Positions-RPCs verwenden denselben Paketvertrag.
select pg_temp.package_purchase('Entwurf');
select lives_ok($$select public.add_purchase_lines('d1400000-0000-4000-8000-000000000011',
  (select id from package_results where name='Entwurf'),jsonb_build_array(pg_temp.package_line('Zusatzpaket')))$$,'Ergänzungs-RPC erhält das Paketkennzeichen');
select is((select count(*) from purchase_lines where purchase_id=(select id from package_results where name='Entwurf') and is_package),2::bigint,'Beide Entwurfspositionen bleiben Pakete');
select lives_ok($$select public.update_purchase_draft('d1400000-0000-4000-8000-000000000011',
  (select id from package_results where name='Entwurf'),'{"type":"single","title":"Bearbeitet","purchase_date":"2026-09-13","pricing_mode":"individual"}',
  '[]',(select jsonb_agg(pg_temp.package_line(title_snapshot,jsonb_build_object('client_ref',id))) from purchase_lines
    where purchase_id=(select id from package_results where name='Entwurf')))$$,'Entwurfsbearbeitung erhält Pakete');
select throws_ok($$select public.update_purchase_draft('d1400000-0000-4000-8000-000000000011',
  (select id from package_results where name='Entwurf'),'{"type":"single","title":"Bearbeitet","purchase_date":"2026-09-13","pricing_mode":"individual"}',
  '[]',(select jsonb_agg(pg_temp.package_line(title_snapshot,jsonb_build_object('client_ref',id,'is_package','true'))) from purchase_lines
    where purchase_id=(select id from package_results where name='Entwurf')))$$,
  '22023','Das Paketkennzeichen muss ein Wahrheitswert sein.','Entwurfs-RPC prüft den JSON-Typ des Paketkennzeichens');
select throws_ok($$select public.add_purchase_lines('d1400000-0000-4000-8000-000000000011',
  (select id from package_results where name='Entwurf'),jsonb_build_array(pg_temp.package_line('Fehler','{"is_package":"true"}')))$$,
  '22023','Das Paketkennzeichen muss ein Wahrheitswert sein.','Ergänzungs-RPC prüft den JSON-Typ des Paketkennzeichens');
select throws_ok($$select pg_temp.package_correct('Hundert Euro',110,'{"is_package":"true"}')$$,
  '22023','Das Paketkennzeichen muss ein Wahrheitswert sein.','Korrektur-RPC prüft den JSON-Typ des Paketkennzeichens');
select throws_ok($$select pg_temp.package_purchase('Unbepreist',jsonb_build_array(pg_temp.package_line('Paket',
  '{"price_mode":"unpriced_mystery","unit_purchase_price":null,"line_total":null}')))$$,'22023',null,'Unbepreiste Pakete werden abgelehnt');
select throws_ok($$select pg_temp.package_purchase('Unendlich',jsonb_build_array(pg_temp.package_line('Paket',
  jsonb_build_object('unit_purchase_price','Infinity','line_total','Infinity'))))$$,'22023',null,'Nichtendliche Rechnungspreise werden abgelehnt');
select throws_ok($$select pg_temp.package_capture('Hundert Euro',jsonb_build_array(jsonb_build_object(
  'title',repeat('x',301),'condition','used')))$$,'22023','Die Artikeldaten des Paketinhalts sind ungültig.','Titel sind auf 300 Zeichen begrenzt');
select throws_ok($$select pg_temp.package_capture('Hundert Euro',jsonb_build_array(jsonb_build_object(
  'title','Artikel','condition','used','description',repeat('x',5001))))$$,'22023','Die Artikeldaten des Paketinhalts sind ungültig.','Beschreibung ist auf 5.000 Zeichen begrenzt');
select throws_ok($$select pg_temp.package_capture('Hundert Euro',(select jsonb_agg(jsonb_build_object(
  'title','Artikel','condition','used')) from generate_series(1,101)))$$,'22023','Bitte zwischen einem und 100 Artikeln erfassen.','Eine Anfrage enthält höchstens 100 Artikel');
select throws_ok($$select public.capture_purchase_package_contents('d1400000-0000-4000-8000-000000000011',
  (select purchase_line_id from inventory_items where purchase_id=(select id from package_results where name='Gemischt') and source_package_line_id is null),
  '[{"title":"Kein Paket","condition":"used"}]',gen_random_uuid())$$,'22023','Die Position ist kein Paket dieses Einkaufs.','Normale Einzelpositionen bleiben normale Einzelpositionen');

-- Erneuter Verkauf nach Retoure erhält dieselbe Herkunft und unbekannte Kostensnapshots.
select lives_ok($$select public.record_sale('d1400000-0000-4000-8000-000000000011','{"platform":"test","sale_date":"2026-09-13"}',
  jsonb_build_array(jsonb_build_object('inventory_item_id',(select snapshot #>> '{inventory_items,0,id}' from package_results where name='Erfassung'),
    'quantity',1,'unit_sale_price',75)))$$,'Erneuter Verkauf nach Retoure gelingt');
select is((select count(*) from sale_lines where inventory_item_id=(select (snapshot #>> '{inventory_items,0,id}')::uuid from package_results where name='Erfassung')
  and cost_of_goods_sold is null and tax_purchase_cost is null),2::bigint,'Beide Verkaufssnapshots bleiben unbewertet');

reset role;
select throws_ok($$update sale_lines set cost_of_goods_sold=0 where sale_id=(select id from package_results where name='Verkauf')$$,
  '22023','Unbekannte Paketkosten dürfen im Verkauf nicht durch einen Betrag ersetzt werden.','Auch privilegierte Korrektur erfindet keinen Nullwert');
select throws_ok($$delete from purchase_lines where id=pg_temp.package_line_id('Hundert Euro')$$,'23503',null,'Fremdschlüssel verhindert Löschen der Paketposition');
select throws_ok($$delete from purchases where id=(select id from package_results where name='Hundert Euro')$$,'23503',null,'Einkauf mit Herkunft kann nicht gelöscht werden');
select throws_ok($$update inventory_items set allocated_purchase_cost=null where purchase_id=(select id from package_results where name='Gemischt')
  and source_package_line_id is null$$,'23514',null,'Normale Artikel behalten bekannte Kosten als Pflicht');
select ok(not has_function_privilege('anon','public.capture_purchase_package_contents(uuid,uuid,jsonb,uuid)','execute'),'Anonyme können keine Inhalte erfassen');
select ok(not has_table_privilege('anon','public.purchase_package_capture_requests','select'),'Anfragejournal ist nicht öffentlich');
select throws_ok($$update inventory_items set source_package_line_id=null where source_package_line_id=pg_temp.package_line_id('Hundert Euro')$$,
  '42501','Die Paketherkunft eines Artikels ist unveränderlich.','Auch privilegierte Änderungen dürfen Herkunft nicht entfernen');
select throws_ok($$update purchase_package_capture_requests set response='{}'$$,'P0001','Fachliche Ereignisse sind unveränderbar.','Das Anfragejournal ist unveränderlich');
select throws_ok($$insert into inventory_items(workspace_id,purchase_id,purchase_line_id,title)
  values ('d1400000-0000-4000-8000-000000000011',(select id from package_results where name='Entwurf'),pg_temp.package_line_id('Entwurf'),'Platzhalter')$$,
  '22023','Paketpositionen erzeugen keinen eigenen Bestandsartikel.','Auch privilegierte Inserts können keinen Paketplatzhalter erzeugen');
insert into public.catalog_products(id,workspace_id,title) values ('d1400000-0000-4000-8000-000000000061',
  'd1400000-0000-4000-8000-000000000011','Katalogprodukt');
select throws_ok($$insert into stock_lots(workspace_id,purchase_id,purchase_line_id,catalog_product_id,received_quantity,remaining_quantity)
  values ('d1400000-0000-4000-8000-000000000011',(select id from package_results where name='Entwurf'),pg_temp.package_line_id('Entwurf'),
    'd1400000-0000-4000-8000-000000000061',1,1)$$,'22023','Paketpositionen erzeugen keinen eigenen Mengenbestand.','Paketpositionen dürfen keine Mengenlose erhalten');
select throws_ok($$update purchase_lines set catalog_product_id='d1400000-0000-4000-8000-000000000061'
  where id=pg_temp.package_line_id('Entwurf')$$,'23514',null,'Paketpositionen dürfen keine Katalogreferenz erhalten');
select throws_ok($$insert into inventory_items(workspace_id,purchase_id,source_package_line_id,title,allocated_purchase_cost)
  values ('d1400000-0000-4000-8000-000000000012',(select id from package_results where name='Hundert Euro'),pg_temp.package_line_id('Hundert Euro'),'Fremd',null)$$,
  '22023','Die Paketposition gehört nicht zu diesem Einkauf.','Paketinhalt kann keinen fremden Workspace referenzieren');
select is((select count(*) from pg_constraint where conrelid='public.inventory_items'::regclass
  and confrelid='public.purchase_lines'::regclass and conname in ('inventory_items_purchase_line_id_fkey','inventory_items_package_origin_fkey')),
  2::bigint,'Normale und Paketherkunft besitzen getrennte benannte Beziehungen für Leseabfragen');
select ok(exists(select 1 from pg_constraint where conname='inventory_items_package_origin_fkey' and array_length(conkey,1)=2),
  'Paketherkunft besitzt einen zusammengesetzten Workspace-Fremdschlüssel');
select is((select changes #> '{financials,after,cost_of_goods_sold}'
  from business_events where entity_id=(select id from package_results where name='Verkauf') and event_type='sale_recorded'),
  'null'::jsonb,'Verkaufsjournal meldet unbekannte Gesamtkosten ausdrücklich');
update workspaces set archived_at=clock_timestamp()
  where id='d1400000-0000-4000-8000-000000000011';
set local role authenticated;
select throws_ok($$select pg_temp.package_capture('Hundert Euro','[{"title":"Archiviert","condition":"used"}]')$$,
  '55000','Der Workspace ist archiviert.','Archivierte Workspaces erlauben keine neuen Paketinhalte');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.capture_purchase_package_contents('d1400000-0000-4000-8000-000000000011',gen_random_uuid(),
  '[{"title":"Ohne Login","condition":"used"}]',gen_random_uuid())$$,'42501','Kein Zugriff auf diesen Workspace.','Erfassung erfordert eine angemeldete Person');
select * from finish();
rollback;
