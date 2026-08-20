import { describe, it, expect, beforeEach } from 'vitest';
import { ProfitEngineService } from './profit-engine.service';

/**
 * Die Summe der zugeordneten Einkaufskosten muss **exakt** dem Einkaufspreis
 * entsprechen – auf den Cent genau.
 *
 * Zuvor wurde je Artikel einzeln gerundet: 100 € auf 3 Artikel ergab
 * 33,33 € × 3 = 99,99 €. Ein Cent verschwand. Bei einer Palette mit 60
 * Artikeln fehlten bis zu 60 Cent im Wareneinsatz – und genau diese Summe
 * landet im § 25a-Journal und im DATEV-Export.
 */
describe('Kostenverteilung – die Summe muss exakt aufgehen', () => {
  let engine: ProfitEngineService;

  beforeEach(() => {
    engine = new ProfitEngineService();
  });

  /** Summiert in ganzen Cent, damit der Vergleich nicht selbst rundungsanfällig ist. */
  const summeCent = (werte: number[]): number => werte.reduce((s, w) => s + Math.round(w * 100), 0);

  describe('gleichmäßige Verteilung', () => {
    it('verteilt 100 € auf 3 Artikel ohne Cent-Verlust', () => {
      const anteile = engine.allocateCosts(100, [1, 1, 1]);

      expect(summeCent(anteile)).toBe(10000);
      expect(anteile).toEqual([33.34, 33.33, 33.33]);
    });

    it('verteilt 0,10 € auf 3 Artikel', () => {
      const anteile = engine.allocateCosts(0.1, [1, 1, 1]);

      expect(summeCent(anteile)).toBe(10);
      expect(anteile).toEqual([0.04, 0.03, 0.03]);
    });

    it('geht bei einer Palette mit 60 Artikeln exakt auf', () => {
      const anteile = engine.allocateCosts(999.99, new Array(60).fill(1));

      expect(summeCent(anteile)).toBe(99999);
      expect(anteile.length).toBe(60);
    });

    it('geht bei jedem Betrag von 0,01 bis 5,00 € auf 7 Artikel exakt auf', () => {
      for (let cent = 1; cent <= 500; cent++) {
        const betrag = cent / 100;
        const anteile = engine.allocateCosts(betrag, [1, 1, 1, 1, 1, 1, 1]);
        expect(summeCent(anteile), `Betrag ${betrag}`).toBe(cent);
      }
    });

    it('gibt einem einzelnen Artikel den vollen Betrag', () => {
      expect(engine.allocateCosts(236.99, [1])).toEqual([236.99]);
    });
  });

  describe('wertgewichtete Verteilung', () => {
    it('verteilt nach Anteilen und geht exakt auf', () => {
      const anteile = engine.allocateCosts(1000, [100, 200, 500]);

      expect(summeCent(anteile)).toBe(100000);
      expect(anteile[2]).toBeGreaterThan(anteile[1]);
      expect(anteile[1]).toBeGreaterThan(anteile[0]);
    });

    it('geht auch bei krummen Gewichten exakt auf', () => {
      const anteile = engine.allocateCosts(150, [33.33, 66.67, 12.5, 1.01]);

      expect(summeCent(anteile)).toBe(15000);
    });

    it('gibt den Rest dem Artikel mit dem grössten Anteil', () => {
      // 10 Cent auf 3 Artikel im Verhaeltnis 1:1:1 -> ein Artikel bekommt 4 Cent
      const anteile = engine.allocateCosts(0.1, [5, 1, 1]);

      expect(summeCent(anteile)).toBe(10);
      expect(anteile[0]).toBeGreaterThan(anteile[1]);
    });
  });

  describe('Sonderfälle', () => {
    it('fällt auf gleichmäßige Verteilung zurück, wenn kein Artikel einen Wert hat', () => {
      // Zuvor gab die wertgewichtete Verteilung in diesem Fall jedem Artikel 0 €.
      // Der gesamte Einkaufspreis verschwand aus der Kalkulation, und jeder
      // Verkauf sah aus wie 100 % Gewinn.
      const anteile = engine.allocateCosts(90, [0, 0, 0]);

      expect(summeCent(anteile)).toBe(9000);
      expect(anteile).toEqual([30, 30, 30]);
    });

    it('behandelt negative Gewichte wie 0', () => {
      const anteile = engine.allocateCosts(100, [-5, 1, 1]);

      expect(summeCent(anteile)).toBe(10000);
      expect(anteile[0]).toBe(0);
    });

    it('liefert eine leere Liste ohne Artikel', () => {
      expect(engine.allocateCosts(100, [])).toEqual([]);
    });

    it('verteilt 0 € als lauter Nullen', () => {
      expect(engine.allocateCosts(0, [1, 1, 1])).toEqual([0, 0, 0]);
    });

    it('behandelt einen negativen Gesamtbetrag als 0', () => {
      expect(engine.allocateCosts(-50, [1, 1])).toEqual([0, 0]);
    });

    it('rundet einen Gesamtbetrag mit mehr als zwei Nachkommastellen auf Cent', () => {
      const anteile = engine.allocateCosts(10.005, [1, 1]);

      expect(summeCent(anteile)).toBe(1001);
    });
  });
});
