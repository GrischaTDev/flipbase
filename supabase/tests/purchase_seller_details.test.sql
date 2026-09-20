\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

-- Eigener Workspace mit Quelle und gespeichertem Verkäufer, fremder Workspace mit
-- eigener Person und Quelle.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('e1600000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'seller-owner@example.test', '{}', '{}'),
  ('e1600000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'seller-outsider@example.test', '{}', '{}');
insert into public.workspaces (id, name, tax_mode) values
  ('e1600000-0000-4000-8000-000000000011', 'Verkäuferangaben eigener Workspace', 'diff_25a'),
  ('e1600000-0000-4000-8000-000000000012', 'Verkäuferangaben fremder Workspace', 'diff_25a');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('e1600000-0000-4000-8000-000000000011', 'e1600000-0000-4000-8000-000000000001', 'owner'),
  ('e1600000-0000-4000-8000-000000000012', 'e1600000-0000-4000-8000-000000000002', 'owner');
insert into public.sources (id, workspace_id, name) values
  ('e1600000-0000-4000-8000-000000000021', 'e1600000-0000-4000-8000-000000000011', 'Vinted'),
  ('e1600000-0000-4000-8000-000000000022', 'e1600000-0000-4000-8000-000000000012', 'Fremde Quelle');
insert into public.suppliers (id, workspace_id, name, seller_type, street, postal_code, city, country_code) values
  ('e1600000-0000-4000-8000-000000000031', 'e1600000-0000-4000-8000-000000000011', 'Großhandel Nord', 'business', 'Hafenstraße 1', '20457', 'Hamburg', 'DE'),
  ('e1600000-0000-4000-8000-000000000032', 'e1600000-0000-4000-8000-000000000011', 'Lea Mustermann', 'private', 'Musterweg 5', '50667', 'Köln', 'DE');

select hasnt_column('public', 'purchases', 'seller_marketplace_username', 'Plattform-Benutzername ist vollständig entfernt');
select hasnt_column('public', 'purchases', 'external_order_id', 'Plattform-Bestellnummer ist aus Einkäufen entfernt');
select hasnt_column('public', 'purchases', 'original_url', 'Angebotslink ist aus Einkäufen entfernt');

create temporary table seller_test_results (name text primary key, id uuid, snapshot jsonb);
grant all on seller_test_results to authenticated;
grant select on seller_test_results to anon;

create function pg_temp.purchase_payload(p_title text, p_extra jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'type', 'single', 'title', p_title, 'purchase_date', '2026-09-17', 'purchase_price', 10
  ) || p_extra;
$$;

create function pg_temp.single_line()
returns jsonb language sql as $$
  select '[{"client_ref":"jacke","title_snapshot":"Jacke","line_kind":"individual","ordered_quantity":1,"unit_purchase_price":10,"line_total":10}]'::jsonb;
$$;

select set_config('request.jwt.claim.sub', 'e1600000-0000-4000-8000-000000000001', true);
set local role authenticated;

-- 1 + 2: Quelle und Verkäufer werden über Stammdaten gewählt; der Snapshot wird
-- vom Client aus dem ausgewählten Verkäufer übernommen.
insert into seller_test_results (name, id)
select 'one-off', (public.create_purchase(
  'e1600000-0000-4000-8000-000000000011',
  pg_temp.purchase_payload('Vinted-Jacke', '{
    "source_id":"e1600000-0000-4000-8000-000000000021",
    "supplier_id":"e1600000-0000-4000-8000-000000000031",
    "seller_type":"business",
    "seller_name":"Großhandel Nord",
    "seller_street":"Hafenstraße 1",
    "seller_postal_code":"20457",
    "seller_city":"Hamburg",
    "seller_country_code":"DE"
  }'),
  '[]'::jsonb,
  pg_temp.single_line()
) #>> '{purchase,id}')::uuid;

-- 3: Snapshot bewusst aus dem gespeicherten Verkäufer kopiert.
insert into seller_test_results (name, id)
select 'from-supplier', (public.create_purchase(
  'e1600000-0000-4000-8000-000000000011',
  pg_temp.purchase_payload('Palette', '{
    "supplier_id":"e1600000-0000-4000-8000-000000000031",
    "seller_type":"business",
    "seller_name":"Großhandel Nord",
    "seller_street":"Hafenstraße 1",
    "seller_postal_code":"20457",
    "seller_city":"Hamburg",
    "seller_country_code":"DE"
  }'),
  '[]'::jsonb,
  pg_temp.single_line()
) #>> '{purchase,id}')::uuid;
reset role;

select is(
  (select row(supplier_id, source_id, seller_name, seller_type, seller_country_code, seller_details_version)::text
   from public.purchases where id = (select id from seller_test_results where name = 'one-off')),
  row('e1600000-0000-4000-8000-000000000031'::uuid, 'e1600000-0000-4000-8000-000000000021'::uuid, 'Großhandel Nord', 'business', 'DE', 0)::text,
  'Einkauf speichert gewählte Quelle, Verkäufer und dessen Snapshot'
);

select is(
  (select row(supplier_id, seller_type, seller_name, seller_city)::text
   from public.purchases where id = (select id from seller_test_results where name = 'from-supplier')),
  row('e1600000-0000-4000-8000-000000000031'::uuid, 'business', 'Großhandel Nord', 'Hamburg')::text,
  'kopierter Stammdaten-Snapshot wird mit Verweis gespeichert'
);

-- 4: Eine spätere Änderung am Stammdatensatz verändert den alten Einkauf nicht.
update public.suppliers
set name = 'Großhandel Süd', city = 'München'
where id = 'e1600000-0000-4000-8000-000000000031';

select is(
  (select row(seller_name, seller_city)::text
   from public.purchases where id = (select id from seller_test_results where name = 'from-supplier')),
  row('Großhandel Nord', 'Hamburg')::text,
  'Stammdatenänderung überschreibt den Einkaufs-Snapshot nicht'
);

-- Entwurfsspeichern: geänderte Herkunft erhöht die Version, unveränderte nicht.
select set_config('request.jwt.claim.sub', 'e1600000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.update_purchase_draft(
  'e1600000-0000-4000-8000-000000000011',
  (select id from seller_test_results where name = 'one-off'),
  pg_temp.purchase_payload('Vinted-Jacke', '{
    "source_id":"e1600000-0000-4000-8000-000000000021",
    "supplier_id":"e1600000-0000-4000-8000-000000000031",
    "seller_name":"Großhandel Nord",
    "seller_country_code":"DE",
    "seller_type":"private"
  }'),
  '[]'::jsonb,
  pg_temp.single_line()
);
select public.update_purchase_draft(
  'e1600000-0000-4000-8000-000000000011',
  (select id from seller_test_results where name = 'one-off'),
  pg_temp.purchase_payload('Vinted-Jacke', '{
    "source_id":"e1600000-0000-4000-8000-000000000021",
    "supplier_id":"e1600000-0000-4000-8000-000000000031",
    "seller_name":"Großhandel Nord",
    "seller_country_code":"DE",
    "seller_type":"private"
  }'),
  '[]'::jsonb,
  pg_temp.single_line()
);
reset role;

select is(
  (select row(seller_type, seller_details_version)::text
   from public.purchases where id = (select id from seller_test_results where name = 'one-off')),
  row('private', 1)::text,
  'Entwurfsspeichern erhöht die Version nur bei geänderten Herkunftsangaben'
);

-- Abschluss und fachlicher Stand vor dem Nachtrag.
select set_config('request.jwt.claim.sub', 'e1600000-0000-4000-8000-000000000001', true);
select public.finalize_purchase_costing(
  'e1600000-0000-4000-8000-000000000011',
  (select id from seller_test_results where name = 'one-off')
);

create function pg_temp.business_state(p_purchase_id uuid)
returns jsonb language sql as $$
  select jsonb_build_object(
    'purchase', (
      select jsonb_build_object(
        'purchase_price', purchase_price, 'total_purchase_cost', total_purchase_cost,
        'discount_amount', discount_amount, 'entry_status', entry_status,
        'finalized_at', finalized_at, 'finalized_by', finalized_by,
        'receiving_status', receiving_status, 'title', title, 'purchase_date', purchase_date
      ) from public.purchases where id = p_purchase_id
    ),
    'lines', (select coalesce(jsonb_agg(to_jsonb(line) - 'updated_at' order by line.id), '[]') from public.purchase_lines as line where line.purchase_id = p_purchase_id),
    'costs', (select coalesce(jsonb_agg(to_jsonb(cost) order by cost.id), '[]') from public.purchase_costs as cost where cost.purchase_id = p_purchase_id),
    'items', (select coalesce(jsonb_agg(to_jsonb(item) - 'updated_at' order by item.id), '[]') from public.inventory_items as item where item.purchase_id = p_purchase_id),
    'lots', (select coalesce(jsonb_agg(to_jsonb(lot) - 'updated_at' order by lot.id), '[]') from public.stock_lots as lot where lot.purchase_id = p_purchase_id)
  );
$$;

update seller_test_results
set snapshot = pg_temp.business_state(id)
where name = 'one-off';

select is(
  (select entry_status from public.purchases where id = (select id from seller_test_results where name = 'one-off')),
  'finalized',
  'Ausgangslage: der Einkauf ist abgeschlossen'
);

-- 5 + 6: Verkäuferanschrift nach dem Abschluss nachtragen.
select set_config('request.jwt.claim.sub', 'e1600000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into seller_test_results (name, snapshot)
select 'amendment', public.update_purchase_seller_details(
  'e1600000-0000-4000-8000-000000000011',
  (select id from seller_test_results where name = 'one-off'),
  1,
  '{
    "source_id":"e1600000-0000-4000-8000-000000000021",
    "supplier_id":"e1600000-0000-4000-8000-000000000032",
    "seller_type":"private",
    "seller_name":"Lea Mustermann",
    "seller_street":"Musterweg 5",
    "seller_postal_code":"50667",
    "seller_city":"Köln",
    "seller_country_code":"DE"
  }'::jsonb,
  ' Versandanschrift nachgereicht '
);
reset role;

select is(
  (select row(seller_name, seller_street, seller_postal_code, seller_city, seller_details_version)::text
   from public.purchases where id = (select id from seller_test_results where name = 'one-off')),
  row('Lea Mustermann', 'Musterweg 5', '50667', 'Köln', 2)::text,
  'abgeschlossener Einkauf nimmt nachgetragene Verkäuferangaben an'
);

select is(
  pg_temp.business_state((select id from seller_test_results where name = 'one-off')),
  (select snapshot from seller_test_results where name = 'one-off'),
  'Kosten, Positionen, Bestand und Abschlussstatus bleiben beim Nachtrag unverändert'
);

select is(
  (select row(event.event_type, event.reason, event.actor_id)::text
   from public.business_events as event
   where event.id = ((select snapshot from seller_test_results where name = 'amendment') ->> 'eventId')::uuid),
  row('purchase_seller_details_updated', 'Versandanschrift nachgereicht', 'e1600000-0000-4000-8000-000000000001'::uuid)::text,
  'Nachtrag schreibt ein Fachereignis mit Grund und Person'
);

select is(
  (select array(select jsonb_object_keys(event.changes) order by 1)
   from public.business_events as event
   where event.id = ((select snapshot from seller_test_results where name = 'amendment') ->> 'eventId')::uuid),
  array['seller_city', 'seller_name', 'seller_postal_code', 'seller_street', 'supplier_id'],
  'das Ereignis enthält nur die tatsächlich geänderten Felder'
);

-- Ohne Änderung: keine neue Version und kein Ereignis. Die interne Hilfsfunktion
-- ist für Nutzer gesperrt; der unveränderte Stand wird daher vorher gelesen.
insert into seller_test_results (name, snapshot)
select 'current-details', public.purchase_seller_details_snapshot(purchase)
from public.purchases as purchase
where purchase.id = (select id from seller_test_results where name = 'one-off');

select set_config('request.jwt.claim.sub', 'e1600000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into seller_test_results (name, snapshot)
select 'no-change', public.update_purchase_seller_details(
  'e1600000-0000-4000-8000-000000000011',
  (select id from seller_test_results where name = 'one-off'),
  2,
  (select snapshot from seller_test_results where name = 'current-details'),
  null
);
reset role;

select is(
  row(
    (select snapshot ->> 'eventId' from seller_test_results where name = 'no-change'),
    (select seller_details_version from public.purchases where id = (select id from seller_test_results where name = 'one-off'))
  )::text,
  row(null::text, 2)::text,
  'ein unveränderter Nachtrag erzeugt weder Version noch Ereignis'
);

-- 8: Veralteter Stand wird abgelehnt.
select set_config('request.jwt.claim.sub', 'e1600000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  format(
    $$select public.update_purchase_seller_details('e1600000-0000-4000-8000-000000000011', %L, 1, '{"seller_city":"Bonn"}'::jsonb)$$,
    (select id from seller_test_results where name = 'one-off')
  ),
  '40001',
  'Der Einkauf wurde zwischenzeitlich geändert. Bitte neu laden.',
  'ein veralteter Versionsstand überschreibt keine neueren Angaben'
);

select throws_ok(
  format(
    $$select public.update_purchase_seller_details('e1600000-0000-4000-8000-000000000011', %L, 2, '{"purchase_price":0}'::jsonb)$$,
    (select id from seller_test_results where name = 'one-off')
  ),
  '22023',
  'Die Verkäuferangaben enthalten Felder, die nachträglich nicht geändert werden dürfen.',
  'Kosten- oder Statusfelder werden über den Nachtrag abgelehnt'
);

select throws_ok(
  format(
    $$select public.update_purchase_seller_details('e1600000-0000-4000-8000-000000000011', %L, 2, '{"source_id":"e1600000-0000-4000-8000-000000000022"}'::jsonb)$$,
    (select id from seller_test_results where name = 'one-off')
  ),
  '22023',
  'Die Quelle gehört nicht zu diesem Workspace.',
  'eine Quelle aus einem fremden Workspace wird abgelehnt'
);

select throws_ok(
  format(
    $$update public.purchases set seller_city = 'Bonn' where id = %L$$,
    (select id from seller_test_results where name = 'one-off')
  ),
  '42501',
  'Finalisierte Einkaufsdaten dürfen nur über eine geprüfte Business-Funktion geändert werden.',
  'direkte Änderungen abgeschlossener Einkäufe bleiben gesperrt'
);
reset role;

-- 7: Fremder Workspace darf Verkäuferangaben weder ändern noch per ID erreichen.
select set_config('request.jwt.claim.sub', 'e1600000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  format(
    $$select public.update_purchase_seller_details('e1600000-0000-4000-8000-000000000011', %L, 2, '{"seller_city":"Bonn"}'::jsonb)$$,
    (select id from seller_test_results where name = 'one-off')
  ),
  '42501',
  'Kein Zugriff auf diesen Workspace.',
  'ein fremder Workspace darf Verkäuferangaben nicht ändern'
);

select throws_ok(
  format(
    $$select public.update_purchase_seller_details('e1600000-0000-4000-8000-000000000012', %L, 2, '{"seller_city":"Bonn"}'::jsonb)$$,
    (select id from seller_test_results where name = 'one-off')
  ),
  'P0002',
  'Der Einkauf wurde nicht gefunden.',
  'die ID eines fremden Einkaufs ist über den eigenen Workspace nicht erreichbar'
);
reset role;

set local role anon;
select throws_ok(
  format(
    $$select public.update_purchase_seller_details('e1600000-0000-4000-8000-000000000011', %L, 2, '{}'::jsonb)$$,
    (select id from seller_test_results where name = 'one-off')
  ),
  '42501',
  null,
  'anonyme Aufrufe haben kein Ausführungsrecht'
);
reset role;

select is(
  (select seller_city from public.purchases where id = (select id from seller_test_results where name = 'one-off')),
  'Köln',
  'abgelehnte Aufrufe haben nichts verändert'
);

select * from finish();
rollback;
