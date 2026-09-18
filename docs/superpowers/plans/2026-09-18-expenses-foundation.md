# Ausgaben Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen produktionsfähigen Ausgaben-Bereich für einmalige und wiederkehrende Betriebskosten bauen, Belege sicher speichern und bezahlte Betriebsausgaben in den Dashboard-Cashflow einrechnen.

**Architecture:** Neue workspace-isolierte Supabase-Tabellen bilden Kategorien, Wiederholungsregeln, konkrete Ausgaben und Ausgabenbelege ab. Angular-Fachdienste halten die Daten in Signals, materialisieren fällige Wiederholungen idempotent und liefern der neuen `/expenses`-Seite sowie dem Dashboard dieselbe Datenquelle. Wareneinkäufe bleiben vollständig im bestehenden Purchase-Modell; die bestehende Verkaufsmarge wird nicht verändert.

**Tech Stack:** Angular 22 standalone + Signals + Reactive Forms, TypeScript 6, Vitest 4 (node/dom/angular Projekte), Supabase/Postgres mit RLS, Supabase Storage, Tailwind/Flipbase Shared Components.

**Spec:** `docs/superpowers/specs/2026-09-18-expenses-foundation-design.md`

## Global Constraints

- Wareneinkäufe bleiben unter `/purchases`; `/expenses` enthält nur allgemeine Betriebsausgaben.
- Bruttobetrag ist Pflicht; MwSt. ist optional und nur `null | 0 | 7 | 19`.
- Wiederholungen: `monthly | quarterly | yearly`; Startdatum Pflicht, Enddatum optional.
- Wiederkehrende Regeln erzeugen echte einzelne Ausgaben erst bis einschließlich lokalem heutigem Datum.
- Erzeugte Wiederholungsinstanzen starten als `open`; manuelle neue Ausgaben starten im Formular als `paid`.
- Nur bezahlte Ausgaben mit `payment_date` beeinflussen den Cashflow.
- Belege hängen an konkreten Ausgaben, niemals an Wiederholungsregeln.
- Storage bleibt privat; Dateigrenze 20 MiB; erlaubt: PDF, JPG/JPEG, PNG, XML.
- Alle neuen Public-Schema-Tabellen erhalten RLS und explizite Grants ausschließlich für benötigte Operationen.
- `service_role`/Secret Keys dürfen nicht im Frontend landen.
- Dashboard-Marge bleibt die umsatzgewichtete Verkaufsmarge; Betriebsausgaben verändern sie nicht.
- Bei Plattformfilter bleibt Cashflow unbekannt (`–`), weil Wareneinkäufe und Betriebsausgaben keiner Verkaufsplattform zugeordnet sind.
- Änderungen werden test-first umgesetzt; jeder Task endet mit einem eigenen Commit.
- Nach vollständigem grünen PR wird gemäß Nutzerentscheidung automatisch in `master` gemerged.

---

## File Map

### Datenbank

- Create: `supabase/schemas/180_expenses.sql` — kanonisches Schema für Kategorien, Regeln, Ausgaben, Ausgabenbelege, Storage und RLS.
- Create via `supabase migration new expenses_foundation`: `supabase/migrations/<generated>_expenses_foundation.sql` — deploybare Migration aus dem kanonischen Schema.
- Create: `supabase/tests/expenses.test.sql` — RLS, Constraints, Workspace-Integrität, Wiederholungs-Unique-Key und Dokumentrechte.
- Modify/generated: `src/app/core/models/supabase.types.ts` — neue Tabellenbeziehungen nach lokalem DB-Reset neu generieren.

### Domain

- Create: `src/app/core/models/expense.models.ts` — Expense-/Kategorie-/Regel-/Dokumenttypen und Form-Inputs.
- Create: `src/app/core/utils/expense-money.ts` — Brutto/Netto/MwSt.-Berechnung.
- Create: `src/app/core/utils/expense-money.spec.ts`.
- Create: `src/app/core/utils/expense-recurrence.ts` — kalenderstabile Fälligkeiten und 30-Tage-Vorschau.
- Create: `src/app/core/utils/expense-recurrence.spec.ts`.

### Services

- Create: `src/app/core/services/expense-category.service.ts`.
- Create: `src/app/core/services/expense-category.service.dom.spec.ts`.
- Create: `src/app/core/services/expense-recurring.service.ts`.
- Create: `src/app/core/services/expense-recurring.service.dom.spec.ts`.
- Create: `src/app/core/services/expense.service.ts`.
- Create: `src/app/core/services/expense.service.dom.spec.ts`.

### Dokumente

- Create: `src/app/core/models/private-document.models.ts` — gemeinsame MIME-/Größenvalidierung und Pfadhilfe.
- Modify: `src/app/core/models/purchase-document.models.ts` — bestehende Exporte als Alias auf die gemeinsame Basis erhalten.
- Update tests: `src/app/core/services/purchase-document.service.dom.spec.ts`.
- Create: `src/app/core/models/expense-document.models.ts`.
- Create: `src/app/core/services/expense-document.service.ts`.
- Create: `src/app/core/services/expense-document.service.dom.spec.ts`.
- Create: `src/app/features/expenses/components/expense-documents/expense-documents.component.ts`.
- Create: `src/app/features/expenses/components/expense-documents/expense-documents.component.html`.
- Create: `src/app/features/expenses/components/expense-documents/expense-documents.component.angular.spec.ts`.

### UI

- Create: `src/app/features/expenses/expenses.component.ts`.
- Create: `src/app/features/expenses/expenses.component.html`.
- Create: `src/app/features/expenses/expenses.component.angular.spec.ts`.
- Create: `src/app/features/expenses/components/expense-dialog/expense-dialog.component.ts`.
- Create: `src/app/features/expenses/components/expense-dialog/expense-dialog.component.html`.
- Create: `src/app/features/expenses/components/expense-dialog/expense-dialog.component.angular.spec.ts`.
- Create: `src/app/features/expenses/components/recurring-expense-dialog/recurring-expense-dialog.component.ts`.
- Create: `src/app/features/expenses/components/recurring-expense-dialog/recurring-expense-dialog.component.html`.
- Create: `src/app/features/expenses/components/recurring-expense-dialog/recurring-expense-dialog.component.angular.spec.ts`.
- Create: `src/app/features/expenses/components/expense-category-dialog/expense-category-dialog.component.ts`.
- Create: `src/app/features/expenses/components/expense-category-dialog/expense-category-dialog.component.html`.
- Create: `src/app/features/expenses/components/expense-category-dialog/expense-category-dialog.component.angular.spec.ts`.
- Modify: `src/app/app.routes.ts`.
- Modify: `src/app/core/config/workspace-navigation.ts`.
- Modify: `src/app/core/config/workspace-navigation.spec.ts`.
- Modify: `src/app/core/i18n/translations.ts`.
- Modify: `src/app/core/i18n/translations.spec.ts`.

### Dashboard

- Modify: `src/app/core/services/dashboard-report.service.ts`.
- Modify: `src/app/core/services/dashboard-report.service.spec.ts`.
- Modify: `src/app/core/models/flipbase.models.ts`.
- Modify: `src/app/features/dashboard/dashboard.component.ts`.
- Modify: `src/app/features/dashboard/dashboard.component.angular.spec.ts`.

---

### Task 1: Datenbankschema und RLS für Ausgaben

**Files:**
- Create: `supabase/schemas/180_expenses.sql`
- Create: `supabase/tests/expenses.test.sql`
- Create via CLI: `supabase/migrations/<generated>_expenses_foundation.sql`
- Regenerate: `src/app/core/models/supabase.types.ts`

**Interfaces:**
- Produces tables: `expense_categories`, `expense_recurring_rules`, `expenses`, `expense_documents`.
- Produces private bucket: `expense-documents`.
- Produces helper: `public.is_expense_document_path(text, uuid, uuid) returns boolean`.
- Produces trigger-backed default categories for every workspace.
- Later tasks consume generated `Tables<'expenses'>`, `Tables<'expense_categories'>`, `Tables<'expense_recurring_rules'>`, and `Tables<'expense_documents'>`.

- [ ] **Step 1: Write failing SQL tests for data integrity and workspace isolation**

Create `supabase/tests/expenses.test.sql` with focused assertions for:
- default categories exist for a workspace,
- custom category insert is allowed only in own workspace,
- foreign-workspace category cannot be attached to an expense,
- `paid` requires `payment_date`,
- `open` rejects `payment_date`,
- VAT accepts only `null, 0, 7, 19`,
- duplicate `(workspace_id, recurring_rule_id, occurrence_date)` fails,
- a soft-deleted occurrence still blocks a duplicate,
- RLS prevents another workspace reading/updating expenses,
- expense document path must match workspace + expense,
- another workspace cannot read/upload/remove a document.

Use the existing test fixture helpers from other `supabase/tests/*.test.sql` files rather than inventing a second auth fixture.

- [ ] **Step 2: Run DB tests and verify RED**

Run:

```bash
npm run test:db
```

Expected: FAIL because the four expense tables and `expense-documents` bucket do not exist.

- [ ] **Step 3: Create schema with explicit constraints**

Implement `supabase/schemas/180_expenses.sql` around this shape:

```sql
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create unique index expense_categories_active_name_uq
  on public.expense_categories (workspace_id, lower(btrim(name)))
  where is_archived = false;

create table public.expense_recurring_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  category_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  gross_amount numeric(12,2) not null check (gross_amount > 0),
  vat_rate numeric(5,2) check (vat_rate in (0, 7, 19)),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'yearly')),
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, category_id)
    references public.expense_categories(workspace_id, id) on delete restrict,
  check (end_date is null or end_date >= start_date),
  unique (workspace_id, id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  category_id uuid not null,
  recurring_rule_id uuid,
  occurrence_date date,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  gross_amount numeric(12,2) not null check (gross_amount > 0),
  vat_rate numeric(5,2) check (vat_rate in (0, 7, 19)),
  expense_date date not null,
  due_date date,
  status text not null check (status in ('open', 'paid')),
  payment_date date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, category_id)
    references public.expense_categories(workspace_id, id) on delete restrict,
  foreign key (workspace_id, recurring_rule_id)
    references public.expense_recurring_rules(workspace_id, id) on delete restrict,
  check (
    (status = 'paid' and payment_date is not null)
    or (status = 'open' and payment_date is null)
  ),
  check (
    (recurring_rule_id is null and occurrence_date is null)
    or (recurring_rule_id is not null and occurrence_date is not null)
  ),
  unique (workspace_id, id),
  unique (workspace_id, recurring_rule_id, occurrence_date)
);
```

Add `updated_at` trigger using the repo's existing convention if available; otherwise use a narrowly-scoped trigger function in this schema file.

- [ ] **Step 4: Seed standard categories for existing and future workspaces**

Use one function with the exact category list from the spec:

```sql
create or replace function public.seed_default_expense_categories(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.expense_categories (workspace_id, name, sort_order, is_default)
  select p_workspace_id, seed.name, seed.sort_order, true
  from (values
    ('Versandmaterial', 10),
    ('Technik & Geräte', 20),
    ('Bürobedarf', 30),
    ('Software & Abos', 40),
    ('Hosting & Server', 50),
    ('Miete & Räume', 60),
    ('Werbung', 70),
    ('Dienstleistungen', 80),
    ('Gebühren', 90),
    ('Fahrzeug & Fahrtkosten', 100),
    ('Versicherungen', 110),
    ('Steuer & Beratung', 120),
    ('Sonstiges', 130)
  ) as seed(name, sort_order)
  on conflict do nothing;
end;
$$;
```

Revoke public execution; the function is for trigger/migration use. Add an `after insert on workspaces` trigger and backfill:

```sql
select public.seed_default_expense_categories(id)
from public.workspaces;
```

- [ ] **Step 5: Add RLS and grants**

For each table:
- `enable row level security`,
- `revoke all ... from public, anon, authenticated, service_role`,
- grant only required operations to `authenticated`,
- every policy checks `public.is_workspace_member(workspace_id)`,
- inserts require `created_by = auth.uid()`,
- update policies use both `using` and `with check`,
- category/rule/expense cross-workspace integrity remains enforced by composite FKs, not only RLS.

Do not add a hard DELETE grant for `expenses`; application deletion is `deleted_at`.

- [ ] **Step 6: Add private expense document bucket and metadata table**

Mirror the existing purchase-document security pattern with:
- bucket `expense-documents`,
- canonical path `expense-documents/<workspace>/<expense>/<document>.<ext>`,
- max 20 MiB,
- allowed MIME types from the spec,
- `expense_documents` metadata table,
- `select/insert/delete` RLS for workspace members,
- storage policies validating bucket + path + referenced expense.

- [ ] **Step 7: Generate migration using the Supabase CLI**

Run:

```bash
npx supabase migration new expenses_foundation
```

Copy the reviewed canonical SQL from `supabase/schemas/180_expenses.sql` into the generated migration. Do not invent the timestamp manually.

- [ ] **Step 8: Reset local DB, run tests, advisors and regenerate types**

Run:

```bash
npm run supabase:reset
npm run test:db
npx supabase db lint
npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
npm run typecheck
```

Expected: DB tests PASS; typecheck PASS.

If MCP is connected to a development project, additionally run Supabase security/performance advisors after DDL. Do not apply this migration directly to production from the plan executor.

- [ ] **Step 9: Commit**

```bash
git add supabase/schemas/180_expenses.sql supabase/migrations supabase/tests/expenses.test.sql src/app/core/models/supabase.types.ts
git commit -m "feat(expenses): add persisted expense schema"
```

---

### Task 2: Geld- und Wiederholungslogik als reine Domain-Utilities

**Files:**
- Create: `src/app/core/models/expense.models.ts`
- Create: `src/app/core/utils/expense-money.ts`
- Create: `src/app/core/utils/expense-money.spec.ts`
- Create: `src/app/core/utils/expense-recurrence.ts`
- Create: `src/app/core/utils/expense-recurrence.spec.ts`

**Interfaces:**
- Produces `Expense`, `ExpenseCategory`, `ExpenseRecurringRule`, `ExpenseStatus`, `ExpenseFrequency`.
- Produces `calculateExpenseTax(grossAmount, vatRate)`.
- Produces `dueOccurrences(rule, throughDate)` and `nextOccurrence(rule, afterDate)`.
- Services in Task 3 consume these exact interfaces.

- [ ] **Step 1: Define model contracts and failing money tests**

Create model types:

```ts
export type ExpenseStatus = 'open' | 'paid';
export type ExpenseFrequency = 'monthly' | 'quarterly' | 'yearly';
export type ExpenseVatRate = 0 | 7 | 19 | null;

export interface ExpenseCategory {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface ExpenseRecurringRule {
  id: string;
  workspace_id: string;
  category_id: string;
  title: string;
  gross_amount: number;
  vat_rate: ExpenseVatRate;
  frequency: ExpenseFrequency;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface Expense {
  id: string;
  workspace_id: string;
  category_id: string;
  recurring_rule_id: string | null;
  occurrence_date: string | null;
  title: string;
  gross_amount: number;
  vat_rate: ExpenseVatRate;
  expense_date: string;
  due_date: string | null;
  status: ExpenseStatus;
  payment_date: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}
```

Write tests for:
- `29.90 @ 19%` => net `25.13`, tax `4.77`,
- `10.70 @ 7%` => net `10.00`, tax `0.70`,
- `50 @ 0%` => net `50`, tax `0`,
- `50 @ null` => net/tax `null`.

- [ ] **Step 2: Verify money tests RED**

Run:

```bash
npx vitest run --project=node src/app/core/utils/expense-money.spec.ts
```

Expected: FAIL because `calculateExpenseTax` does not exist.

- [ ] **Step 3: Implement central cent-safe calculation**

```ts
export interface ExpenseTaxBreakdown {
  gross: number;
  net: number | null;
  tax: number | null;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateExpenseTax(
  grossAmount: number,
  vatRate: ExpenseVatRate,
): ExpenseTaxBreakdown {
  const gross = money(grossAmount);
  if (vatRate === null) return { gross, net: null, tax: null };
  if (vatRate === 0) return { gross, net: gross, tax: 0 };

  const net = money(gross / (1 + vatRate / 100));
  return { gross, net, tax: money(gross - net) };
}
```

- [ ] **Step 4: Write failing recurrence tests**

Cover:
- monthly 15th,
- quarterly,
- yearly,
- Jan 31 -> Feb 28/29 -> Mar 31 without drift,
- leap-day yearly -> Feb 28 in non-leap year,
- end date is inclusive,
- no dates before start,
- no future dates after `throughDate`,
- inactive rule returns no occurrences,
- next 30-day preview returns only future due dates.

Use ISO date strings (`YYYY-MM-DD`) and local calendar arithmetic; never parse them via UTC timestamp conversions.

- [ ] **Step 5: Verify recurrence tests RED**

```bash
npx vitest run --project=node src/app/core/utils/expense-recurrence.spec.ts
```

Expected: FAIL because recurrence helpers do not exist.

- [ ] **Step 6: Implement anchored calendar recurrence**

Expose:

```ts
export function dueOccurrences(
  rule: Pick<ExpenseRecurringRule, 'start_date' | 'end_date' | 'frequency' | 'is_active'>,
  throughDate: string,
): string[];

export function nextOccurrence(
  rule: Pick<ExpenseRecurringRule, 'start_date' | 'end_date' | 'frequency' | 'is_active'>,
  afterDate: string,
): string | null;
```

Base every occurrence on the original start day, not the previously clamped occurrence, so Jan 31 becomes Feb 28 then Mar 31.

- [ ] **Step 7: Run both utility suites**

```bash
npx vitest run --project=node src/app/core/utils/expense-money.spec.ts src/app/core/utils/expense-recurrence.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/core/models/expense.models.ts src/app/core/utils/expense-money* src/app/core/utils/expense-recurrence*
git commit -m "feat(expenses): add expense domain calculations"
```

---

### Task 3: Kategorie-, Regel- und Ausgaben-Services

**Files:**
- Create: `src/app/core/services/expense-category.service.ts`
- Test: `src/app/core/services/expense-category.service.dom.spec.ts`
- Create: `src/app/core/services/expense-recurring.service.ts`
- Test: `src/app/core/services/expense-recurring.service.dom.spec.ts`
- Create: `src/app/core/services/expense.service.ts`
- Test: `src/app/core/services/expense.service.dom.spec.ts`

**Interfaces:**
- `ExpenseCategoryService.categories: Signal<readonly ExpenseCategory[]>`
- `ExpenseCategoryService.create(name: string)`
- `ExpenseCategoryService.rename(id: string, name: string)`
- `ExpenseCategoryService.archive(id: string)`
- `ExpenseRecurringService.rules: Signal<readonly ExpenseRecurringRule[]>`
- `ExpenseRecurringService.upsert(input)`
- `ExpenseRecurringService.setActive(id, active)`
- `ExpenseService.expenses: Signal<readonly Expense[]>`
- `ExpenseService.loadCurrentWorkspace(): Promise<void>`
- `ExpenseService.create(input)`
- `ExpenseService.update(id, input)`
- `ExpenseService.softDelete(id)`
- `ExpenseService.markPaid(id, paymentDate)`
- `ExpenseService.materializeDue(throughDate?: string): Promise<void>`

- [ ] **Step 1: Write failing category-service tests**

Use mocked Supabase query chains and `WorkspaceService.currentWorkspace`.

Assert:
- load filters by current workspace and orders `sort_order, name`,
- create trims name and sets `created_by`,
- rename persists only own ID,
- archive sets `is_archived: true`,
- demo mode returns a clear non-persisting error for mutations.

- [ ] **Step 2: Verify category tests RED**

```bash
npx vitest run --project=dom src/app/core/services/expense-category.service.dom.spec.ts
```

- [ ] **Step 3: Implement ExpenseCategoryService**

Follow `PurchaseDocumentService`/workspace service error handling:
- inject `SupabaseService`, `WorkspaceService`, `AuthService`, `MockDataStoreService`, `SyncStatusService`,
- update Signals only after successful persistence,
- keep archived categories in the raw signal so historical expenses can resolve their names,
- expose `activeCategories = computed(...)`.

- [ ] **Step 4: Write failing recurring-service tests**

Assert:
- load own rules,
- create/update exact fields,
- deactivate instead of hard delete,
- `upsert` triggers `ExpenseService.materializeDue` only after successful save,
- preview uses `nextOccurrence`.

Avoid a circular Angular dependency by having `ExpenseRecurringService` **not** inject `ExpenseService`. Instead, the page/orchestrator calls materialization after saving a rule. The service remains rule-only as required by the spec.

- [ ] **Step 5: Implement ExpenseRecurringService**

Keep it free of dashboard/UI dependencies. Expose `upcoming(withinDays = 30, today = localToday())` computed/helper using the recurrence utility.

- [ ] **Step 6: Write failing ExpenseService tests**

Test:
- load excludes `deleted_at != null`,
- manual create persists `paid + payment_date`,
- `open` create has null payment date,
- mark paid updates both status and payment date,
- soft delete sets `deleted_at`,
- materialization creates missed monthly occurrences up to today,
- existing occurrences are not duplicated,
- soft-deleted existing occurrence is not recreated,
- newly generated occurrences are `open`,
- materialization skips inactive/ended rules,
- network failure leaves existing Signal state intact.

- [ ] **Step 7: Verify ExpenseService tests RED**

```bash
npx vitest run --project=dom src/app/core/services/expense.service.dom.spec.ts
```

- [ ] **Step 8: Implement idempotent materialization**

Core flow:

```ts
async materializeDue(throughDate = localDateKey(new Date())): Promise<void> {
  const workspace = this.workspace.currentWorkspace();
  if (!workspace || this.mockStore.isDemoMode()) return;

  const rules = this.recurring.rules().filter((rule) => rule.is_active);
  const candidates = rules.flatMap((rule) =>
    dueOccurrences(rule, throughDate).map((occurrenceDate) => ({
      id: crypto.randomUUID(),
      workspace_id: workspace.id,
      category_id: rule.category_id,
      recurring_rule_id: rule.id,
      occurrence_date: occurrenceDate,
      title: rule.title,
      gross_amount: rule.gross_amount,
      vat_rate: rule.vat_rate,
      expense_date: occurrenceDate,
      due_date: occurrenceDate,
      status: 'open' as const,
      payment_date: null,
      notes: rule.notes,
      created_by: this.auth.currentUser()?.id ?? null,
    })),
  );

  if (candidates.length === 0) return;

  const { error } = await this.supabase.client
    .from('expenses')
    .upsert(candidates, {
      onConflict: 'workspace_id,recurring_rule_id,occurrence_date',
      ignoreDuplicates: true,
    });

  if (error) throw this.syncStatus.melde('Erzeugen fälliger Ausgaben', error);
  await this.loadCurrentWorkspace();
}
```

Because the DB unique key includes soft-deleted rows, a deleted occurrence remains a conflict and will not come back.

- [ ] **Step 9: Add workspace-change load orchestration**

In `ExpenseService`, use the repo's guarded `effect()` pattern:
1. when current workspace changes, load categories/rules/expenses in the orchestrating page or a small `ExpenseWorkspaceLoaderService`,
2. then call `materializeDue()`,
3. then reload concrete expenses once.

Prefer page-level orchestration if it avoids service-to-service cycles. Dashboard must call a shared `ensureLoaded()` on ExpenseService rather than owning recurrence logic.

- [ ] **Step 10: Run all service tests and typecheck**

```bash
npx vitest run --project=dom src/app/core/services/expense-category.service.dom.spec.ts src/app/core/services/expense-recurring.service.dom.spec.ts src/app/core/services/expense.service.dom.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/app/core/services/expense-*
git commit -m "feat(expenses): add expense persistence services"
```

---

### Task 4: Gemeinsame private Dokumentlogik und Ausgabenbelege

**Files:**
- Create: `src/app/core/models/private-document.models.ts`
- Modify: `src/app/core/models/purchase-document.models.ts`
- Test: `src/app/core/services/purchase-document.service.dom.spec.ts`
- Create: `src/app/core/models/expense-document.models.ts`
- Create: `src/app/core/services/expense-document.service.ts`
- Test: `src/app/core/services/expense-document.service.dom.spec.ts`
- Create/Test UI: `src/app/features/expenses/components/expense-documents/*`

**Interfaces:**
- Shared `validatePrivateDocumentFile(file)`, `privateDocumentExtension(file)`, `PRIVATE_DOCUMENT_MAX_BYTES`.
- `ExpenseDocumentService.documentsFor(expenseId)`.
- `ExpenseDocumentService.upload(expenseId, file, documentType)`.
- `ExpenseDocumentService.download(document)`.
- `ExpenseDocumentService.remove(document)`.

- [ ] **Step 1: Add failing compatibility tests around purchase documents**

Keep existing public exports working:

```ts
expect(PURCHASE_DOCUMENT_MAX_BYTES).toBe(PRIVATE_DOCUMENT_MAX_BYTES);
expect(validatePurchaseDocumentFile(file)).toEqual(validatePrivateDocumentFile(file));
```

Run existing purchase-document tests; they must fail only after test references new shared exports.

- [ ] **Step 2: Extract shared validation without changing behavior**

`private-document.models.ts` owns:
- 20 MiB limit,
- MIME-to-extension map,
- type/endings/size validation.

`purchase-document.models.ts` re-exports aliases so existing callers do not change en masse:

```ts
export {
  PRIVATE_DOCUMENT_MAX_BYTES as PURCHASE_DOCUMENT_MAX_BYTES,
  privateDocumentExtension as purchaseDocumentExtension,
  validatePrivateDocumentFile as validatePurchaseDocumentFile,
} from './private-document.models';
```

Keep purchase-specific bucket/path/type labels in the purchase model.

- [ ] **Step 3: Run purchase-document regression suite**

```bash
npx vitest run --project=dom src/app/core/services/purchase-document.service.dom.spec.ts
```

Expected: PASS unchanged.

- [ ] **Step 4: Write failing expense-document service tests**

Mirror the proven purchase-document cases:
- invalid file rejected before upload,
- demo mode rejected,
- upload file -> insert metadata,
- metadata failure removes uploaded object,
- download returns Blob,
- remove deletes metadata then file,
- `loadForExpenses(expenseIds)` groups documents.

- [ ] **Step 5: Implement ExpenseDocumentService**

Use bucket `expense-documents` and path helper:

```ts
export function expenseDocumentPath(
  workspaceId: string,
  expenseId: string,
  documentId: string,
  extension: string,
): string {
  return `expense-documents/${workspaceId}/${expenseId}/${documentId}.${extension}`;
}
```

Do not create public URLs.

- [ ] **Step 6: Build expense-document UI component test-first**

The component receives an `expenseId`, displays:
- current documents,
- upload action + document type,
- image/PDF preview using downloaded Blob URL,
- download,
- remove.

Reuse existing shared modal/button styles and purchase-document copy patterns. Do not add OCR.

- [ ] **Step 7: Run document suites**

```bash
npx vitest run --project=dom src/app/core/services/purchase-document.service.dom.spec.ts src/app/core/services/expense-document.service.dom.spec.ts
npx vitest run --project=angular src/app/features/expenses/components/expense-documents/expense-documents.component.angular.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/core/models/private-document.models.ts src/app/core/models/purchase-document.models.ts src/app/core/models/expense-document.models.ts src/app/core/services/*document* src/app/features/expenses/components/expense-documents
git commit -m "feat(expenses): add private expense documents"
```

---

### Task 5: Navigation und Ausgaben-Hauptseite

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/core/config/workspace-navigation.ts`
- Modify: `src/app/core/config/workspace-navigation.spec.ts`
- Modify: `src/app/core/i18n/translations.ts`
- Modify: `src/app/core/i18n/translations.spec.ts`
- Create: `src/app/features/expenses/expenses.component.ts`
- Create: `src/app/features/expenses/expenses.component.html`
- Test: `src/app/features/expenses/expenses.component.angular.spec.ts`

**Interfaces:**
- Route: `/expenses`.
- Finances navigation order: `/expenses`, `/accounting`, `/analytics`.
- Page tabs: `expenses | recurring`.

- [ ] **Step 1: Write failing navigation tests**

Update expected finance paths:

```ts
assert.deepEqual(
  WORKSPACE_NAVIGATION_GROUPS.find((group) => group.id === 'finances')?.items.map((item) => item.path),
  ['/expenses', '/accounting', '/analytics'],
);
```

Assert label `Ausgaben` and unique route list.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run --project=node src/app/core/config/workspace-navigation.spec.ts src/app/core/i18n/translations.spec.ts
```

Expected: FAIL because expense nav/key do not exist.

- [ ] **Step 3: Add route/navigation/i18n**

Add:

```ts
{
  path: 'expenses',
  loadComponent: () =>
    import('./features/expenses/expenses.component').then((m) => m.ExpensesComponent),
},
```

Navigation entry:

```ts
{ path: '/expenses', labelKey: 'NAV.EXPENSES', label: 'Ausgaben', icon: 'receipt' }
```

Translation:

```ts
EXPENSES: 'Ausgaben',
```

- [ ] **Step 4: Write failing page tests**

Set mocked services and assert:
- header `Ausgaben`,
- summary cards `Gesamt / Bezahlt / Offen`,
- filter controls,
- table columns from the spec,
- initial tab `Ausgaben`,
- switch to `Wiederkehrend`,
- empty state,
- opening create dialog,
- archived categories do not appear in create select,
- demo mode disables persistence action with explanatory text,
- AXE on the page shell.

- [ ] **Step 5: Implement page state**

`ExpensesComponent` owns only presentation/filter orchestration:

```ts
readonly activeTab = signal<'expenses' | 'recurring'>('expenses');
readonly search = signal('');
readonly statusFilter = signal<'all' | ExpenseStatus>('all');
readonly categoryFilter = signal<string>('all');

readonly visibleExpenses = computed(() => {
  const q = this.search().trim().toLocaleLowerCase('de');
  return this.expenses.expenses()
    .filter((expense) => !expense.deleted_at)
    .filter((expense) => this.statusFilter() === 'all' || expense.status === this.statusFilter())
    .filter((expense) => this.categoryFilter() === 'all' || expense.category_id === this.categoryFilter())
    .filter((expense) => !q || expense.title.toLocaleLowerCase('de').includes(q));
});
```

Use `PageHeaderComponent`, `ButtonComponent`, `BadgeComponent`, `CustomSelectComponent`, and existing `linear-table` patterns.

- [ ] **Step 6: Add summary calculations**

For the selected period:
- `Gesamt` = all non-deleted expense gross amounts by `expense_date`,
- `Bezahlt` = paid gross,
- `Offen` = open gross.

These are page-level expense summaries, not dashboard cashflow.

- [ ] **Step 7: Run page + nav tests**

```bash
npx vitest run --project=node src/app/core/config/workspace-navigation.spec.ts src/app/core/i18n/translations.spec.ts
npx vitest run --project=angular src/app/features/expenses/expenses.component.angular.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/app.routes.ts src/app/core/config/workspace-navigation* src/app/core/i18n/translations* src/app/features/expenses/expenses.component*
git commit -m "feat(expenses): add expenses workspace page"
```

---

### Task 6: Dialoge für konkrete Ausgaben, Wiederholungen und Kategorien

**Files:**
- Create/Test: `src/app/features/expenses/components/expense-dialog/*`
- Create/Test: `src/app/features/expenses/components/recurring-expense-dialog/*`
- Create/Test: `src/app/features/expenses/components/expense-category-dialog/*`
- Modify: `src/app/features/expenses/expenses.component.ts`
- Modify: `src/app/features/expenses/expenses.component.html`
- Modify test: `src/app/features/expenses/expenses.component.angular.spec.ts`

**Interfaces:**
- `ExpenseDialogComponent.saved = output<Expense>()`.
- `RecurringExpenseDialogComponent.saved = output<ExpenseRecurringRule>()`.
- `ExpenseCategoryDialogComponent.changed = output<void>()`.

- [ ] **Step 1: Write failing ExpenseDialog tests**

Test create defaults:
- status = `paid`,
- expense date = today,
- payment date = today,
- VAT = no selection,
- gross required and > 0.

Test behavior:
- selecting `open` clears payment date and reveals optional due date,
- selecting `paid` requires payment date,
- edit mode loads values,
- net/tax preview comes from `calculateExpenseTax`,
- save calls service once and emits only on success.

- [ ] **Step 2: Implement ExpenseDialog**

Use a reactive form:

```ts
readonly form = new FormGroup({
  title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  category_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  gross_amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
  vat_rate: new FormControl<ExpenseVatRate>(null),
  expense_date: new FormControl(localDateKey(new Date()), { nonNullable: true }),
  status: new FormControl<ExpenseStatus>('paid', { nonNullable: true }),
  due_date: new FormControl<string | null>(null),
  payment_date: new FormControl<string | null>(localDateKey(new Date())),
  notes: new FormControl('', { nonNullable: true }),
});
```

Use `ModalDialogDirective`; acquire `WorkspaceContextLockService` like seller dialog.

- [ ] **Step 3: Write and implement recurring dialog**

Fields:
- title,
- category,
- gross,
- VAT,
- frequency,
- start date,
- end date,
- notes,
- active toggle on edit.

After successful save, parent calls `expenseService.materializeDue()` and reloads.

Show a plain-text next occurrence preview, e.g. `Nächste Ausgabe: 01.10.2026`.

- [ ] **Step 4: Write and implement category dialog**

Behaviors:
- list active + archived categories,
- create custom,
- rename,
- archive,
- restore archived by setting `is_archived=false`,
- prevent blank/duplicate names through DB error translated to understandable copy.

Standard categories are editable/archivable too; `is_default` is metadata, not a lock.

- [ ] **Step 5: Connect dialogs to the page**

Actions:
- `Ausgabe hinzufügen`,
- row edit,
- row soft delete with confirmation,
- `Als bezahlt markieren` for open expenses,
- `Wiederkehrende Ausgabe hinzufügen`,
- `Kategorien verwalten`,
- row `Belege` opens expense documents.

- [ ] **Step 6: Run focused Angular tests**

```bash
npx vitest run --project=angular src/app/features/expenses
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/expenses
git commit -m "feat(expenses): add expense management dialogs"
```

---

### Task 7: Dashboard-Cashflow mit bezahlten Betriebsausgaben verbinden

**Files:**
- Modify: `src/app/core/models/flipbase.models.ts`
- Modify: `src/app/core/services/dashboard-report.service.ts`
- Modify: `src/app/core/services/dashboard-report.service.spec.ts`
- Modify: `src/app/features/dashboard/dashboard.component.ts`
- Modify: `src/app/features/dashboard/dashboard.component.angular.spec.ts`

**Interfaces:**
- Add report field `operatingExpenseSpend: number`.
- `DashboardReportService` consumes current workspace expenses from `ExpenseService`.
- Cashflow remains `revenue - totalExpenses` where `totalExpenses = purchaseSpend + sellingCosts + operatingExpenseSpend`.

- [ ] **Step 1: Write failing report tests**

Add expenses to test records and assert:

Case A:
- sale revenue 100,
- purchase spend 40,
- selling costs 10,
- paid operating expense 15 with payment date inside range,
- open expense 20,
- paid expense 30 with payment date outside range.

Expected:
- `operatingExpenseSpend = 15`,
- `totalExpenses = 65`,
- dashboard cashflow input = `35`,
- existing `grossProfit` and margin unchanged.

Also test:
- `expense_date` inside range but `payment_date` outside => not counted,
- soft-deleted paid expense => not counted,
- platform filter => `purchasesIncluded=false`; UI cashflow remains `–`.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run --project=node src/app/core/services/dashboard-report.service.spec.ts
```

Expected: FAIL because report has no operating expense spend.

- [ ] **Step 3: Inject ExpenseService and extend report records**

In `createReport()` pass:

```ts
expenses: this.expenseService.expenses(),
```

Keep `createReportForRecords` test-friendly by making `expenses` optional and defaulting to `[]`.

Compute using payment date:

```ts
private paidOperatingExpenseSpend(
  window: DateWindow,
  expenses: readonly Expense[],
): number {
  return this.money(
    expenses
      .filter((expense) => !expense.deleted_at)
      .filter((expense) => expense.status === 'paid' && expense.payment_date)
      .filter((expense) => {
        const paid = this.calendarDate(expense.payment_date);
        return paid !== null && this.isInWindow(paid, window);
      })
      .reduce((sum, expense) => sum + Number(expense.gross_amount), 0),
  );
}
```

Do **not** touch `averageMarginPercent` calculation.

- [ ] **Step 4: Update dashboard expense breakdown**

Add third row `Betriebsausgaben`.

When `purchasesIncluded=false`, show `–` for:
- total,
- purchases,
- operating expenses,
while platform-specific `Gebühren & Versand` can still be shown.

- [ ] **Step 5: Add dashboard loading hook**

Dashboard must ensure expense data is loaded/materialized before presenting cashflow. Prefer `ExpenseService.ensureCurrentWorkspaceLoaded()` which:
1. loads recurring rules,
2. materializes due items,
3. loads concrete expenses.

Guard against duplicate concurrent calls per workspace with a cached in-flight Promise.

- [ ] **Step 6: Run dashboard tests**

```bash
npx vitest run --project=node src/app/core/services/dashboard-report.service.spec.ts
npx vitest run --project=angular src/app/features/dashboard/dashboard.component.angular.spec.ts
```

Expected: PASS; weighted margin regression still PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/models/flipbase.models.ts src/app/core/services/dashboard-report.service* src/app/features/dashboard/dashboard.component*
git commit -m "feat(dashboard): include paid operating expenses in cashflow"
```

---

### Task 8: End-to-end integration, security verification and PR

**Files:**
- All files from Tasks 1–7
- No unrelated refactors.

**Interfaces:**
- Final user flow: `/expenses` -> create/edit/pay/recurring/categories/documents -> dashboard reflects paid operating cash outflow.

- [ ] **Step 1: Run complete verification**

```bash
npm run format
npm run verify
npm run test:db
```

Expected: all selected suites PASS, build exits 0.

- [ ] **Step 2: Run migration-specific checks**

```bash
npm run test:workflow
node scripts/check-migration-changes.mjs
```

Expected: PASS and migration detected/packaged correctly.

- [ ] **Step 3: Run Supabase advisors against the connected development environment if available**

Check both:
- security,
- performance.

Fix any new missing-RLS, policy, FK-index or function security warnings caused by this feature before proceeding. Existing unrelated advisor findings are documented but not bundled into this feature.

- [ ] **Step 4: Manual acceptance pass**

Verify:
1. create `Kartons` as paid expense => appears in `/expenses`;
2. attach a PDF => preview/download works without public URL;
3. create `Server` monthly rule with past start => missed occurrences appear exactly once and are open;
4. mark current server occurrence paid => dashboard Cashflow drops by gross amount;
5. dashboard Marge does not change;
6. switch platform filter => Cashflow becomes `–`;
7. add custom category => available immediately;
8. archive category => hidden from new forms but historical row still resolves category name.

- [ ] **Step 5: Request code review**

Review the diff from current `master` to feature head with focus on:
- RLS/BOLA,
- recurrence idempotency,
- date/timezone semantics,
- soft-delete/rematerialization,
- dashboard margin regression,
- storage cleanup on metadata failure.

Fix Critical/Important findings and rerun affected tests.

- [ ] **Step 6: Create PR**

Title:

```text
feat(expenses): add operating expense tracking
```

Body must state:
- new expense/category/recurring/document persistence,
- dashboard cashflow integration,
- margin unchanged,
- DB/RLS/storage changes,
- verification commands.

- [ ] **Step 7: Wait for required CI and auto-merge when green**

Required state before merge:
- PR mergeable/clean,
- all required checks success,
- no pending database failure.

Then merge automatically into `master` using expected head SHA, per the user's standing Flipbase preference.

- [ ] **Step 8: Verify merge**

Confirm:
- PR state `merged`,
- merge commit is latest on `master`,
- report the merge commit SHA.
