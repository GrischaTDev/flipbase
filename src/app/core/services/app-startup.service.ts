import { afterNextRender, inject, Injectable, Injector } from '@angular/core';
import { NavigationError, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class AppStartupService {
  private readonly injector = inject(Injector);
  private hasRendered = false;

  constructor() {
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationError) this.failStartup('navigation');
      });
  }

  markRouteRendered(): void {
    if (this.hasRendered) return;
    afterNextRender(
      () => {
        if (
          typeof document === 'undefined' ||
          !document.querySelector('app-root router-outlet + *')
        )
          return;
        this.hasRendered = true;
        window.dispatchEvent(new Event('flipbase:startup-ready'));
      },
      { injector: this.injector },
    );
  }

  failStartup(reason: 'bootstrap' | 'navigation' | 'asset'): void {
    if (typeof window !== 'undefined' && !this.hasRendered) {
      window.dispatchEvent(new CustomEvent('flipbase:startup-failed', { detail: { reason } }));
    }
  }
}
