# Demo-Modus entfernen, PR 1: Browser-Tests auf lokale Supabase – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kein Browser-Test braucht mehr den Demo-Modus. Die Tests laufen angemeldet gegen die lokale Supabase, und lokal gibt es ein Testkonto mit Beispieldaten.

**Architecture:** Ein Playwright-`globalSetup` registriert je Lauf ein Testkonto und legt dessen Sitzung als `storageState` ab. Eine automatische Fixture gibt jedem Test einen frischen Workspace. Ein kleines Hilfsmodul legt über die echten Datenbankfunktionen abgeschlossene Einkäufe und Verkäufe an. Tests, die fest an Demo-Daten hängen, werden gelöscht. `supabase/seed.sql` legt lokal das Konto `test@flipbase.local` mit Beispieldaten an.

**Tech Stack:** Playwright 1.62, `@supabase/supabase-js` 2, lokale Supabase (Docker), Node-`node:test` für Workflow-Prüfungen, GitHub Actions.

**Entwurf:** `docs/superpowers/specs/2026-09-18-remove-demo-mode-design.md`, Abschnitte 1 und 2.

## Global Constraints

- Arbeitsverzeichnis `K:/GitHub/Repos/flipbase/.worktrees/remove-demo-mode`, Zweig `chore/remove-demo-mode`. Vor jeder Aufgabe `git branch --show-current` prüfen. Kein `git stash`. Beim ersten Start `npm ci` ausführen.
- Commits: Englisch, Conventional Commits, Titel im Imperativ, Body erklärt das Warum und was geprüft wurde. **Keine** `Co-Authored-By`-Zeile und keine Assistenten-Signatur. Scopes: `ci` für Test- und Workflow-Infrastruktur, `core` für Seed-Daten.
- Kommentare und Oberflächentexte deutsch, Bezeichner englisch.
- Docker mit lokaler Supabase läuft (`npx supabase start`). API: `http://127.0.0.1:54351`.
- Tests dürfen nur gegen `127.0.0.1` oder `localhost` laufen. Kein Service-Role-Schlüssel in Tests oder Repo.
- Test- und Seed-Adressen enden auf `.local`. Test-Passwörter entstehen zufällig zur Laufzeit.
- Die lokale Anmeldung erlaubt 30 Registrierungen und Anmeldungen je 5 Minuten. Ein Testlauf darf höchstens eine Registrierung im `globalSetup` plus eine im Login-Test verbrauchen.
- Der Demo-Modus bleibt in PR 1 im App-Code bestehen. Nichts unter `src/` ändern.
- Pflichttests (genau sechs, `playwright.pr.config.ts`):
  - `core-smoke.spec.ts`: zwei `@core-smoke`-Fälle
  - `purchase-editable-draft.spec.ts`: „keeps a saved draft editable through discard, save and reopening @pr-smoke“
  - `purchase-tax-costs.spec.ts`: „preserves purchase cost origin after reopening at 1440px @pr-smoke“ und der Steuerjournal-Fall
  - `inventory-sale.spec.ts`: „verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke“
- Exitcodes nie durch eine Pipe messen: `cmd > /tmp/x.log 2>&1; echo $?`.

## Dateistruktur

| Datei                                                                                                                           | Verantwortung                                               | Task |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---- |
| `e2e/support/local-supabase.ts` (neu)                                                                                           | Lokale Adresse prüfen, Supabase-Clients für Tests           | 1    |
| `e2e/support/test-account.ts` (neu)                                                                                             | Pfad und Schlüssel der Testsitzung, Zugangs-Token lesen     | 1    |
| `e2e/global-setup.ts` (neu)                                                                                                     | Testkonto je Lauf registrieren, Sitzung ablegen             | 1    |
| `e2e/support/fixtures.ts` (neu)                                                                                                 | `test` mit automatischem Workspace je Test, `openDashboard` | 1    |
| `e2e/login.spec.ts` (neu), `e2e/local-supabase.spec.ts` (neu)                                                                   | Echte Anmeldung, Adressprüfung                              | 1    |
| `playwright.config.ts`, `.gitignore`                                                                                            | `globalSetup`, `storageState`, `e2e/.auth/` ignorieren      | 1    |
| `e2e/support/sample-data.ts` (neu)                                                                                              | Abgeschlossener Einkauf, Verkauf über echte Funktionen      | 2    |
| `e2e/core-smoke.spec.ts`, `e2e/purchase-editable-draft.spec.ts`, `e2e/purchase-tax-costs.spec.ts`, `e2e/inventory-sale.spec.ts` | Pflichttests umstellen                                      | 2    |
| `playwright.pr.config.ts`, `scripts/playwright-pr-smoke.test.mjs`                                                               | Neue Testnamen in den Auswahllisten                         | 2    |
| `.github/workflows/ci.yml`                                                                                                      | Browser-Job startet lokale Supabase                         | 3    |
| `scripts/seed-isolation.test.mjs` (neu), `package.json`                                                                         | Seed gerät nie ins Live-Paket                               | 3    |
| übrige `e2e/*.spec.ts`, `e2e/support/demo.ts` (löschen)                                                                         | Umstellen oder löschen                                      | 4    |
| `supabase/seed.sql`                                                                                                             | Lokales Testkonto mit Beispieldaten                         | 5    |
| `docs/testing/lean-ci.md`, `README.md`, `docs/AI-CHANGELOG.md`                                                                  | Doku, Protokoll                                             | 6    |

---

### Task 1: Testkonto je Lauf, Workspace je Test, Login-Test

**Files:**

- Create: `e2e/support/local-supabase.ts`
- Create: `e2e/support/test-account.ts`
- Create: `e2e/global-setup.ts`
- Create: `e2e/support/fixtures.ts`
- Create: `e2e/login.spec.ts`
- Create: `e2e/local-supabase.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: `environment` aus `src/environments/environment.development.ts` (`supabaseUrl`, `supabaseAnonKey`); RPC `create_workspace(p_name text) returns uuid`; Browser-Schlüssel `flipbase_active_workspace_id`.
- Produces:
  - `assertLocalSupabaseUrl(url: string): string`
  - `createAnonClient(): SupabaseClient`
  - `createUserClient(accessToken: string): SupabaseClient`
  - `AUTH_STATE_PATH = 'e2e/.auth/session.json'`, `AUTH_STORAGE_KEY`, `APP_ORIGIN = 'http://127.0.0.1:4200'`, `readAccessToken(): string`
  - `test` (mit automatischer Fixture `workspace: { id: string; client: SupabaseClient }`) und `expect` aus `e2e/support/fixtures.ts`
  - `openDashboard(page: Page): Promise<void>` als Ersatz für `startDemoMode(page)`

- [ ] **Step 1: Tests schreiben**

`e2e/local-supabase.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { assertLocalSupabaseUrl } from './support/local-supabase';

test('lässt Browser-Tests nur gegen die lokale Supabase laufen', () => {
  expect(assertLocalSupabaseUrl('http://127.0.0.1:54351')).toBe('http://127.0.0.1:54351');
  expect(assertLocalSupabaseUrl('http://localhost:54321')).toBe('http://localhost:54321');
  expect(() => assertLocalSupabaseUrl('https://abcdefgh.supabase.co')).toThrow(
    'nur gegen die lokale Supabase',
  );
});
```

`e2e/login.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createAnonClient } from './support/local-supabase';

// Ohne gespeicherte Sitzung: Dieser Test prüft die echte Anmeldung.
test.use({ storageState: { cookies: [], origins: [] } });

test('meldet sich mit einem echten Konto an', async ({ page }) => {
  const email = `e2e-login-${randomUUID()}@flipbase.local`;
  const password = randomUUID();
  const { error } = await createAnonClient().auth.signUp({ email, password });
  expect(error).toBeNull();

  await page.goto('/auth/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Ertrag im Blick' })).toBeVisible();
});
```

- [ ] **Step 2: Tests laufen lassen**

```bash
npx supabase start > /tmp/start.log 2>&1; echo $?
npx playwright test e2e/local-supabase.spec.ts e2e/login.spec.ts > /tmp/e2e.log 2>&1; echo $?
```

Expected: Supabase `0`, Playwright ungleich `0` (Modul `./support/local-supabase` fehlt).

- [ ] **Step 3: Hilfsmodule und Setup anlegen**

`e2e/support/local-supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../src/environments/environment.development';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/** Bricht ab, bevor ein Test gegen eine andere als die lokale Supabase schreiben könnte. */
export function assertLocalSupabaseUrl(url: string): string {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Browser-Tests laufen nur gegen die lokale Supabase, nicht gegen ${host}.`);
  }
  return url;
}

export const supabaseUrl = assertLocalSupabaseUrl(environment.supabaseUrl);
const supabaseAnonKey = environment.supabaseAnonKey;

const noSessionStorage = { persistSession: false, autoRefreshToken: false } as const;

export function createAnonClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, { auth: noSessionStorage });
}

/** Handelt als angemeldetes Testkonto, ohne erneut die Anmeldung aufzurufen. */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: noSessionStorage,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
```

`e2e/support/test-account.ts`:

```ts
import { readFileSync } from 'node:fs';
import { supabaseUrl } from './local-supabase';

/** Laufzeit-Sitzung des Testkontos. Der Ordner e2e/.auth/ steht in .gitignore. */
export const AUTH_STATE_PATH = 'e2e/.auth/session.json';
export const APP_ORIGIN = 'http://127.0.0.1:4200';
/** Derselbe Schlüssel, unter dem supabase-js im Browser die Sitzung ablegt. */
export const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

interface StorageState {
  readonly origins: readonly {
    readonly localStorage: readonly { name: string; value: string }[];
  }[];
}

export function readAccessToken(): string {
  const state = JSON.parse(readFileSync(AUTH_STATE_PATH, 'utf8')) as StorageState;
  const entry = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name === AUTH_STORAGE_KEY);
  if (!entry) throw new Error('Die Sitzung des Testkontos fehlt. Lief das globale Setup?');
  return (JSON.parse(entry.value) as { access_token: string }).access_token;
}
```

`e2e/global-setup.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createAnonClient } from './support/local-supabase';
import { APP_ORIGIN, AUTH_STATE_PATH, AUTH_STORAGE_KEY } from './support/test-account';

/**
 * Registriert je Testlauf genau ein Konto. Lokal ist keine E-Mail-Bestätigung nötig,
 * deshalb liefert die Registrierung direkt die Sitzung – ohne zweite Anmeldung.
 */
export default async function globalSetup(): Promise<void> {
  const { data, error } = await createAnonClient().auth.signUp({
    email: `e2e-${randomUUID()}@flipbase.local`,
    password: randomUUID(),
  });
  if (error || !data.session) {
    throw new Error(
      `Testkonto konnte nicht angelegt werden: ${error?.message ?? 'keine Sitzung – ist die E-Mail-Bestätigung lokal aus?'}`,
    );
  }
  await mkdir(dirname(AUTH_STATE_PATH), { recursive: true });
  await writeFile(
    AUTH_STATE_PATH,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: APP_ORIGIN,
          localStorage: [{ name: AUTH_STORAGE_KEY, value: JSON.stringify(data.session) }],
        },
      ],
    }),
    'utf8',
  );
}
```

`e2e/support/fixtures.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUserClient } from './local-supabase';
import { readAccessToken } from './test-account';

export interface TestWorkspace {
  readonly id: string;
  readonly client: SupabaseClient;
}

/** Jeder Test bekommt automatisch einen frischen, leeren Workspace im Testkonto. */
export const test = base.extend<{ workspace: TestWorkspace }>({
  workspace: [
    async ({ page }, use) => {
      const client = createUserClient(readAccessToken());
      const { data, error } = await client.rpc('create_workspace', {
        p_name: `E2E ${randomUUID().slice(0, 8)}`,
      });
      if (error || typeof data !== 'string') {
        throw new Error(`Test-Workspace fehlt: ${error?.message ?? 'keine Kennung zurückgegeben'}`);
      }
      await page.addInitScript((id) => {
        localStorage.setItem('flipbase_active_workspace_id', id);
      }, data);
      await use({ id: data, client });
    },
    { auto: true },
  ],
});

export { expect };

/** Ersatz für den früheren Demo-Start: öffnet die App angemeldet im Test-Workspace. */
export async function openDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Ertrag im Blick' })).toBeVisible();
}
```

In `playwright.config.ts` im `defineConfig`-Objekt ergänzen (nach `testDir`) und `use` erweitern:

```ts
  globalSetup: './e2e/global-setup.ts',
```

```ts
  use: {
    baseURL: 'http://127.0.0.1:4200',
    storageState: 'e2e/.auth/session.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
```

In `.gitignore` nach `/test-results/` ergänzen:

```
/e2e/.auth/
```

- [ ] **Step 4: Tests laufen lassen**

```bash
npx playwright test e2e/local-supabase.spec.ts e2e/login.spec.ts > /tmp/e2e.log 2>&1; echo $?
git status --short e2e/.auth
```

Expected: `0`; `git status` zeigt nichts unter `e2e/.auth` (ignoriert). Scheitert der Login-Test, weil nach der Anmeldung ein Einrichtungsschritt statt des Dashboards erscheint, den tatsächlichen Zielpfad im Test verwenden und das im Commit-Body nennen.

- [ ] **Step 5: Formatieren, linten, committen**

```bash
npx prettier --write e2e/support/local-supabase.ts e2e/support/test-account.ts e2e/support/fixtures.ts e2e/global-setup.ts e2e/login.spec.ts e2e/local-supabase.spec.ts playwright.config.ts .gitignore
npx eslint e2e/support e2e/global-setup.ts e2e/login.spec.ts e2e/local-supabase.spec.ts playwright.config.ts > /tmp/lint.log 2>&1; echo $?
git add e2e/support/local-supabase.ts e2e/support/test-account.ts e2e/support/fixtures.ts e2e/global-setup.ts e2e/login.spec.ts e2e/local-supabase.spec.ts playwright.config.ts .gitignore
git commit -m "ci: run browser tests against the local Supabase with one account per run" -m "Browser tests must stop depending on demo mode, which is going away. Each run registers one account; local sign-up returns the session directly, so the run stays far below the local limit of 30 sign-ins per five minutes. Every test gets a fresh workspace through an automatic fixture, and helpers refuse any Supabase URL other than 127.0.0.1 or localhost. Verified with the new login and URL guard tests."
```

---

### Task 2: Testdaten-Hilfe und die sechs Pflichttests

**Files:**

- Create: `e2e/support/sample-data.ts`
- Modify: `e2e/core-smoke.spec.ts`
- Modify: `e2e/purchase-editable-draft.spec.ts`
- Modify: `e2e/purchase-tax-costs.spec.ts`
- Modify: `e2e/inventory-sale.spec.ts`
- Modify: `playwright.pr.config.ts:9-15`
- Modify: `scripts/playwright-pr-smoke.test.mjs` (Listen `coreTests` und `regressionTests`)

**Interfaces:**

- Consumes: `test`, `expect`, `openDashboard`, `TestWorkspace` aus Task 1; RPCs `create_purchase(p_workspace_id, p_purchase jsonb, p_expenses jsonb, p_lines jsonb) returns jsonb` (Einkaufs-ID unter `purchase.id`), `receive_individual_purchase_line(p_workspace_id, p_purchase_id, p_purchase_line_id, p_item jsonb)`, `finalize_purchase_costing(p_workspace_id, p_purchase_id)`, `record_sale(p_workspace_id, p_sale jsonb, p_lines jsonb)`.
- Produces:
  - `createFinalizedPurchase(workspace: TestWorkspace, input: { title: string; purchaseDate: string; items: readonly { title: string; price: number }[] }): Promise<{ purchaseId: string; items: SampleItem[] }>`
  - `recordSale(workspace: TestWorkspace, input: { saleDate: string; lines: readonly { item: SampleItem; price: number }[] }): Promise<void>`
  - `SampleItem = { id: string; title: string }`
  - Neue Testnamen: „öffnet die App und zentrale Arbeitsbereiche @core-smoke“ und „keeps per-item tax visible in the tax journal @pr-smoke“

- [ ] **Step 1: Testdaten-Hilfe anlegen**

`e2e/support/sample-data.ts`:

```ts
import type { TestWorkspace } from './fixtures';

export interface SampleItem {
  readonly id: string;
  readonly title: string;
}

async function call<T>(
  workspace: TestWorkspace,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await workspace.client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/**
 * Legt einen Einkauf über dieselben Datenbankfunktionen wie die App an, nimmt jede
 * Position als Einzelartikel an und schließt ihn ab. Die Artikel sind danach verkaufbar.
 */
export async function createFinalizedPurchase(
  workspace: TestWorkspace,
  input: {
    readonly title: string;
    readonly purchaseDate: string;
    readonly items: readonly { readonly title: string; readonly price: number }[];
  },
): Promise<{ purchaseId: string; items: SampleItem[] }> {
  const total = input.items.reduce((sum, item) => sum + item.price, 0);
  const created = await call<{ purchase: { id: string } }>(workspace, 'create_purchase', {
    p_workspace_id: workspace.id,
    p_purchase: {
      type: input.items.length === 1 ? 'single' : 'lot',
      title: input.title,
      purchase_date: input.purchaseDate,
      purchase_price: total,
      discount_amount: 0,
      content_status: 'known',
      pricing_mode: 'individual',
      shipment_status: 'arrived',
      cost_allocation_mode: 'even',
    },
    p_expenses: [],
    p_lines: input.items.map((item, index) => ({
      client_ref: `e2e-line-${index}`,
      catalog_product_id: null,
      title_snapshot: item.title,
      line_kind: 'individual',
      is_package: false,
      ordered_quantity: 1,
      price_mode: 'priced',
      unit_purchase_price: item.price,
      line_total: item.price,
      allocated_additional_cost: 0,
    })),
  });
  const purchaseId = created.purchase.id;

  const { data: lines, error: linesError } = await workspace.client
    .from('purchase_lines')
    .select('id, title_snapshot')
    .eq('workspace_id', workspace.id)
    .eq('purchase_id', purchaseId);
  if (linesError || !lines) throw new Error(`Positionen fehlen: ${linesError?.message}`);
  for (const line of lines) {
    await call(workspace, 'receive_individual_purchase_line', {
      p_workspace_id: workspace.id,
      p_purchase_id: purchaseId,
      p_purchase_line_id: line.id,
      p_item: { title: line.title_snapshot },
    });
  }
  await call(workspace, 'finalize_purchase_costing', {
    p_workspace_id: workspace.id,
    p_purchase_id: purchaseId,
  });

  const { data: items, error: itemsError } = await workspace.client
    .from('inventory_items')
    .select('id, title, status')
    .eq('workspace_id', workspace.id)
    .eq('purchase_id', purchaseId);
  if (itemsError || !items || items.length !== input.items.length) {
    throw new Error(`Artikel des Einkaufs fehlen: ${itemsError?.message ?? items?.length}`);
  }
  const notReady = items.filter((item) => item.status !== 'ready');
  if (notReady.length > 0) {
    throw new Error(
      `Artikel nach dem Abschluss nicht verkaufbar: ${notReady.map((item) => item.status).join(', ')}`,
    );
  }
  return { purchaseId, items: items.map((item) => ({ id: item.id, title: item.title })) };
}

export async function recordSale(
  workspace: TestWorkspace,
  input: {
    readonly saleDate: string;
    readonly lines: readonly { readonly item: SampleItem; readonly price: number }[];
  },
): Promise<void> {
  await call(workspace, 'record_sale', {
    p_workspace_id: workspace.id,
    p_sale: { platform: 'direct', sale_date: input.saleDate },
    p_lines: input.lines.map((line) => ({
      inventory_item_id: line.item.id,
      title_snapshot: line.item.title,
      quantity: 1,
      unit_sale_price: line.price,
    })),
  });
}
```

Meldet `finalize_purchase_costing`, dass Positionen noch offen sind, oder legt der Abschluss selbst Artikel an (dann wären es doppelt so viele), die Reihenfolge anhand von `supabase/schemas/database.sql` (`finalize_purchase_costing`, ab Zeile 3551) prüfen und die Hilfe so anpassen, dass am Ende genau ein verkaufbarer Artikel je Position existiert. Die Prüfungen am Ende der Funktion bleiben.

- [ ] **Step 2: Pflichttests umstellen**

In allen vier Dateien die Importe von `@playwright/test` (für `test`/`expect`) und `./support/demo` ersetzen durch:

```ts
import { expect, openDashboard, test } from './support/fixtures';
```

und jeden Aufruf `await startDemoMode(page);` durch `await openDashboard(page);` ersetzen. Andere Importe (z. B. `axe`, `addNewPurchaseProduct`) bleiben.

Zusätzlich:

`e2e/core-smoke.spec.ts`: Den Kommentar `// Absichtlich Demo-Daten: …` ersetzen durch `// Lokale Supabase mit frischem Test-Workspace; kein Ersatz für Auth/RLS-Tests.` und den ersten Testnamen ändern in `'öffnet die App und zentrale Arbeitsbereiche @core-smoke'`.

`e2e/inventory-sale.spec.ts`: Signatur und Datenanlage ändern:

```ts
import { createFinalizedPurchase } from './support/sample-data';

test('verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke', async ({
  page,
  workspace,
}) => {
  await createFinalizedPurchase(workspace, {
    title: 'Retro-Zubehör',
    purchaseDate: '2026-09-01',
    items: [{ title: saleItem, price: 20 }],
  });
  await openDashboard(page);
  await page.goto('/inventory');
```

Der Rest des Tests bleibt unverändert.

`e2e/purchase-tax-costs.spec.ts`: Den zweiten Test vollständig ersetzen durch:

```ts
// Die Exportsperre bei ungeprüften Kosten verlangt einen Zustand, den kein Mitglied
// herstellen kann. Sie ist in accounting-tax-review.angular.spec.ts abgedeckt.
test('keeps per-item tax visible in the tax journal @pr-smoke', async ({ page, workspace }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { items } = await createFinalizedPurchase(workspace, {
    title: 'Steuerposten',
    purchaseDate: '2026-08-10',
    items: [
      { title: 'Steuerstück A', price: 100 },
      { title: 'Steuerstück B', price: 100 },
    ],
  });
  const [itemA, itemB] = [...items].sort((a, b) => a.title.localeCompare(b.title));
  await recordSale(workspace, {
    saleDate: '2026-08-17',
    lines: [
      { item: itemA, price: 120 },
      { item: itemB, price: 80 },
    ],
  });

  await openDashboard(page);
  await page.goto('/accounting');
  await expect(
    page.getByRole('heading', { name: 'Finanzen, Steuern & Bankabgleich' }),
  ).toBeVisible();
  const journal = page.getByRole('table', { name: 'Steuerjournal' });
  await expect(journal.getByRole('row').filter({ hasText: 'Steuerstück A' })).toContainText('3,19');
  await expect(journal.getByRole('row').filter({ hasText: 'Steuerstück B' })).toContainText('0,00');
  await expect(page.getByRole('button', { name: 'DATEV EXTF CSV' })).toBeEnabled();
  await page.addScriptTag({ content: axe.source });
  const journalViolations = await page.evaluate(
    async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run('app-accounting table', {
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'],
        })
      ).violations,
  );
  expect(journalViolations).toEqual([]);
  await expect(
    page.getByText(
      'Vorläufige Steuerübersicht. Vorsteuer wird noch nicht automatisch berücksichtigt.',
    ),
  ).toBeVisible();
  if (process.env['TAX_QA_SCREENSHOTS'])
    await page.screenshot({
      path: `${process.env['TAX_QA_SCREENSHOTS']}/tax-journal.png`,
      fullPage: true,
    });
  expect(errors).toEqual([]);
});
```

mit dem Import `import { createFinalizedPurchase, recordSale } from './support/sample-data';`.

Zeigt das Journal den Zeitraum August nicht von selbst, den Zeitraum im Test über das Filterfeld der Seite auf August 2026 stellen – die erwarteten Beträge bleiben.

- [ ] **Step 3: Auswahllisten anpassen**

In `playwright.pr.config.ts` die Zeile
`/keeps per-item tax visible and blocks unreviewed cost exports @pr-smoke\b/,`
ersetzen durch
`/keeps per-item tax visible in the tax journal @pr-smoke\b/,`.

In `scripts/playwright-pr-smoke.test.mjs` in `coreTests` und `regressionTests` jeweils
`'keeps per-item tax visible and blocks unreviewed cost exports @pr-smoke'` durch
`'keeps per-item tax visible in the tax journal @pr-smoke'` ersetzen und in `coreTests`
`'öffnet Demo und zentrale Arbeitsbereiche @core-smoke'` durch
`'öffnet die App und zentrale Arbeitsbereiche @core-smoke'`.

- [ ] **Step 4: Pflichttests und Auswahlprüfung laufen lassen**

```bash
npm run test:e2e:pr > /tmp/e2e-pr.log 2>&1; echo $?
node --test scripts/playwright-pr-smoke.test.mjs > /tmp/wf.log 2>&1; echo $?
```

Expected: beide `0`; im Bericht genau sechs Pflichttests plus keine weiteren. Die Auswahlprüfung meldet noch keine fehlenden Regressionsfälle, weil in dieser Aufgabe keine Datei gelöscht wurde.

- [ ] **Step 5: Formatieren, linten, committen**

```bash
npx prettier --write e2e/support/sample-data.ts e2e/core-smoke.spec.ts e2e/purchase-editable-draft.spec.ts e2e/purchase-tax-costs.spec.ts e2e/inventory-sale.spec.ts playwright.pr.config.ts scripts/playwright-pr-smoke.test.mjs
npx eslint e2e playwright.pr.config.ts scripts/playwright-pr-smoke.test.mjs > /tmp/lint.log 2>&1; echo $?
git add e2e/support/sample-data.ts e2e/core-smoke.spec.ts e2e/purchase-editable-draft.spec.ts e2e/purchase-tax-costs.spec.ts e2e/inventory-sale.spec.ts playwright.pr.config.ts scripts/playwright-pr-smoke.test.mjs
git commit -m "ci: move the six required browser tests off demo mode" -m "The merge-gating browser tests now run signed in against the local Supabase. Tests that need stock create a finalized purchase and sales through the same database functions the app uses, instead of relying on built-in demo records. The tax test keeps the journal check with real data; blocking exports for unreviewed costs needs a state no member can create and stays covered by accounting-tax-review.angular.spec.ts. Verified with npm run test:e2e:pr and the PR selection workflow test."
```

---

### Task 3: CI startet die lokale Supabase, Seed bleibt draußen

**Files:**

- Modify: `.github/workflows/ci.yml` (Job `browser-smoke`, heute ab Zeile ~300)
- Create: `scripts/seed-isolation.test.mjs`
- Modify: `package.json` (Skript `test:workflow`)

**Interfaces:**

- Consumes: Pflichttests aus Task 2 (`npm run test:e2e:pr`).
- Produces: Job „Browser smoke“ mit lokaler Supabase; Workflow-Test `scripts/seed-isolation.test.mjs` im Skript `test:workflow`.

- [ ] **Step 1: Workflow-Test schreiben**

`scripts/seed-isolation.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

async function filesBelow(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

// supabase/seed.sql legt ein lokales Testkonto mit bekanntem Passwort an. Es darf nur
// bei `supabase db reset`/`start` auf dem eigenen Rechner und in CI laufen.
test('Seed-Daten gelangen weder ins Migrationspaket noch in die Veröffentlichung', async () => {
  const migrations = await readdir(join(root, 'supabase/migrations'));
  assert.deepEqual(
    migrations.filter((name) => /seed/i.test(name)),
    [],
    'Keine Seed-Datei unter supabase/migrations',
  );

  const releaseFiles = [
    'scripts/package-migrations.mjs',
    'scripts/release-migrations.mjs',
    ...(await filesBelow('deploy')),
    ...(await filesBelow('docker')),
  ];
  for (const file of releaseFiles) {
    const content = await readFile(join(root, file), 'utf8');
    assert.doesNotMatch(content, /seed\.sql|include-seed|db:seed/i, `${file} nutzt Seed-Daten`);
  }

  for (const workflow of await filesBelow('.github/workflows')) {
    const content = await readFile(join(root, workflow), 'utf8');
    assert.doesNotMatch(content, /include-seed/i, `${workflow} spielt Seed-Daten ein`);
  }
});
```

Existiert `scripts/release-migrations.mjs` nicht, den Eintrag durch die Datei ersetzen, die `scripts/release-migrations.test.mjs` importiert.

- [ ] **Step 2: Workflow-Test laufen lassen**

Run: `node --test scripts/seed-isolation.test.mjs > /tmp/wf.log 2>&1; echo $?`
Expected: `0`. Der Test ist ein Wächter für die Zukunft; er muss heute schon grün sein. Meldet er einen Treffer, **nicht** den Test abschwächen, sondern die Fundstelle lesen und dem Nutzer melden.

- [ ] **Step 3: Test in `test:workflow` aufnehmen**

In `package.json` im Skript `test:workflow` hinter `scripts/run-node-stress.test.mjs` ergänzen: ` scripts/seed-isolation.test.mjs` (innerhalb des `node --test`-Aufrufs, vor `&& node scripts/check-admin-shared-ui.mjs`).

- [ ] **Step 4: CI-Job erweitern**

In `.github/workflows/ci.yml` im Job `browser-smoke`:

- `timeout-minutes: 10` auf `timeout-minutes: 15` setzen.
- Zwischen „Install Chromium Headless Shell“ und „Run browser smoke tests“ einfügen:

```yaml
- name: Start local Supabase
  run: npx supabase start
```

- Nach „Upload browser failure artifacts“ als letzten Schritt anfügen:

```yaml
- name: Stop local Supabase
  if: ${{ always() }}
  run: npx supabase stop --no-backup
```

- [ ] **Step 5: Workflow-Prüfungen laufen lassen**

```bash
npm run test:workflow > /tmp/wf.log 2>&1; echo $?
npx actionlint .github/workflows/ci.yml > /tmp/al.log 2>&1; echo $?
```

Expected: beide `0`. Ist `actionlint` lokal nicht installiert, den Schritt überspringen und im Commit-Body nennen; die PR-Prüfung führt ihn aus. Scheitert ein bestehender Workflow-Test an der geänderten Schrittliste des Jobs (z. B. in `scripts/required-checks.test.mjs`), die dort erwartete Liste um die zwei neuen Schritte ergänzen.

- [ ] **Step 6: Commit**

```bash
npx prettier --write scripts/seed-isolation.test.mjs package.json .github/workflows/ci.yml
git add scripts/seed-isolation.test.mjs package.json .github/workflows/ci.yml
git commit -m "ci: start local Supabase for browser smoke tests and guard seed data" -m "Browser tests now need a real database, so the browser smoke job starts the local Supabase like the database job does and stops it afterwards; the timeout grows by five minutes for the start. A workflow test fails if seed data could ever reach the migration package, deployment files or a workflow that pushes seed data, because the local test account has a known password. Verified with npm run test:workflow."
```

---

### Task 4: Übrige Browser-Tests umstellen oder löschen

**Files:**

- Modify: alle übrigen `e2e/*.spec.ts`, die `startDemoMode` nutzen: `admin-accent`, `admin-layout`, `article-workspace`, `badge-text`, `compact-controls`, `dashboard-design`, `dashboard-interactions`, `date-picker-layer`, `entry-pages`, `inventory-archive-columns`, `layout-overlays`, `product-editor-storefront`, `product-integration`, `purchase-dropdown-layer`, `purchase-entry`, `purchase-header-polish`, `purchase-item-navigation`, `purchase-package-contents`, `purchase-workspace`, `record-timeline`, `sidebar-navigation`, `table-sorting`, `typography`
- Delete: `e2e/demo-login.spec.ts` (ersetzt durch `e2e/login.spec.ts`), `e2e/support/demo.ts`
- Modify: `scripts/playwright-pr-smoke.test.mjs` (Liste `regressionTests`)

**Interfaces:**

- Consumes: `test`, `expect`, `openDashboard` aus `e2e/support/fixtures.ts` (Task 1).
- Produces: Kein Test unter `e2e/` importiert mehr `./support/demo`.

**Regel je Test (verbindlich, in dieser Reihenfolge):**

1. **Löschen**, wenn der Test `flipbase_local_`, `pur-demo`, `item-demo`, `sale-demo`, `catalog-demo`, `ws-1` oder `Demo-Modus` enthält.
2. **Löschen**, wenn er Demo-Datensätze beim Namen nutzt. Das sind alle Titel aus `resetToDemoShowcase()` in `src/app/core/services/mock-data-store.service.ts` (z. B. „Super Nintendo SNES Original Controller“, „USB-C Ladegerät 30 W“, „Nintendo Game Boy Color (Lila Transparent)“, „Retro Gaming & Nintendo Konvolut (Mystery Box)“, „Canon EOS M50 Mark II“).
3. **Sonst umstellen:** Import auf `import { expect, openDashboard, test } from './support/fixtures';` ändern (andere Importe bleiben) und `await startDemoMode(page);` durch `await openDashboard(page);` ersetzen. Das „Demo“-Schild am Online-Shop (`demoBadge` in `sidebar-navigation.spec.ts`) bleibt, es hat nichts mit dem Demo-Modus zu tun.
4. **Datei laufen lassen.** Scheitert ein umgestellter Test nur, weil erwartete vorhandene Daten fehlen (leere Tabelle, leeres Diagramm, fehlende Zeile), wird er gelöscht. Jeder andere Fehler wird untersucht und behoben, nicht durch Löschen umgangen.
5. Bleibt in einer Datei kein Test übrig, die Datei löschen.

- [ ] **Step 1: Dateien nach der Regel bearbeiten**

Für jede Datei der Liste die Regeln 1–3 anwenden und danach laufen lassen:

```bash
npx playwright test e2e/<datei>.spec.ts > /tmp/e2e-file.log 2>&1; echo $?
```

Expected je Datei: `0` nach Anwendung von Regel 4 und 5. Jede Löschung mit Datei, Testname und Regelnummer in einer Liste für den Commit-Body notieren.

- [ ] **Step 2: Demo-Helfer entfernen**

```bash
git rm e2e/demo-login.spec.ts e2e/support/demo.ts
grep -rn "support/demo\|startDemoMode" e2e
```

Expected: `grep` findet nichts.

- [ ] **Step 3: Regressionsliste anpassen**

In `scripts/playwright-pr-smoke.test.mjs` aus `regressionTests` jeden Eintrag entfernen, dessen Test in Step 1 gelöscht wurde. Nicht gelöschte Einträge bleiben unverändert.

- [ ] **Step 4: Gesamtlauf der Browser-Tests**

```bash
npx playwright test --project=chromium > /tmp/e2e-all.log 2>&1; echo $?
node --test scripts/playwright-pr-smoke.test.mjs > /tmp/wf.log 2>&1; echo $?
```

Expected: beide `0`. Der Gesamtlauf verbraucht zwei Registrierungen (globales Setup und Login-Test).

- [ ] **Step 5: Formatieren, linten, committen**

```bash
npx prettier --write e2e scripts/playwright-pr-smoke.test.mjs
npx eslint e2e scripts/playwright-pr-smoke.test.mjs > /tmp/lint.log 2>&1; echo $?
git add -A e2e scripts/playwright-pr-smoke.test.mjs
git commit -m "ci: move remaining browser tests off demo mode and drop demo-bound cases" -m "<Liste der gelöschten Tests mit Datei, Name und Regel aus Step 1>" -m "Tests that only need a signed-in account now use a fresh workspace on the local Supabase. Tests bound to built-in demo records or to writing demo data into browser storage are removed as agreed; they ran only manually and would have required rebuilding the whole demo dataset. Verified with a full chromium run and the PR selection workflow test."
```

Den Platzhalter im zweiten `-m` durch die tatsächliche Liste aus Step 1 ersetzen, bevor der Befehl läuft.

---

### Task 5: Lokales Testkonto mit Beispieldaten

**Files:**

- Modify: `supabase/seed.sql`

**Interfaces:**

- Consumes: Trigger `handle_new_user()` (legt Profil, Workspace und Mitgliedschaft an); RPCs `create_purchase`, `receive_individual_purchase_line`, `finalize_purchase_costing`, `record_sale`; Erweiterung `pgcrypto` im Schema `extensions`.
- Produces: Nach `npx supabase db reset` gibt es das Konto `test@flipbase.local` / `flipbase-test` mit einem abgeschlossenen Einkauf (drei Artikel), zwei Artikeln ohne Einkauf und einem gebuchten Verkauf.

- [ ] **Step 1: Seed schreiben**

`supabase/seed.sql` vollständig ersetzen durch:

```sql
-- Lokales Testkonto mit Beispieldaten.
-- Läuft nur bei `supabase db reset`/`supabase start` auf dem eigenen Rechner und in CI,
-- nie auf dem Live-Server (abgesichert durch scripts/seed-isolation.test.mjs).
-- Anmeldung lokal: test@flipbase.local / flipbase-test

do $$
declare
  v_user_id constant uuid := '5eed0000-0000-4000-8000-000000000001';
  v_workspace_id uuid;
  v_purchase_id uuid;
  v_line record;
  v_sold_item_id uuid;
begin
  -- Leere Token-Felder statt NULL: GoTrue lehnt die Anmeldung sonst ab.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'test@flipbase.local', extensions.crypt('flipbase-test', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Testkonto"}', now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', 'test@flipbase.local', 'email_verified', true),
    'email', now(), now(), now()
  );

  select member.workspace_id into v_workspace_id
  from public.workspace_members as member
  where member.user_id = v_user_id
  limit 1;

  -- Die Geschäftsfunktionen prüfen die Anmeldung über auth.uid().
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id, 'role', 'authenticated')::text,
    true
  );

  v_purchase_id := (
    public.create_purchase(
      v_workspace_id,
      jsonb_build_object(
        'type', 'lot',
        'title', 'Retro-Konsolen Paket',
        'purchase_date', '2026-09-01',
        'purchase_price', 150,
        'discount_amount', 0,
        'content_status', 'known',
        'pricing_mode', 'individual',
        'shipment_status', 'arrived',
        'cost_allocation_mode', 'even'
      ),
      '[]'::jsonb,
      '[
        {"client_ref":"seed-1","catalog_product_id":null,"title_snapshot":"Nintendo Game Boy Color","line_kind":"individual","is_package":false,"ordered_quantity":1,"price_mode":"priced","unit_purchase_price":60,"line_total":60,"allocated_additional_cost":0},
        {"client_ref":"seed-2","catalog_product_id":null,"title_snapshot":"SNES Controller Original","line_kind":"individual","is_package":false,"ordered_quantity":1,"price_mode":"priced","unit_purchase_price":50,"line_total":50,"allocated_additional_cost":0},
        {"client_ref":"seed-3","catalog_product_id":null,"title_snapshot":"Pokémon Smaragd (GBA)","line_kind":"individual","is_package":false,"ordered_quantity":1,"price_mode":"priced","unit_purchase_price":40,"line_total":40,"allocated_additional_cost":0}
      ]'::jsonb
    ) #>> '{purchase,id}'
  )::uuid;

  for v_line in
    select line.id, line.title_snapshot
    from public.purchase_lines as line
    where line.workspace_id = v_workspace_id and line.purchase_id = v_purchase_id
  loop
    perform public.receive_individual_purchase_line(
      v_workspace_id, v_purchase_id, v_line.id, jsonb_build_object('title', v_line.title_snapshot)
    );
  end loop;
  perform public.finalize_purchase_costing(v_workspace_id, v_purchase_id);

  insert into public.inventory_items (workspace_id, title, condition, status, expected_value) values
    (v_workspace_id, 'Levi''s 501 Vintage Jeans (W32 L34)', 'used', 'ready', 55),
    (v_workspace_id, 'Canon EOS M50 Mark II', 'like_new', 'ready', 480);

  select item.id into v_sold_item_id
  from public.inventory_items as item
  where item.workspace_id = v_workspace_id
    and item.purchase_id = v_purchase_id
    and item.title = 'Pokémon Smaragd (GBA)';

  perform public.record_sale(
    v_workspace_id,
    '{"platform":"kleinanzeigen","sale_date":"2026-09-10"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'inventory_item_id', v_sold_item_id,
      'title_snapshot', 'Pokémon Smaragd (GBA)',
      'quantity', 1,
      'unit_sale_price', 110
    ))
  );
end;
$$;
```

Die Reihenfolge „annehmen, dann abschließen“ muss dieselbe sein wie in `e2e/support/sample-data.ts` (Task 2). Wurde sie dort angepasst, hier genauso anpassen.

- [ ] **Step 2: Datenbank neu aufsetzen und Konto prüfen**

```bash
npx supabase db reset > /tmp/reset.log 2>&1; echo $?
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
docker exec -i "$DB" psql -U postgres -d postgres -tA -c "select (select count(*) from public.purchases p join public.workspace_members m on m.workspace_id = p.workspace_id where m.user_id = '5eed0000-0000-4000-8000-000000000001') || '|' || (select count(*) from public.inventory_items i join public.workspace_members m on m.workspace_id = i.workspace_id where m.user_id = '5eed0000-0000-4000-8000-000000000001') || '|' || (select count(*) from public.sales s join public.workspace_members m on m.workspace_id = s.workspace_id where m.user_id = '5eed0000-0000-4000-8000-000000000001')"
ANON=$(grep -oE "eyJ[A-Za-z0-9._-]+" src/environments/environment.development.ts | head -1)
curl -s -o /tmp/token.json -w "%{http_code}\n" -X POST "http://127.0.0.1:54351/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"email":"test@flipbase.local","password":"flipbase-test"}'
grep -c access_token /tmp/token.json
```

Expected: Reset `0`; Zählung `1|5|1`; HTTP `200`; `1`.

- [ ] **Step 3: Datenbanktests gegen die Seed-Daten laufen lassen**

Run: `npx supabase test db > /tmp/db-all.log 2>&1; echo $?; grep -nE "not ok|Failed" /tmp/db-all.log | head`
Expected: `0`, keine Treffer. Zählt ein bestehender Test Zeilen über alle Workspaces und scheitert nun an den Seed-Daten, diesen Test auf seinen eigenen Workspace einschränken und das im Commit-Body nennen – die Seed-Daten nicht verkleinern.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore(core): seed a local test account with sample data" -m "Without demo mode, local development needs a ready-to-use account. The seed creates test@flipbase.local with a finalized purchase of three items, two items without purchase and one sale, all through the same database functions the app uses, so the data satisfies every guard. It runs only on local resets and in CI; a workflow test keeps it out of releases. Verified with a reset, a password sign-in against the local API and the full database test suite."
```

---

### Task 6: Dokumentation, Protokoll, Gesamtprüfung

**Files:**

- Modify: `docs/testing/lean-ci.md`
- Modify: `README.md`
- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:**

- Consumes: alle vorherigen Tasks.
- Produces: geprüfter Zweig, bereit für PR 1.

- [ ] **Step 1: Dokumentation anpassen**

`grep -n "Demo" docs/testing/lean-ci.md README.md` ausführen und jede Aussage, dass Browser-Tests Demo-Daten nutzen, ersetzen durch:

```markdown
Die Browser-Tests laufen gegen die lokale Supabase (`npx supabase start`). Ein globales
Setup registriert je Lauf ein Testkonto, jeder Test bekommt einen frischen Workspace.
Testdaten entstehen über die echten Datenbankfunktionen (`e2e/support/sample-data.ts`).
```

In `README.md` im Abschnitt zur lokalen Entwicklung ergänzen:

```markdown
### Lokales Testkonto

Nach `npx supabase db reset` gibt es lokal das Konto `test@flipbase.local` mit dem
Passwort `flipbase-test` und einigen Beispieldaten. Es existiert nur in der lokalen
Datenbank.
```

- [ ] **Step 2: Gesamtprüfung**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
npx supabase test db > /tmp/db-all.log 2>&1; echo $?
npx playwright test --project=chromium > /tmp/e2e-all.log 2>&1; echo $?
grep -rn "startDemoMode\|support/demo" e2e
```

Expected: dreimal `0`, `grep` ohne Treffer.

- [ ] **Step 3: Protokoll und Commit**

In `docs/AI-CHANGELOG.md` unter der Einleitung einen Eintrag „<Datum> – <Assistent> – Demo-Modus entfernen, PR 1: Browser-Tests auf lokale Supabase“ mit Auftrag, Änderung, gelöschten Tests und den tatsächlich ausgeführten Prüfungen aus Step 2 ergänzen.

```bash
npx prettier --write docs/testing/lean-ci.md README.md docs/AI-CHANGELOG.md
git add docs/testing/lean-ci.md README.md docs/AI-CHANGELOG.md
git commit -m "docs: describe browser tests on local Supabase and the seeded account" -m "Documentation still said browser tests use demo data. It now explains the per-run account, the per-test workspace and the local test account, and the changelog records what PR 1 changed and which checks ran."
```

- [ ] **Step 4: Abschlussfrage**

Im Chat genau fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“

---

## Selbstprüfung gegen den Entwurf

| Anforderung (Entwurf, Abschnitte 1 und 2)                                     | Task |
| ----------------------------------------------------------------------------- | ---- |
| Ein Konto je Lauf, Sitzung als `storageState`, Anmeldebegrenzung eingehalten  | 1    |
| Frischer Workspace je Test über `create_workspace` und `addInitScript`        | 1    |
| Adressprüfung nur `127.0.0.1`/`localhost`, kein Service-Role-Schlüssel        | 1    |
| Login-Test mit eigenem Konto ersetzt `demo-login.spec.ts`                     | 1, 4 |
| Testdaten über echte Funktionen, Pflichttests umgestellt, Steuertest verkürzt | 2    |
| Auswahllisten `playwright.pr.config.ts` und Workflow-Test angepasst           | 2, 4 |
| CI startet lokale Supabase                                                    | 3    |
| Seed gerät nie ins Live-Paket                                                 | 3    |
| Übrige Tests umstellen, demo-gebundene löschen, Liste im Commit               | 4    |
| Lokales Testkonto mit Beispieldaten über geprüfte Funktionen                  | 5    |
| Doku und Protokoll                                                            | 6    |

Nicht in diesem Plan: das Entfernen des Demo-Codes (PR 2, eigener Plan).
