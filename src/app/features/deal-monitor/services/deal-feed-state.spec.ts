import { describe, expect, it, vi } from 'vitest';
import { DealFeedState, SLOW_MODE_STEP_MS } from './deal-feed-state';
import {
  FEED_ITEM_LIMIT,
  FEED_WINDOW_MS,
  FeedItem,
  FeedPage,
  FeedRequest,
  recentFeedItems,
  safeVintedImage,
  safeVintedLink,
} from '../models/deal-monitor.model';

const item = (id: string): FeedItem => ({
  id,
  title: id,
  url: 'https://www.vinted.de/items/1',
  image_urls: [],
  item_price: 10,
  total_price: 12,
  currency: 'EUR',
  brand: 'Nike',
  size: null,
  condition: 'Gut',
  is_hidden: false,
  first_seen_at: '2026-09-12T12:00:00Z',
  catalog_id: 1,
  category_path: 'Schuhe',
});
const page = (items: FeedItem[]): FeedPage => ({
  items,
  covered: true,
  reported_at: '2026-09-12T12:00:00Z',
});
const context: FeedRequest = { workspace: 'a', watchlist: 'feed-a' };
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const seenAt = (id: string, minute: number): FeedItem => ({
  ...item(id),
  first_seen_at: `2026-09-12T12:${String(minute).padStart(2, '0')}:00Z`,
});
const ids = (items: FeedItem[]) => items.map((entry) => entry.id);

describe('DealFeedState im langsamen Modus', () => {
  it('schiebt neue Funde einzeln nach, ältester zuerst', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(page([seenAt('old', 1)]))
        .mockResolvedValue(
          page([seenAt('c', 4), seenAt('b', 3), seenAt('a', 2), seenAt('old', 1)]),
        );
      const state = new DealFeedState(fetch);
      state.setSlowMode(true);
      state.setContext(context);
      await settle();
      await state.refresh();
      expect(ids(state.items())).toEqual(['old']);
      expect(ids(state.queued())).toEqual(['c', 'b', 'a']);
      vi.advanceTimersByTime(SLOW_MODE_STEP_MS);
      expect(ids(state.items())).toEqual(['a', 'old']);
      vi.advanceTimersByTime(SLOW_MODE_STEP_MS);
      vi.advanceTimersByTime(SLOW_MODE_STEP_MS);
      expect(ids(state.items())).toEqual(['c', 'b', 'a', 'old']);
      expect(state.queued()).toEqual([]);
      // Ein erneuter Abruf derselben Seite stellt nichts doppelt an.
      await state.refresh();
      expect(state.queued()).toEqual([]);
      expect(ids(state.items())).toEqual(['c', 'b', 'a', 'old']);
      state.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('verwirft wartende Funde beim Filterwechsel und zeigt den ersten Stand sofort', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(page([seenAt('old', 1)]))
        .mockResolvedValueOnce(page([seenAt('a', 2), seenAt('old', 1)]))
        .mockResolvedValue(page([seenAt('other', 5), seenAt('x', 4)]));
      const state = new DealFeedState(fetch);
      state.setSlowMode(true);
      state.setContext(context);
      await settle();
      await state.refresh();
      expect(ids(state.queued())).toEqual(['a']);
      state.setContext({ ...context, watchlist: 'feed-b' });
      await settle();
      expect(state.queued()).toEqual([]);
      expect(ids(state.items())).toEqual(['other', 'x']);
      vi.advanceTimersByTime(SLOW_MODE_STEP_MS);
      expect(ids(state.items())).toEqual(['other', 'x']);
      state.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DealFeedState', () => {
  it('ergänzt neue Funde mit gleichem Zeitstempel und behält unveränderte Karten', async () => {
    const existing = [seenAt('b', 2), seenAt('a', 1)];
    const arrival = seenAt('c', 2);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page(existing))
      .mockResolvedValueOnce(page([arrival, { ...existing[0] }]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    await state.refresh(true);
    expect(fetch).toHaveBeenLastCalledWith({ ...context, afterTime: arrival.first_seen_at });
    expect(ids(state.items())).toEqual(['c', 'b', 'a']);
    expect(state.items()[1]).toBe(existing[0]);
    expect(state.items()[2]).toBe(existing[1]);
    state.destroy();
  });

  it('holt bei einer größeren Änderung einen vollständigen Stand nach', async () => {
    const initial = seenAt('a', 1);
    const updates = Array.from({ length: FEED_ITEM_LIMIT }, (_, index) => seenAt(String(index), 2));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([initial]))
      .mockResolvedValueOnce(page(updates))
      .mockResolvedValueOnce(page(updates.slice(0, FEED_ITEM_LIMIT)));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    await state.refresh(true);
    expect(fetch.mock.calls).toEqual([
      [context],
      [{ ...context, afterTime: initial.first_seen_at }],
      [context],
    ]);
    expect(state.items()).toEqual(updates.slice(0, FEED_ITEM_LIMIT));
    state.destroy();
  });

  it('bündelt Hinweise während eines Abrufs zu einem anschließenden Abgleich ohne parallele Abfragen', async () => {
    let finish!: (page: FeedPage) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<FeedPage>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(page([item('newest')]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    for (let i = 0; i < 10; i++) state.notifyUpdate(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(page([item('older')]));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    await settle();
    expect(state.items().map((row) => row.id)).toEqual(['newest']);
  });

  it('verwirft vorgemerkte Hinweise beim Kontextwechsel und nach dem Verlassen', async () => {
    let finish!: (page: FeedPage) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<FeedPage>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(page([item('workspace-b')]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    state.notifyUpdate(false);
    state.setContext({ ...context, workspace: 'b' });
    finish(page([item('private-a')]));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state.items()[0].id).toBe('workspace-b');
    state.destroy();
    state.notifyUpdate(false);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('startet bei Fehlern keinen vorgemerkten Sofortversuch und erlaubt den späteren Pollingabruf', async () => {
    let reject!: (error: Error) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<FeedPage>((_resolve, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValue(page([item('recovered')]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    state.notifyUpdate(false);
    reject(new Error('offline'));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state.error()).toBe('offline');
    await state.refresh();
    expect(state.items()[0].id).toBe('recovered');
  });

  it('discards a delayed response after a workspace switch', async () => {
    let finish!: (page: FeedPage) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<FeedPage>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(page([item('workspace-b')]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    state.setContext({ ...context, workspace: 'b' });
    await settle();
    finish(page([item('private-a')]));
    await settle();
    expect(state.items().map((row) => row.id)).toEqual(['workspace-b']);
  });
  it('does not overlap requests in one context and ignores results after destruction', async () => {
    let finish!: (page: FeedPage) => void;
    const fetch = vi.fn(
      () =>
        new Promise<FeedPage>((resolve) => {
          finish = resolve;
        }),
    );
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await state.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    state.destroy();
    finish(page([item('late')]));
    await settle();
    expect(state.items()).toEqual([]);
  });
  it('keeps the last valid page on error and recovers on retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([item('a')]))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(page([item('b')]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    await state.refresh();
    expect(state.error()).toBe('offline');
    expect(state.items()[0].id).toBe('a');
    await state.refresh();
    expect(state.error()).toBeNull();
    expect(state.items()[0].id).toBe('b');
  });
});

describe('Zeitfenster persönlicher Feeds', () => {
  it('entfernt abgelaufene Karten unabhängig von einem neuen Fund und begrenzt die Zahl', () => {
    const now = Date.parse('2026-09-12T12:10:00Z');
    const rows = [seenAt('newest', 10), seenAt('previous', 9), seenAt('expired', 0)];
    expect(ids(recentFeedItems(rows, now))).toEqual(['newest', 'previous']);
    expect(recentFeedItems(rows, now + FEED_WINDOW_MS)).toEqual([]);
    expect(
      recentFeedItems(
        Array.from({ length: 110 }, () => rows[0]),
        now,
      ),
    ).toHaveLength(FEED_ITEM_LIMIT);
  });
});

describe('Vinted links', () => {
  it('only permits HTTPS item links on the real marketplace host', () => {
    expect(safeVintedLink('https://www.vinted.de/items/123')).toBeTruthy();
    for (const url of [
      'javascript:alert(1)',
      'https://www.vinted.de.evil.test/items/1',
      'http://www.vinted.de/items/1',
      'https://www.vinted.de/member/1',
    ])
      expect(safeVintedLink(url)).toBeNull();
  });
  it('restricts images to the Vinted media hosts', () => {
    expect(safeVintedImage('https://images1.vinted.net/example.jpg')).toBeTruthy();
    expect(safeVintedImage('https://vinted.net.evil.test/example.jpg')).toBeNull();
    expect(safeVintedImage(undefined)).toBeNull();
  });
});
