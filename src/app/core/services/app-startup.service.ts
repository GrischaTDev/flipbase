import { afterNextRender, inject, Injectable, Injector } from '@angular/core';
import { NavigationError, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StaleChunkRecoveryService } from './stale-chunk-recovery.service';

@Injectable({ providedIn: 'root' })
export class AppStartupService {
  private readonly injector = inject(Injector);
  private readonly staleChunkRecovery = inject(StaleChunkRecoveryService);
  private hasRendered = false;

  constructor() {
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationError) {
          this.staleChunkRecovery.rememberNavigationError(event.error, event.url);
          this.failStartup('navigation');
        }
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
