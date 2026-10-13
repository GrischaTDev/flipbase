import { describe, expect, it } from 'vitest';
import { matchesArticleView, parseArticleView } from './article-view';
import type { ArticleRow } from './article-row';

const row: ArticleRow = {
  key: 'catalog:one',
  id: 'one',
  kind: 'catalog',
  title: 'Artikel',
  detailLink: '/catalog/one',
  onHand: 0,
  available: 0,
  reserved: 0,
  quantityState: 'known',
  inventoryValue: 0,
  archivedAt: null,
  canOfferDelete: true,
};

describe('Artikelfilter', () => {
  it('fällt bei unbekannten URL-Werten auf Alle zurück', () => {
    expect(parseArticleView('other')).toBe('all');
    expect(parseArticleView(null)).toBe('all');
  });

  it('unterscheidet Nullbestand, Bestand und Archiv', () => {
    expect(matchesArticleView(row, 'empty')).toBe(true);
    expect(matchesArticleView(row, 'stock')).toBe(false);
    expect(matchesArticleView({ ...row, onHand: 3 }, 'stock')).toBe(true);
    expect(matchesArticleView({ ...row, archivedAt: '2026-09-24' }, 'active')).toBe(false);
    expect(matchesArticleView({ ...row, archivedAt: '2026-09-24' }, 'archive')).toBe(true);
    expect(
      matchesArticleView({ ...row, quantityState: 'review_required', onHand: null }, 'review'),
    ).toBe(true);
  });

  it.each(['all', 'active', 'stock', 'empty', 'review'] as const)(
    'blendet archivierte Artikel in der Ansicht %s auch mit Bestand oder Prüfbedarf aus',
    (view) => {
      for (const onHand of [0, 3, null]) {
        expect(
          matchesArticleView(
            { ...row, archivedAt: '2026-10-13', onHand, quantityState: 'review_required' },
            view,
          ),
        ).toBe(false);
      }
    },
  );

  it('zeigt im Archiv ausschließlich archivierte Artikel und in Alle auch aktive Nullbestände', () => {
    expect(matchesArticleView(row, 'archive')).toBe(false);
    expect(matchesArticleView(row, 'all')).toBe(true);
    expect(
      matchesArticleView({ ...row, onHand: null, quantityState: 'review_required' }, 'all'),
    ).toBe(true);
  });
});
