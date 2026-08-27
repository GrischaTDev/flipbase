import { describe, it, expect } from 'vitest';
import {
  moveImage,
  removeImage,
  removeAll,
  markReviewed,
  toggleReviewed,
  reviewedCount,
} from './image-collection';
import { OptimizerImage } from '../models/optimizer-image';

function image(id: string, reviewed = false): OptimizerImage {
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
    const result = removeImage([image('a'), image('b')], 'a');

    expect(result.list.map((i) => i.id)).toEqual(['b']);
    expect(result.revokedUrls).toEqual(['blob:a']);
  });

  it('meldet nichts zur Freigabe, wenn die Kennung unbekannt ist', () => {
    const result = removeImage([image('a')], 'gibtesnicht');

    expect(result.list.map((i) => i.id)).toEqual(['a']);
    expect(result.revokedUrls).toEqual([]);
  });

  it('verschiebt ein Bild nach vorne', () => {
    const list = moveImage([image('a'), image('b'), image('c')], 'c', -1);

    expect(list.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('laesst die Liste am Rand unveraendert', () => {
    const list = [image('a'), image('b')];

    expect(moveImage(list, 'a', -1)).toBe(list);
    expect(moveImage(list, 'b', 1)).toBe(list);
  });

  it('entfernt alle Bilder und meldet jede URL zur Freigabe', () => {
    const result = removeAll([image('a'), image('b')]);

    expect(result.list).toEqual([]);
    expect(result.revokedUrls).toEqual(['blob:a', 'blob:b']);
  });
});

describe('Fortschritt', () => {
  it('markiert ein Bild als durchgesehen', () => {
    expect(markReviewed([image('a')], 'a')[0].reviewed).toBe(true);
  });

  it('gibt dieselbe Liste zurueck, wenn sich nichts aendert', () => {
    const list = [image('a', true)];

    expect(markReviewed(list, 'a')).toBe(list);
  });

  it('schaltet die Markierung in beide Richtungen um', () => {
    const enabled = toggleReviewed([image('a')], 'a');
    expect(enabled[0].reviewed).toBe(true);
    expect(toggleReviewed(enabled, 'a')[0].reviewed).toBe(false);
  });

  it('zaehlt die durchgesehenen Bilder', () => {
    expect(reviewedCount([image('a', true), image('b'), image('c', true)])).toBe(2);
  });
});
