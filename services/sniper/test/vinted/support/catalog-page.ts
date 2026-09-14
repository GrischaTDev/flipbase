interface CatalogPageItem {
  id: number;
  title: string;
  url: string;
  price: { amount: string; currencyCode: string };
  totalItemPrice: { amount: string; currencyCode: string };
  thumbnailUrls: string[];
  photos: { url: string; isMain: boolean }[];
  user: { id: number; photo: null; thumbnailUrl: null; isBusiness: false };
  itemBox: {
    firstLine: string;
    secondLine: string;
    accessibilityLabel: string;
    itemId: string;
  };
}

export function catalogPage(): string {
  const item: CatalogPageItem = {
    id: 1001,
    title: 'Nike Air Max',
    url: '/items/1001-nike-air-max',
    price: { amount: '16.00', currencyCode: 'EUR' },
    totalItemPrice: { amount: '18.40', currencyCode: 'EUR' },
    thumbnailUrls: ['https://images.vinted.test/1001.webp'],
    photos: [{ url: 'https://images.vinted.test/1001.webp', isMain: true }],
    user: { id: 7, photo: null, thumbnailUrl: null, isBusiness: false },
    itemBox: {
      firstLine: 'Nike',
      secondLine: '42 · Sehr gut',
      accessibilityLabel: 'Nike Air Max, Marke: Nike, Zustand: Sehr gut, Größe: 42',
      itemId: '1001',
    },
  };

  const state = {
    items: {
      items: [{ id: item.id, productItem: item, catalogTracking: {} }],
      pagination: { currentPage: 1, totalPages: 1, perPage: 96 },
    },
  };

  return `<html><body><script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(state))}])</script></body></html>`;
}
