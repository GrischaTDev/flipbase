import { describe, expect, it } from 'vitest';
import { resolvePreviewRect, planPreview } from './platform-preview.component';
import { platformById } from '../../models/platform-profile';

describe('Vorschau-Ausschnitt', () => {
  it('leitet ohne gespeicherten Zuschnitt aus dem mittigen Vollbild ab', () => {
    expect(resolvePreviewRect(null, { width: 1500, height: 1000 }, 1)).toEqual({
      x: 250,
      y: 0,
      width: 1000,
      height: 1000,
    });
  });

  it('verwendet einen gespeicherten Zuschnitt auch ohne bekannte Bildgroesse', () => {
    const crop = { x: 100, y: 200, width: 600, height: 600 };

    expect(resolvePreviewRect(crop, null, 4 / 3)).toEqual({
      x: 100,
      y: 275,
      width: 600,
      height: 450,
    });
  });

  it('bevorzugt den gespeicherten Zuschnitt vor dem Vollbild', () => {
    const crop = { x: 100, y: 200, width: 600, height: 600 };

    expect(resolvePreviewRect(crop, { width: 3000, height: 2000 }, 1)).toEqual(crop);
  });

  it('liefert ohne Zuschnitt und ohne Bildgroesse null', () => {
    expect(resolvePreviewRect(null, null, 1)).toBeNull();
  });

  it('behält einen nach rechts verschobenen Ausschnitt im echten Renderplan', () => {
    const plan = planPreview(
      { x: 1400, y: 200, width: 800, height: 800 },
      null,
      platformById('ebay'),
    );

    expect(plan).not.toBeNull();
    expect(plan!.source).toEqual({ x: 1400, y: 200, width: 800, height: 800 });
    expect({ width: plan!.width, height: plan!.height }).toEqual({ width: 800, height: 800 });
  });
});
