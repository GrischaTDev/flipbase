import { describe, expect, it } from 'vitest';
import { profil } from '../models/plattform-profile';
import * as validierung from './plattform-validierung';
import { pruefeAusgabe } from './plattform-validierung';

describe('Plattform-Ausgabepruefung', () => {
  it('erkennt ein zu kleines eBay-Vollbild', () => {
    expect(pruefeAusgabe(null, { breite: 499, hoehe: 499 }, profil('ebay'))).toEqual({
      breite: 499,
      hoehe: 499,
      istGueltig: false,
    });
  });

  it('prueft den tatsaechlichen Zuschnitt statt der groesseren Originaldatei', () => {
    expect(
      pruefeAusgabe(
        { x: 500, y: 500, breite: 480, hoehe: 480 },
        { breite: 2400, hoehe: 1800 },
        profil('ebay'),
      ),
    ).toEqual({ breite: 480, hoehe: 480, istGueltig: false });
  });

  it('laesst die eBay-Grenze und Plattformen ohne Mindestgroesse zu', () => {
    expect(pruefeAusgabe(null, { breite: 500, hoehe: 500 }, profil('ebay'))?.istGueltig).toBe(true);
    expect(
      pruefeAusgabe(null, { breite: 120, hoehe: 90 }, profil('kleinanzeigen'))?.istGueltig,
    ).toBe(true);
  });

  it('blockiert nicht solange die Bildgroesse noch unbekannt ist', () => {
    expect(pruefeAusgabe(null, null, profil('ebay'))).toBeNull();
  });

  it('liefert das erste zu kleine Bild als Exporthindernis', () => {
    const findeAufloesungsproblem = (
      validierung as unknown as {
        findeAufloesungsproblem: (
          bilder: readonly {
            name: string;
            naturGroesse: { breite: number; hoehe: number } | null;
            ausschnitte: Record<string, never>;
          }[],
          profile: readonly ReturnType<typeof profil>[],
        ) => { bildName: string; plattformName: string; breite: number; hoehe: number } | null;
      }
    ).findeAufloesungsproblem;

    expect(
      findeAufloesungsproblem(
        [
          { name: 'gross.jpg', naturGroesse: { breite: 1200, hoehe: 1200 }, ausschnitte: {} },
          { name: 'klein.jpg', naturGroesse: { breite: 420, hoehe: 420 }, ausschnitte: {} },
        ],
        [profil('ebay')],
      ),
    ).toEqual({ bildName: 'klein.jpg', plattformName: 'eBay', breite: 420, hoehe: 420 });
  });
});
