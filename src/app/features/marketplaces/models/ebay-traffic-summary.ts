import type { EbayTrafficMetrics } from '../../../../../supabase/functions/_shared/ebay-contracts';

export function calculateEbayTrafficChange(
  current: number | null,
  previous: number | null,
): number | null {
  return current !== null && previous !== null && previous > 0
    ? (current - previous) / previous
    : null;
}

export function summarizeEbayTraffic(days: readonly EbayTrafficMetrics[]) {
  const sum = (key: 'impressions' | 'views' | 'externalViews' | 'transactions') =>
    days.length && days.every((day) => day[key] !== null)
      ? days.reduce((total, day) => total + (day[key] ?? 0), 0)
      : null;
  const ratio = (numerator: number | null, denominator: number | null) =>
    numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;
  const views = sum('views');
  const externalViews = sum('externalViews');
  // Seller Hub zählt für die Klickrate nur Aufrufe über eBay, aber alle Impressionen.
  const viewsOnEbay =
    views !== null &&
    externalViews !== null &&
    days.every(
      (day) => day.views !== null && day.externalViews !== null && day.externalViews <= day.views,
    )
      ? views - externalViews
      : null;
  const transactions = sum('transactions');
  return {
    impressions: sum('impressions'),
    views,
    externalViews,
    viewsOnEbay,
    transactions,
    clickThroughRate: ratio(viewsOnEbay, sum('impressions')),
    conversionRate: ratio(transactions, views),
    missingDays: days.filter((day) =>
      [day.impressions, day.views, day.externalViews, day.transactions].some(
        (metric) => metric === null,
      ),
    ).length,
  };
}
