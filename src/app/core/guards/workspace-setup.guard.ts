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

async function resolveWorkspaceSetup(
  setupPage: boolean,
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<boolean | UrlTree> {
  const auth = inject(AuthService);
  const workspaceService = inject(WorkspaceService);
  const router = inject(Router);

  await auth.sessionReady;

  if (!auth.canAccessApp()) {
    return router.createUrlTree(['/auth/login'], {
      queryParams: state.url && state.url !== '/' ? { redirectTo: state.url } : {},
    });
  }

  await workspaceService.ensureLoaded();

  const workspaces = workspaceService.workspaces();
  const setupRequired = workspaces.some((workspace) => workspace.setup_completed_at === null);
  const setupUnavailable = workspaceService.loadError() !== null || workspaces.length === 0;

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
