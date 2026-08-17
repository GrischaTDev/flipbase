import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsService } from './analytics.service';
import { ProfitEngineService } from './profit-engine.service';
import { Purchase, Sale, InventoryItem } from '../models/reflip.models';

describe('Analytics & Break-Even Engine (Phase 5)', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    const profitEngine = new ProfitEngineService();
    analyticsService = new AnalyticsService();
    (analyticsService as any).profitEngine = profitEngine;
  });

  it('should calculate sell-through rate accurately', () => {
    const rate = analyticsService.calculateSellThroughRate(50, 35);
    expect(rate).toBe(70.0);
    expect(analyticsService.calculateSellThroughRate(0, 0)).toBe(0);
  });

  it('should calculate platform profitability and fee ratios', () => {
    const sampleSales: Sale[] = [
      {
        id: 's-1',
        workspace_id: 'ws-1',
        platform: 'ebay',
        sale_price: 100.0,
        platform_fee: 12.0,
        net_profit: 40.0,
        holding_duration_days: 10,
        sale_date: '2026-08-01',
        created_at: '2026-08-01',
      },
      {
        id: 's-2',
        workspace_id: 'ws-1',
        platform: 'kleinanzeigen',
        sale_price: 100.0,
        platform_fee: 0.0,
        net_profit: 60.0,
        holding_duration_days: 5,
        sale_date: '2026-08-02',
        created_at: '2026-08-02',
      },
    ];

    const platforms = analyticsService.computePlatformPerformance(sampleSales);
    expect(platforms.length).toBe(2);

    const ebay = platforms.find((p) => p.platform === 'ebay');
    expect(ebay?.effectiveFeePercent).toBe(12.0);
    expect(ebay?.netProfit).toBe(40.0);

    const ka = platforms.find((p) => p.platform === 'kleinanzeigen');
    expect(ka?.effectiveFeePercent).toBe(0.0);
    expect(ka?.netProfit).toBe(60.0);
  });

  it('should calculate holding duration velocity buckets and turnover rate', () => {
    const sampleSales: Sale[] = [
      {
        id: 's-1',
        workspace_id: 'ws-1',
        platform: 'ebay',
        sale_price: 100.0,
        holding_duration_days: 3, // fast
        net_profit: 30.0,
        roi: 50.0,
        sale_date: '2026-08-01',
        created_at: '2026-08-01',
      },
      {
        id: 's-2',
        workspace_id: 'ws-1',
        platform: 'ebay',
        sale_price: 100.0,
        holding_duration_days: 20, // normal
        net_profit: 25.0,
        roi: 40.0,
        sale_date: '2026-08-02',
        created_at: '2026-08-02',
      },
    ];

    const analysis = analyticsService.computeHoldingDurationAnalysis(sampleSales);
    expect(analysis.avgOverallDays).toBe(11.5);
    expect(analysis.fastestSaleDays).toBe(3);
    expect(analysis.capitalTurnoverRate).toBeGreaterThan(10);
    expect(analysis.buckets.length).toBe(4);
    expect(analysis.buckets[0].count).toBe(1); // < 7 days
    expect(analysis.buckets[1].count).toBe(1); // 7 - 30 days
  });

  it('should calculate monthly cohort recovery rate', () => {
    const purchases: Purchase[] = [
      {
        id: 'p-1',
        workspace_id: 'ws-1',
        type: 'single',
        title: 'Kauf Januar',
        purchase_date: '2026-01-10',
        purchase_price: 200.0,
        total_purchase_cost: 200.0,
        cost_allocation_mode: 'even',
        created_at: '2026-01-10',
      },
    ];

    const sales: Sale[] = [
      {
        id: 's-1',
        workspace_id: 'ws-1',
        sale_date: '2026-01-20',
        sale_price: 300.0,
        net_profit: 100.0,
        created_at: '2026-01-20',
      },
    ];

    const cohorts = analyticsService.computeMonthlyCohorts(purchases, sales);
    expect(cohorts.length).toBe(1);
    expect(cohorts[0].recoveryPercent).toBe(150.0);
    expect(cohorts[0].isProfitable).toBe(true);
  });

  it('should calculate Pallet Break-Even Status and Days to Break-Even (Chapter 30)', () => {
    const mockPurchase: Purchase = {
      id: 'pallet-1',
      workspace_id: 'ws-1',
      type: 'pallet',
      title: 'Amazon Retouren Palette A3',
      purchase_date: '2026-08-01',
      purchase_price: 1500.0,
      total_purchase_cost: 1700.0,
      cost_allocation_mode: 'even',
      item_count: 50,
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-01T10:00:00Z',
    };

    const mockItems: InventoryItem[] = [
      {
        id: 'item-1',
        workspace_id: 'ws-1',
        purchase_id: 'pallet-1',
        title: 'Artikel 1',
        condition: 'used',
        status: 'sold',
        allocated_purchase_cost: 34.0,
        created_at: '2026-08-01T10:00:00Z',
        updated_at: '2026-08-01T10:00:00Z',
      },
      {
        id: 'item-2',
        workspace_id: 'ws-1',
        purchase_id: 'pallet-1',
        title: 'Artikel 2',
        condition: 'defective',
        status: 'defective',
        allocated_purchase_cost: 34.0,
        created_at: '2026-08-01T10:00:00Z',
        updated_at: '2026-08-01T10:00:00Z',
      },
    ];

    const salesAfterBreakEven: Sale[] = [
      {
        id: 'sale-1',
        workspace_id: 'ws-1',
        inventory_item_id: 'item-1',
        platform: 'ebay',
        sale_price: 1200.0,
        sale_date: '2026-08-10',
        platform_fee: 0,
        shipping_cost: 0,
        packaging_cost: 0,
        other_costs: 0,
        created_at: '2026-08-10T12:00:00Z',
        inventory_item: mockItems[0],
      },
      {
        id: 'sale-2',
        workspace_id: 'ws-1',
        inventory_item_id: 'item-1',
        platform: 'kleinanzeigen',
        sale_price: 650.0,
        sale_date: '2026-08-15',
        platform_fee: 0,
        shipping_cost: 0,
        packaging_cost: 0,
        other_costs: 0,
        created_at: '2026-08-15T12:00:00Z',
        inventory_item: mockItems[0],
      },
    ];

    const statsAfter = analyticsService.computePalletStats([mockPurchase], mockItems, salesAfterBreakEven);
    expect(statsAfter[0].isBreakEven).toBe(true);
    expect(statsAfter[0].daysToBreakEven).toBe(14);
  });
});
