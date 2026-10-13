import { describe, expect, it } from 'vitest';
import {
  parseEbayAdvertisingReport,
  parseEbayListingPerformance,
} from './ebay-performance-response';
const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
const period = { ...scope, startDate: '2026-09-01', endDate: '2026-09-07' };
const item = {
  listingId: '123',
  title: 'Jacke',
  imageUrl: null,
  watchCount: 0,
  quantityAvailable: 1,
  impressions: 100,
  views: 10,
  externalViews: 2,
  transactions: 1,
  searchImpressions: 80,
  searchViews: 4,
  clickThroughRate: 0.05,
  conversionRate: 0.1,
};
const listingReport = { ...period, limit: 200, lastUpdatedDate: null, items: [item] };
const pending = { ...period, status: 'pending', generatedAt: null, days: [], items: [] };
describe('eBay-Auswertungsverträge', () => {
  it('erhält Nullwerte und echte Nullzähler je Artikel', () => {
    expect(parseEbayListingPerformance(listingReport, scope, 7).items[0].watchCount).toBe(0);
    expect(parseEbayListingPerformance(listingReport, scope, 7).items[0].externalViews).toBe(2);
    expect(parseEbayListingPerformance(listingReport, scope, 7).items[0].quantityAvailable).toBe(1);
    expect(
      parseEbayListingPerformance({ ...listingReport, items: [{ ...item, views: null }] }, scope, 7)
        .items[0].views,
    ).toBeNull();
  });
  it('verwirft fremde Konten, Zeiträume und doppelte Artikel', () => {
    for (const changes of [
      { connectionId: 'other' },
      { endDate: '2026-09-08' },
      { startDate: '2026-02-30' },
      { items: [item, item] },
      { items: [{ ...item, impressions: -1 }] },
      { items: [{ ...item, externalViews: -1 }] },
      { items: [{ ...item, quantityAvailable: -1 }] },
    ])
      expect(() =>
        parseEbayListingPerformance({ ...listingReport, ...changes }, scope, 7),
      ).toThrow();
  });
  it('unterscheidet laufende Berichte von Nullwerbung und weist unvollständige Antworten zurück', () => {
    expect(parseEbayAdvertisingReport(pending, scope, 7).status).toBe('pending');
    expect(() =>
      parseEbayAdvertisingReport(
        { ...pending, items: [{ listingId: '123', impressions: 0, clicks: 0 }] },
        scope,
        7,
      ),
    ).toThrow();
    expect(() => parseEbayAdvertisingReport({ ...pending, status: 'ready' }, scope, 7)).toThrow();
    const days = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-09-0${index + 1}`,
      impressions: 0,
      clicks: 0,
    }));
    expect(
      parseEbayAdvertisingReport({ ...pending, status: 'ready', days }, scope, 7).days[0].clicks,
    ).toBe(0);
    expect(() =>
      parseEbayAdvertisingReport(
        { ...pending, status: 'ready', days: [...days].reverse() },
        scope,
        7,
      ),
    ).toThrow();
    expect(() =>
      parseEbayAdvertisingReport({ ...pending, workspaceId: 'other' }, scope, 7),
    ).toThrow();
  });
});
