import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlatformOperatorService } from '../services/platform-operator.service';

/**
 * Haelt Nichtbetreiber von /admin fern.
 *
 * Das ist Bedienbarkeit, keine Sicherheit: Die Befugnis liegt in den
 * RLS-Regeln. Ohne sie saehe ein Nichtbetreiber hier nur leere Listen.
 */
export const operatorGuard: CanActivateFn = async () => {
  const router = inject(Router);
  return (
    (await inject(PlatformOperatorService).isOperator()) || router.createUrlTree(['/dashboard'])
  );
};
