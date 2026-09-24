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
  it('fällt bei unbekannten URL-Werten auf Aktiv zurück', () => {
    expect(parseArticleView('other')).toBe('active');
    expect(parseArticleView(null)).toBe('active');
  });

  it('unterscheidet Nullbestand, Bestand und Archiv', () => {
    expect(matchesArticleView(row, 'empty')).toBe(true);
    expect(matchesArticleView(row, 'stock')).toBe(false);
    expect(matchesArticleView({ ...row, onHand: 3, archivedAt: '2026-09-24' }, 'stock')).toBe(true);
    expect(matchesArticleView({ ...row, archivedAt: '2026-09-24' }, 'active')).toBe(false);
    expect(matchesArticleView({ ...row, archivedAt: '2026-09-24' }, 'archive')).toBe(true);
    expect(
      matchesArticleView({ ...row, quantityState: 'review_required', onHand: null }, 'review'),
    ).toBe(true);
  });
});
