# Vinted-Kategorieliste — Umsetzungsplan

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte nutzen Kästchen (`- [ ]`) zum Abhaken.

**Ziel:** Der vollständige Vinted-Kategoriebaum liegt in der eigenen Datenbank, wird vom Sniper-Dienst aufgefrischt und ist in der Administration einsehbar.

**Architektur:** Der Baum steht im HTML der Vinted-Startseite in einem Next.js-Flight-Block unter dem Schlüssel `catalogTree`. Ein Parser im Sniper-Dienst liest ihn dort heraus, flacht ihn auf und schreibt ihn in `public.vinted_categories`. Eine Einzeilentabelle `public.vinted_category_sync` hält fest, wann zuletzt gelesen wurde, ob jemand eine Auffrischung angefordert hat und was zuletzt schiefging. Die Angular-Seite in der Administration zeigt diesen Stand und kann eine Auffrischung anfordern.

**Tech-Stack:** Postgres/Supabase (Schemadateien plus erzeugte Migrationen, pgTAP), TypeScript im Dienst `services/sniper/` (vitest), Angular 22 mit Signals und Tailwind im Hauptprojekt.

## Globale Randbedingungen

- **Bezeichner im Code englisch.** Deutsch nur in Kommentaren, Oberflächentexten und Chat.
- **Angular:** Standalone Components ohne `standalone: true`, `changeDetection: ChangeDetectionStrategy.OnPush`, `inject()` statt Konstruktor-Injektion, Signals (`signal`, `computed`), neue Control-Flow-Syntax (`@if`, `@for`), **niemals Inline-Templates**, kein `ngClass`/`ngStyle`, Tailwind direkt im HTML.
- **Supabase:** Jede neue Tabelle mit RLS und expliziten Policies; getrennte Policy je Operation und Rolle; kein `for all`; immer `to <rolle>` angeben; `select` nur `using`, `insert` nur `with check`, `update` beides; `(select auth.uid())` statt `auth.uid()`.
- **SQL-Stil:** Schlüsselwörter klein, `snake_case`, Tabellennamen plural, Spaltennamen singular, `comment on table` für jede Tabelle.
- **Migrationen werden erzeugt, nicht von Hand geschrieben:** `supabase stop`, dann `supabase db diff -f <name>`. Die erzeugte Datei danach ansehen.
- **Schemadateien** liegen unter `supabase/schemas/` mit Zahlenpräfix und **müssen** in `supabase/config.toml` unter `schema_paths` an der richtigen Position eingetragen werden — sonst werden sie beim `db reset` nicht oder falsch geladen.
- **Commits:** Conventional Commits v1.0.0, englisch, Imperativ, kein Punkt am Ende der ersten Zeile. Erlaubter Scope hier: `sniper`. Keine KI-Signatur, kein `Co-Authored-By`.
- **Jede Sitzung** wird in `docs/AI-CHANGELOG.md` eingetragen.

---

### Task 1: Tabellen für Kategorien und Auffrischungsstand

**Dateien:**

- Anlegen: `supabase/schemas/100_vinted_categories.sql`
- Ändern: `supabase/config.toml` (Zeile mit `schema_paths`)
- Anlegen: `supabase/tests/vinted_categories.sql`
- Erzeugt: `supabase/migrations/<zeitstempel>_vinted_categories.sql`

**Schnittstellen:**

- Verbraucht: `public.is_platform_operator()` aus `supabase/schemas/99_platform_admin.sql`
- Erzeugt: Tabelle `public.vinted_categories` (Spalten `id`, `parent_id`, `title`, `slug`, `path`, `is_leaf`, `updated_at`), Tabelle `public.vinted_category_sync` (Spalten `id`, `refreshed_at`, `requested_at`, `last_attempt_at`, `category_count`, `last_error`)

**Achtung zur Ladereihenfolge:** Die Policies dieser Datei rufen `public.is_platform_operator()` auf, und die Funktion entsteht erst in `99_platform_admin.sql`. Die Datei muss deshalb **danach** geladen werden. Daher die Nummer **100** — Dateinummer und Ladeposition stimmen so überein, und niemand muss später raten, warum eine 51 am Ende steht.

- [ ] **Schritt 1: pgTAP-Test schreiben**

Anlegen: `supabase/tests/vinted_categories.sql`

```sql
\set ON_ERROR_STOP on

begin;

select plan(9);

-- Spalten von vinted_categories
do $$
declare
  required_columns text[] := array[
    'id', 'parent_id', 'title', 'slug', 'path', 'is_leaf', 'updated_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'vinted_categories'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Fehlende Spalten in vinted_categories: %', missing_columns;
  end if;
end;
$$;

select pass('vinted_categories hat alle erwarteten Spalten');

-- Spalten von vinted_category_sync
do $$
declare
  required_columns text[] := array[
    'id', 'refreshed_at', 'requested_at', 'last_attempt_at', 'category_count', 'last_error'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'vinted_category_sync'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Fehlende Spalten in vinted_category_sync: %', missing_columns;
  end if;
end;
$$;

select pass('vinted_category_sync hat alle erwarteten Spalten');

-- RLS ist auf beiden Tabellen aktiv
select is(
  (select relrowsecurity from pg_class where oid = 'public.vinted_categories'::regclass),
  true,
  'vinted_categories hat RLS aktiviert'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.vinted_category_sync'::regclass),
  true,
  'vinted_category_sync hat RLS aktiviert'
);

-- Genau eine Zeile im Auffrischungsstand, und sie laesst sich nicht vermehren
select is(
  (select count(*)::integer from public.vinted_category_sync),
  1,
  'vinted_category_sync enthaelt genau eine Zeile'
);

do $$
begin
  begin
    insert into public.vinted_category_sync (id) values (2);
    raise exception 'Eine zweite Zeile haette abgelehnt werden muessen';
  exception
    when check_violation then
      null;
  end;
end;
$$;

select pass('vinted_category_sync laesst keine zweite Zeile zu');

-- Anonyme duerfen nichts sehen
set local role anon;

select is(
  (select count(*)::integer from public.vinted_categories),
  0,
  'anon sieht keine Kategorien'
);

select is(
  (select count(*)::integer from public.vinted_category_sync),
  0,
  'anon sieht den Auffrischungsstand nicht'
);

reset role;

-- Der Elternverweis zeigt auf dieselbe Tabelle
select is(
  (
    select confrelid::regclass::text
    from pg_constraint
    where conrelid = 'public.vinted_categories'::regclass
      and contype = 'f'
      and conname like '%parent%'
  ),
  'vinted_categories',
  'parent_id verweist auf vinted_categories'
);

select * from finish();

rollback;
```

- [ ] **Schritt 2: Test laufen lassen und scheitern sehen**

```bash
npm run test:db
```

Erwartet: FEHLER — `relation "public.vinted_categories" does not exist`.

- [ ] **Schritt 3: Schemadatei anlegen**

Anlegen: `supabase/schemas/100_vinted_categories.sql`

```sql
-- Vinted-Kategoriebaum und sein Auffrischungsstand.
--
-- Die Ladereihenfolge ist bindend und steht in supabase/config.toml. Diese
-- Datei nutzt public.is_platform_operator() aus 99_platform_admin.sql und wird
-- deshalb nach dieser geladen - daher die Nummer 100.
--
-- Warum gespeichert und nicht bei jeder Anzeige geholt: Vinted bietet keinen
-- Endpunkt fuer die Kategorieliste - /api/v2/catalogs und
-- /api/v2/catalog/initializers antworten mit 404. Der Baum steht nur im HTML
-- der Startseite. Haenge die Bedienoberflaeche direkt daran, faellt sie aus,
-- sobald Vinted sein Seitenformat aendert. Gespeichert bleibt sie benutzbar,
-- und die Administration sieht, dass der Stand alt ist.

create table if not exists public.vinted_categories (
    id integer primary key,
    parent_id integer references public.vinted_categories (id) on delete cascade,
    title text not null,
    slug text not null,
    path text not null,
    is_leaf boolean not null default false,
    updated_at timestamptz not null default now()
);

comment on table public.vinted_categories is
    'Der Kategoriebaum von Vinted, flach gespeichert. Die id ist die Nummer von Vinted, keine eigene - sie geht so in catalog_ids einer Abfrage.';

comment on column public.vinted_categories.path is
    'Lesbarer Pfad wie "Damen > Schuhe > Stiefel". Steht hier statt im Frontend, damit Suche und Anzeige dieselbe Zeichenkette benutzen.';

comment on column public.vinted_categories.is_leaf is
    'Ob die Kategorie keine Unterkategorien hat. Nur Blaetter sind als Sammelauftrag sinnvoll eng.';

alter table public.vinted_categories enable row level security;

-- Lesen darf jeder Angemeldete: Der Kategoriewaehler steht spaeter auch im
-- Arbeitsbereich, nicht nur in der Administration.
create policy "Angemeldete lesen Kategorien" on public.vinted_categories
    for select to authenticated
    using (true);

-- Geschrieben wird ausschliesslich mit Dienstschluessel durch den Sniper.
-- Es gibt absichtlich keine Schreib-Policy fuer authenticated.

create index if not exists idx_vinted_categories_parent
    on public.vinted_categories (parent_id);

create index if not exists idx_vinted_categories_leaf
    on public.vinted_categories (is_leaf);

-- Auffrischungsstand. Genau eine Zeile - die Pruefung auf id = 1 ist der
-- einfachste Weg, das zu erzwingen, ohne einen Trigger zu schreiben.
create table if not exists public.vinted_category_sync (
    id integer primary key default 1 check (id = 1),
    refreshed_at timestamptz,
    requested_at timestamptz,
    last_attempt_at timestamptz,
    category_count integer not null default 0,
    last_error text
);

comment on table public.vinted_category_sync is
    'Wann der Kategoriebaum zuletzt eingelesen wurde, ob eine Auffrischung angefordert ist und was zuletzt schiefging. Genau eine Zeile.';

comment on column public.vinted_category_sync.requested_at is
    'Von der Administration gesetzt. Liegt der Wert nach refreshed_at, liest der Dienst beim naechsten Takt neu ein. Bewusst ueber die Datenbank statt ueber einen Endpunkt: Der Dienst hat keinen offenen Eingang, und ein Feld genuegt.';

insert into public.vinted_category_sync (id) values (1)
on conflict (id) do nothing;

alter table public.vinted_category_sync enable row level security;

create policy "Angemeldete lesen den Auffrischungsstand" on public.vinted_category_sync
    for select to authenticated
    using (true);

-- Anfordern darf nur die Administration. Die Spaltenrechte weiter unten
-- begrenzen zusaetzlich, welches Feld ueberhaupt geschrieben werden kann.
create policy "Administration fordert Auffrischung an" on public.vinted_category_sync
    for update to authenticated
    using (public.is_platform_operator())
    with check (public.is_platform_operator());

revoke all on table public.vinted_categories from anon, authenticated;
grant select on table public.vinted_categories to authenticated;

revoke all on table public.vinted_category_sync from anon, authenticated;
grant select on table public.vinted_category_sync to authenticated;

-- Nur dieses eine Feld ist von aussen schreibbar. refreshed_at, category_count
-- und last_error setzt allein der Dienst - waeren sie schreibbar, koennte die
-- Oberflaeche einen Stand behaupten, den es nie gab.
grant update (requested_at) on table public.vinted_category_sync to authenticated;
```

- [ ] **Schritt 4: Schemadatei in die Ladereihenfolge eintragen**

Ändern: `supabase/config.toml`, Zeile `schema_paths`. Den neuen Pfad **am Ende** der Liste ergänzen:

```toml
schema_paths = ["./schemas/database.sql", "./schemas/50_sniper.sql", "./schemas/60_audit_snapshot.sql", "./schemas/70_realtime_sessions.sql", "./schemas/80_workspace_retention.sql", "./schemas/90_release_permissions.sql", "./schemas/95_purchase_cost_repair.sql", "./schemas/96_record_comments.sql", "./schemas/97_inventory_archive.sql", "./schemas/98_barcode_identifiers.sql", "./schemas/99_platform_admin.sql", "./schemas/100_vinted_categories.sql"]
```

Darüber als Kommentar festhalten, warum die Datei ans Ende gehört:

```toml
# 100_vinted_categories steht nach 99_platform_admin, weil seine Policies
# public.is_platform_operator() aus dieser Datei aufrufen.
```

- [ ] **Schritt 5: Datenbank neu aufsetzen und Migration erzeugen**

```bash
npx supabase stop
npx supabase db diff -f vinted_categories
```

Danach die erzeugte Datei unter `supabase/migrations/` **öffnen und lesen**. Erwartet: `create table public.vinted_categories`, `create table public.vinted_category_sync`, beide `alter table ... enable row level security`, vier Policies, die `grant`/`revoke`-Zeilen und das `insert` der Einzelzeile. Fehlt etwas davon, ist der Abgleich unvollständig — dann die fehlenden Anweisungen von Hand in dieselbe Migrationsdatei nachtragen und im Kopfkommentar vermerken, warum.

Kopfkommentar der Migration ergänzen:

```sql
-- Zweck: Kategoriebaum von Vinted speicherbar machen.
-- Betroffen: neue Tabellen public.vinted_categories und
-- public.vinted_category_sync samt RLS, Policies und Spaltenrechten.
-- Nicht destruktiv: legt nur an.
```

- [ ] **Schritt 6: Test laufen lassen und bestehen sehen**

```bash
npx supabase start
npm run test:db
```

Erwartet: `All tests successful.` — darin die neun Prüfungen aus `vinted_categories.sql`.

- [ ] **Schritt 7: Typen neu erzeugen**

```bash
npx supabase gen types typescript --local | sed '/^Connecting to db/d' > src/app/core/models/supabase.types.ts
```

Das `sed` ist kein Schmuck: Die Supabase-CLI schreibt ihre Statuszeile
`Connecting to db 5432` auf dieselbe Ausgabe wie die Typen. Ohne das Filtern
steht sie als erste Zeile in der `.ts`-Datei, und `npm run typecheck` bricht mit
`TS1434: Unexpected keyword or identifier` ab.

Danach prüfen:

```bash
head -1 src/app/core/models/supabase.types.ts
npm run typecheck
```

Erwartet: erste Zeile `export type Json =`, Typprüfung ohne Fehler, und
`vinted_categories` sowie `vinted_category_sync` tauchen in der Datei auf.

- [ ] **Schritt 8: Commit**

```bash
git add supabase/schemas/100_vinted_categories.sql supabase/config.toml supabase/tests/vinted_categories.sql supabase/migrations src/app/core/models/supabase.types.ts
git commit -m "feat(sniper): store the Vinted category tree"
```

---

### Task 2: Parser für den Kategoriebaum

**Dateien:**

- Anlegen: `services/sniper/src/vinted/categories.ts`
- Anlegen: `services/sniper/test/fixtures/vinted-homepage.html`
- Anlegen: `services/sniper/test/vinted/categories.spec.ts`

**Schnittstellen:**

- Verbraucht: nichts aus früheren Tasks
- Erzeugt: `export interface VintedCategory { id: number; parentId: number | null; title: string; slug: string; path: string; isLeaf: boolean }` und `export function parseCategoryTree(html: string): VintedCategory[]`

- [ ] **Schritt 1: Fixture anlegen**

Anlegen: `services/sniper/test/fixtures/vinted-homepage.html`

Ein verkleinerter Ausschnitt im echten Format. Die Anführungszeichen im Flight-Block sind escaped, genau wie bei Vinted — daran scheitert ein naiver Parser, deshalb muss das Fixture es nachbilden:

```html
<!doctype html>
<html>
  <body>
    <script>
      self.__next_f.push([1, 'irrelevanter Block ohne Baum\n']);
    </script>
    <script>
      self.__next_f.push([
        1,
        'd4:["$","$Ldc",null,{"catalogTree":[{"id":1904,"title":"Damen","url":"/catalog/1904-women","catalogs":[{"id":16,"title":"Schuhe","url":"/catalog/16-shoes","catalogs":[{"id":1049,"title":"Stiefel","url":"/catalog/1049-boots"},{"id":2955,"title":"Ballerinas","url":"/catalog/2955-ballerinas"}]}]},{"id":5,"title":"Herren","url":"/catalog/5-men","catalogs":[{"id":76,"title":"Tops & T-Shirts","url":"/catalog/76-tops-and-t-shirts"}]}]}]\n',
      ]);
    </script>
  </body>
</html>
```

**Wichtig:** Die Datei muss die Escapes wörtlich enthalten (`\"` als Backslash gefolgt von Anführungszeichen). Nach dem Anlegen prüfen:

```bash
grep -c 'catalogTree' services/sniper/test/fixtures/vinted-homepage.html
```

Erwartet: `1`.

- [ ] **Schritt 2: Test schreiben**

Anlegen: `services/sniper/test/vinted/categories.spec.ts`

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCategoryTree } from '../../src/vinted/categories.js';

const html = readFileSync(new URL('../fixtures/vinted-homepage.html', import.meta.url), 'utf8');

describe('parseCategoryTree', () => {
  it('liest alle Knoten flach aus, samt Elternverweis', () => {
    const categories = parseCategoryTree(html);

    expect(categories).toHaveLength(6);
    expect(categories.find((entry) => entry.id === 1904)).toEqual({
      id: 1904,
      parentId: null,
      title: 'Damen',
      slug: '1904-women',
      path: 'Damen',
      isLeaf: false,
    });
    expect(categories.find((entry) => entry.id === 1049)).toEqual({
      id: 1049,
      parentId: 16,
      title: 'Stiefel',
      slug: '1049-boots',
      path: 'Damen > Schuhe > Stiefel',
      isLeaf: true,
    });
  });

  it('kennzeichnet nur Knoten ohne Unterkategorien als Blatt', () => {
    const categories = parseCategoryTree(html);
    const leaves = categories.filter((entry) => entry.isLeaf).map((entry) => entry.id);

    expect(leaves.sort((a, b) => a - b)).toEqual([76, 1049, 2955]);
  });

  it('wirft, wenn kein Baum im HTML steht', () => {
    expect(() => parseCategoryTree('<html><body>nichts</body></html>')).toThrow(
      'Kein catalogTree im HTML gefunden',
    );
  });

  it('wirft, wenn der Baum leer ist', () => {
    const empty = 'self.__next_f.push([1,"x:[\\"$\\",{\\"catalogTree\\":[]}]"])';

    expect(() => parseCategoryTree(empty)).toThrow('Der catalogTree ist leer');
  });
});
```

- [ ] **Schritt 3: Test laufen lassen und scheitern sehen**

```bash
cd services/sniper && npx vitest run test/vinted/categories.spec.ts
```

Erwartet: FEHLER — `Cannot find module '../../src/vinted/categories.js'`.

- [ ] **Schritt 4: Parser schreiben**

Anlegen: `services/sniper/src/vinted/categories.ts`

```typescript
/**
 * Liest den Kategoriebaum aus dem HTML der Vinted-Startseite.
 *
 * Warum aus dem HTML und nicht aus der API: Vinted hat keinen offenen Endpunkt
 * dafuer - /api/v2/catalogs und /api/v2/catalog/initializers antworten mit 404
 * (gemessen am 02.09. und erneut am 06.09.2026). Der vollstaendige Baum steht
 * aber in einem Next.js-Flight-Block der Startseite unter dem Schluessel
 * `catalogTree`.
 *
 * Der Block sieht so aus:
 *
 *   self.__next_f.push([1,"d4:[\"$\",…,{\"catalogTree\":[{…}]}]\n"])
 *
 * Der Inhalt ist ein JS-String-Literal, die Anfuehrungszeichen darin sind
 * escaped. Deshalb wird das Literal erst mit JSON.parse entpackt und der Baum
 * anschliessend aus dem entpackten Text ausgeschnitten. Ein Zugriff mit einem
 * einzelnen regulaeren Ausdruck ueber das rohe HTML scheitert an genau diesen
 * Escapes.
 */

export interface VintedCategory {
  id: number;
  parentId: number | null;
  title: string;
  slug: string;
  path: string;
  isLeaf: boolean;
}

interface TreeNode {
  id: number;
  title: string;
  url?: string;
  catalogs?: TreeNode[];
}

const PUSH_MARKER = 'self.__next_f.push([1,';
const TREE_KEY = '"catalogTree":[';

/** Ende eines JS-String-Literals ab der oeffnenden Anfuehrung, Escapes beachtet. */
function findStringEnd(text: string, openQuote: number): number {
  let index = openQuote + 1;

  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === '"') return index;
    index++;
  }

  return -1;
}

/** Schneidet ab `start` ein ausgeglichenes JSON-Array aus. */
function sliceArray(text: string, start: number): string | null {
  let depth = 0;

  for (let index = start; index < text.length; index++) {
    if (text[index] === '[') depth++;
    else if (text[index] === ']') {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function findTree(html: string): TreeNode[] | null {
  for (
    let at = html.indexOf(PUSH_MARKER);
    at !== -1;
    at = html.indexOf(PUSH_MARKER, at + PUSH_MARKER.length)
  ) {
    const openQuote = html.indexOf('"', at + PUSH_MARKER.length);
    if (openQuote === -1) continue;

    const closeQuote = findStringEnd(html, openQuote);
    if (closeQuote === -1) continue;

    let payload: string;
    try {
      payload = JSON.parse(html.slice(openQuote, closeQuote + 1)) as string;
    } catch {
      continue;
    }

    const keyAt = payload.indexOf(TREE_KEY);
    if (keyAt === -1) continue;

    const array = sliceArray(payload, payload.indexOf('[', keyAt));
    if (array === null) continue;

    try {
      return JSON.parse(array) as TreeNode[];
    } catch {
      continue;
    }
  }

  return null;
}

/** Letztes Pfadsegment der Kategorieadresse, z. B. "1049-boots". */
function slugOf(node: TreeNode): string {
  const url = node.url ?? '';
  const segments = url.split('/').filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? String(node.id);
}

export function parseCategoryTree(html: string): VintedCategory[] {
  const tree = findTree(html);

  if (tree === null) throw new Error('Kein catalogTree im HTML gefunden');
  if (tree.length === 0) throw new Error('Der catalogTree ist leer');

  const flat: VintedCategory[] = [];

  const walk = (nodes: TreeNode[], parentId: number | null, parentPath: string): void => {
    for (const node of nodes) {
      const children = node.catalogs ?? [];
      const path = parentPath === '' ? node.title : `${parentPath} > ${node.title}`;

      flat.push({
        id: node.id,
        parentId,
        title: node.title,
        slug: slugOf(node),
        path,
        isLeaf: children.length === 0,
      });

      if (children.length > 0) walk(children, node.id, path);
    }
  };

  walk(tree, null, '');

  return flat;
}
```

- [ ] **Schritt 5: Test laufen lassen und bestehen sehen**

```bash
cd services/sniper && npx vitest run test/vinted/categories.spec.ts
```

Erwartet: `4 passed`.

- [ ] **Schritt 6: Gegen die echte Seite prüfen**

Einmalige Kontrolle, dass das Fixture die Wirklichkeit trifft:

```bash
cd services/sniper && node --input-type=module -e "
import { parseCategoryTree } from './dist/vinted/categories.js';
const html = await (await fetch('https://www.vinted.de', { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FlipbaseSniper/0.1)' } })).text();
const categories = parseCategoryTree(html);
console.log('Kategorien:', categories.length, '| Wurzeln:', categories.filter((c) => c.parentId === null).length, '| Blaetter:', categories.filter((c) => c.isLeaf).length);
"
```

Vorher `npm run build` in `services/sniper/`. Erwartet: rund 2900 Kategorien, 9 Wurzeln. Weicht die Zahl stark ab oder wirft der Aufruf, hat Vinted das Format geändert — dann zuerst das Fixture erneuern, nicht den Test lockern.

- [ ] **Schritt 7: Commit**

```bash
git add services/sniper/src/vinted/categories.ts services/sniper/test/vinted/categories.spec.ts services/sniper/test/fixtures/vinted-homepage.html
git commit -m "feat(sniper): parse the Vinted category tree from the homepage"
```

---

### Task 3: Speichern und Auffrischungsregel

**Dateien:**

- Anlegen: `services/sniper/src/store/category.store.ts`
- Anlegen: `services/sniper/src/runtime/category-refresh.ts`
- Anlegen: `services/sniper/test/runtime/category-refresh.spec.ts`
- Anlegen: `services/sniper/test/store/category.store.integration.spec.ts`

**Schnittstellen:**

- Verbraucht: `VintedCategory` und `parseCategoryTree` aus Task 2; Tabellen aus Task 1
- Erzeugt:
  - `export interface CategorySyncState { refreshedAt: string | null; requestedAt: string | null }`
  - `export function isRefreshDue(state: CategorySyncState, now: Date, maxAgeMs: number): boolean`
  - `export class CategoryStore` mit `readSyncState(): Promise<CategorySyncState>`, `replaceAll(categories: VintedCategory[]): Promise<void>`, `markRefreshed(count: number, at: Date): Promise<void>`, `markFailed(reason: string, at: Date): Promise<void>`

- [ ] **Schritt 1: Test für die Auffrischungsregel schreiben**

Anlegen: `services/sniper/test/runtime/category-refresh.spec.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { isRefreshDue } from '../../src/runtime/category-refresh.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-06T12:00:00.000Z');

describe('isRefreshDue', () => {
  it('liest ein, wenn noch nie eingelesen wurde', () => {
    expect(isRefreshDue({ refreshedAt: null, requestedAt: null }, now, DAY_MS)).toBe(true);
  });

  it('liest nicht erneut, solange der Stand jung genug ist', () => {
    const state = { refreshedAt: '2026-09-06T06:00:00.000Z', requestedAt: null };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(false);
  });

  it('liest ein, sobald der Stand aelter als die Frist ist', () => {
    const state = { refreshedAt: '2026-09-05T06:00:00.000Z', requestedAt: null };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(true);
  });

  it('liest ein, wenn jemand nach dem letzten Lauf angefordert hat', () => {
    const state = {
      refreshedAt: '2026-09-06T06:00:00.000Z',
      requestedAt: '2026-09-06T11:00:00.000Z',
    };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(true);
  });

  it('liest nicht wegen einer Anforderung, die vor dem letzten Lauf lag', () => {
    const state = {
      refreshedAt: '2026-09-06T06:00:00.000Z',
      requestedAt: '2026-09-06T05:00:00.000Z',
    };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und scheitern sehen**

```bash
cd services/sniper && npx vitest run test/runtime/category-refresh.spec.ts
```

Erwartet: FEHLER — `Cannot find module '../../src/runtime/category-refresh.js'`.

- [ ] **Schritt 3: Auffrischungsregel schreiben**

Anlegen: `services/sniper/src/runtime/category-refresh.ts`

```typescript
export interface CategorySyncState {
  refreshedAt: string | null;
  requestedAt: string | null;
}

/**
 * Wann der Kategoriebaum neu eingelesen wird.
 *
 * Zwei Gruende, und nur diese beiden: Der gespeicherte Stand ist aelter als die
 * Frist, oder jemand hat in der Administration ausdruecklich angefordert.
 *
 * Bewusst in TypeScript entschieden statt in SQL - genauso wie die
 * Faelligkeit einer Abfrage in query.store.ts. So bleibt die Regel ohne
 * Datenbank testbar.
 */
export function isRefreshDue(state: CategorySyncState, now: Date, maxAgeMs: number): boolean {
  if (state.refreshedAt === null) return true;

  const refreshed = new Date(state.refreshedAt).getTime();

  if (state.requestedAt !== null && new Date(state.requestedAt).getTime() > refreshed) {
    return true;
  }

  return now.getTime() - refreshed >= maxAgeMs;
}
```

- [ ] **Schritt 4: Test laufen lassen und bestehen sehen**

```bash
cd services/sniper && npx vitest run test/runtime/category-refresh.spec.ts
```

Erwartet: `5 passed`.

- [ ] **Schritt 5: Integrationstest für den Speicher schreiben**

Anlegen: `services/sniper/test/store/category.store.integration.spec.ts`

Der Aufbau folgt `test/store/query.store.integration.spec.ts` — **diese Datei zuerst lesen** und Verbindungsaufbau, `beforeAll` und Aufräumen daraus übernehmen, statt sie neu zu erfinden.

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { CategoryStore } from '../../src/store/category.store.js';
import type { VintedCategory } from '../../src/vinted/categories.js';

const url = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
const client = createClient(url, key);
const store = new CategoryStore(client);

const categories: VintedCategory[] = [
  { id: 1904, parentId: null, title: 'Damen', slug: '1904-women', path: 'Damen', isLeaf: false },
  {
    id: 16,
    parentId: 1904,
    title: 'Schuhe',
    slug: '16-shoes',
    path: 'Damen > Schuhe',
    isLeaf: true,
  },
];

describe('CategoryStore', () => {
  beforeEach(async () => {
    await client.from('vinted_categories').delete().gte('id', 0);
    await client
      .from('vinted_category_sync')
      .update({ refreshed_at: null, requested_at: null, category_count: 0, last_error: null })
      .eq('id', 1);
  });

  it('schreibt den Baum und liest den Stand zurueck', async () => {
    await store.replaceAll(categories);
    await store.markRefreshed(categories.length, new Date('2026-09-06T12:00:00.000Z'));

    const { data } = await client
      .from('vinted_categories')
      .select('id, parent_id, path')
      .order('id');

    expect(data).toEqual([
      { id: 16, parent_id: 1904, path: 'Damen > Schuhe' },
      { id: 1904, parent_id: null, path: 'Damen' },
    ]);

    const state = await store.readSyncState();
    expect(state.refreshedAt).toBe('2026-09-06T12:00:00+00:00');
  });

  it('ersetzt einen frueheren Stand vollstaendig', async () => {
    await store.replaceAll(categories);
    await store.replaceAll([
      { id: 5, parentId: null, title: 'Herren', slug: '5-men', path: 'Herren', isLeaf: true },
    ]);

    const { data } = await client.from('vinted_categories').select('id');

    expect(data).toEqual([{ id: 5 }]);
  });

  it('haelt einen Fehlschlag fest, ohne den letzten guten Stand zu loeschen', async () => {
    await store.replaceAll(categories);
    await store.markRefreshed(categories.length, new Date('2026-09-06T12:00:00.000Z'));
    await store.markFailed(
      'Kein catalogTree im HTML gefunden',
      new Date('2026-09-06T13:00:00.000Z'),
    );

    const { data } = await client.from('vinted_categories').select('id');
    expect(data).toHaveLength(2);

    const { data: sync } = await client
      .from('vinted_category_sync')
      .select('last_error, refreshed_at')
      .eq('id', 1)
      .single();

    expect(sync?.last_error).toBe('Kein catalogTree im HTML gefunden');
    expect(sync?.refreshed_at).toBe('2026-09-06T12:00:00+00:00');
  });
});
```

- [ ] **Schritt 6: Test laufen lassen und scheitern sehen**

```bash
cd services/sniper && npx vitest run --config vitest.integration.config.ts test/store/category.store.integration.spec.ts
```

Erwartet: FEHLER — `Cannot find module '../../src/store/category.store.js'`.

- [ ] **Schritt 7: Speicher schreiben**

Anlegen: `services/sniper/src/store/category.store.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

import type { CategorySyncState } from '../runtime/category-refresh.js';
import type { VintedCategory } from '../vinted/categories.js';

/**
 * Schreibt den Kategoriebaum und fuehrt den Auffrischungsstand.
 *
 * `replaceAll` ersetzt vollstaendig statt zusammenzufuehren: Eine Kategorie,
 * die Vinted entfernt hat, soll auch bei uns verschwinden. Ein Zusammenfuehren
 * liesse Karteileichen stehen, und die tauchten spaeter im Kategoriewaehler
 * auf, ohne je Funde zu liefern.
 *
 * Ein Fehlschlag loescht nichts. Der letzte gute Stand bleibt benutzbar, und
 * die Administration sieht am Fehlertext, dass er alt ist.
 */
export class CategoryStore {
  constructor(private readonly client: SupabaseClient) {}

  async readSyncState(): Promise<CategorySyncState> {
    const { data, error } = await this.client
      .from('vinted_category_sync')
      .select('refreshed_at, requested_at')
      .eq('id', 1)
      .single();

    if (error) throw new Error(error.message);

    return {
      refreshedAt: (data?.['refreshed_at'] as string | null) ?? null,
      requestedAt: (data?.['requested_at'] as string | null) ?? null,
    };
  }

  async replaceAll(categories: VintedCategory[]): Promise<void> {
    // Erst leeren, dann schreiben. Die Eltern stehen im selben Schwung wie die
    // Kinder - deshalb muss der Fremdschluessel aufschiebbar sein oder die
    // Reihenfolge stimmen. Sortiert nach Tiefe des Pfades kommt jeder Elternteil
    // vor seinen Kindern.
    const { error: deleteError } = await this.client
      .from('vinted_categories')
      .delete()
      .gte('id', 0);
    if (deleteError) throw new Error(deleteError.message);

    const ordered = [...categories].sort(
      (left, right) => left.path.split(' > ').length - right.path.split(' > ').length,
    );

    const rows = ordered.map((category) => ({
      id: category.id,
      parent_id: category.parentId,
      title: category.title,
      slug: category.slug,
      path: category.path,
      is_leaf: category.isLeaf,
      updated_at: new Date().toISOString(),
    }));

    // In Blöcken schreiben: Rund 2900 Zeilen in einem Rutsch sprengen die
    // Anfragegroesse von PostgREST.
    for (let start = 0; start < rows.length; start += 500) {
      const { error } = await this.client
        .from('vinted_categories')
        .insert(rows.slice(start, start + 500));
      if (error) throw new Error(error.message);
    }
  }

  async markRefreshed(count: number, at: Date): Promise<void> {
    const { error } = await this.client
      .from('vinted_category_sync')
      .update({
        refreshed_at: at.toISOString(),
        last_attempt_at: at.toISOString(),
        category_count: count,
        last_error: null,
      })
      .eq('id', 1);

    if (error) throw new Error(error.message);
  }

  async markFailed(reason: string, at: Date): Promise<void> {
    const { error } = await this.client
      .from('vinted_category_sync')
      .update({ last_attempt_at: at.toISOString(), last_error: reason })
      .eq('id', 1);

    if (error) throw new Error(error.message);
  }
}
```

- [ ] **Schritt 8: Test laufen lassen und bestehen sehen**

```bash
cd services/sniper && npx vitest run --config vitest.integration.config.ts test/store/category.store.integration.spec.ts
```

Erwartet: `3 passed`. Läuft der Test nicht, weil die lokale Datenbank fehlt: `npx supabase start` im Projektstamm.

- [ ] **Schritt 9: Commit**

```bash
git add services/sniper/src/store/category.store.ts services/sniper/src/runtime/category-refresh.ts services/sniper/test/runtime/category-refresh.spec.ts services/sniper/test/store/category.store.integration.spec.ts
git commit -m "feat(sniper): persist the category tree and decide when to refresh"
```

---

### Task 4: Auffrischung in den Dienst einhängen

**Dateien:**

- Ändern: `services/sniper/src/config.ts`
- Ändern: `services/sniper/src/index.ts`
- Ändern: `services/sniper/test/config.spec.ts`
- Anlegen: `services/sniper/src/runtime/refresh-categories.ts`
- Anlegen: `services/sniper/test/runtime/refresh-categories.spec.ts`

**Schnittstellen:**

- Verbraucht: `isRefreshDue`, `CategoryStore` aus Task 3; `parseCategoryTree` aus Task 2
- Erzeugt: `export async function refreshCategoriesIfDue(deps: RefreshDeps, now: Date): Promise<'skipped' | 'refreshed' | 'failed'>` mit `interface RefreshDeps { store: CategoryStoreLike; fetchHomepage: () => Promise<string>; maxAgeMs: number; log: Logger }`

- [ ] **Schritt 1: Test schreiben**

Anlegen: `services/sniper/test/runtime/refresh-categories.spec.ts`

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { refreshCategoriesIfDue } from '../../src/runtime/refresh-categories.js';
import type { CategorySyncState } from '../../src/runtime/category-refresh.js';
import type { VintedCategory } from '../../src/vinted/categories.js';

const html = readFileSync(new URL('../fixtures/vinted-homepage.html', import.meta.url), 'utf8');
const now = new Date('2026-09-06T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const log = { info: vi.fn(), error: vi.fn() };

function storeStub(state: CategorySyncState) {
  return {
    readSyncState: vi.fn(async (): Promise<CategorySyncState> => state),
    replaceAll: vi.fn(async (_categories: VintedCategory[]): Promise<void> => undefined),
    markRefreshed: vi.fn(async (): Promise<void> => undefined),
    markFailed: vi.fn(async (): Promise<void> => undefined),
  };
}

describe('refreshCategoriesIfDue', () => {
  it('tut nichts, solange der Stand jung genug ist', async () => {
    const store = storeStub({ refreshedAt: '2026-09-06T06:00:00.000Z', requestedAt: null });
    const fetchHomepage = vi.fn(async () => html);

    const result = await refreshCategoriesIfDue(
      { store, fetchHomepage, maxAgeMs: DAY_MS, log },
      now,
    );

    expect(result).toBe('skipped');
    expect(fetchHomepage).not.toHaveBeenCalled();
    expect(store.replaceAll).not.toHaveBeenCalled();
  });

  it('liest ein und haelt den Stand fest, wenn faellig', async () => {
    const store = storeStub({ refreshedAt: null, requestedAt: null });
    const fetchHomepage = vi.fn(async () => html);

    const result = await refreshCategoriesIfDue(
      { store, fetchHomepage, maxAgeMs: DAY_MS, log },
      now,
    );

    expect(result).toBe('refreshed');
    expect(store.replaceAll).toHaveBeenCalledOnce();
    expect(store.replaceAll.mock.calls[0]?.[0]).toHaveLength(6);
    expect(store.markRefreshed).toHaveBeenCalledWith(6, now);
  });

  it('haelt einen Fehlschlag fest und wirft nicht', async () => {
    const store = storeStub({ refreshedAt: null, requestedAt: null });
    const fetchHomepage = vi.fn(async () => '<html><body>nichts</body></html>');

    const result = await refreshCategoriesIfDue(
      { store, fetchHomepage, maxAgeMs: DAY_MS, log },
      now,
    );

    expect(result).toBe('failed');
    expect(store.replaceAll).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith('Kein catalogTree im HTML gefunden', now);
  });

  it('schreibt nichts, wenn schon das Abholen scheitert', async () => {
    const store = storeStub({ refreshedAt: null, requestedAt: null });
    const fetchHomepage = vi.fn(async () => {
      throw new Error('HTTP 503');
    });

    const result = await refreshCategoriesIfDue(
      { store, fetchHomepage, maxAgeMs: DAY_MS, log },
      now,
    );

    expect(result).toBe('failed');
    expect(store.replaceAll).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith('HTTP 503', now);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und scheitern sehen**

```bash
cd services/sniper && npx vitest run test/runtime/refresh-categories.spec.ts
```

Erwartet: FEHLER — `Cannot find module '../../src/runtime/refresh-categories.js'`.

- [ ] **Schritt 3: Ablauf schreiben**

Anlegen: `services/sniper/src/runtime/refresh-categories.ts`

```typescript
import type { Logger } from '../log.js';
import { parseCategoryTree, type VintedCategory } from '../vinted/categories.js';
import { isRefreshDue, type CategorySyncState } from './category-refresh.js';

export interface CategoryStoreLike {
  readSyncState(): Promise<CategorySyncState>;
  replaceAll(categories: VintedCategory[]): Promise<void>;
  markRefreshed(count: number, at: Date): Promise<void>;
  markFailed(reason: string, at: Date): Promise<void>;
}

export interface RefreshDeps {
  store: CategoryStoreLike;
  fetchHomepage: () => Promise<string>;
  maxAgeMs: number;
  log: Logger;
}

/**
 * Frischt den Kategoriebaum auf, wenn er faellig ist.
 *
 * Wirft nie: Ein gescheitertes Einlesen darf den Takt des Sammelns nicht
 * anhalten. Der Grund landet im Auffrischungsstand und ist in der
 * Administration sichtbar.
 */
export async function refreshCategoriesIfDue(
  deps: RefreshDeps,
  now: Date,
): Promise<'skipped' | 'refreshed' | 'failed'> {
  let state: CategorySyncState;

  try {
    state = await deps.store.readSyncState();
  } catch (error) {
    deps.log.error('category_sync_state_failed', { reason: reasonOf(error) });
    return 'failed';
  }

  if (!isRefreshDue(state, now, deps.maxAgeMs)) return 'skipped';

  try {
    const html = await deps.fetchHomepage();
    const categories = parseCategoryTree(html);

    await deps.store.replaceAll(categories);
    await deps.store.markRefreshed(categories.length, now);

    deps.log.info('categories_refreshed', { count: categories.length });
    return 'refreshed';
  } catch (error) {
    const reason = reasonOf(error);
    deps.log.error('categories_refresh_failed', { reason });

    try {
      await deps.store.markFailed(reason, now);
    } catch (markError) {
      deps.log.error('category_mark_failed', { reason: reasonOf(markError) });
    }

    return 'failed';
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Schritt 4: Test laufen lassen und bestehen sehen**

```bash
cd services/sniper && npx vitest run test/runtime/refresh-categories.spec.ts
```

Erwartet: `4 passed`.

- [ ] **Schritt 5: Frist in die Konfiguration aufnehmen**

Ändern: `services/sniper/src/config.ts` — im Zod-Schema neben den vorhandenen Einträgen ergänzen:

```typescript
  SNIPER_CATEGORY_MAX_AGE_MS: z.coerce.number().int().min(60_000).default(86_400_000),
```

und im zurückgegebenen Objekt:

```typescript
    categoryMaxAgeMs: parsed.SNIPER_CATEGORY_MAX_AGE_MS,
```

Ändern: `services/sniper/test/config.spec.ts` — im Test `applies documented defaults` eine Zeile ergänzen und einen neuen Test anhängen:

```typescript
expect(config.categoryMaxAgeMs).toBe(86_400_000);
```

```typescript
it('rejects a category age below one minute', () => {
  expect(() => loadConfig({ ...validEnv, SNIPER_CATEGORY_MAX_AGE_MS: '59000' })).toThrow();
});
```

Danach laufen lassen:

```bash
cd services/sniper && npx vitest run test/config.spec.ts
```

Erwartet: `4 passed`.

Ändern: `services/sniper/.env.example` — Zeile ergänzen:

```text
SNIPER_CATEGORY_MAX_AGE_MS=86400000
```

- [ ] **Schritt 6: In den Dienst einhängen**

Ändern: `services/sniper/src/index.ts`.

Importe ergänzen:

```typescript
import { CategoryStore } from './store/category.store.js';
import { refreshCategoriesIfDue } from './runtime/refresh-categories.js';
```

Nach `const queries = new QueryStore(client);` ergänzen:

```typescript
const categories = new CategoryStore(client);
```

In der Hauptschleife, **vor** `const report = await scheduler.runOnce(now);`, einfügen:

```typescript
// Vor dem Sammeln, nicht danach: Faellt das Einlesen aus, soll das Sammeln
// trotzdem laufen - und die Kategorien sind fuer den naechsten Takt aktuell.
// Das Abholen der Startseite geht ueber dieselbe gezaehlte fetch-Funktion
// wie alles andere, sonst zaehlt es nicht gegen das Budget.
await refreshCategoriesIfDue(
  {
    store: categories,
    fetchHomepage: async () => {
      const response = await counted(config.vintedBaseUrl, {
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': config.userAgent },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
    maxAgeMs: config.categoryMaxAgeMs,
    log,
  },
  now,
);
```

**Wichtig:** `const now = new Date();` steht bereits im `try`-Block und muss vor diesem Aufruf stehen bleiben.

- [ ] **Schritt 7: Alle Diensttests und Typprüfung laufen lassen**

```bash
cd services/sniper && npm test && npm run typecheck && npm run build
```

Erwartet: alle Tests grün, keine Typfehler, Bau erfolgreich.

- [ ] **Schritt 8: Commit**

```bash
git add services/sniper/src services/sniper/test services/sniper/.env.example
git commit -m "feat(sniper): refresh the category tree from the service loop"
```

---

### Task 5: Angular-Dienst für Kategorien und Auffrischungsstand

**Dateien:**

- Anlegen: `src/app/features/platform-admin/models/vinted-category.model.ts`
- Anlegen: `src/app/features/platform-admin/services/vinted-category.service.ts`
- Anlegen: `src/app/features/platform-admin/services/vinted-category.service.angular.spec.ts`

**Schnittstellen:**

- Verbraucht: `SupabaseService` aus `src/app/core/services/supabase.service.ts`; Tabellen aus Task 1
- Erzeugt:
  - `export interface VintedCategory { id: number; parentId: number | null; title: string; path: string; isLeaf: boolean }`
  - `export interface CategorySyncStatus { refreshedAt: string | null; requestedAt: string | null; lastAttemptAt: string | null; categoryCount: number; lastError: string | null }`
  - `export class VintedCategoryService` mit `listLeaves(): Promise<VintedCategory[]>`, `readStatus(): Promise<CategorySyncStatus>`, `requestRefresh(): Promise<void>`

- [ ] **Schritt 1: Modell anlegen**

Anlegen: `src/app/features/platform-admin/models/vinted-category.model.ts`

```typescript
/** Eine Kategorie von Vinted. Die id ist deren Nummer und geht so in catalog_ids. */
export interface VintedCategory {
  id: number;
  parentId: number | null;
  title: string;
  /** Lesbarer Pfad wie "Damen > Schuhe > Stiefel". */
  path: string;
  isLeaf: boolean;
}

/** Stand des zuletzt eingelesenen Kategoriebaums. */
export interface CategorySyncStatus {
  refreshedAt: string | null;
  requestedAt: string | null;
  lastAttemptAt: string | null;
  categoryCount: number;
  lastError: string | null;
}
```

- [ ] **Schritt 2: Test schreiben**

Anlegen: `src/app/features/platform-admin/services/vinted-category.service.angular.spec.ts`

Der Aufbau folgt `src/app/features/platform-admin/services/beta-application.service.angular.spec.ts` — **diese Datei zuerst lesen** und die Art, wie dort `SupabaseService` ersetzt wird, wörtlich übernehmen.

```typescript
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedCategoryService } from './vinted-category.service';

function clientStub(overrides: Record<string, unknown>) {
  return { client: overrides } as unknown as SupabaseService;
}

describe('VintedCategoryService', () => {
  let service: VintedCategoryService;

  const configure = (supabase: SupabaseService): void => {
    TestBed.configureTestingModule({
      providers: [VintedCategoryService, { provide: SupabaseService, useValue: supabase }],
    });
    service = TestBed.inject(VintedCategoryService);
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('liefert nur Blattkategorien, nach Pfad sortiert', async () => {
    const order = vi.fn(async () => ({
      data: [
        {
          id: 1049,
          parent_id: 16,
          title: 'Stiefel',
          path: 'Damen > Schuhe > Stiefel',
          is_leaf: true,
        },
      ],
      error: null,
    }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    configure(clientStub({ from }));

    const categories = await service.listLeaves();

    expect(from).toHaveBeenCalledWith('vinted_categories');
    expect(eq).toHaveBeenCalledWith('is_leaf', true);
    expect(order).toHaveBeenCalledWith('path', { ascending: true });
    expect(categories).toEqual([
      { id: 1049, parentId: 16, title: 'Stiefel', path: 'Damen > Schuhe > Stiefel', isLeaf: true },
    ]);
  });

  it('meldet einen Datenbankfehler als Fehler weiter', async () => {
    const order = vi.fn(async () => ({ data: null, error: { message: 'keine Rechte' } }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    configure(clientStub({ from: vi.fn(() => ({ select })) }));

    await expect(service.listLeaves()).rejects.toThrow('keine Rechte');
  });

  it('liest den Auffrischungsstand', async () => {
    const single = vi.fn(async () => ({
      data: {
        refreshed_at: '2026-09-06T12:00:00+00:00',
        requested_at: null,
        last_attempt_at: '2026-09-06T12:00:00+00:00',
        category_count: 2920,
        last_error: null,
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    configure(clientStub({ from: vi.fn(() => ({ select })) }));

    const status = await service.readStatus();

    expect(status.categoryCount).toBe(2920);
    expect(status.refreshedAt).toBe('2026-09-06T12:00:00+00:00');
    expect(status.lastError).toBeNull();
  });

  it('fordert eine Auffrischung an, indem es nur requested_at setzt', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    configure(clientStub({ from: vi.fn(() => ({ update })) }));

    await service.requestRefresh();

    expect(Object.keys(update.mock.calls[0]?.[0] as object)).toEqual(['requested_at']);
    expect(eq).toHaveBeenCalledWith('id', 1);
  });
});
```

- [ ] **Schritt 3: Test laufen lassen und scheitern sehen**

```bash
npx vitest run --project=angular src/app/features/platform-admin/services/vinted-category.service.angular.spec.ts
```

Erwartet: FEHLER — Modul `./vinted-category.service` nicht gefunden.

- [ ] **Schritt 4: Dienst schreiben**

Anlegen: `src/app/features/platform-admin/services/vinted-category.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CategorySyncStatus, VintedCategory } from '../models/vinted-category.model';

/**
 * Liest den Kategoriebaum und seinen Auffrischungsstand.
 *
 * Geschrieben wird hier nur ein einziges Feld: `requested_at`. Alles andere
 * setzt der Sniper-Dienst mit Dienstschluessel. Die Datenbank laesst es auch
 * gar nicht anders zu - angemeldete Konten haben nur auf diese eine Spalte ein
 * Schreibrecht.
 */
@Injectable({ providedIn: 'root' })
export class VintedCategoryService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Nur Blaetter: Eine Zwischenkategorie als Sammelauftrag waere zu breit, und
   * der Waehler soll gar nicht erst dazu einladen.
   */
  async listLeaves(): Promise<VintedCategory[]> {
    const { data, error } = await this.supabase.client
      .from('vinted_categories')
      .select('id, parent_id, title, path, is_leaf')
      .eq('is_leaf', true)
      .order('path', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: row.id as number,
      parentId: (row.parent_id as number | null) ?? null,
      title: row.title as string,
      path: row.path as string,
      isLeaf: row.is_leaf as boolean,
    }));
  }

  async readStatus(): Promise<CategorySyncStatus> {
    const { data, error } = await this.supabase.client
      .from('vinted_category_sync')
      .select('refreshed_at, requested_at, last_attempt_at, category_count, last_error')
      .eq('id', 1)
      .single();

    if (error) throw new Error(error.message);

    return {
      refreshedAt: (data?.['refreshed_at'] as string | null) ?? null,
      requestedAt: (data?.['requested_at'] as string | null) ?? null,
      lastAttemptAt: (data?.['last_attempt_at'] as string | null) ?? null,
      categoryCount: (data?.['category_count'] as number | null) ?? 0,
      lastError: (data?.['last_error'] as string | null) ?? null,
    };
  }

  async requestRefresh(): Promise<void> {
    const { error } = await this.supabase.client
      .from('vinted_category_sync')
      .update({ requested_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) throw new Error(error.message);
  }
}
```

- [ ] **Schritt 5: Test laufen lassen und bestehen sehen**

```bash
npx vitest run --project=angular src/app/features/platform-admin/services/vinted-category.service.angular.spec.ts
```

Erwartet: `4 passed`.

- [ ] **Schritt 6: Commit**

```bash
git add src/app/features/platform-admin/models/vinted-category.model.ts src/app/features/platform-admin/services/vinted-category.service.ts src/app/features/platform-admin/services/vinted-category.service.angular.spec.ts
git commit -m "feat(sniper): read the category tree and its refresh state in the app"
```

---

### Task 6: Administrationsseite „Kategorieliste"

**Dateien:**

- Anlegen: `src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.ts`
- Anlegen: `src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.html`
- Anlegen: `src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.angular.spec.ts`
- Ändern: `src/app/features/platform-admin/platform-admin.routes.ts`
- Ändern: `src/app/core/i18n/translations.ts` (Zeile `PLATFORM_ADMIN: 'Betreiber'`)
- Ändern: `src/app/layout/sidebar/sidebar.component.ts` (Label und Kommentar)

**Schnittstellen:**

- Verbraucht: `VintedCategoryService`, `CategorySyncStatus` aus Task 5
- Erzeugt: Route `categories` unterhalb von `/platform-admin`

- [ ] **Schritt 1: Test schreiben**

Anlegen: `src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.angular.spec.ts`

Aufbau nach `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.angular.spec.ts` — **diese Datei zuerst lesen**, besonders wie dort das Template aufgelöst wird.

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VintedCategoriesComponent } from './vinted-categories.component';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { CategorySyncStatus } from '../../models/vinted-category.model';

const status: CategorySyncStatus = {
  refreshedAt: '2026-09-06T12:00:00+00:00',
  requestedAt: null,
  lastAttemptAt: '2026-09-06T12:00:00+00:00',
  categoryCount: 2920,
  lastError: null,
};

describe('VintedCategoriesComponent', () => {
  let fixture: ComponentFixture<VintedCategoriesComponent>;
  let serviceStub: {
    readStatus: ReturnType<typeof vi.fn>;
    requestRefresh: ReturnType<typeof vi.fn>;
  };

  const build = async (initial: CategorySyncStatus): Promise<void> => {
    serviceStub = {
      readStatus: vi.fn(async () => initial),
      requestRefresh: vi.fn(async () => undefined),
    };

    await TestBed.configureTestingModule({
      imports: [VintedCategoriesComponent],
      providers: [{ provide: VintedCategoryService, useValue: serviceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(VintedCategoriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('zeigt die Zahl der Kategorien und den Zeitpunkt des letzten Einlesens', async () => {
    await build(status);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('2920');
  });

  it('fordert beim Knopfdruck eine Auffrischung an', async () => {
    await build(status);

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="request-refresh"]',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(serviceStub.requestRefresh).toHaveBeenCalledOnce();
  });

  it('zeigt den letzten Fehler an, wenn einer vorliegt', async () => {
    await build({ ...status, lastError: 'Kein catalogTree im HTML gefunden' });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Kein catalogTree im HTML gefunden');
  });

  it('sagt es deutlich, wenn noch nie eingelesen wurde', async () => {
    await build({ ...status, refreshedAt: null, categoryCount: 0 });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Noch nie eingelesen');
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und scheitern sehen**

```bash
npx vitest run --project=angular src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.angular.spec.ts
```

Erwartet: FEHLER — Modul `./vinted-categories.component` nicht gefunden.

- [ ] **Schritt 3: Komponente schreiben**

Anlegen: `src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.ts`

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CategorySyncStatus } from '../../models/vinted-category.model';
import { VintedCategoryService } from '../../services/vinted-category.service';

/**
 * Zeigt, wie frisch der gespeicherte Kategoriebaum ist, und erlaubt es, ein
 * erneutes Einlesen anzufordern.
 *
 * Der Knopf stoesst den Dienst nicht direkt an - er setzt nur ein Feld in der
 * Datenbank. Der Sniper sieht es beim naechsten Takt. Deshalb sagt die
 * Oberflaeche "angefordert" und nicht "aufgefrischt": Der Unterschied ist
 * echt, und ihn zu verschweigen liesse jemanden vergeblich auf eine sofortige
 * Aenderung warten.
 */
@Component({
  selector: 'app-vinted-categories',
  imports: [DatePipe],
  templateUrl: './vinted-categories.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedCategoriesComponent {
  private readonly categories = inject(VintedCategoryService);

  protected readonly status = signal<CategorySyncStatus | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly requesting = signal(false);
  protected readonly requested = signal(false);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.status.set(await this.categories.readStatus());
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected async requestRefresh(): Promise<void> {
    this.requesting.set(true);

    try {
      await this.categories.requestRefresh();
      this.requested.set(true);
      await this.load();
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.requesting.set(false);
    }
  }
}
```

- [ ] **Schritt 4: Template schreiben**

Anlegen: `src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.html`

```html
<section class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
  <header class="flex flex-col gap-1">
    <h1 class="text-xl font-semibold text-fb-text">Kategorieliste</h1>
    <p class="text-sm text-fb-text-muted">
      Der Kategoriebaum von Vinted. Er wird gespeichert, weil Vinted keine Liste zum Abrufen
      anbietet — der Baum steht nur im Seitenkopf und kann sich jederzeit ändern.
    </p>
  </header>

  @if (loadError(); as message) {
  <p class="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">
    {{ message }}
  </p>
  } @if (status(); as state) {
  <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div class="rounded-md border border-fb-line p-4">
      <dt class="text-sm text-fb-text-muted">Kategorien</dt>
      <dd class="mt-1 text-2xl font-semibold text-fb-text">{{ state.categoryCount }}</dd>
    </div>

    <div class="rounded-md border border-fb-line p-4">
      <dt class="text-sm text-fb-text-muted">Zuletzt eingelesen</dt>
      <dd class="mt-1 text-sm text-fb-text">
        @if (state.refreshedAt) { {{ state.refreshedAt | date: 'dd.MM.yyyy, HH:mm' }} Uhr } @else {
        Noch nie eingelesen }
      </dd>
    </div>
  </dl>

  @if (state.lastError; as failure) {
  <div class="rounded-md border border-amber-300 bg-amber-50 p-4">
    <p class="text-sm font-medium text-amber-900">Der letzte Versuch ist gescheitert</p>
    <p class="mt-1 text-sm text-amber-800">{{ failure }}</p>
    <p class="mt-2 text-sm text-amber-800">
      Die gespeicherte Liste bleibt gültig und benutzbar. Scheitert es wiederholt, hat Vinted
      vermutlich das Seitenformat geändert.
    </p>
  </div>
  }

  <div class="flex items-center gap-3">
    <button
      type="button"
      data-testid="request-refresh"
      class="rounded-md bg-fb-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      [disabled]="requesting()"
      (click)="requestRefresh()"
    >
      @if (requesting()) { Wird angefordert … } @else { Neu einlesen }
    </button>

    @if (requested()) {
    <p class="text-sm text-fb-text-muted">
      Angefordert. Der Dienst liest beim nächsten Takt neu ein.
    </p>
    }
  </div>
  }
</section>
```

**Hinweis zu den Farbklassen:** `text-fb-text`, `text-fb-text-muted`, `border-fb-line` und `bg-fb-accent` müssen in `src/styles.css` definiert sein. Vor dem Schreiben prüfen:

```bash
grep -n "fb-text-muted\|fb-line\|fb-accent" src/styles.css | head
```

Fehlt eine davon, die im Projekt tatsächlich vorhandene Entsprechung verwenden — **keine neue Variable erfinden**.

- [ ] **Schritt 5: Test laufen lassen und bestehen sehen**

```bash
npx vitest run --project=angular src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.angular.spec.ts
```

Erwartet: `4 passed`.

- [ ] **Schritt 6: Route eintragen**

Ändern: `src/app/features/platform-admin/platform-admin.routes.ts`

```typescript
import { Routes } from '@angular/router';

export const platformAdminRoutes: Routes = [
  { path: '', redirectTo: 'applications', pathMatch: 'full' },
  {
    path: 'applications',
    loadComponent: () =>
      import('./pages/beta-applications/beta-applications.component').then(
        (m) => m.BetaApplicationsComponent,
      ),
  },
  {
    path: 'categories',
    loadComponent: () =>
      import('./pages/vinted-categories/vinted-categories.component').then(
        (m) => m.VintedCategoriesComponent,
      ),
  },
];
```

- [ ] **Schritt 7: „Betreiber" zu „Administration" umbenennen**

Ändern: `src/app/core/i18n/translations.ts` — `PLATFORM_ADMIN: 'Betreiber'` wird zu `PLATFORM_ADMIN: 'Administration'`.

Ändern: `src/app/layout/sidebar/sidebar.component.ts` — `label: 'Betreiber'` wird zu `label: 'Administration'`; der Kommentar „Der Betreiberpunkt erscheint nur fuer Betreiber." wird zu „Der Punkt Administration erscheint nur fuer Betreiber der Plattform.".

**Die Route `/platform-admin` bleibt unverändert.** Ein Pfadwechsel bräche gespeicherte Verweise ohne Gegenwert.

Prüfen, dass kein sichtbarer Text mehr „Betreiber" sagt:

```bash
grep -rn "Betreiber" src/app --include=*.html --include=*.ts | grep -v "^.*://" | grep -viE "kommentar|betreiber der plattform"
```

Erwartet: nur noch Fundstellen in Kommentaren und in `platform-operator.service.ts` (dort ist „Betreiber" der Fachbegriff für die Rolle, nicht der Menüpunkt).

- [ ] **Schritt 8: Vollständige Prüfung**

```bash
npm run format:check && npm run lint && npm run typecheck && npm run test:angular && npm run build
```

Erwartet: alles grün. Der Bau ist hier Pflicht — `tsc` prüft keine Angular-Vorlagen, eine falsche Bindung fiele sonst erst in der CI auf.

- [ ] **Schritt 9: Im Browser nachsehen**

Dienst starten und `/platform-admin/categories` aufrufen. Erwartet: Zahl der Kategorien, Zeitpunkt des letzten Einlesens, Knopf „Neu einlesen". Nach dem Klick erscheint der Hinweis auf den nächsten Takt.

- [ ] **Schritt 10: Changelog und Commit**

Ändern: `docs/AI-CHANGELOG.md` — Eintrag oben ergänzen, nach dem Muster der vorhandenen Einträge: Anlass, Umsetzung, Prüfung.

```bash
git add src/app/features/platform-admin src/app/core/i18n/translations.ts src/app/layout/sidebar/sidebar.component.ts docs/AI-CHANGELOG.md
git commit -m "feat(sniper): show the category list in the administration area"
```

---

## Nach dem letzten Task

Vollständige Zweigprüfung vor dem Pull Request:

```bash
npx supabase db reset > /tmp/final-reset.log 2>&1; echo $?
npm run test:db > /tmp/final-db.log 2>&1; echo $?
cd services/sniper && npm test > /tmp/final-sniper.log 2>&1; echo $?; cd ../..
npm run verify > /tmp/final-verify.log 2>&1; echo $?
```

Alle vier müssen `0` melden. **Den Exitcode nicht durch eine Pipe messen** — `npm run verify | tail -20` meldet den Code von `tail`.

## Was dieser Plan bewusst nicht tut

- **Kein Kategoriewähler.** Der gehört zu Paket 2 (Sammelaufträge), wo er gebraucht wird. Hier entsteht nur die Datengrundlage dafür und `listLeaves()` als seine Schnittstelle.
- **Keine Änderung an `sniper_queries`.** Der Umbau zum Sammelauftrag ist Paket 2.
- **Keine Betriebssicht.** Die Kennzahlen zum Botbetrieb gehören zu Paket 2.
- **Kein Abgleich alter Kategorien.** Verschwindet eine Kategorie bei Vinted, verschwindet sie bei uns. Was passiert, wenn ein späterer Sammelauftrag auf eine verschwundene Kategorie zeigt, entscheidet Paket 2 — dort gibt es den Fremdschlüssel, um den es dabei geht.
