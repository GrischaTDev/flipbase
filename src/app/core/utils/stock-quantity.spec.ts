import { describe, expect, it } from 'vitest';
import type { StockLot, StockMovement, StockPosition } from '../models/flipbase.models';
import { summarizeStockQuantities } from './stock-quantity';

const position: StockPosition = {
  catalog_product_id: 'product',
  title: 'Artikel',
  on_hand_quantity: 6,
  available_quantity: 6,
  reserved_quantity: 0,
  oldest_available_unit_cost: 5,
  is_public_store: false,
};
const lot: StockLot = {
  id: 'lot',
  workspace_id: 'workspace',
  catalog_product_id: 'product',
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
  stock_lot_id: lot.id,
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

describe('summarizeStockQuantities', () => {
  it('erhält den physischen Bestand und berechnet die Nettoreseverierung unabhängig von der Reihenfolge', () => {
    expect(summarizeStockQuantities([position], [lot], [release, reservation])).toEqual({
      state: 'known',
      onHand: 6,
      available: 5,
      reserved: 1,
      sold: 0,
    });
  });

  it('verrechnet eine unzulässige Freigabe nicht mit der Reservierung eines anderen Loses', () => {
    const lots = [
      { ...lot, remaining_quantity: 3 },
      { ...lot, id: 'other-lot', remaining_quantity: 3 },
    ];
    const result = summarizeStockQuantities([position], lots, [
      reservation,
      { ...release, stock_lot_id: 'other-lot' },
    ]);
    expect(result.state).toBe('review_required');
  });

  it('zählt bereits aggregierte Reservierungen nicht doppelt', () => {
    expect(
      summarizeStockQuantities(
        [{ ...position, available_quantity: 5, reserved_quantity: 1 }],
        [lot],
        [reservation, release],
      ),
    ).toMatchObject({ state: 'known', onHand: 6, available: 5, reserved: 1 });
  });

  it('erkennt fehlerhafte Mengen statt sie als sicheren Nullbestand auszugeben', () => {
    expect(
      summarizeStockQuantities([position], [lot], [{ ...reservation, quantity: 7 }]).state,
    ).toBe('review_required');
    expect(summarizeStockQuantities([], [lot], [reservation]).state).toBe('review_required');
  });
});
