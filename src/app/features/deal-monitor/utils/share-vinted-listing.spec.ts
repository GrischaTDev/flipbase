import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedItem } from '../models/deal-monitor.model';
import { shareVintedListing } from './share-vinted-listing';

const item: FeedItem = {
  id: 'listing-1',
  title: 'Adidas Spezial',
  url: 'https://www.vinted.de/items/123',
  image_urls: [],
  item_price: 15,
  total_price: 18,
  currency: 'EUR',
  brand: 'Adidas',
  size: '42',
  condition: 'Sehr gut',
  is_hidden: false,
  first_seen_at: '2026-09-27T12:00:00Z',
  catalog_id: null,
  category_path: null,
  reference_price: null,
  reference_scope: null,
  discount_percent: null,
  watchlist_title: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('shareVintedListing', () => {
  it('copies the link when native sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await shareVintedListing(item)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(item.url);
  });

  it('does not share an unsafe listing URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await shareVintedListing({ ...item, url: 'https://vinted.de.evil.test/items/1' })).toBe(
      'unavailable',
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not copy a link when native sharing is cancelled', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
      clipboard: { writeText },
    });

    expect(await shareVintedListing(item)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });
});
