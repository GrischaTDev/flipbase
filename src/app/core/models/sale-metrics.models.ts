export interface SaleMetricsInput {
  readonly itemRevenue: number;
  readonly buyerShippingRevenue: number;
  readonly costOfGoodsSold: number | null;
  readonly platformFees: number;
  readonly sellerShippingCost: number;
  readonly extraCosts: readonly { readonly amount: number }[];
  readonly refundAmount?: number;
}

export interface SaleMetrics {
  readonly revenue: number;
  readonly costOfGoodsSold: number | null;
  readonly sellingCosts: number;
  readonly resultAfterDirectCosts: number | null;
  readonly marginPercent: number | null;
  readonly roiPercent: number | null;
}
