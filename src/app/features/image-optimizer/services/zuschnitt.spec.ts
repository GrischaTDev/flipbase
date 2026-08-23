import { describe, it, expect } from 'vitest';
import {
  leiteAb,
  reichtAufloesung,
  safeArea,
  schnittmenge,
  vergroesserungsfaktor,
} from './zuschnitt';
import { PLATTFORM_PROFILE, Rechteck, profil } from '../models/plattform-profile';

const quadrat: Rechteck = { x: 100, y: 100, breite: 1000, hoehe: 1000 };

describe('Ableitung eines Plattformformats', () => {
  it('laesst ein passendes Verhaeltnis unveraendert', () => {
    expect(leiteAb(quadrat, 1)).toEqual(quadrat);
  });

  it('nimmt bei hochkant Breite weg, nicht Hoehe', () => {
    const hoch = leiteAb(quadrat, 2 / 3);
    expect(hoch.hoehe).toBe(1000);
    expect(hoch.breite).toBeCloseTo(666.67, 1);
  });

  it('nimmt bei quer Hoehe weg, nicht Breite', () => {
    const quer = leiteAb(quadrat, 4 / 3);
    expect(quer.breite).toBe(1000);
    expect(quer.hoehe).toBe(750);
  });

  it('bleibt mittig im Ausschnitt', () => {
    const quer = leiteAb(quadrat, 4 / 3);
    expect(quer.x + quer.breite / 2).toBeCloseTo(quadrat.x + quadrat.breite / 2, 5);
    expect(quer.y + quer.hoehe / 2).toBeCloseTo(quadrat.y + quadrat.hoehe / 2, 5);
  });

  it('bleibt immer innerhalb des Ausschnitts - es kommt nie Bild hinzu', () => {
    for (const verhaeltnis of [0.2, 0.5, 2 / 3, 1, 4 / 3, 3, 10]) {
      const r = leiteAb(quadrat, verhaeltnis);
      expect(r.x).toBeGreaterThanOrEqual(quadrat.x - 0.001);
      expect(r.y).toBeGreaterThanOrEqual(quadrat.y - 0.001);
      expect(r.x + r.breite).toBeLessThanOrEqual(quadrat.x + quadrat.breite + 0.001);
      expect(r.y + r.hoehe).toBeLessThanOrEqual(quadrat.y + quadrat.hoehe + 0.001);
    }
  });
});

describe('Schnittmenge', () => {
  it('von einem Rechteck ist das Rechteck selbst', () => {
    expect(schnittmenge([quadrat])).toEqual(quadrat);
  });

  it('von quer und hochkant ist der gemeinsame Kern', () => {
    const quer = leiteAb(quadrat, 4 / 3);
    const hoch = leiteAb(quadrat, 2 / 3);
    const kern = schnittmenge([quer, hoch]);

    expect(kern).not.toBeNull();
    expect(kern!.breite).toBeCloseTo(hoch.breite, 5);
    expect(kern!.hoehe).toBeCloseTo(quer.hoehe, 5);
  });

  it('ist null, wenn sich nichts ueberschneidet', () => {
    const links: Rechteck = { x: 0, y: 0, breite: 10, hoehe: 10 };
    const rechts: Rechteck = { x: 100, y: 0, breite: 10, hoehe: 10 };
    expect(schnittmenge([links, rechts])).toBeNull();
  });

  it('ist null bei leerer Liste', () => {
    expect(schnittmenge([])).toBeNull();
  });
});

describe('Safe-Area', () => {
  it('beruecksichtigt nur Plattformen, die schneiden', () => {
    // eBay passt ein, statt zu schneiden - es darf den Bereich nicht kleiner
    // machen als er ohne eBay waere.
    const mitEbay = safeArea(quadrat, [profil('ebay'), profil('vinted')]);
    const ohneEbay = safeArea(quadrat, [profil('vinted')]);
    expect(mitEbay).toEqual(ohneEbay);
  });

  it('ist der ganze Ausschnitt, wenn keine Plattform schneidet', () => {
    expect(safeArea(quadrat, [profil('ebay')])).toEqual(quadrat);
  });

  it('wird bei quer und hochkant gleichzeitig deutlich kleiner', () => {
    const beide = safeArea(quadrat, [profil('kleinanzeigen'), profil('vinted')]);
    expect(beide.breite).toBeLessThan(quadrat.breite);
    expect(beide.hoehe).toBeLessThan(quadrat.hoehe);
  });

  it('ist der ganze Ausschnitt, wenn gar keine Plattform gewaehlt ist', () => {
    expect(safeArea(quadrat, [])).toEqual(quadrat);
  });
});

describe('Qualitaetspruefungen', () => {
  it('erkennt ausreichende Aufloesung', () => {
    expect(reichtAufloesung(quadrat, 1000, 1000)).toBe(true);
  });

  it('erkennt zu geringe Aufloesung', () => {
    expect(reichtAufloesung(quadrat, 1600, 1600)).toBe(false);
  });

  it('gilt genau an der Grenze noch als ausreichend', () => {
    expect(reichtAufloesung(quadrat, 1000, 1000)).toBe(true);
    expect(reichtAufloesung(quadrat, 1001, 1000)).toBe(false);
  });

  it('rechnet den Vergroesserungsfaktor aus', () => {
    expect(vergroesserungsfaktor(quadrat, 1600)).toBeCloseTo(1.6, 5);
    expect(vergroesserungsfaktor(quadrat, 500)).toBeCloseTo(0.5, 5);
  });
});

describe('Alle Profile zusammen', () => {
  it('erzeugen aus einem Ausschnitt lauter gueltige Rechtecke', () => {
    for (const p of PLATTFORM_PROFILE) {
      const r = leiteAb(quadrat, p.exportVerhaeltnis);
      expect(r.breite).toBeGreaterThan(0);
      expect(r.hoehe).toBeGreaterThan(0);
      expect(r.breite / r.hoehe).toBeCloseTo(p.exportVerhaeltnis, 5);
    }
  });
});
