import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STALE_CHUNK_BROWSER,
  STALE_CHUNK_RELOAD_STORAGE_KEY,
  StaleChunkRecoveryService,
} from './stale-chunk-recovery.service';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('StaleChunkRecoveryService', () => {
  const buildId = 'build-a';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createService(storage = memoryStorage()) {
    const reload = vi.fn();
    const injector = Injector.create({
      providers: [
        StaleChunkRecoveryService,
        {
          provide: STALE_CHUNK_BROWSER,
          useValue: {
            storage,
            reload,
            buildId,
          },
        },
      ],
    });
    const service = runInInjectionContext(injector, () => injector.get(StaleChunkRecoveryService));
    return { service, reload, storage };
  }

  it('laedt bei einem dynamischen Importfehler genau einmal pro Build neu', () => {
    const { service, reload, storage } = createService();
    const error = new TypeError(
      'Failed to fetch dynamically imported module: https://app.flipbase.de/chunk-old.js',
    );

    expect(service.tryRecover(error)).toBe(true);
    expect(storage.getItem(STALE_CHUNK_RELOAD_STORAGE_KEY)).toBe(buildId);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(service.tryRecover(error)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('erlaubt bei einer anderen Build-Version wieder einen einmaligen Reload', () => {
    const storage = memoryStorage({ [STALE_CHUNK_RELOAD_STORAGE_KEY]: 'build-old' });
    const { service, reload } = createService(storage);

    expect(
      service.tryRecover(
        new TypeError(
          'Failed to fetch dynamically imported module: https://app.flipbase.de/chunk-old.js',
        ),
      ),
    ).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('laedt bei einem normalen Laufzeitfehler nicht neu', () => {
    const { service, reload } = createService();

    expect(service.tryRecover(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('verzichtet auf Auto-Reload, wenn der Session-Speicher nicht nutzbar ist', () => {
    const storage = memoryStorage();
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const { service, reload } = createService(storage);

    expect(
      service.tryRecover(
        new TypeError(
          'Failed to fetch dynamically imported module: https://app.flipbase.de/chunk-old.js',
        ),
      ),
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
