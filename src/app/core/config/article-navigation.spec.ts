import { describe, expect, it } from 'vitest';
import { isArticleRoute } from './article-navigation';

describe('Gemeinsamer Artikelbereich', () => {
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
