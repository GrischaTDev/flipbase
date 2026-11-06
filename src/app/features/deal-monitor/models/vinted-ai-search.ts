export type VintedAiModel = 'gpt-6-luna' | 'gpt-6.1-sol';
export interface VintedAiComparison {
  title: string;
  url: string;
  kind: 'manufacturer' | 'retail' | 'sold' | 'asking';
  price: number;
  evidence: string;
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
export interface VintedAiResult {
  analysis: {
    modelName: string;
    confidence: 'exact' | 'likely' | 'unknown';
    evidence: string;
    comparisons: VintedAiComparison[];
    soldAverage: number | null;
    askingAverage: number | null;
    resale: { low: number; high: number; basis: 'sold' | 'asking'; count: number } | null;
  };
  model: VintedAiModel;
  cacheHit: boolean;
  searchedAt: string;
  listing: {
    title: string;
    itemPrice: number;
    totalPrice: number;
    currency: string;
    photoCount: number;
    hasDescription: boolean;
  };
  usage: {
    inputTokens: number | null;
    cachedInputTokens: number;
    outputTokens: number | null;
    webSearchCalls: number;
    estimatedCostUsd: number | null;
  };
  stats: VintedAiUsageSummary[];
}

export function resaleEstimate(
  result: VintedAiResult | null,
  shipping: number | null,
  feePercent: number | null,
  otherCosts: number | null,
) {
  const resale = result?.analysis.resale;
  if (
    !resale ||
    !result ||
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
    high <= 0 ? 'red' : low >= 20 && roi >= 30 && resale.basis === 'sold' ? 'green' : 'yellow';
  return {
    low,
    high,
    purchaseCost,
    tone,
    position: tone === 'green' ? 16 : tone === 'yellow' ? 50 : 84,
  };
}
