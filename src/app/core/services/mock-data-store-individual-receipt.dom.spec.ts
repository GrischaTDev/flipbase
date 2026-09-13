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

  it('erfasst mehrere unbepreiste Mystery-Einzelstücke einzeln mit Snapshot-Zustand und offenen Kosten', () => {
    const store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.savePurchase({
      id: purchaseId,
      workspace_id: workspaceId,
      type: 'mystery_pack',
      title: 'Mystery Box',
      purchase_date: '2026-08-26',
      purchase_price: 0,
      cost_allocation_mode: 'even',
      receiving_status: 'ordered',
    });
    store.savePurchaseLine({
      id: purchaseLineId,
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      catalog_product_id: null,
      title_snapshot: 'Unbekanntes Fundstück',
      line_kind: 'individual',
      ordered_quantity: 3,
      received_quantity: 0,
      price_mode: 'unpriced_mystery',
      unit_purchase_price: null,
      line_total: null,
      condition_snapshot: 'like_new',
    });

    const first = store.receiveIndividualPurchaseLine(workspaceId, purchaseId, purchaseLineId, {
      title: 'Unbekanntes Fundstück',
      condition: 'defective',
    });
    const second = store.receiveIndividualPurchaseLine(workspaceId, purchaseId, purchaseLineId, {
      title: 'Unbekanntes Fundstück 2',
      condition: 'defective',
    });
    const third = store.receiveIndividualPurchaseLine(workspaceId, purchaseId, purchaseLineId, {
      title: 'Unbekanntes Fundstück 3',
      condition: 'defective',
    });

    expect([first.error, second.error, third.error]).toEqual([null, null, null]);
    expect(store.getItems()).toHaveLength(3);
    expect(store.getItems()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ condition: 'like_new', allocated_purchase_cost: 0 }),
      ]),
    );
    expect(store.getPurchaseLines()).toMatchObject([{ id: purchaseLineId, received_quantity: 3 }]);
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

  it.each([
    ['einen geschätzten Marktwert', 45, 45],
    ['keinen erfundenen Marktwert', null, null],
  ] as const)('übernimmt beim Wareneingang %s', (_label, estimatedMarketValue, expectedValue) => {
    const store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.savePurchase({
      id: purchaseId,
      workspace_id: workspaceId,
      type: 'mystery_pack',
      title: 'Mystery Box',
      purchase_date: '2026-09-01',
      purchase_price: 30,
      cost_allocation_mode: 'even',
      receiving_status: 'ordered',
    });
    store.savePurchaseLine({
      id: purchaseLineId,
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      catalog_product_id: null,
      title_snapshot: 'Fundstück',
      line_kind: 'individual',
      ordered_quantity: 1,
      received_quantity: 0,
      price_mode: 'unpriced_mystery',
      unit_purchase_price: null,
      line_total: null,
      estimated_market_value: estimatedMarketValue,
    });

    const result = store.receiveIndividualPurchaseLine(workspaceId, purchaseId, purchaseLineId, {
      title: 'Fundstück',
      condition: 'used',
    });

    expect(result.error).toBeNull();
    expect(result.inventoryItem?.expected_value).toBe(expectedValue);
    expect(store.getItems(workspaceId)[0].expected_value).toBe(expectedValue);
  });

  it('füllt bei der Demo-Finalisierung nur fehlende Marktwerte auf und erhält bewusste Änderungen', () => {
    const store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.savePurchase({
      id: purchaseId,
      workspace_id: workspaceId,
      type: 'mystery_pack',
      title: 'Mystery Box',
      purchase_date: '2026-09-01',
      purchase_price: 30,
      cost_allocation_mode: 'even',
      receiving_status: 'ordered',
      entry_status: 'draft',
    });
    store.savePurchaseLine({
      id: purchaseLineId,
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      catalog_product_id: null,
      title_snapshot: 'Fundstück',
      line_kind: 'individual',
      ordered_quantity: 3,
      received_quantity: 0,
      price_mode: 'unpriced_mystery',
      unit_purchase_price: null,
      line_total: null,
      estimated_market_value: 45,
    });
    store.receiveIndividualPurchaseLine(workspaceId, purchaseId, purchaseLineId, {
      title: 'Bewusst geändert',
      condition: 'used',
    });
    store.receiveIndividualPurchaseLine(workspaceId, purchaseId, purchaseLineId, {
      title: 'Fehlender Marktwert',
      condition: 'used',
    });
    const [second, first] = store.getItems(workspaceId);
    store.saveItem({ ...first, expected_value: 99 });
    store.saveItem({ ...second, expected_value: null });

    const result = store.finalizePurchaseCosting(workspaceId, purchaseId);

    expect(result.error).toBeNull();
    const finalized = store.getItems(workspaceId);
    expect(finalized.find((item) => item.id === first.id)).toMatchObject({
      expected_value: 99,
      allocated_purchase_cost: 10,
      status: 'ready',
    });
    expect(finalized.find((item) => item.id === second.id)).toMatchObject({
      expected_value: 45,
      allocated_purchase_cost: 10,
      status: 'ready',
    });
    expect(finalized.find((item) => item.title === 'Fundstück')).toMatchObject({
      expected_value: 45,
      allocated_purchase_cost: 10,
      status: 'ready',
    });
  });

  it('lässt einen unbekannten Marktwert auch nach der Demo-Finalisierung offen', () => {
    const store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.savePurchase({
      id: purchaseId,
      workspace_id: workspaceId,
      type: 'mystery_pack',
      title: 'Mystery Box',
      purchase_date: '2026-09-01',
      purchase_price: 30,
      cost_allocation_mode: 'even',
      receiving_status: 'ordered',
      entry_status: 'draft',
    });
    store.savePurchaseLine({
      id: purchaseLineId,
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      catalog_product_id: null,
      title_snapshot: 'Fundstück',
      line_kind: 'individual',
      ordered_quantity: 1,
      received_quantity: 0,
      price_mode: 'unpriced_mystery',
      unit_purchase_price: null,
      line_total: null,
      estimated_market_value: null,
    });
    store.receiveIndividualPurchaseLine(workspaceId, purchaseId, purchaseLineId, {
      title: 'Fundstück',
      condition: 'used',
    });

    const result = store.finalizePurchaseCosting(workspaceId, purchaseId);

    expect(result.error).toBeNull();
    expect(store.getItems(workspaceId)[0]).toMatchObject({
      expected_value: null,
      status: 'ready',
    });
  });

  it('persistiert die centgenaue Mystery-Verteilung auch auf den Demo-Einkaufspositionen', () => {
    const store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.savePurchase({
      id: purchaseId,
      workspace_id: workspaceId,
      type: 'mystery_pack',
      title: 'Mystery Box mit sechs Einzelstücken',
      purchase_date: '2026-09-01',
      purchase_price: 100,
      total_purchase_cost: 100,
      cost_allocation_mode: 'even',
      receiving_status: 'ordered',
      entry_status: 'draft',
      costs: [],
    });
    for (let position = 1; position <= 6; position += 1) {
      store.savePurchaseLine({
        id: `33333333-3333-4333-8333-33333333333${position}`,
        workspace_id: workspaceId,
        purchase_id: purchaseId,
        catalog_product_id: null,
        title_snapshot: `Fundstück ${position}`,
        line_kind: 'individual',
        ordered_quantity: 1,
        received_quantity: 0,
        price_mode: 'unpriced_mystery',
        unit_purchase_price: null,
        line_total: null,
        allocated_additional_cost: 0,
      });
    }

    const result = store.finalizePurchaseCosting(workspaceId, purchaseId);

    expect(result.error).toBeNull();
    expect(
      store
        .getItems(workspaceId)
        .map((item) => {
          if (item.allocated_purchase_cost === null)
            throw new Error('Bekannte Einzelkosten fehlen.');
          return item.allocated_purchase_cost;
        })
        .sort((left, right) => left - right),
    ).toEqual([16.66, 16.66, 16.67, 16.67, 16.67, 16.67]);
    const finalizedLines = store.getPurchaseLines(workspaceId);
    expect(
      finalizedLines
        .map((line) => line.allocated_total_cost)
        .sort((left, right) => Number(left) - Number(right)),
    ).toEqual([16.66, 16.66, 16.67, 16.67, 16.67, 16.67]);
    expect(finalizedLines.reduce((sum, line) => sum + Number(line.allocated_total_cost), 0)).toBe(
      100,
    );
    expect(finalizedLines.every((line) => line.allocated_additional_cost === 0)).toBe(true);
  });

  it('kann einen durch die Mystery-Finalisierung erzeugten Demo-Artikel direkt verkaufen', () => {
    const store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.savePurchase({
      id: purchaseId,
      workspace_id: workspaceId,
      type: 'mystery_pack',
      title: 'Verkaufbare Mystery Box',
      purchase_date: '2026-09-01',
      purchase_price: 30,
      cost_allocation_mode: 'even',
      receiving_status: 'ordered',
      entry_status: 'draft',
    });
    store.savePurchaseLine({
      id: purchaseLineId,
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      catalog_product_id: null,
      title_snapshot: 'Verkaufbares Fundstück',
      line_kind: 'individual',
      ordered_quantity: 1,
      received_quantity: 0,
      price_mode: 'unpriced_mystery',
      unit_purchase_price: null,
      line_total: null,
    });
    expect(store.finalizePurchaseCosting(workspaceId, purchaseId).error).toBeNull();
    const item = store.getItems(workspaceId)[0];
    const saleId = '44444444-4444-4444-8444-444444444444';
    const saleLineId = '55555555-5555-4555-8555-555555555555';

    const result = store.bookSaleAtomically(
      workspaceId,
      {
        id: saleId,
        workspace_id: workspaceId,
        platform: 'kleinanzeigen',
        sale_price: 50,
        sale_date: '2026-09-01',
        platform_fee: 0,
        shipping_cost: 0,
        packaging_cost: 0,
        other_costs: 0,
      },
      [
        {
          id: saleLineId,
          sale_id: saleId,
          catalog_product_id: null,
          inventory_item_id: item.id,
          title_snapshot: item.title,
          quantity: 1,
          unit_sale_price: 50,
          line_total: 50,
          cost_of_goods_sold: 0,
          tax_mode: 'diff_25a',
        },
      ],
    );

    expect(result.error).toBeNull();
    expect(result.saleLines).toMatchObject([
      { inventory_item_id: item.id, cost_of_goods_sold: 30 },
    ]);
    expect(store.getItems(workspaceId)[0]).toMatchObject({
      status: 'sold',
      sale_state: 'sold',
      active_sale_count: 1,
    });
  });

  it.each(['single', 'lot', 'pallet'] as const)(
    'lehnt einen %s-Demo-Einkauf ohne vollständigen Kostenplan atomar ab',
    (purchaseType) => {
      const store = runInInjectionContext(
        Injector.create({ providers: [] }),
        () => new MockDataStoreService(),
      );
      store.isDemoMode.set(true);
      store.savePurchase({
        id: purchaseId,
        workspace_id: workspaceId,
        type: purchaseType,
        title: 'Normaler Einkauf 10/90',
        purchase_date: '2026-09-01',
        purchase_price: 100,
        cost_allocation_mode: 'even',
        receiving_status: 'ordered',
        entry_status: 'draft',
      });
      store.savePurchaseLine({
        id: purchaseLineId,
        workspace_id: workspaceId,
        purchase_id: purchaseId,
        catalog_product_id: null,
        title_snapshot: 'Artikel für 10 Euro',
        line_kind: 'individual',
        ordered_quantity: 1,
        received_quantity: 0,
        price_mode: 'priced',
        unit_purchase_price: 10,
        line_total: 10,
      });
      store.savePurchaseLine({
        id: '44444444-4444-4444-8444-444444444444',
        workspace_id: workspaceId,
        purchase_id: purchaseId,
        catalog_product_id: null,
        title_snapshot: 'Artikel für 90 Euro',
        line_kind: 'individual',
        ordered_quantity: 1,
        received_quantity: 0,
        price_mode: 'priced',
        unit_purchase_price: 90,
        line_total: 90,
      });
      const purchasesBefore = globalThis.localStorage.getItem('flipbase_local_purchases');
      const linesBefore = globalThis.localStorage.getItem('flipbase_local_purchase_lines');
      const itemsBefore = globalThis.localStorage.getItem('flipbase_local_inventory');

      const result = store.finalizePurchaseCosting(workspaceId, purchaseId);

      expect(result.data).toBeNull();
      expect(result.error?.message).toBe(
        'In der Demo können aktuell nur Mystery Boxen abgeschlossen werden.',
      );
      expect(globalThis.localStorage.getItem('flipbase_local_purchases')).toBe(purchasesBefore);
      expect(globalThis.localStorage.getItem('flipbase_local_purchase_lines')).toBe(linesBefore);
      expect(globalThis.localStorage.getItem('flipbase_local_inventory')).toBe(itemsBefore);
      expect(store.getPurchases(workspaceId)[0]).toMatchObject({ entry_status: 'draft' });
      expect(store.getPurchaseLines(workspaceId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ line_total: 10, received_quantity: 0 }),
          expect.objectContaining({ line_total: 90, received_quantity: 0 }),
        ]),
      );
      expect(store.getItems(workspaceId)).toEqual([]);
    },
  );
});
