import { describe, expect, it } from 'vitest';
import { ermittleVorschauAusschnitt } from './plattform-vorschau.component';

describe('Vorschau-Ausschnitt', () => {
  it('leitet ohne gespeicherten Zuschnitt aus dem mittigen Vollbild ab', () => {
    expect(ermittleVorschauAusschnitt(null, { breite: 1500, hoehe: 1000 }, 1)).toEqual({
      x: 250,
      y: 0,
      breite: 1000,
      hoehe: 1000,
    });
  });

  it('verwendet einen gespeicherten Zuschnitt auch ohne bekannte Bildgroesse', () => {
    const ausschnitt = { x: 100, y: 200, breite: 600, hoehe: 600 };

    expect(ermittleVorschauAusschnitt(ausschnitt, null, 4 / 3)).toEqual({
      x: 100,
      y: 275,
      breite: 600,
      hoehe: 450,
    });
  });

  it('bevorzugt den gespeicherten Zuschnitt vor dem Vollbild', () => {
    const ausschnitt = { x: 100, y: 200, breite: 600, hoehe: 600 };

    expect(ermittleVorschauAusschnitt(ausschnitt, { breite: 3000, hoehe: 2000 }, 1)).toEqual(
      ausschnitt,
    );
  });

  it('liefert ohne Zuschnitt und ohne Bildgroesse null', () => {
    expect(ermittleVorschauAusschnitt(null, null, 1)).toBeNull();
  });
});
