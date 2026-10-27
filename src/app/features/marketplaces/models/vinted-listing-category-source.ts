import type { CategoryPickerSource } from '../../../core/models/category-picker-source';
import type { ProductCategory } from '../../../core/models/product-category.models';
import { vintedCategorySource } from '../../platform-admin/models/vinted-category-source';
import type { VintedCategoryNode } from '../../platform-admin/models/vinted-category-tree';

/** Oberkategorien bleiben zur Navigation und für alte Entwürfe sichtbar; veröffentlicht werden konkrete Artikelkategorien. */
export function vintedListingCategorySource(
  rows: readonly VintedCategoryNode[],
): CategoryPickerSource {
  const source = vintedCategorySource(rows);
  const forListing = (category: ProductCategory): ProductCategory => ({
    ...category,
    isSelectable: category.isSelectable !== false && category.isLeaf,
  });
  return {
    async getById(id) {
      const category = await source.getById(id);
      return category ? forListing(category) : null;
    },
    async loadChildren(id) {
      return (await source.loadChildren(id)).map(forListing);
    },
    async search(term) {
      const result = await source.search(term);
      return {
        ...result,
        categories: result.categories.filter((category) => category.isLeaf).map(forListing),
      };
    },
  };
}
