import { Adjustments } from '../models/image-adjustments';

export interface AdjustmentRange {
  readonly min: number;
  readonly max: number;
  readonly standard: number;
}

const RANGES: Record<keyof Adjustments, AdjustmentRange> = {
  brightness: { min: 0.5, max: 1.5, standard: 1 },
  contrast: { min: 0.5, max: 1.5, standard: 1 },
  saturation: { min: 0, max: 2, standard: 1 },
  grayscale: { min: 0, max: 1, standard: 0 },
  warmth: { min: -1, max: 1, standard: 0 },
  sharpness: { min: 0, max: 1, standard: 0 },
};

/** Grenzen und Standardwert eines Reglers - auch von der Oberflaeche genutzt. */
export function adjustmentRange(key: keyof Adjustments): AdjustmentRange {
  return RANGES[key];
}

export function defaultAdjustments(): Adjustments {
  return { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, warmth: 0, sharpness: 0 };
}

/**
 * Haelt jeden Wert in seinem Bereich. Unbrauchbare Zahlen (NaN, Unendlich)
 * fallen auf den Standard zurueck statt den Filterausdruck zu vergiften -
 * `brightness(NaN)` wuerde die Zeichenflaeche stillschweigend nichts zeichnen
 * lassen.
 */
export function clampAdjustments(values: Adjustments): Adjustments {
  const limit = (key: keyof Adjustments): number => {
    const range = RANGES[key];
    const value = values[key];
    if (!Number.isFinite(value)) return range.standard;
    return Math.min(range.max, Math.max(range.min, value));
  };

  return {
    brightness: limit('brightness'),
    contrast: limit('contrast'),
    saturation: limit('saturation'),
    grayscale: limit('grayscale'),
    warmth: limit('warmth'),
    sharpness: limit('sharpness'),
  };
}

export function isDefault(values: Adjustments): boolean {
  const standard = defaultAdjustments();
  return (
    values.brightness === standard.brightness &&
    values.contrast === standard.contrast &&
    values.saturation === standard.saturation &&
    values.grayscale === standard.grayscale &&
    values.warmth === standard.warmth &&
    values.sharpness === standard.sharpness
  );
}

/**
 * Der Filterausdruck fuer die Zeichenflaeche.
 *
 * Bei neutralen Werten bewusst eine **leere Zeichenkette**: Dann wird gar kein
 * Filter gesetzt. Ein gesetzter Filter kostet Rechenzeit und kann die Ausgabe
 * minimal veraendern, auch wenn er rechnerisch nichts tut - und genau das
 * wuerde die Zusicherung brechen, dass Zuruecksetzen wieder exakt dieselbe
 * Datei erzeugt.
 */
export function toFilterString(values: Adjustments): string {
  const safe = clampAdjustments(values);
  const standard = defaultAdjustments();
  const cssIsNeutral =
    safe.brightness === standard.brightness &&
    safe.contrast === standard.contrast &&
    safe.saturation === standard.saturation &&
    safe.grayscale === standard.grayscale;
  if (cssIsNeutral) return '';

  return [
    `brightness(${safe.brightness})`,
    `contrast(${safe.contrast})`,
    `saturate(${safe.saturation})`,
    `grayscale(${safe.grayscale})`,
  ].join(' ');
}

/**
 * Die vollstaendige Bildwirkung eines Bildes: was der Browser als CSS-Filter
 * erledigt, und was auf den Pixeln gerechnet werden muss.
 *
 * Beides zusammen in **einem** Objekt, weil Vorschau und Export denselben Weg
 * nehmen. Zwei getrennte Wege waeren zwei Gelegenheiten, auseinanderzulaufen.
 */
export interface Look {
  /** CSS-Filterausdruck; leer, wenn dort nichts zu tun ist. */
  readonly filter: string;
  /** -1 bis 1, 0 = neutral. */
  readonly warmth: number;
  /** 0 bis 1, 0 = neutral. */
  readonly sharpness: number;
}

export function toLook(values: Adjustments): Look {
  const safe = clampAdjustments(values);
  return {
    filter: toFilterString(safe),
    warmth: safe.warmth,
    sharpness: safe.sharpness,
  };
}

/**
 * Vergleich nach Werten. Die Vorschau haengt an einem Signal; ohne diesen
 * Vergleich wuerde jedes neu gebaute Objekt einen vollen Renderdurchlauf
 * ausloesen, auch wenn sich kein Wert geaendert hat.
 */
export function looksEqual(a: Look, b: Look): boolean {
  return a.filter === b.filter && a.warmth === b.warmth && a.sharpness === b.sharpness;
}
