import { describe, expect, it } from 'vitest';
import { calculateEbayTrafficChange, summarizeEbayTraffic } from './ebay-traffic-summary';
import { parseEbayTrafficOverview } from './ebay-response';
import type { EbayTrafficDay } from '../../../../../supabase/functions/_shared/ebay-contracts';
const day: EbayTrafficDay = {
  date: '2026-09-01',
  impressions: 1000,
  views: 10,
  externalViews: 2,
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
        externalViews: 8,
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
    expect(result.viewsOnEbay).toBe(90);
    expect(result.externalViews).toBe(10);
    expect(result.clickThroughRate).toBe(0.03);
    expect(result.conversionRate).toBe(0.02);
  });
  it('unterscheidet bekannte Nullwerte, unbekannte Tage und Quoten ohne Nenner', () => {
    expect(
      summarizeEbayTraffic([
        {
          ...day,
          views: 0,
          externalViews: 0,
          impressions: 0,
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
  it('bildet die Seller-Hub-Klickrate und erfindet bei fehlenden Quellen keine eBay-Aufrufe', () => {
    expect(
      summarizeEbayTraffic([{ ...day, impressions: 424, views: 3, externalViews: 2 }]),
    ).toMatchObject({ views: 3, viewsOnEbay: 1, externalViews: 2, clickThroughRate: 1 / 424 });
    expect(summarizeEbayTraffic([{ ...day, externalViews: null }])).toMatchObject({
      views: 10,
      viewsOnEbay: null,
      clickThroughRate: null,
      conversionRate: 0.1,
    });
    expect(summarizeEbayTraffic([{ ...day, externalViews: 11 }]).viewsOnEbay).toBeNull();
  });
  it('prüft Kontozuordnung, Zeitraum und Vollständigkeit der Antwort', () => {
    const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
    const report = {
      ...scope,
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      lastUpdatedDate: null,
      previousPeriod: null,
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
  it('berechnet relative Veränderungen ohne einen Trend aus fehlenden oder Nullvorwerten zu erfinden', () => {
    expect(calculateEbayTrafficChange(150, 100)).toBe(0.5);
    expect(calculateEbayTrafficChange(0, 100)).toBe(-1);
    expect(calculateEbayTrafficChange(100, 0)).toBeNull();
    expect(calculateEbayTrafficChange(100, null)).toBeNull();
    expect(calculateEbayTrafficChange(null, 100)).toBeNull();
    expect(calculateEbayTrafficChange(0.03, 0.02)).toBeCloseTo(0.5);
  });
  it('verlangt einen gleich langen unmittelbar vorherigen Vergleichszeitraum', () => {
    const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
    const previousPeriod = {
      startDate: '2026-08-25',
      endDate: '2026-08-31',
      lastUpdatedDate: null,
      days: Array.from({ length: 7 }, (_, index) => ({ ...day, date: `2026-08-${25 + index}` })),
    };
    const report = {
      ...scope,
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      lastUpdatedDate: null,
      days: Array.from({ length: 7 }, (_, index) => ({ ...day, date: `2026-09-0${index + 1}` })),
      previousPeriod,
    };
    expect(parseEbayTrafficOverview(report, scope, 7).previousPeriod?.days).toHaveLength(7);
    expect(() =>
      parseEbayTrafficOverview(
        { ...report, previousPeriod: { ...previousPeriod, endDate: '2026-09-01' } },
        scope,
        7,
      ),
    ).toThrow();
    expect(() =>
      parseEbayTrafficOverview(
        { ...report, previousPeriod: { ...previousPeriod, days: [] } },
        scope,
        7,
      ),
    ).toThrow();
    expect(() =>
      parseEbayTrafficOverview(
        { ...report, previousPeriod: { ...report, previousPeriod: undefined } },
        scope,
        7,
      ),
    ).toThrow();
  });
});
