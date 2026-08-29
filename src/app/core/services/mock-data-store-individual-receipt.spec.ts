import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockDataStoreService } from './mock-data-store.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const purchaseId = '22222222-2222-4222-8222-222222222222';
const purchaseLineId = '33333333-3333-4333-8333-333333333333';

describe('MockDataStoreService – Einzelartikel-Wareneingang', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('rollt alle lokalen Änderungen zurück, wenn ein Teilschritt nicht persistiert werden kann', () => {
    const store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.savePurchase({
      id: purchaseId,
      workspace_id: workspaceId,
      type: 'single',
      title: 'Kamera',
      purchase_date: '2026-08-26',
      purchase_price: 29,
      cost_allocation_mode: 'even',
      receiving_status: 'ordered',
    });
    store.savePurchaseLine({
      id: purchaseLineId,
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      catalog_product_id: null,
      title_snapshot: 'Kamera',
      line_kind: 'individual',
      ordered_quantity: 1,
      received_quantity: 0,
      unit_purchase_price: 29,
      line_total: 29,
    });

    const beforeLines = globalThis.localStorage.getItem('flipbase_local_purchase_lines');
    const beforeItems = globalThis.localStorage.getItem('flipbase_local_inventory');
    const beforePurchases = globalThis.localStorage.getItem('flipbase_local_purchases');
    const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
    let failed = false;
    const setItem = vi
      .spyOn(globalThis.localStorage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key === 'flipbase_local_inventory' && !failed) {
          failed = true;
          throw new Error('quota exceeded');
        }
        originalSetItem(key, value);
      });

    const result = store.receiveIndividualPurchaseLine(workspaceId, purchaseId, purchaseLineId, {
      title: 'Kamera',
      condition: 'used',
    });

    expect(result).toMatchObject({
      purchaseLine: null,
      inventoryItem: null,
      purchase: null,
      error: expect.any(Error),
    });
    expect(globalThis.localStorage.getItem('flipbase_local_purchase_lines')).toBe(beforeLines);
    expect(globalThis.localStorage.getItem('flipbase_local_inventory')).toBe(beforeItems);
    expect(globalThis.localStorage.getItem('flipbase_local_purchases')).toBe(beforePurchases);
    setItem.mockRestore();
  });

  it('stellt nach einem fehlgeschlagenen Rollback beim nächsten Laden den alten Zustand wieder her', () => {
    const store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.savePurchase({
      id: purchaseId,
      workspace_id: workspaceId,
      type: 'single',
      title: 'Kamera',
      purchase_date: '2026-08-26',
      purchase_price: 29,
      cost_allocation_mode: 'even',
      receiving_status: 'ordered',
    });
    store.savePurchaseLine({
      id: purchaseLineId,
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      catalog_product_id: null,
      title_snapshot: 'Kamera',
      line_kind: 'individual',
      ordered_quantity: 1,
      received_quantity: 0,
      unit_purchase_price: 29,
      line_total: 29,
    });

    const beforeLines = globalThis.localStorage.getItem('flipbase_local_purchase_lines');
    const beforeItems = globalThis.localStorage.getItem('flipbase_local_inventory');
    const beforePurchases = globalThis.localStorage.getItem('flipbase_local_purchases');
    const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
    let primaryWriteFailed = false;
    let failedRollbackWrites = 0;
    const setItem = vi
      .spyOn(globalThis.localStorage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key === 'flipbase_local_purchases' && !primaryWriteFailed) {
          primaryWriteFailed = true;
          throw new Error('purchase write failed');
        }
        if (
          key === 'flipbase_local_purchase_lines' &&
          primaryWriteFailed &&
          failedRollbackWrites < 2
        ) {
          failedRollbackWrites++;
          throw new Error('rollback write failed');
        }
        originalSetItem(key, value);
      });

    const result = store.receiveIndividualPurchaseLine(workspaceId, purchaseId, purchaseLineId, {
      title: 'Kamera',
      condition: 'used',
    });

    expect(result.error).toBeInstanceOf(Error);
    expect(failedRollbackWrites).toBe(1);
    expect(store.getPurchaseLines()).toMatchObject([{ id: purchaseLineId, received_quantity: 0 }]);
    expect(failedRollbackWrites).toBe(2);
    setItem.mockRestore();

    const reloadedStore = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    reloadedStore.isDemoMode.set(true);

    expect(reloadedStore.getPurchaseLines()).toMatchObject([
      { id: purchaseLineId, received_quantity: 0 },
    ]);
    expect(reloadedStore.getItems()).toEqual([]);
    expect(reloadedStore.getPurchases(workspaceId)).toMatchObject([
      { id: purchaseId, receiving_status: 'ordered' },
    ]);
    expect(globalThis.localStorage.getItem('flipbase_local_purchase_lines')).toBe(beforeLines);
    expect(globalThis.localStorage.getItem('flipbase_local_inventory')).toBe(beforeItems);
    expect(globalThis.localStorage.getItem('flipbase_local_purchases')).toBe(beforePurchases);
  });
});
