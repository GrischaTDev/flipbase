import { describe, expect, it } from 'vitest';
import { SellableItemRef } from '../../../core/models/store.models';
import { storeCatalogCards } from './store-product-groups';

describe('storeCatalogCards', () => {
  it('zeigt Größenvarianten als eine Shopkarte und Einzelstücke weiterhin separat', () => {
    const items: SellableItemRef[] = [
      {
        kind: 'catalog_product',
        id: 'size-39',
        variantGroupId: 'shoe',
        title: 'Schuh',
        availableQuantity: 1,
      },
      {
        kind: 'catalog_product',
        id: 'size-40',
        variantGroupId: 'shoe',
        title: 'Schuh',
        availableQuantity: 2,
      },
      { kind: 'inventory_item', id: 'shoe', title: 'Einzelstück', availableQuantity: 1 },
    ];

    expect(storeCatalogCards(items).map((item) => item.id)).toEqual(['size-39', 'shoe']);
  });
});
