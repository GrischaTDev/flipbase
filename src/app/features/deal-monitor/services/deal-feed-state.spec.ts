import { describe, expect, it, vi } from 'vitest';
import { DealFeedState } from './deal-feed-state';
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
const page = (items: FeedItem[], lastCheckedAt = '2026-09-12T12:00:00Z'): FeedPage => ({
  items,
  covered: true,
  reported_at: '2026-09-12T12:00:00Z',
  last_checked_at: lastCheckedAt,
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

describe('DealFeedState', () => {
  it('übernimmt last_checked_at aus der Antwort und setzt es beim Kontextwechsel zurück', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page([seenAt('a', 1)], '2026-09-12T12:01:05Z'));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    expect(state.lastCheckedAt()).toBe('2026-09-12T12:01:05Z');
    state.setContext(null);
    expect(state.lastCheckedAt()).toBeNull();
    state.destroy();
  });
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
  it('behält ältere Karten ruhiger Feeds bis zum 3-Tage-Limit und begrenzt die Zahl pro Feed', () => {
    const now = Date.parse('2026-09-12T12:10:00Z');
    const expired: FeedItem = {
      ...item('expired'),
      first_seen_at: new Date(now - FEED_WINDOW_MS).toISOString(),
    };
    const rows = [seenAt('newest', 10), seenAt('previous', 0), expired];
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
