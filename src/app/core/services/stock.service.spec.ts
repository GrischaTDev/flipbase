import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { StockService } from './stock.service';
import { StockLot, StockMovement, StockPosition } from '../models/flipbase.models';
import { SyncStatusService } from './sync-status.service';

describe('StockService', () => {
  it('disambiguiert beim Laden die Katalogbeziehung der Bestandslose', async () => {
    const selectsByTable = new Map<string, string>();
    const from = (table: string) => {
      const query = {
        select: (columns: string) => {
          selectsByTable.set(table, columns);
          return query;
        },
        eq: () => query,
        order: () => query,
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return query;
    };
    const service = Object.create(StockService.prototype) as StockService;
    Object.assign(service, {
      positions: signal<StockPosition[]>([]),
      lots: signal<StockLot[]>([]),
      movements: signal<StockMovement[]>([]),
      isLoading: signal(false),
      loadError: signal<Error | null>(null),
      loadedWorkspaceId: signal<string | null>(null),
      loadRequestId: 0,
      mockStore: { isDemoMode: signal(false) },
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      syncStatus: new SyncStatusService(),
      supabase: { client: { from } },
    });

    await service.loadPositions('workspace-1');

    expect(selectsByTable.get('stock_lots')).toContain(
      'catalog_product:catalog_products!stock_lots_catalog_product_id_fkey(',
    );
  });

  it('übernimmt den durch den Wareneingang bestätigten Mengenbestand', async () => {
    const service = Object.create(StockService.prototype) as StockService;
    Object.assign(service, {
      positions: signal<StockPosition[]>([]),
      lots: signal<StockLot[]>([]),
      movements: signal([]),
      isLoading: signal(false),
      loadError: signal<Error | null>(null),
      loadedWorkspaceId: signal<string | null>(null),
      loadRequestId: 0,
      mockStore: { isDemoMode: signal(false) },
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          rpc: async () => ({
            data: {
              purchase_lines: [],
              stock_lots: [
                {
                  id: 'lot-1',
                  workspace_id: 'workspace-1',
                  purchase_id: 'purchase-1',
                  purchase_line_id: 'line-1',
                  catalog_product_id: 'product-1',
                  received_quantity: 5,
                  remaining_quantity: 5,
                  unit_cost: 4.99,
                  received_at: '2026-08-26T10:00:00.000Z',
                },
              ],
            },
            error: null,
          }),
          from: (table: string) => {
            const data =
              table === 'stock_lots'
                ? [
                    {
                      id: 'lot-1',
                      workspace_id: 'workspace-1',
                      purchase_id: 'purchase-1',
                      purchase_line_id: 'line-1',
                      catalog_product_id: 'product-1',
                      received_quantity: 5,
                      remaining_quantity: 5,
                      unit_cost: 4.99,
                      received_at: '2026-08-26T10:00:00.000Z',
                      catalog_product: {
                        id: 'product-1',
                        title: 'LED-Lampe',
                        is_public_store: false,
                      },
                    },
                  ]
                : [];
            const query = {
              select: () => query,
              eq: () => query,
              order: () => query,
              then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
                Promise.resolve({ data, error: null }).then(resolve),
            };
            return query;
          },
        },
      },
    });

    const result = await service.receivePurchaseLines('purchase-1', [
      { purchaseLineId: 'line-1', receivedQuantity: 5 },
    ]);

    expect(result.error).toBeNull();
    expect(service.positions()[0].available_quantity).toBe(5);
    expect(service.positions()[0].title).toBe('LED-Lampe');
  });

  it('stellt einen Ladefehler für Bestandspositionen bereit', async () => {
    const service = Object.create(StockService.prototype) as StockService;
    Object.assign(service, {
      positions: signal<StockPosition[]>([]),
      lots: signal<StockLot[]>([]),
      movements: signal([]),
      isLoading: signal(false),
      loadError: signal<Error | null>(null),
      loadedWorkspaceId: signal<string | null>(null),
      loadRequestId: 0,
      mockStore: { isDemoMode: signal(false) },
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => {
            const query = {
              select: () => query,
              eq: () => query,
              order: () => query,
              then: (resolve: (value: { data: null; error: Error }) => unknown) =>
                Promise.resolve({ data: null, error: new Error('Nicht erreichbar') }).then(resolve),
            };
            return query;
          },
        },
      },
    });

    await service.loadPositions('workspace-1');

    expect(service.isLoading()).toBe(false);
    expect(service.loadError()?.message).toContain('Nicht erreichbar');
  });

  it('ignoriert eine verspätete Antwort des zuvor aktiven Workspace', async () => {
    interface QueryResult<T> {
      data: T;
      error: Error | null;
    }
    const currentWorkspace = signal({ id: 'workspace-1' });
    const lotResolvers = new Map<string, (result: QueryResult<StockLot[]>) => void>();
    const movementResolvers = new Map<string, (result: QueryResult<StockMovement[]>) => void>();
    const createQuery = <T>(
      workspaceIdRef: { value: string },
      resolvers: Map<string, (result: QueryResult<T[]>) => void>,
    ) => {
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          workspaceIdRef.value = value;
          return query;
        },
        gt: () => query,
        order: () => query,
        then: (
          resolve: (value: QueryResult<T[]>) => unknown,
          reject: (reason: unknown) => unknown,
        ) =>
          new Promise<QueryResult<T[]>>((requestResolve) => {
            resolvers.set(workspaceIdRef.value, requestResolve);
          }).then(resolve, reject),
      };
      return query;
    };
    const service = Object.create(StockService.prototype) as StockService;
    Object.assign(service, {
      positions: signal<StockPosition[]>([]),
      lots: signal<StockLot[]>([]),
      movements: signal<StockMovement[]>([]),
      isLoading: signal(false),
      loadError: signal<Error | null>(null),
      loadedWorkspaceId: signal<string | null>(null),
      loadRequestId: 0,
      mockStore: { isDemoMode: signal(false) },
      workspaceService: { currentWorkspace },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: (table: string) =>
            table === 'stock_lots'
              ? createQuery({ value: '' }, lotResolvers)
              : createQuery({ value: '' }, movementResolvers),
        },
      },
    });
    const firstLoad = service.loadPositions('workspace-1');
    currentWorkspace.set({ id: 'workspace-2' });
    const secondLoad = service.loadPositions('workspace-2');
    await Promise.resolve();
    const currentLot = {
      id: 'lot-current',
      workspace_id: 'workspace-2',
      purchase_id: 'purchase-2',
      purchase_line_id: 'line-2',
      catalog_product_id: 'product-2',
      received_quantity: 3,
      remaining_quantity: 3,
      unit_cost: 2,
      received_at: '2026-08-29T11:00:00.000Z',
      catalog_product: { id: 'product-2', title: 'Aktuell', is_public_store: false },
    };

    lotResolvers.get('workspace-2')?.({ data: [currentLot], error: null });
    movementResolvers.get('workspace-2')?.({ data: [], error: null });
    await secondLoad;
    lotResolvers.get('workspace-1')?.({ data: [], error: null });
    movementResolvers.get('workspace-1')?.({ data: [], error: null });
    await firstLoad;

    expect(service.positions()).toEqual([
      expect.objectContaining({ catalog_product_id: 'product-2', available_quantity: 3 }),
    ]);
    expect(service.loadedWorkspaceId()).toBe('workspace-2');
    expect(service.isLoading()).toBe(false);
  });

  it('lädt die vollständige Bewegungshistorie einschließlich Bewegungen ausverkaufter Lose', async () => {
    const soldLot = {
      id: 'lot-sold',
      workspace_id: 'workspace-1',
      purchase_id: 'purchase-1',
      purchase_line_id: 'line-1',
      catalog_product_id: 'product-1',
      received_quantity: 2,
      remaining_quantity: 0,
      unit_cost: 4.99,
      received_at: '2026-08-26T10:00:00.000Z',
      catalog_product: { id: 'product-1', title: 'LED-Lampe', is_public_store: true },
    };
    const movements: StockMovement[] = [
      {
        id: 'movement-return',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        sale_line_id: 'sale-line-1',
        direction: 'in',
        quantity: 1,
        reason: 'return',
        created_at: '2026-08-29T12:00:00.000Z',
      },
      {
        id: 'movement-sale',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        sale_line_id: 'sale-line-1',
        direction: 'out',
        quantity: 2,
        reason: 'sale',
        created_at: '2026-08-28T12:00:00.000Z',
      },
    ];
    const from = vi.fn((table: string) => {
      const result = table === 'stock_lots' ? [soldLot] : movements;
      const query = {
        select: () => query,
        eq: () => query,
        gt: () => query,
        order: () => query,
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: result, error: null }).then(resolve),
      };
      return query;
    });
    const service = Object.create(StockService.prototype) as StockService;
    Object.assign(service, {
      positions: signal<StockPosition[]>([]),
      lots: signal<StockLot[]>([]),
      movements: signal<StockMovement[]>([]),
      isLoading: signal(false),
      loadError: signal<Error | null>(null),
      loadedWorkspaceId: signal<string | null>(null),
      loadRequestId: 0,
      mockStore: { isDemoMode: signal(false) },
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      syncStatus: new SyncStatusService(),
      supabase: { client: { from } },
    });

    await service.loadPositions('workspace-1');

    expect(from).toHaveBeenCalledWith('stock_movements');
    expect(service.lots()).toEqual([soldLot]);
    expect(service.positions()).toEqual([]);
    expect(service.movements()).toEqual(movements);
  });
});
