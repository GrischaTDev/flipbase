import assert from 'node:assert/strict';
import { saleNotification, type StoredWebhookSale } from './sale-notification.ts';

function fixture(): StoredWebhookSale {
  return {
    sale_price: 40,
    sale_price_total: 45,
    platform: 'Vinted',
    shipping_revenue: 5,
    platform_fee: 2,
    shipping_cost: 3,
    packaging_cost: 1,
    other_costs: 0,
    cost_entries: [],
    sale_lines: [],
    inventory_item: {
      title: 'Jacke',
      allocated_purchase_cost: 10,
      total_item_cost: 12,
      purchase: { purchase_price: 10, entry_status: 'finalized' },
    },
  };
}
Deno.test('Gespeicherte Einzelverkäufe erhalten Artikel, Preis, Gewinn und ROI', () => {
  assert.deepEqual(saleNotification(fixture()), {
    title: 'Jacke',
    price: 45,
    platform: 'Vinted',
    profit: 27,
    roi: 225,
  });
  const sale = fixture();
  sale.inventory_item = null;
  assert.equal(saleNotification(sale).profit, null);
  assert.equal(saleNotification(sale).roi, null);
});
Deno.test(
  'Positionen, Zusatzkosten und Erstattungen folgen dem bestehenden Kennzahlenvertrag',
  () => {
    const sale = fixture();
    sale.refund_amount = 5;
    sale.cost_entries = [{ amount: 4 }];
    sale.sale_lines = [
      {
        title_snapshot: 'Jacke',
        line_total: 30,
        cost_of_goods_sold: 12,
        quantity: 1,
        inventory_item_id: 'item',
        inventory_item: sale.inventory_item,
        lot_allocations: [],
      },
    ];
    assert.deepEqual(saleNotification(sale), {
      title: 'Jacke',
      price: 35,
      platform: 'Vinted',
      profit: 9,
      roi: 75,
    });
    sale.sale_lines[0].inventory_item = null;
    assert.equal(saleNotification(sale).profit, null);
  },
);
