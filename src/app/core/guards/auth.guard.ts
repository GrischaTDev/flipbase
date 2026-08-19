import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Schützt alle Bereiche der Verwaltungs-App.
 *
 * Wartet die Wiederherstellung der gespeicherten Sitzung ab, statt eine feste
 * Zeitspanne zu raten. Erst danach wird entschieden – sonst würde ein
 * angemeldeter Nutzer beim Neuladen der Seite auf die Anmeldung geworfen.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.sessionReady;

  if (auth.canAccessApp()) {
    return true;
  }

  // Zielseite merken, damit nach der Anmeldung dorthin weitergeleitet wird.
  return router.createUrlTree(['/auth/login'], {
    queryParams: state.url && state.url !== '/' ? { redirectTo: state.url } : {},
  });
};

/**
 * Hält bereits angemeldete Nutzer von Anmeldung und Registrierung fern.
 */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.sessionReady;

  return auth.canAccessApp() ? router.createUrlTree(['/dashboard']) : true;
};
