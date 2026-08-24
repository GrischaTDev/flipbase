import { describe, expect, it } from 'vitest';
import { begrenzeZoom, skaliereAusschnitt } from './editor-transform';

describe('Zoom des Zuschnitt-Editors', () => {
  it('begrenzt den Zoom auf den bedienbaren Bereich', () => {
    expect(begrenzeZoom(0.2)).toBe(1);
    expect(begrenzeZoom(2.25)).toBe(2.25);
    expect(begrenzeZoom(9)).toBe(3);
  });
});

describe('gespeicherten Ausschnitt wiederherstellen', () => {
  it('ignoriert die kurzzeitige Nullgröße beim Plattformwechsel', () => {
    expect(
      skaliereAusschnitt(
        { x: 100, y: 20, breite: 400, hoehe: 400 },
        { width: 1000, height: 800 },
        { width: 0, height: 0 },
      ),
    ).toBeUndefined();
  });
});
