interface MitAusschnitten {
  readonly ausschnitte: object;
}

interface IdentifiziertesBild {
  readonly id: string;
  readonly datenUrl: string;
}

/** Kopiert den fuer einen Export relevanten Zustand an genau einem Zeitpunkt. */
export function erstelleExportSnapshot<TBild extends MitAusschnitten, TProfil>(
  bilder: readonly TBild[],
  profile: readonly TProfil[],
): { bilder: TBild[]; profile: TProfil[] } {
  return {
    bilder: bilder.map((bild) => ({
      ...bild,
      ausschnitte: { ...bild.ausschnitte },
    })),
    profile: [...profile],
  };
}

/**
 * Uebernimmt ein asynchrones Ergebnis nur, solange exakt seine Ausgangs-URL
 * noch aktuell ist. So kann der Aufrufer unbenutzte Ergebnis-URLs freigeben.
 */
export function ersetzeWennAktuell<TBild extends IdentifiziertesBild>(
  liste: TBild[],
  id: string,
  erwarteteUrl: string,
  aktualisiere: (bild: TBild) => TBild,
): { liste: TBild[]; ersetzteUrl: string | null; uebernommen: boolean } {
  const index = liste.findIndex((bild) => bild.id === id && bild.datenUrl === erwarteteUrl);
  if (index === -1) {
    return { liste, ersetzteUrl: null, uebernommen: false };
  }

  const neu = [...liste];
  neu[index] = aktualisiere(liste[index]);
  return { liste: neu, ersetzteUrl: erwarteteUrl, uebernommen: true };
}
