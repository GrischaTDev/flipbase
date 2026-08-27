import { describe, expect, it } from 'vitest';
import { createExportSnapshot, replaceIfCurrent } from './async-state';

interface TestImage {
  readonly id: string;
  readonly dataUrl: string;
  readonly crops: Record<string, { x: number }>;
  readonly rotation: number;
}

describe('Export-Snapshot', () => {
  it('bleibt von spaeteren Listen- und Zuschnittsmutationen getrennt', () => {
    const images: TestImage[] = [
      {
        id: 'bild-1',
        dataUrl: 'blob:alt',
        crops: { ebay: { x: 10 } },
        rotation: 0,
      },
    ];
    const profile = [{ id: 'ebay' }];

    const snapshot = createExportSnapshot(images, profile);
    images.push({ id: 'bild-2', dataUrl: 'blob:neu', crops: {}, rotation: 0 });
    images[0].crops['ebay'] = { x: 99 };
    profile[0] = { id: 'vinted' };

    expect(snapshot.images).toHaveLength(1);
    expect(snapshot.images[0].crops).toEqual({ ebay: { x: 10 } });
    expect(snapshot.profile).toEqual([{ id: 'ebay' }]);
  });
});

describe('Veraltetes asynchrones Bildergebnis', () => {
  const before: TestImage[] = [{ id: 'bild-1', dataUrl: 'blob:aktuell', crops: {}, rotation: 1 }];

  it('ersetzt genau die noch aktuelle URL und meldet sie zur Freigabe', () => {
    const result = replaceIfCurrent(before, 'bild-1', 'blob:aktuell', (image) => ({
      ...image,
      dataUrl: 'blob:neu',
      rotation: 2,
    }));

    expect(result.applied).toBe(true);
    expect(result.replacedUrl).toBe('blob:aktuell');
    expect(result.list[0]).toMatchObject({ dataUrl: 'blob:neu', rotation: 2 });
  });

  it('verwirft das Ergebnis, wenn das Bild inzwischen entfernt wurde', () => {
    const result = replaceIfCurrent([], 'bild-1', 'blob:aktuell', (image: TestImage) => image);

    expect(result).toEqual({ list: [], replacedUrl: null, applied: false });
  });

  it('verwirft das Ergebnis, wenn bereits eine neuere URL eingetragen ist', () => {
    const result = replaceIfCurrent(before, 'bild-1', 'blob:veraltet', (image) => ({
      ...image,
      dataUrl: 'blob:falsch',
    }));

    expect(result.applied).toBe(false);
    expect(result.replacedUrl).toBeNull();
    expect(result.list).toBe(before);
  });
});
