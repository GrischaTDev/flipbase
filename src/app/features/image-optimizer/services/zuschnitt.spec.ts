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
  it('beruecksichtigt auch eBay, weil der Export trotzdem zuschneidet', () => {
    // eBay passt in der Trefferliste nur ein, aber der Export schneidet auch
    // bei eBay unbedingt auf 1:1 zu - die Safe-Area muss das widerspiegeln.
    const breit: Rechteck = { x: 0, y: 0, breite: 1500, hoehe: 1000 };
    const mitEbay = safeArea(breit, [profil('ebay')]);
    expect(mitEbay.breite).toBe(1000);
  });

  it('ist bei eBay allein das eingepasste Quadrat', () => {
    const breit: Rechteck = { x: 0, y: 0, breite: 1500, hoehe: 1000 };
    expect(safeArea(breit, [profil('ebay')])).toEqual(leiteAb(breit, 1));
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

  it('misst den Vergroesserungsfaktor am abgeleiteten Rechteck, nicht am rohen Ausschnitt', () => {
    // Der Export vergroessert nie den rohen Ausschnitt direkt, sondern das
    // daraus abgeleitete Rechteck fuer das jeweilige Plattformverhaeltnis
    // (leiteAb). Wer vergroesserungsfaktor faelschlich auf dem rohen
    // Ausschnitt aufruft, bekommt hier 0.6 statt der tatsaechlichen 1.8.
    const roh: Rechteck = { x: 0, y: 0, breite: 2000, hoehe: 1000 };
    const vinted = profil('vinted');

    const abgeleitet = leiteAb(roh, vinted.exportVerhaeltnis);
    const faktor = vergroesserungsfaktor(abgeleitet, vinted.exportBreite);

    expect(faktor).toBeCloseTo(1.8, 1);
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
