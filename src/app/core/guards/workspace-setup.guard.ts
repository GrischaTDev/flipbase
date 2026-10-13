import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { WorkspaceService } from '../services/workspace.service';
import { WorkspaceAccessService } from '../services/workspace-access.service';
import { AppStartupService } from '../services/app-startup.service';
import { ToastService } from '../../shared/components/toast/toast.service';

async function resolveWorkspaceSetup(
  setupPage: boolean,
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<boolean | UrlTree> {
  const auth = inject(AuthService);
  const workspaceService = inject(WorkspaceService);
  const router = inject(Router);
  const access = inject(WorkspaceAccessService, { optional: true });
  const startup = inject(AppStartupService, { optional: true });
  const toast = inject(ToastService, { optional: true });

  await auth.sessionReady;

  if (!auth.canAccessApp()) {
    return router.createUrlTree(['/auth/login'], {
      queryParams: state.url && state.url !== '/' ? { redirectTo: state.url } : {},
    });
  }

  let workspaces;
  try {
    await workspaceService.ensureLoaded();
    const loadError = workspaceService.loadError();
    if (loadError) throw loadError;
    workspaces = workspaceService.workspaces();
    if (access) {
      const rows = await access.refresh();
      workspaces = workspaces.filter((workspace) =>
        rows.some((row) => row.workspace_id === workspace.id && row.access_status === 'active'),
      );
    }
  } catch {
    startup?.failStartup('navigation');
    if (!toast?.toasts().some((message) => message.title === 'Verbindung fehlgeschlagen'))
      toast?.error(
        'Verbindung fehlgeschlagen',
        'Dein Zugang konnte gerade nicht geprüft werden. Bitte versuche es erneut.',
      );
    return false;
  }
  if (access) {
    if (workspaces.length === 0) return router.createUrlTree(['/beta-ended']);
  }
  const setupRequired = workspaces.some((workspace) => workspace.setup_completed_at === null);
  const setupUnavailable = workspaces.length === 0;

  if (setupPage) {
    const reviewingCompletedWorkspace =
      route.queryParamMap.get('review') === '1' &&
      workspaces.some((workspace) => workspace.setup_completed_at !== null);
    return setupRequired || setupUnavailable || reviewingCompletedWorkspace
      ? true
      : router.createUrlTree(['/dashboard']);
  }

  return setupRequired || setupUnavailable ? router.createUrlTree(['/onboarding/workspace']) : true;
}

/** Hält unvollständige Workspaces aus App und Shop heraus. */
export const workspaceSetupGuard: CanActivateFn = (route, state) =>
  resolveWorkspaceSetup(false, route, state);

/** Verhindert eine Rückkehr zur Ersteinrichtung nach erfolgreichem Abschluss. */
export const workspaceSetupPageGuard: CanActivateFn = (route, state) =>
  resolveWorkspaceSetup(true, route, state);
