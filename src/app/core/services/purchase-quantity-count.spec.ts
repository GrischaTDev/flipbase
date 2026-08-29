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

function erstelleDienst() {
  const purchasesRaw = signal<Purchase[]>([]);
  const selectedPurchaseRaw = signal<Purchase | null>(null);
  const purchaseLinesRaw = signal<PurchaseLine[]>([]);
  const listResult = { data: [{ ...purchase, items: [], purchase_lines: [line] }], error: null };
  const detailResult = {
    data: { ...purchase, items: [], costs: [], purchase_lines: [line] },
    error: null,
  };
  const purchaseLinesResult = { data: [line], error: null };
  const purchaseSelects: string[] = [];

  const client = {
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
    isLoading: signal(false),
  });
  return { service, purchasesRaw, purchaseSelects };
}

describe('PurchaseService – fachliche Positionsanzahl', () => {
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
});
