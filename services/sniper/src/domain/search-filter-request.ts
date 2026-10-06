import type { SniperQuery } from './query.js';
import { normalizeTitleKeywords } from './title-keywords.js';

export interface SearchFilterRequest {
  brandId: number | null;
  searchText: string | null;
  catalogId: number | null;
  index: number;
  count: number;
}

/** Ein Abruf je Takt. Mehrere Marken und ODER-Begriffe laufen im gespeicherten Wechsel. */
export function searchFilterRequest(query: SniperQuery): SearchFilterRequest {
  const keywords = [...normalizeTitleKeywords(query.titleKeywords ?? [])];
  if (
    query.keywordMode !== undefined &&
    query.keywordMode !== 'all' &&
    query.keywordMode !== 'any'
  ) {
    throw new Error('Unbekannte Verknüpfung der Titelbegriffe.');
  }
  const ids = query.brandIds?.length
    ? query.brandIds
    : query.brandId === null
      ? []
      : [query.brandId];
  if (ids.length > 10 || ids.some((id) => !Number.isInteger(id) || id <= 0 || id > 2147483647)) {
    throw new Error('Ungültige Marken im Suchfilter.');
  }
  if (
    query.catalogId !== null &&
    (!Number.isInteger(query.catalogId) || query.catalogId <= 0 || query.catalogId > 2147483647)
  ) {
    throw new Error('Ungültige Kategorie im Suchfilter.');
  }
  const brands: (number | null)[] = ids.length ? [...new Set(ids)].sort((a, b) => a - b) : [null];
  const legacyText = query.searchText?.trim() || null;
  // Ein alter Suchtext bleibt unverändert eine vorgelagerte Einschränkung.
  const terms: (string | null)[] = legacyText
    ? [legacyText]
    : keywords.length
      ? query.keywordMode === 'any'
        ? keywords
        : [keywords[0]!]
      : [null];
  if (brands[0] === null && query.catalogId === null && terms[0] === null) {
    throw new Error('Ein Suchfilter muss mindestens eine Bedingung enthalten.');
  }
  const count = brands.length * terms.length;
  const cursor = query.requestCursor ?? 0;
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= 2147483647) {
    throw new Error('Ungültige Abrufposition im Suchfilter.');
  }
  const index = cursor % count;
  return {
    brandId: brands[Math.floor(index / terms.length)]!,
    searchText: terms[index % terms.length]!,
    catalogId: query.catalogId,
    index,
    count,
  };
}
