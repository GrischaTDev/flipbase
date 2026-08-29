import { describe, expect, it } from 'vitest';

import type { InventoryItemSaleState, ItemStatus } from './flipbase.models';
import { isSellableInventoryItem } from './inventory-sellability';

const item = (status: ItemStatus, sale_state?: InventoryItemSaleState) => ({
  status,
  sale_state,
});

describe('isSellableInventoryItem', () => {
  it('erlaubt nur verkaufsbereite Einzelstücke ohne aktiven Verkauf', () => {
    expect(isSellableInventoryItem(item('ready', 'no_active_sale'))).toBe(true);
    expect(isSellableInventoryItem(item('listed', 'no_active_sale'))).toBe(true);

    for (const status of [
      'received',
      'needs_review',
      'researched',
      'reserved',
      'returned',
      'defective',
      'archived',
      'sold',
    ] as const) {
      expect(isSellableInventoryItem(item(status, 'no_active_sale'))).toBe(false);
    }

    expect(isSellableInventoryItem(item('ready', 'sale_status_conflict'))).toBe(false);
  });

  it('schließt Einzelstücke ohne Integritätszustand sicherheitshalber aus', () => {
    expect(isSellableInventoryItem(item('ready'))).toBe(false);
  });
});
