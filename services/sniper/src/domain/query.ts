export type QueryStatus = 'never_polled' | 'ok' | 'rate_limited' | 'forbidden' | 'failed';

export type QueryRunState = 'ready' | 'cooldown' | 'blocked' | 'invalid';

export interface QueryKeyInput {
  searchText: string | null;
  catalogId?: number | null;
  brandId?: number | null;
  priceTo?: number | null;
  priceFrom?: number | null;
}

export interface SniperQuery {
  id: string;
  queryKey: string;
  marketplace: 'vinted';
  searchText: string | null;
  catalogId: number | null;
  brandId: number | null;
  priceTo: number | null;
  priceFrom: number | null;
  pollIntervalMs: number;
  isSeeded: boolean;
  isActive: boolean;
  runState: QueryRunState;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorKind: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastPolledAt: string | null;
  lastStatus: QueryStatus;
  consecutiveFailures: number;
}

const ABSENT = '-';

function part(value: number | null | undefined): string {
  return value === null || value === undefined ? ABSENT : String(value);
}

/**
 * Zwei Filter mit demselben Schluessel teilen sich eine Vinted-Abfrage. Der
 * Schluessel muss deshalb genau die Parameter enthalten, die an Vinted gehen -
 * nicht mehr, sonst zerfaellt die Zusammenfassung, und nicht weniger, sonst
 * bekaeme ein Filter Ergebnisse einer fremden Abfrage.
 */
export function buildQueryKey(input: QueryKeyInput): string {
  const searchText = (input.searchText ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  return [
    'vinted',
    `search=${searchText}`,
    `catalog=${part(input.catalogId)}`,
    `brand=${part(input.brandId)}`,
    `price_from=${part(input.priceFrom)}`,
    `price_to=${part(input.priceTo)}`,
  ].join('|');
}
