import { describe, it, expect } from 'vitest';
import { setCrop, applyCropToAll, Crops, maximumCrop, isMaximum, seedCrops } from './crops';
import { Rect, Size, platformById } from '../models/platform-profile';
import { deriveRect } from './crop';

const all = [platformById('ebay'), platformById('kleinanzeigen'), platformById('vinted')];
const wide: Rect = { x: 0, y: 0, width: 1500, height: 1000 };

describe('Zuschnitt einer Plattform setzen', () => {
  it('legt den Zuschnitt genau dieser Plattform ab', () => {
    const after = setCrop({}, 'ebay', wide, all, null);
    expect(after.ebay).toEqual(wide);
  });

  it('fuellt leere Plattformen aus dem neuen Zuschnitt ab', () => {
    // Ein Bild soll nach einer einzigen Geste fuer alle Plattformen fertig
    // sein - sonst muss man dreimal dasselbe tun.
    const after = setCrop({}, 'ebay', wide, all, null);

    expect(after.vinted).toBeDefined();
    expect(after.vinted!.width / after.vinted!.height).toBeCloseTo(2 / 3, 5);
    expect(after.kleinanzeigen!.width / after.kleinanzeigen!.height).toBeCloseTo(4 / 3, 5);
  });

  it('laesst bereits angepasste Plattformen unangetastet', () => {
    const own: Rect = { x: 10, y: 20, width: 300, height: 450 };
    const before: Crops = { vinted: own };

    const after = setCrop(before, 'ebay', wide, all, null);

    expect(after.vinted).toEqual(own);
  });

  it('fuellt nur gewaehlte Plattformen ab', () => {
    const after = setCrop({}, 'ebay', wide, [platformById('ebay'), platformById('vinted')], null);

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

    const after = applyCropToAll(before, 'ebay', all, null);

    expect(after.vinted).not.toEqual(own);
    expect(after.vinted!.width / after.vinted!.height).toBeCloseTo(2 / 3, 5);
  });

  it('laesst die Quelle selbst unveraendert', () => {
    const after = applyCropToAll({ ebay: wide }, 'ebay', all, null);
    expect(after.ebay).toEqual(wide);
  });

  it('tut nichts, wenn die Quelle keinen Zuschnitt hat', () => {
    const before: Crops = { vinted: wide };
    expect(applyCropToAll(before, 'ebay', all, null)).toEqual(before);
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
      y: Math.round(max.y),
      width: Math.round(max.width),
      height: Math.round(max.height),
    };

    expect(isMaximum(rounded, phone, 2 / 3)).toBe(true);
  });

  it('erkennt einen verschobenen Rahmen gleicher Groesse', () => {
    const max = maximumCrop(phone, 2 / 3);
    const moved: Rect = { ...max, x: max.x + 100 };

    expect(isMaximum(moved, phone, 2 / 3)).toBe(false);
  });
});

describe('Alle gewaehlten Plattformen vorbelegen', () => {
  it('gibt jeder gewaehlten Plattform ihr eigenes Maximum', () => {
    const crops = seedCrops(phone, all);

    expect(crops.ebay).toEqual(maximumCrop(phone, 1));
    expect(crops.vinted).toEqual(maximumCrop(phone, 2 / 3));
    expect(crops.kleinanzeigen).toEqual(maximumCrop(phone, 4 / 3));
  });

  it('belegt nur gewaehlte Plattformen', () => {
    const crops = seedCrops(phone, [platformById('vinted')]);

    expect(crops.vinted).toBeDefined();
    expect(crops.ebay).toBeUndefined();
    expect(crops.kleinanzeigen).toBeUndefined();
  });

  it('liefert bei leerer Auswahl nichts', () => {
    expect(seedCrops(phone, [])).toEqual({});
  });
});

describe('Zuschnitt setzen, wenn die Bildgroesse bekannt ist', () => {
  it('belegt leere Plattformen aus dem Vollbild, solange der Rahmen unberuehrt ist', () => {
    // Der Kern der Regel: Wer nichts eingeschraenkt hat, soll fuer die neue
    // Plattform auch nicht eingeschraenkt werden.
    const untouched = maximumCrop(phone, 1);

    const after = setCrop({ ebay: untouched }, 'ebay', untouched, all, phone);

    expect(after.vinted!.width).toBeCloseTo(maximumCrop(phone, 2 / 3).width, 3);
  });

  it('leitet aus dem aktiven Rahmen ab, sobald der Nutzer gezogen hat', () => {
    // Der Grundsatz des Werkzeugs: In keinem Export darf Inhalt landen, den
    // der Nutzer nicht gesehen hat.
    const dragged: Rect = { x: 400, y: 600, width: 1500, height: 1500 };

    const after = setCrop({ ebay: dragged }, 'ebay', dragged, all, phone);

    expect(after.vinted!.width).toBeCloseTo(1000, 3);
    expect(after.vinted!.x).toBeGreaterThanOrEqual(dragged.x);
    expect(after.vinted!.y).toBeGreaterThanOrEqual(dragged.y);
  });

  it('leitet ohne bekannte Bildgroesse wie bisher aus dem Rahmen ab', () => {
    const rect: Rect = { x: 0, y: 0, width: 1500, height: 1000 };

    const after = setCrop({}, 'ebay', rect, all, null);

    expect(after.vinted!.width / after.vinted!.height).toBeCloseTo(2 / 3, 5);
    expect(after.vinted!.width).toBeLessThanOrEqual(rect.width);
  });

  it('laesst bereits angepasste Plattformen auch beim Vorbelegen unangetastet', () => {
    const own: Rect = { x: 10, y: 20, width: 300, height: 450 };
    const untouched = maximumCrop(phone, 1);

    const after = setCrop({ vinted: own }, 'ebay', untouched, all, phone);

    expect(after.vinted).toEqual(own);
  });
});

describe('Auf alle uebernehmen, wenn die Bildgroesse bekannt ist', () => {
  it('gibt den anderen Plattformen ihr eigenes Maximum, solange die Quelle unberuehrt ist', () => {
    // Derselbe Fehler wie bei setCrop, nur ueber den Knopf ausgeloest: Ohne
    // die Regel bekaeme Vinted die 2000 px aus dem eBay-Quadrat statt der
    // 2666,67 px, die aus dem Vollbild moeglich sind.
    const untouched = maximumCrop(phone, 1);

    const after = applyCropToAll({ ebay: untouched }, 'ebay', all, phone);

    expect(after.vinted!.width).toBeCloseTo(maximumCrop(phone, 2 / 3).width, 3);
    expect(after.vinted!.width).not.toBeCloseTo(2000, 0);
  });

  it('leitet aus dem Quell-Rahmen ab, sobald der Nutzer gezogen hat', () => {
    const dragged: Rect = { x: 400, y: 600, width: 1500, height: 1500 };

    const after = applyCropToAll({ ebay: dragged }, 'ebay', all, phone);

    expect(after.vinted!.width).toBeCloseTo(1000, 3);
    expect(after.vinted!.x).toBeGreaterThanOrEqual(dragged.x);
    expect(after.vinted!.y).toBeGreaterThanOrEqual(dragged.y);
  });

  it('verhaelt sich ohne bekannte Bildgroesse wie zuvor', () => {
    const untouched = maximumCrop(phone, 1);

    const after = applyCropToAll({ ebay: untouched }, 'ebay', all, null);

    expect(after.vinted).toEqual(deriveRect(untouched, 2 / 3));
  });

  it('ueberschreibt eine bereits angepasste Plattform auch bei unberuehrter Quelle', () => {
    // Der Zweck des Knopfs bleibt bestehen: "auf alle uebernehmen" heisst
    // auch fuer bereits angepasste Plattformen ueberschreiben, nicht nur
    // leere fuellen.
    const own: Rect = { x: 10, y: 20, width: 300, height: 450 };
    const untouched = maximumCrop(phone, 1);

    const after = applyCropToAll({ ebay: untouched, vinted: own }, 'ebay', all, phone);

    expect(after.vinted).not.toEqual(own);
    expect(after.vinted!.width).toBeCloseTo(maximumCrop(phone, 2 / 3).width, 3);
  });
});
