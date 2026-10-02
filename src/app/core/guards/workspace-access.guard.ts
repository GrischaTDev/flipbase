import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { WorkspaceAccessService } from '../services/workspace-access.service';
import { WorkspaceService } from '../services/workspace.service';
import { AuthService } from '../services/auth.service';

export const workspaceAccessGuard: CanActivateFn = async () => {
  const access = inject(WorkspaceAccessService);
  const workspace = inject(WorkspaceService);
  const router = inject(Router);
  const auth = inject(AuthService);
  try {
    // Angular startet Guards derselben Route parallel. Die Sitzung muss auch hier bereit sein.
    await auth.sessionReady;
    const rows = await access.refresh();
    await workspace.ensureLoaded();
    const current = workspace.currentWorkspace();
    const allowed = rows.filter((row) => row.access_status === 'active');
    const selected = allowed.find((row) => row.workspace_id === current?.id) ?? allowed[0];
    const target = workspace.workspaces().find((item) => item.id === selected?.workspace_id);
    if (!target) return router.createUrlTree(['/beta-ended']);
    workspace.setCurrentWorkspace(target);
    access.select(target.id);
    return true;
  } catch {
    return router.createUrlTree(['/beta-ended']);
  }
};
