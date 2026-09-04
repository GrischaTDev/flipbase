\set ON_ERROR_STOP on

begin;

select plan(8);

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
  -- Ohne das Zuruecksetzen prueft dieser Test nur noch den evaluated_at-Riegel:
  -- Der Lauf davor hat alles abgehakt, `on conflict do nothing` kaeme nie zum
  -- Zug. Die Klausel bleibt aber noetig - fuer parallele Laeufe und fuers
  -- Wiedereinspielen von Hand.
  update public.sniper_listings set evaluated_at = null
  where discovered_by_query_id = '87000000-0000-4000-8000-000000000001'::uuid;

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

  -- Ohne das Zuruecksetzen prueft dieser Test nichts mehr: Die Angebote sind
  -- aus den Laeufen davor als geprueft vermerkt, es kaemen also auch bei
  -- aktivem Abonnement null Treffer heraus.
  update public.sniper_listings set evaluated_at = null
  where discovered_by_query_id = '87000000-0000-4000-8000-000000000001'::uuid;

  perform public.sniper_evaluate_hits('87000000-0000-4000-8000-000000000001'::uuid);

  select count(*) into nachher from public.sniper_hits;

  if nachher <> 0 then
    raise exception 'Ein deaktiviertes Abonnement hat Treffer bekommen: %', nachher;
  end if;
end;
$$;

select pass('Ein deaktiviertes Abonnement bekommt keine Treffer');

-- Der Einlese-Lauf meldet nichts - und zwar dauerhaft.
--
-- Das ist die Regel aus dem Entwurf ("bei is_seeded = false: nur schreiben,
-- nichts melden"). Sie muss in der Zeile stehen, nicht im Ablauf: Sonst holte
-- die zweite Runde denselben Bestand nach und der Melder bekaeme beim Anlegen
-- eines Filters sofort einen Schwall wochenalter Angebote.
insert into public.sniper_queries (id, query_key, search_text, price_to)
values ('87000000-0000-4000-8000-000000000004'::uuid, 'vinted|test|einlese', 'einlesetest', 500);

insert into public.workspaces (id, name)
values ('87000000-0000-4000-8000-000000000005'::uuid, 'Einlese Testbereich');

insert into public.sniper_query_subscriptions
  (workspace_id, query_id, discount_threshold_percent)
values ('87000000-0000-4000-8000-000000000005'::uuid,
        '87000000-0000-4000-8000-000000000004'::uuid, 20);

insert into public.sniper_listings (
  marketplace, external_id, title, url, item_price, total_price,
  condition, discovered_by_query_id
)
select 'vinted', 'einlese-ref-' || i::text, 'Vergleichswert',
       'https://example.test/einlese/' || i::text, 20, 20, 'Gut',
       '87000000-0000-4000-8000-000000000004'::uuid
from generate_series(1, 8) as i;

insert into public.sniper_listings (
  marketplace, external_id, title, url, item_price, total_price,
  condition, discovered_by_query_id
) values (
  'vinted', 'einlese-schnaeppchen', 'Guenstiger Altbestand',
  'https://example.test/einlese/schnaeppchen', 12, 12, 'Gut',
  '87000000-0000-4000-8000-000000000004'::uuid
);

do $$
declare
  gemeldet integer;
  offen integer;
  spaeter integer;
begin
  gemeldet := public.sniper_evaluate_hits(
    '87000000-0000-4000-8000-000000000004'::uuid, false
  );

  if gemeldet <> 0 then
    raise exception 'Der Einlese-Lauf haette nichts melden duerfen: %', gemeldet;
  end if;

  select count(*) into offen
  from public.sniper_listings
  where discovered_by_query_id = '87000000-0000-4000-8000-000000000004'::uuid
    and evaluated_at is null;

  if offen <> 0 then
    raise exception 'Der Einlese-Lauf haette den Bestand abhaken muessen, offen: %', offen;
  end if;

  -- Der entscheidende Teil: Auch der naechste, normale Lauf holt den
  -- Altbestand nicht nach.
  spaeter := public.sniper_evaluate_hits(
    '87000000-0000-4000-8000-000000000004'::uuid
  );

  if spaeter <> 0 then
    raise exception 'Der Altbestand wurde nachtraeglich doch gemeldet: %', spaeter;
  end if;
end;
$$;

select pass('Der Einlese-Lauf hakt den Bestand stumm ab und holt nichts nach');

-- Ohne brauchbaren Massstab bleibt ein Angebot ungeprueft.
--
-- Sonst verfiele ein Fund allein deshalb, weil er kam, bevor genug
-- Vergleichswerte da waren.
insert into public.sniper_queries (id, query_key, search_text, price_to)
values ('87000000-0000-4000-8000-000000000006'::uuid, 'vinted|test|duenn', 'duennetest', 500);

insert into public.sniper_listings (
  marketplace, external_id, title, url, item_price, total_price,
  condition, discovered_by_query_id
)
select 'vinted', 'duenn-' || i::text, 'Zu wenige',
       'https://example.test/duenn/' || i::text, 20, 20, 'Gut',
       '87000000-0000-4000-8000-000000000006'::uuid
from generate_series(1, 3) as i;

do $$
declare
  vermerkt integer;
begin
  perform public.sniper_evaluate_hits('87000000-0000-4000-8000-000000000006'::uuid);

  select count(*) into vermerkt
  from public.sniper_listings
  where discovered_by_query_id = '87000000-0000-4000-8000-000000000006'::uuid
    and evaluated_at is not null;

  if vermerkt <> 0 then
    raise exception 'Ohne Massstab darf nichts abgehakt werden, abgehakt: %', vermerkt;
  end if;
end;
$$;

select pass('Ohne brauchbaren Massstab bleibt ein Angebot fuer die naechste Runde offen');

-- Die Bewertung gehoert dem Dienst, nicht dem Browser.
--
-- Die Funktion laeuft mit security definer und schreibt in sniper_hits. Waere
-- sie fuer anon oder authenticated ausfuehrbar, koennte jeder Angemeldete die
-- Trefferbildung fremder Arbeitsbereiche ausloesen. Die Rechte sind auf dieser
-- Datenbank am 04.09.2026 schon einmal von der lokalen abgewichen - deshalb
-- steht das hier als Pruefung und nicht als Notiz.
do $$
declare
  rolle text;
begin
  foreach rolle in array array['anon', 'authenticated']
  loop
    if has_function_privilege(
      rolle, 'public.sniper_evaluate_hits(uuid, boolean)', 'execute'
    ) then
      raise exception '% darf die Trefferbildung nicht ausloesen', rolle;
    end if;
  end loop;
end;
$$;

select pass('Weder anon noch authenticated duerfen die Trefferbildung ausloesen');

-- Ein pausiertes Abonnement darf den Zulauf nicht verbrennen.
--
-- Ohne aktiven Abonnenten wird gar nicht beurteilt. Wuerde trotzdem abgehakt,
-- verloere ein Nutzer, der seinen Filter einen Tag abschaltet, jedes
-- Schnaeppchen dieses Tages endgueltig - und create_sniper_subscription
-- schaltet einen Filter beim erneuten Anlegen ausdruecklich wieder aktiv.
do $$
declare
  offen integer;
  danach integer;
begin
  -- Beide Abonnements dieser Abfrage sind an dieser Stelle inaktiv: Das
  -- strenge wurde nie ausgeloest, das milde hat der Test davor abgeschaltet.
  update public.sniper_query_subscriptions set is_active = false
  where query_id = '87000000-0000-4000-8000-000000000001'::uuid;

  update public.sniper_listings set evaluated_at = null
  where discovered_by_query_id = '87000000-0000-4000-8000-000000000001'::uuid;

  delete from public.sniper_hits;
  perform public.sniper_evaluate_hits('87000000-0000-4000-8000-000000000001'::uuid);

  select count(*) into offen
  from public.sniper_listings
  where discovered_by_query_id = '87000000-0000-4000-8000-000000000001'::uuid
    and evaluated_at is not null;

  if offen <> 0 then
    raise exception 'Bei pausiertem Abonnement darf nichts abgehakt werden, abgehakt: %', offen;
  end if;

  -- Und nach dem Wiedereinschalten kommt der Zulauf auch wirklich an.
  update public.sniper_query_subscriptions set is_active = true
  where workspace_id = '87000000-0000-4000-8000-000000000003'::uuid;

  danach := public.sniper_evaluate_hits('87000000-0000-4000-8000-000000000001'::uuid);

  if danach <> 1 then
    raise exception 'Nach dem Wiedereinschalten wurde der Fund nicht gemeldet: %', danach;
  end if;
end;
$$;

select pass('Ein pausiertes Abonnement verbrennt den Zulauf nicht');

select * from finish();

rollback;
