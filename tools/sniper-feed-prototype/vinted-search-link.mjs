const vintedMarkets = new Set([
  'de',
  'fr',
  'it',
  'es',
  'nl',
  'pl',
  'co.uk',
  'at',
  'be',
  'cz',
  'lt',
  'lu',
  'pt',
  'sk',
  'hr',
  'dk',
  'ee',
  'fi',
  'gr',
  'hu',
  'ie',
  'lv',
  'ro',
  'si',
  'se',
  'com',
  'com.au',
]);

const idParameters = {
  catalog: 'catalogIds',
  catalog_ids: 'catalogIds',
  brand_ids: 'brandIds',
  size_ids: 'sizeIds',
  status_ids: 'conditionIds',
  color_ids: 'colorIds',
  material_ids: 'materialIds',
};

const navigationParameters = new Set([
  'order',
  'page',
  'per_page',
  'search_id',
  'time',
  'referrer',
]);

function parseId(value) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error('Ungültige Vinted-Filterkennung.');
  }
  return Number(value);
}

function parsePrice(value) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Ungültige Vinted-Preisgrenze.');
  }
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Importiert Suchwerte. Unbekannte gesetzte Filter werden zur manuellen Prüfung ausgewiesen. */
export function importVintedSearchLink(link) {
  const url = new URL(link);
  const domain = url.hostname.replace(/^www\./, '');
  const market = domain.startsWith('vinted.') ? domain.slice('vinted.'.length) : '';
  const route = /^\/catalog(?:\/([1-9]\d*)(?:-[^/]+)?)?\/?$/.exec(url.pathname);
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    !vintedMarkets.has(market) ||
    !route
  ) {
    throw new Error('Gib einen Vinted-Kataloglink ein.');
  }

  const result = {
    market,
    catalogIds: [],
    brandIds: [],
    sizeIds: [],
    conditionIds: [],
    colorIds: [],
    materialIds: [],
    terms: '',
    termMode: 'all',
    minPrice: null,
    maxPrice: null,
    currency: null,
    unsupported: [],
  };
  const singletonKeys = new Set();
  for (const [rawKey, value] of url.searchParams) {
    const key = rawKey.replace(/\[\d*\]$/, '');
    if (Object.hasOwn(idParameters, key)) {
      result[idParameters[key]].push(parseId(value));
      continue;
    }
    if (navigationParameters.has(key) || key.startsWith('utm_') || !value.trim()) continue;
    if (singletonKeys.has(key)) throw new Error('Der Link enthält mehrdeutige Suchwerte.');
    singletonKeys.add(key);
    switch (key) {
      case 'search_text':
        result.terms = value.trim();
        break;
      case 'search_text_mode':
        if (value !== 'any' && value !== 'all') throw new Error('Unbekannte Suchverknüpfung.');
        result.termMode = value;
        break;
      case 'price_from':
        result.minPrice = parsePrice(value);
        break;
      case 'price_to':
        result.maxPrice = parsePrice(value);
        break;
      case 'currency':
        if (!/^[A-Z]{3}$/.test(value)) throw new Error('Ungültige Angebotswährung.');
        result.currency = value;
        break;
      default:
        result.unsupported.push(rawKey);
    }
  }
  if (route[1]) result.catalogIds.push(parseId(route[1]));
  if (result.minPrice !== null && result.maxPrice !== null && result.minPrice > result.maxPrice) {
    throw new Error('Der Mindestpreis liegt über dem Höchstpreis.');
  }
  for (const key of new Set(Object.values(idParameters))) {
    result[key] = [...new Set(result[key])].sort((first, second) => first - second);
  }
  return result;
}
