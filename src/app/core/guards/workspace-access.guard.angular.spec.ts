import { Injector, runInInjectionContext, signal } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceAccessService } from '../services/workspace-access.service';
import { WorkspaceService } from '../services/workspace.service';
import { workspaceAccessGuard } from './workspace-access.guard';
import { AuthService } from '../services/auth.service';

describe('Workspace-Zugangsgrenze', () => {
  function setup(
    statuses: readonly { workspace_id: string; access_status: string }[],
    failure = false,
  ) {
    const current = signal({ id: 'expired', name: 'Alt' });
    const rows = [
      { id: 'expired', name: 'Alt' },
      { id: 'valid', name: 'Nutzbar' },
    ];
    const select = vi.fn();
    const injector = Injector.create({
      providers: [
        { provide: AuthService, useValue: { sessionReady: Promise.resolve() } },
        {
          provide: WorkspaceAccessService,
          useValue: {
            refresh: () =>
              failure ? Promise.reject(new Error('Netzfehler')) : Promise.resolve(statuses),
            select,
          },
        },
        {
          provide: WorkspaceService,
          useValue: {
            ensureLoaded: () => Promise.resolve(),
            currentWorkspace: current,
            workspaces: () => rows,
            setCurrentWorkspace: current.set,
          },
        },
        { provide: Router, useValue: { createUrlTree: (commands: string[]) => commands } },
      ],
    });
    return {
      current,
      select,
      run: () =>
        runInInjectionContext(injector, () =>
          workspaceAccessGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
        ),
    };
  }

  it('wechselt aus einem abgelaufenen gespeicherten Workspace in einen weiteren nutzbaren', async () => {
    const test = setup([
      { workspace_id: 'expired', access_status: 'expired' },
      { workspace_id: 'valid', access_status: 'active' },
    ]);
    expect(await test.run()).toBe(true);
    expect(test.current().id).toBe('valid');
    expect(test.select).toHaveBeenCalledWith('valid');
  });

  it('zeigt ohne aktiven Workspace die Dankesseite', async () => {
    expect(await setup([{ workspace_id: 'expired', access_status: 'ended' }]).run()).toEqual([
      '/beta-ended',
    ]);
  });

  it('öffnet bei fehlgeschlagener Serverprüfung keine Geschäftsdaten', async () => {
    expect(await setup([], true).run()).toEqual(['/beta-ended']);
  });
});
