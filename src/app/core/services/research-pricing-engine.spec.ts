import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ResearchService, ResearchComparisonItem } from './research.service';
import { ProfitEngineService } from './profit-engine.service';

describe('Research & Pricing Engine (Phase 6)', () => {
  let researchService: ResearchService;

  beforeEach(() => {
    researchService = Object.create(ResearchService.prototype);
    (researchService as unknown as { profitEngine: ProfitEngineService }).profitEngine =
      new ProfitEngineService();
  });

  it('should calculate accurate statistical metrics and exclude outliers (Chapter 18)', () => {
    const mockItems: ResearchComparisonItem[] = [
      {
        id: '1',
        title: 'Comps 1',
        price: 50.0,
        source: 'ebay_sold',
        imageUrl: '',
        url: '',
        date: '2026-08-01',
        condition: 'used',
        isExcluded: false,
      },
      {
        id: '2',
        title: 'Comps 2',
        price: 60.0,
        source: 'ebay_sold',
        imageUrl: '',
        url: '',
        date: '2026-08-01',
        condition: 'used',
        isExcluded: false,
      },
      {
        id: '3',
        title: 'Comps 3',
        price: 70.0,
        source: 'kleinanzeigen',
        imageUrl: '',
        url: '',
        date: '2026-08-01',
        condition: 'used',
        isExcluded: false,
      },
      {
        id: '4',
        title: 'Comps 4',
        price: 80.0,
        source: 'vinted',
        imageUrl: '',
        url: '',
        date: '2026-08-01',
        condition: 'used',
        isExcluded: false,
      },
      {
        id: '5',
        title: 'Comps 5',
        price: 90.0,
        source: 'ebay_sold',
        imageUrl: '',
        url: '',
        date: '2026-08-01',
        condition: 'used',
        isExcluded: false,
      },
      // Outlier excluded
      {
        id: '6',
        title: 'Mondpreis Outlier',
        price: 999.0,
        source: 'ebay_sold',
        imageUrl: '',
        url: '',
        date: '2026-08-01',
        condition: 'used',
        isExcluded: true,
      },
    ];

    const summary = researchService.calculateSummary(mockItems, 25.0);

    expect(summary.validCount).toBe(5);
    expect(summary.excludedCount).toBe(1);
    expect(summary.minPrice).toBe(50.0);
    expect(summary.maxPrice).toBe(90.0);
    // Median of [50, 60, 70, 80, 90] is 70
    expect(summary.medianPrice).toBe(70.0);
    expect(summary.avgPrice).toBe(70.0);
  });

  it('should generate all 3 Pricing Strategies (Quick Sale, Fair Market, High Margin) (Chapter 19)', () => {
    const mockItems: ResearchComparisonItem[] = [
      {
        id: '1',
        title: 'Comps 1',
        price: 60.0,
        source: 'ebay_sold',
        imageUrl: '',
        url: '',
        date: '2026-08-01',
        condition: 'used',
        isExcluded: false,
      },
      {
        id: '2',
        title: 'Comps 2',
        price: 70.0,
        source: 'ebay_sold',
        imageUrl: '',
        url: '',
        date: '2026-08-01',
        condition: 'used',
        isExcluded: false,
      },
      {
        id: '3',
        title: 'Comps 3',
        price: 80.0,
        source: 'kleinanzeigen',
        imageUrl: '',
        url: '',
        date: '2026-08-01',
        condition: 'used',
        isExcluded: false,
      },
    ];

    const baseCost = 25.0;
    const summary = researchService.calculateSummary(mockItems, baseCost);

    expect(summary.strategies.length).toBe(3);

    const quickSale = summary.strategies.find((s) => s.type === 'quick_sale')!;
    const fairMarket = summary.strategies.find((s) => s.type === 'fair_market')!;
    const highMargin = summary.strategies.find((s) => s.type === 'high_margin')!;

    expect(quickSale).toBeDefined();
    expect(fairMarket).toBeDefined();
    expect(highMargin).toBeDefined();

    // Fair Market price should equal median (70 €)
    expect(fairMarket.recommendedPrice).toBe(70.0);
    expect(fairMarket.estimatedProfit).toBe(45.0); // 70 - 25 = 45 €

    // Quick Sale price should be lower than Fair Market
    expect(quickSale.recommendedPrice).toBeLessThan(fairMarket.recommendedPrice);

    // High Margin price should be higher than or equal to Fair Market
    expect(highMargin.recommendedPrice).toBeGreaterThanOrEqual(fairMarket.recommendedPrice);
  });
});
