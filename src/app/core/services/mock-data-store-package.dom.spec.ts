import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase, PurchaseLine, Sale, SaleLine } from '../models/flipbase.models';
import { MockDataStoreService } from './mock-data-store.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const purchase: Purchase = {
  id: 'purchase-package',
  workspace_id: workspaceId,
  type: 'lot',
  title: 'Schuhpaket',
  purchase_date: '2026-09-13',
  purchase_price: 100,
  pricing_mode: 'individual',
  content_status: 'known',
  shipment_status: 'arrived',
  entry_status: 'capturing',
  cost_allocation_mode: 'even',
};
const line: PurchaseLine = {
  id: 'package-line',
  workspace_id: workspaceId,
  purchase_id: purchase.id,
  catalog_product_id: null,
  title_snapshot: 'Schuhpaket',
  line_kind: 'individual',
  is_package: true,
  ordered_quantity: 1,
  received_quantity: 0,
  unit_purchase_price: 100,
  line_total: 100,
  price_mode: 'priced',
};
const contents = [
  { title: 'Schuhpaar A', condition: 'used' as const },
  { title: 'Schuhpaar B', condition: 'new' as const, expected_value: 90 },
];

function setup() {
  const store = new MockDataStoreService();
  store.isDemoMode.set(true);
  expect(store.savePurchaseWithLines(purchase, [line])).toBeNull();
  return store;
}

describe('Demo – Paketinhalt', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('erfasst zwei einzelne Paare ohne Rechnungspreis oder erfundene Kosten und finalisiert ohne Paketartikel', () => {
    const store = setup();
    const result = store.capturePurchasePackageContents(
      workspaceId,
      line.id,
      contents,
      'request-1',
    );
    expect(result.error).toBeNull();
    expect(result.data?.inventory_items).toHaveLength(2);
    for (const item of result.data!.inventory_items)
      expect(item).toMatchObject({
        source_package_line_id: line.id,
        is_public_store: false,
        purchase_id: purchase.id,
        purchase_line_id: null,
        allocated_purchase_cost: null,
        tax_purchase_cost: null,
        status: 'received',
      });
    expect(store.getPurchases(workspaceId)[0]).toMatchObject({
      purchase_price: 100,
      items_count: 2,
    });
    expect(store.finalizePurchaseCosting(workspaceId, purchase.id)).toMatchObject({
      error: null,
      data: { totalPurchaseCost: 100 },
    });
    expect(store.getPurchaseLines(workspaceId)[0]).toMatchObject({
      line_total: 100,
      unit_purchase_price: 100,
    });
    expect(store.getItems(workspaceId)).toHaveLength(2);
    expect(
      store
        .getItems(workspaceId)
        .every((item) => item.status === 'ready' && item.allocated_purchase_cost === null),
    ).toBe(true);
    expect(store.getStockLots()).toEqual([]);
  });

  it('finalisiert auch vor dem Auspacken ohne Phantom und ergänzt anschließend weitere Inhalte', () => {
    const store = setup();
    expect(store.finalizePurchaseCosting(workspaceId, purchase.id).error).toBeNull();
    expect(store.getItems()).toEqual([]);
    const first = store.capturePurchasePackageContents(workspaceId, line.id, contents, 'request-1');
    const replay = new MockDataStoreService();
    replay.isDemoMode.set(true);
    expect(
      replay.capturePurchasePackageContents(workspaceId, line.id, contents, 'request-1'),
    ).toEqual(first);
    expect(
      store.capturePurchasePackageContents(workspaceId, line.id, contents.slice(0, 1), 'request-1')
        .error,
    ).toBeInstanceOf(Error);
    expect(
      store.capturePurchasePackageContents(workspaceId, line.id, contents.slice(0, 1), 'request-2')
        .error,
    ).toBeNull();
    expect(store.getItems()).toHaveLength(3);
    expect(
      store
        .getItems()
        .every((item) => item.status === 'ready' && item.allocated_purchase_cost === null),
    ).toBe(true);
    expect(store.getPackageCaptureEvents(workspaceId, purchase.id)).toHaveLength(2);
    expect(store.getPurchases()[0].purchase_price).toBe(100);
  });

  it('verhindert normale Wareneingänge und fremde oder noch nicht angekommene Pakete', () => {
    const store = setup();
    expect(
      store.receiveIndividualPurchaseLine(workspaceId, purchase.id, line.id, contents[0]).error,
    ).toBeInstanceOf(Error);
    expect(
      store.capturePurchasePackageContents('foreign', line.id, contents, 'request-1').error,
    ).toBeInstanceOf(Error);
    store.savePurchase({ ...purchase, shipment_status: 'in_transit' });
    expect(
      store.capturePurchasePackageContents(workspaceId, line.id, contents, 'request-1').error,
    ).toBeInstanceOf(Error);
    expect(store.getItems()).toEqual([]);
  });

  it('verwirft ungültige Stapel vollständig und stellt nach Speicherfehlern auch das Anfrageprotokoll wieder her', () => {
    const store = setup();
    expect(
      store.capturePurchasePackageContents(
        workspaceId,
        line.id,
        [contents[0], { title: ' ', condition: 'used' }],
        'request-1',
      ).error,
    ).toBeInstanceOf(Error);
    const original = localStorage.setItem.bind(localStorage);
    let fail = true;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'flipbase_local_package_captures' && fail) {
        fail = false;
        throw new Error('Speicher voll');
      }
      original(key, value);
    });
    expect(
      store.capturePurchasePackageContents(workspaceId, line.id, contents, 'request-1').error,
    ).toBeInstanceOf(Error);
    spy.mockRestore();
    expect(store.getItems()).toEqual([]);
    expect(store.getPurchaseLines()[0].received_quantity).toBe(0);
    expect(store.getPackageCaptureEvents(workspaceId, purchase.id)).toEqual([]);
    expect(
      store.capturePurchasePackageContents(workspaceId, line.id, contents, 'request-1').error,
    ).toBeNull();
    expect(store.getItems()).toHaveLength(2);
  });

  it('belässt normale bekannte Einzelpreise bei gemischten Einkäufen unverändert', () => {
    const store = setup();
    store.savePurchaseWithLines({ ...purchase, purchase_price: 125 }, [
      line,
      {
        ...line,
        id: 'ordinary-line',
        is_package: false,
        title_snapshot: 'Bekanntes Paar',
        unit_purchase_price: 25,
        line_total: 25,
      },
    ]);
    store.capturePurchasePackageContents(workspaceId, line.id, contents, 'request-1');
    expect(store.finalizePurchaseCosting(workspaceId, purchase.id)).toMatchObject({
      error: null,
      data: { totalPurchaseCost: 125 },
    });
    expect(store.getItems()).toHaveLength(3);
    expect(
      store.getItems().find((item) => item.purchase_line_id === 'ordinary-line')
        ?.allocated_purchase_cost,
    ).toBe(25);
    expect(
      store
        .getItems()
        .filter((item) => item.source_package_line_id)
        .every((item) => item.allocated_purchase_cost === null),
    ).toBe(true);
  });

  it('übernimmt beim Verkauf keine erfundenen Kosten, erhält aber bekannte Null-Euro-Kosten', () => {
    const store = setup();
    store.finalizePurchaseCosting(workspaceId, purchase.id);
    const item = store.capturePurchasePackageContents(workspaceId, line.id, contents, 'request-1')
      .data!.inventory_items[0];
    const sale: Sale = {
      id: 'sale-1',
      workspace_id: workspaceId,
      platform: 'direct',
      sale_price: 80,
      sale_date: '2026-09-13',
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
    };
    const saleLine: SaleLine = {
      id: 'sale-line',
      sale_id: sale.id,
      inventory_item_id: item.id,
      title_snapshot: item.title,
      quantity: 1,
      unit_sale_price: 80,
      line_total: 80,
      cost_of_goods_sold: 0,
      tax_mode: 'kleinunternehmer_19',
    };
    expect(store.bookSaleAtomically(workspaceId, sale, [saleLine])).toMatchObject({
      error: null,
      saleLines: [{ cost_of_goods_sold: null, tax_purchase_cost: null }],
    });
    expect(store.getItems().find((entry) => entry.id === item.id)?.source_package_line_id).toBe(
      line.id,
    );
    const freeItem: InventoryItem = {
      ...item,
      id: 'free',
      source_package_line_id: null,
      allocated_purchase_cost: 0,
    };
    store.saveItem(freeItem);
    expect(
      store.bookSaleAtomically(workspaceId, { ...sale, id: 'sale-2' }, [
        { ...saleLine, id: 'sale-line-2', sale_id: 'sale-2', inventory_item_id: freeItem.id },
      ]),
    ).toMatchObject({ error: null, saleLines: [{ cost_of_goods_sold: 0 }] });
  });
});
