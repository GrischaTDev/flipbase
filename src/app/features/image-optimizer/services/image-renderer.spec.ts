import { describe, expect, it, vi } from 'vitest';
import { platformById } from '../models/platform-profile';
import { planOutput, renderImage } from './image-renderer';

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

function createCanvasStub(): CanvasStub {
  const calls: string[] = [];

  const context = {
    fillStyle: '',
    filter: 'none',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect(): void {
      calls.push(`fillRect filter=${context.filter}`);
    },
    drawImage(): void {
      calls.push(`drawImage filter=${context.filter}`);
    },
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: (blob: Blob | null) => void) =>
      callback(new Blob([''], { type: 'image/jpeg' })),
  };

  return { canvas: canvas as unknown as HTMLCanvasElement, calls };
}

function useCanvasStub(stub: CanvasStub): void {
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'canvas' ? stub.canvas : original(tag as 'div'),
  );
}

const plan = { source: { x: 0, y: 0, width: 100, height: 100 }, width: 50, height: 50 };

describe('Filter beim Rendern', () => {
  it('zeichnet den weissen Grund, bevor der Filter gesetzt wird', async () => {
    // Sonst faerbte brightness(0.6) auch den Grund ein und jedes Bild bekaeme
    // einen grauen statt eines weissen Randes.
    const stub = createCanvasStub();
    useCanvasStub(stub);

    await renderImage({} as CanvasImageSource, plan, 0.92, 'brightness(0.6)');

    expect(stub.calls).toEqual(['fillRect filter=none', 'drawImage filter=brightness(0.6)']);
    vi.restoreAllMocks();
  });

  it('setzt ohne Filterausdruck gar keinen Filter', async () => {
    const stub = createCanvasStub();
    useCanvasStub(stub);

    await renderImage({} as CanvasImageSource, plan, 0.92, '');

    expect(stub.calls).toEqual(['fillRect filter=none', 'drawImage filter=none']);
    vi.restoreAllMocks();
  });

  it('setzt den Filter nach dem Zeichnen zurueck', async () => {
    const stub = createCanvasStub();
    useCanvasStub(stub);

    await renderImage({} as CanvasImageSource, plan, 0.92, 'grayscale(1)');

    const context = stub.canvas.getContext('2d') as unknown as { filter: string };
    expect(context.filter).toBe('none');
    vi.restoreAllMocks();
  });
});
