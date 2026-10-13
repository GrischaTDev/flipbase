import { Injector, runInInjectionContext, signal } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceAccessService } from '../services/workspace-access.service';
import { WorkspaceService } from '../services/workspace.service';
import { workspaceAccessGuard } from './workspace-access.guard';
import { AuthService } from '../services/auth.service';
import { AppStartupService } from '../services/app-startup.service';
import { ToastService } from '../../shared/components/toast/toast.service';

describe('Workspace-Zugangsgrenze', () => {
  function setup(
    statuses: readonly { workspace_id: string; access_status: string }[],
    failure = false,
    authenticated = true,
  ) {
    const current = signal({ id: 'expired', name: 'Alt' });
    const rows = [
      { id: 'expired', name: 'Alt' },
      { id: 'valid', name: 'Nutzbar' },
    ];
    const select = vi.fn();
    const failStartup = vi.fn();
    const connectionError = vi.fn();
    const refresh = vi.fn(() =>
      failure ? Promise.reject(new Error('Netzfehler')) : Promise.resolve(statuses),
    );
    const injector = Injector.create({
      providers: [
        {
          provide: AuthService,
          useValue: { sessionReady: Promise.resolve(), canAccessApp: () => authenticated },
        },
        { provide: AppStartupService, useValue: { failStartup } },
        { provide: ToastService, useValue: { toasts: () => [], error: connectionError } },
        {
          provide: WorkspaceAccessService,
          useValue: {
            refresh,
            select,
          },
        },
        {
          provide: WorkspaceService,
          useValue: {
            ensureLoaded: () => Promise.resolve(),
            loadError: () => null,
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
      failStartup,
      connectionError,
      refresh,
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
    const test = setup([], true);
    expect(await test.run()).toBe(false);
    expect(test.failStartup).toHaveBeenCalledWith('navigation');
    expect(test.connectionError).toHaveBeenCalledOnce();
    expect(test.select).not.toHaveBeenCalled();
  });
  it('prüft ohne gültige Anmeldung keine Workspaces und zeigt keinen Verbindungsfehler', async () => {
    const test = setup([], true, false);
    expect(await test.run()).toEqual(['/auth/login']);
    expect(test.refresh).not.toHaveBeenCalled();
    expect(test.failStartup).not.toHaveBeenCalled();
    expect(test.connectionError).not.toHaveBeenCalled();
  });
});
