interface WithCrops {
  readonly crops: object;
}

interface IdentifiedImage {
  readonly id: string;
  readonly dataUrl: string;
}

/** Kopiert den fuer einen Export relevanten Zustand an genau einem Zeitpunkt. */
export function createExportSnapshot<TImage extends WithCrops, TProfile>(
  images: readonly TImage[],
  profile: readonly TProfile[],
): { images: TImage[]; profile: TProfile[] } {
  return {
    images: images.map((image) => ({
      ...image,
      crops: { ...image.crops },
    })),
    profile: [...profile],
  };
}

/**
 * Uebernimmt ein asynchrones Ergebnis nur, solange exakt seine Ausgangs-URL
 * noch aktuell ist. So kann der Aufrufer unbenutzte Ergebnis-URLs freigeben.
 */
export function replaceIfCurrent<TImage extends IdentifiedImage>(
  list: TImage[],
  id: string,
  expectedUrl: string,
  update: (image: TImage) => TImage,
): { list: TImage[]; replacedUrl: string | null; applied: boolean } {
  const index = list.findIndex((image) => image.id === id && image.dataUrl === expectedUrl);
  if (index === -1) {
    return { list, replacedUrl: null, applied: false };
  }

  const updated = [...list];
  updated[index] = update(list[index]);
  return { list: updated, replacedUrl: expectedUrl, applied: true };
}
