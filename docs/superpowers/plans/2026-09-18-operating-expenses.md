# Operating Expenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace-scoped operating expenses with editable categories, recurring rules, private receipts and dashboard cashflow integration.

**Architecture:** Persist operating expenses in dedicated Supabase tables protected by RLS. A security-invoker RPC materializes only due recurring instances and advances each rule transactionally. Angular services own loading/mutations and signals; the dashboard consumes paid operating expenses by payment date without changing sales profit or margin.

**Tech Stack:** Angular 22 standalone components/signals, Supabase/Postgres/RLS/Storage, Vitest Angular/DOM/node tests, Tailwind utility classes, existing Flipbase shared components.

**Spec:** `docs/superpowers/specs/2026-09-18-operating-expenses-design.md`

## Global Constraints

- Wareneinkäufe stay in **Einkäufe** and never become operating-expense rows.
- Dashboard sales margin remains `grossProfit / revenue-with-known-costs`; operating expenses do not alter it.
- Cashflow includes only **paid** operating expenses and groups them by `paid_at`.
- Recurring rules create concrete expenses only when due; never pre-create future months.
- Generated recurring expenses start as `open`.
- Gross amount is required; VAT is optional and limited to null, 0, 7, 19.
- Expense documents are private, max 20 MiB, PDF/JPEG/PNG/XML.
- Every exposed table has RLS; `anon` gets no access; workspace membership gates rows.
- UI copy stays simple German: Ausgaben, Bezahlt, Offen, Wiederkehrend, Kategorien.
- Standard categories are workspace rows and may be renamed or archived.
- A platform-filtered dashboard must not show an incomplete total cashflow as a valid value.

---

### Task 1: Database schema, recurrence and RLS

**Files:**
- Create: `supabase/schemas/180_operating_expenses.sql`
- Create: `supabase/migrations/20260918131500_operating_expenses.sql`
- Create: `supabase/tests/operating_expenses.test.sql`

**Interfaces:**
- Produces tables `operating_expense_categories`, `recurring_operating_expenses`, `operating_expenses`, `operating_expense_documents`.
- Produces RPC `materialize_due_operating_expenses(p_workspace_id uuid, p_through_date date)`.
- Produces private bucket `operating-expense-documents`.

- [ ] **Step 1: Write failing SQL tests**

Cover:
```sql
-- category member access and foreign-workspace denial
-- expense paid/open constraints
-- VAT 0/7/19/null accepted, 20 rejected
-- recurring category/workspace consistency
-- Jan 31 monthly recurrence -> Feb last day -> Mar last day
-- quarterly and yearly advancement
-- missed occurrences through p_through_date materialize exactly once
-- no future occurrence
-- generated rows are open with expense_date = due_date = recurrence_date
-- private document path and foreign workspace denial
```

- [ ] **Step 2: Run database tests and verify RED**

Run the repository database test command used by CI for files under `supabase/tests`.
Expected: schema objects do not exist.

- [ ] **Step 3: Implement schema**

Create exact constraints:
```sql
gross_amount numeric(12,2) check (gross_amount > 0)
vat_rate smallint check (vat_rate is null or vat_rate in (0, 7, 19))
status text check (status in ('open', 'paid'))
check (
  (status = 'paid' and paid_at is not null)
  or (status = 'open' and paid_at is null)
)
```

Use composite unique keys / foreign keys so category and recurring rule cannot cross workspaces. Add indexes for:
```sql
operating_expenses(workspace_id, expense_date desc, id)
operating_expenses(workspace_id, paid_at desc, id) where status = 'paid'
recurring_operating_expenses(workspace_id, next_due_date) where archived_at is null
operating_expense_documents(workspace_id, expense_id, created_at, id)
```

Seed the 13 standard categories for existing workspaces and via an idempotent after-insert workspace trigger for future workspaces.

- [ ] **Step 4: Implement recurrence**

Create a helper that advances monthly/quarterly/yearly while preserving end-of-month semantics. `materialize_due_operating_expenses` must:
```sql
if not public.is_workspace_member(p_workspace_id) then
  raise exception 'Kein Zugriff auf Workspace';
end if;

-- lock due rules FOR UPDATE
-- loop while next_due_date <= p_through_date and <= end_date when present
-- insert ... on conflict (recurring_rule_id, recurrence_date) do nothing
-- advance next_due_date after every due occurrence
```

Function is `security invoker`, explicit empty `search_path`, granted only to `authenticated, service_role`.

- [ ] **Step 5: Implement private documents**

Mirror existing purchase-document hardening:
- bucket `operating-expense-documents`, private, max 20 MiB
- allowed MIME PDF/JPEG/PNG/XML
- canonical path helper
- RLS on metadata and `storage.objects`
- no public URL

- [ ] **Step 6: Run database tests and verify GREEN**

Expected: all new SQL tests pass and existing migration/permission checks remain green.

- [ ] **Step 7: Commit**

```bash
git add supabase/schemas/180_operating_expenses.sql \
  supabase/migrations/20260918131500_operating_expenses.sql \
  supabase/tests/operating_expenses.test.sql
git commit -m "feat(expenses): add operating expense schema"
```

---

### Task 2: Expense domain models and VAT helpers

**Files:**
- Create: `src/app/core/models/operating-expense.models.ts`
- Create: `src/app/core/models/operating-expense.models.spec.ts`
- Modify: `src/app/core/models/supabase.types.ts`

**Interfaces:**
- Produces `OperatingExpense`, `OperatingExpenseCategory`, `RecurringOperatingExpense`, `OperatingExpenseDocument`.
- Produces `calculateExpenseTax(grossAmount, vatRate)`.
- Produces display constants for category defaults, status, intervals and VAT options.

- [ ] **Step 1: Write failing model tests**

```ts
expect(calculateExpenseTax(119, 19)).toEqual({ netAmount: 100, vatAmount: 19 });
expect(calculateExpenseTax(107, 7)).toEqual({ netAmount: 100, vatAmount: 7 });
expect(calculateExpenseTax(29.9, null)).toEqual({ netAmount: null, vatAmount: null });
```

Also assert the 13 default category labels and recurrence labels.

- [ ] **Step 2: Run focused test and verify RED**

Run the node/Vitest command for the new spec.
Expected: module/functions absent.

- [ ] **Step 3: Implement models/helpers**

Use exact unions:
```ts
export type OperatingExpenseStatus = 'open' | 'paid';
export type OperatingExpenseVatRate = 0 | 7 | 19 | null;
export type OperatingExpenseInterval = 'monthly' | 'quarterly' | 'yearly';
export type OperatingExpenseDocumentType = 'invoice' | 'payment_proof' | 'other';
```

Round net/VAT to cents.

- [ ] **Step 4: Add Supabase generated-type equivalents**

Add the four table definitions and the materialization RPC to `Database['public']` without changing unrelated generated entries.

- [ ] **Step 5: Run focused tests + TypeScript**

Expected: model tests pass and `npm run typecheck`/repo equivalent passes.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/models/operating-expense.models.ts \
  src/app/core/models/operating-expense.models.spec.ts \
  src/app/core/models/supabase.types.ts
git commit -m "feat(expenses): add operating expense models"
```

---

### Task 3: Expense persistence service and recurrence loading

**Files:**
- Create: `src/app/core/services/operating-expense.service.ts`
- Create: `src/app/core/services/operating-expense.service.angular.spec.ts`

**Interfaces:**
- Produces signals `categories`, `expenses`, `recurringRules`, `isLoading`, `loadError`.
- Produces `loadWorkspace(workspaceId)`.
- Produces category CRUD, expense CRUD, rule CRUD, `markPaid`, `markOpen`.
- Calls `materialize_due_operating_expenses` before selects.

- [ ] **Step 1: Write failing service tests**

Test order explicitly:
```ts
expect(rpcCalls[0]).toEqual({
  name: 'materialize_due_operating_expenses',
  args: { p_workspace_id: 'workspace-1', p_through_date: '2026-09-18' },
});
expect(selectCallsAfterRpc).toBe(true);
```

Test:
- workspace switch resets old data
- category create/rename/archive
- manual paid expense defaults persist supplied `paid_at`
- open expense persists `paid_at: null`
- recurring rule update does not mutate generated expenses
- demo mode keeps local state and never calls Supabase.

- [ ] **Step 2: Run service tests and verify RED**

Expected: service absent.

- [ ] **Step 3: Implement service**

Follow PurchaseService/SalesService effect pattern. On workspace change:
1. clear state
2. materialize due rules with local YYYY-MM-DD today
3. load categories, recurring rules and expenses in parallel
4. expose only current-workspace response using request id

Mutations update the signal only after database success.

- [ ] **Step 4: Verify service tests GREEN**

Also run TypeScript/lint for the file.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/operating-expense.service.ts \
  src/app/core/services/operating-expense.service.angular.spec.ts
git commit -m "feat(expenses): add operating expense service"
```

---

### Task 4: Private expense document service

**Files:**
- Create: `src/app/core/services/operating-expense-document.service.ts`
- Create: `src/app/core/services/operating-expense-document.service.dom.spec.ts`

**Interfaces:**
- Produces `loadForExpense(expenseId)`, `upload(expenseId, file, type)`, `download(document)`, `remove(document)`, `removeAllForExpense(expenseId)`.

- [ ] **Step 1: Write failing tests**

Mirror purchase-document guarantees:
- invalid type/size rejected before upload
- metadata failure removes uploaded file
- private download uses Storage API
- delete removes metadata then object
- demo mode blocks real file storage
- `removeAllForExpense` cleans every known document before expense deletion.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement using the existing purchase-document pattern**

Bucket: `operating-expense-documents`.
Path:
```ts
`operating-expense-documents/${workspaceId}/${expenseId}/${documentId}.${extension}`
```

- [ ] **Step 4: Verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/operating-expense-document.service.ts \
  src/app/core/services/operating-expense-document.service.dom.spec.ts
git commit -m "feat(expenses): add private expense documents"
```

---

### Task 5: Expense page shell, navigation and list

**Files:**
- Create: `src/app/features/expenses/expenses.component.ts`
- Create: `src/app/features/expenses/expenses.component.html`
- Create: `src/app/features/expenses/expenses.component.angular.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/core/config/workspace-navigation.ts`
- Modify: `src/app/layout/sidebar/sidebar.component.ts`
- Modify relevant navigation/sidebar tests.

**Interfaces:**
- Route `/expenses`.
- Navigation item label `Ausgaben` under Finanzen before Steuern & DATEV.
- Page consumes `OperatingExpenseService`.

- [ ] **Step 1: Write failing navigation/page tests**

Assert order:
```ts
expect(financeLabels).toEqual(['Ausgaben', 'Steuern & DATEV', 'Auswertungen']);
```

Page defaults to current month and exposes tabs `Ausgaben` and `Wiederkehrend`.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement route/navigation icon**

Add a finance/receipt-style icon key dedicated to expenses and map it in Sidebar.

- [ ] **Step 4: Implement list UI**

Current-month filter; table columns:
```
Datum | Beschreibung | Kategorie | Betrag | Status | Fällig / bezahlt | Beleg | Aktionen
```

Summary values:
- Gesamt des filtered expense_date range
- Bezahlt
- Offen

Rows use green only for positive success/status semantics, not for normal expense amounts; costs remain neutral.

- [ ] **Step 5: Accessibility test**

Run axe against page header/filter/table empty state.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/expenses src/app/app.routes.ts \
  src/app/core/config/workspace-navigation.ts src/app/layout/sidebar
git commit -m "feat(expenses): add expenses workspace page"
```

---

### Task 6: Manual expense form and categories

**Files:**
- Create: `src/app/features/expenses/components/expense-form-dialog/expense-form-dialog.component.ts`
- Create: `src/app/features/expenses/components/expense-form-dialog/expense-form-dialog.component.html`
- Create: `src/app/features/expenses/components/expense-form-dialog/expense-form-dialog.component.angular.spec.ts`
- Create: `src/app/features/expenses/components/expense-categories-dialog/expense-categories-dialog.component.ts`
- Create: `src/app/features/expenses/components/expense-categories-dialog/expense-categories-dialog.component.html`
- Create: `src/app/features/expenses/components/expense-categories-dialog/expense-categories-dialog.component.angular.spec.ts`
- Modify: `src/app/features/expenses/expenses.component.ts`
- Modify: `src/app/features/expenses/expenses.component.html`

**Interfaces:**
- Form outputs create/update payloads.
- Category dialog calls service CRUD directly or emits typed actions.

- [ ] **Step 1: Write form tests RED**

Rules:
- title/category/gross/date required
- paid defaults true for manual create
- paid requires payment date
- open hides/clears payment date and allows due date
- 19/7/0/null tax preview is correct
- edit hydrates existing row without changing recurrence provenance.

- [ ] **Step 2: Implement form**

Use existing shared inputs/selects/buttons/modal directive. Copy stays non-accounting:
`Bruttobetrag`, `MwSt.`, `Bezahlt`, `Offen`, `Fällig am`, `Bezahlt am`.

- [ ] **Step 3: Write category tests RED**

Create custom, rename default/custom, archive; archived item remains visible when editing an expense that references it.

- [ ] **Step 4: Implement category manager**

No hard delete in UI.

- [ ] **Step 5: Verify GREEN + axe**

- [ ] **Step 6: Commit**

```bash
git add src/app/features/expenses
git commit -m "feat(expenses): add expense entry and categories"
```

---

### Task 7: Recurring expense UI

**Files:**
- Create: `src/app/features/expenses/components/recurring-expense-form-dialog/recurring-expense-form-dialog.component.ts`
- Create: `src/app/features/expenses/components/recurring-expense-form-dialog/recurring-expense-form-dialog.component.html`
- Create: `src/app/features/expenses/components/recurring-expense-form-dialog/recurring-expense-form-dialog.component.angular.spec.ts`
- Modify: `src/app/features/expenses/expenses.component.ts`
- Modify: `src/app/features/expenses/expenses.component.html`

**Interfaces:**
- Creates/updates/archives `RecurringOperatingExpense`.
- Displays next due date but never creates future expense rows client-side.

- [ ] **Step 1: Write tests RED**

Assert:
- interval options monthly/quarterly/yearly
- start date required
- end date optional and cannot precede start
- generated-expense status is not a field in rule form
- archiving removes rule from active list but preserves concrete expenses.

- [ ] **Step 2: Implement recurring tab and dialog**

Table:
```
Beschreibung | Kategorie | Betrag | Intervall | Nächste Fälligkeit | Endet | Aktionen
```

Also show a small "Demnächst fällig" section for active rules whose next due date is in the future; this is display-only.

- [ ] **Step 3: Verify GREEN**

- [ ] **Step 4: Commit**

```bash
git add src/app/features/expenses
git commit -m "feat(expenses): manage recurring operating costs"
```

---

### Task 8: Expense documents in edit flow

**Files:**
- Create: `src/app/features/expenses/components/expense-documents/expense-documents.component.ts`
- Create: `src/app/features/expenses/components/expense-documents/expense-documents.component.html`
- Create: `src/app/features/expenses/components/expense-documents/expense-documents.component.angular.spec.ts`
- Modify: `src/app/features/expenses/components/expense-form-dialog/*`
- Modify: `src/app/features/expenses/expenses.component.ts`

**Interfaces:**
- Expense must exist before upload.
- Emits no public URLs.

- [ ] **Step 1: Write tests RED**

- upload is absent for unsaved create form
- saved expense can add invoice/payment proof/other
- list shows file name/type/date
- download calls document service
- remove requires explicit click and refreshes list
- deleting an expense invokes `removeAllForExpense` before expense delete.

- [ ] **Step 2: Implement document section**

Reuse purchase-document MIME/size copy conventions.

- [ ] **Step 3: Verify GREEN + axe**

- [ ] **Step 4: Commit**

```bash
git add src/app/features/expenses
git commit -m "feat(expenses): attach receipts to expenses"
```

---

### Task 9: Dashboard cashflow integration

**Files:**
- Modify: `src/app/core/models/flipbase.models.ts`
- Modify: `src/app/core/services/dashboard-report.service.ts`
- Modify: `src/app/core/services/dashboard-report.service.spec.ts`
- Modify: `src/app/features/dashboard/dashboard.component.ts`
- Modify: `src/app/features/dashboard/dashboard.component.html`
- Modify: `src/app/features/dashboard/dashboard.component.angular.spec.ts`

**Interfaces:**
- `DashboardReport.operatingExpenseSpend: number`.
- `DashboardReportService` injects `OperatingExpenseService`.
- `createReportForRecords` accepts optional `operatingExpenses` for pure tests.

- [ ] **Step 1: Write failing report tests**

Examples:
```ts
// paid_at inside range counts
// expense_date inside range but paid_at outside does not count cashflow
// open expense does not count
// margin is unchanged by operating expenses
// platform filter excludes operating expenses from totals
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement report aggregation**

When platform = all:
```ts
operatingExpenseSpend = expenses
  .filter(e => e.status === 'paid' && e.paid_at && isInWindow(calendarDate(e.paid_at), window))
  .reduce((sum, e) => sum + e.gross_amount, 0);

totalExpenses = purchaseSpend + sellingCosts + operatingExpenseSpend;
```

Never subtract operating expenses from `grossProfit` or margin.

- [ ] **Step 4: Update dashboard expense breakdown**

Display:
- Einkäufe
- Gebühren & Versand
- Betriebsausgaben

Filtered platform: total/cashflow/purchases/operating show `–`; selling costs remain available.

- [ ] **Step 5: Verify GREEN**

Run report node tests + dashboard Angular tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/models/flipbase.models.ts \
  src/app/core/services/dashboard-report.service* \
  src/app/features/dashboard
git commit -m "feat(dashboard): include paid operating expenses in cashflow"
```

---

### Task 10: Full verification, review and integration

**Files:**
- Review all branch changes.
- No unrelated refactor.

- [ ] **Step 1: Run formatting, lint, typecheck, unit suites, Angular suites, build and browser smoke**

Use the exact CI commands from `package.json` / workflow. Expected: zero failures.

- [ ] **Step 2: Run database tests and advisors**

Run repository migration/schema tests. If a connected Supabase branch is available, run database advisors against the isolated branch; do not mutate production.

- [ ] **Step 3: Review security**

Verify:
- no `anon` grants
- RLS on all four tables
- update has USING + WITH CHECK
- document bucket private
- no service-role key/client secret
- materialization function security invoker
- security-definer category trigger revoked from public/authenticated.

- [ ] **Step 4: Create/refresh PR and wait for required checks**

PR title:
`feat(expenses): add operating expense management`

- [ ] **Step 5: Merge automatically when green + clean**

Per user preference for Flipbase: when the PR is fully green and mergeable, merge it directly to `master` and verify the merge commit.
