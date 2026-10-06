import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Eine gemeinsame Uhr aktualisiert auch offen gebliebene Favoriten nach Mitternacht. */
@Injectable({ providedIn: 'root' })
export class FeedClockService {
  private readonly document = inject(DOCUMENT);
  readonly now = signal(new Date());
  constructor() {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => this.now.set(new Date());
    const tick = () => {
      update();
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    tick();
    this.document.addEventListener('visibilitychange', update);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer);
      this.document.removeEventListener('visibilitychange', update);
    });
  }
}
