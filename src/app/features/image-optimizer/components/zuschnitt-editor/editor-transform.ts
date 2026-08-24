import { Rechteck } from '../../models/plattform-profile';

/** Hält den Zoom im bewusst kleinen, gut kontrollierbaren Arbeitsbereich. */
export function begrenzeZoom(wert: number): number {
  return Math.min(3, Math.max(1, wert));
}

interface Dimensionen {
  readonly width: number;
  readonly height: number;
}

/** Rechnet Originalpixel erst um, wenn der Cropper wirklich messbar ist. */
export function skaliereAusschnitt(
  ausschnitt: Rechteck,
  original: Dimensionen,
  angezeigt: Dimensionen,
): { x1: number; y1: number; x2: number; y2: number } | undefined {
  if (
    original.width <= 0 ||
    original.height <= 0 ||
    angezeigt.width <= 0 ||
    angezeigt.height <= 0
  ) {
    return undefined;
  }

  const breite = angezeigt.width / original.width;
  const hoehe = angezeigt.height / original.height;
  return {
    x1: ausschnitt.x * breite,
    y1: ausschnitt.y * hoehe,
    x2: (ausschnitt.x + ausschnitt.breite) * breite,
    y2: (ausschnitt.y + ausschnitt.hoehe) * hoehe,
  };
}
