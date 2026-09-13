import { describe, expect, it } from 'vitest';
import type {
  CatalogProduct,
  InventoryItem,
  PurchaseLine,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../core/models/flipbase.models';
import { buildCatalogOverview } from './catalog-overview';

const product: CatalogProduct = {
  id: 'product',
  workspace_id: 'workspace',
  title: 'Konsole',
  tracking_mode: 'quantity',
  is_public_store: false,
};
const item: InventoryItem = {
  id: 'item',
  workspace_id: 'workspace',
  title: 'Konsole',
  condition: 'used',
  status: 'ready',
  sale_state: 'no_active_sale',
  allocated_purchase_cost: 10,
};

const quantityPosition: StockPosition = {
  catalog_product_id: product.id,
  title: product.title,
  on_hand_quantity: 6,
  available_quantity: 6,
  reserved_quantity: 0,
  oldest_available_unit_cost: 5,
  is_public_store: false,
};
const quantityLot: StockLot = {
  id: 'lot',
  workspace_id: 'workspace',
  catalog_product_id: product.id,
  purchase_id: 'purchase',
  purchase_line_id: 'line',
  received_quantity: 6,
  remaining_quantity: 6,
  unit_cost: 5,
  received_at: '2026-09-13',
};
const reservation: StockMovement = {
  id: 'reserve',
  workspace_id: 'workspace',
  stock_lot_id: 'lot',
  direction: 'out',
  reason: 'reservation',
  quantity: 2,
};
const release: StockMovement = {
  ...reservation,
  id: 'release',
  direction: 'in',
  reason: 'reservation_release',
  quantity: 1,
};

describe('Artikelliste aus Stammartikeln und eigenständigen Stücken', () => {
  it.each([5, 6])(
    'berücksichtigt Reservierung und Freigabe bei %i vorhandenen Einheiten',
    (onHand) => {
      const rows = buildCatalogOverview(
        'workspace',
        [product],
        [],
        [],
        [{ ...quantityPosition, on_hand_quantity: onHand, available_quantity: onHand }],
        [{ ...quantityLot, received_quantity: onHand, remaining_quantity: onHand }],
        [release, reservation],
      );
      expect(rows[0].available).toBe(onHand - 1);
    },
  );

  it('zieht bereits in der Position berücksichtigte Reservierungen nicht doppelt ab', () => {
    const rows = buildCatalogOverview(
      'workspace',
      [product],
      [],
      [],
      [{ ...quantityPosition, available_quantity: 5, reserved_quantity: 1 }],
      [quantityLot],
      [reservation, release],
    );
    expect(rows[0].available).toBe(5);
  });

  it.each([
    [release],
    [{ ...reservation, quantity: 7 }],
    [{ ...reservation, quantity: Number.NaN }],
  ])('zeigt unklare Bewegungsmengen als unbekannt', (...movements) => {
    expect(
      buildCatalogOverview(
        'workspace',
        [product],
        [],
        [],
        [quantityPosition],
        [quantityLot],
        movements,
      )[0].available,
    ).toBeNull();
  });

  it('vermischt keine Bewegungen anderer Artikel oder Workspaces', () => {
    expect(
      buildCatalogOverview(
        'workspace',
        [product],
        [],
        [],
        [quantityPosition],
        [quantityLot],
        [
          { ...reservation, stock_lot_id: 'other-lot', quantity: 4 },
          { ...reservation, workspace_id: 'other-workspace', quantity: 4 },
        ],
      )[0].available,
    ).toBe(6);
  });

  it('zeigt ein vorhandenes Los ohne Position nicht als Nullbestand', () => {
    expect(
      buildCatalogOverview('workspace', [product], [], [], [], [quantityLot], [reservation])[0]
        .available,
    ).toBeNull();
  });
  it('führt gleichnamige Stücke ohne belegte Zuordnung separat auf', () => {
    const rows = buildCatalogOverview('workspace', [product], [item], [], []);
    expect(rows.map((row) => row.detailLink)).toEqual(['/catalog/product', '/inventory/item']);
    expect(rows[1].available).toBe(1);
  });

  it('ordnet Stücke nur über die Einkaufsposition dem Stammartikel zu', () => {
    const line = {
      id: 'line',
      workspace_id: 'workspace',
      catalog_product_id: 'product',
    } as PurchaseLine;
    const rows = buildCatalogOverview(
      'workspace',
      [product],
      [{ ...item, purchase_line_id: 'line' }],
      [line],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].available).toBe(1);
  });

  it('hält verkaufte Artikel auffindbar, aber nicht verfügbar', () => {
    const rows = buildCatalogOverview(
      'workspace',
      [],
      [{ ...item, status: 'sold', sale_state: 'sold' }],
      [],
      [],
    );
    expect(rows[0].available).toBe(0);
  });

  it('verwendet bei unklarer Verkaufszuordnung keine erfundene Nullmenge', () => {
    const rows = buildCatalogOverview(
      'workspace',
      [],
      [{ ...item, sale_state: 'sale_status_conflict' }],
      [],
      [],
    );
    expect(rows[0].available).toBeNull();
  });

  it('vermischt keine Artikel oder Zuordnungen verschiedener Workspaces', () => {
    const foreignLine = {
      id: 'line',
      workspace_id: 'other',
      catalog_product_id: 'product',
    } as PurchaseLine;
    const rows = buildCatalogOverview(
      'workspace',
      [product, { ...product, id: 'foreign', workspace_id: 'other' }],
      [{ ...item, purchase_line_id: 'line' }],
      [foreignLine],
      [],
    );
    expect(rows).toHaveLength(2);
  });

  it('zeigt den realen verfügbaren Lagerbestand des Stammartikels', () => {
    const position: StockPosition = {
      catalog_product_id: 'product',
      title: 'Testartikel',
      available_quantity: 2,
      reserved_quantity: 1,
      on_hand_quantity: 3,
      oldest_available_unit_cost: 10,
      is_public_store: false,
    };
    expect(buildCatalogOverview('workspace', [product], [], [], [position])[0].available).toBe(2);
  });
});
