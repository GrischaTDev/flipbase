import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // If still loading session from Supabase, wait or check
  if (auth.isLoading()) {
    // Wait briefly for init to resolve
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/auth/login']);
};
