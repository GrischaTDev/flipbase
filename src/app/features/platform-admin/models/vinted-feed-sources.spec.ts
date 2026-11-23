import { describe, expect, it } from 'vitest';
import {
  parseVintedFeedCapacity,
  pendingCategoryRefresh,
  sourceAgeLabel,
  sourceCoverageStatus,
} from './vinted-feed-sources';

describe('Vinted-Quellen', () => {
  it('liest die Auslastung und ergänzt fehlende Werte', () => {
    const capacity = parseVintedFeedCapacity({
      max_category_sources: 10,
      category_poll_interval_seconds: 45,
      active_category_sources: 2,
      active_feeds: 5,
      requests_last_minute: null,
      sources: [
        {
          key: 'category:1206',
          kind: 'category',
          catalog_id: 1206,
          category_path: 'Herren > Jacken',
          feed_count: 3,
          last_success_at: '2026-11-23T10:00:00Z',
          coverage_status: 'limited',
        },
        { kind: 'unbekannt', coverage_status: 'seltsam' },
      ],
    });
    expect(capacity).toMatchObject({
      maxCategorySources: 10,
      categoryPollIntervalSeconds: 45,
      activeCategorySources: 2,
      activeFeeds: 5,
      requestsLastMinute: null,
      requestBudget: null,
      reportedAt: null,
    });
    expect(capacity.sources[0]).toEqual({
      key: 'category:1206',
      kind: 'category',
      catalogId: 1206,
      categoryPath: 'Herren > Jacken',
      feedCount: 3,
      lastSuccessAt: '2026-11-23T10:00:00Z',
      coverage: 'limited',
    });
    expect(capacity.sources[1]).toMatchObject({ kind: 'main', coverage: 'unknown' });
    expect(parseVintedFeedCapacity(null).sources).toEqual([]);
  });

  it('beschriftet Abdeckung und Alter', () => {
    expect(sourceCoverageStatus('caught_up').label).toBe('Aktuell');
    expect(sourceCoverageStatus('limited').label).toBe('Kommt nicht hinterher');
    expect(sourceCoverageStatus('initial').label).toBe('Unbekannt');
    const now = Date.parse('2026-11-23T10:00:00Z');
    expect(sourceAgeLabel('2026-11-23T09:59:48Z', now)).toBe('vor 12 s');
    expect(sourceAgeLabel('2026-11-23T09:57:00Z', now)).toBe('vor 3 min');
    expect(sourceAgeLabel('2026-11-23T07:00:00Z', now)).toBe('vor 3 h');
    expect(sourceAgeLabel(null, now)).toBe('—');
  });

  it('erkennt eine noch offene Neu-Einlese-Anforderung', () => {
    const base = {
      refreshedAt: '2026-11-23T09:00:00Z',
      lastAttemptAt: '2026-11-23T09:00:00Z',
      categoryCount: 1,
      lastError: null,
    };
    expect(pendingCategoryRefresh({ ...base, requestedAt: '2026-11-23T09:30:00Z' })).toBe(
      '2026-11-23T09:30:00Z',
    );
    expect(pendingCategoryRefresh({ ...base, requestedAt: '2026-11-23T08:30:00Z' })).toBeNull();
    expect(pendingCategoryRefresh(null)).toBeNull();
  });
});
