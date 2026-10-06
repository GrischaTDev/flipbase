import { describe, expect, it } from 'vitest';
import {
  saleNotification,
  type StoredWebhookSale,
} from '../../../../supabase/functions/webhook-dispatch/sale-notification';
import type { Sale } from '../models/flipbase.models';
import { calculateStoredSaleMetrics } from './sale-metrics';

describe('server webhook sale metrics', () => {
  it('matches the existing frontend contract for stored positions, legacy sales and unknown costs', () => {
    for (const withLines of [false, true]) {
      for (const purchasePrice of [null, 0, 10]) {
        for (const allocatedCost of [0, 0.004, 12.123]) {
          const sale: StoredWebhookSale = {
            sale_price: 40,
            sale_price_total: 45,
            platform: 'Vinted',
            shipping_revenue: 5,
            platform_fee: 2,
            shipping_cost: 3,
            packaging_cost: 1,
            other_costs: 0,
            refund_amount: 3.231,
            cost_entries: [{ amount: 4.333 }],
            sale_lines: [],
            inventory_item: {
              title: 'Artikel',
              allocated_purchase_cost: allocatedCost,
              purchase: { purchase_price: purchasePrice, entry_status: 'finalized' },
            },
          };
          if (withLines)
            sale.sale_lines = [
              {
                title_snapshot: 'Artikel',
                line_total: 40,
                cost_of_goods_sold: allocatedCost,
                quantity: 1,
                inventory_item_id: 'item',
                inventory_item: sale.inventory_item,
                lot_allocations: [],
              },
            ];
          const stored = {
            ...sale,
            lines: sale.sale_lines,
            has_persisted_lines: withLines,
          } as unknown as Sale;
          const expected = calculateStoredSaleMetrics(stored);
          const actual = saleNotification(sale);
          expect(actual.profit).toBe(expected.resultAfterDirectCosts);
          expect(actual.roi).toBe(expected.roiPercent);
        }
      }
    }
  });
});
