import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryItem } from '../../../core/models/flipbase.models';
import { InventoryService } from '../../../core/services/inventory.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { MockDataStoreService } from '../../../core/services/mock-data-store.service';
import { InventoryArchiveService, isArchivedInventoryItem } from './inventory-archive.service';

describe('InventoryArchiveService', () => {
  const item: InventoryItem = {
    id: 'i',
    workspace_id: 'w',
    title: 'Artikel',
    status: 'sold',
    sale_state: 'sold',
    active_sale_count: 1,
    active_sale_id: 's',
    condition: 'used',
    allocated_purchase_cost: 12,
  };
  const workspace = signal({ id: 'w' });
  const rpc = vi.fn();
  const items = signal<InventoryItem[]>([]);
  const selectedItem = signal<InventoryItem | null>(null);
  const applyArchiveMetadata = vi.fn();
  beforeEach(() => {
    workspace.set({ id: 'w' });
    items.set([{ ...item }]);
    selectedItem.set({ ...item });
    rpc.mockReset().mockResolvedValue({
      data: { ...item, archived_at: '2026-09-05T12:00:00Z', archived_by: 'a' },
      error: null,
    });
    applyArchiveMetadata.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        {
          provide: AuthService,
          useValue: { isDemoMode: signal(false), currentUser: signal({ id: 'a' }) },
        },
        { provide: SupabaseService, useValue: { client: { rpc } } },
        { provide: InventoryService, useValue: { items, selectedItem, applyArchiveMetadata } },
        { provide: MockDataStoreService, useValue: {} },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('only applies server archive metadata after a successful scoped RPC', async () => {
    await TestBed.inject(InventoryArchiveService).setArchived('w', 'i', true);
    expect(rpc).toHaveBeenCalledWith('set_inventory_item_archived', {
      p_workspace_id: 'w',
      p_item_id: 'i',
      p_archived: true,
    });
    expect(applyArchiveMetadata).toHaveBeenCalledWith('w', 'i', {
      archived_at: '2026-09-05T12:00:00Z',
      archived_by: 'a',
    });
  });
  it('blocks duplicate actions and rejects stale workspace responses', async () => {
    let finish!: (value: unknown) => void;
    rpc.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const service = TestBed.inject(InventoryArchiveService);
    const pending = service.setArchived('w', 'i', true);
    await expect(service.setArchived('w', 'i', true)).rejects.toThrow();
    workspace.set({ id: 'other' });
    finish({ data: { ...item, archived_at: 'date', archived_by: 'a' }, error: null });
    await expect(pending).rejects.toThrow();
    expect(applyArchiveMetadata).not.toHaveBeenCalled();
    expect(service.pendingIds().size).toBe(0);
  });
  it('does not show a failed archive as successful', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'gesperrt' } });
    await expect(
      TestBed.inject(InventoryArchiveService).setArchived('w', 'i', true),
    ).rejects.toThrow('gesperrt');
    expect(applyArchiveMetadata).not.toHaveBeenCalled();
  });
  it('keeps returned stock active despite old archive metadata and keeps sold items without explicit archive active', () => {
    expect(isArchivedInventoryItem({ ...item, archived_at: 'date' })).toBe(true);
    expect(isArchivedInventoryItem(item)).toBe(false);
    expect(
      isArchivedInventoryItem({
        ...item,
        archived_at: 'date',
        status: 'ready',
        sale_state: 'no_active_sale',
      }),
    ).toBe(false);
    expect(
      isArchivedInventoryItem({ ...item, status: 'archived', sale_state: 'no_active_sale' }),
    ).toBe(true);
  });
});
