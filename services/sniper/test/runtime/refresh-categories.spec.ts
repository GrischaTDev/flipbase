import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { refreshCategoriesIfDue } from '../../src/runtime/refresh-categories.js';
import type { CategorySyncState } from '../../src/runtime/category-refresh.js';
import type { VintedCategory } from '../../src/vinted/categories.js';

const html = readFileSync(new URL('../fixtures/vinted-homepage.html', import.meta.url), 'utf8');
const now = new Date('2026-09-06T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const log = { info: vi.fn(), error: vi.fn() };

function storeStub(state: CategorySyncState) {
  return {
    readSyncState: vi.fn(async (): Promise<CategorySyncState> => state),
    replaceAll: vi.fn(async (_categories: VintedCategory[]): Promise<void> => undefined),
    markRefreshed: vi.fn(async (): Promise<void> => undefined),
    markFailed: vi.fn(async (): Promise<void> => undefined),
  };
}

describe('refreshCategoriesIfDue', () => {
  it('tut nichts, solange der Stand jung genug ist', async () => {
    const store = storeStub({ refreshedAt: '2026-09-06T06:00:00.000Z', requestedAt: null });
    const fetchHomepage = vi.fn(async () => html);

    const result = await refreshCategoriesIfDue(
      { store, fetchHomepage, maxAgeMs: DAY_MS, log },
      now,
    );

    expect(result).toBe('skipped');
    expect(fetchHomepage).not.toHaveBeenCalled();
    expect(store.replaceAll).not.toHaveBeenCalled();
  });

  it('liest ein und haelt den Stand fest, wenn faellig', async () => {
    const store = storeStub({ refreshedAt: null, requestedAt: null });
    const fetchHomepage = vi.fn(async () => html);

    const result = await refreshCategoriesIfDue(
      { store, fetchHomepage, maxAgeMs: DAY_MS, log },
      now,
    );

    expect(result).toBe('refreshed');
    expect(store.replaceAll).toHaveBeenCalledOnce();
    expect(store.replaceAll.mock.calls[0]?.[0]).toHaveLength(6);
    expect(store.markRefreshed).toHaveBeenCalledWith(6, now);
  });

  it('haelt einen Fehlschlag fest und wirft nicht', async () => {
    const store = storeStub({ refreshedAt: null, requestedAt: null });
    const fetchHomepage = vi.fn(async () => '<html><body>nichts</body></html>');

    const result = await refreshCategoriesIfDue(
      { store, fetchHomepage, maxAgeMs: DAY_MS, log },
      now,
    );

    expect(result).toBe('failed');
    expect(store.replaceAll).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith('Kein catalogTree im HTML gefunden', now);
  });

  it('schreibt nichts, wenn schon das Abholen scheitert', async () => {
    const store = storeStub({ refreshedAt: null, requestedAt: null });
    const fetchHomepage = vi.fn(async () => {
      throw new Error('HTTP 503');
    });

    const result = await refreshCategoriesIfDue(
      { store, fetchHomepage, maxAgeMs: DAY_MS, log },
      now,
    );

    expect(result).toBe('failed');
    expect(store.replaceAll).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith('HTTP 503', now);
  });
});
