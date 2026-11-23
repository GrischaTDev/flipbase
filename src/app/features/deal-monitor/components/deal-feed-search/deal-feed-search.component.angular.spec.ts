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
import { DealFeedSearchComponent } from './deal-feed-search.component';

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

  it('lädt nur den ausgewählten aktiven Feed und lässt seine Karten nach zehn Minuten altern', async () => {
    const fixture = open(running);
    await Promise.resolve();
    expect(api.feed).toHaveBeenCalledWith({ workspace: 'workspace-1', watchlist: 'feed-1' });
    expect(fixture.componentInstance.feedItems()).toEqual([item]);
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
});
