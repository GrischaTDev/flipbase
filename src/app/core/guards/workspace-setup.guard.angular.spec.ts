import { Injector, runInInjectionContext } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { Workspace } from '../models/flipbase.models';
import { AuthService } from '../services/auth.service';
import { WorkspaceService } from '../services/workspace.service';
import { workspaceSetupGuard, workspaceSetupPageGuard } from './workspace-setup.guard';

const incompleteWorkspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Mein Workspace',
  min_roi_percent: 30,
  min_profit_amount: 15,
  setup_completed_at: null,
};

const completedWorkspace: Workspace = {
  ...incompleteWorkspace,
  name: 'Kamera Handel',
  setup_completed_at: '2026-09-20T17:45:00.000Z',
};

function setupGuard(
  workspaces: Workspace[],
  options: {
    authenticated?: boolean;
    ensureLoaded?: () => Promise<void>;
    loadError?: Error | null;
    url?: string;
  } = {},
) {
  const ensureLoaded = vi.fn(options.ensureLoaded ?? (() => Promise.resolve()));
  const createUrlTree = vi.fn((commands: string[], extras?: unknown) => ({ commands, extras }));
  const injector = Injector.create({
    providers: [
      {
        provide: AuthService,
        useValue: {
          sessionReady: Promise.resolve(),
          canAccessApp: () => options.authenticated ?? true,
        },
      },
      {
        provide: WorkspaceService,
        useValue: {
          ensureLoaded,
          workspaces: () => workspaces,
          loadError: () => options.loadError ?? null,
        },
      },
      { provide: Router, useValue: { createUrlTree } },
    ],
  });

  const invoke = (guard: CanActivateFn) =>
    Promise.resolve(
      runInInjectionContext(injector, () =>
        guard({} as never, { url: options.url ?? '/dashboard' } as never),
      ),
    );

  return { invoke, ensureLoaded, createUrlTree };
}

describe('workspace setup guards', () => {
  it('leitet einen unvollständigen Workspace vor geschützten Seiten zur Einrichtung', async () => {
    const { invoke, createUrlTree } = setupGuard([incompleteWorkspace]);

    await expect(invoke(workspaceSetupGuard)).resolves.toEqual({
      commands: ['/onboarding/workspace'],
      extras: undefined,
    });
    expect(createUrlTree).toHaveBeenCalledWith(['/onboarding/workspace']);
  });

  it('lässt einen vollständig eingerichteten Workspace in App und Shop', async () => {
    const { invoke } = setupGuard([completedWorkspace]);

    await expect(invoke(workspaceSetupGuard)).resolves.toBe(true);
  });

  it('öffnet die Einrichtungsseite nur solange die Einrichtung offen ist', async () => {
    await expect(setupGuard([incompleteWorkspace]).invoke(workspaceSetupPageGuard)).resolves.toBe(
      true,
    );
    await expect(setupGuard([completedWorkspace]).invoke(workspaceSetupPageGuard)).resolves.toEqual(
      { commands: ['/dashboard'], extras: undefined },
    );
  });

  it('zeigt die Einrichtungsseite bei Ladefehler oder fehlendem Workspace für den Wiederholungsversuch', async () => {
    await expect(
      setupGuard([], { loadError: new Error('offline') }).invoke(workspaceSetupGuard),
    ).resolves.toEqual({ commands: ['/onboarding/workspace'], extras: undefined });
    await expect(setupGuard([]).invoke(workspaceSetupPageGuard)).resolves.toBe(true);
  });

  it('wartet vor der Entscheidung auf das Laden der Workspaces', async () => {
    let finishLoading!: () => void;
    const loading = new Promise<void>((resolve) => {
      finishLoading = resolve;
    });
    const { invoke, ensureLoaded } = setupGuard([incompleteWorkspace], {
      ensureLoaded: () => loading,
    });
    let settled = false;

    const decision = invoke(workspaceSetupGuard).then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();

    expect(ensureLoaded).toHaveBeenCalledOnce();
    expect(settled).toBe(false);

    finishLoading();
    await expect(decision).resolves.toEqual({
      commands: ['/onboarding/workspace'],
      extras: undefined,
    });
  });

  it('schickt eine abgemeldete Sitzung zur Anmeldung ohne Workspaces zu laden', async () => {
    const { invoke, ensureLoaded, createUrlTree } = setupGuard([incompleteWorkspace], {
      authenticated: false,
      url: '/inventory',
    });

    await expect(invoke(workspaceSetupGuard)).resolves.toEqual({
      commands: ['/auth/login'],
      extras: { queryParams: { redirectTo: '/inventory' } },
    });
    expect(ensureLoaded).not.toHaveBeenCalled();
    expect(createUrlTree).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { redirectTo: '/inventory' },
    });
  });
});
