import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reloadStaleChunkBrowser,
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

  it('verwendet das zugeordnete Navigationsziel weiterhin hoechstens einmal pro Build', () => {
    const { service, reload, storage } = createService();
    const error = new TypeError('Failed to fetch dynamically imported module: /chunk-old.js');
    const url = '/settings/notifications?view=push#permission';
    service.rememberNavigationError(error, url);

    expect(service.tryRecover(error)).toBe(true);
    expect(reload).toHaveBeenCalledExactlyOnceWith(url);
    expect(storage.getItem(STALE_CHUNK_RELOAD_STORAGE_KEY)).toBe(buildId);

    service.rememberNavigationError(error, url);
    expect(service.tryRecover(error)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('uebernimmt das Ziel nicht fuer ein anderes Fehlerobjekt mit derselben Meldung', () => {
    const { service, reload } = createService();
    const message = 'Failed to fetch dynamically imported module: /chunk-old.js';
    service.rememberNavigationError(new TypeError(message), '/settings/notifications');

    expect(service.tryRecover(new TypeError(message))).toBe(true);
    expect(reload).toHaveBeenCalledExactlyOnceWith();
  });

  it('verwirft den Navigationskontext auch beim dazwischenliegenden normalen Fehler', () => {
    const { service, reload } = createService();
    const error = new TypeError('Failed to fetch dynamically imported module: /chunk-old.js');
    service.rememberNavigationError(error, '/settings/notifications');

    expect(service.tryRecover(new Error('normal error'))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(service.tryRecover(error)).toBe(true);
    expect(reload).toHaveBeenCalledExactlyOnceWith();
  });

  it('verbraucht den Navigationskontext auch bei blockiertem Session-Speicher', () => {
    const { service, reload, storage } = createService();
    const error = new TypeError('Failed to fetch dynamically imported module: /chunk-old.js');
    service.rememberNavigationError(error, '/settings/notifications');
    vi.spyOn(storage, 'getItem').mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });

    expect(service.tryRecover(error)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(service.tryRecover(error)).toBe(true);
    expect(reload).toHaveBeenCalledExactlyOnceWith();
  });
});

describe('reloadStaleChunkBrowser', () => {
  function createBrowser() {
    const location = {
      href: 'https://app.flipbase.de/',
      origin: 'https://app.flipbase.de',
      reload: vi.fn(),
    };
    location.reload.mockImplementation(() => location.href);
    const history = {
      state: { navigationId: 1 },
      replaceState: vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
        if (url != null) location.href = String(url);
      }),
    };
    return { location, history };
  }

  it.each([
    [
      '/settings/notifications?view=push#permission',
      'https://app.flipbase.de/settings/notifications?view=push#permission',
    ],
    [
      'https://app.flipbase.de/settings/notifications?view=push#permission',
      'https://app.flipbase.de/settings/notifications?view=push#permission',
    ],
    ['/#preferences', 'https://app.flipbase.de/#preferences'],
  ])('laedt das interne Navigationsziel einschliesslich Query und Hash neu: %s', (url, target) => {
    const browser = createBrowser();
    const { location, history } = browser;

    reloadStaleChunkBrowser(url, browser);

    expect(history.replaceState).toHaveBeenCalledExactlyOnceWith(history.state, '', target);
    expect(location.reload).toHaveBeenCalledExactlyOnceWith();
    expect(location.reload).toHaveReturnedWith(target);
  });

  it.each([
    undefined,
    '',
    'https://other.example/settings/notifications',
    '//other.example/settings/notifications',
    'javascript:alert(1)',
    'blob:https://app.flipbase.de/1234',
    'https://[invalid',
  ])('behaelt ohne gueltiges internes Ziel den bisherigen Reload bei: %s', (url) => {
    const browser = createBrowser();
    const { location, history } = browser;

    reloadStaleChunkBrowser(url, browser);

    expect(location.reload).toHaveBeenCalledExactlyOnceWith();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('behaelt bei blockierter History den bisherigen Reload bei', () => {
    const browser = createBrowser();
    browser.history.replaceState.mockImplementation(() => {
      throw new Error('history unavailable');
    });

    reloadStaleChunkBrowser('/settings/notifications', browser);

    expect(browser.location.reload).toHaveBeenCalledExactlyOnceWith();
    expect(browser.location.reload).toHaveReturnedWith('https://app.flipbase.de/');
  });
});
