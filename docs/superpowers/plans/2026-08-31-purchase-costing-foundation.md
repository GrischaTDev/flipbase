# Purchase Costing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the transactional purchase-costing, correction, audit, and legacy-migration foundation used by every later UI package.

**Architecture:** PostgreSQL remains the source of truth. Normal purchase lines store known prices; mystery contents store `NULL` prices and receive deterministic equal-per-unit cost shares at finalization. All finalization and correction work happens in atomic RPCs and appends immutable business events.

**Tech Stack:** PostgreSQL 17, Supabase CLI 2.114, Supabase JS 2.112, Angular 22, TypeScript 6, Vitest 4, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-31-einkaufs-bestandskosten-und-pruefprotokoll-design.md`

## Global Constraints

- Keep all user-facing copy German; commit messages, branch names, PR titles, and workflow titles must be English.
- Do not create a branch containing `codex`.
- Change the declarative schema in `supabase/schemas/database.sql`; generate migrations with `supabase stop` then `supabase db diff -f purchase_costing_foundation`.
- Every exposed table must have RLS, explicit grants, separate policies per operation, and indexed policy columns.
- Use `(select auth.uid())`, never bare `auth.uid()`, in policies and functions.
- Use `security invoker`; a justified `security definer` function must set `search_path = ''` and fully qualify every object.
- No direct database calls from UI components.
- Use whole cents for allocation and deterministic largest-remainder rounding.
- Do not mutate existing production data until the read-only preview has been reviewed.
- Never represent an unknown mystery-item price as a real zero price.

---

## File Structure

| File                                                     | Responsibility                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `supabase/schemas/database.sql`                          | Canonical columns, constraints, RLS, journal, and RPCs                      |
| `supabase/tests/purchase_costing_schema.sql`             | Schema, grants, RLS, immutability, and cross-workspace pgTAP checks         |
| `supabase/tests/purchase_costing_transactions.sql`       | Allocation, finalization, rounding, reopen, and correction pgTAP checks     |
| `supabase/tests/purchase_costing_legacy.sql`             | Read-only legacy preview and explicit backfill checks                       |
| `supabase/tests/fixtures/purchase_costing_legacy.sql`    | Disposable legacy fixture data                                              |
| `src/app/core/models/purchase-costing.models.ts`         | Shared purchase-costing and audit contracts                                 |
| `src/app/core/models/flipbase.models.ts`                 | Existing aggregate model references                                         |
| `src/app/core/models/supabase.types.ts`                  | Generated database types                                                    |
| `src/app/core/services/purchase-costing.service.ts`      | Typed RPC boundary and event queries                                        |
| `src/app/core/services/purchase-costing.service.spec.ts` | RPC payload, error, and state tests                                         |
| `src/app/core/services/purchase.service.ts`              | Delegates finalization/correction; removes non-atomic redistribution writes |
| `src/app/core/services/purchase-cost-allocation.spec.ts` | Existing service regression tests                                           |

### Task 1: Model priced and unpriced purchase lines

**Files:**

- Modify: `supabase/schemas/database.sql`
- Create: `supabase/tests/purchase_costing_schema.sql`
- Create: `src/app/core/models/purchase-costing.models.ts`
- Modify: `src/app/core/models/flipbase.models.ts`

**Interfaces:**

- Produces: `PurchaseLinePriceMode`, `PurchaseEntryStatus`, `PurchaseCostAllocationMethod`, and nullable purchase-line prices.
- Consumes: existing `purchases`, `purchase_costs`, `purchase_lines`, `inventory_items`, and `stock_lots`.

- [ ] **Step 1: Write the failing schema test**

Create pgTAP assertions equivalent to:

```sql
select has_column('public', 'purchases', 'entry_status');
select has_column('public', 'purchases', 'finalized_at');
select has_column('public', 'purchases', 'finalized_by');
select has_column('public', 'purchase_lines', 'price_mode');
select has_column('public', 'purchase_lines', 'estimated_market_value');
select has_column('public', 'purchase_lines', 'allocated_total_cost');
select has_column('public', 'purchase_costs', 'allocation_method');
select has_column('public', 'purchase_costs', 'target_purchase_line_id');
```

Add two inserts: a valid `priced` line with numeric price and a valid `unpriced_mystery` line with both monetary price fields `NULL`. Assert that a priced line with `NULL` price and an unpriced line with `0` fail their check constraint.

- [ ] **Step 2: Run the schema test and verify failure**

Run: `npx supabase test db supabase/tests/purchase_costing_schema.sql`
Expected: FAIL because the new columns and constraints do not exist.

- [ ] **Step 3: Add the declarative schema**

Append new columns at the end of the applicable table definitions and replace the old purchase-line money constraint with this semantic check:

```sql
price_mode text not null default 'priced'
  check (price_mode in ('priced', 'unpriced_mystery')),
condition_snapshot text,
estimated_market_value numeric(12,2)
  check (estimated_market_value is null or estimated_market_value >= 0),
allocated_total_cost numeric(12,2) not null default 0
  check (allocated_total_cost >= 0),
check (
  (
    price_mode = 'priced'
    and unit_purchase_price is not null
    and line_total is not null
    and line_total = round(ordered_quantity * unit_purchase_price, 2)
  )
  or
  (
    price_mode = 'unpriced_mystery'
    and unit_purchase_price is null
    and line_total is null
  )
)
```

Make `unit_purchase_price` and `line_total` nullable while retaining non-negative, non-`NaN`, and scale checks when values exist. Add:

```sql
-- purchases
entry_status text not null default 'draft'
  check (entry_status in ('draft', 'capturing', 'finalized')),
finalized_at timestamptz,
finalized_by uuid references auth.users(id) on delete restrict,
check (
  (entry_status = 'finalized' and finalized_at is not null and finalized_by is not null)
  or
  (entry_status <> 'finalized' and finalized_at is null and finalized_by is null)
)
```

Add to `purchase_costs`:

```sql
allocation_method text not null default 'value_weighted'
  check (allocation_method in ('value_weighted', 'quantity', 'direct')),
target_purchase_line_id uuid references public.purchase_lines(id) on delete restrict,
check (
  (allocation_method = 'direct' and target_purchase_line_id is not null)
  or
  (allocation_method <> 'direct' and target_purchase_line_id is null)
)
```

- [ ] **Step 4: Add strict TypeScript contracts**

Create:

```ts
export type PurchaseLinePriceMode = 'priced' | 'unpriced_mystery';
export type PurchaseEntryStatus = 'draft' | 'capturing' | 'finalized';
export type PurchaseCostAllocationMethod = 'value_weighted' | 'quantity' | 'direct';

export interface PurchaseCostingResult {
  readonly purchaseId: string;
  readonly totalPurchaseCost: number;
  readonly allocatedTotalCost: number;
  readonly entryStatus: PurchaseEntryStatus;
  readonly eventId: string;
}
```

Update `Purchase`, `PurchaseCost`, and `PurchaseLine` in `flipbase.models.ts`; `unit_purchase_price` and `line_total` become `number | null`.

- [ ] **Step 5: Run focused TypeScript and database tests**

Run:

```powershell
npx supabase test db supabase/tests/purchase_costing_schema.sql
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/schemas/database.sql supabase/tests/purchase_costing_schema.sql src/app/core/models/purchase-costing.models.ts src/app/core/models/flipbase.models.ts
git commit -m "Model priced and mystery purchase lines"
```

### Task 2: Add the immutable business-event journal

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/tests/purchase_costing_schema.sql`
- Modify: `src/app/core/models/purchase-costing.models.ts`

**Interfaces:**

- Produces: table `public.business_events` and type `BusinessEvent`.
- Produces: guarded RPCs `public.list_business_events(...)` and `public.list_entity_business_events(...)`.
- Consumes: workspace membership and role checks for owner, admin, and accountant access.

- [ ] **Step 1: Add failing pgTAP checks**

Test table existence, RLS, workspace and entity indexes, absence of direct client SELECT/INSERT/UPDATE/DELETE policies, revoked table privileges including `TRUNCATE`, and a trigger that rejects owner-level update/delete attempts. Test that the global-list RPC succeeds only for workspace owner, admin, and accountant roles. Test that the entity-history RPC succeeds for a member only when that member may access the referenced entity and never exposes another workspace.

Use this event payload in the test:

```json
{
  "purchase_price": { "before": 100, "after": 110 },
  "allocated_total_cost": { "before": 100, "after": 110 }
}
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx supabase test db supabase/tests/purchase_costing_schema.sql`
Expected: FAIL because `business_events` is absent.

- [ ] **Step 3: Create the append-only journal**

Add:

```sql
create table public.business_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  entity_type text not null check (entity_type in ('purchase', 'inventory_item', 'sale', 'return', 'export')),
  entity_id uuid not null,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete restrict,
  reason text,
  changes jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
```

Add comments, indexes, RLS, no direct client policies, and a `before update or delete` rejection trigger. Revoke direct table access from application roles. Append events only inside the owning business transaction. Expose reads through two paged functions:

- `list_business_events`: owner, admin, and accountant only; workspace, filter, cursor, and bounded page size are mandatory inputs;
- `list_entity_business_events`: all workspace members, but only after a type-specific access check for the referenced purchase, inventory item, sale, return, or export.

Both functions must use deterministic `(created_at desc, id desc)` keyset pagination, fully qualify all objects, and return only columns required by the UI/export. If `security definer` is required to read the otherwise inaccessible table, set `search_path = ''`, pin the owner, validate the caller before reading, and grant execute only to `authenticated`.

- [ ] **Step 4: Add the frontend event contract**

```ts
export interface BusinessEvent {
  readonly id: string;
  readonly workspaceId: string;
  readonly entityType: 'purchase' | 'inventory_item' | 'sale' | 'return' | 'export';
  readonly entityId: string;
  readonly eventType: string;
  readonly actorId: string | null;
  readonly reason: string | null;
  readonly changes: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly createdAt: string;
}
```

- [ ] **Step 5: Run the focused test**

Run: `npx supabase test db supabase/tests/purchase_costing_schema.sql`
Expected: PASS, including immutable update/delete checks, global role restrictions, entity-level access, and cross-workspace isolation.

- [ ] **Step 6: Commit**

```powershell
git add supabase/schemas/database.sql supabase/tests/purchase_costing_schema.sql src/app/core/models/purchase-costing.models.ts
git commit -m "Add immutable business event journal"
```

### Task 3: Finalize purchases with deterministic cost allocation

**Files:**

- Modify: `supabase/schemas/database.sql`
- Create: `supabase/tests/purchase_costing_transactions.sql`

**Interfaces:**

- Produces: `public.finalize_purchase_costing(p_workspace_id uuid, p_purchase_id uuid) returns jsonb`.
- Produces: internal helper `public.allocate_integer_cents(p_total_cents bigint, p_weights numeric[]) returns bigint[]`.
- Consumes: schema and journal from Tasks 1–2.

- [ ] **Step 1: Write failing transaction tests**

Cover these exact cases:

```text
normal: lines 40/30/30, extra cost 10 => shares 4/3/3
mystery: six units, total 100 => 16.67×4 + 16.66×2
direct: fee 8 targets exactly one line
quantity: fee 10 across quantities 20/3/2
planning-only: changing estimated_market_value leaves every allocated cost unchanged
invalid: mixed mystery priced line is rejected
invalid: finalize without lines is rejected
atomicity: forced lot insert failure leaves purchase unfinalized and no event
```

- [ ] **Step 2: Run the transaction test and verify failure**

Run: `npx supabase test db supabase/tests/purchase_costing_transactions.sql`
Expected: FAIL because the RPCs are absent.

- [ ] **Step 3: Implement the cent allocator**

Implement largest remainder with deterministic array-position tie-breaking. The helper must reject negative totals, negative weights, an empty weight array, and a zero total weight when total cents are nonzero.

- [ ] **Step 4: Implement finalization**

The RPC must:

```text
1. require authenticated caller and workspace membership;
2. lock the purchase, its lines, and costs FOR UPDATE;
3. reject a purchase already finalized;
4. require mystery lines to be unpriced and all other lines to be priced;
5. for normal purchases, derive and persist purchase_price from the sum of line totals and reject a conflicting caller-supplied header price;
6. for mystery purchases, use the explicitly entered header purchase_price;
7. derive total_purchase_cost from that goods amount plus purchase_costs;
8. allocate base mystery cost equally per unit;
9. allocate normal extra costs per cost-row method;
10. write line allocated_total_cost and allocated_additional_cost;
11. create/update inventory items or stock lots with unit cost;
12. set entry_status, finalized_at, finalized_by;
13. append one purchase_finalized business event;
14. return JSON matching PurchaseCostingResult.
```

Use `pg_advisory_xact_lock(hashtextextended(p_purchase_id::text, 0))` before allocation to serialize concurrent finalizations.

- [ ] **Step 5: Run transaction and schema tests**

```powershell
npx supabase test db supabase/tests/purchase_costing_schema.sql
npx supabase test db supabase/tests/purchase_costing_transactions.sql
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/schemas/database.sql supabase/tests/purchase_costing_transactions.sql
git commit -m "Finalize purchases with deterministic costing"
```

### Task 4: Reopen and correct finalized purchases safely

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/tests/purchase_costing_transactions.sql`

**Interfaces:**

- Produces: `public.reopen_purchase_costing(p_workspace_id uuid, p_purchase_id uuid) returns jsonb`.
- Produces: `public.correct_purchase_costing(p_workspace_id uuid, p_purchase_id uuid, p_reason text, p_lines jsonb, p_costs jsonb) returns jsonb`.
- Consumes: `finalize_purchase_costing` and `business_events`.

- [ ] **Step 1: Add failing correction tests**

Assert:

```text
reopen succeeds before first sale;
reopen fails after any sale line references the purchase;
correction rejects blank reason;
correction updates unsold lot/item costs;
correction updates sold sale-line COGS;
sale price, platform, sale date, and selling costs remain unchanged;
old/new costs are present in one immutable event correlation;
cross-workspace calls fail.
```

- [ ] **Step 2: Run and verify failure**

Run: `npx supabase test db supabase/tests/purchase_costing_transactions.sql`
Expected: FAIL because reopen/correction RPCs are absent.

- [ ] **Step 3: Implement reopen**

Lock the purchase and reject if this query finds a row:

```sql
select 1
from public.sale_lines sl
join public.inventory_items ii on ii.id = sl.inventory_item_id
where ii.purchase_id = p_purchase_id
union all
select 1
from public.sale_line_lot_allocations slla
join public.stock_lots lot on lot.id = slla.stock_lot_id
where lot.purchase_id = p_purchase_id
limit 1;
```

Set the purchase to `capturing`, clear finalization metadata, make derived stock unavailable, and append `purchase_reopened`.

- [ ] **Step 4: Implement correction**

Validate the replacement line/cost payload, snapshot old values, replace mutable purchase inputs inside the transaction, reuse the allocation helper, update inventory/lot unit costs and persisted COGS, and append `purchase_corrected` with the mandatory reason. Do not change sale revenue fields.

- [ ] **Step 5: Run all costing tests**

```powershell
npx supabase test db supabase/tests/purchase_costing_schema.sql
npx supabase test db supabase/tests/purchase_costing_transactions.sql
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/schemas/database.sql supabase/tests/purchase_costing_transactions.sql
git commit -m "Add safe purchase costing corrections"
```

### Task 5: Add the Angular purchase-costing boundary

**Files:**

- Create: `src/app/core/services/purchase-costing.service.ts`
- Create: `src/app/core/services/purchase-costing.service.spec.ts`
- Modify: `src/app/core/services/purchase.service.ts`
- Modify: `src/app/core/services/purchase-cost-allocation.spec.ts`

**Interfaces:**

- Produces: `finalizePurchase`, `reopenPurchase`, `correctPurchase`, and `loadEvents`.
- Consumes: RPC signatures from Tasks 3–4 and `PurchaseCostingResult` from Task 1.

- [ ] **Step 1: Write failing service tests**

Test these calls exactly:

```ts
await service.finalizePurchase('ws-1', 'purchase-1');
await service.reopenPurchase('ws-1', 'purchase-1');
await service.correctPurchase({
  workspaceId: 'ws-1',
  purchaseId: 'purchase-1',
  reason: 'Ein weiterer Artikel wurde gefunden.',
  lines: [],
  costs: [],
});
```

Assert RPC names, snake_case arguments, typed mapping, `SyncStatusService` error reporting, and no local optimistic success after a failed RPC.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- src/app/core/services/purchase-costing.service.spec.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the service**

Expose:

```ts
finalizePurchase(workspaceId: string, purchaseId: string): Promise<MutationResult<PurchaseCostingResult>>;
reopenPurchase(workspaceId: string, purchaseId: string): Promise<MutationResult<PurchaseCostingResult>>;
correctPurchase(input: CorrectPurchaseCostingInput): Promise<MutationResult<PurchaseCostingResult>>;
loadEvents(workspaceId: string, entityType: string, entityId: string): Promise<MutationResult<readonly BusinessEvent[]>>;
```

Delegate from `PurchaseService.redistributeCosts`; remove its per-item Supabase update loop so the browser cannot leave a partially redistributed purchase.

- [ ] **Step 4: Run focused tests**

```powershell
npm test -- src/app/core/services/purchase-costing.service.spec.ts src/app/core/services/purchase-cost-allocation.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/core/services/purchase-costing.service.ts src/app/core/services/purchase-costing.service.spec.ts src/app/core/services/purchase.service.ts src/app/core/services/purchase-cost-allocation.spec.ts
git commit -m "Add purchase costing service boundary"
```

### Task 6: Build and verify the legacy preview and migration

**Files:**

- Create: `supabase/tests/fixtures/purchase_costing_legacy.sql`
- Create: `supabase/tests/purchase_costing_legacy.sql`
- Modify: `supabase/schemas/database.sql`
- Generate: `supabase/migrations/<timestamp>_purchase_costing_foundation.sql`
- Generate: `src/app/core/models/supabase.types.ts`

**Interfaces:**

- Produces: `public.preview_purchase_costing_legacy()` read-only report.
- Produces: `public.migrate_purchase_costing_legacy(p_workspace_id uuid, p_confirm boolean) returns jsonb`.
- Consumes: finalization and journal RPCs.

- [ ] **Step 1: Write the legacy fixture and failing tests**

Fixture cases:

```text
mystery purchase with four linked items, two sold;
mystery purchase with no linked items;
normal purchase with no purchase lines;
existing sale values and fees that must not change.
```

The preview must return `auto_repair`, `items_missing`, or `manual_review` without writing rows. The migration must refuse unless `p_confirm = true`.

- [ ] **Step 2: Run and verify failure**

Run: `npx supabase test db supabase/tests/purchase_costing_legacy.sql`
Expected: FAIL because preview/migration functions are absent.

- [ ] **Step 3: Implement preview and confirmed migration**

The migration may automatically repair only mystery purchases with linked items. It must allocate total purchase cost across all linked units, update sold COGS, preserve sale revenue metadata, and append `purchase_costing_legacy_migrated`. Purchases without items receive no invented rows.

- [ ] **Step 4: Run every database test**

```powershell
npx supabase test db
```

Expected: PASS.

- [ ] **Step 5: Generate migration and TypeScript types**

```powershell
npx supabase stop
npx supabase db diff -f purchase_costing_foundation
npx supabase start
npx supabase gen types typescript --local | Set-Content -Encoding utf8 src/app/core/models/supabase.types.ts
```

Inspect the generated migration: SQL keywords lowercase, UTC filename, purpose header, no destructive drop of business data.

- [ ] **Step 6: Run the full local gate**

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx supabase test db
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```powershell
git add supabase/schemas/database.sql supabase/migrations supabase/tests src/app/core/models/supabase.types.ts
git commit -m "Add purchase costing legacy migration"
```

## Package Acceptance

- Normal and mystery costs finalize atomically and exactly.
- Unknown mystery prices remain `NULL`.
- Corrections preserve original values in immutable events and recalculate affected COGS.
- The read-only legacy preview performs no writes.
- No production migration has run automatically.
- All database, unit, type, lint, formatting, and build checks pass.
