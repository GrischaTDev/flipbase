import { describe, it, expect, beforeEach } from 'vitest';
import { ProfitEngineService } from './profit-engine.service';

describe('ProfitEngineService (Deterministic Logic)', () => {
  let service: ProfitEngineService;

  beforeEach(() => {
    service = new ProfitEngineService();
  });

  it('should calculate profit correctly: Profit = Sale Price - Total Costs', () => {
    // Example from Chapter 11 & 12: Sale 75 €, Total Costs: 20 + 7 + 4.5 + 1.2 + 5 + 6.99 = 44.69 €
    const profit = service.calculateProfit(75.0, 44.69);
    expect(profit).toBe(30.31);
  });

  it('should calculate ROI correctly: ROI = (Profit / Invested Capital) * 100', () => {
    // Invested 20 €, Profit 37 € -> 185%
    const roi = service.calculateRoi(37, 20);
    expect(roi).toBe(185);
  });

  it('verteilt Kosten gleichmäßig: 1.600 € auf 100 Artikel ergibt 16 € je Artikel', () => {
    const anteile = service.allocateCosts(1600, new Array(100).fill(1));

    expect(anteile.every((a) => a === 16.0)).toBe(true);
    expect(anteile.reduce((s, a) => s + Math.round(a * 100), 0)).toBe(160000);
  });

  it('verteilt Kosten wertgewichtet nach erwartetem Marktwert', () => {
    // 1.600 € Gesamtkosten, erwartete Werte 160 € und 3.040 € (Summe 3.200 €)
    const anteile = service.allocateCosts(1600, [160, 3040]);

    expect(anteile[0]).toBe(80.0);
    expect(anteile.reduce((s, a) => s + Math.round(a * 100), 0)).toBe(160000);
  });

  it('should calculate max buy price considering target ROI and min profit', () => {
    // Fair value 70 €, estimated costs 8 €, min ROI 30%, min profit 15 €
    const maxBuy = service.calculateMaxBuyPrice(70, 8, 30, 15);
    expect(maxBuy).toBeGreaterThan(0);
    expect(maxBuy).toBeLessThan(70);
  });

  it('should calculate robust median and filter extreme outliers', () => {
    // Example from Chapter 18: [69, 72, 75, 78, 999]
    // 999 should not heavily distort the median
    const stats = service.calculateRobustMarketStats([69, 72, 75, 78, 999]);
    expect(stats.median).toBeCloseTo(73.5, 1);
  });

  it('should evaluate deals with correct deal score verdicts', () => {
    const result = service.evaluateDeal(25, 70, 8, 30, 15, 90);
    expect(result.dealScore).toBeGreaterThanOrEqual(70);
    expect(result.verdict).toBeDefined();
    expect(result.expectedProfit).toBe(37); // 70 - (25 + 8) = 37 €
  });
});
