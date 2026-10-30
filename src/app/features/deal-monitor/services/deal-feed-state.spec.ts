import { describe, expect, it, vi } from 'vitest';
import { DealFeedState } from './deal-feed-state';
import {
  FeedItem,
  FeedPage,
  FeedRequest,
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
  reference_price: null,
  reference_scope: null,
  discount_percent: null,
  watchlist_title: null,
});
const page = (items: FeedItem[]): FeedPage => ({
  items,
  covered: true,
  reported_at: '2026-09-12T12:00:00Z',
});
const context: FeedRequest = {
  workspace: 'a',
  watchlist: null,
  brand: null,
  size: null,
  minPrice: null,
  maxPrice: null,
};
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('DealFeedState', () => {
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
    for (let i = 0; i < 10; i++) state.notifyUpdate();
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(page([item('older')]));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    await settle();
    expect(state.items().map((row) => row.id)).toEqual(['newest']);
  });

  it('legt angekündigte Funde bei pausiertem Feed ausschließlich im Zulauf ab', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([item('older')]))
      .mockResolvedValue(page([item('newest'), item('older')]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    state.pause();
    state.notifyUpdate();
    await settle();
    expect(state.items().map((row) => row.id)).toEqual(['older']);
    expect(state.pending().map((row) => row.id)).toEqual(['newest', 'older']);
    expect(state.newCount()).toBe(1);
    expect(state.paused()).toBe(true);
  });

  it('hält beim angekündigten Abgleich nach einer älteren Seite deren Karten fest', async () => {
    const first = Array.from({ length: 60 }, (_, index) => item(String(index)));
    let finish!: (page: FeedPage) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page(first))
      .mockImplementationOnce(
        () =>
          new Promise<FeedPage>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(page([item('arrival'), ...first]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    const older = state.refresh(true);
    state.notifyUpdate();
    state.notifyUpdate();
    expect(fetch).toHaveBeenCalledTimes(2);
    finish(page([item('older')]));
    await older;
    await settle();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith(context);
    expect(state.items().map((row) => row.id)).toEqual([...first.map((row) => row.id), 'older']);
    expect(state.pending()[0].id).toBe('arrival');
    expect(state.paused()).toBe(true);
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
    state.notifyUpdate();
    state.setContext({ ...context, workspace: 'b' });
    finish(page([item('private-a')]));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state.items()[0].id).toBe('workspace-b');
    state.destroy();
    state.notifyUpdate();
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
    state.notifyUpdate();
    reject(new Error('offline'));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state.error()).toBe('offline');
    await state.refresh();
    expect(state.items()[0].id).toBe('recovered');
  });

  it('keeps paused cards fixed while buffering arrivals, resumes at the newest page', async () => {
    const fetch = vi.fn().mockResolvedValue(page([item('a')]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    state.pause();
    fetch.mockResolvedValue(page([item('b'), item('a')]));
    await state.refresh();
    expect(state.items().map((row) => row.id)).toEqual(['a']);
    expect(state.newCount()).toBe(1);
    state.resume();
    await settle();
    expect(state.items().map((row) => row.id)).toEqual(['b', 'a']);
    expect(state.newCount()).toBe(0);
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
  it('uses the last timestamp and UUID as a cursor, deduplicates pages and pauses scrolling', async () => {
    const first = Array.from({ length: 60 }, (_, i) => item(String(i)));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page(first))
      .mockResolvedValue(page([item('59'), item('60')]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    await state.refresh(true);
    expect(fetch).toHaveBeenLastCalledWith({
      ...context,
      cursor: { time: first[59].first_seen_at, id: '59' },
    });
    expect(state.items()).toHaveLength(61);
    expect(state.paused()).toBe(true);
    expect(state.hasMore()).toBe(false);
  });
  it('resuming cancels a delayed older page', async () => {
    let finish!: (page: FeedPage) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page(Array.from({ length: 60 }, (_, i) => item(String(i)))))
      .mockImplementationOnce(
        () =>
          new Promise<FeedPage>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(page([item('newest')]));
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    const older = state.refresh(true);
    state.resume();
    await settle();
    finish(page([item('old')]));
    await older;
    expect(state.items().map((row) => row.id)).toEqual(['newest']);
  });
  it('allows loading older saved finds beyond the former 300-item cap', async () => {
    let pageIndex = 0;
    const fetch = vi.fn(async () =>
      page(Array.from({ length: 60 }, (_, index) => item(String(pageIndex * 60 + index)))),
    );
    const state = new DealFeedState(fetch);
    state.setContext(context);
    await settle();
    for (pageIndex = 1; pageIndex <= 5; pageIndex++) await state.refresh(true);
    expect(state.items()).toHaveLength(360);
    expect(state.hasMore()).toBe(true);
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
