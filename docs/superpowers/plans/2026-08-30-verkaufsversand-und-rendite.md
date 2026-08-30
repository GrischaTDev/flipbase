# Sales Shipping and Return Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate buyer-paid shipping revenue from seller-paid shipping expense and make sale profit, margin, ROI, invoices, returns, and exports consistent.

**Architecture:** Extend the sale header with explicit shipping revenue and mode, persist additional selling costs as normalized rows, and retain existing aggregate cost columns as transactionally maintained compatibility rollups. Centralize sale financial calculations so UI and downstream reports share the same definitions.

**Tech Stack:** Angular 22 standalone components with Signals and Reactive Forms, TypeScript strict mode, Tailwind CSS, Supabase/PostgreSQL declarative schema, Vitest, Supabase pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-30-verkaufsversand-und-rendite-design.md`

## Global Constraints

- Existing sales must not be financially changed or automatically split.
- `shipping_revenue` is seller revenue; `shipping_cost` is seller expense.
- `sale_price` and `sale_price_total` remain gross seller revenue for compatibility.
- Additional cost rows are limited to `packaging`, `payment_fee`, `promotion`, and `other`.
- New database tables require RLS with separate operation policies and indexed policy columns.
- SQL schema changes belong in `supabase/schemas/`, not handwritten migration files.
- UI uses Angular standalone components, Signals, Reactive Forms, native control flow, Tailwind classes, visible labels, and WCAG AA semantics.
- Production code is written only after the covering test has failed for the expected reason.
- Branches, commit messages, PR titles, and workflow titles are English and branch names never contain `codex`.

---

### Task 1: Sale financial domain and database contract

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `src/app/core/models/flipbase.models.ts`
- Modify: `src/app/core/models/supabase.types.ts`
- Modify: `src/app/core/services/sales.service.ts`
- Test: `src/app/core/services/sales.service.dom.spec.ts`
- Test: `supabase/tests/inventory_sales_transactions.sql`
- Test: `supabase/tests/inventory_sales_schema.sql`
- Test: `supabase/tests/rls_inventory_sales.test.sql`

**Interfaces:**

- Produces: `ShippingMode`, `SaleCostCategory`, `SaleCostEntry`, `RecordSaleCostInput`.
- Produces: `RecordSaleInput.shippingRevenue`, `shippingMode`, and `additionalCosts`.
- Produces: persisted `Sale.shipping_revenue`, `shipping_mode`, and `cost_entries`.

- [ ] **Step 1: Write failing service and database tests**

Assert that a 39.99 line plus 2.99 shipping revenue persists a 42.98 gross sale, while 5.19 shipping expense and structured costs remain expenses. Assert that invalid categories, negative amounts, and more than 50 rows are rejected.

- [ ] **Step 2: Run tests and verify the expected missing-field failures**

Run: `npm run test:dom -- src/app/core/services/sales.service.dom.spec.ts`

Run: `npm run test:db`

Expected: failures identify absent shipping-revenue fields/table/RPC behavior.

- [ ] **Step 3: Implement schema, RLS, RPC validation, generated types, and service mapping**

Use the exact domain interfaces from the spec. `record_sale` and `record_legacy_inventory_sale` calculate gross revenue and cost rollups inside their existing transactions. Loaded sales include `sale_cost_entries`.

- [ ] **Step 4: Re-run focused tests**

Expected: service and database tests pass.

- [ ] **Step 5: Commit**

Commit: `feat: separate sale shipping revenue and costs`

### Task 2: Shared financial calculations and downstream consumers

**Files:**

- Modify: `src/app/core/services/profit-engine.service.ts`
- Modify: `src/app/core/services/sales.service.ts`
- Modify: `src/app/core/services/dashboard-report.service.ts`
- Modify: `src/app/core/services/invoice.service.ts`
- Modify: `src/app/core/services/export.service.ts`
- Modify: `src/app/core/services/tax-engine.service.ts`
- Modify: `src/app/core/services/tax-advisor.service.ts`
- Test: `src/app/core/services/profit-engine.service.spec.ts`
- Test: `src/app/core/services/dashboard-report.service.spec.ts`
- Test: `src/app/core/services/invoice.service.spec.ts`
- Test: `src/app/core/services/export.service.spec.ts`
- Test: `src/app/core/services/datev-export.spec.ts`
- Test: `src/app/core/services/tax-engine.service.spec.ts`
- Test: `src/app/core/services/tax-advisor.service.spec.ts`

**Interfaces:**

- Consumes: sale gross revenue and cost entries from Task 1.
- Produces: `calculateMargin(profit, revenue): number | null` and `calculateRoi(profit, investedCapital): number | null`.
- Produces: consistent revenue, selling-cost, invoice-shipping, return, tax, and export values.

- [ ] **Step 1: Write failing calculation and consumer tests**

Cover the 39.99/2.99/5.19/7.70 example, zero denominators, invoice shipping revenue, dashboard profit, CSV headers, and tax allocation.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npm run test:node -- src/app/core/services/profit-engine.service.spec.ts src/app/core/services/dashboard-report.service.spec.ts src/app/core/services/invoice.service.spec.ts src/app/core/services/export.service.spec.ts src/app/core/services/datev-export.spec.ts src/app/core/services/tax-engine.service.spec.ts src/app/core/services/tax-advisor.service.spec.ts`

Expected failures must come from the old conflated shipping semantics.

- [ ] **Step 3: Implement the minimal shared calculations and consumer corrections**

The invoice subtotal is the position sum, invoice shipping is `shipping_revenue`, invoice total is gross seller revenue, and seller `shipping_cost` is never billed to the buyer.

- [ ] **Step 4: Re-run focused tests**

Expected: all affected service tests pass.

- [ ] **Step 5: Commit**

Commit: `fix: align sale metrics invoices and exports`

### Task 3: Accessible sale modal and platform defaults

**Files:**

- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.html`
- Test: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.angular.spec.ts`

**Interfaces:**

- Consumes: `RecordSaleInput`, shipping modes, cost categories, and financial helpers from Tasks 1-2.
- Produces: reactive shipping revenue/mode controls and an additional-cost `FormArray`.

- [ ] **Step 1: Write failing Angular tests**

Assert visible labels, eBay and Vinted defaults, editable overrides, additional-cost add/remove behavior, exact submission payload, the 42.98 example, margin, explanatory capital-return text, and null-denominator display.

- [ ] **Step 2: Run the Angular test and verify expected failures**

Run: `npm run test:angular -- src/app/features/sales/components/sale-create-modal/sale-create-modal.component.angular.spec.ts`

- [ ] **Step 3: Implement the reactive form and template**

Replace the details section with permanently visible revenue, selling-cost, additional-cost, and note sections. Use shared selects, labels, ARIA help text, pointer cursors, and no placeholder-only fields.

- [ ] **Step 4: Re-run Angular tests and accessibility-relevant assertions**

Expected: focused Angular tests pass without console errors.

- [ ] **Step 5: Commit**

Commit: `feat: clarify sale revenue costs and returns`

### Task 4: Integration verification and documentation

**Files:**

- Modify: `docs/AI-CHANGELOG.md`
- Create: `docs/superpowers/reports/2026-08-30-verkaufsversand-und-rendite-abnahme.md`

**Interfaces:**

- Consumes: completed Tasks 1-3.
- Produces: release evidence and user-visible change record.

- [ ] **Step 1: Run formatting, lint, type, focused DB, full test, and production build checks**

Run: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and the relevant Supabase database tests.

- [ ] **Step 2: Fix only verified regressions with a failing regression test first**

Re-run every failed command until it is clean.

- [ ] **Step 3: Record evidence and compatibility behavior**

Document exact commands, pass counts, example calculations, and confirmation that existing sales were not rewritten.

- [ ] **Step 4: Commit**

Commit: `docs: record sale accounting verification`
