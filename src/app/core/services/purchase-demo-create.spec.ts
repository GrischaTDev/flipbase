import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase, PurchaseLine, Workspace } from '../models/flipbase.models';
import { MockDataStoreService } from './mock-data-store.service';
import { PurchaseService } from './purchase.service';
import { SyncStatusService } from './sync-status.service';

const workspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
  created_at: '2026-08-28T10:00:00.000Z',
};

function erstelleDienst(store: MockDataStoreService) {
  const purchasesRaw = signal<Purchase[]>([]);
  const selectedPurchaseRaw = signal<Purchase | null>(null);
  const purchaseLinesRaw = signal<PurchaseLine[]>([]);
  const inventoryCreateItem = vi.fn(async () => ({
    data: {
      id: 'item-demo-created',
      workspace_id: workspace.id,
      purchase_id: null,
      title: 'Einzelstück',
      condition: 'used' as const,
      status: 'received' as const,
      allocated_purchase_cost: 19.99,
    },
    error: null,
    reportedBySyncStatus: false,
    problems: [],
  }));
  const service = Object.create(PurchaseService.prototype) as PurchaseService;
  Object.assign(service, {
    mockStore: store,
    workspaceService: { currentWorkspace: () => workspace },
    purchasesRaw,
    selectedPurchaseRaw,
    purchaseItemsFallback: signal<InventoryItem[]>([]),
    purchaseLinesRaw,
    purchases: () => purchasesRaw(),
    selectedPurchase: () => selectedPurchaseRaw(),
    sourcesService: { sources: signal([]) },
    suppliersService: { suppliers: signal([]) },
    inventory: { createItem: inventoryCreateItem, items: signal([]), istGeladen: signal(false) },
    webhookService: { sendPurchaseNotification: vi.fn() },
    syncStatus: new SyncStatusService(),
  });
  return { service, purchasesRaw, selectedPurchaseRaw, purchaseLinesRaw, inventoryCreateItem };
}

function erstelleStore(): MockDataStoreService {
  const store = runInInjectionContext(
    Injector.create({ providers: [] }),
    () => new MockDataStoreService(),
  );
  store.isDemoMode.set(true);
  return store;
}

const payload = {
  type: 'lot' as const,
  title: 'Nachkauf LED-Lampe Abnahme',
  purchase_date: '2026-08-28',
  purchase_price: 24.95,
  purchase_lines: [
    {
      catalogProductId: 'catalog-led',
      titleSnapshot: 'LED-Lampe',
      lineKind: 'quantity' as const,
      orderedQuantity: 5,
      unitPurchasePrice: 4.99,
      lineTotal: 24.95,
    },
  ],
};

describe('PurchaseService – Demo-Einkauf mit Startpositionen', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('speichert Einkauf und Mengenposition dauerhaft für Detailansicht und Wareneingang', async () => {
    const store = erstelleStore();
    const { service, purchasesRaw, purchaseLinesRaw } = erstelleDienst(store);

    const result = await service.createPurchase(payload);

    expect(result).toMatchObject({ status: 'success', error: null });
    const purchaseId = result.data!.id;
    await service.loadPurchases(workspace.id);
    expect(purchasesRaw()).toMatchObject([{ id: purchaseId, items_count: 5 }]);

    const detail = await service.getPurchaseById(purchaseId);
    expect(detail).toMatchObject({ id: purchaseId, items_count: 5, receiving_status: 'ordered' });
    expect(purchaseLinesRaw()).toMatchObject([
      {
        purchase_id: purchaseId,
        catalog_product_id: 'catalog-led',
        ordered_quantity: 5,
        received_quantity: 0,
        unit_purchase_price: 4.99,
        line_total: 24.95,
      },
    ]);

    const receipt = store.receivePurchaseLines(workspace.id, purchaseId, [
      { purchaseLineId: purchaseLinesRaw()[0].id, receivedQuantity: 5 },
    ]);
    expect(receipt.error).toBeNull();
    expect(receipt.stockLots).toMatchObject([{ received_quantity: 5, remaining_quantity: 5 }]);

    await service.loadPurchases(workspace.id);
    expect(purchasesRaw()).toMatchObject([{ id: purchaseId, items_count: 5 }]);
    expect(await service.getPurchaseById(purchaseId)).toMatchObject({
      id: purchaseId,
      items_count: 5,
    });
  });

  it('lädt die persistierte Mengenposition nach einer vollständig neuen Serviceinstanz', async () => {
    const initialStore = erstelleStore();
    const { service: initialService } = erstelleDienst(initialStore);
    const result = await initialService.createPurchase(payload);
    expect(result).toMatchObject({ status: 'success', error: null });

    const reloadedStore = erstelleStore();
    const { service: reloadedService, purchaseLinesRaw } = erstelleDienst(reloadedStore);
    const detail = await reloadedService.getPurchaseById(result.data!.id);

    expect(detail).toMatchObject({ id: result.data!.id, items_count: 5 });
    expect(purchaseLinesRaw()).toEqual([
      expect.objectContaining({
        purchase_id: result.data!.id,
        catalog_product_id: 'catalog-led',
        line_kind: 'quantity',
        ordered_quantity: 5,
        received_quantity: 0,
      }),
    ]);
    const receipt = reloadedStore.receivePurchaseLines(workspace.id, result.data!.id, [
      { purchaseLineId: purchaseLinesRaw()[0].id, receivedQuantity: 5 },
    ]);
    expect(receipt.error).toBeNull();
    expect(receipt.stockLots).toHaveLength(1);
  });

  it('meldet einen Persistenzfehler ohne Einkauf oder Position teilweise zu speichern', async () => {
    const store = erstelleStore();
    const { service, purchasesRaw, selectedPurchaseRaw, purchaseLinesRaw } = erstelleDienst(store);
    const selectedBefore = { ...store.demoPurchases[0] };
    purchasesRaw.set([selectedBefore]);
    selectedPurchaseRaw.set(selectedBefore);
    purchaseLinesRaw.set([]);
    const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(
      (key: string, value: string) => {
        if (key === 'flipbase_local_purchase_lines') throw new Error('quota exceeded');
        originalSetItem(key, value);
      },
    );

    const result = await service.createPurchase(payload);

    expect(result).toMatchObject({ status: 'failed', data: null, error: expect.any(Error) });
    expect(store.getPurchases(workspace.id)).toEqual([]);
    expect(store.getPurchaseLines(workspace.id)).toEqual([]);
    expect(purchasesRaw()).toEqual([selectedBefore]);
    expect(selectedPurchaseRaw()).toEqual(selectedBefore);
    expect(purchaseLinesRaw()).toEqual([]);
  });

  it('legt einen positionslosen Demo-Einzelkauf weiterhin als Inventarartikel an', async () => {
    const store = erstelleStore();
    const { service, inventoryCreateItem } = erstelleDienst(store);

    const result = await service.createPurchase({
      type: 'single',
      title: 'Einzelstück',
      purchase_date: '2026-08-28',
      purchase_price: 19.99,
      single_item_condition: 'used',
    });

    expect(result).toMatchObject({ status: 'success', error: null });
    expect(inventoryCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        purchase_id: result.data!.id,
        title: 'Einzelstück',
        allocated_purchase_cost: 19.99,
      }),
    );
  });

  it('trennt zwei Demo-Einkäufe samt Positionen auch in derselben Millisekunde', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_787_936_400_000);
    vi.stubGlobal('crypto', undefined);
    const store = erstelleStore();
    const { service } = erstelleDienst(store);

    const first = await service.createPurchase(payload);
    const second = await service.createPurchase({ ...payload, title: 'Zweiter LED-Nachkauf' });

    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(first.data?.id).not.toBe(second.data?.id);
    expect(store.getPurchases(workspace.id)).toHaveLength(2);
    const lines = store.getPurchaseLines(workspace.id);
    expect(lines).toHaveLength(2);
    expect(lines.filter((line) => line.purchase_id === first.data?.id)).toHaveLength(1);
    expect(lines.filter((line) => line.purchase_id === second.data?.id)).toHaveLength(1);
  });
});
