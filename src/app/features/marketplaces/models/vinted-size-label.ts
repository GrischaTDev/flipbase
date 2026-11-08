/** Buchstabengrößen wie bei Vinted: XS, S, M, L, XL, XXL, 3XL … */
const letterSize = /^(?:\d?X{0,4}[SL]|M)$/i;

/**
 * Anzeige einer gespeicherten Größe. Ältere Inserate führen kombinierte Angaben wie
 * „M / 38 / 10“; Vinted zeigt dieselbe Größe heute als „M“. Mit genau einer enthaltenen
 * Buchstabengröße wird diese angezeigt, sonst bleibt die Angabe unverändert.
 */
export function vintedSizeDisplayLabel(label: string | null): string | null {
  if (!label || !label.includes('/')) return label;
  const letters = label
    .split('/')
    .map((part) => part.trim())
    .filter((part) => letterSize.test(part));
  return letters.length === 1 ? letters[0]!.toUpperCase() : label;
}
