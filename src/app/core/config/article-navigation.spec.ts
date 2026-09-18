import { describe, expect, it } from 'vitest';
import { ARTICLE_VIEWS, isArticleRoute } from './article-navigation';

describe('Gemeinsamer Artikelbereich', () => {
  it('liefert die gemeinsamen Sidebar-Unterpunkte in stabiler Reihenfolge', () => {
    expect(ARTICLE_VIEWS).toEqual([
      { label: 'Alle Artikel', path: '/catalog' },
      { label: 'Bestand', path: '/inventory' },
    ]);
  });

  it.each([
    '/catalog',
    '/catalog/product?view=stock',
    '/inventory',
    '/inventory/item',
    '/inventory/new',
  ])('erkennt %s als Artikelroute', (url) => {
    expect(isArticleRoute(url)).toBe(true);
  });

  it.each(['/catalogue', '/inventory-export', '/purchases/item', '/sales', '/'])(
    'markiert %s nicht als Artikelbereich',
    (url) => {
      expect(isArticleRoute(url)).toBe(false);
    },
  );
});
