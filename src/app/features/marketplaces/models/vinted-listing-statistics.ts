import type { AccountScope } from './marketplace.models';
import { MarketplaceResponseError } from './marketplace-response';

export type VintedStatisticsPeriod = 5 | 60 | 1440 | 10080;
export interface VintedListingStatisticsItem {
  readonly entryId: string;
  readonly observedAt: string;
  readonly baselineAt: string | null;
  readonly views: number | null;
  readonly favorites: number | null;
}
export interface VintedListingStatistics extends AccountScope {
  readonly periodMinutes: VintedStatisticsPeriod;
  readonly items: readonly VintedListingStatisticsItem[];
}
export function parseVintedListingStatistics(
  data: unknown,
  scope: AccountScope,
  period: VintedStatisticsPeriod,
): VintedListingStatistics {
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new MarketplaceResponseError();
    return value as Record<string, unknown>;
  };
  const date = (value: unknown): string => {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
      throw new MarketplaceResponseError();
    return value;
  };
  const counter = (value: unknown): number | null => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      throw new MarketplaceResponseError();
    return value;
  };
  const response = record(data);
  if (
    response['workspaceId'] !== scope.workspaceId ||
    response['connectionId'] !== scope.connectionId ||
    response['periodMinutes'] !== period ||
    !Array.isArray(response['items'])
  )
    throw new MarketplaceResponseError();
  const ids = new Set<string>();
  const items = response['items'].map((value: unknown) => {
    const item = record(value);
    const entryId = item['entryId'];
    if (typeof entryId !== 'string' || !entryId || ids.has(entryId))
      throw new MarketplaceResponseError();
    ids.add(entryId);
    const observedAt = date(item['observedAt']);
    const baselineAt = item['baselineAt'] === null ? null : date(item['baselineAt']);
    const views = counter(item['views']);
    const favorites = counter(item['favorites']);
    if (
      (baselineAt && Date.parse(baselineAt) >= Date.parse(observedAt)) ||
      (!baselineAt && (views !== null || favorites !== null))
    )
      throw new MarketplaceResponseError();
    return { entryId, observedAt, baselineAt, views, favorites };
  });
  return { ...scope, periodMinutes: period, items };
}
