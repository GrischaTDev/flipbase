export function allocatePackagePrice(
  total: number,
  lineIds: readonly string[],
): ReadonlyMap<string, number> {
  if (!Number.isFinite(total) || total < 0) {
    throw new Error('Der Paketpreis muss eine gültige, nicht negative Zahl sein.');
  }
  if (lineIds.length === 0) {
    throw new Error('Für die Verteilung wird mindestens eine Produktposition benötigt.');
  }
  if (lineIds.some((lineId) => lineId.trim().length === 0)) {
    throw new Error('Produktpositionen benötigen eine eindeutige Kennung.');
  }
  if (new Set(lineIds).size !== lineIds.length) {
    throw new Error('Produktpositionen dürfen nicht doppelt vorkommen.');
  }

  const totalCents = Math.round(total * 100);
  const baseShare = Math.floor(totalCents / lineIds.length);
  const remainder = totalCents % lineIds.length;

  return new Map(
    lineIds.map((lineId, index) => [lineId, (baseShare + (index < remainder ? 1 : 0)) / 100]),
  );
}
