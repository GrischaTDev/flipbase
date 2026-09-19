import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryService } from '../../../core/services/inventory.service';
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
  const syncStatus = new SyncStatusService();
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { rpc } } },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: InventoryService, useValue: { loadInventory } },
      { provide: SyncStatusService, useValue: syncStatus },
    ],
  });
  const service = runInInjectionContext(injector, () => new PurchasePackageService());
  return { service, rpc, loadInventory, currentWorkspace, syncStatus };
}

describe('PurchasePackageService', () => {
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
});
