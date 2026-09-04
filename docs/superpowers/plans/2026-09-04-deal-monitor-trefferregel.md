# Deal Monitor — Trefferregel Implementation Plan

> **Stand 05.09.2026: abgearbeitet — und in zwei Punkten überholt.**
> Der Plan bleibt als Begründung stehen, ist aber **keine gültige
> Schnittstellenbeschreibung mehr.** Die Schlussprüfung des Zweigs hat zwei
> Fehler gefunden, die er selbst nicht sah:
>
> 1. **`sniper_evaluate_hits` heißt jetzt `(p_query_id uuid, p_report_hits
boolean default true)`**, und `sniper_listings` hat eine Spalte
>    `evaluated_at`. Bewertet wird nur, was diesen Vermerk noch nicht trägt.
>    Der Plan ließ die Bewertung über **alle** Angebote einer Abfrage laufen
>    und vor der Einlese-Weiche — an einem Bestand von 96 Angeboten hätte die
>    erste Runde einer neuen Abfrage 25 Treffer ausgeworfen. Der Entwurf
>    verlangt das Gegenteil (`2026-08-30-vinted-deal-monitor-design.md`,
>    Schritt 5: „bei is_seeded = false: nur schreiben, nichts melden").
> 2. **`ListingStore.evaluateHits(queryId, reportHits = true)`** hat ein
>    zweites Argument, und der Taktgeber setzt `markSeeded` erst, wenn die
>    Bewertung wirklich durchlief.
>
> Wer hier weiterliest: Der gültige Stand steht in
> `supabase/schemas/50_sniper.sql` und `services/sniper/src/`. Die Codeblöcke
> unten nicht abschreiben.
>
> **Offen und bewusst nicht in diesem Zweig behoben:** Der Vergleichspreis
> zählt nur Angebote mit `discovered_by_query_id = <diese Abfrage>`. Zwei
> Abfragen mit demselben Suchbegriff und verschiedenen Preisgrenzen nehmen
> einander deshalb Vergleichsmaterial weg und verzerren den Maßstab. Das
> berührt das Datenmodell und gehört in eine eigene Entscheidung — siehe
> AI-Changelog vom 05.09.2026.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein auffällig günstiger Fund wird zum Treffer — selten genug, dass ein Treffer etwas bedeutet, und nachvollziehbar genug, dass man ihm glaubt.

**Architecture:** Die Bewertung rechnet in Postgres, weil der Median dieselbe Zahl liefern muss, die die Oberfläche später zeigt. Der Dienst ruft sie nach jedem Speichern auf. Zustellung und Oberfläche folgen in eigenen Plänen — hier entsteht nur die Regel, die beide brauchen.

**Tech Stack:** Supabase (Postgres 15), deklaratives Schema unter `supabase/schemas/`, pgTAP unter `supabase/tests/`, TypeScript strict unter `services/sniper/`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-vinted-deal-monitor-etappe-2-design.md`

**Baut auf:** `docs/superpowers/plans/2026-09-02-deal-monitor-datenmodell-und-schreibweg.md` (abgeschlossen, auf master)

## Die vier Parameter, an echten Daten entschieden

Gemessen am 04.09.2026 an 96 frisch gesammelten Funden einer Abfrage:

| Zustand           |   n | Median  | am 50-€-Limit |   Anteil |
| ----------------- | --: | ------- | ------------: | -------: |
| Sehr gut          |  44 | 23,50 € |             7 |     16 % |
| Gut               |  22 | 18,00 € |             1 |      5 % |
| Neu               |  12 | 25,00 € |             1 |      8 % |
| Neu, mit Etikett  |  12 | 50,00 € |         **8** | **67 %** |
| Zufriedenstellend |   6 | 10,00 € |             0 |      0 % |

- **Mindestzahl 8.** Nur „Zufriedenstellend" fiele heute darunter. Bei fünf Werten ist ein Median Zufall.
- **Anschlag bei einem Drittel.** Die abgeschnittene Gruppe liegt bei 67 %, die nächsthöchste bei 16 % — ein Drittel trifft mitten in die Lücke.
- **Gleitende 14 Tage.** Preise driften saisonal; die Aufbewahrungsfrist löscht ohnehin nach 30 Tagen.
- **Schwelle 40 % als Standard**, nicht 30. Bei 30 % hätten **25 von 96** Funden gemeldet — jeder vierte. Bei 40 % sind es rund 8. Der Entwurf nennt noch 30; dieser Plan ändert den Standardwert und den Entwurf mit.
- **Schwellenänderungen wirken nur nach vorn.** Ein gemeldeter Treffer verschwindet nicht nachträglich.

## Global Constraints

- Schemaänderungen **ausschließlich** in `supabase/schemas/50_sniper.sql`. **Niemals** `supabase/schemas/database.sql` — daran arbeitet parallel jemand anderes.
- Migrations erzeugen (`supabase db diff -f <name>`), **außer** Tabellenrechten: die überträgt der Abgleich nicht und braucht eine handgeschriebene Migration. Muster: `20260904190823_revoke_anon_on_sniper_tables.sql`.
- **Rechte-Endzustand jeder neuen Tabelle:** `anon` gar nichts, `authenticated` genau die Rechte, die es wirklich braucht. Nach dem Anlegen **aus der Datenbank auslesen**, nicht aus dem Schema schließen — und zwar nach einem `db reset`, sonst ist der Stand nicht aussagekräftig.
- Jede neue Tabelle: RLS aktiv, separate Policy je Operation und Rolle, immer `TO`, `(select auth.uid())` statt `auth.uid()`.
- Funktionen: `security invoker` als Standard; `security definer` nur wo nötig, dann `set search_path = ''` und vollqualifizierte Namen.
- pgTAP: `\set ON_ERROR_STOP on`, `begin;`, `select plan(N);`, ein `select pass('…')` je Prüfblock, `select * from finish();`, `rollback;`. `plan(N)` muss zur Zahl der `pass`-Aufrufe passen.
- SQL klein, `snake_case`, Tabellennamen plural, `comment on table` je Tabelle. Bezeichner englisch, Kommentare deutsch.
- Commit-Nachrichten englisch, Conventional Commits, Scope `sniper`, **ohne jede Assistenten-Signatur**.
- Vor jedem Commit `npm run verify`, Exitcode **ohne Pipe** messen, **erst ansehen, dann committen**.

---

### Task 1: Vergleichsmaßstab je Gruppe

Der Median allein genügt nicht — er muss sagen können, dass er unbrauchbar ist.

**Files:**

- Modify: `supabase/schemas/50_sniper.sql`
- Create: `supabase/migrations/<zeitstempel>_sniper_reference_price.sql` (erzeugt)
- Test: `supabase/tests/deal_monitor_reference_price.sql`

**Interfaces:**

- Consumes: `public.sniper_listings` (Spalten `discovered_by_query_id`, `condition`, `item_price`, `first_seen_at`), `public.sniper_queries.price_to`.
- Produces: `public.sniper_reference_price(p_query_id uuid, p_condition text) returns table (reference_price numeric, sample_size integer, unusable_reason text)` — `reference_price` ist `null`, wenn die Gruppe nicht urteilen darf; `unusable_reason` nennt dann `'too_few'` oder `'at_price_ceiling'`.

- [ ] **Step 1: Test schreiben**

Create `supabase/tests/deal_monitor_reference_price.sql`:

```sql
\set ON_ERROR_STOP on

begin;

select plan(4);

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

select * from finish();

rollback;
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm run test:db`

Expected: FEHLER `function public.sniper_reference_price(uuid, text) does not exist`.

- [ ] **Step 3: Funktion umsetzen**

In `supabase/schemas/50_sniper.sql` hinter `create_sniper_subscription` anfügen:

```sql
-- Der Vergleichsmassstab einer Gruppe: der Median der Artikelpreise derselben
-- Abfrage im selben Zustand, ueber ein gleitendes Fenster.
--
-- Zwei Schutzregeln, beide aus echten Daten hergeleitet (04.09.2026, 96 Funde):
--
-- Mindestzahl: Unter acht Vergleichswerten ist ein Median Zufall - ein
-- einzelner Ausreisser verschiebt ihn stark.
--
-- Anschlagserkennung: Klebt mehr als ein Drittel der Gruppe an der
-- Preisobergrenze der Abfrage, schneidet die Grenze in die Verteilung und der
-- Median ist wertlos. Gemessen lag die abgeschnittene Gruppe bei 67 Prozent,
-- die naechsthoechste gesunde bei 16 - ein Drittel trifft die Luecke.
--
-- Ohne die zweite Regel bliebe das Werkzeug genau in der Kategorie stumm, in
-- der die echten Schnaeppchen stecken.
create or replace function public.sniper_reference_price(
    p_query_id uuid,
    p_condition text
)
returns table (reference_price numeric, sample_size integer, unusable_reason text)
language sql
stable
security invoker
set search_path = ''
as $$
    with fenster as (
        select listing.item_price
        from public.sniper_listings as listing
        where listing.discovered_by_query_id = p_query_id
          and listing.condition is not distinct from p_condition
          and listing.first_seen_at >= now() - interval '14 days'
    ),
    grenze as (
        select price_to from public.sniper_queries where id = p_query_id
    ),
    kennzahlen as (
        select
            count(*)::integer as n,
            percentile_cont(0.5) within group (order by item_price)::numeric(12, 2) as median,
            count(*) filter (
                where (select price_to from grenze) is not null
                  and item_price >= (select price_to from grenze)
            )::integer as am_limit
        from fenster
    )
    select
        case
            when n < 8 then null
            when am_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then null
            else median
        end,
        n,
        case
            when n < 8 then 'too_few'
            when am_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then 'at_price_ceiling'
            else null
        end
    from kennzahlen;
$$;

comment on function public.sniper_reference_price(uuid, text) is
    'Median der Artikelpreise einer Abfrage im selben Zustand ueber 14 Tage. Liefert null mit Begruendung, wenn die Gruppe zu klein ist oder am Preislimit klebt.';
```

- [ ] **Step 4: Migration erzeugen, anwenden, Erfolg bestätigen**

Run: `npx supabase stop && npx supabase db diff -f sniper_reference_price && npx supabase start && npx supabase db reset --local && npm run test:db`

Expected: `All tests successful.`, Exitcode 0.

- [ ] **Step 5: Commit**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
```

Erwartung: `0`. Danach:

```bash
git add supabase/schemas/50_sniper.sql supabase/migrations supabase/tests/deal_monitor_reference_price.sql
git commit -m "feat(sniper): compute a reference price per query and condition"
```

---

### Task 2: Standardschwelle auf 40 Prozent

**Files:**

- Modify: `supabase/schemas/50_sniper.sql` (Standardwert der Spalte und der Funktionsparameter)
- Modify: `docs/superpowers/specs/2026-09-02-vinted-deal-monitor-etappe-2-design.md`
- Create: `supabase/migrations/<zeitstempel>_sniper_default_threshold.sql` (erzeugt)
- Test: `supabase/tests/deal_monitor_subscriptions.sql` (erweitern)

**Interfaces:**

- Produces: `sniper_query_subscriptions.discount_threshold_percent` mit Standard **40**; `create_sniper_subscription(..., p_threshold numeric default 40)`.

- [ ] **Step 1: Test erweitern**

In `supabase/tests/deal_monitor_subscriptions.sql` die Zahl in `select plan(N);` um eins erhöhen und vor `select * from finish();` einfügen:

```sql
-- Der Standardwert der Schwelle.
--
-- Bei 30 Prozent haetten am 04.09.2026 25 von 96 Funden gemeldet - jeder
-- vierte. Bei 40 sind es rund 8. Ein Melder, der staendig meldet, wird
-- stummgeschaltet.
do $$
declare
  standard numeric;
begin
  select column_default::numeric into standard
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sniper_query_subscriptions'
    and column_name = 'discount_threshold_percent';

  if standard <> 40 then
    raise exception 'Erwartet wurde der Standardwert 40, gefunden: %', standard;
  end if;
end;
$$;

select pass('Die Standardschwelle liegt bei 40 Prozent');
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm run test:db`

Expected: FEHLER `Erwartet wurde der Standardwert 40, gefunden: 30`.

- [ ] **Step 3: Standardwerte ändern**

In `supabase/schemas/50_sniper.sql` in der Tabellendefinition:

```sql
    discount_threshold_percent numeric(5, 2) not null default 40
```

und in der Signatur von `create_sniper_subscription`:

```sql
    p_threshold numeric default 40
```

- [ ] **Step 4: Den Entwurf nachziehen**

In `docs/superpowers/specs/2026-09-02-vinted-deal-monitor-etappe-2-design.md` jede Nennung von „30 Prozent" als Standardwert auf 40 ändern und den Grund in einem Satz ergänzen: bei 30 Prozent meldeten 25 von 96 Funden, gemessen am 04.09.2026.

- [ ] **Step 5: Migration erzeugen, anwenden, bestätigen**

Run: `npx supabase stop && npx supabase db diff -f sniper_default_threshold && npx supabase start && npx supabase db reset --local && npm run test:db`

Expected: `All tests successful.`, Exitcode 0.

- [ ] **Step 6: Commit**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
git add supabase docs
git commit -m "feat(sniper): raise the default threshold to forty percent"
```

---

### Task 3: Treffer entstehen lassen

**Files:**

- Modify: `supabase/schemas/50_sniper.sql`
- Create: `supabase/migrations/<zeitstempel>_sniper_evaluate_hits.sql` (erzeugt)
- Test: `supabase/tests/deal_monitor_evaluate_hits.sql`

**Interfaces:**

- Consumes: `public.sniper_reference_price` aus Task 1, `public.sniper_query_subscriptions`, `public.sniper_listings`, `public.sniper_hits`.
- Produces: `public.sniper_evaluate_hits(p_query_id uuid) returns integer` — legt fehlende Treffer für alle aktiven Abonnements dieser Abfrage an und liefert die Zahl der neu entstandenen.

- [ ] **Step 1: Test schreiben**

Create `supabase/tests/deal_monitor_evaluate_hits.sql`:

```sql
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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm run test:db`

Expected: FEHLER `function public.sniper_evaluate_hits(uuid) does not exist`.

- [ ] **Step 3: Funktion umsetzen**

In `supabase/schemas/50_sniper.sql` hinter `sniper_reference_price` anfügen:

```sql
-- Legt fuer eine Abfrage die fehlenden Treffer an und liefert ihre Zahl.
--
-- Bewertet wird je Abonnement, weil die Schwelle dort haengt: derselbe Fund
-- kann fuer einen Arbeitsbereich ein Treffer sein und fuer den naechsten
-- nicht. Der Massstab wird am Treffer festgehalten statt spaeter neu
-- gerechnet - er verschiebt sich mit jedem neuen Fund, und ohne den
-- festgehaltenen Wert waere nicht mehr nachvollziehbar, warum gemeldet wurde.
--
-- `on conflict do nothing` macht wiederholte Laeufe folgenlos. Deshalb wirken
-- Schwellenaenderungen auch nur nach vorn: Ein bereits gemeldeter Treffer
-- verschwindet nicht, wenn jemand strenger wird.
create or replace function public.sniper_evaluate_hits(p_query_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  with kandidaten as (
      select
          subscription.id as subscription_id,
          listing.id as listing_id,
          massstab.reference_price,
          round(
              (massstab.reference_price - listing.item_price)
              / massstab.reference_price * 100,
              2
          ) as discount_percent
      from public.sniper_query_subscriptions as subscription
      join public.sniper_listings as listing
        on listing.discovered_by_query_id = p_query_id
      cross join lateral public.sniper_reference_price(
          p_query_id, listing.condition
      ) as massstab
      where subscription.query_id = p_query_id
        and subscription.is_active
        and massstab.reference_price is not null
        and massstab.reference_price > 0
        and listing.item_price
            <= massstab.reference_price
               * (1 - subscription.discount_threshold_percent / 100)
  ),
  eingefuegt as (
      insert into public.sniper_hits
          (subscription_id, listing_id, reference_price, discount_percent)
      select subscription_id, listing_id, reference_price, discount_percent
      from kandidaten
      on conflict (subscription_id, listing_id) do nothing
      returning 1
  )
  select count(*)::integer into v_created from eingefuegt;

  return v_created;
end;
$$;

comment on function public.sniper_evaluate_hits(uuid) is
    'Legt fuer alle aktiven Abonnements einer Abfrage die fehlenden Treffer an und liefert deren Zahl. Wiederholte Laeufe sind folgenlos.';

revoke all on function public.sniper_evaluate_hits(uuid) from public, anon, authenticated;
```

Die Funktion wird ausschließlich vom Dienst über den Service-Role-Schlüssel aufgerufen; angemeldete Nutzer brauchen sie nicht.

- [ ] **Step 4: Migration erzeugen, anwenden, bestätigen**

Run: `npx supabase stop && npx supabase db diff -f sniper_evaluate_hits && npx supabase start && npx supabase db reset --local && npm run test:db`

Expected: `All tests successful.`, Exitcode 0.

- [ ] **Step 5: Rechte gegenprüfen**

Run:

```bash
docker exec $(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -1) psql -X -Atq -U postgres -d postgres -c "select grantee, privilege_type from information_schema.role_routine_grants where routine_schema='public' and routine_name='sniper_evaluate_hits' order by grantee;"
```

Expected: weder `anon` noch `authenticated` tauchen auf.

- [ ] **Step 6: Commit**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
git add supabase
git commit -m "feat(sniper): turn unusually cheap listings into hits"
```

---

### Task 4: Der Dienst bewertet nach jedem Speichern

**Files:**

- Modify: `services/sniper/src/store/listing.store.ts`
- Modify: `services/sniper/src/runtime/scheduler.ts`
- Test: `services/sniper/test/runtime/scheduler.spec.ts`, `services/sniper/test/store/listing.store.integration.spec.ts`

**Interfaces:**

- Consumes: `public.sniper_evaluate_hits(uuid)` aus Task 3.
- Produces: `ListingStore.evaluateHits(queryId: string): Promise<number>`; `CycleReport` um `newHits: number` erweitert.

- [ ] **Step 1: Scheduler-Test erweitern**

In `services/sniper/test/runtime/scheduler.spec.ts` innerhalb von `describe('QueryScheduler', …)` anfügen:

```ts
it('bewertet nach dem Speichern und zaehlt die Treffer', async () => {
  const listings = {
    saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
    evaluateHits: vi.fn().mockResolvedValue(2),
  };
  const { scheduler } = build(makeQuery(), { listings });

  const report = await scheduler.runOnce(NOW);

  expect(listings.evaluateHits).toHaveBeenCalledWith('q1');
  expect(report.newHits).toBe(2);
});

it('laesst eine gescheiterte Bewertung den Durchgang nicht abbrechen', async () => {
  // Ein Fund ist gespeichert, auch wenn die Bewertung scheitert. Wuerde der
  // Fehler durchschlagen, bliebe die Abfrage als nicht gepollt stehen und der
  // naechste Durchgang holte dieselben Artikel erneut.
  const listings = {
    saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
    evaluateHits: vi.fn().mockRejectedValue(new Error('evaluation failed')),
  };
  const { scheduler, queries, log } = build(makeQuery(), { listings });

  const report = await scheduler.runOnce(NOW);

  expect(queries.markPolled).toHaveBeenCalledWith('q1', 'ok');
  expect(report.newHits).toBe(0);
  expect(log.error).toHaveBeenCalled();
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd services/sniper && npm test`

Expected: FEHLER, `evaluateHits` ist nicht definiert.

- [ ] **Step 3: Speicher erweitern**

In `services/sniper/src/store/listing.store.ts` als Methode der Klasse `ListingStore` anfügen:

```ts
  /**
   * Laesst die Datenbank die Treffer fuer diese Abfrage bilden und liefert die
   * Zahl der neu entstandenen.
   *
   * Gerechnet wird dort und nicht hier, damit die Oberflaeche spaeter dieselbe
   * Zahl sieht wie der Melder - und damit der Median in einer Abfrage entsteht
   * statt in einer Schleife im Dienst.
   */
  async evaluateHits(queryId: string): Promise<number> {
    const { data, error } = await this.client.rpc('sniper_evaluate_hits', {
      p_query_id: queryId,
    });

    if (error) {
      throw new Error(`evaluating hits failed: ${error.message}`);
    }

    return typeof data === 'number' ? data : 0;
  }
```

- [ ] **Step 4: Taktgeber erweitern**

In `services/sniper/src/runtime/scheduler.ts`:

In `ListingStoreLike` ergänzen:

```ts
  evaluateHits(queryId: string): Promise<number>;
```

In `CycleReport` ergänzen:

```ts
newHits: number;
```

Im Anfangswert des Berichts in `runOnce` `newHits: 0` ergänzen, und in `pollOne` **nach** `report.polled += 1` einfügen:

```ts
// Eine gescheiterte Bewertung darf den Fund nicht entwerten: Gespeichert
// ist er, und die Abfrage gilt als gepollt. Sonst holte der naechste
// Durchgang dieselben Artikel noch einmal.
try {
  report.newHits += await this.deps.listings.evaluateHits(query.id);
} catch (error) {
  this.deps.log.error('evaluate_hits_failed', {
    queryId: query.id,
    reason: error instanceof Error ? error.message : String(error),
  });
}
```

In der Log-Zeile am Ende von `runOnce` `newHits` mit ausgeben.

- [ ] **Step 5: Integrationstest ergänzen**

In `services/sniper/test/store/listing.store.integration.spec.ts` anfügen:

```ts
it('meldet null Treffer, solange die Gruppe zu klein ist', async () => {
  const externalId = randomUUID();
  await store.saveNew([listing(externalId)], queryId);

  // Ein einziger Fund liegt unter der Mindestzahl von acht - die Datenbank
  // darf daraus keinen Massstab und damit keinen Treffer bilden.
  expect(await store.evaluateHits(queryId)).toBe(0);
});
```

- [ ] **Step 6: Alles laufen lassen**

Run: `cd services/sniper && npx tsc --noEmit && npm test && npm run test:integration && npm run build`

Expected: alle vier auf Exitcode 0.

- [ ] **Step 7: Commit**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
git add services/sniper
git commit -m "feat(sniper): evaluate hits after every save"
```

---

## Abschluss

Dieser Plan gilt als erledigt, wenn:

- `npm run test:db` grün ist,
- `cd services/sniper && npx tsc --noEmit && npm test && npm run test:integration && npm run build` alle Exitcode 0 liefern,
- `npm run verify` im Stammverzeichnis Exitcode 0 liefert, ohne Pipe gemessen,
- und ein Lauf von Hand gegen die lokale Datenbank einen echten Treffer erzeugt: Abfrage anlegen, Dienst laufen lassen, bis acht Vergleichswerte im selben Zustand vorliegen, dann einen künstlich günstigen Fund einspielen und die Zeile in `sniper_hits` sehen — mit festgehaltenem Massstab und Abstand.

Danach **entstehen** Treffer. Gesehen werden sie noch nicht.

## Was danach kommt

- **Oberfläche** — eigener Plan: Markentabelle mit Abgleich durch den Dienst, Filterformular, Trefferliste. Ohne sie kann niemand ausser dem Betreiber einen Filter anlegen.
- **Discord-Zustellung** — eigener Plan, klein: Zustellziel je Arbeitsbereich, Melder im Dienst, `notified_at` gegen Doppelmeldungen. Für das Zuschlagen in Minuten ist das der Weg, den die Oberfläche nicht ersetzen kann.

## Bewusst nicht hier

- **Detailseiten-Nachladen** für Verkäuferbewertung, Beschreibung, Land und Aktualisierungszeitpunkt. Lohnend nur für Treffer, nicht für jeden Fund — eigener Schritt.
- **Preishistorie** eines bekannten Artikels — Etappe 3.
- **Aufbewahrungsfrist** auf `sniper_listings` — Etappe 3, wird aber dringender, sobald der Dienst dauerhaft läuft.
- **Betrieb auf dem Server** — Dockerfile und Compose-Eintrag. Dauerbetrieb gegen Vinted von der Produktionsadresse ist eine bewusste Entscheidung, keine Nebenwirkung eines Merges.
