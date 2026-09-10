import { describe, expect, it } from 'vitest';
import type { Purchase, Sale, StockLot } from '../models/flipbase.models';
import { lotCostResult } from './lot-cost';

const purchase: Purchase = {
  id: 'p',
  workspace_id: 'w',
  title: 'Einkauf',
  type: 'lot',
  purchase_price: 100,
  purchase_date: '2026-09-01',
  cost_allocation_mode: 'even',
  entry_status: 'finalized',
};
const lot: StockLot = {
  id: 'l',
  workspace_id: 'w',
  purchase_id: 'p',
  purchase_line_id: 'pl',
  catalog_product_id: 'c',
  received_quantity: 6,
  remaining_quantity: 4,
  unit_cost: 100 / 6,
  received_at: '2026-09-01',
};

describe('Gemeinsamer exakter Loswert', () => {
  it('stellt fehlende Loskosten auch bei inkonsistent finalisiertem Einkauf nicht als kostenlos dar', () => {
    expect(
      lotCostResult({ ...lot, remaining_quantity: 6, unit_cost: null }, purchase, [], 'known'),
    ).toMatchObject({
      remainingValueCents: null,
      historicalPoolCents: null,
      costPerUnit: { kind: 'open' },
    });
  });
  it.each([-1, 7])('lehnt widersprüchliche Restmengen %s ab', (remaining_quantity) => {
    expect(
      lotCostResult({ ...lot, remaining_quantity }, purchase, [], 'known').remainingValueCents,
    ).toBeNull();
  });
  it('erfindet beim Laden der Entnahmen keinen Restwert', () => {
    expect(lotCostResult(lot, purchase, [], 'loading').remainingValueCents).toBeNull();
  });
  it('lehnt über den Ursprungspool hinausgehende Entnahmekosten ab', () => {
    const sale: Sale = {
      id: 's',
      workspace_id: 'w',
      platform: 'direct',
      sale_price: 200,
      sale_date: '2026-09-01',
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
      lot_allocations: [
        {
          id: 'a',
          workspace_id: 'w',
          sale_line_id: 'sl',
          stock_lot_id: 'l',
          quantity: 2,
          unit_cost: 60,
          active_allocated_cost: 120,
        },
      ],
    };
    expect(lotCostResult(lot, purchase, [sale], 'known').remainingValueCents).toBeNull();
  });
});
