import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Source } from '../models/flipbase.models';
import { SupabaseService } from './supabase.service';
import { SourcesService } from './sources.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

describe('SourcesService', () => {
  it('speichert eine Quelle ohne Browser-Ersatzdatenbank über Supabase', async () => {
    const storedSource: Source = {
      id: 'source-1',
      workspace_id: 'workspace-1',
      name: 'Vinted',
      is_default: false,
      is_active: true,
      type: 'online_marketplace',
    };
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: storedSource, error: null }) }),
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
      () => new SourcesService(),
    );

    const result = await service.createSource('Vinted');

    expect(result).toEqual({ data: storedSource, error: null });
    expect(insert).toHaveBeenCalledWith({
      workspace_id: 'workspace-1',
      name: 'Vinted',
      is_default: false,
      is_active: true,
      type: 'online_marketplace',
    });
  });
});
