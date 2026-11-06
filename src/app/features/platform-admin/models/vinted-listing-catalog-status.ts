/** Stand des lokalen Vinted-Katalogs für die Administration. */
export interface VintedListingCatalogStatus {
  readonly categories: number;
  readonly leaves: number;
  readonly leavesWithFields: number;
  /** Endkategorien, deren Felder fehlen, älter als sieben Tage oder älter als ein Auftrag sind. */
  readonly leavesDue: number;
  readonly treeObservedAt: string | null;
  readonly oldestFieldsObservedAt: string | null;
  readonly refreshRequestedAt: string | null;
}

const count = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Ungültiger Katalogstand');
  return value;
};
const time = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new Error('Ungültiger Katalogstand');
  return value;
};

export function parseVintedListingCatalogStatus(input: unknown): VintedListingCatalogStatus {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Ungültiger Katalogstand');
  const value = input as Record<string, unknown>;
  const status = {
    categories: count(value['categories']),
    leaves: count(value['leaves']),
    leavesWithFields: count(value['leavesWithFields']),
    leavesDue: count(value['leavesDue']),
    treeObservedAt: time(value['treeObservedAt']),
    oldestFieldsObservedAt: time(value['oldestFieldsObservedAt']),
    refreshRequestedAt: time(value['refreshRequestedAt']),
  };
  if (status.leaves > status.categories || status.leavesWithFields > status.leaves)
    throw new Error('Ungültiger Katalogstand');
  return status;
}

/** Anteil aktueller Endkategorien in Prozent (0–100). */
export function vintedListingCatalogCurrentPercent(status: VintedListingCatalogStatus): number {
  if (!status.leaves) return 0;
  return Math.round(
    ((status.leaves - Math.min(status.leavesDue, status.leaves)) / status.leaves) * 100,
  );
}
