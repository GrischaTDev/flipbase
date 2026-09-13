import { describe, expect, it } from 'vitest';
import type {
  InventoryItem,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../../core/models/flipbase.models';
import { summarizeProductStock } from './product-detail-stock';

const position: StockPosition = {
  catalog_product_id: 'product',
  title: 'Artikel',
  available_quantity: 2,
  on_hand_quantity: 3,
  reserved_quantity: 1,
  is_public_store: false,
  oldest_available_unit_cost: 5,
};
const lot: StockLot = {
  id: 'lot',
  workspace_id: 'workspace',
  purchase_id: 'purchase',
  purchase_line_id: 'line',
  catalog_product_id: 'product',
  received_quantity: 3,
  remaining_quantity: 3,
  received_at: '2026-09-13',
  unit_cost: 5,
};
const item: InventoryItem = {
  id: 'item',
  workspace_id: 'workspace',
  title: 'Einzelstück',
  condition: 'used',
  status: 'ready',
  allocated_purchase_cost: 5,
  sale_state: 'no_active_sale',
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

describe('summarizeProductStock', () => {
  it.each([5, 6])('zeigt für %i vorhandene Einheiten die Nettoreseverierung', (onHand) => {
    expect(
      summarizeProductStock(
        { ...position, on_hand_quantity: onHand, available_quantity: onHand, reserved_quantity: 0 },
        [{ ...lot, received_quantity: onHand, remaining_quantity: onHand }],
        [],
        [release, reservation],
      ),
    ).toEqual({ onHand, available: onHand - 1, reserved: 1 });
  });

  it('zieht bereits in der Position enthaltene Reservierungen nicht doppelt ab', () => {
    expect(summarizeProductStock(position, [lot], [], [reservation, release])).toEqual({
      onHand: 3,
      available: 2,
      reserved: 1,
    });
  });

  it.each([[release], [{ ...reservation, quantity: 4 }], [{ ...reservation, quantity: -1 }]])(
    'lässt Mengen bei inkonsistenten Bewegungen offen',
    (...movements) => {
      expect(summarizeProductStock(position, [lot], [], movements)).toEqual({
        onHand: null,
        available: null,
        reserved: null,
      });
    },
  );

  it('ordnet Bewegungen nur über die echten Lose im richtigen Workspace zu', () => {
    expect(
      summarizeProductStock(
        position,
        [lot],
        [],
        [
          { ...reservation, stock_lot_id: 'other-lot', quantity: 4 },
          { ...reservation, workspace_id: 'other-workspace', quantity: 4 },
        ],
      ),
    ).toEqual({ onHand: 3, available: 2, reserved: 1 });
  });
  it('zählt Mengenbestand und zugeordnete Einzelstücke ohne doppelte Stückzählung', () => {
    expect(
      summarizeProductStock(
        position,
        [lot],
        [
          item,
          item,
          { ...item, id: 'reserved', status: 'reserved' },
          { ...item, id: 'repair', status: 'defective' },
        ],
      ),
    ).toEqual({ onHand: 6, available: 3, reserved: 2 });
  });
  it('zeigt Einzelstückbestand auch ohne Mengenposition', () => {
    expect(summarizeProductStock(undefined, [], [item])).toEqual({
      onHand: 1,
      available: 1,
      reserved: 0,
    });
  });
  it('zählt verkaufte und archivierte Stücke nicht als vorhandenen Bestand', () => {
    expect(
      summarizeProductStock(
        undefined,
        [],
        [
          { ...item, sale_state: 'sold', status: 'sold' },
          { ...item, id: 'archived', archived_at: '2026-09-13' },
        ],
      ),
    ).toEqual({ onHand: 0, available: 0, reserved: 0 });
  });
  it.each([
    undefined,
    'sale_status_conflict',
    'multiple_active_sales',
    'legacy_sold_unverified',
  ] as const)('zeigt ungeklärten Verkaufszustand %s als unbekannt', (sale_state) => {
    expect(summarizeProductStock(undefined, [], [{ ...item, sale_state }])).toEqual({
      onHand: null,
      available: null,
      reserved: null,
    });
  });
  it('zeigt fehlende oder widersprüchliche Mengen als unbekannt', () => {
    expect(summarizeProductStock(undefined, [lot], [])).toEqual({
      onHand: null,
      available: null,
      reserved: null,
    });
    expect(summarizeProductStock({ ...position, available_quantity: 7 }, [lot], [])).toEqual({
      onHand: null,
      available: null,
      reserved: null,
    });
  });
});
