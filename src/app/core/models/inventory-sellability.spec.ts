import { describe, expect, it } from 'vitest';

import type { InventoryItemSaleState, ItemStatus } from './flipbase.models';
import {
  hasInventoryIntegrityConflict,
  isInventoryItemMutationLocked,
  isSellableInventoryItem,
} from './inventory-sellability';

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

describe('Inventar-Integritätszustände', () => {
  it('sperrt ein ausgebuchtes Stück auch nach einer versehentlichen Statusänderung', () => {
    const removed = {
      ...item('ready', 'no_active_sale'),
      stock_removed_at: '2026-10-13T10:00:00Z',
    };
    expect(isInventoryItemMutationLocked(removed)).toBe(true);
    expect(isSellableInventoryItem(removed)).toBe(false);
  });
  it.each([
    'sold',
    'legacy_sold_unverified',
    'legacy_sale_header_without_line',
    'sale_status_conflict',
    'multiple_active_sales',
  ] as const)('sperrt Mutationen im Zustand %s', (saleState) => {
    const status = saleState === 'sold' ? 'sold' : 'ready';

    expect(isInventoryItemMutationLocked(item(status, saleState))).toBe(true);
  });

  it('lässt einen konsistenten unverkauften Artikel veränderbar', () => {
    expect(isInventoryItemMutationLocked(item('ready', 'no_active_sale'))).toBe(false);
  });

  it.each([undefined, 'sale_status_conflict', 'multiple_active_sales'] as const)(
    'meldet den Integritätskonflikt %s',
    (saleState) => {
      expect(hasInventoryIntegrityConflict(item('ready', saleState))).toBe(true);
    },
  );

  it.each(['no_active_sale', 'sold', 'legacy_sold_unverified'] as const)(
    'meldet den konsistenten Zustand %s nicht als Konflikt',
    (saleState) => {
      expect(hasInventoryIntegrityConflict(item('ready', saleState))).toBe(false);
    },
  );
});
