import type { CategoryPickerSource } from '../../../core/models/category-picker-source';
import type { ProductCategory } from '../../../core/models/product-category.models';
import { vintedCategorySource } from '../../../core/models/vinted-category-source';
import type { VintedCategoryNode } from '../../../core/models/vinted-category-tree';

/** Oberkategorien bleiben zur Navigation und für alte Entwürfe sichtbar; veröffentlicht werden konkrete Artikelkategorien. */
export function vintedListingCategorySource(
  rows: readonly VintedCategoryNode[],
  publishableCategoryIds?: ReadonlySet<number>,
): CategoryPickerSource {
  const source = vintedCategorySource(rows);
  const forListing = (category: ProductCategory): ProductCategory => ({
    ...category,
    isSelectable:
      category.isSelectable !== false &&
      category.isLeaf &&
      (!publishableCategoryIds || publishableCategoryIds.has(Number(category.id))),
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
        categories: result.categories.map(forListing).filter((category) => category.isSelectable),
      };
    },
  };
}
