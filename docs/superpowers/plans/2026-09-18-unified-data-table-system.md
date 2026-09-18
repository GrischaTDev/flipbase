# Unified Data Table System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle administrativen Datenlisten in Flipbase verwenden denselben Shared-Rahmen für Tabellenfläche, Toolbar, Suche, Filter, Spalten-/Sortiermenü und Zustände.

**Architecture:** Ein neuer `DataTableComponent` kapselt die bestehende Tabellen-Toolbar und das `TableColumnMenuComponent`. Features projizieren nur fachliche Ansichtsfilter, zusätzliche Filter und Tabellen-/Mobile-Inhalte. `TablePreferencesService` bleibt für Spalten und Sortierung zuständig; Feature-Services und Filterlogik bleiben unverändert.

**Tech Stack:** Angular 22, Signals, Tailwind CSS, Vitest 4, bestehende Flipbase Shared Components, Supabase unverändert.

**Spec:** `docs/superpowers/specs/2026-09-18-unified-data-table-system-design.md`

## Global Constraints

- Verwaltungslisten verwenden denselben Shared-Rahmen; keine neue lokale Toolbar-Geometrie.
- Toolbar-Reihenfolge bleibt: Ansicht/Status -> Suche -> fachliche Filter -> Spalten/Sortierung.
- `#fcc601` bleibt Markenakzent; keine neue Akzentfarbe.
- Sichtbare Suche/Selects verwenden Shared-Komponenten.
- Fachlogik und Datenzugriff bleiben unverändert.
- Storefront ist nicht Teil dieses Umbaus.
- Kleine statische Detail-/Vorschautabellen erhalten keine künstlichen Filter.
- Angular-Komponenten bleiben standalone-default, OnPush und ohne Inline-Templates.

---

### Task 1: Shared DataTableComponent und erkennbare Toolbar-Felder

**Files:**

- Create: `src/app/shared/components/data-table/data-table.component.ts`
- Create: `src/app/shared/components/data-table/data-table.component.html`
- Create: `src/app/shared/components/data-table/data-table.component.angular.spec.ts`
- Modify: `src/app/shared/components/custom-search-input/custom-search-input.component.ts`
- Modify: `src/app/shared/components/custom-select/custom-select.component.html`
- Remove after migration: `src/app/shared/components/table-toolbar/table-toolbar.component.ts`
- Remove after migration: `src/app/shared/components/table-toolbar/table-toolbar.component.html`

**Interfaces:**

- Consumes: `ColumnDefinition<TColumnId>`, `SortFieldOption<TSortField>`, `TableSortState<TSortField>`, `TableColumnMenuComponent`, `CustomSearchInputComponent`.
- Produces:
  - inputs `ariaLabel: string`, `searchValue: string`, `searchPlaceholder: string`, `searchAriaLabel: string`, `searchEnabled: boolean`, `columns?: readonly ColumnDefinition[]`, `sortOptions?: readonly SortFieldOption[]`, `currentSort?: TableSortState`, `viewModified: boolean`, `loading: boolean`, `errorMessage: string | null`, `hasRows: boolean`, `loadingText: string`, `emptyTitle: string`, `emptyText: string`.
  - outputs `searchValueChange`, `columnVisibilityToggled`, `columnsReordered`, `sortChanged`, `viewResetRequested`.
  - projection slots `[table-view]`, `[table-filters]`, `[table-content]`, `[table-mobile]`, `[table-empty-action]`.

- [ ] **Step 1: Write failing Angular tests**

Create tests that render `DataTableComponent` and assert:

- `[data-data-table]` exists.
- toolbar DOM order is view -> search -> filters -> settings.
- search emits `searchValueChange`.
- settings only render when columns, sort options and current sort exist.
- loading/error/empty/content states are mutually exclusive.
- projected mobile content renders under the shared surface.
- AXE helper used by existing shared component tests reports no violation.

Expected before implementation: component import/file missing.

- [ ] **Step 2: Implement component contract**

Core template structure:

```html
<section
  data-data-table
  class="linear-surface relative overflow-visible rounded-xl"
  [attr.aria-label]="ariaLabel()"
>
  <div
    data-data-table-toolbar
    class="flex min-h-11 flex-wrap items-center gap-1 border-b border-fb-line p-2"
  >
    <ng-content select="[table-view]" />
    @if (searchEnabled()) {
    <div data-data-table-search class="min-w-44 flex-1">
      <app-custom-search-input
        variant="toolbar"
        size="sm"
        [value]="searchValue()"
        [placeholder]="searchPlaceholder()"
        [ariaLabel]="searchAriaLabel()"
        (valueChange)="searchValueChange.emit($event)"
      />
    </div>
    }
    <ng-content select="[table-filters]" />
    @if (hasSettings()) {
    <div data-data-table-settings class="ml-auto flex items-center border-l border-fb-line pl-2">
      <app-table-column-menu
        [columns]="columns()!"
        [sortOptions]="sortOptions()!"
        [currentSort]="currentSort()!"
        [viewModified]="viewModified()"
        (columnVisibilityToggled)="columnVisibilityToggled.emit($event)"
        (columnsReordered)="columnsReordered.emit($event)"
        (sortChanged)="sortChanged.emit($event)"
        (viewResetRequested)="viewResetRequested.emit()"
      />
    </div>
    }
  </div>

  @if (loading()) {
  <div data-data-table-loading role="status">...</div>
  } @else if (errorMessage()) {
  <div data-data-table-error role="alert">...</div>
  } @else if (!hasRows()) {
  <div data-data-table-empty>...</div>
  } @else {
  <div data-data-table-content><ng-content select="[table-content]" /></div>
  <div data-data-table-mobile><ng-content select="[table-mobile]" /></div>
  }
</section>
```

`hasSettings` is computed and true only when all three settings inputs are present.

- [ ] **Step 3: Make toolbar search/select visible at rest**

Change toolbar search classes from transparent to a quiet neutral resting state:

```ts
'w-full rounded-lg border border-fb-border-subtle bg-fb-subtle hover:border-fb-border hover:bg-fb-surface-hover focus:bg-fb-surface focus:border-fb-primary focus:ring-1 focus:ring-fb-primary';
```

Change `variant="toolbar"` select trigger equivalently:

```html
class="... border border-fb-border-subtle bg-fb-subtle ... hover:border-fb-border
hover:bg-fb-surface-hover ..."
```

No new colors.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npx vitest run --project=angular src/app/shared/components/data-table/data-table.component.angular.spec.ts src/app/shared/components/table-column-menu/table-column-menu.component.angular.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/data-table src/app/shared/components/custom-search-input/custom-search-input.component.ts src/app/shared/components/custom-select/custom-select.component.html
git commit -m "feat(ui): add shared data table frame"
```

---

### Task 2: Ausgaben vollständig auf den Shared-Rahmen und Tabellenpräferenzen umstellen

**Files:**

- Modify: `src/app/core/config/table-defaults.config.ts`
- Modify: `src/app/core/models/table-preferences.models.ts`
- Modify: `src/app/core/services/table-preferences.service.ts`
- Modify: `src/app/features/expenses/expenses.component.ts`
- Modify: `src/app/features/expenses/expenses.component.html`
- Modify: `src/app/features/expenses/expenses.component.angular.spec.ts`

**Interfaces:**

- Produces table id `expenses`.
- Produces `ExpensesColumnId` and `ExpensesSortField`.
- Consumes `DataTableComponent`.

- [ ] **Step 1: Write failing expense table tests**

Assert that:

- normal expenses render inside `app-data-table`,
- toolbar search placeholder is `Ausgaben durchsuchen`,
- status and category filters occupy `[table-filters]`,
- a settings trigger exists,
- visible columns follow stored table preferences,
- sort event changes row ordering,
- recurring expenses use the same shared frame without inventing another toolbar.

- [ ] **Step 2: Register expense table preferences**

Add:

```ts
export type ExpensesColumnId =
  | 'expense_date'
  | 'title'
  | 'category'
  | 'gross_amount'
  | 'vat_rate'
  | 'status'
  | 'due_or_paid'
  | 'recurring'
  | 'documents'
  | 'actions';

export type ExpensesSortField = 'expense_date' | 'title' | 'gross_amount' | 'status';
```

Default sort: `expense_date desc`. Lock `title` and `actions`.

Add `'expenses'` to `TableId` and registry.

- [ ] **Step 3: Move expense state to table preferences**

Inject `TablePreferencesService` and `WorkspaceService`. Add:

- `expensesTableConfig`
- `tablePrefs`
- `orderedVisibleColumns`
- `viewModified`
- handlers matching purchases/catalog.
  Sort after filtering using the selected sort.

- [ ] **Step 4: Replace local filter/card wrapper with DataTableComponent**

Use:

- status as `table-view` or first filter depending on final visual fit,
- search through shared search input owned by DataTable,
- category and remaining status control as `table-filters`,
- projected table body under `table-content`.

Remove the raw native search input.

Recurring list uses `app-data-table [searchEnabled]="false"` and projects the existing recurring table.

- [ ] **Step 5: Run targeted tests**

```bash
npx vitest run --project=angular src/app/features/expenses/expenses.component.angular.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/config/table-defaults.config.ts src/app/core/models/table-preferences.models.ts src/app/core/services/table-preferences.service.ts src/app/features/expenses
git commit -m "refactor(ui): move expenses to shared data table"
```

---

### Task 3: Artikelübersicht, Bestand und Artikelnavigation vereinheitlichen

**Files:**

- Modify: `src/app/core/config/workspace-navigation.ts`
- Modify: `src/app/core/config/article-navigation.ts`
- Modify: `src/app/core/config/article-navigation.spec.ts`
- Modify: `src/app/features/catalog/catalog.component.ts`
- Modify: `src/app/features/catalog/catalog.component.html`
- Modify: `src/app/features/inventory/inventory.component.html`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.html`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.ts`
- Modify relevant Angular specs.

**Interfaces:**

- Sidebar parent `/catalog` exposes children `/catalog` label `Alle Artikel` and `/inventory` label `Bestand`.
- Catalog and inventory consume `DataTableComponent`.

- [ ] **Step 1: Write failing navigation tests**

Assert:

- Article overview navigation item has two children.
- `/catalog` activates child `Alle Artikel`.
- `/inventory` activates parent and child `Bestand`.
- content-level `app-section-navigation` no longer renders on catalog/inventory.

- [ ] **Step 2: Update sidebar navigation model**

Keep `ARTICLE_VIEWS` as the canonical child list and attach it to the article overview item. Extend child active logic so the exact `/catalog` child does not swallow `/inventory`.

- [ ] **Step 3: Migrate catalog toolbar and table into DataTableComponent**

Remove the separate `linear-surface` toolbar. Bind existing table preferences to the shared frame. Project desktop table under `table-content` and current mobile cards under `table-mobile`.

- [ ] **Step 4: Migrate inventory list wrapper**

Move the inventory view selector/search/additional filters into the shared DataTable toolbar. `StockPositionListComponent` becomes the table-content renderer and no longer owns a competing toolbar/surface.

- [ ] **Step 5: Run tests**

```bash
npx vitest run --project=angular src/app/core/config/article-navigation.spec.ts src/app/features/catalog/catalog.component.angular.spec.ts src/app/features/inventory/components/stock-position-list/stock-position-list.component.angular.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/config src/app/features/catalog src/app/features/inventory
git commit -m "refactor(ui): unify article tables and navigation"
```

---

### Task 4: Hauptlisten auf DataTableComponent migrieren

**Files:**

- Modify: `src/app/features/purchases/purchases.component.html`
- Modify: `src/app/features/purchases/purchases.component.ts`
- Modify: `src/app/features/sales/sales.component.html`
- Modify: `src/app/features/sales/sales.component.ts`
- Modify: `src/app/features/sellers/sellers.component.html`
- Modify: `src/app/features/sellers/sellers.component.ts`
- Modify: `src/app/features/accounting/accounting.component.html`
- Modify: `src/app/features/accounting/accounting.component.ts`
- Modify: `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.html`
- Modify: corresponding Angular specs.

**Interfaces:**

- All consume `DataTableComponent`.
- Existing feature signals/handlers remain the source of data and filters.

- [ ] **Step 1: Add structural tests**

For each page assert the main managed list contains `app-data-table` and does not directly contain `app-table-column-menu`.

- [ ] **Step 2: Migrate purchases**

Replace `app-table-toolbar` + outer surface with `app-data-table`.
Keep status, seller and search behavior unchanged.

- [ ] **Step 3: Migrate sales**

Replace custom tab/search/settings toolbar with:

- platform/return tabs in `table-view`,
- shared search,
- settings owned by DataTable.
  Keep mobile sales rendering unchanged under `table-mobile`.

- [ ] **Step 4: Migrate sellers**

Use DataTable with:

- seller type in `table-view`,
- `searchEnabled=false` unless a real seller search is added as part of the existing behavior,
- archived visibility as `table-filters`.
  No fake search is introduced.

- [ ] **Step 5: Migrate accounting bank transaction list**

Only the managed bank transaction table is in this task. Tax/result report tables remain static tables because their role is reporting, not management.

- [ ] **Step 6: Migrate beta applications**

Move status view, search and table settings into DataTable. Replace raw search with shared search. Existing application decision controls remain unchanged.

- [ ] **Step 7: Run targeted Angular tests**

Run the affected component specs with `vitest --project=angular`.

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/purchases src/app/features/sales src/app/features/sellers src/app/features/accounting src/app/features/platform-admin/pages/beta-applications
git commit -m "refactor(ui): migrate core lists to shared data table"
```

---

### Task 5: Weitere verwaltbare Admin-Listen migrieren

**Files:**

- Modify as found: `src/app/features/platform-admin/pages/sniper-queries/*`
- Modify as found: other admin feature templates containing managed `linear-table` lists.
- Tests: matching Angular specs.

**Interfaces:**

- Same DataTable contract as Task 4.

- [ ] **Step 1: Inventory current admin table usage**

Search:

```bash
rg -n '<table|linear-table|app-table-toolbar|app-table-column-menu|type="search"' src/app/features --glob '*.html' --glob '!store/**'
```

Classify every hit:

- managed list -> migrate,
- static report/detail/preview/print -> documented exception.

- [ ] **Step 2: Migrate central Vinted brand filters**

Keep its existing shared search and pagination behavior. DataTable owns the toolbar and surface.

- [ ] **Step 3: Migrate every remaining managed list from the inventory**

Do not add unnecessary search/filter controls. The purpose is the same frame and positions, not feature inflation.

- [ ] **Step 4: Run the matching Angular specs**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features
git commit -m "refactor(ui): migrate remaining admin lists"
```

---

### Task 6: Architekturprüfung für den Tabellenstandard verschärfen

**Files:**

- Modify: `scripts/check-admin-shared-ui.mjs`
- Modify: `scripts/check-admin-shared-ui.test.mjs`

**Interfaces:**

- Produces rules:
  - `direct-table-column-menu`
  - `local-managed-table-toolbar`
  - `native-table-search`
  - `managed-table-without-data-table`

- [ ] **Step 1: Add red unit cases**

Add fixtures proving rejection of:

```html
<app-table-column-menu />
<input type="search" />
<div class="border-b ..."><app-custom-search-input /></div>
<section>
  <table class="linear-table">
    ...
  </table>
</section>
```

Allow explicit static exceptions only with a narrow marker:

```html
<table class="linear-table" data-shared-ui-exception="static-table"></table>
```

The marker is valid for preview/report/detail/print tables only; it never exempts a whole directory.

- [ ] **Step 2: Implement rules**

Feature templates that contain a managed table must contain `<app-data-table`.
Direct `app-table-column-menu` is forbidden outside shared components.
Visible native search inputs in feature templates are rejected when used beside a managed table.
Existing native file transport exception remains unchanged.

- [ ] **Step 3: Mark legitimate static tables**

Add the narrow marker to CSV previews, print/report tables and other audited static tables.

- [ ] **Step 4: Run workflow test**

```bash
node --test scripts/check-admin-shared-ui.test.mjs
node scripts/check-admin-shared-ui.mjs
```

Expected: zero findings.

- [ ] **Step 5: Commit**

```bash
git add scripts src/app/features
git commit -m "test(ui): enforce shared data table usage"
```

---

### Task 7: Abschluss, Dokumentation und Vollprüfung

**Files:**

- Modify: `docs/design/admin-ui-guidelines.md`
- Modify: `docs/AI-CHANGELOG.md`

- [ ] **Step 1: Document the mandatory table contract**

Add a concise rule:

- managed admin list = `DataTableComponent`,
- fixed toolbar order,
- no direct feature-level column menu,
- static tables require the explicit exception marker.

- [ ] **Step 2: Run focused formatting and lint**

```bash
npx prettier --check src/app/shared/components/data-table src/app/features/expenses src/app/features/catalog src/app/features/inventory src/app/features/purchases src/app/features/sales src/app/features/sellers src/app/features/accounting src/app/features/platform-admin scripts docs/design/admin-ui-guidelines.md
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run type and build checks**

```bash
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run workflow and affected tests**

```bash
npm run test:workflow
npm run test:angular
```

Expected: PASS.

- [ ] **Step 5: Record exact verification in AI changelog**

List only commands actually executed and their result.

- [ ] **Step 6: Commit docs**

```bash
git add docs
git commit -m "docs(ui): document shared data table standard"
```

- [ ] **Step 7: Final branch review**

Compare branch against master and confirm:

- no feature template directly renders `app-table-column-menu`,
- no managed list uses a local toolbar,
- no duplicate article section navigation remains,
- no feature logic changed beyond view/sort state required for expenses.
