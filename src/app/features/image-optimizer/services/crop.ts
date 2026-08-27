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
  const ownRatio = rect.width / rect.height;

  const width = ownRatio > ratio ? rect.height * ratio : rect.width;
  const height = ownRatio > ratio ? rect.height : rect.width / ratio;

  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

/** Ob der Ausschnitt genug Pixel fuer die Zielgroesse mitbringt. */
export function hasEnoughResolution(
  rect: Rect,
  targetWidth: number,
  targetHeight: number,
): boolean {
  return rect.width >= targetWidth && rect.height >= targetHeight;
}

/** Um welchen Faktor der Ausschnitt hochgerechnet wird. Ueber 1 heisst: unschaerfer. */
export function upscaleFactor(rect: Rect, targetWidth: number): number {
  return targetWidth / rect.width;
}
