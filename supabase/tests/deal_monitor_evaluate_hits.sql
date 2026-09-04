\set ON_ERROR_STOP on

begin;

select plan(4);

\set query_id '87000000-0000-4000-8000-000000000001'
\set workspace_a '87000000-0000-4000-8000-000000000002'
\set workspace_b '87000000-0000-4000-8000-000000000003'

insert into public.sniper_queries (id, query_key, search_text, price_to)
values (:'query_id'::uuid, 'vinted|test|hits', 'testabfrage', 500);

insert into public.workspaces (id, name) values
  (:'workspace_a'::uuid, 'Treffer Testbereich A'),
  (:'workspace_b'::uuid, 'Treffer Testbereich B');

-- Strenger Abonnent (50 Prozent) und milder Abonnent (20 Prozent).
insert into public.sniper_query_subscriptions
  (workspace_id, query_id, discount_threshold_percent) values
  (:'workspace_a'::uuid, :'query_id'::uuid, 50),
  (:'workspace_b'::uuid, :'query_id'::uuid, 20);

-- Acht Vergleichswerte mit Median 20, dazu ein Fund zu 12 Euro.
-- 12 liegt 40 Prozent unter 20: fuer den milden ein Treffer, fuer den
-- strengen nicht.
insert into public.sniper_listings (
  marketplace, external_id, title, url, item_price, total_price,
  condition, discovered_by_query_id
)
select 'vinted', 'ref-' || i::text, 'Vergleichswert',
       'https://example.test/' || i::text, 20, 20, 'Gut', :'query_id'::uuid
from generate_series(1, 8) as i;

insert into public.sniper_listings (
  marketplace, external_id, title, url, item_price, total_price,
  condition, discovered_by_query_id
) values (
  'vinted', 'schnaeppchen', 'Guenstiger Fund',
  'https://example.test/schnaeppchen', 12, 12, 'Gut', :'query_id'::uuid
);

-- Die Bewertung legt nur fuer den milden Abonnenten einen Treffer an.
do $$
declare
  entstanden integer;
  treffer integer;
begin
  entstanden := public.sniper_evaluate_hits('87000000-0000-4000-8000-000000000001'::uuid);

  select count(*) into treffer
  from public.sniper_hits as hit
  join public.sniper_query_subscriptions as subscription
    on subscription.id = hit.subscription_id
  where subscription.workspace_id = '87000000-0000-4000-8000-000000000003'::uuid;

  if treffer <> 1 then
    raise exception 'Der milde Abonnent haette genau einen Treffer bekommen muessen, hat: %', treffer;
  end if;

  select count(*) into treffer
  from public.sniper_hits as hit
  join public.sniper_query_subscriptions as subscription
    on subscription.id = hit.subscription_id
  where subscription.workspace_id = '87000000-0000-4000-8000-000000000002'::uuid;

  if treffer <> 0 then
    raise exception 'Der strenge Abonnent haette keinen Treffer bekommen duerfen, hat: %', treffer;
  end if;

  if entstanden <> 1 then
    raise exception 'Erwartet wurde ein neuer Treffer, gemeldet: %', entstanden;
  end if;
end;
$$;

select pass('Dieselbe Lage ergibt je nach Schwelle einen Treffer oder keinen');

-- Der Massstab wird festgehalten.
do $$
declare
  hit record;
begin
  select h.reference_price, h.discount_percent into hit
  from public.sniper_hits as h
  join public.sniper_listings as l on l.id = h.listing_id
  where l.external_id = 'schnaeppchen';

  if hit.reference_price <> 20 then
    raise exception 'Erwartet wurde der festgehaltene Massstab 20, erhalten: %', hit.reference_price;
  end if;

  if hit.discount_percent <> 40 then
    raise exception 'Erwartet wurden 40 Prozent unter dem Massstab, erhalten: %', hit.discount_percent;
  end if;
end;
$$;

select pass('Massstab und Abstand werden am Treffer festgehalten');

-- Zweimal bewerten legt nichts doppelt an.
do $$
declare
  entstanden integer;
  gesamt integer;
begin
  entstanden := public.sniper_evaluate_hits('87000000-0000-4000-8000-000000000001'::uuid);
  select count(*) into gesamt from public.sniper_hits;

  if entstanden <> 0 then
    raise exception 'Der zweite Lauf haette nichts Neues melden duerfen: %', entstanden;
  end if;

  if gesamt <> 1 then
    raise exception 'Erwartet wurde genau ein Treffer, gefunden: %', gesamt;
  end if;
end;
$$;

select pass('Ein zweiter Lauf legt keinen Treffer doppelt an');

-- Ein deaktiviertes Abonnement bekommt nichts.
do $$
declare
  vorher integer;
  nachher integer;
begin
  select count(*) into vorher from public.sniper_hits;

  update public.sniper_query_subscriptions set is_active = false
  where workspace_id = '87000000-0000-4000-8000-000000000003'::uuid;

  delete from public.sniper_hits;
  perform public.sniper_evaluate_hits('87000000-0000-4000-8000-000000000001'::uuid);

  select count(*) into nachher from public.sniper_hits;

  if nachher <> 0 then
    raise exception 'Ein deaktiviertes Abonnement hat Treffer bekommen: %', nachher;
  end if;
end;
$$;

select pass('Ein deaktiviertes Abonnement bekommt keine Treffer');

select * from finish();

rollback;
