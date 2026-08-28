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
};

/** Grenzen und Standardwert eines Reglers - auch von der Oberflaeche genutzt. */
export function adjustmentRange(key: keyof Adjustments): AdjustmentRange {
  return RANGES[key];
}

export function defaultAdjustments(): Adjustments {
  return { brightness: 1, contrast: 1, saturation: 1, grayscale: 0 };
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
  };
}

export function isDefault(values: Adjustments): boolean {
  const standard = defaultAdjustments();
  return (
    values.brightness === standard.brightness &&
    values.contrast === standard.contrast &&
    values.saturation === standard.saturation &&
    values.grayscale === standard.grayscale
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
  if (isDefault(safe)) return '';

  return [
    `brightness(${safe.brightness})`,
    `contrast(${safe.contrast})`,
    `saturate(${safe.saturation})`,
    `grayscale(${safe.grayscale})`,
  ].join(' ');
}
