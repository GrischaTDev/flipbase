import { describe, it, expect } from 'vitest';
import { deriveRect, hasEnoughResolution, upscaleFactor } from './crop';
import { PLATFORM_PROFILES, Rect, platformById } from '../models/platform-profile';

const quadrat: Rect = { x: 100, y: 100, width: 1000, height: 1000 };

describe('Ableitung eines Plattformformats', () => {
  it('laesst ein passendes Verhaeltnis unveraendert', () => {
    expect(deriveRect(quadrat, 1)).toEqual(quadrat);
  });

  it('nimmt bei hochkant Breite weg, nicht Hoehe', () => {
    const hoch = deriveRect(quadrat, 2 / 3);
    expect(hoch.height).toBe(1000);
    expect(hoch.width).toBeCloseTo(666.67, 1);
  });

  it('nimmt bei quer Hoehe weg, nicht Breite', () => {
    const quer = deriveRect(quadrat, 4 / 3);
    expect(quer.width).toBe(1000);
    expect(quer.height).toBe(750);
  });

  it('bleibt mittig im Ausschnitt', () => {
    const quer = deriveRect(quadrat, 4 / 3);
    expect(quer.x + quer.width / 2).toBeCloseTo(quadrat.x + quadrat.width / 2, 5);
    expect(quer.y + quer.height / 2).toBeCloseTo(quadrat.y + quadrat.height / 2, 5);
  });

  it('bleibt immer innerhalb des Ausschnitts - es kommt nie Bild hinzu', () => {
    for (const verhaeltnis of [0.2, 0.5, 2 / 3, 1, 4 / 3, 3, 10]) {
      const r = deriveRect(quadrat, verhaeltnis);
      expect(r.x).toBeGreaterThanOrEqual(quadrat.x - 0.001);
      expect(r.y).toBeGreaterThanOrEqual(quadrat.y - 0.001);
      expect(r.x + r.width).toBeLessThanOrEqual(quadrat.x + quadrat.width + 0.001);
      expect(r.y + r.height).toBeLessThanOrEqual(quadrat.y + quadrat.height + 0.001);
    }
  });
});

describe('Qualitaetspruefungen', () => {
  it('erkennt ausreichende Aufloesung', () => {
    expect(hasEnoughResolution(quadrat, 1000, 1000)).toBe(true);
  });

  it('erkennt zu geringe Aufloesung', () => {
    expect(hasEnoughResolution(quadrat, 1600, 1600)).toBe(false);
  });

  it('gilt genau an der Grenze noch als ausreichend', () => {
    expect(hasEnoughResolution(quadrat, 1000, 1000)).toBe(true);
    expect(hasEnoughResolution(quadrat, 1001, 1000)).toBe(false);
  });

  it('rechnet den Vergroesserungsfaktor aus', () => {
    expect(upscaleFactor(quadrat, 1600)).toBeCloseTo(1.6, 5);
    expect(upscaleFactor(quadrat, 500)).toBeCloseTo(0.5, 5);
  });

  it('misst den Vergroesserungsfaktor am abgeleiteten Rechteck, nicht am rohen Ausschnitt', () => {
    // Der Export vergroessert nie den rohen Ausschnitt direkt, sondern das
    // daraus abgeleitete Rechteck fuer das jeweilige Plattformverhaeltnis
    // (leiteAb). Wer vergroesserungsfaktor faelschlich auf dem rohen
    // Ausschnitt aufruft, bekommt hier 0.6 statt der tatsaechlichen 1.8.
    const roh: Rect = { x: 0, y: 0, width: 2000, height: 1000 };
    const vinted = platformById('vinted');

    const abgeleitet = deriveRect(roh, vinted.exportRatio);
    const faktor = upscaleFactor(abgeleitet, vinted.exportWidth);

    expect(faktor).toBeCloseTo(1.8, 1);
  });
});

describe('Alle Profile zusammen', () => {
  it('erzeugen aus einem Ausschnitt lauter gueltige Rechtecke', () => {
    for (const p of PLATFORM_PROFILES) {
      const r = deriveRect(quadrat, p.exportRatio);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.width / r.height).toBeCloseTo(p.exportRatio, 5);
    }
  });
});
