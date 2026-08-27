import { describe, expect, it } from 'vitest';
import { clampZoom, scaleCropToDisplay } from './editor-transform';

describe('Zoom des Zuschnitt-Editors', () => {
  it('begrenzt den Zoom auf den bedienbaren Bereich', () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(2.25)).toBe(2.25);
    expect(clampZoom(9)).toBe(3);
  });
});

describe('gespeicherten Ausschnitt wiederherstellen', () => {
  it('ignoriert die kurzzeitige Nullgröße beim Plattformwechsel', () => {
    expect(
      scaleCropToDisplay(
        { x: 100, y: 20, width: 400, height: 400 },
        { width: 1000, height: 800 },
        { width: 0, height: 0 },
      ),
    ).toBeUndefined();
  });
});
