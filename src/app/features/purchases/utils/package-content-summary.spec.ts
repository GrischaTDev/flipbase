import { describe, expect, it } from 'vitest';
import { InventoryItem, PurchaseLine, Sale } from '../../../core/models/flipbase.models';
import { summarizePackageContents } from './package-content-summary';

const line: PurchaseLine = {
  id: 'pack',
  workspace_id: 'w',
  purchase_id: 'p',
  is_package: true,
  title_snapshot: 'Mystery Pack',
  line_kind: 'individual',
  ordered_quantity: 1,
  received_quantity: 1,
  unit_purchase_price: 100,
  line_total: 100,
};
const item: InventoryItem = {
  id: 'a',
  workspace_id: 'w',
  purchase_id: 'p',
  source_package_line_id: 'pack',
  title: 'Adidas A',
  condition: 'used',
  status: 'ready',
  allocated_purchase_cost: null,
};
const sale: Sale = {
  id: 's',
  workspace_id: 'w',
  platform: 'direct',
  sale_price: 180,
  sale_date: '2026-09-13',
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
  lines: [
    {
      id: 'sl',
      sale_id: 's',
      inventory_item_id: 'a',
      title_snapshot: 'Adidas A',
      quantity: 1,
      unit_sale_price: 80,
      line_total: 80,
      cost_of_goods_sold: null,
      tax_mode: 'regular_19',
    },
    {
      id: 'other',
      sale_id: 's',
      inventory_item_id: 'unrelated',
      title_snapshot: 'Anderer Artikel',
      quantity: 1,
      unit_sale_price: 100,
      line_total: 100,
      cost_of_goods_sold: 20,
      tax_mode: 'regular_19',
    },
  ],
};

describe('Paketinhalt und zugeordnete Erlöse', () => {
  it('zählt nur Erlöse des Inhalts, erhält den Paketpreis und offene Einzelkosten', () => {
    const result = summarizePackageContents(
      line,
      [
        item,
        { ...item, id: 'b', title: 'Adidas B' },
        { ...item, id: 'foreign', workspace_id: 'elsewhere' },
      ],
      [sale],
      true,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.proceeds).toBe(80);
    expect(result.soldCount).toBe(1);
    expect(result.line.line_total).toBe(100);
    expect(result.rows[1].statusLabel).toBe('Im Bestand');
    expect(result.rows[0].item.allocated_purchase_cost).toBeNull();
  });
  it('zählt stornierte und retournierte Verkäufe nicht als verkauften Inhalt', () => {
    for (const change of [{ returned_at: '2026-09-13' }, { voided_at: '2026-09-13' }]) {
      const result = summarizePackageContents(line, [item], [{ ...sale, ...change }], true);
      expect(result.proceeds).toBe(0);
      expect(result.soldCount).toBe(0);
    }
  });
  it('zeigt fehlende oder widersprüchliche Verkaufsdaten nicht als bestätigten Nullerlös', () => {
    expect(summarizePackageContents(line, [item], [], false).proceeds).toBeNull();
    expect(
      summarizePackageContents(line, [{ ...item, status: 'sold' }], [], true).proceeds,
    ).toBeNull();
    expect(
      summarizePackageContents(line, [item], [sale, { ...sale, id: 'duplicate' }], true).proceeds,
    ).toBeNull();
  });
});
