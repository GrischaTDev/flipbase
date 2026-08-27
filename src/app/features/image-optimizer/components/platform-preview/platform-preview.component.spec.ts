import { describe, expect, it } from 'vitest';
import { resolvePreviewRect, planPreview } from './platform-preview.component';
import { PLATFORM_PROFILES, platformById } from '../../models/platform-profile';

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

describe('Vorschau und Export stimmen ueberein', () => {
  it('liefert fuer jedes Profil einen Plan im Exportverhaeltnis', () => {
    const source = { width: 3000, height: 3000 };

    for (const p of PLATFORM_PROFILES) {
      const plan = planPreview(null, source, p);

      expect(plan, `${p.name} hat keinen Plan`).not.toBeNull();
      expect(plan!.width / plan!.height, `${p.name} weicht ab`).toBeCloseTo(p.exportRatio, 2);
    }
  });

  it('haelt Kachel- und Exportverhaeltnis deckungsgleich', () => {
    // Die Vorschau verzichtet bewusst auf einen eigenen Rahmen und laesst das
    // gerenderte Bild seine Groesse selbst bestimmen. Das ist nur zulaessig,
    // solange beide Verhaeltnisse gleich sind. Gehen sie je auseinander,
    // schlaegt dieser Test an und die Kachel braucht eine echte Nachbildung.
    for (const p of PLATFORM_PROFILES) {
      expect(p.tileRatio, `${p.name}`).toBeCloseTo(p.exportRatio, 5);
    }
  });

  it('erzeugt fuer Vinted ein hochkantes Ergebnis', () => {
    const plan = planPreview(null, { width: 3000, height: 3000 }, platformById('vinted'));

    expect(plan!.height).toBeGreaterThan(plan!.width);
    expect(plan!.width / plan!.height).toBeCloseTo(2 / 3, 2);
  });
});
