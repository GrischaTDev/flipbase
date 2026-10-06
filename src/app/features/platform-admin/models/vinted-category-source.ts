import type { CategoryPickerSource } from '../../../core/models/category-picker-source';
import type { ProductCategory } from '../../../core/models/product-category.models';
import {
  buildVintedCategoryTree,
  VintedCategoryEntry,
  VintedCategoryNode,
} from './vinted-category-tree';

/** Adapter für den geladenen Vinted-Snapshot; löst keine zusätzlichen Serverabfragen aus. */
export function vintedCategorySource(rows: readonly VintedCategoryNode[]): CategoryPickerSource {
  const tree = buildVintedCategoryTree(rows);
  const map = (entry: VintedCategoryEntry): ProductCategory => ({
    id: String(entry.id),
    parentId: entry.parentId === null ? null : String(entry.parentId),
    name: entry.title,
    fullName: entry.path,
    level: entry.ancestorIds.length + 1,
    isLeaf: entry.isLeaf,
    isDeprecated: !entry.isAvailable,
  });
  return {
    async getById(id) {
      const entry = tree.get(Number(id));
      return entry ? map(entry) : null;
    },
    async loadChildren(id) {
      return tree
        .children(id === null ? null : Number(id))
        .filter((entry) => entry.isAvailable)
        .map(map);
    },
    async search(term) {
      return { categories: tree.search(term).map(map), hasMore: false };
    },
  };
}
