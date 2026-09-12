import { Database } from '../../../core/models/supabase.types';

export type SniperQuery = Database['public']['Tables']['sniper_queries']['Row'];
export type SniperRuntimeStatus = Database['public']['Tables']['sniper_runtime_status']['Row'];
export interface QueryDraft {
  id: string | null;
  searchText: string;
  catalogId: number | null;
  brandId: number | null;
  priceFrom: number | null;
  priceTo: number | null;
  intervalSeconds: number;
  notes: string;
}

/** Uebernimmt ausschliesslich unterstuetzte Filter, ohne den Link abzurufen. */
export function parseVintedSearchUrl(value: string): Partial<QueryDraft> {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !['www.vinted.de', 'vinted.de'].includes(url.hostname) ||
    url.pathname !== '/catalog'
  ) {
    throw new Error(
      'Bitte einen deutschen Vinted-Suchlink (https://www.vinted.de/catalog?…) verwenden.',
    );
  }
  const params = url.searchParams;
  const allowed = new Set([
    'search_text',
    'catalog_ids',
    'catalog_ids[]',
    'brand_ids',
    'brand_ids[]',
    'price_from',
    'price_to',
    'order',
    'page',
    'currency',
  ]);
  for (const key of params.keys()) {
    if (!allowed.has(key))
      throw new Error(
        `Der Filter „${key}“ wird noch nicht unterstützt. Bitte im Vinted-Suchlink entfernen.`,
      );
  }
  const id = (key: string): number | null => {
    const values = [...params.getAll(key), ...params.getAll(`${key}[]`)];
    if (!values.length) return null;
    if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0]))
      throw new Error('Pro Auftrag bitte höchstens eine Kategorie und eine Marke wählen.');
    const result = Number(values[0]);
    if (result > 2147483647) throw new Error('Die Kennung ist zu groß.');
    return result;
  };
  const price = (key: string): number | null => {
    const value = params.get(key);
    if (value === null) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(value))
      throw new Error('Der Suchlink enthält einen ungültigen Preis.');
    return Number(value);
  };
  if (params.has('currency') && params.get('currency') !== 'EUR')
    throw new Error('Bitte Preise in EUR verwenden.');
  return {
    searchText: params.get('search_text') ?? '',
    catalogId: id('catalog_ids'),
    brandId: id('brand_ids'),
    priceFrom: price('price_from'),
    priceTo: price('price_to'),
  };
}

export function queryDraftError(draft: QueryDraft): string | null {
  if (!draft.catalogId && draft.brandId === null && !draft.searchText.trim())
    return 'Bitte eine Kategorie, Marke oder einen Suchbegriff angeben.';
  if (draft.searchText.length > 200 || draft.notes.length > 2000)
    return 'Suchbegriff (200 Zeichen) oder Notiz (2.000 Zeichen) ist zu lang.';
  if (
    !Number.isInteger(draft.intervalSeconds) ||
    draft.intervalSeconds < 10 ||
    draft.intervalSeconds > 86400
  )
    return 'Der Takt muss zwischen 10 und 86.400 Sekunden liegen.';
  if (
    draft.brandId !== null &&
    (!Number.isInteger(draft.brandId) || draft.brandId < 1 || draft.brandId > 2147483647)
  )
    return 'Bitte eine gültige Markenkennung angeben.';
  for (const price of [draft.priceFrom, draft.priceTo]) {
    if (price !== null && (!Number.isFinite(price) || price < 0 || price >= 1e10))
      return 'Bitte einen gültigen, nicht negativen Preis angeben.';
  }
  if (draft.priceFrom !== null && draft.priceTo !== null && draft.priceFrom > draft.priceTo)
    return 'Der Mindestpreis darf nicht über dem Höchstpreis liegen.';
  return null;
}

export function queryStatusLabel(query: SniperQuery): string {
  const status = {
    never_polled: 'Noch nicht abgefragt',
    ok: 'Erfolgreich',
    rate_limited: 'Anfragelimit erreicht',
    forbidden: 'Zugriff abgewiesen',
    failed: 'Abfrage fehlgeschlagen',
  };
  return status[query.last_status as keyof typeof status] ?? query.last_status;
}
