import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { NavigationCancel, NavigationError, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import { AppStartupService } from './app-startup.service';
import {
  STALE_CHUNK_BROWSER,
  STALE_CHUNK_RELOAD_STORAGE_KEY,
  StaleChunkRecoveryService,
} from './stale-chunk-recovery.service';

it('reports actual navigation errors, ignores cancellations and removes its router listener on destruction', () => {
  const events = new Subject<unknown>();
  const reload = vi.fn();
  window.sessionStorage.clear();
  const injector = Injector.create({
    providers: [
      { provide: Router, useValue: { events } },
      StaleChunkRecoveryService,
      {
        provide: STALE_CHUNK_BROWSER,
        useValue: { storage: window.sessionStorage, reload, buildId: 'build-a' },
      },
    ],
  });
  const dispatch = vi.spyOn(window, 'dispatchEvent');
  let destroyed = false;
  try {
    const service = runInInjectionContext(injector, () => new AppStartupService());
    const recovery = injector.get(StaleChunkRecoveryService);
    const error = new TypeError('Failed to fetch dynamically imported module: /chunk-old.js');
    const url = '/settings/notifications?view=push#permission';

    events.next(new NavigationCancel(1, '/', 'redirect'));
    expect(dispatch).not.toHaveBeenCalled();
    events.next(new NavigationError(2, url, error));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'flipbase:startup-failed',
        detail: { reason: 'navigation' },
      }),
    );
    expect(recovery.tryRecover(error)).toBe(true);
    expect(reload).toHaveBeenCalledExactlyOnceWith(url);
    expect(window.sessionStorage.getItem(STALE_CHUNK_RELOAD_STORAGE_KEY)).toBe('build-a');

    service.failStartup('bootstrap');
    expect(dispatch).toHaveBeenCalledTimes(2);
    injector.destroy();
    destroyed = true;
    const laterError = new TypeError('Failed to fetch dynamically imported module: /chunk-next.js');
    events.next(new NavigationError(3, '/settings/company', laterError));
    expect(dispatch).toHaveBeenCalledTimes(2);
    window.sessionStorage.removeItem(STALE_CHUNK_RELOAD_STORAGE_KEY);
    expect(recovery.tryRecover(laterError)).toBe(true);
    expect(reload).toHaveBeenLastCalledWith();
  } finally {
    if (!destroyed) injector.destroy();
    window.sessionStorage.clear();
    dispatch.mockRestore();
  }
});
