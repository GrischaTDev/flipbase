# Artikelkontext und historische Statuskorrektur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Artikeldetails führen zuverlässig zum tatsächlichen Ursprungseinkauf zurück und historische Verkaufszustände lassen sich ohne unverständliche Freitextgründe, aber mit unveränderlicher automatischer Dokumentation korrigieren.

**Architecture:** Der Einkaufskontext wird als `fromPurchaseId` in der URL transportiert und im Artikeldetail gegen die geladene `purchase_id` validiert. Die vorhandenen eingeschränkten RPCs bleiben unverändert; nur die Angular-Services erzeugen die zwei vorgeschriebenen Auditgründe, während alle sichtbaren Formulare und Texte von technischen Legacy-Begriffen befreit werden.

**Tech Stack:** Angular 22, TypeScript strict, Signals, Angular Router mit `withComponentInputBinding()`, Reactive Forms, Vitest, Supabase-RPCs ohne Schemaänderung.

**Spec:** `docs/superpowers/specs/2026-08-30-bedienkonsistenz-und-dashboard-interaktion-design.md`

## Global Constraints

- Framework: Angular 22, Standalone Components, Signals, `ChangeDetectionStrategy.OnPush`, strikte Typen.
- Sichtbare Texte enthalten weder `Legacy` noch unverständliche technische Statusnamen.
- Die RPCs `resolve_legacy_sold_item` und `record_legacy_inventory_sale` sowie ihre Datenbanksignaturen bleiben unverändert.
- Keine neue Datenbankmigration und keine Änderung der fachlichen Verkaufs- oder Bestandslogik.
- Kein freies `returnUrl`, kein `history.back()` und kein ausschließlich flüchtiger Router-State für die Rücknavigation.
- Die internen Namen `LegacySaleReconciliation`, `legacyReconciliation` und `legacy_sold_unverified` dürfen bestehen bleiben.
- Jeder Task folgt RED → GREEN → Refactor und endet mit einem eigenen Commit.

---

## File Map

- Create `src/app/features/purchases/pages/purchase-detail/purchase-detail-navigation.spec.ts`: Vertrag für beide Artikellinks aus einem Einkauf.
- Create `src/app/features/inventory/pages/item-detail/item-detail-navigation.spec.ts`: Router-/Reload-Vertrag für den validierten Rücksprung.
- Modify `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`: `fromPurchaseId` an beide Artikellinks hängen.
- Modify `src/app/features/inventory/pages/item-detail/item-detail.component.ts`: validiertes `backLink`-Signal.
- Modify `src/app/features/inventory/pages/item-detail/item-detail.component.html`: dynamischer Rücksprung und verständliche Korrekturansicht.
- Create `src/app/core/models/inventory-reconciliation.ts`: zentrale unveränderliche Auditgründe.
- Modify `src/app/core/services/inventory.service.ts`: Grund für Bestandsrücknahme ausschließlich intern ergänzen.
- Modify `src/app/core/services/sales.service.ts`: Grund für Verkaufsnachtrag ausschließlich intern ergänzen und sichtbare Fehler neutral formulieren.
- Modify `src/app/features/inventory/components/stock-position-list/stock-position-list.component.ts`: Restore-Output ohne Freitext.
- Modify `src/app/features/inventory/components/stock-position-list/stock-position-list.component.html`: Grundfeld entfernen und Texte ersetzen.
- Modify `src/app/features/inventory/inventory.component.ts`: Bestätigung und Restore-Aufruf ohne Grundparameter.
- Modify `src/app/features/inventory/inventory.component.html`: Filtertext `Verkaufsstatus klären`.
- Modify `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts`: Grund-Control entfernen, strukturelle Guards behalten.
- Modify `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.html`: verständlicher Hinweis statt Grundfeld.
- Modify the existing focused specs named in Tasks 2 and 3; create `sale-create-modal-ux.spec.ts` for rendered copy.

---

### Task 1: Validated purchase return context

**Files:**

- Create: `src/app/features/purchases/pages/purchase-detail/purchase-detail-navigation.spec.ts`
- Create: `src/app/features/inventory/pages/item-detail/item-detail-navigation.spec.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html:348`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html:400`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.ts:82`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.html:4`

**Interfaces:**

- Consumes: `ItemDetailComponent.id: InputSignal<string>`, `InventoryService.selectedItem: Signal<InventoryItem | null>`, `InventoryItem.purchase_id: string | null`, existing `withComponentInputBinding()`.
- Produces: `fromPurchaseId: InputSignal<string | null>` and `backLink: Signal<ItemDetailBackLink>`.

- [ ] **Step 1: Write the failing purchase-link test**

  Create `purchase-detail-navigation.spec.ts` and render the existing template with one item. Assert both title and `Details` links contain the same validated source ID:

  ```ts
  const links = [...host.querySelectorAll<HTMLAnchorElement>(`a[href*="/inventory/${item.id}"]`)];
  expect(links).toHaveLength(2);
  for (const link of links) {
    const url = new URL(link.href);
    expect(url.pathname).toBe(`/inventory/${item.id}`);
    expect(url.searchParams.get('fromPurchaseId')).toBe(purchase.id);
  }
  ```

- [ ] **Step 2: Write the failing reload and manipulation tests**

  Create `item-detail-navigation.spec.ts` with `RouterTestingHarness`, `provideRouter(routes, withComponentInputBinding())` and controlled service signals. Cover all exact outcomes:

  ```ts
  await harness.navigateByUrl(`/inventory/${item.id}?fromPurchaseId=${purchase.id}`);
  expect(root.textContent).toContain('Zurück zum Einkauf');
  expect(root.querySelector<HTMLAnchorElement>('[data-item-back-link]')?.pathname).toBe(
    `/purchases/${purchase.id}`,
  );

  await harness.navigateByUrl(`/inventory/${item.id}?fromPurchaseId=fremder-einkauf`);
  expect(root.textContent).toContain('Zurück zum Inventar');

  selectedItem.set({ ...item, id: 'stale-item', purchase_id: purchase.id });
  await harness.navigateByUrl(`/inventory/${item.id}?fromPurchaseId=${purchase.id}`);
  expect(root.textContent).toContain('Zurück zum Inventar');
  ```

  Add the missing-parameter case and a cold/reload-style case in which `selectedItem` starts `null` and is set only after the route is active.

- [ ] **Step 3: Run the navigation tests and verify RED**

  ```powershell
  npx vitest run src/app/features/purchases/pages/purchase-detail/purchase-detail-navigation.spec.ts src/app/features/inventory/pages/item-detail/item-detail-navigation.spec.ts
  ```

  Expected: FAIL because the purchase links have no query parameter and the item back link is hard-coded to `/inventory`.

- [ ] **Step 4: Implement the typed validated back link**

  Import `computed` in `item-detail.component.ts` and add:

  ```ts
  type ItemDetailBackLink =
    | {
        readonly commands: ['/purchases', string];
        readonly label: 'Zurück zum Einkauf';
      }
    | {
        readonly commands: ['/inventory'];
        readonly label: 'Zurück zum Inventar';
      };

  readonly fromPurchaseId = input<string | null>(null);
  readonly backLink = computed<ItemDetailBackLink>(() => {
    const item = this.inventoryService.selectedItem();
    const purchaseId = this.fromPurchaseId();
    const isValidatedPurchase =
      item?.id === this.id() && !!purchaseId && item.purchase_id === purchaseId;

    return isValidatedPurchase
      ? { commands: ['/purchases', purchaseId], label: 'Zurück zum Einkauf' }
      : { commands: ['/inventory'], label: 'Zurück zum Inventar' };
  });
  ```

  Bind the header link to `[routerLink]="backLink().commands"`, render `backLink().label`, and add `data-item-back-link`. In both purchase links add:

  ```html
  [queryParams]="{ fromPurchaseId: p.id }"
  ```

  Use the loop variable representing the currently rendered purchase; do not use a freely supplied URL.

- [ ] **Step 5: Run GREEN checks and commit**

  ```powershell
  npx vitest run src/app/features/purchases/pages/purchase-detail/purchase-detail-navigation.spec.ts src/app/features/inventory/pages/item-detail/item-detail-navigation.spec.ts
  npm run typecheck
  git add -- src/app/features/purchases/pages/purchase-detail/purchase-detail-navigation.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html src/app/features/inventory/pages/item-detail/item-detail-navigation.spec.ts src/app/features/inventory/pages/item-detail/item-detail.component.ts src/app/features/inventory/pages/item-detail/item-detail.component.html
  git commit -m "fix: preserve purchase context in item details"
  ```

  Expected: both focused specs and typecheck PASS.

---

### Task 2: Service-owned audit reasons

**Files:**

- Create: `src/app/core/models/inventory-reconciliation.ts`
- Modify: `src/app/core/services/inventory.service.ts:421`
- Modify: `src/app/core/services/inventory-persistence.spec.ts:486`
- Modify: `src/app/core/services/sales.service.ts:334`
- Modify: `src/app/core/services/sales.service.spec.ts:418`

**Interfaces:**

- Produces:

  ```ts
  export const INVENTORY_RECONCILIATION_AUDIT_REASONS = {
    restoreStock: 'Historische Statuskorrektur: Artikel ist noch vorhanden.',
    recordSale: 'Historische Statuskorrektur: Verkauf nachgetragen.',
  } as const;

  resolveLegacySoldItem(itemId: string): Promise<{ error: Error | null }>;
  recordLegacySale(
    inventoryItemId: string,
    input: RecordSaleInput,
  ): Promise<MutationResult<RecordSaleResult>>;
  ```

- Consumes: unchanged RPC parameters `p_reason`, `p_action`, `p_inventory_item_id`, `p_sale`.

- [ ] **Step 1: Change persistence specs to the new public signatures**

  In `inventory-persistence.spec.ts`, call:

  ```ts
  const reconciliation = service.resolveLegacySoldItem(item.id);
  expect(rpc).toHaveBeenCalledWith('resolve_legacy_sold_item', {
    p_workspace_id: workspace.id,
    p_inventory_item_id: item.id,
    p_action: 'restore_stock',
    p_reason: 'Historische Statuskorrektur: Artikel ist noch vorhanden.',
  });
  ```

  Keep the existing assertion that a failed RPC leaves `items` and `selectedItem` unchanged.

  In `sales.service.spec.ts`, remove the reason argument and assert:

  ```ts
  await service.recordLegacySale(item.id, input);
  expect(rpc).toHaveBeenCalledWith(
    'record_legacy_inventory_sale',
    expect.objectContaining({
      p_inventory_item_id: item.id,
      p_reason: 'Historische Statuskorrektur: Verkauf nachgetragen.',
    }),
  );
  expect(recordSaleRpc).not.toHaveBeenCalled();
  ```

- [ ] **Step 2: Run the focused service tests and verify RED**

  ```powershell
  npx vitest run src/app/core/services/inventory-persistence.spec.ts src/app/core/services/sales.service.spec.ts
  ```

  Expected: FAIL because both services still require a caller-provided reason.

- [ ] **Step 3: Implement the central reasons and narrow the service APIs**

  Create the exact constant from `Produces`. Import it in both services. Remove `reason` from their public method signatures and pass only the matching constant to the existing RPC.

  Replace user-facing operation and validation strings in `SalesService.recordLegacySale`:

  ```ts
  const operation = 'Historischen Verkauf nachtragen';
  // invalid structural input
  new Error('Der historische Verkaufsnachtrag ist ungültig.');
  ```

  If the RPC returns a database message containing `Legacy`, wrap it before `mutationFailure`:

  ```ts
  const visibleError = new Error('Der historische Verkauf konnte nicht nachgetragen werden.', {
    cause: error,
  });
  ```

  Do not weaken the checks for workspace, exactly one line, matching item ID, or quantity one.

- [ ] **Step 4: Run GREEN checks and commit**

  ```powershell
  npx vitest run src/app/core/services/inventory-persistence.spec.ts src/app/core/services/sales.service.spec.ts
  npm run typecheck
  git add src/app/core/models/inventory-reconciliation.ts src/app/core/services/inventory.service.ts src/app/core/services/inventory-persistence.spec.ts src/app/core/services/sales.service.ts src/app/core/services/sales.service.spec.ts
  git commit -m "refactor: generate reconciliation audit reasons"
  ```

---

### Task 3: Remove manual reason fields from inventory surfaces

**Files:**

- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.ts`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.html`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts`
- Modify: `src/app/features/inventory/inventory.component.ts`
- Modify: `src/app/features/inventory/inventory.component.html`
- Modify: `src/app/features/inventory/inventory-toast-actions.spec.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.html`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts`

**Interfaces:**

- Consumes: `InventoryService.resolveLegacySoldItem(itemId: string)` from Task 2.
- Produces: `StockPositionListComponent.restoreLegacy: OutputEmitterRef<InventoryItem>` and `InventoryComponent.onRestoreLegacyItem(item: InventoryItem): Promise<void>`.

- [ ] **Step 1: Rewrite the component tests before production code**

  Require the rendered list and detail to contain:

  ```ts
  expect(renderedText).toContain('Verkaufsstatus klären');
  expect(renderedText).toContain('Artikel ist noch vorhanden');
  expect(renderedText).toContain('Verkauf nachtragen');
  expect(renderedText).not.toContain('Altdaten prüfen');
  expect(renderedText).not.toContain('Prüfgrund');
  expect(host.querySelector('input[id*="legacy-reason"]')).toBeNull();
  ```

  Dispatch the restore button click without entering text and assert `restoreLegacy` emits only the `InventoryItem`.

  In `item-detail-actions.spec.ts`, set `dialog.frage` to `false` and assert the service is not called; then set it to `true` and assert:

  ```ts
  expect(inventoryService.resolveLegacySoldItem).toHaveBeenCalledWith(item.id);
  expect(dialog.frage).toHaveBeenCalledWith(
    expect.objectContaining({
      titel: 'Artikel wieder in Bestand nehmen?',
      bestaetigenText: 'Artikel ist noch vorhanden',
    }),
  );
  ```

  In `inventory-toast-actions.spec.ts`, call `onRestoreLegacyItem(item)` and assert the same service signature and confirmation guard.

- [ ] **Step 2: Run inventory tests and verify RED**

  ```powershell
  npx vitest run src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts src/app/features/inventory/inventory-toast-actions.spec.ts
  ```

  Expected: FAIL because reason signals, inputs and payloads still exist.

- [ ] **Step 3: Implement the two clear actions without a text field**

  In `StockPositionListComponent` change:

  ```ts
  readonly restoreLegacy = output<InventoryItem>();

  emitRestoreLegacy(item: InventoryItem): void {
    if (item.sale_state === 'legacy_sold_unverified') this.restoreLegacy.emit(item);
  }
  ```

  Remove `legacyReasons`, `setLegacyReason` and `legacyReason`. Remove both reason inputs from the templates. Use the exact visible heading and explanation from the spec, and label the actions `Artikel ist noch vorhanden` and `Verkauf nachtragen`.

  In both `InventoryComponent.onRestoreLegacyItem` and `ItemDetailComponent.onRestoreLegacySoldItem`, retain the sale-state guard and use this confirmation copy:

  ```ts
  {
    titel: 'Artikel wieder in Bestand nehmen?',
    text: `„${item.title}“ wird auf „Bereit“ gesetzt. Die Korrektur wird automatisch dokumentiert.`,
    bestaetigenText: 'Artikel ist noch vorhanden',
  }
  ```

  Call `resolveLegacySoldItem(item.id)` only after confirmation. Change failure titles from `Altbestand` to `Verkaufsstatus konnte nicht geklärt werden.` Change the inventory filter label to `Verkaufsstatus klären`.

- [ ] **Step 4: Run GREEN checks and commit**

  ```powershell
  npx vitest run src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts src/app/features/inventory/inventory-toast-actions.spec.ts
  npm run typecheck
  git add -- src/app/features/inventory/components/stock-position-list/stock-position-list.component.ts src/app/features/inventory/components/stock-position-list/stock-position-list.component.html src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts src/app/features/inventory/inventory.component.ts src/app/features/inventory/inventory.component.html src/app/features/inventory/inventory-toast-actions.spec.ts src/app/features/inventory/pages/item-detail/item-detail.component.ts src/app/features/inventory/pages/item-detail/item-detail.component.html src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts
  git commit -m "fix: simplify historical inventory correction"
  ```

---

### Task 4: Remove the sale-dialog reason field without weakening guards

**Files:**

- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.html`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts`
- Create: `src/app/features/sales/components/sale-create-modal/sale-create-modal-ux.spec.ts`

**Interfaces:**

- Consumes: `SalesService.recordLegacySale(inventoryItemId: string, input: RecordSaleInput)` from Task 2.
- Preserves: `validatedLegacyInput(reconciliation, input)` must require exactly one matching inventory line with quantity one.

- [ ] **Step 1: Write the failing action and rendered-copy tests**

  Remove `reconciliationReason` from the test form factory and assert:

  ```ts
  expect(salesService.recordLegacySale).toHaveBeenCalledWith(
    reconciliation.inventoryItemId,
    expect.objectContaining({ lines: [expect.objectContaining({ quantity: 1 })] }),
  );
  ```

  Keep separate rejection tests for two lines, a mismatched inventory item and quantity other than one.

  In `sale-create-modal-ux.spec.ts`, render the component with `legacyReconciliation` and assert:

  ```ts
  expect(host.textContent).toContain('Historischen Verkauf nachtragen');
  expect(host.textContent).toContain('Diese Korrektur wird automatisch protokolliert.');
  expect(host.textContent).not.toContain('Dokumentierter Grund');
  expect(host.textContent).not.toContain('Legacy');
  expect(host.querySelector('#reconciliation-reason')).toBeNull();
  ```

- [ ] **Step 2: Run the sale-modal tests and verify RED**

  ```powershell
  npx vitest run src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts src/app/features/sales/components/sale-create-modal/sale-create-modal-ux.spec.ts
  ```

- [ ] **Step 3: Remove only the caller-controlled reason**

  Delete the `reconciliationReason` `FormControl`, its template input and the nonempty-reason condition in `validatedLegacyInput`. Keep all structural checks:

  ```ts
  if (
    input.lines.length !== 1 ||
    line?.inventoryItemId !== reconciliation.inventoryItemId ||
    line.quantity !== 1
  ) {
    throw new Error('Der historische Verkaufsnachtrag ist unvollständig oder wurde verändert.');
  }
  ```

  Call `recordLegacySale(reconciliation.inventoryItemId, validatedInput)`. Replace the form section with a noninteractive amber information panel headed `Historischen Verkauf nachtragen` and the automatic-protocol sentence from Step 1.

- [ ] **Step 4: Run GREEN checks, scan visible copy and commit**

  ```powershell
  npx vitest run src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts src/app/features/sales/components/sale-create-modal/sale-create-modal-ux.spec.ts
  rg -n "Altdaten prüfen|Dokumentierter Grund|Legacy-Verkauf|Legacy-Nachtrag" src/app/features/inventory src/app/features/sales src/app/core/services
  npm run typecheck
  git add -- src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts src/app/features/sales/components/sale-create-modal/sale-create-modal.component.html src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts src/app/features/sales/components/sale-create-modal/sale-create-modal-ux.spec.ts
  git commit -m "fix: clarify historical sale reconciliation"
  ```

  Expected: focused tests PASS. The `rg` scan may return internal identifiers in TypeScript, but no rendered template text or user-facing error string.

---

### Task 5: Full verification for item context and correction UX

**Files:**

- Verify only; no new production file.

**Interfaces:**

- Consumes all outputs from Tasks 1–4.
- Produces a clean, reviewable subsystem with no database migration.

- [ ] **Step 1: Run every focused test from this plan**

  ```powershell
  npx vitest run src/app/features/purchases/pages/purchase-detail/purchase-detail-navigation.spec.ts src/app/features/inventory/pages/item-detail/item-detail-navigation.spec.ts src/app/core/services/inventory-persistence.spec.ts src/app/core/services/sales.service.spec.ts src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts src/app/features/inventory/inventory-toast-actions.spec.ts src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts src/app/features/sales/components/sale-create-modal/sale-create-modal-ux.spec.ts
  ```

- [ ] **Step 2: Run repository gates**

  ```powershell
  npm run format:check
  npm run lint
  npm run typecheck
  npm test
  npm run build
  git diff --check
  ```

- [ ] **Step 3: Manually verify the two reported flows**

  - Open an item through `/purchases/:id`, reload the item detail, and verify `Zurück zum Einkauf` returns to that exact purchase.
  - Open the same item directly from inventory and verify the fallback remains `Zurück zum Inventar`.
  - For a `legacy_sold_unverified` item, verify there is no reason input, both actions are understandable, cancel changes nothing, restore writes the automatic journal reason, and sale creation appears under Verkäufe.

- [ ] **Step 4: Commit only if verification required a scoped correction**

  ```powershell
  git status --short
  git diff --check
  ```

  If Task 5 created no corrections, do not create an empty commit.
