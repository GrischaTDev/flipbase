import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PlatformOperatorService } from '../../../core/services/platform-operator.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceApiService } from '../services/marketplace-api.service';

/** Die sichtbare Route ersetzt nicht die serverseitige Berechtigungsprüfung. */
export const marketplaceAccessGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const operator = inject(PlatformOperatorService);
  const workspace = inject(WorkspaceService);
  const api = inject(MarketplaceApiService);
  const router = inject(Router);
  const denied = () => router.createUrlTree(['/dashboard']);
  try {
    await auth.sessionReady;
    await workspace.ensureLoaded();
    const userId = auth.currentUser()?.id;
    const current = workspace.currentWorkspace();
    if (!userId || !current || current.archived_at) return denied();
    if (!(await operator.isOperator())) return denied();
    const allowed = await api.canManage(current.id);
    return allowed &&
      auth.currentUser()?.id === userId &&
      workspace.currentWorkspace()?.id === current.id &&
      !workspace.currentWorkspace()?.archived_at
      ? true
      : denied();
  } catch {
    return denied();
  }
};
