import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockDataStoreService } from './mock-data-store.service';
import { Sale, SaleLine } from '../models/flipbase.models';

describe('Demo-Produktbestand', () => {
  const sale: Sale = {
    id: 'sale',
    workspace_id: 'workspace',
    platform: 'direct',
    sale_price: 60,
    sale_date: '2026-09-09',
    platform_fee: 0,
    shipping_cost: 0,
    packaging_cost: 0,
    other_costs: 0,
  };
  const saleLine: SaleLine = {
    id: 'sale-line',
    sale_id: 'sale',
    catalog_product_id: 'product',
    title_snapshot: 'Schuh',
    quantity: 3,
    unit_sale_price: 20,
    line_total: 60,
    cost_of_goods_sold: 0,
    tax_mode: 'diff_25a',
  };
  let store: MockDataStoreService;
  beforeEach(() => {
    localStorage.clear();
    store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.saveCatalogProduct({
      id: 'product',
      workspace_id: 'workspace',
      title: 'Schuh',
      tracking_mode: 'quantity',
      is_public_store: false,
    });
    store.savePurchase({
      id: 'purchase',
      workspace_id: 'workspace',
      type: 'lot',
      title: 'Einkauf',
      purchase_date: '2026-09-08',
      purchase_price: 50,
      cost_allocation_mode: 'even',
      entry_status: 'draft',
      content_status: 'known',
      pricing_mode: 'individual',
    });
    store.savePurchaseLine({
      id: 'line',
      workspace_id: 'workspace',
      purchase_id: 'purchase',
      catalog_product_id: 'product',
      title_snapshot: 'Schuh',
      line_kind: 'quantity',
      ordered_quantity: 5,
      received_quantity: 0,
      unit_purchase_price: 10,
      line_total: 50,
    });
  });

  it('speichert beim Kostenabschluss Gesamtkosten und steuerlichen Einkaufspreis getrennt', () => {
    const purchase = store.getPurchases('workspace')[0];
    const line = store.getPurchaseLines('workspace')[0];
    store.savePurchase({
      ...purchase,
      purchase_price: 100,
      costs: [
        {
          type: 'shipping',
          amount: 10,
          allocation_method: 'quantity',
          tax_treatment: 'purchase_price',
        },
        { type: 'shipping', amount: 20, allocation_method: 'quantity', tax_treatment: 'expense' },
      ],
    });
    store.savePurchaseLine({
      ...line,
      ordered_quantity: 1,
      unit_purchase_price: 100,
      line_total: 100,
    });
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 1 }],
      'receipt',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    expect(store.getStockLots('workspace')[0]).toMatchObject({
      unit_cost: 130,
      unit_tax_purchase_cost: 110,
    });
  });
  it('führt den Einzelstück-Abschluss durch denselben steuerlichen Kostenplan', () => {
    const purchase = store.getPurchases('workspace')[0];
    const line = store.getPurchaseLines('workspace')[0];
    store.savePurchase({
      ...purchase,
      purchase_price: 100,
      costs: [
        {
          type: 'shipping',
          amount: 10,
          allocation_method: 'quantity',
          tax_treatment: 'purchase_price',
        },
        { type: 'shipping', amount: 20, allocation_method: 'quantity', tax_treatment: 'expense' },
      ],
    });
    store.savePurchaseLine({
      ...line,
      line_kind: 'individual',
      catalog_product_id: null,
      ordered_quantity: 1,
      unit_purchase_price: 100,
      line_total: 100,
    });
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    expect(store.getItems('workspace')[0]).toMatchObject({
      allocated_purchase_cost: 130,
      tax_purchase_cost: 110,
    });
  });
  it('belässt den steuerlichen Einkaufspreis bei ungeklärten Zusatzkosten offen', () => {
    const purchase = store.getPurchases('workspace')[0];
    store.savePurchase({
      ...purchase,
      costs: [{ type: 'shipping', amount: 10, allocation_method: 'quantity' }],
    });
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 5 }],
      'receipt',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    expect(store.getStockLots('workspace')[0]).toMatchObject({
      unit_cost: 12,
      unit_tax_purchase_cost: null,
    });
  });
  it('friert Reparaturkosten nur im betrieblichen Wareneinsatz des Einzelstückverkaufs ein', () => {
    store.saveItem({
      id: 'item',
      workspace_id: 'workspace',
      title: 'Kamera',
      condition: 'used',
      status: 'ready',
      sale_state: 'no_active_sale',
      allocated_purchase_cost: 130,
      tax_purchase_cost: 110,
    });
    store.saveItemCost({ id: 'repair', inventory_item_id: 'item', type: 'repair', amount: 25 });
    const booked = store.bookSaleAtomically('workspace', sale, [
      { ...saleLine, catalog_product_id: null, inventory_item_id: 'item', quantity: 1 },
    ]);
    expect(booked.error).toBeNull();
    expect(booked.saleLines[0]).toMatchObject({ cost_of_goods_sold: 155, tax_purchase_cost: 110 });
    store.saveItemCost({ id: 'repair', inventory_item_id: 'item', type: 'repair', amount: 99 });
    expect(store.getSales('workspace')[0].lines?.[0]).toMatchObject({
      cost_of_goods_sold: 155,
      tax_purchase_cost: 110,
    });
  });
  it('füllt historische Artikelwerte beim Lesen und Verkauf nicht automatisch steuerlich nach', () => {
    store.saveItem({
      id: 'item',
      workspace_id: 'workspace',
      title: 'Altbestand',
      condition: 'used',
      status: 'ready',
      sale_state: 'no_active_sale',
      allocated_purchase_cost: 130,
    });
    expect(store.getItems('workspace')[0].tax_purchase_cost).toBeUndefined();
    const booked = store.bookSaleAtomically('workspace', sale, [
      { ...saleLine, catalog_product_id: null, inventory_item_id: 'item', quantity: 1 },
    ]);
    expect(booked.error).toBeNull();
    expect(booked.saleLines[0].tax_purchase_cost).toBeNull();
  });
  it('sperrt offene Kosten und erhält FIFO-Kosten und Menge bei Verkauf und Retoure', () => {
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 2, receivedAt: '2026-09-08T10:00:00Z' }],
      'first',
    );
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 3, receivedAt: '2026-09-08T11:00:00Z' }],
      'second',
    );
    expect(store.bookSaleAtomically('workspace', sale, [saleLine]).error).not.toBeNull();
    expect(store.getStockLots('workspace').map((lot) => lot.remaining_quantity)).toEqual([2, 3]);
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    const booked = store.bookSaleAtomically('workspace', sale, [saleLine]);
    expect(booked.error).toBeNull();
    expect(booked.allocations.map((allocation) => allocation.quantity)).toEqual([2, 1]);
    expect(booked.saleLines[0]?.cost_of_goods_sold).toBe(30);
    expect(store.getStockLots('workspace').map((lot) => lot.remaining_quantity)).toEqual([0, 2]);
    if (!booked.sale) throw new Error('Verkauf fehlt');
    expect(store.returnSaleAtomically('workspace', booked.sale, true).error).toBeNull();
    expect(store.getStockLots('workspace').map((lot) => lot.remaining_quantity)).toEqual([2, 3]);
    const resale = store.bookSaleAtomically('workspace', { ...sale, id: 'resale' }, [
      { ...saleLine, id: 'resale-line', sale_id: 'resale', quantity: 5, line_total: 100 },
    ]);
    expect(resale.saleLines[0]?.cost_of_goods_sold).toBe(50);
  });
  it('berechnet drei verkaufte Einheiten aus zwei Preislosen mit 35 Euro Wareneinsatz', () => {
    const purchase = store.getPurchases('workspace')[0];
    const line = store.getPurchaseLines('workspace')[0];
    if (!purchase || !line) throw new Error('Fixture fehlt');
    store.savePurchase({ ...purchase, purchase_price: 65 });
    store.savePurchaseLine({ ...line, ordered_quantity: 2, line_total: 20 });
    store.savePurchaseLine({
      ...line,
      id: 'line-2',
      ordered_quantity: 3,
      unit_purchase_price: 15,
      line_total: 45,
    });
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [
        { purchaseLineId: 'line', receivedQuantity: 2, receivedAt: '2026-09-08T10:00:00Z' },
        { purchaseLineId: 'line-2', receivedQuantity: 3, receivedAt: '2026-09-08T11:00:00Z' },
      ],
      'both',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    const booked = store.bookSaleAtomically('workspace', sale, [saleLine]);
    expect(booked.error).toBeNull();
    expect(booked.saleLines[0]?.cost_of_goods_sold).toBe(35);
    expect(booked.saleLines[0]?.tax_cost_allocations).toEqual([
      { quantity: 2, tax_purchase_cost: 20 },
      { quantity: 1, tax_purchase_cost: 15 },
    ]);
    expect(
      store.getStockLots('workspace').reduce((sum, lot) => sum + lot.remaining_quantity, 0),
    ).toBe(2);
  });
  it('behält gewinnbringende und verlustbringende Stücke derselben Verkaufsposition getrennt', () => {
    const purchase = store.getPurchases('workspace')[0];
    const line = store.getPurchaseLines('workspace')[0];
    store.savePurchase({ ...purchase, purchase_price: 200 });
    store.savePurchaseLine({
      ...line,
      ordered_quantity: 1,
      unit_purchase_price: 80,
      line_total: 80,
    });
    store.savePurchaseLine({
      ...line,
      id: 'line-2',
      ordered_quantity: 1,
      unit_purchase_price: 120,
      line_total: 120,
    });
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [
        { purchaseLineId: 'line', receivedQuantity: 1, receivedAt: '2026-09-08T10:00:00Z' },
        { purchaseLineId: 'line-2', receivedQuantity: 1, receivedAt: '2026-09-08T11:00:00Z' },
      ],
      'both',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    const booked = store.bookSaleAtomically('workspace', { ...sale, sale_price: 200 }, [
      {
        ...saleLine,
        quantity: 2,
        unit_sale_price: 100,
        line_total: 200,
      },
    ]);
    expect(booked.error).toBeNull();
    expect(booked.saleLines[0]).toMatchObject({
      tax_purchase_cost: 200,
      tax_cost_allocations: [
        { quantity: 1, tax_purchase_cost: 80 },
        { quantity: 1, tax_purchase_cost: 120 },
      ],
    });
    expect(store.getStockLots('workspace').map((lot) => lot.remaining_tax_unit_costs)).toEqual([
      [],
      [],
    ]);
    if (!booked.sale) throw new Error('Verkauf fehlt');
    expect(store.returnSaleAtomically('workspace', booked.sale, true).error).toBeNull();
    expect(store.getStockLots('workspace').map((lot) => lot.remaining_tax_unit_costs)).toEqual([
      [80],
      [120],
    ]);
  });
  it('hängt retournierte Restcentstücke mit ihrem Originalpreis an die Kostenfolge an', () => {
    const purchase = store.getPurchases('workspace')[0];
    const line = store.getPurchaseLines('workspace')[0];
    store.savePurchase({ ...purchase, pricing_mode: 'total', purchase_price: 0.04 });
    store.savePurchaseLine({
      ...line,
      ordered_quantity: 3,
      unit_purchase_price: null,
      line_total: null,
    });
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 3 }],
      'all',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    const booked = store.bookSaleAtomically('workspace', sale, [
      { ...saleLine, quantity: 1, line_total: 20 },
    ]);
    expect(booked.saleLines[0].tax_purchase_cost).toBe(0.02);
    if (!booked.sale) throw new Error('Verkauf fehlt');
    expect(store.returnSaleAtomically('workspace', booked.sale, true).error).toBeNull();
    expect(store.getStockLots('workspace')[0].remaining_tax_unit_costs).toEqual([0.01, 0.01, 0.02]);
    const resale = store.bookSaleAtomically('workspace', { ...sale, id: 'resale' }, [
      {
        ...saleLine,
        id: 'resale-line',
        sale_id: 'resale',
        quantity: 3,
      },
    ]);
    expect(resale.saleLines[0]).toMatchObject({
      tax_purchase_cost: 0.04,
      tax_cost_allocations: [
        { quantity: 2, tax_purchase_cost: 0.02 },
        { quantity: 1, tax_purchase_cost: 0.02 },
      ],
    });
  });
  it('bewahrt betriebliche Restcents nach Rücklagerung auch beim nächsten Teilverkauf', () => {
    const purchase = store.getPurchases('workspace')[0];
    const line = store.getPurchaseLines('workspace')[0];
    store.savePurchase({ ...purchase, pricing_mode: 'total', purchase_price: 0.04 });
    store.savePurchaseLine({
      ...line,
      ordered_quantity: 3,
      unit_purchase_price: null,
      line_total: null,
    });
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 3 }],
      'all',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    const booked = store.bookSaleAtomically('workspace', sale, [
      { ...saleLine, quantity: 1, line_total: 20 },
    ]);
    expect(booked.saleLines[0].cost_of_goods_sold).toBe(0.02);
    if (!booked.sale) throw new Error('Verkauf fehlt');
    expect(store.returnSaleAtomically('workspace', booked.sale, true).error).toBeNull();
    const costs = [1, 2, 3].map((index) => {
      const resale = store.bookSaleAtomically('workspace', { ...sale, id: `resale-${index}` }, [
        {
          ...saleLine,
          id: `resale-line-${index}`,
          sale_id: `resale-${index}`,
          quantity: 1,
          line_total: 20,
        },
      ]);
      expect(resale.error).toBeNull();
      return resale.saleLines[0].cost_of_goods_sold;
    });
    expect(costs).toEqual([0.01, 0.01, 0.02]);
    expect(
      costs.reduce<number>((sum, cost) => {
        if (cost === null) throw new Error('Bekannte Verkaufskosten fehlen.');
        return sum + Math.round(cost * 100);
      }, 0),
    ).toBe(4);
  });
  it('legt bei einer Retoure ohne Rücklagerung keine steuerlichen Stückkosten zurück', () => {
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 5 }],
      'all',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    const booked = store.bookSaleAtomically('workspace', sale, [saleLine]);
    if (!booked.sale) throw new Error('Verkauf fehlt');
    expect(store.returnSaleAtomically('workspace', booked.sale, false).error).toBeNull();
    expect(store.getStockLots('workspace')[0]).toMatchObject({
      remaining_quantity: 2,
      remaining_tax_unit_costs: [10, 10],
      remaining_unit_costs: [10, 10],
    });
    expect(store.getSales('workspace')[0].lines?.[0]).toMatchObject({
      tax_purchase_cost: 30,
      tax_cost_allocations: [{ quantity: 3, tax_purchase_cost: 30 }],
    });
  });
  it('rekonstruiert fehlende historische Stückkosten weder aus Losdurchschnitt noch aus Retoure', () => {
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 5 }],
      'all',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    const lots = store
      .getStockLots('workspace')
      .map((lot) => ({ ...lot, remaining_tax_unit_costs: null, remaining_unit_costs: null }));
    localStorage.setItem('flipbase_local_stock_lots', JSON.stringify(lots));
    const booked = store.bookSaleAtomically('workspace', sale, [saleLine]);
    expect(booked.error).toBeNull();
    expect(booked.saleLines[0]).toMatchObject({
      tax_purchase_cost: null,
      tax_cost_allocations: null,
    });
    if (!booked.sale) throw new Error('Verkauf fehlt');
    expect(store.returnSaleAtomically('workspace', booked.sale, true).error).toBeNull();
    expect(store.getStockLots('workspace')[0].remaining_tax_unit_costs).toBeNull();
    expect(store.getStockLots('workspace')[0].remaining_unit_costs).toBeNull();
    expect(booked.saleLines[0].cost_of_goods_sold).toBe(30);
  });
  it('verbraucht Restcentbeträge deterministisch bei mehreren Teilverkäufen', () => {
    const purchase = store.getPurchases('workspace')[0];
    const line = store.getPurchaseLines('workspace')[0];
    if (!purchase || !line) throw new Error('Fixture fehlt');
    store.savePurchase({ ...purchase, pricing_mode: 'total', purchase_price: 0.04 });
    store.savePurchaseLine({
      ...line,
      ordered_quantity: 3,
      line_total: null,
      unit_purchase_price: null,
      price_mode: 'unpriced_mystery',
    });
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 3 }],
      'all',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    const costs = [1, 2, 3].map(
      (index) =>
        store.bookSaleAtomically('workspace', { ...sale, id: `sale-${index}` }, [
          {
            ...saleLine,
            id: `line-${index}`,
            sale_id: `sale-${index}`,
            quantity: 1,
            line_total: 20,
          },
        ]).saleLines[0]?.cost_of_goods_sold,
    );
    expect(costs).toEqual([0.02, 0.01, 0.01]);
  });
  it('persistiert den ermittelten Warenbetrag beim Abschluss ohne expliziten Kopfpreis', () => {
    const purchase = store.getPurchases('workspace')[0];
    if (!purchase) throw new Error('Fixture fehlt');
    store.savePurchase({ ...purchase, purchase_price: null });
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 5 }],
      'all',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    expect(store.getPurchases('workspace')[0]?.purchase_price).toBe(50);
  });
  it('weist fremde Produktreferenzen und ungültige Empfangszeitpunkte atomar ab', () => {
    expect(
      store.receivePurchaseLines(
        'workspace',
        'purchase',
        [{ purchaseLineId: 'line', receivedQuantity: 1, receivedAt: 'ungueltig' }],
        'date',
      ).error,
    ).not.toBeNull();
    store.saveCatalogProduct({
      id: 'product',
      workspace_id: 'foreign',
      title: 'Fremd',
      tracking_mode: 'quantity',
      is_public_store: false,
    });
    expect(
      store.receivePurchaseLines(
        'workspace',
        'purchase',
        [{ purchaseLineId: 'line', receivedQuantity: 1 }],
        'foreign',
      ).error,
    ).not.toBeNull();
    expect(store.getStockLots('workspace')).toEqual([]);
    expect(store.getPurchaseLines('workspace')[0]?.received_quantity).toBe(0);
  });

  it('bucht einen Teilzugang mit offenen Kosten und wiederholt dieselbe Request-ID nicht', () => {
    const input = [
      { purchaseLineId: 'line', receivedQuantity: 2, receivedAt: '2026-09-08T10:00:00Z' },
    ];
    const first = store.receivePurchaseLines('workspace', 'purchase', input, 'request-1');
    expect(first.error).toBeNull();
    expect(store.getPurchases('workspace')[0]?.receiving_status).toBe('partially_received');
    expect(first.stockLots[0]?.unit_cost).toBeNull();
    expect(store.receivePurchaseLines('workspace', 'purchase', input, 'request-1')).toEqual(first);
    expect(store.getStockLots('workspace')).toHaveLength(1);
    expect(store.getPurchaseLines('workspace')[0]?.received_quantity).toBe(2);
    expect(
      store.receivePurchaseLines(
        'workspace',
        'purchase',
        [{ ...input[0], receivedQuantity: 3 }],
        'request-1',
      ).error,
    ).not.toBeNull();
    expect(store.getPurchaseLines('workspace')[0]?.received_quantity).toBe(2);
  });

  it('bucht noch unbepreiste Produkte ohne erfundene Kosten ein', () => {
    const line = store.getPurchaseLines('workspace')[0];
    if (!line) throw new Error('Fixture fehlt');
    store.savePurchaseLine({
      ...line,
      unit_purchase_price: null,
      line_total: null,
      price_mode: 'unpriced_mystery',
    });
    const result = store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 5 }],
      'request-2',
    );
    expect(result.error).toBeNull();
    expect(result.stockLots[0]?.unit_cost).toBeNull();
  });
  it('finalisiert nur vollständig erhaltene Produktmengen und erzeugt keine Schattenartikel', () => {
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 2 }],
      'first',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).not.toBeNull();
    expect(store.getPurchaseLines('workspace')[0]?.received_quantity).toBe(2);
    store.receivePurchaseLines(
      'workspace',
      'purchase',
      [{ purchaseLineId: 'line', receivedQuantity: 3 }],
      'second',
    );
    expect(store.finalizePurchaseCosting('workspace', 'purchase').error).toBeNull();
    expect(store.getStockLots('workspace').map((lot) => lot.unit_cost)).toEqual([10, 10]);
    expect(store.getItems('workspace')).toEqual([]);
    expect(store.getPurchases('workspace')[0]?.entry_status).toBe('finalized');
  });
  it('behält Request und Bestand atomar und kann nach Speicherfehler unverändert wiederholen', () => {
    const before = store.getPurchaseLines('workspace');
    const original = localStorage.setItem.bind(localStorage);
    let fail = true;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'flipbase_local_product_receipts' && fail) {
        fail = false;
        throw new Error('quota');
      }
      original(key, value);
    });
    const input = [{ purchaseLineId: 'line', receivedQuantity: 2 }];
    try {
      expect(
        store.receivePurchaseLines('workspace', 'purchase', input, 'retry').error,
      ).not.toBeNull();
      expect(store.getPurchaseLines('workspace')).toEqual(before);
      expect(store.getStockLots('workspace')).toEqual([]);
      expect(store.receivePurchaseLines('workspace', 'purchase', input, 'retry').error).toBeNull();
      const reloaded = runInInjectionContext(
        Injector.create({ providers: [] }),
        () => new MockDataStoreService(),
      );
      reloaded.isDemoMode.set(true);
      expect(
        reloaded.receivePurchaseLines('workspace', 'purchase', input, 'retry').error,
      ).toBeNull();
      expect(reloaded.getPurchaseLines('workspace')[0]?.received_quantity).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});
