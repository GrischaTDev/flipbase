import { describe, it, expect } from 'vitest';
import {
  moveImage,
  removeImage,
  markReviewed,
  toggleReviewed,
  reviewedCount,
} from './image-collection';
import { OptimizerImage } from '../models/optimizer-image';

function bild(id: string, reviewed = false): OptimizerImage {
  return {
    id,
    file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
    dataUrl: `blob:${id}`,
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: { width: 2000, height: 1500 },
    reviewed,
  };
}

describe('Bilderliste verwalten', () => {
  it('entfernt ein Bild und meldet dessen URL zur Freigabe', () => {
    const ergebnis = removeImage([bild('a'), bild('b')], 'a');

    expect(ergebnis.list.map((b) => b.id)).toEqual(['b']);
    expect(ergebnis.revokedUrls).toEqual(['blob:a']);
  });

  it('meldet nichts zur Freigabe, wenn die Kennung unbekannt ist', () => {
    const ergebnis = removeImage([bild('a')], 'gibtesnicht');

    expect(ergebnis.list.map((b) => b.id)).toEqual(['a']);
    expect(ergebnis.revokedUrls).toEqual([]);
  });

  it('verschiebt ein Bild nach vorne', () => {
    const liste = moveImage([bild('a'), bild('b'), bild('c')], 'c', -1);

    expect(liste.map((b) => b.id)).toEqual(['a', 'c', 'b']);
  });

  it('laesst die Liste am Rand unveraendert', () => {
    const liste = [bild('a'), bild('b')];

    expect(moveImage(liste, 'a', -1)).toBe(liste);
    expect(moveImage(liste, 'b', 1)).toBe(liste);
  });
});

describe('Fortschritt', () => {
  it('markiert ein Bild als durchgesehen', () => {
    expect(markReviewed([bild('a')], 'a')[0].reviewed).toBe(true);
  });

  it('gibt dieselbe Liste zurueck, wenn sich nichts aendert', () => {
    const liste = [bild('a', true)];

    expect(markReviewed(liste, 'a')).toBe(liste);
  });

  it('schaltet die Markierung in beide Richtungen um', () => {
    const an = toggleReviewed([bild('a')], 'a');
    expect(an[0].reviewed).toBe(true);
    expect(toggleReviewed(an, 'a')[0].reviewed).toBe(false);
  });

  it('zaehlt die durchgesehenen Bilder', () => {
    expect(reviewedCount([bild('a', true), bild('b'), bild('c', true)])).toBe(2);
  });
});
