import { describe, it, expect } from 'vitest';
import { setCrop, applyCropToAll, Crops } from './crops';
import { Rect, platformById } from '../models/platform-profile';

const alle = [platformById('ebay'), platformById('kleinanzeigen'), platformById('vinted')];
const quer: Rect = { x: 0, y: 0, width: 1500, height: 1000 };

describe('Zuschnitt einer Plattform setzen', () => {
  it('legt den Zuschnitt genau dieser Plattform ab', () => {
    const nachher = setCrop({}, 'ebay', quer, alle);
    expect(nachher.ebay).toEqual(quer);
  });

  it('fuellt leere Plattformen aus dem neuen Zuschnitt ab', () => {
    // Ein Bild soll nach einer einzigen Geste fuer alle Plattformen fertig
    // sein - sonst muss man dreimal dasselbe tun.
    const nachher = setCrop({}, 'ebay', quer, alle);

    expect(nachher.vinted).toBeDefined();
    expect(nachher.vinted!.width / nachher.vinted!.height).toBeCloseTo(2 / 3, 5);
    expect(nachher.kleinanzeigen!.width / nachher.kleinanzeigen!.height).toBeCloseTo(4 / 3, 5);
  });

  it('laesst bereits angepasste Plattformen unangetastet', () => {
    const eigener: Rect = { x: 10, y: 20, width: 300, height: 450 };
    const vorher: Crops = { vinted: eigener };

    const nachher = setCrop(vorher, 'ebay', quer, alle);

    expect(nachher.vinted).toEqual(eigener);
  });

  it('fuellt nur gewaehlte Plattformen ab', () => {
    const nachher = setCrop({}, 'ebay', quer, [platformById('ebay'), platformById('vinted')]);

    expect(nachher.kleinanzeigen).toBeUndefined();
    expect(nachher.vinted).toBeDefined();
  });
});

describe('Auf die anderen Plattformen uebernehmen', () => {
  it('ueberschreibt auch bereits angepasste Zuschnitte', () => {
    // Bewusst: Der Knopf heisst so, und ein halbherziges Uebernehmen waere
    // schwerer zu verstehen als ein vollstaendiges.
    const eigener: Rect = { x: 10, y: 20, width: 300, height: 450 };
    const vorher: Crops = { ebay: quer, vinted: eigener };

    const nachher = applyCropToAll(vorher, 'ebay', alle);

    expect(nachher.vinted).not.toEqual(eigener);
    expect(nachher.vinted!.width / nachher.vinted!.height).toBeCloseTo(2 / 3, 5);
  });

  it('laesst die Quelle selbst unveraendert', () => {
    const nachher = applyCropToAll({ ebay: quer }, 'ebay', alle);
    expect(nachher.ebay).toEqual(quer);
  });

  it('tut nichts, wenn die Quelle keinen Zuschnitt hat', () => {
    const vorher: Crops = { vinted: quer };
    expect(applyCropToAll(vorher, 'ebay', alle)).toEqual(vorher);
  });
});
