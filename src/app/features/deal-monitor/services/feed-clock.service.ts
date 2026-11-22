import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Eine gemeinsame Uhr hält sichtbare Feed-Karten und Favoriten aktuell. */
@Injectable({ providedIn: 'root' })
export class FeedClockService {
  private readonly document = inject(DOCUMENT);
  readonly now = signal(new Date());
  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = new Date();
      this.now.set(now);
      if (!this.document.hidden) {
        timer = setTimeout(tick, 1_000 - (now.getTime() % 1_000));
      }
    };
    const updateVisibility = () => {
      clearTimeout(timer);
      tick();
    };
    tick();
    this.document.addEventListener('visibilitychange', updateVisibility);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer);
      this.document.removeEventListener('visibilitychange', updateVisibility);
    });
  }
}
