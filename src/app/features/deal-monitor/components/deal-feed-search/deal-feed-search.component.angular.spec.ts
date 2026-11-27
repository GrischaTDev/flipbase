import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageLayoutService } from '../../../../core/services/page-layout.service';
import { FEED_WINDOW_MS, FeedItem, PersonalFeed } from '../../models/deal-monitor.model';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { DealFeedUpdatesService } from '../../services/deal-feed-updates.service';
import { DealMonitorService } from '../../services/deal-monitor.service';
import { FeedClockService } from '../../services/feed-clock.service';
import { DealFeedSearchComponent, liveFilterStorageKey } from './deal-feed-search.component';

const sampleTime = new Date('2026-11-22T21:31:00Z');
const running: PersonalFeed = {
  id: 'feed-1',
  workspace_id: 'workspace-1',
  title: 'Ralph Lauren',
  catalog_id: null,
  brand: null,
  brand_id: 88,
  search_text: null,
  price_from: null,
  price_to: null,
  condition: null,
  audience: null,
  sizes: [],
  is_active: true,
  started_at: sampleTime.toISOString(),
};
const item: FeedItem = {
  id: 'item-1',
  title: 'Ralph Lauren',
  url: 'https://www.vinted.de/items/100',
  image_urls: [],
  item_price: 10,
  total_price: 12,
  currency: 'EUR',
  brand: null,
  size: null,
  condition: null,
  is_hidden: false,
  first_seen_at: sampleTime.toISOString(),
  catalog_id: null,
  category_path: null,
};

describe('Artikel eines persönlichen Vinted-Feeds', () => {
  const cleanup = vi.fn();
  const api = { feed: vi.fn() };
  const updates = { watch: vi.fn() };
  const now = signal(sampleTime);

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    now.set(sampleTime);
    api.feed.mockResolvedValue({ items: [item], covered: true, reported_at: item.first_seen_at });
    updates.watch.mockReturnValue(cleanup);
    TestBed.configureTestingModule({
      providers: [
        DealFeedSearchComponent,
        { provide: DealMonitorService, useValue: api },
        { provide: DealFeedUpdatesService, useValue: updates },
        { provide: DealFavoritesService, useValue: {} },
        { provide: FeedClockService, useValue: { now } },
        { provide: PageLayoutService, useValue: { widescreen: signal(false) } },
      ],
    });
    TestBed.overrideComponent(DealFeedSearchComponent, { set: { template: '', imports: [] } });
  });

  afterEach(() => TestBed.resetTestingModule());

  function open(feed: PersonalFeed) {
    const fixture = TestBed.createComponent(DealFeedSearchComponent);
    Object.assign(fixture.componentInstance, {
      workspaceId: signal(feed.workspace_id),
      feed: signal(feed),
    });
    fixture.detectChanges();
    return fixture;
  }

  it('lädt nur den ausgewählten aktiven Feed und behält ruhige Treffer über zehn Minuten hinaus bis zum Feed-Limit', async () => {
    const fixture = open(running);
    await Promise.resolve();
    expect(api.feed).toHaveBeenCalledWith({ workspace: 'workspace-1', watchlist: 'feed-1' });
    expect(fixture.componentInstance.feedItems()).toEqual([item]);
    // Nach 30 Minuten bleiben Treffer eines ruhigen Feeds sichtbar.
    now.set(new Date(sampleTime.getTime() + 30 * 60_000));
    expect(fixture.componentInstance.feedItems()).toEqual([item]);
    // Erst nach Ablauf des 3-Tage-Fensters werden sie ausgeblendet.
    now.set(new Date(sampleTime.getTime() + FEED_WINDOW_MS));
    expect(fixture.componentInstance.feedItems()).toEqual([]);
    fixture.destroy();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('öffnet für einen gestoppten Feed weder Livekanal noch Abruf', () => {
    open({ ...running, is_active: false });
    expect(api.feed).not.toHaveBeenCalled();
    expect(updates.watch).not.toHaveBeenCalled();
  });

  it('zeigt in Nebeneinander-Spalten mindestens drei Kacheln und wächst mit dem Platz', () => {
    const fixture = TestBed.createComponent(DealFeedSearchComponent);
    Object.assign(fixture.componentInstance, {
      workspaceId: signal(running.workspace_id),
      feed: signal(running),
      compact: signal(true),
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.gridColumns()).toContain('grid-cols-3');
    expect(fixture.componentInstance.gridColumns()).toContain('repeat(auto-fill');
  });

  it('behält gesetzte Live-Filter beim Seiten- und Feedwechsel je Feed und räumt sie beim Zurücksetzen auf', () => {
    const first = open(running);
    first.componentInstance.setLiveQuery('Polo');
    first.componentInstance.toggleLiveSize('m');
    first.componentInstance.setLiveMinPrice(15);
    first.componentInstance.setLiveMaxPrice(40);
    first.destroy();

    const reopened = open(running);
    expect(reopened.componentInstance.liveQuery()).toBe('Polo');
    expect(reopened.componentInstance.liveSizes()).toEqual(['m']);
    expect(reopened.componentInstance.liveMinPrice()).toBe(15);
    expect(reopened.componentInstance.liveMaxPrice()).toBe(40);
    expect(reopened.componentInstance.hasLiveFilters()).toBe(true);

    const otherFeed: PersonalFeed = { ...running, id: 'feed-2', title: 'Carhartt', sizes: ['l'] };
    const second = open(otherFeed);
    expect(second.componentInstance.hasLiveFilters()).toBe(false);
    second.destroy();

    reopened.componentInstance.resetLiveFilters();
    expect(localStorage.getItem(liveFilterStorageKey('workspace-1', 'feed-1'))).toBeNull();
    reopened.destroy();
  });

  it('filtert gespeicherte Größen gegen die aktuell erlaubten Feed-Größen und übersteht defekten Speicher', () => {
    localStorage.setItem(
      liveFilterStorageKey('workspace-1', 'feed-1'),
      JSON.stringify({ query: 'Jacke', sizes: ['s', 'l'], minPrice: 10, maxPrice: -5 }),
    );
    const restricted = open({ ...running, sizes: ['l'] });
    expect(restricted.componentInstance.liveQuery()).toBe('Jacke');
    expect(restricted.componentInstance.liveSizes()).toEqual(['l']);
    expect(restricted.componentInstance.liveMinPrice()).toBe(10);
    expect(restricted.componentInstance.liveMaxPrice()).toBeNull();
    restricted.destroy();

    localStorage.setItem(liveFilterStorageKey('workspace-1', 'feed-1'), '{kein-json');
    const recovered = open(running);
    expect(recovered.componentInstance.hasLiveFilters()).toBe(false);
    recovered.destroy();
  });

  it('fragt Live-Filter wie XXL serverseitig ab, damit bis zu 100 passende Treffer geladen werden', async () => {
    const fixture = open(running);
    await Promise.resolve();
    expect(api.feed).toHaveBeenLastCalledWith({ workspace: 'workspace-1', watchlist: 'feed-1' });

    fixture.componentInstance.toggleLiveSize('xxl');
    await Promise.resolve();
    expect(api.feed).toHaveBeenLastCalledWith({
      workspace: 'workspace-1',
      watchlist: 'feed-1',
      sizes: ['xxl'],
    });

    fixture.componentInstance.setLiveMinPrice(20);
    fixture.componentInstance.setLiveMaxPrice(10);
    await Promise.resolve();
    // Umgekehrte Preisgrenzen werden nicht als ungültiger Server-Filter verschickt.
    expect(api.feed).toHaveBeenLastCalledWith({
      workspace: 'workspace-1',
      watchlist: 'feed-1',
      sizes: ['xxl'],
    });
    fixture.destroy();

    // Nach Seitenwechsel startet der Abruf sofort mit dem gespeicherten XXL-Filter.
    const reopened = open(running);
    await Promise.resolve();
    expect(api.feed).toHaveBeenLastCalledWith({
      workspace: 'workspace-1',
      watchlist: 'feed-1',
      sizes: ['xxl'],
    });
    reopened.destroy();
  });
});
