import { describe, it, expect } from 'vitest';
import * as plattformProfile from './plattform-profile';
import { PLATTFORM_PROFILE, profil } from './plattform-profile';

/**
 * Die Werte stammen aus einer Messung an den echten Trefferlisten
 * (23.08.2026). Dieser Test haelt sie fest: Wer sie aendert, soll es
 * bewusst tun und nicht beilaeufig.
 */
describe('Plattformprofile', () => {
  it('kennt genau die drei Plattformen', () => {
    expect(PLATTFORM_PROFILE.map((p) => p.id)).toEqual(['ebay', 'kleinanzeigen', 'vinted']);
  });

  it('eBay ist quadratisch und schneidet nicht', () => {
    const p = profil('ebay');
    expect(p.exportVerhaeltnis).toBe(1);
    expect(p.exportBreite).toBe(1600);
    expect(p.exportHoehe).toBe(1600);
    expect(p.schneidet).toBe(false);
    expect(p.herkunft).toBe('offiziell');
    expect(p.vorschauArt).toBe('kachel');
    expect(p.name).toBe('eBay');
  });

  it('Kleinanzeigen ist quer und schneidet', () => {
    const p = profil('kleinanzeigen');
    expect(p.exportVerhaeltnis).toBeCloseTo(4 / 3, 5);
    expect(p.exportBreite).toBe(1600);
    expect(p.exportHoehe).toBe(1200);
    expect(p.schneidet).toBe(true);
    expect(p.herkunft).toBe('gemessen');
    expect(p.vorschauArt).toBe('zeile');
    expect(p.name).toBe('Kleinanzeigen');
  });

  it('Vinted ist hochkant und schneidet', () => {
    const p = profil('vinted');
    expect(p.exportVerhaeltnis).toBeCloseTo(2 / 3, 5);
    expect(p.exportBreite).toBe(1200);
    expect(p.exportHoehe).toBe(1800);
    expect(p.schneidet).toBe(true);
    expect(p.herkunft).toBe('gemessen');
    expect(p.vorschauArt).toBe('kachel');
    expect(p.name).toBe('Vinted');
  });

  it('das Kachelverhaeltnis entspricht dem Exportverhaeltnis', () => {
    // Wer im Werkzeug das Format erzeugt, das die Liste ohnehin herstellt,
    // sieht dort spaeter genau sein Bild.
    for (const p of PLATTFORM_PROFILE) {
      expect(p.kachelVerhaeltnis).toBeCloseTo(p.exportVerhaeltnis, 5);
    }
  });

  it('gemessene Werte tragen ein Messdatum, offizielle nicht', () => {
    for (const p of PLATTFORM_PROFILE) {
      if (p.herkunft === 'gemessen') {
        expect(p.gemessenAm).toBe('2026-08-23');
      } else {
        expect(p.gemessenAm).toBeUndefined();
      }
    }
  });

  it('nur Vinted kennt keine Dateigroessengrenze', () => {
    expect(profil('ebay').maxDateigroesseMB).toBe(12);
    expect(profil('kleinanzeigen').maxDateigroesseMB).toBe(12);
    expect(profil('vinted').maxDateigroesseMB).toBeNull();
  });

  it('erkennt eine eBay-Ausgabe unter der offiziellen Mindestgroesse', () => {
    const pruefeMindestgroesse = (
      plattformProfile as unknown as {
        pruefeMindestgroesse: (
          groesse: { breite: number; hoehe: number },
          p: ReturnType<typeof profil>,
        ) => boolean;
      }
    ).pruefeMindestgroesse;

    expect(pruefeMindestgroesse({ breite: 499, hoehe: 500 }, profil('ebay'))).toBe(false);
    expect(pruefeMindestgroesse({ breite: 500, hoehe: 500 }, profil('ebay'))).toBe(true);
  });

  it('blockiert Plattformen ohne bekannte Mindestgroesse nicht', () => {
    const pruefeMindestgroesse = (
      plattformProfile as unknown as {
        pruefeMindestgroesse: (
          groesse: { breite: number; hoehe: number },
          p: ReturnType<typeof profil>,
        ) => boolean;
      }
    ).pruefeMindestgroesse;

    expect(pruefeMindestgroesse({ breite: 120, hoehe: 80 }, profil('kleinanzeigen'))).toBe(true);
    expect(pruefeMindestgroesse({ breite: 120, hoehe: 80 }, profil('vinted'))).toBe(true);
  });
});
