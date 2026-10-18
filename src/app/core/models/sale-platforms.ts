import { SALE_PLATFORM_OPTIONS } from '../config/sale-platform-options';
import { marketplacePlatformLabel } from '../../shared/models/marketplace-platform';

export interface SalePlatform {
  readonly value: string;
  readonly label: string;
}

export function parseSalePlatforms(value: unknown): SalePlatform[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is SalePlatform =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.value === 'string' &&
        entry.value.length > 0 &&
        typeof entry.label === 'string' &&
        entry.label.trim().length > 0,
    )
    .map(({ value, label }) => ({ value, label }));
}

/** Gespeicherte Reihenfolge zuerst; historische Kennungen bleiben exakt erhalten. */
export function mergeSalePlatforms(
  saved: readonly SalePlatform[],
  historical: readonly string[],
): SalePlatform[] {
  const entries = new Map<string, SalePlatform>();
  const names = new Set<string>();
  const nameKey = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase('de-DE');
  for (const entry of [
    ...saved,
    ...SALE_PLATFORM_OPTIONS,
    ...historical
      .filter(Boolean)
      .map((value) => ({ value, label: marketplacePlatformLabel(value) })),
  ]) {
    if (entries.has(entry.value)) continue;
    let label = entry.label;
    let suffix = 1;
    while (names.has(nameKey(label))) {
      label = `${entry.label.slice(0, 95)} (Altbestand ${suffix++})`;
    }
    names.add(nameKey(label));
    entries.set(entry.value, { value: entry.value, label });
  }
  return [...entries.values()];
}

export function validateSalePlatformName(
  name: string,
  entries: readonly SalePlatform[],
  editedValue?: string,
): string | null {
  const key = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('de-DE');
  if (!key(name)) return 'Bitte einen Namen eingeben.';
  if (name.trim().length > 120) return 'Der Name darf höchstens 120 Zeichen lang sein.';
  return entries.some((entry) => entry.value !== editedValue && key(entry.label) === key(name))
    ? 'Diese Verkaufsplattform existiert bereits.'
    : null;
}
