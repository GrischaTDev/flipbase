const navigationParameters = new Set([
  'order',
  'page',
  'per_page',
  'search_id',
  'time',
  'referrer',
]);

export interface VintedFeedImport {
  categoryId: number | null;
  brandId: number | null;
  searchText: string;
  minPrice: number | null;
  maxPrice: number | null;
  conditionId: number | null;
  sizeIds: number[];
}

function parseId(value: string): number {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || id > 2_147_483_647)
    throw new Error('Der Link enthält eine ungültige Vinted-Kennung.');
  return id;
}

export function parseVintedFeedLink(value: string): VintedFeedImport {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Bitte einen Vinted-Kataloglink eingeben.');
  }
  const route = /^\/catalog(?:\/([1-9]\d*)(?:-[^/]+)?)?\/?$/.exec(url.pathname);
  if (
    url.protocol !== 'https:' ||
    !['vinted.de', 'www.vinted.de'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !route
  )
    throw new Error('Bitte einen Kataloglink von vinted.de eingeben.');

  const ids = {
    brand: new Set<number>(),
    category: new Set<number>(),
    condition: new Set<number>(),
    size: new Set<number>(),
  };
  if (route[1]) ids.category.add(parseId(route[1]));
  const fields = new Map<string, string>();
  for (const [rawKey, rawValue] of url.searchParams) {
    const key = rawKey.replace(/\[\d*\]$/, '');
    const value = rawValue.trim();
    if (!value || navigationParameters.has(key) || key.startsWith('utm_')) continue;
    if (key === 'catalog' || key === 'catalog_ids') ids.category.add(parseId(value));
    else if (key === 'brand_ids') ids.brand.add(parseId(value));
    else if (key === 'status_ids') ids.condition.add(parseId(value));
    else if (key === 'size_ids') ids.size.add(parseId(value));
    else if (
      ['price_from', 'price_to', 'search_text', 'search_text_mode', 'currency'].includes(key)
    ) {
      if (fields.has(key) && fields.get(key) !== value)
        throw new Error('Der Link enthält widersprüchliche Filter.');
      fields.set(key, value);
    } else {
      throw new Error(`Der Feed kann den Linkfilter „${rawKey.slice(0, 40)}“ nicht übernehmen.`);
    }
  }
  if (ids.brand.size > 1 || ids.category.size > 1 || ids.condition.size > 1)
    throw new Error('Der Feed unterstützt je Suchfilter eine Marke, Kategorie und einen Zustand.');
  const searchText = fields.get('search_text') ?? '';
  if (
    fields.has('search_text_mode') &&
    (fields.get('search_text_mode') !== 'all' || /\s/u.test(searchText))
  )
    throw new Error('Die Suchverknüpfung aus diesem Link wird im Feed nicht unterstützt.');
  if (fields.has('currency') && fields.get('currency') !== 'EUR')
    throw new Error('Der Feed unterstützt Preisfilter in EUR.');
  const price = (key: string) => {
    const raw = fields.get(key);
    if (raw === undefined) return null;
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw))
      throw new Error('Der Link enthält eine ungültige Preisgrenze.');
    return Number(raw);
  };
  const minPrice = price('price_from');
  const maxPrice = price('price_to');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice)
    throw new Error('Der Mindestpreis liegt über dem Höchstpreis.');
  if (searchText.length > 200) throw new Error('Der Suchbegriff im Link ist zu lang.');
  return {
    categoryId: [...ids.category][0] ?? null,
    brandId: [...ids.brand][0] ?? null,
    conditionId: [...ids.condition][0] ?? null,
    sizeIds: [...ids.size],
    searchText,
    minPrice,
    maxPrice,
  };
}
