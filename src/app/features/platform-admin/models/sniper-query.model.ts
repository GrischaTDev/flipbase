import { Database } from '../../../core/models/supabase.types';
import { VintedBrand } from './vinted-brand.model';

export type TitleKeywordMode = 'all' | 'any';
interface SearchFilterColumns {
  brand_ids: number[];
  brand_names: string[];
  title_keywords: string[];
  keyword_mode: string;
  filter_revision: number;
  filter_format_version: number;
  request_cursor: number;
  seeded_requests: number[];
}
// Alte geladene Zeilen und bestehende Testdaten haben diese Felder noch nicht.
export type SniperQuery = Omit<
  Database['public']['Tables']['sniper_queries']['Row'],
  keyof SearchFilterColumns
> &
  Partial<SearchFilterColumns>;
export type SniperRuntimeStatus = Omit<
  Database['public']['Tables']['sniper_runtime_status']['Row'],
  'search_filter_version' | 'search_filter_reported_at'
> & {
  search_filter_version?: number;
  search_filter_reported_at?: string | null;
};

export function formatBotUptime(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [hours, minutes, seconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
}

export interface QueryDraft {
  id: string | null;
  title: string;
  brandId: number | null;
  intervalSeconds: number;
  notes: string;
  catalogId?: number | null;
  brands?: VintedBrand[];
  titleKeywords?: string[];
  keywordMode?: TitleKeywordMode;
  revision?: number | null;
  searchText?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
}

export function normalizeFilterKeyword(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{Dash_Punctuation}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function queryDraftError(draft: QueryDraft): string | null {
  if (!draft.title.trim()) return 'Bitte einen Filtername angeben.';
  if ([...draft.title].length > 100) return 'Der Filtername darf höchstens 100 Zeichen lang sein.';
  const validId = (id: number) => Number.isInteger(id) && id > 0 && id <= 2147483647;
  if (draft.brandId !== null && !validId(draft.brandId))
    return 'Bitte eine gültige Vinted-Marke auswählen.';
  const brands = draft.brands ?? (draft.brandId === null ? [] : [{ id: draft.brandId, name: '' }]);
  if (brands.length > 10 || brands.some((brand) => !validId(brand.id)))
    return 'Bitte höchstens zehn gültige Vinted-Marken auswählen.';
  if (draft.brands?.some((brand) => !brand.name.trim() || [...brand.name].length > 100))
    return 'Eine ausgewählte Marke hat keinen gültigen Namen.';
  if (draft.catalogId !== undefined && draft.catalogId !== null && !validId(draft.catalogId))
    return 'Bitte eine gültige Vinted-Kategorie auswählen.';
  const terms = draft.titleKeywords ?? [];
  if (
    terms.length > 10 ||
    terms.some(
      (term) =>
        typeof term !== 'string' ||
        [...normalizeFilterKeyword(term)].length > 80 ||
        !/[\p{L}\p{N}]/u.test(normalizeFilterKeyword(term)),
    )
  ) {
    return 'Bitte höchstens zehn Titelbegriffe mit jeweils 1 bis 80 Zeichen angeben.';
  }
  if (draft.keywordMode !== undefined && draft.keywordMode !== 'all' && draft.keywordMode !== 'any')
    return 'Bitte die Verknüpfung der Titelbegriffe auswählen.';
  if (!brands.length && draft.catalogId == null && !terms.length && !draft.searchText?.trim()) {
    return draft.catalogId === undefined
      ? 'Bitte eine gültige Vinted-Marke auswählen.'
      : 'Bitte mindestens eine Kategorie, Marke oder einen Titelbegriff auswählen.';
  }
  if ([...draft.notes].length > 2000) return 'Die Notiz darf höchstens 2.000 Zeichen lang sein.';
  if (
    !Number.isInteger(draft.intervalSeconds) ||
    draft.intervalSeconds < 10 ||
    draft.intervalSeconds > 86400
  )
    return 'Der Takt muss zwischen 10 und 86.400 Sekunden liegen.';
  if (draft.searchText && [...draft.searchText].length > 200)
    return 'Der vorhandene Suchtext darf höchstens 200 Zeichen lang sein.';
  for (const price of [draft.priceFrom, draft.priceTo]) {
    if (
      price != null &&
      (!Number.isFinite(price) ||
        price < 0 ||
        price > 9999999999.99 ||
        Number(price.toFixed(2)) !== price)
    )
      return 'Bitte einen gültigen Preis angeben.';
  }
  if (draft.priceFrom != null && draft.priceTo != null && draft.priceFrom > draft.priceTo)
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
