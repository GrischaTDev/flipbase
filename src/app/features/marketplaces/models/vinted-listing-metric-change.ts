import type { MarketplaceMetrics } from './marketplace.models';

export interface VintedListingMetricChange {
  readonly views: number;
  readonly favorites: number;
  readonly observedAt: string;
}

export type VintedListingMetricChanges = Readonly<
  Partial<Record<string, VintedListingMetricChange>>
>;

export interface VintedListingMetricObservation {
  readonly metrics: MarketplaceMetrics;
  readonly change: VintedListingMetricChange | null;
}

export function observeVintedListingMetrics(
  previous: MarketplaceMetrics | null,
  next: MarketplaceMetrics,
): VintedListingMetricObservation | null {
  const nextTime = next.observedAt ? Date.parse(next.observedAt) : NaN;
  if (!Number.isFinite(nextTime)) return null;
  const previousTime = previous?.observedAt ? Date.parse(previous.observedAt) : NaN;
  if (Number.isFinite(previousTime) && nextTime <= previousTime) return null;
  const validCounter = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const increase = (before: number | null | undefined, after: number | null) =>
    validCounter(before) && validCounter(after) ? Math.max(0, after - before) : 0;
  const views = Number.isFinite(previousTime) ? increase(previous?.views, next.views) : 0;
  const favorites = Number.isFinite(previousTime)
    ? increase(previous?.favorites, next.favorites)
    : 0;
  return {
    metrics: next,
    change: views || favorites ? { views, favorites, observedAt: next.observedAt! } : null,
  };
}
