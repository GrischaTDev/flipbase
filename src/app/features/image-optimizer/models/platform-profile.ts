/** Ein Rechteck in Pixeln des Originalbildes. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Breite und Hoehe eines Bildes in Pixeln, ohne Position. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

export type PlatformId = 'ebay' | 'kleinanzeigen' | 'vinted';

/**
 * Beschreibt, was eine Verkaufsplattform mit einem Foto macht.
 *
 * `herkunft` sagt, worauf die Zahlen beruhen: "offiziell" steht in der Hilfe
 * der Plattform, "gemessen" wurde an der echten Trefferliste ausgelesen.
 * Diese Unterscheidung ist wichtiger als sie aussieht - sie verhindert, dass
 * jemand spaeter eine geraten wirkende Zahl fuer eine Zusage haelt.
 */
export interface PlatformProfile {
  readonly id: PlatformId;
  readonly name: string;
  /** Breite geteilt durch Hoehe. */
  readonly exportRatio: number;
  readonly exportWidth: number;
  readonly exportHeight: number;
  /** Offizielle Mindestmasse, oder null wenn die Plattform keine nennt. */
  readonly minWidth: number | null;
  readonly minHeight: number | null;
  /** Grenze der Plattform in MB, oder null wenn keine bekannt ist. */
  readonly maxFileSizeMB: number | null;
  /** Verhaeltnis der Kachel in der Trefferliste. */
  readonly tileRatio: number;
  /**
   * Ob die Trefferliste das Bild beschneidet (`cover`) oder einpasst
   * (`contain`). Nur schneidende Plattformen begrenzen die Safe-Area.
   */
  readonly crops: boolean;
  /** Wie die Vorschau aussieht: Zeile mit Bild links, oder Kachel im Raster. */
  readonly previewKind: 'zeile' | 'kachel';
  readonly source: 'offiziell' | 'gemessen';
  /** Nur bei gemessenen Werten gesetzt. */
  readonly measuredAt?: string;
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
export const PLATFORM_PROFILES: readonly PlatformProfile[] = [
  {
    id: 'ebay',
    name: 'eBay',
    exportRatio: 1,
    exportWidth: 1600,
    exportHeight: 1600,
    minWidth: 500,
    minHeight: 500,
    maxFileSizeMB: 12,
    tileRatio: 1,
    // eBay passt das Bild in die quadratische Kachel ein, statt zu schneiden.
    // Das Quadrat sorgt nur dafuer, dass die Kachel gefuellt wird und das
    // Produkt neben quadratischen Konkurrenzbildern nicht schrumpft.
    crops: false,
    previewKind: 'kachel',
    source: 'offiziell',
  },
  {
    id: 'kleinanzeigen',
    name: 'Kleinanzeigen',
    exportRatio: 4 / 3,
    exportWidth: 1600,
    exportHeight: 1200,
    minWidth: null,
    minHeight: null,
    maxFileSizeMB: 12,
    tileRatio: 4 / 3,
    crops: true,
    previewKind: 'zeile',
    source: 'gemessen',
    measuredAt: '2026-08-23',
  },
  {
    id: 'vinted',
    name: 'Vinted',
    exportRatio: 2 / 3,
    exportWidth: 1200,
    exportHeight: 1800,
    minWidth: null,
    minHeight: null,
    // Vinted nennt keine Grenze; es wird nur auf Qualitaet komprimiert.
    maxFileSizeMB: null,
    tileRatio: 2 / 3,
    crops: true,
    previewKind: 'kachel',
    source: 'gemessen',
    measuredAt: '2026-08-23',
  },
];

/** Das Seitenverhaeltnis als kurzer Text fuer die Oberflaeche. */
export function ratioLabel(platform: PlatformProfile): string {
  if (platform.exportRatio === 1) return '1:1';
  return platform.exportRatio < 1 ? '2:3' : '4:3';
}

/** Ob eine fertige Ausgabe die bekannten Mindestmasse der Plattform einhaelt. */
export function meetsMinimumSize(size: Size, platform: PlatformProfile): boolean {
  if (platform.minWidth === null || platform.minHeight === null) return true;
  return size.width >= platform.minWidth && size.height >= platform.minHeight;
}

/** Holt ein Profil. Wirft, wenn die Kennung unbekannt ist. */
export function platformById(id: PlatformId): PlatformProfile {
  const found = PLATFORM_PROFILES.find((p) => p.id === id);
  if (!found) throw new Error(`Unbekanntes Plattformprofil: ${id}`);
  return found;
}
