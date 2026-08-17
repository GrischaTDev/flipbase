export type PriceTrend = 'rising' | 'falling' | 'stable';
export type PriceAlert = 'undercut' | 'price_surge' | 'none';

export interface PricePoint {
  timestamp: string;
  avgPrice: number;
  lowestPrice: number;
  listingsCount: number;
}

export interface PriceTrackedItem {
  id: string;
  workspace_id: string;
  inventory_item_id?: string;
  title: string;
  category: string;
  currentOurPrice: number;
  currentMarketAverage: number;
  currentMarketLowest: number;
  recommendedPrice: number;
  lowestCompetitorUrl?: string;
  lowestCompetitorTitle?: string;
  lowestCompetitorPlatform?: 'ebay' | 'kleinanzeigen' | 'vinted';
  priceTrend: PriceTrend;
  priceDifferencePercent: number; // e.g. -12.5% (unterboten) or +8.2% (teurer)
  priceHistory: PricePoint[];
  alertTriggered: PriceAlert;
  lastCheckedAt: string;
  isTrackingActive: boolean;
}
