import { Injectable } from '@angular/core';

export interface DealEvaluationResult {
  askingPrice: number;
  fairMarketValue: number;
  fastSalePrice: number;
  recommendedListingPrice: number;
  expectedCosts: number;
  expectedProfit: number;
  expectedRoiPercent: number;
  dealScore: number;
  maxBuyPrice: number;
  confidenceScore: number;
  verdict: 'very_attractive' | 'good' | 'acceptable' | 'weak' | 'bad';
}

@Injectable({
  providedIn: 'root',
})
export class ProfitEngineService {
  /**
   * Deterministically calculates net profit.
   * Profit = Sale Price - Total Costs
   */
  calculateProfit(salePrice: number, totalCosts: number): number {
    return Number((salePrice - totalCosts).toFixed(2));
  }

  /**
   * Deterministically calculates ROI in percent.
   * ROI = (Profit / Invested Capital) * 100
   */
  calculateRoi(profit: number, investedCapital: number): number {
    if (investedCapital <= 0) return 0;
    return Number(((profit / investedCapital) * 100).toFixed(2));
  }

  /**
   * Calculates holding duration in full days between purchase and sale.
   */
  calculateHoldingDurationDays(
    purchaseDate: string | Date,
    saleDate: string | Date = new Date(),
  ): number {
    const start = new Date(purchaseDate).getTime();
    const end = new Date(saleDate).getTime();
    const diffMs = Math.max(0, end - start);
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Distributes total purchase costs across items evenly.
   */
  /**
   * Verteilt einen Gesamtbetrag exakt auf mehrere Artikel.
   *
   * Rechnet durchgehend in ganzen Cent und vergibt den unvermeidbaren Rest
   * nach dem Verfahren des grössten Restes. Dadurch entspricht die Summe der
   * Rückgabewerte **immer** exakt dem Gesamtbetrag.
   *
   * Zuvor wurde je Artikel einzeln gerundet: 100 € auf 3 Artikel ergaben
   * 33,33 € × 3 = 99,99 €. Der fehlende Cent verfälschte den Wareneinsatz und
   * damit auch das § 25a-Journal und den DATEV-Export.
   *
   * @param totalCost Gesamtbetrag in Euro. Negative Werte gelten als 0.
   * @param weights   Gewicht je Artikel, etwa der erwartete Verkaufswert.
   *                  Sind alle Gewichte 0 oder negativ, wird gleichmässig
   *                  verteilt – sonst bekäme jeder Artikel 0 € und der
   *                  gesamte Einkaufspreis verschwände aus der Kalkulation.
   * @returns Betrag je Artikel in Euro, in derselben Reihenfolge wie `weights`.
   */
  allocateCosts(totalCost: number, weights: readonly number[]): number[] {
    if (weights.length === 0) return [];

    const gesamtCent = Math.max(0, Math.round(totalCost * 100));
    if (gesamtCent === 0) return weights.map(() => 0);

    const gewichte = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
    const gewichtSumme = gewichte.reduce((s, w) => s + w, 0);

    // Ohne brauchbare Gewichte gleichmaessig verteilen.
    const verwendet = gewichtSumme > 0 ? gewichte : gewichte.map(() => 1);
    const summe = gewichtSumme > 0 ? gewichtSumme : verwendet.length;

    // Erst abrunden, dann die verbleibenden Cent nach groesstem Rest vergeben.
    const exakt = verwendet.map((w) => (gesamtCent * w) / summe);
    const cent = exakt.map((c) => Math.floor(c));
    let rest = gesamtCent - cent.reduce((s, c) => s + c, 0);

    const reihenfolge = exakt
      .map((c, index) => ({ index, rest: c - Math.floor(c), gewicht: verwendet[index] }))
      .sort((a, b) => b.rest - a.rest || b.gewicht - a.gewicht || a.index - b.index);

    for (let i = 0; rest > 0; i = (i + 1) % reihenfolge.length) {
      cent[reihenfolge[i].index]++;
      rest--;
    }

    return cent.map((c) => c / 100);
  }

  /**
   * Calculates the maximum reasonable buy price to achieve the user's target ROI and minimum profit.
   */
  calculateMaxBuyPrice(
    fairMarketValue: number,
    estimatedAdditionalCosts: number,
    minRoiPercent = 30,
    minProfitAmount = 15,
  ): number {
    // Formula derived from: FairValue - MaxBuyPrice - AdditionalCosts >= MinProfit
    // and (FairValue - MaxBuyPrice - AdditionalCosts) / (MaxBuyPrice + AdditionalCosts) >= MinRoi / 100
    const profitBound = fairMarketValue - estimatedAdditionalCosts - minProfitAmount;
    const roiMultiplier = 1 + minRoiPercent / 100;
    const roiBound = (fairMarketValue - estimatedAdditionalCosts * roiMultiplier) / roiMultiplier;

    const maxBuy = Math.min(profitBound, roiBound);
    return Math.max(0, Number(maxBuy.toFixed(2)));
  }

  /**
   * Computes Deal Score (0-100) based on weighted factors:
   * 40% Expected ROI
   * 30% Expected Absolute Profit
   * 20% Market Liquidity (estimated from sold vs active ratio or platform data)
   * 10% Confidence Score
   */
  calculateDealScore(
    expectedRoiPercent: number,
    expectedProfit: number,
    liquidityScore = 70, // 0-100
    confidenceScore = 80, // 0-100
  ): number {
    // Score components mapped to 0-100:
    // ROI: 0% -> 0, 50% -> 50, 100%+ -> 100
    const roiComponent = Math.min(100, Math.max(0, expectedRoiPercent));

    // Profit: 0€ -> 0, 50€ -> 70, 100€+ -> 100
    const profitComponent = Math.min(100, Math.max(0, (expectedProfit / 80) * 100));

    // Liquidity: 0-100
    const liquidityComponent = Math.min(100, Math.max(0, liquidityScore));

    // Confidence: 0-100
    const confidenceComponent = Math.min(100, Math.max(0, confidenceScore));

    const totalScore =
      roiComponent * 0.4 +
      profitComponent * 0.3 +
      liquidityComponent * 0.2 +
      confidenceComponent * 0.1;

    return Math.min(100, Math.max(0, Math.round(totalScore)));
  }

  /**
   * Evaluates a complete deal scenario.
   */
  evaluateDeal(
    askingPrice: number,
    fairMarketValue: number,
    estimatedCosts = 0,
    minRoiPercent = 30,
    minProfitAmount = 15,
    confidenceScore = 85,
  ): DealEvaluationResult {
    const fastSalePrice = Number((fairMarketValue * 0.85).toFixed(2));
    const recommendedListingPrice = Number((fairMarketValue * 1.12).toFixed(2));
    const totalInvested = askingPrice + estimatedCosts;
    const expectedProfit = this.calculateProfit(fairMarketValue, totalInvested);
    const expectedRoiPercent = this.calculateRoi(expectedProfit, totalInvested);
    const maxBuyPrice = this.calculateMaxBuyPrice(
      fairMarketValue,
      estimatedCosts,
      minRoiPercent,
      minProfitAmount,
    );
    const dealScore = this.calculateDealScore(
      expectedRoiPercent,
      expectedProfit,
      75,
      confidenceScore,
    );

    let verdict: DealEvaluationResult['verdict'] = 'acceptable';
    if (dealScore >= 86) verdict = 'very_attractive';
    else if (dealScore >= 71) verdict = 'good';
    else if (dealScore >= 51) verdict = 'acceptable';
    else if (dealScore >= 31) verdict = 'weak';
    else verdict = 'bad';

    return {
      askingPrice,
      fairMarketValue,
      fastSalePrice,
      recommendedListingPrice,
      expectedCosts: estimatedCosts,
      expectedProfit,
      expectedRoiPercent,
      dealScore,
      maxBuyPrice,
      confidenceScore,
      verdict,
    };
  }

  /**
   * Calculates robust statistical median and removes extreme outliers.
   */
  calculateRobustMarketStats(prices: number[]): {
    median: number;
    min: number;
    max: number;
    count: number;
  } {
    if (!prices || prices.length === 0) {
      return { median: 0, min: 0, max: 0, count: 0 };
    }

    const sorted = [...prices]
      .filter((p) => typeof p === 'number' && !isNaN(p) && p > 0)
      .sort((a, b) => a - b);
    if (sorted.length === 0) return { median: 0, min: 0, max: 0, count: 0 };

    // Filter outliers using Interquartile Range (IQR) if we have enough data points (>= 4)
    let filtered = sorted;
    if (sorted.length >= 4) {
      const q1Index = Math.floor(sorted.length * 0.25);
      const q3Index = Math.floor(sorted.length * 0.75);
      const q1 = sorted[q1Index];
      const q3 = sorted[q3Index];
      const iqr = q3 - q1;
      const lowerBound = Math.max(0, q1 - 1.5 * iqr);
      const upperBound = q3 + 1.5 * iqr;

      const withoutOutliers = sorted.filter((p) => p >= lowerBound && p <= upperBound);
      if (withoutOutliers.length > 0) {
        filtered = withoutOutliers;
      }
    }

    const mid = Math.floor(filtered.length / 2);
    const median =
      filtered.length % 2 !== 0 ? filtered[mid] : (filtered[mid - 1] + filtered[mid]) / 2;

    return {
      median: Number(median.toFixed(2)),
      min: filtered[0],
      max: filtered[filtered.length - 1],
      count: filtered.length,
    };
  }
}
