# Expense Entry Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vendor and quantity, simplify amount/VAT entry, support receipt upload during entry, switch expense row actions to icons, and remove the initial table flicker.

**Architecture:** Extend the expense and recurring-rule schema additively with vendor and positive integer quantity. Keep `gross_amount` as the receipt total and `vat_rate` as metadata. Reuse the private expense-document service for deferred upload plus a lightweight per-expense receipt summary. Consolidate page initialization around `ExpenseService.ensureCurrentWorkspaceLoaded()`.

**Tech Stack:** Angular 22, Signals, Reactive Forms, shared Flipbase UI, Lucide, Supabase/PostgreSQL/RLS, Vitest/Angular TestBed.

**Spec:** `docs/superpowers/specs/2026-09-19-expense-entry-redesign-design.md`

## Global Constraints

- Wareneinkäufe stay in `Purchase`; this feature is for general operating expenses.
- `gross_amount` is always the total receipt/transaction amount.
- `quantity` is a positive integer with default `1`.
- `vendor_name` is optional, max 160 characters.
- New manual expenses default to 19 % contained VAT in the UI.
- Existing `vat_rate = null` stays null on edit unless changed by the user.
- `0 %` and „nicht ausgewiesen / unbekannt“ remain distinct.
- Do not store unit price, net amount, or tax amount redundantly.
- Receipt upload is optional; upload failure never rolls back a saved expense.
- Use shared `DataTableComponent`, `ButtonComponent`, `ConfirmDialogService`, and the existing private-document validation.
- UI text remains German.
- Record work in `docs/AI-CHANGELOG.md`.

---

### Task 1: Add vendor and quantity to the database contract

**Files:**
- Create: `supabase/migrations/20260919020500_expense_vendor_quantity.sql`
- Modify: `supabase/schemas/180_expenses.sql`
- Modify/Test: `supabase/tests/expenses.test.sql`
- Regenerate: `src/app/core/models/supabase.types.ts`

- [ ] **Step 1:** Add failing SQL assertions for default quantity 1, rejection of quantity <= 0, vendor persistence, and recurring-rule materialization carrying vendor/quantity.
- [ ] **Step 2:** Run the isolated expense SQL test and confirm failure because columns do not exist.
- [ ] **Step 3:** Add `vendor_name text null` with trimmed length 1..160 when present and `quantity integer not null default 1 check (quantity > 0)` to both `expenses` and `expense_recurring_rules`.
- [ ] **Step 4:** Update materialization payloads/schema where needed so rule values copy into concrete expenses.
- [ ] **Step 5:** Regenerate Supabase types with the repository command.
- [ ] **Step 6:** Re-run expense DB tests and migration/schema completeness checks.
- [ ] **Step 7:** Commit `feat(expenses): store vendor and quantity`.

### Task 2: Propagate vendor and quantity through domain services

**Files:**
- Modify: `src/app/core/models/expense.models.ts`
- Modify: `src/app/core/services/expense.service.ts`
- Modify: `src/app/core/services/expense-recurring.service.ts`
- Modify/Test: `src/app/core/services/expense.service.dom.spec.ts`
- Modify/Test: `src/app/core/services/expense-recurring.service.dom.spec.ts`
- Modify/Test: `src/app/core/utils/expense-money.spec.ts`
- Modify: `src/app/core/utils/expense-money.ts` if unit-price helper is added.

**Interfaces:**
- Add `vendor_name: string | null` and `quantity: number` to concrete expense and recurring-rule models/inputs.
- Optional helper `calculateExpenseUnitPrice(grossAmount, quantity)` returns rounded per-unit display value.

- [ ] **Step 1:** Add failing tests for create/update persistence, recurring materialization, 10 units / 25 € = 2.50 €/unit, and unchanged 119 € / 19 % = 100 € net + 19 € tax.
- [ ] **Step 2:** Run focused service/money tests and confirm failure.
- [ ] **Step 3:** Implement model/service propagation. Normalize vendor with `trim() || null`; database remains final validation guard.
- [ ] **Step 4:** Run focused tests and confirm pass.
- [ ] **Step 5:** Commit `feat(expenses): propagate vendor and quantity`.

### Task 3: Simplify the expense form

**Files:**
- Modify: `src/app/features/expenses/components/expense-dialog/expense-dialog.component.ts`
- Modify: `src/app/features/expenses/components/expense-dialog/expense-dialog.component.html`
- Modify/Test: `src/app/features/expenses/components/expense-dialog/expense-dialog.component.angular.spec.ts`

**Interfaces:**
- Add form controls `vendor_name`, `quantity`.
- Add `taxDetailsExpanded = signal(false)`.
- New manual expense default `vat_rate = 19`; edit mode uses persisted value exactly.

- [ ] **Step 1:** Add failing tests for quantity default 1, VAT new default 19, preservation of edited null VAT, positive integer validation, trimmed vendor, „Gesamtbetrag“ label, collapsed tax summary, expanded tax choices, 119/19 calculation, and 25/10 unit-price hint.
- [ ] **Step 2:** Run the dialog spec and confirm failure.
- [ ] **Step 3:** Implement layout: Bezeichnung; Händler/Anbieter; Kategorie; Menge + Gesamtbetrag; optional unit-price hint; collapsed tax details; dates/status; notes.
- [ ] **Step 4:** Run dialog tests and accessibility checks.
- [ ] **Step 5:** Commit `feat(ui): simplify expense entry fields`.

### Task 4: Add receipt-summary state for table rows

**Files:**
- Modify: `src/app/core/services/expense-document.service.ts`
- Modify/Test: `src/app/core/services/expense-document.service.dom.spec.ts`

**Interfaces:**
- Add per-expense document counts in a signal/map.
- Add `hasDocuments(expenseId: string): boolean`.
- Add `loadSummaryForExpenses(expenseIds: readonly string[]): Promise<void>`.
- Successful upload/remove updates the summary.

- [ ] **Step 1:** Add failing tests for multi-expense summary loading, counts, upload/remove updates, empty ID input, and failure behavior.
- [ ] **Step 2:** Run the document-service spec and confirm failure.
- [ ] **Step 3:** Implement a minimal metadata query separate from the selected-expense `documentsRaw` state.
- [ ] **Step 4:** Run tests and confirm pass.
- [ ] **Step 5:** Commit `feat(expenses): expose receipt status summary`.

### Task 5: Attach a receipt while creating an expense

**Files:**
- Modify: `src/app/features/expenses/components/expense-dialog/expense-dialog.component.ts`
- Modify: `src/app/features/expenses/components/expense-dialog/expense-dialog.component.html`
- Modify/Test: `src/app/features/expenses/components/expense-dialog/expense-dialog.component.angular.spec.ts`

**Interfaces:**
- Local `pendingDocument: Signal<File | null>`.
- Local document type defaults to `invoice`.
- Save sequence is expense first, optional receipt second.

- [ ] **Step 1:** Add failing tests: file validates locally; no upload before expense ID; successful create uploads once; failed create never uploads; failed optional upload preserves the saved expense and enables retry without duplicate creation.
- [ ] **Step 2:** Run the dialog spec and confirm failure.
- [ ] **Step 3:** Add keyboard-accessible file picker + drag/drop using existing PDF/JPG/PNG/XML and 20 MiB rules.
- [ ] **Step 4:** On partial success convert the dialog into the saved expense/edit state before retrying the receipt, so a second click never creates a duplicate expense.
- [ ] **Step 5:** Run tests and confirm pass.
- [ ] **Step 6:** Commit `feat(expenses): attach receipts during entry`.

### Task 6: Align the expense table with shared table conventions

**Files:**
- Modify: `src/app/core/config/table-defaults.config.ts`
- Modify: `src/app/features/expenses/expenses.component.ts`
- Modify: `src/app/features/expenses/expenses.component.html`
- Modify/Test: `src/app/features/expenses/expenses.component.angular.spec.ts`
- Modify/Test: the existing table-preference schema-drift spec.
- Modify: `src/app/core/services/table-preferences.service.ts` only if generic merge behavior is insufficient.

**Contract:**
- Default visible: Datum, Bezeichnung, Anbieter, Kategorie, Menge, Gesamtbetrag, Status, Beleg, Aktionen.
- Default hidden: Steuer, Fällig/bezahlt am, Wiederholung.
- Search matches title + vendor.
- Icon-only: Check for „Als bezahlt“, Pencil for edit, Trash2 for delete.
- Receipt column: FilePlus/document icon = „Beleg hinzufügen“; FileText/document icon = „Beleg ansehen“.
- Delete uses `ConfirmDialogService`, never `window.confirm`.

- [ ] **Step 1:** Add failing table tests for column defaults, preference merge, vendor search, icon-only ARIA labels, receipt states, and shared confirm dialog.
- [ ] **Step 2:** Run expense + table-preference tests and confirm failure.
- [ ] **Step 3:** Implement columns/search/icons using shared `app-button iconOnly`.
- [ ] **Step 4:** Enhance `ExpenseDocumentsComponent` with drop/click add plus preview/download/remove while preserving file metadata.
- [ ] **Step 5:** Run focused component/document/table-preference tests.
- [ ] **Step 6:** Commit `refactor(ui): align expense table actions and receipts`.

### Task 7: Remove duplicate initialization and table flicker

**Files:**
- Modify: `src/app/features/expenses/expenses.component.ts`
- Modify: `src/app/features/expenses/expenses.component.html`
- Modify/Test: `src/app/features/expenses/expenses.component.angular.spec.ts`

**Interfaces:**
- Add synchronous `initializing = signal(true)`.
- Initialization calls `categoryService.load()` + `expenseService.ensureCurrentWorkspaceLoaded()`.
- It no longer directly calls recurring load/materialize and expense load.
- After expenses resolve, load receipt summaries.

- [ ] **Step 1:** Add a deferred-promise regression test proving table `loading=true` immediately, one deduplicated expense initialization path, no intermediate empty state, and summary load after expense IDs exist.
- [ ] **Step 2:** Run the expense component spec and confirm failure.
- [ ] **Step 3:** Implement `await Promise.all([categoryService.load(), expenseService.ensureCurrentWorkspaceLoaded()])`, then document summary, then clear `initializing`.
- [ ] **Step 4:** Bind table loading to `initializing() || expenseService.isLoading()`.
- [ ] **Step 5:** Run focused tests and confirm pass.
- [ ] **Step 6:** Commit `fix(ui): prevent expense table loading flicker`.

### Task 8: Align recurring-expense entry

**Files:**
- Modify: `src/app/features/expenses/components/recurring-expense-dialog/recurring-expense-dialog.component.ts`
- Modify: `src/app/features/expenses/components/recurring-expense-dialog/recurring-expense-dialog.component.html`
- Modify/Test: `src/app/features/expenses/components/recurring-expense-dialog/recurring-expense-dialog.component.angular.spec.ts`

- [ ] **Step 1:** Add failing tests for vendor/quantity persistence, integer validation, new VAT default 19, and preservation of existing null VAT.
- [ ] **Step 2:** Run the recurring-dialog spec and confirm failure.
- [ ] **Step 3:** Implement the same Händler/Menge/Gesamtbetrag terminology and collapsed tax-detail semantics.
- [ ] **Step 4:** Run tests and confirm pass.
- [ ] **Step 5:** Commit `feat(expenses): align recurring expense entry`.

### Task 9: Verify and document the complete expense feature

**Files:**
- Modify: `docs/AI-CHANGELOG.md`
- Update: `docs/superpowers/specs/2026-09-18-expenses-foundation-design.md` only where older amount/VAT wording is misleading.

- [ ] **Step 1:** Run formatter on touched TS/HTML/SQL/Markdown.
- [ ] **Step 2:** Run all touched expense service, utility, dialog, document, component, and table-preference tests.
- [ ] **Step 3:** Run isolated expense SQL tests and migration/schema checks.
- [ ] **Step 4:** Run CI-equivalent lint/type/build/browser checks selected for app + DB changes.
- [ ] **Step 5:** Diff review: no duplicate load path; no expense `window.confirm`; no text edit/delete row actions; total never recalculated from quantity; existing null VAT preserved; receipt retry cannot duplicate expense; RLS/private storage semantics unchanged.
- [ ] **Step 6:** Update changelog and commit `docs(expenses): record streamlined entry workflow`.
- [ ] **Step 7:** Prepare `feat/expense-entry-redesign` PR after verification; merge only after explicit user authorization and green required checks.
