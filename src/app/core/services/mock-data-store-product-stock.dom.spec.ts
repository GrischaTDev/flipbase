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
    expect(
      store.getStockLots('workspace').reduce((sum, lot) => sum + lot.remaining_quantity, 0),
    ).toBe(2);
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
