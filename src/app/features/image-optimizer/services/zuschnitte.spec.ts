import { describe, it, expect } from 'vitest';
import { setzeZuschnitt, uebernimmAufAlle, Zuschnitte } from './zuschnitte';
import { Rechteck, profil } from '../models/plattform-profile';

const alle = [profil('ebay'), profil('kleinanzeigen'), profil('vinted')];
const quer: Rechteck = { x: 0, y: 0, breite: 1500, hoehe: 1000 };

describe('Zuschnitt einer Plattform setzen', () => {
  it('legt den Zuschnitt genau dieser Plattform ab', () => {
    const nachher = setzeZuschnitt({}, 'ebay', quer, alle);
    expect(nachher.ebay).toEqual(quer);
  });

  it('fuellt leere Plattformen aus dem neuen Zuschnitt ab', () => {
    // Ein Bild soll nach einer einzigen Geste fuer alle Plattformen fertig
    // sein - sonst muss man dreimal dasselbe tun.
    const nachher = setzeZuschnitt({}, 'ebay', quer, alle);

    expect(nachher.vinted).toBeDefined();
    expect(nachher.vinted!.breite / nachher.vinted!.hoehe).toBeCloseTo(2 / 3, 5);
    expect(nachher.kleinanzeigen!.breite / nachher.kleinanzeigen!.hoehe).toBeCloseTo(4 / 3, 5);
  });

  it('laesst bereits angepasste Plattformen unangetastet', () => {
    const eigener: Rechteck = { x: 10, y: 20, breite: 300, hoehe: 450 };
    const vorher: Zuschnitte = { vinted: eigener };

    const nachher = setzeZuschnitt(vorher, 'ebay', quer, alle);

    expect(nachher.vinted).toEqual(eigener);
  });

  it('fuellt nur gewaehlte Plattformen ab', () => {
    const nachher = setzeZuschnitt({}, 'ebay', quer, [profil('ebay'), profil('vinted')]);

    expect(nachher.kleinanzeigen).toBeUndefined();
    expect(nachher.vinted).toBeDefined();
  });
});

describe('Auf die anderen Plattformen uebernehmen', () => {
  it('ueberschreibt auch bereits angepasste Zuschnitte', () => {
    // Bewusst: Der Knopf heisst so, und ein halbherziges Uebernehmen waere
    // schwerer zu verstehen als ein vollstaendiges.
    const eigener: Rechteck = { x: 10, y: 20, breite: 300, hoehe: 450 };
    const vorher: Zuschnitte = { ebay: quer, vinted: eigener };

    const nachher = uebernimmAufAlle(vorher, 'ebay', alle);

    expect(nachher.vinted).not.toEqual(eigener);
    expect(nachher.vinted!.breite / nachher.vinted!.hoehe).toBeCloseTo(2 / 3, 5);
  });

  it('laesst die Quelle selbst unveraendert', () => {
    const nachher = uebernimmAufAlle({ ebay: quer }, 'ebay', alle);
    expect(nachher.ebay).toEqual(quer);
  });

  it('tut nichts, wenn die Quelle keinen Zuschnitt hat', () => {
    const vorher: Zuschnitte = { vinted: quer };
    expect(uebernimmAufAlle(vorher, 'ebay', alle)).toEqual(vorher);
  });
});
