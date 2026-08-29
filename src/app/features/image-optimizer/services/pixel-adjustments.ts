/**
 * Bildwirkungen, die sich nicht als CSS-Filter ausdruecken lassen.
 *
 * Weissabgleich und Schaerfen brauchen eine Farbmatrix bzw. eine Faltung.
 * Beides koennte man ueber SVG-Filter an die Zeichenflaeche haengen
 * (`ctx.filter = 'url(#…)'`), aber Safari unterstuetzt genau das nicht - auf
 * dem iPhone waere stillschweigend nichts passiert. Deshalb rechnen wir
 * direkt auf den Pixeln: ueberall gleich, pruefbar ohne Zeichenflaeche.
 *
 * Beide Funktionen aendern das uebergebene Feld **an Ort und Stelle**. Ein
 * Export in voller Groesse sind schnell zehn Megabyte - eine Kopie je Schritt
 * waere reine Verschwendung.
 *
 * Beide fassen ausserdem nur **voll deckende** Pixel an. Hinter durchsichtigen
 * Stellen liegen oft schwarze Farbwerte, die man nur wegen Alpha 0 nicht
 * sieht; wuerden sie mitgerechnet, bekaeme jede freigestellte Kante einen
 * dunklen Saum, und der weisse Grund unter dem Bild einen Farbstich.
 */

/** Wie stark Rot und Blau bei vollem Ausschlag auseinandergezogen werden. */
const WARMTH_GAIN = 0.25;

/** Anteil der Kantenverstaerkung bei vollem Ausschlag. */
const SHARPEN_GAIN = 1.5;

/**
 * Verschiebt den Weisspunkt. Positive Werte machen das Bild waermer, negative
 * kuehler. Gruen bleibt unangetastet - es traegt den groessten Teil der
 * Helligkeit, und eine Aenderung dort saehe nach Fehlfarbe aus statt nach
 * Tageslicht.
 */
export function applyWarmth(data: Uint8ClampedArray, warmth: number): void {
  if (!Number.isFinite(warmth) || warmth === 0) return;

  const red = 1 + WARMTH_GAIN * warmth;
  const blue = 1 - WARMTH_GAIN * warmth;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 255) continue;
    data[i] = data[i] * red;
    data[i + 2] = data[i + 2] * blue;
  }
}

/**
 * Unscharfe Maske: Das Bild wird weichgezeichnet, und die Differenz zwischen
 * Original und Weichzeichnung wird verstaerkt wieder aufaddiert. Flaechen
 * ohne Struktur bleiben dadurch unveraendert, nur Kanten treten hervor.
 *
 * Am Bildrand wird der aeusserste Pixel wiederholt statt in leeren Speicher zu
 * greifen.
 */
export function applySharpening(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (width < 1 || height < 1) return;

  // Gauss 3x3, Summe 16.
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const strength = SHARPEN_GAIN * amount;
  const original = Uint8ClampedArray.from(data);

  const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      if (original[target + 3] !== 255) continue;

      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        let weight = 0;
        let k = 0;

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = clamp(x + dx, width - 1);
            const ny = clamp(y + dy, height - 1);
            const neighbour = (ny * width + nx) * 4;

            // Durchsichtige Nachbarn zaehlen nicht mit. Ihr Gewicht faellt
            // aus der Summe, damit die Kante nicht zur Haelfte gegen Schwarz
            // gerechnet wird.
            if (original[neighbour + 3] === 255) {
              sum += original[neighbour + channel] * kernel[k];
              weight += kernel[k];
            }
            k += 1;
          }
        }

        if (weight === 0) continue;
        const blurred = sum / weight;
        const value = original[target + channel];
        data[target + channel] = value + (value - blurred) * strength;
      }
    }
  }
}
