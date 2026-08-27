interface WithCrops {
  readonly crops: object;
}

interface IdentifiedImage {
  readonly id: string;
  readonly dataUrl: string;
}

/** Kopiert den fuer einen Export relevanten Zustand an genau einem Zeitpunkt. */
export function createExportSnapshot<TBild extends WithCrops, TProfil>(
  bilder: readonly TBild[],
  profile: readonly TProfil[],
): { bilder: TBild[]; profile: TProfil[] } {
  return {
    bilder: bilder.map((bild) => ({
      ...bild,
      crops: { ...bild.crops },
    })),
    profile: [...profile],
  };
}

/**
 * Uebernimmt ein asynchrones Ergebnis nur, solange exakt seine Ausgangs-URL
 * noch aktuell ist. So kann der Aufrufer unbenutzte Ergebnis-URLs freigeben.
 */
export function replaceIfCurrent<TBild extends IdentifiedImage>(
  list: TBild[],
  id: string,
  erwarteteUrl: string,
  aktualisiere: (bild: TBild) => TBild,
): { list: TBild[]; replacedUrl: string | null; applied: boolean } {
  const index = list.findIndex((bild) => bild.id === id && bild.dataUrl === erwarteteUrl);
  if (index === -1) {
    return { list, replacedUrl: null, applied: false };
  }

  const neu = [...list];
  neu[index] = aktualisiere(list[index]);
  return { list: neu, replacedUrl: erwarteteUrl, applied: true };
}
