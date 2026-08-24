import { describe, expect, it } from 'vitest';
import { erstelleExportSnapshot, ersetzeWennAktuell } from './async-zustand';

interface TestBild {
  readonly id: string;
  readonly datenUrl: string;
  readonly ausschnitte: Record<string, { x: number }>;
  readonly drehung: number;
}

describe('Export-Snapshot', () => {
  it('bleibt von spaeteren Listen- und Zuschnittsmutationen getrennt', () => {
    const bilder: TestBild[] = [
      {
        id: 'bild-1',
        datenUrl: 'blob:alt',
        ausschnitte: { ebay: { x: 10 } },
        drehung: 0,
      },
    ];
    const profile = [{ id: 'ebay' }];

    const snapshot = erstelleExportSnapshot(bilder, profile);
    bilder.push({ id: 'bild-2', datenUrl: 'blob:neu', ausschnitte: {}, drehung: 0 });
    bilder[0].ausschnitte['ebay'] = { x: 99 };
    profile[0] = { id: 'vinted' };

    expect(snapshot.bilder).toHaveLength(1);
    expect(snapshot.bilder[0].ausschnitte).toEqual({ ebay: { x: 10 } });
    expect(snapshot.profile).toEqual([{ id: 'ebay' }]);
  });
});

describe('Veraltetes asynchrones Bildergebnis', () => {
  const vorher: TestBild[] = [
    { id: 'bild-1', datenUrl: 'blob:aktuell', ausschnitte: {}, drehung: 1 },
  ];

  it('ersetzt genau die noch aktuelle URL und meldet sie zur Freigabe', () => {
    const ergebnis = ersetzeWennAktuell(vorher, 'bild-1', 'blob:aktuell', (bild) => ({
      ...bild,
      datenUrl: 'blob:neu',
      drehung: 2,
    }));

    expect(ergebnis.uebernommen).toBe(true);
    expect(ergebnis.ersetzteUrl).toBe('blob:aktuell');
    expect(ergebnis.liste[0]).toMatchObject({ datenUrl: 'blob:neu', drehung: 2 });
  });

  it('verwirft das Ergebnis, wenn das Bild inzwischen entfernt wurde', () => {
    const ergebnis = ersetzeWennAktuell([], 'bild-1', 'blob:aktuell', (bild: TestBild) => bild);

    expect(ergebnis).toEqual({ liste: [], ersetzteUrl: null, uebernommen: false });
  });

  it('verwirft das Ergebnis, wenn bereits eine neuere URL eingetragen ist', () => {
    const ergebnis = ersetzeWennAktuell(vorher, 'bild-1', 'blob:veraltet', (bild) => ({
      ...bild,
      datenUrl: 'blob:falsch',
    }));

    expect(ergebnis.uebernommen).toBe(false);
    expect(ergebnis.ersetzteUrl).toBeNull();
    expect(ergebnis.liste).toBe(vorher);
  });
});
