import { describe, expect, it } from 'vitest';
import type {
  InventoryItem,
  Purchase,
  Sale,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../core/models/flipbase.models';
import { buildInventoryPresentation } from './inventory-presentation';

const workspaceId = 'workspace-1';

const purchase = (id: string, finalized = true): Purchase => ({
  id,
  workspace_id: workspaceId,
  type: 'single',
  title: `Einkauf ${id}`,
  purchase_date: '2026-08-01',
  purchase_price: finalized ? 30 : null,
  cost_allocation_mode: 'manual',
  entry_status: finalized ? 'finalized' : 'draft',
  finalized_at: finalized ? '2026-08-02T10:00:00.000Z' : null,
});

const individual = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'item-1',
  workspace_id: workspaceId,
  purchase_id: 'purchase-1',
  title: 'Kaffeetasse',
  condition: 'like_new',
  status: 'ready',
  sale_state: 'no_active_sale',
  allocated_purchase_cost: 10,
  total_item_cost: 10,
  ...overrides,
});

const position: StockPosition = {
  catalog_product_id: 'product-1',
  title: 'LED-Lampe',
  available_quantity: 6,
  reserved_quantity: 1,
  on_hand_quantity: 7,
  oldest_available_unit_cost: 10,
  is_public_store: false,
};

const lot = (
  id: string,
  purchaseId: string,
  received: number,
  remaining: number,
  unitCost: number,
): StockLot => ({
  id,
  workspace_id: workspaceId,
  purchase_id: purchaseId,
  purchase_line_id: `line-${id}`,
  catalog_product_id: position.catalog_product_id,
  received_quantity: received,
  remaining_quantity: remaining,
  unit_cost: unitCost,
  received_at: '2026-08-03T10:00:00.000Z',
});

const movement = (
  id: string,
  stockLotId: string,
  direction: 'in' | 'out',
  quantity: number,
  reason: StockMovement['reason'],
): StockMovement => ({
  id,
  workspace_id: workspaceId,
  stock_lot_id: stockLotId,
  direction,
  quantity,
  reason,
  created_at: '2026-08-10T10:00:00.000Z',
});

const sale = (id: string, overrides: Partial<Sale> = {}): Sale => ({
  id,
  workspace_id: workspaceId,
  platform: 'ebay',
  sale_price: 42,
  sale_price_total: 42,
  sale_date: '2026-08-20',
  platform_fee: 5,
  shipping_cost: 2,
  packaging_cost: 0,
  other_costs: 0,
  net_profit: 25,
  has_persisted_lines: true,
  lines: [
    {
      id: `line-${id}`,
      sale_id: id,
      inventory_item_id: 'item-1',
      title_snapshot: 'Kaffeetasse',
      quantity: 1,
      unit_sale_price: 42,
      line_total: 42,
      cost_of_goods_sold: 10,
      tax_mode: 'diff_25a',
    },
  ],
  ...overrides,
});

function build(overrides: Partial<Parameters<typeof buildInventoryPresentation>[0]> = {}) {
  return buildInventoryPresentation({
    workspaceId,
    inventoryState: 'known',
    stockState: 'known',
    purchaseState: 'known',
    salesState: 'known',
    individualItems: [],
    positions: [],
    lots: [],
    movements: [],
    purchases: [],
    sales: [],
    ...overrides,
  });
}

describe('buildInventoryPresentation', () => {
  it('zeigt physisch anwesende Ware ohne bereits verkaufte oder ausgeschiedene Mengen', () => {
    const result = build({
      positions: [
        { ...position, on_hand_quantity: 4, available_quantity: 3, reserved_quantity: 1 },
      ],
      lots: [lot('stock', 'purchase-1', 10, 4, 10)],
      movements: [
        movement('sale', 'stock', 'out', 5, 'sale'),
        movement('loss', 'stock', 'out', 1, 'loss'),
      ],
      purchases: [purchase('purchase-1')],
    });
    expect(result.rows[0]).toMatchObject({
      quantityState: 'known',
      onHandQuantity: 4,
      quantity: { total: 9, available: 3, reserved: 1, sold: 5 },
    });
  });

  it.each(['received', 'needs_review', 'researched', 'defective', 'returned'] as const)(
    'zählt %s als anwesend, aber noch nicht verkaufbar',
    (status) => {
      const row = build({ individualItems: [individual({ status })] }).rows[0];
      expect(row).toMatchObject({ onHandQuantity: 1, quantityState: 'known', canSell: false });
      expect(row.quantity.available).toBe(0);
    },
  );

  it.each([
    { status: 'sold', sale_state: 'sold' },
    { status: 'archived', sale_state: 'no_active_sale' },
  ] as const)('schließt ausgeschiedene Einzelstücke aus dem Lager aus: $status', (state) => {
    const row = build({ individualItems: [individual(state)] }).rows[0];
    expect(row.onHandQuantity).toBe(0);
    expect(row.inventoryValue).toEqual({ kind: 'known', amount: 0 });
  });

  it.each([
    { status: 'sold', sale_state: 'legacy_sold_unverified' },
    { status: 'ready', sale_state: 'sale_status_conflict' },
    { status: 'sold', sale_state: 'multiple_active_sales' },
    { status: 'sold', sale_state: 'no_active_sale' },
    { status: 'ready', sale_state: 'sold' },
  ] as const)('behauptet bei $status/$sale_state keinen Nullbestand', (state) => {
    expect(build({ individualItems: [individual(state)] }).rows[0]).toMatchObject({
      onHandQuantity: null,
      quantityState: 'review_required',
    });
  });

  it.each(['loading', 'error'] as const)('hält physische Mengen bei %s offen', (state) => {
    const result = build({
      inventoryState: state,
      stockState: state,
      individualItems: [individual()],
      positions: [position],
    });
    expect(result.rows.every((row) => row.onHandQuantity === null)).toBe(true);
  });

  it('akzeptiert anwesende noch nicht freigegebene Mengenware', () => {
    const row = build({
      positions: [
        { ...position, available_quantity: 0, reserved_quantity: 0, on_hand_quantity: 5 },
      ],
      lots: [lot('open', 'purchase-1', 5, 5, 10)],
      purchases: [purchase('purchase-1', false)],
    }).rows[0];
    expect(row).toMatchObject({ onHandQuantity: 5, quantityState: 'known', canSell: false });
  });

  it('markiert Reservierungen über dem physischen Bestand als ungeklärt', () => {
    const row = build({
      positions: [
        { ...position, available_quantity: 1, reserved_quantity: 0, on_hand_quantity: 1 },
      ],
      lots: [lot('over', 'purchase-1', 1, 1, 10)],
      movements: [movement('over-reserved', 'over', 'out', 2, 'reservation')],
    }).rows[0];
    expect(row).toMatchObject({ onHandQuantity: null, quantityState: 'review_required' });
  });

  it('führt Stücke mit gleichem Titel und gleicher EAN nicht ohne Zuordnung zusammen', () => {
    const result = build({
      individualItems: [
        individual({ id: 'one', title: position.title, ean: '123' }),
        individual({ id: 'two', title: position.title, ean: '123' }),
      ],
      positions: [position],
    });
    expect(result.rows.map((row) => row.id).sort()).toEqual([
      'individual:one',
      'individual:two',
      'quantity:product-1',
    ]);
  });

  it('behält offenen Wareneingang in Gesamt, ohne ihn als verfügbar anzuzeigen', () => {
    const result = build({
      positions: [
        {
          ...position,
          available_quantity: 0,
          reserved_quantity: 0,
          on_hand_quantity: 5,
          oldest_available_unit_cost: null,
        },
      ],
      lots: [{ ...lot('open', 'purchase-1', 5, 5, 0), unit_cost: null }],
      purchases: [purchase('purchase-1', false)],
    });
    expect(result.rows[0]?.quantity).toMatchObject({ total: 5, available: 0 });
    expect(result.rows[0]?.inventoryValue).toEqual({ kind: 'open' });
  });
  it('normalisiert ein einzeln nachverfolgtes Stück ohne sichtbare Tracking-Art', () => {
    const result = build({ individualItems: [individual()], purchases: [purchase('purchase-1')] });

    expect(result.rows).toEqual([
      expect.objectContaining({
        id: 'individual:item-1',
        trackingMode: 'individual',
        title: 'Kaffeetasse',
        condition: 'like_new',
        quantityState: 'known',
        quantity: { total: 1, available: 1, reserved: 0, sold: 0 },
        costPerUnit: { kind: 'known', amount: 10 },
        inventoryValue: { kind: 'known', amount: 10 },
      }),
    ]);
  });

  it('zählt nur echte Verkäufe als verkauft und Retouren wieder heraus', () => {
    const lots = [lot('lot-a', 'purchase-1', 12, 7, 10)];
    const movements = [
      movement('return', 'lot-a', 'in', 1, 'return'),
      movement('sale', 'lot-a', 'out', 4, 'sale'),
      movement('damage', 'lot-a', 'out', 1, 'damage'),
      movement('loss', 'lot-a', 'out', 1, 'loss'),
      movement('correction', 'lot-a', 'in', 1, 'correction'),
    ];

    const result = build({
      positions: [position],
      lots,
      movements,
      purchases: [purchase('purchase-1')],
    });

    expect(result.rows[0]).toMatchObject({
      quantityState: 'known',
      quantity: { total: 10, available: 6, reserved: 1, sold: 3 },
    });
  });

  it('behält ausverkaufte Mengenware mit Verkaufshistorie sichtbar', () => {
    const soldLot = lot('lot-sold', 'purchase-1', 3, 0, 10);
    const result = build({
      lots: [soldLot],
      movements: [movement('sale', soldLot.id, 'out', 3, 'sale')],
      purchases: [purchase('purchase-1')],
    });

    expect(result.rows[0]).toMatchObject({
      id: 'quantity:product-1',
      quantity: { total: 3, available: 0, reserved: 0, sold: 3 },
      status: { kind: 'sold', label: 'Verkauft' },
    });
  });

  it.each([
    ['loading', 'loading'],
    ['error', 'error'],
  ] as const)('zeigt bei %s keine scheinbar sichere Nullmenge', (stockState, expected) => {
    const result = build({
      stockState,
      positions: [position],
      lots: [lot('lot-a', 'purchase-1', 7, 7, 10)],
    });

    expect(result.rows[0].quantityState).toBe(expected);
  });

  it('markiert widersprüchliche Altbestände zur Prüfung', () => {
    const result = build({
      individualItems: [individual({ status: 'sold', sale_state: 'legacy_sold_unverified' })],
      purchases: [purchase('purchase-1')],
    });

    expect(result.rows[0]).toMatchObject({
      quantityState: 'review_required',
      status: { kind: 'review', label: 'Verkaufsstatus klären' },
      canMutate: false,
    });
  });

  it('meldet ein verbleibendes Los ohne aggregierte Position als Prüfung statt Nullbestand', () => {
    const result = build({
      positions: [],
      lots: [lot('lot-orphan', 'purchase-1', 2, 2, 10)],
      purchases: [purchase('purchase-1')],
    });

    expect(result.rows[0]).toMatchObject({
      quantityState: 'review_required',
      status: { kind: 'review', label: 'Prüfung erforderlich' },
    });
  });

  it('mischt bei einem Workspacewechsel keine alten Mengenpositionen in die neue Ansicht', () => {
    const result = build({
      stockWorkspaceId: 'workspace-old',
      positions: [position],
      lots: [lot('lot-old', 'purchase-1', 6, 6, 10)],
    } as Partial<Parameters<typeof buildInventoryPresentation>[0]>);

    expect(result.rows).toEqual([]);
  });

  it('unterscheidet offene Kosten von einem belegten Nullbetrag', () => {
    const result = build({
      individualItems: [
        individual({
          id: 'open',
          purchase_id: 'draft',
          allocated_purchase_cost: 0,
          total_item_cost: 0,
        }),
        individual({
          id: 'zero',
          purchase_id: 'final',
          allocated_purchase_cost: 0,
          total_item_cost: 0,
        }),
      ],
      purchases: [purchase('draft', false), purchase('final', true)],
    });

    expect(result.rows.find((row) => row.id === 'individual:open')?.costPerUnit).toEqual({
      kind: 'open',
    });
    expect(result.rows.find((row) => row.id === 'individual:zero')?.costPerUnit).toEqual({
      kind: 'known',
      amount: 0,
    });
  });

  it('summiert mehrere Lose centgenau und zeigt den gewichteten aktuellen Stückwert', () => {
    const result = build({
      positions: [
        { ...position, available_quantity: 3, reserved_quantity: 0, on_hand_quantity: 3 },
      ],
      lots: [lot('lot-a', 'purchase-1', 2, 2, 10), lot('lot-b', 'purchase-2', 1, 1, 20)],
      purchases: [purchase('purchase-1'), purchase('purchase-2')],
    });

    expect(result.rows[0]).toMatchObject({
      costPerUnit: { kind: 'known', amount: 13.33 },
      inventoryValue: { kind: 'known', amount: 40 },
    });
    expect(result.rows[0].origins.map((origin) => origin.purchaseId)).toEqual([
      'purchase-1',
      'purchase-2',
    ]);
  });

  it('berechnet den centgenauen Restwert aus Originalpool und aktiver Zuordnung', () => {
    const preciseLot = lot('lot-precise', 'purchase-1', 6, 5, 100 / 6);
    const productSale = sale('product-sale', {
      lines: [
        {
          id: 'line-product-sale',
          sale_id: 'product-sale',
          catalog_product_id: position.catalog_product_id,
          title_snapshot: position.title,
          quantity: 1,
          unit_sale_price: 30,
          line_total: 30,
          cost_of_goods_sold: 16.67,
          tax_mode: 'diff_25a',
        },
      ],
      lot_allocations: [
        {
          id: 'allocation-1',
          workspace_id: workspaceId,
          sale_line_id: 'line-product-sale',
          stock_lot_id: preciseLot.id,
          quantity: 1,
          unit_cost: 100 / 6,
          allocated_cost: 16.67,
          active_allocated_cost: 16.67,
        },
      ],
    });
    const result = build({
      positions: [
        { ...position, available_quantity: 5, reserved_quantity: 0, on_hand_quantity: 5 },
      ],
      lots: [preciseLot],
      purchases: [purchase('purchase-1')],
      sales: [productSale],
    });

    expect(result.rows[0]).toMatchObject({
      inventoryValue: { kind: 'known', amount: 83.33 },
      costPerUnit: { kind: 'known', amount: 16.67 },
    });
  });

  it.each([
    ['fehlender Zuordnung', []],
    [
      'Retoure',
      [
        sale('returned-product', {
          returned_at: '2026-08-21T10:00:00.000Z',
          lines: [
            {
              id: 'line-returned-product',
              sale_id: 'returned-product',
              catalog_product_id: position.catalog_product_id,
              title_snapshot: position.title,
              quantity: 1,
              unit_sale_price: 30,
              line_total: 30,
              cost_of_goods_sold: 16.67,
              tax_mode: 'diff_25a',
            },
          ],
          lot_allocations: [
            {
              id: 'allocation-returned',
              workspace_id: workspaceId,
              sale_line_id: 'line-returned-product',
              stock_lot_id: 'lot-open',
              quantity: 1,
              unit_cost: 100 / 6,
              allocated_cost: 16.67,
              active_allocated_cost: 0,
            },
          ],
        }),
      ],
    ],
  ] as const)('lässt Restkosten bei %s offen', (_reason, sales) => {
    const partialLot = lot('lot-open', 'purchase-1', 6, 5, 100 / 6);
    const result = build({
      positions: [
        { ...position, available_quantity: 5, reserved_quantity: 0, on_hand_quantity: 5 },
      ],
      lots: [partialLot],
      purchases: [purchase('purchase-1')],
      sales,
    });

    expect(result.rows[0]).toMatchObject({
      inventoryValue: { kind: 'open' },
      costPerUnit: { kind: 'open' },
    });
  });

  it('zeigt bei vollständig verbrauchtem Los ohne Zuordnung nur den sicheren Null-Bestandswert', () => {
    const consumedLot = lot('lot-consumed-open', 'purchase-1', 6, 0, 100 / 6);
    const result = build({
      lots: [consumedLot],
      movements: [movement('sold-consumed', consumedLot.id, 'out', 6, 'sale')],
      purchases: [purchase('purchase-1')],
    });

    expect(result.rows[0]).toMatchObject({
      inventoryValue: { kind: 'known', amount: 0 },
      costPerUnit: { kind: 'open' },
    });
  });

  it('zeigt bei einem vollständig verkauften Los autoritativ belegte historische Stückkosten', () => {
    const soldLot = lot('lot-sold-known', 'purchase-1', 6, 0, 100 / 6);
    const result = build({
      lots: [soldLot],
      movements: [movement('sold-known', soldLot.id, 'out', 6, 'sale')],
      purchases: [purchase('purchase-1')],
      sales: [
        sale('sale-sold-known', {
          lines: [
            {
              id: 'line-sold-known',
              sale_id: 'sale-sold-known',
              catalog_product_id: position.catalog_product_id,
              title_snapshot: position.title,
              quantity: 6,
              unit_sale_price: 30,
              line_total: 180,
              cost_of_goods_sold: 100,
              tax_mode: 'diff_25a',
            },
          ],
          lot_allocations: [
            {
              id: 'allocation-sold-known',
              workspace_id: workspaceId,
              sale_line_id: 'line-sold-known',
              stock_lot_id: soldLot.id,
              quantity: 6,
              unit_cost: 100 / 6,
              allocated_cost: 100,
              active_allocated_cost: 100,
            },
          ],
        }),
      ],
    });

    expect(result.rows[0]).toMatchObject({
      costPerUnit: { kind: 'known', amount: 16.67 },
      inventoryValue: { kind: 'known', amount: 0 },
    });
  });

  it('gewichtet historische Stückkosten über mehrere vollständig verkaufte Lose centgenau', () => {
    const firstLot = lot('lot-sold-first', 'purchase-1', 2, 0, 10);
    const secondLot = lot('lot-sold-second', 'purchase-2', 3, 0, 20);
    const result = build({
      lots: [firstLot, secondLot],
      movements: [
        movement('sold-first', firstLot.id, 'out', 2, 'sale'),
        movement('sold-second', secondLot.id, 'out', 3, 'sale'),
      ],
      purchases: [purchase('purchase-1'), purchase('purchase-2')],
      sales: [
        sale('sale-sold-lots', {
          lines: [
            {
              id: 'line-sold-lots',
              sale_id: 'sale-sold-lots',
              catalog_product_id: position.catalog_product_id,
              title_snapshot: position.title,
              quantity: 5,
              unit_sale_price: 30,
              line_total: 150,
              cost_of_goods_sold: 80,
              tax_mode: 'diff_25a',
            },
          ],
          lot_allocations: [
            {
              id: 'allocation-first',
              workspace_id: workspaceId,
              sale_line_id: 'line-sold-lots',
              stock_lot_id: firstLot.id,
              quantity: 2,
              unit_cost: 10,
              allocated_cost: 20,
              active_allocated_cost: 20,
            },
            {
              id: 'allocation-second',
              workspace_id: workspaceId,
              sale_line_id: 'line-sold-lots',
              stock_lot_id: secondLot.id,
              quantity: 3,
              unit_cost: 20,
              allocated_cost: 60,
              active_allocated_cost: 60,
            },
          ],
        }),
      ],
    });

    expect(result.rows[0]).toMatchObject({
      costPerUnit: { kind: 'known', amount: 16 },
      inventoryValue: { kind: 'known', amount: 0 },
    });
  });

  it('lässt historische Stückkosten bei widersprüchlicher aktiver Kostensumme offen', () => {
    const soldLot = lot('lot-sold-conflict', 'purchase-1', 6, 0, 100 / 6);
    const result = build({
      lots: [soldLot],
      movements: [movement('sold-conflict', soldLot.id, 'out', 6, 'sale')],
      purchases: [purchase('purchase-1')],
      sales: [
        sale('sale-sold-conflict', {
          lines: [
            {
              id: 'line-sold-conflict',
              sale_id: 'sale-sold-conflict',
              catalog_product_id: position.catalog_product_id,
              title_snapshot: position.title,
              quantity: 6,
              unit_sale_price: 30,
              line_total: 180,
              cost_of_goods_sold: 99.99,
              tax_mode: 'diff_25a',
            },
          ],
          lot_allocations: [
            {
              id: 'allocation-sold-conflict',
              workspace_id: workspaceId,
              sale_line_id: 'line-sold-conflict',
              stock_lot_id: soldLot.id,
              quantity: 6,
              unit_cost: 100 / 6,
              allocated_cost: 99.99,
              active_allocated_cost: 99.99,
            },
          ],
        }),
      ],
    });

    expect(result.rows[0]).toMatchObject({
      costPerUnit: { kind: 'open' },
      inventoryValue: { kind: 'known', amount: 0 },
    });
  });

  it('rekonstruiert historische Stückkosten nach Retoure und erneutem Verkauf', () => {
    const soldLot = lot('lot-resold', 'purchase-1', 6, 0, 100 / 6);
    const returnedSale = sale('sale-returned', {
      returned_at: '2026-08-21T10:00:00.000Z',
      lines: [
        {
          id: 'line-returned',
          sale_id: 'sale-returned',
          catalog_product_id: position.catalog_product_id,
          title_snapshot: position.title,
          quantity: 6,
          unit_sale_price: 30,
          line_total: 180,
          cost_of_goods_sold: 100,
          tax_mode: 'diff_25a',
        },
      ],
      lot_allocations: [
        {
          id: 'allocation-returned-resold',
          workspace_id: workspaceId,
          sale_line_id: 'line-returned',
          stock_lot_id: soldLot.id,
          quantity: 6,
          unit_cost: 100 / 6,
          allocated_cost: 100,
          active_allocated_cost: 0,
        },
      ],
    });
    const resale = sale('sale-resale', {
      lines: [
        {
          id: 'line-resale',
          sale_id: 'sale-resale',
          catalog_product_id: position.catalog_product_id,
          title_snapshot: position.title,
          quantity: 6,
          unit_sale_price: 32,
          line_total: 192,
          cost_of_goods_sold: 100,
          tax_mode: 'diff_25a',
        },
      ],
      lot_allocations: [
        {
          id: 'allocation-resale',
          workspace_id: workspaceId,
          sale_line_id: 'line-resale',
          stock_lot_id: soldLot.id,
          quantity: 6,
          unit_cost: 100 / 6,
          allocated_cost: 100,
          active_allocated_cost: 100,
        },
      ],
    });
    const result = build({
      lots: [soldLot],
      movements: [
        movement('first-sale', soldLot.id, 'out', 6, 'sale'),
        movement('return', soldLot.id, 'in', 6, 'return'),
        movement('resale', soldLot.id, 'out', 6, 'sale'),
      ],
      purchases: [purchase('purchase-1')],
      sales: [returnedSale, resale],
    });

    expect(result.rows[0]).toMatchObject({
      quantity: { total: 6, available: 0, reserved: 0, sold: 6 },
      costPerUnit: { kind: 'known', amount: 16.67 },
      inventoryValue: { kind: 'known', amount: 0 },
    });
  });

  it('lässt den Bestandswert bei einem Review-Konflikt offen', () => {
    const result = build({
      lots: [lot('lot-review', 'purchase-1', 2, 2, 10)],
      purchases: [purchase('purchase-1')],
    });

    expect(result.rows[0]).toMatchObject({
      quantityState: 'review_required',
      inventoryValue: { kind: 'open' },
    });
  });

  it('lässt verknüpfte Entwurfskosten trotz vorhandener Zusatzkosten offen', () => {
    const result = build({
      individualItems: [
        individual({
          purchase_id: 'draft',
          allocated_purchase_cost: 0,
          total_item_cost: 5,
        }),
      ],
      purchases: [purchase('draft', false)],
    });

    expect(result.rows[0]).toMatchObject({
      costPerUnit: { kind: 'open' },
      inventoryValue: { kind: 'open' },
    });
    expect(result.inventoryValue).toEqual({ kind: 'open' });
  });

  it('summiert den Gesamtbestandswert nur bei vollständig bekannten Quellen und Zeilen', () => {
    const complete = build({
      individualItems: [individual()],
      positions: [
        { ...position, available_quantity: 2, reserved_quantity: 0, on_hand_quantity: 2 },
      ],
      lots: [lot('lot-total', 'purchase-1', 2, 2, 10)],
      purchases: [purchase('purchase-1')],
    });
    const loading = build({
      inventoryState: 'loading',
      individualItems: [individual()],
      purchases: [purchase('purchase-1')],
    });

    expect(complete.inventoryValue).toEqual({ kind: 'known', amount: 30 });
    expect(loading.inventoryValue).toEqual({ kind: 'open' });
  });

  it('zeigt ein bereits empfangenes Nullkosten-Los aus einem Entwurf weiter als offen', () => {
    const draftLot = lot('lot-draft', 'draft', 2, 2, 0);
    const result = build({
      positions: [
        {
          ...position,
          available_quantity: 2,
          reserved_quantity: 0,
          on_hand_quantity: 2,
          oldest_available_unit_cost: 0,
        },
      ],
      lots: [draftLot],
      purchases: [purchase('draft', false)],
    });

    expect(result.rows[0]).toMatchObject({
      costPerUnit: { kind: 'open' },
      inventoryValue: { kind: 'open' },
    });
  });

  it('leitet Reservierungen und Freigaben aus echten Bewegungen ab', () => {
    const reservedLot = lot('lot-reserved', 'purchase-1', 6, 6, 10);
    const result = build({
      positions: [
        {
          ...position,
          available_quantity: 6,
          reserved_quantity: 0,
          on_hand_quantity: 6,
        },
      ],
      lots: [reservedLot],
      movements: [
        movement('release', reservedLot.id, 'in', 1, 'reservation_release'),
        movement('reserve', reservedLot.id, 'out', 2, 'reservation'),
      ],
      purchases: [purchase('purchase-1')],
    });

    expect(result.rows[0].quantity).toEqual({ total: 6, available: 5, reserved: 1, sold: 0 });
  });

  it.each([
    ['Retoure ohne Verkauf', movement('orphan-return', 'lot-invalid', 'in', 1, 'return')],
    [
      'Freigabe ohne Reservierung',
      movement('orphan-release', 'lot-invalid', 'in', 1, 'reservation_release'),
    ],
  ])('markiert einen negativen Netto-Saldo bei %s zur Prüfung', (_reason, invalidMovement) => {
    const row = build({
      positions: [
        { ...position, available_quantity: 1, reserved_quantity: 0, on_hand_quantity: 1 },
      ],
      lots: [lot('lot-invalid', 'purchase-1', 1, 1, 10)],
      movements: [invalidMovement],
      purchases: [purchase('purchase-1')],
    }).rows[0];

    expect(row).toMatchObject({
      quantity: { total: 1, available: 1, reserved: 0, sold: 0 },
      quantityState: 'review_required',
      inventoryValue: { kind: 'open' },
      canSell: false,
    });
  });

  it('erkennt einen negativen Verkaufssaldo je Los trotz ausgeglichener Produktsumme', () => {
    const returnedLot = lot('lot-return-without-sale', 'purchase-1', 1, 1, 10);
    const soldLot = lot('lot-sale', 'purchase-1', 1, 0, 10);
    const row = build({
      positions: [
        { ...position, available_quantity: 1, reserved_quantity: 0, on_hand_quantity: 1 },
      ],
      lots: [returnedLot, soldLot],
      movements: [
        movement('return-without-sale', returnedLot.id, 'in', 1, 'return'),
        movement('valid-sale', soldLot.id, 'out', 1, 'sale'),
      ],
      purchases: [purchase('purchase-1')],
    }).rows[0];

    expect(row).toMatchObject({
      quantity: { total: 2, available: 1, reserved: 0, sold: 1 },
      quantityState: 'review_required',
      inventoryValue: { kind: 'open' },
      canSell: false,
    });
  });

  it('erkennt einen negativen Reservierungssaldo je Los trotz ausgeglichener Produktsumme', () => {
    const releasedLot = lot('lot-release-without-reservation', 'purchase-1', 1, 1, 10);
    const reservedLot = lot('lot-reservation', 'purchase-1', 1, 1, 10);
    const row = build({
      positions: [
        { ...position, available_quantity: 1, reserved_quantity: 1, on_hand_quantity: 2 },
      ],
      lots: [releasedLot, reservedLot],
      movements: [
        movement('release-without-reservation', releasedLot.id, 'in', 1, 'reservation_release'),
        movement('valid-reservation', reservedLot.id, 'out', 1, 'reservation'),
      ],
      purchases: [purchase('purchase-1')],
    }).rows[0];

    expect(row).toMatchObject({
      quantity: { total: 2, available: 1, reserved: 1, sold: 0 },
      quantityState: 'review_required',
      inventoryValue: { kind: 'open' },
      canSell: false,
    });
  });

  it('ordnet aktive, retournierte und stornierte Verkaufsbezüge mit sicheren Links zu', () => {
    const result = build({
      individualItems: [
        individual({ status: 'sold', sale_state: 'sold', active_sale_id: 'active' }),
      ],
      purchases: [purchase('purchase-1')],
      sales: [
        sale('active'),
        sale('returned', { returned_at: '2026-08-21T10:00:00.000Z' }),
        sale('voided', { voided_at: '2026-08-22T10:00:00.000Z' }),
      ],
    });

    expect(result.rows[0].sales).toEqual([
      expect.objectContaining({
        id: 'active',
        state: 'active',
        directResult: 25,
        link: '/sales?saleId=active',
      }),
      expect.objectContaining({
        id: 'returned',
        state: 'returned',
        directResult: null,
        link: '/sales?saleId=returned',
      }),
      expect.objectContaining({
        id: 'voided',
        state: 'voided',
        directResult: null,
        link: '/sales?saleId=voided',
      }),
    ]);
  });

  it('zeigt bei Mehrpositionsverkäufen kein Ergebnis der gesamten Bestellung am Artikel', () => {
    const multiLineSale = sale('multi-line', {
      net_profit: 50,
      lines: [
        ...sale('single').lines!,
        {
          id: 'line-other',
          sale_id: 'multi-line',
          inventory_item_id: 'item-2',
          title_snapshot: 'Anderer Artikel',
          quantity: 1,
          unit_sale_price: 20,
          line_total: 20,
          cost_of_goods_sold: 5,
          tax_mode: 'diff_25a',
        },
      ],
    });
    multiLineSale.lines![0] = { ...multiLineSale.lines![0], sale_id: 'multi-line' };
    const result = build({
      individualItems: [individual({ status: 'sold', sale_state: 'sold' })],
      purchases: [purchase('purchase-1')],
      sales: [multiLineSale],
    });

    expect(result.rows[0].sales[0]).toMatchObject({
      revenue: 42,
      directResult: null,
      showResultInSale: true,
    });
  });

  it.each([
    ['loading', 'loading'],
    ['error', 'error'],
  ] as const)('unterscheidet Herkunft %s von nicht verknüpft', (purchaseState, expected) => {
    const result = build({
      individualItems: [individual()],
      purchaseState,
    });

    expect(result.rows[0]).toMatchObject({ originState: expected, origins: [] });
  });

  it('kennzeichnet nur Artikel ohne Einkaufsverknüpfung als nicht verknüpft', () => {
    const result = build({ individualItems: [individual({ purchase_id: null })] });

    expect(result.rows[0].originState).toBe('not_linked');
  });

  it('löst den Titel aus der Einkaufsposition für ausverkaufte Mengenware auf', () => {
    const sourcePurchase = {
      ...purchase('purchase-example'),
      purchase_lines: [
        {
          id: 'purchase-line-example',
          workspace_id: workspaceId,
          purchase_id: 'purchase-example',
          catalog_product_id: position.catalog_product_id,
          title_snapshot: 'Testtitel aus Einkauf',
          line_kind: 'quantity' as const,
          ordered_quantity: 2,
          received_quantity: 2,
          unit_purchase_price: 10,
          line_total: 20,
        },
      ],
    };
    const soldLot = lot('lot-example', sourcePurchase.id, 2, 0, 10);
    const result = build({
      lots: [soldLot],
      movements: [movement('sold-example', soldLot.id, 'out', 2, 'sale')],
      purchases: [sourcePurchase],
    });

    expect(result.rows[0].title).toBe('Testtitel aus Einkauf');
  });
});

describe('Paketinhalt in der Inventarliste', () => {
  it('zeigt NULL-Kosten trotz abgeschlossenem Paket als offen und behält den Einkaufslink', () => {
    const result = build({
      individualItems: [
        individual({
          source_package_line_id: 'package',
          allocated_purchase_cost: null,
          total_item_cost: 0,
        }),
      ],
      purchases: [purchase('purchase-1')],
    });
    expect(result.rows[0].costPerUnit).toEqual({ kind: 'open' });
    expect(JSON.stringify(result.rows[0])).toContain('/purchases/purchase-1');
  });
});
