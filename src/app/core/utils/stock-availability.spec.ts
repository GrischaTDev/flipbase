import { describe, expect, it } from 'vitest';
import { hasSellableLotCost } from './stock-availability';

describe('hasSellableLotCost', () => {
  it('gibt offene oder nicht nachweisbar abgeschlossene Zugänge nicht zum Verkauf frei', () => {
    expect(hasSellableLotCost({ unit_cost: 0 })).toBe(false);
    expect(hasSellableLotCost({ unit_cost: null })).toBe(false);
  });
  it('unterscheidet kostenlose finalisierte Ware von offenen Kosten', () => {
    expect(hasSellableLotCost({ purchase: { entry_status: 'finalized' }, unit_cost: 0 })).toBe(
      true,
    );
    expect(hasSellableLotCost({ purchase: { entry_status: 'finalized' }, unit_cost: null })).toBe(
      false,
    );
    expect(hasSellableLotCost({ purchase: { entry_status: 'draft' }, unit_cost: 12 })).toBe(false);
    expect(hasSellableLotCost({ purchase: { entry_status: 'finalized' }, unit_cost: 12 })).toBe(
      true,
    );
  });
});
