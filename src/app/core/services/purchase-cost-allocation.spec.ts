import { describe, it, expect, beforeEach } from 'vitest';
import { ProfitEngineService } from './profit-engine.service';

describe('Purchase & Cost Allocation Engine (Phase 2)', () => {
  let profitEngine: ProfitEngineService;

  beforeEach(() => {
    profitEngine = new ProfitEngineService();
  });

  describe('Single Item Purchase Allocation', () => {
    it('should allocate 100% of purchase price + extra costs to single inventory item', () => {
      const purchasePrice = 25.0;
      const shipping = 5.99;
      const travel = 3.5;
      const totalCost = purchasePrice + shipping + travel; // 34.49 €

      const itemCost = profitEngine.allocateCostsEvenly(totalCost, 1);
      expect(itemCost).toBe(34.49);
    });
  });

  describe('Mystery Pack & Pallet Cost Allocation Modes (Chapter 12)', () => {
    it('Mode: Evenly (Gleichmäßig) -> 1.600 € / 100 Items = 16 € per Item', () => {
      const paletteCost = 1400.0;
      const transportCost = 200.0;
      const totalInvest = paletteCost + transportCost; // 1600 €
      const itemCount = 100;

      const allocatedPerItem = profitEngine.allocateCostsEvenly(totalInvest, itemCount);
      expect(allocatedPerItem).toBe(16.0);
    });

    it('Mode: Value-Weighted (Wertgewichtet) -> proportional to expected market value', () => {
      // Example: Total investment 1.600 €
      // 3 items in a box:
      // Item A: Expected value 100 €
      // Item B: Expected value 200 €
      // Item C: Expected value 500 €
      // Total expected value: 800 €
      const totalInvest = 1600.0;
      const sumExpectedValues = 800.0;

      const itemACost = profitEngine.allocateCostsValueWeighted(totalInvest, 100, sumExpectedValues);
      const itemBCost = profitEngine.allocateCostsValueWeighted(totalInvest, 200, sumExpectedValues);
      const itemCCost = profitEngine.allocateCostsValueWeighted(totalInvest, 500, sumExpectedValues);

      // Item A: (100 / 800) * 1600 = 200 €
      expect(itemACost).toBe(200.0);
      // Item B: (200 / 800) * 1600 = 400 €
      expect(itemBCost).toBe(400.0);
      // Item C: (500 / 800) * 1600 = 1000 €
      expect(itemCCost).toBe(1000.0);

      // Total of allocated costs should equal total investment
      expect(itemACost + itemBCost + itemCCost).toBe(totalInvest);
    });

    it('should handle edge cases like 0 items or 0 sum gracefully', () => {
      expect(profitEngine.allocateCostsEvenly(1000, 0)).toBe(0);
      expect(profitEngine.allocateCostsValueWeighted(1000, 50, 0)).toBe(0);
    });
  });
});
