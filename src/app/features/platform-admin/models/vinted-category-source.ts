import {
  categorySelectionAllowed,
  categoryNavigationIds,
} from '../../../core/models/category-selection-scope';
import { VINTED_CATEGORY_RULES } from './vinted-category-selection';
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
  const path = (entry: VintedCategoryEntry) => [...entry.ancestorIds, entry.id].map(String);
  const allowed = (entry: VintedCategoryEntry) =>
    categorySelectionAllowed(path(entry), VINTED_CATEGORY_RULES);
  const visible = categoryNavigationIds(
    rows.map((row) => path(tree.get(row.id)!)),
    VINTED_CATEGORY_RULES,
  );
  const map = (entry: VintedCategoryEntry): ProductCategory => ({
    id: String(entry.id),
    parentId: entry.parentId === null ? null : String(entry.parentId),
    name: entry.title,
    fullName: entry.path,
    level: entry.ancestorIds.length + 1,
    isLeaf: entry.isLeaf,
    isDeprecated: !entry.isAvailable,
    ...(!allowed(entry) ? { isSelectable: false } : {}),
  });
  return {
    async getById(id) {
      const entry = tree.get(Number(id));
      return entry ? map(entry) : null;
    },
    async loadChildren(id) {
      return tree
        .children(id === null ? null : Number(id))
        .filter((entry) => entry.isAvailable && visible.has(String(entry.id)))
        .map(map);
    },
    async search(term) {
      return { categories: tree.search(term).filter(allowed).map(map), hasMore: false };
    },
  };
}
