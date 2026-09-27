import { Injector, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceApiService } from '../services/marketplace-api.service';
import { marketplaceAccessGuard } from './marketplace-access.guard';
function setup(allowed = true) {
  const currentWorkspace = signal<{ id: string; archived_at?: string } | null>({ id: 'ws-a' });
  const currentUser = signal<{ id: string } | null>({ id: 'user-a' });
  const canManage = vi.fn().mockResolvedValue(allowed);
  const denied = { redirected: true };
  const injector = Injector.create({
    providers: [
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace, ensureLoaded: async () => undefined },
      },
      { provide: AuthService, useValue: { currentUser, sessionReady: Promise.resolve() } },
      { provide: MarketplaceApiService, useValue: { canManage } },
      { provide: Router, useValue: { createUrlTree: () => denied } },
    ],
  });
  return {
    currentWorkspace,
    currentUser,
    canManage,
    denied,
    invoke: () =>
      runInInjectionContext(injector, () => marketplaceAccessGuard({} as never, {} as never)),
  };
}
describe('Marktplatzzugriff', () => {
  it('erlaubt den Einstieg nur nach bestätigter Serverberechtigung', async () => {
    const f = setup();
    expect(await f.invoke()).toBe(true);
    expect(f.canManage).toHaveBeenCalledWith('ws-a');
  });
  it('leitet bei fehlender Berechtigung zurück', async () => {
    const f = setup(false);
    expect(await f.invoke()).toBe(f.denied);
  });
  it('weist Fehler, fehlende Anmeldung und archivierte Workspaces ab', async () => {
    const f = setup();
    f.canManage.mockRejectedValue(new Error('offline'));
    expect(await f.invoke()).toBe(f.denied);
    f.currentUser.set(null);
    f.canManage.mockClear();
    expect(await f.invoke()).toBe(f.denied);
    expect(f.canManage).not.toHaveBeenCalled();
    f.currentUser.set({ id: 'user-a' });
    f.currentWorkspace.set({ id: 'ws-a', archived_at: '2026-09-26' });
    expect(await f.invoke()).toBe(f.denied);
  });
  it('übernimmt keine Berechtigung nach einem Workspacewechsel während der Anfrage', async () => {
    const f = setup();
    f.canManage.mockImplementation(async () => {
      f.currentWorkspace.set({ id: 'ws-b' });
      return true;
    });
    expect(await f.invoke()).toBe(f.denied);
  });
});
