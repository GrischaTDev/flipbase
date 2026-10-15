import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Eine gemeinsame Uhr für sämtliche sichtbaren Inserat-Badges. */
@Injectable({ providedIn: 'root' })
export class VintedListingClockService {
  readonly now = signal(Date.now());
  constructor() {
    const refresh = () => this.now.set(Date.now());
    const interval = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    });
  }
}
