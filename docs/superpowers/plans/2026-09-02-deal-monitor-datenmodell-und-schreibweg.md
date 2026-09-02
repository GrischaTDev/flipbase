# Deal Monitor — Datenmodell und Schreibweg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Arbeitsbereich kann einen Vinted-Filter besitzen, ohne dass andere Arbeitsbereiche ihn sehen — und ohne dass die geteilte Abfrage doppelt gepollt wird.

**Architecture:** Eine Abfrage bleibt eine Zeile in `sniper_queries` und wird einmal gepollt. Die Zugehörigkeit wandert in `sniper_query_subscriptions`; die Sichtbarkeit von Abfragen hängt künftig an dieser Tabelle statt an `using (true)`. Geschrieben wird ausschließlich über eine `security definer`-Funktion, weil `authenticated` die Abfragetabelle weiterhin nicht beschreiben darf.

**Tech Stack:** Supabase (Postgres 15), deklaratives Schema unter `supabase/schemas/`, pgTAP-Tests unter `supabase/tests/`, TypeScript strict im Dienst unter `services/sniper/`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-vinted-deal-monitor-etappe-2-design.md`

## Global Constraints

- Schemaänderungen ausschließlich in `supabase/schemas/50_sniper.sql`. **Niemals** `supabase/schemas/database.sql` anfassen — daran arbeitet parallel jemand anderes.
- Migrations werden erzeugt (`supabase db diff -f <name>`), nicht von Hand in `supabase/migrations/` geschrieben. **Ausnahme:** Tabellenrechte überträgt `db diff` nicht; dafür eine eigene handgeschriebene Migration nach dem Muster von `20260902194744_restrict_sniper_tables.sql`.
- Jede neue Tabelle: RLS aktiv, separate Policy je Operation und Rolle, immer `TO` angeben, `(select auth.uid())` statt `auth.uid()`.
- SQL in Kleinbuchstaben, `snake_case`, Tabellennamen plural, `comment on table` für jede Tabelle.
- Funktionen: `security invoker` als Standard; `security definer` nur wo nötig, dann immer mit `set search_path = ''` und vollqualifizierten Namen.
- pgTAP-Dateien brauchen die Hausumrahmung: `\set ON_ERROR_STOP on`, `begin;`, `select plan(N);`, nach jedem Prüfblock `select pass('…');`, am Ende `select * from finish();` und `rollback;`. Ohne sie meldet `supabase test db` die Datei als „keine Tests ausgeführt" und die CI wird rot.
- Bezeichner im Code englisch. Kommentare und Testbeschreibungen deutsch.
- Vor jedem Commit: `npm run verify` im Stammverzeichnis, Exitcode **ohne Pipe** messen (`npm run verify > log 2>&1; echo $?`).

---

### Task 1: Preisuntergrenze und Abonnement-Tabelle

Die Spec verlangt eine Preis**spanne**. `sniper_queries` kennt nur `price_to`. Die Untergrenze muss zusammen mit der Abonnement-Tabelle kommen, weil sie Teil des Abfrageschlüssels ist — später hinzugefügt, wären alle vorhandenen Schlüssel ungültig.

**Files:**

- Modify: `supabase/schemas/50_sniper.sql`
- Create: `supabase/migrations/<zeitstempel>_deal_monitor_subscriptions.sql` (erzeugt)
- Create: `supabase/migrations/<zeitstempel>_restrict_subscription_tables.sql` (von Hand)
- Test: `supabase/tests/deal_monitor_subscriptions.sql`

**Interfaces:**

- Consumes: `public.sniper_queries(id)` aus Etappe 1, `public.workspaces(id)`, `public.is_workspace_member(uuid)` aus `database.sql`.
- Produces: Tabelle `public.sniper_query_subscriptions` mit Spalten `id`, `workspace_id`, `query_id`, `discount_threshold_percent`, `is_active`, `created_at`; Spalte `public.sniper_queries.price_from`.

- [ ] **Step 1: Datenbanktest schreiben**

Create `supabase/tests/deal_monitor_subscriptions.sql`:

```sql
\set ON_ERROR_STOP on

begin;

select plan(4);

-- Spalten von sniper_query_subscriptions
do $$
declare
  required_columns text[] := array[
    'id', 'workspace_id', 'query_id', 'discount_threshold_percent',
    'is_active', 'created_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sniper_query_subscriptions'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'sniper_query_subscriptions is missing required columns: %', missing_columns;
  end if;
end;
$$;

select pass('sniper_query_subscriptions besitzt alle benoetigten Spalten');

-- Preisuntergrenze an der Abfrage
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sniper_queries'
      and column_name = 'price_from'
  ) then
    raise exception 'sniper_queries.price_from fehlt';
  end if;
end;
$$;

select pass('sniper_queries kennt eine Preisuntergrenze');

-- Ein Arbeitsbereich abonniert eine Abfrage hoechstens einmal.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sniper_query_subscriptions'::regclass
      and contype = 'u'
      and array_length(conkey, 1) = 2
  ) then
    raise exception 'Eindeutigkeit ueber workspace_id und query_id fehlt';
  end if;
end;
$$;

select pass('Ein Arbeitsbereich abonniert eine Abfrage hoechstens einmal');

-- RLS aktiv, und angemeldete Nutzer duerfen nicht schreiben.
do $$
declare
  write_policies text[];
begin
  if not exists (
    select 1 from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and relname = 'sniper_query_subscriptions'
      and relrowsecurity
  ) then
    raise exception 'row level security ist auf sniper_query_subscriptions aus';
  end if;

  select array_agg(policyname order by policyname)
  into write_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'sniper_query_subscriptions'
    and cmd <> 'SELECT'
    and 'authenticated' = any(roles);

  if write_policies is not null then
    raise exception 'authenticated darf nicht schreiben, gefunden: %', write_policies;
  end if;
end;
$$;

select pass('RLS ist aktiv und angemeldete Nutzer duerfen nur lesen');

select * from finish();

rollback;
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm run test:db`

Expected: FEHLER `sniper_query_subscriptions is missing required columns` in `deal_monitor_subscriptions.sql`. Die übrigen Testdateien bleiben grün.

- [ ] **Step 3: Schema ergänzen**

In `supabase/schemas/50_sniper.sql`, in der Definition von `sniper_queries` **hinter** `price_to` einfügen:

```sql
    price_from numeric(12, 2),
```

Und **hinter** dem `comment on column public.sniper_listings.image_urls`-Block, **vor** dem Rechte-Abschnitt, anfügen:

```sql
create table if not exists public.sniper_query_subscriptions (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces (id) on delete cascade,
    query_id uuid not null references public.sniper_queries (id) on delete cascade,
    discount_threshold_percent numeric(5, 2) not null default 30
        check (discount_threshold_percent > 0 and discount_threshold_percent < 100),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    unique (workspace_id, query_id)
);

comment on table public.sniper_query_subscriptions is
    'Verbindet einen Arbeitsbereich mit einer geteilten Abfrage. Die Abfrage bleibt eine Zeile und wird einmal gepollt; sichtbar ist sie nur ihren Abonnenten.';

comment on column public.sniper_query_subscriptions.discount_threshold_percent is
    'Ab wie viel Prozent unter dem Gruppenmedian ein Fund zum Treffer wird. Gehoert an das Abonnement, nicht an die Abfrage: Zwei Arbeitsbereiche mit demselben Filter duerfen unterschiedlich streng sein.';

alter table public.sniper_query_subscriptions enable row level security;

create policy "Mitglieder duerfen eigene Abonnements lesen" on public.sniper_query_subscriptions
    for select to authenticated
    using (public.is_workspace_member(workspace_id));

create index if not exists idx_sniper_query_subscriptions_workspace
    on public.sniper_query_subscriptions (workspace_id);

create index if not exists idx_sniper_query_subscriptions_query
    on public.sniper_query_subscriptions (query_id);
```

- [ ] **Step 4: Migration erzeugen**

Run: `npx supabase stop && npx supabase db diff -f deal_monitor_subscriptions`

Expected: eine neue Datei unter `supabase/migrations/` mit der Tabelle, der Spalte `price_from`, der Policy und den zwei Indizes.

**Die erzeugte Datei lesen.** Sie enthält mit hoher Wahrscheinlichkeit `GRANT ... TO authenticated` mit Schreibrechten — das überträgt `db diff` aus den Voreinstellungen, unabhängig davon, was in der Schemadatei steht.

- [ ] **Step 5: Rechte-Migration von Hand schreiben**

Create `supabase/migrations/<zeitstempel>_restrict_subscription_tables.sql` mit einem Zeitstempel **nach** der eben erzeugten Migration (UTC, Format `YYYYMMDDHHmmss`):

```sql
-- zweck: schreibzugriffe angemeldeter nutzer auf die abonnement-tabelle sperren.
-- betroffen: public.sniper_query_subscriptions.
--
-- geschrieben wird ausschliesslich ueber public.create_sniper_subscription,
-- eine security-definer-funktion. angemeldete nutzer duerfen nur lesen.
--
-- von hand, weil `supabase db diff` tabellenrechte nicht aus dem deklarativen
-- schema uebernimmt - wie schon bei 20260902194744_restrict_sniper_tables.sql.

revoke insert, update, delete on table public.sniper_query_subscriptions from authenticated;
```

- [ ] **Step 6: Anwenden und Erfolg bestätigen**

Run: `npx supabase start && npx supabase db reset --local && npm run test:db`

Expected: `All tests successful.`, Exitcode 0. Die Zahl der Testdateien steigt von 7 auf 8.

- [ ] **Step 7: Rechte gegenprüfen**

Run:

```bash
docker exec $(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -1) psql -X -Atq -U postgres -d postgres -c "select grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='sniper_query_subscriptions' and grantee='authenticated' group by grantee;"
```

Expected: `authenticated|REFERENCES,SELECT,TRIGGER,TRUNCATE` — kein `INSERT`, `UPDATE` oder `DELETE`.

- [ ] **Step 8: Commit**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
```

Expected: `0`.

```bash
git add supabase/schemas/50_sniper.sql supabase/migrations supabase/tests/deal_monitor_subscriptions.sql
git commit -m "feat(sniper): add query subscriptions and a price floor"
```

---

### Task 2: Sichtbarkeit der Abfragen an Abonnements binden

Heute sieht jeder Angemeldete jede Abfrage. Welche Filter jemand beobachtet, ist seine Einkaufsstrategie.

**Files:**

- Modify: `supabase/schemas/50_sniper.sql` (Policy `Angemeldete duerfen Abfragen lesen`)
- Create: `supabase/migrations/<zeitstempel>_scope_sniper_queries_to_subscribers.sql` (erzeugt)
- Test: `supabase/tests/deal_monitor_subscriptions.sql` (erweitern)

**Interfaces:**

- Consumes: `public.sniper_query_subscriptions` aus Task 1.
- Produces: keine neuen Namen; die Policy `Abonnenten duerfen ihre Abfragen lesen` ersetzt die bisherige.

- [ ] **Step 1: Test erweitern**

In `supabase/tests/deal_monitor_subscriptions.sql` die Zeile `select plan(4);` ändern zu `select plan(5);` und **vor** `select * from finish();` einfügen:

```sql
-- Abfragen sind nur fuer Abonnenten sichtbar.
do $$
declare
  offene_policy text;
begin
  select policyname
  into offene_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'sniper_queries'
    and cmd = 'SELECT'
    and 'authenticated' = any(roles)
    and qual = 'true';

  if offene_policy is not null then
    raise exception 'sniper_queries ist fuer alle Angemeldeten lesbar: %', offene_policy;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sniper_queries'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
      and qual like '%sniper_query_subscriptions%'
  ) then
    raise exception 'Keine Leserichtlinie auf sniper_queries, die an Abonnements haengt';
  end if;
end;
$$;

select pass('Abfragen sind nur fuer ihre Abonnenten sichtbar');
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm run test:db`

Expected: FEHLER `sniper_queries ist fuer alle Angemeldeten lesbar: Angemeldete duerfen Abfragen lesen`.

- [ ] **Step 3: Policy ersetzen**

In `supabase/schemas/50_sniper.sql` diesen Block:

```sql
create policy "Angemeldete duerfen Abfragen lesen" on public.sniper_queries
    for select to authenticated
    using (true);
```

ersetzen durch:

```sql
-- Eine Abfrage ist nur fuer die Arbeitsbereiche sichtbar, die sie abonniert
-- haben. Welche Filter jemand beobachtet, ist seine Einkaufsstrategie.
create policy "Abonnenten duerfen ihre Abfragen lesen" on public.sniper_queries
    for select to authenticated
    using (
        exists (
            select 1
            from public.sniper_query_subscriptions as subscription
            where subscription.query_id = public.sniper_queries.id
              and public.is_workspace_member(subscription.workspace_id)
        )
    );
```

- [ ] **Step 4: Migration erzeugen, anwenden, Erfolg bestätigen**

Run: `npx supabase stop && npx supabase db diff -f scope_sniper_queries_to_subscribers && npx supabase start && npx supabase db reset --local && npm run test:db`

Expected: `All tests successful.`, Exitcode 0.

- [ ] **Step 5: Commit**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
git add supabase/schemas/50_sniper.sql supabase/migrations supabase/tests/deal_monitor_subscriptions.sql
git commit -m "feat(sniper): show queries only to their subscribers"
```

---

### Task 3: Trefferliste

**Files:**

- Modify: `supabase/schemas/50_sniper.sql`
- Create: `supabase/migrations/<zeitstempel>_deal_monitor_hits.sql` (erzeugt)
- Create: `supabase/migrations/<zeitstempel>_restrict_hit_tables.sql` (von Hand)
- Test: `supabase/tests/deal_monitor_hits.sql`

**Interfaces:**

- Consumes: `public.sniper_query_subscriptions(id)` aus Task 1, `public.sniper_listings(id)` aus Etappe 1.
- Produces: Tabelle `public.sniper_hits` mit `id`, `subscription_id`, `listing_id`, `reference_price`, `discount_percent`, `created_at`, `notified_at`.

- [ ] **Step 1: Datenbanktest schreiben**

Create `supabase/tests/deal_monitor_hits.sql`:

```sql
\set ON_ERROR_STOP on

begin;

select plan(3);

-- Spalten von sniper_hits
do $$
declare
  required_columns text[] := array[
    'id', 'subscription_id', 'listing_id', 'reference_price',
    'discount_percent', 'created_at', 'notified_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sniper_hits'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'sniper_hits is missing required columns: %', missing_columns;
  end if;
end;
$$;

select pass('sniper_hits besitzt alle benoetigten Spalten');

-- Derselbe Fund wird je Abonnement hoechstens einmal gemeldet.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sniper_hits'::regclass
      and contype = 'u'
      and array_length(conkey, 1) = 2
  ) then
    raise exception 'Eindeutigkeit ueber subscription_id und listing_id fehlt';
  end if;
end;
$$;

select pass('Derselbe Fund wird je Abonnement hoechstens einmal gemeldet');

-- RLS aktiv, angemeldete Nutzer duerfen nicht schreiben.
do $$
declare
  write_policies text[];
begin
  if not exists (
    select 1 from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public' and relname = 'sniper_hits' and relrowsecurity
  ) then
    raise exception 'row level security ist auf sniper_hits aus';
  end if;

  select array_agg(policyname order by policyname)
  into write_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'sniper_hits'
    and cmd <> 'SELECT' and 'authenticated' = any(roles);

  if write_policies is not null then
    raise exception 'authenticated darf nicht schreiben, gefunden: %', write_policies;
  end if;
end;
$$;

select pass('RLS ist aktiv und angemeldete Nutzer duerfen nur lesen');

select * from finish();

rollback;
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm run test:db`

Expected: FEHLER `sniper_hits is missing required columns`.

- [ ] **Step 3: Schema ergänzen**

In `supabase/schemas/50_sniper.sql` hinter dem Abonnement-Block anfügen:

```sql
create table if not exists public.sniper_hits (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid not null
        references public.sniper_query_subscriptions (id) on delete cascade,
    listing_id uuid not null references public.sniper_listings (id) on delete cascade,
    reference_price numeric(12, 2) not null,
    discount_percent numeric(5, 2) not null,
    created_at timestamptz not null default now(),
    notified_at timestamptz,
    unique (subscription_id, listing_id)
);

comment on table public.sniper_hits is
    'Ein Fund, der fuer ein bestimmtes Abonnement auffaellig guenstig war. Gehoert zum Abonnement und nicht zum Fund, weil die Schwelle je Abonnent verschieden ist.';

comment on column public.sniper_hits.reference_price is
    'Der Gruppenmedian zum Zeitpunkt der Bewertung. Festgehalten statt spaeter neu gerechnet - der Median verschiebt sich mit jedem neuen Fund, und ohne diesen Wert waere spaeter nicht nachvollziehbar, warum gemeldet wurde.';

comment on column public.sniper_hits.notified_at is
    'Wann zugestellt wurde. Verhindert Doppelmeldungen ueber Neustarts des Dienstes hinweg.';

alter table public.sniper_hits enable row level security;

create policy "Mitglieder duerfen eigene Treffer lesen" on public.sniper_hits
    for select to authenticated
    using (
        exists (
            select 1
            from public.sniper_query_subscriptions as subscription
            where subscription.id = public.sniper_hits.subscription_id
              and public.is_workspace_member(subscription.workspace_id)
        )
    );

create index if not exists idx_sniper_hits_subscription
    on public.sniper_hits (subscription_id, created_at desc);

create index if not exists idx_sniper_hits_pending_notification
    on public.sniper_hits (created_at)
    where notified_at is null;
```

- [ ] **Step 4: Migration erzeugen und Rechte-Migration schreiben**

Run: `npx supabase stop && npx supabase db diff -f deal_monitor_hits`

Danach `supabase/migrations/<zeitstempel>_restrict_hit_tables.sql`:

```sql
-- zweck: schreibzugriffe angemeldeter nutzer auf die trefferliste sperren.
-- betroffen: public.sniper_hits.
--
-- treffer entstehen ausschliesslich im dienst ueber den service-role-schluessel.

revoke insert, update, delete on table public.sniper_hits from authenticated;
```

- [ ] **Step 5: Anwenden und Erfolg bestätigen**

Run: `npx supabase start && npx supabase db reset --local && npm run test:db`

Expected: `All tests successful.`, Exitcode 0. Neun Testdateien.

- [ ] **Step 6: Commit**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
git add supabase/schemas/50_sniper.sql supabase/migrations supabase/tests/deal_monitor_hits.sql
git commit -m "feat(sniper): add the hit list per subscription"
```

---

### Task 4: Anlege-Funktion

`authenticated` darf `sniper_queries` nicht beschreiben. Die Funktion legt die geteilte Abfrage an **oder verwendet die vorhandene wieder** und erzeugt das Abonnement.

**Files:**

- Modify: `supabase/schemas/50_sniper.sql`
- Create: `supabase/migrations/<zeitstempel>_create_sniper_subscription.sql` (erzeugt)
- Test: `supabase/tests/deal_monitor_subscription_rpc.sql`

**Interfaces:**

- Consumes: `public.sniper_queries`, `public.sniper_query_subscriptions`, `public.is_workspace_member(uuid)`.
- Produces: `public.create_sniper_subscription(p_workspace_id uuid, p_search_text text, p_brand_id integer, p_price_from numeric, p_price_to numeric, p_threshold numeric) returns uuid` — liefert die `id` des Abonnements.

- [ ] **Step 1: Datenbanktest schreiben**

Create `supabase/tests/deal_monitor_subscription_rpc.sql`:

```sql
\set ON_ERROR_STOP on

begin;

select plan(4);

-- Zwei Arbeitsbereiche mit demselben Filter teilen sich eine Abfrage.
do $$
declare
  workspace_a uuid := '84000000-0000-4000-8000-000000000001';
  workspace_b uuid := '84000000-0000-4000-8000-000000000002';
  subscription_a uuid;
  subscription_b uuid;
  queries integer;
begin
  insert into public.workspaces (id, name) values
    (workspace_a, 'Testbereich A'), (workspace_b, 'Testbereich B');

  subscription_a := public.create_sniper_subscription(
    workspace_a, '  Nike   Air Max ', 53, null, 50, 30
  );
  subscription_b := public.create_sniper_subscription(
    workspace_b, 'nike air max', 53, null, 50, 25
  );

  select count(*) into queries
  from public.sniper_queries
  where query_key = 'vinted|search=nike air max|catalog=-|brand=53|price_from=-|price_to=50';

  if queries <> 1 then
    raise exception 'Erwartet wurde genau eine geteilte Abfrage, gefunden: %', queries;
  end if;

  if subscription_a = subscription_b then
    raise exception 'Beide Arbeitsbereiche haben dasselbe Abonnement bekommen';
  end if;
end;
$$;

select pass('Gleicher Filter, eine Abfrage, zwei Abonnements');

-- Die Schwelle gehoert an das Abonnement.
do $$
declare
  schwellen numeric[];
begin
  select array_agg(discount_threshold_percent order by discount_threshold_percent)
  into schwellen
  from public.sniper_query_subscriptions
  where workspace_id in (
    '84000000-0000-4000-8000-000000000001'::uuid,
    '84000000-0000-4000-8000-000000000002'::uuid
  );

  if schwellen <> array[25, 30]::numeric[] then
    raise exception 'Erwartet wurden die Schwellen 25 und 30, gefunden: %', schwellen;
  end if;
end;
$$;

select pass('Jedes Abonnement traegt seine eigene Schwelle');

-- Zweimal derselbe Filter im selben Arbeitsbereich legt nichts doppelt an.
do $$
declare
  erstes uuid;
  zweites uuid;
  anzahl integer;
begin
  erstes := public.create_sniper_subscription(
    '84000000-0000-4000-8000-000000000001'::uuid, 'nike air max', 53, null, 50, 30
  );
  zweites := public.create_sniper_subscription(
    '84000000-0000-4000-8000-000000000001'::uuid, 'nike air max', 53, null, 50, 40
  );

  select count(*) into anzahl
  from public.sniper_query_subscriptions
  where workspace_id = '84000000-0000-4000-8000-000000000001'::uuid;

  if erstes <> zweites or anzahl <> 1 then
    raise exception 'Erwartet wurde ein einziges Abonnement, gefunden: % (% und %)', anzahl, erstes, zweites;
  end if;
end;
$$;

select pass('Derselbe Filter zweimal angelegt bleibt ein Abonnement');

-- Nachlaufende Nullen duerfen den Schluessel nicht spalten.
do $$
declare
  workspace_c uuid := '84000000-0000-4000-8000-000000000003';
  ignored uuid;
  queries integer;
begin
  insert into public.workspaces (id, name) values (workspace_c, 'Testbereich C');

  ignored := public.create_sniper_subscription(workspace_c, 'adidas samba', null, null, 50.00, 30);
  ignored := public.create_sniper_subscription(workspace_c, 'adidas samba', null, null, 50, 30);

  select count(*) into queries
  from public.sniper_queries
  where search_text = 'adidas samba';

  if queries <> 1 then
    raise exception '50.00 und 50 haben % Abfragen erzeugt statt einer', queries;
  end if;
end;
$$;

select pass('50.00 und 50 ergeben denselben Abfrageschluessel');

select * from finish();

rollback;
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm run test:db`

Expected: FEHLER `function public.create_sniper_subscription(...) does not exist`.

- [ ] **Step 3: Abfrageschlüssel um die Untergrenze erweitern**

Der Test erwartet `price_from=-` im Schlüssel. Damit Dienst und Datenbank denselben Schlüssel bilden, muss beides geändert werden — der Dienst in Task 5.

In `supabase/schemas/50_sniper.sql` hinter dem Trefferblock anfügen:

```sql
-- Angemeldete duerfen sniper_queries nicht beschreiben. Diese Funktion legt die
-- geteilte Abfrage an oder verwendet die vorhandene wieder und erzeugt das
-- Abonnement. Der Schluessel muss zeichengenau dem entsprechen, was
-- services/sniper/src/domain/query.ts bildet - sonst zerfaellt die Zusammenfassung
-- und derselbe Filter wuerde zweimal gepollt.
create or replace function public.create_sniper_subscription(
    p_workspace_id uuid,
    p_search_text text,
    p_brand_id integer,
    p_price_from numeric,
    p_price_to numeric,
    p_threshold numeric default 30
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search_text text;
  v_query_key text;
  v_query_id uuid;
  v_subscription_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Kein Mitglied dieses Arbeitsbereichs';
  end if;

  v_search_text := lower(btrim(regexp_replace(p_search_text, '\s+', ' ', 'g')));

  if v_search_text = '' then
    raise exception 'Der Suchbegriff darf nicht leer sein';
  end if;

  -- trim_scale streicht nachlaufende Nullen: 50.00 und 50 muessen denselben
  -- Schluessel ergeben, sonst legt derselbe Filter zwei Abfragen an und wird
  -- zweimal gepollt - genau der Sparmechanismus, um den es hier geht.
  v_query_key := concat_ws('|',
    'vinted',
    'search=' || v_search_text,
    'catalog=-',
    'brand=' || coalesce(p_brand_id::text, '-'),
    'price_from=' || coalesce(trim_scale(p_price_from)::text, '-'),
    'price_to=' || coalesce(trim_scale(p_price_to)::text, '-')
  );

  insert into public.sniper_queries (query_key, search_text, brand_id, price_from, price_to)
  values (v_query_key, v_search_text, p_brand_id, p_price_from, p_price_to)
  on conflict (query_key) do nothing;

  select id into v_query_id from public.sniper_queries where query_key = v_query_key;

  insert into public.sniper_query_subscriptions
    (workspace_id, query_id, discount_threshold_percent)
  values (p_workspace_id, v_query_id, p_threshold)
  on conflict (workspace_id, query_id) do nothing;

  select id into v_subscription_id
  from public.sniper_query_subscriptions
  where workspace_id = p_workspace_id and query_id = v_query_id;

  return v_subscription_id;
end;
$$;

revoke all on function public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric) from public, anon;
grant execute on function public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric) to authenticated;
```

- [ ] **Step 4: Migration erzeugen, anwenden, Erfolg bestätigen**

Run: `npx supabase stop && npx supabase db diff -f create_sniper_subscription && npx supabase start && npx supabase db reset --local && npm run test:db`

Expected: `All tests successful.`, Exitcode 0. Zehn Testdateien.

- [ ] **Step 5: Commit**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
git add supabase/schemas/50_sniper.sql supabase/migrations supabase/tests/deal_monitor_subscription_rpc.sql
git commit -m "feat(sniper): let members subscribe to a shared query"
```

---

### Task 5: Preisuntergrenze im Dienst

Datenbank und Dienst müssen denselben Abfrageschlüssel bilden. Und eine gespeicherte Untergrenze, die nie an Vinted geht, wäre eine Lüge in der Oberfläche.

**Files:**

- Modify: `services/sniper/src/domain/query.ts`
- Modify: `services/sniper/src/store/query.store.ts`
- Modify: `services/sniper/src/vinted/collector.ts`
- Test: `services/sniper/test/domain/query-key.spec.ts`, `services/sniper/test/vinted/collector.spec.ts`

**Interfaces:**

- Consumes: `SniperQuery` aus `services/sniper/src/domain/query.ts`.
- Produces: `QueryKeyInput` und `SniperQuery` um `priceFrom: number | null` erweitert; `buildQueryKey` liefert `…|price_from=<wert oder ->|price_to=<wert oder ->`.

- [ ] **Step 1: Schlüsseltest erweitern**

In `services/sniper/test/domain/query-key.spec.ts` anfügen:

```ts
it('nimmt die Preisuntergrenze in den Schluessel auf', () => {
  const withFloor = buildQueryKey({ searchText: 'nike air max', priceFrom: 10, priceTo: 50 });
  const withoutFloor = buildQueryKey({ searchText: 'nike air max', priceTo: 50 });

  // Der Schluessel ist die Identitaet einer Abfrage. Fehlte die Untergrenze,
  // teilten sich zwei verschiedene Filter eine Abfrage - und einer bekaeme
  // Ergebnisse, die er nie angefordert hat.
  expect(withFloor).toBe('vinted|search=nike air max|catalog=-|brand=-|price_from=10|price_to=50');
  expect(withoutFloor).toBe(
    'vinted|search=nike air max|catalog=-|brand=-|price_from=-|price_to=50',
  );
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `cd services/sniper && npm test`

Expected: FEHLER, der erzeugte Schlüssel enthält kein `price_from`.

- [ ] **Step 3: Schlüssel und Modell erweitern**

In `services/sniper/src/domain/query.ts`:

In `QueryKeyInput` hinter `priceTo?: number | null;` einfügen:

```ts
  priceFrom?: number | null;
```

In `SniperQuery` hinter `priceTo: number | null;` einfügen:

```ts
priceFrom: number | null;
```

In `buildQueryKey` die Rückgabe ersetzen durch:

```ts
return [
  'vinted',
  `search=${searchText}`,
  `catalog=${part(input.catalogId)}`,
  `brand=${part(input.brandId)}`,
  `price_from=${part(input.priceFrom)}`,
  `price_to=${part(input.priceTo)}`,
].join('|');
```

- [ ] **Step 4: Speicher und Sammler nachziehen**

In `services/sniper/src/store/query.store.ts`:

- In `QueryRow` hinter `price_to: string | number | null;` einfügen: `price_from: string | number | null;`
- In `COLUMNS` `price_to` zu `price_to, price_from` erweitern
- In `toQuery` hinter der `priceTo`-Zeile einfügen:

```ts
    priceFrom: row.price_from === null ? null : Number(row.price_from),
```

In `services/sniper/src/vinted/collector.ts` hinter der `price_to`-Zeile einfügen:

```ts
if (query.priceFrom !== null) url.searchParams.set('price_from', String(query.priceFrom));
```

- [ ] **Step 5: Sammlertest ergänzen**

In `services/sniper/test/vinted/collector.spec.ts` anfügen:

```ts
it('reicht die Preisuntergrenze an Vinted weiter', async () => {
  const fetchFn = vi.fn().mockResolvedValueOnce(homepage()).mockResolvedValueOnce(catalog());

  await build(fetchFn).collect({ ...query, priceFrom: 10 });

  const url = new URL(fetchFn.mock.calls[1]![0] as string);
  expect(url.searchParams.get('price_from')).toBe('10');
});
```

- [ ] **Step 6: Alles laufen lassen**

Run: `cd services/sniper && npx tsc --noEmit && npm test && npm run build`

Expected: Exitcode 0 bei allen dreien. Der Typprüfer meldet die Stellen, an denen `SniperQuery`-Literale in Tests noch `priceFrom` fehlt — dort `priceFrom: null` ergänzen.

- [ ] **Step 7: Integrationstest gegen die Datenbank**

Run: `cd services/sniper && npm run test:integration`

Expected: Exitcode 0. Der Test `reads the price ceiling back as a number` deckt jetzt beide Grenzen ab.

- [ ] **Step 8: Commit**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
git add services/sniper
git commit -m "feat(sniper): carry the price floor into the query key and request"
```

---

## Abschluss

Teil 1 gilt als erledigt, wenn:

- `npm run test:db` mit zehn Testdateien grün ist,
- `cd services/sniper && npm test && npm run test:integration && npx tsc --noEmit && npm run build` alle Exitcode 0 liefern,
- `npm run verify` im Stammverzeichnis Exitcode 0 liefert, ohne Pipe gemessen,
- ein Aufruf von `create_sniper_subscription` mit demselben Filter aus zwei Arbeitsbereichen genau **eine** Zeile in `sniper_queries` und **zwei** in `sniper_query_subscriptions` erzeugt.

Danach kann ein Arbeitsbereich einen Filter besitzen. Sichtbar wird davon noch nichts — das ist Teil 3.

## Bewusst nicht hier

- **Trefferberechnung und Zustellung** — Teil 2. Die Tabelle `sniper_hits` entsteht hier, gefüllt wird sie dort.
- **Oberfläche** — Teil 3.
- **Kategorie-Filter** — Endpunkt unbekannt, siehe Spec.
- **Markensuche im Frontend** — gehört zum Formular in Teil 3. Die Funktion nimmt `p_brand_id` schon entgegen.
