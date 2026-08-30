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

  it('berechnet Marge und Kapitalrendite aus Brutto-Verkaufserlös und Kostenbasis', () => {
    // eBay: 39,99 € Positionen + 2,99 € Käufer-Versand, 5,19 € Porto und 7,70 € Gebühr.
    const grossRevenue = 42.98;
    const sellingCosts = 5.19 + 7.7;
    const profitBeforeGoodsCost = service.calculateProfit(grossRevenue, sellingCosts);

    expect(profitBeforeGoodsCost).toBe(30.09);
    expect(service.calculateMargin(profitBeforeGoodsCost, grossRevenue)).toBe(70.01);
    expect(service.calculateRoi(profitBeforeGoodsCost, sellingCosts)).toBe(233.44);
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

  it.each([
    {
      askingPrice: 10,
      fairMarketValue: 100,
      confidence: 100,
      score: 95,
      verdict: 'very_attractive',
    },
    { askingPrice: 25, fairMarketValue: 70, confidence: 90, score: 81, verdict: 'good' },
    { askingPrice: 49.5, fairMarketValue: 80, confidence: 0, score: 51, verdict: 'acceptable' },
    { askingPrice: 60, fairMarketValue: 80, confidence: 0, score: 36, verdict: 'weak' },
    { askingPrice: 70, fairMarketValue: 80, confidence: 0, score: 24, verdict: 'bad' },
  ] as const)(
    'ordnet einen Deal mit Score $score als $verdict ein',
    ({ askingPrice, fairMarketValue, confidence, score, verdict }) => {
      const result = service.evaluateDeal(askingPrice, fairMarketValue, 0, 30, 15, confidence);

      expect(result.dealScore).toBe(score);
      expect(result.verdict).toBe(verdict);
    },
  );

  it('liefert bei fehlender Erlös- oder Kostenbasis keine irreführende Prozentzahl', () => {
    expect(service.calculateMargin(10, 0)).toBeNull();
    expect(service.calculateRoi(10, 0)).toBeNull();
    expect(service.calculateRoi(10, -5)).toBeNull();
    expect(service.calculateHoldingDurationDays('2026-08-15', '2026-08-01')).toBe(0);
    expect(service.calculateMaxBuyPrice(10, 8, 30, 15)).toBe(0);
    expect(service.calculateDealScore(-10, -20, -5, -1)).toBe(0);
    expect(service.calculateDealScore(200, 200, 200, 200)).toBe(100);
  });

  it.each([
    { prices: null, expected: { median: 0, min: 0, max: 0, count: 0 } },
    { prices: [Number.NaN, -1, 0], expected: { median: 0, min: 0, max: 0, count: 0 } },
    { prices: [10, 20], expected: { median: 15, min: 10, max: 20, count: 2 } },
    { prices: [10, 10, 10, 10, 1000], expected: { median: 10, min: 10, max: 10, count: 4 } },
  ])('liefert robuste Marktstatistik für $prices', ({ prices, expected }) => {
    expect(service.calculateRobustMarketStats(prices as number[])).toEqual(expected);
  });
});
