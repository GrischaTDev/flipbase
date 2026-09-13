import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryService } from '../../../core/services/inventory.service';
import { MockDataStoreService } from '../../../core/services/mock-data-store.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SyncStatusService } from '../../../core/services/sync-status.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { PurchasePackageService } from './purchase-package.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const lineId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const input = [{ title: 'Paar Schuhe', condition: 'used' as const }];
const item = {
  id: 'item-1',
  workspace_id: workspaceId,
  purchase_id: 'purchase-1',
  source_package_line_id: lineId,
  allocated_purchase_cost: null,
  title: 'Paar Schuhe',
  condition: 'used',
  status: 'received',
};
const response = {
  inventory_items: [item],
  purchase_line: {
    id: lineId,
    workspace_id: workspaceId,
    purchase_id: 'purchase-1',
    is_package: true,
  },
};

function setup() {
  const currentWorkspace = signal<{ id: string } | null>({ id: workspaceId });
  const rpc = vi
    .fn<(...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>()
    .mockResolvedValue({ data: response, error: null });
  const loadInventory = vi.fn().mockResolvedValue(undefined);
  const store = new MockDataStoreService();
  const syncStatus = new SyncStatusService();
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { rpc } } },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: InventoryService, useValue: { loadInventory } },
      { provide: MockDataStoreService, useValue: store },
      { provide: SyncStatusService, useValue: syncStatus },
    ],
  });
  const service = runInInjectionContext(injector, () => new PurchasePackageService());
  return { service, rpc, loadInventory, currentWorkspace, store, syncStatus };
}

describe('PurchasePackageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sendet Herkunft und stabile Anfrage-ID ohne Preise an die RPC und lädt das Inventar neu', async () => {
    const { service, rpc, loadInventory } = setup();
    expect(await service.capture(lineId, input, requestId)).toEqual({
      data: [item],
      error: null,
      reportedBySyncStatus: false,
    });
    expect(rpc).toHaveBeenCalledWith('capture_purchase_package_contents', {
      p_workspace_id: workspaceId,
      p_purchase_line_id: lineId,
      p_items: [{ ...input[0], brand: null, model: null, description: null, expected_value: null }],
      p_request_id: requestId,
    });
    expect(loadInventory).toHaveBeenCalledWith(workspaceId);
  });

  it('verhindert die Mutation ohne Workspace', async () => {
    const { service, rpc, currentWorkspace } = setup();
    currentWorkspace.set(null);
    expect(await service.capture(lineId, input, requestId)).toMatchObject({
      data: null,
      error: expect.any(Error),
      reportedBySyncStatus: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('überschreibt nach einem Workspace-Wechsel kein fremdes Inventar', async () => {
    const { service, rpc, currentWorkspace, loadInventory } = setup();
    rpc.mockImplementation(async () => {
      currentWorkspace.set({ id: 'other' });
      return { data: response, error: null };
    });
    expect((await service.capture(lineId, input, requestId)).data).toEqual([item]);
    expect(loadInventory).not.toHaveBeenCalled();
  });

  it('meldet Netzwerkfehler und fehlerhafte Herkunft als fehlgeschlagen', async () => {
    const { service, rpc, loadInventory } = setup();
    rpc.mockRejectedValueOnce(new Error('Verbindung unterbrochen'));
    expect(await service.capture(lineId, input, requestId)).toMatchObject({
      data: null,
      error: expect.any(Error),
    });
    rpc.mockResolvedValueOnce({
      data: { ...response, inventory_items: [{ ...item, source_package_line_id: 'foreign' }] },
      error: null,
    });
    expect(await service.capture(lineId, input, requestId)).toMatchObject({
      data: null,
      error: expect.any(Error),
    });
    expect(loadInventory).not.toHaveBeenCalled();
  });

  it('meldet eine erfolgreiche Speicherung trotz fehlgeschlagenem Nachladen weiterhin als erfolgreich', async () => {
    const { service, loadInventory } = setup();
    loadInventory.mockRejectedValue(new Error('Verbindung unterbrochen'));
    expect(await service.capture(lineId, input, requestId)).toMatchObject({
      data: [item],
      error: null,
    });
  });

  it('erfasst nach Abschluss in der Demo ohne RPC, ohne Kostenverteilung und mit stabiler Wiederholung', async () => {
    const { service, store, rpc, loadInventory } = setup();
    store.isDemoMode.set(true);
    store.savePurchaseWithLines(
      {
        id: 'purchase-1',
        workspace_id: workspaceId,
        title: 'Paket',
        type: 'lot',
        purchase_date: '2026-09-13',
        purchase_price: 100,
        cost_allocation_mode: 'even',
        shipment_status: 'arrived',
        entry_status: 'finalized',
      },
      [
        {
          id: lineId,
          workspace_id: workspaceId,
          purchase_id: 'purchase-1',
          title_snapshot: 'Paket',
          catalog_product_id: null,
          line_kind: 'individual',
          is_package: true,
          ordered_quantity: 1,
          received_quantity: 0,
          line_total: 100,
          unit_purchase_price: 100,
        },
      ],
    );
    const first = await service.capture(lineId, input, requestId);
    expect(first.error).toBeNull();
    expect(first.data?.[0]).toMatchObject({
      status: 'ready',
      allocated_purchase_cost: null,
      source_package_line_id: lineId,
    });
    expect(await service.capture(lineId, input, requestId)).toEqual(first);
    expect(store.getItems()).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(loadInventory).toHaveBeenCalledTimes(2);
  });
});
