import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { InventoryItem, Purchase, Sale } from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
import { PurchaseService } from './purchase.service';
import { SalesService } from './sales.service';
import { SyncStatusService } from './sync-status.service';

interface QueryResult<T> {
  readonly data: T[] | null;
  readonly error: Error | null;
}

function deferredQueries<T>() {
  const resolvers = new Map<string, (result: QueryResult<T>) => void>();
  const queryFor = () => {
    let workspaceId = '';
    const query = {
      select: () => query,
      eq: (_column: string, value: string) => {
        workspaceId = value;
        return query;
      },
      order: () => query,
      then: (resolve: (result: QueryResult<T>) => unknown, reject: (reason: unknown) => unknown) =>
        new Promise<QueryResult<T>>((requestResolve) => {
          resolvers.set(workspaceId, requestResolve);
        }).then(resolve, reject),
    };
    return query;
  };
  return { queryFor, resolvers };
}

const inventoryItem = (workspaceId: string): InventoryItem => ({
  id: `item-${workspaceId}`,
  workspace_id: workspaceId,
  title: `Artikel ${workspaceId}`,
  condition: 'used',
  status: 'ready',
  allocated_purchase_cost: 10,
});

const sale = (workspaceId: string): Sale => ({
  id: `sale-${workspaceId}`,
  workspace_id: workspaceId,
  platform: 'direct',
  sale_price: 20,
  sale_date: '2026-08-31',
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
  has_persisted_lines: true,
  lines: [],
});

const purchase = (workspaceId: string): Purchase => ({
  id: `purchase-${workspaceId}`,
  workspace_id: workspaceId,
  type: 'single',
  title: `Einkauf ${workspaceId}`,
  purchase_date: '2026-08-31',
  purchase_price: 10,
  cost_allocation_mode: 'even',
  purchase_lines: [],
  items: [],
});

describe('workspacegebundene Listenladevorgänge', () => {
  it('InventoryService verwirft die verspätete Antwort von Workspace A', async () => {
    const currentWorkspace = signal<{ id: string }>({ id: 'workspace-a' });
    const inventoryQueries = deferredQueries<InventoryItem>();
    const service = Object.create(InventoryService.prototype) as InventoryService;
    Object.assign(service, {
      items: signal<InventoryItem[]>([]),
      selectedItem: signal(null),
      itemCosts: signal([]),
      activityLogs: signal([]),
      isLoading: signal(false),
      loadedWorkspaceId: signal<string | null>(null),
      loadError: signal<Error | null>(null),
      loadRequestId: 0,
      workspaceService: { currentWorkspace },
      mockStore: { isDemoMode: signal(false) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: (table: string) => {
            if (table === 'inventory_items') return inventoryQueries.queryFor();
            return {
              select: () => ({
                eq: async (_column: string, workspaceId: string) => ({
                  data: [
                    {
                      inventory_item_id: `item-${workspaceId}`,
                      workspace_id: workspaceId,
                      sale_state: 'no_active_sale',
                      active_sale_count: 0,
                      active_sale_id: null,
                    },
                  ],
                  error: null,
                }),
              }),
            };
          },
        },
      },
    });

    const loadA = service.loadInventory('workspace-a');
    currentWorkspace.set({ id: 'workspace-b' });
    const loadB = service.loadInventory('workspace-b');
    await vi.waitFor(() => {
      expect(inventoryQueries.resolvers.has('workspace-a')).toBe(true);
      expect(inventoryQueries.resolvers.has('workspace-b')).toBe(true);
    });
    inventoryQueries.resolvers.get('workspace-b')?.({
      data: [inventoryItem('workspace-b')],
      error: null,
    });
    await loadB;
    inventoryQueries.resolvers.get('workspace-a')?.({
      data: [inventoryItem('workspace-a')],
      error: null,
    });
    await loadA;

    expect(service.items().map((entry) => entry.workspace_id)).toEqual(['workspace-b']);
    expect(service.loadedWorkspaceId()).toBe('workspace-b');
  });

  it('InventoryService veröffentlicht einen aktuellen Ladefehler statt einen geladenen Leerbestand', async () => {
    const service = Object.create(InventoryService.prototype) as InventoryService;
    Object.assign(service, {
      items: signal<InventoryItem[]>([inventoryItem('workspace-old')]),
      selectedItem: signal(null),
      itemCosts: signal([]),
      activityLogs: signal([]),
      isLoading: signal(false),
      loadedWorkspaceId: signal<string | null>('workspace-old'),
      loadError: signal<Error | null>(null),
      loadRequestId: 0,
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-b' }) },
      mockStore: { isDemoMode: signal(false) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => {
            const query = {
              select: () => query,
              eq: () => query,
              order: async () => ({ data: null, error: new Error('Inventar nicht erreichbar') }),
            };
            return query;
          },
        },
      },
    });

    await service.loadInventory('workspace-b');

    expect(service.items()).toEqual([]);
    expect(service.loadedWorkspaceId()).toBeNull();
    expect(service.loadError()?.message).toContain('Inventar nicht erreichbar');
  });

  it('InventoryService ignoriert einen Refresh für einen nicht mehr aktiven Workspace ohne B zu leeren', async () => {
    const from = vi.fn();
    const service = Object.create(InventoryService.prototype) as InventoryService;
    Object.assign(service, {
      items: signal<InventoryItem[]>([inventoryItem('workspace-b')]),
      selectedItem: signal(null),
      itemCosts: signal([]),
      activityLogs: signal([]),
      isLoading: signal(false),
      loadedWorkspaceId: signal<string | null>('workspace-b'),
      loadError: signal<Error | null>(null),
      loadRequestId: 4,
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-b' }) },
      mockStore: { isDemoMode: signal(false) },
      syncStatus: new SyncStatusService(),
      supabase: { client: { from } },
    });

    await service.loadInventory('workspace-a');

    expect(from).not.toHaveBeenCalled();
    expect(service.items().map((entry) => entry.workspace_id)).toEqual(['workspace-b']);
    expect(service.loadedWorkspaceId()).toBe('workspace-b');
  });

  it('SalesService verwirft die verspätete Antwort von Workspace A', async () => {
    const currentWorkspace = signal<{ id: string }>({ id: 'workspace-a' });
    const salesQueries = deferredQueries<Sale>();
    const service = Object.create(SalesService.prototype) as SalesService;
    Object.assign(service, {
      sales: signal<Sale[]>([]),
      isLoading: signal(false),
      loadedWorkspaceId: signal<string | null>(null),
      loadError: signal<Error | null>(null),
      loadRequestId: 0,
      workspaceService: { currentWorkspace },
      mockStore: { isDemoMode: signal(false) },
      syncStatus: new SyncStatusService(),
      profitEngine: {
        calculateProfit: () => 10,
        calculateRoi: () => 100,
        calculateHoldingDurationDays: () => 0,
      },
      supabase: { client: { from: () => salesQueries.queryFor() } },
    });

    const loadA = service.loadSales('workspace-a');
    currentWorkspace.set({ id: 'workspace-b' });
    const loadB = service.loadSales('workspace-b');
    await vi.waitFor(() => {
      expect(salesQueries.resolvers.has('workspace-a')).toBe(true);
      expect(salesQueries.resolvers.has('workspace-b')).toBe(true);
    });
    salesQueries.resolvers.get('workspace-b')?.({ data: [sale('workspace-b')], error: null });
    await loadB;
    salesQueries.resolvers.get('workspace-a')?.({ data: [sale('workspace-a')], error: null });
    await loadA;

    expect(service.sales().map((entry) => entry.workspace_id)).toEqual(['workspace-b']);
    expect(service.loadedWorkspaceId()).toBe('workspace-b');
  });

  it('PurchaseService verwirft die verspätete Antwort von Workspace A', async () => {
    const currentWorkspace = signal<{ id: string }>({ id: 'workspace-a' });
    const purchaseQueries = deferredQueries<Purchase>();
    const purchasesRaw = signal<Purchase[]>([]);
    const service = Object.create(PurchaseService.prototype) as PurchaseService;
    Object.assign(service, {
      purchasesRaw,
      selectedPurchaseRaw: signal(null),
      purchaseItemsFallback: signal([]),
      purchaseLinesRaw: signal([]),
      isLoading: signal(false),
      loadedWorkspaceId: signal<string | null>(null),
      loadError: signal<Error | null>(null),
      loadRequestId: 0,
      workspaceService: { currentWorkspace },
      mockStore: { isDemoMode: signal(false) },
      syncStatus: { melde: vi.fn((_: string, error: Error) => error) },
      inventory: { items: signal([]), istGeladen: signal(false) },
      supabase: { client: { from: () => purchaseQueries.queryFor() } },
    });

    const loadA = service.loadPurchases('workspace-a');
    currentWorkspace.set({ id: 'workspace-b' });
    const loadB = service.loadPurchases('workspace-b');
    await vi.waitFor(() => {
      expect(purchaseQueries.resolvers.has('workspace-a')).toBe(true);
      expect(purchaseQueries.resolvers.has('workspace-b')).toBe(true);
    });
    purchaseQueries.resolvers.get('workspace-b')?.({
      data: [purchase('workspace-b')],
      error: null,
    });
    await loadB;
    purchaseQueries.resolvers.get('workspace-a')?.({
      data: [purchase('workspace-a')],
      error: null,
    });
    await loadA;

    expect(purchasesRaw().map((entry) => entry.workspace_id)).toEqual(['workspace-b']);
    expect(service.loadedWorkspaceId()).toBe('workspace-b');
  });
});
