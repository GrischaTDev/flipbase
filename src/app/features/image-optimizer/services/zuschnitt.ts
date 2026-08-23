import { PlattformProfil, Rechteck } from '../models/plattform-profile';

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

/** Der gemeinsame Bereich mehrerer Rechtecke, oder null wenn es keinen gibt. */
export function schnittmenge(rechtecke: Rechteck[]): Rechteck | null {
  if (rechtecke.length === 0) return null;

  const links = Math.max(...rechtecke.map((r) => r.x));
  const oben = Math.max(...rechtecke.map((r) => r.y));
  const rechts = Math.min(...rechtecke.map((r) => r.x + r.breite));
  const unten = Math.min(...rechtecke.map((r) => r.y + r.hoehe));

  if (rechts <= links || unten <= oben) return null;

  return { x: links, y: oben, breite: rechts - links, hoehe: unten - oben };
}

/**
 * Der Bereich, in dem das Produkt liegen muss, damit **keine** gewaehlte
 * Plattform es beim Export anschneidet.
 *
 * `schneidet` ist eine Aussage ueber die Kachel der Trefferliste (`cover`
 * vs. `contain`), nicht ueber den Export. Der Export schneidet fuer **jede**
 * Plattform unbedingt auf ihr Zielverhaeltnis zu, auch fuer eBay (1:1).
 * Deshalb darf `schneidet` diese Berechnung nicht steuern - es gehen alle
 * uebergebenen Profile ein.
 */
export function safeArea(ausschnitt: Rechteck, profile: readonly PlattformProfil[]): Rechteck {
  if (profile.length === 0) return ausschnitt;

  const abgeleitete = profile.map((p) => leiteAb(ausschnitt, p.exportVerhaeltnis));
  // Alle abgeleiteten Rechtecke teilen sich den Mittelpunkt des Ausschnitts,
  // eine Schnittmenge existiert deshalb immer.
  return schnittmenge(abgeleitete) ?? ausschnitt;
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
