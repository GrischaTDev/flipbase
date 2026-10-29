import { Injectable, InjectionToken, inject } from '@angular/core';
import { VERSION } from '../version';
import { isStaleChunkLoadError } from '../utils/stale-chunk-error';

export const STALE_CHUNK_RELOAD_STORAGE_KEY = 'flipbase:stale-chunk-reload-build';

export interface StaleChunkBrowser {
  readonly storage: Storage;
  readonly reload: (url?: string) => void;
  readonly buildId: string;
}

export function reloadStaleChunkBrowser(
  url?: string,
  browser: {
    location: Pick<Location, 'href' | 'origin' | 'reload'>;
    history: Pick<History, 'state' | 'replaceState'>;
  } = window,
): void {
  if (url) {
    try {
      const target = new URL(url, browser.location.href);
      if (
        target.origin === browser.location.origin &&
        (target.protocol === 'http:' || target.protocol === 'https:')
      ) {
        browser.history.replaceState(browser.history.state, '', target.href);
      }
    } catch {
      // Bei ungueltigem Ziel oder blockierter History bleibt der bisherige Reload aktiv.
    }
  }
  browser.location.reload();
}

export const STALE_CHUNK_BROWSER = new InjectionToken<StaleChunkBrowser>('STALE_CHUNK_BROWSER', {
  providedIn: 'root',
  factory: () => ({
    storage: window.sessionStorage,
    reload: (url) => reloadStaleChunkBrowser(url),
    buildId: VERSION.commit || VERSION.nummer,
  }),
});

@Injectable({ providedIn: 'root' })
export class StaleChunkRecoveryService {
  private readonly browser = inject(STALE_CHUNK_BROWSER);
  private navigationError: { error: unknown; url: string } | undefined;

  rememberNavigationError(error: unknown, url: string): void {
    this.navigationError = { error, url };
  }

  tryRecover(error: unknown): boolean {
    const navigationError = this.navigationError;
    this.navigationError = undefined;
    if (!isStaleChunkLoadError(error)) return false;

    try {
      if (this.browser.storage.getItem(STALE_CHUNK_RELOAD_STORAGE_KEY) === this.browser.buildId) {
        return false;
      }

      this.browser.storage.setItem(STALE_CHUNK_RELOAD_STORAGE_KEY, this.browser.buildId);
      if (navigationError && navigationError.error === error) {
        this.browser.reload(navigationError.url);
      } else {
        this.browser.reload();
      }
      return true;
    } catch {
      // Ohne funktionierenden Session-Speicher koennen wir eine Reload-Schleife
      // nicht sicher ausschliessen. Dann bleibt der normale ErrorHandler aktiv.
      return false;
    }
  }
}
