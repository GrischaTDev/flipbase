const invalid = () =>
  new Error('Der kontobezogene Vinted-Verkaufsbaum ist unvollständig oder ungültig.');
const positive = (value) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

/** Prüft den ganzen atomaren Snapshot, einschließlich aller Eltern und Blattkennungen. */
export function parseVintedSellingTree(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 10000) throw invalid();
  const nodes = new Map();
  for (const row of input) {
    if (
      !row ||
      typeof row !== 'object' ||
      !positive(row.id) ||
      (row.parentId !== null && !positive(row.parentId)) ||
      typeof row.title !== 'string' ||
      !row.title.trim() ||
      row.title.length > 200 ||
      typeof row.path !== 'string' ||
      row.path.length > 2000 ||
      typeof row.isLeaf !== 'boolean' ||
      nodes.has(row.id)
    )
      throw invalid();
    nodes.set(row.id, {
      id: row.id,
      parentId: row.parentId,
      title: row.title,
      path: row.path,
      isLeaf: row.isLeaf,
    });
  }
  const parents = new Set([...nodes.values()].map((node) => node.parentId));
  for (const node of nodes.values()) {
    const names = [];
    const seen = new Set();
    let current = node;
    while (current) {
      if (seen.has(current.id) || seen.size >= 30) throw invalid();
      seen.add(current.id);
      names.unshift(current.title);
      if (current.parentId === null) break;
      current = nodes.get(current.parentId);
      if (!current) throw invalid();
    }
    if (names.join(' > ') !== node.path || node.isLeaf === parents.has(node.id)) throw invalid();
  }
  return [...nodes.values()];
}

/** Vinteds vollständige Verkaufskategorien, nicht der öffentliche Suchkatalog. */
export function flattenVintedSellingCatalogs(input) {
  if (!input || !Array.isArray(input.catalogs)) throw invalid();
  const rows = [];
  const visit = (catalogs, parentId, names) => {
    if (names.length >= 30 || !Array.isArray(catalogs)) throw invalid();
    for (const catalog of catalogs) {
      if (!catalog || !Array.isArray(catalog.catalogs) || rows.length >= 10000) throw invalid();
      const path = [...names, catalog.title];
      rows.push({
        id: catalog.id,
        parentId,
        title: catalog.title,
        path: path.join(' > '),
        isLeaf: catalog.catalogs.length === 0,
      });
      visit(catalog.catalogs, catalog.id, path);
    }
  };
  visit(input.catalogs, null, []);
  return parseVintedSellingTree(rows);
}
