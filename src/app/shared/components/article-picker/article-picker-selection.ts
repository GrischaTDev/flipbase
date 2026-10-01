import type {
  ArticlePickerEntry,
  ArticlePickerFilters,
  ArticlePickerGroup,
} from './article-picker.models';

export function isArticleSelectable(entry: ArticlePickerEntry): boolean {
  if (entry.disabledReason) return false;
  const quantity = entry.availableQuantity;
  return (
    quantity === undefined || (quantity !== null && Number.isSafeInteger(quantity) && quantity > 0)
  );
}

export function groupArticles(entries: readonly ArticlePickerEntry[]): ArticlePickerGroup[] {
  const groups = new Map<string, ArticlePickerEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.groupId) ?? [];
    group.push(entry);
    groups.set(entry.groupId, group);
  }
  return [...groups].map(([id, values]) => {
    // Gespeicherte Gruppenwurzel bevorzugen; Lade- und Sortierreihenfolge sind keine Identität.
    const first = values.find((entry) => entry.id === id) ?? values[0];
    return {
      id,
      title: first.title,
      brand: first.brand,
      imageKey: first.imageKey,
      entries: [...values].sort(
        (left, right) =>
          (left.size ?? '').localeCompare(right.size ?? '', 'de', { numeric: true }) ||
          (left.color ?? '').localeCompare(right.color ?? '', 'de') ||
          (left.sku ?? left.id).localeCompare(right.sku ?? right.id, 'de', { numeric: true }),
      ),
    };
  });
}

export function filterArticleGroups(
  groups: readonly ArticlePickerGroup[],
  filters: ArticlePickerFilters,
): ArticlePickerGroup[] {
  const query = filters.query.trim().toLocaleLowerCase('de');
  return groups.filter((group) =>
    group.entries.some(
      (entry) =>
        (!filters.category || entry.category?.trim() === filters.category) &&
        (!filters.brand || entry.brand?.trim() === filters.brand) &&
        [
          entry.title,
          entry.brand,
          entry.model,
          entry.category,
          entry.size,
          entry.color,
          entry.ean,
          entry.sku,
        ].some((value) => (value ?? '').toLocaleLowerCase('de').includes(query)),
    ),
  );
}

/** Auch beim Bestätigen prüfen: Daten können sich während des offenen Dialogs ändern. */
export function selectedArticles(
  entries: readonly ArticlePickerEntry[],
  selected: ReadonlySet<string>,
): ArticlePickerEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id) || !selected.has(entry.id) || !isArticleSelectable(entry)) return false;
    seen.add(entry.id);
    return true;
  });
}

export function toggleArticleSelection(
  entries: readonly ArticlePickerEntry[],
  selected: ReadonlySet<string>,
  id: string,
  mode: 'single' | 'multiple',
): ReadonlySet<string> {
  const next = new Set(selectedArticles(entries, selected).map((entry) => entry.id));
  if (next.has(id)) {
    next.delete(id);
    return next;
  }
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry || !isArticleSelectable(entry)) return next;
  if (mode === 'single') next.clear();
  next.add(id);
  return next;
}
