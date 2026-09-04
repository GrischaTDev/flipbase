\set ON_ERROR_STOP on

begin;

select plan(5);

\set query_id '86000000-0000-4000-8000-000000000001'

insert into public.sniper_queries (id, query_key, search_text, price_to)
values (:'query_id'::uuid, 'vinted|test|reference', 'testabfrage', 50);

-- Hilfsprozedur: legt n Funde mit gegebenen Preisen an.
create or replace function pg_temp.seed_listings(
  p_condition text, p_prices numeric[], p_age_days integer default 0
) returns void language plpgsql as $$
declare
  price numeric;
  index integer := 0;
begin
  foreach price in array p_prices loop
    index := index + 1;
    insert into public.sniper_listings (
      marketplace, external_id, title, url, item_price, total_price,
      condition, discovered_by_query_id, first_seen_at
    ) values (
      'vinted',
      p_condition || '-' || p_age_days || '-' || index::text,
      'Testartikel', 'https://example.test/' || index::text,
      price, price, p_condition,
      '86000000-0000-4000-8000-000000000001'::uuid,
      now() - make_interval(days => p_age_days)
    );
  end loop;
end;
$$;

-- Gruppe unter der Mindestzahl urteilt nicht.
do $$
declare
  ergebnis record;
begin
  perform pg_temp.seed_listings('Zufriedenstellend', array[10, 12, 14, 16, 18, 20]);

  select * into ergebnis
  from public.sniper_reference_price(
    '86000000-0000-4000-8000-000000000001'::uuid, 'Zufriedenstellend'
  );

  if ergebnis.reference_price is not null then
    raise exception 'Sechs Funde haetten keinen Massstab ergeben duerfen: %', ergebnis.reference_price;
  end if;

  if ergebnis.unusable_reason <> 'too_few' then
    raise exception 'Erwartet wurde too_few, erhalten: %', ergebnis.unusable_reason;
  end if;
end;
$$;

select pass('Eine Gruppe unter der Mindestzahl liefert keinen Massstab');

-- Ausreichend grosse Gruppe liefert den Median.
do $$
declare
  ergebnis record;
begin
  perform pg_temp.seed_listings('Gut', array[10, 12, 14, 16, 18, 20, 22, 24]);

  select * into ergebnis
  from public.sniper_reference_price(
    '86000000-0000-4000-8000-000000000001'::uuid, 'Gut'
  );

  if ergebnis.reference_price <> 17 then
    raise exception 'Erwartet wurde der Median 17, erhalten: %', ergebnis.reference_price;
  end if;

  if ergebnis.sample_size <> 8 then
    raise exception 'Erwartet wurden 8 Vergleichswerte, erhalten: %', ergebnis.sample_size;
  end if;
end;
$$;

select pass('Acht Funde ergeben einen Median');

-- Gruppe am Preislimit urteilt nicht.
do $$
declare
  ergebnis record;
begin
  -- Sechs von neun am Limit sind zwei Drittel, deutlich ueber einem Drittel.
  perform pg_temp.seed_listings(
    'Neu, mit Etikett', array[50, 50, 50, 50, 50, 50, 30, 35, 40]
  );

  select * into ergebnis
  from public.sniper_reference_price(
    '86000000-0000-4000-8000-000000000001'::uuid, 'Neu, mit Etikett'
  );

  if ergebnis.reference_price is not null then
    raise exception 'Eine abgeschnittene Gruppe haette schweigen muessen: %', ergebnis.reference_price;
  end if;

  if ergebnis.unusable_reason <> 'at_price_ceiling' then
    raise exception 'Erwartet wurde at_price_ceiling, erhalten: %', ergebnis.unusable_reason;
  end if;
end;
$$;

select pass('Eine am Preislimit klebende Gruppe liefert keinen Massstab');

-- Alte Funde zaehlen nicht mit.
do $$
declare
  ergebnis record;
begin
  perform pg_temp.seed_listings('Sehr gut', array[20, 20, 20, 20, 20, 20, 20, 20]);
  -- Ausserhalb des Fensters: duerfen den Median nicht verschieben.
  perform pg_temp.seed_listings('Sehr gut', array[100, 100, 100, 100, 100], 20);

  select * into ergebnis
  from public.sniper_reference_price(
    '86000000-0000-4000-8000-000000000001'::uuid, 'Sehr gut'
  );

  if ergebnis.reference_price <> 20 then
    raise exception 'Funde aelter als 14 Tage haben den Median verschoben: %', ergebnis.reference_price;
  end if;

  if ergebnis.sample_size <> 8 then
    raise exception 'Erwartet wurden 8 Vergleichswerte, erhalten: %', ergebnis.sample_size;
  end if;
end;
$$;

select pass('Funde aelter als 14 Tage zaehlen nicht mit');

-- Die Rechte muessen in jeder Umgebung gleich aussehen.
--
-- `supabase db diff` erzeugt fuer Funktionen nur `revoke ... from public` und
-- laesst rollenbezogene Rechte stehen, die die Vorgaberechte automatisch
-- vergeben. Ohne diese Pruefung faellt eine Abweichung erst auf, wenn jemand
-- die Produktionsdatenbank von Hand ausliest.
do $$
begin
  if has_function_privilege('anon', 'public.sniper_reference_price(uuid, text)', 'execute') then
    raise exception 'anon darf sniper_reference_price nicht ausfuehren';
  end if;

  if not has_function_privilege('authenticated', 'public.sniper_reference_price(uuid, text)', 'execute') then
    raise exception 'authenticated muss sniper_reference_price ausfuehren duerfen';
  end if;
end;
$$;

select pass('Nur Angemeldete duerfen den Massstab abfragen');

select * from finish();

rollback;
