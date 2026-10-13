import type { EbayTrafficDay } from '../../../../../supabase/functions/_shared/ebay-contracts';

export function summarizeEbayTraffic(days: readonly EbayTrafficDay[]) {
  const sum = (
    key: 'impressions' | 'views' | 'transactions' | 'searchImpressions' | 'searchViews',
  ) =>
    days.length && days.every((day) => day[key] !== null)
      ? days.reduce((total, day) => total + (day[key] ?? 0), 0)
      : null;
  const ratio = (numerator: number | null, denominator: number | null) =>
    numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;
  const views = sum('views');
  const transactions = sum('transactions');
  return {
    impressions: sum('impressions'),
    views,
    transactions,
    clickThroughRate: ratio(sum('searchViews'), sum('searchImpressions')),
    conversionRate: ratio(transactions, views),
    missingDays: days.filter((day) =>
      [day.impressions, day.views, day.transactions, day.searchImpressions, day.searchViews].some(
        (metric) => metric === null,
      ),
    ).length,
  };
}
