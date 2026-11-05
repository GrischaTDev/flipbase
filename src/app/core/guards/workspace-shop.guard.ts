import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { WorkspaceShopService } from '../services/workspace-shop.service';
import { WorkspaceService } from '../services/workspace.service';

export const workspaceShopGuard: CanActivateFn = async () => {
  const workspace = inject(WorkspaceService);
  const shop = inject(WorkspaceShopService);
  const router = inject(Router);
  await workspace.ensureLoaded();
  await shop.refresh();
  return (!shop.error() && shop.active()) || router.createUrlTree(['/purchases']);
};
