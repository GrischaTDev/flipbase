# Sales and Dashboard Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record sale revenue and direct costs unambiguously, use one correct profit calculation everywhere, and replace the static dashboard chart with an accessible interactive Chart.js visualization.

**Architecture:** The database stores buyer-paid shipping separately from seller-paid shipping and stores flexible extra sale costs as typed rows. A pure calculation module is the single metrics source for sale modal, sales list, reports, and dashboard. Chart.js receives already calculated time-series data and never owns business logic.

**Tech Stack:** PostgreSQL 17, Supabase, Angular 22, TypeScript 6, Chart.js 4.5.1, Vitest 4, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-31-einkaufs-bestandskosten-und-pruefprotokoll-design.md`

## Global Constraints

- Complete `2026-08-31-purchase-costing-foundation.md` before this plan.
- Keep all user-facing copy German; commit messages, branch names, PR titles, and workflow titles must be English.
- Do not create a branch containing `codex`.
- Verify `chart.js@4.5.1` is still the latest stable mutually compatible release immediately before installation; do not use beta, RC, next, or a wrapper package.
- Change database objects in `supabase/schemas/database.sql`, generate the migration from the declarative schema, regenerate types, and add explicit RLS/grants.
- Revenue means item revenue plus buyer-paid shipping. Seller-paid shipping is a cost.
- Do not display ROI when Wareneinsatz is unknown or zero. Do not use ROI as a primary sales-list metric.
- Negative results must remain negative; never clamp a loss to zero.
- Chart.js must be destroyed on component teardown and recreated/updated without leaking canvases or listeners.

---

## File Structure

| File                                                    | Responsibility                                 |
| ------------------------------------------------------- | ---------------------------------------------- |
| `supabase/schemas/database.sql`                         | Buyer shipping revenue and flexible sale costs |
| `supabase/tests/sale_costs_schema.sql`                  | Schema, RLS, and workspace-isolation checks    |
| `src/app/core/models/sale-metrics.models.ts`            | Typed sale input/output contracts              |
| `src/app/core/utils/sale-metrics.ts`                    | Single pure sales calculation                  |
| `src/app/core/utils/sale-metrics.spec.ts`               | Formula and edge-case tests                    |
| `src/app/core/services/sales.service.ts`                | Persistence and normalized sale records        |
| `src/app/core/services/return.service.ts`               | Return events and reversal consistency         |
| `src/app/features/sales/components/sale-create-modal/*` | Explicit revenue/cost entry and live summary   |
| `src/app/features/sales/sales.component.*`              | Sales journal terminology and values           |
| `src/app/core/services/dashboard-report.service.*`      | Time aggregation using the shared metrics      |
| `src/app/shared/components/revenue-chart/*`             | Chart.js lifecycle, tooltips, legend, table    |
| `src/app/features/dashboard/dashboard.component.*`      | Filters, metric cards, journal labels          |
| `package.json` / `package-lock.json`                    | Exact Chart.js dependency                      |

### Task 1: Persist buyer-paid shipping and flexible direct sale costs

**Files:**

- Modify: `supabase/schemas/database.sql`
- Create: `supabase/tests/sale_costs_schema.sql`
- Modify: `src/app/core/models/flipbase.models.ts`
- Modify: `src/app/core/models/supabase.types.ts` (generated)

**Interfaces:**

```ts
export type SaleCostType = 'shipping' | 'platform_fee' | 'packaging' | 'payment_fee' | 'other';

export interface SaleCost {
  readonly id: string;
  readonly workspace_id: string;
  readonly sale_id: string;
  readonly type: SaleCostType;
  readonly description: string;
  readonly amount: number;
}
```

- [ ] **Step 1: Write the failing pgTAP test**

Assert `sales.buyer_shipping_revenue numeric(12,2) not null default 0`, a `public.sale_costs` table, non-negative amounts, mandatory non-blank description for `other`, workspace and sale indexes, RLS, explicit operation policies, and cross-workspace rejection. Assert finalized sale-cost edits append a `business_events` record through the existing correction RPC rather than direct client updates.

- [ ] **Step 2: Run the database test and verify failure**

Run: `npx supabase test db supabase/tests/sale_costs_schema.sql`
Expected: FAIL because the column/table do not exist.

- [ ] **Step 3: Add the declarative schema and policies**

Append new columns at the end of the existing table definition. Make `sale_costs.workspace_id` agree with its parent sale in a checked server-side write path. Keep legacy scalar platform/shipping/packaging/other columns readable during migration, but establish one canonical write path for new records.

- [ ] **Step 4: Generate and inspect the migration**

Run:

```bash
npx supabase stop
npx supabase db diff -f sale_revenue_and_cost_rows
```

Expected: one timestamped migration with lowercase SQL and no unrelated destructive changes.

- [ ] **Step 5: Regenerate types and run database tests**

Run:

```bash
npx supabase start
npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
npx supabase test db supabase/tests/sale_costs_schema.sql
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/schemas/database.sql supabase/migrations supabase/tests/sale_costs_schema.sql src/app/core/models
git commit -m "Model sale revenue and direct cost rows"
```

### Task 2: Establish one sale-metrics calculation

**Files:**

- Create: `src/app/core/models/sale-metrics.models.ts`
- Create: `src/app/core/utils/sale-metrics.ts`
- Create: `src/app/core/utils/sale-metrics.spec.ts`
- Modify: `src/app/core/services/sales-profit-calculation.spec.ts`

**Interfaces:**

```ts
export interface SaleMetricsInput {
  readonly itemRevenue: number;
  readonly buyerShippingRevenue: number;
  readonly costOfGoodsSold: number | null;
  readonly platformFees: number;
  readonly sellerShippingCost: number;
  readonly extraCosts: readonly { readonly amount: number }[];
  readonly refundAmount?: number;
}

export interface SaleMetrics {
  readonly revenue: number;
  readonly costOfGoodsSold: number | null;
  readonly sellingCosts: number;
  readonly resultAfterDirectCosts: number | null;
  readonly marginPercent: number | null;
  readonly roiPercent: number | null;
}

export function calculateSaleMetrics(input: SaleMetricsInput): SaleMetrics;
```

- [ ] **Step 1: Write formula tests before implementation**

Use the user's eBay case: item revenue €39.99, buyer shipping €2.99, platform fee €7.70, seller shipping €5.19, and a known COGS value. Assert revenue €42.98 and selling costs €12.89 before COGS. Cover refund, loss, zero revenue, missing COGS, zero COGS, multiple extra costs, and cent rounding.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/app/core/utils/sale-metrics.spec.ts src/app/core/services/sales-profit-calculation.spec.ts`
Expected: FAIL because the shared calculation does not exist and current ROI mixes definitions.

- [ ] **Step 3: Implement the pure function**

Use these exact formulas:

```text
Verkaufserlös = Artikelpreis + vom Käufer gezahlter Versand - Erstattung
Verkaufskosten = Plattformgebühren + tatsächlich bezahlter Versand + weitere direkte Kosten
Ergebnis nach direkten Kosten = Verkaufserlös - Wareneinsatz - Verkaufskosten
Marge = Ergebnis nach direkten Kosten / Verkaufserlös
ROI = Ergebnis nach direkten Kosten / Wareneinsatz
```

Return `null` for result/margin when COGS is unknown, and `null` for ROI when COGS is unknown or not greater than zero. Round display outputs only at the calculation boundary; never parse formatted strings.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/app/core/utils/sale-metrics.spec.ts src/app/core/services/sales-profit-calculation.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/models/sale-metrics.models.ts src/app/core/utils src/app/core/services/sales-profit-calculation.spec.ts
git commit -m "Centralize sale profit calculations"
```

### Task 3: Normalize sale persistence through the new cost model

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/tests/sale_costs_schema.sql`
- Modify: `src/app/core/services/sales.service.ts`
- Modify: `src/app/core/services/sales.service.spec.ts`
- Modify: `src/app/core/services/sales-persistence-actions.spec.ts`
- Modify: `src/app/core/services/return.service.ts`
- Modify: `src/app/core/services/return.service.spec.ts`
- Modify: `src/app/core/models/flipbase.models.ts`

**Interfaces:**

```ts
export interface CreateSalePayload {
  readonly lines: readonly CreateSaleLinePayload[];
  readonly platform: string;
  readonly saleDate: string;
  readonly buyerShippingRevenue: number;
  readonly costs: readonly CreateSaleCostPayload[];
  readonly note: string | null;
  readonly historical: boolean;
}
```

- [ ] **Step 1: Write failing persistence tests**

Assert a new sale writes buyer shipping revenue and all cost rows in the sale transaction/RPC. Assert the platform fee and seller-paid shipping are costs, never deducted from the stored revenue field. Assert failure does not leave a partial sale, line, stock movement, cost row, or business event. Assert sale creation, finalized sale correction, cancellation, and return append immutable events with one correlation ID per transaction and before/after values for every financially relevant change.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run src/app/core/services/sales.service.spec.ts src/app/core/services/sales-persistence-actions.spec.ts src/app/core/services/return.service.spec.ts`
Expected: FAIL for the new payload and atomic cost rows.

- [ ] **Step 3: Adapt service mapping and writes**

Use generated Supabase types and dedicated typed RPCs. Define those RPCs in the declarative schema and extend pgTAP coverage for transaction rollback, workspace isolation, event immutability, and unchanged revenue metadata. Read legacy scalar costs into the normalized model only when no `sale_costs` rows exist, preventing double counting during rollout. Route sale corrections, cancellations, and returns through atomic server functions that update stock/financial values and append their business event in the same transaction.

- [ ] **Step 4: Run service tests**

Run: `npx vitest run src/app/core/services/sales.service.spec.ts src/app/core/services/sales-persistence-actions.spec.ts src/app/core/services/return.service.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/schemas/database.sql supabase/tests/sale_costs_schema.sql src/app/core/services/sales.service.ts src/app/core/services/sales.service.spec.ts src/app/core/services/sales-persistence-actions.spec.ts src/app/core/services/return.service.ts src/app/core/services/return.service.spec.ts src/app/core/models/flipbase.models.ts
git commit -m "Persist normalized sale costs atomically"
```

### Task 4: Redesign the sale modal around explicit revenue and cost fields

**Files:**

- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.html`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts`

- [ ] **Step 1: Write failing modal tests**

Assert visible labeled fields: `Preis je Stück`, `Vom Käufer gezahlter Versand`, `Plattformgebühr`, `Tatsächliche Versandkosten`, and `Notiz zum Verkauf (optional)`. Assert an always-visible `Weitere Kosten` section with `Kosten hinzufügen`; every added row has `Bezeichnung` and `Betrag`, plus remove. Assert there are no three unlabeled zero inputs and no collapsed `Weitere Kosten und Notiz` disclosure.

- [ ] **Step 2: Test the live summary wording and math**

Assert summary labels `Verkaufserlös`, `Wareneinsatz`, `Verkaufskosten`, `Ergebnis nach direkten Kosten`, and `Marge`. ROI must not appear. With the eBay values, assert revenue €42.98 and selling costs €12.89.

- [ ] **Step 3: Run the modal test and verify failure**

Run: `npx vitest run src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts`
Expected: FAIL for missing fields and current labels.

- [ ] **Step 4: Implement typed Reactive FormArrays**

Use `NumberInputComponent`, `CustomSelectComponent`, and visible labels. Platform selection may suggest a fee but must never silently overwrite a user-entered amount. Historical sales use the same fields and validation as current sales plus the existing historical notice.

- [ ] **Step 5: Verify modal behavior**

Run: `npx vitest run src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/sales/components/sale-create-modal
git commit -m "Clarify sale revenue and direct costs"
```

### Task 5: Align the sales journal and dashboard report terminology

**Files:**

- Modify: `src/app/features/sales/sales.component.ts`
- Modify: `src/app/features/sales/sales.component.html`
- Modify: `src/app/features/sales/sales-toast-actions.spec.ts`
- Modify: `src/app/core/services/dashboard-report.service.ts`
- Modify: `src/app/core/services/dashboard-report.service.spec.ts`
- Modify: `src/app/core/models/flipbase.models.ts`
- Modify: `src/app/features/dashboard/dashboard.component.ts`
- Modify: `src/app/features/dashboard/dashboard.component.html`

- [ ] **Step 1: Write failing journal and report tests**

Assert sale rows expose revenue, Wareneinsatz, Verkaufskosten, result, and margin. Assert unknown COGS produces `Kosten noch offen` and no fabricated profit. Assert the dashboard sales journal uses `Wareneinsatz`, never `COGS`, and uses the shared metrics for refunds and losses.

Assert every `DashboardTimePoint` contains four independent values: `revenue`, `costOfGoodsSold`, `sellingCosts`, and `resultAfterDirectCosts`. Their sums must reconcile to the journal rows for the same active platform and period filters.

Assert the main dashboard cards are `Verkaufserlöse`, `Ergebnis nach direkten Kosten`, `Aktueller Bestandswert`, `Verkaufte Artikel`, and `Durchschnittliche Marge`; the average excludes sales whose margin is not calculable.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/app/features/sales src/app/core/services/dashboard-report.service.spec.ts`
Expected: FAIL for current ROI/COGS labels and duplicated calculations.

- [ ] **Step 3: Replace local formulas with `calculateSaleMetrics`**

Remove ROI from the primary sales list. Keep an optional analytics-only ROI field behind a separate detailed view and show it only when calculable. Update dashboard metric cards and report rows to the approved vocabulary.

- [ ] **Step 4: Verify tests and typecheck**

Run: `npx vitest run src/app/features/sales src/app/core/services/dashboard-report.service.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/sales src/app/features/dashboard src/app/core/services/dashboard-report.service.ts src/app/core/services/dashboard-report.service.spec.ts src/app/core/models/flipbase.models.ts
git commit -m "Align sales and dashboard profit metrics"
```

### Task 6: Install Chart.js and replace the hand-built SVG chart

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/app/shared/components/revenue-chart/revenue-chart.component.ts`
- Modify: `src/app/shared/components/revenue-chart/revenue-chart.component.html`
- Modify: `src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts`
- Modify: `src/app/features/dashboard/dashboard.component.ts`
- Modify: `src/app/features/dashboard/dashboard.component.html`

**Interfaces:**

```ts
readonly points = input.required<readonly DashboardTimePoint[]>();
readonly visibleSeries = input<readonly DashboardSeriesKey[]>([
  'revenue',
  'costOfGoodsSold',
  'sellingCosts',
  'resultAfterDirectCosts',
]);
```

- [ ] **Step 1: Recheck the official stable version and install exactly**

Run: `npm view chart.js version dist-tags --json`
Expected at planning time: stable `4.5.1` and no prerelease selection.

Run: `npm install chart.js@4.5.1 --save-exact`
Expected: only `package.json` and `package-lock.json` dependency changes.

- [ ] **Step 2: Write failing lifecycle and accessibility tests**

Mock Chart.js and assert one chart creation, updates when points change, and `destroy()` via `DestroyRef`. Assert a canvas has an accessible name, the legend controls are buttons with pressed state, and a complete data table remains available.

- [ ] **Step 3: Run the chart test and verify failure**

Run: `npx vitest run src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts`
Expected: FAIL against the native SVG implementation.

- [ ] **Step 4: Implement a tree-shaken Chart.js component**

Register only the required line controller, line element, point element, scales, tooltip, legend, filler, and title plugin. Configure German EUR tooltips, interaction mode `index`, `intersect: false`, a visible zero line, responsive resizing, and correct negative-axis scaling. Use Signals/effects only to update external component state; do not construct charts in the template.

- [ ] **Step 5: Add dashboard filters and the accessible table**

Keep platform and period filters in the dashboard. Add series toggle buttons for Verkaufserlös, Wareneinsatz, Verkaufskosten, and Ergebnis. The screen-reader/expandable table lists each period and all four exact values, so the canvas is not the only representation.

- [ ] **Step 6: Run chart, dashboard, type, and build checks**

Run: `npx vitest run src/app/shared/components/revenue-chart src/app/features/dashboard src/app/core/services/dashboard-report.service.spec.ts && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/app/shared/components/revenue-chart src/app/features/dashboard
git commit -m "Add interactive Chart.js dashboard reporting"
```

### Task 7: Verify sales accounting end to end

**Files:**

- Modify only if a regression is found in files already named above.

- [ ] **Step 1: Run database and focused application tests**

Run: `npx supabase test db supabase/tests/sale_costs_schema.sql supabase/tests/purchase_costing_transactions.sql && npx vitest run src/app/core/utils/sale-metrics.spec.ts src/app/core/services/sales*.spec.ts src/app/core/services/dashboard-report.service.spec.ts src/app/features/sales src/app/features/dashboard src/app/shared/components/revenue-chart`
Expected: PASS.

- [ ] **Step 2: Run repository checks**

Run: `npm run format:check && npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Manually verify the eBay example**

Enter item price €39.99, buyer shipping €2.99, actual shipping €5.19, platform fee €7.70, and a known item cost. Verify revenue €42.98, selling costs €12.89, correct result/margin, the same values in sale list and dashboard, interactive hover, keyboard-operable toggles, and the accessible data table.

- [ ] **Step 4: Commit any verification-only fixes**

```bash
git add src/app supabase package.json package-lock.json
git commit -m "Harden sales accounting and reporting"
```
