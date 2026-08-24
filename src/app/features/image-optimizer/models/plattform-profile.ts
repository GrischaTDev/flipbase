/** Ein Rechteck in Pixeln des Originalbildes. */
export interface Rechteck {
  readonly x: number;
  readonly y: number;
  readonly breite: number;
  readonly hoehe: number;
}

/** Breite und Hoehe eines Bildes in Pixeln, ohne Position. */
export interface Groesse {
  readonly breite: number;
  readonly hoehe: number;
}

export type ProfilId = 'ebay' | 'kleinanzeigen' | 'vinted';

/**
 * Beschreibt, was eine Verkaufsplattform mit einem Foto macht.
 *
 * `herkunft` sagt, worauf die Zahlen beruhen: "offiziell" steht in der Hilfe
 * der Plattform, "gemessen" wurde an der echten Trefferliste ausgelesen.
 * Diese Unterscheidung ist wichtiger als sie aussieht - sie verhindert, dass
 * jemand spaeter eine geraten wirkende Zahl fuer eine Zusage haelt.
 */
export interface PlattformProfil {
  readonly id: ProfilId;
  readonly name: string;
  /** Breite geteilt durch Hoehe. */
  readonly exportVerhaeltnis: number;
  readonly exportBreite: number;
  readonly exportHoehe: number;
  /** Offizielle Mindestmasse, oder null wenn die Plattform keine nennt. */
  readonly minBreite: number | null;
  readonly minHoehe: number | null;
  /** Grenze der Plattform in MB, oder null wenn keine bekannt ist. */
  readonly maxDateigroesseMB: number | null;
  /** Verhaeltnis der Kachel in der Trefferliste. */
  readonly kachelVerhaeltnis: number;
  /**
   * Ob die Trefferliste das Bild beschneidet (`cover`) oder einpasst
   * (`contain`). Nur schneidende Plattformen begrenzen die Safe-Area.
   */
  readonly schneidet: boolean;
  /** Wie die Vorschau aussieht: Zeile mit Bild links, oder Kachel im Raster. */
  readonly vorschauArt: 'zeile' | 'kachel';
  readonly herkunft: 'offiziell' | 'gemessen';
  /** Nur bei gemessenen Werten gesetzt. */
  readonly gemessenAm?: string;
}

/**
 * Gemessen am 23.08.2026 an den echten Trefferlisten, Schreibtisch-Ansicht
 * bei 1280 px Fensterbreite:
 *
 *   eBay          289 x 289  contain  -> schneidet nicht
 *   Kleinanzeigen 200 x 150  cover    -> schneidet, 4:3 quer
 *   Vinted        216 x 325  cover    -> schneidet, 2:3 hochkant
 *
 * Die Mobil-Apps wurden nicht gemessen und koennen abweichen.
 */
export const PLATTFORM_PROFILE: readonly PlattformProfil[] = [
  {
    id: 'ebay',
    name: 'eBay',
    exportVerhaeltnis: 1,
    exportBreite: 1600,
    exportHoehe: 1600,
    minBreite: 500,
    minHoehe: 500,
    maxDateigroesseMB: 12,
    kachelVerhaeltnis: 1,
    // eBay passt das Bild in die quadratische Kachel ein, statt zu schneiden.
    // Das Quadrat sorgt nur dafuer, dass die Kachel gefuellt wird und das
    // Produkt neben quadratischen Konkurrenzbildern nicht schrumpft.
    schneidet: false,
    vorschauArt: 'kachel',
    herkunft: 'offiziell',
  },
  {
    id: 'kleinanzeigen',
    name: 'Kleinanzeigen',
    exportVerhaeltnis: 4 / 3,
    exportBreite: 1600,
    exportHoehe: 1200,
    minBreite: null,
    minHoehe: null,
    maxDateigroesseMB: 12,
    kachelVerhaeltnis: 4 / 3,
    schneidet: true,
    vorschauArt: 'zeile',
    herkunft: 'gemessen',
    gemessenAm: '2026-08-23',
  },
  {
    id: 'vinted',
    name: 'Vinted',
    exportVerhaeltnis: 2 / 3,
    exportBreite: 1200,
    exportHoehe: 1800,
    minBreite: null,
    minHoehe: null,
    // Vinted nennt keine Grenze; es wird nur auf Qualitaet komprimiert.
    maxDateigroesseMB: null,
    kachelVerhaeltnis: 2 / 3,
    schneidet: true,
    vorschauArt: 'kachel',
    herkunft: 'gemessen',
    gemessenAm: '2026-08-23',
  },
];

/** Ob eine fertige Ausgabe die bekannten Mindestmasse der Plattform einhaelt. */
export function pruefeMindestgroesse(groesse: Groesse, plattform: PlattformProfil): boolean {
  if (plattform.minBreite === null || plattform.minHoehe === null) return true;
  return groesse.breite >= plattform.minBreite && groesse.hoehe >= plattform.minHoehe;
}

/** Holt ein Profil. Wirft, wenn die Kennung unbekannt ist. */
export function profil(id: ProfilId): PlattformProfil {
  const gefunden = PLATTFORM_PROFILE.find((p) => p.id === id);
  if (!gefunden) throw new Error(`Unbekanntes Plattformprofil: ${id}`);
  return gefunden;
}
