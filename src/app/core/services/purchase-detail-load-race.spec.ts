import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase, PurchaseLine, Workspace } from '../models/flipbase.models';
import { PurchaseService } from './purchase.service';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const workspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
};

function purchase(id: string): Purchase & { costs: []; items: []; purchase_lines: [] } {
  return {
    id,
    workspace_id: workspace.id,
    type: 'lot',
    title: `Einkauf ${id}`,
    purchase_date: '2026-08-29',
    purchase_price: 4.99,
    cost_allocation_mode: 'even',
    receiving_status: 'ordered',
    costs: [],
    items: [],
    purchase_lines: [],
  };
}

function purchaseLine(purchaseId: string): PurchaseLine {
  return {
    id: `line-${purchaseId}`,
    workspace_id: workspace.id,
    purchase_id: purchaseId,
    catalog_product_id: null,
    title_snapshot: 'LED-Lampe',
    line_kind: 'quantity',
    ordered_quantity: 1,
    received_quantity: 0,
    unit_purchase_price: 4.99,
    line_total: 4.99,
  };
}

function erstelleDienst() {
  interface QueryResult<T> {
    data: T;
    error: null;
  }
  const purchaseRequests = new Map<string, Deferred<QueryResult<ReturnType<typeof purchase>>>>();
  const lineRequests = new Map<string, Deferred<QueryResult<PurchaseLine[]>>>();
  const syncStatus = { melde: vi.fn((_context: string, error: unknown) => error) };

  const client = {
    from(table: string) {
      if (table === 'purchases') {
        let purchaseId = '';
        const query = {
          select: () => query,
          eq: (_column: string, value: string) => {
            purchaseId = value;
            return query;
          },
          single: () => {
            const request = deferred<QueryResult<ReturnType<typeof purchase>>>();
            purchaseRequests.set(purchaseId, request);
            return request.promise;
          },
        };
        return query;
      }

      if (table === 'purchase_lines') {
        let purchaseId = '';
        const query = {
          select: () => query,
          eq: (column: string, value: string) => {
            if (column === 'purchase_id') purchaseId = value;
            return query;
          },
          order: () => {
            const request = deferred<QueryResult<PurchaseLine[]>>();
            lineRequests.set(purchaseId, request);
            return request.promise;
          },
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
    syncStatus,
    inventory: { items: signal<InventoryItem[]>([]), istGeladen: signal(false) },
    purchasesRaw: signal<Purchase[]>([]),
    selectedPurchaseRaw: signal<Purchase | null>(null),
    purchaseItemsFallback: signal<InventoryItem[]>([]),
    purchaseLinesRaw: signal<PurchaseLine[]>([]),
    detailLoadRequestId: 0,
    isLoading: signal(false),
  });
  return { service, purchaseRequests, lineRequests, syncStatus };
}

describe('PurchaseService – konkurrierende Detailabfragen', () => {
  it('lässt einen alten Detailfehler weder den aktuellen Ladezustand löschen noch melden', async () => {
    const { service, purchaseRequests, lineRequests, syncStatus } = erstelleDienst();

    const oldLoad = service.getPurchaseById('old');
    const currentLoad = service.getPurchaseById('current');
    purchaseRequests.get('old')!.reject(new Error('veralteter Detailfehler'));

    await expect(oldLoad).resolves.toBeNull();
    expect(service.isLoading()).toBe(true);
    expect(syncStatus.melde).not.toHaveBeenCalled();

    purchaseRequests.get('current')!.resolve({ data: purchase('current'), error: null });
    await vi.waitFor(() => expect(lineRequests.has('current')).toBe(true));
    lineRequests.get('current')!.resolve({ data: [purchaseLine('current')], error: null });
    await expect(currentLoad).resolves.toMatchObject({ id: 'current' });
    expect(service.isLoading()).toBe(false);
  });

  it('ignoriert einen alten Positionsfehler während eine neuere Detailabfrage lädt', async () => {
    const { service, purchaseRequests, lineRequests, syncStatus } = erstelleDienst();

    const oldLoad = service.getPurchaseById('old');
    purchaseRequests.get('old')!.resolve({ data: purchase('old'), error: null });
    await vi.waitFor(() => expect(lineRequests.has('old')).toBe(true));

    const currentLoad = service.getPurchaseById('current');
    lineRequests.get('old')!.reject(new Error('veralteter Positionsfehler'));
    await expect(oldLoad).resolves.toMatchObject({ id: 'old' });
    expect(service.isLoading()).toBe(true);
    expect(syncStatus.melde).not.toHaveBeenCalled();

    purchaseRequests.get('current')!.resolve({ data: purchase('current'), error: null });
    await vi.waitFor(() => expect(lineRequests.has('current')).toBe(true));
    lineRequests.get('current')!.resolve({ data: [purchaseLine('current')], error: null });
    await expect(currentLoad).resolves.toMatchObject({ id: 'current' });
    expect(service.isLoading()).toBe(false);
  });
});
