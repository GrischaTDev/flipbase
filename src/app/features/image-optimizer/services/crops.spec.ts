import { describe, it, expect } from 'vitest';
import { setCrop, applyCropToAll, Crops, maximumCrop, isMaximum } from './crops';
import { Rect, Size, platformById } from '../models/platform-profile';
import { deriveRect } from './crop';

const all = [platformById('ebay'), platformById('kleinanzeigen'), platformById('vinted')];
const wide: Rect = { x: 0, y: 0, width: 1500, height: 1000 };

describe('Zuschnitt einer Plattform setzen', () => {
  it('legt den Zuschnitt genau dieser Plattform ab', () => {
    const after = setCrop({}, 'ebay', wide, all);
    expect(after.ebay).toEqual(wide);
  });

  it('fuellt leere Plattformen aus dem neuen Zuschnitt ab', () => {
    // Ein Bild soll nach einer einzigen Geste fuer alle Plattformen fertig
    // sein - sonst muss man dreimal dasselbe tun.
    const after = setCrop({}, 'ebay', wide, all);

    expect(after.vinted).toBeDefined();
    expect(after.vinted!.width / after.vinted!.height).toBeCloseTo(2 / 3, 5);
    expect(after.kleinanzeigen!.width / after.kleinanzeigen!.height).toBeCloseTo(4 / 3, 5);
  });

  it('laesst bereits angepasste Plattformen unangetastet', () => {
    const own: Rect = { x: 10, y: 20, width: 300, height: 450 };
    const before: Crops = { vinted: own };

    const after = setCrop(before, 'ebay', wide, all);

    expect(after.vinted).toEqual(own);
  });

  it('fuellt nur gewaehlte Plattformen ab', () => {
    const after = setCrop({}, 'ebay', wide, [platformById('ebay'), platformById('vinted')]);

    expect(after.kleinanzeigen).toBeUndefined();
    expect(after.vinted).toBeDefined();
  });
});

describe('Auf die anderen Plattformen uebernehmen', () => {
  it('ueberschreibt auch bereits angepasste Zuschnitte', () => {
    // Bewusst: Der Knopf heisst so, und ein halbherziges Uebernehmen waere
    // schwerer zu verstehen als ein vollstaendiges.
    const own: Rect = { x: 10, y: 20, width: 300, height: 450 };
    const before: Crops = { ebay: wide, vinted: own };

    const after = applyCropToAll(before, 'ebay', all);

    expect(after.vinted).not.toEqual(own);
    expect(after.vinted!.width / after.vinted!.height).toBeCloseTo(2 / 3, 5);
  });

  it('laesst die Quelle selbst unveraendert', () => {
    const after = applyCropToAll({ ebay: wide }, 'ebay', all);
    expect(after.ebay).toEqual(wide);
  });

  it('tut nichts, wenn die Quelle keinen Zuschnitt hat', () => {
    const before: Crops = { vinted: wide };
    expect(applyCropToAll(before, 'ebay', all)).toEqual(before);
  });
});

/** Ein Handyfoto im Hochformat: 3000 x 4000 px, Verhaeltnis 3:4. */
const phone: Size = { width: 3000, height: 4000 };

describe('Groesster Ausschnitt im Vollbild', () => {
  it('nutzt bei einem Hochformat fuer 2:3 die volle Hoehe', () => {
    // Vinted. Die Breite ist 4000 * 2/3 = 2666,67 - also 88,9 % der 3000.
    const rect = maximumCrop(phone, 2 / 3);

    expect(rect.height).toBeCloseTo(4000, 5);
    expect(rect.width).toBeCloseTo(2666.6667, 3);
    expect(rect.y).toBeCloseTo(0, 5);
  });

  it('legt den Ausschnitt mittig auf die schmalere Achse', () => {
    const rect = maximumCrop(phone, 2 / 3);

    expect(rect.x).toBeCloseTo((3000 - 2666.6667) / 2, 3);
  });

  it('nutzt bei einem Hochformat fuer 1:1 die volle Breite', () => {
    // eBay. Das Quadrat ist so breit wie das Foto und mittig in der Hoehe.
    const rect = maximumCrop(phone, 1);

    expect(rect.width).toBeCloseTo(3000, 5);
    expect(rect.height).toBeCloseTo(3000, 5);
    expect(rect.y).toBeCloseTo(500, 5);
  });

  it('liefert bei passendem Verhaeltnis das ganze Bild', () => {
    const rect = maximumCrop({ width: 1200, height: 1800 }, 2 / 3);

    expect(rect).toEqual({ x: 0, y: 0, width: 1200, height: 1800 });
  });

  it('ist deutlich groesser als der aus dem eBay-Quadrat abgeleitete Rahmen', () => {
    // Genau der gemeldete Fehler: Aus dem Quadrat abgeleitet blieben nur
    // 66,7 % der Fotobreite uebrig, aus dem Vollbild sind es 88,9 %.
    const fromSquare = deriveRect(maximumCrop(phone, 1), 2 / 3);
    const fromFull = maximumCrop(phone, 2 / 3);

    expect(fromSquare.width).toBeCloseTo(2000, 3);
    expect(fromFull.width).toBeCloseTo(2666.6667, 3);
  });
});

describe('Erkennen, ob ein Ausschnitt noch das Maximum ist', () => {
  it('erkennt den unveraenderten Rahmen', () => {
    expect(isMaximum(maximumCrop(phone, 2 / 3), phone, 2 / 3)).toBe(true);
  });

  it('erkennt einen vom Nutzer verkleinerten Rahmen', () => {
    const smaller: Rect = { x: 200, y: 200, width: 1200, height: 1800 };

    expect(isMaximum(smaller, phone, 2 / 3)).toBe(false);
  });

  it('verzeiht eine Abweichung von unter einem Pixel', () => {
    // Der Cropper rechnet ueber die Anzeigegroesse und rundet dabei. Ohne
    // Toleranz gaelte ein nie angefasster Rahmen als vom Nutzer gezogen.
    const max = maximumCrop(phone, 2 / 3);
    const rounded: Rect = {
      x: Math.round(max.x),
      y: max.y,
      width: Math.round(max.width),
      height: max.height,
    };

    expect(isMaximum(rounded, phone, 2 / 3)).toBe(true);
  });

  it('erkennt einen verschobenen Rahmen gleicher Groesse', () => {
    const max = maximumCrop(phone, 2 / 3);
    const moved: Rect = { ...max, x: max.x + 100 };

    expect(isMaximum(moved, phone, 2 / 3)).toBe(false);
  });
});
