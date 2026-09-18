import { Inject, Injectable, InjectionToken } from '@angular/core';
import { VERSION } from '../version';
import { isStaleChunkLoadError } from '../utils/stale-chunk-error';

export const STALE_CHUNK_RELOAD_STORAGE_KEY = 'flipbase:stale-chunk-reload-build';

export interface StaleChunkBrowser {
  readonly storage: Storage;
  readonly reload: () => void;
  readonly buildId: string;
}

export const STALE_CHUNK_BROWSER = new InjectionToken<StaleChunkBrowser>('STALE_CHUNK_BROWSER', {
  providedIn: 'root',
  factory: () => ({
    storage: window.sessionStorage,
    reload: () => window.location.reload(),
    buildId: VERSION.commit || VERSION.nummer,
  }),
});

@Injectable({ providedIn: 'root' })
export class StaleChunkRecoveryService {
  constructor(@Inject(STALE_CHUNK_BROWSER) private readonly browser: StaleChunkBrowser) {}

  tryRecover(error: unknown): boolean {
    if (!isStaleChunkLoadError(error)) return false;

    try {
      if (this.browser.storage.getItem(STALE_CHUNK_RELOAD_STORAGE_KEY) === this.browser.buildId) {
        return false;
      }

      this.browser.storage.setItem(STALE_CHUNK_RELOAD_STORAGE_KEY, this.browser.buildId);
      this.browser.reload();
      return true;
    } catch {
      // Ohne funktionierenden Session-Speicher koennen wir eine Reload-Schleife
      // nicht sicher ausschliessen. Dann bleibt der normale ErrorHandler aktiv.
      return false;
    }
  }
}
