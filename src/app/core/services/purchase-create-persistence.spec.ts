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
  it('legt Einkauf, Zusatzkosten und Positionen produktiv in genau einer RPC an', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        purchase: gespeicherterEinkauf,
        purchase_costs: [
          {
            id: 'cost-1',
            purchase_id: gespeicherterEinkauf.id,
            type: 'shipping',
            amount: 0.05,
            description: 'Versand',
          },
        ],
        purchase_lines: [
          {
            id: 'line-1',
            workspace_id: workspace.id,
            purchase_id: gespeicherterEinkauf.id,
            catalog_product_id: 'catalog-1',
            title_snapshot: 'LED-Lampe',
            line_kind: 'quantity',
            ordered_quantity: 3,
            received_quantity: 0,
            unit_purchase_price: 4.99,
            line_total: 14.97,
            allocated_additional_cost: 0.05,
          },
        ],
      },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });

    const ergebnis = await purchase.createPurchase({
      type: 'lot',
      title: 'LED-Lampen',
      purchase_date: '2026-08-29',
      purchase_price: 14.97,
      cost_allocation_mode: 'even',
      initial_costs: [{ type: 'shipping', amount: 0.05, description: 'Versand' }],
      purchase_lines: [
        {
          catalogProductId: 'catalog-1',
          titleSnapshot: 'LED-Lampe',
          lineKind: 'quantity',
          orderedQuantity: 3,
          unitPurchasePrice: 4.99,
          lineTotal: 14.97,
        },
      ],
    });

    expect(ergebnis).toMatchObject({ status: 'success', data: { id: gespeicherterEinkauf.id } });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('create_purchase', {
      p_workspace_id: workspace.id,
      p_purchase: expect.objectContaining({
        title: 'LED-Lampen',
        purchase_price: 14.97,
        cost_allocation_mode: 'even',
      }),
      p_expenses: [{ type: 'shipping', amount: 0.05, description: 'Versand' }],
      p_lines: [
        expect.objectContaining({
          catalog_product_id: 'catalog-1',
          ordered_quantity: 3,
          line_total: 14.97,
        }),
      ],
    });
  });

  it('übergibt initiale Mengenpositionen erst mit der bestätigten Datenbank-ID', async () => {
    const aufrufe: { tabelle: string; payload: unknown }[] = [];
    const finalerEinkauf = { ...gespeicherterEinkauf, id: '44444444-4444-4444-8444-444444444444' };
    const client = {
      rpc: async (_name: string, payload: unknown) => {
        aufrufe.push({ tabelle: 'create_purchase', payload });
        return {
          data: {
            purchase: finalerEinkauf,
            purchase_costs: [],
            purchase_lines: [
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
                allocated_additional_cost: 0,
              },
            ],
          },
          error: null,
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
    expect(aufrufe.map(({ tabelle }) => tabelle)).toEqual(['create_purchase']);
    expect(aufrufe[0].payload).toEqual(
      expect.objectContaining({
        p_workspace_id: workspace.id,
        p_lines: [
          expect.objectContaining({
            catalog_product_id: 'catalog-1',
            ordered_quantity: 5,
            unit_purchase_price: 4.99,
            line_total: 24.95,
          }),
        ],
      }),
    );
  });

  it('rollt bei einem Fehler der initialen Positionen den gesamten Einkauf zurück', async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { code: '23503', message: 'catalog product missing' },
      }),
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
      status: 'failed',
      data: null,
      error: expect.any(Error),
      problems: [],
    });
  });

  it('liefert den gespeicherten Einkauf mit einem typisierten Activity-Teilproblem zurück', async () => {
    const aufrufe: { tabelle: string; payload: unknown }[] = [];
    const client = {
      rpc: async () => ({
        data: { purchase: gespeicherterEinkauf, purchase_costs: [], purchase_lines: [] },
        error: null,
      }),
      from(tabelle: string) {
        return {
          insert(payload: unknown) {
            aufrufe.push({ tabelle, payload });
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
    expect(aufrufe.map(({ tabelle }) => tabelle)).toEqual(['inventory_items', 'activity_logs']);
    expect(aufrufe[1].payload).toMatchObject({ inventory_item_id: gespeicherterArtikel.id });
    expect(syncStatus.hatFehler()).toBe(true);
  });

  it('rollt bei fehlgeschlagenen Zusatzkosten den gesamten Einkauf zurück', async () => {
    const client = {
      rpc: async () => ({ data: null, error: { code: '42501', message: 'denied' } }),
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
      status: 'failed',
      data: null,
      error: expect.any(Error),
      problems: [],
    });
  });
});
