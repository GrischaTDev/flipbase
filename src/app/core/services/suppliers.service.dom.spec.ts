import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { SuppliersService } from './suppliers.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

describe('SuppliersService', () => {
  it('speichert einen Lieferanten ohne Browser-Ersatzdatenbank über Supabase', async () => {
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: { id: 'supplier-1' }, error: null }) }),
    }));
    const service = runInInjectionContext(
      Injector.create({
        providers: [
          { provide: SupabaseService, useValue: { client: { from: () => ({ insert }) } } },
          { provide: SyncStatusService, useValue: new SyncStatusService() },
          {
            provide: WorkspaceService,
            useValue: { currentWorkspace: signal({ id: 'workspace-1' }) },
          },
        ],
      }),
      () => new SuppliersService(),
    );

    const result = await service.createSupplier('Flohmarkt Berlin');

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      id: 'supplier-1',
      workspace_id: 'workspace-1',
      name: 'Flohmarkt Berlin',
      is_active: true,
    });
    expect(insert).toHaveBeenCalledOnce();
  });
});
