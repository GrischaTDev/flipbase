export type NumberedEntity = 'purchase' | 'sale';

export interface NumberSeriesConfiguration {
  label: string;
  prefix: string;
  separator: string;
  include_year: boolean;
  minimum_digits: number;
  start_value: number;
  reset_yearly: boolean;
}

export interface NumberSeries extends NumberSeriesConfiguration {
  entity_type: NumberedEntity;
  version: number;
}

export interface NumberSettings {
  can_edit: boolean;
  timezone: string;
  series: NumberSeries[];
}

export function defaultNumberSeries(entity: NumberedEntity): NumberSeries {
  return {
    entity_type: entity,
    label: entity === 'purchase' ? 'Einkäufe' : 'Verkäufe',
    prefix: entity === 'purchase' ? 'B' : 'V',
    separator: ' ',
    include_year: true,
    minimum_digits: 2,
    start_value: 1,
    reset_yearly: false,
    version: 0,
  };
}

/** Vorschau ist rein lokal; sie reserviert keine Nummer und zeigt Beispiele ab Anfangswert. */
export function previewNumberSeries(
  configuration: NumberSeriesConfiguration,
  timezone: string,
  now = new Date(),
): string[] {
  let year: string;
  try {
    year = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric' }).format(now);
  } catch {
    return [];
  }
  if (
    !Number.isSafeInteger(configuration.start_value) ||
    configuration.start_value < 1 ||
    !Number.isInteger(configuration.minimum_digits) ||
    configuration.minimum_digits < 1 ||
    configuration.minimum_digits > 12
  )
    return [];
  return Array.from({ length: 3 }, (_, offset) =>
    [
      configuration.prefix,
      configuration.include_year ? year : '',
      String(configuration.start_value + offset).padStart(configuration.minimum_digits, '0'),
    ]
      .filter(Boolean)
      .join(configuration.separator),
  );
}
