import { describe, expect, it } from 'vitest';
import { summarizeEbayTraffic } from './ebay-traffic-summary';
import { parseEbayTrafficOverview } from './ebay-response';
import type { EbayTrafficDay } from '../../../../../supabase/functions/_shared/ebay-contracts';
const day: EbayTrafficDay = {
  date: '2026-09-01',
  impressions: 1000,
  views: 10,
  transactions: 1,
  searchImpressions: 100,
  searchViews: 5,
  clickThroughRate: 0.05,
  conversionRate: 0.1,
};

describe('eBay-Trafficübersicht', () => {
  it('gewichtet Quoten nach ihren Bezugsgrößen statt Tagesprozente zu mitteln', () => {
    const result = summarizeEbayTraffic([
      day,
      {
        ...day,
        date: '2026-09-02',
        impressions: 2000,
        views: 90,
        transactions: 1,
        searchImpressions: 900,
        searchViews: 15,
        clickThroughRate: 15 / 900,
        conversionRate: 1 / 90,
      },
    ]);
    expect(result.impressions).toBe(3000);
    expect(result.views).toBe(100);
    expect(result.transactions).toBe(2);
    expect(result.clickThroughRate).toBe(0.02);
    expect(result.conversionRate).toBe(0.02);
  });
  it('unterscheidet bekannte Nullwerte, unbekannte Tage und Quoten ohne Nenner', () => {
    expect(
      summarizeEbayTraffic([
        {
          ...day,
          views: 0,
          transactions: 0,
          searchViews: 0,
          searchImpressions: 0,
          clickThroughRate: null,
          conversionRate: null,
        },
      ]),
    ).toMatchObject({
      views: 0,
      transactions: 0,
      conversionRate: null,
      clickThroughRate: null,
      missingDays: 0,
    });
    expect(summarizeEbayTraffic([day, { ...day, views: null }])).toMatchObject({
      views: null,
      conversionRate: null,
      impressions: 2000,
      missingDays: 1,
    });
    expect(summarizeEbayTraffic([]).impressions).toBeNull();
  });
  it('prüft Kontozuordnung, Zeitraum und Vollständigkeit der Antwort', () => {
    const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
    const report = {
      ...scope,
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      lastUpdatedDate: null,
      days: Array.from({ length: 7 }, (_, index) => ({ ...day, date: `2026-09-0${index + 1}` })),
    };
    expect(parseEbayTrafficOverview(report, scope, 7).days).toHaveLength(7);
    for (const invalid of [
      { ...report, connectionId: 'other' },
      { ...report, days: report.days.slice(1) },
      { ...report, days: report.days.map(() => day) },
      { ...report, endDate: '2026-09-30' },
    ])
      expect(() => parseEbayTrafficOverview(invalid, scope, 7)).toThrow();
  });
});
