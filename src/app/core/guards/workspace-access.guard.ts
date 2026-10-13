import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { WorkspaceAccessService } from '../services/workspace-access.service';
import { WorkspaceService } from '../services/workspace.service';
import { AuthService } from '../services/auth.service';
import { AppStartupService } from '../services/app-startup.service';
import { ToastService } from '../../shared/components/toast/toast.service';

export const workspaceAccessGuard: CanActivateFn = async (_route, state) => {
  const access = inject(WorkspaceAccessService);
  const workspace = inject(WorkspaceService);
  const router = inject(Router);
  const auth = inject(AuthService);
  const startup = inject(AppStartupService, { optional: true });
  const toast = inject(ToastService, { optional: true });
  try {
    // Angular startet Guards derselben Route parallel. Die Sitzung muss auch hier bereit sein.
    await auth.sessionReady;
    if (!auth.canAccessApp())
      return router.createUrlTree(['/auth/login'], {
        queryParams: state.url && state.url !== '/' ? { redirectTo: state.url } : {},
      });
    const rows = await access.refresh();
    await workspace.ensureLoaded();
    const loadError = workspace.loadError();
    if (loadError) throw loadError;
    const current = workspace.currentWorkspace();
    const allowed = rows.filter((row) => row.access_status === 'active');
    const selected = allowed.find((row) => row.workspace_id === current?.id) ?? allowed[0];
    const target = workspace.workspaces().find((item) => item.id === selected?.workspace_id);
    if (!target) return router.createUrlTree(['/beta-ended']);
    workspace.setCurrentWorkspace(target);
    access.select(target.id);
    return true;
  } catch {
    startup?.failStartup('navigation');
    if (!toast?.toasts().some((message) => message.title === 'Verbindung fehlgeschlagen'))
      toast?.error(
        'Verbindung fehlgeschlagen',
        'Dein Zugang konnte gerade nicht geprüft werden. Bitte versuche es erneut.',
      );
    return false;
  }
};
