import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase, Workspace } from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
import { PurchaseService } from './purchase.service';
import { SyncStatusService } from './sync-status.service';

const workspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
  created_at: '2026-08-24T10:00:00.000Z',
};

const gespeicherterEinkauf: Purchase = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  type: 'single',
  title: 'Konsole',
  purchase_date: '2026-08-24',
  purchase_price: 80,
  shipping_cost: 0,
  source_id: null,
  supplier_id: null,
  cost_allocation_mode: 'even',
  created_at: '2026-08-24T10:01:00.000Z',
};

const gespeicherterArtikel: InventoryItem = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: workspace.id,
  purchase_id: gespeicherterEinkauf.id,
  title: 'Konsole',
  condition: 'used',
  status: 'received',
  sku: null,
  category: null,
  brand: null,
  model: null,
  ean: null,
  description: null,
  allocated_purchase_cost: 80,
  expected_value: 120,
  created_at: '2026-08-24T10:02:00.000Z',
};

function erstelleDienste(client: unknown) {
  const syncStatus = new SyncStatusService();
  const isDemoMode = signal(false);
  const mockStore = {
    isDemoMode,
    savePurchase: vi.fn(),
    deletePurchase: vi.fn(),
    saveItem: vi.fn(),
    deleteItem: vi.fn(),
    saveActivityLog: vi.fn(),
    getItems: () => [],
  };
  const inventory = Object.create(InventoryService.prototype) as InventoryService;
  Object.assign(inventory, {
    supabase: { client },
    syncStatus,
    workspaceService: { currentWorkspace: signal(workspace) },
    mockStore,
    items: signal<InventoryItem[]>([]),
    selectedItem: signal<InventoryItem | null>(null),
    itemCosts: signal([]),
    activityLogs: signal([]),
    istGeladen: signal(true),
  });

  const purchase = Object.create(PurchaseService.prototype) as PurchaseService;
  Object.assign(purchase, {
    supabase: { client },
    syncStatus,
    workspaceService: { currentWorkspace: signal(workspace) },
    mockStore,
    purchasesRaw: signal<Purchase[]>([]),
    selectedPurchaseRaw: signal<Purchase | null>(null),
    selectedPurchase: () => null,
    sourcesService: { sources: signal([]) },
    suppliersService: { suppliers: signal([]) },
    inventory,
    webhookService: { sendPurchaseNotification: vi.fn() },
  });

  return { purchase, inventory, syncStatus };
}

describe('PurchaseService – abhängige Schreibvorgänge beim Anlegen', () => {
  it('übergibt initiale Mengenpositionen erst mit der bestätigten Datenbank-ID', async () => {
    const aufrufe: { tabelle: string; payload: unknown }[] = [];
    const finalerEinkauf = { ...gespeicherterEinkauf, id: '44444444-4444-4444-8444-444444444444' };
    const client = {
      from(tabelle: string) {
        return {
          insert(payload: unknown) {
            aufrufe.push({ tabelle, payload });
            if (tabelle === 'purchases') {
              return {
                select: () => ({ single: async () => ({ data: finalerEinkauf, error: null }) }),
              };
            }
            if (tabelle === 'purchase_lines') {
              return {
                select: async () => ({
                  data: [
                    {
                      id: 'line-1',
                      workspace_id: workspace.id,
                      purchase_id: finalerEinkauf.id,
                      catalog_product_id: 'catalog-1',
                      title_snapshot: 'LED-Lampe',
                      line_kind: 'quantity',
                      ordered_quantity: 5,
                      received_quantity: 0,
                      unit_purchase_price: 4.99,
                      line_total: 24.95,
                    },
                  ],
                  error: null,
                }),
              };
            }
            throw new Error(`Unerwartete Tabelle: ${tabelle}`);
          },
        };
      },
    };
    const { purchase } = erstelleDienste(client);

    const ergebnis = await purchase.createPurchase({
      type: 'lot',
      title: 'Nachkauf LED-Lampe Abnahme',
      purchase_date: '2026-08-28',
      purchase_price: 24.95,
      purchase_lines: [
        {
          catalogProductId: 'catalog-1',
          titleSnapshot: 'LED-Lampe',
          lineKind: 'quantity',
          orderedQuantity: 5,
          unitPurchasePrice: 4.99,
          lineTotal: 24.95,
        },
      ],
    });

    expect(ergebnis).toMatchObject({ status: 'success', data: { id: finalerEinkauf.id } });
    expect(aufrufe.map(({ tabelle }) => tabelle)).toEqual(['purchases', 'purchase_lines']);
    expect(aufrufe[1].payload).toEqual([
      expect.objectContaining({
        workspace_id: workspace.id,
        purchase_id: finalerEinkauf.id,
        catalog_product_id: 'catalog-1',
        ordered_quantity: 5,
        unit_purchase_price: 4.99,
        line_total: 24.95,
      }),
    ]);
  });

  it('meldet einen Fehler der initialen Positionen als Teilproblem statt als Erfolg', async () => {
    const aufrufe: { tabelle: string; payload: unknown }[] = [];
    const finalerEinkauf = { ...gespeicherterEinkauf, id: '44444444-4444-4444-8444-444444444444' };
    const client = {
      from(tabelle: string) {
        return {
          insert(payload: unknown) {
            aufrufe.push({ tabelle, payload });
            if (tabelle === 'purchases') {
              return {
                select: () => ({ single: async () => ({ data: finalerEinkauf, error: null }) }),
              };
            }
            if (tabelle === 'purchase_lines') {
              return {
                select: async () => ({
                  data: null,
                  error: { code: '23503', message: 'catalog product missing' },
                }),
              };
            }
            throw new Error(`Unerwartete Tabelle: ${tabelle}`);
          },
        };
      },
    };
    const { purchase } = erstelleDienste(client);

    const ergebnis = await purchase.createPurchase({
      type: 'lot',
      title: 'Nachkauf LED-Lampe Abnahme',
      purchase_date: '2026-08-28',
      purchase_price: 24.95,
      purchase_lines: [
        {
          catalogProductId: 'catalog-1',
          titleSnapshot: 'LED-Lampe',
          lineKind: 'quantity',
          orderedQuantity: 5,
          unitPurchasePrice: 4.99,
          lineTotal: 24.95,
        },
      ],
    });

    expect(ergebnis).toMatchObject({
      status: 'partial',
      data: { id: finalerEinkauf.id },
      error: null,
      problems: [
        {
          kind: 'purchase_lines',
          reportedBySyncStatus: true,
          error: expect.any(Error),
        },
      ],
    });
    expect(aufrufe[1].payload).toEqual([
      expect.objectContaining({ purchase_id: finalerEinkauf.id }),
    ]);
  });

  it('liefert den gespeicherten Einkauf mit einem typisierten Activity-Teilproblem zurück', async () => {
    const aufrufe: { tabelle: string; payload: unknown }[] = [];
    const client = {
      from(tabelle: string) {
        return {
          insert(payload: unknown) {
            aufrufe.push({ tabelle, payload });
            if (tabelle === 'purchases') {
              return {
                select: () => ({
                  single: async () => ({ data: gespeicherterEinkauf, error: null }),
                }),
              };
            }
            if (tabelle === 'inventory_items') {
              return {
                select: () => ({
                  single: async () => ({ data: gespeicherterArtikel, error: null }),
                }),
              };
            }
            if (tabelle === 'activity_logs') {
              return Promise.resolve({
                error: { code: '23503', message: 'inventory item missing' },
              });
            }
            throw new Error(`Unerwartete Tabelle: ${tabelle}`);
          },
        };
      },
    };
    const { purchase, syncStatus } = erstelleDienste(client);

    const ergebnis = await purchase.createPurchase({
      type: 'single',
      title: 'Konsole',
      purchase_date: '2026-08-24',
      purchase_price: 80,
      single_item_title: 'Konsole',
      single_item_condition: 'used',
      single_item_expected_value: 120,
    });

    expect(ergebnis).toMatchObject({
      status: 'partial',
      data: { id: gespeicherterEinkauf.id },
      error: null,
      problems: [
        {
          kind: 'activity_log',
          reportedBySyncStatus: true,
          error: expect.any(Error),
        },
      ],
    });
    expect(aufrufe.map(({ tabelle }) => tabelle)).toEqual([
      'purchases',
      'inventory_items',
      'activity_logs',
    ]);
    expect(aufrufe[2].payload).toMatchObject({ inventory_item_id: gespeicherterArtikel.id });
    expect(syncStatus.hatFehler()).toBe(true);
  });

  it('liefert den gespeicherten Einkauf bei fehlgeschlagenen Zusatzkosten als partiell zurück', async () => {
    const aufrufe: string[] = [];
    const client = {
      from(tabelle: string) {
        return {
          insert() {
            aufrufe.push(tabelle);
            if (tabelle === 'purchases') {
              return {
                select: () => ({
                  single: async () => ({
                    data: { ...gespeicherterEinkauf, type: 'mystery_pack' },
                    error: null,
                  }),
                }),
              };
            }
            if (tabelle === 'purchase_costs') {
              return Promise.resolve({ error: { code: '42501', message: 'denied' } });
            }
            throw new Error(`Unerwartete Tabelle: ${tabelle}`);
          },
        };
      },
    };
    const { purchase } = erstelleDienste(client);

    const ergebnis = await purchase.createPurchase({
      type: 'mystery_pack',
      title: 'Kiste',
      purchase_date: '2026-08-24',
      purchase_price: 80,
      initial_costs: [{ type: 'shipping', amount: 7, description: 'Versand' }],
    });

    expect(ergebnis).toMatchObject({
      status: 'partial',
      data: { id: gespeicherterEinkauf.id },
      error: null,
      problems: [
        {
          kind: 'additional_costs',
          reportedBySyncStatus: true,
          error: expect.any(Error),
        },
      ],
    });
    expect(aufrufe).toEqual(['purchases', 'purchase_costs']);
  });
});
