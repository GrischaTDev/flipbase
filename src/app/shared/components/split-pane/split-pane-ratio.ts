/**
 * Das Rechnen hinter dem verschiebbaren Trenner, ohne DOM.
 *
 * Alles, was der Griff tut, laesst sich als Zahl ausdruecken - Grenzen,
 * Zeigerposition, Tastendruck, gemerkter Wert. Getrennt gehalten, damit es
 * ohne Browser pruefbar bleibt und die Komponente nur noch Ereignisse
 * entgegennimmt.
 */

const STEP = 2;
const BIG_STEP = 10;

/**
 * Haelt einen Wert zwischen den Grenzen.
 *
 * `NaN` faellt auf die Mitte zurueck: Es entsteht aus einer kaputten Zahl im
 * Speicher, und ungefiltert wuerde daraus eine Gitterbreite von "NaN%" - die
 * Seite waere unbedienbar.
 */
export function clampRatio(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return (min + max) / 2;

  return Math.min(max, Math.max(min, value));
}

/**
 * Wo der Zeiger steht, als Anteil der linken Spalte.
 *
 * `left` und `width` statt eines `DOMRect`: Mehr braucht die Rechnung nicht,
 * und `DOMRect` gibt es im Test ohne Browser nicht.
 */
export function ratioFromPointer(
  pointerX: number,
  left: number,
  width: number,
  min: number,
  max: number,
): number {
  if (width <= 0) return (min + max) / 2;

  return clampRatio(Math.round(((pointerX - left) / width) * 100), min, max);
}

/**
 * Das neue Verhaeltnis nach einem Tastendruck, oder `null`, wenn diese Taste
 * den Trenner nichts angeht.
 *
 * `null` ist wichtig: Die Komponente darf nur die Tasten verschlucken, die
 * sie wirklich behandelt. Wuerde sie jedes Ereignis abfangen, kaeme man mit
 * Tab nicht mehr aus dem Griff heraus.
 */
export function ratioFromKey(
  key: string,
  current: number,
  shift: boolean,
  min: number,
  max: number,
): number | null {
  const step = shift ? BIG_STEP : STEP;

  if (key === 'ArrowLeft') return clampRatio(current - step, min, max);
  if (key === 'ArrowRight') return clampRatio(current + step, min, max);
  if (key === 'Home') return min;
  if (key === 'End') return max;

  return null;
}

/** Der gemerkte Wert, oder `null`, wenn nichts Brauchbares gespeichert war. */
export function readStoredRatio(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;

  // Die Grenzen koennen sich geaendert haben, seit gespeichert wurde.
  return clampRatio(value, min, max);
}
