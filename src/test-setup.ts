import { beforeEach } from 'vitest';

/**
 * Startdatei der Testumgebung.
 *
 * jsdom bildet den Browser weitgehend nach, laesst aber `window.matchMedia`
 * aus. Darauf greifen `ThemeService` (Systemvoreinstellung hell/dunkel) und
 * `PwaService` (erkennt den Standalone-Modus) zu. Ohne Ersatz bricht bereits
 * die Erzeugung dieser Dienste ab.
 *
 * Der Ersatz meldet durchgehend "trifft nicht zu" - Tests, die ein bestimmtes
 * Verhalten brauchen, ueberschreiben ihn gezielt.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

function createTestLocalStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  };
}

function installTestLocalStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: createTestLocalStorage(),
  });
}

installTestLocalStorage();

beforeEach(() => {
  installTestLocalStorage();
});
