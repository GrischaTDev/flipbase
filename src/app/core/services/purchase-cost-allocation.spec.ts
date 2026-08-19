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

      const [itemCost] = profitEngine.allocateCosts(totalCost, [1]);
      expect(itemCost).toBe(34.49);
    });
  });

  describe('Mystery Pack & Pallet Cost Allocation Modes (Chapter 12)', () => {
    it('Mode: Evenly (Gleichmäßig) -> 1.600 € / 100 Items = 16 € per Item', () => {
      const paletteCost = 1400.0;
      const transportCost = 200.0;
      const totalInvest = paletteCost + transportCost; // 1600 €
      const itemCount = 100;

      const anteile = profitEngine.allocateCosts(totalInvest, new Array(itemCount).fill(1));
      expect(anteile.every((a) => a === 16.0)).toBe(true);
      expect(anteile.reduce((s, a) => s + Math.round(a * 100), 0)).toBe(totalInvest * 100);
    });

    it('Mode: Value-Weighted (Wertgewichtet) -> proportional to expected market value', () => {
      // Example: Total investment 1.600 €
      // 3 items in a box:
      // Item A: Expected value 100 €
      // Item B: Expected value 200 €
      // Item C: Expected value 500 €
      // Total expected value: 800 €
      const totalInvest = 1600.0;

      const [itemACost, itemBCost, itemCCost] = profitEngine.allocateCosts(
        totalInvest,
        [100, 200, 500],
      );

      // Item A: (100 / 800) * 1600 = 200 €
      expect(itemACost).toBe(200.0);
      // Item B: (200 / 800) * 1600 = 400 €
      expect(itemBCost).toBe(400.0);
      // Item C: (500 / 800) * 1600 = 1000 €
      expect(itemCCost).toBe(1000.0);

      // Total of allocated costs should equal total investment
      expect(itemACost + itemBCost + itemCCost).toBe(totalInvest);
    });

    it('kommt mit Sonderfällen zurecht: keine Artikel, keine Werte', () => {
      expect(profitEngine.allocateCosts(1000, [])).toEqual([]);

      // Ohne erwartete Werte wird gleichmäßig verteilt, statt jedem Artikel 0 €
      // zu geben - sonst verschwände der gesamte Einkaufspreis aus der Rechnung.
      const ohneWerte = profitEngine.allocateCosts(1000, [0, 0]);
      expect(ohneWerte).toEqual([500, 500]);
    });
  });
});
