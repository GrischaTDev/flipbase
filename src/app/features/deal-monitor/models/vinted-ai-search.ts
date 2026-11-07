export type VintedAiModel = 'gpt-6-luna' | 'gpt-6.1-terra' | 'gpt-6.1-sol' | 'gpt-6-astra';
export const VINTED_AI_MODELS = [
  { value: 'gpt-6-luna' as const, label: 'GPT-6 Luna · sparsam' },
  { value: 'gpt-6.1-terra' as const, label: 'GPT-6.1 Terra' },
  { value: 'gpt-6.1-sol' as const, label: 'GPT-6.1 Sol' },
  { value: 'gpt-6-astra' as const, label: 'GPT-6 Astra' },
];
export interface VintedAiComparison {
  title: string;
  url: string;
  kind: 'manufacturer' | 'retail' | 'sold' | 'asking';
  price: number;
  evidence: string;
  sameVariant?: boolean;
  match?: 'model' | 'category' | 'different';
  listingDate?: {
    status: 'within_window' | 'outside_window' | 'unknown';
    earliest: string | null;
    latest: string | null;
    label: string | null;
    checkedAt: string | null;
    source: 'vinted_listing' | 'unverified';
  };
}
export interface VintedAiUsageSummary {
  model: VintedAiModel;
  requests: number;
  unknown_cost_requests: number;
  total_tokens: number;
  web_search_calls: number;
  estimated_cost_usd: number | null;
  average_cost_usd: number | null;
}
export interface VintedAiResearchSection {
  summary: string;
  limitations: string[];
  completed: boolean;
  sources: { title: string; url: string }[];
}
export interface VintedAiResult {
  analysis: {
    modelName: string;
    confidence: 'exact' | 'likely' | 'unknown';
    evidence: string;
    comparisons: VintedAiComparison[];
    soldAverage: number | null;
    askingAverage: number | null;
    comparisonBasis?: 'model' | 'category';
    marketWindow?: {
      days: 30;
      checkedAt: string;
      verifiedCount: number;
      undatedCount: number;
      excludedCount: number;
    };
    currentMarket?: {
      low: number;
      high: number;
      count: number;
      basis: 'sold' | 'asking';
      match: 'model' | 'category';
    } | null;
    newPriceRange?: { low: number; high: number; count: number } | null;
    research?: {
      identification: VintedAiResearchSection;
      retail: VintedAiResearchSection;
      used: VintedAiResearchSection;
    } | null;
    resale: { low: number; high: number; basis: 'sold' | 'asking'; count: number } | null;
  };
  model: VintedAiModel;
  cacheHit: boolean;
  searchedAt: string;
  listing: {
    title: string;
    itemPrice: number;
    totalPrice: number | null;
    currency: string;
    photoCount: number;
    detailsStatus?: 'loaded' | 'unavailable' | null;
    hasDescription: boolean;
  };
  usage: {
    inputTokens: number | null;
    cachedInputTokens: number;
    outputTokens: number | null;
    webSearchCalls: number;
    estimatedCostUsd: number | null;
    knownCostUsd?: number | null;
    incomplete?: boolean;
  };
  stats: VintedAiUsageSummary[];
}

export function resaleEstimate(
  result: VintedAiResult | null,
  shipping: number | null = 0,
  feePercent: number | null = 0,
  otherCosts: number | null = 0,
) {
  const resale = result?.analysis.resale;
  if (
    !resale ||
    !result ||
    result.listing.totalPrice === null ||
    shipping === null ||
    feePercent === null ||
    otherCosts === null ||
    ![shipping, feePercent, otherCosts].every((value) => Number.isFinite(value) && value >= 0) ||
    feePercent > 100
  )
    return null;
  const purchaseCost =
    Math.max(result.listing.totalPrice, result.listing.itemPrice) + shipping + otherCosts;
  const low = Math.round((resale.low * (1 - feePercent / 100) - purchaseCost) * 100) / 100;
  const high = Math.round((resale.high * (1 - feePercent / 100) - purchaseCost) * 100) / 100;
  const roi = purchaseCost > 0 ? (low / purchaseCost) * 100 : 0;
  // Grün nur bei belegten Verkäufen und konservativ mindestens 20 EUR/30 %.
  const tone =
    high <= 0
      ? 'red'
      : low >= 20 &&
          roi >= 30 &&
          resale.basis === 'sold' &&
          result.analysis.confidence === 'exact' &&
          result.analysis.comparisonBasis !== 'category'
        ? 'green'
        : 'yellow';
  return {
    low,
    high,
    purchaseCost,
    tone,
    position: tone === 'green' ? 16 : tone === 'yellow' ? 50 : 84,
  };
}
