\set ON_ERROR_STOP on
begin;
select plan(21);

insert into public.sniper_queries (id, query_key, catalog_id, search_text, price_to) values
('88000000-0000-4000-8000-000000000001', 'group-a', 88001, null, 100),
('88000000-0000-4000-8000-000000000002', 'group-b', 88001, null, 200),
('88000000-0000-4000-8000-000000000003', 'group-other', 88002, null, 1000),
('88000000-0000-4000-8000-000000000004', 'group-unknown', null, 'text only', 1000);

-- Zwei Auftraege tragen je vier Werte bei. Grossschreibung und Leerzeichen
-- duerfen die Markengruppe nicht aufteilen.
insert into public.sniper_listings (external_id, title, url, item_price, total_price, brand, condition, discovered_by_query_id)
select 'group-' || i, 'Referenz', 'https://example.test', 40, 40,
       case when i <= 4 then ' Nike ' else 'NIKE' end, 'Gut',
       case when i <= 4 then '88000000-0000-4000-8000-000000000001'::uuid
            else '88000000-0000-4000-8000-000000000002'::uuid end
from generate_series(1, 8) as i;

select results_eq($$select reference_price, sample_size, unusable_reason, reference_scope
  from public.sniper_reference_price(88001, 'nike', 'Gut')$$,
  $$values (40::numeric, 8, null::text, 'category_brand_condition'::text)$$,
  'Markengruppe nutzt alle Auftraege derselben Kategorie');

insert into public.sniper_listings (external_id, title, url, item_price, total_price, brand, condition, discovered_by_query_id)
select 'other-brand-' || i, 'Andere Marke', 'https://example.test', 80, 80, 'Adidas', 'Gut',
       '88000000-0000-4000-8000-000000000001'::uuid from generate_series(1, 8) as i;
select is((select reference_price from public.sniper_reference_price(88001, 'Nike', 'Gut')), 40::numeric,
  'Ausreichend grosse Markengruppe bleibt unvermischt');
select results_eq($$select reference_price, sample_size, reference_scope from public.sniper_reference_price(88001, 'Puma', 'Gut')$$,
  $$values (60::numeric, 16, 'category_condition'::text)$$, 'Kleine Markengruppe faellt auf Kategorie/Zustand zurueck');
select is((select reference_scope from public.sniper_reference_price(88001, '   ', 'Gut')), 'category_condition', 'Leere Marke nutzt Rueckfall');
select is((select reference_scope from public.sniper_reference_price(88001, null, 'Gut')), 'category_condition', 'Unbekannte Marke nutzt Rueckfall');
select is((select unusable_reason from public.sniper_reference_price(88001, 'Nike', 'Neu')), 'too_few', 'Andere Zustaende bleiben getrennt');
select is((select unusable_reason from public.sniper_reference_price(null::integer, 'Nike', 'Gut')), 'unknown_category', 'Textsuche ohne Kategorie wird nicht geschaetzt');

-- Fremde Kategorie, veraltete Werte, andere Waehrung und ungueltige Preise
-- duerfen den Median nicht beeinflussen.
insert into public.sniper_listings (external_id, title, url, item_price, total_price, brand, condition, discovered_by_query_id, currency, first_seen_at)
select 'excluded-' || i, 'Ausschluss', 'https://example.test',
       case when i = 5 then 0 when i = 6 then -1 when i = 7 then 'NaN'::numeric else 900 end,
       900, 'Nike', 'Gut',
       case when i = 1 then '88000000-0000-4000-8000-000000000003'::uuid
            when i = 2 then '88000000-0000-4000-8000-000000000004'::uuid
            else '88000000-0000-4000-8000-000000000001'::uuid end,
       case when i = 4 then 'USD' else 'EUR' end,
       case when i = 3 then now() - interval '14 days 1 second' else now() end
from generate_series(1, 7) as i;
select results_eq($$select reference_price, sample_size from public.sniper_reference_price(88001, 'Nike', 'Gut')$$,
  $$values (40::numeric, 8)$$, 'Vergleich enthaelt nur gueltige aktuelle EUR-Angebote derselben Kategorie');

update public.sniper_queries set price_to = 40 where query_key = 'group-a';
select is((select unusable_reason from public.sniper_reference_price(88001, 'Nike', 'Gut')), 'at_price_ceiling',
  'Preislimit des jeweiligen Entdeckungsauftrags zaehlt: vier von acht');
select is((select reference_scope from public.sniper_reference_price(88001, 'Nike', 'Gut')), 'category_brand_condition',
  'Verzerrte Markengruppe wird nicht durch Rueckfall kaschiert');
update public.sniper_queries set price_to = 100 where query_key = 'group-a';

insert into public.workspaces (id, name) values ('88000000-0000-4000-8000-000000000005', 'Gruppentest');
insert into public.sniper_query_subscriptions (workspace_id, query_id, discount_threshold_percent)
values ('88000000-0000-4000-8000-000000000005', '88000000-0000-4000-8000-000000000001', 40);
update public.sniper_listings set evaluated_at = now();
insert into public.sniper_listings (external_id, title, url, item_price, total_price, brand, condition, discovered_by_query_id)
values ('brand-deal', 'Markentreffer', 'https://example.test', 10, 10, 'nike', 'Gut', '88000000-0000-4000-8000-000000000001'),
       ('fallback-deal', 'Rueckfalltreffer', 'https://example.test', 10, 10, 'Puma', 'Gut', '88000000-0000-4000-8000-000000000001');
select is(public.sniper_evaluate_hits('88000000-0000-4000-8000-000000000001'), 2, 'Beide guenstigen Angebote werden bewertet');
select results_eq($$select listing.external_id, hit.reference_scope, hit.reference_price
  from public.sniper_hits as hit join public.sniper_listings as listing on listing.id = hit.listing_id order by listing.external_id$$,
  $$values ('brand-deal'::text, 'category_brand_condition'::text, 40::numeric),
           ('fallback-deal'::text, 'category_condition'::text, 40::numeric)$$, 'Treffer bewahren ihren tatsaechlichen Massstab');
select is(public.sniper_evaluate_hits('88000000-0000-4000-8000-000000000001'), 0, 'Wiederholung meldet nichts doppelt');

insert into public.sniper_listings (external_id, title, url, item_price, total_price, brand, condition, currency, discovered_by_query_id)
values ('invalid-deal', 'Andere Waehrung', 'https://example.test', 1, 1, 'Nike', 'Gut', 'USD', '88000000-0000-4000-8000-000000000001');
select is(public.sniper_evaluate_hits('88000000-0000-4000-8000-000000000001'), 0, 'Fremdwaehrung wird kein vermeintlicher Deal');

select ok(not has_function_privilege('anon', 'public.sniper_reference_price(integer,text,text)', 'execute'), 'Anonyme duerfen globale Gruppen nicht abfragen');
select ok(not has_function_privilege('authenticated', 'public.sniper_reference_price(integer,text,text)', 'execute'), 'Nutzer duerfen globale Gruppen nicht direkt abfragen');
select ok(has_function_privilege('service_role', 'public.sniper_reference_price(integer,text,text)', 'execute'), 'Dienst darf Gruppen abfragen');

-- Genau ein Drittel ist erlaubt, erst mehr ist unbrauchbar.
update public.sniper_listings set item_price = 100 where external_id in ('group-1', 'group-2', 'group-3');
select is((select unusable_reason from public.sniper_reference_price(88001, 'Nike', 'Gut')), null::text, 'Drei von neun am Preislimit sind erlaubt');
update public.sniper_listings set item_price = 100 where external_id = 'group-4';
select is((select unusable_reason from public.sniper_reference_price(88001, 'Nike', 'Gut')), 'at_price_ceiling', 'Vier von neun am Preislimit werden verworfen');
update public.sniper_listings set first_seen_at = now() - interval '14 days' where external_id = 'group-8';
select is((select sample_size from public.sniper_reference_price(88001, 'Nike', 'Gut')), 9, 'Die 14-Tage-Grenze ist eingeschlossen');
update public.sniper_listings set first_seen_at = now() - interval '14 days 1 second' where external_id = 'group-8';
select is((select sample_size from public.sniper_reference_price(88001, 'Nike', 'Gut')), 8, 'Aeltere Angebote verlassen das Fenster');

select * from finish();
rollback;
