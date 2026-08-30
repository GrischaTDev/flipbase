import { describe, expect, it, vi } from 'vitest';
import { platformById } from '../models/platform-profile';
import { NEUTRAL_LOOK, planOutput, renderImage } from './image-renderer';
import { Look } from './adjustments';

describe('Bildausgabe planen', () => {
  it('vergrößert einen kleinen quadratischen Ausschnitt nicht', () => {
    expect(planOutput({ x: 20, y: 30, width: 800, height: 800 }, platformById('ebay'))).toEqual({
      source: { x: 20, y: 30, width: 800, height: 800 },
      width: 800,
      height: 800,
    });
  });

  it('verkleinert einen großen Ausschnitt auf die Plattformgrenze', () => {
    expect(
      planOutput({ x: 100, y: 200, width: 2400, height: 1800 }, platformById('kleinanzeigen')),
    ).toEqual({
      source: { x: 100, y: 200, width: 2400, height: 1800 },
      width: 1600,
      height: 1200,
    });
  });

  it('leitet zuerst das Plattformformat aus einem abweichenden Rechteck ab', () => {
    expect(planOutput({ x: 0, y: 0, width: 1200, height: 800 }, platformById('vinted'))).toEqual({
      source: { x: 333.33333333333337, y: 0, width: 533.3333333333333, height: 800 },
      width: 533,
      height: 800,
    });
  });
});

interface CanvasStub {
  readonly canvas: HTMLCanvasElement;
  readonly calls: string[];
}

// jsdom kennt keine Zeichenflaeche: getContext('2d') liefert dort null. Der
// Stub protokolliert deshalb, WAS auf welcher Flaeche mit welchem Filter
// gezeichnet wird - genau die Zusicherung, um die es geht.
function createCanvasStub(name: string, calls: string[], pixels?: Uint8ClampedArray): CanvasStub {
  const context = {
    fillStyle: '',
    filter: 'none',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect(): void {
      calls.push(`${name}.fillRect filter=${context.filter}`);
    },
    drawImage(source?: unknown): void {
      const what = source && (source as { dataset?: string }).dataset ? 'layer' : 'image';
      calls.push(`${name}.drawImage(${what}) filter=${context.filter}`);
    },
    getImageData(_x: number, _y: number, width: number, height: number): ImageData {
      calls.push(`${name}.getImageData`);
      return {
        data: pixels ?? new Uint8ClampedArray(width * height * 4),
        width,
        height,
      } as ImageData;
    },
    putImageData(): void {
      calls.push(`${name}.putImageData`);
    },
  };

  const canvas = {
    width: 0,
    height: 0,
    dataset: name,
    getContext: () => context,
    toBlob: (callback: (blob: Blob | null) => void) =>
      callback(new Blob([''], { type: 'image/jpeg' })),
  };

  return { canvas: canvas as unknown as HTMLCanvasElement, calls };
}

/** Erste angeforderte Flaeche ist die Ausgabe, jede weitere die Zwischenebene. */
function useCanvasStubs(calls: string[], pixels?: Uint8ClampedArray): CanvasStub[] {
  const stubs = [
    createCanvasStub('output', calls, pixels),
    createCanvasStub('layer', calls, pixels),
  ];
  let handed = 0;
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'canvas' ? stubs[Math.min(handed++, stubs.length - 1)].canvas : original(tag as 'div'),
  );
  return stubs;
}

const look = (partial: Partial<Look>): Look => ({ ...NEUTRAL_LOOK, ...partial });

const plan = { source: { x: 0, y: 0, width: 100, height: 100 }, width: 50, height: 50 };

describe('Filter beim Rendern', () => {
  it('zeichnet den weissen Grund, bevor der Filter gesetzt wird', async () => {
    // Sonst faerbte brightness(0.6) auch den Grund ein und jedes Bild bekaeme
    // einen grauen statt eines weissen Randes.
    const calls: string[] = [];
    useCanvasStubs(calls);

    await renderImage({} as CanvasImageSource, plan, 0.92, look({ filter: 'brightness(0.6)' }));

    expect(calls).toEqual([
      'output.fillRect filter=none',
      'output.drawImage(image) filter=brightness(0.6)',
    ]);
    vi.restoreAllMocks();
  });

  it('setzt ohne Filterausdruck gar keinen Filter', async () => {
    const calls: string[] = [];
    useCanvasStubs(calls);

    await renderImage({} as CanvasImageSource, plan, 0.92, NEUTRAL_LOOK);

    expect(calls).toEqual(['output.fillRect filter=none', 'output.drawImage(image) filter=none']);
    vi.restoreAllMocks();
  });

  it('setzt den Filter nach dem Zeichnen zurueck', async () => {
    const calls: string[] = [];
    const stubs = useCanvasStubs(calls);

    await renderImage({} as CanvasImageSource, plan, 0.92, look({ filter: 'grayscale(1)' }));

    const context = stubs[0].canvas.getContext('2d') as unknown as { filter: string };
    expect(context.filter).toBe('none');
    vi.restoreAllMocks();
  });
});

describe('Waerme und Schaerfe beim Rendern', () => {
  // Der ganze Grund fuer die Zwischenebene. Wuerde auf der Ausgabe gerechnet,
  // waere der weisse Grund schon eingebrannt - Waerme faerbte ihn mit ein und
  // ein freigestelltes Produktfoto bekaeme einen warmen Rand.
  it('rechnet auf einer eigenen Ebene und legt sie erst danach auf den Grund', async () => {
    const calls: string[] = [];
    useCanvasStubs(calls);

    await renderImage({} as CanvasImageSource, plan, 0.92, look({ warmth: 0.5 }));

    expect(calls).toEqual([
      'output.fillRect filter=none',
      'layer.drawImage(image) filter=none',
      'layer.getImageData',
      'layer.putImageData',
      'output.drawImage(layer) filter=none',
    ]);
    vi.restoreAllMocks();
  });

  it('nimmt ohne Waerme und Schaerfe gar keine Zwischenebene', async () => {
    const calls: string[] = [];
    useCanvasStubs(calls);

    await renderImage({} as CanvasImageSource, plan, 0.92, look({ filter: 'contrast(1.2)' }));

    expect(calls.some((entry) => entry.startsWith('layer.'))).toBe(false);
    vi.restoreAllMocks();
  });

  it('wendet den CSS-Filter auf der Zwischenebene an, nicht auf dem Grund', async () => {
    const calls: string[] = [];
    useCanvasStubs(calls);

    await renderImage(
      {} as CanvasImageSource,
      plan,
      0.92,
      look({ filter: 'brightness(1.2)', sharpness: 0.4 }),
    );

    expect(calls).toContain('layer.drawImage(image) filter=brightness(1.2)');
    expect(calls).toContain('output.fillRect filter=none');
    expect(calls).toContain('output.drawImage(layer) filter=none');
    vi.restoreAllMocks();
  });

  it('reicht die tatsaechlichen Werte an die Pixelrechnung durch', async () => {
    // Ein einzelnes deckendes graues Pixel: Nach dem Waermen muss Rot oben und
    // Blau unten sein - sonst kam der Wert nie an.
    const pixels = new Uint8ClampedArray([100, 100, 100, 255]);
    const calls: string[] = [];
    useCanvasStubs(calls, pixels);

    await renderImage(
      {} as CanvasImageSource,
      { source: { x: 0, y: 0, width: 1, height: 1 }, width: 1, height: 1 },
      0.92,
      look({ warmth: 1 }),
    );

    expect(pixels[0]).toBeGreaterThan(100);
    expect(pixels[2]).toBeLessThan(100);
    vi.restoreAllMocks();
  });
});
