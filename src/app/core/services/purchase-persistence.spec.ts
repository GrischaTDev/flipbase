import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase, PurchaseLine } from '../models/flipbase.models';
import { PurchaseService } from './purchase.service';
import { SyncStatusService } from './sync-status.service';
import { mapPurchaseDetailRows } from '../../features/purchases/utils/purchase-presentation';

const einkauf: Purchase = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  type: 'mystery_pack',
  title: 'Mystery Box',
  purchase_date: '2026-08-24',
  purchase_price: 31.98,
  shipping_cost: 0,
  source_id: null,
  supplier_id: null,
  cost_allocation_mode: 'even',
  created_at: '2026-08-24T10:00:00.000Z',
};

describe('PurchaseService – fehlgeschlagenes Löschen', () => {
  it('entfernt den Einkauf erst nach bestätigtem Löschen aus der Datenbank', async () => {
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const artikelEntfernen = vi.fn();
    const service = Object.create(PurchaseService.prototype) as PurchaseService;

    Object.assign(service, {
      purchasesRaw,
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      inventory: { entferneArtikelZuEinkauf: artikelEntfernen },
      syncStatus: new SyncStatusService(),
      supabase: { client: { rpc: async () => ({ error: { code: '42501', message: 'denied' } }) } },
    });

    const ergebnis = await service.deletePurchase(einkauf.id, einkauf.workspace_id);

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(purchasesRaw()).toEqual([einkauf]);
    expect(selectedPurchaseRaw()).toEqual(einkauf);
    expect(artikelEntfernen).not.toHaveBeenCalled();
  });

  it('entfernt den bestätigten Entwurf nach dem atomaren Datenbankaufruf lokal', async () => {
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const artikelEntfernen = vi.fn();
    const rpc = vi.fn(async () => ({ error: null }));
    const service = Object.create(PurchaseService.prototype) as PurchaseService;

    Object.assign(service, {
      purchasesRaw,
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      inventory: { entferneArtikelZuEinkauf: artikelEntfernen },
      syncStatus: new SyncStatusService(),
      supabase: { client: { rpc } },
    });

    const ergebnis = await service.deletePurchase(einkauf.id, einkauf.workspace_id);

    expect(ergebnis.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('delete_purchase_draft', {
      p_workspace_id: einkauf.workspace_id,
      p_purchase_id: einkauf.id,
    });
    expect(purchasesRaw()).toEqual([]);
    expect(selectedPurchaseRaw()).toBeNull();
    expect(artikelEntfernen).toHaveBeenCalledWith(einkauf.id);
  });
});

describe('PurchaseService – fehlgeschlagenes Bearbeiten', () => {
  it('behält das Signal bei einem Datenbankfehler unverändert', async () => {
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const service = Object.create(PurchaseService.prototype) as PurchaseService;
    Object.assign(service, {
      purchasesRaw,
      selectedPurchaseRaw,
      sourcesService: { sources: signal([]) },
      suppliersService: { suppliers: signal([]) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            update: () => ({
              eq: async () => ({ error: { code: '42501', message: 'denied' } }),
            }),
          }),
        },
      },
    });

    const ergebnis = await service.updatePurchase(einkauf.id, { title: 'Geändert' });

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(purchasesRaw()).toEqual([einkauf]);
    expect(selectedPurchaseRaw()).toEqual(einkauf);
  });
});

describe('PurchaseService – bestätigte Tracking- und Verteiländerungen', () => {
  it('ändert das Tracking im lokalen Bestand erst nach erfolgreichem Datenbank-Update', async () => {
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const rpc = vi.fn(async () => ({ data: null, error: { code: '42501', message: 'denied' } }));
    const service = Object.create(PurchaseService.prototype) as PurchaseService;

    Object.assign(service, {
      purchasesRaw,
      purchases: () => purchasesRaw(),
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      syncStatus: new SyncStatusService(),
      supabase: { client: { rpc } },
    });

    const ergebnis = await service.updatePurchaseTracking(einkauf.id, 'TRACK-NEU', 'dhl');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(purchasesRaw()).toEqual([einkauf]);
    expect(selectedPurchaseRaw()).toEqual(einkauf);
    expect(rpc).toHaveBeenCalledWith('update_purchase_tracking', {
      p_purchase_id: einkauf.id,
      p_tracking_number: 'TRACK-NEU',
      p_tracking_carrier: 'dhl',
      p_tracking_status: 'pending',
    });
  });

  it('bricht das Zustellen nach einem Workflow-Fehler vor den Artikeln ab', async () => {
    const workflowError = new Error('Status fehlgeschlagen');
    const artikel: InventoryItem = {
      id: 'item-1',
      workspace_id: einkauf.workspace_id,
      purchase_id: einkauf.id,
      sku: 'SKU-1',
      title: 'Konsole',
      condition: 'used',
      status: 'needs_review',
      allocated_purchase_cost: 31.98,
      created_at: '2026-08-24T10:00:00.000Z',
    };
    const updateItemStatus = vi.fn(async () => ({ error: null }));
    const service = Object.create(PurchaseService.prototype) as PurchaseService;

    Object.assign(service, {
      purchases: signal<Purchase[]>([einkauf]),
      setPurchaseWorkflowStatus: vi.fn(async () => ({ error: workflowError })),
      inventory: {
        items: signal<InventoryItem[]>([artikel]),
        updateItemStatus,
      },
    });

    const ergebnis = await service.markPurchaseDeliveredAndSyncItems(einkauf.id);

    expect(ergebnis).toEqual({ updatedCount: 0, error: workflowError });
    expect(updateItemStatus).not.toHaveBeenCalled();
  });

  it('ändert die Verteilmethode lokal erst nach erfolgreichem Datenbank-Update', async () => {
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const service = Object.create(PurchaseService.prototype) as PurchaseService;

    Object.assign(service, {
      purchasesRaw,
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            update: () => ({
              eq: async () => ({ error: { code: '42501', message: 'denied' } }),
            }),
          }),
        },
      },
    });

    const ergebnis = await service.updateCostAllocationMode(einkauf.id, 'value_weighted');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(purchasesRaw()).toEqual([einkauf]);
    expect(selectedPurchaseRaw()).toEqual(einkauf);
  });

  it('bricht die Kostenverteilung bei einem Modusfehler vor allen lokalen Artikeländerungen ab', async () => {
    const artikel: InventoryItem = {
      id: 'item-1',
      workspace_id: einkauf.workspace_id,
      purchase_id: einkauf.id,
      title: 'Konsole',
      condition: 'used',
      status: 'received',
      sku: 'SKU-1',
      allocated_purchase_cost: 31.98,
      expected_value: 60,
      created_at: einkauf.created_at,
    };
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const artikelLokalUebernehmen = vi.fn();
    const tabellen: string[] = [];
    const service = Object.create(PurchaseService.prototype) as PurchaseService;
    Object.assign(service, {
      purchasesRaw,
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      purchaseItems: () => [artikel],
      profitEngine: { allocateCosts: () => [31.98] },
      inventory: { uebernehmeArtikelAenderungen: artikelLokalUebernehmen },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: (tabelle: string) => {
            tabellen.push(tabelle);
            return {
              update: () => ({
                eq: async () => ({ error: { code: '42501', message: 'denied' } }),
              }),
            };
          },
        },
      },
    });

    const ergebnis = await service.redistributeCosts(einkauf.id, 'value_weighted');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(tabellen).toEqual(['purchases']);
    expect(artikelLokalUebernehmen).not.toHaveBeenCalled();
    expect(purchasesRaw()).toEqual([einkauf]);
    expect(selectedPurchaseRaw()).toEqual(einkauf);
  });

  it('speichert bei der Draft-Verteilung nur den Planungsmodus und keine Bestandskosten', async () => {
    const artikel: InventoryItem = {
      id: 'item-1',
      workspace_id: einkauf.workspace_id,
      purchase_id: einkauf.id,
      title: 'Konsole',
      condition: 'used',
      status: 'received',
      sku: 'SKU-1',
      allocated_purchase_cost: 31.98,
      expected_value: 60,
      created_at: einkauf.created_at,
    };
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const artikelLokalUebernehmen = vi.fn();
    const tabellen: string[] = [];
    const service = Object.create(PurchaseService.prototype) as PurchaseService;
    Object.assign(service, {
      purchasesRaw,
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      purchaseItems: () => [artikel],
      profitEngine: { allocateCosts: () => [31.98] },
      inventory: { uebernehmeArtikelAenderungen: artikelLokalUebernehmen },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: (tabelle: string) => {
            tabellen.push(tabelle);
            return {
              update: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        },
      },
    });

    const ergebnis = await service.redistributeCosts(einkauf.id, 'value_weighted', [
      { id: artikel.id, expected_value: 500 },
    ]);

    expect(ergebnis.error).toBeNull();
    expect(tabellen).toEqual(['purchases']);
    expect(artikelLokalUebernehmen).not.toHaveBeenCalled();
    expect(purchasesRaw()[0]).toMatchObject({
      cost_allocation_mode: 'value_weighted',
    });
    expect(selectedPurchaseRaw()).toMatchObject({
      cost_allocation_mode: 'value_weighted',
    });
    expect(artikel.allocated_purchase_cost).toBe(31.98);
    expect(artikel.expected_value).toBe(60);
  });
});

describe('PurchaseService – autoritativer Einzelartikel-Wareneingang', () => {
  const line: PurchaseLine = {
    id: '44444444-4444-4444-8444-444444444444',
    workspace_id: einkauf.workspace_id,
    purchase_id: einkauf.id,
    catalog_product_id: null,
    title_snapshot: 'Mystery-Fundstück',
    line_kind: 'individual',
    ordered_quantity: 3,
    received_quantity: 0,
    price_mode: 'unpriced_mystery',
    unit_purchase_price: null,
    line_total: null,
  };

  function createReceiptService() {
    const workspace = signal<{ id: string } | null>({ id: einkauf.workspace_id });
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>({
      ...einkauf,
      purchase_lines: [line],
    });
    const purchaseLinesRaw = signal<PurchaseLine[]>([line]);
    const items = signal<InventoryItem[]>([]);
    const rawItems: InventoryItem[] = [];
    const authoritativeItems: InventoryItem[] = [];
    const loadInventory = vi.fn(async (workspaceId: string) => {
      items.set(
        authoritativeItems
          .filter((item) => item.workspace_id === workspaceId)
          .map((item) => ({
            ...item,
            sale_state: 'no_active_sale' as const,
            active_sale_count: 0,
            active_sale_id: null,
          })),
      );
    });
    const unsafeUpsert = vi.fn();
    let receiptNumber = 0;
    const simuliereRpcEingang = vi.fn(() => {
      receiptNumber += 1;
      const confirmed = { ...line, received_quantity: receiptNumber };
      const item: InventoryItem = {
        id: `item-${receiptNumber}`,
        workspace_id: einkauf.workspace_id,
        purchase_id: einkauf.id,
        purchase_line_id: line.id,
        title: `Mystery-Fundstück ${receiptNumber}`,
        condition: 'used',
        status: 'received',
        allocated_purchase_cost: 0,
        created_at: `2026-09-01T10:00:0${receiptNumber}.000Z`,
      };
      rawItems.push(item);
      authoritativeItems.push(item);
      return {
        purchaseLine: confirmed,
        inventoryItem: item,
        purchase: {
          ...einkauf,
          receiving_status: receiptNumber < 3 ? 'partially_received' : 'received',
        },
        error: null,
      };
    });
    const rpc = vi.fn(async () => {
      const result = simuliereRpcEingang();
      return {
        data: {
          purchase_line: result.purchaseLine,
          inventory_item: result.inventoryItem,
          purchase: result.purchase,
        },
        error: null,
      };
    });
    const service = Object.create(PurchaseService.prototype) as PurchaseService;
    Object.assign(service, {
      workspaceService: { currentWorkspace: workspace },
      purchasesRaw,
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      purchaseLinesRaw,
      inventory: {
        items,
        loadInventory,
        uebernehmeArtikelAenderungen: unsafeUpsert,
      },
      syncStatus: new SyncStatusService(),
      supabase: { client: { rpc } },
    });
    return {
      service,
      workspace,
      items,
      loadInventory,
      unsafeUpsert,
      authoritativeItems,
      purchaseLinesRaw,
    };
  }

  it('lädt nach dem Wareneingang den autoritativen Inventarzustand statt das rohe RPC-Objekt einzusetzen', async () => {
    const { service, items, loadInventory, unsafeUpsert } = createReceiptService();

    const result = await service.receiveIndividualPurchaseLine(einkauf.id, line.id, {
      title: line.title_snapshot,
      condition: 'used',
    });

    expect(result.error).toBeNull();
    expect(loadInventory).toHaveBeenCalledWith(einkauf.workspace_id);
    expect(unsafeUpsert).not.toHaveBeenCalled();
    expect(items()).toMatchObject([
      { id: 'item-1', sale_state: 'no_active_sale', active_sale_count: 0 },
    ]);
    const rows = mapPurchaseDetailRows(
      { ...einkauf, purchase_lines: [{ ...line, received_quantity: 1 }] },
      {
        inventoryItems: items(),
        stockLots: [],
        stockMovements: [],
        sales: [],
        inventoryState: 'loaded',
        stockState: 'loaded',
        salesState: 'loaded',
      },
    );
    expect(rows).toMatchObject([
      {
        availableUnits: 1,
        inventoryItemLinks: [{ id: 'item-1', label: 'Artikel 1' }],
      },
    ]);
  });

  it('zeigt nach drei Eingängen drei Artikellinks in genau einer Positionszeile', async () => {
    const { service, items, purchaseLinesRaw } = createReceiptService();

    for (let index = 0; index < 3; index += 1) {
      await service.receiveIndividualPurchaseLine(einkauf.id, line.id, {
        title: line.title_snapshot,
        condition: 'used',
      });
    }

    const rows = mapPurchaseDetailRows(
      { ...einkauf, purchase_lines: purchaseLinesRaw() },
      {
        inventoryItems: items(),
        stockLots: [],
        stockMovements: [],
        sales: [],
        inventoryState: 'loaded',
        stockState: 'loaded',
        salesState: 'loaded',
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].inventoryItemLinks).toEqual([
      { id: 'item-1', label: 'Artikel 1' },
      { id: 'item-2', label: 'Artikel 2' },
      { id: 'item-3', label: 'Artikel 3' },
    ]);
  });

  it('veröffentlicht nach einem Workspacewechsel während des Inventar-Refresh keine A-Details', async () => {
    const { service, workspace, loadInventory, purchaseLinesRaw } = createReceiptService();
    let releaseRefresh!: () => void;
    loadInventory.mockImplementation(
      () => new Promise<void>((resolve) => (releaseRefresh = resolve)),
    );

    const receipt = service.receiveIndividualPurchaseLine(einkauf.id, line.id, {
      title: line.title_snapshot,
      condition: 'used',
    });
    await vi.waitFor(() => expect(loadInventory).toHaveBeenCalledOnce());
    workspace.set({ id: '99999999-9999-4999-8999-999999999999' });
    purchaseLinesRaw.set([]);
    releaseRefresh();
    await receipt;

    expect(purchaseLinesRaw()).toEqual([]);
  });
});

describe('PurchaseService – konsistenter Stand nach der Finalisierung', () => {
  it('wartet gemeinsam auf Einkauf, Mengenbestand und Inventarkosten', async () => {
    const workspace = signal<{ id: string } | null>({ id: einkauf.workspace_id });
    const purchasesRaw = signal<Purchase[]>([{ ...einkauf, entry_status: 'draft' }]);
    const selectedPurchaseRaw = signal<Purchase | null>({ ...einkauf, entry_status: 'draft' });
    const purchaseLinesRaw = signal<PurchaseLine[]>([]);
    const purchaseItemsFallback = signal<InventoryItem[]>([]);
    const inventoryItems = signal<InventoryItem[]>([]);
    const finalizedPurchase: Purchase = {
      ...einkauf,
      entry_status: 'finalized',
      total_purchase_cost: 31.98,
      purchase_lines: [],
    };
    const loadPurchases = vi.fn(async () => purchasesRaw.set([finalizedPurchase]));
    const loadPositions = vi.fn(async () => undefined);
    const loadInventory = vi.fn(async () =>
      inventoryItems.set([
        {
          id: 'item-finalized',
          workspace_id: einkauf.workspace_id,
          purchase_id: einkauf.id,
          title: 'Mystery-Fundstück',
          condition: 'used',
          status: 'ready',
          allocated_purchase_cost: 31.98,
          sale_state: 'no_active_sale',
          active_sale_count: 0,
          active_sale_id: null,
        },
      ]),
    );
    const service = Object.create(PurchaseService.prototype) as PurchaseService;
    Object.assign(service, {
      workspaceService: { currentWorkspace: workspace },
      purchasesRaw,
      selectedPurchaseRaw,
      purchaseLinesRaw,
      purchaseItemsFallback,
      loadError: signal<Error | null>(null),
      loadPurchases,
      stockService: { loadPositions },
      inventory: { items: inventoryItems, loadInventory },
    });

    await service.refreshAfterCostingChange(einkauf.workspace_id, einkauf.id);

    expect(loadPurchases).toHaveBeenCalledWith(einkauf.workspace_id);
    expect(loadPositions).toHaveBeenCalledWith(einkauf.workspace_id);
    expect(loadInventory).toHaveBeenCalledWith(einkauf.workspace_id);
    expect(selectedPurchaseRaw()).toMatchObject({ entry_status: 'finalized' });
    expect(inventoryItems()).toMatchObject([{ allocated_purchase_cost: 31.98 }]);
  });

  it('ersetzt beim Abschluss aus dem Create-Modal keinen anderen offenen Detail-Einkauf', async () => {
    const workspace = signal<{ id: string } | null>({ id: einkauf.workspace_id });
    const andererEinkauf: Purchase = {
      ...einkauf,
      id: '55555555-5555-4555-8555-555555555555',
      title: 'Bereits geöffnetes Detail',
    };
    const purchasesRaw = signal<Purchase[]>([andererEinkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(andererEinkauf);
    const existingLine: PurchaseLine = {
      id: '66666666-6666-4666-8666-666666666666',
      workspace_id: einkauf.workspace_id,
      purchase_id: andererEinkauf.id,
      catalog_product_id: null,
      title_snapshot: 'Bestehende Detailposition',
      line_kind: 'individual',
      ordered_quantity: 1,
      received_quantity: 0,
      unit_purchase_price: 10,
      line_total: 10,
    };
    const purchaseLinesRaw = signal<PurchaseLine[]>([existingLine]);
    const service = Object.create(PurchaseService.prototype) as PurchaseService;
    Object.assign(service, {
      workspaceService: { currentWorkspace: workspace },
      purchasesRaw,
      selectedPurchaseRaw,
      purchaseItemsFallback: signal<InventoryItem[]>([]),
      purchaseLinesRaw,
      loadError: signal<Error | null>(null),
      loadPurchases: vi.fn(async () =>
        purchasesRaw.set([{ ...einkauf, entry_status: 'finalized' }]),
      ),
      stockService: { loadPositions: vi.fn(async () => undefined) },
      inventory: { loadInventory: vi.fn(async () => undefined) },
    });

    await service.refreshAfterCostingChange(einkauf.workspace_id, einkauf.id);

    expect(selectedPurchaseRaw()).toEqual(andererEinkauf);
    expect(purchaseLinesRaw()).toEqual([existingLine]);
  });

  it('übernimmt die bestätigte Finalisierung auch bei fehlgeschlagenem Neuladen sofort lokal', async () => {
    const workspace = signal<{ id: string } | null>({ id: einkauf.workspace_id });
    const draft = { ...einkauf, entry_status: 'draft' as const, total_purchase_cost: null };
    const purchasesRaw = signal<Purchase[]>([draft]);
    const selectedPurchaseRaw = signal<Purchase | null>(draft);
    const loadError = signal<Error | null>(null);
    const refreshFailure = new Error('Netzwerk unterbrochen');
    const service = Object.create(PurchaseService.prototype) as PurchaseService;
    Object.assign(service, {
      workspaceService: { currentWorkspace: workspace },
      purchasesRaw,
      selectedPurchaseRaw,
      purchaseLinesRaw: signal<PurchaseLine[]>([]),
      purchaseItemsFallback: signal<InventoryItem[]>([]),
      loadError,
      loadPurchases: vi.fn(async () => loadError.set(refreshFailure)),
      stockService: { loadPositions: vi.fn(async () => undefined) },
      inventory: { loadInventory: vi.fn(async () => undefined) },
    });

    const error = await service.refreshAfterCostingChange(einkauf.workspace_id, einkauf.id, {
      purchaseId: einkauf.id,
      totalPurchaseCost: 31.98,
      allocatedTotalCost: 31.98,
      entryStatus: 'finalized',
      eventId: 'event-finalized',
    });

    expect(error).toBe(refreshFailure);
    expect(purchasesRaw()).toMatchObject([
      { id: einkauf.id, entry_status: 'finalized', total_purchase_cost: 31.98 },
    ]);
    expect(selectedPurchaseRaw()).toMatchObject({
      id: einkauf.id,
      entry_status: 'finalized',
      total_purchase_cost: 31.98,
    });
  });
});
