import { describe, it, expect } from 'vitest';
import * as platformProfile from './platform-profile';
import { PLATFORM_PROFILES, platformById, ratioLabel } from './platform-profile';

/**
 * Die Werte stammen aus einer Messung an den echten Trefferlisten
 * (23.08.2026). Dieser Test haelt sie fest: Wer sie aendert, soll es
 * bewusst tun und nicht beilaeufig.
 */
describe('Plattformprofile', () => {
  it('kennt genau die drei Plattformen', () => {
    expect(PLATFORM_PROFILES.map((p) => p.id)).toEqual(['ebay', 'kleinanzeigen', 'vinted']);
  });

  it('eBay ist quadratisch und schneidet nicht', () => {
    const p = platformById('ebay');
    expect(p.exportRatio).toBe(1);
    expect(p.exportWidth).toBe(1600);
    expect(p.exportHeight).toBe(1600);
    expect(p.crops).toBe(false);
    expect(p.source).toBe('offiziell');
    expect(p.previewKind).toBe('kachel');
    expect(p.name).toBe('eBay');
  });

  it('Kleinanzeigen ist quer und schneidet', () => {
    const p = platformById('kleinanzeigen');
    expect(p.exportRatio).toBeCloseTo(4 / 3, 5);
    expect(p.exportWidth).toBe(1600);
    expect(p.exportHeight).toBe(1200);
    expect(p.crops).toBe(true);
    expect(p.source).toBe('gemessen');
    expect(p.previewKind).toBe('zeile');
    expect(p.name).toBe('Kleinanzeigen');
  });

  it('Vinted ist hochkant und schneidet', () => {
    const p = platformById('vinted');
    expect(p.exportRatio).toBeCloseTo(2 / 3, 5);
    expect(p.exportWidth).toBe(1200);
    expect(p.exportHeight).toBe(1800);
    expect(p.crops).toBe(true);
    expect(p.source).toBe('gemessen');
    expect(p.previewKind).toBe('kachel');
    expect(p.name).toBe('Vinted');
  });

  it('das Kachelverhaeltnis entspricht dem Exportverhaeltnis', () => {
    // Wer im Werkzeug das Format erzeugt, das die Liste ohnehin herstellt,
    // sieht dort spaeter genau sein Bild.
    for (const p of PLATFORM_PROFILES) {
      expect(p.tileRatio).toBeCloseTo(p.exportRatio, 5);
    }
  });

  it('gemessene Werte tragen ein Messdatum, offizielle nicht', () => {
    for (const p of PLATFORM_PROFILES) {
      if (p.source === 'gemessen') {
        expect(p.measuredAt).toBe('2026-08-23');
      } else {
        expect(p.measuredAt).toBeUndefined();
      }
    }
  });

  it('nur Vinted kennt keine Dateigroessengrenze', () => {
    expect(platformById('ebay').maxFileSizeMB).toBe(12);
    expect(platformById('kleinanzeigen').maxFileSizeMB).toBe(12);
    expect(platformById('vinted').maxFileSizeMB).toBeNull();
  });

  it('erkennt eine eBay-Ausgabe unter der offiziellen Mindestgroesse', () => {
    const meetsMinimumSize = (
      platformProfile as unknown as {
        meetsMinimumSize: (
          size: { width: number; height: number },
          p: ReturnType<typeof platformById>,
        ) => boolean;
      }
    ).meetsMinimumSize;

    expect(meetsMinimumSize({ width: 499, height: 500 }, platformById('ebay'))).toBe(false);
    expect(meetsMinimumSize({ width: 500, height: 500 }, platformById('ebay'))).toBe(true);
  });

  it('gibt fuer jedes Profil das richtige Seitenverhaeltnis als Text', () => {
    expect(ratioLabel(platformById('ebay'))).toBe('1:1');
    expect(ratioLabel(platformById('kleinanzeigen'))).toBe('4:3');
    expect(ratioLabel(platformById('vinted'))).toBe('2:3');
  });

  it('blockiert Plattformen ohne bekannte Mindestgroesse nicht', () => {
    const meetsMinimumSize = (
      platformProfile as unknown as {
        meetsMinimumSize: (
          size: { width: number; height: number },
          p: ReturnType<typeof platformById>,
        ) => boolean;
      }
    ).meetsMinimumSize;

    expect(meetsMinimumSize({ width: 120, height: 80 }, platformById('kleinanzeigen'))).toBe(true);
    expect(meetsMinimumSize({ width: 120, height: 80 }, platformById('vinted'))).toBe(true);
  });
});
