/**
 * Fachlicher Kategoriebaum ohne Angular- oder Datenbankabhängigkeit.
 * Die Dienstschicht bildet parent_id auf parentId ab. isActive ist optional;
 * die aktuell geprüfte Vinted-Kategorietabelle besitzt keine solche Spalte.
 */
export interface VintedCategoryNode {
  readonly id: number;
  readonly parentId: number | null;
  readonly title: string;
  readonly isActive?: boolean;
}

export interface VintedCategoryEntry {
  readonly id: number;
  readonly parentId: number | null;
  readonly title: string;
  readonly path: string;
  readonly ancestorIds: readonly number[];
  readonly isLeaf: boolean;
  readonly isAvailable: boolean;
}

export interface VintedCategoryTree {
  /** Fehlende gespeicherte IDs ausdrücklich als null behandeln, nicht als „alle“. */
  get(id: number): VintedCategoryEntry | null;
  /** Auch Eltern sind auswählbare Einträge. null bezeichnet ausschließlich die Wurzelebene. */
  children(parentId: number | null): readonly VintedCategoryEntry[];
  /** Alle passenden verfügbaren Knoten; kein verstecktes Ergebnislimit. */
  search(term: string): readonly VintedCategoryEntry[];
}

const EMPTY_ENTRIES: readonly VintedCategoryEntry[] = Object.freeze([]);

function isCategoryId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/**
 * Aus dem vollständigen geladenen Snapshot bilden, nicht aus einer einzelnen API-Seite.
 * Fehlende Eltern oder Zyklen machen den Snapshot ungültig. Ein Fehler darf nicht
 * durch einen erfundenen Root-Knoten oder einen offenen Sammelfilter kaschiert werden.
 */
export function buildVintedCategoryTree(
  categories: readonly VintedCategoryNode[],
): VintedCategoryTree {
  if (!Array.isArray(categories)) throw new TypeError('Kategorien müssen eine Liste sein.');
  const nodes = new Map<number, VintedCategoryNode>();
  const parentIds = new Set<number>();
  for (const category of categories) {
    if (
      typeof category !== 'object' ||
      category === null ||
      !isCategoryId(category.id) ||
      (category.parentId !== null && !isCategoryId(category.parentId))
    ) {
      throw new TypeError('Eine Kategorie hat eine ungültige Kennung.');
    }
    if (typeof category.title !== 'string' || !category.title.trim()) {
      throw new TypeError('Eine Kategorie hat keinen gültigen Namen.');
    }
    if (category.isActive !== undefined && typeof category.isActive !== 'boolean') {
      throw new TypeError('Eine Kategorie hat einen ungültigen Verfügbarkeitsstatus.');
    }
    if (nodes.has(category.id)) throw new Error(`Kategorie ${category.id} ist doppelt vorhanden.`);
    nodes.set(category.id, Object.freeze({ ...category, title: category.title.trim() }));
    if (category.parentId !== null) parentIds.add(category.parentId);
  }

  const byId = new Map<number, VintedCategoryEntry>();
  const byParent = new Map<number | null, readonly VintedCategoryEntry[]>();
  const entries: VintedCategoryEntry[] = [];
  for (const node of nodes.values()) {
    const chain: VintedCategoryNode[] = [];
    const visited = new Set<number>();
    let current: VintedCategoryNode | undefined = node;
    // Iterativ statt rekursiv: Fehlerhafte Tiefe darf keinen Stack-Overflow auslösen.
    while (current !== undefined) {
      if (visited.has(current.id)) throw new Error(`Zyklus bei Kategorie ${current.id}.`);
      visited.add(current.id);
      chain.push(current);
      if (current.parentId === null) break;
      const parentId: number = current.parentId;
      current = nodes.get(parentId);
      if (current === undefined) throw new Error(`Elternkategorie ${parentId} fehlt.`);
    }
    chain.reverse();
    const entry: VintedCategoryEntry = Object.freeze({
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      path: chain.map((parent) => parent.title).join(' > '),
      ancestorIds: Object.freeze(chain.slice(0, -1).map((parent) => parent.id)),
      isLeaf: !parentIds.has(node.id),
      isAvailable: chain.every((parent) => parent.isActive !== false),
    });
    byId.set(entry.id, entry);
    entries.push(entry);
    byParent.set(entry.parentId, Object.freeze([...(byParent.get(entry.parentId) ?? []), entry]));
  }
  const searchable = entries
    .filter((entry) => entry.isAvailable)
    .map((entry) => ({
      entry,
      text: normalizeSearch(entry.path),
    }));

  return Object.freeze({
    get(id: number): VintedCategoryEntry | null {
      return byId.get(id) ?? null;
    },
    children(parentId: number | null): readonly VintedCategoryEntry[] {
      if (parentId !== null && !byId.has(parentId)) {
        throw new Error(`Kategorie ${parentId} nicht gefunden.`);
      }
      return byParent.get(parentId) ?? EMPTY_ENTRIES;
    },
    search(term: string): readonly VintedCategoryEntry[] {
      if (typeof term !== 'string')
        throw new TypeError('Der Suchtext muss eine Zeichenfolge sein.');
      const terms = normalizeSearch(term).split(' ').filter(Boolean);
      return Object.freeze(
        searchable
          .filter((row) => terms.every((value) => row.text.includes(value)))
          .map((row) => row.entry),
      );
    },
  });
}
