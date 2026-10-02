import { DestroyRef, Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BetaLifecycleClockService {
  readonly now = signal(Date.now());
  constructor() {
    const destroyRef = inject(DestroyRef);
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    destroyRef.onDestroy(() => clearInterval(timer));
  }
}
