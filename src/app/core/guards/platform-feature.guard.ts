import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { PlatformFeatureKey } from '../models/platform-feature.model';
import { PlatformFeatureSwitchService } from '../services/platform-feature-switch.service';

/**
 * Führt bei einem vom Betreiber abgeschalteten Bereich auf die Wartungsseite.
 *
 * Bedienbarkeit, keine Sicherheit: Die Server-Dienste nehmen für einen
 * abgeschalteten Bereich selbst keine neuen Aufträge an.
 */
export function platformFeatureGuard(key: PlatformFeatureKey): CanActivateFn {
  return async () => {
    // inject() nur vor dem ersten await; danach fehlt der Injektionskontext.
    const switches = inject(PlatformFeatureSwitchService);
    const router = inject(Router);
    return (await switches.isEnabled(key)) || router.createUrlTree(['/maintenance', key]);
  };
}
