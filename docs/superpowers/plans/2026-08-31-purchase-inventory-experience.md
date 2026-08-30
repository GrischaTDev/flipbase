# Purchase and Inventory Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normal purchases, mystery-box purchases, corrections, and inventory understandable without exposing accounting jargon or inventing missing costs.

**Architecture:** Purchase entry stays feature-local and delegates all costing writes to the transactional foundation. Presentation models translate database states into plain German labels. Purchase and inventory pages share the same quantity, condition, cost-state, badge, and select semantics.

**Tech Stack:** Angular 22 standalone components, Signals, Reactive Forms, Tailwind CSS, Vitest 4, Testing Library where already configured.

**Spec:** `docs/superpowers/specs/2026-08-31-einkaufs-bestandskosten-und-pruefprotokoll-design.md`

## Global Constraints

- Complete `2026-08-31-purchase-costing-foundation.md` before this plan.
- Keep all user-facing copy German; commit messages, branch names, PR titles, and workflow titles must be English.
- Do not create a branch containing `codex`.
- Use standalone components, `input()`, `output()`, Signals, `computed()`, `ChangeDetectionStrategy.OnPush`, native control flow, and Reactive Forms.
- Put Tailwind classes in HTML; do not add SCSS unless a behavior cannot be expressed with Tailwind.
- Use the shared `CustomSelectComponent` for every styled select and provide visible keyboard focus.
- Do not query Supabase from components.
- Do not show an unknown cost as `0,00 €`; use `Kosten noch offen`.
- Do not show raw enum values such as `like_new`, `individual`, or `value_weighted`.
- Preserve unrelated working-tree changes.

---

## File Structure

| File                                                                 | Responsibility                                    |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| `src/app/shared/pipes/item-condition-label.pipe.ts`                  | German condition labels                           |
| `src/app/shared/pipes/purchase-type-label.pipe.ts`                   | German purchase-type labels                       |
| `src/app/shared/components/cost-state/cost-state.component.*`        | One accessible cost amount/open-state renderer    |
| `src/app/features/purchases/models/purchase-presentation.models.ts`  | UI-only row and summary contracts                 |
| `src/app/features/purchases/utils/purchase-presentation.ts`          | Pure mapping from persisted records to UI models  |
| `src/app/features/purchases/components/purchase-line-editor/*`       | Normal and mystery content entry                  |
| `src/app/features/purchases/components/purchase-cost-editor/*`       | Additional costs and advanced allocation          |
| `src/app/features/purchases/components/purchase-create-modal/*`      | Type-aware purchase form orchestration            |
| `src/app/features/purchases/components/purchase-correction-dialog/*` | Single-reason post-sale correction flow           |
| `src/app/features/purchases/pages/purchase-detail/*`                 | Type-aware detail and finalization/reopen actions |
| `src/app/features/purchases/purchases.component.*`                   | Full-width responsive purchase rows               |
| `src/app/features/inventory/components/stock-position-list/*`        | Unified stock list and quantity labels            |
| `src/app/features/inventory/pages/item-detail/*`                     | Origin, cost, sale, and local history context     |
| `src/app/features/inventory/inventory.component.*`                   | One inventory view without item-type tabs         |

### Task 1: Centralize plain-language labels and unknown-cost rendering

**Files:**

- Create: `src/app/shared/pipes/item-condition-label.pipe.ts`
- Create: `src/app/shared/pipes/item-condition-label.pipe.spec.ts`
- Create: `src/app/shared/pipes/purchase-type-label.pipe.ts`
- Create: `src/app/shared/pipes/purchase-type-label.pipe.spec.ts`
- Create: `src/app/shared/components/cost-state/cost-state.component.ts`
- Create: `src/app/shared/components/cost-state/cost-state.component.html`
- Create: `src/app/shared/components/cost-state/cost-state.component.spec.ts`

**Interfaces:**

```ts
export type CostState =
  { readonly kind: 'known'; readonly amount: number } | { readonly kind: 'open' };

export class ItemConditionLabelPipe {
  transform(value: ItemCondition | null | undefined): string;
}
```

- [ ] **Step 1: Write failing label and rendering tests**

Assert `new -> Neu`, `like_new -> Wie neu`, `very_good -> Sehr gut`, `used -> Gebraucht`, `heavily_used -> Stark gebraucht`, and `defective -> Defekt / Ersatzteil`. Assert `single -> Normaler Einkauf` and `mystery_box -> Mystery Box`. Render both cost-state variants and verify that the open state contains no currency zero.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run src/app/shared/pipes/item-condition-label.pipe.spec.ts src/app/shared/pipes/purchase-type-label.pipe.spec.ts src/app/shared/components/cost-state/cost-state.component.spec.ts`
Expected: FAIL because the shared presentation primitives do not exist.

- [ ] **Step 3: Implement exhaustive mappings and the accessible renderer**

Use exhaustive `Record` mappings so a new enum value causes a TypeScript error. The component must render `Kosten noch offen` with an explanatory accessible label, or a localized EUR amount when known.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/app/shared/pipes/item-condition-label.pipe.spec.ts src/app/shared/pipes/purchase-type-label.pipe.spec.ts src/app/shared/components/cost-state/cost-state.component.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/pipes src/app/shared/components/cost-state
git commit -m "Add shared inventory presentation labels"
```

### Task 2: Build type-aware purchase line entry

**Files:**

- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.ts`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.spec.ts`

**Interfaces:**

```ts
export interface PurchaseLineDraft {
  readonly catalogProductId: string | null;
  readonly titleSnapshot: string;
  readonly lineKind: TrackingMode;
  readonly orderedQuantity: number;
  readonly condition: ItemCondition;
  readonly priceMode: 'priced' | 'unpriced_mystery';
  readonly unitPurchasePrice: number | null;
  readonly lineTotal: number | null;
  readonly estimatedMarketValue: number | null;
}

readonly purchaseType = input.required<PurchaseType>();
```

- [ ] **Step 1: Extend tests for normal and mystery rows**

For a normal purchase, assert title, quantity default `1`, condition, `Einkaufspreis pro Stück`, and `Gesamt`. The purchase header price is read-only and equals the sum of normal line totals. For a mystery box, assert title, quantity default `1`, condition, optional `Geschätzter Marktwert (optional)` per unit, an editable purchase header price, and the complete absence of purchase-price controls on content rows. Assert that zero is never emitted as an unpriced mystery price and that changing the market value never changes a cost summary.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npx vitest run src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.spec.ts`
Expected: FAIL against the current always-priced row model.

- [ ] **Step 3: Make controls switch predictably by purchase type**

Keep a single typed `FormArray`. Use `CustomSelectComponent` for the translated per-line condition. When the type changes to `mystery_box`, set `priceMode` to `unpriced_mystery`, set both purchase-price values to `null`, remove their validators, and add optional non-negative market-value validation. When changing back to normal, restore `priced` controls and required non-negative price validators. Do not use `any` or template arrow functions.

- [ ] **Step 4: Implement the responsive row template**

Use visible labels for every field. Keep `Menge` for both modes and explain below the mystery list: `Die Gesamtkosten werden beim Abschließen gleichmäßig auf alle erfassten Stücke verteilt.`

- [ ] **Step 5: Verify tests and accessibility semantics**

Run: `npx vitest run src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.spec.ts && npm run typecheck`
Expected: PASS with unique input labels and keyboard-reachable add/remove buttons.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/purchases/components/purchase-line-editor
git commit -m "Support normal and mystery purchase lines"
```

### Task 3: Clarify additional purchase costs and allocation controls

**Files:**

- Create: `src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.ts`
- Create: `src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.html`
- Create: `src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-create-modal/purchase-create-modal.component.ts`
- Modify: `src/app/features/purchases/components/purchase-create-modal/purchase-create-modal.component.html`

**Interfaces:**

```ts
export interface PurchaseCostDraft {
  readonly type: PurchaseCostType;
  readonly amount: number;
  readonly description: string;
  readonly allocationMethod: 'by_value' | 'by_quantity' | 'direct';
  readonly targetPurchaseLineId: string | null;
}
```

- [ ] **Step 1: Write failing cost-editor tests**

Assert an `Kosten hinzufügen` button, labeled cost type/amount/description controls, and remove buttons. For normal purchases, assert default allocation `Nach Warenwert`; opening `Verteilung ändern` exposes `Nach Warenwert`, `Nach Menge`, and `Direkt einer Position zuordnen`. For mystery boxes, assert fixed `Gleichmäßig pro Stück` and no configurable allocation select.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.spec.ts`
Expected: FAIL because the focused component does not exist.

- [ ] **Step 3: Implement the editor with shared controls**

Use `CustomSelectComponent` for type and allocation method, `NumberInputComponent` for amount, and Reactive Forms. Only require a target line for `direct`. Preserve existing types such as Versand, Fahrtkosten, Zoll, Gebühren, and Sonstiges. Normal purchase `Einkauf` is the computed sum of all line totals; mystery purchase `Einkauf` is the manually entered box price. Never add both as separate goods amounts.

- [ ] **Step 4: Replace the modal's inline cost state**

Move `ExtraCostEntry`, allocation UI, and related validation out of the modal. Keep the purchase base price separate from additional costs. The summary must show `Einkauf`, `Zusätzliche Kosten`, and `Gesamtkosten`.

- [ ] **Step 5: Run focused and modal tests**

Run: `npx vitest run src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.spec.ts src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/purchases/components/purchase-cost-editor src/app/features/purchases/components/purchase-create-modal
git commit -m "Clarify purchase cost allocation controls"
```

### Task 4: Connect purchase creation, finalization, reopening, and correction

**Files:**

- Modify: `src/app/features/purchases/components/purchase-create-modal/purchase-create-modal.component.ts`
- Modify: `src/app/features/purchases/components/purchase-create-modal/purchase-create-modal.component.html`
- Modify: `src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts`
- Create: `src/app/features/purchases/components/purchase-correction-dialog/purchase-correction-dialog.component.ts`
- Create: `src/app/features/purchases/components/purchase-correction-dialog/purchase-correction-dialog.component.html`
- Create: `src/app/features/purchases/components/purchase-correction-dialog/purchase-correction-dialog.component.spec.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts`

**Interfaces:**

```ts
finalizePurchase(purchaseId: string): Promise<Result<PurchaseFinalizationResult>>;
reopenPurchase(purchaseId: string): Promise<Result<void>>;
correctPurchase(purchaseId: string, reason: string, draft: PurchaseCorrectionDraft): Promise<Result<void>>;
```

- [ ] **Step 1: Write failing behavior tests**

Cover: draft contents are not sellable; `Erfassung abschließen` calls the atomic RPC; a finalized purchase without a sale can be reopened; a purchase with any sale offers `Einkauf korrigieren`; correction requires exactly one field labeled `Grund der Korrektur`; no `Legacy`, `Altdaten`, or second reason field appears.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts src/app/features/purchases/components/purchase-correction-dialog/purchase-correction-dialog.component.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts`
Expected: FAIL for missing lifecycle actions.

- [ ] **Step 3: Delegate every costing transition to `PurchaseCostingService`**

Remove UI-side redistribution or loops. Disable repeated submission, show the service's plain German error, reload only after success, and retain the draft on failure.

- [ ] **Step 4: Implement correction UX**

The dialog contains the editable purchase data plus one required reason. Explain: `Die Änderung wird protokolliert und betroffene Verkaufsergebnisse werden neu berechnet.` Do not offer hard deletion of a finalized purchase.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts src/app/features/purchases/components/purchase-correction-dialog/purchase-correction-dialog.component.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/purchases/components src/app/features/purchases/pages/purchase-detail
git commit -m "Add purchase finalization and correction flows"
```

### Task 5: Replace the purchase card grid with full-width responsive rows

**Files:**

- Create: `src/app/features/purchases/models/purchase-presentation.models.ts`
- Create: `src/app/features/purchases/utils/purchase-presentation.ts`
- Create: `src/app/features/purchases/utils/purchase-presentation.spec.ts`
- Modify: `src/app/features/purchases/purchases.component.ts`
- Modify: `src/app/features/purchases/purchases.component.html`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- Modify: `src/app/core/services/purchase-detail-load-race.spec.ts`

**Interfaces:**

```ts
export interface PurchaseListRow {
  readonly id: string;
  readonly title: string;
  readonly typeLabel: string;
  readonly purchaseDate: string;
  readonly supplierLabel: string;
  readonly purchaseStatus:
    | 'Entwurf'
    | 'Bestellt'
    | 'Eingetroffen'
    | 'Inhalt erfassen'
    | 'Erfassung abgeschlossen'
    | 'Storniert'
    | 'Archiviert'
    | 'Prüfung erforderlich';
  readonly allocationOpen: boolean;
  readonly totalCost: CostState;
  readonly totalUnits: number;
  readonly availableUnits: number;
  readonly soldUnits: number;
}
```

- [ ] **Step 1: Write failing mapper tests**

Assert separate purchase status and item sale counts. Cover `Entwurf`, `Bestellt`, `Eingetroffen`, mystery-only `Inhalt erfassen`, `Erfassung abgeschlossen`, `Storniert`, `Archiviert`, and the migration warning `Prüfung erforderlich`. Verify that a sold item does not turn the purchase status into `Verkauft`. Verify unfinished allocation produces the separate badge `Kostenaufteilung offen`, and unknown cost maps to `{ kind: 'open' }`.

- [ ] **Step 2: Run mapper tests and verify failure**

Run: `npx vitest run src/app/features/purchases/utils/purchase-presentation.spec.ts`
Expected: FAIL because the mapper does not exist.

- [ ] **Step 3: Implement pure presentation mapping**

Keep accounting/state rules out of templates. Normal details show `Artikel`, `Menge`, `Einkaufspreis pro Stück`, `Zusätzlicher Kostenanteil`, `Gesamtkosten pro Stück`, and availability. Mystery details show `Artikel`, `Menge`, `Zustand`, `Geschätzter Marktwert`, `Kostenanteil pro Stück`, availability, and sale result where present.

- [ ] **Step 4: Implement full-width rows**

Use one row/card per purchase with a larger image and horizontally distributed content on desktop, stacking on narrow screens. The entire primary row link must be keyboard reachable without nesting buttons inside it.

- [ ] **Step 5: Preserve purchase navigation context**

From `/purchases/:id`, opening an article may use a query parameter such as `returnTo=/purchases/:id`. The item detail back action must navigate to that validated internal route, otherwise to `/inventory`. Add a regression test for the reported jump to the inventory tab.

- [ ] **Step 6: Run purchase tests**

Run: `npx vitest run src/app/features/purchases src/app/core/services/purchase-detail-load-race.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/purchases src/app/core/services/purchase-detail-load-race.spec.ts
git commit -m "Redesign purchase list and detail context"
```

### Task 6: Unify inventory quantities, costs, badges, and sold context

**Files:**

- Modify: `src/app/features/inventory/inventory.component.ts`
- Modify: `src/app/features/inventory/inventory.component.html`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.ts`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.html`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.html`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts`
- Modify: `src/app/core/services/inventory.service.ts`
- Modify: `src/app/core/services/inventory-lifecycle.spec.ts`

**Interfaces:**

```ts
export interface InventoryQuantitySummary {
  readonly total: number;
  readonly available: number;
  readonly reserved: number;
  readonly sold: number;
}
```

- [ ] **Step 1: Write failing inventory tests**

Assert one inventory surface with no `Bestand`/`Einzelstücke` tab pair and no redundant `Art: Einzelstück`. For quantity one, assert `1 erfasst` and a consistent availability breakdown. Assert sold badges use the shared semantic size/color. Assert all status controls use `CustomSelectComponent`. Assert unknown origin cost displays `Kosten noch offen`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts src/app/core/services/inventory-lifecycle.spec.ts`
Expected: FAIL for current tab, label, and fallback behavior.

- [ ] **Step 3: Return one normalized inventory view model from the service**

Calculate total, available, reserved, and sold from stock lots/movements and individual item state using one shared rule. Do not infer available `0` merely because a legacy item lacks a lot; surface `Prüfung erforderlich` when the records disagree.

- [ ] **Step 4: Update list and detail templates**

Use `Herkunft`, `Kostenanteil`, `Gesamt`, and the German condition label. Link origin to the purchase. For a sold record, show sale date, sale price/revenue, direct result, and an action to open the sale; edits occur through the correction flow, not direct status mutation.

- [ ] **Step 5: Run inventory tests and typecheck**

Run: `npx vitest run src/app/features/inventory src/app/core/services/inventory-lifecycle.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/inventory src/app/core/services/inventory.service.ts src/app/core/services/inventory-lifecycle.spec.ts
git commit -m "Unify inventory quantity and cost presentation"
```

### Task 7: Verify the complete purchase and inventory journey

**Files:**

- Modify only if a regression is found in files already named above.

- [ ] **Step 1: Run the focused feature suites**

Run: `npx vitest run src/app/features/purchases src/app/features/inventory src/app/core/services/purchase-*.spec.ts src/app/core/services/inventory-*.spec.ts`
Expected: PASS.

- [ ] **Step 2: Run static checks**

Run: `npm run format:check && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: PASS without accessibility template errors or bundle regressions.

- [ ] **Step 4: Manually smoke-test both purchase types**

In a disposable workspace: create a normal multi-line purchase and verify its header amount equals, rather than duplicates, the line total; create a €100 mystery box with six units and verify shares `4 × €16.67 + 2 × €16.66`; finalize; sell one unit; open it from purchase detail and return to the same purchase; correct the purchase once; verify no fake zero cost and no unexplained English enum remains.

- [ ] **Step 5: Commit any verification-only fixes**

```bash
git add src/app/features/purchases src/app/features/inventory src/app/shared
git commit -m "Harden purchase and inventory workflows"
```
