import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase, PurchaseLine, Workspace } from '../models/flipbase.models';
import { PurchaseService } from './purchase.service';

const workspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
  created_at: '2026-08-28T10:00:00.000Z',
};

const purchase: Purchase = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  type: 'lot',
  title: 'Nachkauf LED-Lampe',
  purchase_date: '2026-08-28',
  purchase_price: 24.95,
  cost_allocation_mode: 'even',
  receiving_status: 'received',
  created_at: '2026-08-28T10:00:00.000Z',
};

const line: PurchaseLine = {
  id: '44444444-4444-4444-8444-444444444444',
  workspace_id: workspace.id,
  purchase_id: purchase.id,
  catalog_product_id: '55555555-5555-4555-8555-555555555555',
  title_snapshot: 'LED-Lampe',
  line_kind: 'quantity',
  ordered_quantity: 5,
  received_quantity: 5,
  unit_purchase_price: 4.99,
  line_total: 24.95,
};

function erstelleDienst(purchaseOverrides: Partial<Purchase> = {}) {
  const purchasesRaw = signal<Purchase[]>([]);
  const selectedPurchaseRaw = signal<Purchase | null>(null);
  const purchaseLinesRaw = signal<PurchaseLine[]>([]);
  const loadedPurchase = { ...purchase, ...purchaseOverrides };
  const listResult = {
    data: [{ ...loadedPurchase, items: [], purchase_lines: [line] }],
    error: null,
  };
  const detailResult = {
    data: {
      ...loadedPurchase,
      items: [],
      costs: loadedPurchase.costs ?? [],
      purchase_lines: [line],
    },
    error: null,
  };
  const purchaseLinesResult = { data: [line], error: null };
  const purchaseSelects: string[] = [];

  const client = {
    rpc: vi.fn(async () => ({
      data: { state: 'none', review_inventory_item_id: null },
      error: null,
    })),
    from(table: string) {
      if (table === 'purchases') {
        let orderCount = 0;
        const query = {
          select: (columns: string) => {
            purchaseSelects.push(columns);
            return query;
          },
          eq: () => query,
          order: () => (++orderCount === 2 ? Promise.resolve(listResult) : query),
          single: async () => detailResult,
        };
        return query;
      }
      if (table === 'purchase_lines') {
        const query = {
          select: () => query,
          eq: () => query,
          order: async () => purchaseLinesResult,
        };
        return query;
      }
      throw new Error(`Unerwartete Tabelle: ${table}`);
    },
  };

  const service = Object.create(PurchaseService.prototype) as PurchaseService;
  Object.assign(service, {
    supabase: { client },
    workspaceService: { currentWorkspace: signal(workspace) },
    mockStore: { isDemoMode: signal(false) },
    syncStatus: { melde: vi.fn() },
    inventory: { items: signal<InventoryItem[]>([]), istGeladen: signal(false) },
    purchasesRaw,
    selectedPurchaseRaw,
    purchaseItemsFallback: signal<InventoryItem[]>([]),
    purchaseLinesRaw,
    detailLoadRequestId: 0,
    saleHistoryLoadRequestId: 0,
    purchaseSaleHistoryState: signal<
      'idle' | 'loading' | 'recorded' | 'review_required' | 'none' | 'error'
    >('idle'),
    purchaseSaleReviewInventoryItemId: signal<string | null>(null),
    isLoading: signal(false),
    loadError: signal<Error | null>(null),
    loadedWorkspaceId: signal<string | null>(null),
    loadRequestId: 0,
  });
  return { service, purchasesRaw, purchaseSelects };
}

describe('PurchaseService – fachliche Positionsanzahl', () => {
  it.each(['list', 'detail'] as const)(
    'wählt für %s die eindeutige Workspace-Beziehung der Zusatzkosten',
    async (view) => {
      const { service, purchaseSelects } = erstelleDienst();

      if (view === 'list') await service.loadPurchases(workspace.id);
      else await service.getPurchaseById(purchase.id);

      expect(purchaseSelects).toHaveLength(1);
      expect(purchaseSelects[0]).toContain(
        'costs:purchase_costs!purchase_costs_workspace_purchase_fkey(*)',
      );
    },
  );

  it('zeigt eine vollständig eingebuchte Mengenposition in Übersicht und Detail weiterhin als fünf', async () => {
    const { service, purchasesRaw, purchaseSelects } = erstelleDienst();

    await service.loadPurchases(workspace.id);
    const detail = await service.getPurchaseById(purchase.id);

    expect(purchasesRaw()).toMatchObject([{ id: purchase.id, items_count: 5 }]);
    expect(detail).toMatchObject({ id: purchase.id, items_count: 5 });
    expect(purchaseSelects).toHaveLength(2);
    expect(
      purchaseSelects.every((columns) =>
        columns.includes('purchase_lines!purchase_lines_purchase_id_fkey(*)'),
      ),
    ).toBe(true);
  });

  it.each(['list', 'detail'] as const)(
    'zieht beim Laden der %s den Rabatt von den Gesamtkosten ab',
    async (view) => {
      const { service, purchasesRaw } = erstelleDienst({
        purchase_price: 123.45,
        discount_amount: 23.46,
        costs: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            purchase_id: purchase.id,
            type: 'shipping',
            amount: 5.55,
          },
          {
            id: '77777777-7777-4777-8777-777777777777',
            purchase_id: purchase.id,
            type: 'customs',
            amount: 1.11,
          },
        ],
      });

      const loaded =
        view === 'list'
          ? (await service.loadPurchases(workspace.id), purchasesRaw()[0])
          : await service.getPurchaseById(purchase.id);

      // 123.45 - 23.46 + 5.55 + 1.11 = 106.65
      expect(loaded?.total_purchase_cost).toBe(106.65);
    },
  );
});
