import { describe, it, expect } from 'vitest';
import { setCrop, applyCropToAll, Crops } from './crops';
import { Rect, platformById } from '../models/platform-profile';

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
