import { describe, expect, it } from 'vitest';
import type { InventoryItem, Purchase, Sale, StockLot } from '../models/flipbase.models';
import { inventoryItemCost, purchaseIsFinalized, saleCostBasisStatus } from './cost-basis';

const purchase: Purchase = {
  id: 'p',
  workspace_id: 'w',
  title: 'Einkauf',
  type: 'single',
  purchase_price: 0,
  purchase_date: '2026-09-01',
  cost_allocation_mode: 'even',
  entry_status: 'finalized',
};
const item: InventoryItem = {
  id: 'i',
  workspace_id: 'w',
  purchase_id: 'p',
  title: 'Artikel',
  condition: 'new',
  status: 'sold',
  allocated_purchase_cost: 0,
};
const lot: StockLot = {
  id: 'l',
  workspace_id: 'w',
  purchase_id: 'p',
  purchase_line_id: 'pl',
  catalog_product_id: 'c',
  received_quantity: 2,
  remaining_quantity: 0,
  unit_cost: 0,
  received_at: '2026-09-01',
};
const sale: Sale = {
  id: 's',
  workspace_id: 'w',
  inventory_item_id: 'i',
  platform: 'direct',
  sale_price: 10,
  sale_date: '2026-09-01',
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
};
const line = {
  id: 'sl',
  sale_id: 's',
  title_snapshot: 'Artikel',
  quantity: 2,
  unit_sale_price: 5,
  line_total: 10,
  cost_of_goods_sold: 0,
  tax_mode: 'diff_25a' as const,
};
const allocation = {
  id: 'a',
  workspace_id: 'w',
  sale_line_id: 'sl',
  stock_lot_id: 'l',
  quantity: 2,
  unit_cost: 0,
};

describe('Kostenbasis', () => {
  it('priorisiert einen aktuell wieder geöffneten Einkauf vor einer alten Verkaufsrelation', () => {
    expect(
      saleCostBasisStatus(
        { ...sale, inventory_item: { ...item, purchase } },
        { purchases: [{ ...purchase, entry_status: 'draft' }] },
      ),
    ).toBe('unknown');
    expect(
      saleCostBasisStatus(
        {
          ...sale,
          lines: [
            { ...line, lot_allocations: [{ ...allocation, stock_lot: { ...lot, purchase } }] },
          ],
        },
        { purchases: [{ ...purchase, entry_status: 'draft' }] },
      ),
    ).toBe('unknown');
  });
  it('verlangt einen belegten Abschluss und erhält echte Nullpreise', () => {
    expect(purchaseIsFinalized(undefined)).toBe(false);
    expect(purchaseIsFinalized({ ...purchase, purchase_price: null })).toBe(false);
    expect(purchaseIsFinalized({ ...purchase, purchase_price: NaN })).toBe(false);
    expect(purchaseIsFinalized({ ...purchase, entry_status: 'draft' })).toBe(false);
    expect(
      purchaseIsFinalized({ ...purchase, entry_status: undefined, finalized_at: '2026-09-01' }),
    ).toBe(true);
    expect(purchaseIsFinalized(purchase)).toBe(true);
  });
  it('addiert Einzelkosten nur bei bekanntem Einkauf und lehnt ungültige Beträge ab', () => {
    expect(inventoryItemCost(item)).toBeNull();
    expect(inventoryItemCost({ ...item, purchase, costs: [{ type: 'repair', amount: 2 }] })).toBe(
      2,
    );
    expect(inventoryItemCost({ ...item, purchase, total_item_cost: 3 })).toBe(3);
    expect(inventoryItemCost({ ...item, purchase, total_item_cost: NaN })).toBeNull();
  });
  it('prüft die Herkunft von Altverkäufen und respektiert fehlende Daten', () => {
    expect(saleCostBasisStatus(sale)).toBe('unknown');
    expect(saleCostBasisStatus({ ...sale, inventory_item: { ...item, purchase } })).toBe('known');
    expect(saleCostBasisStatus(sale, { inventoryItems: [item], purchases: [purchase] })).toBe(
      'known',
    );
    expect(
      saleCostBasisStatus(sale, {
        inventoryItems: [{ ...item, workspace_id: 'other' }],
        purchases: [purchase],
      }),
    ).toBe('unknown');
    expect(
      saleCostBasisStatus(sale, {
        inventoryItems: [item],
        purchases: [{ ...purchase, workspace_id: 'other' }],
      }),
    ).toBe('unknown');
  });
  it('prüft jede Einzelposition statt dem Verkaufskopf blind zu vertrauen', () => {
    const individualSale = { ...sale, lines: [{ ...line, inventory_item_id: 'i' }] };
    expect(saleCostBasisStatus(individualSale)).toBe('unknown');
    expect(saleCostBasisStatus({ ...individualSale, inventory_item: { ...item, purchase } })).toBe(
      'known',
    );
    expect(
      saleCostBasisStatus(individualSale, { inventoryItems: [item], purchases: [purchase] }),
    ).toBe('known');
    expect(
      saleCostBasisStatus({ ...sale, lines: [{ ...line, inventory_item: { ...item, purchase } }] }),
    ).toBe('known');
    expect(
      saleCostBasisStatus({
        ...individualSale,
        lines: [{ ...individualSale.lines[0], cost_of_goods_sold: NaN }],
      }),
    ).toBe('unknown');
  });
  it('verlangt vollständige FIFO-Zuordnung und abgeschlossene Lose', () => {
    const quantitySale = { ...sale, lines: [line] };
    expect(saleCostBasisStatus(quantitySale)).toBe('unknown');
    expect(
      saleCostBasisStatus({ ...quantitySale, lot_allocations: [{ ...allocation, quantity: 1 }] }),
    ).toBe('unknown');
    expect(saleCostBasisStatus({ ...quantitySale, lot_allocations: [allocation] })).toBe('unknown');
    expect(
      saleCostBasisStatus(
        { ...quantitySale, lot_allocations: [allocation] },
        { stockLots: [lot], purchases: [purchase] },
      ),
    ).toBe('known');
    expect(
      saleCostBasisStatus({ ...quantitySale, lot_allocations: [allocation] }, { stockLots: [lot] }),
    ).toBe('unknown');
    expect(
      saleCostBasisStatus({
        ...quantitySale,
        lines: [{ ...line, lot_allocations: [{ ...allocation, stock_lot: { ...lot, purchase } }] }],
      }),
    ).toBe('known');
  });
});

describe('Unbekannte Paketkosten', () => {
  it('erhält NULL trotz abgeschlossenem 100-Euro-Paket und veraltetem Gesamtwert', () => {
    const content = {
      ...item,
      purchase: { ...purchase, purchase_price: 100 },
      source_package_line_id: 'package',
      allocated_purchase_cost: null,
      total_item_cost: 5,
      costs: [{ type: 'repair', amount: 5 }],
    };
    expect(inventoryItemCost(content)).toBeNull();
    expect(saleCostBasisStatus({ ...sale, inventory_item: content })).toBe('unknown');
  });
  it('ersetzt einen offenen Verkaufssnapshot nicht durch später bekannte Einzelkosten', () => {
    expect(
      saleCostBasisStatus({
        ...sale,
        inventory_item: { ...item, purchase, allocated_purchase_cost: 20 },
        lines: [{ ...line, inventory_item_id: item.id, cost_of_goods_sold: null }],
      }),
    ).toBe('unknown');
  });
});
