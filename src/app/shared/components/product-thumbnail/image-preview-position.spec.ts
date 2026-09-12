import { describe, expect, it } from 'vitest';
import { placePreview, previewSize } from './image-preview-position';

const desktop = { width: 1280, height: 800 };

function anchor(left: number, top: number, size = 40) {
  return { left, right: left + size, top, bottom: top + size };
}

describe('previewSize', () => {
  it('nutzt auf großen Fenstern die volle Wunschgröße', () => {
    expect(previewSize(desktop)).toBe(320);
  });

  it('schrumpft auf kleinen Fenstern mit', () => {
    expect(previewSize({ width: 375, height: 812 })).toBe(320);
    expect(previewSize({ width: 320, height: 480 })).toBe(288);
  });

  it('wird nie unbrauchbar klein', () => {
    expect(previewSize({ width: 100, height: 100 })).toBe(120);
  });
});

describe('placePreview', () => {
  it('legt die Vorschau rechts neben das Bild', () => {
    const placement = placePreview(anchor(100, 300), desktop);

    expect(placement.left).toBe(148);
    expect(placement.size).toBe(320);
  });

  it('klappt nach links, wenn rechts kein Platz ist', () => {
    const placement = placePreview(anchor(1100, 300), desktop);

    expect(placement.left).toBe(772);
  });

  it('zentriert die Vorschau senkrecht zum Bild', () => {
    const placement = placePreview(anchor(100, 300), desktop);

    expect(placement.top).toBe(160);
  });

  it('hält die Vorschau oben und unten im Fenster', () => {
    expect(placePreview(anchor(100, 0), desktop).top).toBe(16);
    expect(placePreview(anchor(100, 780), desktop).top).toBe(800 - 320 - 16);
  });

  it('zentriert waagerecht, wenn weder links noch rechts Platz ist', () => {
    const narrow = { width: 360, height: 800 };
    const placement = placePreview(anchor(160, 300), narrow);

    expect(placement.left).toBeGreaterThanOrEqual(16);
    expect(placement.left + placement.size).toBeLessThanOrEqual(narrow.width - 16);
  });
});
