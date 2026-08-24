import { Rechteck } from '../models/plattform-profile';

/**
 * Das groesste Rechteck mit dem gewuenschten Verhaeltnis, das mittig in den
 * Ausschnitt passt.
 *
 * Der Kern des Werkzeugs: Jede Plattformfassung ist damit ein **Teil** dessen,
 * was der Nutzer gerade sieht. Es kommt nie Bildinhalt hinzu, den er nicht
 * geprueft hat - und es entstehen nie Raender, die eBay ohnehin verbietet.
 */
export function leiteAb(ausschnitt: Rechteck, verhaeltnis: number): Rechteck {
  const eigenes = ausschnitt.breite / ausschnitt.hoehe;

  const breite = eigenes > verhaeltnis ? ausschnitt.hoehe * verhaeltnis : ausschnitt.breite;
  const hoehe = eigenes > verhaeltnis ? ausschnitt.hoehe : ausschnitt.breite / verhaeltnis;

  return {
    x: ausschnitt.x + (ausschnitt.breite - breite) / 2,
    y: ausschnitt.y + (ausschnitt.hoehe - hoehe) / 2,
    breite,
    hoehe,
  };
}

/** Ob der Ausschnitt genug Pixel fuer die Zielgroesse mitbringt. */
export function reichtAufloesung(
  ausschnitt: Rechteck,
  zielBreite: number,
  zielHoehe: number,
): boolean {
  return ausschnitt.breite >= zielBreite && ausschnitt.hoehe >= zielHoehe;
}

/** Um welchen Faktor der Ausschnitt hochgerechnet wird. Ueber 1 heisst: unschaerfer. */
export function vergroesserungsfaktor(ausschnitt: Rechteck, zielBreite: number): number {
  return zielBreite / ausschnitt.breite;
}
