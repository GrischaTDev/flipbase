import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type {
  ActivityLog,
  InventoryItem,
  InventoryItemSaleState,
  ItemCost,
  Workspace,
} from '../models/flipbase.models';
import { InventoryService } from './inventory.service';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

interface QueryRecord<T> {
  readonly filters: readonly (readonly [string, string])[];
  readonly deferred: Deferred<{ data: T; error: null }>;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const workspaceA: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'A',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
};
const workspaceB: Workspace = { ...workspaceA, id: '22222222-2222-4222-8222-222222222222' };

function item(workspaceId: string, id = 'shared-item'): InventoryItem & { costs: ItemCost[] } {
  return {
    id,
    workspace_id: workspaceId,
    title: `Artikel ${workspaceId}`,
    condition: 'used',
    status: 'ready',
    allocated_purchase_cost: 10,
    costs: [],
  };
}

function saleState(workspaceId: string, itemId = 'shared-item') {
  return {
    inventory_item_id: itemId,
    workspace_id: workspaceId,
    sale_state: 'no_active_sale' as InventoryItemSaleState,
    active_sale_count: 0,
    active_sale_id: null,
  };
}

function erstelleDienst() {
  const currentWorkspace = signal<Workspace | null>(workspaceA);
  const itemRequests: QueryRecord<ReturnType<typeof item>>[] = [];
  const stateRequests: QueryRecord<ReturnType<typeof saleState>[]>[] = [];
  const logRequests: QueryRecord<ActivityLog[]>[] = [];

  const query = <T>(records: QueryRecord<T>[], terminal: 'single' | 'order') => {
    const filters: (readonly [string, string])[] = [];
    const request = deferred<{ data: T; error: null }>();
    const chain = {
      select: () => chain,
      eq: (column: string, value: string) => {
        filters.push([column, value]);
        return chain;
      },
      single: () => {
        if (terminal !== 'single') throw new Error('Unerwartetes single()');
        records.push({ filters, deferred: request });
        return request.promise;
      },
      order: () => {
        if (terminal !== 'order') throw new Error('Unerwartetes order()');
        records.push({ filters, deferred: request });
        return request.promise;
      },
      then: <TResult1 = { data: T; error: null }, TResult2 = never>(
        onfulfilled?:
          ((value: { data: T; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => {
        records.push({ filters, deferred: request });
        return request.promise.then(onfulfilled, onrejected);
      },
    };
    return chain;
  };

  const client = {
    from(table: string) {
      if (table === 'inventory_items') return query(itemRequests, 'single');
      if (table === 'inventory_item_sale_states') return query(stateRequests, 'order');
      if (table === 'activity_logs') return query(logRequests, 'order');
      throw new Error(`Unerwartete Tabelle: ${table}`);
    },
  };
  const selectedItem = signal<InventoryItem | null>(null);
  const itemCosts = signal<ItemCost[]>([]);
  const activityLogs = signal<ActivityLog[]>([]);
  const service = Object.create(InventoryService.prototype) as InventoryService;
  Object.assign(service, {
    supabase: { client },
    workspaceService: { currentWorkspace },
    syncStatus: { melde: vi.fn((_context: string, error: unknown) => error) },
    items: signal<InventoryItem[]>([]),
    selectedItem,
    itemCosts,
    activityLogs,
    isLoading: signal(false),
    loadError: signal<Error | null>(null),
    loadedWorkspaceId: signal<string | null>(workspaceA.id),
    loadRequestId: 0,
    detailLoadRequestId: 0,
  });
  return {
    service,
    currentWorkspace,
    selectedItem,
    itemCosts,
    activityLogs,
    itemRequests,
    stateRequests,
    logRequests,
  };
}

async function resolveSuccessfulDetail(
  setup: ReturnType<typeof erstelleDienst>,
  itemRequestIndex: number,
  loadedItem: ReturnType<typeof item>,
): Promise<void> {
  const stateRequestIndex = setup.stateRequests.length;
  setup.itemRequests[itemRequestIndex].deferred.resolve({ data: loadedItem, error: null });
  await vi.waitFor(() => expect(setup.stateRequests.length).toBeGreaterThan(stateRequestIndex));
  const logRequestIndex = setup.logRequests.length;
  setup.stateRequests[stateRequestIndex].deferred.resolve({
    data: [saleState(loadedItem.workspace_id, loadedItem.id)],
    error: null,
  });
  await vi.waitFor(() => expect(setup.logRequests.length).toBeGreaterThan(logRequestIndex));
  setup.logRequests[logRequestIndex].deferred.resolve({ data: [], error: null });
}

describe('InventoryService – workspacegebundene Detailabfragen', () => {
  it('filtert Artikel, Verkaufszustand und Aktivitäten auf den Start-Workspace', async () => {
    const setup = erstelleDienst();
    const load = setup.service.getItemById('shared-item');
    await resolveSuccessfulDetail(setup, 0, item(workspaceA.id));
    await load;

    expect(setup.itemRequests[0].filters).toEqual([
      ['workspace_id', workspaceA.id],
      ['id', 'shared-item'],
    ]);
    expect(setup.stateRequests[0].filters).toEqual([
      ['workspace_id', workspaceA.id],
      ['inventory_item_id', 'shared-item'],
    ]);
    expect(setup.logRequests[0].filters).toEqual([
      ['workspace_id', workspaceA.id],
      ['inventory_item_id', 'shared-item'],
    ]);
  });

  it('verwirft eine bekannte Artikel-ID aus einem anderen Workspace', async () => {
    const setup = erstelleDienst();
    const load = setup.service.getItemById('shared-item');
    setup.itemRequests[0].deferred.resolve({ data: item(workspaceB.id), error: null });

    await expect(load).resolves.toBeNull();
    expect(setup.selectedItem()).toBeNull();
    expect(setup.itemCosts()).toEqual([]);
    expect(setup.activityLogs()).toEqual([]);
  });

  it('lässt eine verspätete A-Antwort den bereits geladenen B-Artikel nicht überschreiben', async () => {
    const setup = erstelleDienst();
    const loadA = setup.service.getItemById('shared-item');
    setup.currentWorkspace.set(workspaceB);
    const loadB = setup.service.getItemById('shared-item');

    await resolveSuccessfulDetail(setup, 1, item(workspaceB.id));
    await expect(loadB).resolves.toMatchObject({ workspace_id: workspaceB.id });

    setup.itemRequests[0].deferred.resolve({ data: item(workspaceA.id), error: null });
    await Promise.resolve();

    await expect(loadA).resolves.toBeNull();
    expect(setup.selectedItem()).toMatchObject({ workspace_id: workspaceB.id });
    expect(setup.stateRequests).toHaveLength(1);
    expect(setup.logRequests).toHaveLength(1);
  });
});
