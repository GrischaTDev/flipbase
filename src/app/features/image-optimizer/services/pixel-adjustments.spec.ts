import { describe, it, expect } from 'vitest';
import { applySharpening, applyWarmth } from './pixel-adjustments';

/** Baut eine Pixelflaeche aus einer Liste von [r, g, b, a]-Werten. */
function surface(pixels: readonly (readonly number[])[]): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}

describe('Waerme', () => {
  it('laesst das Bild bei 0 unveraendert', () => {
    const data = surface([
      [120, 130, 140, 255],
      [10, 20, 30, 255],
    ]);
    const before = Uint8ClampedArray.from(data);

    applyWarmth(data, 0);

    expect([...data]).toEqual([...before]);
  });

  it('hebt Rot an und senkt Blau, Gruen bleibt liegen', () => {
    const data = surface([[100, 100, 100, 255]]);

    applyWarmth(data, 1);

    expect(data[0]).toBeGreaterThan(100);
    expect(data[1]).toBe(100);
    expect(data[2]).toBeLessThan(100);
  });

  it('dreht die Richtung bei negativen Werten um - das ist der kuehle Abgleich', () => {
    const data = surface([[100, 100, 100, 255]]);

    applyWarmth(data, -1);

    expect(data[0]).toBeLessThan(100);
    expect(data[2]).toBeGreaterThan(100);
  });

  it('laeuft an den Grenzen nicht ueber', () => {
    const data = surface([
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);

    applyWarmth(data, 1);

    expect(data[0]).toBe(255);
    expect(data[6]).toBe(0);
  });

  // Der weisse Grund entsteht erst beim Zusammenlegen. Wuerde die Waerme auch
  // durchsichtige Pixel einfaerben, bekaeme ein freigestelltes Produktfoto
  // einen warmen Rand statt des von eBay verlangten reinen Weiss.
  it('fasst nur voll deckende Pixel an', () => {
    const data = surface([
      [100, 100, 100, 0],
      [100, 100, 100, 128],
      [100, 100, 100, 255],
    ]);

    applyWarmth(data, 1);

    expect([data[0], data[2]]).toEqual([100, 100]);
    expect([data[4], data[6]]).toEqual([100, 100]);
    expect(data[8]).toBeGreaterThan(100);
  });
});

describe('Schaerfen', () => {
  /** Eine Flaeche mit einer senkrechten Kante: links dunkel, rechts hell. */
  function edge(): Uint8ClampedArray {
    const pixels: number[][] = [];
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const value = x < 2 ? 60 : 200;
        pixels.push([value, value, value, 255]);
      }
    }
    return surface(pixels);
  }

  it('laesst das Bild bei 0 unveraendert', () => {
    const data = edge();
    const before = Uint8ClampedArray.from(data);

    applySharpening(data, 4, 3, 0);

    expect([...data]).toEqual([...before]);
  });

  it('verstaerkt den Sprung an einer Kante', () => {
    const data = edge();
    const dunkelVorher = data[4]; // Pixel (1,0), noch auf der dunklen Seite
    const hellVorher = data[8]; // Pixel (2,0), schon auf der hellen Seite

    applySharpening(data, 4, 3, 1);

    expect(data[4]).toBeLessThan(dunkelVorher);
    expect(data[8]).toBeGreaterThan(hellVorher);
  });

  it('laesst eine gleichmaessige Flaeche in Ruhe', () => {
    const flat = new Uint8ClampedArray(4 * 3 * 4);
    for (let i = 0; i < flat.length; i += 4) {
      flat[i] = 128;
      flat[i + 1] = 128;
      flat[i + 2] = 128;
      flat[i + 3] = 255;
    }

    applySharpening(flat, 4, 3, 1);

    for (let i = 0; i < flat.length; i += 4) {
      expect(flat[i]).toBe(128);
    }
  });

  // Neben durchsichtigen Pixeln stehen oft schwarze Farbwerte, die man nur
  // deshalb nicht sieht, weil Alpha 0 ist. Wuerde die Faltung sie mitrechnen,
  // bekaeme jede freigestellte Kante einen dunklen Saum.
  it('fasst nur voll deckende Pixel an', () => {
    const data = surface([
      [0, 0, 0, 0],
      [200, 200, 200, 255],
      [0, 0, 0, 0],
    ]);

    applySharpening(data, 3, 1, 1);

    expect([data[0], data[1], data[2]]).toEqual([0, 0, 0]);
    expect([data[8], data[9], data[10]]).toEqual([0, 0, 0]);
  });

  it('laeuft an den Bildraendern nicht aus der Flaeche', () => {
    const data = edge();

    expect(() => applySharpening(data, 4, 3, 1)).not.toThrow();
    expect(data.every((value) => value >= 0 && value <= 255)).toBe(true);
  });
});
