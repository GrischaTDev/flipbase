/** Gerundete Anbieterangabe, getrennt von einem genauen Veröffentlichungszeitpunkt. */
export interface VintedPublicationAge {
  value: number;
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  observedAt: string;
}
export interface VintedPublicationVersion {
  externalId: string;
  occurredAt: string | null;
  publicationAge: VintedPublicationAge | null;
  checkedAt: string | null;
}

export function parseVintedPublicationAge(value: unknown): VintedPublicationAge | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const age = value as Record<string, unknown>;
  if (
    Object.keys(age).some((key) => !['value', 'unit', 'observedAt'].includes(key)) ||
    typeof age['value'] !== 'number' ||
    !Number.isSafeInteger(age['value']) ||
    age['value'] < 0 ||
    age['value'] > 10000 ||
    !['minute', 'hour', 'day', 'week', 'month', 'year'].includes(String(age['unit'])) ||
    typeof age['observedAt'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(age['observedAt']) ||
    !Number.isFinite(Date.parse(age['observedAt']))
  )
    return null;
  return {
    value: age['value'],
    unit: age['unit'] as VintedPublicationAge['unit'],
    observedAt: age['observedAt'],
  };
}

export function vintedPublicationAgeLabel(
  label: unknown,
  observedAt: string,
): VintedPublicationAge | null {
  if (typeof label !== 'string' || label.length > 80) return null;
  const match =
    /^(?:vor\s+)?(\d+|ein(?:e[rnm]?)?|an?|one)\s+(minuten?|minutes?|stunden?|hours?|tagen?|tage?|days?|wochen?|weeks?|monaten?|monate?|months?|jahren?|jahre?|years?)(?:\s+ago)?$/i.exec(
      label.trim(),
    );
  if (!match) return null;
  const value = /^\d+$/.test(match[1]!) ? Number(match[1]) : 1;
  const sourceUnit = match[2]!.toLowerCase();
  const unit = /^(minut)/.test(sourceUnit)
    ? 'minute'
    : /^(stund|hour)/.test(sourceUnit)
      ? 'hour'
      : /^(tag|day)/.test(sourceUnit)
        ? 'day'
        : /^(woch|week)/.test(sourceUnit)
          ? 'week'
          : /^(monat|month)/.test(sourceUnit)
            ? 'month'
            : 'year';
  return parseVintedPublicationAge({ value, unit, observedAt });
}
