import { describe, expect, it } from 'vitest';
import { createExportSnapshot, replaceIfCurrent } from './async-state';

interface TestBild {
  readonly id: string;
  readonly dataUrl: string;
  readonly crops: Record<string, { x: number }>;
  readonly drehung: number;
}

describe('Export-Snapshot', () => {
  it('bleibt von spaeteren Listen- und Zuschnittsmutationen getrennt', () => {
    const bilder: TestBild[] = [
      {
        id: 'bild-1',
        dataUrl: 'blob:alt',
        crops: { ebay: { x: 10 } },
        drehung: 0,
      },
    ];
    const profile = [{ id: 'ebay' }];

    const snapshot = createExportSnapshot(bilder, profile);
    bilder.push({ id: 'bild-2', dataUrl: 'blob:neu', crops: {}, drehung: 0 });
    bilder[0].crops['ebay'] = { x: 99 };
    profile[0] = { id: 'vinted' };

    expect(snapshot.bilder).toHaveLength(1);
    expect(snapshot.bilder[0].crops).toEqual({ ebay: { x: 10 } });
    expect(snapshot.profile).toEqual([{ id: 'ebay' }]);
  });
});

describe('Veraltetes asynchrones Bildergebnis', () => {
  const vorher: TestBild[] = [{ id: 'bild-1', dataUrl: 'blob:aktuell', crops: {}, drehung: 1 }];

  it('ersetzt genau die noch aktuelle URL und meldet sie zur Freigabe', () => {
    const ergebnis = replaceIfCurrent(vorher, 'bild-1', 'blob:aktuell', (bild) => ({
      ...bild,
      dataUrl: 'blob:neu',
      drehung: 2,
    }));

    expect(ergebnis.applied).toBe(true);
    expect(ergebnis.replacedUrl).toBe('blob:aktuell');
    expect(ergebnis.list[0]).toMatchObject({ dataUrl: 'blob:neu', drehung: 2 });
  });

  it('verwirft das Ergebnis, wenn das Bild inzwischen entfernt wurde', () => {
    const ergebnis = replaceIfCurrent([], 'bild-1', 'blob:aktuell', (bild: TestBild) => bild);

    expect(ergebnis).toEqual({ list: [], replacedUrl: null, applied: false });
  });

  it('verwirft das Ergebnis, wenn bereits eine neuere URL eingetragen ist', () => {
    const ergebnis = replaceIfCurrent(vorher, 'bild-1', 'blob:veraltet', (bild) => ({
      ...bild,
      dataUrl: 'blob:falsch',
    }));

    expect(ergebnis.applied).toBe(false);
    expect(ergebnis.replacedUrl).toBeNull();
    expect(ergebnis.list).toBe(vorher);
  });
});
