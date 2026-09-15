import { describe, expect, it } from 'vitest';
import { parseVintedCatalogPage } from '../../src/vinted/catalog-page.js';
import { catalogPage } from './support/catalog-page.js';

describe('parseVintedCatalogPage', () => {
  it('parses the current Next.js catalog data', () => {
    const [item] = parseVintedCatalogPage(catalogPage(), 'https://www.vinted.de');

    expect(item).toMatchObject({
      id: 1001,
      title: 'Nike Air Max',
      url: 'https://www.vinted.de/items/1001-nike-air-max',
      brand_title: 'Nike',
      size_title: '42',
      status: 'Sehr gut',
      total_item_price: { amount: '18.40', currency_code: 'EUR' },
      photos: [{ url: 'https://images.vinted.test/1001.webp', is_main: true }],
    });
  });

  it('tolerates thumbnailUrls provided as a single string', () => {
    const rawPage = catalogPage().replace(
      '"thumbnailUrls":["https://images.vinted.test/1001-thumb.webp"]',
      '"thumbnailUrls":"https://images.vinted.test/1001-single.webp"',
    );
    const [item] = parseVintedCatalogPage(rawPage, 'https://www.vinted.de');
    expect(item).toBeDefined();
    expect(item?.id).toBe(1001);
  });

  it('rejects a page without catalog item data', () => {
    expect(() =>
      parseVintedCatalogPage('<html><body>loading</body></html>', 'https://www.vinted.de'),
    ).toThrow('catalog item data');
  });
});
