import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Workspace } from '../models/flipbase.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const archived: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Archiv',
  min_roi_percent: 30,
  min_profit_amount: 15,
  archived_at: '2026-10-01T12:00:00Z',
};
const firstActive: Workspace = { ...archived, id: 'first-active', archived_at: null };
const selectedActive: Workspace = { ...archived, id: 'selected-active', archived_at: null };
const workspaces = [archived, firstActive, selectedActive];

function setup() {
  const order = vi.fn().mockResolvedValue({ data: workspaces, error: null });
  const injector = Injector.create({
    providers: [
      {
        provide: SupabaseService,
        useValue: { client: { from: () => ({ select: () => ({ order }) }) } },
      },
      {
        provide: AuthService,
        useValue: { isAuthenticated: () => true, currentUser: signal({ id: 'user-a' }) },
      },
      { provide: SyncStatusService, useValue: new SyncStatusService() },
    ],
  });
  return runInInjectionContext(injector, () => new WorkspaceService());
}

describe('Gespeicherter Arbeitsbereich beim App-Start', () => {
  it('wechselt von einer gespeicherten Archivansicht zum ersten aktiven Workspace', async () => {
    localStorage.setItem('flipbase_active_workspace_id', archived.id);
    const service = setup();

    await service.ensureLoaded();

    expect(service.currentWorkspace()).toEqual(firstActive);
    expect(localStorage.getItem('flipbase_active_workspace_id')).toBe(firstActive.id);
    expect(service.workspaces()).toEqual(workspaces);
  });

  it('behält einen gespeicherten aktiven Workspace und lässt Archivdaten in der Liste', async () => {
    localStorage.setItem('flipbase_active_workspace_id', selectedActive.id);
    const service = setup();

    await service.ensureLoaded();

    expect(service.currentWorkspace()).toEqual(selectedActive);
    expect(service.workspaces()).toEqual(workspaces);
  });
});
