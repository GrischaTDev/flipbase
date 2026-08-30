# Vinted Deal Monitor – Etappe 1 (Sammeln und Speichern) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein eigenständiger Node-Dienst holt neue Vinted-Angebote über enge Abfragen, verwirft dabei alle Verkäuferdaten und legt die Artikel nachweislich in Supabase ab – ohne Filter, ohne Zustellung, ohne Oberfläche.

**Architecture:** Der Dienst liegt vollständig unter `services/sniper/` mit eigener `package.json`, eigenem `tsconfig.json` und eigener Vitest-Konfiguration. Er ist damit für den Root-Vitest (`include: ['src/**/*.spec.ts']`) und den Root-Typecheck (`tsconfig.app.json`/`tsconfig.spec.json`, beide nur `src/**`) unsichtbar und kollidiert nicht mit dem laufenden Test- und CI-Umbau auf `master`. Die Bausteine sind nach Verantwortung getrennt: Sitzung, Sammler, Schema, Normalizer, Speicher, Budget, Taktgeber. Die gesamte Logik ohne Netz und ohne Datenbank ist als reine Funktion prüfbar.

**Tech Stack:** Node 22+, TypeScript strict, `zod@4`, `@supabase/supabase-js@2`, `dotenv`, Vitest, natives `fetch`. Keine nativen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-08-30-vinted-deal-monitor-design.md` (Abschnitt „Natürliche Etappen", Etappe 1)

## Global Constraints

- **Node 22 oder neuer.** Keine nativen Abhängigkeiten; falls je ein lokaler Zwischenspeicher nötig wird, `node:sqlite`, niemals `better-sqlite3`.
- **Keine Änderung an Root-Konfiguration.** `package.json`, `vitest.config.ts`, `tsconfig.*.json`, `eslint.config.js`, `.github/workflows/ci.yml` bleiben unangetastet. Der Test- und CI-Umbau läuft parallel auf `master`; jede Änderung dort würde beim Zusammenführen kollidieren.
- **Root-Prettier und Root-ESLint greifen trotzdem.** `npm run format:check` prüft `.` und `eslint.config.js` prüft `**/*.ts`. Neue Dateien müssen beides bestehen: Prettier mit `printWidth: 100` und `singleQuote: true`, ESLint mit `@typescript-eslint` recommended plus stylistic.
- **Bezeichner englisch.** Deutsch nur in Kommentaren, Log-Texten und Dokumentation.
- **Keine Verkäuferdaten.** `user.id`, `user.login`, `user.profile_url` und das Profilfoto dürfen den Normalizer nicht passieren und nirgends gespeichert werden. Das gilt auch für die Testfixture: die aufgezeichnete Antwort wird beim Aufzeichnen pseudonymisiert.
- **`total_item_price`, nicht `price`.** Gespeichert wird der Gesamtpreis inklusive Käuferschutz.
- **Höchstens Seite 1 mit 96 Artikeln je Abfrage.** `per_page=96`; mehr liefert Vinted nicht, tiefer blättern ist in dieser Etappe ausgeschlossen.
- **Kein Test darf echte Anfragen an Vinted stellen.** `fetch` wird überall eingespeist. Einzige Ausnahme ist das bewusst manuell ausgeführte Aufzeichnungsskript aus Task 4.
- **Einlese-Lauf.** Die erste Runde einer Abfrage schreibt nur und meldet nichts als neu.
- **Anfragebudget.** Der Dienst überschreitet nie die konfigurierte Zahl an Anfragen je Minute, unabhängig davon, wie viele Abfragen fällig sind.
- Jeder Task folgt RED → GREEN → Refactor und endet mit einem eigenen Commit.

---

## File Map

**Datenbank (bestehende Dateien, bewusst angefasst – vom CI-Umbau nicht berührt):**

- Modify `supabase/schemas/database.sql`: Abschnitt `18. VINTED DEAL MONITOR` mit zwei Tabellen, RLS, Richtlinien und Indizes.
- Create `supabase/migrations/<zeitstempel>_vinted_deal_monitor.sql`: erzeugt, nicht handgeschrieben.
- Create `supabase/tests/vinted_deal_monitor_schema.sql`: prüft Spalten, RLS, fehlende Schreibrichtlinien und die Abwesenheit von Verkäuferspalten.

**Dienst (alles neu):**

- Create `services/sniper/package.json`: eigene Abhängigkeiten und Skripte.
- Create `services/sniper/tsconfig.json`: strict, `NodeNext`, nur Typprüfung.
- Create `services/sniper/tsconfig.build.json`: erzeugt `dist/` für den Betrieb.
- Create `services/sniper/.gitignore`: `dist/`, `node_modules/`, `.env`.
- Create `services/sniper/vitest.config.ts`: Node-Umgebung, nur Unit-Tests.
- Create `services/sniper/vitest.integration.config.ts`: nur Integrationstests gegen die lokale Datenbank.
- Create `services/sniper/.env.example`: benötigte Umgebungsvariablen.
- Create `services/sniper/README.md`: Start, Betrieb, Grenzen.
- Create `services/sniper/Dockerfile`: Betriebsabbild.
- Create `services/sniper/scripts/record-fixture.mjs`: zeichnet eine echte Vinted-Antwort auf und pseudonymisiert die Verkäuferdaten.
- Create `services/sniper/src/config.ts`: Umgebungsvariablen mit Zod prüfen.
- Create `services/sniper/src/log.ts`: einzeilige, strukturierte Ausgabe ohne Geheimnisse.
- Create `services/sniper/src/domain/listing.ts`: `MarketplaceListing`, `Money`.
- Create `services/sniper/src/domain/query.ts`: `SniperQuery`, `QueryStatus`, `buildQueryKey`.
- Create `services/sniper/src/vinted/schema.ts`: Zod-Schema der Katalogantwort.
- Create `services/sniper/src/vinted/normalizer.ts`: Rohartikel zu `MarketplaceListing`.
- Create `services/sniper/src/vinted/session.ts`: Cookies halten, bei 401 neu aufwärmen.
- Create `services/sniper/src/vinted/collector.ts`: eine Abfrage ausführen, Fehler klassifizieren.
- Create `services/sniper/src/vinted/errors.ts`: `RateLimitedError`, `ForbiddenError`, `UnauthorizedError`, `VintedHttpError`.
- Create `services/sniper/src/runtime/budget.ts`: `RequestBudget`.
- Create `services/sniper/src/runtime/scheduler.ts`: `QueryScheduler`, Einlese-Lauf, Fehlerreaktion.
- Create `services/sniper/src/store/supabase.ts`: Client mit Service-Role-Schlüssel.
- Create `services/sniper/src/store/query.store.ts`: fällige Abfragen lesen, Zustand fortschreiben.
- Create `services/sniper/src/store/listing.store.ts`: schreiben und wirklich neue zurückmelden.
- Create `services/sniper/src/health.ts`: Health-Zustand und Endpunkt `/health`.
- Create `services/sniper/src/index.ts`: Einstiegspunkt, sauberes Beenden.

**Tests:**

- Create `services/sniper/test/fixtures/vinted-catalog.json`: aufgezeichnet, pseudonymisiert.
- Create `services/sniper/test/domain/query-key.spec.ts`
- Create `services/sniper/test/vinted/schema.spec.ts`
- Create `services/sniper/test/vinted/normalizer.spec.ts`
- Create `services/sniper/test/vinted/session.spec.ts`
- Create `services/sniper/test/vinted/collector.spec.ts`
- Create `services/sniper/test/runtime/budget.spec.ts`
- Create `services/sniper/test/runtime/scheduler.spec.ts`
- Create `services/sniper/test/config.spec.ts`
- Create `services/sniper/test/health.spec.ts`
- Create `services/sniper/test/store/listing.store.integration.spec.ts`
- Create `services/sniper/test/store/query.store.integration.spec.ts`

---

### Task 1: Datenbankschema für Sammeln und Speichern

**Files:**

- Modify: `supabase/schemas/database.sql` (Abschnitt am Ende der Tabellendefinitionen, RLS-Block, Richtlinienblock, Indexblock)
- Create: `supabase/migrations/<zeitstempel>_vinted_deal_monitor.sql`
- Test: `supabase/tests/vinted_deal_monitor_schema.sql`

**Interfaces:**

- Consumes: bestehende Hilfsfunktion `public.is_workspace_member(uuid)` wird hier **nicht** gebraucht, weil beide Tabellen arbeitsbereichsübergreifend sind.
- Produces: Tabellen `public.sniper_queries` und `public.sniper_listings` mit den Spaltennamen, die Task 9 in den Stores verwendet.

- [ ] **Step 1: Datenbanktest schreiben**

Create `supabase/tests/vinted_deal_monitor_schema.sql`:

```sql
begin;

-- Spalten von sniper_queries
do $$
declare
  required_columns text[] := array[
    'id', 'query_key', 'marketplace', 'search_text', 'catalog_id', 'brand_id',
    'price_to', 'is_standard', 'poll_interval_ms', 'is_seeded', 'is_active',
    'last_polled_at', 'last_status', 'consecutive_failures'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sniper_queries'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'sniper_queries is missing required columns: %', missing_columns;
  end if;
end;
$$;

-- Spalten von sniper_listings
do $$
declare
  required_columns text[] := array[
    'id', 'marketplace', 'external_id', 'title', 'url', 'image_url',
    'total_price', 'currency', 'brand', 'size', 'condition',
    'photo_uploaded_at', 'discovered_by_query_id', 'first_seen_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sniper_listings'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'sniper_listings is missing required columns: %', missing_columns;
  end if;
end;
$$;

-- Keine Verkaeuferdaten. Diese Pruefung ist der Datenschutzriegel auf Schemaebene.
do $$
declare
  forbidden_columns text[];
begin
  select array_agg(column_name order by column_name)
  into forbidden_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sniper_listings'
    and (
      column_name like '%seller%'
      or column_name like '%user%'
      or column_name like '%profile%'
      or column_name like '%login%'
    );

  if forbidden_columns is not null then
    raise exception 'sniper_listings must not store seller data, found: %', forbidden_columns;
  end if;
end;
$$;

-- RLS ist aktiv
do $$
declare
  unprotected text[];
begin
  select array_agg(relname order by relname)
  into unprotected
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'public'
    and relname in ('sniper_queries', 'sniper_listings')
    and relrowsecurity = false;

  if unprotected is not null then
    raise exception 'row level security is disabled on: %', unprotected;
  end if;
end;
$$;

-- Angemeldete Nutzer duerfen lesen, aber nicht schreiben.
do $$
declare
  write_policies text[];
  read_policies integer;
begin
  select array_agg(policyname order by policyname)
  into write_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('sniper_queries', 'sniper_listings')
    and cmd <> 'SELECT'
    and 'authenticated' = any(roles);

  if write_policies is not null then
    raise exception 'authenticated must not have write policies, found: %', write_policies;
  end if;

  select count(*)
  into read_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('sniper_queries', 'sniper_listings')
    and cmd = 'SELECT'
    and 'authenticated' = any(roles);

  if read_policies <> 2 then
    raise exception 'expected exactly 2 select policies for authenticated, found %', read_policies;
  end if;
end;
$$;

rollback;
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
npm run supabase:start
```

Danach:

```bash
npx supabase db query --local -f supabase/tests/vinted_deal_monitor_schema.sql
```

Erwartung: FEHLER `sniper_queries is missing required columns` – die Tabelle existiert noch nicht.

- [ ] **Step 3: Schema ergänzen**

In `supabase/schemas/database.sql` **nach** dem Abschnitt `-- 17. MARKET RESEARCH QUERY LOGS` und dessen Tabellen einfügen:

```sql
-- ==============================================================================
-- 18. VINTED DEAL MONITOR
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sniper_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_key TEXT NOT NULL UNIQUE,
    marketplace TEXT NOT NULL DEFAULT 'vinted',
    search_text TEXT NOT NULL,
    catalog_id INTEGER,
    brand_id INTEGER,
    price_to NUMERIC,
    is_standard BOOLEAN NOT NULL DEFAULT FALSE,
    poll_interval_ms INTEGER NOT NULL DEFAULT 60000,
    is_seeded BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_polled_at TIMESTAMPTZ,
    last_status TEXT NOT NULL DEFAULT 'never_polled'
        CHECK (last_status IN ('never_polled', 'ok', 'rate_limited', 'forbidden', 'failed')),
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sniper_queries IS
  'Eine Abfrage ist die Einheit, die tatsaechlich bei Vinted gepollt wird. Gleiche Filter mehrerer Arbeitsbereiche teilen sich ueber query_key eine Zeile.';

CREATE TABLE IF NOT EXISTS public.sniper_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace TEXT NOT NULL DEFAULT 'vinted',
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    total_price NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    brand TEXT,
    size TEXT,
    condition TEXT,
    photo_uploaded_at TIMESTAMPTZ,
    discovered_by_query_id UUID REFERENCES public.sniper_queries(id) ON DELETE SET NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (marketplace, external_id)
);

COMMENT ON TABLE public.sniper_listings IS
  'Gefundene Angebote, geteilt ueber alle Arbeitsbereiche. Enthaelt bewusst keine Verkaeuferdaten; total_price ist der Gesamtpreis inklusive Kaeuferschutz.';
```

Im RLS-Block zu den bestehenden `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`-Zeilen ergänzen:

```sql
ALTER TABLE public.sniper_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sniper_listings ENABLE ROW LEVEL SECURITY;
```

Im Richtlinienblock hinter den bestehenden Richtlinien ergänzen:

```sql
-- sniper_queries und sniper_listings sind arbeitsbereichsuebergreifend.
-- Angemeldete Nutzer duerfen ausschliesslich lesen; geschrieben wird nur
-- vom Dienst ueber den Service-Role-Schluessel, der RLS umgeht.
CREATE POLICY sniper_queries_select ON public.sniper_queries FOR SELECT TO authenticated
    USING (TRUE);
CREATE POLICY sniper_listings_select ON public.sniper_listings FOR SELECT TO authenticated
    USING (TRUE);
```

Im Indexblock hinter den bestehenden Indizes ergänzen:

```sql
CREATE INDEX IF NOT EXISTS idx_sniper_queries_due
    ON public.sniper_queries(is_active, last_polled_at);
CREATE INDEX IF NOT EXISTS idx_sniper_listings_first_seen_at
    ON public.sniper_listings(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_sniper_listings_discovered_by_query_id
    ON public.sniper_listings(discovered_by_query_id);
```

- [ ] **Step 4: Migration erzeugen**

```bash
npm run supabase:stop
```

```bash
npx supabase db diff -f vinted_deal_monitor
```

Erwartung: eine neue Datei unter `supabase/migrations/` mit beiden Tabellen, beiden Richtlinien und den drei Indizes. Die Datei wird gelesen, aber nicht von Hand verändert.

- [ ] **Step 5: Test laufen lassen und Erfolg bestätigen**

```bash
npm run supabase:reset
```

```bash
npx supabase db query --local -f supabase/tests/vinted_deal_monitor_schema.sql
```

Erwartung: kein Fehler, Ausgabe endet mit `ROLLBACK`.

- [ ] **Step 6: Commit**

```bash
git add supabase/schemas/database.sql supabase/migrations supabase/tests/vinted_deal_monitor_schema.sql
git commit -m "feat(sniper): add collector tables for the Vinted deal monitor"
```

---

### Task 2: Dienstgerüst und Konfiguration

**Files:**

- Create: `services/sniper/package.json`, `services/sniper/tsconfig.json`, `services/sniper/tsconfig.build.json`, `services/sniper/.gitignore`, `services/sniper/vitest.config.ts`, `services/sniper/vitest.integration.config.ts`, `services/sniper/.env.example`, `services/sniper/src/config.ts`, `services/sniper/src/log.ts`
- Test: `services/sniper/test/config.spec.ts`

**Interfaces:**

- Produces: `loadConfig(env: NodeJS.ProcessEnv): SnipeConfig` und `createLogger(): Logger` mit `info(event: string, fields?: Record<string, unknown>): void` und `error(event: string, fields?: Record<string, unknown>): void`. Alle folgenden Tasks nutzen genau diese Signaturen.

- [ ] **Step 1: Gerüstdateien anlegen**

Create `services/sniper/package.json`:

```json
{
  "name": "@flipbase/sniper",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "typecheck": "tsc --noEmit",
    "record:fixture": "node scripts/record-fixture.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "dotenv": "^17.2.1",
    "zod": "^4.1.5"
  },
  "devDependencies": {
    "@types/node": "^22.17.2",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```

Create `services/sniper/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts", "vitest.integration.config.ts"]
}
```

Create `services/sniper/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

Create `services/sniper/.gitignore`:

```gitignore
dist/
node_modules/
.env
```

Die `/dist`-Regel der Wurzel ist auf das Stammverzeichnis verankert und greift hier nicht.

**Warum ein Bauschritt und kein `node --experimental-strip-types`:** Node kann TypeScript zwar direkt ausführen, löst dabei aber `./config.js` nicht auf `config.ts` auf – das ist gemessen und schlägt mit `ERR_MODULE_NOT_FOUND` fehl. Die Alternative wären `.ts`-Endungen in allen Importen; ein normaler `tsc`-Lauf ist die kleinere Überraschung und kommt ohne experimentelle Schalter aus. `npm run dev` bleibt bei `tsx`, das die Auflösung übernimmt.

Create `services/sniper/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.spec.ts'],
    exclude: ['test/**/*.integration.spec.ts'],
  },
});
```

Create `services/sniper/vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.integration.spec.ts'],
    // Die Tests teilen sich eine Datenbank und duerfen sich nicht ueberholen.
    fileParallelism: false,
  },
});
```

Create `services/sniper/.env.example`:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=
VINTED_BASE_URL=https://www.vinted.de
SNIPER_REQUESTS_PER_MINUTE=30
SNIPER_TICK_INTERVAL_MS=5000
SNIPER_USER_AGENT=Mozilla/5.0 (compatible; FlipbaseSniper/0.1)
```

- [ ] **Step 2: Fehlschlagenden Test schreiben**

Create `services/sniper/test/config.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const validEnv = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig(validEnv);

    expect(config.vintedBaseUrl).toBe('https://www.vinted.de');
    expect(config.requestsPerMinute).toBe(30);
    expect(config.tickIntervalMs).toBe(5000);
  });

  it('rejects a missing service role key', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'http://127.0.0.1:54321' })).toThrow();
  });

  it('rejects a request budget below one per minute', () => {
    expect(() => loadConfig({ ...validEnv, SNIPER_REQUESTS_PER_MINUTE: '0' })).toThrow();
  });
});
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && npm install && npm test
```

Erwartung: FEHLER `Failed to resolve import "../src/config.js"`.

- [ ] **Step 4: Konfiguration und Logger umsetzen**

Create `services/sniper/src/config.ts`:

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  VINTED_BASE_URL: z.string().min(1).default('https://www.vinted.de'),
  SNIPER_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).default(30),
  SNIPER_TICK_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  SNIPER_USER_AGENT: z.string().min(1).default('Mozilla/5.0 (compatible; FlipbaseSniper/0.1)'),
});

export interface SnipeConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  vintedBaseUrl: string;
  requestsPerMinute: number;
  tickIntervalMs: number;
  userAgent: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): SnipeConfig {
  const parsed = EnvSchema.parse(env);

  return {
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    vintedBaseUrl: parsed.VINTED_BASE_URL,
    requestsPerMinute: parsed.SNIPER_REQUESTS_PER_MINUTE,
    tickIntervalMs: parsed.SNIPER_TICK_INTERVAL_MS,
    userAgent: parsed.SNIPER_USER_AGENT,
  };
}
```

Create `services/sniper/src/log.ts`:

```ts
export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/**
 * Eine Zeile je Ereignis, damit sich der Betrieb mit `grep` auswerten laesst.
 * Geheimnisse gehoeren nie in `fields` - der Aufrufer entscheidet, was er uebergibt.
 */
export function createLogger(sink: Pick<Console, 'log' | 'error'> = console): Logger {
  const line = (level: string, event: string, fields?: Record<string, unknown>): string => {
    const parts = Object.entries(fields ?? {}).map(([key, value]) => `${key}=${String(value)}`);
    return [new Date().toISOString(), level, event, ...parts].join(' ');
  };

  return {
    info: (event, fields) => sink.log(line('info', event, fields)),
    error: (event, fields) => sink.error(line('error', event, fields)),
  };
}
```

- [ ] **Step 5: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: 3 Tests bestanden.

- [ ] **Step 6: Root-Prüfungen bestehen**

Vom Repo-Stammverzeichnis:

```bash
npx prettier --check services/ && npx eslint services/
```

Erwartung: beide ohne Befund. Bei Prettier-Meldungen `npx prettier --write services/` ausführen.

- [ ] **Step 7: Commit**

```bash
git add services/sniper
git commit -m "feat(sniper): scaffold the standalone collector service"
```

---

### Task 3: Abfrageschlüssel

**Files:**

- Create: `services/sniper/src/domain/query.ts`, `services/sniper/src/domain/listing.ts`
- Test: `services/sniper/test/domain/query-key.spec.ts`

**Interfaces:**

- Produces: `buildQueryKey(input: QueryKeyInput): string`, Typen `SniperQuery`, `QueryStatus`, `MarketplaceListing`, `Money`. Task 9 und 10 verwenden `SniperQuery` unverändert.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Create `services/sniper/test/domain/query-key.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildQueryKey } from '../../src/domain/query.js';

describe('buildQueryKey', () => {
  it('normalises case and surrounding whitespace', () => {
    expect(buildQueryKey({ searchText: '  Nike Air Max  ' })).toBe(
      buildQueryKey({ searchText: 'nike air max' }),
    );
  });

  it('collapses repeated whitespace', () => {
    expect(buildQueryKey({ searchText: 'nike   air\tmax' })).toBe(
      buildQueryKey({ searchText: 'nike air max' }),
    );
  });

  it('separates queries that differ in price ceiling', () => {
    expect(buildQueryKey({ searchText: 'nike', priceTo: 50 })).not.toBe(
      buildQueryKey({ searchText: 'nike', priceTo: 60 }),
    );
  });

  it('treats an absent option as different from a set one', () => {
    expect(buildQueryKey({ searchText: 'nike' })).not.toBe(
      buildQueryKey({ searchText: 'nike', catalogId: 2050 }),
    );
  });

  it('produces a stable, readable key', () => {
    expect(buildQueryKey({ searchText: 'Nike Air Max', priceTo: 50, catalogId: 2050 })).toBe(
      'vinted|search=nike air max|catalog=2050|brand=-|price_to=50',
    );
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: FEHLER `Failed to resolve import "../../src/domain/query.js"`.

- [ ] **Step 3: Umsetzen**

Create `services/sniper/src/domain/listing.ts`:

```ts
export interface Money {
  amount: number;
  currency: string;
}

/**
 * Plattformunabhaengige Sicht auf ein Angebot. Bewusst ohne jedes Verkaeuferfeld:
 * der Katalog liefert Name, Profiladresse und Profilfoto mit, all das wird im
 * Normalizer verworfen und erreicht dieses Modell nie.
 */
export interface MarketplaceListing {
  marketplace: 'vinted';
  externalId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  /** Gesamtpreis inklusive Kaeuferschutz, nicht der reine Artikelpreis. */
  price: Money;
  brand: string | null;
  size: string | null;
  condition: string | null;
  /** Naeherung fuer das Alter. Das Foto wird vor dem Absenden hochgeladen. */
  photoUploadedAt: string | null;
}
```

Create `services/sniper/src/domain/query.ts`:

```ts
export type QueryStatus = 'never_polled' | 'ok' | 'rate_limited' | 'forbidden' | 'failed';

export interface QueryKeyInput {
  searchText: string;
  catalogId?: number | null;
  brandId?: number | null;
  priceTo?: number | null;
}

export interface SniperQuery {
  id: string;
  queryKey: string;
  marketplace: 'vinted';
  searchText: string;
  catalogId: number | null;
  brandId: number | null;
  priceTo: number | null;
  pollIntervalMs: number;
  isSeeded: boolean;
  isActive: boolean;
  lastPolledAt: string | null;
  lastStatus: QueryStatus;
  consecutiveFailures: number;
}

const ABSENT = '-';

function part(value: number | null | undefined): string {
  return value === null || value === undefined ? ABSENT : String(value);
}

/**
 * Zwei Filter mit demselben Schluessel teilen sich eine Vinted-Abfrage. Der
 * Schluessel muss deshalb genau die Parameter enthalten, die an Vinted gehen -
 * nicht mehr, sonst zerfaellt die Zusammenfassung, und nicht weniger, sonst
 * bekaeme ein Filter Ergebnisse einer fremden Abfrage.
 */
export function buildQueryKey(input: QueryKeyInput): string {
  const searchText = input.searchText.trim().toLowerCase().replace(/\s+/g, ' ');

  return [
    'vinted',
    `search=${searchText}`,
    `catalog=${part(input.catalogId)}`,
    `brand=${part(input.brandId)}`,
    `price_to=${part(input.priceTo)}`,
  ].join('|');
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: 8 Tests bestanden (3 aus Task 2, 5 neue).

- [ ] **Step 5: Commit**

```bash
git add services/sniper/src/domain services/sniper/test/domain
git commit -m "feat(sniper): derive a shared query key from the Vinted parameters"
```

---

### Task 4: Aufgezeichnete Vinted-Antwort und Vertragstest

**Files:**

- Create: `services/sniper/scripts/record-fixture.mjs`, `services/sniper/test/fixtures/vinted-catalog.json`, `services/sniper/src/vinted/schema.ts`
- Test: `services/sniper/test/vinted/schema.spec.ts`

**Interfaces:**

- Produces: `VintedCatalogSchema`, `VintedItemSchema`, Typ `VintedItem`. Task 5 baut darauf auf.

**Warum aufgezeichnet:** Der Fremdentwurf prüfte gegen handgeschriebenes Wunsch-JSON. Solche Tests bleiben grün, wenn Vinted das Format ändert – genau der Fall, den sie abfangen sollen.

- [ ] **Step 1: Aufzeichnungsskript schreiben**

Create `services/sniper/scripts/record-fixture.mjs`:

```js
/**
 * Zeichnet eine echte Katalogantwort auf und pseudonymisiert dabei alle
 * Verkaeuferdaten. Die Struktur bleibt vollstaendig erhalten, damit der
 * Vertragstest eine Formataenderung bemerkt - aber es werden keine
 * personenbezogenen Daten realer Nutzer ins Repository committet.
 *
 * Aufruf: npm run record:fixture
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = 'https://www.vinted.de';
const USER_AGENT = 'Mozilla/5.0 (compatible; FlipbaseSniper/0.1)';
const TARGET = new URL('../test/fixtures/vinted-catalog.json', import.meta.url).pathname;

function cookieHeader(response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}

function anonymiseUser(index) {
  return {
    id: 1000 + index,
    login: `seller_${index}`,
    profile_url: `${BASE}/member/${1000 + index}-seller-${index}`,
    photo: null,
  };
}

const warmup = await fetch(BASE, {
  headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
});
if (!warmup.ok) throw new Error(`warm-up failed with ${warmup.status}`);

const url = new URL('/api/v2/catalog/items', BASE);
url.searchParams.set('search_text', 'nike air max');
url.searchParams.set('order', 'newest_first');
url.searchParams.set('page', '1');
url.searchParams.set('per_page', '96');

const response = await fetch(url, {
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    Cookie: cookieHeader(warmup),
  },
});
if (!response.ok) throw new Error(`catalog request failed with ${response.status}`);

const body = await response.json();
const fixture = {
  items: body.items.slice(0, 3).map((item, index) => ({ ...item, user: anonymiseUser(index) })),
  pagination: body.pagination,
};

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`recorded ${fixture.items.length} items to ${TARGET}`);
```

- [ ] **Step 2: Fixture aufzeichnen**

```bash
cd services/sniper && npm run record:fixture
```

Erwartung: `recorded 3 items to .../test/fixtures/vinted-catalog.json`.

Danach die Datei öffnen und prüfen, dass jeder `user`-Block genau `seller_0`, `seller_1`, `seller_2` enthält und kein `photo` mit echter Adresse. Falls Vinted mit 401 antwortet: Der Grund ist bekannt – die Startseite setzt `access_token_web` zweimal, erst leer, dann echt. Das Skript nimmt je Name den letzten Wert; bleibt trotzdem ein 401, den Aufruf einmal wiederholen.

- [ ] **Step 3: Fehlschlagenden Vertragstest schreiben**

Create `services/sniper/test/vinted/schema.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/vinted-catalog.json' with { type: 'json' };
import { VintedCatalogSchema } from '../../src/vinted/schema.js';

describe('VintedCatalogSchema', () => {
  it('accepts the recorded catalog response', () => {
    expect(() => VintedCatalogSchema.parse(fixture)).not.toThrow();
  });

  it('keeps every field the normalizer depends on', () => {
    const parsed = VintedCatalogSchema.parse(fixture);
    const item = parsed.items[0];

    expect(item).toBeDefined();
    expect(item?.id).toBeDefined();
    expect(item?.title).toBeTypeOf('string');
    expect(item?.url).toMatch(/^https:\/\//);
    expect(item?.total_item_price?.amount).toBeDefined();
    expect(item?.total_item_price?.currency_code).toBeTypeOf('string');
  });

  it('rejects a response whose items lost the total price', () => {
    const broken = {
      ...fixture,
      items: fixture.items.map((item) => ({ ...item, total_item_price: undefined })),
    };

    expect(() => VintedCatalogSchema.parse(broken)).toThrow();
  });

  it('ignores unknown fields so a new Vinted field does not break the service', () => {
    const extended = {
      ...fixture,
      items: fixture.items.map((item) => ({ ...item, brand_new_field: 'whatever' })),
    };

    expect(() => VintedCatalogSchema.parse(extended)).not.toThrow();
  });
});
```

- [ ] **Step 4: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: FEHLER `Failed to resolve import "../../src/vinted/schema.js"`.

- [ ] **Step 5: Schema umsetzen**

Create `services/sniper/src/vinted/schema.ts`:

```ts
import { z } from 'zod';

const MoneySchema = z.object({
  amount: z.union([z.string(), z.number()]),
  currency_code: z.string(),
});

/**
 * Bewusst nur die Felder, die wir wirklich verwenden. Unbekannte Felder laesst
 * Zod fallen; ein neues Vinted-Feld darf den Dienst nicht anhalten. Der
 * `user`-Block wird absichtlich nicht beschrieben - was nicht im Schema steht,
 * kann auch nicht versehentlich weiterverarbeitet werden.
 */
export const VintedItemSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  url: z.string().url(),
  total_item_price: MoneySchema,
  price: MoneySchema.optional(),
  brand_title: z.string().nullish(),
  size_title: z.string().nullish(),
  status: z.string().nullish(),
  photo: z
    .object({
      url: z.string().nullish(),
      high_resolution: z.object({ timestamp: z.number().nullish() }).nullish(),
    })
    .nullish(),
});

export const VintedCatalogSchema = z.object({
  items: z.array(VintedItemSchema),
});

export type VintedItem = z.infer<typeof VintedItemSchema>;
```

- [ ] **Step 6: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: 12 Tests bestanden.

- [ ] **Step 7: Commit**

```bash
git add services/sniper/scripts services/sniper/test/fixtures services/sniper/src/vinted services/sniper/test/vinted
git commit -m "feat(sniper): validate the catalog response against a recorded fixture"
```

---

### Task 5: Normalizer

**Files:**

- Create: `services/sniper/src/vinted/normalizer.ts`
- Test: `services/sniper/test/vinted/normalizer.spec.ts`

**Interfaces:**

- Consumes: `VintedItem` aus Task 4, `MarketplaceListing` aus Task 3.
- Produces: `normalizeVintedItem(item: VintedItem): MarketplaceListing`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Create `services/sniper/test/vinted/normalizer.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/vinted-catalog.json' with { type: 'json' };
import { VintedCatalogSchema, type VintedItem } from '../../src/vinted/schema.js';
import { normalizeVintedItem } from '../../src/vinted/normalizer.js';

const parsed = VintedCatalogSchema.parse(fixture);
const firstItem = parsed.items[0]!;

describe('normalizeVintedItem', () => {
  it('uses the total price including buyer protection', () => {
    const item = {
      ...firstItem,
      price: { amount: '45.0', currency_code: 'EUR' },
      total_item_price: { amount: '47.95', currency_code: 'EUR' },
    };

    const listing = normalizeVintedItem(item);

    expect(listing.price.amount).toBe(47.95);
    expect(listing.price.currency).toBe('EUR');
  });

  it('never carries a seller field into the listing', () => {
    // Der Eingabewert muss den user-Block WIRKLICH tragen. Wer hier
    // VintedCatalogSchema.parse(...) verwendet, testet nichts: Zod entfernt
    // unbekannte Schluessel, der Block waere also schon weg, bevor der
    // Normalizer laeuft, und die Zusicherungen koennten gar nicht scheitern.
    // Der Cast bildet einen kuenftigen Zustand ab, in dem `user` im Schema
    // steht - dann muss der Normalizer ihn immer noch fallen lassen.
    const itemWithSeller = {
      ...firstItem,
      user: {
        id: 4711,
        login: 'seller_0',
        profile_url: 'https://www.vinted.de/member/4711-seller-0',
        photo: { url: 'https://images.example/avatar.jpg' },
      },
    } as VintedItem;

    const listing = normalizeVintedItem(itemWithSeller);
    const serialised = JSON.stringify(listing);

    expect(serialised).not.toContain('seller_0');
    expect(serialised).not.toContain('profile_url');
    expect(serialised).not.toContain('avatar.jpg');
    expect(Object.keys(listing)).not.toContain('user');
  });

  it('turns the photo timestamp into an ISO string', () => {
    const item = {
      ...firstItem,
      photo: { url: 'https://images.example/1.jpg', high_resolution: { timestamp: 1788077565 } },
    };

    const listing = normalizeVintedItem(item);

    expect(listing.photoUploadedAt).toBe('2026-08-30T08:12:45.000Z');
    expect(listing.imageUrl).toBe('https://images.example/1.jpg');
  });

  it('falls back to null for every optional field', () => {
    const item = {
      ...firstItem,
      brand_title: null,
      size_title: null,
      status: null,
      photo: null,
    };

    const listing = normalizeVintedItem(item);

    expect(listing.brand).toBeNull();
    expect(listing.size).toBeNull();
    expect(listing.condition).toBeNull();
    expect(listing.photoUploadedAt).toBeNull();
    expect(listing.imageUrl).toBeNull();
  });

  it('keeps the external id as a string', () => {
    const listing = normalizeVintedItem({ ...firstItem, id: 9825064708 });

    expect(listing.externalId).toBe('9825064708');
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: FEHLER `Failed to resolve import "../../src/vinted/normalizer.js"`.

- [ ] **Step 3: Umsetzen**

Create `services/sniper/src/vinted/normalizer.ts`:

```ts
import type { MarketplaceListing } from '../domain/listing.js';
import type { VintedItem } from './schema.js';

function toIsoOrNull(timestamp: number | null | undefined): string | null {
  return typeof timestamp === 'number' ? new Date(timestamp * 1000).toISOString() : null;
}

/**
 * Diese Funktion ist der Datenschutzriegel des Dienstes: Nur die hier
 * aufgefuehrten Felder verlassen die Vinted-Antwort. Alles andere - Name,
 * Kennung, Profiladresse und Profilfoto des Verkaeufers - bleibt zurueck.
 */
export function normalizeVintedItem(item: VintedItem): MarketplaceListing {
  return {
    marketplace: 'vinted',
    externalId: String(item.id),
    title: item.title,
    url: item.url,
    imageUrl: item.photo?.url ?? null,
    price: {
      amount: Number(item.total_item_price.amount),
      currency: item.total_item_price.currency_code,
    },
    brand: item.brand_title ?? null,
    size: item.size_title ?? null,
    condition: item.status ?? null,
    photoUploadedAt: toIsoOrNull(item.photo?.high_resolution?.timestamp),
  };
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: 17 Tests bestanden.

- [ ] **Step 5: Commit**

```bash
git add services/sniper/src/vinted/normalizer.ts services/sniper/test/vinted/normalizer.spec.ts
git commit -m "feat(sniper): normalize catalog items and drop all seller data"
```

---

### Task 6: Vinted-Sitzung mit Neuaufwärmung

**Files:**

- Create: `services/sniper/src/vinted/errors.ts`, `services/sniper/src/vinted/session.ts`
- Test: `services/sniper/test/vinted/session.spec.ts`

**Interfaces:**

- Produces: `class VintedSession` mit `cookieHeader(): Promise<string>` und `invalidate(): void`; Typen `FetchLike`, `Sleep`; Fehlerklassen `RateLimitedError`, `ForbiddenError`, `UnauthorizedError`, `VintedHttpError`.

**Warum:** Vinted setzt `access_token_web` in derselben Antwort zweimal – zuerst leer, dann echt. Wer die Set-Cookie-Werte stumpf aneinanderhängt, schickt den leeren zuerst und bekommt 401. Am 30.08.2026 gemessen: naiv zusammengefügt 401, dedupliziert 200. Der Fremdentwurf fügt naiv zusammen, wärmt genau einmal auf und behandelt 401 überhaupt nicht – der Monitor läuft danach still ins Leere. Diese Klasse ist damit an der Quelle behoben; das Neuaufwärmen bleibt als zweite Absicherung.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Create `services/sniper/test/vinted/session.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { VintedSession } from '../../src/vinted/session.js';
import { VintedHttpError } from '../../src/vinted/errors.js';

function homepage(cookie: string): Response {
  return new Response('<html></html>', {
    status: 200,
    headers: { 'set-cookie': `access_token_web=${cookie}; Path=/; HttpOnly` },
  });
}

const options = {
  baseUrl: 'https://www.vinted.de',
  userAgent: 'test-agent',
};

describe('VintedSession', () => {
  it('warms up once and reuses the cookie', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(homepage('first'));
    const session = new VintedSession(options, fetchFn);

    expect(await session.cookieHeader()).toBe('access_token_web=first');
    expect(await session.cookieHeader()).toBe('access_token_web=first');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('warms up again after invalidate', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(homepage('first'))
      .mockResolvedValueOnce(homepage('second'));
    const session = new VintedSession(options, fetchFn);

    await session.cookieHeader();
    session.invalidate();

    expect(await session.cookieHeader()).toBe('access_token_web=second');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('sends the configured user agent', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(homepage('first'));
    const session = new VintedSession(options, fetchFn);

    await session.cookieHeader();
    const headers = fetchFn.mock.calls[0]?.[1]?.headers as Record<string, string>;

    expect(headers['User-Agent']).toBe('test-agent');
  });

  it('fails loudly when the warm-up is rejected', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    const session = new VintedSession(options, fetchFn);

    await expect(session.cookieHeader()).rejects.toBeInstanceOf(VintedHttpError);
  });

  it('joins every returned cookie', async () => {
    const response = new Response('<html></html>', { status: 200 });
    response.headers.append('set-cookie', 'access_token_web=a; Path=/');
    response.headers.append('set-cookie', 'anon_id=b; Path=/');
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
    const session = new VintedSession(options, fetchFn);

    expect(await session.cookieHeader()).toBe('access_token_web=a; anon_id=b');
  });

  it('keeps the last value when Vinted sets a cookie twice', async () => {
    // Gemessen am 30.08.2026: Die Startseite invalidiert access_token_web
    // zuerst mit einem leeren Wert und setzt danach den echten Token. Wer die
    // Werte stumpf aneinanderhaengt, schickt den leeren zuerst und bekommt 401.
    const response = new Response('<html></html>', { status: 200 });
    response.headers.append(
      'set-cookie',
      'access_token_web=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );
    response.headers.append('set-cookie', 'anon_id=b; Path=/');
    response.headers.append('set-cookie', 'access_token_web=real-token; Path=/');
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
    const session = new VintedSession(options, fetchFn);

    const header = await session.cookieHeader();

    expect(header).toContain('access_token_web=real-token');
    expect(header).not.toContain('access_token_web=;');
    expect(header).toContain('anon_id=b');
  });

  it('drops a malformed cookie without a name', async () => {
    const response = new Response('<html></html>', { status: 200 });
    response.headers.append('set-cookie', '=orphan; Path=/');
    response.headers.append('set-cookie', 'anon_id=b; Path=/');
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
    const session = new VintedSession(options, fetchFn);

    expect(await session.cookieHeader()).toBe('anon_id=b');
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: FEHLER `Failed to resolve import "../../src/vinted/session.js"`.

- [ ] **Step 3: Umsetzen**

Create `services/sniper/src/vinted/errors.ts`:

```ts
export class RateLimitedError extends Error {
  constructor(message = 'Vinted rate limit reached') {
    super(message);
    this.name = 'RateLimitedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Vinted refused the request') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Vinted session is no longer accepted') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class VintedHttpError extends Error {
  constructor(public readonly status: number) {
    super(`Vinted request failed with status ${status}`);
    this.name = 'VintedHttpError';
  }
}
```

Create `services/sniper/src/vinted/session.ts`:

```ts
import { VintedHttpError } from './errors.js';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type Sleep = (milliseconds: number) => Promise<void>;

export const sleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface SessionOptions {
  baseUrl: string;
  userAgent: string;
}

/**
 * Haelt die anonymen Cookies der Vinted-Startseite. Bleibt trotzdem ein 401
 * uebrig, ruft der Sammler `invalidate()` und wiederholt die Runde einmal
 * mit frischen Cookies.
 */
export class VintedSession {
  private cookie: string | undefined;
  /**
   * Der laufende Aufwaermvorgang, nicht nur sein Ergebnis. Ohne das sehen zwei
   * Aufrufer vor dem ersten `await` beide `undefined`, starten beide eine
   * Anfrage und bekommen unterschiedliche Cookies - genau das Gegenteil dessen,
   * wofuer diese Klasse da ist, und zusaetzlicher Verkehr Richtung Vinted.
   */
  private pending: Promise<string> | undefined;
  /** Zaehlt hoch bei `invalidate()`, damit ein bereits laufendes Aufwaermen sein
   *  Ergebnis nicht mehr als gueltig einhaengt. */
  private generation = 0;

  constructor(
    private readonly options: SessionOptions,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async cookieHeader(): Promise<string> {
    if (this.cookie !== undefined) return this.cookie;

    const current = (this.pending ??= this.warmUp());
    try {
      return await current;
    } finally {
      // Nur das EIGENE Promise loeschen. Bedingungsloses Zuruecksetzen wischt
      // sonst den Eintrag eines inzwischen gestarteten neuen Aufwaermens weg:
      // A startet (P1) -> invalidate() -> B startet (P2) -> P1 loest aus und
      // As finally loescht P2 -> ein dritter Aufrufer sieht nichts und stoesst
      // eine dritte Anfrage an. Nachgebaut und ausgefuehrt: 1 -> 2 -> 3.
      // Auch im Fehlerfall zuruecksetzen, sonst wuerde ein einmal
      // gescheitertes Aufwaermen jeden weiteren Versuch vergiften.
      if (this.pending === current) this.pending = undefined;
    }
  }

  private async warmUp(): Promise<string> {
    const generation = this.generation;

    const response = await this.fetchFn(this.options.baseUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': this.options.userAgent,
      },
    });

    if (!response.ok) throw new VintedHttpError(response.status);

    const extracted = extractCookieHeader(response.headers);
    if (generation === this.generation) {
      this.cookie = extracted;
    }

    return extracted;
  }

  invalidate(): void {
    this.cookie = undefined;
    this.pending = undefined;
    this.generation += 1;
  }
}

/**
 * Vinted setzt `access_token_web` in derselben Antwort ZWEIMAL: zuerst leer
 * (Invalidierung), danach den echten Token. Wer alle Set-Cookie-Werte stumpf
 * aneinanderhaengt, schickt den leeren zuerst - der Server nimmt den ersten
 * und antwortet mit 401. Deshalb gewinnt hier je Name der LETZTE Wert.
 *
 * Am 30.08.2026 gemessen: naiv zusammengefuegt -> 401, dedupliziert -> 200,
 * bei identischer Aufwaermung.
 */
function extractCookieHeader(headers: Headers): string {
  const latest = new Map<string, string>();

  for (const raw of headers.getSetCookie()) {
    const pair = raw.split(';', 1)[0]?.trim();
    if (!pair) continue;

    const separator = pair.indexOf('=');
    if (separator <= 0) continue;

    latest.set(pair.slice(0, separator), pair.slice(separator + 1));
  }

  return [...latest].map(([name, value]) => `${name}=${value}`).join('; ');
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: 28 Tests bestanden.

> **Nachtrag aus zwei Prüfrunden (Commits `922bb06` und `72dcd74`):** Zu den sieben
> oben gezeigten Tests kamen vier weitere hinzu, die den geteilten Aufwärmvorgang absichern:
> zwei gleichzeitige `cookieHeader()`-Aufrufe lösen genau eine Anfrage aus,
> ein gescheitertes Aufwärmen wird nicht zwischengespeichert, und `invalidate()`
> während eines laufenden Aufwärmens verwirft dessen Ergebnis. Gegen die
> ursprüngliche Fassung scheitert der erste dieser Tests mit zwei statt einer
> Anfrage. Der vierte Test deckt einen Fehler ab, der erst im ersten Fix entstand:
> das `finally` loeschte `pending` bedingungslos und wischte damit den Eintrag eines
> inzwischen gestarteten neuen Aufwaermens weg - ein dritter Aufrufer stiess dann eine
> dritte Anfrage an. Der Code oben zeigt den Stand nach beiden Fixes; die vier Tests
> stehen in `services/sniper/test/vinted/session.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add services/sniper/src/vinted/errors.ts services/sniper/src/vinted/session.ts services/sniper/test/vinted/session.spec.ts
git commit -m "feat(sniper): hold the anonymous Vinted session and allow re-warming"
```

---

### Task 7: Sammler

**Files:**

- Create: `services/sniper/src/vinted/collector.ts`
- Test: `services/sniper/test/vinted/collector.spec.ts`

**Interfaces:**

- Consumes: `VintedSession`, `FetchLike`, `Sleep` aus Task 6; `VintedCatalogSchema` aus Task 4; `normalizeVintedItem` aus Task 5; `SniperQuery` aus Task 3.
- Produces: `class VintedCollector` mit `collect(query: SniperQuery): Promise<MarketplaceListing[]>`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Create `services/sniper/test/vinted/collector.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/vinted-catalog.json' with { type: 'json' };
import { VintedCollector } from '../../src/vinted/collector.js';
import { VintedSession } from '../../src/vinted/session.js';
import { ForbiddenError, RateLimitedError, UnauthorizedError } from '../../src/vinted/errors.js';
import type { SniperQuery } from '../../src/domain/query.js';

const query: SniperQuery = {
  id: 'q1',
  queryKey: 'vinted|search=nike air max|catalog=-|brand=-|price_to=50',
  marketplace: 'vinted',
  searchText: 'nike air max',
  catalogId: null,
  brandId: null,
  priceTo: 50,
  pollIntervalMs: 60000,
  isSeeded: true,
  isActive: true,
  lastPolledAt: null,
  lastStatus: 'never_polled',
  consecutiveFailures: 0,
};

function homepage(): Response {
  return new Response('<html></html>', {
    status: 200,
    headers: { 'set-cookie': 'access_token_web=token; Path=/' },
  });
}

function catalog(): Response {
  return Response.json(fixture);
}

function build(fetchFn: ReturnType<typeof vi.fn>) {
  const options = { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent' };
  const session = new VintedSession(options, fetchFn as unknown as typeof fetch);
  return new VintedCollector(options, session, fetchFn as unknown as typeof fetch, async () => {});
}

describe('VintedCollector', () => {
  it('requests page one with 96 items and the price ceiling', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(homepage()).mockResolvedValueOnce(catalog());

    await build(fetchFn).collect(query);

    const url = new URL(String(fetchFn.mock.calls[1]?.[0]));
    expect(url.pathname).toBe('/api/v2/catalog/items');
    expect(url.searchParams.get('search_text')).toBe('nike air max');
    expect(url.searchParams.get('order')).toBe('newest_first');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('per_page')).toBe('96');
    expect(url.searchParams.get('price_to')).toBe('50');
  });

  it('returns normalized listings', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(homepage()).mockResolvedValueOnce(catalog());

    const listings = await build(fetchFn).collect(query);

    expect(listings).toHaveLength(fixture.items.length);
    expect(listings[0]?.marketplace).toBe('vinted');
    expect(JSON.stringify(listings)).not.toContain('seller_0');
  });

  it('re-warms the session once on 401 and then succeeds', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(catalog());

    const listings = await build(fetchFn).collect(query);

    expect(listings).toHaveLength(fixture.items.length);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('gives up with UnauthorizedError after a second 401', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 401 }));

    await expect(build(fetchFn).collect(query)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('maps 429 to RateLimitedError without retrying', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 429 }));

    await expect(build(fetchFn).collect(query)).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('maps 403 to ForbiddenError without retrying', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 403 }));

    await expect(build(fetchFn).collect(query)).rejects.toBeInstanceOf(ForbiddenError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries a 503 at most twice', async () => {
    const delays: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(catalog());
    const options = { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent' };
    const session = new VintedSession(options, fetchFn as unknown as typeof fetch);
    const collector = new VintedCollector(
      options,
      session,
      fetchFn as unknown as typeof fetch,
      async (ms) => {
        delays.push(ms);
      },
    );

    await collector.collect(query);

    expect(delays).toEqual([500, 1000]);
  });

  it('rejects a response that violates the schema', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(Response.json({ items: [{ nope: true }] }));

    await expect(build(fetchFn).collect(query)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: FEHLER `Failed to resolve import "../../src/vinted/collector.js"`.

- [ ] **Step 3: Umsetzen**

Create `services/sniper/src/vinted/collector.ts`:

```ts
import type { MarketplaceListing } from '../domain/listing.js';
import type { SniperQuery } from '../domain/query.js';
import { ForbiddenError, RateLimitedError, UnauthorizedError, VintedHttpError } from './errors.js';
import { normalizeVintedItem } from './normalizer.js';
import { VintedCatalogSchema } from './schema.js';
import {
  sleep,
  type FetchLike,
  type SessionOptions,
  type Sleep,
  type VintedSession,
} from './session.js';

const CATALOG_PATH = '/api/v2/catalog/items';
const PER_PAGE = '96';
const RETRY_DELAYS_MS = [500, 1000] as const;

export class VintedCollector {
  constructor(
    private readonly options: SessionOptions,
    private readonly session: VintedSession,
    private readonly fetchFn: FetchLike = fetch,
    private readonly sleepFn: Sleep = sleep,
  ) {}

  async collect(query: SniperQuery): Promise<MarketplaceListing[]> {
    try {
      return await this.collectOnce(query);
    } catch (error) {
      // Die Hauptursache fuer 401 ist im Cookie-Zusammenbau behoben. Falls
      // doch einer durchkommt: genau ein Neuaufwaermen, danach
      // uebernimmt der Taktgeber - endloses Wiederholen wuerde nur Anfragen
      // verbrennen und das Sperrrisiko erhoehen.
      if (!(error instanceof UnauthorizedError)) throw error;
      this.session.invalidate();
      return this.collectOnce(query);
    }
  }

  private async collectOnce(query: SniperQuery): Promise<MarketplaceListing[]> {
    const url = new URL(CATALOG_PATH, this.options.baseUrl);
    url.searchParams.set('search_text', query.searchText);
    url.searchParams.set('order', 'newest_first');
    url.searchParams.set('page', '1');
    url.searchParams.set('per_page', PER_PAGE);
    if (query.catalogId !== null) url.searchParams.set('catalog_ids', String(query.catalogId));
    if (query.brandId !== null) url.searchParams.set('brand_ids', String(query.brandId));
    if (query.priceTo !== null) url.searchParams.set('price_to', String(query.priceTo));

    const response = await this.request(url, await this.session.cookieHeader());
    const body: unknown = await response.json();

    return VintedCatalogSchema.parse(body).items.map(normalizeVintedItem);
  }

  private async request(url: URL, cookie: string): Promise<Response> {
    let retryIndex = 0;

    for (;;) {
      const response = await this.fetchFn(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': this.options.userAgent,
          Cookie: cookie,
        },
      });

      if (response.status === 401) throw new UnauthorizedError();
      if (response.status === 429) throw new RateLimitedError();
      if (response.status === 403) throw new ForbiddenError();

      if (response.status >= 500 && retryIndex < RETRY_DELAYS_MS.length) {
        await this.sleepFn(RETRY_DELAYS_MS[retryIndex]!);
        retryIndex += 1;
        continue;
      }

      if (!response.ok) throw new VintedHttpError(response.status);

      return response;
    }
  }
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: 36 Tests bestanden.

- [ ] **Step 5: Commit**

```bash
git add services/sniper/src/vinted/collector.ts services/sniper/test/vinted/collector.spec.ts
git commit -m "feat(sniper): collect one narrow catalog page and classify Vinted errors"
```

---

### Task 8: Anfragebudget

**Files:**

- Create: `services/sniper/src/runtime/budget.ts`
- Test: `services/sniper/test/runtime/budget.spec.ts`

**Interfaces:**

- Produces: `class RequestBudget` mit `tryConsume(): boolean` und `usageRatio(): number`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Create `services/sniper/test/runtime/budget.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RequestBudget } from '../../src/runtime/budget.js';

describe('RequestBudget', () => {
  it('allows exactly the configured number of requests per minute', () => {
    let now = 0;
    const budget = new RequestBudget(3, () => now);

    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
  });

  it('frees a slot once its minute has passed', () => {
    let now = 0;
    const budget = new RequestBudget(2, () => now);

    budget.tryConsume();
    now = 30_000;
    budget.tryConsume();
    expect(budget.tryConsume()).toBe(false);

    now = 60_001;
    expect(budget.tryConsume()).toBe(true);
  });

  it('reports usage as a ratio', () => {
    let now = 0;
    const budget = new RequestBudget(4, () => now);

    budget.tryConsume();
    budget.tryConsume();

    expect(budget.usageRatio()).toBe(0.5);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: FEHLER `Failed to resolve import "../../src/runtime/budget.js"`.

- [ ] **Step 3: Umsetzen**

Create `services/sniper/src/runtime/budget.ts`:

```ts
const WINDOW_MS = 60_000;

/**
 * Gleitendes Fenster ueber die letzte Minute. Ohne diese Grenze bremst ein
 * Arbeitsbereich mit vielen Filtern alle anderen aus und das Sperrrisiko
 * waechst ungeplant mit der Kundenzahl.
 */
export class RequestBudget {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly maxPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  tryConsume(): boolean {
    this.prune();
    if (this.timestamps.length >= this.maxPerMinute) return false;

    this.timestamps.push(this.now());
    return true;
  }

  usageRatio(): number {
    this.prune();
    return this.timestamps.length / this.maxPerMinute;
  }

  private prune(): void {
    const cutoff = this.now() - WINDOW_MS;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) {
      this.timestamps.shift();
    }
  }
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: 45 Tests bestanden.

> **Nachtrag aus der Prüfung (Commit `9bb3fd2`):** Vier Befunde, alle behoben, dazu
> sechs weitere Tests. Der wichtigste betraf den oben gezeigten Test selbst: Bei
> `now = 60_001` ist `cutoff = 1` und der Zeitstempel `0`, also bestehen sowohl
> `<=` als auch `<` — der Test konnte die beiden Operatoren gar nicht
> unterscheiden. Erst eine Zusicherung bei exakt `60_000` legt die Semantik fest
> (ein genau `WINDOW_MS` alter Eintrag gilt als abgelaufen). Ebenfalls behoben:
> `usageRatio()` rief `prune()`, ohne dass ein Test das bemerkt hätte;
> `maxPerMinute = 0` lieferte `NaN` in eine künftige Logzeile; und `prune()` setzte
> stillschweigend eine monotone Uhr voraus, obwohl `Date.now()` das nicht zusagt.
> Der Code oben zeigt noch die Fassung vor diesen Korrekturen — maßgeblich ist
> `services/sniper/src/runtime/budget.ts`.

- [ ] **Step 5: Commit**

```bash
git add services/sniper/src/runtime/budget.ts services/sniper/test/runtime/budget.spec.ts
git commit -m "feat(sniper): cap outgoing requests with a sliding minute budget"
```

---

### Task 9: Supabase-Speicher

**Files:**

- Create: `services/sniper/src/store/supabase.ts`, `services/sniper/src/store/query.store.ts`, `services/sniper/src/store/listing.store.ts`
- Test: `services/sniper/test/store/query.store.integration.spec.ts`, `services/sniper/test/store/listing.store.integration.spec.ts`

**Interfaces:**

- Consumes: `SniperQuery`, `QueryStatus` aus Task 3; `MarketplaceListing` aus Task 3.
- Produces: `createSupabaseClient(config: SnipeConfig)`, `class QueryStore` mit `dueQueries(now: Date): Promise<SniperQuery[]>`, `markPolled(id: string, status: QueryStatus): Promise<void>`, `markSeeded(id: string): Promise<void>`, `deactivate(id: string): Promise<void>`; `class ListingStore` mit `saveNew(listings: MarketplaceListing[], discoveredByQueryId: string): Promise<MarketplaceListing[]>`.

**Voraussetzung:** Die lokale Datenbank läuft (`npm run supabase:start` im Repo-Stammverzeichnis). Der Service-Role-Schlüssel steht in `services/sniper/.env`.

- [ ] **Step 1: Fehlschlagenden Test für den Artikelspeicher schreiben**

Create `services/sniper/test/store/listing.store.integration.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseClient } from '../../src/store/supabase.js';
import { ListingStore } from '../../src/store/listing.store.js';
import type { MarketplaceListing } from '../../src/domain/listing.js';

const client = createSupabaseClient({
  supabaseUrl: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  vintedBaseUrl: 'https://www.vinted.de',
  requestsPerMinute: 30,
  tickIntervalMs: 5000,
  userAgent: 'test-agent',
});

function listing(externalId: string): MarketplaceListing {
  return {
    marketplace: 'vinted',
    externalId,
    title: 'Nike Air Max 95',
    url: `https://www.vinted.de/items/${externalId}`,
    imageUrl: 'https://images.example/1.jpg',
    price: { amount: 47.95, currency: 'EUR' },
    brand: 'Nike',
    size: '43',
    condition: 'Sehr gut',
    photoUploadedAt: '2026-08-30T08:12:45.000Z',
  };
}

describe('ListingStore', () => {
  let queryId: string;
  let store: ListingStore;

  beforeEach(async () => {
    store = new ListingStore(client);
    const { data } = await client
      .from('sniper_queries')
      .insert({ query_key: `test|${randomUUID()}`, search_text: 'nike air max' })
      .select('id')
      .single();
    queryId = data!.id as string;
  });

  it('reports every listing as new on first write', async () => {
    const first = randomUUID();
    const second = randomUUID();

    const created = await store.saveNew([listing(first), listing(second)], queryId);

    expect(created.map((item) => item.externalId).sort()).toEqual([first, second].sort());
  });

  it('reports nothing as new on the second write', async () => {
    const externalId = randomUUID();
    await store.saveNew([listing(externalId)], queryId);

    const created = await store.saveNew([listing(externalId)], queryId);

    expect(created).toEqual([]);
  });

  it('stores the total price unchanged', async () => {
    const externalId = randomUUID();
    await store.saveNew([listing(externalId)], queryId);

    const { data } = await client
      .from('sniper_listings')
      .select('total_price, currency, condition')
      .eq('external_id', externalId)
      .single();

    expect(Number(data!.total_price)).toBe(47.95);
    expect(data!.currency).toBe('EUR');
    expect(data!.condition).toBe('Sehr gut');
  });

  it('returns an empty array for an empty input without calling the database', async () => {
    expect(await store.saveNew([], queryId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && cp -n .env.example .env && npm run test:integration
```

Vor dem Lauf in `services/sniper/.env` den Wert von `SUPABASE_SERVICE_ROLE_KEY` aus `npx supabase status` eintragen.

Erwartung: FEHLER `Failed to resolve import "../../src/store/supabase.js"`.

- [ ] **Step 3: Client und Artikelspeicher umsetzen**

Create `services/sniper/src/store/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SnipeConfig } from '../config.js';

/**
 * Der Dienst schreibt mit dem Service-Role-Schluessel und umgeht damit RLS.
 * Dieser Schluessel darf niemals ins Frontend gelangen.
 */
export function createSupabaseClient(config: SnipeConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

Create `services/sniper/src/store/listing.store.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketplaceListing } from '../domain/listing.js';

export class ListingStore {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Schreibt alle uebergebenen Artikel und liefert ausschliesslich die zurueck,
   * die wirklich neu waren. `ignoreDuplicates` sorgt dafuer, dass bereits
   * bekannte Artikel gar nicht erst zurueckgemeldet werden - das ist die
   * Deduplizierung, ohne vorher eine Leseabfrage zu brauchen.
   */
  async saveNew(
    listings: MarketplaceListing[],
    discoveredByQueryId: string,
  ): Promise<MarketplaceListing[]> {
    if (listings.length === 0) return [];

    const rows = listings.map((listing) => ({
      marketplace: listing.marketplace,
      external_id: listing.externalId,
      title: listing.title,
      url: listing.url,
      image_url: listing.imageUrl,
      total_price: listing.price.amount,
      currency: listing.price.currency,
      brand: listing.brand,
      size: listing.size,
      condition: listing.condition,
      photo_uploaded_at: listing.photoUploadedAt,
      discovered_by_query_id: discoveredByQueryId,
    }));

    const { data, error } = await this.client
      .from('sniper_listings')
      .upsert(rows, { onConflict: 'marketplace,external_id', ignoreDuplicates: true })
      .select('external_id');

    if (error) throw new Error(`saving listings failed: ${error.message}`);

    const createdIds = new Set((data ?? []).map((row) => row.external_id as string));
    return listings.filter((listing) => createdIds.has(listing.externalId));
  }
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm run test:integration
```

Erwartung: 4 Tests bestanden.

- [ ] **Step 5: Fehlschlagenden Test für den Abfragespeicher schreiben**

Create `services/sniper/test/store/query.store.integration.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSupabaseClient } from '../../src/store/supabase.js';
import { QueryStore } from '../../src/store/query.store.js';

const client = createSupabaseClient({
  supabaseUrl: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  vintedBaseUrl: 'https://www.vinted.de',
  requestsPerMinute: 30,
  tickIntervalMs: 5000,
  userAgent: 'test-agent',
});

async function insertQuery(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await client
    .from('sniper_queries')
    .insert({
      query_key: `test|${randomUUID()}`,
      search_text: 'nike air max',
      poll_interval_ms: 60000,
      ...overrides,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data!.id as string;
}

describe('QueryStore', () => {
  it('returns a query that has never been polled', async () => {
    const id = await insertQuery();
    const store = new QueryStore(client);

    const due = await store.dueQueries(new Date());

    expect(due.map((query) => query.id)).toContain(id);
  });

  it('omits a query polled more recently than its interval', async () => {
    const id = await insertQuery({ last_polled_at: new Date().toISOString() });
    const store = new QueryStore(client);

    const due = await store.dueQueries(new Date());

    expect(due.map((query) => query.id)).not.toContain(id);
  });

  it('omits an inactive query', async () => {
    const id = await insertQuery({ is_active: false });
    const store = new QueryStore(client);

    const due = await store.dueQueries(new Date());

    expect(due.map((query) => query.id)).not.toContain(id);
  });

  it('records a successful poll and resets the failure counter', async () => {
    const id = await insertQuery({ consecutive_failures: 2 });
    const store = new QueryStore(client);

    await store.markPolled(id, 'ok');

    const { data } = await client
      .from('sniper_queries')
      .select('last_status, consecutive_failures, last_polled_at')
      .eq('id', id)
      .single();

    expect(data!.last_status).toBe('ok');
    expect(data!.consecutive_failures).toBe(0);
    expect(data!.last_polled_at).not.toBeNull();
  });

  it('counts consecutive failures', async () => {
    const id = await insertQuery();
    const store = new QueryStore(client);

    await store.markPolled(id, 'failed');
    await store.markPolled(id, 'failed');

    const { data } = await client
      .from('sniper_queries')
      .select('consecutive_failures')
      .eq('id', id)
      .single();

    expect(data!.consecutive_failures).toBe(2);
  });

  it('marks a query as seeded', async () => {
    const id = await insertQuery();
    const store = new QueryStore(client);

    await store.markSeeded(id);

    const { data } = await client.from('sniper_queries').select('is_seeded').eq('id', id).single();

    expect(data!.is_seeded).toBe(true);
  });
});
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && npm run test:integration
```

Erwartung: FEHLER `Failed to resolve import "../../src/store/query.store.js"`.

- [ ] **Step 7: Abfragespeicher umsetzen**

Create `services/sniper/src/store/query.store.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueryStatus, SniperQuery } from '../domain/query.js';

interface QueryRow {
  id: string;
  query_key: string;
  marketplace: string;
  search_text: string;
  catalog_id: number | null;
  brand_id: number | null;
  price_to: string | number | null;
  poll_interval_ms: number;
  is_seeded: boolean;
  is_active: boolean;
  last_polled_at: string | null;
  last_status: QueryStatus;
  consecutive_failures: number;
}

const COLUMNS =
  'id, query_key, marketplace, search_text, catalog_id, brand_id, price_to, poll_interval_ms, is_seeded, is_active, last_polled_at, last_status, consecutive_failures';

function toQuery(row: QueryRow): SniperQuery {
  return {
    id: row.id,
    queryKey: row.query_key,
    marketplace: 'vinted',
    searchText: row.search_text,
    catalogId: row.catalog_id,
    brandId: row.brand_id,
    priceTo: row.price_to === null ? null : Number(row.price_to),
    pollIntervalMs: row.poll_interval_ms,
    isSeeded: row.is_seeded,
    isActive: row.is_active,
    lastPolledAt: row.last_polled_at,
    lastStatus: row.last_status,
    consecutiveFailures: row.consecutive_failures,
  };
}

export class QueryStore {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Faellig ist eine Abfrage, wenn sie noch nie lief oder ihr Takt abgelaufen
   * ist. Die Faelligkeit wird in TypeScript entschieden statt in SQL, damit sie
   * ohne Datenbank testbar bleibt und der Taktgeber die einzige Stelle ist, die
   * ueber Reihenfolge entscheidet.
   */
  async dueQueries(now: Date): Promise<SniperQuery[]> {
    const { data, error } = await this.client
      .from('sniper_queries')
      .select(COLUMNS)
      .eq('is_active', true)
      .order('last_polled_at', { ascending: true, nullsFirst: true });

    if (error) throw new Error(`loading queries failed: ${error.message}`);

    return (data as QueryRow[]).map(toQuery).filter((query) => isDue(query, now));
  }

  async markPolled(id: string, status: QueryStatus): Promise<void> {
    const { data, error: readError } = await this.client
      .from('sniper_queries')
      .select('consecutive_failures')
      .eq('id', id)
      .single();

    if (readError) throw new Error(`reading query ${id} failed: ${readError.message}`);

    const failures = status === 'ok' ? 0 : (data!.consecutive_failures as number) + 1;

    const { error } = await this.client
      .from('sniper_queries')
      .update({
        last_polled_at: new Date().toISOString(),
        last_status: status,
        consecutive_failures: failures,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw new Error(`updating query ${id} failed: ${error.message}`);
  }

  async markSeeded(id: string): Promise<void> {
    const { error } = await this.client
      .from('sniper_queries')
      .update({ is_seeded: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(`seeding query ${id} failed: ${error.message}`);
  }

  async deactivate(id: string): Promise<void> {
    const { error } = await this.client
      .from('sniper_queries')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(`deactivating query ${id} failed: ${error.message}`);
  }
}

export function isDue(query: SniperQuery, now: Date): boolean {
  if (!query.isActive) return false;
  if (query.lastPolledAt === null) return true;

  return now.getTime() - new Date(query.lastPolledAt).getTime() >= query.pollIntervalMs;
}
```

- [ ] **Step 8: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm run test:integration
```

Erwartung: 10 Tests bestanden.

- [ ] **Step 9: Commit**

```bash
git add services/sniper/src/store services/sniper/test/store
git commit -m "feat(sniper): persist queries and deduplicate listings in Supabase"
```

---

### Task 10: Taktgeber mit Einlese-Lauf

**Files:**

- Create: `services/sniper/src/runtime/scheduler.ts`
- Test: `services/sniper/test/runtime/scheduler.spec.ts`

**Interfaces:**

- Consumes: `RequestBudget` aus Task 8, `Logger` aus Task 2, `SniperQuery` aus Task 3. Die Fälligkeitsprüfung bleibt im `QueryStore` (Task 9); der Taktgeber bekommt bereits gefilterte Abfragen.
- Produces: `class QueryScheduler` mit `runOnce(now: Date): Promise<CycleReport>`; Typ `CycleReport` mit `polled`, `skippedForBudget`, `newListings`, `seeded`, `failed`. Die Abhängigkeiten kommen als Schnittstellen herein, damit der Test ohne Netz und ohne Datenbank auskommt.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Create `services/sniper/test/runtime/scheduler.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { QueryScheduler } from '../../src/runtime/scheduler.js';
import { RequestBudget } from '../../src/runtime/budget.js';
import { ForbiddenError, RateLimitedError } from '../../src/vinted/errors.js';
import type { MarketplaceListing } from '../../src/domain/listing.js';
import type { SniperQuery } from '../../src/domain/query.js';

const NOW = new Date('2026-08-30T10:00:00.000Z');

function makeQuery(overrides: Partial<SniperQuery> = {}): SniperQuery {
  return {
    id: 'q1',
    queryKey: 'vinted|search=nike|catalog=-|brand=-|price_to=-',
    marketplace: 'vinted',
    searchText: 'nike',
    catalogId: null,
    brandId: null,
    priceTo: null,
    pollIntervalMs: 60000,
    isSeeded: true,
    isActive: true,
    lastPolledAt: null,
    lastStatus: 'never_polled',
    consecutiveFailures: 0,
    ...overrides,
  };
}

function makeListing(externalId: string): MarketplaceListing {
  return {
    marketplace: 'vinted',
    externalId,
    title: 'Nike Air Max',
    url: `https://www.vinted.de/items/${externalId}`,
    imageUrl: null,
    price: { amount: 30, currency: 'EUR' },
    brand: 'Nike',
    size: '43',
    condition: 'Gut',
    photoUploadedAt: null,
  };
}

function build(query: SniperQuery, overrides: Record<string, unknown> = {}) {
  const queries = {
    dueQueries: vi.fn().mockResolvedValue([query]),
    markPolled: vi.fn().mockResolvedValue(undefined),
    markSeeded: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
  };
  const collector = { collect: vi.fn().mockResolvedValue([makeListing('a'), makeListing('b')]) };
  const listings = { saveNew: vi.fn().mockResolvedValue([makeListing('a')]) };
  const log = { info: vi.fn(), error: vi.fn() };
  const budget = new RequestBudget(10, () => NOW.getTime());

  const scheduler = new QueryScheduler({
    queries,
    collector,
    listings,
    budget,
    log,
    ...overrides,
  } as never);

  return { scheduler, queries, collector, listings, log };
}

describe('QueryScheduler', () => {
  it('stores listings and counts the new ones', async () => {
    const { scheduler, listings } = build(makeQuery());

    const report = await scheduler.runOnce(NOW);

    expect(listings.saveNew).toHaveBeenCalledTimes(1);
    expect(report.polled).toBe(1);
    expect(report.newListings).toBe(1);
  });

  it('reports nothing as new during the seeding run', async () => {
    const { scheduler, queries, listings } = build(makeQuery({ isSeeded: false }));

    const report = await scheduler.runOnce(NOW);

    expect(listings.saveNew).toHaveBeenCalledTimes(1);
    expect(report.newListings).toBe(0);
    expect(report.seeded).toBe(1);
    expect(queries.markSeeded).toHaveBeenCalledWith('q1');
  });

  it('skips a query when the budget is exhausted', async () => {
    // RequestBudget lehnt 0 als Kapazitaet ab (RangeError, siehe Task 8), also
    // wird das einzige Kontingent hier schon vor dem Lauf verbraucht.
    const budget = new RequestBudget(1, () => NOW.getTime());
    budget.tryConsume();
    const { scheduler, collector } = build(makeQuery(), { budget });

    const report = await scheduler.runOnce(NOW);

    expect(collector.collect).not.toHaveBeenCalled();
    expect(report.skippedForBudget).toBe(1);
  });

  it('records a rate limit without deactivating the query', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new RateLimitedError()) };
    const { scheduler, queries } = build(makeQuery(), { collector });

    const report = await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'rate_limited');
    expect(queries.deactivate).not.toHaveBeenCalled();
    expect(report.failed).toBe(1);
  });

  it('deactivates a query that was forbidden', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new ForbiddenError()) };
    const { scheduler, queries } = build(makeQuery(), { collector });

    await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'forbidden');
    expect(queries.deactivate).toHaveBeenCalledWith('q1');
  });

  it('deactivates a query after the third consecutive failure', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new Error('network down')) };
    const { scheduler, queries } = build(makeQuery({ consecutiveFailures: 2 }), { collector });

    await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'failed');
    expect(queries.deactivate).toHaveBeenCalledWith('q1');
  });

  it('does not mark anything as seen when the response was rejected', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new Error('schema violation')) };
    const { scheduler, listings } = build(makeQuery(), { collector });

    await scheduler.runOnce(NOW);

    expect(listings.saveNew).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: FEHLER `Failed to resolve import "../../src/runtime/scheduler.js"`.

- [ ] **Step 3: Umsetzen**

Create `services/sniper/src/runtime/scheduler.ts`:

```ts
import type { MarketplaceListing } from '../domain/listing.js';
import type { QueryStatus, SniperQuery } from '../domain/query.js';
import type { Logger } from '../log.js';
import { ForbiddenError, RateLimitedError } from '../vinted/errors.js';
import type { RequestBudget } from './budget.js';

const MAX_CONSECUTIVE_FAILURES = 3;

export interface QueryStoreLike {
  dueQueries(now: Date): Promise<SniperQuery[]>;
  markPolled(id: string, status: QueryStatus): Promise<void>;
  markSeeded(id: string): Promise<void>;
  deactivate(id: string): Promise<void>;
}

export interface CollectorLike {
  collect(query: SniperQuery): Promise<MarketplaceListing[]>;
}

export interface ListingStoreLike {
  saveNew(
    listings: MarketplaceListing[],
    discoveredByQueryId: string,
  ): Promise<MarketplaceListing[]>;
}

export interface CycleReport {
  polled: number;
  skippedForBudget: number;
  newListings: number;
  seeded: number;
  failed: number;
}

export interface SchedulerDeps {
  queries: QueryStoreLike;
  collector: CollectorLike;
  listings: ListingStoreLike;
  budget: RequestBudget;
  log: Logger;
}

export class QueryScheduler {
  constructor(private readonly deps: SchedulerDeps) {}

  async runOnce(now: Date): Promise<CycleReport> {
    const report: CycleReport = {
      polled: 0,
      skippedForBudget: 0,
      newListings: 0,
      seeded: 0,
      failed: 0,
    };

    // Die aelteste Abfrage zuerst - das Budget entscheidet bei Knappheit nach
    // Wartezeit, nicht nach Paket.
    for (const query of await this.deps.queries.dueQueries(now)) {
      if (!this.deps.budget.tryConsume()) {
        report.skippedForBudget += 1;
        continue;
      }

      await this.pollOne(query, report);
    }

    this.deps.log.info('cycle', {
      polled: report.polled,
      new: report.newListings,
      seeded: report.seeded,
      failed: report.failed,
      skipped: report.skippedForBudget,
      budget: this.deps.budget.usageRatio().toFixed(2),
    });

    return report;
  }

  private async pollOne(query: SniperQuery, report: CycleReport): Promise<void> {
    let listings: MarketplaceListing[];

    try {
      listings = await this.deps.collector.collect(query);
    } catch (error) {
      await this.handleFailure(query, error, report);
      return;
    }

    const created = await this.deps.listings.saveNew(listings, query.id);
    report.polled += 1;

    if (query.isSeeded) {
      // Nur ausserhalb des Einlese-Laufs gelten neue Artikel als Fund.
      report.newListings += created.length;
    } else {
      await this.deps.queries.markSeeded(query.id);
      report.seeded += 1;
    }

    await this.deps.queries.markPolled(query.id, 'ok');
  }

  private async handleFailure(
    query: SniperQuery,
    error: unknown,
    report: CycleReport,
  ): Promise<void> {
    report.failed += 1;

    if (error instanceof RateLimitedError) {
      this.deps.log.error('rate_limited', { query: query.id });
      await this.deps.queries.markPolled(query.id, 'rate_limited');
      return;
    }

    if (error instanceof ForbiddenError) {
      this.deps.log.error('forbidden', { query: query.id });
      await this.deps.queries.markPolled(query.id, 'forbidden');
      await this.deps.queries.deactivate(query.id);
      return;
    }

    this.deps.log.error('cycle_failed', {
      query: query.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    await this.deps.queries.markPolled(query.id, 'failed');

    if (query.consecutiveFailures + 1 >= MAX_CONSECUTIVE_FAILURES) {
      await this.deps.queries.deactivate(query.id);
    }
  }
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

```bash
cd services/sniper && npm test
```

Erwartung: 52 Tests bestanden.

- [ ] **Step 5: Commit**

```bash
git add services/sniper/src/runtime/scheduler.ts services/sniper/test/runtime/scheduler.spec.ts
git commit -m "feat(sniper): drive polling cycles with a seeding run and failure limits"
```

---

### Task 11: Einstiegspunkt, Standardprofile und Betrieb

**Files:**

- Create: `services/sniper/src/index.ts`, `services/sniper/src/health.ts`, `services/sniper/Dockerfile`, `services/sniper/README.md`
- Modify: `services/sniper/src/config.ts` (Health-Port), `services/sniper/.env.example` (Health-Port)
- Modify: `deploy/docker-compose.app.yml` (neuer Dienst `sniper`)
- Test: `services/sniper/test/health.spec.ts`

**Interfaces:**

- Consumes: alles aus Task 2 bis 10.

- [ ] **Step 1: Einstiegspunkt umsetzen**

Create `services/sniper/src/index.ts`:

```ts
import 'dotenv/config';
import { loadConfig } from './config.js';
import { createLogger } from './log.js';
import { RequestBudget } from './runtime/budget.js';
import { QueryScheduler } from './runtime/scheduler.js';
import { ListingStore } from './store/listing.store.js';
import { QueryStore } from './store/query.store.js';
import { createSupabaseClient } from './store/supabase.js';
import { VintedCollector } from './vinted/collector.js';
import { VintedSession, sleep } from './vinted/session.js';

const config = loadConfig(process.env);
const log = createLogger();
const client = createSupabaseClient(config);
const sessionOptions = { baseUrl: config.vintedBaseUrl, userAgent: config.userAgent };
const session = new VintedSession(sessionOptions);

const scheduler = new QueryScheduler({
  queries: new QueryStore(client),
  collector: new VintedCollector(sessionOptions, session),
  listings: new ListingStore(client),
  budget: new RequestBudget(config.requestsPerMinute),
  log,
});

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info('shutdown_requested', { signal });
    controller.abort();
  });
}

log.info('started', {
  requestsPerMinute: config.requestsPerMinute,
  tickIntervalMs: config.tickIntervalMs,
});

while (!controller.signal.aborted) {
  try {
    await scheduler.runOnce(new Date());
  } catch (error) {
    log.error('tick_failed', { reason: error instanceof Error ? error.message : String(error) });
  }

  await sleep(config.tickIntervalMs);
}

log.info('stopped');
```

- [ ] **Step 2: Typecheck, Bau und alle Unit-Tests laufen lassen**

```bash
cd services/sniper && npm run typecheck && npm run build && ls dist/index.js && npm test
```

Erwartung: kein Typfehler, `dist/index.js` existiert, 52 Tests bestanden. Der Bau muss hier laufen, weil er im Betriebsabbild verwendet wird – Node löst `./config.js` nicht auf `config.ts` auf, ein direkter Start der TypeScript-Dateien scheitert also.

- [ ] **Step 3: Standardprofil anlegen und echten Rauchtest fahren**

Im Repo-Stammverzeichnis, bei laufender lokaler Datenbank:

```bash
npx supabase db query --local "insert into public.sniper_queries (query_key, search_text, price_to, is_standard, poll_interval_ms) values ('vinted|search=nike air max|catalog=-|brand=-|price_to=50', 'nike air max', 50, true, 60000) on conflict (query_key) do nothing;"
```

Dann den Dienst starten:

```bash
cd services/sniper && npm run dev
```

Erwartung: eine erste Zeile `... info cycle polled=1 new=0 seeded=1 failed=0 skipped=0 budget=0.03` – der Einlese-Lauf meldet nichts als neu. Nach der zweiten Runde erscheint `seeded=0` und `new=` mit der Zahl echter neuer Artikel.

Prüfen, dass Artikel angekommen sind und keine Verkäuferdaten enthalten:

```bash
npx supabase db query --local "select count(*), min(first_seen_at), max(total_price) from public.sniper_listings;"
```

Dienst mit Strg+C beenden. Erwartung: `shutdown_requested` gefolgt von `stopped`, kein abgebrochener Request.

- [ ] **Step 4: Fehlschlagenden Test für den Health-Zustand schreiben**

Die Spec verlangt unter „Betrieb": _„Ein Health-Endpunkt meldet letzte erfolgreiche Runde, Budgetauslastung und Zahl stillgelegter Abfragen."_

Create `services/sniper/test/health.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createHealthState } from '../src/health.js';

const report = {
  polled: 2,
  skippedForBudget: 1,
  newListings: 3,
  seeded: 0,
  failed: 0,
};

describe('createHealthState', () => {
  it('starts as not ready before the first cycle', () => {
    const state = createHealthState(() => 0.25);

    expect(state.snapshot()).toEqual({
      ready: false,
      lastSuccessfulCycleAt: null,
      budgetUsageRatio: 0.25,
      deactivatedQueries: 0,
    });
  });

  it('records the time of the last successful cycle', () => {
    const state = createHealthState(() => 0.5);

    state.recordCycle(report, new Date('2026-08-30T10:00:00.000Z'));

    expect(state.snapshot().ready).toBe(true);
    expect(state.snapshot().lastSuccessfulCycleAt).toBe('2026-08-30T10:00:00.000Z');
  });

  it('counts deactivated queries across cycles', () => {
    const state = createHealthState(() => 0);

    state.recordDeactivation();
    state.recordDeactivation();

    expect(state.snapshot().deactivatedQueries).toBe(2);
  });

  it('does not mark a cycle successful when every query failed', () => {
    const state = createHealthState(() => 0);

    state.recordCycle({ ...report, polled: 0, failed: 2 }, new Date());

    expect(state.snapshot().ready).toBe(false);
  });
});
```

- [ ] **Step 5: Health-Zustand und Endpunkt umsetzen**

Run: `cd services/sniper && npm test`
Erwartung vorher: FEHLER `Failed to resolve import "../src/health.js"`.

Create `services/sniper/src/health.ts`:

```ts
import { createServer, type Server } from 'node:http';
import type { CycleReport } from './runtime/scheduler.js';

export interface HealthSnapshot {
  ready: boolean;
  lastSuccessfulCycleAt: string | null;
  budgetUsageRatio: number;
  deactivatedQueries: number;
}

export interface HealthState {
  recordCycle(report: CycleReport, at: Date): void;
  recordDeactivation(): void;
  snapshot(): HealthSnapshot;
}

/**
 * „Bereit" heisst: mindestens eine Abfrage lief in der letzten Runde durch.
 * Eine Runde, in der jede Abfrage scheiterte, zaehlt nicht - sonst meldet der
 * Dienst Gesundheit, waehrend er nichts mehr findet.
 */
export function createHealthState(budgetUsage: () => number): HealthState {
  let lastSuccessfulCycleAt: string | null = null;
  let deactivatedQueries = 0;

  return {
    recordCycle(report, at) {
      if (report.polled > 0) lastSuccessfulCycleAt = at.toISOString();
    },
    recordDeactivation() {
      deactivatedQueries += 1;
    },
    snapshot() {
      return {
        ready: lastSuccessfulCycleAt !== null,
        lastSuccessfulCycleAt,
        budgetUsageRatio: budgetUsage(),
        deactivatedQueries,
      };
    },
  };
}

export function startHealthServer(port: number, state: HealthState): Server {
  const server = createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }

    const snapshot = state.snapshot();
    response.writeHead(snapshot.ready ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(snapshot));
  });

  return server.listen(port);
}
```

In `services/sniper/src/config.ts` das Schema und die Schnittstelle um den Port ergänzen:

```ts
  SNIPER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
```

```ts
healthPort: number;
```

```ts
    healthPort: parsed.SNIPER_HEALTH_PORT,
```

In `services/sniper/.env.example` ergänzen:

```dotenv
SNIPER_HEALTH_PORT=8080
```

In `services/sniper/src/index.ts` einbauen: nach dem Erzeugen des Budgets den Zustand anlegen, den Server starten, im Schleifenkörper die Runde melden und beim Beenden schließen.

```ts
const budget = new RequestBudget(config.requestsPerMinute);
const health = createHealthState(() => budget.usageRatio());
const healthServer = startHealthServer(config.healthPort, health);
```

Das `budget: new RequestBudget(config.requestsPerMinute)` im `QueryScheduler` wird durch `budget` ersetzt. Im Schleifenkörper nach `runOnce`:

```ts
const report = await scheduler.runOnce(new Date());
health.recordCycle(report, new Date());
```

Und vor `log.info('stopped')`:

```ts
healthServer.close();
```

Run: `cd services/sniper && npm test`
Erwartung: 56 Tests bestanden.

Endpunkt prüfen, während `npm run dev` läuft:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/health
```

Erwartung: `503` vor der ersten Runde, danach `200`.

- [ ] **Step 6: Betriebsdateien anlegen**

Create `services/sniper/Dockerfile`:

```dockerfile
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.js"]
```

In `deploy/docker-compose.app.yml` den Dienst ergänzen (die Datei ist prettier-ignoriert, die Einrückung der bestehenden Dienste übernehmen):

```yaml
sniper:
  build:
    context: ../services/sniper
  restart: unless-stopped
  environment:
    SUPABASE_URL: ${SUPABASE_URL}
    SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
    SNIPER_REQUESTS_PER_MINUTE: ${SNIPER_REQUESTS_PER_MINUTE:-30}
    SNIPER_TICK_INTERVAL_MS: ${SNIPER_TICK_INTERVAL_MS:-5000}
    SNIPER_HEALTH_PORT: 8080
  healthcheck:
    test: ['CMD', 'wget', '--spider', '-q', 'http://127.0.0.1:8080/health']
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 60s
  logging:
    driver: json-file
    options:
      max-size: '10m'
      max-file: '3'
```

Create `services/sniper/README.md`:

```markdown
# Flipbase Sniper

Sammelt neue Vinted-Angebote und legt sie in Supabase ab. Etappe 1: kein Filter,
keine Zustellung, keine Oberfläche.

## Start

    cp .env.example .env
    # SUPABASE_SERVICE_ROLE_KEY aus `npx supabase status` eintragen
    npm install
    npm test
    npm run dev

## Grenzen

- Eine Seite je Abfrage, höchstens 96 Artikel. Mehr liefert Vinted nicht.
- Der Katalog hinkt der Veröffentlichung rund 10 bis 15 Sekunden hinterher.
  Ein Takt unter 5 Sekunden bringt deshalb nichts.
- HTTP 401 entsteht vor allem, wenn man alle `Set-Cookie`-Werte stumpf zusammenfügt;
  die Startseite setzt `access_token_web` zweimal. Der Sammler wärmt die Sitzung sonst einmal neu
  auf; erst der zweite 401 in Folge gilt als Fehler.
- Vinteds Bedingungen untersagen automatisierte Zugriffe. Siehe Spec, Abschnitt
  „Offene Punkte und Risiken".

## Was hier nicht hingehört

Verkäuferdaten. Der Katalog liefert Name, Profiladresse und Profilfoto mit;
`normalizeVintedItem` verwirft das. Wer ein Feld ergänzt, prüft vorher den Test
`test/vinted/normalizer.spec.ts`.
```

- [ ] **Step 7: Root-Prüfungen bestehen**

Vom Repo-Stammverzeichnis:

```bash
npx prettier --check services/ && npx eslint services/
```

Erwartung: beide ohne Befund.

- [ ] **Step 8: Sicherstellen, dass der Root-Verify unberührt bleibt**

```bash
npm run typecheck && npm test
```

Erwartung: identisches Ergebnis wie vor diesem Branch – der neue Dienst liegt außerhalb von `src/` und darf weder im Typecheck noch im Root-Vitest auftauchen.

- [ ] **Step 9: Commit**

```bash
git add services/sniper deploy/docker-compose.app.yml
git commit -m "feat(sniper): run the collector as a service with a health endpoint"
```

---

## Abschluss der Etappe

Nach Task 11 gilt Etappe 1 als erledigt, wenn:

- `cd services/sniper && npm test` grün ist (56 Tests),
- `cd services/sniper && npm run test:integration` grün ist (10 Tests),
- der Datenbanktest `supabase/tests/vinted_deal_monitor_schema.sql` ohne Fehler durchläuft,
- der Dienst mindestens eine Stunde lokal lief und `select count(*) from public.sniper_listings` wächst,
- `curl http://127.0.0.1:8080/health` mit 200 antwortet,
- `npm run typecheck && npm test` im Stammverzeichnis unverändert durchläuft.

Etappe 2 (Filter, Treffer, Zustellung) setzt darauf auf und bekommt einen eigenen Plan.

## Bewusst verschoben

- **Aufbewahrung.** Die Spec sieht das Löschen von `sniper_listings` nach 30 Tagen vor. Das gehört zusammen mit der Verdichtung der Preishistorie in Etappe 3; in einer Etappe-1-Laufzeit von Stunden bis Tagen entsteht kein Problem. Sobald der Dienst dauerhaft läuft, muss es nachgezogen werden – sonst wächst die Tabelle unbegrenzt.
- **Mehrere Länder und mehrere Seiten je Abfrage.** Ausdrücklich nicht Teil der Spec.

## Nach dem Test- und CI-Umbau nachziehen

Bewusst offen gelassen, weil es Dateien betrifft, die gerade auf `master` umgebaut werden:

- `services/sniper` in `.github/workflows/ci.yml` aufnehmen: `npm ci && npm test` im Dienstverzeichnis.
- Entscheiden, ob die Integrationstests in der CI gegen eine gestartete Supabase-Instanz laufen sollen.
- `supabase/tests/*.sql` in die CI aufnehmen – heute laufen sie nur von Hand.
