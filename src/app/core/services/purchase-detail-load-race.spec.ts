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

function purchase(
  id: string,
  purchasePrice: number | null = 4.99,
  workspaceId = workspace.id,
): Purchase & { costs: []; items: []; purchase_lines: [] } {
  return {
    id,
    workspace_id: workspaceId,
    type: 'lot',
    title: `Einkauf ${id}`,
    purchase_date: '2026-08-29',
    purchase_price: purchasePrice,
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
  const purchaseFilters = new Map<string, readonly (readonly [string, string])[]>();
  const currentWorkspace = signal<Workspace | null>(workspace);
  const selectedPurchaseRaw = signal<Purchase | null>(null);
  const purchaseItemsFallback = signal<InventoryItem[]>([]);
  const purchaseLinesRaw = signal<PurchaseLine[]>([]);
  const syncStatus = { melde: vi.fn((_context: string, error: unknown) => error) };

  const client = {
    rpc: vi.fn(async () => ({
      data: { state: 'none', review_inventory_item_id: null },
      error: null,
    })),
    from(table: string) {
      if (table === 'purchases') {
        let purchaseId = '';
        const filters: (readonly [string, string])[] = [];
        const query = {
          select: () => query,
          eq: (column: string, value: string) => {
            filters.push([column, value]);
            if (column === 'id') purchaseId = value;
            return query;
          },
          single: () => {
            const request = deferred<QueryResult<ReturnType<typeof purchase>>>();
            purchaseRequests.set(purchaseId, request);
            purchaseFilters.set(purchaseId, [...filters]);
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
    workspaceService: { currentWorkspace },
    syncStatus,
    inventory: { items: signal<InventoryItem[]>([]), istGeladen: signal(false) },
    purchasesRaw: signal<Purchase[]>([]),
    selectedPurchaseRaw,
    purchaseItemsFallback,
    purchaseLinesRaw,
    selectedPurchase: () => selectedPurchaseRaw(),
    purchaseItems: () => purchaseItemsFallback(),
    purchaseLines: () => purchaseLinesRaw(),
    detailLoadRequestId: 0,
    saleHistoryLoadRequestId: 0,
    purchaseSaleHistoryState: signal<
      'idle' | 'loading' | 'recorded' | 'review_required' | 'none' | 'error'
    >('idle'),
    purchaseSaleReviewInventoryItemId: signal<string | null>(null),
    isLoading: signal(false),
  });
  return {
    service,
    purchaseRequests,
    lineRequests,
    purchaseFilters,
    currentWorkspace,
    syncStatus,
  };
}

describe('PurchaseService – konkurrierende Detailabfragen', () => {
  it('begrenzt den Detailabruf auf den beim Start aktiven Workspace', async () => {
    const { service, purchaseRequests, lineRequests, purchaseFilters } = erstelleDienst();

    const load = service.getPurchaseById('workspace-scoped');
    purchaseRequests.get('workspace-scoped')!.resolve({
      data: purchase('workspace-scoped'),
      error: null,
    });
    await vi.waitFor(() => expect(lineRequests.has('workspace-scoped')).toBe(true));
    lineRequests.get('workspace-scoped')!.resolve({ data: [], error: null });
    await load;

    expect(purchaseFilters.get('workspace-scoped')).toEqual([
      ['workspace_id', workspace.id],
      ['id', 'workspace-scoped'],
    ]);
  });

  it('verwirft eine bekannte ID aus einem anderen Workspace auch bei fehlerhafter DB-Antwort', async () => {
    const { service, purchaseRequests, lineRequests } = erstelleDienst();
    const foreignWorkspaceId = '22222222-2222-4222-8222-222222222222';

    const load = service.getPurchaseById('shared-id');
    purchaseRequests.get('shared-id')!.resolve({
      data: purchase('shared-id', 4.99, foreignWorkspaceId),
      error: null,
    });
    await Promise.resolve();
    await Promise.resolve();
    lineRequests.get('shared-id')?.resolve({ data: [], error: null });

    await expect(load).resolves.toBeNull();
    expect(service.selectedPurchase()).toBeNull();
  });

  it('verwirft alle Detailantworten sobald der aktive Workspace wechselt', async () => {
    const { service, purchaseRequests, lineRequests, currentWorkspace } = erstelleDienst();

    const load = service.getPurchaseById('workspace-a-purchase');
    currentWorkspace.set({ ...workspace, id: '22222222-2222-4222-8222-222222222222' });
    purchaseRequests.get('workspace-a-purchase')!.resolve({
      data: purchase('workspace-a-purchase'),
      error: null,
    });
    await Promise.resolve();
    await Promise.resolve();
    lineRequests.get('workspace-a-purchase')?.resolve({ data: [], error: null });

    await expect(load).resolves.toBeNull();
    expect(service.selectedPurchase()).toBeNull();
    expect(service.purchaseItems()).toEqual([]);
    expect(service.purchaseLines()).toEqual([]);
  });

  it('maskiert den Datenbank-Default nicht als echten Nullpreis eines unbekannten Drafts', async () => {
    const { service, purchaseRequests, lineRequests } = erstelleDienst();

    const load = service.getPurchaseById('unknown-price');
    purchaseRequests.get('unknown-price')!.resolve({
      data: { ...purchase('unknown-price', null), total_purchase_cost: null },
      error: null,
    });
    await vi.waitFor(() => expect(lineRequests.has('unknown-price')).toBe(true));
    lineRequests.get('unknown-price')!.resolve({ data: [], error: null });

    await expect(load).resolves.toMatchObject({
      purchase_price: null,
      total_purchase_cost: null,
    });
  });

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
    await expect(oldLoad).resolves.toBeNull();
    expect(service.isLoading()).toBe(true);
    expect(syncStatus.melde).not.toHaveBeenCalled();

    purchaseRequests.get('current')!.resolve({ data: purchase('current'), error: null });
    await vi.waitFor(() => expect(lineRequests.has('current')).toBe(true));
    lineRequests.get('current')!.resolve({ data: [purchaseLine('current')], error: null });
    await expect(currentLoad).resolves.toMatchObject({ id: 'current' });
    expect(service.isLoading()).toBe(false);
  });
});
