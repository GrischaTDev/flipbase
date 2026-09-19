import '@angular/compiler';
import { signal, WritableSignal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseService } from './purchase.service';
import { SyncStatusService } from './sync-status.service';

type SaleHistoryState = 'idle' | 'loading' | 'recorded' | 'review_required' | 'none' | 'error';

interface SaleHistoryService {
  readonly purchaseSaleHistoryState: WritableSignal<SaleHistoryState>;
  readonly purchaseSaleReviewInventoryItemId: WritableSignal<string | null>;
  loadPurchaseSaleHistory(workspaceId: string, purchaseId: string): Promise<SaleHistoryState>;
}

interface SaleHistoryResponse {
  readonly state: Extract<SaleHistoryState, 'recorded' | 'review_required' | 'none'>;
  readonly review_inventory_item_id: string | null;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function createService(options?: {
  readonly rpc?: (name: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;
}): SaleHistoryService {
  const syncStatus = new SyncStatusService();
  const service = Object.create(PurchaseService.prototype) as PurchaseService & SaleHistoryService;
  Object.assign(service, {
    supabase: { client: { rpc: options?.rpc ?? vi.fn() } },
    syncStatus,
    workspaceService: { currentWorkspace: signal({ id: 'workspace-1' }) },
    purchaseSaleHistoryState: signal<SaleHistoryState>('idle'),
    purchaseSaleReviewInventoryItemId: signal<string | null>(null),
    saleHistoryLoadRequestId: 0,
  });
  return service;
}

describe('PurchaseService – unveränderlicher Verkaufsverlauf', () => {
  it('fragt den Verkaufsverlauf serverautoritativ ab', async () => {
    const rpc = vi.fn(async () => ({
      data: { state: 'recorded', review_inventory_item_id: null },
      error: null,
    }));
    const service = createService({ rpc });

    const result = await service.loadPurchaseSaleHistory('workspace-1', 'purchase-1');

    expect(result).toBe('recorded');
    expect(service.purchaseSaleHistoryState()).toBe('recorded');
    expect(service.purchaseSaleReviewInventoryItemId()).toBeNull();
    expect(rpc).toHaveBeenCalledWith('get_purchase_sale_history', {
      p_workspace_id: 'workspace-1',
      p_purchase_id: 'purchase-1',
    });
  });

  it('unterscheidet sicher zwischen keinem Verkauf und einem Ladefehler', async () => {
    const noSale = createService({
      rpc: vi.fn(async () => ({
        data: { state: 'none', review_inventory_item_id: null },
        error: null,
      })),
    });
    const failed = createService({
      rpc: vi.fn(async () => ({ data: null, error: new Error('Netzwerkfehler') })),
    });

    expect(await noSale.loadPurchaseSaleHistory('workspace-1', 'purchase-1')).toBe('none');
    expect(await failed.loadPurchaseSaleHistory('workspace-1', 'purchase-1')).toBe('error');
    expect(noSale.purchaseSaleHistoryState()).toBe('none');
    expect(failed.purchaseSaleHistoryState()).toBe('error');
    expect(noSale.purchaseSaleReviewInventoryItemId()).toBeNull();
    expect(failed.purchaseSaleReviewInventoryItemId()).toBeNull();
  });

  it('meldet einen verkauften Legacy-Artikel ohne Verkaufsposition zur Prüfung', async () => {
    const service = createService({
      rpc: vi.fn(async () => ({
        data: {
          state: 'review_required',
          review_inventory_item_id: '95000000-0000-4000-8000-000000000405',
        },
        error: null,
      })),
    });

    expect(await service.loadPurchaseSaleHistory('workspace-1', 'purchase-legacy')).toBe(
      'review_required',
    );
    expect(service.purchaseSaleHistoryState()).toBe('review_required');
    expect(service.purchaseSaleReviewInventoryItemId()).toBe(
      '95000000-0000-4000-8000-000000000405',
    );
  });

  it.each([
    { state: 'review_required', review_inventory_item_id: null },
    { state: 'review_required', review_inventory_item_id: '' },
    { state: 'review_required', review_inventory_item_id: 'kein-uuid-ziel' },
    { state: 'none', review_inventory_item_id: 'unerwartetes-target' },
    { state: 'recorded' },
    'review_required',
  ])('bleibt bei einer missgebildeten RPC-Antwort fail-closed: %j', async (data) => {
    const service = createService({
      rpc: vi.fn(async () => ({ data, error: null })),
    });

    expect(await service.loadPurchaseSaleHistory('workspace-1', 'purchase-legacy')).toBe('error');
    expect(service.purchaseSaleHistoryState()).toBe('error');
    expect(service.purchaseSaleReviewInventoryItemId()).toBeNull();
  });

  it('lässt eine verspätete ältere Antwort den neueren Einkauf nicht überschreiben', async () => {
    const first = deferred<{ data: SaleHistoryResponse; error: null }>();
    const second = deferred<{ data: SaleHistoryResponse; error: null }>();
    const rpc = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const service = createService({ rpc });

    const firstLoad = service.loadPurchaseSaleHistory('workspace-1', 'purchase-old');
    const secondLoad = service.loadPurchaseSaleHistory('workspace-1', 'purchase-current');
    expect(service.purchaseSaleHistoryState()).toBe('loading');

    second.resolve({
      data: {
        state: 'review_required',
        review_inventory_item_id: '95000000-0000-4000-8000-000000000406',
      },
      error: null,
    });
    expect(await secondLoad).toBe('review_required');
    first.resolve({
      data: {
        state: 'review_required',
        review_inventory_item_id: '95000000-0000-4000-8000-000000000405',
      },
      error: null,
    });
    expect(await firstLoad).toBe('review_required');
    expect(service.purchaseSaleHistoryState()).toBe('review_required');
    expect(service.purchaseSaleReviewInventoryItemId()).toBe(
      '95000000-0000-4000-8000-000000000406',
    );
  });
});
