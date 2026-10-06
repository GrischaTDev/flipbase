import type { ProductCategory } from './product-category.models';

/** Gleiche Bedienung, getrennte Kategoriequellen und Kennungen. */
export interface CategoryPickerSource {
  getById(id: string): Promise<ProductCategory | null>;
  loadChildren(parentId: string | null): Promise<readonly ProductCategory[]>;
  search(term: string): Promise<{ categories: readonly ProductCategory[]; hasMore: boolean }>;
}
