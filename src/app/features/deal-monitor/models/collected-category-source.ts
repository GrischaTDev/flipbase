import type { CategoryPickerSource } from '../../../core/models/category-picker-source';
import type { VintedCategory } from '../../platform-admin/models/vinted-category.model';
import { vintedCategorySource } from '../../platform-admin/models/vinted-category-source';

/**
 * Kategorieauswahl für Feed und Suchfilter. Vinteds Katalogliste nennt keine Artikelkategorie;
 * eine Kategorie ist deshalb nur dann vollständig, wenn ein eigener Kategorie-Bot sie sammelt.
 * Übergeordnete Kategorien bleiben als Weg dorthin sichtbar, sind aber nicht wählbar.
 * Bereits gespeicherte Auswahlen werden weiterhin mit ihrem Namen angezeigt.
 */
export function collectedCategorySource(
  categories: readonly VintedCategory[],
  collectedCategoryIds: readonly number[],
): CategoryPickerSource {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const collected = new Set(collectedCategoryIds.filter((id) => byId.has(id)));
  const shown = new Set<number>();
  for (const id of collected) {
    let category = byId.get(id);
    while (category && !shown.has(category.id)) {
      shown.add(category.id);
      category = category.parentId === null ? undefined : byId.get(category.parentId);
    }
  }
  const offered = vintedCategorySource(
    categories.filter((category) => shown.has(category.id)),
    {
      included: [...collected].map(String),
      excluded: [...shown].filter((id) => !collected.has(id)).map(String),
    },
  );
  const all = vintedCategorySource(categories, { included: [], excluded: [] });
  return {
    loadChildren: (parentId) => offered.loadChildren(parentId),
    search: (term) => offered.search(term),
    async getById(id) {
      return (await offered.getById(id)) ?? (await all.getById(id));
    },
  };
}
