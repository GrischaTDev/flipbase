# Kategorie- und Markenauswahl – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kategorien aus der Shopify-Taxonomie und eine Markenliste je Workspace ersetzen die Freitextfelder an Artikeln und Katalogprodukten.

**Architecture:** Zwei neue Tabellen (`product_categories`, `brands`) und Verweisspalten an `inventory_items`/`catalog_products`. Ein Trigger füllt die bestehenden Textspalten aus den Verweisen, sodass alle lesenden Stellen unverändert bleiben. Zwei gemeinsame Angular-Bausteine (`app-category-picker`, `app-brand-picker`) laden ihre Daten über zwei neue Core-Services.

**Tech Stack:** Supabase/Postgres 17 (pgTAP), Node 22 (`node:test`), Angular 22 (Signals, Reactive Forms, Vitest), Tailwind.

**Entwurf:** `docs/superpowers/specs/2026-09-14-product-categories-brands-design.md`

## Global Constraints

- Arbeitszweig: `feat/product-categories-brands` im Haupt-Repo `K:\GitHub\Repos\flipbase`. Vor jeder Aufgabe `git branch --show-current` prüfen.
- Chat, Code-Kommentare und Oberflächentexte deutsch; Bezeichner englisch.
- Commits: Conventional Commits auf Englisch, Scopes aus AGENTS.md (`inventory`, `ui`, `ci` …), **keine** `Co-Authored-By`-Zeile, Body erklärt das Warum.
- Shopify-Version fest `v2026-08`, nie `unstable`.
- Ausgeblendete Hauptbereiche: `gc`, `se`, `bu`, `pa`, `na`.
- Markenname: getrimmt, 1–120 Zeichen; Vergleichsform `lower(name)`.
- Suchtreffer höchstens 50, Suche ab 2 Zeichen.
- Schemadateien nicht in `supabase/migrations/` von Hand ändern; Struktur per `npx supabase db diff`.
- Migrationen ohne `begin`/`commit`, ohne psql-Befehle.
- SQL-Funktionen: `set search_path = ''`, vollqualifizierte Namen.
- Angular: Standalone, `OnPush`, externe Templates, `input()`, Signals, kein `ngClass`, kein `@HostListener`.
- Exitcodes nie über eine Pipe messen: `befehl > log 2>&1; echo $?`.

## Dateistruktur

| Datei                                                                  | Verantwortung                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| `scripts/import-shopify-taxonomy.mjs`                                  | Lädt, prüft und rendert die Kategorie-Migration |
| `scripts/import-shopify-taxonomy.test.mjs`                             | Skript-Tests                                    |
| `supabase/schemas/150_product_categories_brands.sql`                   | Tabellen, RLS, Trigger, Übernahmefunktion       |
| `supabase/config.toml`                                                 | Ladereihenfolge                                 |
| `supabase/migrations/<ts>_product_categories_brands.sql`               | Struktur (erzeugt)                              |
| `supabase/migrations/<ts>_import_shopify_taxonomy_v2026_08.sql`        | Kategorien (erzeugt)                            |
| `supabase/migrations/<ts>_migrate_legacy_category_brand_texts.sql`     | Übernahme (Hand)                                |
| `supabase/tests/product_categories_brands.test.sql`                    | Datenbanktest                                   |
| `src/app/core/models/product-category.models.ts`                       | Typen und kleine Hilfen                         |
| `src/app/core/services/demo-product-categories.ts`                     | Demo-Kategorien                                 |
| `src/app/core/services/product-category.service.ts` (+ `.spec.ts`)     | Kategorien laden/suchen                         |
| `src/app/core/services/brand.service.ts` (+ `.spec.ts`)                | Marken laden/anlegen                            |
| `src/app/core/services/mock-data-store.service.ts`                     | Demo-Marken, Trigger-Nachbildung                |
| `src/app/shared/components/category-picker/*`                          | Kategorie-Wähler                                |
| `src/app/shared/components/brand-picker/*`                             | Marken-Wähler                                   |
| `inventory.service.ts`, `catalog.service.ts`, `purchase.service.ts`    | Schreiben Verweise                              |
| `item-create-modal`, `item-create`, `product-dialog`, `product-detail` | Einsatzorte                                     |

---

### Task 1: Import-Skript für die Shopify-Taxonomie

**Files:**

- Create: `scripts/import-shopify-taxonomy.mjs`
- Create: `scripts/import-shopify-taxonomy.test.mjs`
- Modify: `package.json` (Skript `test:workflow`)

**Interfaces:**

- Produces: `parseTaxonomy(text, expectedVersion) → { version, categories: Array<{ id, parentId, name, fullName, level, isLeaf }> }`, `renderMigration({ version, categories, license }) → string`, `migrationFileName(version, now) → string`, `main(argv, { root, fetchText, now }) → Promise<{ path, count }>`, `EXCLUDED_ROOTS: Map<string,string>`.

- [ ] **Step 1: Failing test schreiben**

`scripts/import-shopify-taxonomy.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  main,
  migrationFileName,
  parseTaxonomy,
  renderMigration,
} from './import-shopify-taxonomy.mjs';

const fixture = `# Shopify Product Taxonomy - Categories: 2026-08
# Format: {GID} : {Ancestor name} > ... > {Category name}

gid://shopify/TaxonomyCategory/el                : Elektronik
gid://shopify/TaxonomyCategory/el-6              : Elektronik > Computer
gid://shopify/TaxonomyCategory/el-6-6            : Elektronik > Computer > Laptops
gid://shopify/TaxonomyCategory/el-6-10           : Elektronik > Computer > Multitouch-Tischcomputer
gid://shopify/TaxonomyCategory/el-6-2            : Elektronik > Computer > Computerserver
gid://shopify/TaxonomyCategory/gc                : Geschenkgutscheine
gid://shopify/TaxonomyCategory/gc-1              : Geschenkgutscheine > Digital
gid://shopify/TaxonomyCategory/tg                : Spielzeuge & Spiele
gid://shopify/TaxonomyCategory/tg-1              : Spielzeuge & Spiele > Kinder's Puzzles
`;

const license = 'Copyright (c) Shopify\n\nPermission is hereby granted, free of charge';

test('liest Ebenen, Oberkategorien und Blätter und lässt ausgeblendete Bereiche weg', () => {
  const { version, categories } = parseTaxonomy(fixture, '2026-08');
  assert.equal(version, '2026-08');
  assert.deepEqual(
    categories.map((category) => category.id),
    ['el', 'tg', 'el-6', 'tg-1', 'el-6-2', 'el-6-6', 'el-6-10'],
  );
  assert.deepEqual(
    categories.find((category) => category.id === 'el-6-6'),
    {
      id: 'el-6-6',
      parentId: 'el-6',
      name: 'Laptops',
      fullName: 'Elektronik > Computer > Laptops',
      level: 3,
      isLeaf: true,
    },
  );
  assert.equal(categories.find((category) => category.id === 'el-6').isLeaf, false);
  assert.equal(
    categories.some((category) => category.id.startsWith('gc')),
    false,
  );
});

test('bricht bei doppelter Kennung ab', () => {
  const text = `${fixture}gid://shopify/TaxonomyCategory/el-6-6 : Elektronik > Computer > Laptops\n`;
  assert.throws(() => parseTaxonomy(text, '2026-08'), /doppelt/u);
});

test('bricht bei fehlender Oberkategorie ab', () => {
  const text = fixture.replace(/^gid:\/\/shopify\/TaxonomyCategory\/el-6 .*\n/mu, '');
  assert.throws(() => parseTaxonomy(text, '2026-08'), /Oberkategorie el-6 von el-6-2 fehlt/u);
});

test('bricht ab, wenn der Pfad nicht zur Oberkategorie passt', () => {
  const text = fixture.replace('Elektronik > Computer > Laptops', 'Elektronik > Kameras > Laptops');
  assert.throws(() => parseTaxonomy(text, '2026-08'), /passt nicht/u);
});

test('bricht bei falscher Version und unbekanntem Format ab', () => {
  assert.throws(() => parseTaxonomy(fixture, '2026-05'), /Version/u);
  assert.throws(() => parseTaxonomy(`${fixture}kaputte Zeile\n`, '2026-08'), /Format/u);
});

test('rendert eine transaktionsneutrale Migration mit Lizenz und Maskierung', () => {
  const { categories } = parseTaxonomy(fixture, '2026-08');
  const sql = renderMigration({ version: '2026-08', categories, license });
  assert.match(sql, /^-- Zweck: Kategorien der Shopify Standard Product Taxonomy v2026-08/u);
  assert.match(sql, /-- Copyright \(c\) Shopify/u);
  assert.match(sql, /'Kinder''s Puzzles'/u);
  assert.match(sql, /\('el', null, 'Elektronik', 'Elektronik', 1, false, '2026-08', false\)/u);
  assert.match(sql, /on conflict \(id\) do update/u);
  assert.match(sql, /where taxonomy_version <> '2026-08'/u);
  assert.doesNotMatch(sql, /^\s*(begin|commit|rollback)\b/imu);
  assert.ok(sql.indexOf("('el-6'") < sql.indexOf("('el-6-6'"), 'Eltern stehen vor Kindern');
});

test('erzeugt einen gültigen Migrationsnamen', () => {
  const name = migrationFileName('2026-08', new Date('2026-09-14T10:20:30.456Z'));
  assert.equal(name, '20260914102030_import_shopify_taxonomy_v2026_08.sql');
  assert.match(name, /^[0-9]{14}_[a-z0-9_]+\.sql$/u);
});

test('main lädt Datei und Lizenz der festen Version und schreibt die Migration', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'taxonomy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'supabase/migrations'), { recursive: true });
  const urls = [];
  const result = await main(['v2026-08'], {
    root,
    now: new Date('2026-09-14T10:20:30Z'),
    fetchText: async (url) => {
      urls.push(url);
      return url.endsWith('/LICENSE') ? license : fixture;
    },
  });
  assert.equal(result.count, 7);
  assert.deepEqual(urls.sort(), [
    'https://raw.githubusercontent.com/Shopify/product-taxonomy/v2026-08/LICENSE',
    'https://raw.githubusercontent.com/Shopify/product-taxonomy/v2026-08/dist/de/categories.txt',
  ]);
  assert.match(await readFile(result.path, 'utf8'), /7 Kategorien/u);
  await assert.rejects(() => main(['unstable'], { root }), /Aufruf/u);
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `node --test scripts/import-shopify-taxonomy.test.mjs`
Expected: FAIL mit `Cannot find module … import-shopify-taxonomy.mjs`

- [ ] **Step 3: Skript schreiben**

`scripts/import-shopify-taxonomy.mjs`:

```js
// Erzeugt aus der deutschen Shopify Standard Product Taxonomy eine Migration für
// public.product_categories. Aufruf mit fester Version:
//   node scripts/import-shopify-taxonomy.mjs v2026-08
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hauptbereiche ohne Bezug zu gebrauchter Ware. */
export const EXCLUDED_ROOTS = new Map([
  ['bu', 'Bundles'],
  ['gc', 'Geschenkgutscheine'],
  ['na', 'Nicht kategorisiert'],
  ['pa', 'Produkt-Add-Ons'],
  ['se', 'Dienstleistungen'],
]);

const PATH_SEPARATOR = ' > ';
const HEADER_PATTERN = /^# Shopify Product Taxonomy - Categories: (\d{4}-\d{2})\s*$/u;
const LINE_PATTERN = /^gid:\/\/shopify\/TaxonomyCategory\/([a-z]{2}(?:-\d+)*)\s+:\s+(\S.*)$/u;
const INSERT_CHUNK_SIZE = 500;

function compareIds(left, right) {
  const a = left.split('-');
  const b = right.split('-');
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (a[index] === b[index]) continue;
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    const x = Number(a[index]);
    const y = Number(b[index]);
    if (Number.isInteger(x) && Number.isInteger(y)) return x - y;
    return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function parseTaxonomy(text, expectedVersion) {
  const lines = text.split(/\r?\n/u);
  const header = lines.find((line) => line.startsWith('# Shopify Product Taxonomy'));
  const version = header?.match(HEADER_PATTERN)?.[1];
  if (!version) throw new Error('Kopfzeile mit der Taxonomie-Version fehlt.');
  if (version !== expectedVersion)
    throw new Error(`Die Datei hat Version ${version}, erwartet war ${expectedVersion}.`);

  const byId = new Map();
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(LINE_PATTERN);
    if (!match) throw new Error(`Zeile ${index + 1} hat ein unbekanntes Format: ${line}`);
    const [, id, path] = match;
    const segments = id.split('-');
    const parts = path.split(PATH_SEPARATOR).map((part) => part.trim());
    if (parts.some((part) => !part))
      throw new Error(`Zeile ${index + 1}: leerer Pfadteil bei ${id}.`);
    if (parts.length !== segments.length)
      throw new Error(
        `Zeile ${index + 1}: Kennung ${id} passt nicht zur Pfadtiefe ${parts.length}.`,
      );
    if (EXCLUDED_ROOTS.has(segments[0])) continue;
    if (byId.has(id)) throw new Error(`Die Kennung ${id} kommt doppelt vor.`);
    byId.set(id, {
      id,
      parentId: segments.length === 1 ? null : segments.slice(0, -1).join('-'),
      name: parts.at(-1),
      fullName: parts.join(PATH_SEPARATOR),
      level: parts.length,
      isLeaf: true,
    });
  }

  for (const category of byId.values()) {
    if (category.parentId === null) continue;
    const parent = byId.get(category.parentId);
    if (!parent) throw new Error(`Oberkategorie ${category.parentId} von ${category.id} fehlt.`);
    const expected = category.fullName.split(PATH_SEPARATOR).slice(0, -1).join(PATH_SEPARATOR);
    if (parent.fullName !== expected)
      throw new Error(`Der Pfad von ${category.id} passt nicht zur Oberkategorie ${parent.id}.`);
    parent.isLeaf = false;
  }

  const categories = [...byId.values()].sort(
    (left, right) => left.level - right.level || compareIds(left.id, right.id),
  );
  if (!categories.length) throw new Error('Die Datei enthält keine Kategorien.');
  return { version, categories };
}

function sqlText(value) {
  return value === null ? 'null' : `'${value.replaceAll("'", "''")}'`;
}

export function renderMigration({ version, categories, license }) {
  const tag = `v${version}`;
  const header = [
    `-- Zweck: Kategorien der Shopify Standard Product Taxonomy ${tag} (deutsch) einlesen.`,
    '-- Betroffene Tabelle: public.product_categories (id, parent_id, name, full_name,',
    '--   level, is_leaf, taxonomy_version, is_deprecated).',
    `-- Quelle: https://github.com/Shopify/product-taxonomy/blob/${tag}/dist/de/categories.txt`,
    `-- Anzahl: ${categories.length} Kategorien. Nicht übernommen: ${[...EXCLUDED_ROOTS.values()].join(', ')}.`,
    `-- Erzeugt mit: node scripts/import-shopify-taxonomy.mjs ${tag} – nicht von Hand ändern.`,
    '--',
    '-- Kategorien früherer Versionen, die hier fehlen, werden nicht gelöscht, sondern als',
    '-- veraltet markiert: Artikel und Katalogprodukte dürfen weiter auf sie verweisen.',
    '--',
    '-- Lizenz der Kategoriedaten:',
    ...license
      .trim()
      .split(/\r?\n/u)
      .map((line) => (line ? `-- ${line}` : '--')),
    '',
  ];

  const statements = [];
  for (let offset = 0; offset < categories.length; offset += INSERT_CHUNK_SIZE) {
    const rows = categories
      .slice(offset, offset + INSERT_CHUNK_SIZE)
      .map(
        (category) =>
          `  (${sqlText(category.id)}, ${sqlText(category.parentId)}, ${sqlText(category.name)}, ` +
          `${sqlText(category.fullName)}, ${category.level}, ${category.isLeaf}, ${sqlText(version)}, false)`,
      );
    statements.push(
      [
        'insert into public.product_categories',
        '  (id, parent_id, name, full_name, level, is_leaf, taxonomy_version, is_deprecated)',
        'values',
        rows.join(',\n'),
        'on conflict (id) do update',
        'set parent_id = excluded.parent_id,',
        '    name = excluded.name,',
        '    full_name = excluded.full_name,',
        '    level = excluded.level,',
        '    is_leaf = excluded.is_leaf,',
        '    taxonomy_version = excluded.taxonomy_version,',
        '    is_deprecated = false;',
        '',
      ].join('\n'),
    );
  }
  statements.push(
    [
      '-- Von Shopify entfernte Kategorien bleiben für bestehende Verweise erhalten.',
      'update public.product_categories',
      'set is_deprecated = true',
      `where taxonomy_version <> ${sqlText(version)}`,
      '  and is_deprecated = false;',
      '',
    ].join('\n'),
  );
  return `${header.join('\n')}\n${statements.join('\n')}`;
}

export function migrationFileName(version, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T]/gu, '').slice(0, 14);
  return `${stamp}_import_shopify_taxonomy_v${version.replace('-', '_')}.sql`;
}

async function fetchTextFromWeb(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} antwortete mit HTTP ${response.status}.`);
  return response.text();
}

export async function main(argv, { root, fetchText = fetchTextFromWeb, now = new Date() } = {}) {
  const tag = argv[0];
  if (!/^v\d{4}-\d{2}$/u.test(tag ?? ''))
    throw new Error('Aufruf: node scripts/import-shopify-taxonomy.mjs v2026-08');
  const version = tag.slice(1);
  const base = `https://raw.githubusercontent.com/Shopify/product-taxonomy/${tag}`;
  const [text, license] = await Promise.all([
    fetchText(`${base}/dist/de/categories.txt`),
    fetchText(`${base}/LICENSE`),
  ]);
  const { categories } = parseTaxonomy(text, version);
  const path = resolve(root, 'supabase/migrations', migrationFileName(version, now));
  await writeFile(path, renderMigration({ version, categories, license }), { flag: 'wx' });
  return { path, count: categories.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const result = await main(process.argv.slice(2), { root });
    console.log(`${result.count} Kategorien geschrieben: ${result.path}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `node --test scripts/import-shopify-taxonomy.test.mjs`
Expected: PASS, 8 Tests

- [ ] **Step 5: In `test:workflow` aufnehmen**

In `package.json` im Skript `test:workflow` direkt nach `scripts/detect-supabase-changes.test.mjs ` einfügen: `scripts/import-shopify-taxonomy.test.mjs `.

Run: `npm run test:workflow > /tmp/wf.log 2>&1; echo $?`
Expected: `0`

- [ ] **Step 6: Formatieren und committen**

```bash
npx prettier --write scripts/import-shopify-taxonomy.mjs scripts/import-shopify-taxonomy.test.mjs package.json
git add scripts/import-shopify-taxonomy.mjs scripts/import-shopify-taxonomy.test.mjs package.json
git commit -m "feat(inventory): add Shopify taxonomy import script" -m "Categories come from the German Shopify Standard Product Taxonomy. A fixed release is parsed, validated (duplicates, missing parents, path mismatches) and rendered into a transactional migration so the data change is reviewable in the PR."
```

---

### Task 2: Datenbankschema, Trigger und Übernahmefunktion

**Files:**

- Create: `supabase/tests/product_categories_brands.test.sql`
- Create: `supabase/schemas/150_product_categories_brands.sql`
- Modify: `supabase/config.toml` (`schema_paths`)
- Create (erzeugt): `supabase/migrations/<ts>_product_categories_brands.sql`

**Interfaces:**

- Produces: Tabellen `public.product_categories (id, parent_id, name, full_name, level, is_leaf, taxonomy_version, is_deprecated)`, `public.brands (id, workspace_id, name, name_key, created_at)`; Spalten `category_id text`, `brand_id uuid` an `inventory_items` und `catalog_products`; Funktion `public.migrate_legacy_category_brand_texts() returns void`; Trigger `"10_sync_category_brand_text"`.

- [ ] **Step 1: Failing Datenbanktest schreiben**

`supabase/tests/product_categories_brands.test.sql`:

```sql
\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'product_categories', 'Kategorietabelle existiert');
select has_table('public', 'brands', 'Markentabelle existiert');
select has_column('public', 'inventory_items', 'category_id', 'Artikel verweisen auf eine Kategorie');
select has_column('public', 'inventory_items', 'brand_id', 'Artikel verweisen auf eine Marke');
select has_column('public', 'catalog_products', 'category_id', 'Katalogprodukte verweisen auf eine Kategorie');
select has_column('public', 'catalog_products', 'brand_id', 'Katalogprodukte verweisen auf eine Marke');
select ok((select relrowsecurity from pg_class where oid = 'public.product_categories'::regclass), 'RLS auf Kategorien');
select ok((select relrowsecurity from pg_class where oid = 'public.brands'::regclass), 'RLS auf Marken');
select ok(not has_function_privilege('authenticated', 'public.migrate_legacy_category_brand_texts()', 'execute'), 'Übernahme ist für Angemeldete nicht aufrufbar');

-- Testdaten als postgres. Kennungen „zz“ kommen in der Shopify-Taxonomie nicht vor.
insert into public.product_categories (id, parent_id, name, full_name, level, is_leaf, taxonomy_version) values
  ('zz', null, 'Testbereich', 'Testbereich', 1, false, '2026-08'),
  ('zz-1', 'zz', 'Unterbereich', 'Testbereich > Unterbereich', 2, true, '2026-08');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('c5100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'brands-a@example.test', '{}', '{}'),
  ('c5100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'brands-b@example.test', '{}', '{}');
insert into public.workspaces (id, name) values
  ('c5100000-0000-4000-8000-000000000011', 'Marken A'),
  ('c5100000-0000-4000-8000-000000000012', 'Marken B');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('c5100000-0000-4000-8000-000000000011', 'c5100000-0000-4000-8000-000000000001', 'owner'),
  ('c5100000-0000-4000-8000-000000000012', 'c5100000-0000-4000-8000-000000000002', 'owner');
insert into public.purchases (id, workspace_id, type, title, entry_status, finalized_at, finalized_by) values
  ('c5100000-0000-4000-8000-000000000031', 'c5100000-0000-4000-8000-000000000011', 'single', 'Abgeschlossen', 'finalized', now(), 'c5100000-0000-4000-8000-000000000001');
insert into public.inventory_items (id, workspace_id, title, brand, category_id) values
  ('c5100000-0000-4000-8000-000000000041', 'c5100000-0000-4000-8000-000000000011', 'Abgeschlossener Artikel', 'Sony', 'zz-1');
update public.inventory_items set purchase_id = 'c5100000-0000-4000-8000-000000000031'
where id = 'c5100000-0000-4000-8000-000000000041';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$insert into public.inventory_items (id, workspace_id, title, brand, category_id)
  values ('c5100000-0000-4000-8000-000000000042', 'c5100000-0000-4000-8000-000000000011', 'Bohrer', ' Bosch ', 'zz-1')$$,
  'Mitglied legt Artikel mit Markentext an');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), 'Bosch', 'Markentext wird bereinigt übernommen');
select is((select category from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), 'Testbereich > Unterbereich', 'Kategorietext kommt aus der Kategorie');
select lives_ok($$insert into public.catalog_products (id, workspace_id, title, brand)
  values ('c5100000-0000-4000-8000-000000000051', 'c5100000-0000-4000-8000-000000000011', 'Bohrer Katalog', 'BOSCH')$$,
  'Katalogprodukt mit anderer Schreibweise');
select is((select count(*)::int from public.brands where workspace_id = 'c5100000-0000-4000-8000-000000000011' and name_key = 'bosch'), 1, 'Gleiche Marke entsteht nur einmal');
select is((select brand from public.catalog_products where id = 'c5100000-0000-4000-8000-000000000051'), 'Bosch', 'Vorhandene Schreibweise gilt');
select lives_ok($$update public.inventory_items set category = 'Freitext' where id = 'c5100000-0000-4000-8000-000000000042'$$, 'Freier Kategorietext wird angenommen');
select is((select category from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), 'Testbereich > Unterbereich', 'Freier Kategorietext wird überschrieben');
select lives_ok($$update public.brands set name = 'Robert Bosch' where workspace_id = 'c5100000-0000-4000-8000-000000000011' and name_key = 'bosch'$$, 'Marke umbenennen');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), 'Robert Bosch', 'Umbenennung zieht beim Artikel nach');
select is((select brand from public.catalog_products where id = 'c5100000-0000-4000-8000-000000000051'), 'Robert Bosch', 'Umbenennung zieht beim Katalogprodukt nach');
select lives_ok($$update public.brands set name = 'Sony Group' where workspace_id = 'c5100000-0000-4000-8000-000000000011' and name_key = 'sony'$$, 'Marke eines abgeschlossenen Einkaufs umbenennen');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000041'), 'Sony Group', 'Auch Artikel abgeschlossener Einkäufe erhalten den neuen Namen');
select throws_ok($$delete from public.brands where workspace_id = 'c5100000-0000-4000-8000-000000000011' and name_key = 'robert bosch'$$, '23503', null, 'Benutzte Marke lässt sich nicht löschen');
select lives_ok($$update public.inventory_items set brand_id = null where id = 'c5100000-0000-4000-8000-000000000042'$$, 'Marke entfernen');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000042'), null::text, 'Ohne Marke kein Markentext');
select throws_ok($$insert into public.brands (workspace_id, name) values ('c5100000-0000-4000-8000-000000000012', 'Fremd')$$, '42501', null, 'Keine Marke in fremdem Workspace');
select is((select count(*)::int from public.brands where workspace_id = 'c5100000-0000-4000-8000-000000000012'), 0, 'Fremde Marken sind unsichtbar');
select throws_ok($$insert into public.product_categories (id, name, full_name, level, taxonomy_version) values ('yy', 'Neu', 'Neu', 1, '2026-08')$$, '42501', null, 'Kategorien sind nur lesbar');
reset role;

set local role anon;
select throws_ok('select count(*) from public.product_categories', '42501', null, 'anon liest keine Kategorien');
select throws_ok('select count(*) from public.brands', '42501', null, 'anon liest keine Marken');
reset role;

-- Altbestand: freie Texte ohne Verweise. Der Sync-Trigger würde sie beim Einfügen
-- sofort bereinigen, deshalb ist er nur für die Testdaten abgeschaltet.
alter table public.inventory_items disable trigger "10_sync_category_brand_text";
alter table public.catalog_products disable trigger "10_sync_category_brand_text";
insert into public.workspaces (id, name) values ('c5100000-0000-4000-8000-000000000013', 'Altbestand');
insert into public.workspace_members (workspace_id, user_id, role)
values ('c5100000-0000-4000-8000-000000000013', 'c5100000-0000-4000-8000-000000000001', 'owner');
insert into public.inventory_items (id, workspace_id, title, brand, category) values
  ('c5100000-0000-4000-8000-000000000061', 'c5100000-0000-4000-8000-000000000013', 'Alt 1', 'Nintendo', 'Konsolen'),
  ('c5100000-0000-4000-8000-000000000062', 'c5100000-0000-4000-8000-000000000013', 'Alt 2', 'nintendo ', 'Konsolen'),
  ('c5100000-0000-4000-8000-000000000063', 'c5100000-0000-4000-8000-000000000013', 'Alt 3', 'NINTENDO', null),
  ('c5100000-0000-4000-8000-000000000064', 'c5100000-0000-4000-8000-000000000013', 'Alt 4', '   ', 'Werkzeug');
insert into public.catalog_products (id, workspace_id, title, brand, category)
values ('c5100000-0000-4000-8000-000000000071', 'c5100000-0000-4000-8000-000000000013', 'Alt Katalog', 'Nintendo', 'Spiele');
alter table public.inventory_items enable trigger "10_sync_category_brand_text";
alter table public.catalog_products enable trigger "10_sync_category_brand_text";

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.archive_workspace('c5100000-0000-4000-8000-000000000013');
reset role;

select lives_ok($$select public.migrate_legacy_category_brand_texts()$$, 'Übernahme läuft auch mit archiviertem Workspace');
select is((select string_agg(name, ',') from public.brands where workspace_id = 'c5100000-0000-4000-8000-000000000013'), 'Nintendo', 'Häufigste Schreibweise wird Markenname');
select is((select count(*)::int from public.inventory_items where workspace_id = 'c5100000-0000-4000-8000-000000000013' and brand_id is not null), 3, 'Alle Artikel mit Markentext verweisen auf die Marke');
select is((select count(*)::int from public.inventory_items where workspace_id = 'c5100000-0000-4000-8000-000000000013' and category is not null), 0, 'Alte Kategorietexte sind geleert');
select is((select brand from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000064'), null::text, 'Leerer Markentext wird entfernt');
select is((select concat_ws('|', brand, category) from public.catalog_products where id = 'c5100000-0000-4000-8000-000000000071'), 'Nintendo', 'Katalogprodukt übernommen, Kategorie geleert');
select is((select concat_ws('|', brand, category) from public.inventory_items where id = 'c5100000-0000-4000-8000-000000000041'), 'Sony Group|Testbereich > Unterbereich', 'Verknüpfte Artikel bleiben unverändert');
select throws_ok($$update public.inventory_items set title = 'Nach Übernahme' where id = 'c5100000-0000-4000-8000-000000000061'$$, '55000', null, 'Archivschutz ist danach wieder aktiv');

select * from finish();
rollback;
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx supabase test db supabase/tests/product_categories_brands.test.sql > /tmp/db.log 2>&1; echo $?; tail -20 /tmp/db.log`
Expected: Exitcode ≠ 0; `has_table … product_categories` schlägt fehl bzw. Abbruch beim ersten Zugriff auf die neue Tabelle.

- [ ] **Step 3: Schemadatei schreiben**

Inhalt von `supabase/schemas/150_product_categories_brands.sql`: siehe Anhang A am Ende dieses Plans (vollständig übernehmen).

- [ ] **Step 4: Ladereihenfolge eintragen**

In `supabase/config.toml` in `schema_paths` nach `"./schemas/140_purchase_package_contents.sql"` ergänzen: `, "./schemas/150_product_categories_brands.sql"`. Über `schema_paths` eine Kommentarzeile anfügen:

```toml
# 150_product_categories_brands steht nach 140, weil es Tabellen aus database.sql
# und den Archivschutz aus 80_workspace_retention erweitert.
```

- [ ] **Step 5: Struktur-Migration erzeugen und lesen**

```bash
npx supabase stop
npx supabase db diff -f product_categories_brands
```

Die erzeugte Datei `supabase/migrations/<ts>_product_categories_brands.sql` vollständig lesen und gegen Anhang A prüfen: beide Tabellen mit Checks und Kommentaren, eine Kategorien-Policy, vier Marken-Policies, `revoke`/`grant`, Spalten und Fremdschlüssel, vier Indexe, Trigger `00_protect_archived_workspace` an `brands`, beide `10_sync_category_brand_text`, `sync_brand_name_to_records`, `sync_category_name_to_records`, alle vier Funktionen samt `owner to postgres` und `revoke execute`. Fehlt etwas, die Anweisung aus Anhang A am Ende der Datei ergänzen. Kopfkommentar voranstellen:

```sql
-- Zweck: Tabellen für Produktkategorien (Shopify-Taxonomie) und Marken je Workspace,
-- Verweisspalten und Text-Synchronisierung an Artikeln und Katalogprodukten.
-- Betroffen: public.product_categories, public.brands (neu, RLS aktiv);
--   public.inventory_items und public.catalog_products (+ category_id, brand_id).
-- Erzeugt mit supabase db diff aus supabase/schemas/150_product_categories_brands.sql.
```

- [ ] **Step 6: Datenbank neu aufsetzen und Test laufen lassen**

```bash
npx supabase start
npx supabase db reset > /tmp/reset.log 2>&1; echo $?
npx supabase test db supabase/tests/product_categories_brands.test.sql > /tmp/db.log 2>&1; echo $?; tail -30 /tmp/db.log
```

Expected: beide Exitcodes `0`, alle Zeilen `ok`. Scheitert `public.archive_workspace(...)` an einer Vorbedingung, sie wie in `supabase/tests/workspace_retention.sql` (Zeilen 1–45) herstellen; die Prüfungen selbst nicht abschwächen.

- [ ] **Step 7: Alle Datenbanktests laufen lassen**

Run: `npx supabase test db > /tmp/db-all.log 2>&1; echo $?; grep -nE "not ok|Failed" /tmp/db-all.log | head`
Expected: `0`, keine Treffer. Scheitert ein älterer Test, weil er freien Kategorietext speichert und wieder liest, diese eine Erwartung auf den neuen Vertrag umstellen (Text nur über `category_id`) und das im Commit-Body nennen.

- [ ] **Step 8: Formatieren und committen**

```bash
npx prettier --write supabase/config.toml
git add supabase/schemas/150_product_categories_brands.sql supabase/config.toml supabase/migrations/*_product_categories_brands.sql supabase/tests/product_categories_brands.test.sql
git commit -m "feat(inventory): add category and brand tables with text sync" -m "Items and catalog products get references to Shopify categories and per-workspace brands. A trigger keeps the existing category/brand text columns filled from those references, so store, exports, labels and analytics keep reading text. Brand text from package capture and CSV import is resolved into canonical brands. Brand renames run as SECURITY DEFINER because finalized purchases block member updates. The legacy migration function disables the archived-workspace guard only inside its own transaction; the database test covers archived workspaces and finalized purchases."
```

---

### Task 3: Kategorien importieren, Altbestand übernehmen, Typen erzeugen

**Files:**

- Modify: `supabase/tests/product_categories_brands.test.sql`
- Create (erzeugt): `supabase/migrations/<ts>_import_shopify_taxonomy_v2026_08.sql`
- Create: `supabase/migrations/<ts>_migrate_legacy_category_brand_texts.sql`
- Modify (erzeugt): `src/app/core/models/supabase.types.ts`

**Interfaces:**

- Consumes: `scripts/import-shopify-taxonomy.mjs` (Task 1), Schema aus Task 2.
- Produces: befüllte `product_categories`; Typen `Database['public']['Tables']['product_categories' | 'brands']` und Spalten `category_id`, `brand_id` in `inventory_items`/`catalog_products`.

- [ ] **Step 1: Failing Prüfungen für die echten Daten ergänzen**

In `supabase/tests/product_categories_brands.test.sql` direkt vor `select * from finish();` einfügen:

```sql
-- Importierte Shopify-Taxonomie v2026-08
select is((select count(*)::int from public.product_categories where level = 1 and taxonomy_version = '2026-08'), 21, '21 Hauptbereiche nach Ausblenden von fünf');
select is((select count(*)::int from public.product_categories where split_part(id, '-', 1) in ('gc', 'se', 'bu', 'pa', 'na')), 0, 'Ausgeblendete Bereiche fehlen');
select cmp_ok((select count(*)::int from public.product_categories where taxonomy_version = '2026-08'), '>', 14000, 'Taxonomie ist vollständig importiert');
select is((select full_name from public.product_categories where id = 'el-6-6'), 'Elektronik > Computer > Laptops', 'Pfad einer bekannten Kategorie');
select is((select is_leaf from public.product_categories where id = 'el-6'), false, 'Computer hat Unterkategorien');
select is((select count(*)::int from public.product_categories child left join public.product_categories parent on parent.id = child.parent_id where child.parent_id is not null and parent.id is null), 0, 'Jede Oberkategorie existiert');
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx supabase test db supabase/tests/product_categories_brands.test.sql > /tmp/db.log 2>&1; echo $?; grep -n "not ok" /tmp/db.log`
Expected: Exitcode ≠ 0; „21 Hauptbereiche …“ und „Taxonomie ist vollständig importiert“ schlagen fehl.

- [ ] **Step 3: Kategorie-Migration erzeugen**

Run: `node scripts/import-shopify-taxonomy.mjs v2026-08`
Expected: `<Anzahl> Kategorien geschrieben: …supabase/migrations/<ts>_import_shopify_taxonomy_v2026_08.sql`

Die ersten 40 Zeilen der Datei lesen: Zweck, Quelle mit `v2026-08`, Anzahl, vollständiger MIT-Text („Copyright (c) Shopify“), erster `insert` beginnt mit Hauptbereichen. Datei nicht formatieren (sie ist erzeugt; Prettier formatiert kein SQL).

- [ ] **Step 4: Übernahme-Migration schreiben**

Dateiname mit UTC-Zeit **nach** der Kategorie-Migration: `date -u +%Y%m%d%H%M%S` ausführen und als Präfix nutzen, z. B. `supabase/migrations/20260914121500_migrate_legacy_category_brand_texts.sql`:

```sql
-- Zweck: Freie Kategorie- und Markentexte in das neue Modell übernehmen.
-- Betroffen: public.brands (neue Zeilen je Workspace),
--   public.inventory_items und public.catalog_products (brand_id, brand, category).
--
-- DESTRUKTIV: Alle Kategorietexte ohne category_id werden geleert. Der Nutzer hat
-- das am 14.09.2026 ausdrücklich entschieden (Option C im Entwurf
-- docs/superpowers/specs/2026-09-14-product-categories-brands-design.md): freie Texte
-- passen nicht verlässlich auf eine Shopify-Kategorie. Kategorien werden danach im
-- Wähler neu vergeben. Markentexte gehen nicht verloren, sie werden zu Marken.
--
-- Die Funktion schaltet den Archivschutz nur innerhalb dieser Transaktion ab; siehe
-- Kommentar an public.migrate_legacy_category_brand_texts().
select public.migrate_legacy_category_brand_texts();
```

- [ ] **Step 5: Datenbank neu aufsetzen und Test laufen lassen**

```bash
npx supabase db reset > /tmp/reset.log 2>&1; echo $?
npx supabase test db supabase/tests/product_categories_brands.test.sql > /tmp/db.log 2>&1; echo $?; grep -c "^ok" /tmp/db.log; grep -n "not ok" /tmp/db.log
```

Expected: `0`, `0`, keine `not ok`.

- [ ] **Step 6: Typen erzeugen**

Run: `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts`
Dann prüfen: `grep -n "product_categories:\|brands:\|category_id\|brand_id" src/app/core/models/supabase.types.ts | head`
Expected: Tabellen `brands` und `product_categories` sowie `category_id`/`brand_id` in `inventory_items` und `catalog_products` erscheinen.

- [ ] **Step 7: Typprüfung und Migrationsprüfung**

```bash
npm run typecheck > /tmp/tc.log 2>&1; echo $?
node scripts/check-migration-changes.mjs "$(git merge-base HEAD origin/master)" "$(git rev-parse HEAD)" > /tmp/mig.log 2>&1; echo $?
```

Expected: `0` für die Typprüfung. Die Migrationsprüfung vergleicht Commits; sie läuft nach dem Commit in Step 8 erneut und muss dann `0` liefern.

- [ ] **Step 8: Committen**

```bash
git add supabase/tests/product_categories_brands.test.sql supabase/migrations/*_import_shopify_taxonomy_v2026_08.sql supabase/migrations/*_migrate_legacy_category_brand_texts.sql src/app/core/models/supabase.types.ts
git commit -m "feat(inventory): import Shopify taxonomy v2026-08 and migrate legacy texts" -m "Loads the German Shopify taxonomy (without gift cards, services, bundles, add-ons and uncategorized) and converts existing free-text brands into per-workspace brands. Free-text categories are cleared on purpose: the user decided they cannot be mapped reliably. Regenerated Supabase types for the new tables and columns."
node scripts/check-migration-changes.mjs "$(git merge-base HEAD origin/master)" "$(git rev-parse HEAD)"; echo $?
```

Expected: letzter Exitcode `0`.

---

### Task 4: Modelle, Demo-Kategorien und ProductCategoryService

**Files:**

- Create: `src/app/core/models/product-category.models.ts`
- Create: `src/app/core/services/demo-product-categories.ts`
- Create: `src/app/core/services/product-category.service.ts`
- Create: `src/app/core/services/product-category.service.spec.ts`
- Modify: `src/app/core/models/flipbase.models.ts` (`InventoryItem`, `CatalogProduct`)

**Interfaces:**

- Consumes: Tabelle `product_categories` (Typen aus Task 3).
- Produces:
  - `interface ProductCategory { readonly id: string; readonly parentId: string | null; readonly name: string; readonly fullName: string; readonly level: number; readonly isLeaf: boolean; readonly isDeprecated: boolean }`
  - `interface Brand { readonly id: string; readonly workspaceId: string; readonly name: string }`
  - `interface CategoryBrandRecord { workspace_id: string; category_id?: string | null; category?: string | null; brand_id?: string | null; brand?: string | null }`
  - `categoryPathParts(fullName: string): string[]`, `brandNameKey(name: string): string`
  - `DEMO_PRODUCT_CATEGORIES: readonly ProductCategory[]`
  - `ProductCategoryService.loadChildren(parentId: string | null): Promise<readonly ProductCategory[]>`, `.search(term: string): Promise<CategorySearchResult>`, `.getById(id: string): Promise<ProductCategory | null>`; `interface CategorySearchResult { readonly categories: readonly ProductCategory[]; readonly hasMore: boolean }`; `CATEGORY_SEARCH_LIMIT = 50`; `escapeLikePattern(value: string): string`
  - `InventoryItem.category_id?`, `InventoryItem.brand_id?`, `CatalogProduct.category_id?`, `CatalogProduct.brand_id?` (je `string | null`)

- [ ] **Step 1: Failing Service-Test schreiben**

`src/app/core/services/product-category.service.spec.ts`:

```ts
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { MockDataStoreService } from './mock-data-store.service';
import {
  CATEGORY_SEARCH_LIMIT,
  ProductCategoryService,
  escapeLikePattern,
} from './product-category.service';
import { SupabaseService } from './supabase.service';

type Call = readonly [string, ...unknown[]];
interface QueryResult {
  readonly data: unknown;
  readonly error: { message: string } | null;
}

function createQuery(result: QueryResult) {
  const calls: Call[] = [];
  const query = {
    calls,
    select(...args: unknown[]) {
      calls.push(['select', ...args]);
      return query;
    },
    eq(...args: unknown[]) {
      calls.push(['eq', ...args]);
      return query;
    },
    is(...args: unknown[]) {
      calls.push(['is', ...args]);
      return query;
    },
    ilike(...args: unknown[]) {
      calls.push(['ilike', ...args]);
      return query;
    },
    order(...args: unknown[]) {
      calls.push(['order', ...args]);
      return query;
    },
    limit(...args: unknown[]) {
      calls.push(['limit', ...args]);
      return query;
    },
    maybeSingle: async () => result,
    then<T1 = QueryResult, T2 = never>(
      resolve?: ((value: QueryResult) => T1 | PromiseLike<T1>) | null,
      reject?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): Promise<T1 | T2> {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

const laptopRow = {
  id: 'el-6-6',
  parent_id: 'el-6',
  name: 'Laptops',
  full_name: 'Elektronik > Computer > Laptops',
  level: 3,
  is_leaf: true,
  is_deprecated: false,
};

function createService(results: QueryResult[], demo = false) {
  const queries = results.map(createQuery);
  const from = vi.fn(() => {
    const next = queries.shift();
    if (!next) throw new Error('Unerwartete Abfrage');
    return next;
  });
  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(demo);
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: MockDataStoreService, useValue: mockStore },
    ],
  });
  const service = runInInjectionContext(injector, () => new ProductCategoryService());
  return { service, from, mockStore };
}

describe('ProductCategoryService', () => {
  it('lädt Hauptbereiche ohne veraltete Kategorien und merkt sie sich', async () => {
    const query = createQuery({ data: [laptopRow], error: null });
    const from = vi.fn(() => query);
    const mockStore = new MockDataStoreService();
    mockStore.isDemoMode.set(false);
    const injector = Injector.create({
      providers: [
        { provide: SupabaseService, useValue: { client: { from } } },
        { provide: MockDataStoreService, useValue: mockStore },
      ],
    });
    const service = runInInjectionContext(injector, () => new ProductCategoryService());

    const first = await service.loadChildren(null);
    const second = await service.loadChildren(null);

    expect(first).toEqual([
      {
        id: 'el-6-6',
        parentId: 'el-6',
        name: 'Laptops',
        fullName: 'Elektronik > Computer > Laptops',
        level: 3,
        isLeaf: true,
        isDeprecated: false,
      },
    ]);
    expect(second).toBe(first);
    expect(from).toHaveBeenCalledTimes(1);
    expect(query.calls).toContainEqual(['is', 'parent_id', null]);
    expect(query.calls).toContainEqual(['eq', 'is_deprecated', false]);
    expect(query.calls).toContainEqual(['order', 'name']);
  });

  it('lädt nach einem Fehler beim nächsten Versuch neu', async () => {
    const { service, from } = createService([
      { data: null, error: { message: 'offline' } },
      { data: [laptopRow], error: null },
    ]);

    await expect(service.loadChildren('el-6')).rejects.toThrow('offline');
    await expect(service.loadChildren('el-6')).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('sucht erst ab zwei Zeichen und fragt dann jedes Wort maskiert ab', async () => {
    const rows = Array.from({ length: CATEGORY_SEARCH_LIMIT + 1 }, (_, index) => ({
      ...laptopRow,
      id: `el-6-${index}`,
    }));
    const query = createQuery({ data: rows, error: null });
    const from = vi.fn(() => query);
    const mockStore = new MockDataStoreService();
    mockStore.isDemoMode.set(false);
    const injector = Injector.create({
      providers: [
        { provide: SupabaseService, useValue: { client: { from } } },
        { provide: MockDataStoreService, useValue: mockStore },
      ],
    });
    const service = runInInjectionContext(injector, () => new ProductCategoryService());

    await expect(service.search(' l ')).resolves.toEqual({ categories: [], hasMore: false });
    expect(from).not.toHaveBeenCalled();

    const result = await service.search('50% lap_top');

    expect(result.categories).toHaveLength(CATEGORY_SEARCH_LIMIT);
    expect(result.hasMore).toBe(true);
    expect(query.calls).toContainEqual(['ilike', 'full_name', '%50\\%%']);
    expect(query.calls).toContainEqual(['ilike', 'full_name', '%lap\\_top%']);
    expect(query.calls).toContainEqual(['limit', CATEGORY_SEARCH_LIMIT + 1]);
  });

  it('maskiert Platzhalter für ilike', () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('nutzt im Demo-Modus die festen Beispielkategorien ohne Datenbank', async () => {
    const { service, from } = createService([], true);

    const roots = await service.loadChildren(null);
    const search = await service.search('laptops');

    expect(roots.map((category) => category.id)).toEqual(['aa', 'el', 'ha', 'co']);
    expect(search.categories.map((category) => category.id)).toEqual(['el-6-6']);
    expect(from).not.toHaveBeenCalled();
  });

  it('liefert bekannte Kategorien aus dem Zwischenspeicher und lädt unbekannte einzeln', async () => {
    const { service, from } = createService([
      { data: [laptopRow], error: null },
      { data: { ...laptopRow, id: 'el-6', name: 'Computer', is_leaf: false }, error: null },
    ]);

    await service.loadChildren('el-6');
    await expect(service.getById('el-6-6')).resolves.toMatchObject({ name: 'Laptops' });
    await expect(service.getById('el-6')).resolves.toMatchObject({ isLeaf: false });
    expect(from).toHaveBeenCalledTimes(2);
  });
});
```

Die Reihenfolge der Demo-Hauptbereiche im Test (`aa`, `el`, `ha`, `co`) folgt der Sortierung nach Namen mit `localeCompare('de-DE')`: „Bekleidung & Accessoires“, „Elektronik“, „Heimwerkerbedarf“, „Kameras & Optik“.

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run --project=node src/app/core/services/product-category.service.spec.ts`
Expected: FAIL mit `Failed to resolve import "./product-category.service"`

- [ ] **Step 3: Modelle schreiben**

`src/app/core/models/product-category.models.ts`:

```ts
/** Trennzeichen im vollen Kategoriepfad, wie es Shopify und die Datenbank verwenden. */
export const CATEGORY_PATH_SEPARATOR = ' > ';

export interface ProductCategory {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly fullName: string;
  readonly level: number;
  readonly isLeaf: boolean;
  readonly isDeprecated: boolean;
}

export interface Brand {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
}

/** Felder, die der Datenbank-Trigger sync_category_brand_text() pflegt. */
export interface CategoryBrandRecord {
  workspace_id: string;
  category_id?: string | null;
  category?: string | null;
  brand_id?: string | null;
  brand?: string | null;
}

export function categoryPathParts(fullName: string): string[] {
  return fullName.split(CATEGORY_PATH_SEPARATOR);
}

/** Vergleichsform wie brands.name_key in der Datenbank. */
export function brandNameKey(name: string): string {
  return name.trim().toLowerCase();
}
```

In `src/app/core/models/flipbase.models.ts` in `interface InventoryItem` direkt nach `category?: string | null;` einfügen:

```ts
  /** Verweis auf public.product_categories; der Text in `category` folgt daraus. */
  category_id?: string | null;
```

und direkt nach `brand?: string | null;` (in `InventoryItem`):

```ts
  /** Verweis auf public.brands; der Text in `brand` folgt daraus. */
  brand_id?: string | null;
```

Dasselbe in `interface CatalogProduct` nach `brand?: string | null;` bzw. `category?: string | null;`.

- [ ] **Step 4: Demo-Kategorien schreiben**

`src/app/core/services/demo-product-categories.ts`:

```ts
import { ProductCategory } from '../models/product-category.models';

function category(id: string, fullName: string, isLeaf: boolean): ProductCategory {
  const parts = fullName.split(' > ');
  const segments = id.split('-');
  return {
    id,
    parentId: segments.length === 1 ? null : segments.slice(0, -1).join('-'),
    name: parts[parts.length - 1],
    fullName,
    level: parts.length,
    isLeaf,
    isDeprecated: false,
  };
}

/**
 * Auszug aus der Shopify Standard Product Taxonomy v2026-08 (MIT, Copyright (c)
 * Shopify) für den Demo-Modus. Kennungen und Pfade sind echt, damit Demo- und
 * Datenbankbetrieb dieselben Werte speichern.
 */
export const DEMO_PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  category('el', 'Elektronik', false),
  category('el-2', 'Elektronik > Audio', false),
  category('el-2-3', 'Elektronik > Audio > Audioplayer & -rekorder', true),
  category('el-6', 'Elektronik > Computer', false),
  category('el-6-6', 'Elektronik > Computer > Laptops', true),
  category('el-6-8', 'Elektronik > Computer > Tablet-PCs', true),
  category('el-7', 'Elektronik > Elektronisches Zubehör', false),
  category('el-7-8', 'Elektronik > Elektronisches Zubehör > Computerzubehör', true),
  category('el-18', 'Elektronik > Zubehör für Videospielkonsolen', false),
  category('el-18-5', 'Elektronik > Zubehör für Videospielkonsolen > Videospiel-Controller', true),
  category('el-19', 'Elektronik > Videospielkonsolen', false),
  category('el-19-1', 'Elektronik > Videospielkonsolen > Tragbare Spielkonsolen', true),
  category('el-19-2', 'Elektronik > Videospielkonsolen > Heimspielkonsolen', true),
  category('aa', 'Bekleidung & Accessoires', false),
  category('aa-1', 'Bekleidung & Accessoires > Bekleidung', false),
  category('aa-1-13', 'Bekleidung & Accessoires > Bekleidung > Bekleidungsoberteile', false),
  category(
    'aa-1-13-8',
    'Bekleidung & Accessoires > Bekleidung > Bekleidungsoberteile > T-Shirts',
    true,
  ),
  category('aa-8', 'Bekleidung & Accessoires > Schuhe', false),
  category('aa-8-1', 'Bekleidung & Accessoires > Schuhe > Turnschuhe', true),
  category('aa-8-3', 'Bekleidung & Accessoires > Schuhe > Stiefel', true),
  category('aa-8-8', 'Bekleidung & Accessoires > Schuhe > Sneaker', true),
  category('co', 'Kameras & Optik', false),
  category('co-1', 'Kameras & Optik > Kamera- & Optisches Zubehör', true),
  category('co-2', 'Kameras & Optik > Kameras', true),
  category('ha', 'Heimwerkerbedarf', false),
  category('ha-14', 'Heimwerkerbedarf > Werkzeugzubehör', false),
  category('ha-14-16', 'Heimwerkerbedarf > Werkzeugzubehör > Elektrowerkzeug-Akkus', true),
  category('ha-15', 'Heimwerkerbedarf > Werkzeuge', false),
  category('ha-15-14', 'Heimwerkerbedarf > Werkzeuge > Bohrmaschinen', false),
  category(
    'ha-15-14-3',
    'Heimwerkerbedarf > Werkzeuge > Bohrmaschinen > Elektrische Handbohrmaschinen',
    true,
  ),
  category('ha-15-38', 'Heimwerkerbedarf > Werkzeuge > Multifunktionales Elektrowerkzeug', true),
];
```

- [ ] **Step 5: Service schreiben**

`src/app/core/services/product-category.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { ProductCategory } from '../models/product-category.models';
import { DEMO_PRODUCT_CATEGORIES } from './demo-product-categories';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';

export const CATEGORY_SEARCH_LIMIT = 50;

export interface CategorySearchResult {
  readonly categories: readonly ProductCategory[];
  readonly hasMore: boolean;
}

interface ProductCategoryRow {
  readonly id: string;
  readonly parent_id: string | null;
  readonly name: string;
  readonly full_name: string;
  readonly level: number;
  readonly is_leaf: boolean;
  readonly is_deprecated: boolean;
}

const CATEGORY_COLUMNS = 'id, parent_id, name, full_name, level, is_leaf, is_deprecated';

function mapRow(row: ProductCategoryRow): ProductCategory {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    fullName: row.full_name,
    level: row.level,
    isLeaf: row.is_leaf,
    isDeprecated: row.is_deprecated,
  };
}

function byName(left: ProductCategory, right: ProductCategory): number {
  return left.name.localeCompare(right.name, 'de-DE');
}

function bySearchRelevance(left: ProductCategory, right: ProductCategory): number {
  return left.level - right.level || left.fullName.localeCompare(right.fullName, 'de-DE');
}

/** Maskiert die Platzhalter von LIKE/ILIKE, damit „50%“ wörtlich gesucht wird. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

/**
 * Liest den Shopify-Kategoriebaum. Kategorien ändern sich nur mit Migrationen,
 * deshalb bleiben geladene Ebenen für die Sitzung im Speicher.
 */
@Injectable({ providedIn: 'root' })
export class ProductCategoryService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly childrenCache = new Map<string, Promise<readonly ProductCategory[]>>();
  private readonly categoriesById = new Map<string, ProductCategory>();

  loadChildren(parentId: string | null): Promise<readonly ProductCategory[]> {
    const demo = this.mockStore.isDemoMode();
    const key = `${demo ? 'demo' : 'db'}:${parentId ?? ''}`;
    const cached = this.childrenCache.get(key);
    if (cached) return cached;

    const request = (
      demo ? Promise.resolve(this.demoChildren(parentId)) : this.fetchChildren(parentId)
    ).then(
      (categories) => {
        for (const category of categories) this.categoriesById.set(category.id, category);
        return categories;
      },
      (error: unknown) => {
        // Ohne diesen Schritt bliebe der Fehler gespeichert und „Erneut versuchen“
        // liefe ins Leere.
        this.childrenCache.delete(key);
        throw error;
      },
    );
    this.childrenCache.set(key, request);
    return request;
  }

  async search(term: string): Promise<CategorySearchResult> {
    const words = term.trim().split(/\s+/u).filter(Boolean);
    if (words.join(' ').length < 2) return { categories: [], hasMore: false };

    let categories: ProductCategory[];
    if (this.mockStore.isDemoMode()) {
      const needles = words.map((word) => word.toLocaleLowerCase('de-DE'));
      categories = DEMO_PRODUCT_CATEGORIES.filter(
        (category) =>
          !category.isDeprecated &&
          needles.every((needle) => category.fullName.toLocaleLowerCase('de-DE').includes(needle)),
      )
        .sort(bySearchRelevance)
        .slice(0, CATEGORY_SEARCH_LIMIT + 1);
    } else {
      let query = this.supabase.client
        .from('product_categories')
        .select(CATEGORY_COLUMNS)
        .eq('is_deprecated', false);
      for (const word of words) query = query.ilike('full_name', `%${escapeLikePattern(word)}%`);
      const { data, error } = await query
        .order('level')
        .order('full_name')
        .limit(CATEGORY_SEARCH_LIMIT + 1);
      if (error) throw new Error(error.message);
      categories = (data ?? []).map(mapRow);
    }

    for (const category of categories) this.categoriesById.set(category.id, category);
    return {
      categories: categories.slice(0, CATEGORY_SEARCH_LIMIT),
      hasMore: categories.length > CATEGORY_SEARCH_LIMIT,
    };
  }

  async getById(id: string): Promise<ProductCategory | null> {
    const known = this.categoriesById.get(id);
    if (known) return known;
    if (this.mockStore.isDemoMode())
      return DEMO_PRODUCT_CATEGORIES.find((category) => category.id === id) ?? null;

    const { data, error } = await this.supabase.client
      .from('product_categories')
      .select(CATEGORY_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const category = mapRow(data);
    this.categoriesById.set(category.id, category);
    return category;
  }

  private demoChildren(parentId: string | null): readonly ProductCategory[] {
    return DEMO_PRODUCT_CATEGORIES.filter(
      (category) => category.parentId === parentId && !category.isDeprecated,
    ).sort(byName);
  }

  private async fetchChildren(parentId: string | null): Promise<readonly ProductCategory[]> {
    const base = this.supabase.client
      .from('product_categories')
      .select(CATEGORY_COLUMNS)
      .eq('is_deprecated', false);
    const filtered =
      parentId === null ? base.is('parent_id', null) : base.eq('parent_id', parentId);
    const { data, error } = await filtered.order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }
}
```

- [ ] **Step 6: Tests laufen lassen, sie müssen bestehen**

Run: `npx vitest run --project=node src/app/core/services/product-category.service.spec.ts`
Expected: PASS, 6 Tests. Schlägt nur die Demo-Reihenfolge fehl, die erwartete Liste an die tatsächliche `localeCompare`-Sortierung anpassen, nicht die Sortierung entfernen.

- [ ] **Step 7: Typen, Lint, Format, Commit**

```bash
npx prettier --write src/app/core/models/product-category.models.ts src/app/core/models/flipbase.models.ts src/app/core/services/demo-product-categories.ts src/app/core/services/product-category.service.ts src/app/core/services/product-category.service.spec.ts
npm run typecheck > /tmp/tc.log 2>&1; echo $?
npx eslint src/app/core/services/product-category.service.ts src/app/core/services/demo-product-categories.ts src/app/core/models/product-category.models.ts > /tmp/lint.log 2>&1; echo $?
git add src/app/core/models/product-category.models.ts src/app/core/models/flipbase.models.ts src/app/core/services/demo-product-categories.ts src/app/core/services/product-category.service.ts src/app/core/services/product-category.service.spec.ts
git commit -m "feat(inventory): add product category service with demo taxonomy" -m "Loads category levels on demand, caches them for the session and searches every word of the full path with escaped ILIKE wildcards. Failed loads are evicted so retry really reloads. Demo mode uses real Shopify IDs so demo and database records stay compatible."
```

Expected: beide Exitcodes `0`.

---

### Task 5: BrandService und Demo-Nachbildung des Triggers

**Files:**

- Create: `src/app/core/services/brand.service.ts`
- Create: `src/app/core/services/brand.service.dom.spec.ts`
- Modify: `src/app/core/services/mock-data-store.service.ts`

**Interfaces:**

- Consumes: `Brand`, `CategoryBrandRecord`, `brandNameKey` (Task 4), `DEMO_PRODUCT_CATEGORIES` (Task 4), Tabelle `brands` (Task 3).
- Produces:
  - `BrandService.brands: Signal<readonly Brand[]>`, `.loading: Signal<boolean>`, `.loadError: Signal<Error | null>`
  - `BrandService.ensureLoaded(): Promise<void>`, `.reload(): Promise<void>`, `.search(term: string, limit?: number): readonly Brand[]`, `.findByName(name: string): Brand | null`, `.findById(id: string): Brand | null`, `.create(name: string): Promise<{ readonly data: Brand | null; readonly error: Error | null }>`
  - `MockDataStoreService.getBrands(workspaceId: string): Brand[]`, `.ensureBrand(workspaceId: string, name: string): Brand | null`, `.applyCategoryBrandText<T extends CategoryBrandRecord>(record: T, previous?: CategoryBrandRecord): T`

- [ ] **Step 1: Failing Tests schreiben**

`src/app/core/services/brand.service.dom.spec.ts`:

```ts
import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../models/flipbase.models';
import { BrandService } from './brand.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';

const workspace = (id: string): Workspace => ({
  id,
  name: id,
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
  created_at: '2026-09-14T10:00:00.000Z',
});

interface BrandRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
}

function selectQuery(pages: BrandRow[][]) {
  const range = vi.fn(async () => ({ data: pages.shift() ?? [], error: null }));
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range,
  };
  return { query, range };
}

function createService(options: {
  readonly pages?: BrandRow[][];
  readonly insertResult?: {
    data: BrandRow | null;
    error: { code?: string; message: string } | null;
  };
  readonly demo?: boolean;
}) {
  const current = signal<Workspace | null>(workspace('ws-1'));
  const pages = options.pages ?? [];
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () =>
        options.insertResult ?? { data: null, error: { message: 'kein Ergebnis' } },
    }),
  }));
  const selects: ReturnType<typeof selectQuery>[] = [];
  const from = vi.fn(() => {
    const select = selectQuery(pages);
    selects.push(select);
    return { ...select.query, insert };
  });
  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(options.demo ?? false);
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: MockDataStoreService, useValue: mockStore },
      { provide: WorkspaceService, useValue: { currentWorkspace: current } },
    ],
  });
  const service = runInInjectionContext(injector, () => new BrandService());
  return { service, from, insert, current, mockStore, selects };
}

describe('BrandService', () => {
  beforeEach(() => localStorage.clear());

  it('lädt die Marken des Workspace einmal und sortiert sie', async () => {
    const { service, from } = createService({
      pages: [
        [
          { id: 'b2', workspace_id: 'ws-1', name: 'Sony' },
          { id: 'b1', workspace_id: 'ws-1', name: 'Bosch' },
        ],
        [],
      ],
    });

    await service.ensureLoaded();
    await service.ensureLoaded();

    expect(service.brands().map((brand) => brand.name)).toEqual(['Bosch', 'Sony']);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('zeigt nach einem Workspacewechsel keine fremden Marken', async () => {
    const { service, current } = createService({
      pages: [[{ id: 'b1', workspace_id: 'ws-1', name: 'Bosch' }], []],
    });
    await service.ensureLoaded();

    current.set(workspace('ws-2'));

    expect(service.brands()).toEqual([]);
  });

  it('sucht Anfangstreffer vor enthaltenen Treffern', async () => {
    const { service } = createService({
      pages: [
        [
          { id: 'b1', workspace_id: 'ws-1', name: 'Adidas' },
          { id: 'b2', workspace_id: 'ws-1', name: 'Dash' },
          { id: 'b3', workspace_id: 'ws-1', name: 'Das Keyboard' },
        ],
        [],
      ],
    });
    await service.ensureLoaded();

    expect(service.search('das').map((brand) => brand.name)).toEqual(['Das Keyboard', 'Adidas']);
    expect(service.findByName(' DASH ')?.id).toBe('b2');
  });

  it('liefert eine vorhandene Marke, statt sie doppelt anzulegen', async () => {
    const { service, insert } = createService({
      pages: [[{ id: 'b1', workspace_id: 'ws-1', name: 'Bosch' }], []],
    });

    const result = await service.create('  bosch ');

    expect(result).toEqual({ data: { id: 'b1', workspaceId: 'ws-1', name: 'Bosch' }, error: null });
    expect(insert).not.toHaveBeenCalled();
  });

  it('legt eine neue Marke an und nimmt sie in die Liste auf', async () => {
    const { service, insert } = createService({
      pages: [[], []],
      insertResult: { data: { id: 'b9', workspace_id: 'ws-1', name: 'Makita' }, error: null },
    });

    const result = await service.create('Makita');

    expect(insert).toHaveBeenCalledWith({ workspace_id: 'ws-1', name: 'Makita' });
    expect(result.data?.id).toBe('b9');
    expect(service.findByName('makita')?.id).toBe('b9');
  });

  it('übernimmt bei gleichzeitigem Anlegen die bereits vorhandene Marke', async () => {
    const { service } = createService({
      pages: [[], [{ id: 'b5', workspace_id: 'ws-1', name: 'Makita' }], []],
      insertResult: { data: null, error: { code: '23505', message: 'duplicate key' } },
    });

    const result = await service.create('makita');

    expect(result).toEqual({
      data: { id: 'b5', workspaceId: 'ws-1', name: 'Makita' },
      error: null,
    });
  });

  it('meldet ungültige Namen ohne Datenbankzugriff', async () => {
    const { service, from } = createService({});

    await expect(service.create('   ')).resolves.toMatchObject({ data: null });
    await expect(service.create('x'.repeat(121))).resolves.toMatchObject({ data: null });
    expect(from).not.toHaveBeenCalled();
  });

  it('arbeitet im Demo-Modus mit lokalen Marken', async () => {
    const { service, from, mockStore } = createService({ demo: true });

    const created = await service.create('Nintendo');

    expect(created.data?.name).toBe('Nintendo');
    expect(mockStore.getBrands('ws-1').map((brand) => brand.name)).toEqual(['Nintendo']);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('MockDataStoreService.applyCategoryBrandText', () => {
  beforeEach(() => localStorage.clear());

  function demoStore() {
    const store = new MockDataStoreService();
    store.isDemoMode.set(true);
    return store;
  }

  it('wertet beim Anlegen Markentext aus und setzt den Kategoriepfad', () => {
    const store = demoStore();

    const record = store.applyCategoryBrandText({
      workspace_id: 'ws-1',
      brand: ' Bosch ',
      category_id: 'ha-15-14',
      category: 'Freitext',
    });

    expect(record.brand).toBe('Bosch');
    expect(record.brand_id).toBe(store.getBrands('ws-1')[0].id);
    expect(record.category).toBe('Heimwerkerbedarf > Werkzeuge > Bohrmaschinen');
  });

  it('lässt beim Ändern der Kennung den alten Text unbeachtet', () => {
    const store = demoStore();
    const bosch = store.ensureBrand('ws-1', 'Bosch')!;
    const makita = store.ensureBrand('ws-1', 'Makita')!;
    const previous = { workspace_id: 'ws-1', brand_id: bosch.id, brand: 'Bosch' };

    const record = store.applyCategoryBrandText({ ...previous, brand_id: makita.id }, previous);

    expect(record.brand).toBe('Makita');
  });

  it('entfernt Text ohne Verweis und unbekannte Kategorien', () => {
    const store = demoStore();

    const record = store.applyCategoryBrandText(
      { workspace_id: 'ws-1', brand_id: null, brand: 'Bosch', category_id: 'zz', category: 'Alt' },
      { workspace_id: 'ws-1', brand_id: null, brand: 'Bosch' },
    );

    expect(record).toMatchObject({
      brand_id: null,
      brand: null,
      category_id: 'zz',
      category: null,
    });
  });
});
```

Die Datei läuft wegen der verwendeten `localStorage`-API im DOM-Projekt.

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run --project=dom src/app/core/services/brand.service.dom.spec.ts`
Expected: FAIL mit `Failed to resolve import "./brand.service"`

- [ ] **Step 3: Demo-Marken im MockDataStoreService ergänzen**

In `src/app/core/services/mock-data-store.service.ts`:

1. Importe ergänzen:

```ts
import { Brand, CategoryBrandRecord, brandNameKey } from '../models/product-category.models';
import { DEMO_PRODUCT_CATEGORIES } from './demo-product-categories';
```

(`createLocalDemoId` ist dort bereits verfügbar, falls nicht: `import { createLocalDemoId } from '../utils/client-identity';`.)

2. Nach `const STORAGE_KEY_PACKAGE_CAPTURES = 'flipbase_local_package_captures';`:

```ts
const STORAGE_KEY_BRANDS = 'flipbase_local_brands';

interface DemoBrandRecord {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
}
```

3. Direkt vor `getCatalogProducts(workspaceId?: string): CatalogProduct[] {` einfügen:

```ts
  // --- Marken und Kategorien (nur Demo-Modus) ---
  getBrands(workspaceId: string): Brand[] {
    return this.getWorkspaceRecords<DemoBrandRecord>(STORAGE_KEY_BRANDS, workspaceId)
      .map((record) => ({ id: record.id, workspaceId: record.workspace_id, name: record.name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'de-DE'));
  }

  /** Liefert die Demo-Marke gleicher Vergleichsform oder legt sie an. */
  ensureBrand(workspaceId: string, name: string): Brand | null {
    const trimmed = name.trim().slice(0, 120).trim();
    if (!trimmed || !this.isDemoMode()) return null;
    const existing = this.getBrands(workspaceId).find(
      (brand) => brandNameKey(brand.name) === brandNameKey(trimmed),
    );
    if (existing) return existing;
    const record: DemoBrandRecord = {
      id: createLocalDemoId('brand'),
      workspace_id: workspaceId,
      name: trimmed,
    };
    this.saveWorkspaceRecord(STORAGE_KEY_BRANDS, record);
    return { id: record.id, workspaceId, name: trimmed };
  }

  /**
   * Bildet public.sync_category_brand_text() nach: Die Kennung hat Vorrang, Markentext
   * zählt nur beim Anlegen ohne Kennung oder bei geändertem Text mit gleicher Kennung.
   * Kategorietext folgt immer der Kennung.
   */
  applyCategoryBrandText<T extends CategoryBrandRecord>(
    record: T,
    previous?: CategoryBrandRecord,
  ): T {
    let brandId = record.brand_id ?? null;
    const resolveText =
      previous === undefined
        ? brandId === null
        : brandId === (previous.brand_id ?? null) &&
          (record.brand ?? null) !== (previous.brand ?? null);
    if (resolveText) {
      brandId = record.brand?.trim()
        ? (this.ensureBrand(record.workspace_id, record.brand)?.id ?? null)
        : null;
    }
    const brand = brandId
      ? (this.getBrands(record.workspace_id).find((entry) => entry.id === brandId)?.name ?? null)
      : null;
    const categoryId = record.category_id ?? null;
    const category = categoryId
      ? (DEMO_PRODUCT_CATEGORIES.find((entry) => entry.id === categoryId)?.fullName ?? null)
      : null;
    return { ...record, brand_id: brandId, brand, category_id: categoryId, category };
  }

```

4. In `capturePurchasePackageContents` den Block `const inventoryItems: InventoryItem[] = normalized.map((entry) => ({ … }));` durch diesen ersetzen (gleiche Felder, zusätzlich Markentext wie in der Datenbank):

```ts
const inventoryItems: InventoryItem[] = normalized.map((entry) =>
  this.applyCategoryBrandText<InventoryItem>({
    ...entry,
    id: this.newId('item'),
    workspace_id: workspaceId,
    purchase_id: purchase.id,
    purchase_line_id: null,
    source_package_line_id: lineId,
    is_public_store: false,
    status: purchase.entry_status === 'finalized' ? 'ready' : 'received',
    allocated_purchase_cost: null,
    tax_purchase_cost: null,
    sale_state: 'no_active_sale',
    active_sale_count: 0,
    active_sale_id: null,
    created_at: createdAt,
  }),
);
```

Vor dem Ersetzen den vorhandenen Block lesen und abgleichen, dass genau diese Felder darin stehen; zusätzliche Felder dort übernehmen.

- [ ] **Step 4: BrandService schreiben**

`src/app/core/services/brand.service.ts`:

```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { Brand, brandNameKey } from '../models/product-category.models';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';

const PAGE_SIZE = 1000;
export const BRAND_NAME_MAX_LENGTH = 120;

interface LoadedBrands {
  readonly key: string;
  readonly brands: readonly Brand[];
}

function sortBrands(brands: readonly Brand[]): Brand[] {
  return [...brands].sort((left, right) => left.name.localeCompare(right.name, 'de-DE'));
}

/**
 * Marken des aktuellen Workspace.
 *
 * Der Kontext besteht aus Workspace und Demo-Modus. Bewusst ohne AuthService: Der
 * Dienst steckt in Formularen, deren Tests sonst die ganze Anmeldekette brauchten.
 * Ein anderer Nutzer bedeutet in Flipbase auch einen anderen Workspace-Stand.
 */
@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly workspace = inject(WorkspaceService);

  private readonly loaded = signal<LoadedBrands | null>(null);
  private pending: { readonly key: string; readonly promise: Promise<void> } | null = null;

  readonly loading = signal(false);
  readonly loadError = signal<Error | null>(null);

  private readonly contextKey = computed(() => {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    return workspaceId ? `${workspaceId}:${this.mockStore.isDemoMode()}` : null;
  });

  /** Nie Marken eines anderen Workspace oder Modus. */
  readonly brands = computed<readonly Brand[]>(() => {
    const state = this.loaded();
    return state && state.key === this.contextKey() ? state.brands : [];
  });

  ensureLoaded(): Promise<void> {
    const key = this.contextKey();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!key || !workspaceId || this.loaded()?.key === key) return Promise.resolve();
    if (this.pending?.key === key) return this.pending.promise;
    const promise = this.load(key, workspaceId).finally(() => {
      if (this.pending?.key === key) this.pending = null;
    });
    this.pending = { key, promise };
    return promise;
  }

  reload(): Promise<void> {
    this.loaded.set(null);
    this.pending = null;
    return this.ensureLoaded();
  }

  search(term: string, limit = 50): readonly Brand[] {
    const key = brandNameKey(term);
    const brands = this.brands();
    if (!key) return brands.slice(0, limit);
    const startsWith = brands.filter((brand) => brandNameKey(brand.name).startsWith(key));
    const contains = brands.filter(
      (brand) =>
        !brandNameKey(brand.name).startsWith(key) && brandNameKey(brand.name).includes(key),
    );
    return [...startsWith, ...contains].slice(0, limit);
  }

  findByName(name: string): Brand | null {
    const key = brandNameKey(name);
    return key ? (this.brands().find((brand) => brandNameKey(brand.name) === key) ?? null) : null;
  }

  findById(id: string): Brand | null {
    return this.brands().find((brand) => brand.id === id) ?? null;
  }

  async create(
    name: string,
  ): Promise<{ readonly data: Brand | null; readonly error: Error | null }> {
    const trimmed = name.trim();
    if (!trimmed) return { data: null, error: new Error('Bitte einen Markennamen eingeben.') };
    if (trimmed.length > BRAND_NAME_MAX_LENGTH)
      return {
        data: null,
        error: new Error(
          `Der Markenname darf höchstens ${BRAND_NAME_MAX_LENGTH} Zeichen lang sein.`,
        ),
      };
    const workspaceId = this.workspace.currentWorkspace()?.id;
    const key = this.contextKey();
    if (!workspaceId || !key)
      return { data: null, error: new Error('Kein aktiver Workspace ausgewählt.') };

    await this.ensureLoaded();
    const existing = this.findByName(trimmed);
    if (existing) return { data: existing, error: null };

    try {
      let brand: Brand;
      if (this.mockStore.isDemoMode()) {
        const created = this.mockStore.ensureBrand(workspaceId, trimmed);
        if (!created) throw new Error('Die Marke konnte nicht angelegt werden.');
        brand = created;
      } else {
        const { data, error } = await this.supabase.client
          .from('brands')
          .insert({ workspace_id: workspaceId, name: trimmed })
          .select('id, workspace_id, name')
          .single();
        if (error?.code === '23505') {
          // Jemand hat dieselbe Marke gerade angelegt: vorhandene übernehmen.
          await this.reload();
          const concurrent = this.findByName(trimmed);
          if (concurrent) return { data: concurrent, error: null };
        }
        if (error || !data)
          throw new Error(error?.message ?? 'Die Marke wurde nicht zurückgegeben.');
        brand = { id: data.id, workspaceId: data.workspace_id, name: data.name };
      }
      this.loaded.update((state) =>
        state && state.key === key ? { key, brands: sortBrands([...state.brands, brand]) } : state,
      );
      return { data: brand, error: null };
    } catch (error: unknown) {
      return {
        data: null,
        error:
          error instanceof Error ? error : new Error('Die Marke konnte nicht angelegt werden.'),
      };
    }
  }

  private async load(key: string, workspaceId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const brands = this.mockStore.isDemoMode()
        ? this.mockStore.getBrands(workspaceId)
        : await this.fetchBrands(workspaceId);
      if (this.contextKey() === key) this.loaded.set({ key, brands: sortBrands(brands) });
    } catch (error: unknown) {
      if (this.contextKey() === key)
        this.loadError.set(
          error instanceof Error ? error : new Error('Marken konnten nicht geladen werden.'),
        );
    } finally {
      this.loading.set(false);
    }
  }

  /** Blättert, weil PostgREST jede Antwort ohne Fehler auf max_rows kürzt. */
  private async fetchBrands(workspaceId: string): Promise<Brand[]> {
    const brands: Brand[] = [];
    for (let offset = 0; ;) {
      const { data, error } = await this.supabase.client
        .from('brands')
        .select('id, workspace_id, name')
        .eq('workspace_id', workspaceId)
        .order('name')
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = data ?? [];
      if (page.length === 0) return brands;
      for (const row of page)
        brands.push({ id: row.id, workspaceId: row.workspace_id, name: row.name });
      offset += page.length;
    }
  }
}
```

- [ ] **Step 5: Tests laufen lassen, sie müssen bestehen**

Run: `npx vitest run --project=dom src/app/core/services/brand.service.dom.spec.ts`
Expected: PASS, 11 Tests.

- [ ] **Step 6: Bestehende Demo-Tests prüfen**

Run: `npx vitest run src/app/core/services/mock-data-store src/app/features/purchases/services/purchase-package.service.dom.spec.ts > /tmp/mock.log 2>&1; echo $?; tail -8 /tmp/mock.log`
Expected: `0`.

- [ ] **Step 7: Typen, Lint, Format, Commit**

```bash
npx prettier --write src/app/core/services/brand.service.ts src/app/core/services/brand.service.dom.spec.ts src/app/core/services/mock-data-store.service.ts
npm run typecheck > /tmp/tc.log 2>&1; echo $?
npx eslint src/app/core/services/brand.service.ts src/app/core/services/mock-data-store.service.ts > /tmp/lint.log 2>&1; echo $?
git add src/app/core/services/brand.service.ts src/app/core/services/brand.service.dom.spec.ts src/app/core/services/mock-data-store.service.ts
git commit -m "feat(inventory): add brand service and demo brand handling" -m "Brands are loaded per workspace and never shown for a different workspace or mode. Creating a brand returns an existing one with the same comparison key, and a concurrent unique violation reloads and returns the winner instead of failing. Demo mode mirrors the database trigger so demo items get the same brand and category text."
```

Expected: beide Exitcodes `0`.

---

### Task 6: Kategorie-Wähler `app-category-picker`

**Files:**

- Create: `src/app/shared/components/category-picker/category-picker.component.ts`
- Create: `src/app/shared/components/category-picker/category-picker.component.html`
- Create: `src/app/shared/components/category-picker/category-picker.component.scss`
- Create: `src/app/shared/components/category-picker/category-picker.component.angular.spec.ts`

**Interfaces:**

- Consumes: `ProductCategoryService.loadChildren/search/getById`, `ProductCategory`, `categoryPathParts` (Task 4).
- Produces: `<app-category-picker>` als Formularfeld (Wert `string | null`) mit Eingängen `label: string` (Standard „Kategorie“), `labelHidden: boolean`, `placeholder: string`, `suggestion: string | null`, `helpText: string`, `id: string`.

- [ ] **Step 1: Failing Komponententest schreiben**

`src/app/shared/components/category-picker/category-picker.component.angular.spec.ts`:

```ts
import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductCategory } from '../../../core/models/product-category.models';
import { ProductCategoryService } from '../../../core/services/product-category.service';
import { CategoryPickerComponent } from './category-picker.component';

interface ComponentMetadata {
  ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
}

const electronics: ProductCategory = {
  id: 'el',
  parentId: null,
  name: 'Elektronik',
  fullName: 'Elektronik',
  level: 1,
  isLeaf: false,
  isDeprecated: false,
};
const clothing: ProductCategory = {
  ...electronics,
  id: 'aa',
  name: 'Bekleidung & Accessoires',
  fullName: 'Bekleidung & Accessoires',
};
const computers: ProductCategory = {
  id: 'el-6',
  parentId: 'el',
  name: 'Computer',
  fullName: 'Elektronik > Computer',
  level: 2,
  isLeaf: false,
  isDeprecated: false,
};
const laptops: ProductCategory = {
  id: 'el-6-6',
  parentId: 'el-6',
  name: 'Laptops',
  fullName: 'Elektronik > Computer > Laptops',
  level: 3,
  isLeaf: true,
  isDeprecated: false,
};
const all = [electronics, clothing, computers, laptops];

const service = {
  loadChildren: vi.fn(async (parentId: string | null): Promise<readonly ProductCategory[]> =>
    all.filter((category) => category.parentId === parentId),
  ),
  search: vi.fn(async () => ({
    categories: [laptops] as readonly ProductCategory[],
    hasMore: false,
  })),
  getById: vi.fn(async (id: string) => all.find((category) => category.id === id) ?? null),
};

const inputNames = ['label', 'labelHidden', 'placeholder', 'suggestion', 'helpText', 'id'];
let restoreMetadata = (): void => undefined;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

beforeEach(() => {
  vi.clearAllMocks();
  const metadata = (CategoryPickerComponent as unknown as ComponentMetadata).ɵcmp;
  const inputs = metadata.inputs;
  const declared = metadata.declaredInputs;
  metadata.inputs = { ...inputs };
  metadata.declaredInputs = { ...declared };
  for (const name of inputNames) {
    metadata.inputs[name] = [name, 1, null];
    metadata.declaredInputs[name] = name;
  }
  restoreMetadata = () => {
    metadata.inputs = inputs;
    metadata.declaredInputs = declared;
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CategoryPickerComponent],
    providers: [{ provide: ProductCategoryService, useValue: service }],
  });
});

afterEach(() => {
  try {
    TestBed.resetTestingModule();
  } finally {
    restoreMetadata();
  }
});

async function settle(fixture: ComponentFixture<CategoryPickerComponent>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
}

function create(config: { value?: string | null; suggestion?: string } = {}) {
  const fixture = TestBed.createComponent(CategoryPickerComponent);
  fixture.componentRef.setInput('id', 'item-category');
  if (config.suggestion) fixture.componentRef.setInput('suggestion', config.suggestion);
  const changes: (string | null)[] = [];
  fixture.componentInstance.registerOnChange((value) => changes.push(value));
  fixture.componentInstance.writeValue(config.value ?? null);
  fixture.detectChanges();
  return { fixture, changes };
}

const element = (fixture: ComponentFixture<CategoryPickerComponent>) =>
  fixture.nativeElement as HTMLElement;
const trigger = (fixture: ComponentFixture<CategoryPickerComponent>) =>
  element(fixture).querySelector<HTMLButtonElement>('#item-category')!;
const search = (fixture: ComponentFixture<CategoryPickerComponent>) =>
  element(fixture).querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = (fixture: ComponentFixture<CategoryPickerComponent>) =>
  Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('[role="option"]'));
const buttonWithText = (fixture: ComponentFixture<CategoryPickerComponent>, text: string) =>
  Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(text),
  );

function key(fixture: ComponentFixture<CategoryPickerComponent>, name: string): void {
  search(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  fixture.detectChanges();
}

describe('CategoryPickerComponent', () => {
  it('zeigt geschlossen den Platzhalter und geöffnet die Hauptbereiche', async () => {
    const { fixture } = create();
    expect(trigger(fixture).textContent).toContain('Kategorie wählen');

    trigger(fixture).click();
    await settle(fixture);

    expect(service.loadChildren).toHaveBeenCalledWith(null);
    expect(options(fixture).map((option) => option.textContent?.trim())).toEqual([
      'Elektronik, hat Unterkategorien',
      'Bekleidung & Accessoires, hat Unterkategorien',
    ]);
    expect(trigger(fixture).getAttribute('aria-expanded')).toBe('true');
  });

  it('öffnet eine Ebene und wählt die Oberkategorie über die Kopfzeile', async () => {
    const { fixture, changes } = create();
    trigger(fixture).click();
    await settle(fixture);

    options(fixture)[0].click();
    await settle(fixture);
    expect(service.loadChildren).toHaveBeenCalledWith('el');
    buttonWithText(fixture, '„Elektronik“ auswählen')!.click();
    await settle(fixture);

    expect(changes).toEqual(['el']);
    expect(trigger(fixture).textContent).toContain('Elektronik');
    expect(element(fixture).querySelector('[role="dialog"]')).toBeNull();
  });

  it('wählt ein Blatt per Tastatur und zeigt den vollen Pfad', async () => {
    const { fixture, changes } = create();
    trigger(fixture).click();
    await settle(fixture);

    key(fixture, 'Enter');
    await settle(fixture);
    key(fixture, 'ArrowRight');
    await settle(fixture);
    key(fixture, 'Enter');
    await settle(fixture);

    expect(changes).toEqual(['el-6-6']);
    expect(trigger(fixture).textContent?.replace(/\s+/gu, ' ')).toContain(
      'Elektronik › Computer › Laptops',
    );
  });

  it('geht mit Pfeil links zurück und schließt mit Escape', async () => {
    const { fixture } = create();
    trigger(fixture).click();
    await settle(fixture);
    key(fixture, 'Enter');
    await settle(fixture);
    expect(buttonWithText(fixture, '„Elektronik“ auswählen')).toBeDefined();

    key(fixture, 'ArrowLeft');
    await settle(fixture);
    expect(buttonWithText(fixture, 'auswählen')).toBeUndefined();

    key(fixture, 'Escape');
    await settle(fixture);
    expect(element(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(
      document.activeElement === trigger(fixture) || !document.body.contains(trigger(fixture)),
    ).toBe(true);
  });

  it('sucht nach kurzer Pause und zeigt Name und Pfad', async () => {
    vi.useFakeTimers();
    try {
      const { fixture } = create();
      trigger(fixture).click();
      await settle(fixture);

      search(fixture).value = 'lap';
      search(fixture).dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
      await settle(fixture);

      expect(service.search).toHaveBeenCalledWith('lap');
      expect(options(fixture)[0].textContent?.replace(/\s+/gu, ' ')).toContain(
        'Laptops Elektronik › Computer › Laptops',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('meldet mehr als 50 Treffer', async () => {
    service.search.mockResolvedValueOnce({ categories: [laptops], hasMore: true });
    const { fixture } = create({ suggestion: 'Laptop' });

    trigger(fixture).click();
    await settle(fixture);

    expect(search(fixture).value).toBe('Laptop');
    expect(element(fixture).textContent).toContain('Mehr als 50 Treffer – bitte genauer suchen.');
  });

  it('zeigt einen Fehler mit Erneut versuchen', async () => {
    service.loadChildren.mockRejectedValueOnce(new Error('offline'));
    const { fixture } = create();
    trigger(fixture).click();
    await settle(fixture);

    expect(element(fixture).querySelector('[role="alert"]')?.textContent).toContain(
      'Kategorien konnten nicht geladen werden.',
    );
    buttonWithText(fixture, 'Erneut versuchen')!.click();
    await settle(fixture);
    expect(options(fixture)).toHaveLength(2);
  });

  it('lädt einen vorhandenen Wert und leert ihn über „Kategorie entfernen“', async () => {
    const { fixture, changes } = create({ value: 'el-6-6' });
    await settle(fixture);
    expect(trigger(fixture).textContent?.replace(/\s+/gu, ' ')).toContain(
      'Elektronik › Computer › Laptops',
    );

    element(fixture)
      .querySelector<HTMLButtonElement>('[aria-label="Kategorie entfernen"]')!
      .click();
    await settle(fixture);

    expect(changes).toEqual([null]);
    expect(trigger(fixture).textContent).toContain('Kategorie wählen');
  });

  it('weist auf eine veraltete Kategorie hin', async () => {
    service.getById.mockResolvedValueOnce({ ...laptops, isDeprecated: true });
    const { fixture } = create({ value: 'el-6-6' });
    await settle(fixture);

    expect(element(fixture).textContent).toContain('Kategorie wird nicht mehr geführt.');
  });

  it.each([
    ['geschlossen', false],
    ['geöffnet', true],
  ] as const)('besteht AXE im Zustand %s', async (_state, open) => {
    const { fixture } = create({ value: 'el-6-6' });
    await settle(fixture);
    if (open) {
      trigger(fixture).click();
      await settle(fixture);
    }

    const result = await axe.run(element(fixture), {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run --project=angular src/app/shared/components/category-picker/category-picker.component.angular.spec.ts`
Expected: FAIL mit `Failed to resolve import "./category-picker.component"`

- [ ] **Step 3: Komponente schreiben**

`src/app/shared/components/category-picker/category-picker.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  LucideChevronDown,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideX,
} from '@lucide/angular';
import { ProductCategory, categoryPathParts } from '../../../core/models/product-category.models';
import { ProductCategoryService } from '../../../core/services/product-category.service';

type PickerStatus = 'idle' | 'loading' | 'ready' | 'error';

const SEARCH_DEBOUNCE_MS = 200;
const MIN_SEARCH_LENGTH = 2;
const PANEL_MIN_WIDTH = 320;
const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 6;

let nextCategoryPickerId = 0;

/**
 * Auswahl einer Shopify-Kategorie. Ebenen mit Unterkategorien werden per Klick
 * geöffnet; die Oberkategorie selbst wählt man über die Kopfzeile. So gibt es keine
 * verschachtelten Schaltflächen in der Liste.
 */
@Component({
  selector: 'app-category-picker',
  imports: [LucideDynamicIcon],
  templateUrl: './category-picker.component.html',
  styleUrl: './category-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CategoryPickerComponent),
      multi: true,
    },
  ],
  host: { class: 'block w-full', '(document:click)': 'onDocumentClick($event)' },
})
export class CategoryPickerComponent implements ControlValueAccessor {
  private readonly categories = inject(ProductCategoryService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly instanceId = ++nextCategoryPickerId;
  protected readonly supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
  protected readonly panelPosition = signal({ left: 0, top: 0, width: PANEL_MIN_WIDTH });

  readonly label = input('Kategorie');
  readonly labelHidden = input(false);
  readonly placeholder = input('Kategorie wählen');
  readonly suggestion = input<string | null>(null);
  readonly helpText = input('');
  readonly id = input('');

  readonly value = signal<string | null>(null);
  readonly selected = signal<ProductCategory | null>(null);
  readonly isOpen = signal(false);
  readonly isDisabled = signal(false);
  readonly status = signal<PickerStatus>('idle');
  readonly searchTerm = signal('');
  readonly trail = signal<readonly ProductCategory[]>([]);
  readonly entries = signal<readonly ProductCategory[]>([]);
  readonly hasMore = signal(false);
  readonly activeIndex = signal(-1);

  readonly fieldId = computed(() => this.id() || `category-picker-${this.instanceId}`);
  readonly listboxId = computed(() => `${this.fieldId()}-listbox`);
  readonly isSearching = computed(() => this.searchTerm().trim().length >= MIN_SEARCH_LENGTH);
  readonly currentParent = computed(() => this.trail().at(-1) ?? null);
  readonly selectedPath = computed(() => {
    const category = this.selected();
    return category ? categoryPathParts(category.fullName).join(' › ') : '';
  });
  readonly parentPath = computed(() => {
    const parent = this.currentParent();
    return parent ? categoryPathParts(parent.fullName).join(' › ') : '';
  });
  readonly activeDescendantId = computed(() => {
    const index = this.activeIndex();
    return this.isOpen() && this.status() === 'ready' && index >= 0 && index < this.entries().length
      ? this.optionId(index)
      : null;
  });

  protected readonly chevronDownIcon = LucideChevronDown;
  protected readonly chevronLeftIcon = LucideChevronLeft;
  protected readonly chevronRightIcon = LucideChevronRight;
  protected readonly clearIcon = LucideX;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private requestToken = 0;
  private valueToken = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const closeOnViewportChange = (event: Event) => {
      if (this.panel()?.nativeElement.contains(event.target as Node)) return;
      if (this.isOpen()) this.close(false);
    };
    document.addEventListener('scroll', closeOnViewportChange, true);
    window.addEventListener('resize', closeOnViewportChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', closeOnViewportChange, true);
      window.removeEventListener('resize', closeOnViewportChange);
      this.clearSearchTimer();
    });
  }

  writeValue(value: unknown): void {
    const id = typeof value === 'string' && value ? value : null;
    const token = ++this.valueToken;
    this.value.set(id);
    if (!id) {
      this.selected.set(null);
      return;
    }
    if (this.selected()?.id === id) return;
    this.selected.set(null);
    this.categories.getById(id).then(
      (category) => {
        if (token === this.valueToken) this.selected.set(category);
      },
      () => {
        if (token === this.valueToken) this.selected.set(null);
      },
    );
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    if (isDisabled) this.close(false);
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  open(): void {
    if (this.isDisabled() || this.isOpen()) return;
    this.isOpen.set(true);
    this.onTouched();
    const suggestion = this.suggestion()?.trim() ?? '';
    this.searchTerm.set(suggestion);
    if (suggestion.length >= MIN_SEARCH_LENGTH) void this.runSearch(suggestion);
    else void this.showLevel(this.trail());
    afterNextRender(() => this.positionPanel(), { injector: this.injector });
  }

  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.clearSearchTimer();
    this.requestToken++;
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    if (!restoreFocus) return;
    const trigger = this.trigger()?.nativeElement;
    queueMicrotask(() => trigger?.focus());
  }

  clear(): void {
    if (this.isDisabled()) return;
    this.valueToken++;
    this.value.set(null);
    this.selected.set(null);
    this.onChange(null);
    this.onTouched();
    const trigger = this.trigger()?.nativeElement;
    queueMicrotask(() => trigger?.focus());
  }

  select(category: ProductCategory): void {
    this.valueToken++;
    this.value.set(category.id);
    this.selected.set(category);
    this.onChange(category.id);
    this.close();
  }

  activate(category: ProductCategory): void {
    if (!this.isSearching() && !category.isLeaf) void this.showLevel([...this.trail(), category]);
    else this.select(category);
  }

  back(): void {
    if (this.isSearching() || this.trail().length === 0) return;
    void this.showLevel(this.trail().slice(0, -1));
    const search = this.searchInput()?.nativeElement;
    queueMicrotask(() => search?.focus());
  }

  retry(): void {
    if (this.isSearching()) void this.runSearch(this.searchTerm());
    else void this.showLevel(this.trail());
  }

  onSearchInput(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.searchTerm.set(term);
    this.clearSearchTimer();
    if (term.trim().length < MIN_SEARCH_LENGTH) {
      void this.showLevel(this.trail());
      return;
    }
    this.status.set('loading');
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.runSearch(term);
    }, SEARCH_DEBOUNCE_MS);
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open();
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const active = this.entries()[this.activeIndex()];
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1);
        break;
      case 'Enter':
        event.preventDefault();
        if (active && this.status() === 'ready') this.activate(active);
        break;
      case 'ArrowRight':
        if (!this.isSearching() && active && !active.isLeaf) {
          event.preventDefault();
          void this.showLevel([...this.trail(), active]);
        }
        break;
      case 'ArrowLeft':
        if (!this.searchTerm() && this.trail().length > 0) {
          event.preventDefault();
          this.back();
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target as Node))
      this.close(false);
  }

  optionId(index: number): string {
    return `${this.listboxId()}-option-${index}`;
  }

  displayPath(category: ProductCategory): string {
    return categoryPathParts(category.fullName).join(' › ');
  }

  private moveActive(step: number): void {
    const count = this.entries().length;
    if (count === 0 || this.status() !== 'ready') return;
    const next = Math.min(Math.max(this.activeIndex() + step, 0), count - 1);
    this.activeIndex.set(next);
    afterNextRender(
      () => document.getElementById(this.optionId(next))?.scrollIntoView?.({ block: 'nearest' }),
      { injector: this.injector },
    );
  }

  private async showLevel(trail: readonly ProductCategory[]): Promise<void> {
    const token = ++this.requestToken;
    this.trail.set(trail);
    this.hasMore.set(false);
    this.status.set('loading');
    try {
      const entries = await this.categories.loadChildren(trail.at(-1)?.id ?? null);
      if (token !== this.requestToken) return;
      this.entries.set(entries);
      this.activeIndex.set(entries.length ? 0 : -1);
      this.status.set('ready');
    } catch {
      if (token !== this.requestToken) return;
      this.entries.set([]);
      this.activeIndex.set(-1);
      this.status.set('error');
    }
  }

  private async runSearch(term: string): Promise<void> {
    const token = ++this.requestToken;
    this.status.set('loading');
    try {
      const result = await this.categories.search(term);
      if (token !== this.requestToken) return;
      this.entries.set(result.categories);
      this.hasMore.set(result.hasMore);
      this.activeIndex.set(result.categories.length ? 0 : -1);
      this.status.set('ready');
    } catch {
      if (token !== this.requestToken) return;
      this.entries.set([]);
      this.hasMore.set(false);
      this.activeIndex.set(-1);
      this.status.set('error');
    }
  }

  private positionPanel(): void {
    const panel = this.panel()?.nativeElement;
    const trigger = this.trigger()?.nativeElement;
    if (!this.isOpen() || !panel || !trigger) return;
    if (this.supportsPopover) {
      // Die oberste Ebene entkommt dem Überlauf von Dialogen und Karten.
      panel.showPopover();
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(
        Math.max(rect.width, PANEL_MIN_WIDTH),
        window.innerWidth - VIEWPORT_MARGIN * 2,
      );
      const height = panel.offsetHeight;
      const below = rect.bottom + PANEL_GAP;
      const above = rect.top - PANEL_GAP - height;
      const top =
        below + height > window.innerHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
          ? above
          : below;
      this.panelPosition.set({
        left: Math.max(
          VIEWPORT_MARGIN,
          Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
        ),
        top,
        width,
      });
    }
    this.searchInput()?.nativeElement.focus();
  }

  private clearSearchTimer(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = null;
  }
}
```

`src/app/shared/components/category-picker/category-picker.component.scss`:

```scss
:host {
  display: block;
}

// Wie app-custom-select: als Popover fest am Fenster ausgerichtet.
.category-picker-panel[popover] {
  position: fixed;
  inset: auto;
  margin: 0;
  max-width: none;
}
```

`src/app/shared/components/category-picker/category-picker.component.html`:

```html
<div class="w-full space-y-1.5">
  @if (label()) {
  <span
    [id]="fieldId() + '-label'"
    class="block text-[13px] font-semibold text-fb-text-primary"
    [class.sr-only]="labelHidden()"
    >{{ label() }}</span
  >
  }

  <div class="relative">
    <button
      #trigger
      type="button"
      [id]="fieldId()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-labelledby]="(label() ? fieldId() + '-label ' : '') + fieldId() + '-value'"
      [attr.aria-describedby]="helpText() ? fieldId() + '-help' : null"
      [disabled]="isDisabled()"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
      class="linear-input flex min-h-8 w-full items-center gap-2 rounded-lg py-1.5 pl-3 pr-16 text-left text-[13px] outline-none transition-colors focus-visible:border-fb-primary focus-visible:ring-2 focus-visible:ring-fb-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
      [class.border-fb-primary]="isOpen()"
    >
      <span [id]="fieldId() + '-value'" class="min-w-0 flex-1 truncate">
        @if (selected()) { {{ selectedPath() }} } @else if (value()) {
        <span class="text-fb-text-muted">Kategorie wird geladen …</span>
        } @else {
        <span class="text-fb-text-muted">{{ placeholder() }}</span>
        }
      </span>
    </button>
    <svg
      [lucideIcon]="chevronDownIcon"
      class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fb-text-muted"
      aria-hidden="true"
    ></svg>
    @if (value() && !isDisabled()) {
    <button
      type="button"
      (click)="clear()"
      aria-label="Kategorie entfernen"
      class="absolute right-8 top-1/2 -translate-y-1/2 rounded-md p-1 text-fb-text-muted transition-colors hover:bg-fb-surface-hover hover:text-fb-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fb-primary/50"
    >
      <svg [lucideIcon]="clearIcon" class="size-3.5" aria-hidden="true"></svg>
    </button>
    } @if (isOpen()) {
    <div
      #panel
      role="dialog"
      [attr.aria-label]="label() || 'Kategorie wählen'"
      [attr.popover]="supportsPopover ? 'manual' : null"
      class="category-picker-panel fb-popover-enter absolute left-0 top-full z-50 mt-1.5 w-full min-w-[20rem] rounded-xl border border-fb-border bg-fb-surface p-2 shadow-lg"
      [style.left.px]="supportsPopover ? panelPosition().left : null"
      [style.top.px]="supportsPopover ? panelPosition().top : null"
      [style.width.px]="supportsPopover ? panelPosition().width : null"
    >
      <input
        #searchInput
        type="search"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-label="Kategorie suchen"
        placeholder="Kategorie suchen"
        [attr.aria-controls]="listboxId()"
        [attr.aria-activedescendant]="activeDescendantId()"
        [value]="searchTerm()"
        (input)="onSearchInput($event)"
        (keydown)="onSearchKeydown($event)"
        class="linear-input min-h-8 w-full rounded-lg px-3 py-1.5 text-[13px] outline-none focus-visible:border-fb-primary focus-visible:ring-2 focus-visible:ring-fb-primary/50"
      />

      @if (!isSearching() && currentParent(); as parent) {
      <div class="mt-2 flex items-center justify-between gap-2 border-b border-fb-line pb-2">
        <button
          type="button"
          (click)="back()"
          class="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-fb-text-secondary transition-colors hover:bg-fb-surface-alt hover:text-fb-text-primary"
        >
          <svg [lucideIcon]="chevronLeftIcon" class="size-4" aria-hidden="true"></svg>
          Zurück
        </button>
        <button
          type="button"
          (click)="select(parent)"
          class="min-h-8 truncate rounded-lg px-2 text-[13px] font-semibold text-fb-primary transition-colors hover:bg-fb-primary-subtle"
        >
          „{{ parent.name }}“ auswählen
        </button>
      </div>
      <p class="mt-1 truncate px-2 text-xs text-fb-text-muted">{{ parentPath() }}</p>
      }

      <div class="category-picker-list mt-2 max-h-72 overflow-y-auto">
        @switch (status()) { @case ('loading') {
        <p class="px-2 py-3 text-[13px] text-fb-text-muted" role="status">
          Kategorien werden geladen …
        </p>
        } @case ('error') {
        <div class="space-y-2 px-2 py-3" role="alert">
          <p class="text-[13px] text-fb-text-primary">Kategorien konnten nicht geladen werden.</p>
          <button
            type="button"
            (click)="retry()"
            class="min-h-8 rounded-lg px-2 text-[13px] font-semibold text-fb-primary transition-colors hover:bg-fb-primary-subtle"
          >
            Erneut versuchen
          </button>
        </div>
        } @case ('ready') { @if (entries().length === 0) {
        <p class="px-2 py-3 text-[13px] text-fb-text-muted" role="status">
          {{ isSearching() ? 'Keine passende Kategorie gefunden.' : 'Keine Unterkategorien
          vorhanden.' }}
        </p>
        } } }

        <div
          role="listbox"
          [id]="listboxId()"
          [attr.aria-label]="isSearching() ? 'Suchtreffer' : 'Kategorien'"
          class="space-y-0.5"
          [hidden]="status() !== 'ready' || entries().length === 0"
        >
          @for (category of entries(); track category.id; let index = $index) {
          <button
            type="button"
            role="option"
            tabindex="-1"
            [id]="optionId(index)"
            [attr.aria-selected]="value() === category.id"
            (click)="activate(category)"
            (mousemove)="activeIndex.set(index)"
            class="flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-fb-text-primary transition-colors"
            [class.bg-fb-surface-alt]="activeIndex() === index"
            [class.text-fb-primary]="value() === category.id"
            [class.font-semibold]="value() === category.id"
          >
            <span class="min-w-0">
              <span class="block truncate">{{ category.name }}</span>
              @if (isSearching()) {
              <span class="block truncate text-xs text-fb-text-muted"
                >{{ displayPath(category) }}</span
              >
              }
            </span>
            @if (!isSearching() && !category.isLeaf) {
            <span class="sr-only">, hat Unterkategorien</span>
            <svg
              [lucideIcon]="chevronRightIcon"
              class="size-4 shrink-0 text-fb-text-muted"
              aria-hidden="true"
            ></svg>
            }
          </button>
          }
        </div>

        @if (status() === 'ready' && hasMore()) {
        <p class="px-2 pt-2 text-xs text-fb-text-muted">
          Mehr als 50 Treffer – bitte genauer suchen.
        </p>
        }
      </div>
    </div>
    }
  </div>

  @if (selected()?.isDeprecated) {
  <p class="text-xs text-fb-text-muted">Kategorie wird nicht mehr geführt.</p>
  } @if (helpText()) {
  <p [id]="fieldId() + '-help'" class="text-xs leading-relaxed text-fb-text-muted">
    {{ helpText() }}
  </p>
  }
</div>
```

Der Test „Hauptbereiche“ vergleicht `textContent` inklusive des Screenreader-Zusatzes „, hat Unterkategorien“. Im Template stehen Name und Zusatz ohne Leerzeichen dazwischen; `trim()` im Test entfernt nur Ränder. Liefert der Test Leerzeichen zwischen Name und Komma, im Test `replace(/\s+,/gu, ',')` ergänzen, nicht das Template ändern.

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `npx vitest run --project=angular src/app/shared/components/category-picker/category-picker.component.angular.spec.ts`
Expected: PASS, 11 Tests (10 `it` + 2 AXE-Fälle aus `it.each` = 11 Ergebnisse, weil `it.each` einen Test ersetzt).

- [ ] **Step 5: Lint, Format, Commit**

```bash
npx prettier --write src/app/shared/components/category-picker
npx eslint src/app/shared/components/category-picker > /tmp/lint.log 2>&1; echo $?
git add src/app/shared/components/category-picker
git commit -m "feat(ui): add category picker for the Shopify taxonomy" -m "Browsing opens levels on click and selects a parent through the header, which avoids nested buttons inside the listbox and keeps AXE and template accessibility lint green. Search waits 200 ms, shows name and full path and flags more than 50 hits. Loading, empty and error states are separate, and stale responses are ignored via request tokens."
```

Expected: `0`.

---

### Task 7: Marken-Wähler `app-brand-picker`

**Files:**

- Create: `src/app/shared/components/brand-picker/brand-picker.component.ts`
- Create: `src/app/shared/components/brand-picker/brand-picker.component.html`
- Create: `src/app/shared/components/brand-picker/brand-picker.component.scss`
- Create: `src/app/shared/components/brand-picker/brand-picker.component.angular.spec.ts`

**Interfaces:**

- Consumes: `BrandService.brands/loading/loadError/ensureLoaded/reload/search/findByName/findById/create` (Task 5), `Brand` (Task 4).
- Produces: `<app-brand-picker>` als Formularfeld (Wert `string | null`) mit Eingängen `label: string` (Standard „Marke“), `labelHidden: boolean`, `placeholder: string`, `suggestion: string | null`, `helpText: string`, `id: string`.

- [ ] **Step 1: Failing Komponententest schreiben**

`src/app/shared/components/brand-picker/brand-picker.component.angular.spec.ts`:

```ts
import '@angular/compiler';
import { computed, signal, ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Brand, brandNameKey } from '../../../core/models/product-category.models';
import { BrandService } from '../../../core/services/brand.service';
import { BrandPickerComponent } from './brand-picker.component';

interface ComponentMetadata {
  ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
}

function createBrandServiceStub(initial: Brand[]) {
  const brands = signal<readonly Brand[]>(initial);
  const stub = {
    brands: computed(() => brands()),
    loading: signal(false),
    loadError: signal<Error | null>(null),
    ensureLoaded: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
    search: (term: string) =>
      brands().filter((brand) => brandNameKey(brand.name).includes(brandNameKey(term))),
    findByName: (name: string) =>
      brands().find((brand) => brandNameKey(brand.name) === brandNameKey(name)) ?? null,
    findById: (id: string) => brands().find((brand) => brand.id === id) ?? null,
    create: vi.fn(async (name: string) => {
      const brand = { id: `new-${name}`, workspaceId: 'ws-1', name: name.trim() };
      brands.update((list) => [...list, brand]);
      return { data: brand as Brand | null, error: null as Error | null };
    }),
  };
  return stub;
}

const inputNames = ['label', 'labelHidden', 'placeholder', 'suggestion', 'helpText', 'id'];
let restoreMetadata = (): void => undefined;
let service: ReturnType<typeof createBrandServiceStub>;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

beforeEach(() => {
  service = createBrandServiceStub([
    { id: 'b1', workspaceId: 'ws-1', name: 'Bosch' },
    { id: 'b2', workspaceId: 'ws-1', name: 'Sony' },
  ]);
  const metadata = (BrandPickerComponent as unknown as ComponentMetadata).ɵcmp;
  const inputs = metadata.inputs;
  const declared = metadata.declaredInputs;
  metadata.inputs = { ...inputs };
  metadata.declaredInputs = { ...declared };
  for (const name of inputNames) {
    metadata.inputs[name] = [name, 1, null];
    metadata.declaredInputs[name] = name;
  }
  restoreMetadata = () => {
    metadata.inputs = inputs;
    metadata.declaredInputs = declared;
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BrandPickerComponent],
    providers: [{ provide: BrandService, useValue: service }],
  });
});

afterEach(() => {
  try {
    TestBed.resetTestingModule();
  } finally {
    restoreMetadata();
  }
});

async function settle(fixture: ComponentFixture<BrandPickerComponent>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
}

function create(config: { value?: string | null; suggestion?: string } = {}) {
  const fixture = TestBed.createComponent(BrandPickerComponent);
  fixture.componentRef.setInput('id', 'item-brand');
  if (config.suggestion) fixture.componentRef.setInput('suggestion', config.suggestion);
  const changes: (string | null)[] = [];
  fixture.componentInstance.registerOnChange((value) => changes.push(value));
  fixture.componentInstance.writeValue(config.value ?? null);
  fixture.detectChanges();
  return { fixture, changes };
}

const element = (fixture: ComponentFixture<BrandPickerComponent>) =>
  fixture.nativeElement as HTMLElement;
const field = (fixture: ComponentFixture<BrandPickerComponent>) =>
  element(fixture).querySelector<HTMLInputElement>('#item-brand')!;
const options = (fixture: ComponentFixture<BrandPickerComponent>) =>
  Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('[role="option"]'));

function type(fixture: ComponentFixture<BrandPickerComponent>, text: string): void {
  field(fixture).value = text;
  field(fixture).dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function key(fixture: ComponentFixture<BrandPickerComponent>, name: string): void {
  field(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  fixture.detectChanges();
}

describe('BrandPickerComponent', () => {
  it('filtert beim Tippen und wählt per Tastatur', async () => {
    const { fixture, changes } = create();

    type(fixture, 'bos');
    await settle(fixture);
    expect(options(fixture).map((option) => option.textContent?.trim())).toEqual([
      'Bosch',
      '„bos“ als neue Marke anlegen',
    ]);

    key(fixture, 'Enter');
    await settle(fixture);

    expect(changes).toEqual(['b1']);
    expect(field(fixture).value).toBe('Bosch');
    expect(field(fixture).getAttribute('aria-expanded')).toBe('false');
  });

  it('bietet bei exakter Übereinstimmung kein Anlegen an', async () => {
    const { fixture } = create();

    type(fixture, 'SONY');
    await settle(fixture);

    expect(options(fixture).map((option) => option.textContent?.trim())).toEqual(['Sony']);
  });

  it('legt eine neue Marke an und wählt sie aus', async () => {
    const { fixture, changes } = create();

    type(fixture, 'Makita');
    await settle(fixture);
    options(fixture).at(-1)!.click();
    await settle(fixture);

    expect(service.create).toHaveBeenCalledWith('Makita');
    expect(changes).toEqual(['new-Makita']);
    expect(field(fixture).value).toBe('Makita');
  });

  it('zeigt einen Fehler beim Anlegen unter dem Feld und behält den Text', async () => {
    service.create.mockResolvedValueOnce({ data: null, error: new Error('Speichern gesperrt') });
    const { fixture, changes } = create();

    type(fixture, 'Makita');
    await settle(fixture);
    options(fixture).at(-1)!.click();
    await settle(fixture);

    expect(element(fixture).querySelector('[role="alert"]')?.textContent).toContain(
      'Speichern gesperrt',
    );
    expect(field(fixture).value).toBe('Makita');
    expect(changes).toEqual([]);
  });

  it('entfernt die Auswahl beim Weitertippen und weist auf nicht übernommenen Text hin', async () => {
    const { fixture, changes } = create({ value: 'b1' });
    await settle(fixture);
    expect(field(fixture).value).toBe('Bosch');

    type(fixture, 'Boschx');
    key(fixture, 'Escape');
    await settle(fixture);

    expect(changes).toEqual([null]);
    expect(element(fixture).textContent).toContain(
      'Noch nicht übernommen – Marke auswählen oder neu anlegen.',
    );
  });

  it('wählt einen passenden Vorschlag automatisch', async () => {
    const { fixture, changes } = create({ suggestion: 'sony' });
    await settle(fixture);

    expect(changes).toEqual(['b2']);
    expect(field(fixture).value).toBe('Sony');
  });

  it('übernimmt einen unbekannten Vorschlag nur als Text', async () => {
    const { fixture, changes } = create({ suggestion: 'Anker' });
    await settle(fixture);

    expect(changes).toEqual([]);
    expect(field(fixture).value).toBe('Anker');
  });

  it('leert die Auswahl über „Marke entfernen“', async () => {
    const { fixture, changes } = create({ value: 'b2' });
    await settle(fixture);

    element(fixture).querySelector<HTMLButtonElement>('[aria-label="Marke entfernen"]')!.click();
    await settle(fixture);

    expect(changes).toEqual([null]);
    expect(field(fixture).value).toBe('');
  });

  it('zeigt einen Ladefehler mit Erneut versuchen', async () => {
    service.loadError.set(new Error('offline'));
    const { fixture } = create();

    type(fixture, 'b');
    await settle(fixture);
    const retry = Array.from(element(fixture).querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Erneut versuchen'),
    );
    retry!.click();

    expect(service.reload).toHaveBeenCalled();
  });

  it.each([
    ['geschlossen', false],
    ['geöffnet', true],
  ] as const)('besteht AXE im Zustand %s', async (_state, open) => {
    const { fixture } = create({ value: 'b1' });
    await settle(fixture);
    if (open) {
      type(fixture, 'o');
      await settle(fixture);
    }

    const result = await axe.run(element(fixture), {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run --project=angular src/app/shared/components/brand-picker/brand-picker.component.angular.spec.ts`
Expected: FAIL mit `Failed to resolve import "./brand-picker.component"`

- [ ] **Step 3: Komponente schreiben**

`src/app/shared/components/brand-picker/brand-picker.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideDynamicIcon, LucidePlus, LucideX } from '@lucide/angular';
import { Brand } from '../../../core/models/product-category.models';
import { BrandService } from '../../../core/services/brand.service';

const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 6;

let nextBrandPickerId = 0;

/** Auswahl einer Marke des Workspace; unbekannte Marken lassen sich direkt anlegen. */
@Component({
  selector: 'app-brand-picker',
  imports: [LucideDynamicIcon],
  templateUrl: './brand-picker.component.html',
  styleUrl: './brand-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BrandPickerComponent),
      multi: true,
    },
  ],
  host: { class: 'block w-full', '(document:click)': 'onDocumentClick($event)' },
})
export class BrandPickerComponent implements ControlValueAccessor {
  protected readonly brandService = inject(BrandService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fieldElement = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly instanceId = ++nextBrandPickerId;
  protected readonly supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
  protected readonly panelPosition = signal({ left: 0, top: 0, width: 240 });

  readonly label = input('Marke');
  readonly labelHidden = input(false);
  readonly placeholder = input('Marke suchen oder anlegen');
  readonly suggestion = input<string | null>(null);
  readonly helpText = input('');
  readonly id = input('');

  readonly value = signal<string | null>(null);
  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly isDisabled = signal(false);
  readonly activeIndex = signal(-1);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  readonly fieldId = computed(() => this.id() || `brand-picker-${this.instanceId}`);
  readonly listboxId = computed(() => `${this.fieldId()}-listbox`);
  readonly matches = computed(() => this.brandService.search(this.query()));
  readonly trimmedQuery = computed(() => this.query().trim());
  readonly canCreate = computed(
    () => !!this.trimmedQuery() && !this.brandService.findByName(this.trimmedQuery()),
  );
  readonly optionCount = computed(() => this.matches().length + (this.canCreate() ? 1 : 0));
  readonly createIndex = computed(() => (this.canCreate() ? this.matches().length : -1));
  readonly showPendingHint = computed(
    () => !this.isOpen() && !!this.trimmedQuery() && !this.value() && !this.createError(),
  );
  readonly activeDescendantId = computed(() => {
    const index = this.activeIndex();
    return this.isOpen() && index >= 0 && index < this.optionCount() ? this.optionId(index) : null;
  });

  protected readonly clearIcon = LucideX;
  protected readonly plusIcon = LucidePlus;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private valueToken = 0;

  constructor() {
    effect(() => {
      const suggestion = this.suggestion()?.trim();
      if (suggestion) untracked(() => void this.applySuggestion(suggestion));
    });
    const closeOnViewportChange = (event: Event) => {
      if (this.panel()?.nativeElement.contains(event.target as Node)) return;
      if (this.isOpen()) this.close();
    };
    document.addEventListener('scroll', closeOnViewportChange, true);
    window.addEventListener('resize', closeOnViewportChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', closeOnViewportChange, true);
      window.removeEventListener('resize', closeOnViewportChange);
    });
  }

  writeValue(value: unknown): void {
    const id = typeof value === 'string' && value ? value : null;
    const token = ++this.valueToken;
    this.value.set(id);
    this.createError.set(null);
    if (!id) {
      this.query.set('');
      return;
    }
    const known = this.brandService.findById(id);
    if (known) {
      this.query.set(known.name);
      return;
    }
    void this.brandService.ensureLoaded().then(() => {
      if (token === this.valueToken) this.query.set(this.brandService.findById(id)?.name ?? '');
    });
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    if (isDisabled) this.close();
  }

  onFocus(): void {
    void this.brandService.ensureLoaded();
  }

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.createError.set(null);
    if (this.value()) {
      this.valueToken++;
      this.value.set(null);
      this.onChange(null);
    }
    this.openList();
  }

  openList(): void {
    if (this.isDisabled()) return;
    void this.brandService.ensureLoaded();
    if (!this.isOpen()) {
      this.isOpen.set(true);
      afterNextRender(() => this.positionPanel(), { injector: this.injector });
    }
    this.activeIndex.set(this.optionCount() > 0 ? 0 : -1);
  }

  close(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    this.onTouched();
  }

  choose(brand: Brand): void {
    this.valueToken++;
    this.value.set(brand.id);
    this.query.set(brand.name);
    this.createError.set(null);
    this.onChange(brand.id);
    this.close();
  }

  async createFromQuery(): Promise<void> {
    const name = this.trimmedQuery();
    if (!name || this.creating()) return;
    this.creating.set(true);
    this.createError.set(null);
    const result = await this.brandService.create(name);
    this.creating.set(false);
    if (result.error || !result.data) {
      this.createError.set(result.error?.message ?? 'Die Marke konnte nicht angelegt werden.');
      this.close();
      return;
    }
    this.choose(result.data);
  }

  activateIndex(index: number): void {
    if (index === this.createIndex()) void this.createFromQuery();
    else {
      const brand = this.matches()[index];
      if (brand) this.choose(brand);
    }
  }

  clear(): void {
    if (this.isDisabled()) return;
    this.valueToken++;
    this.value.set(null);
    this.query.set('');
    this.createError.set(null);
    this.onChange(null);
    this.onTouched();
    const field = this.fieldElement()?.nativeElement;
    queueMicrotask(() => field?.focus());
  }

  retryLoad(): void {
    void this.brandService.reload();
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.optionCount();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) this.openList();
        else if (count) this.activeIndex.set(Math.min(this.activeIndex() + 1, count - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
        break;
      case 'Enter':
        if (this.isOpen() && this.activeIndex() >= 0) {
          event.preventDefault();
          this.activateIndex(this.activeIndex());
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.close();
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target as Node))
      this.close();
  }

  optionId(index: number): string {
    return `${this.listboxId()}-option-${index}`;
  }

  private async applySuggestion(suggestion: string): Promise<void> {
    if (this.value()) return;
    await this.brandService.ensureLoaded();
    if (this.value()) return;
    const match = this.brandService.findByName(suggestion);
    if (match) this.choose(match);
    else this.query.set(suggestion);
  }

  private positionPanel(): void {
    const panel = this.panel()?.nativeElement;
    const field = this.fieldElement()?.nativeElement;
    if (!this.isOpen() || !panel || !field || !this.supportsPopover) return;
    panel.showPopover();
    const rect = field.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - VIEWPORT_MARGIN * 2);
    const height = panel.offsetHeight;
    const below = rect.bottom + PANEL_GAP;
    const above = rect.top - PANEL_GAP - height;
    this.panelPosition.set({
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
      ),
      top:
        below + height > window.innerHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
          ? above
          : below,
      width,
    });
  }
}
```

`src/app/shared/components/brand-picker/brand-picker.component.scss`:

```scss
:host {
  display: block;
}

.brand-picker-panel[popover] {
  position: fixed;
  inset: auto;
  margin: 0;
  max-width: none;
}
```

`src/app/shared/components/brand-picker/brand-picker.component.html`:

```html
<div class="w-full space-y-1.5">
  @if (label()) {
  <label
    [for]="fieldId()"
    class="block text-[13px] font-semibold text-fb-text-primary"
    [class.sr-only]="labelHidden()"
    >{{ label() }}</label
  >
  }

  <div class="relative">
    <input
      #field
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      [id]="fieldId()"
      [attr.aria-label]="label() ? null : 'Marke'"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-controls]="isOpen() ? listboxId() : null"
      [attr.aria-activedescendant]="activeDescendantId()"
      [attr.aria-invalid]="createError() ? 'true' : null"
      [attr.aria-describedby]="
        createError() ? fieldId() + '-error' : showPendingHint() ? fieldId() + '-pending' : helpText() ? fieldId() + '-help' : null
      "
      [placeholder]="placeholder()"
      [value]="query()"
      [disabled]="isDisabled()"
      (focus)="onFocus()"
      (click)="openList()"
      (input)="onInput($event)"
      (keydown)="onKeydown($event)"
      class="linear-input min-h-8 w-full rounded-lg py-1.5 pl-3 pr-8 text-[13px] outline-none transition-colors focus-visible:border-fb-primary focus-visible:ring-2 focus-visible:ring-fb-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
    />
    @if (query() && !isDisabled()) {
    <button
      type="button"
      (click)="clear()"
      aria-label="Marke entfernen"
      class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-fb-text-muted transition-colors hover:bg-fb-surface-hover hover:text-fb-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fb-primary/50"
    >
      <svg [lucideIcon]="clearIcon" class="size-3.5" aria-hidden="true"></svg>
    </button>
    } @if (isOpen()) {
    <div
      #panel
      [attr.popover]="supportsPopover ? 'manual' : null"
      class="brand-picker-panel fb-popover-enter absolute left-0 top-full z-50 mt-1.5 w-full rounded-xl border border-fb-border bg-fb-surface p-1.5 shadow-lg"
      [style.left.px]="supportsPopover ? panelPosition().left : null"
      [style.top.px]="supportsPopover ? panelPosition().top : null"
      [style.width.px]="supportsPopover ? panelPosition().width : null"
    >
      @if (brandService.loadError()) {
      <div class="space-y-2 px-2 py-2" role="alert">
        <p class="text-[13px] text-fb-text-primary">Marken konnten nicht geladen werden.</p>
        <button
          type="button"
          (click)="retryLoad()"
          class="min-h-8 rounded-lg px-2 text-[13px] font-semibold text-fb-primary transition-colors hover:bg-fb-primary-subtle"
        >
          Erneut versuchen
        </button>
      </div>
      } @else if (brandService.loading() && optionCount() === 0) {
      <p class="px-2 py-2 text-[13px] text-fb-text-muted" role="status">Marken werden geladen …</p>
      } @else if (optionCount() === 0) {
      <p class="px-2 py-2 text-[13px] text-fb-text-muted" role="status">
        Noch keine Marken angelegt. Namen eintippen, um eine anzulegen.
      </p>
      }

      <div
        role="listbox"
        [id]="listboxId()"
        aria-label="Marken"
        class="max-h-60 space-y-0.5 overflow-y-auto"
        [hidden]="optionCount() === 0"
      >
        @for (brand of matches(); track brand.id; let index = $index) {
        <button
          type="button"
          role="option"
          tabindex="-1"
          [id]="optionId(index)"
          [attr.aria-selected]="value() === brand.id"
          (click)="choose(brand)"
          (mousemove)="activeIndex.set(index)"
          class="flex min-h-9 w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] text-fb-text-primary transition-colors"
          [class.bg-fb-surface-alt]="activeIndex() === index"
          [class.font-semibold]="value() === brand.id"
        >
          <span class="truncate">{{ brand.name }}</span>
        </button>
        } @if (canCreate()) {
        <button
          type="button"
          role="option"
          tabindex="-1"
          [id]="optionId(createIndex())"
          aria-selected="false"
          [disabled]="creating()"
          (click)="createFromQuery()"
          (mousemove)="activeIndex.set(createIndex())"
          class="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-semibold text-fb-primary transition-colors disabled:opacity-60"
          [class.bg-fb-primary-subtle]="activeIndex() === createIndex()"
        >
          <svg [lucideIcon]="plusIcon" class="size-4 shrink-0" aria-hidden="true"></svg>
          <span class="truncate">„{{ trimmedQuery() }}“ als neue Marke anlegen</span>
        </button>
        }
      </div>
    </div>
    }
  </div>

  @if (createError(); as message) {
  <p [id]="fieldId() + '-error'" class="text-xs text-rose-700 dark:text-rose-400" role="alert">
    {{ message }}
  </p>
  } @else if (showPendingHint()) {
  <p [id]="fieldId() + '-pending'" class="text-xs text-fb-text-muted">
    Noch nicht übernommen – Marke auswählen oder neu anlegen.
  </p>
  } @else if (helpText()) {
  <p [id]="fieldId() + '-help'" class="text-xs leading-relaxed text-fb-text-muted">
    {{ helpText() }}
  </p>
  }
</div>
```

Hinweis zum Test „Anlegen“: Die Beschriftung enthält ein SVG ohne Text; `textContent.trim()` liefert daher genau „„Makita“ als neue Marke anlegen“.

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `npx vitest run --project=angular src/app/shared/components/brand-picker/brand-picker.component.angular.spec.ts`
Expected: PASS, 11 Ergebnisse.

- [ ] **Step 5: Lint, Format, Commit**

```bash
npx prettier --write src/app/shared/components/brand-picker
npx eslint src/app/shared/components/brand-picker > /tmp/lint.log 2>&1; echo $?
git add src/app/shared/components/brand-picker
git commit -m "feat(ui): add brand picker with inline brand creation" -m "Typing filters the workspace brands and offers to create a missing one; creation errors stay below the field with the typed text kept. Typed text that was never selected is flagged instead of being dropped silently. A suggestion from barcode lookup or recognition preselects a matching brand or prefills the text."
```

Expected: `0`.

---

### Task 8: Services schreiben Verweise statt Freitext

**Files:**

- Modify: `src/app/core/services/inventory.service.ts` (`CreateItemPayload`, `createItem`, `updateItem`)
- Modify: `src/app/core/services/catalog.service.ts` (`CreateCatalogProductInput`, `createProduct`, `updateProduct`)
- Modify: `src/app/core/services/purchase.service.ts` (`single_item_category`, `addItemToPurchase`)
- Modify: `src/app/core/services/inventory-persistence.spec.ts`
- Create: `src/app/core/services/catalog-category-brand.spec.ts`

**Interfaces:**

- Consumes: `MockDataStoreService.applyCategoryBrandText` (Task 5), Typen aus Task 3.
- Produces:
  - `CreateItemPayload { …; category_id?: string | null; brand_id?: string | null; brand?: string | null }` (ohne `category`)
  - `CreateCatalogProductInput { …; categoryId?: string | null; brandId?: string | null; brand?: string | null }` (ohne `category`)
  - `CreatePurchasePayload` ohne `single_item_category`; `addItemToPurchase(purchaseId, { title, condition, expected_value?, purchase_line_id? })`

- [ ] **Step 1: Failing Tests für den Artikelspeicher ergänzen**

Am Ende von `src/app/core/services/inventory-persistence.spec.ts` anhängen:

```ts
describe('InventoryService – Kategorie und Marke', () => {
  it('sendet beim Anlegen Verweise und keinen Kategorietext', async () => {
    let insertPayload: Record<string, unknown> | null = null;
    const client = {
      from: () => ({
        insert(payload: Record<string, unknown>) {
          insertPayload = payload;
          return {
            select: () => ({
              single: async () => ({
                data: {
                  ...gespeicherterArtikel,
                  category_id: 'el-6-6',
                  category: 'Elektronik > Computer > Laptops',
                  brand_id: 'brand-1',
                  brand: 'Lenovo',
                },
                error: null,
              }),
            }),
          };
        },
      }),
    };
    const { dienst } = injiziereDienst(client);

    const ergebnis = await dienst.createItem({
      title: 'Laptop',
      condition: 'used',
      category_id: 'el-6-6',
      brand_id: 'brand-1',
      allocated_purchase_cost: 0,
    });

    expect(insertPayload).toMatchObject({ category_id: 'el-6-6', brand_id: 'brand-1' });
    expect(insertPayload).not.toHaveProperty('category');
    expect(ergebnis.data).toMatchObject({
      category: 'Elektronik > Computer > Laptops',
      brand: 'Lenovo',
    });
  });

  it('liest nach geänderter Kategorie oder Marke den Text aus der Datenbank nach', async () => {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null, count: 1 })) }));
    const maybeSingle = vi.fn(async () => ({
      data: {
        category_id: 'el-6-6',
        category: 'Elektronik > Computer > Laptops',
        brand_id: null,
        brand: null,
      },
      error: null,
    }));
    const select = vi.fn(() => ({ eq: () => ({ maybeSingle }) }));
    const { dienst } = injiziereDienst({ from: () => ({ update, select }) });
    dienst.items.set([{ ...gespeicherterArtikel, category: 'Alt', brand: 'Alt' }]);

    const ergebnis = await dienst.updateItem(gespeicherterArtikel.id, {
      category_id: 'el-6-6',
      brand_id: null,
    });

    expect(ergebnis.error).toBeNull();
    expect(select).toHaveBeenCalledWith('category_id, category, brand_id, brand');
    expect(dienst.items()[0]).toMatchObject({
      category: 'Elektronik > Computer > Laptops',
      brand: null,
    });
  });

  it('liest bei anderen Änderungen nichts nach', async () => {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null, count: 1 })) }));
    const select = vi.fn();
    const { dienst } = injiziereDienst({ from: () => ({ update, select }) });
    dienst.items.set([gespeicherterArtikel]);

    await dienst.updateItem(gespeicherterArtikel.id, { title: 'Neu' });

    expect(select).not.toHaveBeenCalled();
  });

  it('setzt im Demo-Modus Kategorie- und Markentext wie die Datenbank', async () => {
    localStorage.clear();
    const mockStore = new MockDataStoreService();
    mockStore.isDemoMode.set(true);
    const { dienst } = injiziereDienst({}, mockStore);

    const ergebnis = await dienst.createItem({
      title: 'Bohrer',
      condition: 'used',
      category_id: 'ha-15-14',
      brand: 'Bosch',
      allocated_purchase_cost: 0,
    });

    expect(ergebnis.data).toMatchObject({
      category: 'Heimwerkerbedarf > Werkzeuge > Bohrmaschinen',
      brand: 'Bosch',
    });
    expect(ergebnis.data?.brand_id).toBe(mockStore.getBrands(workspace.id)[0].id);
  });
});
```

Prüfen, dass `vi` in den Importen der Datei steht (`import { describe, expect, it, vi } from 'vitest';` – bereits vorhanden). Braucht der Demo-Test weitere Stubs (z. B. `logActivity`), dieselben Stubs verwenden wie die vorhandenen Demo-Tests der Datei (`grep -n "isDemoMode.set(true)" src/app/core/services/inventory-persistence.spec.ts`).

- [ ] **Step 2: Failing Tests für den Katalog schreiben**

`src/app/core/services/catalog-category-brand.spec.ts`:

```ts
import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service';
import { MediaService } from './media.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

function createService(client: unknown, demo = false) {
  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(demo);
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client } },
      { provide: SyncStatusService, useValue: new SyncStatusService() },
      { provide: MockDataStoreService, useValue: mockStore },
      { provide: MediaService, useValue: { getMediaUrl: () => '' } },
      { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'ws-1' }) } },
    ],
  });
  return { service: runInInjectionContext(injector, () => new CatalogService()), mockStore };
}

describe('CatalogService – Kategorie und Marke', () => {
  beforeEach(() => localStorage.clear());

  it('sendet beim Anlegen Verweise und Markentext, aber keinen Kategorietext', async () => {
    let payload: Record<string, unknown> | null = null;
    const client = {
      from: () => ({
        insert(value: Record<string, unknown>) {
          payload = value;
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'p1', workspace_id: 'ws-1', title: 'X' },
                error: null,
              }),
            }),
          };
        },
      }),
    };
    const { service } = createService(client);

    await service.createProduct({
      workspaceId: 'ws-1',
      title: 'X',
      categoryId: 'el-6',
      brandId: 'b1',
    });

    expect(payload).toMatchObject({ category_id: 'el-6', brand_id: 'b1' });
    expect(payload).not.toHaveProperty('category');
  });

  it('übernimmt beim CSV-Import den Markentext zur Auswertung', async () => {
    let payload: Record<string, unknown> | null = null;
    const client = {
      from: () => ({
        insert(value: Record<string, unknown>) {
          payload = value;
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'p1', workspace_id: 'ws-1', title: 'X' },
                error: null,
              }),
            }),
          };
        },
      }),
    };
    const { service } = createService(client);

    await service.createProduct({ workspaceId: 'ws-1', title: 'X', brand: ' Anker ' });

    expect(payload).toMatchObject({ brand: 'Anker', brand_id: null, category_id: null });
  });

  it('ändert nur übergebene Verweise', async () => {
    const update = vi.fn(() => ({
      eq: () => ({
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: { id: 'p1', workspace_id: 'ws-1', title: 'X' },
              error: null,
            }),
          }),
        }),
      }),
    }));
    const { service } = createService({ from: () => ({ update }) });

    await service.updateProduct('p1', { workspaceId: 'ws-1', categoryId: null });

    expect(update).toHaveBeenCalledWith({ category_id: null });
  });

  it('setzt im Demo-Modus den Text wie die Datenbank', async () => {
    const { service, mockStore } = createService({}, true);

    const result = await service.createProduct({
      workspaceId: 'ws-1',
      title: 'Controller',
      categoryId: 'el-18-5',
      brand: 'Sony',
    });

    expect(result.data).toMatchObject({
      category: 'Elektronik > Zubehör für Videospielkonsolen > Videospiel-Controller',
      brand: 'Sony',
      brand_id: mockStore.getBrands('ws-1')[0].id,
    });
  });
});
```

- [ ] **Step 3: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run --project=node src/app/core/services/inventory-persistence.spec.ts src/app/core/services/catalog-category-brand.spec.ts > /tmp/svc.log 2>&1; echo $?; grep -nE "✓|×|FAIL" /tmp/svc.log | head -20`
Expected: Exitcode ≠ 0; die neuen Tests schlagen fehl (Typfehler bei `category_id`/`categoryId` bzw. falsche Payload), die alten bestehen.

- [ ] **Step 4: `InventoryService` umstellen**

In `src/app/core/services/inventory.service.ts`:

1. `CreateItemPayload`: Zeile `category?: string | null;` ersetzen durch

```ts
  /** Verweis auf eine Shopify-Kategorie; den Text setzt die Datenbank. */
  category_id?: string | null;
  /** Verweis auf eine Marke. Ohne Verweis wird `brand` als Text zugeordnet. */
  brand_id?: string | null;
```

(`brand?: string | null;` bleibt.)

2. Oberhalb der Klasse (nach den Importen) ergänzen:

```ts
const CATEGORY_BRAND_FIELDS = ['category_id', 'category', 'brand_id', 'brand'] as const;

function touchesCategoryOrBrand(updates: Partial<InventoryItem>): boolean {
  return CATEGORY_BRAND_FIELDS.some((field) => field in updates);
}
```

3. In `createItem` das Objekt `newItem` anpassen: `category: payload.category?.trim() || null,` ersetzen durch

```ts
      category_id: payload.category_id ?? null,
      category: null,
      brand_id: payload.brand_id ?? null,
```

und die folgende Zeile `const enriched = this.enrichItemTotals(newItem);` ersetzen durch

```ts
const enriched = this.enrichItemTotals(
  this.mockStore.isDemoMode() ? this.mockStore.applyCategoryBrandText(newItem) : newItem,
);
```

In `.insert({ … })` die Zeile `category: payload.category?.trim() || null,` ersetzen durch

```ts
          category_id: payload.category_id ?? null,
          brand_id: payload.brand_id ?? null,
```

4. In `updateItem`:

   a. `const aenderungenLokalUebernehmen = (): void => {` ersetzen durch `const aenderungenLokalUebernehmen = (aenderungen: Partial<InventoryItem>): void => {` und darin jedes `...updates` durch `...aenderungen` ersetzen (drei Stellen: `{ ...base, ...updates }`, `{ ...item, ...updates }`, `{ ...currentSel, ...updates }`).

   b. Den Demo-Zweig

```ts
if (this.mockStore.isDemoMode()) {
  aenderungenLokalUebernehmen();
  return { error: null };
}
```

ersetzen durch

```ts
if (this.mockStore.isDemoMode()) {
  aenderungenLokalUebernehmen(
    existing && touchesCategoryOrBrand(updates)
      ? (() => {
          const derived = this.mockStore.applyCategoryBrandText(
            { ...existing, ...updates },
            existing,
          );
          return {
            ...updates,
            category_id: derived.category_id,
            category: derived.category,
            brand_id: derived.brand_id,
            brand: derived.brand,
          };
        })()
      : updates,
  );
  return { error: null };
}
```

c. Direkt nach dem Block `if (count === 0) { … }` (noch innerhalb von `try`) einfügen:

```ts
if (touchesCategoryOrBrand(updates)) {
  // Den Text setzt der Trigger sync_category_brand_text(); ohne Nachlesen zeigte
  // die Liste bis zum nächsten Laden den alten Text.
  const { data: derived, error: readError } = await this.supabase.client
    .from('inventory_items')
    .select('category_id, category, brand_id, brand')
    .eq('id', itemId)
    .maybeSingle();
  if (readError) return { error: this.syncStatus.melde('Aktualisieren des Artikels', readError) };
  if (derived) {
    aenderungenLokalUebernehmen({ ...updates, ...derived });
    return { error: null };
  }
}
```

d. Den Aufruf am Ende `aenderungenLokalUebernehmen();` ersetzen durch `aenderungenLokalUebernehmen(updates);`.

Die Arrow-Funktion in 4b ist TypeScript im Service, nicht im Template; sie ist erlaubt. Wer sie lesbarer möchte, zieht sie in eine private Methode `demoCategoryBrandUpdates(existing, updates)` mit identischem Inhalt.

- [ ] **Step 5: `CatalogService` umstellen**

In `src/app/core/services/catalog.service.ts`:

1. `CreateCatalogProductInput`: `readonly category?: string | null;` ersetzen durch

```ts
  /** Verweis auf eine Shopify-Kategorie; den Text setzt die Datenbank. */
  readonly categoryId?: string | null;
  /** Verweis auf eine Marke. Ohne Verweis wird `brand` (z. B. aus dem CSV-Import) zugeordnet. */
  readonly brandId?: string | null;
```

2. `createProduct`, Demo-Zweig: `category: input.category?.trim() || null,` ersetzen durch

```ts
        category_id: input.categoryId ?? null,
        category: null,
        brand_id: input.brandId ?? null,
```

und `this.mockStore.saveCatalogProduct(product);` samt Folgezeilen ersetzen durch

```ts
const demoProduct = this.mockStore.applyCategoryBrandText(product);
this.mockStore.saveCatalogProduct(demoProduct);
this.includeCreatedProduct(demoProduct);
return { data: demoProduct, error: null, reportedBySyncStatus: false };
```

(die bisherigen Zeilen `this.includeCreatedProduct(product); return { data: product, … };` entfallen).

3. `createProduct`, `.insert({ … })`: `category: input.category?.trim() || null,` ersetzen durch

```ts
          category_id: input.categoryId ?? null,
          brand_id: input.brandId ?? null,
```

4. `updateProduct`: `if (input.category !== undefined) patch.category = input.category?.trim() || null;` ersetzen durch

```ts
if (input.categoryId !== undefined) patch.category_id = input.categoryId;
if (input.brandId !== undefined) patch.brand_id = input.brandId;
```

und im Demo-Zweig `product = { ...existing, ...patch };` ersetzen durch

```ts
product = this.mockStore.applyCategoryBrandText({ ...existing, ...patch }, existing);
```

- [ ] **Step 6: Unbenutzte Kategorie-Eingaben im Einkauf entfernen**

In `src/app/core/services/purchase.service.ts`:

- In `CreatePurchasePayload` die Zeile `single_item_category?: string;` löschen.
- In `legeEinzelartikelAn` die Zeile `category: payload.single_item_category?.trim() || null,` löschen.
- In `addItemToPurchase` im Parametertyp `category?: string;` und im Aufruf `category: itemData.category || null,` löschen.

Kontrolle: `grep -rn "single_item_category\|itemData.category" src/app` liefert nichts.

- [ ] **Step 7: Tests laufen lassen, sie müssen bestehen**

```bash
npx vitest run --project=node src/app/core/services/inventory-persistence.spec.ts src/app/core/services/catalog-category-brand.spec.ts src/app/core/services/catalog.service.spec.ts src/app/core/services/purchase.service.spec.ts src/app/core/services/purchase-create-persistence.spec.ts > /tmp/svc.log 2>&1; echo $?; tail -6 /tmp/svc.log
```

Expected: `0`.

- [ ] **Step 8: Typprüfung zeigt die Aufrufer**

Run: `npm run typecheck > /tmp/tc.log 2>&1; echo $?; grep -n "error TS" /tmp/tc.log | head -20`
Expected: Fehler nur in Dateien, die Task 9 und 10 umstellen (`item-create-modal.component.ts`, `item-create.component.ts`, `product-dialog.component.ts`, `product-detail.component.ts`, ggf. deren Specs). Taucht eine andere Datei auf, sie hier mit derselben Regel umstellen: Kategorie nur noch als `category_id`/`categoryId`, Marke als Verweis oder Text.

- [ ] **Step 9: Format und Commit**

Diese Aufgabe wird erst zusammen mit Task 9 und 10 grün gebaut. Trotzdem jetzt committen, damit der Umbau nachvollziehbar bleibt:

```bash
npx prettier --write src/app/core/services/inventory.service.ts src/app/core/services/catalog.service.ts src/app/core/services/purchase.service.ts src/app/core/services/inventory-persistence.spec.ts src/app/core/services/catalog-category-brand.spec.ts
git add src/app/core/services/inventory.service.ts src/app/core/services/catalog.service.ts src/app/core/services/purchase.service.ts src/app/core/services/inventory-persistence.spec.ts src/app/core/services/catalog-category-brand.spec.ts
git commit -m "refactor(inventory): write category and brand references from services" -m "Services now send category_id and brand_id; free category text is never written. Brand text stays accepted because CSV import relies on it and the database resolves it. After a category or brand update the derived text is read back so lists do not show stale values. Unused purchase category inputs are removed. Callers in forms follow in the next commits."
```

---

### Task 9: Artikel-Dialog nutzt beide Wähler

**Files:**

- Modify: `src/app/features/inventory/components/item-create-modal/item-create-modal.component.ts`
- Modify: `src/app/features/inventory/components/item-create-modal/item-create-modal.component.html`
- Modify: `src/app/features/inventory/components/item-create-modal/item-create-modal-actions.dom.spec.ts`
- Modify: `src/app/features/inventory/components/item-create-modal/item-create-modal-package.angular.spec.ts`

**Interfaces:**

- Consumes: `CategoryPickerComponent` (Task 6), `BrandPickerComponent` (Task 7), `CreateItemPayload` (Task 8), `CatalogProduct.category_id/brand_id` (Task 4).
- Produces: Formularfelder `category_id: FormControl<string | null>`, `brand_id: FormControl<string | null>`; Signale `categorySuggestion`, `brandSuggestion` (`WritableSignal<string | null>`).

- [ ] **Step 1: Failing Tests ergänzen**

In `item-create-modal-actions.dom.spec.ts`:

1. Im Formular von `erstelleKomponente` die Zeilen `category: new FormControl(''),` und `brand: new FormControl(''),` ersetzen durch

```ts
      category_id: new FormControl<string | null>(null),
      brand_id: new FormControl<string | null>(null),
```

2. In `Object.assign(komponente, { … })` ergänzen:

```ts
    categorySuggestion: signal<string | null>(null),
    brandSuggestion: signal<string | null>(null),
```

3. Am Dateiende anhängen:

```ts
describe('ItemCreateModalComponent – Kategorie und Marke', () => {
  it('speichert beim Anlegen die gewählten Verweise', async () => {
    const { komponente, inventoryService } = erstelleKomponente({ data: artikel, error: null });
    komponente.form.patchValue({ category_id: 'el-6-6', brand_id: 'brand-1' });

    await komponente.onSubmit();

    expect(inventoryService.createItem.mock.calls[0][0]).toMatchObject({
      category_id: 'el-6-6',
      brand_id: 'brand-1',
    });
  });

  it('leert beim Bearbeiten entfernte Verweise ausdrücklich', async () => {
    const { komponente, inventoryService } = erstelleKomponente(
      { data: artikel, error: null },
      {
        ...artikel,
        category_id: 'el-6-6',
        brand_id: 'brand-1',
      },
    );

    await komponente.onSubmit();

    expect(inventoryService.updateItem).toHaveBeenCalledWith(
      artikel.id,
      expect.objectContaining({ category_id: null, brand_id: null }),
    );
  });

  it('gibt erkannte Texte nur als Vorschlag weiter', async () => {
    const { komponente } = erstelleKomponente({ data: artikel, error: null });
    Object.assign(komponente, {
      isAiLoading: signal(false),
      aiService: {
        identifyProduct: vi.fn(async () => ({
          cleanTitle: 'Nintendo Switch',
          brand: 'Nintendo',
          model: null,
          category: 'Gaming & Konsolen',
          condition: 'used',
        })),
      },
    });

    await komponente.onAiAutofill();

    expect(komponente.categorySuggestion()).toBe('Gaming & Konsolen');
    expect(komponente.brandSuggestion()).toBe('Nintendo');
    expect(komponente.form.getRawValue()).toMatchObject({ category_id: null, brand_id: null });
  });
});
```

Im Bearbeiten-Test füllt der Konstruktor-Effekt nicht (die Komponente entsteht per `Object.create`); das Formular startet deshalb mit `null` – genau der Fall „entfernt“.

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run --project=dom src/app/features/inventory/components/item-create-modal/item-create-modal-actions.dom.spec.ts > /tmp/modal.log 2>&1; echo $?; grep -nE "×|FAIL" /tmp/modal.log | head`
Expected: Exitcode ≠ 0; die drei neuen Tests schlagen fehl.

- [ ] **Step 3: Komponente umstellen**

In `item-create-modal.component.ts`:

1. Importe ergänzen und in `imports: [...]` aufnehmen:

```ts
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { BrandPickerComponent } from '../../../../shared/components/brand-picker/brand-picker.component';
```

2. Nach `readonly errorMessage = signal<string | null>(null);`:

```ts
  /** Erkannte Texte (Titel, Barcode, Foto) – nur Vorschläge, nie automatisch gespeichert. */
  readonly categorySuggestion = signal<string | null>(null);
  readonly brandSuggestion = signal<string | null>(null);
```

3. Im `form`: `category: new FormControl(''),` und `brand: new FormControl(''),` ersetzen durch

```ts
    category_id: new FormControl<string | null>(null),
    brand_id: new FormControl<string | null>(null),
```

4. Private Hilfsmethode vor `private meldeFehlerWennNichtSynchronisiert` einfügen:

```ts
  private schlageKategorieUndMarkeVor(category?: string | null, brand?: string | null): void {
    if (category?.trim() && !this.form.controls.category_id.value)
      this.categorySuggestion.set(category.trim());
    if (brand?.trim() && !this.form.controls.brand_id.value) this.brandSuggestion.set(brand.trim());
  }
```

5. `onAiAutofill`: im `patchValue` die Zeilen `brand: …` und `category: …` entfernen; nach dem `patchValue` ergänzen:

```ts
this.schlageKategorieUndMarkeVor(ai.category, ai.brand);
```

6. `onPhotoScanned`: ebenso `brand`/`category` aus `patchValue` entfernen und danach `this.schlageKategorieUndMarkeVor(res.category, res.brand);`.

7. `onBarcodeScanned`, Katalogtreffer: im `patchValue` die Zeilen `brand: …` und `category: …` ersetzen durch

```ts
        brand_id: current.brand_id ?? product.brand_id ?? null,
        category_id: current.category_id ?? product.category_id ?? null,
```

Barcode-Datenbank: `brand`/`category` aus dem `patchValue` entfernen und danach `this.schlageKategorieUndMarkeVor(info.category, info.brand);`.

8. `prefillWithAiResult`: `brand: res.brand || '',` und `category: res.category || '',` ersetzen durch `brand_id: null,` und `category_id: null,`; danach `this.schlageKategorieUndMarkeVor(res.category, res.brand);`.

9. Konstruktor-Effekt: `category: vorhandener.category ?? '',` und `brand: vorhandener.brand ?? '',` ersetzen durch

```ts
        category_id: vorhandener.category_id ?? null,
        brand_id: vorhandener.brand_id ?? null,
```

10. `onSubmit`, `payload`: `category: val.category?.trim() || undefined,` und `brand: val.brand?.trim() || undefined,` ersetzen durch

```ts
      category_id: val.category_id ?? null,
      brand_id: val.brand_id ?? null,
```

Im Bearbeiten-Zweig `category: payload.category ?? null,` und `brand: payload.brand ?? null,` ersetzen durch

```ts
        category_id: payload.category_id ?? null,
        brand_id: payload.brand_id ?? null,
```

- [ ] **Step 4: Template umstellen**

In `item-create-modal.component.html` den Block `<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">` mit den drei Feldern Kategorie, Marke, Modell vollständig ersetzen durch:

```html
<div>
  <span
    class="block text-[10px] font-semibold uppercase tracking-wider text-fb-text-muted mb-1"
    aria-hidden="true"
    >Kategorie</span
  >
  <app-category-picker
    id="itemCategory"
    label="Kategorie"
    [labelHidden]="true"
    formControlName="category_id"
    [suggestion]="categorySuggestion()"
  />
</div>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
  <div>
    <span
      class="block text-[10px] font-semibold uppercase tracking-wider text-fb-text-muted mb-1"
      aria-hidden="true"
      >Marke</span
    >
    <app-brand-picker
      id="itemBrand"
      label="Marke"
      [labelHidden]="true"
      formControlName="brand_id"
      [suggestion]="brandSuggestion()"
    />
  </div>

  <div>
    <label
      for="itemModel"
      class="block text-[10px] font-semibold uppercase tracking-wider text-fb-text-muted mb-1"
    >
      Modell
    </label>
    <input
      id="itemModel"
      type="text"
      formControlName="model"
      placeholder="z.B. GSR 18V-55"
      class="linear-input w-full px-2.5 py-1.5 rounded-lg text-xs"
    />
  </div>
</div>
```

- [ ] **Step 5: Gerenderten Paket-Test mit Test-Services versorgen**

In `item-create-modal-package.angular.spec.ts`:

1. Importe ergänzen:

```ts
import { ProductCategoryService } from '../../../../core/services/product-category.service';
import { BrandService } from '../../../../core/services/brand.service';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { BrandPickerComponent } from '../../../../shared/components/brand-picker/brand-picker.component';
```

2. In `beforeAll` nach der Schleife für `CustomSelectComponent` ergänzen und die Wiederherstellung erweitern:

```ts
const pickerRestores: (() => void)[] = [];
for (const component of [CategoryPickerComponent, BrandPickerComponent]) {
  const pickerMetadata = (
    component as unknown as {
      ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
    }
  ).ɵcmp;
  const inputs = pickerMetadata.inputs;
  const declared = pickerMetadata.declaredInputs;
  pickerMetadata.inputs = { ...inputs };
  pickerMetadata.declaredInputs = { ...declared };
  for (const name of ['label', 'labelHidden', 'placeholder', 'suggestion', 'helpText', 'id']) {
    pickerMetadata.inputs[name] = [name, 1, null];
    pickerMetadata.declaredInputs[name] = name;
  }
  pickerRestores.push(() => {
    pickerMetadata.inputs = inputs;
    pickerMetadata.declaredInputs = declared;
  });
}
const restoreSelect = restoreInputs;
restoreInputs = () => {
  restoreSelect();
  pickerRestores.forEach((restore) => restore());
};
```

3. In jedem `TestBed.configureTestingModule({ providers: [...] })` dieser Datei ergänzen:

```ts
        {
          provide: ProductCategoryService,
          useValue: {
            loadChildren: vi.fn(async () => []),
            search: vi.fn(async () => ({ categories: [], hasMore: false })),
            getById: vi.fn(async () => null),
          },
        },
        {
          provide: BrandService,
          useValue: {
            brands: signal([]),
            loading: signal(false),
            loadError: signal(null),
            ensureLoaded: vi.fn(async () => undefined),
            reload: vi.fn(async () => undefined),
            search: () => [],
            findByName: () => null,
            findById: () => null,
            create: vi.fn(),
          },
        },
```

- [ ] **Step 6: Weitere gerenderte Specs finden**

Run: `grep -rln "ItemCreateModalComponent\|ProductDialogComponent\|ProductDetailComponent" src/app --include=*.angular.spec.ts`
Jede gefundene Datei, die das Template per `TestBed.createComponent` rendert, bekommt dieselben zwei Provider und dieselbe Metadaten-Ergänzung wie in Step 5. Dateien, die die Komponente per `Object.create` oder `runInInjectionContext` ohne Rendern bauen, bleiben unverändert.

- [ ] **Step 7: Tests laufen lassen, sie müssen bestehen**

```bash
npx vitest run src/app/features/inventory/components/item-create-modal > /tmp/modal.log 2>&1; echo $?; tail -6 /tmp/modal.log
```

Expected: `0`.

- [ ] **Step 8: Format und Commit**

```bash
npx prettier --write src/app/features/inventory/components/item-create-modal
npx eslint src/app/features/inventory/components/item-create-modal > /tmp/lint.log 2>&1; echo $?
git add src/app/features/inventory/components/item-create-modal
git commit -m "feat(inventory): pick category and brand in the item dialog" -m "The item dialog replaces free-text category and brand with the shared pickers. Text from title parsing, photo scan and barcode lookup is only passed as a suggestion so nothing unverified is saved; a matching catalog product hands over its references. Editing clears removed references explicitly. The whole form was checked against loading and saving."
```

Expected: `0`.

---

### Task 10: Katalogprodukt-Dialog, Anlegeseite und Produkt-Detailseite

**Files:**

- Modify: `src/app/features/catalog/components/product-dialog/product-dialog.component.ts`
- Modify: `src/app/features/catalog/components/product-dialog/product-dialog.component.html`
- Modify: `src/app/features/catalog/components/product-dialog/product-dialog.component.dom.spec.ts`
- Modify: `src/app/features/inventory/pages/item-create/item-create.component.ts`
- Modify: `src/app/features/inventory/pages/item-create/item-create.component.html`
- Modify: `src/app/features/catalog/pages/product-detail/product-detail.component.ts`
- Modify: `src/app/features/catalog/pages/product-detail/product-detail.component.html`
- Modify: `src/app/features/catalog/pages/product-detail/product-detail.component.angular.spec.ts`

**Interfaces:**

- Consumes: Pickers (Tasks 6, 7), `CreateCatalogProductInput.categoryId/brandId` (Task 8).
- Produces: `ProductDialogComponent.categorySuggestion` und `.brandSuggestion` (`input<string | null>`); Formularfelder `categoryId`, `brandId` in Dialog und Detailseite.

- [ ] **Step 1: Failing Tests ergänzen**

Am Ende von `product-dialog.component.dom.spec.ts` (innerhalb von `describe('ProductDialogComponent', …)` vor dem schließenden `});`) einfügen:

```ts
it('speichert Kategorie und Marke als Verweise', async () => {
  const createProduct = vi
    .fn()
    .mockResolvedValue({ data: { id: 'p', workspace_id: 'workspace-1' }, error: null });
  const created = { emit: vi.fn() };
  const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
  Object.assign(component, {
    catalog: { createProduct, loadProducts: vi.fn() },
    media: { uploadProductMedia: vi.fn() },
    workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
    workspaceChanged: () => false,
    savedProduct: signal(null),
    image: signal(null),
    saving: signal(false),
    error: signal(null),
    created,
    form: new FormGroup({
      title: new FormControl('Controller'),
      ean: new FormControl(''),
      categoryId: new FormControl<string | null>('el-18-5'),
      brandId: new FormControl<string | null>('brand-1'),
      condition: new FormControl(''),
      isPublicStore: new FormControl(false),
      listingPrice: new FormControl(null),
    }),
  });

  await component.save();

  expect(createProduct).toHaveBeenCalledWith(
    expect.objectContaining({ categoryId: 'el-18-5', brandId: 'brand-1' }),
  );
  expect(createProduct.mock.calls[0][0]).not.toHaveProperty('category');
});
```

In `product-detail.component.angular.spec.ts` innerhalb von `describe('ProductDetailComponent', …)` ergänzen:

```ts
it('lädt und speichert Kategorie und Marke als Verweise', async () => {
  catalog.products.set([{ ...original, category_id: 'el-6-6', brand_id: 'brand-1' }]);
  await component.reload();
  expect(component.form.getRawValue()).toMatchObject({ categoryId: 'el-6-6', brandId: 'brand-1' });

  component.form.controls.categoryId.setValue(null);
  await component.save();

  expect(catalog.updateProduct).toHaveBeenCalledWith(
    original.id,
    expect.objectContaining({ categoryId: null, brandId: 'brand-1' }),
  );
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

```bash
npx vitest run src/app/features/catalog/components/product-dialog/product-dialog.component.dom.spec.ts src/app/features/catalog/pages/product-detail/product-detail.component.angular.spec.ts > /tmp/cat.log 2>&1; echo $?; grep -nE "×|FAIL" /tmp/cat.log | head
```

Expected: Exitcode ≠ 0; die zwei neuen Tests schlagen fehl.

- [ ] **Step 3: Produkt-Dialog umstellen**

In `product-dialog.component.ts`:

1. Importe und `imports: [...]` um `CategoryPickerComponent` und `BrandPickerComponent` ergänzen (Pfade `../../../../shared/components/category-picker/category-picker.component` bzw. `…/brand-picker/brand-picker.component`).
2. Nach `readonly initialProduct = input<…>(null);`:

```ts
  /** Erkannte Texte für die Wähler – nur Vorschläge. */
  readonly categorySuggestion = input<string | null>(null);
  readonly brandSuggestion = input<string | null>(null);
```

3. Im Formular `brand: new FormControl('', { nonNullable: true }),` und `category: new FormControl('', { nonNullable: true }),` ersetzen durch

```ts
      brandId: new FormControl<string | null>(null),
      categoryId: new FormControl<string | null>(null),
```

4. Im Effekt `brand: value.brand ?? '',` und `category: value.category ?? '',` ersetzen durch

```ts
        brandId: value.brandId ?? null,
        categoryId: value.categoryId ?? null,
```

In `product-dialog.component.html` die beiden Zeilen

```html
<app-text-field label="Kategorie (optional)" formControlName="category" />
<app-text-field label="Marke (optional)" formControlName="brand" />
```

ersetzen durch

```html
<div class="sm:col-span-2">
  <app-category-picker
    id="product-category"
    label="Kategorie (optional)"
    formControlName="categoryId"
    [suggestion]="categorySuggestion()"
  />
</div>
<app-brand-picker
  id="product-brand"
  label="Marke (optional)"
  formControlName="brandId"
  [suggestion]="brandSuggestion()"
/>
```

- [ ] **Step 4: Anlegeseite umstellen**

In `item-create.component.ts` im Objekt `initialProduct` die Zeilen `brand: this.routeState.aiResult.brand,` und `category: this.routeState.aiResult.category,` löschen und unterhalb von `initialProduct` ergänzen:

```ts
  readonly categorySuggestion = this.routeState.aiResult?.category ?? null;
  readonly brandSuggestion = this.routeState.aiResult?.brand ?? null;
```

`item-create.component.html`:

```html
<app-product-dialog
  [initialProduct]="initialProduct"
  [categorySuggestion]="categorySuggestion"
  [brandSuggestion]="brandSuggestion"
  (closed)="returnToInventory()"
  (created)="itemCreated()"
/>
```

- [ ] **Step 5: Produkt-Detailseite umstellen**

In `product-detail.component.ts`:

1. `CategoryPickerComponent` und `BrandPickerComponent` importieren und in `imports: [...]` aufnehmen.
2. Im Formular `brand: new FormControl('', { nonNullable: true }),` → `brandId: new FormControl<string | null>(null),` und `category: new FormControl('', { nonNullable: true }),` → `categoryId: new FormControl<string | null>(null),`.
3. In `fillForm` `brand: product.brand ?? '',` → `brandId: product.brand_id ?? null,` und `category: product.category ?? '',` → `categoryId: product.category_id ?? null,`.

In `product-detail.component.html` im Block `<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">`:

- `<app-text-field label="Marke" formControlName="brand" />` ersetzen durch `<app-brand-picker id="product-detail-brand" label="Marke" formControlName="brandId" />`
- `<app-text-field label="Kategorie" formControlName="category" />` ersetzen durch

```html
<div class="sm:col-span-2">
  <app-category-picker
    id="product-detail-category"
    label="Kategorie"
    formControlName="categoryId"
  />
</div>
```

- [ ] **Step 6: Tests, Typen und Architekturprüfung**

```bash
npx vitest run src/app/features/catalog src/app/features/inventory/pages > /tmp/cat.log 2>&1; echo $?; tail -6 /tmp/cat.log
npm run typecheck > /tmp/tc.log 2>&1; echo $?; grep -n "error TS" /tmp/tc.log | head
node scripts/check-admin-shared-ui.mjs; echo $?
```

Expected: `0`, `0` ohne `error TS`, `0` mit `"findings":0`.

- [ ] **Step 7: Format und Commit**

```bash
npx prettier --write src/app/features/catalog/components/product-dialog src/app/features/catalog/pages/product-detail src/app/features/inventory/pages/item-create
npx eslint src/app/features/catalog/components/product-dialog src/app/features/catalog/pages/product-detail src/app/features/inventory/pages/item-create > /tmp/lint.log 2>&1; echo $?
git add src/app/features/catalog/components/product-dialog src/app/features/catalog/pages/product-detail src/app/features/inventory/pages/item-create
git commit -m "feat(inventory): pick category and brand for catalog products" -m "Product dialog, item create page and product detail use the shared pickers and save references. Recognition results reach the pickers only as suggestions. Load and save of both forms were checked against the new fields."
```

Expected: `0`.

---

### Task 11: Gesamtprüfung, Sichtprüfung, Protokoll und PR

**Files:**

- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:**

- Consumes: alles aus Task 1–10.

- [ ] **Step 1: Vollständige lokale Prüfung**

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
npx supabase test db > /tmp/db-all.log 2>&1; echo $?
grep -nE "not ok|error TS|✖|FAIL" /tmp/verify.log /tmp/db-all.log | head -20
```

Expected: beide Exitcodes `0`, keine Treffer. Bei einem Fehler Ursache beheben und den betroffenen Task-Commit als eigenen Fix-Commit nachziehen; Prüfungen nicht abschwächen.

- [ ] **Step 2: Sichtprüfung im Browser**

1. `.claude/launch.json` lesen und den Angular-Dev-Server per `preview_start` (Name aus der Datei) starten; lokale Supabase läuft.
2. Anmelden mit einem lokalen Testkonto (Seed) oder im Demo-Modus.
3. **Inventar → Artikel anlegen:**
   - Kategorie öffnen → Hauptbereiche sichtbar → „Elektronik“ → „Computer“ → „Laptops“ wählen → Feld zeigt „Elektronik › Computer › Laptops“.
   - „lapt“ suchen → Treffer mit Pfad.
   - Marke „Testmarke“ tippen → „„Testmarke“ als neue Marke anlegen“ → gewählt.
   - Speichern → in der Liste stehen Kategorie- und Markentext.
   - Artikel erneut bearbeiten → beide Wähler zeigen die gespeicherten Werte → Kategorie entfernen → speichern → Kategorietext verschwindet.
4. **Katalog → Produkt erstellen** und **Produkt-Detailseite**: dieselben Schritte für Kategorie und Marke.
5. Tastatur: Kategorie-Feld per Tab fokussieren, Enter öffnet, Pfeiltasten, → und ←, Esc schließt, Fokus zurück auf dem Feld.
6. `read_console_messages` ohne Fehler; Bildschirmfoto des geöffneten Kategorie-Wählers im Artikel-Dialog anfertigen.
7. Hell- und Dunkelmodus per `resize_window` mit `colorScheme` prüfen: Text im Popover lesbar.

- [ ] **Step 3: KI-Änderungsprotokoll ergänzen**

Den bestehenden Eintrag „2026-09-14 – Claude Opus 5 (Anthropic) – Entwurf Kategorie- und Markenauswahl“ in `docs/AI-CHANGELOG.md` um die Umsetzung erweitern:

```markdown
**Umsetzung:** Plan `docs/superpowers/plans/2026-09-14-product-categories-brands.md`,
Aufgaben 1–10.

- Import-Skript `scripts/import-shopify-taxonomy.mjs` (Version v2026-08, MIT-Hinweis).
- `supabase/schemas/150_product_categories_brands.sql`: Tabellen, RLS, Text-Trigger,
  Umbenennungen als SECURITY DEFINER, Übernahmefunktion; drei Migrationen.
- `ProductCategoryService`, `BrandService`, Demo-Nachbildung im `MockDataStoreService`.
- Gemeinsame Bausteine `app-category-picker` und `app-brand-picker`.
- Artikel-Dialog, Anlegeseite, Produkt-Dialog und Produkt-Detailseite nutzen die Wähler.

**Prüfung:** (tatsächliche Befehle und Ergebnisse aus Step 1 und 2 eintragen:
`npm run verify`, `npx supabase test db`, Sichtprüfung mit Bildschirmfoto)
```

Den Klammertext durch die echten Ergebnisse ersetzen, bevor committet wird.

- [ ] **Step 4: Committen**

```bash
npx prettier --write docs/AI-CHANGELOG.md
git add docs/AI-CHANGELOG.md
git commit -m "docs(inventory): record category and brand implementation" -m "Logs the implemented tasks and the verification that was actually run, as required for every assistant session."
```

- [ ] **Step 5: Abschlussfrage**

Im Chat genau fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“

---

## Anhang A: `supabase/schemas/150_product_categories_brands.sql`

```sql
-- Produktkategorien (Shopify Standard Product Taxonomy) und Marken je Workspace.
--
-- Ladereihenfolge in supabase/config.toml: nach 140_purchase_package_contents.sql.
-- Nutzt public.is_workspace_member() aus database.sql und
-- public.protect_archived_workspace_data() aus 80_workspace_retention.sql.
--
-- Die Kategoriedaten stehen nicht hier, sondern in der von
-- scripts/import-shopify-taxonomy.mjs erzeugten Migration.

create table if not exists public.product_categories (
    id text primary key check (id ~ '^[a-z]{2}(-[0-9]+)*$'),
    parent_id text references public.product_categories (id),
    name text not null check (pg_catalog.btrim(name) <> ''),
    full_name text not null check (pg_catalog.btrim(full_name) <> ''),
    level smallint not null check (level between 1 and 12),
    is_leaf boolean not null default true,
    taxonomy_version text not null check (taxonomy_version ~ '^[0-9]{4}-[0-9]{2}$'),
    is_deprecated boolean not null default false,
    constraint product_categories_root_has_no_parent check ((level = 1) = (parent_id is null))
);

comment on table public.product_categories is
    'Kategoriebaum der Shopify Standard Product Taxonomy (deutsch), flach gespeichert. Die id ist die Shopify-Kennung, keine eigene.';
comment on column public.product_categories.full_name is
    'Voller Pfad wie "Elektronik > Computer > Laptops". Die Datenbank schreibt ihn in category von Artikeln und Katalogprodukten.';
comment on column public.product_categories.is_deprecated is
    'Von Shopify entfernt. Bleibt erhalten, weil Artikel weiter darauf verweisen dürfen; der Wähler zeigt sie nicht mehr an.';

alter table public.product_categories enable row level security;

create policy "Angemeldete lesen Produktkategorien" on public.product_categories
    for select to authenticated
    using (true);

-- Geschrieben wird ausschließlich per Migration. Anon bekommt kein Tabellenrecht.
revoke all on table public.product_categories from anon, authenticated;
grant select on table public.product_categories to authenticated;

create index if not exists idx_product_categories_parent on public.product_categories (parent_id);
create index if not exists idx_product_categories_deprecated on public.product_categories (is_deprecated);

create table if not exists public.brands (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces (id) on delete cascade,
    name text not null check (
        name = pg_catalog.btrim(name) and name <> '' and pg_catalog.length(name) <= 120
    ),
    name_key text generated always as (pg_catalog.lower(name)) stored,
    created_at timestamptz not null default now(),
    -- Beginnt mit workspace_id und deckt damit auch die Policies ab.
    constraint brands_workspace_name_key unique (workspace_id, name_key),
    constraint brands_workspace_id_key unique (workspace_id, id)
);

comment on table public.brands is
    'Marken je Workspace. Gleiche Schreibweisen ohne Groß-/Kleinunterschied sind nur einmal möglich.';

alter table public.brands enable row level security;

create policy "Marken lesen" on public.brands
    for select to authenticated
    using (public.is_workspace_member(workspace_id));
create policy "Marken anlegen" on public.brands
    for insert to authenticated
    with check (public.is_workspace_member(workspace_id));
create policy "Marken aendern" on public.brands
    for update to authenticated
    using (public.is_workspace_member(workspace_id))
    with check (public.is_workspace_member(workspace_id));
create policy "Marken loeschen" on public.brands
    for delete to authenticated
    using (public.is_workspace_member(workspace_id));

revoke all on table public.brands from anon;

create trigger "00_protect_archived_workspace" before insert or update or delete on public.brands
for each row execute function public.protect_archived_workspace_data();

-- Verweise. "no action" verhindert wie "restrict" das Löschen benutzter Einträge,
-- prüft aber erst am Ende der Anweisung – so bleibt das kaskadierende Löschen eines
-- ganzen Workspace möglich.
alter table public.inventory_items
    add column if not exists category_id text references public.product_categories (id),
    add column if not exists brand_id uuid;
alter table public.catalog_products
    add column if not exists category_id text references public.product_categories (id),
    add column if not exists brand_id uuid;

alter table public.inventory_items
    add constraint inventory_items_workspace_brand_fkey
    foreign key (workspace_id, brand_id) references public.brands (workspace_id, id);
alter table public.catalog_products
    add constraint catalog_products_workspace_brand_fkey
    foreign key (workspace_id, brand_id) references public.brands (workspace_id, id);

create index if not exists idx_inventory_items_category on public.inventory_items (category_id);
create index if not exists idx_inventory_items_workspace_brand on public.inventory_items (workspace_id, brand_id);
create index if not exists idx_catalog_products_category on public.catalog_products (category_id);
create index if not exists idx_catalog_products_workspace_brand on public.catalog_products (workspace_id, brand_id);

-- Füllt category und brand aus den Verweisen.
--
-- Kategorie: Freier Text wird nie ausgewertet (Nutzerentscheidung vom 14.09.2026).
-- Marke: Die Kennung hat Vorrang. Markentext wird nur ausgewertet, wenn beim Anlegen
-- keine Kennung mitkommt oder sich beim Ändern der Text ändert und die Kennung gleich
-- bleibt. So bleiben Paketerfassung, CSV-Import und Barcode-Übernahme unverändert.
create or replace function public.sync_category_brand_text()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brand_name text;
begin
  if (tg_op = 'INSERT' and new.brand_id is null)
    or (tg_op = 'UPDATE'
      and new.brand_id is not distinct from old.brand_id
      and new.brand is distinct from old.brand)
  then
    v_brand_name := pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(coalesce(new.brand, '')), 120));
    if v_brand_name = '' then
      new.brand_id := null;
    else
      insert into public.brands (workspace_id, name)
      values (new.workspace_id, v_brand_name)
      on conflict (workspace_id, name_key) do nothing;

      select brand.id into new.brand_id
      from public.brands as brand
      where brand.workspace_id = new.workspace_id
        and brand.name_key = pg_catalog.lower(v_brand_name);
    end if;
  end if;

  if new.brand_id is null then
    new.brand := null;
  else
    select brand.name into new.brand
    from public.brands as brand
    where brand.workspace_id = new.workspace_id
      and brand.id = new.brand_id;
  end if;

  if new.category_id is null then
    new.category := null;
  else
    select category.full_name into new.category
    from public.product_categories as category
    where category.id = new.category_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.sync_category_brand_text() from public, anon, authenticated, service_role;

-- "10_" läuft nach "00_protect_archived_workspace" und vor den fachlichen
-- Schutz-Triggern; keiner von ihnen prüft Kategorie oder Marke.
create trigger "10_sync_category_brand_text"
    before insert or update of category_id, brand_id, category, brand on public.inventory_items
    for each row execute function public.sync_category_brand_text();
create trigger "10_sync_category_brand_text"
    before insert or update of category_id, brand_id, category, brand on public.catalog_products
    for each row execute function public.sync_category_brand_text();

-- SECURITY DEFINER: guard_inventory_item_costing_fields verbietet angemeldeten
-- Nutzern jede Änderung an Artikeln abgeschlossener Einkäufe. Ohne erhöhte Rechte
-- scheiterte jede Umbenennung. Geändert wird nur der abgeleitete Markentext im
-- Workspace der Marke.
create or replace function public.sync_brand_name_to_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_items as item
  set brand = new.name
  where item.workspace_id = new.workspace_id
    and item.brand_id = new.id
    and item.brand is distinct from new.name;

  update public.catalog_products as product
  set brand = new.name
  where product.workspace_id = new.workspace_id
    and product.brand_id = new.id
    and product.brand is distinct from new.name;

  return new;
end;
$$;

alter function public.sync_brand_name_to_records() owner to postgres;
revoke execute on function public.sync_brand_name_to_records() from public, anon, authenticated, service_role;

create trigger sync_brand_name_to_records
    after update of name on public.brands
    for each row
    when (old.name is distinct from new.name)
    execute function public.sync_brand_name_to_records();

-- Für spätere Shopify-Versionen mit geänderten Pfaden. Archivierte Workspaces bleiben
-- unverändert, weil ihr Schutz auch postgres sperrt; ihr Text wird beim nächsten
-- Speichern nach einer Wiederherstellung neu gesetzt.
create or replace function public.sync_category_name_to_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_items as item
  set category = new.full_name
  where item.category_id = new.id
    and item.category is distinct from new.full_name
    and not exists (
      select 1 from public.workspaces as workspace
      where workspace.id = item.workspace_id and workspace.archived_at is not null
    );

  update public.catalog_products as product
  set category = new.full_name
  where product.category_id = new.id
    and product.category is distinct from new.full_name
    and not exists (
      select 1 from public.workspaces as workspace
      where workspace.id = product.workspace_id and workspace.archived_at is not null
    );

  return new;
end;
$$;

alter function public.sync_category_name_to_records() owner to postgres;
revoke execute on function public.sync_category_name_to_records() from public, anon, authenticated, service_role;

create trigger sync_category_name_to_records
    after update of full_name on public.product_categories
    for each row
    when (old.full_name is distinct from new.full_name)
    execute function public.sync_category_name_to_records();

-- Einmalige Übernahme freier Texte (Migration *_migrate_legacy_category_brand_texts).
--
-- DESTRUKTIV: Alle Kategorietexte ohne category_id werden geleert. Das hat der
-- Nutzer am 14.09.2026 ausdrücklich so entschieden (Option C): freie Texte passen
-- nicht verlässlich auf eine Shopify-Kategorie.
--
-- Marken: je Workspace eine Marke je Vergleichsform, Anzeigename ist die häufigste
-- Schreibweise, bei Gleichstand die alphabetisch erste.
--
-- Nur postgres ruft sie auf. "00_protect_archived_workspace" sperrt auch postgres
-- und wird deshalb innerhalb dieser Transaktion ab- und wieder eingeschaltet;
-- scheitert die Übernahme, rollt Postgres auch das Abschalten zurück. Die übrigen
-- Schutz-Trigger lassen postgres durch oder betreffen andere Spalten.
-- Die Funktion bleibt bestehen, damit der Datenbanktest sie mit Altbestand prüft.
create or replace function public.migrate_legacy_category_brand_texts()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  alter table public.inventory_items disable trigger "00_protect_archived_workspace";
  alter table public.catalog_products disable trigger "00_protect_archived_workspace";
  alter table public.brands disable trigger "00_protect_archived_workspace";

  with spellings as (
    select item.workspace_id, pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(item.brand), 120)) as name
    from public.inventory_items as item
    where pg_catalog.btrim(coalesce(item.brand, '')) <> ''
    union all
    select product.workspace_id, pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(product.brand), 120))
    from public.catalog_products as product
    where pg_catalog.btrim(coalesce(product.brand, '')) <> ''
  ),
  counted as (
    select spelling.workspace_id, spelling.name, pg_catalog.count(*) as uses
    from spellings as spelling
    group by spelling.workspace_id, spelling.name
  ),
  ranked as (
    select
      counted.workspace_id,
      counted.name,
      pg_catalog.row_number() over (
        partition by counted.workspace_id, pg_catalog.lower(counted.name)
        order by counted.uses desc, counted.name asc
      ) as position
    from counted
  )
  insert into public.brands (workspace_id, name)
  select ranked.workspace_id, ranked.name
  from ranked
  where ranked.position = 1
  on conflict (workspace_id, name_key) do nothing;

  -- Setzt category auf null; der Sync-Trigger berechnet den Text danach aus
  -- category_id neu. Mit Verweis bleibt der Pfad, ohne Verweis verschwindet der Text.
  update public.inventory_items as item
  set brand_id = coalesce(item.brand_id, (
        select brand.id from public.brands as brand
        where brand.workspace_id = item.workspace_id
          and brand.name_key = pg_catalog.lower(pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(item.brand), 120)))
      )),
      category = null
  where item.brand is not null or item.category is not null;

  update public.catalog_products as product
  set brand_id = coalesce(product.brand_id, (
        select brand.id from public.brands as brand
        where brand.workspace_id = product.workspace_id
          and brand.name_key = pg_catalog.lower(pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(product.brand), 120)))
      )),
      category = null
  where product.brand is not null or product.category is not null;

  alter table public.inventory_items enable trigger "00_protect_archived_workspace";
  alter table public.catalog_products enable trigger "00_protect_archived_workspace";
  alter table public.brands enable trigger "00_protect_archived_workspace";
end;
$$;

revoke execute on function public.migrate_legacy_category_brand_texts() from public, anon, authenticated, service_role;
```
