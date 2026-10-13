import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OfflinePurchaseDraftStore } from '../services/offline-purchase-draft.store';

export const offlinePurchaseContextGuard: CanActivateFn = async () => {
  const store = inject(OfflinePurchaseDraftStore);
  const router = inject(Router);
  try {
    await store.activeContext();
    return true;
  } catch {
    return router.createUrlTree(['/offline']);
  }
};
