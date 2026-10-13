import { describe, expect, it } from 'vitest';
import { MarketplaceResponseError } from './marketplace-response';
import {
  describeChange,
  formatBucketDescription,
  formatBucketLabel,
  formatCount,
  formatPrice,
  parseVintedStatisticsOverview,
  rankTopItems,
  type VintedStatisticsTopItem,
} from './vinted-statistics-overview';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const item = {
  id: '1',
  connectionId: 'account-a',
  accountName: 'Konto A',
  entryId: 'entry-a',
  title: 'Jacke',
  imageUrl: 'https://images.example.test/a.jpg',
  price: 25,
  currency: 'EUR',
  removedAt: null,
  views: 50,
  favorites: 7,
  totalViews: 155,
  totalFavorites: 18,
};
const response = (changes: Record<string, unknown> = {}) => ({
  ...scope,
  period: '7d',
  historyStartsAt: '2026-09-21T10:00:00Z',
  activeCount: 3,
  totals: { views: 70, favorites: 7 },
  previousTotals: { views: 10, favorites: 1 },
  buckets: [
    { start: '2026-10-07T22:00:00Z', views: 20, favorites: 2 },
    { start: '2026-10-08T22:00:00Z', views: 50, favorites: 5 },
  ],
  topItems: [item],
  ...changes,
});

describe('parseVintedStatisticsOverview', () => {
  it('übernimmt eine vollständige Antwort', () => {
    const overview = parseVintedStatisticsOverview(response(), scope, '7d');
    expect(overview.range).toBe('7d');
    expect(overview.totals).toEqual({ views: 70, favorites: 7 });
    expect(overview.previousTotals).toEqual({ views: 10, favorites: 1 });
    expect(overview.buckets).toHaveLength(2);
    expect(overview.topItems[0]).toEqual(item);
  });

  it('akzeptiert alle Konten, fehlenden Vorzeitraum und Artikel ohne Bild, Preis und Währung', () => {
    const overview = parseVintedStatisticsOverview(
      response({
        connectionId: null,
        previousTotals: null,
        historyStartsAt: null,
        topItems: [
          {
            ...item,
            entryId: null,
            imageUrl: null,
            price: null,
            currency: null,
            removedAt: '2026-10-09T08:00:00Z',
            totalViews: null,
            totalFavorites: null,
          },
        ],
      }),
      { workspaceId: 'workspace-a', connectionId: null },
      '7d',
    );
    expect(overview.connectionId).toBeNull();
    expect(overview.previousTotals).toBeNull();
    expect(overview.topItems[0].currency).toBe('EUR');
    expect(overview.topItems[0].removedAt).toBe('2026-10-09T08:00:00Z');
  });

  it.each([
    ['fremder Workspace', response({ workspaceId: 'workspace-b' })],
    ['anderes Konto', response({ connectionId: 'account-b' })],
    ['anderer Zeitraum', response({ period: '24h' })],
    ['negative Summe', response({ totals: { views: -1, favorites: 0 } })],
    ['Kommazahl als Zähler', response({ totals: { views: 1.5, favorites: 0 } })],
    ['Abschnitte fehlen', response({ buckets: null })],
    ['ungültiges Datum', response({ buckets: [{ start: 'gestern', views: 1, favorites: 0 }] })],
    ['Artikel ohne Titel', response({ topItems: [{ ...item, title: '' }] })],
    ['doppelter Artikel', response({ topItems: [item, item] })],
    ['kein Objekt', 'kaputt'],
    ['null', null],
  ])('lehnt ab: %s', (_name, data) => {
    expect(() => parseVintedStatisticsOverview(data, scope, '7d')).toThrow(
      MarketplaceResponseError,
    );
  });
});

describe('rankTopItems', () => {
  const items: VintedStatisticsTopItem[] = [
    { ...item, id: '1', views: 5, favorites: 9 },
    { ...item, id: '2', views: 50, favorites: 1 },
    { ...item, id: '3', views: 50, favorites: 4 },
    { ...item, id: '4', views: 0, favorites: 0 },
  ];
  it('sortiert nach Aufrufen und löst Gleichstand über Favoriten', () => {
    expect(rankTopItems(items, 'views').map((entry) => entry.id)).toEqual(['3', '2', '1']);
  });
  it('sortiert nach Favoriten', () => {
    expect(rankTopItems(items, 'favorites').map((entry) => entry.id)).toEqual(['1', '3', '2']);
  });
  it('lässt Artikel ohne Zuwachs in der gewählten Kennzahl weg und begrenzt die Länge', () => {
    expect(rankTopItems(items, 'views', 2).map((entry) => entry.id)).toEqual(['3', '2']);
    expect(rankTopItems([{ ...item, views: 0, favorites: 3 }], 'views')).toEqual([]);
  });
});

describe('Anzeigehilfen', () => {
  it('beschriftet Abschnitte in deutscher Zeit', () => {
    expect(formatBucketLabel('2026-10-08T12:00:00Z', '24h')).toBe('14 Uhr');
    expect(formatBucketLabel('2026-10-07T22:00:00Z', '7d')).toBe('08.10.');
    expect(formatBucketDescription('2026-10-08T12:00:00Z', '24h')).toBe('08.10., 14 Uhr');
    expect(formatBucketDescription('2026-10-07T22:00:00Z', '30d')).toBe('Donnerstag, 08.10.');
  });
  it('beschreibt die Veränderung zum Zeitraum davor', () => {
    expect(describeChange(56, 50, '7d')).toBe('+12 % gegenüber den 7 Tagen davor');
    expect(describeChange(46, 50, '24h')).toBe('−8 % gegenüber den 24 Stunden davor');
    expect(describeChange(50, 50, '30d')).toBe('Unverändert gegenüber den 30 Tagen davor');
    expect(describeChange(12, 0, '7d')).toBe('+12 gegenüber den 7 Tagen davor');
    expect(describeChange(0, 0, '7d')).toBe('Unverändert gegenüber den 7 Tagen davor');
    expect(describeChange(12, null, '7d')).toBe('Noch kein Vergleich');
  });
  it('formatiert Zahlen und Preise deutsch', () => {
    expect(formatCount(12345)).toBe('12.345');
    expect(formatCount(null)).toBe('—');
    // Intl trennt Betrag und Währung mit einem geschützten Leerzeichen.
    expect(formatPrice(12.5, 'EUR').replace(/\u00a0/g, ' ')).toBe('12,50 €');
    expect(formatPrice(null, 'EUR')).toBe('Preis unbekannt');
  });
});
