import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsService } from './analytics.service';
import { ProfitEngineService } from './profit-engine.service';
import { Purchase, Sale, InventoryItem } from '../models/reflip.models';

describe('Analytics & Break-Even Engine (Phase 5)', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    // AnalyticsService injects ProfitEngineService
    const profitEngine = new ProfitEngineService();
    analyticsService = new AnalyticsService();
    (analyticsService as any).profitEngine = profitEngine;
  });

  it('should calculate sell-through rate accurately', () => {
    // 50 total items, 35 sold -> (35 / 50) * 100 = 70.0%
    const rate = analyticsService.calculateSellThroughRate(50, 35);
    expect(rate).toBe(70.0);

    expect(analyticsService.calculateSellThroughRate(0, 0)).toBe(0);
  });

  it('should calculate Pallet Break-Even Status and Days to Break-Even (Chapter 30)', () => {
    const mockPurchase: Purchase = {
      id: 'pallet-1',
      workspace_id: 'ws-1',
      type: 'pallet',
      title: 'Amazon Retouren Palette A3',
      purchase_date: '2026-08-01',
      purchase_price: 1500.0,
      total_purchase_cost: 1700.0, // 1500 € + 200 € Transport
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

    // Scenario A: Revenue below investment (1.200 € < 1.700 €) -> Not Break-even yet
    const salesBeforeBreakEven: Sale[] = [
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
    ];

    const statsBefore = analyticsService.computePalletStats([mockPurchase], mockItems, salesBeforeBreakEven);
    expect(statsBefore[0].isBreakEven).toBe(false);
    expect(statsBefore[0].defectRate).toBe(50.0); // 1 defective out of 2 items = 50%

    // Scenario B: Second sale brings total revenue to 1.850 € >= 1.700 € -> Break-even reached!
    const salesAfterBreakEven: Sale[] = [
      ...salesBeforeBreakEven,
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
    // Break-even was reached on 2026-08-15 (14 days after purchase on 2026-08-01)
    expect(statsAfter[0].daysToBreakEven).toBe(14);
  });
});
