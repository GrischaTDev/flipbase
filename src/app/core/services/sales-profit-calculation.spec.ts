import { describe, it, expect, beforeEach } from 'vitest';
import { ProfitEngineService } from './profit-engine.service';

describe('Sales & Deterministic Profit Engine (Phase 4)', () => {
  let profitEngine: ProfitEngineService;

  beforeEach(() => {
    profitEngine = new ProfitEngineService();
  });

  it('should calculate complete sale net profit with all cost layers (Chapter 11)', () => {
    // Example from Chapter 11 & 26:
    // Einkaufspreis (EK): 20.00 €
    // Fahrtkosten: 7.00 €
    // Reparatur: 4.50 €
    // Verpackung: 1.20 €
    // Verkaufsgebühr: 5.00 €
    // Versand: 6.99 €
    // Total Kosten = 44.69 €
    // Verkaufspreis = 75.00 €
    const totalCosts = 20.0 + 7.0 + 4.5 + 1.2 + 5.0 + 6.99;
    const salePrice = 75.0;

    const netProfit = profitEngine.calculateProfit(salePrice, totalCosts);
    const roi = profitEngine.calculateRoi(netProfit, totalCosts);

    expect(totalCosts).toBeCloseTo(44.69, 2);
    expect(netProfit).toBe(30.31);
    // ROI = (30.31 / 44.69) * 100 = 67.82%
    expect(roi).toBe(67.82);
  });

  it('should calculate holding duration in days between purchase and sale', () => {
    const purchaseDate = '2026-08-01';
    const saleDate = '2026-08-15';

    const days = profitEngine.calculateHoldingDurationDays(purchaseDate, saleDate);
    expect(days).toBe(14);
  });

  it('should handle zero-day holding duration (same day flip)', () => {
    const today = '2026-08-16';
    const days = profitEngine.calculateHoldingDurationDays(today, today);
    expect(days).toBe(0);
  });

  it('should calculate negative net profit and negative ROI for a loss deal', () => {
    const totalCosts = 100.0;
    const salePrice = 80.0;

    const profit = profitEngine.calculateProfit(salePrice, totalCosts);
    const roi = profitEngine.calculateRoi(profit, totalCosts);

    expect(profit).toBe(-20.0);
    expect(roi).toBe(-20.0);
  });
});
