import { Rect } from '../models/platform-profile';

/**
 * Das groesste Rechteck mit dem gewuenschten Verhaeltnis, das mittig in den
 * Ausschnitt passt.
 *
 * Der Kern des Werkzeugs: Jede Plattformfassung ist damit ein **Teil** dessen,
 * was der Nutzer gerade sieht. Es kommt nie Bildinhalt hinzu, den er nicht
 * geprueft hat - und es entstehen nie Raender, die eBay ohnehin verbietet.
 */
export function deriveRect(rect: Rect, ratio: number): Rect {
  const eigenes = rect.width / rect.height;

  const breite = eigenes > ratio ? rect.height * ratio : rect.width;
  const hoehe = eigenes > ratio ? rect.height : rect.width / ratio;

  return {
    x: rect.x + (rect.width - breite) / 2,
    y: rect.y + (rect.height - hoehe) / 2,
    width: breite,
    height: hoehe,
  };
}

/** Ob der Ausschnitt genug Pixel fuer die Zielgroesse mitbringt. */
export function hasEnoughResolution(rect: Rect, zielBreite: number, zielHoehe: number): boolean {
  return rect.width >= zielBreite && rect.height >= zielHoehe;
}

/** Um welchen Faktor der Ausschnitt hochgerechnet wird. Ueber 1 heisst: unschaerfer. */
export function upscaleFactor(rect: Rect, zielBreite: number): number {
  return zielBreite / rect.width;
}
