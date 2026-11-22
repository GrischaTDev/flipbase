import { describe, expect, it } from 'vitest';
import { parseVintedFeedLink } from './vinted-feed-link';

describe('Vinted-Suchlink', () => {
  it('übernimmt Suchparameter mit IDs, Preis und dekodiertem Suchbegriff', () => {
    const link =
      '  https://www.vinted.de/catalog/1049-sneaker?catalog[]=1049&brand_ids[]=53&size_ids[0]=13&size_ids[]=14&status_ids[]=2&price_from=0&price_to=26.99&currency=EUR&search_text=Air+Max&order=newest_first&page=2&utm_source=example  ';
    expect(parseVintedFeedLink(link)).toEqual({
      categoryId: 1049,
      brandId: 53,
      conditionId: 2,
      sizeIds: [13, 14],
      minPrice: 0,
      maxPrice: 26.99,
      searchText: 'Air Max',
    });
  });

  it.each([
    'https://vinted.de.example/catalog?search_text=Schuhe',
    'https://www.vinted.de/items/123-test',
    'https://www.vinted.fr/catalog?brand_ids[]=53',
    'https://www.vinted.de/catalog?brand_ids[]=53&brand_ids[]=88',
    'https://www.vinted.de/catalog?price_from=20&price_to=10',
    'https://www.vinted.de/catalog?price_to=1e2',
    'https://www.vinted.de/catalog?color_ids[]=2',
    'https://www.vinted.de/catalog?search_text=Air+Max&search_text_mode=all',
  ])('weist nicht unterstützte Filter und Ziele zurück (%s)', (link) => {
    expect(() => parseVintedFeedLink(link)).toThrow();
  });
});
