import { describe, it, expect } from 'vitest';
import { deriveRect, hasEnoughResolution, upscaleFactor } from './crop';
import { PLATFORM_PROFILES, Rect, platformById } from '../models/platform-profile';

const square: Rect = { x: 100, y: 100, width: 1000, height: 1000 };

describe('Ableitung eines Plattformformats', () => {
  it('laesst ein passendes Verhaeltnis unveraendert', () => {
    expect(deriveRect(square, 1)).toEqual(square);
  });

  it('nimmt bei hochkant Breite weg, nicht Hoehe', () => {
    const tall = deriveRect(square, 2 / 3);
    expect(tall.height).toBe(1000);
    expect(tall.width).toBeCloseTo(666.67, 1);
  });

  it('nimmt bei quer Hoehe weg, nicht Breite', () => {
    const wide = deriveRect(square, 4 / 3);
    expect(wide.width).toBe(1000);
    expect(wide.height).toBe(750);
  });

  it('bleibt mittig im Ausschnitt', () => {
    const wide = deriveRect(square, 4 / 3);
    expect(wide.x + wide.width / 2).toBeCloseTo(square.x + square.width / 2, 5);
    expect(wide.y + wide.height / 2).toBeCloseTo(square.y + square.height / 2, 5);
  });

  it('bleibt immer innerhalb des Ausschnitts - es kommt nie Bild hinzu', () => {
    for (const ratio of [0.2, 0.5, 2 / 3, 1, 4 / 3, 3, 10]) {
      const r = deriveRect(square, ratio);
      expect(r.x).toBeGreaterThanOrEqual(square.x - 0.001);
      expect(r.y).toBeGreaterThanOrEqual(square.y - 0.001);
      expect(r.x + r.width).toBeLessThanOrEqual(square.x + square.width + 0.001);
      expect(r.y + r.height).toBeLessThanOrEqual(square.y + square.height + 0.001);
    }
  });
});

describe('Qualitaetspruefungen', () => {
  it('erkennt ausreichende Aufloesung', () => {
    expect(hasEnoughResolution(square, 1000, 1000)).toBe(true);
  });

  it('erkennt zu geringe Aufloesung', () => {
    expect(hasEnoughResolution(square, 1600, 1600)).toBe(false);
  });

  it('gilt genau an der Grenze noch als ausreichend', () => {
    expect(hasEnoughResolution(square, 1000, 1000)).toBe(true);
    expect(hasEnoughResolution(square, 1001, 1000)).toBe(false);
  });

  it('rechnet den Vergroesserungsfaktor aus', () => {
    expect(upscaleFactor(square, 1600)).toBeCloseTo(1.6, 5);
    expect(upscaleFactor(square, 500)).toBeCloseTo(0.5, 5);
  });

  it('misst den Vergroesserungsfaktor am abgeleiteten Rechteck, nicht am rohen Ausschnitt', () => {
    // Der Export vergroessert nie den rohen Ausschnitt direkt, sondern das
    // daraus abgeleitete Rechteck fuer das jeweilige Plattformverhaeltnis
    // (deriveRect). Wer upscaleFactor faelschlich auf dem rohen
    // Ausschnitt aufruft, bekommt hier 0.6 statt der tatsaechlichen 1.8.
    const raw: Rect = { x: 0, y: 0, width: 2000, height: 1000 };
    const vinted = platformById('vinted');

    const derived = deriveRect(raw, vinted.exportRatio);
    const factor = upscaleFactor(derived, vinted.exportWidth);

    expect(factor).toBeCloseTo(1.8, 1);
  });
});

describe('Alle Profile zusammen', () => {
  it('erzeugen aus einem Ausschnitt lauter gueltige Rechtecke', () => {
    for (const p of PLATFORM_PROFILES) {
      const r = deriveRect(square, p.exportRatio);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.width / r.height).toBeCloseTo(p.exportRatio, 5);
    }
  });
});
