import type { CategoryPickerSource } from '../../../core/models/category-picker-source';
import type { ProductCategory } from '../../../core/models/product-category.models';
export interface KleinanzeigenCategoryNode {
  readonly path: string;
  readonly name: string;
  readonly isParent: boolean;
}
export interface KleinanzeigenCategorySource extends CategoryPickerSource {
  getCategory(path: string): ProductCategory | null;
}
const normalize = (value: string) =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('de').replace(/ß/gu, 'ss');
/** Originalpfade bleiben die IDs; Geschwister behalten die Anbieterreihenfolge. */
export function createKleinanzeigenCategorySource(
  rows: readonly KleinanzeigenCategoryNode[],
): KleinanzeigenCategorySource {
  const originals = new Map<string, KleinanzeigenCategoryNode>();
  for (const row of rows) {
    if (
      !/^[1-9][0-9]*(?:\/[a-z0-9_ -]+){0,5}$/u.test(row.path) ||
      !row.name.trim() ||
      originals.has(row.path)
    )
      throw new Error('Ungültiger oder doppelter Kleinanzeigen-Kategoriepfad.');
    originals.set(row.path, row);
  }
  const categories = new Map<string, ProductCategory>();
  const children = new Map<string | null, ProductCategory[]>();
  for (const row of rows) {
    const parts = row.path.split('/');
    const ancestorPaths = parts.map((_, index) => parts.slice(0, index + 1).join('/'));
    const ancestors = ancestorPaths.map((path) => originals.get(path));
    if (ancestors.some((ancestor) => !ancestor))
      throw new Error('Übergeordnete Kleinanzeigen-Kategorie fehlt.');
    const parentId = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
    const category: ProductCategory = {
      id: row.path,
      parentId,
      name: row.name,
      fullName: ancestors.map((ancestor) => ancestor!.name).join(' > '),
      level: parts.length,
      isLeaf: !row.isParent,
      isDeprecated: false,
    };
    categories.set(row.path, category);
    children.set(parentId, [...(children.get(parentId) ?? []), category]);
  }
  for (const category of categories.values())
    if (category.isLeaf === (children.get(category.id)?.length ?? 0) > 0)
      throw new Error('Kleinanzeigen-Endkategorie und Unterkategorien widersprechen sich.');
  const searchable = [...categories.values()]
    .filter((category) => category.isLeaf)
    .map((category) => ({ category, text: normalize(category.fullName) }));
  return {
    getCategory: (path) => categories.get(path) ?? null,
    async getById(path) {
      return categories.get(path) ?? null;
    },
    async loadChildren(parent) {
      return children.get(parent) ?? [];
    },
    async search(term) {
      const words = normalize(term).trim().split(/\s+/u).filter(Boolean);
      if (words.join(' ').length < 2) return { categories: [], hasMore: false };
      const matches = searchable.filter((row) => words.every((word) => row.text.includes(word)));
      return {
        categories: matches.slice(0, 50).map((row) => row.category),
        hasMore: matches.length > 50,
      };
    },
  };
}
