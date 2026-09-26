import { describe, expect, it } from 'vitest';
import type {
  InventoryItem,
  Purchase,
  PurchaseLine,
  Sale,
  StockLot,
  StockMovement,
} from '../../../core/models/flipbase.models';
import {
  getPurchaseDisplayTitle,
  mapPurchaseDetailRows,
  mapPurchaseListRow,
  type PurchasePresentationContext,
} from './purchase-presentation';

const purchaseId = 'purchase-1';
const workspaceId = 'workspace-1';

const basePurchase: Purchase = {
  id: purchaseId,
  workspace_id: workspaceId,
  type: 'single',
  title: 'Haushaltswaren August',
  notes: 'Haushaltswaren August',
  purchase_date: '2026-08-20',
  purchase_price: 40,
  total_purchase_cost: 45,
  cost_allocation_mode: 'even',
  entry_status: 'draft',
  receiving_status: 'draft',
  supplier: { id: 'supplier-1', workspace_id: workspaceId, name: 'Beispiel GmbH' },
  purchase_lines: [],
  items: [],
};

const normalLine: PurchaseLine = {
  id: 'line-normal',
  workspace_id: workspaceId,
  purchase_id: purchaseId,
  title_snapshot: 'Tasse',
  catalog_product_id: null,
  line_kind: 'individual',
  ordered_quantity: 2,
  received_quantity: 2,
  price_mode: 'priced',
  unit_purchase_price: 20,
  line_total: 40,
  allocated_additional_cost: 5,
  allocated_total_cost: 45,
  condition_snapshot: 'very_good',
};

const item = (
  id: string,
  status: InventoryItem['status'],
  saleState: InventoryItem['sale_state'],
): InventoryItem => ({
  id,
  workspace_id: workspaceId,
  purchase_id: purchaseId,
  purchase_line_id: normalLine.id,
  title: 'Tasse',
  condition: 'very_good',
  status,
  sale_state: saleState,
  allocated_purchase_cost: 22.5,
});

function context(
  overrides: Partial<PurchasePresentationContext> = {},
): PurchasePresentationContext {
  return {
    inventoryItems: [],
    stockLots: [],
    stockMovements: [],
    sales: [],
    inventoryState: 'loaded',
    stockState: 'loaded',
    salesState: 'loaded',
    ...overrides,
  };
}

describe('purchase presentation mapper', () => {
  it.each([
    ['Entwurf', { entry_status: 'draft', receiving_status: 'draft', purchase_lines: [] }],
    ['Bestellt', { entry_status: 'capturing', receiving_status: 'ordered' }],
    ['Bestellt', { receiving_status: 'ordered', shipment_status: 'in_transit' }],
    ['Teillieferung', { receiving_status: 'partially_received', shipment_status: 'arrived' }],
    [
      'Angekommen',
      { receiving_status: 'ordered', shipment_status: 'arrived', content_status: 'unknown' },
    ],
    ['Angekommen', { entry_status: 'capturing', receiving_status: 'received' }],
    [
      'Angekommen',
      { type: 'mystery_pack', entry_status: 'capturing', receiving_status: 'received' },
    ],
    ['Abgeschlossen', { entry_status: 'finalized', receiving_status: 'received' }],
    ['Archiviert', { receiving_status: 'archived' }],
    ['Storniert', { receiving_status: 'cancelled' }],
  ] as const)('bildet den Einkaufsstatus %s unabhängig vom Artikelverkauf ab', (want, patch) => {
    const purchase = {
      ...basePurchase,
      purchase_lines: [normalLine],
      ...patch,
    } as Purchase;

    expect(mapPurchaseListRow(purchase, context()).purchaseStatus).toBe(want);
  });

  it('hält Einkaufsnummer und externe Verkäuferreferenz getrennt', () => {
    const row = mapPurchaseListRow(
      { ...basePurchase, record_number: '2026-123', supplier_reference: 'Verkäufer-456' },
      context(),
    );
    expect(row.reference).toBe('#2026-123');
    expect(row.supplierReference).toBe('Verkäufer-456');
    expect(row.title).toBe(basePurchase.notes);
  });

  it('macht den gewählten Verkäufer durchsuchbar', () => {
    const row = mapPurchaseListRow(
      {
        ...basePurchase,
        seller_name: 'Großhandel Nord',
      },
      context(),
    );

    expect(row.supplierLabel).toBe('Großhandel Nord');
    expect(row.sellerSearchText).toContain('Großhandel Nord');
  });

  it('zeigt ohne jede Verkäuferangabe „Nicht angegeben“', () => {
    const row = mapPurchaseListRow({ ...basePurchase, supplier: undefined }, context());

    expect(row.supplierLabel).toBe('Nicht angegeben');
  });

  it('verwendet ohne Einkaufsnummer nicht ersatzweise die Bezeichnung', () => {
    const row = mapPurchaseListRow({ ...basePurchase, record_number: null }, context());

    expect(row.reference).toBe('—');
    expect(row.title).toBe(basePurchase.title);
  });

  it('laesst die Beschreibung leer statt einen technischen Titel einzusetzen', () => {
    const row = mapPurchaseListRow({ ...basePurchase, notes: null, title: 'Einkauf' }, context());

    expect(row.title).toBe('');
  });

  it('markiert einen ungeklärten normalen Altkauf zur Prüfung', () => {
    const legacyItem = { ...item('legacy', 'received', 'no_active_sale'), purchase_line_id: null };
    const purchase = {
      ...basePurchase,
      entry_status: 'capturing' as const,
      receiving_status: 'received' as const,
      purchase_lines: [],
      items: [legacyItem],
    };

    expect(
      mapPurchaseListRow(purchase, context({ inventoryItems: [legacyItem] })).captureStatus,
    ).toBe('Prüfung erforderlich');
  });

  it('zählt echte Verkäufe getrennt, ohne den Einkauf als verkauft zu bezeichnen', () => {
    const available = item('available', 'ready', 'no_active_sale');
    const sold = item('sold', 'sold', 'sold');
    const unclear = item('unclear', 'sold', 'legacy_sold_unverified');
    const purchase = {
      ...basePurchase,
      entry_status: 'finalized' as const,
      receiving_status: 'received' as const,
      purchase_lines: [normalLine],
    };

    const row = mapPurchaseListRow(
      purchase,
      context({ inventoryItems: [available, sold, unclear] }),
    );

    expect(row.purchaseStatus).toBe('Abgeschlossen');
    expect(row.captureStatus).toBe('Erfassung abgeschlossen');
    expect(row.totalUnits).toBe(2);
    expect(row.availableUnits).toBe(1);
    expect(row.soldUnits).toBe(1);
  });

  it('zeigt unbekannte Kosten offen und eine unvollständige Verteilung separat', () => {
    const row = mapPurchaseListRow(
      {
        ...basePurchase,
        purchase_price: null,
        total_purchase_cost: null,
        entry_status: 'capturing',
        purchase_lines: [{ ...normalLine, allocated_total_cost: undefined }],
      },
      context(),
    );

    expect(row.totalCost).toEqual({ kind: 'open' });
    expect(row.allocationOpen).toBe(true);
  });

  it('berechnet bekannte Gesamtkosten aus Warenbetrag und zusätzlichen Kosten', () => {
    const row = mapPurchaseListRow(
      {
        ...basePurchase,
        total_purchase_cost: undefined,
        purchase_price: 40,
        shipping_cost: 1,
        other_costs: 1,
        costs: [{ type: 'shipping', amount: 3 }],
        purchase_lines: [{ ...normalLine, allocated_total_cost: 45 }],
      },
      context(),
    );

    expect(row.totalCost).toEqual({ kind: 'known', amount: 45 });
    expect(row.allocationOpen).toBe(false);
  });

  it('zieht im Listen-Fallback einen Rabatt vom Warenbetrag ab', () => {
    const row = mapPurchaseListRow(
      {
        ...basePurchase,
        total_purchase_cost: undefined,
        purchase_price: 123.45,
        discount_amount: 23.46,
        costs: [
          { type: 'shipping', amount: 5.55 },
          { type: 'customs', amount: 1.11 },
        ],
        purchase_lines: [{ ...normalLine, allocated_total_cost: 106.65 }],
      },
      context(),
    );

    expect(row.totalCost).toEqual({ kind: 'known', amount: 106.65 });
    expect(row.allocationOpen).toBe(false);
  });

  it('verwendet für Mengenartikel bestellte Einheiten, Bestandslose und Verkaufsbewegungen', () => {
    const quantityLine: PurchaseLine = {
      ...normalLine,
      id: 'line-quantity',
      line_kind: 'quantity',
      catalog_product_id: 'catalog-1',
      ordered_quantity: 5,
      received_quantity: 4,
    };
    const lot: StockLot = {
      id: 'lot-1',
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      purchase_line_id: quantityLine.id,
      catalog_product_id: 'catalog-1',
      received_quantity: 4,
      remaining_quantity: 2,
      unit_cost: 9,
      received_at: '2026-08-21T10:00:00Z',
    };
    const movements: StockMovement[] = [
      {
        id: 'sale-out',
        workspace_id: workspaceId,
        stock_lot_id: lot.id,
        sale_line_id: 'sale-line',
        direction: 'out',
        quantity: 2,
        reason: 'sale',
      },
    ];
    const purchase = { ...basePurchase, purchase_lines: [quantityLine] };

    const row = mapPurchaseListRow(
      purchase,
      context({ stockLots: [lot], stockMovements: movements }),
    );

    expect(row.totalUnits).toBe(5);
    expect(row.availableUnits).toBe(2);
    expect(row.soldUnits).toBe(2);
  });

  it('leitet Erhalten ausschließlich aus bestätigter und bestellter Positionsmenge ab', () => {
    const line: PurchaseLine = {
      ...normalLine,
      id: 'line-receipt',
      title_snapshot: 'Schuhe',
      ordered_quantity: 2,
      received_quantity: 0,
    };

    const row = mapPurchaseListRow(
      { ...basePurchase, purchase_lines: [line] },
      context({ inventoryItems: [item('sold', 'sold', 'sold')] }),
    );

    expect(row.receipt).toEqual({
      kind: 'known',
      received: 0,
      ordered: 2,
      lines: [
        {
          id: 'line-receipt',
          title: 'Schuhe',
          catalogProductId: null,
          ean: null,
          received: 0,
          ordered: 2,
        },
      ],
    });
  });

  it('zieht eine Retoure beziehungsweise Aufhebungs-Rückbuchung vom verkauften Mengenbestand ab', () => {
    const quantityLine = {
      ...normalLine,
      id: 'line-return',
      line_kind: 'quantity' as const,
      catalog_product_id: 'catalog-1',
      ordered_quantity: 3,
      received_quantity: 3,
    };
    const lot: StockLot = {
      id: 'lot-return',
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      purchase_line_id: quantityLine.id,
      catalog_product_id: 'catalog-1',
      received_quantity: 3,
      remaining_quantity: 2,
      unit_cost: 15,
      received_at: '2026-08-21T10:00:00Z',
    };
    const movements: StockMovement[] = [
      {
        id: 'sale-out',
        workspace_id: workspaceId,
        stock_lot_id: lot.id,
        sale_line_id: 'sale-line',
        direction: 'out',
        quantity: 2,
        reason: 'sale',
      },
      {
        id: 'return-in',
        workspace_id: workspaceId,
        stock_lot_id: lot.id,
        sale_line_id: 'sale-line',
        direction: 'in',
        quantity: 1,
        reason: 'return',
      },
    ];

    const row = mapPurchaseListRow(
      { ...basePurchase, purchase_lines: [quantityLine] },
      context({ stockLots: [lot], stockMovements: movements }),
    );

    expect(row.availableUnits).toBe(2);
    expect(row.soldUnits).toBe(1);
  });

  it('gibt während noch fehlender Bestandsdaten keine fachliche Null aus', () => {
    const quantityLine = { ...normalLine, line_kind: 'quantity' as const };
    const row = mapPurchaseListRow(
      { ...basePurchase, purchase_lines: [quantityLine] },
      context({ stockState: 'loading' }),
    );

    expect(row.totalUnits).toBe(2);
    expect(row.availableUnits).toBeNull();
    expect(row.soldUnits).toBeNull();
    expect(row.quantityState).toBe('loading');
  });

  it.each(['loading', 'error'] as const)(
    'gibt Einzelmengen bei Inventarzustand %s nicht als Nullbestand aus',
    (inventoryState) => {
      const row = mapPurchaseListRow(
        { ...basePurchase, purchase_lines: [normalLine] },
        context({ inventoryState, inventoryItems: [] }),
      );

      expect(row.availableUnits).toBeNull();
      expect(row.soldUnits).toBeNull();
      expect(row.quantityState).toBe(inventoryState);
    },
  );

  it('unterscheidet einen Bestandsfehler vom laufenden Laden', () => {
    const quantityLine = { ...normalLine, line_kind: 'quantity' as const };
    const row = mapPurchaseListRow(
      { ...basePurchase, purchase_lines: [quantityLine] },
      context({ stockState: 'error' }),
    );

    expect(row.availableUnits).toBeNull();
    expect(row.soldUnits).toBeNull();
    expect(row.quantityState).toBe('error');
  });

  it('bildet normale Details mit bestellter und erhaltener Menge sowie Zeilensumme ab', () => {
    const available = item('available', 'ready', 'no_active_sale');
    const sold = item('sold', 'sold', 'sold');
    const rows = mapPurchaseDetailRows(
      { ...basePurchase, purchase_lines: [normalLine] },
      context({ inventoryItems: [available, sold] }),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'normal',
        title: 'Tasse',
        orderedQuantity: 2,
        receivedQuantity: 2,
        unitPurchasePrice: { kind: 'known', amount: 20 },
        lineTotal: { kind: 'known', amount: 40 },
        availableUnits: 1,
        soldUnits: 1,
      }),
    ]);
  });

  it('hält Mystery-Details in derselben einfachen Tabellenstruktur lesbar', () => {
    const mysteryLine: PurchaseLine = {
      ...normalLine,
      price_mode: 'unpriced_mystery',
      unit_purchase_price: null,
      line_total: null,
      allocated_additional_cost: 45,
      estimated_market_value: 60,
      condition_snapshot: 'like_new',
    };
    const rows = mapPurchaseDetailRows(
      { ...basePurchase, type: 'mystery_pack', purchase_lines: [mysteryLine] },
      context(),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'mystery',
        orderedQuantity: 2,
        receivedQuantity: 2,
        unitPurchasePrice: { kind: 'known', amount: 22.5 },
        lineTotal: { kind: 'known', amount: 45 },
      }),
    ]);
  });

  it('verliert einen vorhandenen Legacy-Artikel ohne Einkaufsposition nicht aus den Details', () => {
    const legacyItem = {
      ...item('legacy-item', 'ready', 'no_active_sale'),
      purchase_line_id: null,
      allocated_purchase_cost: 12,
      expected_value: 30,
    };

    const rows = mapPurchaseDetailRows(
      { ...basePurchase, type: 'mystery_pack', purchase_lines: [] },
      context({ inventoryItems: [legacyItem] }),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'mystery',
        id: 'legacy-item',
        inventoryItemId: 'legacy-item',
        orderedQuantity: 1,
        receivedQuantity: 1,
        unitPurchasePrice: { kind: 'known', amount: 12 },
        lineTotal: { kind: 'known', amount: 12 },
        availableUnits: 1,
        soldUnits: 0,
      }),
    ]);
  });

  it('ordnet mehrere persistierte Einzelverkäufe autoritativ zu und dedupliziert denselben Verkauf', () => {
    const soldItem: InventoryItem = {
      ...item('sold-item', 'sold', 'sold'),
      active_sale_id: null,
      active_sale_count: 0,
    };
    const firstSale: Sale = {
      id: 'sale-1',
      workspace_id: workspaceId,
      platform: 'ebay',
      sale_price: 30,
      sale_price_total: 33,
      sale_date: '2026-08-25',
      platform_fee: 3,
      shipping_cost: 5,
      packaging_cost: 0,
      other_costs: 0,
      net_profit: 13,
      has_persisted_lines: true,
      lines: [
        {
          id: 'sale-line-1',
          sale_id: 'sale-1',
          inventory_item_id: soldItem.id,
          title_snapshot: soldItem.title,
          quantity: 1,
          unit_sale_price: 33,
          line_total: 33,
          cost_of_goods_sold: 20,
          tax_mode: 'diff_25a',
        },
        {
          id: 'sale-line-duplicate',
          sale_id: 'sale-1',
          inventory_item_id: soldItem.id,
          title_snapshot: soldItem.title,
          quantity: 1,
          unit_sale_price: 0,
          line_total: 0,
          cost_of_goods_sold: 0,
          tax_mode: 'diff_25a',
        },
      ],
    };
    const returnedSale: Sale = {
      ...firstSale,
      id: 'sale-returned',
      returned_at: '2026-08-28T10:00:00Z',
      sale_price: 20,
      sale_price_total: 20,
      net_profit: -2,
      lines: [
        {
          ...firstSale.lines![0],
          id: 'returned-line',
          sale_id: 'sale-returned',
        },
      ],
    };
    const voidedSale: Sale = {
      ...firstSale,
      id: 'sale-voided',
      voided_at: '2026-08-29T10:00:00Z',
      voided_by: 'user-1',
      void_reason: 'Doppelt erfasst',
      sale_price: 18,
      sale_price_total: 18,
      net_profit: -4,
      lines: [
        {
          ...firstSale.lines![0],
          id: 'voided-line',
          sale_id: 'sale-voided',
        },
      ],
    };
    const uncertainItem = {
      ...item('uncertain-item', 'sold', 'legacy_sold_unverified'),
      active_sale_id: 'legacy-sale',
    };
    const rows = mapPurchaseDetailRows(
      {
        ...basePurchase,
        type: 'mystery_pack',
        purchase_lines: [
          { ...normalLine, id: 'sold-line' },
          { ...normalLine, id: 'uncertain-line' },
        ],
      },
      context({
        inventoryItems: [
          { ...soldItem, purchase_line_id: 'sold-line' },
          { ...uncertainItem, purchase_line_id: 'uncertain-line' },
        ],
        sales: [firstSale, returnedSale, voidedSale],
      }),
    );

    expect(rows[0]).toMatchObject({
      recordedSales: [
        { id: 'sale-1', status: 'active', revenue: 33, directResult: 13 },
        { id: 'sale-returned', status: 'returned', revenue: null, directResult: null },
        { id: 'sale-voided', status: 'voided', revenue: null, directResult: null },
      ],
    });
    expect(rows[1]).toMatchObject({ recordedSales: [] });
  });

  it('ordnet einen Mengenverkauf über seine Losallokation dem Einkauf zu', () => {
    const quantityLine = {
      ...normalLine,
      id: 'quantity-line',
      line_kind: 'quantity' as const,
      catalog_product_id: 'catalog-1',
    };
    const lot: StockLot = {
      id: 'purchase-lot',
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      purchase_line_id: quantityLine.id,
      catalog_product_id: 'catalog-1',
      received_quantity: 2,
      remaining_quantity: 0,
      unit_cost: 10,
      received_at: '2026-08-20T10:00:00Z',
    };
    const sale: Sale = {
      id: 'quantity-sale',
      workspace_id: workspaceId,
      platform: 'direct',
      sale_price: 30,
      sale_date: '2026-08-25',
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
      net_profit: 10,
      has_persisted_lines: true,
      lines: [
        {
          id: 'quantity-sale-line',
          sale_id: 'quantity-sale',
          catalog_product_id: 'catalog-1',
          title_snapshot: 'Tassen-Set',
          quantity: 2,
          unit_sale_price: 15,
          line_total: 30,
          cost_of_goods_sold: 20,
          tax_mode: 'diff_25a',
        },
      ],
      lot_allocations: [
        {
          id: 'allocation-1',
          workspace_id: workspaceId,
          sale_line_id: 'quantity-sale-line',
          stock_lot_id: lot.id,
          quantity: 2,
          unit_cost: 10,
        },
      ],
    };

    const rows = mapPurchaseDetailRows(
      { ...basePurchase, purchase_lines: [quantityLine] },
      context({ stockLots: [lot], sales: [sale] }),
    );

    expect(rows[0]).toMatchObject({
      recordedSales: [{ id: 'quantity-sale', revenue: 30, directResult: 10 }],
    });
  });

  it.each(['loading', 'error'] as const)(
    'gibt bei Verkaufszustand %s keine erfundenen Verkaufsdaten aus',
    (salesState) => {
      const rows = mapPurchaseDetailRows(
        { ...basePurchase, purchase_lines: [normalLine] },
        context({ salesState }),
      );

      expect(rows[0]).toMatchObject({ recordedSales: null, salesState });
    },
  );
});

describe('getPurchaseDisplayTitle', () => {
  it('gibt null zurück wenn kein Einkauf übergeben wird', () => {
    expect(getPurchaseDisplayTitle(null)).toBeNull();
    expect(getPurchaseDisplayTitle(undefined)).toBeNull();
  });

  it('bevorzugt die Belegnummer wenn vorhanden', () => {
    expect(
      getPurchaseDisplayTitle({
        ...basePurchase,
        record_number: 'PO-0001',
        title: 'Haushaltswaren',
        supplier: { id: 's1', workspace_id: workspaceId, name: 'Lieferant' },
      }),
    ).toBe('PO-0001');
  });

  it('fällt auf die Beschreibung zurück wenn die Belegnummer fehlt oder leer ist', () => {
    expect(
      getPurchaseDisplayTitle({
        ...basePurchase,
        record_number: '   ',
        notes: 'Flohmarktfund',
        supplier: { id: 's1', workspace_id: workspaceId, name: 'Lieferant' },
      }),
    ).toBe('Flohmarktfund');
  });

  it('fällt auf den Lieferantennamen zurück wenn Belegnummer und Beschreibung fehlen', () => {
    expect(
      getPurchaseDisplayTitle({
        ...basePurchase,
        record_number: '',
        notes: '   ',
        supplier: { id: 's1', workspace_id: workspaceId, name: 'Großhandel Nord' },
      }),
    ).toBe('Großhandel Nord');
  });

  it('gibt null zurück wenn weder Belegnummer noch Beschreibung noch Lieferant vorhanden sind', () => {
    expect(
      getPurchaseDisplayTitle({
        ...basePurchase,
        record_number: '',
        notes: '',
        supplier: undefined,
      }),
    ).toBeNull();
  });
});
